import { useEffect, useRef, useState } from "react";

/* Consistent, accessible confirmation for destructive actions across the admin panel. */
/* eslint-disable react/prop-types */
export default function DeleteConfirmDialog({ title = "Delete item?", message = "This item will be permanently deleted.", confirmLabel = "Yes, Delete", busyLabel = "Deleting…", errorFallback = "The item could not be deleted.", onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  async function confirm() {
    setBusy(true); setError("");
    try { await onConfirm(); onCancel(); }
    catch (e) { setError(e.message || errorFallback); setBusy(false); }
  }

  return <div className="delete-confirm-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <section className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-message">
      <div className="delete-confirm-icon" aria-hidden="true">!</div>
      <h2 id="delete-confirm-title">{title}</h2>
      <p id="delete-confirm-message">{message}</p>
      {error && <p className="delete-confirm-error" role="alert">{error}</p>}
      <div className="delete-confirm-actions">
        <button ref={cancelRef} type="button" className="delete-confirm-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="delete-confirm-submit" disabled={busy} onClick={confirm}>{busy ? busyLabel : confirmLabel}</button>
      </div>
    </section>
  </div>;
}
