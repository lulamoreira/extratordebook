import { describe, it, expect, vi } from "vitest";
import { novaLinhaRommanel } from "@/data/rommanelPieces";

const { invoke, split } = vi.hoisted(() => ({ invoke: vi.fn(), split: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/specLearning", () => ({ carregarRegras: async () => [] }));
vi.mock("@/lib/pdfSplit", async importOriginal => ({ ...await importOriginal<typeof import("./pdfSplit")>(), splitPdf: split }));
import { extrairBookRommanel } from "./rommanelExtract";

describe("recuperação Rommanel", () => {
  it("informa a seção anterior, seleciona só a falha e audita páginas vazias", async () => {
    split.mockResolvedValue({ parts: [{ name: "parte.pdf", base64: "pdf", startPage: 41, pageCount: 2 }], totalPages: 56, partesSubdivididas: 0, paginasPesadas: 0 });
    invoke.mockResolvedValue({ data: { pieces: [{ pagina: 1, nomePeca: "NOVA" }], secaoFinal: "VITRINES" } });
    const file = new File([], "book.pdf");
    const anterior = { ...novaLinhaRommanel(), pagina: 40, localInstalacao: "VITRINES", kit: "KIT ORIGINAL" };
    const res = await extrairBookRommanel(file, () => {}, { paginas: [41,42], anteriores: [anterior], totalPaginas: 56 });
    expect(split).toHaveBeenCalledWith(file, [41,42]);
    expect(invoke.mock.calls[0][1].body.secaoCorrente).toBe("VITRINES");
    expect(res.pieces[0].pagina).toBe(41);
    expect(res.pieces[0].localInstalacao).toBe("VITRINES");
    expect(res.cobertura.paginasSemPeca).toEqual([42]);
    expect(res.cobertura.paginasFaltando).not.toContain(41);
    expect(res.cobertura.paginasFaltando).toContain(40);
  });
});