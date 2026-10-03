import React from "react";

export default function Table({
  columns = [],
  data = [],
  className = "",
  emptyMessage = "Không có dữ liệu.",
  ...tableProps
}) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeData = Array.isArray(data) ? data : [];

  return (
    <div className={["ui-table-wrapper", className].filter(Boolean).join(" ")}>
      <table {...tableProps} className="ui-table">
        <thead>
          <tr>
            {safeColumns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeData.length === 0 ? (
            <tr>
              <td className="ui-table__empty" colSpan={Math.max(safeColumns.length, 1)}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            safeData.map((row, rowIndex) => (
              <tr key={row?.id ?? rowIndex}>
                {safeColumns.map((column) => {
                  const cellValue = row?.[column.key];
                  return (
                    <td key={column.key}>
                      {typeof column.render === "function"
                        ? column.render(cellValue, row)
                        : cellValue}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
