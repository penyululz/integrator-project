import { describe, expect, it, vi } from "vitest";
import { EmailAdapter } from "./index";

describe("EmailAdapter", () => {
  it("sends email action via transport", async () => {
    const adapter = new EmailAdapter();
    await adapter.init({
      host: "smtp.test",
      port: 587,
      secure: false,
      from: "no-reply@test.com",
    });

    const sendMail = vi.fn().mockResolvedValue({
      messageId: "m-1",
      accepted: ["test@example.com"],
    });
    (adapter as unknown as { transport: { sendMail: typeof sendMail } }).transport =
      { sendMail };

    const result = await adapter.runAction(
      "sendEmail",
      {
        to: "test@example.com",
        subject: "Hello",
        text: "Body",
      },
      {
        tenantId: "t1",
        organizationId: "o1",
        workspaceId: "w1",
      },
    );

    expect(result.success).toBe(true);
    expect(sendMail).toHaveBeenCalled();
  });
});

