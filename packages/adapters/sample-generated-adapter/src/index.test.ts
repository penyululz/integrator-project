import { describe, expect, it } from "vitest";
import { SampleGeneratedAdapter } from "./index";

describe("SampleGeneratedAdapter", () => {
  it("exposes sample trigger and action definitions", async () => {
    const adapter = new SampleGeneratedAdapter();
    await adapter.init({});
    const triggers = await adapter.listTriggers();
    const actions = await adapter.listActions();

    expect(triggers.map((trigger) => trigger.key)).toContain("sample_trigger");
    expect(actions.map((action) => action.key)).toContain("sample_action");
  });
});
