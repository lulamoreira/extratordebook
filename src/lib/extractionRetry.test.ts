import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractionError, politicaRetry, processarComRetentativas, retryAfterSeconds } from "./extractionRetry";
afterEach(() => vi.useRealTimers());
describe("retentativas por erro", () => {
  it("429 tem quatro tentativas e esperas 30/60/120", () => {
    expect(politicaRetry(new ExtractionError("limite",429))).toEqual({attempts:4,delays:[30,60,120],fatal:false});
  });
  it("servidor tem três tentativas e esperas 5/15/45", () => {
    expect(politicaRetry(new ExtractionError("erro",503))).toEqual({attempts:3,delays:[5,15,45],fatal:false});
  });
  it("créditos e configuração não retentam; outros usam duas tentativas", () => {
    expect(politicaRetry(new ExtractionError("créditos",402)).fatal).toBe(true);
    expect(politicaRetry(new ExtractionError("config",500,0,true)).attempts).toBe(1);
    expect(politicaRetry(new Error("outro")).attempts).toBe(2);
  });
  it("Retry-After maior é respeitado com contagem e sem X prematuro", async () => {
    vi.useFakeTimers();
    const execute = vi.fn().mockRejectedValueOnce(new ExtractionError("limite",429,45)).mockResolvedValue("ok");
    const events: {status:string;message:string}[]=[];
    const task=processarComRetentativas(1,execute,p=>events.push(p));
    await vi.advanceTimersByTimeAsync(44000);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events.some(p=>p.status==="error")).toBe(false);
    expect(events.some(p=>p.message.includes("em 45s"))).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await task).results[0].attempt).toBe(2);
    expect(events.at(-1)?.status).toBe("done");
  });
  it("falha fatal interrompe outras partes imediatamente", async () => {
    const execute=vi.fn().mockRejectedValue(new ExtractionError("Créditos insuficientes",402));
    const r=await processarComRetentativas(3,execute,()=>{});
    expect(execute).toHaveBeenCalledTimes(1);
    expect(r.failures).toHaveLength(3);
  });
  it("respeita pausa de um segundo entre partes", async () => {
    vi.useFakeTimers(); const execute=vi.fn().mockResolvedValue("ok");
    const task=processarComRetentativas(2,execute,()=>{});
    await vi.advanceTimersByTimeAsync(999); expect(execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await task; expect(execute).toHaveBeenCalledTimes(2);
  });
  it("X aparece só depois de esgotar as quatro tentativas de limite", async () => {
    vi.useFakeTimers(); const execute=vi.fn().mockRejectedValue(new ExtractionError("limite",429));
    const events: string[]=[]; const task=processarComRetentativas(1,execute,p=>events.push(p.status));
    await vi.advanceTimersByTimeAsync(209999);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(events).not.toContain("error");
    await vi.advanceTimersByTimeAsync(1);
    expect((await task).failures).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(events.at(-1)).toBe("error");
  });
  it("lê Retry-After em segundos ou data HTTP", () => {
    expect(retryAfterSeconds("60")).toBe(60);
    expect(retryAfterSeconds("Mon, 26 Oct 2026 21:11:00 GMT",Date.parse("2026-10-26T21:10:00Z"))).toBe(60);
  });
});