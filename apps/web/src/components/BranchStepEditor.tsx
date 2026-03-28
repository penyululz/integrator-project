import type { ReactNode } from "react";
import type { WorkflowBranchStep, WorkflowStep } from "../types/workflow";
import { ConditionEditor } from "./ConditionEditor";

export function BranchStepEditor({
  step,
  onChange,
  referenceHints,
  onAddNestedStep,
  renderNestedStep,
}: {
  step: WorkflowBranchStep;
  onChange: (step: WorkflowBranchStep) => void;
  referenceHints: string[];
  onAddNestedStep: (branch: "then" | "else") => void;
  renderNestedStep: (
    branch: "then" | "else",
    index: number,
    nestedStep: WorkflowStep,
  ) => ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
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

      <div style={{ display: "grid", gap: 8 }}>
        <h4 style={{ margin: 0 }}>Then</h4>
        {step.then.map((nestedStep, index) => renderNestedStep("then", index, nestedStep))}
        <button type="button" onClick={() => onAddNestedStep("then")}>Add Then Step</button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h4 style={{ margin: 0 }}>Else</h4>
        {(step.else || []).map((nestedStep, index) =>
          renderNestedStep("else", index, nestedStep),
        )}
        <button type="button" onClick={() => onAddNestedStep("else")}>Add Else Step</button>
      </div>
    </div>
  );
}
