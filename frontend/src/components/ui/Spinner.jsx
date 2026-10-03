import React from "react";

const sizes = { sm: "ui-spinner--sm", md: "ui-spinner--md", lg: "ui-spinner--lg" };

export default function Spinner({ size = "md", label = "Đang tải", className = "", ...props }) {
  const sizeClass = sizes[size] || sizes.md;
  return (
    <span
      className={["ui-spinner", sizeClass, className].filter(Boolean).join(" ")}
      role="status"
      aria-label={label}
      {...props}
    >
      <span className="ui-spinner__ring" aria-hidden="true" />
      <span className="ui-spinner__sr-only">{label}</span>
    </span>
  );
}
