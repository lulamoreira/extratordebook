import { Fragment, type ReactNode } from "react";
import { Loader2, MoreVertical, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ClienteMark from "@/components/ClienteMark";
import type { ClienteId } from "@/lib/clientes";

export interface AcaoBarra {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  icon?: LucideIcon;
}

export interface ItemMenuBarra extends AcaoBarra {
  separadorAntes?: boolean;
}

export interface ResultadosActionBarProps {
  cliente: ClienteId;
  clienteNome: string;
  titulo: string;
  resumo: ReactNode;
  extra?: ReactNode;
  primaria: AcaoBarra;
  secundaria: AcaoBarra;
  menu: ItemMenuBarra[];
}

/** Barra fixa da tela de resultados: identificação + ação primária, secundária e menu recolhido. */
export const ResultadosActionBar = ({
  cliente,
  clienteNome,
  titulo,
  resumo,
  extra,
  primaria,
  secundaria,
  menu,
}: ResultadosActionBarProps) => {
  const SecIcon = secundaria.icon;
  return (
    <div className="sticky top-0 z-20 -mx-1 mb-4 flex flex-col gap-3 border-b border-border bg-background px-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <ClienteMark cliente={cliente} size={18} />
          <span className="truncate" title={titulo}>{titulo}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {resumo} · {clienteNome}
        </p>
        {extra}
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
        <Button
          size="sm"
          className="flex-1 gap-2 sm:flex-none"
          onClick={primaria.onClick}
          disabled={primaria.disabled}
          title={primaria.title}
        >
          {primaria.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClienteMark cliente={cliente} size={18} />}
          {primaria.label}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={secundaria.onClick}
          disabled={secundaria.disabled}
          title={secundaria.title}
        >
          {secundaria.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : SecIcon && <SecIcon className="h-4 w-4" />}
          {secundaria.label}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2" aria-label="Mais ações">
              <MoreVertical className="h-4 w-4" />
              <span className="hidden sm:inline">Mais ações</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((item) => {
              const Icon = item.icon;
              return (
                <Fragment key={item.label}>
                  {item.separadorAntes && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    disabled={item.disabled}
                    title={item.title}
                    onSelect={item.onClick}
                    className="gap-2"
                  >
                    {Icon && <Icon className="h-4 w-4" />}
                    {item.label}
                  </DropdownMenuItem>
                </Fragment>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default ResultadosActionBar;
