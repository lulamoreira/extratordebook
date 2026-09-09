/**
 * Modelo de peça da ROMMANEL — paralelo ao da Natura (src/data/extractedPieces.ts).
 * Nunca reaproveite este tipo no fluxo da Natura, nem o contrário.
 */

/** Campos cuja escrita na planilha o usuário decide na tela de revisão. */
export type CampoDecidivel = "pagina" | "tamanho" | "especificacao" | "quant";

export const CAMPOS_DECIDIVEIS: CampoDecidivel[] = [
  "pagina",
  "tamanho",
  "especificacao",
  "quant",
];

export interface RommanelPiece {
  /** Página no book completo (1-based). */
  pagina: number;
  /** Páginas empilhadas com \n na mesma ordem de nomePeca/tamanho (kits de banner). Peças normais: mesmo valor de pagina. */
  paginas: string;
  /** Vem da página de capa de seção (ex: "VITRINE", "AQUÁRIO"). */
  localInstalacao: string;
  /** Nome do kit; vazio quando é peça avulsa. */
  kit: string;
  nomePeca: string;
  /** ex: "60x15", "6X2X6", "VIDE BOOK". */
  tamanho: string;
  especificacao: string;
  /** Nome do arquivo da arte impresso na página. */
  codigoArquivo: string;
  /** true na peça avulsa e na PRIMEIRA linha de cada kit. */
  unidadeCompra: boolean;
  /** Preenchido só quando unidadeCompra = true. */
  nomeColunaVarejo: string;
  /** "4x4" ou "4x0". */
  cores: string;
  /** Default true — a linha entra na planilha. */
  incluir: boolean;
  /** Campos que o sistema deve deixar em branco na planilha. */
  camposEmBranco: CampoDecidivel[];
  /** Só de exibição — calculado a cada abertura da revisão, não é verdade persistida. */
  origemAprendizado?: "recorrente" | "nova";
}

/** Total de unidades de compra (colunas da planilha da VAREJO). */
export const contarUnidadesCompra = (pieces: RommanelPiece[]): number =>
  pieces.reduce((total, p) => total + (p.unidadeCompra ? 1 : 0), 0);

const alta = (v: unknown): string => (v == null ? "" : String(v)).toUpperCase();

/**
 * A planilha da Rommanel é toda em maiúsculas — normaliza nome, kit, local e
 * coluna VAREJO. A especificação tem capitalização própria e NÃO é alterada.
 * Também garante os defaults dos campos de decisão.
 */
export function normalizarRommanelPiece(p: RommanelPiece): RommanelPiece {
  const camposEmBranco = Array.isArray(p.camposEmBranco)
    ? p.camposEmBranco.filter((c): c is CampoDecidivel =>
        (CAMPOS_DECIDIVEIS as string[]).includes(c)
      )
    : [];

  return {
    ...p,
    localInstalacao: alta(p.localInstalacao),
    kit: alta(p.kit),
    nomePeca: alta(p.nomePeca),
    nomeColunaVarejo: alta(p.nomeColunaVarejo),
    incluir: p.incluir !== false,
    camposEmBranco,
  };
}

export const normalizarRommanelPieces = (pieces: RommanelPiece[]): RommanelPiece[] =>
  pieces.map(normalizarRommanelPiece);

/** Linha nova em branco, adicionada no fim da lista. */
export const novaLinhaRommanel = (): RommanelPiece => ({
  pagina: 0,
  paginas: "",
  localInstalacao: "",
  kit: "",
  nomePeca: "",
  tamanho: "",
  especificacao: "",
  codigoArquivo: "",
  unidadeCompra: false,
  nomeColunaVarejo: "",
  cores: "4x0",
  incluir: true,
  camposEmBranco: [],
  origemAprendizado: "nova",
});
