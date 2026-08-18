"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/app/pending-button";

/**
 * New-matter intake. Running it fires the full pipeline (classify → extract →
 * gaps → draft, ~10-20s) then redirects to the matter. That's long enough to feel
 * frozen, so while it runs we show a spinner + staged messages that reflect the
 * real pipeline order — the wait reads as a process, not a hang.
 */

const STAGES = [
  "Reading the enquiry",
  "Extracting the facts",
  "Checking against your rulebook",
  "Preparing the next step",
];

function Body({
  value,
  setValue,
  sample,
}: {
  value: string;
  setValue: (v: string) => void;
  sample: string;
}) {
  const { pending } = useFormStatus();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!pending) {
      setStage(0);
      return;
    }
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    return () => clearInterval(id);
  }, [pending]);

  return (
    <>
      <textarea
        name="submission"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={7}
        disabled={pending}
        placeholder="Paste the client's raw enquiry here…"
        className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-accent disabled:opacity-60"
      />

      {pending ? (
        <div className="flex items-center gap-3 rounded-lg border border-accent bg-surface px-4 py-3">
          <Spinner className="text-accent" />
          <div>
            <div className="text-sm font-medium text-accent">{STAGES[stage]}…</div>
            <div className="text-xs text-muted">
              Briefly is preparing the matter — this takes a few seconds.
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-70"
        >
          {pending ? (
            <>
              <Spinner /> Preparing…
            </>
          ) : (
            "Run intake"
          )}
        </button>
        {!pending ? (
          <button
            type="button"
            onClick={() => setValue(sample)}
            className="text-sm text-muted underline underline-offset-2 hover:text-foreground"
          >
            Use sample
          </button>
        ) : null}
      </div>
    </>
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
      <Body value={value} setValue={setValue} sample={sample} />
    </form>
  );
}
