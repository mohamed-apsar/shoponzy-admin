import "./StatusToggle.css";

/* eslint-disable react/prop-types */
export default function StatusToggle({ checked, label, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className={`status-switch ${checked ? "is-on" : ""}`}
      onClick={onChange}
      disabled={disabled}
    >
      <span className="status-switch-track" aria-hidden="true"><span /></span>
    </button>
  );
}
