import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitPdf, MAX_PAGES_PER_PART, ORCAMENTO_BASE64, paginaGlobal } from "./pdfSplit";

async function criarPdfLeve(paginas: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([200, 200]);
  const bytes = await doc.save();
  return new File([bytes], `book_${paginas}p.pdf`, { type: "application/pdf" });
}

describe("splitPdf — caso normal inalterado", () => {
  it("PDF de até 10 páginas vira uma única parte com o nome original", async () => {
    const { parts, totalPages, partesSubdivididas, paginasPesadas } = await splitPdf(await criarPdfLeve(7));
    expect(totalPages).toBe(7);
    expect(parts).toHaveLength(1);
    expect(parts[0].name).toBe("book_7p.pdf");
    expect(parts[0].startPage).toBe(1);
    expect(parts[0].pageCount).toBe(7);
    expect(partesSubdivididas).toBe(0);
    expect(paginasPesadas).toBe(0);
  });

  it("PDF longo é fatiado em partes de no máximo 10 páginas, em ordem", async () => {
    const { parts, totalPages } = await splitPdf(await criarPdfLeve(23));
    expect(totalPages).toBe(23);
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.pageCount)).toEqual([10, 10, 3]);
    expect(parts.map((p) => p.startPage)).toEqual([1, 11, 21]);
    expect(parts[1].name).toBe("book_23p_parte2.pdf");
    for (const p of parts) {
      expect(p.base64.length).toBeLessThanOrEqual(ORCAMENTO_BASE64);
    }
  });

  it("toda parte respeita o teto de páginas", async () => {
    const { parts } = await splitPdf(await criarPdfLeve(31));
    for (const p of parts) expect(p.pageCount).toBeLessThanOrEqual(MAX_PAGES_PER_PART);
  });
});

describe("paginaGlobal", () => {
  const parte = { name: "p.pdf", base64: "", startPage: 11, pageCount: 10 };
  it("converte página relativa em global", () => {
    expect(paginaGlobal(parte, 1)).toBe(11);
    expect(paginaGlobal(parte, 10)).toBe(20);
  });
  it("fora do intervalo devolve o valor bruto", () => {
    expect(paginaGlobal(parte, 11)).toBe(11);
    expect(paginaGlobal(parte, undefined)).toBe(0);
  });
});
