import React from "react";

const variants = ["default", "outlined"];
const paddings = ["none", "sm", "md", "lg"];

export default function Card({
  children,
  variant = "default",
  padding = "md",
  className = "",
  ...cardProps
}) {
  const safeVariant = variants.includes(variant) ? variant : "default";
  const safePadding = paddings.includes(padding) ? padding : "md";

  return (
    <div
      {...cardProps}
      className={[
        "ui-card",
        `ui-card--${safeVariant}`,
        `ui-card--padding-${safePadding}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
