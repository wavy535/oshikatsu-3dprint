"use client";

import { useActionState } from "react";
import { runMaintenanceAction } from "@/lib/ops/maintenance-actions";
import type { OpsActionState } from "@/lib/ops/action-state";

export function MaintenanceForm() {
  const [state, action, pending] = useActionState<OpsActionState>(
    runMaintenanceAction,
    { error: null },
  );
  return (
    <form action={action} className="space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "実行中…" : "通知送信と整理を実行"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : state.message ? (
        <p role="status" className="text-sm text-ok">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
