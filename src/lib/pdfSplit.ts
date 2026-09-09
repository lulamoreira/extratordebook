import { PDFDocument } from "pdf-lib";
import { bytesToBase64 } from "@/lib/base64";

/**
 * Divisão de PDF em partes — extraído de Index.tsx sem qualquer mudança de
 * comportamento, para ser compartilhado entre os clientes.
 */
export const MAX_PAGES_PER_PART = 10;

export interface PdfPart {
  name: string;
  base64: string;
  /** 1-based number of this part's first page within the full book. */
  startPage: number;
  /** Number of pages contained in this part. */
  pageCount: number;
}

export interface SplitResult {
  parts: PdfPart[];
  totalPages: number;
}

export async function splitPdf(file: File): Promise<SplitResult> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);
  const totalPages = pdfDoc.getPageCount();
  const baseName = file.name.replace(/\.pdf$/i, "");
  const parts: PdfPart[] = [];

  if (totalPages <= MAX_PAGES_PER_PART) {
    parts.push({
      name: file.name,
      base64: bytesToBase64(new Uint8Array(buffer)),
      startPage: 1,
      pageCount: totalPages,
    });
    return { parts, totalPages };
  }

  const totalParts = Math.ceil(totalPages / MAX_PAGES_PER_PART);
  for (let partIdx = 0; partIdx < totalParts; partIdx++) {
    const firstIdx = partIdx * MAX_PAGES_PER_PART;
    const endIdx = Math.min(firstIdx + MAX_PAGES_PER_PART, totalPages);
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(
      pdfDoc,
      Array.from({ length: endIdx - firstIdx }, (_, i) => firstIdx + i)
    );
    copiedPages.forEach((page) => newDoc.addPage(page));
    const pdfBytes = await newDoc.save({ useObjectStreams: true });
    parts.push({
      name: `${baseName}_parte${partIdx + 1}.pdf`,
      base64: bytesToBase64(new Uint8Array(pdfBytes)),
      startPage: firstIdx + 1,
      pageCount: endIdx - firstIdx,
    });
  }

  return { parts, totalPages };
}

/**
 * Converte a página relativa à parte enviada para a página global do book.
 * Fora do intervalo válido, devolve o valor bruto (mesma regra da Natura).
 */
export function paginaGlobal(part: PdfPart, rawValue: unknown): number {
  const raw = Number(rawValue ?? 0);
  const inRange = Number.isFinite(raw) && raw >= 1 && raw <= part.pageCount;
  return inRange ? part.startPage + (raw - 1) : raw || 0;
}
