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
    <div className="callout danger">
      <strong>{title || "Validation errors"}</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {errors.map((error, index) => (
          <li key={`${error}-${index}`}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
