import "./StatusToggle.css";

/* eslint-disable react/prop-types */
export default function StatusToggle({ checked, label, onChange, disabled = false, statusText }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className={`status-switch ${checked ? "is-on" : ""} ${statusText ? "has-status-text" : ""}`}
      onClick={onChange}
      disabled={disabled}
    >
      <span className="status-switch-track" aria-hidden="true"><span /></span>
      {statusText && <span className="status-switch-text">{statusText}</span>}
    </button>
  );
}
