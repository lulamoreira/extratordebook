import { type Piece } from "@/data/extractedPieces";

export interface PartError {
  partName: string;
  errorMessage: string;
  pages: string;
}

export interface HistoryEntry {
  id: string;
  fileName: string;
  nickname: string;
  pieces: Piece[];
  createdAt: string;
  errors?: PartError[];
  /** Marker set when the entry could not be written to localStorage. */
  notPersisted?: boolean;
}

const STORAGE_KEY = "extraction_history";
const MAX_ENTRIES = 10;

export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persist the list, progressively dropping the oldest entries when the
 * browser quota is exceeded. Returns true when the write succeeded.
 */
function persist(entries: HistoryEntry[]): boolean {
  let candidates = [...entries];

  while (candidates.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
      return true;
    } catch (err) {
      // Quota (or any write failure): drop the oldest entry and retry.
      if (candidates.length === 1) return false;
      candidates = candidates.slice(0, candidates.length - 1);
    }
  }

  return false;
}

export function saveToHistory(
  fileName: string,
  pieces: Piece[],
  errors?: PartError[]
): HistoryEntry {
  const history = getHistory();
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    fileName,
    nickname: "",
    pieces,
    createdAt: new Date().toISOString(),
    errors: errors && errors.length > 0 ? errors : undefined,
  };
  const updated = [entry, ...history].slice(0, MAX_ENTRIES);

  const ok = persist(updated);
  return ok ? entry : { ...entry, notPersisted: true };
}

export function updateNickname(id: string, nickname: string): void {
  const updated = getHistory().map((h) => (h.id === id ? { ...h, nickname } : h));
  persist(updated);
}

/** Overwrite the pieces of an existing entry (used to save manual edits). */
export function updateEntryPieces(id: string, pieces: Piece[]): boolean {
  const history = getHistory();
  if (!history.some((h) => h.id === id)) return false;
  const updated = history.map((h) => (h.id === id ? { ...h, pieces } : h));
  return persist(updated);
}

export function deleteHistoryEntry(id: string): void {
  const history = getHistory().filter((h) => h.id !== id);
  persist(history);
}
