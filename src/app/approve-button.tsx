"use client";

import { useFormStatus } from "react-dom";

function Inner({ approved }: { approved: boolean }) {
  const { pending } = useFormStatus();
  if (approved) {
    return (
      <span className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent">
        ✓ Approved
      </span>
    );
  }
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
    >
      {pending ? "Approving…" : "Approve intake"}
    </button>
  );
}

export function ApproveButton({
  id,
  approved,
  action,
}: {
  id: string;
  approved: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Inner approved={approved} />
    </form>
  );
}
