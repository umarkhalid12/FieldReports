import {useEffect, useState} from 'react';
import {Report} from '../domain/types';
import {storage} from '../services/storage';
import {engine} from '../services/runtime';

export function useReports(): Report[] {
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const all = await storage.loadReports();
      if (alive) {
        setReports([...all].sort((a, b) => b.createdAt - a.createdAt));
      }
    };
    load();
    const unsubscribe = engine.subscribe(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return reports;
}