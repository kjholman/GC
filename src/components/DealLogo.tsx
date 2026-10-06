import { cx } from "./ui";

/** Company logo (fetched from its website) or, until one is found, its initials on the brand gradient. */
export function DealLogo({ dealId, name, hasLogo, onDark, version, size = 48, className }: {
  dealId: string; name: string; hasLogo: boolean; onDark?: boolean | null; version?: string | number; size?: number; className?: string;
}) {
  const initials = name.replace(/^Untitled:\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <div
      // A white logo (made for a dark website header) sits on navy so it stays visible.
      className={cx("flex shrink-0 items-center justify-center overflow-hidden rounded-xl border", hasLogo && onDark ? "border-navy-900 bg-navy-900" : "border-line bg-paper", className)}
      style={{ width: size, height: size }}
    >
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/deals/${dealId}/logo${version ? `?v=${version}` : ""}`} alt={`${name} logo`} className="h-full w-full object-contain p-1.5" />
      ) : (
        <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-semibold text-white" style={{ fontSize: size * 0.36 }}>
          {initials}
        </div>
      )}
    </div>
  );
}
