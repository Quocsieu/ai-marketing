import React from "react";

export default function Skeleton({ width, height, className = "", style, ...props }) {
  return (
    <span
      className={["ui-skeleton", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      style={{ width, height, ...style }}
      {...props}
    />
  );
}
