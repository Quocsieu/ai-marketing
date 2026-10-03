import React from "react";

const variants = ["neutral", "success", "warning", "error", "info", "primary"];

export default function Badge({
  children,
  variant = "neutral",
  className = "",
  ...badgeProps
}) {
  const safeVariant = variants.includes(variant) ? variant : "neutral";

  return (
    <span
      {...badgeProps}
      className={[
        "ui-badge",
        `ui-badge--${safeVariant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
