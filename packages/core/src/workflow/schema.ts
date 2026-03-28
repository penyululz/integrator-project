import Ajv from "ajv";
import type {
  WorkflowActionStep,
  WorkflowBranchStep,
  WorkflowCondition,
  WorkflowConditionBlock,
  WorkflowConditionGroup,
  WorkflowDefinition,
  WorkflowMappedValue,
  WorkflowStep,
} from "@integration/shared";

type WorkflowDefinitionInput = WorkflowDefinition;

type StepKind = "action" | "delay" | "branch";

const referenceSyntaxPattern =
  "^(trigger|context|steps\\.[A-Za-z0-9_-]+\\.output)(\\.[A-Za-z0-9_-]+)*$";

const workflowSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string", minLength: 1 },
    workspaceId: { type: "string", minLength: 1 },
    organizationId: { type: "string", minLength: 1 },
    trigger: {
      type: "object",
      properties: {
        adapter: { type: "string", minLength: 1 },
        trigger: { type: "string", minLength: 1 },
        config: { type: "object", required: [], additionalProperties: true },
      },
      required: ["adapter", "trigger", "config"],
      additionalProperties: false,
    },
    context: {
      type: "object",
      nullable: true,
      required: [],
      additionalProperties: true,
    },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        $ref: "#/$defs/step",
      },
    },
    enabled: { type: "boolean" },
    metadata: {
      type: "object",
      nullable: true,
      required: [],
      additionalProperties: true,
    },
  },
  required: [
    "id",
    "name",
    "workspaceId",
    "organizationId",
    "trigger",
    "steps",
    "enabled",
  ],
  additionalProperties: false,
  $defs: {
    mappedValue: {
      anyOf: [
        {
          type: "object",
          properties: {
            $ref: {
              type: "string",
              pattern: referenceSyntaxPattern,
            },
            default: {},
          },
          required: ["$ref"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            $literal: {},
          },
          required: ["$literal"],
          additionalProperties: false,
        },
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
        {
          type: "array",
          items: {
            $ref: "#/$defs/mappedValue",
          },
        },
        {
          type: "object",
          required: [],
          additionalProperties: {
            $ref: "#/$defs/mappedValue",
          },
        },
      ],
    },
    condition: {
      type: "object",
      properties: {
        left: { $ref: "#/$defs/mappedValue" },
        operator: {
          type: "string",
          enum: [
            "equals",
            "notEquals",
            "exists",
            "contains",
            "greaterThan",
            "lessThan",
          ],
        },
        right: { $ref: "#/$defs/mappedValue" },
      },
      required: ["left", "operator"],
      additionalProperties: false,
    },
    conditionGroup: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          nullable: true,
          enum: ["all", "any", null],
        },
        conditions: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/condition",
          },
        },
      },
      required: ["conditions"],
      additionalProperties: false,
    },
    conditionBlock: {
      anyOf: [{ $ref: "#/$defs/condition" }, { $ref: "#/$defs/conditionGroup" }],
    },
    retryPolicy: {
      type: "object",
      nullable: true,
      properties: {
        enabled: { type: "boolean", nullable: true },
        maxAttempts: { type: "integer", nullable: true, minimum: 1, maximum: 20 },
        baseDelayMs: { type: "integer", nullable: true, minimum: 0, maximum: 3600000 },
        maxDelayMs: { type: "integer", nullable: true, minimum: 0, maximum: 86400000 },
        backoffMultiplier: { type: "number", nullable: true, minimum: 1, maximum: 10 },
        jitter: { type: "boolean", nullable: true },
      },
      required: [],
      additionalProperties: false,
    },
    actionStep: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        type: {
          type: "string",
          nullable: true,
          enum: ["action", null],
        },
        adapter: { type: "string", minLength: 1 },
        action: { type: "string", minLength: 1 },
        config: { type: "object", required: [], additionalProperties: true },
        input: {
          type: "object",
          nullable: true,
          required: [],
          additionalProperties: {
            $ref: "#/$defs/mappedValue",
          },
        },
        condition: {
          $ref: "#/$defs/conditionBlock",
        },
        onError: {
          type: "string",
          nullable: true,
          enum: ["stop", "continue", "retry", null],
        },
        retryPolicy: { $ref: "#/$defs/retryPolicy" },
      },
      required: ["id", "adapter", "action", "config"],
      additionalProperties: false,
    },
    delayStep: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        type: {
          type: "string",
          const: "delay",
        },
        delayMs: {
          type: "integer",
          nullable: true,
          minimum: 0,
          maximum: 86400000,
        },
        delaySeconds: {
          type: "integer",
          nullable: true,
          minimum: 0,
          maximum: 86400,
        },
        condition: {
          $ref: "#/$defs/conditionBlock",
        },
      },
      required: ["id", "type"],
      additionalProperties: false,
      anyOf: [{ required: ["delayMs"] }, { required: ["delaySeconds"] }],
    },
    branchStep: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        type: {
          type: "string",
          const: "branch",
        },
        condition: {
          $ref: "#/$defs/conditionBlock",
        },
        then: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/step",
          },
        },
        else: {
          type: "array",
          nullable: true,
          items: {
            $ref: "#/$defs/step",
          },
        },
      },
      required: ["id", "type", "condition", "then"],
      additionalProperties: false,
    },
    step: {
      anyOf: [
        {
          $ref: "#/$defs/actionStep",
        },
        {
          $ref: "#/$defs/delayStep",
        },
        {
          $ref: "#/$defs/branchStep",
        },
      ],
    },
  },
};

