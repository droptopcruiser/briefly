"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
    >
      {pending ? "Processing intake…" : "Run intake"}
    </button>
  );
}

export function SubmissionForm({
  action,
  sample,
}: {
  action: (formData: FormData) => void | Promise<void>;
  sample: string;
}) {
  const [value, setValue] = useState("");

  return (
    <form action={action} className="space-y-3">
      <textarea
        name="submission"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={7}
        placeholder="Paste the client's raw enquiry here…"
        className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-accent"
      />
      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setValue(sample)}
          className="text-sm text-muted underline underline-offset-2 hover:text-foreground"
        >
          Use sample
        </button>
      </div>
    </form>
  );
}
