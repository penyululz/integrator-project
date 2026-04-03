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
    <div className="card-muted" style={{ borderRadius: 10, border: "1px solid #c6d4e7", padding: 10 }}>
      <div className="inline-actions" style={{ justifyContent: "space-between" }}>
        <strong>Condition rules</strong>
        <label>
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
            style={{ marginLeft: 8 }}
          >
            <option value="all">All rules</option>
            <option value="any">Any rule</option>
          </select>
        </label>
      </div>

      <div className="stack" style={{ marginTop: 8 }}>
        {group.conditions.map((condition, index) => (
          <div
            key={index}
            className="card-muted"
            style={{ borderRadius: 10, border: "1px dashed #bacbe2", padding: 8 }}
          >
            <div className="stack-sm">
              <label>Left value</label>
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

              <div className="inline-actions">
                <label>
                  Operator
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
                    style={{ marginLeft: 8 }}
                  >
                    {CONDITION_OPERATORS.map((operator) => (
                      <option key={operator} value={operator}>
                        {operator}
                      </option>
                    ))}
                  </select>
                </label>

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
                    Remove rule
                  </button>
                ) : null}
              </div>

              {condition.operator !== "exists" ? (
                <>
                  <label>Right value</label>
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
                </>
              ) : null}
            </div>
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
        Add rule
      </button>
    </div>
  );
}
