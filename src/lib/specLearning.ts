import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import type { NaturaRow } from "@/lib/naturaSheet";

/* ------------------------------------------------------------------ */
/* Normalização e chaves                                              */
/* ------------------------------------------------------------------ */

/**
 * Normaliza texto para comparação: minúsculas, sem acentos, sem "cm",
 * vírgula decimal virando ponto, espaços colapsados e pontuação nas pontas removida.
 * SEMPRE use esta função para comparar textos e montar chaves.
 */
export function normalizar(texto: unknown): string {
  const raw = texto == null ? "" : String(texto);
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\bcm\b/g, "")
    .replace(/cm(?=\d|\b)/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[^\w]+|[^\w)%.]+$/g, "")
    .trim();
}

export const chaveDaPeca = (item: unknown, formato: unknown): string =>
  `${normalizar(item)}|${normalizar(formato)}`;

export const chaveDaRegra = (texto: unknown): string =>
  `regra|${normalizar(texto).slice(0, 180)}`;

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export type Origem = "comparacao_planilha" | "comparacao_book" | "gabarito";
export type Alvo = "extracao" | "redacao" | "ambos";
export type Tipo = "exemplo" | "regra";

export interface LinhaLida {
  grupo: string;
  nome: string;
  item: string;
  arquivo: string;
  especificacao: string;
  pagBook: number;
  formato: string;
}

/** Item de aprendizado ainda não gravado (mostrado no diálogo de confirmação). */
export interface AprendizadoItem {
  tipo: Tipo;
  alvo: Alvo;
  chave: string;
  item: string;
  nome: string;
  grupo: string;
  arquivo: string;
  formato: string;
  pagBook: number | null;
  especificacaoIa: string | null;
  especificacaoCorreta: string;
  origem: Origem;
}

export interface SpecExample extends AprendizadoItem {
  id: string;
  updatedAt: string;
}

export interface ResultadoGravacao {
  novas: number;
  atualizadas: number;
  ignoradas: number;
}

/* ------------------------------------------------------------------ */
/* Leitura da planilha editada                                        */
/* ------------------------------------------------------------------ */

const cellText = (cell: ExcelJS.Cell | undefined): string => {
  if (!cell) return "";
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[]).map((t) => t.text ?? "").join("");
    }
    if ("text" in obj) return String(obj.text ?? "");
    if ("result" in obj) return String(obj.result ?? "");
    if ("hyperlink" in obj) return String(obj.hyperlink ?? "");
  }
  return String(v);
};

const HEADER_KEYS: { key: keyof Omit<LinhaLida, "grupo">; matches: string[] }[] = [
  { key: "nome", matches: ["nome"] },
  { key: "item", matches: ["item"] },
  { key: "arquivo", matches: ["arquivo"] },
  { key: "especificacao", matches: ["especificacao", "especificacao padrao"] },
  { key: "pagBook", matches: ["pag book", "pagina", "pag", "pag. book", "pagbook"] },
  { key: "formato", matches: ["formato", "medida", "medidas"] },
];

/**
 * Lê uma planilha no padrão Natura (gerada pelo app e editada à mão).
 * Descobre a linha de cabeçalho, mapeia colunas por texto e faz forward-fill
 * das colunas mescladas (grupo, nome, pag book).
 */
export async function lerPlanilhaNatura(file: File): Promise<LinhaLida[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Esta planilha não está no padrão Natura — envie a planilha gerada pelo app e editada por você.");

  // 1. Encontra a linha de cabeçalho pelas 30 primeiras linhas.
  let headerRow = 0;
  const lastCol = Math.max(ws.columnCount, 15);
  for (let r = 1; r <= Math.min(30, ws.rowCount); r++) {
    for (let c = 1; c <= lastCol; c++) {
      if (normalizar(cellText(ws.getRow(r).getCell(c))) === "especificacao") {
        headerRow = r;
        break;
      }
    }
    if (headerRow) break;
  }
  if (!headerRow) {
    throw new Error(
      "Esta planilha não está no padrão Natura — envie a planilha gerada pelo app e editada por você."
    );
  }

  // 2. Mapa de colunas pelo TEXTO do cabeçalho.
  const colMap: Partial<Record<keyof Omit<LinhaLida, "grupo">, number>> = {};
  for (let c = 1; c <= lastCol; c++) {
    const text = normalizar(cellText(ws.getRow(headerRow).getCell(c)));
    if (!text) continue;
    for (const { key, matches } of HEADER_KEYS) {
      if (colMap[key]) continue;
      if (matches.includes(text)) colMap[key] = c;
    }
  }

  // 3. Varre os dados com forward-fill de grupo / nome / pag book.
  const linhas: LinhaLida[] = [];
  let lastGrupo = "";
  let lastNome = "";
  let lastPag = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (key: keyof Omit<LinhaLida, "grupo">): string => {
      const c = colMap[key];
      return c ? cellText(row.getCell(c)).trim() : "";
    };

    const grupoRaw = cellText(row.getCell(1)).trim();
    if (grupoRaw) lastGrupo = grupoRaw;

    const nomeRaw = get("nome");
    if (nomeRaw) lastNome = nomeRaw;

    const pagRaw = Number(String(get("pagBook")).replace(/[^\d]/g, ""));
    if (Number.isFinite(pagRaw) && pagRaw > 0) lastPag = pagRaw;

    const item = get("item");
    const especificacao = get("especificacao");
    if (!item && !especificacao) continue;

    linhas.push({
      grupo: lastGrupo,
      nome: nomeRaw || lastNome,
      item,
      arquivo: get("arquivo"),
      especificacao,
      pagBook: Number.isFinite(pagRaw) && pagRaw > 0 ? pagRaw : lastPag,
      formato: get("formato"),
    });
  }

  return linhas;
}

