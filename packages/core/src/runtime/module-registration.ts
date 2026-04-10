import {
  CORE_MODULE_CATALOG,
  CORE_MODULE_KEYS,
  CORE_MODULE_LAYERS,
  type CoreModuleKey,
  type CoreModuleLayer,
  isCoreModuleKey,
} from "./module-catalog";

export type CoreModuleSelectionInput = {
  include?: CoreModuleKey[];
  exclude?: CoreModuleKey[];
};

export type LegacyFeatureFlags = {
  alerts?: boolean;
  retention?: boolean;
  identityAuth?: boolean;
  facilityBooking?: boolean;
  maintenanceSystem?: boolean;
  calendarAggregation?: boolean;
  communication?: boolean;
  fileStorage?: boolean;
  collaboration?: boolean;
};

export type CoreModuleRegistration = {
  enabled: CoreModuleKey[];
  disabled: CoreModuleKey[];
  byLayer: Record<CoreModuleLayer, CoreModuleKey[]>;
  flags: Record<CoreModuleKey, boolean>;
};

const MODULE_ALIAS_MAP: Record<string, CoreModuleKey> = {
  runtime: "runtime-foundation",
  foundation: "runtime-foundation",
  "runtime-foundation": "runtime-foundation",
  workflow: "workflow-orchestration",
  workflows: "workflow-orchestration",
  orchestration: "workflow-orchestration",
  "workflow-orchestration": "workflow-orchestration",
  identity: "identity-auth",
  auth: "identity-auth",
  "identity-auth": "identity-auth",
  alert: "alerts",
  alerts: "alerts",
  alerting: "alerts",
  retention: "retention",
  facility: "facility-booking",
  booking: "facility-booking",
  "facility-booking": "facility-booking",
  maintenance: "maintenance-system",
  "maintenance-system": "maintenance-system",
  calendar: "calendar-aggregation",
  "calendar-aggregation": "calendar-aggregation",
  communication: "communication",
  chat: "communication",
  file: "file-storage",
  files: "file-storage",
  storage: "file-storage",
  "file-storage": "file-storage",
  collaborate: "collaboration",
  collaboration: "collaboration",
};

function normalizeModuleToken(input: string): CoreModuleKey | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (isCoreModuleKey(normalized)) {
    return normalized;
  }
  return MODULE_ALIAS_MAP[normalized] || null;
}

function parseModuleCsv(input?: string): CoreModuleKey[] {
  if (!input || !input.trim()) {
    return [];
  }
  const values = input
    .split(",")
    .map((item) => normalizeModuleToken(item))
    .filter((item): item is CoreModuleKey => Boolean(item));
  return Array.from(new Set(values));
}

function mergeUnique(
  first: CoreModuleKey[],
  second: CoreModuleKey[],
): CoreModuleKey[] {
  return Array.from(new Set([...first, ...second]));
}

export function resolveCoreModuleRegistration(input: {
  selection?: CoreModuleSelectionInput;
  env?: Record<string, string | undefined>;
  legacyFeatureFlags?: LegacyFeatureFlags;
}): CoreModuleRegistration {
  const env = input.env || {};
  const requiredModules = CORE_MODULE_CATALOG.filter((item) => item.required).map(
    (item) => item.key,
  );

  const envInclude = parseModuleCsv(env.ENGINE_MODULES);
  const envExclude = parseModuleCsv(env.ENGINE_DISABLE_MODULES);

  const includeFromSelection = input.selection?.include || [];
  const excludeFromSelection = input.selection?.exclude || [];

  const requestedInclude = includeFromSelection.length
    ? includeFromSelection
    : envInclude.length
      ? envInclude
      : CORE_MODULE_KEYS.slice();
  const requestedExclude = mergeUnique(excludeFromSelection, envExclude);

  const effectiveExclude = new Set<CoreModuleKey>(requestedExclude);
  if (input.legacyFeatureFlags?.alerts === false) {
    effectiveExclude.add("alerts");
  }
  if (input.legacyFeatureFlags?.retention === false) {
    effectiveExclude.add("retention");
  }
  if (input.legacyFeatureFlags?.identityAuth === false) {
    effectiveExclude.add("identity-auth");
  }
  if (input.legacyFeatureFlags?.facilityBooking === false) {
    effectiveExclude.add("facility-booking");
  }
  if (input.legacyFeatureFlags?.maintenanceSystem === false) {
    effectiveExclude.add("maintenance-system");
  }
  if (input.legacyFeatureFlags?.calendarAggregation === false) {
    effectiveExclude.add("calendar-aggregation");
  }
  if (input.legacyFeatureFlags?.communication === false) {
    effectiveExclude.add("communication");
  }
  if (input.legacyFeatureFlags?.fileStorage === false) {
    effectiveExclude.add("file-storage");
  }
  if (input.legacyFeatureFlags?.collaboration === false) {
    effectiveExclude.add("collaboration");
  }
  for (const requiredModule of requiredModules) {
    effectiveExclude.delete(requiredModule);
  }

  const effectiveInclude = mergeUnique(requestedInclude, requiredModules);
  const enabled = effectiveInclude.filter((key) => !effectiveExclude.has(key));
  const enabledSet = new Set<CoreModuleKey>(enabled);

  const disabled = CORE_MODULE_KEYS.filter((key) => !enabledSet.has(key));
  const byLayer = CORE_MODULE_LAYERS.reduce<Record<CoreModuleLayer, CoreModuleKey[]>>(
    (acc, layer) => {
      acc[layer] = [];
      return acc;
    },
    {} as Record<CoreModuleLayer, CoreModuleKey[]>,
  );
  for (const module of CORE_MODULE_CATALOG) {
    if (enabledSet.has(module.key)) {
      byLayer[module.layer].push(module.key);
    }
  }

  const flags = CORE_MODULE_KEYS.reduce<Record<CoreModuleKey, boolean>>(
    (acc, key) => {
      acc[key] = enabledSet.has(key);
      return acc;
    },
    {} as Record<CoreModuleKey, boolean>,
  );

  return {
    enabled,
    disabled,
    byLayer,
    flags,
  };
}

export function isCoreModuleEnabled(
  registration: CoreModuleRegistration,
  key: CoreModuleKey,
): boolean {
  return registration.flags[key] === true;
}
