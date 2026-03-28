import {
  CONDITION_OPERATORS,
  type WorkflowCondition,
  type WorkflowConditionBlock,
  toConditionGroup,
} from "../types/workflow";
import { ReferencePicker } from "./ReferencePicker";

function createEmptyCondition(): WorkflowCondition {
  return {
    left: {
      $ref: "trigger.payload",
    },
    operator: "exists",
  };
}

export function ConditionEditor({
  value,
  onChange,
  referenceHints,
  disabled,
}: {
  value?: WorkflowConditionBlock;
  onChange: (value: WorkflowConditionBlock) => void;
  referenceHints: string[];
  disabled?: boolean;
}) {
  const group = toConditionGroup(value);

  return (
    <div
      style={{
        border: "1px solid #d9d9d9",
        borderRadius: 8,
        padding: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>Condition</strong>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          Match
          <select
            value={group.mode || "all"}
            disabled={disabled}
            onChange={(event) => {
              onChange({
                ...group,
                mode: event.target.value as "all" | "any",
              });
            }}
          >
            <option value="all">All</option>
            <option value="any">Any</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {group.conditions.map((condition, index) => (
          <div
            key={index}
            style={{
              border: "1px dashed #c9c9c9",
              borderRadius: 8,
              padding: 8,
              display: "grid",
              gap: 8,
            }}
          >
            <ReferencePicker
              value={condition.left}
              disabled={disabled}
              referenceHints={referenceHints}
              onChange={(nextLeft) => {
                const nextConditions = [...group.conditions];
                nextConditions[index] = {
                  ...condition,
                  left: nextLeft,
                };
                onChange({
                  ...group,
                  conditions: nextConditions,
                });
              }}
            />

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={condition.operator}
                disabled={disabled}
                onChange={(event) => {
                  const operator = event.target.value as WorkflowCondition["operator"];
                  const nextCondition: WorkflowCondition = {
                    ...condition,
                    operator,
                  };
                  if (operator === "exists") {
                    delete nextCondition.right;
                  } else if (nextCondition.right === undefined) {
                    nextCondition.right = {
                      $literal: "",
                    };
                  }

                  const nextConditions = [...group.conditions];
                  nextConditions[index] = nextCondition;
                  onChange({
                    ...group,
                    conditions: nextConditions,
                  });
                }}
              >
                {CONDITION_OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>

              {group.conditions.length > 1 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange({
                      ...group,
                      conditions: group.conditions.filter((_, i) => i !== index),
                    });
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>

            {condition.operator !== "exists" ? (
              <ReferencePicker
                value={condition.right}
                disabled={disabled}
                referenceHints={referenceHints}
                onChange={(nextRight) => {
                  const nextConditions = [...group.conditions];
                  nextConditions[index] = {
                    ...condition,
                    right: nextRight,
                  };
                  onChange({
                    ...group,
                    conditions: nextConditions,
                  });
                }}
              />
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          onChange({
            ...group,
            conditions: [...group.conditions, createEmptyCondition()],
          });
        }}
        style={{ marginTop: 8 }}
      >
        Add Condition
      </button>
    </div>
  );
}
