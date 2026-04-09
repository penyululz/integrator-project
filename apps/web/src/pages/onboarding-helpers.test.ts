import { describe, expect, it } from "vitest";
import {
  buildFirstSuccessLinks,
  buildOnboardingSteps,
  getOnboardingPrimaryAction,
  getNextRecommendedStep,
  getNextPendingStep,
  getOnboardingCompletion,
  getOnboardingProgress,
} from "./onboarding-helpers";
import { PLATFORM_MODES } from "../platform-mode";

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

    const progress = getOnboardingProgress(steps);
    expect(progress).toEqual({
      completionPercent: 100,
      completedSteps: 4,
      totalSteps: 4,
    });
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
    expect(getNextRecommendedStep(steps)?.id).toBe("template");

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

  it("returns a clear primary onboarding action", () => {
    const incomplete = buildOnboardingSteps({
      integrationsCount: 0,
      connectedCredentialProviders: 0,
      templatesCount: 2,
      workflowsCount: 0,
      runsCount: 0,
    });

    expect(
      getOnboardingPrimaryAction({
        steps: incomplete,
        isOperator: false,
      }).path,
    ).toBe("/first-automation");

    const complete = buildOnboardingSteps({
      integrationsCount: 2,
      connectedCredentialProviders: 2,
      templatesCount: 2,
      workflowsCount: 2,
      runsCount: 2,
    });

    expect(
      getOnboardingPrimaryAction({
        steps: complete,
        isOperator: true,
      }).path,
    ).toBe("/dashboard");
  });

  it("switches to prototype-first onboarding action and includes approvals shortcut", () => {
    const steps = buildOnboardingSteps({
      integrationsCount: 0,
      connectedCredentialProviders: 0,
      templatesCount: 2,
      workflowsCount: 0,
      runsCount: 0,
    });

    const primaryAction = getOnboardingPrimaryAction({
      steps,
      isOperator: true,
      mode: PLATFORM_MODES.PROTOTYPE,
    });

    expect(primaryAction.label).toBe("Start first-success demo");
    expect(primaryAction.path).toBe("/first-automation");
    expect(primaryAction.description).toContain("FIRST-SUCCESS DEMO");

    const links = buildFirstSuccessLinks({
      steps,
      isOperator: true,
      mode: PLATFORM_MODES.PROTOTYPE,
    });

    expect(links.some((link) => link.path === "/approvals")).toBe(true);
  });
});
