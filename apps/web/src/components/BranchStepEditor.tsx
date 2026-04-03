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
    <div className="stack">
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

      <div className="stack">
        <h4>When condition is true</h4>
        {step.then.map((nestedStep, index) => renderNestedStep("then", index, nestedStep))}
        <button type="button" onClick={() => onAddNestedStep("then")}>Add true-path step</button>
      </div>

      <div className="stack">
        <h4>When condition is false</h4>
        {(step.else || []).map((nestedStep, index) =>
          renderNestedStep("else", index, nestedStep),
        )}
        <button type="button" onClick={() => onAddNestedStep("else")}>Add false-path step</button>
      </div>
    </div>
  );
}
