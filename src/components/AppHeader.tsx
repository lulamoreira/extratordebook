import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

export interface AppHeaderProps {
  /** Resets the screen back to the initial upload + history view. */
  onGoHome?: () => void;
  /** Disables the action while an extraction is running. */
  busy?: boolean;
  className?: string;
}

export const AppHeader = ({ onGoHome, busy = false, className }: AppHeaderProps) => {
  const tooltip = busy ? "Aguarde a extração terminar" : "Voltar ao início";

  const handleClick = () => {
    if (busy) return;
    onGoHome?.();
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-16 w-full bg-card shadow-soft",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          title={tooltip}
          aria-label={tooltip}
          className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Logo size={34} showWordmark />
        </button>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleClick}
          disabled={busy}
          title={tooltip}
          className="gap-2"
        >
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Início</span>
        </Button>
      </div>
    </header>
  );
};

export default AppHeader;
