import fs from "node:fs";
import path from "node:path";
import { cx } from "./ui";

/** The AI analyst's name in the interface. Never used in founder correspondence or memos. */
export const ANALYST_NAME = "The Sharminator";

/** First of these found in public/brand is used as the photo. */
const PHOTOS = ["sharminator.jpg", "sharminator.jpeg", "sharminator.png", "sharminator.webp", "Sharminator.jpg", "Sharminator.jpeg", "Sharminator.png", "Sharminator.webp"];
const findPhoto = (): string | null => {
  try {
    const name = PHOTOS.find((p) => fs.existsSync(path.join(process.cwd(), "public", "brand", p)));
    return name ? `/brand/${name}` : null;
  } catch {
    return null;
  }
};

/** Hexagon avatar for the AI analyst: public/brand/sharminator.(jpg|png|webp) if present, else a branded "S". */
export function AnalystAvatar({ size = 40, className }: { size?: number; className?: string }) {
  const photo = findPhoto();
  return (
    <div className={cx("hex shrink-0 overflow-hidden", className)} style={{ width: size, height: size }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={ANALYST_NAME} width={size} height={size} className="h-full w-full object-cover object-[50%_25%]" />
      ) : (
        <div className="bg-brand-gradient flex h-full w-full items-center justify-center font-display font-semibold text-white" style={{ fontSize: size * 0.42 }}>
          S
        </div>
      )}
    </div>
  );
}

/** Avatar + name, for headers like "The Sharminator · version 2". */
export function AnalystBadge({ size = 28, suffix }: { size?: number; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <AnalystAvatar size={size} />
      <span className="font-medium text-ink">
        {ANALYST_NAME}
        {suffix && <span className="font-normal text-muted"> · {suffix}</span>}
      </span>
    </span>
  );
}
