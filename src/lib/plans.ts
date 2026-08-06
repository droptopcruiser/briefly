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
  trial: { id: "trial", name: "Trial", monthlyMatters: 25, priceLabel: "14 days free" },
  solo: { id: "solo", name: "Solo", monthlyMatters: 60, priceLabel: "$59/mo" },
  practice: { id: "practice", name: "Practice", monthlyMatters: 250, priceLabel: "$149/mo" },
  firm: { id: "firm", name: "Firm", monthlyMatters: 1000, priceLabel: "$349/mo" },
} satisfies Record<string, Plan>;

/** Credit pack sold for overage beyond the monthly cap. */
export const CREDIT_PACK = { credits: 50, priceLabel: "$20" };

export function planFor(id: string): Plan {
  return (PLANS as Record<string, Plan>)[id] ?? PLANS.trial;
}
