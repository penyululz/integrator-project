import { useEffect, useMemo, useState } from "react";
import type { WorkflowMappedValue } from "../types/workflow";

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isReferenceValue(value: WorkflowMappedValue | undefined): value is { $ref: string } {
  return (
    isObject(value) &&
    Object.prototype.hasOwnProperty.call(value, "$ref") &&
    typeof (value as { $ref: unknown }).$ref === "string"
  );
}

function toLiteralText(value: WorkflowMappedValue | undefined): string {
  if (value === undefined) {
    return "";
  }

  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, "$literal")) {
    const literalValue = (value as { $literal: unknown }).$literal;
    if (typeof literalValue === "string") {
      return literalValue;
    }
    return JSON.stringify(literalValue);
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function parseLooseLiteral(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function ReferencePicker({
  value,
  onChange,
  referenceHints,
  disabled,
}: {
  value?: WorkflowMappedValue;
  onChange: (value: WorkflowMappedValue) => void;
  referenceHints: string[];
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<"ref" | "literal">(
    isReferenceValue(value) ? "ref" : "literal",
  );
  const [refValue, setRefValue] = useState(
    isReferenceValue(value) ? value.$ref : "trigger.payload",
  );
  const [literalValue, setLiteralValue] = useState(toLiteralText(value));

  useEffect(() => {
    if (isReferenceValue(value)) {
      setMode("ref");
      setRefValue(value.$ref);
      return;
    }

    setMode("literal");
    setLiteralValue(toLiteralText(value));
  }, [value]);

  const datalistId = useMemo(
    () => `ref-hints-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  return (
    <div className="inline-actions">
      <select
        value={mode}
        disabled={disabled}
        onChange={(event) => {
          const nextMode = event.target.value as "ref" | "literal";
          setMode(nextMode);
          if (nextMode === "ref") {
            const nextRef = refValue || "trigger.payload";
            setRefValue(nextRef);
            onChange({ $ref: nextRef });
          } else {
            onChange({
              $literal: parseLooseLiteral(literalValue),
            });
          }
        }}
      >
        <option value="literal">Literal</option>
        <option value="ref">Reference</option>
      </select>

      {mode === "ref" ? (
        <>
          <input
            style={{ minWidth: 260 }}
            value={refValue}
            list={datalistId}
            disabled={disabled}
            onChange={(event) => {
              const nextRef = event.target.value;
              setRefValue(nextRef);
              onChange({
                $ref: nextRef,
              });
            }}
            placeholder="trigger.payload.order.id"
          />
          <datalist id={datalistId}>
            {referenceHints.map((hint) => (
              <option key={hint} value={hint} />
            ))}
          </datalist>
        </>
      ) : (
        <input
          style={{ minWidth: 260 }}
          value={literalValue}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            setLiteralValue(next);
            onChange({
              $literal: parseLooseLiteral(next),
            });
          }}
          placeholder='"hello" or 42 or true'
        />
      )}
    </div>
  );
}
