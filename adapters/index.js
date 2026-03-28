const HttpApiAdapter = require("./http-api-adapter");
const WebhookAdapter = require("./webhook-adapter");
const SchedulerAdapter = require("./scheduler-adapter");
const EmailAdapter = require("./email-adapter");
const GoogleSheetsAdapter = require("./google-sheets-adapter");
const ShopifyAdapter = require("./shopify-adapter");
const WhatsAppCloudAdapter = require("./whatsapp-cloud-adapter");
const SlackAdapter = require("./slack-adapter");

module.exports = {
  HttpApiAdapter,
  WebhookAdapter,
  SchedulerAdapter,
  EmailAdapter,
  GoogleSheetsAdapter,
  ShopifyAdapter,
  WhatsAppCloudAdapter,
  SlackAdapter,
};

