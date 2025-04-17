import { createGameView } from '@screencapture/gameview';

type Encoding = 'webp' | 'jpg' | 'png';

type CaptureRequest = {
  action: 'capture';
  url: string;
  encoding: Encoding;
  quality: number;
  headers: Headers;
  uploadToken: string;
  serverEndpoint: string;
  formField: string;
  dataType: 'blob' | 'base64';
};

type ScreenshotRequest = {
  action: 'requestScreenshot';
  encoding: Encoding;
  quality: number;
  uid: string;
};

export class Capture {
  #gameView: any;
  #canvas: HTMLCanvasElement | null = null;

  start() {
    window.addEventListener('message', async (event) => {
      const data = event.data as CaptureRequest | ScreenshotRequest;

      if (data.action === 'capture') {
        await this.captureScreen(data as CaptureRequest);
      } else if (data.action === 'requestScreenshot') {
        await this.requestScreenshot(data as ScreenshotRequest);
      }
    });

    window.addEventListener('resize', () => {
      if (this.#gameView) {
        this.#gameView.resize(window.innerWidth, window.innerHeight);
      }
    });
  }

  async createScreenshot() {
    try {
      this.#canvas = document.createElement('canvas');
      this.#canvas.width = window.innerWidth;
      this.#canvas.height = window.innerHeight;

      this.#gameView = createGameView(this.#canvas);

      return this.#canvas;
    } catch (err) {
      console.error('Error creating screenshot:', err);
      return null;
    }
  }

  async requestScreenshot(request: ScreenshotRequest) {
    const canvas = await this.createScreenshot();

    if (!canvas) {
      console.error('Failed to create canvas for screenshot');
      return;
    }

    try {
      const enc = request.encoding ?? 'png';
      const quality = request.quality ?? 0.7;

      // Get base64 image data
      const dataUrl = await this.createDataURL(canvas, enc, quality);

      // Send back to Lua client
      const resourceName = window.GetParentResourceName ? window.GetParentResourceName() : 'screencapture';

      fetch(`https://${resourceName}/requestScreenshot`, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          uid: request.uid,
          image: dataUrl,
        }),
      });
    } catch (err) {
      console.error('Error processing screenshot:', err);
    } finally {
      if (this.#canvas) {
        this.#canvas.remove();
        this.#canvas = null;
      }
    }
  }

  async captureScreen(request: CaptureRequest) {
    const canvas = await this.createScreenshot();

    if (!canvas) {
      console.error('Failed to create canvas for screenshot');
      return;
    }

    try {
      const enc = request.encoding ?? 'png';
      const quality = request.quality ?? 0.5;

      let imageData: string | Blob;
      if (request.serverEndpoint || !request.formField) {
        imageData = await this.createBlob(canvas, enc, quality);
      } else {
        imageData = await this.createBlob(canvas, enc, quality);
      }

      if (!imageData) {
        console.error('No image available');
        return;
      }

      await this.httpUploadImage(request, imageData);
    } catch (err) {
      console.error('Error processing screenshot:', err);
    } finally {
      if (this.#canvas) {
        this.#canvas.remove();
        this.#canvas = null;
      }
    }
  }

  async httpUploadImage(request: CaptureRequest, imageData: string | Blob) {
    const reqBody = this.createRequestBody(request, imageData);

    if (request.serverEndpoint) {
      try {
        await fetch(request.serverEndpoint, {
          method: 'POST',
          headers: {
            'X-ScreenCapture-Token': request.uploadToken,
          },
          body: reqBody,
        });
      } catch (err) {
        console.error(err);
      }
    }
  }

  createRequestBody(request: CaptureRequest, imageData: string | Blob): BodyInit {
    if (imageData instanceof Blob) {
      const formData = new FormData();
      formData.append(request.formField ?? 'file', imageData);

      return formData;
    }

    // dataType is just here in order to know what to do with the data when we get it back
    return JSON.stringify({ imageData: imageData, dataType: request.dataType });
  }

  createDataURL(canvas: HTMLCanvasElement, enc: Encoding = 'png', quality = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = canvas.toDataURL(`image/${enc}`, quality);
      if (!url) {
        reject('No data URL available');
      }

      resolve(url);
    });
  }

  createBlob(canvas: HTMLCanvasElement, enc: Encoding, quality = 0.7): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject('No blob available');
          }
        },
        `image/${enc}`,
        quality,
      );
    });
  }
}
