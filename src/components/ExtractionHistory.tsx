import { useState, useEffect } from "react";
import { type Piece, classificarTipo } from "@/data/extractedPieces";
import {
  getHistory,
  updateNickname,
  deleteHistoryEntry,
  type HistoryEntry,
} from "@/lib/historyStorage";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Pencil, Check, X, Trash2, History, FileSpreadsheet, AlertTriangle, ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportarPlanilhaNatura } from "@/lib/naturaExport";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  onLoad: (pieces: Piece[], fileName: string, entryId: string) => void;
  refreshKey: number;
}

const ExtractionHistory = ({ onLoad, refreshKey }: Props) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const generateNatura = async (entry: HistoryEntry) => {
    setGeneratingId(entry.id);
    try {
      const base = entry.nickname || entry.fileName.replace(/\.pdf$/i, "");
      await exportarPlanilhaNatura(entry.pieces, base);
    } finally {
      setGeneratingId(null);
    }
  };

  useEffect(() => {
    setHistory(getHistory());
  }, [refreshKey]);

  if (history.length === 0) return null;

  const toggleErrors = (id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startRename = (entry: HistoryEntry) => {
    setEditingId(entry.id);
    setNicknameInput(entry.nickname || entry.fileName.replace(/\.pdf$/i, ""));
  };

  const saveNickname = (id: string) => {
    updateNickname(id, nicknameInput);
    setHistory(getHistory());
    setEditingId(null);
    toast.success("Apelido salvo!");
  };

  const handleDelete = (id: string) => {
    deleteHistoryEntry(id);
    setHistory(getHistory());
    toast.info("Entrada removida do histórico");
  };

  const downloadEntry = (entry: HistoryEntry) => {
    const wsData = entry.pieces.map((p) => ({
      Página: p.pagina,
      Seção: p.secao,
      Código: p.codigo,
      "Nome da Peça": p.nomePeca,
      "Tipo de Peça": classificarTipo(p.nomePeca),
      "Tamanho (cm)": p.tamanho,
      Especificação: p.especificacao,
      Cores: p.cores,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 8 }, { wch: 35 }, { wch: 55 }, { wch: 35 },
      { wch: 18 }, { wch: 20 }, { wch: 70 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    const sheetName = (entry.nickname || entry.fileName.replace(/\.pdf$/i, "")).slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName}_Extração.xlsx`);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-muted-foreground" />
          Últimas extrações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {history.map((entry) => (
          <div key={entry.id} className="space-y-0">
            <div
              className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors group"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />

              {editingId === entry.id ? (
                <div className="flex flex-1 items-center gap-1">
                  <Input
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    className="h-7 text-xs"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && saveNickname(entry.id)}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveNickname(entry.id)}>
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onLoad(entry.pieces, entry.nickname || entry.fileName, entry.id)}
                    className="flex-1 text-left text-sm font-medium truncate hover:underline cursor-pointer"
                  >
                    {entry.nickname || entry.fileName.replace(/\.pdf$/i, "")}
                  </button>
                  <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                    {entry.pieces.length} peças
                    {entry.errors && entry.errors.length > 0 && (
                      <span className="text-destructive ml-1">· {entry.errors.length} falha(s)</span>
                    )}
                    {" · "}
                    {format(new Date(entry.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </>
              )}

              {editingId !== entry.id && (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {entry.errors && entry.errors.length > 0 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleErrors(entry.id)} title="Ver relatório de erros">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadEntry(entry)} title="Baixar Excel">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => generateNatura(entry)}
                    disabled={generatingId === entry.id}
                    title="Gerar Planilha Padrão Natura"
                  >
                    {generatingId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startRename(entry)} title="Renomear">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(entry.id)} title="Remover">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              )}
            </div>

            {/* Error Report */}
            {entry.errors && entry.errors.length > 0 && expandedErrors.has(entry.id) && (
              <div className="ml-6 mt-1 mb-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Relatório de falhas ({entry.errors.length} parte{entry.errors.length > 1 ? "s" : ""})
                </div>
                {entry.errors.map((err, idx) => (
                  <div key={idx} className="border-t border-destructive/20 pt-1.5">
                    <div className="font-medium text-foreground">{err.partName}</div>
                    <div className="text-muted-foreground">Páginas: {err.pages}</div>
                    <div className="text-muted-foreground">Erro: {err.errorMessage}</div>
                    <div className="mt-1 text-foreground/80 italic">
                      💡 {getDiagnosis(err.errorMessage)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

function getDiagnosis(errorMsg: string): string {
  const msg = errorMsg.toLowerCase();
  if (msg.includes("429") || msg.includes("limite") || msg.includes("rate"))
    return "Limite de requisições excedido. Aguarde alguns minutos e tente novamente.";
  if (msg.includes("402") || msg.includes("crédito"))
    return "Créditos insuficientes. Adicione créditos ao workspace.";
  if (msg.includes("timeout") || msg.includes("tempo"))
    return "Processamento demorou demais. Tente um PDF com menos páginas ou imagens mais leves.";
  if (msg.includes("nenhuma peça"))
    return "A IA não encontrou peças nesta parte. Verifique se as páginas contêm peças gráficas visíveis.";
  return "Erro inesperado. Tente reenviar o PDF ou divida-o manualmente em partes menores.";
}

export default ExtractionHistory;
