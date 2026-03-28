const crypto = require("node:crypto");
const BasePluginAdapter = require("./base/plugin-adapter");

function hmacSha256(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

class WebhookAdapter extends BasePluginAdapter {
  constructor({
    signingSecret = "",
    outgoingBaseUrl = "",
    fetchImpl = fetch,
  } = {}) {
    super({
      name: "webhook",
      category: "trigger",
      baseUrl: outgoingBaseUrl || null,
      fetchImpl,
    });

    this.signingSecret = signingSecret;
  }

  capabilities() {
    return {
      trigger: true,
      action: true,
      inboundWebhook: true,
      outboundWebhook: true,
    };
  }

  verifySignature({ rawBody, signature }) {
    if (!this.signingSecret) {
      return true;
    }

    if (!signature) {
      return false;
    }

    const expected = hmacSha256(this.signingSecret, rawBody || "");
    const left = Buffer.from(expected);
    const right = Buffer.from(String(signature));

    if (left.length !== right.length) {
      return false;
    }

    return crypto.timingSafeEqual(left, right);
  }

  async trigger({ source, eventType, payload, headers = {}, rawBody = "" }) {
    const signature =
      headers["x-signature"] ||
      headers["x-webhook-signature"] ||
      headers["X-Signature"];

    const validSignature = this.verifySignature({
      rawBody,
      signature,
    });

    if (!validSignature) {
      const error = new Error("Webhook signature verification failed.");
      error.statusCode = 401;
      throw error;
    }

    return {
      source: source || "webhook",
      eventType: eventType || headers["x-event-type"] || "unknown",
      payload,
      receivedAt: new Date().toISOString(),
      headers,
    };
  }

  async action({
    path = "/",
    body = {},
    headers = {},
    idempotencyKey = null,
  }) {
    return this.request({
      method: "POST",
      path,
      headers,
      body,
      idempotencyKey,
    });
  }
}

module.exports = WebhookAdapter;

