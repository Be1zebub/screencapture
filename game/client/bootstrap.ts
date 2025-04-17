import { netEventController } from './event';
import { CaptureRequest, RequestScreenshotUploadCB } from './types';
import { uuidv4 } from './utils';

const clientCaptureMap = new Map<string, RequestScreenshotUploadCB>();

onNet('screencapture:captureScreen', (token: string, options: object, dataType: string) => {
  SendNUIMessage({
    ...options,
    uploadToken: token,
    dataType,
    action: 'capture',
    serverEndpoint: `http://${GetCurrentServerEndpoint()}/${GetCurrentResourceName()}/image`,
  });
});

onNet('screencapture:INTERNAL_uploadComplete', (response: unknown, correlationId: string) => {
  const callback = clientCaptureMap.get(correlationId);
  if (callback) {
    callback(response);
    clientCaptureMap.delete(correlationId);
  }
});

type Encoding = 'webp' | 'jpg' | 'png';

type requestScreenshot = {
  encoding: Encoding;
  quality: number;
};
type requestScreenshotResponse = {
  uid: string;
  image: string;
};

const requestScreenshotQueue = {};

RegisterNuiCallback('requestScreenshot', (data: requestScreenshotResponse): void => {
  const listener = requestScreenshotQueue[data.uid];
  if (listener) {
    listener(data.image);
    delete requestScreenshotQueue[data.uid];
  }
});

global.exports('requestScreenshot', async (request: requestScreenshot, cback: () => void): void => {
  const uid = uuidv4();
  requestScreenshotQueue[uid] = cback;

  SendNUIMessage({
    encoding: request.encoding,
    quality: request.quality,
    uid: uid,
    action: 'requestScreenshot',
  });
});

global.exports(
  'requestScreenshotUpload',
  async (
    url: string,
    formField: string,
    optionsOrCB: CaptureRequest | RequestScreenshotUploadCB,
    callback: RequestScreenshotUploadCB,
  ) => {
    // forgive me
    const isOptions = typeof optionsOrCB === 'object' && optionsOrCB !== null;
    const realOptions = isOptions
      ? (optionsOrCB as CaptureRequest)
      : ({ headers: {}, encoding: 'webp' } as CaptureRequest);
    const realCallback = isOptions
      ? (callback as RequestScreenshotUploadCB)
      : (optionsOrCB as RequestScreenshotUploadCB);

    const correlationId = uuidv4();
    clientCaptureMap.set(correlationId, realCallback);

    const token = await netEventController<string>('screencapture:INTERNAL_requestUploadToken', {
      ...realOptions,
      formField,
      url,
      correlationId,
    });

    if (!token) {
      return console.error('Failed to get upload token');
    }

    return createImageCaptureMessage({
      ...realOptions,
      formField,
      url,
      uploadToken: token,
      dataType: 'blob',
    });
  },
);

function createImageCaptureMessage(options: CaptureRequest) {
  SendNUIMessage({
    ...options,
    action: 'capture',
    serverEndpoint: `http://${GetCurrentServerEndpoint()}/${GetCurrentResourceName()}/image`,
  });
}

/* onNet("screencapture:captureStream", (token: string, options: object) => {
  SendNUIMessage({
    ...options,
    uploadToken: token,
    action: 'capture-stream-start',
    serverEndpoint: `http://${GetCurrentServerEndpoint()}/${GetCurrentResourceName()}/stream`,
  });
}) */

/* onNet("screencapture:INTERNAL:stopCaptureStream", () => {
  SendNUIMessage({
    action: 'capture-stream-stop',
  })
}) */
