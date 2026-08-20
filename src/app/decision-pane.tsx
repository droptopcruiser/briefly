/**
 * The decision surface — a LIGHT, softly-tinted translucent focus lens, not a
 * saturated block. Its urgency comes from placement, the editorial serif, and a
 * narrow forest accent edge — never from a giant dark fill. A soft lift shadow and a
 * bright inner top edge make it float above the warm paper. One clear action on top;
 * the consequence, quietly, beneath.
 */
export function DecisionPane({
  children,
  consequence,
  footer,
  label = "Decision now",
}: {
  children: React.ReactNode;
  consequence?: string | null;
  footer?: React.ReactNode;
  label?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl rounded-l-md px-5 py-4"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 82%, var(--surface)) 0%, var(--surface) 100%)",
        borderLeft: "3px solid var(--accent)",
        boxShadow:
          "0 18px 40px -22px rgba(29, 38, 33, 0.32), 0 2px 6px -3px rgba(29, 38, 33, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{label}</div>
      <p className="mt-1.5 font-serif text-lg leading-snug text-foreground">{children}</p>
      {consequence ? <p className="mt-1 text-sm text-muted">{consequence}</p> : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}
