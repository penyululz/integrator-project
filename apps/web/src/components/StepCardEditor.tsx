import { useEffect, useMemo, useState } from "react";
import {
  createEmptyActionStep,
  createEmptyBranchStep,
  createEmptyDelayStep,
  isActionStep,
  isBranchStep,
  isDelayStep,
  type WorkflowActionStep,
  type WorkflowBranchStep,
  type WorkflowMappedValue,
  type WorkflowStep,
} from "../types/workflow";
import { BranchStepEditor } from "./BranchStepEditor";
import { ConditionEditor } from "./ConditionEditor";
import { DelayStepEditor } from "./DelayStepEditor";
import { ReferencePicker } from "./ReferencePicker";

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

function convertStepType(
  step: WorkflowStep,
  nextType: "action" | "branch" | "delay",
  adapters: AdapterMetadata[],
): WorkflowStep {
  if (nextType === "action") {
    const fallbackAdapter = adapters[0]?.key || "webhook";
    const fallbackAction = adapters[0]?.supportedActions?.[0] || "";
    return {
      ...createEmptyActionStep(step.id, fallbackAdapter),
      action: fallbackAction,
    };
  }

  if (nextType === "branch") {
    return {
      ...createEmptyBranchStep(step.id),
    };
  }

  return {
    ...createEmptyDelayStep(step.id),
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

export function StepCardEditor({
  step,
  adapters,
  referenceHints,
  depth,
  onChange,
  onDelete,
  createStep,
}: {
  step: WorkflowStep;
  adapters: AdapterMetadata[];
  referenceHints: string[];
  depth: number;
  onChange: (step: WorkflowStep) => void;
  onDelete: () => void;
  createStep: (type: "action" | "branch" | "delay") => WorkflowStep;
}) {
  const [configText, setConfigText] = useState(
    isActionStep(step) ? toJson(step.config) : "{}",
  );
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (isActionStep(step)) {
      setConfigText(toJson(step.config));
      setConfigError(null);
    }
  }, [step]);

  const selectedType = isBranchStep(step) ? "branch" : isDelayStep(step) ? "delay" : "action";

  const cardPadding = Math.max(10, 14 - depth);
  const borderColor = depth === 0 ? "#d0d0d0" : "#e4e4e4";

  const actionStep = isActionStep(step) ? normalizeActionStep(step, adapters) : null;
  const actionAdapter = actionStep
    ? adapters.find((adapter) => adapter.key === actionStep.adapter)
    : undefined;

  const inputEntries = useMemo(() => {
    if (!actionStep?.input) {
      return [] as Array<[string, WorkflowMappedValue]>;
    }
    return Object.entries(actionStep.input);
  }, [actionStep]);

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: cardPadding,
        background: "#fff",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>Step</strong>
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

        <label>
          Type
          <select
            value={selectedType}
            onChange={(event) => {
              const nextType = event.target.value as "action" | "branch" | "delay";
              onChange(convertStepType(step, nextType, adapters));
            }}
            style={{ marginLeft: 8 }}
          >
            <option value="action">Action</option>
            <option value="branch">Branch</option>
            <option value="delay">Delay</option>
          </select>
        </label>

        <button type="button" onClick={onDelete}>
          Remove
        </button>
      </div>

      {actionStep ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label>
              Adapter
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
              On Error
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
                <option value="stop">stop</option>
                <option value="continue">continue</option>
                <option value="retry">retry</option>
              </select>
            </label>
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Static Config (JSON object)</div>
            <textarea
              value={configText}
              rows={5}
              cols={90}
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

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>Input Mappings</strong>
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
                Add Mapping
              </button>
            </div>

            {inputEntries.map(([key, value], index) => (
              <div
                key={`${key}-${index}`}
                style={{
                  border: "1px dashed #d9d9d9",
                  borderRadius: 8,
                  padding: 8,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
