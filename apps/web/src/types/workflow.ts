export type WorkflowMappedReference = {
  $ref: string;
  default?: unknown;
};

export type WorkflowMappedLiteral = {
  $literal: unknown;
};

export type WorkflowMappedValue =
  | WorkflowMappedReference
  | WorkflowMappedLiteral
  | string
  | number
  | boolean
  | null
  | WorkflowMappedValue[]
  | { [key: string]: WorkflowMappedValue };

export type WorkflowConditionOperator =
  | "equals"
  | "notEquals"
  | "exists"
  | "contains"
  | "greaterThan"
  | "lessThan";

export type WorkflowCondition = {
  left: WorkflowMappedValue;
  operator: WorkflowConditionOperator;
  right?: WorkflowMappedValue;
};

export type WorkflowConditionGroup = {
  mode?: "all" | "any";
  conditions: WorkflowCondition[];
};

export type WorkflowConditionBlock = WorkflowCondition | WorkflowConditionGroup;

export type WorkflowActionStep = {
  id: string;
  type?: "action";
  adapter: string;
  action: string;
  config: Record<string, unknown>;
  input?: Record<string, WorkflowMappedValue>;
  condition?: WorkflowConditionBlock;
  onError?: "stop" | "continue" | "retry";
  retryPolicy?: {
    enabled?: boolean;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    jitter?: boolean;
  };
};

export type WorkflowDelayStep = {
  id: string;
  type: "delay";
  delayMs?: number;
  delaySeconds?: number;
  condition?: WorkflowConditionBlock;
};

export type WorkflowBranchStep = {
  id: string;
  type: "branch";
  condition: WorkflowConditionBlock;
  then: WorkflowStep[];
  else?: WorkflowStep[];
};

export type WorkflowStep = WorkflowActionStep | WorkflowDelayStep | WorkflowBranchStep;

export type WorkflowDefinition = {
  id: string;
  name: string;
  workspaceId?: string;
  organizationId?: string;
  trigger: {
    adapter: string;
    trigger: string;
    config: Record<string, unknown>;
  };
  context?: Record<string, unknown>;
  steps: WorkflowStep[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
};

export const CONDITION_OPERATORS: WorkflowConditionOperator[] = [
  "equals",
  "notEquals",
  "exists",
  "contains",
  "greaterThan",
  "lessThan",
];

export function isActionStep(step: WorkflowStep): step is WorkflowActionStep {
  return step.type === "action" || step.type === undefined;
}

export function isDelayStep(step: WorkflowStep): step is WorkflowDelayStep {
  return step.type === "delay";
}

export function isBranchStep(step: WorkflowStep): step is WorkflowBranchStep {
  return step.type === "branch";
}

export function toConditionGroup(block?: WorkflowConditionBlock): WorkflowConditionGroup {
  if (!block) {
    return {
      mode: "all",
      conditions: [
        {
          left: {
            $ref: "trigger.payload",
          },
          operator: "exists",
        },
      ],
    };
  }

  if ("conditions" in block) {
    return {
      mode: block.mode || "all",
      conditions: block.conditions,
    };
  }

  return {
    mode: "all",
    conditions: [block],
  };
}

export function collectStepIds(steps: WorkflowStep[]): string[] {
  const ids: string[] = [];

  for (const step of steps) {
    ids.push(step.id);
    if (isBranchStep(step)) {
      ids.push(...collectStepIds(step.then));
      if (step.else) {
        ids.push(...collectStepIds(step.else));
      }
    }
  }

  return ids;
}

export function generateStepId(prefix: string, existingStepIds: string[]): string {
  const normalizedPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, "_");
  let counter = 1;
  let candidate = `${normalizedPrefix}_${counter}`;

  while (existingStepIds.includes(candidate)) {
    counter += 1;
    candidate = `${normalizedPrefix}_${counter}`;
  }

  return candidate;
}

export function createEmptyActionStep(stepId: string, adapterKey = "webhook"): WorkflowActionStep {
  return {
    id: stepId,
    type: "action",
    adapter: adapterKey,
    action: "",
    config: {},
    input: {},
    onError: "stop",
  };
}

export function createEmptyDelayStep(stepId: string): WorkflowDelayStep {
  return {
    id: stepId,
    type: "delay",
    delaySeconds: 5,
  };
}

export function createEmptyBranchStep(stepId: string): WorkflowBranchStep {
  return {
    id: stepId,
    type: "branch",
    condition: {
      left: {
        $ref: "trigger.payload",
      },
      operator: "exists",
    },
    then: [],
    else: [],
  };
}

export function cloneWorkflowDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(definition)) as WorkflowDefinition;
}
