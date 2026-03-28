const WORKFLOW_IDS = Object.freeze({
  salesforceContactsToSnowflake: "salesforce-contacts-to-snowflake",
  jiraIssuesToServiceNow: "jira-issues-to-servicenow",
  shopifyOrdersToSnowflake: "shopify-orders-to-snowflake",
  shopifyOrdersToSheetsAndSlack: "shopify-orders-to-sheets-and-slack",
});

function mapSalesforceContactToRow(contact) {
  return {
    id: contact.Id,
    first_name: contact.FirstName || null,
    last_name: contact.LastName || null,
    email: contact.Email || null,
    last_modified_at: contact.LastModifiedDate || null,
  };
}

function mapShopifyOrderToRow(order) {
  return {
    id: order.id,
    order_number: order.order_number,
    email: order.email || null,
    total_price: order.total_price || null,
    created_at: order.created_at || null,
    updated_at: order.updated_at || null,
    currency: order.currency || null,
  };
}

class IntegrationWorkflowService {
  constructor({
    adapterRegistry,
    pluginManager = null,
    config = {},
    idempotencyStore,
    queue,
    auditLog,
  }) {
    this.adapterRegistry = adapterRegistry;
    this.pluginManager = pluginManager;
    this.config = config;
    this.idempotencyStore = idempotencyStore;
    this.queue = queue;
    this.auditLog = auditLog;

    if (typeof this.queue.setProcessor === "function") {
      this.queue.setProcessor(async (job) =>
        this.run(job.name, job.payload, job.requestedBy),
      );
    }
  }

  listWorkflows() {
    return Object.values(WORKFLOW_IDS);
  }

  async getJob(jobId) {
    return this.queue.getJob(jobId);
  }

  async listJobs(limit = 100) {
    return this.queue.listJobs(limit);
  }

  async enqueue({ workflowId, payload, requestedBy }) {
    if (!this.listWorkflows().includes(workflowId)) {
      throw new Error(`Unsupported workflow "${workflowId}".`);
    }

    return this.queue.enqueue({
      name: workflowId,
      payload,
      requestedBy,
    });
  }

  async run(workflowId, payload, requestedBy) {
    if (workflowId === WORKFLOW_IDS.salesforceContactsToSnowflake) {
      return this.runSalesforceContactsToSnowflake(payload, requestedBy);
    }

    if (workflowId === WORKFLOW_IDS.jiraIssuesToServiceNow) {
      return this.runJiraIssuesToServiceNow(payload, requestedBy);
    }

    if (workflowId === WORKFLOW_IDS.shopifyOrdersToSnowflake) {
      return this.runShopifyOrdersToSnowflake(payload, requestedBy);
    }

    if (workflowId === WORKFLOW_IDS.shopifyOrdersToSheetsAndSlack) {
      return this.runShopifyOrdersToSheetsAndSlack(payload, requestedBy);
    }

    throw new Error(`Workflow handler missing for "${workflowId}".`);
  }

  async runSalesforceContactsToSnowflake(payload, requestedBy) {
    const { tenantId, since, limit } = payload;
    this.assertTenant(tenantId);

    const key = `${WORKFLOW_IDS.salesforceContactsToSnowflake}:${tenantId}:${since || "all"}`;
    if (!(await this.idempotencyStore.reserve(key))) {
      return {
        status: "skipped",
        reason: "Duplicate sync request blocked by idempotency guard.",
      };
    }

    try {
      const salesforce = this.adapterRegistry.get("salesforce");
      const snowflake = this.adapterRegistry.get("snowflake");
      const contactsResponse = await salesforce.listContacts({
        tenantId,
        updatedAfter: since,
        limit: Number(limit) || 200,
      });
      const records = contactsResponse.records || [];
      const rows = records.map(mapSalesforceContactToRow);

      await snowflake.upsertRows({
        tenantId,
        tableName: "SALESFORCE_CONTACTS",
        rows,
        mergeKey: "id",
        idempotencyKey: key,
      });

      const result = {
        status: "completed",
        sourceCount: records.length,
        loadedCount: rows.length,
      };

      this.auditLog.append({
        action: WORKFLOW_IDS.salesforceContactsToSnowflake,
        actorId: requestedBy?.id || "system",
        tenantId,
        metadata: result,
      });

      return result;
    } finally {
      await this.idempotencyStore.release(key);
    }
  }

  async runJiraIssuesToServiceNow(payload, requestedBy) {
    const { tenantId, jql, maxResults } = payload;
    this.assertTenant(tenantId);

    const key = `${WORKFLOW_IDS.jiraIssuesToServiceNow}:${tenantId}:${jql || "default"}`;
    if (!(await this.idempotencyStore.reserve(key))) {
      return {
        status: "skipped",
        reason: "Duplicate sync request blocked by idempotency guard.",
      };
    }

    try {
      const atlassian = this.adapterRegistry.get("atlassian");
      const serviceNow = this.adapterRegistry.get("servicenow");

      const response = await atlassian.listIssues({
        tenantId,
        jql,
        maxResults: Number(maxResults) || 50,
      });

      const issues = response.issues || [];
      for (const issue of issues) {
        await serviceNow.createIncident({
          tenantId,
          shortDescription: `[Jira ${issue.key}] ${issue.fields?.summary || "No summary"}`,
          description: JSON.stringify(
            {
              key: issue.key,
              status: issue.fields?.status?.name || null,
              priority: issue.fields?.priority?.name || null,
              created: issue.fields?.created || null,
            },
            null,
            2,
          ),
          externalId: issue.key,
        });
      }

      const result = {
        status: "completed",
        sourceCount: issues.length,
        incidentsCreated: issues.length,
      };

      this.auditLog.append({
        action: WORKFLOW_IDS.jiraIssuesToServiceNow,
        actorId: requestedBy?.id || "system",
        tenantId,
        metadata: result,
      });

      return result;
    } finally {
      await this.idempotencyStore.release(key);
    }
  }

