import React, { useId } from "react";

export default function Input({
  label,
  hint,
  error,
  required = false,
  disabled = false,
  id,
  className = "",
  "aria-describedby": ariaDescribedBy,
  ...inputProps
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-field">
      {label && (
        <label className="ui-field__label" htmlFor={controlId}>
          {label}
          {required && <span className="ui-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      <input
        {...inputProps}
        id={controlId}
        className={["ui-control", "ui-input", className].filter(Boolean).join(" ")}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint && <span className="ui-field__hint" id={hintId}>{hint}</span>}
      {error && <span className="ui-field__error" id={errorId}>{error}</span>}
    </div>
  );
}
