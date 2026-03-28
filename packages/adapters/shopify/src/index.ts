import Shopify from "shopify-api-node";
import {
  Adapter,
  AdapterActionResult,
  AdapterAuthResult,
  AdapterContext,
  AdapterTokenRefreshResult,
  AdapterTriggerResult,
  ActionDefinition,
  AuthPayload,
  TriggerDefinition,
} from "@integration/shared";

type ShopifyConfig = {
  apiKey: string;
  apiSecret: string;
  shopName: string;
  accessToken: string;
};

export class ShopifyAdapter implements Adapter {
  readonly key = "shopify";
  readonly version = "1.0.0";
  private config: ShopifyConfig = {
    apiKey: "",
    apiSecret: "",
    shopName: "",
    accessToken: "",
  };
  private client: Shopify | null = null;

  async init(config: Record<string, unknown>): Promise<void> {
    this.config = {
      apiKey: String(config.apiKey || ""),
      apiSecret: String(config.apiSecret || ""),
      shopName: String(config.shopName || ""),
      accessToken: String(config.accessToken || ""),
    };

    if (this.config.shopName && this.config.accessToken) {
      this.client = new Shopify({
        shopName: this.config.shopName,
        accessToken: this.config.accessToken,
      });
    }
  }

  async authenticate(payload: AuthPayload): Promise<AdapterAuthResult> {
    if (!payload.code) {
      const scopes = (payload.scopes || ["read_orders"]).join(",");
      const redirectUri = encodeURIComponent(payload.redirectUri || "");
      const authUrl = `https://${this.config.shopName}.myshopify.com/admin/oauth/authorize?client_id=${encodeURIComponent(this.config.apiKey)}&scope=${encodeURIComponent(scopes)}&redirect_uri=${redirectUri}&state=${encodeURIComponent(payload.state || "")}`;
      return {
        authUrl,
      };
    }

    const response = await fetch(
      `https://${this.config.shopName}.myshopify.com/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: this.config.apiKey,
          client_secret: this.config.apiSecret,
          code: payload.code,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Shopify token exchange failed with ${response.status}`);
    }
    const data = (await response.json()) as { access_token: string; scope: string };
    return {
      accessToken: data.access_token,
      metadata: { scope: data.scope },
    };
  }

  async listTriggers(): Promise<TriggerDefinition[]> {
    return [
      {
        key: "order_created",
        name: "Order Created",
        description: "Triggered when Shopify order/create webhook is received.",
        inputSchema: {
          type: "object",
          properties: {
            order: { type: "object" },
          },
          required: ["order"],
        },
      },
    ];
  }

  async listActions(): Promise<ActionDefinition[]> {
    return [
      {
        key: "readOrder",
        name: "Read Order",
        description: "Fetch an order by Shopify order ID.",
        inputSchema: {
          type: "object",
          properties: {
            orderId: { type: "number" },
            accessToken: { type: "string" },
            shopName: { type: "string" },
          },
          required: ["orderId"],
        },
      },
    ];
  }

  async runTrigger(
    triggerKey: string,
    input: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTriggerResult> {
    if (triggerKey !== "order_created") {
      throw new Error(`Unsupported trigger "${triggerKey}"`);
    }
    return {
      events: [input.order ? (input.order as Record<string, unknown>) : input],
    };
  }

  async runAction(
    actionKey: string,
    input: Record<string, unknown>,
    context: AdapterContext,
  ): Promise<AdapterActionResult> {
    if (actionKey !== "readOrder") {
      throw new Error(`Unsupported action "${actionKey}"`);
    }
    const orderId = Number(input.orderId);
    if (!Number.isFinite(orderId)) {
      throw new Error("readOrder requires numeric orderId.");
    }

    const accessToken = String(
      input.accessToken || context.credentials?.accessToken || this.config.accessToken,
    );
    const shopName = String(input.shopName || this.config.shopName);
    const client =
      accessToken && shopName
        ? new Shopify({
            shopName,
            accessToken,
          })
        : this.client;

    if (!client) {
      throw new Error("Shopify client is not initialized.");
    }

    const order = await client.order.get(orderId);
    return {
      success: true,
      output: order as unknown as Record<string, unknown>,
    };
  }

  async validateConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    if (!config.apiKey) {
      errors.push("apiKey is required.");
    }
    if (!config.apiSecret) {
      errors.push("apiSecret is required.");
    }
    if (!config.shopName) {
      errors.push("shopName is required.");
    }

    return errors.length ? { valid: false, errors } : { valid: true };
  }

  async refreshToken(
    currentCredentials: Record<string, unknown>,
    _context: AdapterContext,
  ): Promise<AdapterTokenRefreshResult> {
    const accessToken = String(currentCredentials.accessToken || "");
    if (!accessToken) {
      throw new Error("Shopify offline token missing.");
    }
    return {
      accessToken,
      refreshToken: undefined,
    };
  }
}
