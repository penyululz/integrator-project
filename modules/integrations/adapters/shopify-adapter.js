const BaseAdapter = require("./base-adapter");

class ShopifyAdapter extends BaseAdapter {
  constructor(options) {
    super({
      provider: "shopify",
      ...options,
    });
  }

  async listOrders({ tenantId, updatedAfter, status = "any", limit = 100 }) {
    const query = {
      status,
      limit,
    };

    if (updatedAfter) {
      query.updated_at_min = new Date(updatedAfter).toISOString();
    }

    return this.get(tenantId, "/admin/api/2024-10/orders.json", query);
  }
}

module.exports = ShopifyAdapter;

