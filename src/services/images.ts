import ImageResizer from '@bam.tech/react-native-image-resizer';
import RNFS from 'react-native-fs';
import { TARGET_IMAGE_BYTES } from '../domain/types';
import { newId } from '../domain/id';

const ATTEMPTS = [
  { maxDim: 2048, quality: 80 },
  { maxDim: 2048, quality: 65 },
  { maxDim: 1600, quality: 70 },
  { maxDim: 1600, quality: 55 },
  { maxDim: 1280, quality: 60 },
  { maxDim: 1024, quality: 50 },
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

export async function processImage(
  sourceUri: string,
  reportId: string,
): Promise<ProcessedImage> {
  console.info(`[image:${reportId}] Preparing selected photo`);
  const dir = reportDir(reportId);
  await RNFS.mkdir(dir);
  const dest = `${dir}/${newId()}.jpg`;

  let lastSize = 0;
  try {
    for (const [index, attempt] of ATTEMPTS.entries()) {
      console.info(
        `[image:${reportId}] Resize attempt ${index + 1}/${ATTEMPTS.length} ` +
          `(max ${attempt.maxDim}px, quality ${attempt.quality})`,
      );
      const res = await ImageResizer.createResizedImage(
        sourceUri,
        attempt.maxDim,
        attempt.maxDim,
        'JPEG',
        attempt.quality,
        0,
        undefined,
        false,
        { mode: 'contain', onlyScaleDown: true },
      );
      if (!res?.uri) {
        throw new Error('Image resizer returned no output URI');
      }
      const tmpPath = stripScheme(res.uri);

      const stat = await RNFS.stat(tmpPath);
      lastSize = Number(stat.size);
      console.info(`[image:${reportId}] Resized photo is ${lastSize} bytes`);

      if (lastSize <= TARGET_IMAGE_BYTES) {
        await RNFS.moveFile(tmpPath, dest);
        console.info(`[image:${reportId}] Photo prepared successfully`);
        return { localPath: dest, sizeBytes: lastSize };
      }
      await RNFS.unlink(tmpPath).catch(() => {});
    }
    throw new ImageTooLargeError(lastSize);
  } catch (error) {
    console.error(`[image:${reportId}] Photo preparation failed`, error);
    throw error;
  }
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
