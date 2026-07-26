import { cn } from "@/lib/utils";

/**
 * The ROARLAND mark plus wordmark.
 *
 * The SVG paints with currentColor so the glyph follows the surrounding text
 * colour in both themes, while the red bar inside it stays fixed — that bar is
 * the one part of the mark that is brand-constant.
 */
export function Brand({
  size = "md",
  showWordmark = true,
  className,
}: {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}) {
  const mark = { sm: 18, md: 22, lg: 34 }[size];
  const text = { sm: "text-sm", md: "text-base", lg: "text-2xl" }[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 640 960"
        width={(mark * 640) / 960}
        height={mark}
        aria-hidden
        className="shrink-0"
      >
        <g fill="currentColor">
          <path d="M0 0 H480 L640 160 V320 H400 V160 H240 V320 H0 Z" />
          <path d="M0 600 H240 V960 H0 Z" />
          <path d="M400 600 H480 L640 760 V960 H400 Z" />
        </g>
        <rect x="0" y="440" width="640" height="80" fill="#e2211c" />
      </svg>

      {showWordmark ? (
        <span className={cn("font-semibold tracking-tight", text)}>
          ROARLAND
        </span>
      ) : null}
    </span>
  );
}