const ajv = new Ajv({
  allErrors: true,
});
const validateWorkflow = ajv.compile(workflowSchema);

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isConditionGroup(input: WorkflowConditionBlock): input is WorkflowConditionGroup {
  return isObject(input) && Array.isArray((input as WorkflowConditionGroup).conditions);
}

function isBranchStep(step: WorkflowStep): step is WorkflowBranchStep {
  return step.type === "branch";
}

function isActionStep(step: WorkflowStep): step is WorkflowActionStep {
  return step.type === "action" || step.type === undefined;
}

function isMappedReference(
  value: WorkflowMappedValue,
): value is Extract<WorkflowMappedValue, { $ref: string }> {
  return isObject(value) && typeof (value as { $ref?: unknown }).$ref === "string";
}

function detectStepKind(step: WorkflowStep): StepKind {
  if (step.type === "branch") {
    return "branch";
  }
  if (step.type === "delay") {
    return "delay";
  }
  return "action";
}

function collectReferenceValues(value: WorkflowMappedValue, refs: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferenceValues(item, refs);
    }
    return;
  }

  if (!isObject(value)) {
    return;
  }

  if (isMappedReference(value)) {
    refs.push(value.$ref);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(value, "$literal")) {
    return;
  }

  for (const child of Object.values(value)) {
    collectReferenceValues(child as WorkflowMappedValue, refs);
  }
}

function extractStepRefId(reference: string): string | null {
  const match = reference.match(/^steps\.([A-Za-z0-9_-]+)\.output(?:\.|$)/);
  return match ? match[1] : null;
}

function validateConditionBlock(
  block: WorkflowConditionBlock,
  path: string,
  outputCapableStepIds: Set<string>,
  errors: string[],
): void {
  const conditions = isConditionGroup(block)
    ? block.conditions
    : ([block] satisfies WorkflowCondition[]);

  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index];
    const conditionPath = `${path}/conditions/${index}`;

    if (condition.operator === "exists") {
      if (condition.right !== undefined) {
        errors.push(
          `${conditionPath} operator "exists" does not accept a right operand.`,
        );
      }
    } else if (condition.right === undefined) {
      errors.push(
        `${conditionPath} operator "${condition.operator}" requires a right operand.`,
      );
    }

    const references: string[] = [];
    collectReferenceValues(condition.left, references);
    if (condition.right !== undefined) {
      collectReferenceValues(condition.right, references);
    }

    for (const reference of references) {
      if (!new RegExp(referenceSyntaxPattern).test(reference)) {
        errors.push(`${conditionPath} has invalid reference syntax "${reference}".`);
        continue;
      }

      const stepRefId = extractStepRefId(reference);
      if (stepRefId && !outputCapableStepIds.has(stepRefId)) {
        errors.push(
          `${conditionPath} references step "${stepRefId}" before it is available in this execution path.`,
        );
      }
    }
  }
}

