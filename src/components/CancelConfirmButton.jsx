import { useState } from "react";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

/* eslint-disable react/prop-types */
export default function CancelConfirmButton({
  onCancel,
  title = "Cancel this action?",
  message = "Any unsaved changes will be discarded.",
  confirmLabel = "Yes, Cancel",
  children = "Cancel",
  ...buttonProps
}) {
  const [confirming, setConfirming] = useState(false);
  return <>
    <button type="button" {...buttonProps} onClick={() => setConfirming(true)}>{children}</button>
    {confirming && <DeleteConfirmDialog
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      onCancel={() => setConfirming(false)}
      onConfirm={async () => { await onCancel(); }}
    />}
  </>;
}
