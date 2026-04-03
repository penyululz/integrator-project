export function RunStatusBadge({ status }: { status: string }) {
  const tone =
    status === "success"
      ? "success"
      : status === "failed" || status === "dead_lettered"
        ? "danger"
        : status === "retrying"
          ? "warning"
          : "info";

  const label = status.replace(/_/g, " ");

  return <span className={`status-pill ${tone}`}>{label}</span>;
}
