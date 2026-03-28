const { WebClient } = require("@slack/web-api");
const BasePluginAdapter = require("./base/plugin-adapter");

class SlackAdapter extends BasePluginAdapter {
  constructor({
    botToken = "",
    defaultChannel = "",
    incomingWebhookUrl = "",
    fetchImpl = fetch,
  } = {}) {
    super({
      name: "slack",
      category: "action",
      baseUrl: incomingWebhookUrl || null,
      fetchImpl,
    });

    this.botToken = botToken;
    this.defaultChannel = defaultChannel;
    this.webClient = botToken ? new WebClient(botToken) : null;
  }

  capabilities() {
    return {
      trigger: false,
      action: true,
      slackMessaging: true,
    };
  }

  async sendViaWebApi({ channel, text }) {
    if (!this.webClient) {
      throw new Error(
        "Slack bot token is not configured. Set SLACK_BOT_TOKEN.",
      );
    }

    const response = await this.webClient.chat.postMessage({
      channel: channel || this.defaultChannel,
      text,
    });

    return {
      ok: response.ok,
      channel: response.channel,
      ts: response.ts,
    };
  }

  async sendViaIncomingWebhook({ text }) {
    return this.request({
      method: "POST",
      path: "/",
      body: {
        text,
      },
    });
  }

  async action({ channel, text }) {
    if (!text) {
      throw new Error("Slack action requires text.");
    }

    if (this.webClient) {
      return this.sendViaWebApi({
        channel,
        text,
      });
    }

    return this.sendViaIncomingWebhook({ text });
  }
}

module.exports = SlackAdapter;

