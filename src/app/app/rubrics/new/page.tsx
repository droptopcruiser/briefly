import Link from "next/link";
import { requireAccount } from "@/lib/metering";
import { RubricEditor } from "@/app/rubric-editor";
import type { Rubric } from "@/lib/types";

const BLANK: Rubric = {
  id: "",
  name: "",
  vertical: "",
  description: "",
  fields: [],
  documents: [],
};

export default async function NewRubricPage() {
  await requireAccount();
  return (
    <div className="space-y-6">
      <Link href="/app/rubrics" className="text-sm text-muted hover:text-foreground">
        ← Rubrics
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">New rubric</h1>
      <RubricEditor initial={BLANK} />
    </div>
  );
}
