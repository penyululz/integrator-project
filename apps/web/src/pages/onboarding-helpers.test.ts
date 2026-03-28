import { describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
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
});
