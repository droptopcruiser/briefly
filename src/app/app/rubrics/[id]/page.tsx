import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/metering";
import { getAccountRubric } from "@/lib/rubric-store";
import { RubricEditor } from "@/app/rubric-editor";

export default async function EditRubricPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account } = await requireManager();
  const rubric = await getAccountRubric(account.id, id);
  if (!rubric) notFound();

  return (
    <div className="space-y-6">
      <Link href="/app/rubrics" className="text-sm text-muted hover:text-foreground">
        ← Matter types
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit matter type</h1>
      <RubricEditor initial={rubric} />
    </div>
  );
}
