/**
 * Modelo de peça da ROMMANEL — paralelo ao da Natura (src/data/extractedPieces.ts).
 * Nunca reaproveite este tipo no fluxo da Natura, nem o contrário.
 */
export interface RommanelPiece {
  /** Página no book completo (1-based). */
  pagina: number;
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
}

/** Total de unidades de compra (colunas da planilha da VAREJO). */
export const contarUnidadesCompra = (pieces: RommanelPiece[]): number =>
  pieces.reduce((total, p) => total + (p.unidadeCompra ? 1 : 0), 0);
