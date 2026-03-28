const BaseAdapter = require("./base-adapter");

function toSoqlTimestamp(dateValue) {
  return new Date(dateValue).toISOString();
}

class SalesforceAdapter extends BaseAdapter {
  constructor(options) {
    super({
      provider: "salesforce",
      ...options,
    });
  }

  async listContacts({ tenantId, updatedAfter, limit = 200 }) {
    const whereClause = updatedAfter
      ? ` WHERE LastModifiedDate > ${toSoqlTimestamp(updatedAfter)}`
      : "";

    const query =
      "SELECT Id, FirstName, LastName, Email, LastModifiedDate FROM Contact" +
      whereClause +
      " ORDER BY LastModifiedDate ASC" +
      ` LIMIT ${limit}`;

    return this.get(tenantId, "/services/data/v61.0/query", { q: query });
  }
}

module.exports = SalesforceAdapter;