/* ------------------------------------------------------------------ */
/* MODO A — comparar com a planilha gerada pelo app                   */
/* ------------------------------------------------------------------ */

export interface ComparacaoResultado {
  itens: AprendizadoItem[];
  iguais: number;
}

export function compararComGerado(
  linhasEditadas: LinhaLida[],
  naturaRowsSalvas: NaturaRow[]
): ComparacaoResultado {
  const porArquivoPagina = new Map<string, NaturaRow>();
  const porItemPagina = new Map<string, NaturaRow>();
  const porItem = new Map<string, NaturaRow>();

  for (const g of naturaRowsSalvas) {
    const pag = Number(g.pagBook) || 0;
    const arq = normalizar(g.arquivo);
    const it = normalizar(g.item);
    if (arq) porArquivoPagina.set(`${arq}|${pag}`, g);
    if (it) {
      porItemPagina.set(`${it}|${pag}`, g);
      if (!porItem.has(it)) porItem.set(it, g);
    }
  }

  const itens: AprendizadoItem[] = [];
  let iguais = 0;

  for (const linha of linhasEditadas) {
    if (!linha.especificacao.trim()) continue;
    const pag = Number(linha.pagBook) || 0;
    const gerada =
      porArquivoPagina.get(`${normalizar(linha.arquivo)}|${pag}`) ??
      porItemPagina.get(`${normalizar(linha.item)}|${pag}`) ??
      porItem.get(normalizar(linha.item));

    if (gerada && normalizar(gerada.especificacaoPadrao) === normalizar(linha.especificacao)) {
      iguais++;
      continue;
    }

    itens.push({
      tipo: "exemplo",
      alvo: "redacao",
      chave: chaveDaPeca(linha.item, linha.formato),
      item: linha.item,
      nome: linha.nome,
      grupo: linha.grupo,
      arquivo: linha.arquivo,
      formato: linha.formato,
      pagBook: pag || null,
      especificacaoIa: gerada ? gerada.especificacaoPadrao : null,
      especificacaoCorreta: linha.especificacao,
      origem: gerada ? "comparacao_planilha" : "gabarito",
    });
  }

  return { itens, iguais };
}

/* ------------------------------------------------------------------ */
/* MODO C — gabarito                                                  */
/* ------------------------------------------------------------------ */

export function aprenderDeGabarito(linhasEditadas: LinhaLida[]): AprendizadoItem[] {
  return linhasEditadas
    .filter((l) => l.especificacao.trim().length > 0)
    .map((l) => ({
      tipo: "exemplo" as Tipo,
      alvo: "redacao" as Alvo,
      chave: chaveDaPeca(l.item, l.formato),
      item: l.item,
      nome: l.nome,
      grupo: l.grupo,
      arquivo: l.arquivo,
      formato: l.formato,
      pagBook: Number(l.pagBook) || null,
      especificacaoIa: null,
      especificacaoCorreta: l.especificacao,
      origem: "gabarito" as Origem,
    }));
}

/* ------------------------------------------------------------------ */
/* Gravação e listagem                                                */
/* ------------------------------------------------------------------ */

const PRECEDENCIA: Record<Origem, number> = {
  comparacao_book: 3,
  comparacao_planilha: 2,
  gabarito: 1,
};

const PAGE_SIZE = 200;

const toExample = (row: Record<string, unknown>): SpecExample => ({
  id: String(row.id),
  tipo: (row.tipo as Tipo) ?? "exemplo",
  alvo: (row.alvo as Alvo) ?? "redacao",
  chave: String(row.chave ?? ""),
  item: String(row.item ?? ""),
  nome: String(row.nome ?? ""),
  grupo: String(row.grupo ?? ""),
  arquivo: String(row.arquivo ?? ""),
  formato: String(row.formato ?? ""),
  pagBook: row.pag_book == null ? null : Number(row.pag_book),
  especificacaoIa: row.especificacao_ia == null ? null : String(row.especificacao_ia),
  especificacaoCorreta: String(row.especificacao_correta ?? ""),
  origem: (row.origem as Origem) ?? "gabarito",
  updatedAt: String(row.updated_at ?? new Date().toISOString()),
});

