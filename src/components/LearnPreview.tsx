import { Badge } from "@/components/ui/badge";
import { type AprendizadoItem } from "@/lib/specLearning";

const ALVO_LABEL: Record<string, string> = {
  extracao: "Afeta a extração",
  redacao: "Afeta a redação",
  ambos: "Afeta extração e redação",
};

export interface LearnPreviewProps {
  itens: AprendizadoItem[];
  novas: number;
  atualizadas: number;
  ignoradas: number;
}

/** Mostra o que será aprendido antes de gravar qualquer coisa. */
export const LearnPreview = ({ itens, novas, atualizadas, ignoradas }: LearnPreviewProps) => {
  const exemplos = itens.filter((i) => i.tipo === "exemplo");
  const regras = itens.filter((i) => i.tipo === "regra");

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-foreground">
        {novas} novas, {atualizadas} atualizadas, {ignoradas} ignoradas por estarem iguais
      </p>

      <div>
        <h3 className="mb-2 text-sm font-bold text-foreground">
          Especificações {exemplos.length > 0 && <span className="text-muted-foreground">({exemplos.length})</span>}
        </h3>
        {exemplos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma especificação nova encontrada.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {exemplos.map((ex, i) => (
              <div key={`${ex.chave}-${i}`} className="rounded-lg bg-muted/50 p-3 text-xs">
                <div className="font-semibold text-foreground">
                  {ex.item || "—"}
                  {ex.formato && <span className="font-normal text-muted-foreground"> · {ex.formato}</span>}
                </div>
                {ex.especificacaoIa && (
                  <div className="mt-1 text-muted-foreground line-through">{ex.especificacaoIa}</div>
                )}
                <div className="mt-1 font-medium text-foreground">{ex.especificacaoCorreta}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-foreground">
          Regras aprendidas {regras.length > 0 && <span className="text-muted-foreground">({regras.length})</span>}
        </h3>
        {regras.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra nova encontrada.</p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {regras.map((r, i) => (
              <div key={`${r.chave}-${i}`} className="rounded-lg bg-muted/50 p-3 text-xs">
                <div className="font-medium text-foreground">{r.especificacaoCorreta}</div>
                <Badge variant="secondary" className="mt-1.5 text-[10px]">
                  {ALVO_LABEL[r.alvo] ?? r.alvo}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LearnPreview;
