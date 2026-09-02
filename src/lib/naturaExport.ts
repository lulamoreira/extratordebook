import { type Piece } from "@/data/extractedPieces";
import { supabase } from "@/integrations/supabase/client";
import { gerarPlanilhaNatura, type NaturaRow } from "@/lib/naturaSheet";
import { toast } from "sonner";

const BATCH_SIZE = 40;
const MAX_PARALLEL = 2;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fallback row used when a batch cannot be standardized by the AI. */
const fallbackRow = (p: Piece): NaturaRow => ({
  grupo: "OUTROS",
  nome: (p.secao || p.nomePeca || "").toUpperCase(),
  item: p.nomePeca || "",
  arquivo: p.codigo || "",
  especificacaoPadrao: p.especificacao || `Impressão ${p.cores || "4x0"}, corte especial.`,
  pagBook: Number(p.pagina) || 0,
  formato: (p.tamanho || "").replace(/cm/gi, "").trim(),
});

async function formatBatch(batch: Piece[]): Promise<NaturaRow[] | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("format-natura", {
        body: { pieces: batch },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const rows = data?.rows;
      if (!Array.isArray(rows) || rows.length === 0) throw new Error("Resposta vazia da IA");
      // Garante uma linha por peça, na mesma ordem.
      return batch.map((p, i) => rows[i] ?? fallbackRow(p));
    } catch (e) {
      console.error("format-natura batch failed:", e);
      if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
    }
  }
  return null;
}

/**
 * Standardizes the pieces via AI (in batches) and downloads the official
 * Natura layout spreadsheet. Never aborts on partial failures.
 */
export async function exportarPlanilhaNatura(pieces: Piece[], baseName: string): Promise<void> {
  if (!pieces || pieces.length === 0) {
    toast.error("Nenhuma peça para exportar");
    return;
  }

  toast.info("Padronizando especificações com IA...");

  const batches: Piece[][] = [];
  for (let i = 0; i < pieces.length; i += BATCH_SIZE) {
    batches.push(pieces.slice(i, i + BATCH_SIZE));
  }

  const results: (NaturaRow[] | null)[] = new Array(batches.length).fill(null);

  for (let i = 0; i < batches.length; i += MAX_PARALLEL) {
    const slice = batches.slice(i, i + MAX_PARALLEL);
    const settled = await Promise.all(slice.map((b) => formatBatch(b)));
    settled.forEach((res, j) => {
      results[i + j] = res;
    });
  }

  let failedPieces = 0;
  const rows: NaturaRow[] = [];
  results.forEach((res, i) => {
    if (res) {
      rows.push(...res);
    } else {
      failedPieces += batches[i].length;
      rows.push(...batches[i].map(fallbackRow));
    }
  });

  const titulo = (baseName || "EXTRAÇÃO").toUpperCase();
  await gerarPlanilhaNatura(rows, titulo, titulo);

  if (failedPieces > 0) {
    toast.warning(
      `Planilha gerada, mas ${failedPieces} peça(s) ficaram sem padronização da IA (marcadas como OUTROS).`
    );
  } else {
    toast.success("Planilha padrão Natura gerada!");
  }
}
