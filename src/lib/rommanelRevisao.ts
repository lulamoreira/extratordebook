import type { RommanelPiece } from "@/data/rommanelPieces";
import { normalizarRommanelPieces } from "@/data/rommanelPieces";
import { carregarAprendizado, chaveDaPeca } from "@/lib/specLearning";

/**
 * Marca cada peça como RECORRENTE (já existe aprendizado para a mesma
 * chave nome+tamanho) ou NOVA. Nas recorrentes, a especificação aprendida
 * — a que o usuário aprovou da última vez — substitui a gerada pela IA.
 *
 * Na primeira campanha o aprendizado está vazio e tudo fica NOVA: é esperado.
 */
export async function marcarAprendizado(pieces: RommanelPiece[]): Promise<RommanelPiece[]> {
  const base = normalizarRommanelPieces(pieces);
  let aprendidas = new Map<string, string>();

  try {
    const { exemplos } = await carregarAprendizado("rommanel");
    aprendidas = new Map(
      exemplos
        .filter((e) => e.especificacaoCorreta.trim().length > 0)
        .map((e) => [e.chave, e.especificacaoCorreta])
    );
  } catch (err) {
    // Sem aprendizado disponível a tela continua funcionando: tudo vira NOVA.
    console.warn("Não foi possível carregar o aprendizado da Rommanel:", err);
  }

  return base.map((p) => {
    const aprendida = aprendidas.get(chaveDaPeca(p.nomePeca, p.tamanho));
    return aprendida
      ? { ...p, especificacao: aprendida, origemAprendizado: "recorrente" as const }
      : { ...p, origemAprendizado: "nova" as const };
  });
}

export interface AvisoConsistencia {
  id: string;
  mensagem: string;
  /** Índice da linha a destacar. */
  linha: number;
}

/** Avisos que não bloqueiam o usuário, apenas apontam o que sairia errado na planilha. */
export function calcularAvisos(
  pieces: RommanelPiece[],
  totalPages?: number
): AvisoConsistencia[] {
  const avisos: AvisoConsistencia[] = [];
  const nomesVistos = new Map<string, number>();
  const kitsAbertos = new Set<string>();

  pieces.forEach((p, i) => {
    if (!p.incluir) return;

    if (p.unidadeCompra) {
      const nome = p.nomeColunaVarejo.trim();
      if (!nome) {
        avisos.push({
          id: `varejo-vazio-${i}`,
          mensagem: `Linha ${i + 1}: unidade de compra sem Nome da coluna VAREJO.`,
          linha: i,
        });
      } else if (nomesVistos.has(nome)) {
        avisos.push({
          id: `varejo-dup-${i}`,
          mensagem: `Linha ${i + 1}: "${nome}" repete a linha ${
            (nomesVistos.get(nome) ?? 0) + 1
          } — viraria coluna duplicada.`,
          linha: i,
        });
      } else {
        nomesVistos.set(nome, i);
      }
      if (p.kit.trim()) kitsAbertos.add(p.kit.trim());
    } else if (p.kit.trim() && !kitsAbertos.has(p.kit.trim())) {
      avisos.push({
        id: `kit-orfao-${i}`,
        mensagem: `Linha ${i + 1}: peça do kit "${p.kit}" aparece antes da primeira linha do kit.`,
        linha: i,
      });
    }

    if (!p.localInstalacao.trim()) {
      avisos.push({
        id: `local-${i}`,
        mensagem: `Linha ${i + 1}: linha incluída sem Local de instalação.`,
        linha: i,
      });
    }

    const fora =
      !Number.isFinite(p.pagina) ||
      p.pagina < 1 ||
      (typeof totalPages === "number" && totalPages > 0 && p.pagina > totalPages);
    if (fora) {
      avisos.push({
        id: `pagina-${i}`,
        mensagem: `Linha ${i + 1}: página ${p.pagina || "—"} fora do intervalo do book.`,
        linha: i,
      });
    }
  });

  return avisos;
}

export interface Placar {
  linhas: number;
  unidades: number;
  dadosNf: number;
  divergente: boolean;
}

export function calcularPlacar(pieces: RommanelPiece[]): Placar {
  const incluidas = pieces.filter((p) => p.incluir);
  const unidades = incluidas.filter((p) => p.unidadeCompra).length;
  // Por definição a DADOS NF tem uma linha por unidade de compra.
  const dadosNf = unidades;
  return {
    linhas: incluidas.length,
    unidades,
    dadosNf,
    divergente: unidades !== dadosNf,
  };
}

/** Sugestões de Local de instalação já presentes na extração (evita divergência de grafia). */
export const locaisSugeridos = (pieces: RommanelPiece[]): string[] =>
  [...new Set(pieces.map((p) => p.localInstalacao.trim()).filter(Boolean))].sort();
