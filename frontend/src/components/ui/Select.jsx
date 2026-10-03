import React, { useId } from "react";

export default function Select({
  label,
  hint,
  error,
  required = false,
  disabled = false,
  options = [],
  id,
  className = "",
  "aria-describedby": ariaDescribedBy,
  ...selectProps
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
      <select
        {...selectProps}
        id={controlId}
        className={["ui-control", "ui-select", className].filter(Boolean).join(" ")}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      >
        {options.map((option) => (
          <option
            key={String(option.value)}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {hint && <span className="ui-field__hint" id={hintId}>{hint}</span>}
      {error && <span className="ui-field__error" id={errorId}>{error}</span>}
    </div>
  );
}
