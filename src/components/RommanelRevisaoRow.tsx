import { Eraser, Trash2, Copy, ArrowUp, ArrowDown, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CampoDecidivel, RommanelPiece } from "@/data/rommanelPieces";

export interface ColunasOpcionais {
  local: boolean;
  kit: boolean;
  cores: boolean;
  quant: boolean;
}

export interface RommanelRevisaoRowProps {
  piece: RommanelPiece;
  index: number;
  locais: string[];
  destacado: boolean;
  zebra: boolean;
  /** Nome do kit quando esta é a primeira linha do grupo; null nas demais. */
  kitRotulo: string | null;
  /** Linha de continuação do mesmo kit — recebe o filete de 1px à esquerda. */
  kitFilha: boolean;
  visivel: ColunasOpcionais;
  onPatch: (index: number, patch: Partial<RommanelPiece>) => void;
  onToggleBranco: (index: number, campo: CampoDecidivel) => void;
  onDuplicar: (index: number) => void;
  onExcluir: (index: number) => void;
  onMover: (index: number, direcao: -1 | 1) => void;
}

/** Botão de borracha: alterna entre "o sistema preenche" e "fica em branco". */
const BotaoBranco = ({
  ativo,
  rotulo,
  desabilitado,
  onClick,
}: {
  ativo: boolean;
  rotulo: string;
  desabilitado?: boolean;
  onClick: () => void;
}) => {
  const descricao = ativo
    ? `Voltar a preencher ${rotulo}`
    : `Deixar ${rotulo} em branco na planilha`;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-6 w-6 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        ativo && "bg-primary/10 text-primary"
      )}
      disabled={desabilitado}
      onClick={onClick}
      title={descricao}
      aria-label={descricao}
      aria-pressed={ativo}
    >
      <Eraser className="h-3 w-3" />
    </Button>
  );
};

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
  zebra,
  kitRotulo,
  kitFilha,
  visivel,
  onPatch,
  onToggleBranco,
  onDuplicar,
  onExcluir,
  onMover,
}: RommanelRevisaoRowProps) => {
  const branco = (campo: CampoDecidivel) => piece.camposEmBranco.includes(campo);
  const apagado = (campo: CampoDecidivel) =>
    branco(campo) ? "line-through opacity-50" : undefined;
  // Células congeladas precisam de fundo opaco para o conteúdo não passar por baixo.
  const fundoCongelado = zebra ? "bg-muted" : "bg-card";

  const alternarUnidade = () =>
    onPatch(index, {
      unidadeCompra: !piece.unidadeCompra,
      nomeColunaVarejo: !piece.unidadeCompra
        ? piece.nomeColunaVarejo || (piece.kit || piece.nomePeca).toUpperCase()
        : "",
    });

  return (
    <TableRow
      id={`rommanel-linha-${index}`}
      className={cn(
        zebra && "bg-muted/50",
        !piece.incluir &&
          "opacity-50 [&_input]:text-muted-foreground [&_textarea]:text-muted-foreground",
        destacado && "bg-primary/10"
      )}
    >
      {/* Incluir — congelada à esquerda */}
      <TableCell className={cn("sticky left-0 z-10 w-10 min-w-10 align-top", fundoCongelado)}>
        <Checkbox
          checked={piece.incluir}
          onCheckedChange={(v) => onPatch(index, { incluir: v === true })}
          aria-label="Incluir na planilha"
        />
      </TableCell>

      {/* Nome da peça — congelada, com selo embutido e âncora do kit */}
      <TableCell
        className={cn("sticky left-10 z-10 min-w-[220px] align-top", fundoCongelado)}
      >
        <div className={cn(kitFilha && "border-l border-primary/40 pl-2")}>
          {kitRotulo && (
            <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {kitRotulo}
            </p>
          )}
          <div className="flex items-start gap-1.5">
            <Input
              value={piece.nomePeca}
              onChange={(e) => onPatch(index, { nomePeca: e.target.value.toUpperCase() })}
              className="h-7 w-44 whitespace-pre-line text-xs"
            />
            <span
              className={cn(
                "mt-0.5 whitespace-nowrap rounded-full px-1.5 py-px text-[9px] font-bold uppercase",
                piece.origemAprendizado === "recorrente"
                  ? "bg-muted text-muted-foreground"
                  : "bg-warning/15 text-warning"
              )}
            >
              {piece.origemAprendizado === "recorrente" ? "Recorrente" : "Nova"}
            </span>
          </div>
        </div>
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
              className={cn("h-7 w-20 whitespace-pre-line text-xs tabular-nums", apagado("pagina"))}
            />
            {branco("pagina") && <RotuloBranco />}
          </div>
          <BotaoBranco
            ativo={branco("pagina")}
            rotulo="a Página"
            onClick={() => onToggleBranco(index, "pagina")}
          />
        </div>
      </TableCell>

      {/* Tamanho */}
      <TableCell className="align-top">
        <div className="flex items-start gap-1">
          <div>
            <Input
              value={piece.tamanho}
              onChange={(e) => onPatch(index, { tamanho: e.target.value })}
              className={cn("h-7 w-24 text-xs tabular-nums", apagado("tamanho"))}
            />
            {branco("tamanho") && <RotuloBranco />}
          </div>
          <BotaoBranco
            ativo={branco("tamanho")}
            rotulo="o Tamanho"
            onClick={() => onToggleBranco(index, "tamanho")}
          />
        </div>
      </TableCell>

      {/* Especificação — o campo mais editado, recebe a maior largura */}
      <TableCell className="align-top">
        <div className="flex items-start gap-1">
          <div>
            <textarea
              value={piece.especificacao}
              onChange={(e) => onPatch(index, { especificacao: e.target.value })}
              rows={2}
              className={cn(
                "w-96 min-w-[280px] rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                apagado("especificacao")
              )}
            />
            {branco("especificacao") && <RotuloBranco />}
          </div>
          <BotaoBranco
            ativo={branco("especificacao")}
            rotulo="a Especificação"
            onClick={() => onToggleBranco(index, "especificacao")}
          />
        </div>
      </TableCell>

      {/* Unidade de compra — ícone preenchido quando ligada, contorno quando não */}
      <TableCell className="align-top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            piece.unidadeCompra ? "text-primary" : "text-muted-foreground"
          )}
          onClick={alternarUnidade}
          aria-pressed={piece.unidadeCompra}
          aria-label={
            piece.unidadeCompra
              ? "Unidade de compra ligada"
              : "Marcar como unidade de compra"
          }
          title={
            piece.unidadeCompra
              ? "Unidade de compra ligada"
              : "Marcar como unidade de compra"
          }
        >
          <Bookmark
            className="h-4 w-4"
            fill={piece.unidadeCompra ? "currentColor" : "none"}
          />
        </Button>
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

      {/* Colunas opcionais */}
      {visivel.local && (
        <TableCell className="align-top">
          <Input
            list="rommanel-locais"
            value={piece.localInstalacao}
            onChange={(e) => onPatch(index, { localInstalacao: e.target.value.toUpperCase() })}
            className="h-7 w-36 text-xs font-semibold"
            placeholder={locais[0] ?? ""}
          />
        </TableCell>
      )}
      {visivel.kit && (
        <TableCell className="align-top">
          <Input
            value={piece.kit}
            onChange={(e) => onPatch(index, { kit: e.target.value.toUpperCase() })}
            className="h-7 w-32 text-xs"
          />
        </TableCell>
      )}
      {visivel.cores && (
        <TableCell className="align-top">
          <Input
            value={piece.cores}
            onChange={(e) => onPatch(index, { cores: e.target.value })}
            className="h-7 w-14 text-xs"
          />
        </TableCell>
      )}
      {visivel.quant && (
        <TableCell className="align-top">
          <div className="flex items-center gap-1">
            <BotaoBranco
              ativo={branco("quant")}
              rotulo="o Quant"
              desabilitado={!piece.unidadeCompra}
              onClick={() => onToggleBranco(index, "quant")}
            />
            <span className="text-[10px] text-muted-foreground">
              {!piece.unidadeCompra ? "—" : branco("quant") ? "em branco" : "com fórmula"}
            </span>
          </div>
        </TableCell>
      )}

      {/* Ações */}
      <TableCell className="align-top">
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMover(index, -1)}
            title="Mover para cima"
            aria-label="Mover linha para cima"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMover(index, 1)}
            title="Mover para baixo"
            aria-label="Mover linha para baixo"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDuplicar(index)}
            title="Duplicar linha"
            aria-label="Duplicar linha"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onExcluir(index)}
            title="Excluir linha"
            aria-label="Excluir linha"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default RommanelRevisaoRow;
