import React from "react";
import { X } from "lucide-react";

const variants = ["info", "success", "warning", "error"];

export default function Toast({
  variant = "info",
  title,
  children,
  onClose,
  className = "",
  ...toastProps
}) {
  const safeVariant = variants.includes(variant) ? variant : "info";
  const role = safeVariant === "warning" || safeVariant === "error" ? "alert" : "status";

  return (
    <div
      {...toastProps}
      className={["ui-toast", `ui-toast--${safeVariant}`, className]
        .filter(Boolean)
        .join(" ")}
      role={role}
    >
      <div className="ui-toast__content">
        {title && <div className="ui-toast__title">{title}</div>}
        {children && <div className="ui-toast__message">{children}</div>}
      </div>
      {onClose && (
        <button
          className="ui-toast__close"
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
