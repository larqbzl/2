import { useState, useEffect } from "react";

export type DownloadStatus = "success" | "error";

export type DownloadHistoryEntry = {
  id: string;
  topic: string;
  filename: string;
  source: string;
  url: string;
  status: DownloadStatus;
  error?: string;
  timestamp: number;
};

const STORAGE_KEY = "media_finder_download_history_v1";
const MAX_ENTRIES = 500;

function readFromStorage(): DownloadHistoryEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

// Module-level singleton store (not component state) so every tab/section
// that logs or displays download history shares the exact same list — this
// works whether components are kept mounted or not, and survives tab switches.
let historyStore: DownloadHistoryEntry[] = readFromStorage();
const listeners = new Set<(entries: DownloadHistoryEntry[]) => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyStore));
  } catch {}
}

function notify() {
  persist();
  listeners.forEach((l) => l(historyStore));
}

export function addDownloadHistoryEntry(entry: Omit<DownloadHistoryEntry, "id" | "timestamp">): string {
  const full: DownloadHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  historyStore = [full, ...historyStore].slice(0, MAX_ENTRIES);
  notify();
  return full.id;
}

export function updateDownloadHistoryEntry(id: string, updates: Partial<DownloadHistoryEntry>) {
  historyStore = historyStore.map((e) => (e.id === id ? { ...e, ...updates } : e));
  notify();
}

export function clearDownloadHistory() {
  historyStore = [];
  notify();
}

export function useDownloadHistory() {
  const [entries, setEntries] = useState<DownloadHistoryEntry[]>(historyStore);

  useEffect(() => {
    listeners.add(setEntries);
    return () => {
      listeners.delete(setEntries);
    };
  }, []);

  return {
    entries,
    addEntry: addDownloadHistoryEntry,
    updateEntry: updateDownloadHistoryEntry,
    clear: clearDownloadHistory,
  };
}
