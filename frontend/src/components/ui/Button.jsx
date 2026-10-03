import React from "react";

const variants = ["primary", "secondary", "ghost", "danger"];
const sizes = ["sm", "md", "lg"];

export default function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled = false,
  className = "",
  ...buttonProps
}) {
  const safeVariant = variants.includes(variant) ? variant : "primary";
  const safeSize = sizes.includes(size) ? size : "md";
  const classes = [
    "ui-button",
    `ui-button--${safeVariant}`,
    `ui-button--${safeSize}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...buttonProps}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="ui-button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