  async runShopifyOrdersToSnowflake(payload, requestedBy) {
    const { tenantId, since, limit } = payload;
    this.assertTenant(tenantId);

    const key = `${WORKFLOW_IDS.shopifyOrdersToSnowflake}:${tenantId}:${since || "all"}`;
    if (!(await this.idempotencyStore.reserve(key))) {
      return {
        status: "skipped",
        reason: "Duplicate sync request blocked by idempotency guard.",
      };
    }

    try {
      const shopify = this.adapterRegistry.get("shopify");
      const snowflake = this.adapterRegistry.get("snowflake");

      const response = await shopify.listOrders({
        tenantId,
        updatedAfter: since,
        limit: Number(limit) || 100,
      });
      const orders = response.orders || [];
      const rows = orders.map(mapShopifyOrderToRow);

      await snowflake.upsertRows({
        tenantId,
        tableName: "SHOPIFY_ORDERS",
        rows,
        mergeKey: "id",
        idempotencyKey: key,
      });

      const result = {
        status: "completed",
        sourceCount: orders.length,
        loadedCount: rows.length,
      };

      this.auditLog.append({
        action: WORKFLOW_IDS.shopifyOrdersToSnowflake,
        actorId: requestedBy?.id || "system",
        tenantId,
        metadata: result,
      });

      return result;
    } finally {
      await this.idempotencyStore.release(key);
    }
  }

  async runShopifyOrdersToSheetsAndSlack(payload, requestedBy) {
    const { tenantId, since, limit = 25, spreadsheetId, range, slackChannel } =
      payload;
    this.assertTenant(tenantId);

    if (!this.pluginManager) {
      throw new Error(
        "Plugin manager is not configured for shopify-orders-to-sheets-and-slack.",
      );
    }

    const key = `${WORKFLOW_IDS.shopifyOrdersToSheetsAndSlack}:${tenantId}:${since || "all"}`;
    if (!(await this.idempotencyStore.reserve(key))) {
      return {
        status: "skipped",
        reason: "Duplicate sync request blocked by idempotency guard.",
      };
    }

    try {
      const shopify = this.pluginManager.get("shopify");
      const googleSheets = this.pluginManager.get("google-sheets");
      const slack = this.pluginManager.get("slack");

      const source = await shopify.trigger({
        since,
        limit: Number(limit) || 25,
      });
      const orders = source.orders || [];

      if (orders.length === 0) {
        const result = {
          status: "completed",
          sourceCount: 0,
          sheetRowsAppended: 0,
          slackMessagesSent: 0,
        };

        this.auditLog.append({
          action: WORKFLOW_IDS.shopifyOrdersToSheetsAndSlack,
          actorId: requestedBy?.id || "system",
          tenantId,
          metadata: result,
        });

        return result;
      }

      const effectiveSpreadsheetId =
        spreadsheetId || this.config.integrations?.googleSheets?.spreadsheetId;
      const effectiveRange =
        range || this.config.integrations?.googleSheets?.range || "Orders!A:F";
      const effectiveSlackChannel =
        slackChannel ||
        this.config.integrations?.sampleWorkflow?.slackChannel ||
        this.config.integrations?.slack?.defaultChannel;

      const values = orders.map((order) => [
        String(order.id || ""),
        String(order.order_number || ""),
        String(order.email || ""),
        String(order.total_price || ""),
        String(order.currency || ""),
        String(order.created_at || ""),
      ]);

      await googleSheets.action({
        spreadsheetId: effectiveSpreadsheetId,
        range: effectiveRange,
        values,
      });

      let slackMessagesSent = 0;
      for (const order of orders) {
        await slack.action({
          channel: effectiveSlackChannel,
          text: `New Shopify order #${order.order_number || order.id} (${order.total_price || "N/A"} ${order.currency || ""})`,
        });
        slackMessagesSent += 1;
      }

      const result = {
        status: "completed",
        sourceCount: orders.length,
        sheetRowsAppended: values.length,
        slackMessagesSent,
      };

      this.auditLog.append({
        action: WORKFLOW_IDS.shopifyOrdersToSheetsAndSlack,
        actorId: requestedBy?.id || "system",
        tenantId,
        metadata: result,
      });

      return result;
    } finally {
      await this.idempotencyStore.release(key);
    }
  }

  assertTenant(tenantId) {
    if (!tenantId || typeof tenantId !== "string") {
      throw new Error("tenantId is required and must be a string.");
    }
  }
}

module.exports = {
  IntegrationWorkflowService,
  WORKFLOW_IDS,
};
