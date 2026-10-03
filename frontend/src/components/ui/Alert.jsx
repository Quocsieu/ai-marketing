import React from "react";

const variants = ["info", "success", "warning", "error"];

export default function Alert({
  children,
  title,
  icon,
  variant = "info",
  className = "",
  role,
  ...alertProps
}) {
  const safeVariant = variants.includes(variant) ? variant : "info";
  const semanticRole = role || (safeVariant === "error" ? "alert" : "status");

  return (
    <div
      {...alertProps}
      className={[
        "ui-alert",
        `ui-alert--${safeVariant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role={semanticRole}
    >
      {icon && <span className="ui-alert__icon" aria-hidden="true">{icon}</span>}
      <div className="ui-alert__content">
        {title && <div className="ui-alert__title">{title}</div>}
        {children && <div className="ui-alert__message">{children}</div>}
      </div>
    </div>
  );
}
