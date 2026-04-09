import { useEffect, useMemo, useState } from "react";
import type { AgentToolRecord } from "../api";
import {
  isActionStep,
  isBranchStep,
  isDelayStep,
  type WorkflowActionStep,
  type WorkflowMappedValue,
  type WorkflowStep,
} from "../types/workflow";
import { BranchStepEditor } from "./BranchStepEditor";
import { ConditionEditor } from "./ConditionEditor";
import { DelayStepEditor } from "./DelayStepEditor";
import { ReferencePicker } from "./ReferencePicker";
import { parseCurlCommand, toFormattedJson } from "../pages/http-step-helpers";
import {
  applyAgentPermissionState,
  extractAgentPermissionState,
  getAgentPermissionOptions,
} from "../pages/agent-tools-helpers";

type AdapterMetadata = {
  key: string;
  displayName: string;
  authType: string;
  supportedTriggers: string[];
  supportedActions: string[];
  enabled?: boolean;
};

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function parseConfig(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeActionStep(
  step: WorkflowActionStep,
  adapters: AdapterMetadata[],
): WorkflowActionStep {
  const selectedAdapter =
    adapters.find((adapter) => adapter.key === step.adapter) || adapters[0] || undefined;

  if (!selectedAdapter) {
    return step;
  }

  const supportedActions = selectedAdapter.supportedActions || [];
  const nextAction =
    supportedActions.includes(step.action) ? step.action : supportedActions[0] || step.action;

  return {
    ...step,
    adapter: selectedAdapter.key,
    action: nextAction,
  };
}

function updateMappedInput(
  step: WorkflowActionStep,
  key: string,
  value: WorkflowMappedValue,
): WorkflowActionStep {
  return {
    ...step,
    input: {
      ...(step.input || {}),
      [key]: value,
    },
  };
}

function summarizeStep(step: WorkflowStep): string {
  if (isActionStep(step)) {
    return `${step.adapter}.${step.action || "(select action)"}`;
  }
  if (isDelayStep(step)) {
    if (step.delayMs !== undefined) {
      return `Wait ${step.delayMs} ms`;
    }
    if (step.delaySeconds !== undefined) {
      return `Wait ${step.delaySeconds} seconds`;
    }
    return "Wait step";
  }
  return `Branch with ${step.then.length} then step(s)`;
}

function getStepClassName(step: WorkflowStep): string {
  if (isBranchStep(step)) {
    return "step-card branch";
  }
  if (isDelayStep(step)) {
    return "step-card delay";
  }
  return "step-card action";
}

export function StepCardEditor({
  step,
  adapters,
  agentTools = [],
  referenceHints,
  depth,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  createStep,
  onDuplicateAs,
  showAdvancedSections = true,
}: {
  step: WorkflowStep;
  adapters: AdapterMetadata[];
  agentTools?: AgentToolRecord[];
  referenceHints: string[];
  depth: number;
  onChange: (step: WorkflowStep) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  createStep: (type: "action" | "branch" | "delay") => WorkflowStep;
  onDuplicateAs?: (nextType: "action" | "branch" | "delay") => void;
  showAdvancedSections?: boolean;
}) {
  const selectedType = isBranchStep(step) ? "branch" : isDelayStep(step) ? "delay" : "action";
  const [configText, setConfigText] = useState(
    isActionStep(step) ? toJson(step.config) : "{}",
  );
  const [configError, setConfigError] = useState<string | null>(null);
  const [httpHeadersDraft, setHttpHeadersDraft] = useState("{}");
  const [httpBodyDraft, setHttpBodyDraft] = useState("{}");
  const [curlDraft, setCurlDraft] = useState("");
  const [curlMessage, setCurlMessage] = useState<string | null>(null);
  const [codeInputDraft, setCodeInputDraft] = useState("{}");
  const [duplicateType, setDuplicateType] = useState<"action" | "branch" | "delay">(selectedType);

  useEffect(() => {
    if (isActionStep(step)) {
      setConfigText(toJson(step.config));
      setConfigError(null);
    }
    setDuplicateType(selectedType);
  }, [step, selectedType]);

  const actionStep = isActionStep(step) ? normalizeActionStep(step, adapters) : null;
  const actionAdapter = actionStep
    ? adapters.find((adapter) => adapter.key === actionStep.adapter)
    : undefined;
  const isHttpRequestStep =
    actionStep?.adapter === "http-api" &&
    actionStep.action === "httpRequest";
  const isCodeStep =
    actionStep?.adapter === "code" &&
    actionStep.action === "executeJavaScript";
  const isAiStep = actionStep?.adapter === "ai";
  const isAiAgentStep = isAiStep && actionStep.action === "runAgent";
  const aiAgentToolOptions = useMemo(
    () => getAgentPermissionOptions(agentTools),
    [agentTools],
  );
  const agentRequestedToolIds = useMemo(() => {
    const rawTools = actionStep?.config.tools;
    if (!Array.isArray(rawTools)) {
      return [] as string[];
    }
    return [...new Set(rawTools.filter((item): item is string => typeof item === "string"))];
  }, [actionStep?.config.tools]);
  const agentPermissionState = useMemo(
    () =>
      actionStep ? extractAgentPermissionState(actionStep.config) : extractAgentPermissionState({}),
    [actionStep],
  );

  const inputEntries = useMemo(() => {
    if (!actionStep?.input) {
      return [] as Array<[string, WorkflowMappedValue]>;
    }
    return Object.entries(actionStep.input);
  }, [actionStep]);

  useEffect(() => {
    if (!actionStep) {
      return;
    }

    setHttpHeadersDraft(toFormattedJson(actionStep.config.headers || {}));
    setHttpBodyDraft(toFormattedJson(actionStep.config.body || {}));
    setCodeInputDraft(toFormattedJson(actionStep.config.input || {}));
    setCurlMessage(null);
  }, [actionStep?.id, actionStep?.adapter, actionStep?.action]);

  return (
    <div className={getStepClassName(step)} style={{ marginLeft: depth * 10 }}>
      <div className="step-header">
        <div className="stack-sm">
          <strong>{step.id || "New step"}</strong>
          <div className="step-summary">{summarizeStep(step)}</div>
        </div>
        <div className="inline-actions">
          {onMoveUp ? (
            <button type="button" onClick={onMoveUp}>
              Move up
            </button>
          ) : null}
          {onMoveDown ? (
            <button type="button" onClick={onMoveDown}>
              Move down
            </button>
          ) : null}
          <span className="tag">Drag to reorder</span>
          <span className="tag">Type: {selectedType}</span>
          {onDuplicateAs ? (
            <>
              <label>
                Duplicate as
                <select
                  value={duplicateType}
                  onChange={(event) =>
                    setDuplicateType(event.target.value as "action" | "branch" | "delay")
                  }
                  style={{ marginLeft: 8 }}
                >
                  <option value="action">Action</option>
                  <option value="branch">Branch</option>
                  <option value="delay">Delay</option>
                </select>
              </label>
              <button
                type="button"
                disabled={duplicateType === selectedType}
                onClick={() => {
                  if (duplicateType !== selectedType) {
                    onDuplicateAs(duplicateType);
                  }
                }}
              >
                Create converted copy
              </button>
            </>
          ) : null}

          <button type="button" onClick={onDelete}>Remove</button>
        </div>
      </div>

      <label>
        Step ID
        <input
          value={step.id}
          onChange={(event) => {
            onChange({
              ...step,
              id: event.target.value,
            });
          }}
          placeholder="step_id"
        />
      </label>

      {actionStep ? (
        <div className="stack">
          <div className="inline-actions">
            <label>
              App
              <select
                value={actionStep.adapter}
                onChange={(event) => {
                  const adapterKey = event.target.value;
                  const selectedAdapter = adapters.find((adapter) => adapter.key === adapterKey);
                  onChange({
                    ...actionStep,
                    adapter: adapterKey,
                    action: selectedAdapter?.supportedActions?.[0] || "",
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
              Action
              <select
                value={actionStep.action}
                onChange={(event) => {
                  onChange({
                    ...actionStep,
                    action: event.target.value,
                  });
                }}
                style={{ marginLeft: 8 }}
              >
                {(actionAdapter?.supportedActions || []).map((actionKey) => (
                  <option key={actionKey} value={actionKey}>
                    {actionKey}
                  </option>
                ))}
              </select>
            </label>

            <label>
              On error
              <select
                value={actionStep.onError || "stop"}
                onChange={(event) => {
                  onChange({
                    ...actionStep,
                    onError: event.target.value as "stop" | "continue" | "retry",
                  });
                }}
                style={{ marginLeft: 8 }}
              >
                <option value="stop">Stop workflow</option>
                <option value="continue">Continue workflow</option>
                <option value="retry">Retry with policy</option>
              </select>
            </label>
          </div>

          {isHttpRequestStep ? (
            <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
              <strong>HTTP Request setup</strong>
              <p>Configure request fields directly, or import from cURL to prefill values.</p>
              <div className="form-grid two">
                <label>
                  Method
                  <select
                    value={String(actionStep.config.method || "GET")}
                    onChange={(event) => {
                      onChange({
                        ...actionStep,
                        config: {
                          ...actionStep.config,
                          method: event.target.value,
                        },
                      });
                    }}
                    style={{ marginTop: 4 }}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </label>
                <label>
                  URL
                  <input
                    value={String(actionStep.config.url || "")}
                    onChange={(event) => {
                      onChange({
                        ...actionStep,
                        config: {
                          ...actionStep.config,
                          url: event.target.value,
                        },
                      });
                    }}
                    placeholder="https://api.example.com/resource"
                    style={{ marginTop: 4 }}
                  />
                </label>
              </div>

              <div className="form-grid two">
                <label>
                  Headers (JSON object)
                  <textarea
                    rows={4}
                    value={httpHeadersDraft}
                    onChange={(event) => setHttpHeadersDraft(event.target.value)}
                    onBlur={() => {
                      const parsed = parseConfig(httpHeadersDraft);
                      if (!parsed) {
                        setConfigError("Headers must be a valid JSON object.");
                        return;
                      }
                      setConfigError(null);
                      onChange({
                        ...actionStep,
                        config: {
                          ...actionStep.config,
                          headers: parsed,
                        },
                      });
                    }}
                  />
                </label>
                <label>
                  Body (JSON object)
                  <textarea
                    rows={4}
                    value={httpBodyDraft}
                    onChange={(event) => setHttpBodyDraft(event.target.value)}
                    onBlur={() => {
                      const parsed = parseConfig(httpBodyDraft);
                      if (!parsed) {
                        setConfigError("Body must be a valid JSON object.");
                        return;
                      }
                      setConfigError(null);
                      onChange({
                        ...actionStep,
                        config: {
                          ...actionStep.config,
                          body: parsed,
                        },
                      });
                    }}
                  />
                </label>
              </div>

              <label>
                Import from cURL
                <textarea
                  rows={3}
                  value={curlDraft}
                  placeholder={`curl -X POST https://api.example.com -H 'Content-Type: application/json' -d '{"hello":"world"}'`}
                  onChange={(event) => setCurlDraft(event.target.value)}
                  style={{ marginTop: 4 }}
                />
              </label>
              <div className="inline-actions">
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseCurlCommand(curlDraft);
                    if (!parsed) {
                      setCurlMessage("Could not parse cURL command.");
                      return;
                    }

                    setCurlMessage("Imported cURL into HTTP step config.");
                    setHttpHeadersDraft(toFormattedJson(parsed.headers));
                    setHttpBodyDraft(toFormattedJson(parsed.body || {}));
                    onChange({
                      ...actionStep,
                      config: {
                        ...actionStep.config,
                        method: parsed.method,
                        url: parsed.url,
                        headers: parsed.headers,
                        body: parsed.body || {},
                      },
                    });
                  }}
                >
                  Import cURL
                </button>
                {curlMessage ? <span className="tag">{curlMessage}</span> : null}
              </div>
            </div>
          ) : null}

          {isCodeStep ? (
            <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
              <strong>Code step (advanced)</strong>
              <p>
                JavaScript receives <code>input</code> and <code>context</code>, then returns an object.
              </p>
              <label>
                Script
                <textarea
                  rows={5}
                  value={String(actionStep.config.script || "")}
                  placeholder="return { message: `hello ${input.name}` };"
                  onChange={(event) => {
                    onChange({
                      ...actionStep,
                      config: {
                        ...actionStep.config,
                        script: event.target.value,
                      },
                    });
                  }}
                  style={{ marginTop: 4 }}
                />
              </label>
              <div className="form-grid two">
                <label>
                  Input object (JSON)
                  <textarea
                    rows={4}
                    value={codeInputDraft}
                    onChange={(event) => setCodeInputDraft(event.target.value)}
                    onBlur={() => {
                      const parsed = parseConfig(codeInputDraft);
                      if (!parsed) {
                        setConfigError("Code input must be a valid JSON object.");
                        return;
                      }
                      setConfigError(null);
                      onChange({
                        ...actionStep,
                        config: {
                          ...actionStep.config,
                          input: parsed,
                        },
                      });
                    }}
                  />
                </label>
                <label>
                  Timeout (ms)
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    value={String(actionStep.config.timeoutMs || 1500)}
                    onChange={(event) => {
                      const next = Number(event.target.value || 1500);
                      onChange({
                        ...actionStep,
                        config: {
                          ...actionStep.config,
                          timeoutMs: Number.isFinite(next) ? next : 1500,
                        },
                      });
                    }}
                    style={{ marginTop: 4 }}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {isAiStep ? (
            <div className="card-muted" style={{ borderRadius: 10, padding: 10 }}>
              <strong>{isAiAgentStep ? "AI Agent node (advanced)" : "AI node"}</strong>
              <p>
                Use input mapping for prompt/text/goal fields and keep advanced settings minimal
                until your first successful run.
              </p>
              {isAiAgentStep ? (
                <div className="stack-sm">
                  <p>
                    Agent node runs a bounded goal loop with explicit tool permissions. Start with
                    2-3 iterations and inspect trace output in run details. High-safety tools can
                    require human approval before execution.
                  </p>

                  <div className="form-grid two">
                    <label>
                      Agent intent (goal)
                      <input
                        value={String((actionStep as WorkflowActionStep).config.goal || "")}
                        onChange={(event) => {
                          onChange({
                            ...(actionStep as WorkflowActionStep),
                            config: {
                              ...(actionStep as WorkflowActionStep).config,
                              goal: event.target.value,
                            },
                          });
                        }}
                        placeholder="Research customer feedback and post a concise team update"
                        style={{ marginTop: 4 }}
                      />
                    </label>
                    <label>
                      Agent role
                      <select
                        value={String((actionStep as WorkflowActionStep).config.agentRole || "single")}
                        onChange={(event) => {
                          onChange({
                            ...(actionStep as WorkflowActionStep),
                            config: {
                              ...(actionStep as WorkflowActionStep).config,
                              agentRole: event.target.value,
                            },
                          });
                        }}
                        style={{ marginTop: 4 }}
                      >
                        <option value="single">Single agent</option>
                        <option value="research">Research Agent</option>
                        <option value="execution">Execution Agent</option>
                      </select>
                    </label>
                  </div>

                  <div className="form-grid two">
                    <label>
                      Memory key (optional)
                      <input
                        value={String((actionStep as WorkflowActionStep).config.memoryKey || "")}
                        onChange={(event) => {
                          onChange({
                            ...(actionStep as WorkflowActionStep),
                            config: {
                              ...(actionStep as WorkflowActionStep).config,
                              memoryKey: event.target.value,
                            },
                          });
                        }}
                        placeholder="agent.last_goal_output"
                        style={{ marginTop: 4 }}
                      />
                    </label>
                    <label>
                      Memory scope
                      <select
                        value={String((actionStep as WorkflowActionStep).config.memoryScope || "workflow")}
                        onChange={(event) => {
                          onChange({
                            ...(actionStep as WorkflowActionStep),
                            config: {
                              ...(actionStep as WorkflowActionStep).config,
                              memoryScope: event.target.value,
                            },
                          });
                        }}
                        style={{ marginTop: 4 }}
                      >
                        <option value="workflow">Workflow (persistent)</option>
                        <option value="run">Run (short-term)</option>
                      </select>
                    </label>
                  </div>

                  <label className="tag" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={Array.isArray((actionStep as WorkflowActionStep).config.subAgents)}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        onChange({
                          ...(actionStep as WorkflowActionStep),
                          config: {
                            ...(actionStep as WorkflowActionStep).config,
                            subAgents: enabled
                              ? [
                                  {
                                    id: "research_agent",
                                    label: "Research Agent",
                                    goal: "Collect context for the main goal.",
                                    tools: ["ai.summarizeText"],
                                    maxIterations: 2,
                                  },
                                  {
                                    id: "execution_agent",
                                    label: "Execution Agent",
                                    goal: "Execute or deliver the final response.",
                                    tools: ["ai.rewriteContent"],
                                    maxIterations: 2,
                                  },
                                ]
                              : undefined,
                          },
                        });
                      }}
                      style={{ marginRight: 6 }}
                    />
                    Enable multi-agent handoff (Research Agent to Execution Agent)
                  </label>

                  <label>
                    Tool permission mode
                    <select
                      value={agentPermissionState.mode}
                      onChange={(event) => {
                        const nextMode = event.target.value as "allow_all" | "allow_list";
                        onChange({
                          ...(actionStep as WorkflowActionStep),
                          config: applyAgentPermissionState(
                            {
                              ...(actionStep as WorkflowActionStep).config,
                            },
                            {
                              mode: nextMode,
                              allowedToolIds:
                                nextMode === "allow_list"
                                  ? agentPermissionState.allowedToolIds
                                  : [],
                            },
                          ),
                        });
                      }}
                      style={{ marginLeft: 8 }}
                    >
                      <option value="allow_all">Allow all selected tools</option>
                      <option value="allow_list">Allow-list only</option>
                    </select>
                  </label>

                  <div className="stack-sm">
                    <strong>Requested tools</strong>
                    {aiAgentToolOptions.length === 0 ? (
                      <p>No agent-callable tools are available in this workspace.</p>
                    ) : (
                      aiAgentToolOptions.map((option) => (
                        <label key={`requested-${option.id}`} className="tag" style={{ cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={agentRequestedToolIds.includes(option.id)}
                            onChange={(event) => {
                              const nextSet = new Set(agentRequestedToolIds);
                              if (event.target.checked) {
                                nextSet.add(option.id);
                              } else {
                                nextSet.delete(option.id);
                              }

                              onChange({
                                ...(actionStep as WorkflowActionStep),
                                config: {
                                  ...(actionStep as WorkflowActionStep).config,
                                  tools: Array.from(nextSet),
                                },
                              });
                            }}
                            style={{ marginRight: 6 }}
                          />
                          {option.label}
                          <span style={{ marginLeft: 6, fontSize: 12, color: "#4f6475" }}>
                            {option.hint}
                            {option.requiresApproval ? " | approval required" : ""}
                          </span>
                        </label>
                      ))
                    )}
                  </div>

                  {agentPermissionState.mode === "allow_list" ? (
                    <div className="stack-sm">
                      <strong>Allowed tools (runtime boundary)</strong>
                      {aiAgentToolOptions.map((option) => (
                        <label key={`allowed-${option.id}`} className="tag" style={{ cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={agentPermissionState.allowedToolIds.includes(option.id)}
                            onChange={(event) => {
                              const nextSet = new Set(agentPermissionState.allowedToolIds);
                              if (event.target.checked) {
                                nextSet.add(option.id);
                              } else {
                                nextSet.delete(option.id);
                              }
                              onChange({
                                ...(actionStep as WorkflowActionStep),
                                config: applyAgentPermissionState(
                                  {
                                    ...(actionStep as WorkflowActionStep).config,
                                  },
                                  {
                                    mode: "allow_list",
                                    allowedToolIds: Array.from(nextSet),
                                  },
                                ),
                              });
                            }}
                            style={{ marginRight: 6 }}
                          />
                          {option.label}
                          {option.requiresApproval ? " (approval)" : ""}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {showAdvancedSections ? (
            <details>
              <summary>Static config (advanced)</summary>
              <div className="stack-sm" style={{ marginTop: 8 }}>
                <textarea
                  value={configText}
                  rows={5}
                  onChange={(event) => {
                    setConfigText(event.target.value);
                    setConfigError(null);
                  }}
                  onBlur={() => {
                    const parsed = parseConfig(configText);
                    if (!parsed) {
                      setConfigError("Config must be a valid JSON object.");
                      return;
                    }
                    onChange({
                      ...actionStep,
                      config: parsed,
                    });
                  }}
                />
                {configError ? <div style={{ color: "#b42318" }}>{configError}</div> : null}
              </div>
            </details>
          ) : null}

          <div className="stack">
            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
              <strong>Input mapping</strong>
              <button
                type="button"
                onClick={() => {
                  const nextKeyBase = `field_${inputEntries.length + 1}`;
                  let nextKey = nextKeyBase;
                  let counter = 1;
                  while ((actionStep.input && actionStep.input[nextKey]) || false) {
                    counter += 1;
                    nextKey = `${nextKeyBase}_${counter}`;
                  }

                  onChange(
                    updateMappedInput(actionStep, nextKey, {
                      $literal: "",
                    }),
                  );
                }}
              >
                Add mapping
              </button>
            </div>

            {inputEntries.length === 0 ? (
              <div className="empty-state">
                <p>No mappings yet. Add one to map trigger/context/step outputs into this action.</p>
              </div>
            ) : null}

            {inputEntries.map(([key, value], index) => (
              <div
                key={`${key}-${index}`}
                className="card-muted"
                style={{ borderRadius: 10, padding: 10, border: "1px dashed #c3d2e9" }}
              >
                <div className="inline-actions">
                  <input
                    value={key}
                    onChange={(event) => {
                      const nextKey = event.target.value;
                      if (!nextKey) {
                        return;
                      }

                      const nextInput: Record<string, WorkflowMappedValue> = {
                        ...(actionStep.input || {}),
                      };
                      delete nextInput[key];
                      nextInput[nextKey] = value;

                      onChange({
                        ...actionStep,
                        input: nextInput,
                      });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextInput: Record<string, WorkflowMappedValue> = {
                        ...(actionStep.input || {}),
                      };
                      delete nextInput[key];
                      onChange({
                        ...actionStep,
                        input: nextInput,
                      });
                    }}
                  >
                    Remove
                  </button>
                </div>
                <ReferencePicker
                  value={value}
                  referenceHints={referenceHints}
                  onChange={(nextValue) => {
                    onChange(updateMappedInput(actionStep, key, nextValue));
                  }}
                />
              </div>
            ))}
          </div>

          {showAdvancedSections ? (
            <details>
              <summary>Optional condition</summary>
              <div style={{ marginTop: 8 }}>
                <ConditionEditor
                  value={actionStep.condition}
                  referenceHints={referenceHints}
                  onChange={(condition) => {
                    onChange({
                      ...actionStep,
                      condition,
                    });
                  }}
                />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {isDelayStep(step) ? (
        <DelayStepEditor
          step={step}
          referenceHints={referenceHints}
          onChange={(nextDelayStep) => onChange(nextDelayStep)}
        />
      ) : null}

      {isBranchStep(step) ? (
        <BranchStepEditor
          step={step}
          referenceHints={referenceHints}
          onChange={(nextBranchStep) => onChange(nextBranchStep)}
          onAddNestedStep={(branch) => {
            const nestedStep = createStep("action");
            if (branch === "then") {
              onChange({
                ...step,
                then: [...step.then, nestedStep],
              });
              return;
            }

            onChange({
              ...step,
              else: [...(step.else || []), nestedStep],
            });
          }}
          renderNestedStep={(branch, index, nestedStep) => (
            <StepCardEditor
              key={`${branch}-${nestedStep.id}-${index}`}
              step={nestedStep}
              adapters={adapters}
              agentTools={agentTools}
              referenceHints={referenceHints}
              depth={depth + 1}
              createStep={createStep}
              onDelete={() => {
                if (branch === "then") {
                  const nextThen = step.then.filter((_, i) => i !== index);
                  onChange({
                    ...step,
                    then: nextThen,
                  });
                } else {
                  const nextElse = (step.else || []).filter((_, i) => i !== index);
                  onChange({
                    ...step,
                    else: nextElse,
                  });
                }
              }}
              onChange={(updatedNestedStep) => {
                if (branch === "then") {
                  const nextThen = [...step.then];
                  nextThen[index] = updatedNestedStep;
                  onChange({
                    ...step,
                    then: nextThen,
                  });
                } else {
                  const nextElse = [...(step.else || [])];
                  nextElse[index] = updatedNestedStep;
                  onChange({
                    ...step,
                    else: nextElse,
                  });
                }
              }}
            />
          )}
        />
      ) : null}
    </div>
  );
}
