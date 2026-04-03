export function RunStatusBadge({ status }: { status: string }) {
  const tone =
    status === "success"
      ? "success"
      : status === "failed" || status === "dead_lettered" || status === "cancelled"
        ? "danger"
        : status === "retrying" || status === "waiting" || status === "awaiting_approval"
          ? "warning"
          : "info";

  const label = status.replace(/_/g, " ");

  return <span className={`status-pill ${tone}`}>{label}</span>;
}
