import type { AppConnectionRecord } from "../api";

export type ConnectionTrustStateKey =
  | "connected"
  | "needs_attention"
  | "missing_platform_setup"
  | "limited_support";

export type ConnectionTrustState = {
  key: ConnectionTrustStateKey;
  label: string;
  tone: "success" | "warning" | "danger" | "info";
  summary: string;
};

export function getConnectionTrustState(app: AppConnectionRecord): ConnectionTrustState {
  if (app.status === "connected" || app.connected) {
    return {
      key: "connected",
      label: "Connected",
      tone: "success",
      summary: "This app is connected and ready for workflow execution.",
    };
  }

  if (app.status === "expired" || app.status === "invalid" || Boolean(app.connection.validationError)) {
    return {
      key: "needs_attention",
      label: "Needs attention",
      tone: "danger",
      summary:
        app.connection.validationError ||
        "Connection exists but requires re-authentication or credential fixes.",
    };
  }

  if ((app.platformSetupMissingFields || []).length > 0) {
    return {
      key: "missing_platform_setup",
      label: "Missing platform setup",
      tone: "warning",
      summary: "An operator must finish platform-level settings before this app can connect.",
    };
  }

  if (
    app.readinessTier === "advanced" ||
    app.readinessTier === "coming_soon" ||
    app.readinessTier === "developer"
  ) {
    return {
      key: "limited_support",
      label: "Limited support",
      tone: "info",
      summary: "This app requires advanced setup or has limited v1 coverage.",
    };
  }

  return {
    key: "needs_attention",
    label: "Needs attention",
    tone: "warning",
    summary: "Finish setup and run a connection test to confirm readiness.",
  };
}
