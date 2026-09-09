import { Eraser, Trash2, Copy, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CampoDecidivel, RommanelPiece } from "@/data/rommanelPieces";

export interface RommanelRevisaoRowProps {
  piece: RommanelPiece;
  index: number;
  locais: string[];
  destacado: boolean;
  onPatch: (index: number, patch: Partial<RommanelPiece>) => void;
  onToggleBranco: (index: number, campo: CampoDecidivel) => void;
  onDuplicar: (index: number) => void;
  onExcluir: (index: number) => void;
  onMover: (index: number, direcao: -1 | 1) => void;
}

/** Botão de borracha: alterna entre "o sistema preenche" e "fica em branco". */
const BotaoBranco = ({
  ativo,
  desabilitado,
  onClick,
}: {
  ativo: boolean;
  desabilitado?: boolean;
  onClick: () => void;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className={cn("h-6 w-6 shrink-0", ativo && "bg-primary/10 text-primary")}
    disabled={desabilitado}
    onClick={onClick}
    title={ativo ? "Voltar a preencher este campo" : "Deixar este campo em branco na planilha"}
    aria-pressed={ativo}
  >
    <Eraser className="h-3 w-3" />
  </Button>
);

const RotuloBranco = () => (
  <span className="ml-1 whitespace-nowrap text-[10px] font-semibold uppercase text-muted-foreground">
    em branco
  </span>
);

export const RommanelRevisaoRow = ({
  piece,
  index,
  locais,
  destacado,
  onPatch,
  onToggleBranco,
  onDuplicar,
  onExcluir,
  onMover,
}: RommanelRevisaoRowProps) => {
  const branco = (campo: CampoDecidivel) => piece.camposEmBranco.includes(campo);
  const filha = !piece.unidadeCompra && piece.kit.trim().length > 0;
  const apagado = (campo: CampoDecidivel) =>
    branco(campo) ? "line-through opacity-50" : undefined;

  const alternarUnidade = (v: boolean) =>
    onPatch(index, {
      unidadeCompra: v,
      nomeColunaVarejo: v
        ? piece.nomeColunaVarejo || (piece.kit || piece.nomePeca).toUpperCase()
        : "",
    });

  return (
    <TableRow
      id={`rommanel-linha-${index}`}
      className={cn(
        !piece.incluir && "opacity-50",
        destacado && "bg-primary/10 ring-2 ring-inset ring-primary"
      )}
    >
      <TableCell className="align-top">
        <Checkbox
          checked={piece.incluir}
          onCheckedChange={(v) => onPatch(index, { incluir: v === true })}
          aria-label="Incluir na planilha"
        />
      </TableCell>

      <TableCell className="align-top">
        <span
          className={cn(
            "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
            piece.origemAprendizado === "recorrente"
              ? "bg-muted text-muted-foreground"
              : "bg-warning/15 text-warning"
          )}
        >
          {piece.origemAprendizado === "recorrente" ? "Recorrente" : "Nova"}
        </span>
      </TableCell>

      {/* Página */}
      <TableCell className="align-top">
        <div className="flex items-start gap-1">
          <div className="min-w-0">
            <Input
              value={piece.paginas || String(piece.pagina || "")}
              onChange={(e) => {
                const v = e.target.value;
                const primeira = Number(v.split("\n")[0].replace(/[^\d]/g, ""));
                onPatch(index, {
                  paginas: v,
                  pagina: Number.isFinite(primeira) ? primeira : 0,
                });
              }}
              className={cn("h-7 w-20 whitespace-pre-line text-xs", apagado("pagina"))}
            />
            {branco("pagina") && <RotuloBranco />}
          </div>
          <BotaoBranco ativo={branco("pagina")} onClick={() => onToggleBranco(index, "pagina")} />
        </div>
      </TableCell>

      {/* Local de instalação */}
      <TableCell className="align-top">
        <Input
          list="rommanel-locais"
          value={piece.localInstalacao}
          onChange={(e) => onPatch(index, { localInstalacao: e.target.value.toUpperCase() })}
          className="h-7 w-36 text-xs font-semibold"
          placeholder={locais[0] ?? ""}
        />
      </TableCell>

      {/* Kit */}
      <TableCell className="align-top">
        <Input
          value={piece.kit}
          onChange={(e) => onPatch(index, { kit: e.target.value.toUpperCase() })}
          className="h-7 w-32 text-xs"
        />
      </TableCell>

      {/* Nome da peça */}
      <TableCell className={cn("align-top", filha && "pl-6")}>
        <Input
          value={piece.nomePeca}
          onChange={(e) => onPatch(index, { nomePeca: e.target.value.toUpperCase() })}
          className="h-7 w-44 whitespace-pre-line text-xs"
        />
      </TableCell>

      {/* Tamanho */}
      <TableCell className="align-top">
        <div className="flex items-start gap-1">
          <div>
            <Input
              value={piece.tamanho}
              onChange={(e) => onPatch(index, { tamanho: e.target.value })}
              className={cn("h-7 w-24 text-xs", apagado("tamanho"))}
            />
            {branco("tamanho") && <RotuloBranco />}
          </div>
          <BotaoBranco ativo={branco("tamanho")} onClick={() => onToggleBranco(index, "tamanho")} />
        </div>
      </TableCell>

      {/* Especificação */}
      <TableCell className="align-top">
        <div className="flex items-start gap-1">
          <div>
            <textarea
              value={piece.especificacao}
              onChange={(e) => onPatch(index, { especificacao: e.target.value })}
              rows={2}
              className={cn(
                "w-72 rounded-md border border-input bg-background px-2 py-1 text-xs",
                apagado("especificacao")
              )}
            />
            {branco("especificacao") && <RotuloBranco />}
          </div>
          <BotaoBranco
            ativo={branco("especificacao")}
            onClick={() => onToggleBranco(index, "especificacao")}
          />
        </div>
      </TableCell>

      {/* Cores */}
      <TableCell className="align-top">
        <Input
          value={piece.cores}
          onChange={(e) => onPatch(index, { cores: e.target.value })}
          className="h-7 w-14 text-xs"
        />
      </TableCell>

      {/* Quant (fórmula) */}
      <TableCell className="align-top">
        <div className="flex items-center gap-1">
          <BotaoBranco
            ativo={branco("quant")}
            desabilitado={!piece.unidadeCompra}
            onClick={() => onToggleBranco(index, "quant")}
          />
          <span className="text-[10px] text-muted-foreground">
            {!piece.unidadeCompra ? "—" : branco("quant") ? "em branco" : "com fórmula"}
          </span>
        </div>
      </TableCell>

      {/* Unidade de compra */}
      <TableCell className="align-top">
        <Switch
          checked={piece.unidadeCompra}
          onCheckedChange={alternarUnidade}
          aria-label="Unidade de compra"
        />
      </TableCell>

      {/* Nome da coluna VAREJO */}
      <TableCell className="align-top">
        <Input
          value={piece.nomeColunaVarejo}
          disabled={!piece.unidadeCompra}
          onChange={(e) => onPatch(index, { nomeColunaVarejo: e.target.value.toUpperCase() })}
          className="h-7 w-40 text-xs font-semibold"
        />
      </TableCell>

      <TableCell className="align-top">
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMover(index, -1)} title="Mover para cima">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMover(index, 1)} title="Mover para baixo">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicar(index)} title="Duplicar linha">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onExcluir(index)} title="Excluir linha">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default RommanelRevisaoRow;
