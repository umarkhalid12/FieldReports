export type ImageStatus = 'pending' | 'uploaded';

export type ReportStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'failed_permanent';

export interface ReportImage {
  index: number;
  localPath: string; // file inside the app's own folder
  sizeBytes: number;
  status: ImageStatus;
}

export interface Report {
  id: string; // created on the phone, used as the idempotency key
  description: string;
  createdAt: number;
  status: ReportStatus;
  images: ReportImage[];
  attempts: number;
  lastError?: string;
}

export const MAX_IMAGES = 5;
export const MIN_IMAGES = 1;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // hard ceiling
export const TARGET_IMAGE_BYTES = 4.5 * 1024 * 1024; // what we aim for