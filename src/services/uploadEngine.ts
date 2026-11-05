import { Report } from '../domain/types';
import { ApiError } from '../api/errors';

export interface ReportStore {
  loadReports(): Promise<Report[]>;
  saveReport(report: Report): Promise<void>;
  updateReport(
    id: string,
    mutate: (r: Report) => Report,
  ): Promise<Report | undefined>;
  deleteReport(id: string): Promise<void>;
  recoverInterrupted(): Promise<void>;
  clearAll(): Promise<void>;
}

export interface UploadApi {
  putReport(r: {
    id: string;
    description: string;
    createdAt: number;
    imageCount: number;
  }): Promise<void>;
  putImage(
    id: string,
    index: number,
    localPath: string,
    onProgress: (fraction: number) => void,
  ): Promise<void>;
  commit(id: string): Promise<void>;
}

export interface EngineDeps {
  store: ReportStore;
  api: UploadApi;
  isOnline(): Promise<boolean>;
  now(): number;
  schedule(fn: () => void, ms: number): () => void;
  removeFiles(reportId: string): Promise<void>;
  removeAllFiles(): Promise<void>;
  random?(): number;
}

class Cancelled extends Error {}

export class UploadEngine {
  private running = false;
  private rerun = false;
  private retryAt = new Map<string, number>();
  private progress = new Map<string, number>();
  private listeners = new Set<() => void>();
  private cancelTimer: (() => void) | null = null;

  constructor(private deps: EngineDeps) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach(l => l());
  }

  getProgress(id: string): number {
    return this.progress.get(id) ?? 0;
  }

  async start(): Promise<void> {
    console.info('[upload] Recovering interrupted reports');
    await this.deps.store.recoverInterrupted();
    this.emit();
    await this.run();
  }

  kick(): void {
    this.run().catch(error => {
      console.error('[upload] Unexpected upload engine failure', error);
    });
  }

  async enqueue(report: Report): Promise<void> {
    await this.deps.store.saveReport(report);
    console.info(
      `[upload:${report.id}] Queued locally with ${report.images.length} photo(s)`,
    );
    this.emit();
    this.kick();
  }

  async retryNow(id: string): Promise<void> {
    await this.deps.store.updateReport(id, r => ({
      ...r,
      status: 'queued',
      attempts: 0,
      lastError: undefined,
    }));
    this.retryAt.delete(id);
    this.emit();
    this.kick();
  }

  async discard(id: string): Promise<void> {
    await this.deps.store.deleteReport(id);
    await this.deps.removeFiles(id).catch(() => {});
    this.retryAt.delete(id);
    this.progress.delete(id);
    this.emit();
  }

  async reset(): Promise<void> {
    this.cancelTimer?.();
    this.cancelTimer = null;
    await this.deps.store.clearAll();
    await this.deps.removeAllFiles().catch(() => {});
    this.retryAt.clear();
    this.progress.clear();
    this.emit();
  }


  async run(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.rerun = false;
        await this.pass();
      } while (this.rerun);
    } finally {
      this.running = false;
    }
  }

  private async pass(): Promise<void> {
    this.cancelTimer?.();
    this.cancelTimer = null;

    while (true) {
      if (!(await this.deps.isOnline())) {
        console.info('[upload] Paused: device is offline');
        return;
      }
      const now = this.deps.now();
      const all = await this.deps.store.loadReports();
      const queued = all
        .filter(r => r.status === 'queued')
        .sort((a, b) => a.createdAt - b.createdAt);
      const ready = queued.find(r => (this.retryAt.get(r.id) ?? 0) <= now);

      if (!ready) {
        const waits = queued
          .map(r => this.retryAt.get(r.id) ?? 0)
          .filter(t => t > now);
        if (waits.length > 0) {
          console.info(
            `[upload] Waiting ${Math.max(
              0,
              Math.min(...waits) - now,
            )}ms before retry`,
          );
          this.cancelTimer = this.deps.schedule(
            () => this.kick(),
            Math.min(...waits) - now,
          );
        }
        return;
      }
      await this.process(ready);
    }
  }

  private async mutate(id: string, fn: (r: Report) => Report): Promise<Report> {
    const updated = await this.deps.store.updateReport(id, fn);
    if (!updated) {
      throw new Cancelled();
    }
    this.emit();
    return updated;
  }

  private setProgress(id: string, fraction: number) {
    const prev = this.progress.get(id) ?? 0;
    if (fraction === 1 || Math.abs(fraction - prev) >= 0.03) {
      this.progress.set(id, fraction);
      this.emit();
    }
  }

  private backoffMs(attempts: number): number {
    const base = Math.min(30000, 1000 * 2 ** Math.max(0, attempts - 1));
    const rand = (this.deps.random ?? Math.random)();
    return Math.round(base * (0.5 + 0.5 * rand));
  }

  private async process(report: Report): Promise<void> {
    const { api } = this.deps;
    try {
      console.info(
        `[upload:${report.id}] Starting attempt ${report.attempts + 1}`,
      );
      await this.mutate(report.id, r => ({
        ...r,
        status: 'uploading',
        attempts: r.attempts + 1,
      }));

      await api.putReport({
        id: report.id,
        description: report.description,
        createdAt: report.createdAt,
        imageCount: report.images.length,
      });
      console.info(`[upload:${report.id}] Report metadata accepted`);

      for (const img of report.images) {
        if (img.status === 'uploaded') {
          console.info(
            `[upload:${report.id}] Skipping photo ${img.index}; already confirmed`,
          );
          continue;
        }
        console.info(
          `[upload:${report.id}] Uploading photo ${img.index + 1}/${
            report.images.length
          } ` + `(${img.sizeBytes} bytes)`,
        );
        this.progress.set(report.id, 0);
        await api.putImage(report.id, img.index, img.localPath, f =>
          this.setProgress(report.id, f),
        );
        await this.mutate(report.id, r => ({
          ...r,
          images: r.images.map(i =>
            i.index === img.index ? { ...i, status: 'uploaded' } : i,
          ),
        }));
        console.info(`[upload:${report.id}] Photo ${img.index + 1} confirmed`);
      }

      console.info(`[upload:${report.id}] Committing report`);
      await api.commit(report.id);
      await this.mutate(report.id, r => ({
        ...r,
        status: 'uploaded',
        lastError: undefined,
      }));
      this.retryAt.delete(report.id);
      this.progress.delete(report.id);
      await this.deps.removeFiles(report.id).catch(() => {});
      console.info(`[upload:${report.id}] Upload completed successfully`);
    } catch (e) {
      if (e instanceof Cancelled) {
        console.info(
          `[upload:${report.id}] Cancelled because the report was removed`,
        );
        return;
      }
      this.progress.delete(report.id);
      const message = e instanceof Error ? e.message : String(e);
      const permanent = e instanceof ApiError && e.kind === 'permanent';

      if (permanent) {
        console.error(`[upload:${report.id}] Permanently rejected: ${message}`);
        await this.deps.store.updateReport(report.id, r => ({
          ...r,
          status: 'failed_permanent',
          lastError: message,
        }));
      } else {
        const updated = await this.deps.store.updateReport(report.id, r => ({
          ...r,
          status: 'queued',
          lastError: message,
        }));
        const retryDelay = this.backoffMs(updated?.attempts ?? 1);
        this.retryAt.set(report.id, this.deps.now() + retryDelay);
        console.error(
          `[upload:${report.id}] Attempt failed: ${message}; retrying in ${retryDelay}ms`,
        );
      }
      this.emit();
    }
  }
}
