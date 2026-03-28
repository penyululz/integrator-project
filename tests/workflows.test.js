const test = require("node:test");
const assert = require("node:assert/strict");
const InMemoryQueue = require("../modules/queue/in-memory-queue");
const IdempotencyStore = require("../modules/sync/idempotency-store");
const AuditLog = require("../modules/core/audit-log");
const {
  IntegrationWorkflowService,
  WORKFLOW_IDS,
} = require("../modules/sync/workflows");

function createRegistry(adapters) {
  return {
    get(name) {
      const adapter = adapters[name];
      if (!adapter) {
        throw new Error(`Missing adapter: ${name}`);
      }
      return adapter;
    },
  };
}

function waitForJob(service, jobId, timeoutMs = 2_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const job = await service.getJob(jobId);
        if (!job) {
          reject(new Error("Job not found"));
          return;
        }

        if (job.status === "succeeded" || job.status === "failed") {
          resolve(job);
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Timed out waiting for job completion"));
          return;
        }

        setTimeout(tick, 20);
      } catch (error) {
        reject(error);
      }
    };

    tick();
  });
}

test("salesforce contacts workflow maps and loads contacts", async () => {
  let loadedRows = null;
  const workflowService = new IntegrationWorkflowService({
    adapterRegistry: createRegistry({
      salesforce: {
        listContacts: async () => ({
          records: [
            {
              Id: "003000000000001AAA",
              FirstName: "Ada",
              LastName: "Lovelace",
              Email: "ada@example.com",
              LastModifiedDate: "2026-03-01T00:00:00.000Z",
            },
          ],
        }),
      },
      snowflake: {
        upsertRows: async ({ rows }) => {
          loadedRows = rows;
          return { statementHandle: "mock-1" };
        },
      },
    }),
    idempotencyStore: new IdempotencyStore(),
    queue: new InMemoryQueue({ concurrency: 1 }),
    auditLog: new AuditLog(),
  });

  const job = await workflowService.enqueue({
    workflowId: WORKFLOW_IDS.salesforceContactsToSnowflake,
    payload: {
      tenantId: "tenant-a",
    },
    requestedBy: {
      id: "tester",
      role: "admin",
    },
  });

  const finishedJob = await waitForJob(workflowService, job.id);
  assert.equal(finishedJob.status, "succeeded");
  assert.equal(finishedJob.result.loadedCount, 1);
  assert.equal(loadedRows[0].email, "ada@example.com");
});

test("jira workflow creates ServiceNow incidents", async () => {
  let incidentsCreated = 0;

  const workflowService = new IntegrationWorkflowService({
    adapterRegistry: createRegistry({
      atlassian: {
        listIssues: async () => ({
          issues: [
            {
              key: "OPS-101",
              fields: {
                summary: "Sync failure",
                status: { name: "Open" },
                priority: { name: "High" },
                created: "2026-03-10T10:00:00.000Z",
              },
            },
          ],
        }),
      },
      servicenow: {
        createIncident: async () => {
          incidentsCreated += 1;
        },
      },
    }),
    idempotencyStore: new IdempotencyStore(),
    queue: new InMemoryQueue({ concurrency: 1 }),
    auditLog: new AuditLog(),
  });

  const job = await workflowService.enqueue({
    workflowId: WORKFLOW_IDS.jiraIssuesToServiceNow,
    payload: {
      tenantId: "tenant-a",
    },
    requestedBy: {
      id: "tester",
      role: "admin",
    },
  });

  const finishedJob = await waitForJob(workflowService, job.id);
  assert.equal(finishedJob.status, "succeeded");
  assert.equal(finishedJob.result.incidentsCreated, 1);
  assert.equal(incidentsCreated, 1);
});

test("shopify->sheets+slack workflow fans out orders", async () => {
  let appendedRows = [];
  let slackMessages = [];

  const pluginManager = {
    get(name) {
      if (name === "shopify") {
        return {
          trigger: async () => ({
            orders: [
              {
                id: "1",
                order_number: "1001",
                email: "buyer@example.com",
                total_price: "99.00",
                currency: "USD",
                created_at: "2026-03-20T00:00:00.000Z",
              },
            ],
          }),
        };
      }

      if (name === "google-sheets") {
        return {
          action: async ({ values }) => {
            appendedRows = values;
            return {
              updates: {
                updatedRows: values.length,
              },
            };
          },
        };
      }

      if (name === "slack") {
        return {
          action: async (payload) => {
            slackMessages.push(payload);
            return {
              ok: true,
            };
          },
        };
      }

      throw new Error(`Unknown plugin ${name}`);
    },
  };

  const workflowService = new IntegrationWorkflowService({
    adapterRegistry: createRegistry({}),
    pluginManager,
    config: {
      integrations: {
        googleSheets: {
          spreadsheetId: "sheet-1",
          range: "Orders!A:F",
        },
        sampleWorkflow: {
          slackChannel: "#orders",
        },
      },
    },
    idempotencyStore: new IdempotencyStore(),
    queue: new InMemoryQueue({ concurrency: 1 }),
    auditLog: new AuditLog(),
  });

  const job = await workflowService.enqueue({
    workflowId: WORKFLOW_IDS.shopifyOrdersToSheetsAndSlack,
    payload: {
      tenantId: "tenant-a",
      since: "2026-03-01T00:00:00.000Z",
    },
    requestedBy: {
      id: "tester",
      role: "admin",
    },
  });

  const finishedJob = await waitForJob(workflowService, job.id);
  assert.equal(finishedJob.status, "succeeded");
  assert.equal(finishedJob.result.sheetRowsAppended, 1);
  assert.equal(appendedRows.length, 1);
  assert.equal(slackMessages.length, 1);
});
