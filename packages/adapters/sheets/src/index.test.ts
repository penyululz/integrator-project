import { describe, expect, it, vi } from "vitest";
import { google } from "googleapis";
import { SheetsAdapter } from "./index";

describe("SheetsAdapter", () => {
  it("lists appendRow action", async () => {
    const adapter = new SheetsAdapter();
    await adapter.init({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "http://localhost/callback",
    });
    const actions = await adapter.listActions();
    expect(actions.some((action) => action.key === "appendRow")).toBe(true);
  });

  it("runs appendRow action", async () => {
    const append = vi.fn().mockResolvedValue({
      data: {
        updates: {
          updatedRows: 1,
        },
      },
    });
    vi.spyOn(google, "sheets").mockReturnValue({
      spreadsheets: {
        values: {
          append,
        },
      },
    } as unknown as ReturnType<typeof google.sheets>);

    const adapter = new SheetsAdapter();
    await adapter.init({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "http://localhost/callback",
    });

    const result = await adapter.runAction(
      "appendRow",
      {
        spreadsheetId: "sheet-1",
        range: "A1:B1",
        accessToken: "token",
        values: ["A", "B"],
      },
      {
        tenantId: "t1",
        organizationId: "o1",
        workspaceId: "w1",
      },
    );

    expect(result.success).toBe(true);
    expect(append).toHaveBeenCalled();
  });
});

