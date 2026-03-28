import type { WorkflowDelayStep } from "../types/workflow";
import { ConditionEditor } from "./ConditionEditor";

export function DelayStepEditor({
  step,
  onChange,
  referenceHints,
}: {
  step: WorkflowDelayStep;
  onChange: (step: WorkflowDelayStep) => void;
  referenceHints: string[];
}) {
  const delayUnit = step.delayMs !== undefined ? "ms" : "seconds";
  const delayValue = step.delayMs ?? step.delaySeconds ?? 0;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Delay
          <input
            type="number"
            min={0}
            value={delayValue}
            onChange={(event) => {
              const parsed = Number(event.target.value || 0);
              if (delayUnit === "ms") {
                onChange({
                  ...step,
                  delayMs: parsed,
                  delaySeconds: undefined,
                });
              } else {
                onChange({
                  ...step,
                  delaySeconds: parsed,
                  delayMs: undefined,
                });
              }
            }}
            style={{ marginLeft: 8, width: 120 }}
          />
        </label>

        <label>
          Unit
          <select
            value={delayUnit}
            onChange={(event) => {
              const nextUnit = event.target.value as "ms" | "seconds";
              if (nextUnit === "ms") {
                onChange({
                  ...step,
                  delayMs: delayValue,
                  delaySeconds: undefined,
                });
              } else {
                onChange({
                  ...step,
                  delaySeconds: delayValue,
                  delayMs: undefined,
                });
              }
            }}
            style={{ marginLeft: 8 }}
          >
            <option value="seconds">Seconds</option>
            <option value="ms">Milliseconds</option>
          </select>
        </label>
      </div>

      <details>
        <summary>Optional condition</summary>
        <div style={{ marginTop: 8 }}>
          <ConditionEditor
            value={step.condition}
            referenceHints={referenceHints}
            onChange={(condition) => {
              onChange({
                ...step,
                condition,
              });
            }}
          />
        </div>
      </details>
    </div>
  );
}
