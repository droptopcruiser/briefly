/**
 * The Decision-now surface — a restrained translucent FOCUS LENS, not a flat card.
 * Over the warm-paper workspace there's nothing for a backdrop blur to refract, so
 * the glass is BUILT: a deep forest tint with a soft internal bloom (brighter top-
 * left, deeper lower edge), a fine bright inner edge, a green-tinted ambient shadow,
 * and a diagonal sheen. The decision itself is set in the editorial serif. It reads
 * as the one decision Briefly has lifted forward — a surface that floats, next to
 * the paper message sheet and the floating Evidence Drawer.
 */
export function DecisionPane({
  children,
  footer,
  label = "Decision now",
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  label?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-4 text-accent-fg"
      style={{
        background:
          "radial-gradient(135% 120% at 20% -10%, color-mix(in srgb, var(--accent-h) 82%, white) 0%, var(--accent) 46%, color-mix(in srgb, var(--accent) 80%, black) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.16)",
        boxShadow:
          "0 24px 50px -22px rgba(29, 38, 33, 0.5), 0 8px 24px -10px color-mix(in srgb, var(--accent) 45%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.32), inset 0 -20px 38px -22px rgba(0, 0, 0, 0.35)",
      }}
    >
      {/* Diagonal sheen — the glass catch. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(152deg, rgba(255,255,255,0.20), rgba(255,255,255,0) 46%)" }}
      />
      <div className="relative text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-fg/70">
        {label}
      </div>
      <p className="relative mt-1.5 font-serif text-lg leading-snug">{children}</p>
      {footer ? <div className="relative mt-2.5">{footer}</div> : null}
    </div>
  );
}
