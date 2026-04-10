export const CORE_MODULE_LAYERS = [
  "engine-core",
  "integration-layer",
  "project-adapter",
  "optional-module",
] as const;

export type CoreModuleLayer = (typeof CORE_MODULE_LAYERS)[number];

export type CoreModuleKey =
  | "runtime-foundation"
  | "workflow-orchestration"
  | "identity-auth"
  | "alerts"
  | "retention"
  | "facility-booking"
  | "maintenance-system"
  | "calendar-aggregation"
  | "communication"
  | "file-storage"
  | "collaboration";

export type CoreModuleDescriptor = {
  key: CoreModuleKey;
  layer: CoreModuleLayer;
  required: boolean;
  summary: string;
};

export const CORE_MODULE_CATALOG: ReadonlyArray<CoreModuleDescriptor> = [
  {
    key: "runtime-foundation",
    layer: "engine-core",
    required: true,
    summary: "Database, Redis, queue bootstrap, observability, and plugin loading.",
  },
  {
    key: "workflow-orchestration",
    layer: "engine-core",
    required: true,
    summary: "Workflow execution, retries, waits, dead-letter handling, and queue processing.",
  },
  {
    key: "identity-auth",
    layer: "optional-module",
    required: false,
    summary: "Identity lifecycle, session controls, OTP, verification, resets, invites, and mail logs.",
  },
  {
    key: "alerts",
    layer: "optional-module",
    required: false,
    summary: "Alert routing, trigger evaluation, and delivery orchestration.",
  },
  {
    key: "retention",
    layer: "optional-module",
    required: false,
    summary: "Data retention policies and cleanup cycles.",
  },
  {
    key: "facility-booking",
    layer: "optional-module",
    required: false,
    summary:
      "Facility entities, booking lifecycle, availability/conflict engine, approval-ready flow, and calendar/audit integration.",
  },
  {
    key: "maintenance-system",
    layer: "optional-module",
    required: false,
    summary:
      "Maintenance ticket lifecycle, assignment routing (user/team/department/vendor), scoped visibility, comments, and audit-ready transitions.",
  },
  {
    key: "calendar-aggregation",
    layer: "optional-module",
    required: false,
    summary:
      "Central event layer that aggregates facility bookings, maintenance schedules, org/team events, and workflow events with permission-aware visibility.",
  },
  {
    key: "communication",
    layer: "optional-module",
    required: false,
    summary:
      "Realtime-ready communication engine for channels, direct/team messaging, mentions, meeting/session logs, and AI summary hooks.",
  },
  {
    key: "file-storage",
    layer: "optional-module",
    required: false,
    summary:
      "Nextcloud-style file storage engine with org/team/personal spaces, nested folders/files, sharing permissions, metadata/object-storage separation, and activity tracking.",
  },
  {
    key: "collaboration",
    layer: "optional-module",
    required: false,
    summary: "Workspace collaboration surfaces (docs, files).",
  },
];

export const CORE_MODULE_KEYS = CORE_MODULE_CATALOG.map((item) => item.key);

export function isCoreModuleKey(input: string): input is CoreModuleKey {
  return CORE_MODULE_KEYS.includes(input as CoreModuleKey);
}
