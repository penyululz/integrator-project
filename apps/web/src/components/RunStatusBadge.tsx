export function RunStatusBadge({ status }: { status: string }) {
  const color =
    status === "success"
      ? "#0f7b0f"
      : status === "retrying"
        ? "#9a6b00"
        : status === "dead_lettered"
          ? "#8a1c1c"
          : status === "failed"
            ? "#b42318"
            : "#555";

  const background =
    status === "success"
      ? "#e8f8ea"
      : status === "retrying"
        ? "#fff6df"
        : status === "dead_lettered"
          ? "#fdecec"
          : status === "failed"
            ? "#ffeaea"
            : "#f1f1f1";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color,
        background,
      }}
    >
      {status}
    </span>
  );
}
