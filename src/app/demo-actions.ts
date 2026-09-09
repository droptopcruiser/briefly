"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requireAccount } from "@/lib/metering";
import { saveMatter } from "@/lib/store";
import { uploadDocument } from "@/lib/documents";
import { savePack } from "@/lib/disclosure-service";
import { parseIndexText } from "@/lib/disclosure";
import { addEvent } from "@/lib/events";
import { CRIMINAL_RUBRIC_ID } from "@/lib/criminal";
import { DEMO_MINUTE_PDF_B64 } from "@/lib/demo-minute";
import type { Matter, PipelineResult, ExtractedField } from "@/lib/types";

/**
 * Seed a clearly-labelled SYNTHETIC Criminal Chambers demo matter for a live test —
 * charge + SOF, two disclosure packs, an attached minute PDF, and a correspondence
 * scenario. No client material; every name is a placeholder. Lets Victoria run the
 * full workflow path on the deploy without touching real disclosure.
 */

const F = (key: string, label: string, value: string | null, source: string | null): ExtractedField => ({
  key, label, value, present: value != null, source,
});

const PACK1 = `DISCLOSURE INDEX - 15 April 2026
1. Charging document - full
2. Summary of Facts - full
3. Statement of Witness A - full
4. CCTV footage of the assault - withheld
9. Preliminary job sheet - listed`;

const PACK2 = `DISCLOSURE INDEX - 5 May 2026
1. Charging document - full
2. Summary of Facts - full
3. Statement of Witness A - full
4. CCTV footage of the assault - part-disclosed
5. Officer notebook (extract, pp 3-5)
6. Statement of Witness B - full
7. Medical report - part-disclosed`;

export async function createCriminalDemoMatter(): Promise<void> {
  await requireUser();
  const account = await requireAccount();
  const now = new Date().toISOString();
  const matterId = randomUUID();

  const result: PipelineResult = {
    rubricId: CRIMINAL_RUBRIC_ID,
    rubricName: "Criminal matter",
    vertical: "Criminal",
    classificationConfidence: 1,
    clientName: "R v Tane [DEMO]",
    clientEmail: null,
    summary: "Synthetic demo — assault charge in the District Court, with disclosure to compare and a fixture to prepare.",
    fields: [
      F("defendant", "Defendant", "R. Tane [synthetic]", "New charge for R. Tane"),
      F("charge", "Charge(s)", "Assault (male assaults female)", "assault (male assaults female)"),
      F("court", "Court", "Auckland District Court", "at the Auckland District Court"),
      F("prn", "PRN", "00000000 [synthetic]", "PRN 00000000"),
      F("act", "Act & section", null, null),
      F("offenceDatePlace", "Date & place of offence", null, null),
      F("elements", "Elements of the charge", null, null),
      F("firstAppearance", "First appearance", null, null),
      F("disclosureStatus", "Initial disclosure status", "Initial disclosure received; further to follow", "awaiting further disclosure from the OC"),
    ],
    timeline: [],
    documentsPresent: ["charging_document", "sof"],
    gaps: [],
    readiness: 60,
    draftEmail: null,
    costCents: 0,
    mocked: true,
  };

  const matter: Matter = {
    id: matterId,
    createdAt: now,
    accountId: account.id,
    clientName: "R v Tane [DEMO]",
    clientEmail: null,
    submission:
      "[SYNTHETIC DEMO — no real matter or person]\n\nNew charge for R. Tane: assault (male assaults female), Auckland District Court. " +
      "Charge sheet and summary of facts attached. First appearance done. Awaiting further disclosure from the officer in charge (Const. Smith). " +
      "A signed notebook is still outstanding.",
    result,
    status: "ready_for_you",
    approvedAt: null,
    assignedTo: null,
    updatedAt: now,
    lastNudgedAt: null,
    nudgeCount: 0,
    consultationAt: null,
  };
  await saveMatter(matter);

  // Two disclosure packs (so the diff is ready), tagged with a synthetic Police source.
  const p1 = parseIndexText(PACK1, 1, "2026-04-15");
  p1.deliverySource = "Police OneDrive link (synthetic)";
  const p2 = parseIndexText(PACK2, 2, "2026-05-05");
  p2.deliverySource = "Police OneDrive link (synthetic)";
  await savePack(matter, p1);
  await savePack(matter, p2);

  // Attach the synthetic minute PDF for the attached-minute Hearing Prep.
  const bytes = Buffer.from(DEMO_MINUTE_PDF_B64, "base64");
  await uploadDocument(account.id, matterId, "Minute 05.05.2026 [DEMO].pdf", "application/pdf", bytes);

  await addEvent(account.id, matterId, "created", "Synthetic Criminal Chambers demo matter created (charge, SOF, 2 packs, minute PDF)");

  redirect(`/matters/${matterId}`);
}
