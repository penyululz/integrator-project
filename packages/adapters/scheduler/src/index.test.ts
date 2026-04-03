import { describe, expect, it } from "vitest";
import { SchedulerAdapter } from "./index";

describe("SchedulerAdapter", () => {
  it("declares cron trigger and window action", async () => {
    const adapter = new SchedulerAdapter();
    const triggers = await adapter.listTriggers();
    const actions = await adapter.listActions();

    expect(triggers.map((item) => item.key)).toEqual(["cron_tick"]);
    expect(actions.map((item) => item.key)).toEqual(["nextWindow"]);
  });

  it("generates trigger event payload", async () => {
    const adapter = new SchedulerAdapter();
    await adapter.init({ timezone: "UTC" });

    const result = await adapter.runTrigger(
      "cron_tick",
      {
        cron: "0 * * * *",
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      cron: "0 * * * *",
      source: "scheduler",
    });
  });
});
