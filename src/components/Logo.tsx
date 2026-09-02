import { cn } from "@/lib/utils";

export interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

/**
 * Brand mark for "Extrator de Books".
 * The SVG symbol is fixed by design — do not swap it for a library icon.
 */
export const Logo = ({ size = 32, showWordmark = false, className }: LogoProps) => {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Extrator de Books"
        className="shrink-0"
      >
        <rect width="40" height="40" rx="11" fill="#EA1D2C" />
        <path
          d="M12.5 7.5h9.7L29 14.3V31a1.5 1.5 0 0 1-1.5 1.5H12.5A1.5 1.5 0 0 1 11 31V9a1.5 1.5 0 0 1 1.5-1.5z"
          fill="#FFFFFF"
        />
        <path d="M22.2 7.5 29 14.3h-5.3a1.5 1.5 0 0 1-1.5-1.5V7.5z" fill="#F7A6AC" />
        <rect x="14" y="18.5" width="12" height="9" rx="1.2" fill="#EA1D2C" />
        <path d="M14 23h12M20 18.5v9" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" />
      </svg>

      {showWordmark && (
        <span className="whitespace-nowrap text-lg leading-none">
          <span className="font-extrabold text-foreground">Extrator</span>
          <span className="font-medium text-muted-foreground"> de </span>
          <span className="font-extrabold text-primary">Books</span>
        </span>
      )}
    </span>
  );
};

export default Logo;
