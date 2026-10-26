export interface Cobertura {
  totalPaginas: number;
  paginasFaltando: number[];
  paginasSemPeca: number[];
  linhasDescartadas?: number;
}

export interface FaixaPagina { startPage: number; pageCount: number }
export interface PecaPaginada { pagina: number; paginas?: string }

export function paginasDaPeca(p: PecaPaginada): number[] {
  return [...new Set([p.pagina, ...(p.paginas ?? "").split(/\s+/).map(Number)])]
    .filter(n => Number.isInteger(n) && n > 0);
}

export function calcularCobertura(totalPaginas: number, sucesso: FaixaPagina[], pecas: PecaPaginada[]): Cobertura {
  const lidas = new Set<number>();
  for (const parte of sucesso) {
    for (let n = parte.startPage; n < parte.startPage + parte.pageCount; n++) {
      if (n > 0 && n <= totalPaginas) lidas.add(n);
    }
  }
  const comPeca = new Set(pecas.flatMap(paginasDaPeca));
  const paginas = Array.from({ length: totalPaginas }, (_, i) => i + 1);
  return { totalPaginas, paginasFaltando: paginas.filter(n => !lidas.has(n)),
    paginasSemPeca: paginas.filter(n => lidas.has(n) && !comPeca.has(n)) };
}

export function mesclarCobertura(anterior: Cobertura, recuperada: Cobertura): Cobertura {
  const aindaFaltam = new Set(recuperada.paginasFaltando);
  const recuperadas = anterior.paginasFaltando.filter(n => !aindaFaltam.has(n));
  return { ...anterior,
    paginasFaltando: anterior.paginasFaltando.filter(n => aindaFaltam.has(n)),
    paginasSemPeca: [...new Set([...anterior.paginasSemPeca,
      ...recuperada.paginasSemPeca.filter(n => recuperadas.includes(n))])].sort((a, b) => a - b) };
}

export function lerCobertura(value: unknown): Cobertura | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Partial<Cobertura>;
  if (!Number.isInteger(v.totalPaginas) || Number(v.totalPaginas) < 1) return undefined;
  const numeros = (a: unknown): number[] => Array.isArray(a)
    ? [...new Set(a.filter((n): n is number => Number.isInteger(n) && n > 0 && n <= Number(v.totalPaginas)))].sort((a, b) => a - b) : [];
  return { totalPaginas: Number(v.totalPaginas), paginasFaltando: numeros(v.paginasFaltando),
    paginasSemPeca: numeros(v.paginasSemPeca), linhasDescartadas: Number(v.linhasDescartadas) || 0 };
}

export function faixasNaturais(paginas: number[]): string {
  const ordenadas = [...new Set(paginas)].sort((a, b) => a - b);
  const faixas: string[] = [];
  for (let i = 0; i < ordenadas.length; i++) {
    const inicio = ordenadas[i];
    let fim = inicio;
    while (ordenadas[i + 1] === fim + 1) fim = ordenadas[++i];
    faixas.push(inicio === fim ? String(inicio) : `${inicio} a ${fim}`);
  }
  return faixas.length <= 1 ? faixas.join("") : `${faixas.slice(0, -1).join(", ")} e ${faixas.at(-1)}`;
}

/** Existing rows always win, including their manual edits and ordering. */
export function mesclarPecas<T extends PecaPaginada>(existentes: T[], novas: T[], faltantes: number[]): T[] {
  const alvo = new Set(faltantes);
  return [...existentes, ...novas.filter(p => paginasDaPeca(p).some(n => alvo.has(n)))];
}