import React from "react";

export function ValidationErrorPanel({
  title,
  errors,
}: {
  title?: string;
  errors: string[];
}) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: "1px solid #f5c2c7",
        background: "#fff5f5",
        color: "#8a1c1c",
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
      }}
    >
      <strong>{title || "Validation errors"}</strong>
      <ul style={{ marginTop: 8 }}>
        {errors.map((error, index) => (
          <li key={`${error}-${index}`}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
