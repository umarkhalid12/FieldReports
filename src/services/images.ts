import ImageResizer from '@bam.tech/react-native-image-resizer';
import RNFS from 'react-native-fs';
import {TARGET_IMAGE_BYTES} from '../domain/types';
import {newId} from '../domain/id';

// Tried in order until the file is under the target size.
const ATTEMPTS = [
  {maxDim: 2048, quality: 80},
  {maxDim: 2048, quality: 65},
  {maxDim: 1600, quality: 70},
  {maxDim: 1600, quality: 55},
  {maxDim: 1280, quality: 60},
  {maxDim: 1024, quality: 50},
];

export interface ProcessedImage {
  localPath: string;
  sizeBytes: number;
}

export class ImageTooLargeError extends Error {
  constructor(public sizeBytes: number) {
    super(`Could not shrink image below limit (last size ${sizeBytes} bytes)`);
    this.name = 'ImageTooLargeError';
  }
}

const stripScheme = (uri: string) =>
  uri.startsWith('file://') ? decodeURI(uri.slice(7)) : uri;

export const reportDir = (reportId: string) =>
  `${RNFS.DocumentDirectoryPath}/reports/${reportId}`;

/**
 * Shrinks a picked photo to under the size target and stores it in the
 * app's own folder (safe from the OS cleaning the cache).
 * The resizer runs natively, so the JS thread / UI is not blocked.
 */
export async function processImage(
  sourceUri: string,
  reportId: string,
): Promise<ProcessedImage> {
  const dir = reportDir(reportId);
  await RNFS.mkdir(dir);
  const dest = `${dir}/${newId()}.jpg`;

  let lastSize = 0;
  for (const attempt of ATTEMPTS) {
    const res = await ImageResizer.createResizedImage(
      sourceUri,
      attempt.maxDim,
      attempt.maxDim,
      'JPEG',
      attempt.quality,
      0,
      undefined,
      false,
      {mode: 'contain', onlyScaleDown: true},
    );
    const tmpPath = stripScheme(res.uri);

    // Never trust the reported size: measure the real file.
    const stat = await RNFS.stat(tmpPath);
    lastSize = Number(stat.size);

    if (lastSize <= TARGET_IMAGE_BYTES) {
      await RNFS.moveFile(tmpPath, dest);
      return {localPath: dest, sizeBytes: lastSize};
    }
    await RNFS.unlink(tmpPath).catch(() => {});
  }
  throw new ImageTooLargeError(lastSize);
}

export async function deleteImageFile(path: string): Promise<void> {
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path).catch(() => {});
  }
}

export async function deleteReportFiles(reportId: string): Promise<void> {
  const dir = reportDir(reportId);
  if (await RNFS.exists(dir)) {
    await RNFS.unlink(dir).catch(() => {});
  }
}

export async function deleteAllReportFiles(): Promise<void> {
  const root = `${RNFS.DocumentDirectoryPath}/reports`;
  if (await RNFS.exists(root)) {
    await RNFS.unlink(root).catch(() => {});
  }
}