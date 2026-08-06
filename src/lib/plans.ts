/**
 * Billing plans. Every tier has a hard monthly extraction cap — no unlimited
 * tier (PRD §8). Overage is covered by purchased credit packs. Prices are
 * illustrative placeholders; the real products/prices live in the Merchant of
 * Record (Lemon Squeezy) and its webhooks set an account's `plan`/`credits`.
 */
export interface Plan {
  id: string;
  name: string;
  /** Included extractions per calendar month. */
  monthlyMatters: number;
  priceLabel: string;
}

export const PLANS = {
  trial: { id: "trial", name: "Free trial", monthlyMatters: 25, priceLabel: "Free" },
  solo: { id: "solo", name: "Solo", monthlyMatters: 150, priceLabel: "$29/mo" },
  practice: { id: "practice", name: "Practice", monthlyMatters: 600, priceLabel: "$79/mo" },
  firm: { id: "firm", name: "Firm", monthlyMatters: 2000, priceLabel: "$199/mo" },
} satisfies Record<string, Plan>;

export function planFor(id: string): Plan {
  return (PLANS as Record<string, Plan>)[id] ?? PLANS.trial;
}
