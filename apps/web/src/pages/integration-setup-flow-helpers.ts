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

export function toWizardStepLabel(step: ConnectionWizardStep): string {
  if (step === "overview") {
    return "Overview";
  }
  if (step === "requirements") {
    return "Requirements";
  }
  if (step === "input") {
    return "Input";
  }
  if (step === "test") {
    return "Test";
  }
  return "Success";
}

export function toWizardStepDescription(step: ConnectionWizardStep): string {
  if (step === "overview") {
    return "Understand what this app will do in your workflows.";
  }
  if (step === "requirements") {
    return "Confirm prerequisites before entering credentials.";
  }
  if (step === "input") {
    return "Fill required values, then save the connection.";
  }
  if (step === "test") {
    return "Run a connection check before enabling production automations.";
  }
  return "Move directly into templates and your first live run.";
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
