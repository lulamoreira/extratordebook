/**
 * Fonte única de verdade dos clientes atendidos pelo app.
 * As flags controlam o que já está disponível — quando a extração/planilha
 * de um cliente ficar pronta, basta virar a flag e a interface se ajusta.
 */
export type ClienteId = "natura" | "rommanel";

export interface Cliente {
  id: ClienteId;
  nome: string;
  corPrimaria: string;
  extracaoPronta: boolean;
  planilhaPronta: boolean;
}

export const CLIENTES: Record<ClienteId, Cliente> = {
  natura: {
    id: "natura",
    nome: "Natura",
    corPrimaria: "#F07300",
    extracaoPronta: true,
    planilhaPronta: true,
  },
  rommanel: {
    id: "rommanel",
    nome: "Rommanel",
    corPrimaria: "#4B2E5A",
    extracaoPronta: true,
    planilhaPronta: true,
  },
};

export const CLIENTE_PADRAO: ClienteId = "natura";

export const LISTA_CLIENTES: Cliente[] = [CLIENTES.natura, CLIENTES.rommanel];

const isClienteId = (id: unknown): id is ClienteId =>
  id === "natura" || id === "rommanel";

/** Devolve sempre um cliente válido — cai no padrão quando o id é desconhecido. */
export function getCliente(id: unknown): Cliente {
  return isClienteId(id) ? CLIENTES[id] : CLIENTES[CLIENTE_PADRAO];
}

export function normalizarClienteId(id: unknown): ClienteId {
  return isClienteId(id) ? id : CLIENTE_PADRAO;
}

const STORAGE_KEY = "cliente_selecionado";

export function lerClienteSalvo(): ClienteId {
  try {
    return normalizarClienteId(localStorage.getItem(STORAGE_KEY));
  } catch {
    return CLIENTE_PADRAO;
  }
}

export function salvarClienteSelecionado(id: ClienteId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ambiente sem localStorage — a escolha vale só para esta sessão.
  }
}
