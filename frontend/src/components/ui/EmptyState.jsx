import React from "react";

export default function EmptyState({
  title = "Chưa có dữ liệu",
  description,
  action,
  icon,
  className = "",
  ...props
}) {
  return (
    <section className={["ui-empty-state", className].filter(Boolean).join(" ")} {...props}>
      {icon && <span className="ui-empty-state__icon" aria-hidden="true">{icon}</span>}
      <h2 className="ui-empty-state__title">{title}</h2>
      {description && <p className="ui-empty-state__description">{description}</p>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </section>
  );
}
