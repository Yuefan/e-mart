import Link from "next/link";
import { RANGE_PRESETS, type RangePreset } from "@/lib/range";
import { cn } from "@/lib/utils";

/** Preset windows as links, so the range lives in the URL and is shareable. */
export function RangeTabs({
  basePath,
  active,
}: {
  basePath: string;
  active: RangePreset | "custom";
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel p-0.5">
      {(Object.keys(RANGE_PRESETS) as RangePreset[]).map((key) => (
        <Link
          key={key}
          href={`${basePath}?range=${key}`}
          aria-current={active === key ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            active === key ? "bg-panel-alt text-fg" : "text-muted hover:text-fg",
          )}
        >
          {RANGE_PRESETS[key].label}
        </Link>
      ))}
    </div>
  );
}
