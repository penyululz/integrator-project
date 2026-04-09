import type { AdapterMetadata } from "../api";
import {
  isActionStep,
  isBranchStep,
  isDelayStep,
  type WorkflowDefinition,
  type WorkflowMappedValue,
  type WorkflowStep,
} from "../types/workflow";

export type BuilderSetupStageId = "overview" | "required" | "test" | "save";

export type BuilderRequiredField = {
  key: string;
  label: string;
  complete: boolean;
  helpText?: string;
};

export type BuilderNodeValidation = {
  valid: boolean;
  issues: string[];
  warnings: string[];
  requiredFields: BuilderRequiredField[];
};

export type BuilderNodeTestResult = {
  status: "passed" | "failed";
  message: string;
  warnings: string[];
  testedAt: string;
};

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMappedInput(
  input: Record<string, WorkflowMappedValue> | undefined,
  key: string,
): boolean {
  if (!input) {
    return false;
  }
  const value = input[key];
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}

function toReadinessWarning(
  adapter: AdapterMetadata | undefined,
): string | null {
  if (!adapter) {
    return null;
  }
  if (adapter.readinessTier === "advanced") {
    return `${adapter.displayName} is an advanced connector. Validate inputs carefully before saving.`;
  }
  if (adapter.readinessTier === "developer") {
    return `${adapter.displayName} is developer-oriented and may need manual platform setup.`;
  }
  if (adapter.readinessTier === "coming_soon") {
    return `${adapter.displayName} has limited readiness and may not support full production behavior yet.`;
  }
  return null;
}

function toTriggerRequiredFields(
  definition: WorkflowDefinition,
): BuilderRequiredField[] {
  return [
    {
      key: "trigger.adapter",
      label: "Trigger app",
      complete: hasNonEmptyString(definition.trigger.adapter),
      helpText: "Pick the app that starts this workflow.",
    },
    {
      key: "trigger.key",
      label: "Trigger event",
      complete: hasNonEmptyString(definition.trigger.trigger),
      helpText: "Choose the specific trigger event.",
    },
  ];
}

function toActionRequiredFields(step: WorkflowStep): BuilderRequiredField[] {
  if (!isActionStep(step)) {
    return [];
  }

  const fields: BuilderRequiredField[] = [
    {
      key: "step.id",
      label: "Step ID",
      complete: hasNonEmptyString(step.id),
    },
    {
      key: "step.adapter",
      label: "Action app",
      complete: hasNonEmptyString(step.adapter),
    },
    {
      key: "step.action",
      label: "Action",
      complete: hasNonEmptyString(step.action),
    },
  ];

  if (step.adapter === "http-api" && step.action === "httpRequest") {
    fields.push({
      key: "config.url",
      label: "Request URL",
      complete: hasNonEmptyString(step.config.url),
      helpText: "HTTP request needs a target URL.",
    });
  }

  if (
    (step.adapter === "slack" ||
      step.adapter === "telegram" ||
      step.adapter === "whatsapp") &&
    step.action === "sendMessage"
  ) {
    fields.push({
      key: "input.text",
      label: "Message text",
      complete:
        hasMappedInput(step.input, "text") || hasNonEmptyString(step.config.text),
      helpText: "Map or enter message text for messaging actions.",
    });
  }

  if (step.adapter === "email" && step.action === "sendEmail") {
    fields.push({
      key: "input.to",
      label: "Recipient",
      complete: hasMappedInput(step.input, "to") || hasNonEmptyString(step.config.to),
      helpText: "Email actions need at least one recipient.",
    });
  }

  if (step.adapter === "graphql" && step.action === "executeQuery") {
    fields.push({
      key: "config.query",
      label: "GraphQL query",
      complete:
        hasNonEmptyString(step.config.query) || hasMappedInput(step.input, "query"),
      helpText: "Add a GraphQL query string or map it from previous output.",
    });
  }

  if (step.adapter === "code" && step.action === "executeJavaScript") {
    fields.push({
      key: "config.script",
      label: "JavaScript script",
      complete: hasNonEmptyString(step.config.script),
      helpText: "Code steps need script content before testing.",
    });
  }

  if (step.adapter === "ai" && step.action === "runAgent") {
    fields.push({
      key: "config.goal",
      label: "Agent goal",
      complete: hasNonEmptyString(step.config.goal),
      helpText: "Agent node requires a clear goal statement.",
    });
  }

  if (step.adapter === "sheets" && step.action === "appendRow") {
    fields.push({
      key: "input.values",
      label: "Row values",
      complete:
        hasMappedInput(step.input, "values") ||
        hasMappedInput(step.input, "row") ||
        hasMappedInput(step.input, "rowValues"),
      helpText: "Sheets append needs mapped row values.",
    });
  }

  return fields;
}

