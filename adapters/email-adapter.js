const nodemailer = require("nodemailer");
const PluginAdapterInterface = require("../core/plugin-interface");

class EmailAdapter extends PluginAdapterInterface {
  constructor({
    host,
    port = 587,
    secure = false,
    user = "",
    pass = "",
    defaultFrom = "",
    transport = null,
  } = {}) {
    super({
      name: "email",
      category: "action",
    });

    this.defaultFrom = defaultFrom;
    this.transport =
      transport ||
      nodemailer.createTransport({
        host,
        port,
        secure,
        auth:
          user || pass
            ? {
                user,
                pass,
              }
            : undefined,
      });
  }

  capabilities() {
    return {
      trigger: false,
      action: true,
      smtp: true,
    };
  }

  async action({ to, subject, text, html, from }) {
    if (!to || !subject) {
      throw new Error("Email action requires both 'to' and 'subject'.");
    }

    const info = await this.transport.sendMail({
      from: from || this.defaultFrom,
      to,
      subject,
      text,
      html,
    });

    return {
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    };
  }
}

module.exports = EmailAdapter;

