import Ajv, { JSONSchemaType } from "ajv";
import type { WorkflowDefinition } from "@integration/shared";

type WorkflowDefinitionInput = WorkflowDefinition;

const workflowSchema: JSONSchemaType<WorkflowDefinitionInput> = {
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
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          adapter: { type: "string", minLength: 1 },
          action: { type: "string", minLength: 1 },
          config: { type: "object", required: [], additionalProperties: true },
          onError: {
            type: "string",
            nullable: true,
            enum: ["stop", "continue", "retry", null],
          },
        },
        required: ["id", "adapter", "action", "config"],
        additionalProperties: false,
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
};

const ajv = new Ajv({
  allErrors: true,
});
const validateWorkflow = ajv.compile(workflowSchema);

export function validateWorkflowDefinition(input: unknown): {
  valid: boolean;
  errors: string[];
  value?: WorkflowDefinitionInput;
} {
  const valid = validateWorkflow(input);
  if (valid) {
    return {
      valid: true,
      errors: [],
      value: input as WorkflowDefinitionInput,
    };
  }

  return {
    valid: false,
    errors:
      validateWorkflow.errors?.map(
        (error) => `${error.instancePath || "/"} ${error.message || "invalid"}`,
      ) || ["Invalid workflow definition"],
  };
}

export { workflowSchema };

