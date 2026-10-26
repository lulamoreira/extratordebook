export type PartStatus = "pending" | "processing" | "waiting" | "done" | "error";
export class ExtractionError extends Error {
  constructor(message: string, public status?: number, public retryAfter = 0, public configuration = false) { super(message); }
}

/** Read the non-2xx body: invoke's generic message hides the gateway status. */
export async function erroDaFuncao(error: unknown): Promise<ExtractionError> {
  const e = error as { message?: string; context?: Response };
  let body: { error?: string; status?: number; retryAfter?: string | number; code?: string } = {};
  if (e.context instanceof Response) {
    try { body = await e.context.clone().json(); } catch { /* Network responses may lack JSON. */ }
  }
  return new ExtractionError(body.error ?? e.message ?? "Erro ao processar PDF", body.status ?? e.context?.status,
    retryAfterSeconds(body.retryAfter), body.code === "configuration_error");
}

export function retryAfterSeconds(value: unknown, now = Date.now()): number {
  if (value == null || value === "") return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(String(value));
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : 0;
}

export function politicaRetry(error: unknown): { attempts: number; delays: number[]; fatal: boolean } {
  const e = error instanceof ExtractionError ? error : new ExtractionError(error instanceof Error ? error.message : String(error));
  const m = e.message.toLowerCase();
  if (e.status === 402 || e.configuration || /402|crédit|credit|configur|api.key|401|403/.test(m) || e.status === 401 || e.status === 403)
    return { attempts: 1, delays: [], fatal: true };
  if (e.status === 429 || /429|limite|rate/.test(m)) return { attempts: 4, delays: [30, 60, 120], fatal: false };
  if ([500, 502, 503, 504].includes(e.status ?? 0) || /500|502|503|timeout|tempo.*exced/.test(m))
    return { attempts: 3, delays: [5, 15, 45], fatal: false };
  return { attempts: 2, delays: [3, 6], fatal: false };
}

export const esperar = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
export interface RetryProgress { index: number; status: PartStatus; message: string }
export interface RetryResult<T> { results: { index: number; value: T; attempt: number }[]; failures: { index: number; error: string }[]; stopped?: string; summary: string }

export async function processarComRetentativas<T>(count: number, execute: (index: number) => Promise<T>, report: (p: RetryProgress) => void): Promise<RetryResult<T>> {
  const results: RetryResult<T>["results"] = [];
  const failures: RetryResult<T>["failures"] = [];
  let stopped: string | undefined;
  for (let index = 0; index < count; index++) {
    if (index > 0) await esperar(1000);
    let budget = 2;
    for (let attempt = 1; ; attempt++) {
      report({ index, status: "processing", message: `Processando parte ${index + 1} (tentativa ${attempt} de ${budget})` });
      try {
        const value = await execute(index);
        results.push({ index, value, attempt });
        report({ index, status: "done", message: `Parte ${index + 1} processada${attempt > 1 ? ` na tentativa ${attempt}` : ""}.` });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        const policy = politicaRetry(error);
        budget = Math.max(budget, policy.attempts);
        if (policy.fatal || attempt >= budget) {
          failures.push({ index, error: message });
          report({ index, status: "error", message: `Parte ${index + 1}: ${message}` });
          if (policy.fatal) stopped = message;
          break;
        }
        const delay = Math.max(policy.delays[Math.min(attempt - 1, policy.delays.length - 1)] ?? 3,
          error instanceof ExtractionError ? error.retryAfter : 0);
        const deadline = Date.now() + delay * 1000;
        let remaining = Math.ceil(delay);
        while (remaining > 0) {
          report({ index, status: "waiting", message: `Parte ${index + 1} falhou — nova tentativa em ${remaining}s (tentativa ${attempt + 1} de ${budget})` });
          await esperar(Math.min(1000, Math.max(0, deadline - Date.now())));
          remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        }
      }
    }
    if (stopped) {
      for (let n = index + 1; n < count; n++) failures.push({ index: n, error: `Não processada: ${stopped}` });
      break;
    }
  }
  const recovered = results.filter(r => r.attempt > 1);
  const byAttempt = [...new Set(recovered.map(r => r.attempt))].sort().map(n => `${recovered.filter(r => r.attempt === n).length} recuperadas na ${n === 2 ? "segunda" : n === 3 ? "terceira" : "quarta"} tentativa`);
  const summary = stopped ? `Processamento interrompido: ${stopped}` : failures.length ? `${failures.length} parte(s) não foram processadas.`
    : `Todas as partes foram processadas${byAttempt.length ? ` (${byAttempt.join("; ")})` : ""}.`;
  return { results, failures, stopped, summary };
}