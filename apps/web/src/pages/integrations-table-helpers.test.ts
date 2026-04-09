import { describe, expect, it } from "vitest";
import type { AppConnectionRecord, CredentialRecord, IntegrationRecord } from "../api";
import {
  filterConnectionRows,
  filterCredentialRows,
  filterIntegrationRows,
  getConnectionFilterCount,
  getCredentialFilterCount,
  paginateRows,
  sortConnectionRows,
  sortCredentialRows,
  sortIntegrationRows,
  toQueryPreview,
} from "./integrations-table-helpers";

function buildApp(
  input: Partial<AppConnectionRecord> & { key: string; name: string },
): AppConnectionRecord {
  return {
    key: input.key,
    name: input.name,
    description: input.description || "",
    supportModel: input.supportModel,
    readinessTier: input.readinessTier,
    catalogCategory: input.catalogCategory,
    enabled: true,
    authType: "oauth2",
    setupMethod: input.setupMethod || "oauth2",
    setupLabel: "Connect",
    setupNotes: [],
    oauthScopes: [],
    setupFields: [],
    platformManagedFields: [],
    supportedTriggers: [],
    supportedActions: [],
    status: input.status || "not_connected",
    connected: input.connected || false,
    connection: {
      integrationId: null,
      integrationName: null,
      integrationStatus: null,
      integrationConfig: {},
      credentialMetadata: {},
      hasSensitiveIntegrationConfig: false,
      credentialStatus: null,
      hasSecretData: false,
      validationError: input.connection?.validationError || null,
      updatedAt: input.connection?.updatedAt || null,
    },
    actions: {
      canConnect: true,
      canEdit: true,
      canDisconnect: true,
      canTestConnection: true,
    },
    platformSetupMissingFields: input.platformSetupMissingFields || [],
    setupGuide: input.setupGuide,
  };
}

describe("integrations-table-helpers", () => {
  it("filters and sorts connection rows", () => {
    const rows = [
      buildApp({
        key: "slack",
        name: "Slack",
        connected: true,
        status: "connected",
        connection: { updatedAt: "2026-04-08T10:00:00.000Z" } as AppConnectionRecord["connection"],
      }),
      buildApp({
        key: "shopify",
        name: "Shopify",
        status: "invalid",
        connection: {
          updatedAt: "2026-04-07T10:00:00.000Z",
          validationError: "bad token",
        } as AppConnectionRecord["connection"],
      }),
      buildApp({
        key: "sheets",
        name: "Google Sheets",
        platformSetupMissingFields: ["GOOGLE_CLIENT_ID"],
      }),
    ];

    expect(getConnectionFilterCount(rows).connected).toBe(1);
    expect(getConnectionFilterCount(rows).needs_attention).toBe(1);
    expect(getConnectionFilterCount(rows).missing_setup).toBe(1);

    const filtered = filterConnectionRows(rows, {
      search: "google",
      filter: "all",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].key).toBe("sheets");

    const sortedByStatus = sortConnectionRows(rows, "status");
    expect(sortedByStatus.map((row) => row.key)).toEqual(["slack", "shopify", "sheets"]);
  });

  it("filters and sorts integration rows", () => {
    const rows: IntegrationRecord[] = [
      {
        id: "i1",
        name: "Slack Conn",
        adapter_key: "slack",
        status: "active",
        has_sensitive_config: true,
        created_at: "2026-04-08T11:00:00.000Z",
      },
      {
        id: "i2",
        name: "Webhook Listener",
        adapter_key: "webhook",
        status: "active",
        has_sensitive_config: false,
        created_at: "2026-04-06T11:00:00.000Z",
      },
      {
        id: "i3",
        name: "Shopify Conn",
        adapter_key: "shopify",
        status: "error",
        has_sensitive_config: true,
        created_at: "2026-04-07T11:00:00.000Z",
      },
    ];

    const filtered = filterIntegrationRows(rows, {
      search: "conn",
      status: "active",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("i1");

    const sorted = sortIntegrationRows(rows, "created_desc");
    expect(sorted[0].id).toBe("i1");
  });

  it("filters and sorts credential rows", () => {
    const rows: CredentialRecord[] = [
      {
        id: "c1",
        provider_key: "slack",
        auth_type: "oauth2",
        expires_at: null,
        credential_status: "valid",
        validation_error: null,
        has_secret_data: true,
        secret_mask: "****",
        key_version: 1,
        updated_at: "2026-04-08T09:00:00.000Z",
      },
      {
        id: "c2",
        provider_key: "shopify",
        auth_type: "oauth2",
        expires_at: null,
        credential_status: "invalid",
        validation_error: "invalid token",
        has_secret_data: true,
        secret_mask: "****",
        key_version: 1,
        updated_at: "2026-04-07T09:00:00.000Z",
      },
      {
        id: "c3",
        provider_key: "sheets",
        auth_type: "oauth2",
        expires_at: null,
        credential_status: "expired",
        validation_error: null,
        has_secret_data: true,
        secret_mask: "****",
        key_version: 1,
        updated_at: "2026-04-06T09:00:00.000Z",
      },
    ];

    expect(getCredentialFilterCount(rows).valid).toBe(1);
    expect(getCredentialFilterCount(rows).invalid).toBe(1);

    const filtered = filterCredentialRows(rows, {
      search: "invalid token",
      filter: "all",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("c2");

    const sorted = sortCredentialRows(rows, "status");
    expect(sorted.map((row) => row.id)).toEqual(["c1", "c3", "c2"]);
  });

  it("paginates rows and emits query preview", () => {
    const rows = ["a", "b", "c", "d", "e"];
    const page = paginateRows(rows, 2, 2);
    expect(page.items).toEqual(["c", "d"]);
    expect(page.totalPages).toBe(3);
    expect(page.page).toBe(2);

    expect(
      toQueryPreview({
        search: "slack",
        filter: "connected",
        sort: "status",
        page: 3,
        pageSize: 20,
      }),
    ).toContain("cursor=cursor_3");
  });
});
