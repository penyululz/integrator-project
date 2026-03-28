const BasePluginAdapter = require("./base/plugin-adapter");

class WhatsAppCloudAdapter extends BasePluginAdapter {
  constructor({
    baseUrl = "https://graph.facebook.com",
    apiVersion = "v22.0",
    phoneNumberId = "",
    accessToken = "",
    fetchImpl = fetch,
  } = {}) {
    super({
      name: "whatsapp-cloud",
      category: "action",
      baseUrl: `${baseUrl}/${apiVersion}/`,
      fetchImpl,
      defaultHeaders: {
        Authorization: accessToken ? `Bearer ${accessToken}` : "",
      },
    });

    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
  }

  capabilities() {
    return {
      trigger: false,
      action: true,
      whatsappCloud: true,
    };
  }

  async action({ to, text }) {
    if (!this.phoneNumberId || !this.accessToken) {
      throw new Error(
        "WhatsApp Cloud adapter requires WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.",
      );
    }

    if (!to || !text) {
      throw new Error("WhatsApp action requires both 'to' and 'text'.");
    }

    return this.request({
      method: "POST",
      path: `${this.phoneNumberId}/messages`,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: text,
        },
      },
    });
  }
}

module.exports = WhatsAppCloudAdapter;