function validateStepSequence(
  steps: WorkflowStep[],
  basePath: string,
  outputCapableStepIds: Set<string>,
  errors: string[],
): void {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const stepPath = `${basePath}/${index}`;

    if (step.condition) {
      validateConditionBlock(step.condition, `${stepPath}/condition`, outputCapableStepIds, errors);
    }

    if (isActionStep(step) && step.input) {
      const references: string[] = [];
      collectReferenceValues(step.input as WorkflowMappedValue, references);
      for (const reference of references) {
        if (!new RegExp(referenceSyntaxPattern).test(reference)) {
          errors.push(`${stepPath}/input has invalid reference syntax "${reference}".`);
          continue;
        }

        const stepRefId = extractStepRefId(reference);
        if (stepRefId && !outputCapableStepIds.has(stepRefId)) {
          errors.push(
            `${stepPath}/input references step "${stepRefId}" before it is available in this execution path.`,
          );
        }
      }
    }

    if (isBranchStep(step)) {
      const thenAvailable = new Set(outputCapableStepIds);
      validateStepSequence(step.then, `${stepPath}/then`, thenAvailable, errors);

      if (step.else) {
        const elseAvailable = new Set(outputCapableStepIds);
        validateStepSequence(step.else, `${stepPath}/else`, elseAvailable, errors);
      }
    }

    const kind = detectStepKind(step);
    if (kind === "action" || kind === "delay") {
      outputCapableStepIds.add(step.id);
    }
  }
}

function collectStepKinds(
  steps: WorkflowStep[],
  stepKinds: Map<string, StepKind>,
  errors: string[],
  basePath = "/steps",
): void {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const stepPath = `${basePath}/${index}`;

    if (stepKinds.has(step.id)) {
      errors.push(`${stepPath} duplicate step id "${step.id}".`);
      continue;
    }

    stepKinds.set(step.id, detectStepKind(step));

    if (isBranchStep(step)) {
      collectStepKinds(step.then, stepKinds, errors, `${stepPath}/then`);
      if (step.else) {
        collectStepKinds(step.else, stepKinds, errors, `${stepPath}/else`);
      }
    }
  }
}

function validateWorkflowDsl(input: WorkflowDefinitionInput): string[] {
  const errors: string[] = [];
  const stepKinds = new Map<string, StepKind>();

  collectStepKinds(input.steps, stepKinds, errors);
  if (errors.length > 0) {
    return errors;
  }

  validateStepSequence(input.steps, "/steps", new Set<string>(), errors);

  for (const [stepId, kind] of stepKinds.entries()) {
    if (kind === "branch") {
      continue;
    }

    if (stepId.startsWith("steps")) {
      errors.push(`step id "${stepId}" is reserved and cannot start with "steps".`);
    }
  }

  return errors;
}

export function validateWorkflowDefinition(input: unknown): {
  valid: boolean;
  errors: string[];
  value?: WorkflowDefinitionInput;
} {
  const valid = validateWorkflow(input);
  if (!valid) {
    return {
      valid: false,
      errors:
        validateWorkflow.errors?.map(
          (error) => `${error.instancePath || "/"} ${error.message || "invalid"}`,
        ) || ["Invalid workflow definition"],
    };
  }

  const value = input as WorkflowDefinitionInput;
  const dslErrors = validateWorkflowDsl(value);
  if (dslErrors.length > 0) {
    return {
      valid: false,
      errors: dslErrors,
    };
  }

  return {
    valid: true,
    errors: [],
    value,
  };
}

export { workflowSchema };
