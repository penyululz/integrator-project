import type { AppConnectionRecord } from "../api";
import type { ConnectionFormState } from "./integration-connection-helpers";
import { validateRequiredFields } from "./integration-connection-helpers";

export type ConnectionWizardStep =
  | "overview"
  | "requirements"
  | "input"
  | "test"
  | "success";

export type ConnectionStatus = "connected" | "needs_setup" | "failed_test" | "ready_for_test";

export type ConnectionValidationResult = {
  valid: boolean;
  missingFields: string[];
};

export function validateConnectionInput(
  app: AppConnectionRecord,
  formState: ConnectionFormState,
): ConnectionValidationResult {
  const missingFields = validateRequiredFields(app, formState);
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

export function getConnectionStatus(input: {
  app: AppConnectionRecord;
  hasValidInput: boolean;
  lastTestState: "unknown" | "valid" | "invalid";
}): ConnectionStatus {
  if (input.app.connected || input.app.status === "connected") {
    return "connected";
  }
  if (!input.hasValidInput) {
    return "needs_setup";
  }
  if (input.lastTestState === "invalid") {
    return "failed_test";
  }
  return "ready_for_test";
}

export function getWizardStepOrder(): ConnectionWizardStep[] {
  return ["overview", "requirements", "input", "test", "success"];
}

export function getNextWizardStep(
  currentStep: ConnectionWizardStep,
  canMoveForward: boolean,
): ConnectionWizardStep {
  const ordered = getWizardStepOrder();
  const currentIndex = ordered.indexOf(currentStep);
  if (currentIndex < 0) {
    return "overview";
  }
  if (!canMoveForward || currentIndex === ordered.length - 1) {
    return currentStep;
  }
  return ordered[currentIndex + 1];
}

export function getPreviousWizardStep(currentStep: ConnectionWizardStep): ConnectionWizardStep {
  const ordered = getWizardStepOrder();
  const currentIndex = ordered.indexOf(currentStep);
  if (currentIndex <= 0) {
    return "overview";
  }
  return ordered[currentIndex - 1];
}

export async function testConnection<T>(runner: () => Promise<T>): Promise<T> {
  return runner();
}

export async function saveConnection<T>(runner: () => Promise<T>): Promise<T> {
  return runner();
}
