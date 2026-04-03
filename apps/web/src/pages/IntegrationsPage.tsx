import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  completeAdapterAuth,
  createIntegration,
  disconnectCredential,
  listAdapters,
  listCredentials,
  listIntegrations,
  startAdapterAuth,
  type AdapterMetadata,
  type CredentialRecord,
  type InstalledAdapter,
  type IntegrationRecord,
} from "../api";

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [adapters, setAdapters] = useState<AdapterMetadata[]>([]);
  const [installedAdapters, setInstalledAdapters] = useState<InstalledAdapter[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [name, setName] = useState("");
  const [adapterKey, setAdapterKey] = useState("");
  const [authAdapterKey, setAuthAdapterKey] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectUri = `${window.location.origin}/integrations`;

  async function load() {
    setLoading(true);
    try {
      const [integrationList, adapterPayload, credentialList] = await Promise.all([
        listIntegrations(),
        listAdapters(),
        listCredentials(),
      ]);
      setIntegrations(integrationList);
      setAdapters(adapterPayload.adapters);
      setInstalledAdapters(adapterPayload.installedAdapters);
      setCredentials(credentialList);

      const defaultAdapterKey = adapterPayload.adapters[0]?.key || "";
      if (!adapterKey && defaultAdapterKey) {
        setAdapterKey(defaultAdapterKey);
      }
      if (!authAdapterKey && defaultAdapterKey) {
        setAuthAdapterKey(defaultAdapterKey);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const connectedProviders = useMemo(() => {
    return credentials.reduce<Record<string, CredentialRecord>>((acc, credential) => {
      acc[credential.provider_key] = credential;
      return acc;
    }, {});
  }, [credentials]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!adapterKey || !name.trim()) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      await createIntegration({
        adapterKey,
        name,
      });
      setName("");
      setMessage("Integration added. Next: connect credentials if needed, then open Workflows.");
      await load();
    } catch (createError) {
      setError((createError as Error).message);
    }
  }

  async function onStartOAuth(adapter: string) {
    setError(null);
    setMessage(null);

    try {
      const response = await startAdapterAuth({
        adapterKey: adapter,
        redirectUri,
      });
      if (response.authUrl) {
        window.open(response.authUrl, "_blank", "noopener,noreferrer");
        setMessage(
          `Opened provider login for ${adapter}. Complete consent, then paste callback code below.`,
        );
      } else {
        setMessage(`Auth started for ${adapter}.`);
      }
    } catch (authError) {
      setError((authError as Error).message);
    }
  }

  async function onCompleteOAuth(event: FormEvent) {
    event.preventDefault();
    if (!authAdapterKey || !authCode.trim()) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      await completeAdapterAuth({
        adapterKey: authAdapterKey,
        code: authCode,
        redirectUri,
      });
      setAuthCode("");
      setMessage("Connection completed. You can now use this adapter in workflows.");
      await load();
    } catch (authError) {
      setError((authError as Error).message);
    }
  }

  async function onDisconnect(providerKey: string) {
    setError(null);
    setMessage(null);

    try {
      await disconnectCredential(providerKey);
      setMessage(`Disconnected credentials for ${providerKey}.`);
      await load();
    } catch (disconnectError) {
      setError((disconnectError as Error).message);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Integrations and Connections</h2>
      <p>
        Step 1 of first success: connect at least one provider, then use a template to
        create and run your first workflow.
      </p>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>First Success Guide</h3>
        <ol style={{ margin: "0 0 8px", paddingLeft: 20 }}>
          <li>Create an integration record for the adapter you want to test.</li>
          <li>Connect provider credentials (OAuth/API key) if required.</li>
          <li>Go to Workflows and start from a template.</li>
          <li>Trigger a run and verify logs in the Runs page.</li>
        </ol>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/workflows">Open Templates</Link>
          <Link to="/runs">Open Runs</Link>
          <Link to="/onboarding">Onboarding Checklist</Link>
        </div>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Add Integration</h3>
        <form onSubmit={onCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Integration name (for example: Shopify Prod)"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <select value={adapterKey} onChange={(event) => setAdapterKey(event.target.value)}>
            {adapters.map((adapter) => (
              <option key={adapter.key} value={adapter.key}>
                {adapter.displayName}
              </option>
            ))}
          </select>
          <button type="submit">Add Integration</button>
        </form>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Connect Provider Account</h3>
        <p style={{ marginTop: 0 }}>
          For OAuth adapters, open provider login, finish consent, then paste callback code.
        </p>
        <p style={{ marginTop: 0, fontSize: 13, color: "#555" }}>Redirect URI: {redirectUri}</p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={authAdapterKey} onChange={(event) => setAuthAdapterKey(event.target.value)}>
            {adapters.map((adapter) => (
              <option key={adapter.key} value={adapter.key}>
                {adapter.displayName}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void onStartOAuth(authAdapterKey)}>
            Open Provider Login
          </button>
        </div>

        <form
          onSubmit={onCompleteOAuth}
          style={{
            marginTop: 10,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label>
            Callback code
            <input
              value={authCode}
              onChange={(event) => setAuthCode(event.target.value)}
              style={{ marginLeft: 8, minWidth: 240 }}
            />
          </label>
          <button type="submit">Finish Connection</button>
        </form>
      </section>

      {loading ? <p>Loading...</p> : null}
      {message ? <p style={{ color: "#0f5132" }}>{message}</p> : null}
      {error ? <p style={{ color: "#b42318" }}>{error}</p> : null}

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Installed Adapters</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Adapter</th>
              <th align="left">Enabled</th>
              <th align="left">Auth</th>
              <th align="left">Triggers</th>
              <th align="left">Actions</th>
              <th align="left">Connection</th>
              <th align="left">Controls</th>
            </tr>
          </thead>
          <tbody>
            {installedAdapters.map((installed) => {
              const runtimeMetadata = adapters.find((adapter) => adapter.key === installed.key);
              const credential = connectedProviders[installed.key];
              const credentialStatus = credential?.credential_status || "invalid";
              const isConnected = Boolean(credential?.has_secret_data);
              const authType = runtimeMetadata?.authType || installed.manifest.auth.type;
              const statusLabel = !credential
                ? "not connected"
                : credentialStatus === "valid"
                  ? "connected"
                  : credentialStatus;

              return (
                <tr key={installed.key} style={{ borderTop: "1px solid #eee" }}>
                  <td>{runtimeMetadata?.displayName || installed.manifest.displayName}</td>
                  <td>{installed.enabled ? "enabled" : "disabled"}</td>
                  <td>{authType}</td>
                  <td>
                    {(runtimeMetadata?.supportedTriggers || installed.manifest.supportedTriggers).join(", ") ||
                      "none"}
                  </td>
                  <td>
                    {(runtimeMetadata?.supportedActions || installed.manifest.supportedActions).join(", ") ||
                      "none"}
                  </td>
                  <td>
                    <div>{statusLabel}</div>
                    {credential?.validation_error ? (
                      <div style={{ color: "#b42318", fontSize: 12 }}>
                        {credential.validation_error}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {authType !== "none" ? (
                        <button type="button" onClick={() => void onStartOAuth(installed.key)}>
                          {isConnected ? "Reconnect" : "Connect"}
                        </button>
                      ) : null}
                      {isConnected ? (
                        <button type="button" onClick={() => void onDisconnect(installed.key)}>
                          Disconnect
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Configured Integrations</h3>
        {integrations.length === 0 ? (
          <p style={{ marginTop: 0 }}>
            No integrations yet. Add one above, connect credentials, then create your first
            workflow from a template.
          </p>
        ) : null}
        <ul>
          {integrations.map((integration) => (
            <li key={integration.id}>
              {integration.name} ({integration.adapter_key}) - {integration.status}
            </li>
          ))}
        </ul>
        {integrations.length === 0 ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link to="/workflows">Browse Templates</Link>
            <Link to="/onboarding">Open Onboarding</Link>
          </div>
        ) : null}
      </section>

      <section style={{ border: "1px solid #d0d0d0", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Credential Health</h3>
        {credentials.length === 0 ? (
          <p style={{ marginBottom: 0 }}>
            No connected credentials yet. Use "Connect" in Installed Adapters and complete
            provider auth to continue.
          </p>
        ) : (
          <ul style={{ marginBottom: 0 }}>
            {credentials.map((credential) => (
              <li key={credential.id}>
                {credential.provider_key}: {credential.credential_status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
