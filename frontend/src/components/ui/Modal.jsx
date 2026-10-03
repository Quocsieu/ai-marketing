import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const variants = ["sm", "md", "lg"];
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled):not([type='hidden'])",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

export default function Modal({
  open = false,
  onClose,
  title,
  children,
  className = "",
  size = "md",
  footer,
  "aria-labelledby": ariaLabelledBy,
  ...dialogProps
}) {
  const generatedTitleId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const safeSize = variants.includes(size) ? size : "md";
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector(FOCUSABLE_SELECTOR);
    (focusable || dialog)?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const currentDialog = dialogRef.current;
      const items = Array.from(
        currentDialog?.querySelectorAll(FOCUSABLE_SELECTOR) || [],
      );
      if (!items.length) {
        event.preventDefault();
        currentDialog?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !currentDialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !currentDialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const titleId = title ? generatedTitleId : ariaLabelledBy;
  const classes = ["ui-modal__panel", `ui-modal__panel--${safeSize}`, className]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className="ui-modal__overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current?.();
      }}
    >
      <section
        {...dialogProps}
        ref={dialogRef}
        className={classes}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : ariaLabelledBy}
        tabIndex={-1}
      >
        <header className="ui-modal__header">
          {title && <h2 className="ui-modal__title" id={titleId}>{title}</h2>}
          <button
            className="ui-modal__close"
            type="button"
            onClick={() => onCloseRef.current?.()}
            aria-label="Đóng hộp thoại"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