/** Upsert com precedência: book > planilha > gabarito; entre iguais, o novo vence. */
export async function salvarExemplos(
  itens: AprendizadoItem[],
  extractionId?: string | null
): Promise<ResultadoGravacao> {
  if (itens.length === 0) return { novas: 0, atualizadas: 0, ignoradas: 0 };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sessão não encontrada — recarregue a página.");

  // Dedup interno pela chave, mantendo o de maior precedência.
  const porChave = new Map<string, AprendizadoItem>();
  for (const item of itens) {
    if (!item.chave || !item.especificacaoCorreta.trim()) continue;
    const atual = porChave.get(item.chave);
    if (!atual || PRECEDENCIA[item.origem] >= PRECEDENCIA[atual.origem]) {
      porChave.set(item.chave, item);
    }
  }

  const chaves = [...porChave.keys()];
  const existentes = new Map<string, Origem>();
  for (let i = 0; i < chaves.length; i += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("spec_examples")
      .select("chave, origem")
      .in("chave", chaves.slice(i, i + PAGE_SIZE));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      existentes.set(String(row.chave), row.origem as Origem);
    }
  }

  let novas = 0;
  let atualizadas = 0;
  let ignoradas = 0;
  const payload: Record<string, unknown>[] = [];

  for (const item of porChave.values()) {
    const existente = existentes.get(item.chave);
    if (existente && PRECEDENCIA[item.origem] < PRECEDENCIA[existente]) {
      // Nunca deixar um gabarito sobrescrever uma correção.
      ignoradas++;
      continue;
    }
    if (existente) atualizadas++;
    else novas++;

    payload.push({
      user_id: userId,
      tipo: item.tipo,
      alvo: item.alvo,
      chave: item.chave,
      item: item.item ?? "",
      nome: item.nome ?? "",
      grupo: item.grupo ?? "",
      arquivo: item.arquivo ?? "",
      formato: item.formato ?? "",
      pag_book: item.pagBook,
      especificacao_ia: item.especificacaoIa,
      especificacao_correta: item.especificacaoCorreta,
      origem: item.origem,
      extraction_id: extractionId ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < payload.length; i += 100) {
    const { error } = await supabase
      .from("spec_examples")
      .upsert(payload.slice(i, i + 100) as never, { onConflict: "user_id,chave" });
    if (error) throw new Error(error.message);
  }

  return { novas, atualizadas, ignoradas };
}

/** Listagem paginada — nunca um select solto (trunca em 1000 silenciosamente). */
export async function listarExemplos(tipo?: Tipo): Promise<SpecExample[]> {
  const out: SpecExample[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .from("spec_examples")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (tipo) query = query.eq("tipo", tipo);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows.map((r) => toExample(r as unknown as Record<string, unknown>)));

    const total = count ?? out.length;
    if (rows.length === 0 || out.length >= total) break;
    from += PAGE_SIZE;
  }

  return out;
}

export async function contarAprendizado(): Promise<number> {
  const { count, error } = await supabase
    .from("spec_examples")
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

export async function excluirExemplo(id: string): Promise<void> {
  const { error } = await supabase.from("spec_examples").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function excluirTodosExemplos(tipo?: Tipo): Promise<void> {
  let query = supabase.from("spec_examples").delete();
  query = tipo ? query.eq("tipo", tipo) : query.not("id", "is", null);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Uso do aprendizado                                                 */
/* ------------------------------------------------------------------ */

export interface Aprendizado {
  exemplos: SpecExample[];
  regras: SpecExample[];
}

export async function carregarAprendizado(): Promise<Aprendizado> {
  const todos = await listarExemplos();
  return {
    exemplos: todos.filter((e) => e.tipo === "exemplo"),
    regras: todos.filter((e) => e.tipo === "regra"),
  };
}

/** Regras (texto) filtradas pelo alvo, mais recentes primeiro. */
export async function carregarRegras(alvo: "extracao" | "redacao", limite = 20): Promise<string[]> {
  try {
    const regras = await listarExemplos("regra");
    return regras
      .filter((r) => r.alvo === alvo || r.alvo === "ambos")
      .slice(0, limite)
      .map((r) => r.especificacaoCorreta.trim())
      .filter(Boolean);
  } catch (err) {
    console.warn("Não foi possível carregar as regras de aprendizado:", err);
    return [];
  }
}

const palavras = (texto: string): string[] =>
  normalizar(texto).split(" ").filter((w) => w.length > 2);

/** Seleciona os exemplos mais relevantes para um lote de peças (sobreposição de palavras). */
export function exemplosRelevantes(
  exemplos: SpecExample[],
  termosDoLote: string[],
  limite = 25
): SpecExample[] {
  if (exemplos.length === 0) return [];
  const alvo = new Set(termosDoLote.flatMap(palavras));

  return exemplos
    .map((ex, idx) => {
      const termos = new Set([...palavras(ex.item), ...palavras(ex.nome)]);
      let score = 0;
      termos.forEach((t) => {
        if (alvo.has(t)) score++;
      });
      return { ex, score, idx };
    })
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
    .slice(0, limite)
    .map((e) => e.ex);
}
