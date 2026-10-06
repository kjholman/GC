/** Field-by-field differences between two versions of a record, for the change log. */
export type FieldChange = { field: string; from: string; to: string };

const show = (v: unknown): string => (v === null || v === undefined || v === "" ? "(empty)" : String(v));

export function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown>, labels: Record<string, string>): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [key, label] of Object.entries(labels)) {
    const a = before ? before[key] : undefined;
    const b = after[key];
    if (show(a) !== show(b)) out.push({ field: label, from: before ? show(a) : "(new)", to: show(b) });
  }
  return out;
}
