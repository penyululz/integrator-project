const BaseAdapter = require("./base-adapter");

class ServiceNowAdapter extends BaseAdapter {
  constructor(options) {
    super({
      provider: "servicenow",
      ...options,
    });
  }

  async createIncident({
    tenantId,
    shortDescription,
    description,
    severity = "3",
    externalId,
  }) {
    return this.post(tenantId, "/api/now/table/incident", {
      short_description: shortDescription,
      description,
      urgency: severity,
      impact: severity,
      u_external_id: externalId,
    });
  }
}

module.exports = ServiceNowAdapter;

