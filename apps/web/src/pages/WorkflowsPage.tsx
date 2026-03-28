import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createWorkflow,
  getAuthSession,
  listAdapters,
  listWorkflows,
  type AdapterMetadata,
  type WorkflowRecord,
  validateWorkflow,
} from "../api";
import { StepCardEditor } from "../components/StepCardEditor";
import { ValidationErrorPanel } from "../components/ValidationErrorPanel";
import {
  buildDefaultWorkflow,
  buildReferenceHints,
  parseJsonObject,
} from "./workflow-builder-helpers";
import {
  collectStepIds,
  createEmptyActionStep,
  createEmptyBranchStep,
  createEmptyDelayStep,
  generateStepId,
  type WorkflowDefinition,
  type WorkflowStep,
} from "../types/workflow";

export function WorkflowsPage() {
  const session = getAuthSession();
  const [adapters, setAdapters] = useState<AdapterMetadata[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [name, setName] = useState("New Workflow");
  const [definition, setDefinition] = useState<WorkflowDefinition>(() =>
    buildDefaultWorkflow([], {
      workspaceId: session?.scope.workspaceId || "",
      organizationId: session?.scope.organizationId || "",
    }),
  );
  const [editorMode, setEditorMode] = useState<"form" | "json">("form");
  const [jsonDraft, setJsonDraft] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [triggerConfigDraft, setTriggerConfigDraft] = useState("{}");
  const [contextDraft, setContextDraft] = useState("{}");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ adapters: adapterMetadata }, workflowRecords] = await Promise.all([
        listAdapters(),
        listWorkflows(),
      ]);

      setAdapters(adapterMetadata);
      setWorkflows(workflowRecords);

      if (adapterMetadata.length > 0 && definition.trigger.adapter === "webhook" && definition.steps.length === 1 && definition.steps[0].id === "step_action_1") {
        const nextDefault = buildDefaultWorkflow(adapterMetadata, {
          workspaceId: session?.scope.workspaceId || "",
          organizationId: session?.scope.organizationId || "",
        });
        setDefinition(nextDefault);
        setTriggerConfigDraft(JSON.stringify(nextDefault.trigger.config || {}, null, 2));
        setContextDraft(JSON.stringify(nextDefault.context || {}, null, 2));
        setJsonDraft(JSON.stringify(nextDefault, null, 2));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (editorMode === "form") {
      setJsonDraft(JSON.stringify(definition, null, 2));
    }
  }, [definition, editorMode]);

  const referenceHints = useMemo(() => buildReferenceHints(definition), [definition]);

  function updateDefinition(nextDefinition: WorkflowDefinition) {
    setDefinition(nextDefinition);
    setValidationErrors([]);
    setServerError(null);
  }

  function createStep(type: "action" | "branch" | "delay"): WorkflowStep {
    const nextId = generateStepId(type === "action" ? "step_action" : type, collectStepIds(definition.steps));
    if (type === "branch") {
      return createEmptyBranchStep(nextId);
    }
    if (type === "delay") {
      return createEmptyDelayStep(nextId);
    }

    const adapterWithActions = adapters.find((adapter) => adapter.supportedActions.length > 0);
    const nextStep = createEmptyActionStep(nextId, adapterWithActions?.key || adapters[0]?.key || "webhook");
    nextStep.action = adapterWithActions?.supportedActions[0] || "";
    return nextStep;
  }

  async function validateCurrentDefinition(candidate?: WorkflowDefinition): Promise<boolean> {
    const subject = candidate || definition;
    const result = await validateWorkflow({
      definition: subject,
    });
    setValidationErrors(result.errors || []);
    return result.valid;
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setServerError(null);

    let candidate = definition;

    if (editorMode === "json") {
      try {
        candidate = JSON.parse(jsonDraft) as WorkflowDefinition;
        setDefinition(candidate);
        setJsonError(null);
      } catch {
        setJsonError("JSON is invalid. Fix JSON before creating the workflow.");
        return;
      }
    }

    const valid = await validateCurrentDefinition(candidate);
    if (!valid) {
      return;
    }

    try {
      await createWorkflow({
        name,
        definition: candidate,
      });
      await load();
      setName("New Workflow");
      const nextDefault = buildDefaultWorkflow(adapters, {
        workspaceId: session?.scope.workspaceId || "",
        organizationId: session?.scope.organizationId || "",
      });
      setDefinition(nextDefault);
      setTriggerConfigDraft(JSON.stringify(nextDefault.trigger.config || {}, null, 2));
      setContextDraft(JSON.stringify(nextDefault.context || {}, null, 2));
      setValidationErrors([]);
    } catch (error) {
      const maybeAxiosError = error as {
        response?: {
          data?: {
            error?: string;
            details?: string[];
          };
        };
        message?: string;
      };

      if (maybeAxiosError.response?.data?.details) {
        setValidationErrors(maybeAxiosError.response.data.details);
      }
      setServerError(
        maybeAxiosError.response?.data?.error || maybeAxiosError.message || "Failed to create workflow.",
      );
    }
  }

  return (
    <div>
      <h2>Workflows</h2>
      <p>
        Use Form mode for guided editing. Switch to JSON mode for advanced edits. Both modes are
        synchronized.
      </p>

      <form onSubmit={onCreate} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            Workflow Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>

          <label>
            Definition ID
            <input
              value={definition.id}
              onChange={(event) =>
                updateDefinition({
                  ...definition,
                  id: event.target.value,
                })
              }
              style={{ marginLeft: 8 }}
            />
          </label>

          <label>
            Mode
            <select
              value={editorMode}
              onChange={(event) => {
                const nextMode = event.target.value as "form" | "json";
                if (nextMode === "json") {
                  setJsonDraft(JSON.stringify(definition, null, 2));
                  setEditorMode("json");
                  setJsonError(null);
                  return;
                }

                try {
                  const parsed = JSON.parse(jsonDraft) as WorkflowDefinition;
                  updateDefinition(parsed);
                  setEditorMode("form");
                  setJsonError(null);
                } catch {
                  setJsonError("Cannot switch to form mode until JSON is valid.");
                }
              }}
              style={{ marginLeft: 8 }}
            >
              <option value="form">Form</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </div>

        {editorMode === "form" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Trigger</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label>
                  Adapter
                  <select
                    value={definition.trigger.adapter}
                    onChange={(event) => {
                      const adapterKey = event.target.value;
                      const adapter = adapters.find((item) => item.key === adapterKey);
                      updateDefinition({
                        ...definition,
                        trigger: {
                          ...definition.trigger,
                          adapter: adapterKey,
                          trigger: adapter?.supportedTriggers[0] || definition.trigger.trigger,
                        },
                      });
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    {adapters.map((adapter) => (
                      <option key={adapter.key} value={adapter.key}>
                        {adapter.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Trigger
                  <select
                    value={definition.trigger.trigger}
                    onChange={(event) => {
                      updateDefinition({
                        ...definition,
                        trigger: {
                          ...definition.trigger,
                          trigger: event.target.value,
                        },
                      });
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    {(adapters.find((item) => item.key === definition.trigger.adapter)
                      ?.supportedTriggers || [definition.trigger.trigger]
                    ).map((triggerKey) => (
                      <option key={triggerKey} value={triggerKey}>
                        {triggerKey}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>Trigger Config (JSON object)</div>
                <textarea
                  rows={4}
                  cols={90}
                  value={triggerConfigDraft}
                  onChange={(event) => setTriggerConfigDraft(event.target.value)}
                  onBlur={() => {
                    const parsed = parseJsonObject(triggerConfigDraft);
                    if (!parsed) {
                      setServerError("Trigger config must be valid JSON object.");
                      return;
                    }
                    updateDefinition({
                      ...definition,
                      trigger: {
                        ...definition.trigger,
                        config: parsed,
                      },
                    });
                  }}
                />
              </div>
            </div>

            <div style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>Workflow Context (JSON object)</h3>
              <textarea
                rows={4}
                cols={90}
                value={contextDraft}
                onChange={(event) => setContextDraft(event.target.value)}
                onBlur={() => {
                  const parsed = parseJsonObject(contextDraft);
                  if (!parsed) {
                    setServerError("Context must be valid JSON object.");
                    return;
                  }
                  updateDefinition({
                    ...definition,
                    context: parsed,
                  });
                }}
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <h3 style={{ marginBottom: 0 }}>Steps</h3>
              {definition.steps.map((step, index) => (
                <StepCardEditor
                  key={`${step.id}-${index}`}
                  step={step}
                  depth={0}
                  adapters={adapters}
                  referenceHints={referenceHints}
                  createStep={createStep}
                  onDelete={() => {
                    updateDefinition({
                      ...definition,
                      steps: definition.steps.filter((_, i) => i !== index),
                    });
                  }}
                  onChange={(updatedStep) => {
                    const nextSteps = [...definition.steps];
                    nextSteps[index] = updatedStep;
                    updateDefinition({
                      ...definition,
                      steps: nextSteps,
                    });
                  }}
                />
              ))}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    updateDefinition({
                      ...definition,
                      steps: [...definition.steps, createStep("action")],
                    });
                  }}
                >
                  Add Action Step
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDefinition({
                      ...definition,
                      steps: [...definition.steps, createStep("branch")],
                    });
                  }}
                >
                  Add Branch Step
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDefinition({
                      ...definition,
                      steps: [...definition.steps, createStep("delay")],
                    });
                  }}
                >
                  Add Delay Step
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <h3 style={{ marginBottom: 8 }}>JSON Editor</h3>
            <textarea
              rows={30}
              cols={110}
              value={jsonDraft}
              onChange={(event) => {
                setJsonDraft(event.target.value);
                setJsonError(null);
                setServerError(null);
              }}
            />
            {jsonError ? <div style={{ color: "#b42318" }}>{jsonError}</div> : null}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={async () => {
              try {
                if (editorMode === "json") {
                  const parsed = JSON.parse(jsonDraft) as WorkflowDefinition;
                  setDefinition(parsed);
                  setJsonError(null);
                  await validateCurrentDefinition(parsed);
                } else {
                  await validateCurrentDefinition();
                }
              } catch {
                setJsonError("JSON is invalid. Fix JSON before validation.");
              }
            }}
          >
            Validate DSL
          </button>

          <button type="submit">Create Workflow</button>
        </div>
      </form>

      {serverError ? (
        <div style={{ color: "#b42318", marginTop: 10 }}>{serverError}</div>
      ) : null}
      <ValidationErrorPanel errors={validationErrors} />

      <h3 style={{ marginTop: 20 }}>Existing Workflows</h3>
      {loading ? <p>Loading...</p> : null}
      <ul>
        {workflows.map((workflow) => (
          <li key={workflow.id}>
            {workflow.name} ({workflow.status}) - updated {workflow.updated_at}
          </li>
        ))}
      </ul>
    </div>
  );
}