export function getBuilderSetupStages(): Array<{
  id: BuilderSetupStageId;
  title: string;
}> {
  return [
    { id: "overview", title: "Overview" },
    { id: "required", title: "Required inputs" },
    { id: "test", title: "Test" },
    { id: "save", title: "Save" },
  ];
}

export function validateTriggerSetup(input: {
  definition: WorkflowDefinition;
  adapters: AdapterMetadata[];
}): BuilderNodeValidation {
  const fields = toTriggerRequiredFields(input.definition);
  const issues = fields.filter((field) => !field.complete).map((field) => `${field.label} is required.`);
  const warnings: string[] = [];
  const adapter = input.adapters.find(
    (candidate) => candidate.key === input.definition.trigger.adapter,
  );
  const readinessWarning = toReadinessWarning(adapter);
  if (readinessWarning) {
    warnings.push(readinessWarning);
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    requiredFields: fields,
  };
}

export function validateWorkflowStepSetup(input: {
  step: WorkflowStep;
  adapters: AdapterMetadata[];
}): BuilderNodeValidation {
  const issues: string[] = [];
  const warnings: string[] = [];
  let requiredFields: BuilderRequiredField[] = [];

  if (isActionStep(input.step)) {
    const actionStep = input.step;
    requiredFields = toActionRequiredFields(actionStep);
    const adapter = input.adapters.find((candidate) => candidate.key === actionStep.adapter);
    const readinessWarning = toReadinessWarning(adapter);
    if (readinessWarning) {
      warnings.push(readinessWarning);
    }
  } else if (isDelayStep(input.step)) {
    const delayValue = input.step.delayMs ?? input.step.delaySeconds ?? 0;
    requiredFields = [
      {
        key: "step.id",
        label: "Step ID",
        complete: hasNonEmptyString(input.step.id),
      },
      {
        key: "delay.value",
        label: "Delay duration",
        complete: delayValue > 0,
        helpText: "Delay must be greater than zero.",
      },
    ];
  } else if (isBranchStep(input.step)) {
    requiredFields = [
      {
        key: "step.id",
        label: "Step ID",
        complete: hasNonEmptyString(input.step.id),
      },
      {
        key: "condition",
        label: "Branch condition",
        complete: Boolean(input.step.condition),
        helpText: "Branch nodes should define condition rules.",
      },
    ];
    if (input.step.then.length === 0) {
      warnings.push("Branch then-path is empty. Add at least one next action.");
    }
  }

  for (const field of requiredFields) {
    if (!field.complete) {
      issues.push(`${field.label} is required.`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    requiredFields,
  };
}

export function runBuilderNodeSetupTest(input: {
  nodeLabel: string;
  validation: BuilderNodeValidation;
}): BuilderNodeTestResult {
  if (!input.validation.valid) {
    return {
      status: "failed",
      message: `Cannot test ${input.nodeLabel}. Complete required fields first.`,
      warnings: input.validation.issues,
      testedAt: new Date().toISOString(),
    };
  }

  return {
    status: "passed",
    message: `${input.nodeLabel} setup test passed.`,
    warnings: input.validation.warnings,
    testedAt: new Date().toISOString(),
  };
}
