import { type Piece } from "@/data/extractedPieces";

export interface HistoryEntry {
  id: string;
  fileName: string;
  nickname: string;
  pieces: Piece[];
  createdAt: string;
}

const STORAGE_KEY = "extraction_history";
const MAX_ENTRIES = 10;

export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(fileName: string, pieces: Piece[]): HistoryEntry {
  const history = getHistory();
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    fileName,
    nickname: "",
    pieces,
    createdAt: new Date().toISOString(),
  };
  const updated = [entry, ...history].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return entry;
}

export function updateNickname(id: string, nickname: string): void {
  const history = getHistory();
  const updated = history.map((h) => (h.id === id ? { ...h, nickname } : h));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function deleteHistoryEntry(id: string): void {
  const history = getHistory().filter((h) => h.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}
