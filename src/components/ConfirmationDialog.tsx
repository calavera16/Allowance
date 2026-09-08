import { useState } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";

export function ConfirmationDialog({ title, message, confirmLabel, onCancel, onConfirm, error }: {
  title: string; message: string; confirmLabel: string; onCancel: () => void; onConfirm: () => Promise<void>; error?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const ref = useDialogFocus(() => { if (!busy) onCancel(); });
  return <div className="modal-backdrop"><section className="confirmation-dialog" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message">
    <h2 id="confirmation-title">{title}</h2><p id="confirmation-message">{message}</p>
    {error && <p role="alert">{error}</p>}
    <div className="button-row"><button type="button" className="button button--secondary" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="button button--primary" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{busy ? "Restoring..." : confirmLabel}</button></div>
  </section></div>;
}
