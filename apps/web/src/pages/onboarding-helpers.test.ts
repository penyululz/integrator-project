import { describe, expect, it } from "vitest";
import {
  buildFirstSuccessLinks,
  buildOnboardingSteps,
  getNextPendingStep,
  getOnboardingCompletion,
} from "./onboarding-helpers";

describe("onboarding-helpers", () => {
  it("builds onboarding steps with expected completion state", () => {
    const steps = buildOnboardingSteps({
      integrationsCount: 1,
      connectedCredentialProviders: 1,
      templatesCount: 5,
      workflowsCount: 0,
      runsCount: 0,
    });

    expect(steps).toHaveLength(4);
    expect(steps[0].done).toBe(true);
    expect(steps[2].done).toBe(false);
  });

  it("computes completion percentage from step status", () => {
    const steps = buildOnboardingSteps({
      integrationsCount: 1,
      connectedCredentialProviders: 1,
      templatesCount: 5,
      workflowsCount: 1,
      runsCount: 1,
    });

    expect(getOnboardingCompletion(steps)).toBe(100);
    expect(
      getOnboardingCompletion([
        { ...steps[0], done: true },
        { ...steps[1], done: false },
        { ...steps[2], done: false },
        { ...steps[3], done: false },
      ]),
    ).toBe(25);
  });

  it("returns first pending step and first-success links", () => {
    const steps = buildOnboardingSteps({
      integrationsCount: 1,
      connectedCredentialProviders: 1,
      templatesCount: 5,
      workflowsCount: 0,
      runsCount: 0,
    });

    expect(getNextPendingStep(steps)?.id).toBe("template");

    const links = buildFirstSuccessLinks({
      steps,
      isOperator: true,
    });

    expect(links.some((link) => link.path === "/first-automation")).toBe(true);
    expect(links.some((link) => link.path === "/runs")).toBe(true);
    expect(links.some((link) => link.path === "/audit-logs")).toBe(true);
    expect(links.some((link) => link.path === "/alerts")).toBe(true);
  });

  it("shows dashboard link once onboarding is complete", () => {
    const steps = buildOnboardingSteps({
      integrationsCount: 2,
      connectedCredentialProviders: 2,
      templatesCount: 5,
      workflowsCount: 2,
      runsCount: 2,
    });

    const links = buildFirstSuccessLinks({
      steps,
      isOperator: false,
    });

    expect(getNextPendingStep(steps)).toBeNull();
    expect(links.some((link) => link.path === "/dashboard")).toBe(true);
  });
});
