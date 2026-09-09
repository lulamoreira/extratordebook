import { useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
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
import type { RommanelPiece } from "@/data/rommanelPieces";
import {
  baixarPastaRommanel,
  gerarPastaRommanel,
  type RelatorioRommanel,
  type ResultadoRommanel,
} from "@/lib/rommanelSheet";

export interface GerarRommanelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pieces: RommanelPiece[];
  /** Nome do arquivo do book — usado para sugerir o nome da campanha. */
  fileName: string;
}

/** "ROM_HERANCAS_BOOK.pdf" -> "HERANÇAS" não dá para adivinhar: usa o miolo do nome. */
const sugerirCampanha = (fileName: string): string =>
  fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\b(book|rommanel|rom|campanha|final|pdf)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const Relatorio = ({ r }: { r: RelatorioRommanel }) => (
  <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-xs">
    <p className="font-semibold text-foreground">Conferência</p>
    <p>{r.colunasVarejo} colunas de peça na VAREJO</p>
    <p>{r.formulasQuant} fórmulas Quant na aba da campanha</p>
    <p>{r.linhasDadosNf} linhas na DADOS NF</p>
    {r.quantEmBranco.length > 0 && (
      <p className="text-muted-foreground">
        Sem fórmula Quant, por sua escolha: {r.quantEmBranco.join(", ")}
      </p>
    )}
    {r.secoesNovas.length > 0 && (
      <p className="text-muted-foreground">
        Seções novas, sem cor definida (usaram cinza): {r.secoesNovas.join(", ")}
      </p>
    )}
    {r.problemas.map((p) => (
      <p key={p} className="flex items-start gap-1 font-semibold text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {p}
      </p>
    ))}
  </div>
);

export const GerarRommanelDialog = ({
  open,
  onOpenChange,
  pieces,
  fileName,
}: GerarRommanelDialogProps) => {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [campanha, setCampanha] = useState("");
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState({ percent: 0, label: "" });
  const [resultado, setResultado] = useState<ResultadoRommanel | null>(null);

  useEffect(() => {
    if (!open) return;
    setArquivo(null);
    setResultado(null);
    setProgresso({ percent: 0, label: "" });
    setCampanha(sugerirCampanha(fileName));
  }, [open, fileName]);

  const gerar = async () => {
    if (!arquivo) {
      toast.error("Envie o arquivo .xlsx da campanha anterior.");
      return;
    }
    if (!campanha.trim()) {
      toast.error("Informe o nome da campanha nova.");
      return;
    }
    setGerando(true);
    setResultado(null);
    try {
      const res = await gerarPastaRommanel(arquivo, pieces, campanha, (label, percent) =>
        setProgresso({ label, percent })
      );
      setResultado(res);
      if (res.relatorio.ok) {
        baixarPastaRommanel(res.buffer, res.nomeArquivo);
        toast.success(`Pasta gerada: ${res.nomeArquivo}`);
      } else {
        toast.warning("A conferência achou pontos para você revisar antes de baixar.");
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg && !/xlsx|zip|corrupt/i.test(msg)
          ? msg
          : "Não foi possível ler a planilha — confirme que é o arquivo .xlsx da campanha anterior."
      );
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (gerando ? null : onOpenChange(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar Planilha Padrão Rommanel</DialogTitle>
          <DialogDescription>
            Envie a pasta da campanha anterior do jeito que ela está. Ela não será alterada — você
            recebe um arquivo novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rommanel-base">Planilha da campanha anterior (.xlsx)</Label>
            <Input
              id="rommanel-base"
              type="file"
              accept=".xlsx"
              disabled={gerando}
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rommanel-campanha">Nome da campanha nova</Label>
            <Input
              id="rommanel-campanha"
              value={campanha}
              disabled={gerando}
              placeholder="HERANÇAS"
              onChange={(e) => setCampanha(e.target.value.toUpperCase())}
            />
          </div>

          {gerando && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progresso.label || "Gerando..."}
              </p>
              <Progress value={progresso.percent} />
            </div>
          )}

          {resultado && <Relatorio r={resultado.relatorio} />}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={gerando} onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {resultado && !resultado.relatorio.ok ? (
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => {
                baixarPastaRommanel(resultado.buffer, resultado.nomeArquivo);
                toast.success(`Baixado mesmo assim: ${resultado.nomeArquivo}`);
              }}
            >
              <Download className="h-4 w-4" />
              Baixar mesmo assim
            </Button>
          ) : (
            <Button onClick={gerar} disabled={gerando} className="gap-2">
              {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {resultado ? "Gerar de novo" : "Gerar planilha"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GerarRommanelDialog;
