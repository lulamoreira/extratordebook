import { useEffect, useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getNaturaRows } from "@/lib/historyStorage";
import type { NaturaRow } from "@/lib/naturaSheet";
import { aprenderDoBook } from "@/lib/bookLearning";
import {
  aprenderDeGabarito,
  compararComGerado,
  contarNovidades,
  lerPlanilhaNatura,
  salvarExemplos,
  type AprendizadoItem,
} from "@/lib/specLearning";
import LearnPreview from "@/components/LearnPreview";

type Modo = "planilha" | "book" | "gabarito";
type Etapa = "modo" | "rodando" | "revisao";

export interface TeachDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extração vinculada (histórico ou tabela na tela). Opcional. */
  extractionId?: string | null;
  /** Só permite o modo gabarito (usado na página de aprendizado). */
  somenteGabarito?: boolean;
  /** Gera a Planilha Padrão Natura da extração vinculada (mesma ação do histórico). */
  onGenerateNatura?: () => Promise<void>;
  onLearned?: () => void;
}

const MODOS: { id: Modo; titulo: string; descricao: string }[] = [
  {
    id: "planilha",
    titulo: "Comparar com a planilha que o app gerou",
    descricao: "Rápido e gratuito. Aprende só com o que você mudou.",
  },
  {
    id: "book",
    titulo: "Comparar com o book da campanha",
    descricao: "Envie o PDF junto. Usa IA sobre o book inteiro, custo parecido com uma extração.",
  },
  {
    id: "gabarito",
    titulo: "Só aprender com a planilha",
    descricao: "Rápido e gratuito. Usa todas as especificações como referência.",
  },
];

export const TeachDialog = ({
  open,
  onOpenChange,
  extractionId,
  somenteGabarito = false,
  onGenerateNatura,
  onLearned,
}: TeachDialogProps) => {
  const [modo, setModo] = useState<Modo>(somenteGabarito ? "gabarito" : "planilha");
  const [etapa, setEtapa] = useState<Etapa>("modo");
  const [planilha, setPlanilha] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [naturaRows, setNaturaRows] = useState<NaturaRow[] | null>(null);
  const [progresso, setProgresso] = useState({ percent: 0, label: "" });
  const [itens, setItens] = useState<AprendizadoItem[]>([]);
  const [resumo, setResumo] = useState({ novas: 0, atualizadas: 0, ignoradas: 0 });
  const [salvando, setSalvando] = useState(false);
  const [gerandoNatura, setGerandoNatura] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEtapa("modo");
    setPlanilha(null);
    setPdf(null);
    setItens([]);
    setModo(somenteGabarito ? "gabarito" : "planilha");
    if (!extractionId || somenteGabarito) {
      setNaturaRows([]);
      return;
    }
    setNaturaRows(null);
    getNaturaRows(extractionId)
      .then((rows) => setNaturaRows((rows ?? []) as NaturaRow[]))
      .catch(() => setNaturaRows([]));
  }, [open, extractionId, somenteGabarito]);

  const temGerado = (naturaRows?.length ?? 0) > 0;

  const analisar = async () => {
    if (!planilha) {
      toast.error("Envie a planilha editada.");
      return;
    }
    if (modo === "book" && !pdf) {
      toast.error("Envie também o PDF do book.");
      return;
    }

    setEtapa("rodando");
    setProgresso({ percent: 0, label: "Lendo a planilha..." });

    try {
      let novos: AprendizadoItem[] = [];
      let ignoradas = 0;

      if (modo === "book") {
        const res = await aprenderDoBook(planilha, pdf as File, naturaRows ?? [], (p) =>
          setProgresso(p)
        );
        novos = res.itens;
        if (res.descartadas > 0) {
          toast.warning(`${res.descartadas} linha(s) sem número de página foram ignoradas.`);
        }
        if (res.lotesFalhos > 0) {
          toast.warning(
            `${res.lotesFalhos} de ${res.totalLotes} lotes falharam e foram pulados — tente de novo mais tarde.`
          );
        }
      } else {
        const linhas = await lerPlanilhaNatura(planilha);
        if (modo === "planilha") {
          const res = compararComGerado(linhas, naturaRows ?? []);
          novos = res.itens;
          ignoradas = res.iguais;
        } else {
          novos = aprenderDeGabarito(linhas);
        }
      }

      if (novos.length === 0) {
        toast.info("Nada novo para aprender nesta planilha.");
        setEtapa("modo");
        return;
      }

      const { novas, atualizadas } = await contarNovidades(novos);
      setItens(novos);
      setResumo({ novas, atualizadas, ignoradas });
      setEtapa("revisao");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Não foi possível analisar a planilha.");
      setEtapa("modo");
    }
  };

  const aprender = async () => {
    setSalvando(true);
    try {
      const res = await salvarExemplos(itens, extractionId ?? undefined);
      toast.success(`Aprendizado salvo — ${res.novas} novas e ${res.atualizadas} atualizadas.`);
      onLearned?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar o aprendizado.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (salvando ? null : onOpenChange(v))}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Ensinar com minha planilha
          </DialogTitle>
          <DialogDescription>
            O app aprende o seu jeito de escrever as especificações e o que precisa ler do book.
          </DialogDescription>
        </DialogHeader>

        {etapa === "modo" && (
          <div className="space-y-4">
            {!somenteGabarito && (
              <div className="space-y-2">
                {MODOS.map((m) => {
                  const desabilitado = m.id === "planilha" && !temGerado;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={desabilitado}
                      onClick={() => setModo(m.id)}
                      className={cn(
                        "w-full rounded-xl p-3 text-left transition-colors",
                        modo === m.id ? "bg-primary/10 ring-2 ring-primary" : "bg-muted/50 hover:bg-muted",
                        desabilitado && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span className="block text-sm font-semibold text-foreground">{m.titulo}</span>
                      <span className="block text-xs text-muted-foreground">
                        {desabilitado
                          ? "Indisponível: gere a Planilha Padrão Natura desta extração primeiro."
                          : m.descricao}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="teach-xlsx">Planilha editada (.xlsx)</Label>
              <Input
                id="teach-xlsx"
                type="file"
                accept=".xlsx"
                onChange={(e) => setPlanilha(e.target.files?.[0] ?? null)}
              />
            </div>

            {modo === "book" && (
              <div className="space-y-2">
                <Label htmlFor="teach-pdf">Book da campanha (.pdf)</Label>
                <Input
                  id="teach-pdf"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </div>
        )}

        {etapa === "rodando" && (
          <div className="space-y-3 py-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progresso.label || "Analisando..."}
            </div>
            <Progress value={progresso.percent} />
          </div>
        )}

        {etapa === "revisao" && <LearnPreview itens={itens} {...resumo} />}

        <DialogFooter>
          {etapa === "modo" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={analisar}>Analisar</Button>
            </>
          )}
          {etapa === "revisao" && (
            <>
              <Button variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={aprender} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aprender
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TeachDialog;
