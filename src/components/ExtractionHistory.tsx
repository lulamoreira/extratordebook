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
import { Download, Pencil, Check, X, Trash2, History, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  onLoad: (pieces: Piece[], fileName: string) => void;
  refreshKey: number;
}

const ExtractionHistory = ({ onLoad, refreshKey }: Props) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");

  useEffect(() => {
    setHistory(getHistory());
  }, [refreshKey]);

  if (history.length === 0) return null;

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
          <div
            key={entry.id}
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
                  onClick={() => onLoad(entry.pieces, entry.nickname || entry.fileName)}
                  className="flex-1 text-left text-sm font-medium truncate hover:underline cursor-pointer"
                >
                  {entry.nickname || entry.fileName.replace(/\.pdf$/i, "")}
                </button>
                <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                  {entry.pieces.length} peças · {format(new Date(entry.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                </span>
              </>
            )}

            {editingId !== entry.id && (
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadEntry(entry)} title="Baixar Excel">
                  <Download className="h-3.5 w-3.5" />
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
        ))}
      </CardContent>
    </Card>
  );
};

export default ExtractionHistory;
