import AsyncStorage from '@react-native-async-storage/async-storage';
import {Report} from '../domain/types';

const KEY = 'field-reports:v1';

let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

async function readAll(): Promise<Report[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as Report[];
  } catch {
    return [];
  }
}

async function writeAll(reports: Report[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(reports));
}

export const storage = {
  loadReports(): Promise<Report[]> {
    return serialize(readAll);
  },

  saveReport(report: Report): Promise<void> {
    return serialize(async () => {
      const all = await readAll();
      const i = all.findIndex(r => r.id === report.id);
      if (i >= 0) {
        all[i] = report;
      } else {
        all.push(report);
      }
      await writeAll(all);
    });
  },

  updateReport(
    id: string,
    mutate: (r: Report) => Report,
  ): Promise<Report | undefined> {
    return serialize(async () => {
      const all = await readAll();
      const i = all.findIndex(r => r.id === id);
      if (i < 0) {
        return undefined;
      }
      all[i] = mutate(all[i]);
      await writeAll(all);
      return all[i];
    });
  },

  deleteReport(id: string): Promise<void> {
    return serialize(async () => {
      const all = await readAll();
      await writeAll(all.filter(r => r.id !== id));
    });
  },

  recoverInterrupted(): Promise<void> {
    return serialize(async () => {
      const all = await readAll();
      let changed = false;
      for (const r of all) {
        if (r.status === 'uploading') {
          r.status = 'queued';
          changed = true;
        }
      }
      if (changed) {
        await writeAll(all);
      }
    });
  },

  clearAll(): Promise<void> {
    return serialize(async () => {
      await AsyncStorage.removeItem(KEY);
    });
  },
};