import type { AppConnectionRecord, AppSetupGuide, AppSetupField, WorkflowTemplateSummary } from "../api";
import { getSuggestedTemplatesForApp } from "./integrations-catalog-helpers";

export type SetupGuideView = {
  purpose: string;
  beforeYouStart: string[];
  steps: string[];
  requiredFields: AppSetupField[];
  troubleshooting: string[];
  testChecklist: string[];
  nextTemplateIds: string[];
};

function buildFallbackGuide(app: AppConnectionRecord): AppSetupGuide {
  return {
    purpose: app.description || `Connect ${app.name} and use it in automations.`,
    beforeYouStart: app.setupNotes.length > 0 ? app.setupNotes : ["Gather credentials before setup."],
    steps: [
      "Review prerequisites and required fields.",
      "Save the connection in this workspace.",
      "Run a connection test before enabling production workflows.",
    ],
    requiredFieldKeys: app.setupFields.filter((field) => field.required).map((field) => field.key),
    troubleshooting: [
      "If setup fails, verify credentials and provider permissions.",
      "If test fails, inspect run logs for validation details.",
    ],
    testChecklist: ["Run Test connection and verify status changes to Connected."],
    nextTemplateIds: [],
  };
}

function normalizeGuide(app: AppConnectionRecord): AppSetupGuide {
  const fallback = buildFallbackGuide(app);
  const guide = app.setupGuide;
  if (!guide) {
    return fallback;
  }

  return {
    purpose: guide.purpose || fallback.purpose,
    beforeYouStart: guide.beforeYouStart?.length ? guide.beforeYouStart : fallback.beforeYouStart,
    steps: guide.steps?.length ? guide.steps : fallback.steps,
    requiredFieldKeys:
      guide.requiredFieldKeys?.length > 0
        ? guide.requiredFieldKeys
        : fallback.requiredFieldKeys,
    troubleshooting:
      guide.troubleshooting?.length > 0 ? guide.troubleshooting : fallback.troubleshooting,
    testChecklist: guide.testChecklist?.length > 0 ? guide.testChecklist : fallback.testChecklist,
    nextTemplateIds: guide.nextTemplateIds || [],
  };
}

function resolveRequiredFields(app: AppConnectionRecord, requiredFieldKeys: string[]): AppSetupField[] {
  if (requiredFieldKeys.length === 0) {
    return app.setupFields.filter((field) => field.required);
  }

  const byKey = new Map(app.setupFields.map((field) => [field.key, field]));
  const resolvedFromGuide = requiredFieldKeys
    .map((fieldKey) => byKey.get(fieldKey))
    .filter((field): field is AppSetupField => Boolean(field));

  if (resolvedFromGuide.length > 0) {
    return resolvedFromGuide;
  }

  return app.setupFields.filter((field) => field.required);
}

export function getAppSetupGuideView(app: AppConnectionRecord): SetupGuideView {
  const normalized = normalizeGuide(app);

  return {
    purpose: normalized.purpose,
    beforeYouStart: normalized.beforeYouStart,
    steps: normalized.steps,
    requiredFields: resolveRequiredFields(app, normalized.requiredFieldKeys),
    troubleshooting: normalized.troubleshooting,
    testChecklist: normalized.testChecklist,
    nextTemplateIds: normalized.nextTemplateIds,
  };
}

export function getGuideSuggestedTemplates(
  app: AppConnectionRecord,
  templates: WorkflowTemplateSummary[],
  limit = 3,
): WorkflowTemplateSummary[] {
  const guide = getAppSetupGuideView(app);
  const byId = new Map(templates.map((template) => [template.id, template]));
  const prioritized = guide.nextTemplateIds
    .map((templateId) => byId.get(templateId))
    .filter((template): template is WorkflowTemplateSummary => Boolean(template));

  const fallback = getSuggestedTemplatesForApp(app.key, templates, limit);
  const merged = [...prioritized, ...fallback];
  const seen = new Set<string>();
  const deduped: WorkflowTemplateSummary[] = [];

  for (const template of merged) {
    if (seen.has(template.id)) {
      continue;
    }
    seen.add(template.id);
    deduped.push(template);
    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

export function getRecommendedTemplatePath(
  app: AppConnectionRecord,
  templates: WorkflowTemplateSummary[],
): string | null {
  const nextTemplate = getGuideSuggestedTemplates(app, templates, 1)[0];
  if (!nextTemplate) {
    return null;
  }

  return `/workflows?templateId=${encodeURIComponent(nextTemplate.id)}`;
}
