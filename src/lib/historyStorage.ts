import { type Piece } from "@/data/extractedPieces";
import { supabase } from "@/integrations/supabase/client";

export interface PartError {
  partName: string;
  errorMessage: string;
  pages: string;
}

/** Lightweight history row — the heavy `pieces` payload is loaded on demand. */
export interface HistoryEntry {
  id: string;
  fileName: string;
  nickname: string;
  pieceCount: number;
  errors?: PartError[];
  createdAt: string;
}

const LIGHT_COLUMNS = "id, file_name, nickname, piece_count, errors, created_at";
const PAGE_SIZE = 200;

const toEntry = (row: Record<string, unknown>): HistoryEntry => {
  const rawErrors = row.errors;
  const errors = Array.isArray(rawErrors) ? (rawErrors as PartError[]) : [];
  return {
    id: String(row.id),
    fileName: String(row.file_name ?? ""),
    nickname: String(row.nickname ?? ""),
    pieceCount: Number(row.piece_count ?? 0),
    errors: errors.length > 0 ? errors : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
};

/**
 * Lists every extraction of the current session, newest first.
 * Always paginated with an exact count so nothing is silently truncated at 1000 rows.
 */
export async function getHistory(): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  let from = 0;

  // Loop until we have fetched `count` rows (or the server stops returning data).
  for (;;) {
    const { data, error, count } = await supabase
      .from("extractions")
      .select(LIGHT_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    entries.push(...rows.map((r) => toEntry(r as Record<string, unknown>)));

    const total = count ?? entries.length;
    if (rows.length === 0 || entries.length >= total) break;
    from += PAGE_SIZE;
  }

  return entries;
}

/** Loads the heavy `pieces` payload for a single extraction. */
export async function getEntryPieces(id: string): Promise<Piece[]> {
  const { data, error } = await supabase
    .from("extractions")
    .select("pieces")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const pieces = (data as { pieces?: unknown } | null)?.pieces;
  return Array.isArray(pieces) ? (pieces as Piece[]) : [];
}

export async function saveToHistory(
  fileName: string,
  pieces: Piece[],
  errors?: PartError[]
): Promise<HistoryEntry> {
  const { data, error } = await supabase
    .from("extractions")
    .insert({
      file_name: fileName,
      nickname: "",
      pieces: pieces as unknown as never,
      errors: (errors ?? []) as unknown as never,
      piece_count: pieces.length,
    })
    .select(LIGHT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toEntry(data as Record<string, unknown>);
}

export async function updateNickname(id: string, nickname: string): Promise<void> {
  const { error } = await supabase.from("extractions").update({ nickname }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Overwrites the pieces of an existing extraction (used to persist manual edits). */
export async function updateHistoryPieces(id: string, pieces: Piece[]): Promise<void> {
  const { error } = await supabase
    .from("extractions")
    .update({ pieces: pieces as unknown as never, piece_count: pieces.length })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const { error } = await supabase.from("extractions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const LEGACY_KEY = "extraction_history";
const MIGRATED_KEY = "history_migrated_v1";

/**
 * One-time import of browser-stored history into the cloud.
 * The localStorage key is only removed after every entry has been written.
 */
export async function migrateLocalHistory(): Promise<number> {
  if (localStorage.getItem(MIGRATED_KEY)) return 0;

  let legacy: unknown;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATED_KEY, "1");
      return 0;
    }
    legacy = JSON.parse(raw);
  } catch (err) {
    console.warn("Histórico local ilegível — nada foi migrado.", err);
    return 0;
  }

  if (!Array.isArray(legacy) || legacy.length === 0) {
    localStorage.setItem(MIGRATED_KEY, "1");
    return 0;
  }

  const rows = legacy.map((e: Record<string, unknown>) => ({
    file_name: String(e.fileName ?? ""),
    nickname: String(e.nickname ?? ""),
    pieces: (Array.isArray(e.pieces) ? e.pieces : []) as unknown as never,
    errors: (Array.isArray(e.errors) ? e.errors : []) as unknown as never,
    piece_count: Array.isArray(e.pieces) ? e.pieces.length : 0,
    created_at: String(e.createdAt ?? new Date().toISOString()),
  }));

  const { error } = await supabase.from("extractions").insert(rows);
  if (error) {
    // Never destroy the local copy when the upload failed.
    console.warn("Falha ao migrar histórico local para a nuvem:", error.message);
    return 0;
  }

  localStorage.removeItem(LEGACY_KEY);
  localStorage.setItem(MIGRATED_KEY, "1");
  return rows.length;
}
