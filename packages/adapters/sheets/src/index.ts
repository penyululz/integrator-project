import { google } from "googleapis";
import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterCredentialValidationResult,
  AdapterCredentials,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";

type SheetsConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export class SheetsAdapter implements Adapter {
  readonly key = "sheets";
  readonly version = "1.0.0";
  private config: SheetsConfig = {
    clientId: "",
    clientSecret: "",
    redirectUri: "",
  };

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      clientId: String(config.clientId || ""),
      clientSecret: String(config.clientSecret || ""),
      redirectUri: String(config.redirectUri || ""),
    };
  }

  private createOAuthClient() {
    return new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri,
    );
  }

  async authenticate(payload: AuthPayload): Promise<AdapterAuthResult> {
    const oauth = this.createOAuthClient();
    if (!payload.code) {
      const authUrl = oauth.generateAuthUrl({
        access_type: "offline",
        scope: payload.scopes?.length
          ? payload.scopes
          : ["https://www.googleapis.com/auth/spreadsheets"],
        state: payload.state,
        redirect_uri: payload.redirectUri || this.config.redirectUri,
      });
      return { authUrl };
    }

    const tokenResponse = await oauth.getToken({
      code: payload.code,
      redirect_uri: payload.redirectUri || this.config.redirectUri,
    });
    const credentials = tokenResponse.tokens;

    return {
      accessToken: credentials.access_token || "",
      refreshToken: credentials.refresh_token || undefined,
      expiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : undefined,
      metadata: {
        tokenType: credentials.token_type,
      },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "appendRow",
        name: "Append Row",
        description: "Append a row to a Google Sheet range.",
        inputSchema: {
          type: "object",
          required: ["spreadsheetId", "range", "values"],
          properties: {
            spreadsheetId: { type: "string" },
            range: { type: "string" },
            values: { type: "array" },
            accessToken: { type: "string" },
          },
        },
      },
    ];
  }

  async runTrigger(
    _triggerKey: string,
    _input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    return {
      events: [],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "appendRow") {
      throw new Error(`Unsupported action "${actionKey}"`);
    }

    const spreadsheetId = String(input.spreadsheetId || "");
    const range = String(input.range || "");
    const accessToken = String(
      input.accessToken || context.credentials?.accessToken || "",
    );
    const values = input.values as unknown[];

    if (!spreadsheetId || !range || !accessToken || !Array.isArray(values)) {
      throw new Error(
        "appendRow requires spreadsheetId, range, accessToken and values array.",
      );
    }

    const auth = this.createOAuthClient();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: {
        values: [values],
      },
    });

    return {
      success: true,
      output: {
        updates: response.data.updates || null,
      },
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (typeof config.clientId !== "string" || !config.clientId) {
      errors.push("clientId is required.");
    }
    if (typeof config.clientSecret !== "string" || !config.clientSecret) {
      errors.push("clientSecret is required.");
    }
    if (typeof config.redirectUri !== "string" || !config.redirectUri) {
      errors.push("redirectUri is required.");
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }
    return { valid: true };
  }

  async refreshToken(
    currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    const refreshToken = String(currentCredentials.refreshToken || "");
    if (!refreshToken) {
      throw new Error("refreshToken is required.");
    }
    const oauth = this.createOAuthClient();
    oauth.setCredentials({
      refresh_token: refreshToken,
    });
    const refreshed = await oauth.refreshAccessToken();
    const credentials = refreshed.credentials;

    return {
      accessToken: credentials.access_token || "",
      refreshToken: credentials.refresh_token || refreshToken,
      expiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : undefined,
    };
  }

  async validateCredentials(
    credentials: AdapterCredentials,
  ): Promise<AdapterCredentialValidationResult> {
    if (!credentials.accessToken) {
      return {
        status: "invalid",
        reason: "Missing access token.",
      };
    }
    if (credentials.expiresAt) {
      const expiresAt = Date.parse(credentials.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return {
          status: "expired",
          reason: "Credential token has expired.",
        };
      }
    }
    return {
      status: "valid",
    };
  }
}
