import { describe, it, expect } from "vitest";
import { calcularCobertura, mesclarCobertura, mesclarPecas, faixasNaturais } from "./pageCoverage";

describe("auditoria de páginas", () => {
  it("parte com falha deixa exatamente as páginas 41 a 50 faltando", () => {
    const c = calcularCobertura(56, [{ startPage: 1, pageCount: 40 }, { startPage: 51, pageCount: 6 }], [{ pagina: 1 }]);
    expect(c.paginasFaltando).toEqual([41,42,43,44,45,46,47,48,49,50]);
    expect(faixasNaturais(c.paginasFaltando)).toBe("41 a 50");
  });
  it("páginas lidas sem peça são informação separada de falhas, incluindo páginas empilhadas", () => {
    const c = calcularCobertura(4, [{ startPage: 1, pageCount: 3 }], [{ pagina: 1, paginas: "1\n3" }]);
    expect(c.paginasSemPeca).toEqual([2]);
    expect(c.paginasFaltando).toEqual([4]);
  });
  it("recuperação parcial mantém as falhas restantes e a completa elimina o aviso", () => {
    const original = calcularCobertura(4, [{ startPage: 1, pageCount: 1 }], [{ pagina: 1 }]);
    const parcial = mesclarCobertura(original, calcularCobertura(4, [{ startPage: 2, pageCount: 2 }], [{ pagina: 2 }]));
    expect(parcial.paginasFaltando).toEqual([4]);
    expect(parcial.paginasSemPeca).toEqual([3]);
    expect(mesclarCobertura(parcial, calcularCobertura(4, [{ startPage: 4, pageCount: 1 }], [{ pagina: 4 }])).paginasFaltando).toEqual([]);
  });
  it("mescla apenas novas páginas sem apagar ou modificar a edição manual", () => {
    const editada = { pagina: 1, nome: "EDITADO À MÃO", incluir: false };
    const r = mesclarPecas([editada], [{ pagina: 1, nome: "IA", incluir: true }, { pagina: 2, nome: "NOVA", incluir: true }], [2]);
    expect(r).toEqual([editada, { pagina: 2, nome: "NOVA", incluir: true }]);
    expect(r[0]).toBe(editada);
  });
});