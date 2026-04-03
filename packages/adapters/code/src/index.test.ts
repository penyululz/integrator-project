import { describe, expect, it } from "vitest";
import { CodeAdapter } from "./index";

describe("CodeAdapter", () => {
  it("declares executeJavaScript action", async () => {
    const adapter = new CodeAdapter();
    const actions = await adapter.listActions();
    expect(actions.map((action) => action.key)).toEqual(["executeJavaScript"]);
  });

  it("executes JavaScript and returns result", async () => {
    const adapter = new CodeAdapter();
    await adapter.init({});

    const result = await adapter.runAction(
      "executeJavaScript",
      {
        script: "return { greeting: `hello ${input.name}` };",
        input: {
          name: "world",
        },
      },
      {
        tenantId: "tenant",
        organizationId: "org",
        workspaceId: "ws",
      },
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ greeting: "hello world" });
  });
});
