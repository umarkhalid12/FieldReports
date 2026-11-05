import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { UploadEngine } from './uploadEngine';
import { storage } from './storage';
import { api } from '../api/client';
import { deleteReportFiles, deleteAllReportFiles } from './images';

async function isOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return s.isConnected !== false && s.isInternetReachable !== false;
}

export const engine = new UploadEngine({
  store: storage,
  api,
  isOnline,
  now: () => Date.now(),
  schedule: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
  removeFiles: deleteReportFiles,
  removeAllFiles: deleteAllReportFiles,
});

let started = false;

export function startRuntime(): void {
  if (started) {
    return;
  }
  started = true;

  engine.start().catch(error => {
    console.error('[upload] Could not start upload engine', error);
  });

  NetInfo.addEventListener(s => {
    if (s.isConnected && s.isInternetReachable !== false) {
      engine.kick();
    }
  });

  AppState.addEventListener('change', state => {
    if (state === 'active') {
      engine.kick();
    }
  });
}
