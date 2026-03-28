const BaseAdapter = require("./base-adapter");

class AtlassianAdapter extends BaseAdapter {
  constructor(options) {
    super({
      provider: "atlassian",
      ...options,
    });
  }

  async listIssues({
    tenantId,
    jql = "order by created desc",
    maxResults = 50,
  }) {
    return this.post(tenantId, "/rest/api/3/search", {
      jql,
      maxResults,
      fields: [
        "summary",
        "description",
        "issuetype",
        "priority",
        "status",
        "created",
      ],
    });
  }
}

module.exports = AtlassianAdapter;

