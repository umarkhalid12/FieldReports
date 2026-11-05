import { ApiError } from './errors';
import { BASE_URL } from './config';
import type { UploadApi } from '../services/uploadEngine';

const JSON_STALL_MS = 20000;
const UPLOAD_STALL_MS = 45000;

type Body = string | { uri: string } | undefined;

interface RequestOptions {
  method: 'GET' | 'PUT' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: Body;
  onProgress?: (fraction: number) => void;
  stallMs: number;
}

function classify(status: number, text: string): ApiError {
  const msg = `Server responded ${status}${
    text ? `: ${text.slice(0, 120)}` : ''
  }`;
  if (status === 408 || status === 429 || status >= 500) {
    return new ApiError('retryable', msg, status);
  }
  return new ApiError('permanent', msg, status);
}

function send(o: RequestOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const startedAt = Date.now();
    let lastLoggedProgress = 0;
    const requestLabel = `${o.method} ${o.path}`;

    const disarm = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    const markSettled = () => {
      if (settled) {
        return false;
      }
      settled = true;
      disarm();
      return true;
    };
    const arm = () => {
      if (settled) {
        return;
      }
      disarm();
      timer = setTimeout(() => {
        if (markSettled()) {
          console.error(
            `[api] ${requestLabel} stalled for ${o.stallMs}ms; aborting`,
          );
          reject(new ApiError('retryable', 'Request timed out'));
          xhr.abort();
        }
      }, o.stallMs);
    };

    xhr.open(o.method, BASE_URL + o.path);
    console.info(`[api] -> ${requestLabel} (${BASE_URL})`);
    Object.entries(o.headers ?? {}).forEach(([k, v]) =>
      xhr.setRequestHeader(k, v),
    );

    xhr.onload = () => {
      if (markSettled()) {
        const durationMs = Date.now() - startedAt;
        if (xhr.status >= 200 && xhr.status < 300) {
          console.info(
            `[api] <- ${requestLabel} ${xhr.status} in ${durationMs}ms`,
          );
          resolve(xhr.responseText);
        } else {
          const error = classify(xhr.status, xhr.responseText);
          console.error(
            `[api] <- ${requestLabel} ${xhr.status} in ${durationMs}ms: ${error.message}`,
          );
          reject(error);
        }
      }
    };
    xhr.onerror = () => {
      if (markSettled()) {
        const error = new ApiError('retryable', 'Network error');
        console.error(`[api] ${requestLabel} failed: ${error.message}`);
        reject(error);
      }
    };
    xhr.onabort = () => {
      if (markSettled()) {
        const error = new ApiError('retryable', 'Request aborted');
        console.error(`[api] ${requestLabel} failed: ${error.message}`);
        reject(error);
      }
    };
    xhr.ontimeout = () => {
      if (markSettled()) {
        const error = new ApiError('retryable', 'Request timed out');
        console.error(`[api] ${requestLabel} failed: ${error.message}`);
        reject(error);
      }
    };
    xhr.onprogress = () => {
      arm();
    };
    if (xhr.upload) {
      xhr.upload.onprogress = e => {
        arm();
        if (e.lengthComputable && e.total > 0) {
          const fraction = e.loaded / e.total;
          if (fraction === 1 || fraction - lastLoggedProgress >= 0.1) {
            lastLoggedProgress = fraction;
            console.info(
              `[api] ${requestLabel} upload ${Math.round(fraction * 100)}% ` +
                `(${e.loaded}/${e.total} bytes)`,
            );
          }
          o.onProgress?.(fraction);
        }
      };
    }

    arm();
    const sendFn = xhr.send as (body?: unknown) => void;
    try {
      sendFn.call(xhr, o.body);
    } catch (error) {
      if (markSettled()) {
        console.error(`[api] ${requestLabel} could not be sent`, error);
        reject(error);
      }
    }
  });
}

export interface ServerReport {
  id: string;
  description: string;
  createdAt: number;
  images: string[];
}

export const api: UploadApi = {
  async putReport(r) {
    await send({
      method: 'PUT',
      path: `/reports/${r.id}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r),
      stallMs: JSON_STALL_MS,
    });
  },

  async putImage(id, index, localPath, onProgress) {
    await send({
      method: 'PUT',
      path: `/reports/${id}/images/${index}`,
      headers: { 'Content-Type': 'image/jpeg' },
      body: { uri: `file://${localPath}` },
      onProgress,
      stallMs: UPLOAD_STALL_MS,
    });
  },

  async commit(id) {
    await send({
      method: 'POST',
      path: `/reports/${id}/commit`,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      stallMs: JSON_STALL_MS,
    });
  },
};

export async function fetchServerReports(): Promise<ServerReport[]> {
  const text = await send({ method: 'GET', path: '/reports', stallMs: 15000 });
  const data = JSON.parse(text) as ServerReport[];
  return data.map(r => ({
    ...r,
    images: r.images.map(p => (p.startsWith('http') ? p : BASE_URL + p)),
  }));
}
