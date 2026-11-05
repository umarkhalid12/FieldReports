export type ImageStatus = 'pending' | 'uploaded';

export type ReportStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'failed_permanent';

export interface ReportImage {
  index: number;
  localPath: string;
  sizeBytes: number;
  status: ImageStatus;
}

export interface Report {
  id: string;
  description: string;
  createdAt: number;
  status: ReportStatus;
  images: ReportImage[];
  attempts: number;
  lastError?: string;
}

export const MAX_IMAGES = 5;
export const MIN_IMAGES = 1;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const TARGET_IMAGE_BYTES = 4.5 * 1024 * 1024;