import { getAuthUser } from "@/lib/auth";
import { getCurrentAccount } from "@/lib/metering";
import { getDocument, downloadDocument } from "@/lib/documents";

/**
 * Serve a stored matter document for viewing — so the professional can click a
 * "📎 Contract.pdf" chip in the conversation and read the actual file on screen to
 * verify it themselves. Auth-gated and ownership-checked: only a signed-in member
 * of the document's own account can fetch it. Served inline so the browser renders
 * the PDF rather than downloading it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getAuthUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const account = await getCurrentAccount();
  if (!account) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return new Response("Not found", { status: 404 });
  if (doc.accountId !== account.id) return new Response("Forbidden", { status: 403 });

  const bytes = await downloadDocument(doc);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": doc.mime || "application/pdf",
      "content-disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "cache-control": "private, no-store",
    },
  });
}
