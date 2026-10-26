import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { faixasNaturais, type Cobertura } from "@/lib/pageCoverage";
import { cn } from "@/lib/utils";

export function ResumoCobertura({ cobertura }: { cobertura?: Cobertura }) {
  if (!cobertura) return null;
  const lidas = cobertura.totalPaginas - cobertura.paginasFaltando.length;
  return <> · páginas lidas {lidas} de <span className={cn("tabular-nums", lidas !== cobertura.totalPaginas && "font-semibold text-destructive")}>{cobertura.totalPaginas}</span></>;
}

export function InfoCobertura({ cobertura }: { cobertura?: Cobertura }) {
  if (!cobertura) return null;
  return <div className="text-xs text-muted-foreground">
    {cobertura.paginasSemPeca.length > 0 && <p>Páginas sem peça: {cobertura.paginasSemPeca.join(", ")}</p>}
    <p>Deduplicação: {cobertura.linhasDescartadas ?? 0} linhas descartadas.</p>
  </div>;
}

export function AvisoCobertura({ cobertura, onRetry, busy }: { cobertura?: Cobertura; onRetry: () => void; busy: boolean }) {
  if (!cobertura?.paginasFaltando.length) return null;
  return <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
    <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
    <p className="min-w-0 flex-1 text-sm font-medium text-foreground">Atenção: as páginas {faixasNaturais(cobertura.paginasFaltando)} não foram lidas. Pode haver peças faltando.</p>
    <Button variant="outline" size="sm" disabled={busy} onClick={onRetry} className="gap-2"><RotateCcw className={cn("h-4 w-4", busy && "animate-spin")} />Reprocessar só essas páginas</Button>
  </div>;
}