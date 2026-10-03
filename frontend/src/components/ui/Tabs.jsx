import React, { useRef } from "react";

export default function Tabs({
  items = [],
  value,
  onChange,
  className = "",
  ...tabListProps
}) {
  const tabRefs = useRef([]);
  const enabledItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && !item.disabled);
  const selectedItem =
    items.find((item) => item && item.value === value && !item.disabled) ||
    enabledItems[0]?.item;
  const selectedValue = selectedItem?.value;

  function handleKeyDown(event, currentIndex) {
    let targetIndex;
    const enabledIndexes = enabledItems.map(({ index }) => index);
    const position = enabledIndexes.indexOf(currentIndex);

    if (event.key === "Home") targetIndex = enabledIndexes[0];
    else if (event.key === "End") targetIndex = enabledIndexes.at(-1);
    else if (event.key === "ArrowRight") {
      targetIndex = enabledIndexes[(position + 1) % enabledIndexes.length];
    } else if (event.key === "ArrowLeft") {
      targetIndex = enabledIndexes[(position - 1 + enabledIndexes.length) % enabledIndexes.length];
    } else return;

    event.preventDefault();
    if (targetIndex === undefined) return;
    const nextItem = items[targetIndex];
    tabRefs.current[targetIndex]?.focus();
    onChange?.(nextItem.value);
  }

  return (
    <div
      {...tabListProps}
      className={["ui-tabs", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-orientation="horizontal"
    >
      {items.map((item, index) => {
        const selected = item?.value === selectedValue;
        const disabled = Boolean(item?.disabled);
        return (
          <button
            key={item?.value ?? index}
            ref={(node) => { tabRefs.current[index] = node; }}
            className="ui-tabs__tab"
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={disabled || undefined}
            tabIndex={selected && !disabled ? 0 : -1}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item?.label}
          </button>
        );
      })}
    </div>
  );
}
