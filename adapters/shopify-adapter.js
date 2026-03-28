const BasePluginAdapter = require("./base/plugin-adapter");

class ShopifyPluginAdapter extends BasePluginAdapter {
  constructor({ baseUrl, accessToken, fetchImpl = fetch } = {}) {
    super({
      name: "shopify",
      category: "trigger",
      baseUrl,
      fetchImpl,
      defaultHeaders: {
        "X-Shopify-Access-Token": accessToken || "",
      },
    });

    this.accessToken = accessToken || "";
  }

  capabilities() {
    return {
      trigger: true,
      action: true,
      shopifyOrders: true,
    };
  }

  async trigger({ since, limit = 50 }) {
    const query = {
      status: "any",
      limit,
    };

    if (since) {
      query.updated_at_min = new Date(since).toISOString();
    }

    const response = await this.request({
      method: "GET",
      path: "/admin/api/2024-10/orders.json",
      query,
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
      },
    });

    return {
      orders: response.orders || [],
      source: "shopify",
    };
  }

  async action({ orderId }) {
    if (!orderId) {
      throw new Error("Shopify action requires orderId.");
    }

    return this.request({
      method: "GET",
      path: `/admin/api/2024-10/orders/${orderId}.json`,
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
      },
    });
  }
}

module.exports = ShopifyPluginAdapter;

