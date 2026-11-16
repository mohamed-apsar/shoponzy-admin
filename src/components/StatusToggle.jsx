import { useState } from "react";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import "./StatusToggle.css";

/* eslint-disable react/prop-types */
export default function StatusToggle({ checked, label, onChange, disabled = false, statusText }) {
  const [confirming, setConfirming] = useState(false);
  const action = label?.match(/^(disable|enable|unpublish|publish)\b/i)?.[0] || (checked ? "Disable" : "Enable");
  const subject = label?.replace(/^(disable|enable|unpublish|publish)\s*/i, "") || "this item";
  const pastAction = { disable: "disabled", enable: "enabled", unpublish: "unpublished", publish: "published" }[action.toLowerCase()];
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        title={label}
        className={`status-switch ${checked ? "is-on" : ""} ${statusText ? "has-status-text" : ""}`}
        onClick={() => setConfirming(true)}
        disabled={disabled}
      >
        <span className="status-switch-track" aria-hidden="true"><span /></span>
        {statusText && <span className="status-switch-text">{statusText}</span>}
      </button>
      {confirming && <DeleteConfirmDialog
        title={`${action.charAt(0).toUpperCase() + action.slice(1)} ${subject}?`}
        message={`${subject} will be ${pastAction}.`}
        confirmLabel={`Yes, ${action}`}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => { await onChange(); }}
      />}
    </>
  );
}
