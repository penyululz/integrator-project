const { google } = require("googleapis");
const PluginAdapterInterface = require("../core/plugin-interface");

class GoogleSheetsAdapter extends PluginAdapterInterface {
  constructor({ apiKey = "", accessToken = "" } = {}) {
    super({
      name: "google-sheets",
      category: "action",
    });

    this.apiKey = apiKey;
    this.accessToken = accessToken;
    this.client = null;
  }

  async init() {
    if (this.accessToken) {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({
        access_token: this.accessToken,
      });
      this.client = google.sheets({
        version: "v4",
        auth,
      });
    } else if (this.apiKey) {
      this.client = google.sheets({
        version: "v4",
        auth: this.apiKey,
      });
    }

    this.initialized = true;
  }

  capabilities() {
    return {
      trigger: false,
      action: true,
      googleSheets: true,
    };
  }

  assertClient() {
    if (!this.client) {
      throw new Error(
        "Google Sheets adapter is not configured. Set GOOGLE_SHEETS_ACCESS_TOKEN or GOOGLE_SHEETS_API_KEY.",
      );
    }
  }

  async appendRows({ spreadsheetId, range, values }) {
    this.assertClient();

    const response = await this.client.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: {
        values,
      },
    });

    return {
      updates: response.data.updates || null,
    };
  }

  async action({ spreadsheetId, range, values }) {
    if (!spreadsheetId || !range || !Array.isArray(values)) {
      throw new Error(
        "Google Sheets action requires spreadsheetId, range, and values array.",
      );
    }

    return this.appendRows({
      spreadsheetId,
      range,
      values,
    });
  }
}

module.exports = GoogleSheetsAdapter;

