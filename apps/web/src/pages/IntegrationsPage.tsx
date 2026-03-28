import { FormEvent, useEffect, useState } from "react";
import { apiClient } from "../api";

type Integration = {
  id: string;
  name: string;
  adapter_key: string;
  status: string;
};

type AdapterMetadata = {
  key: string;
  displayName: string;
  description: string;
  authType: string;
  supportedTriggers: string[];
  supportedActions: string[];
};

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [adapters, setAdapters] = useState<AdapterMetadata[]>([]);
  const [name, setName] = useState("");
  const [adapterKey, setAdapterKey] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [integrationsResponse, adaptersResponse] = await Promise.all([
        apiClient().get("/integrations"),
        apiClient().get("/adapters"),
      ]);
      setIntegrations(integrationsResponse.data.integrations || []);
      const metadata = (adaptersResponse.data.adapters || []) as AdapterMetadata[];
      setAdapters(metadata);
      if (!adapterKey && metadata[0]?.key) {
        setAdapterKey(metadata[0].key);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!adapterKey) {
      return;
    }
    await apiClient().post("/integrations", {
      name,
      adapterKey,
      config: {},
    });
    setName("");
    await load();
  }

  return (
    <div>
      <h2>Integrations</h2>
      <form onSubmit={onCreate}>
        <input
          placeholder="Integration name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={adapterKey} onChange={(e) => setAdapterKey(e.target.value)}>
          {adapters.map((adapter) => (
            <option key={adapter.key} value={adapter.key}>
              {adapter.key}
            </option>
          ))}
        </select>
        <button type="submit">Create</button>
      </form>

      {loading ? <p>Loading...</p> : null}
      <ul>
        {integrations.map((integration) => (
          <li key={integration.id}>
            {integration.name} ({integration.adapter_key}) - {integration.status}
          </li>
        ))}
      </ul>

      <h3>Enabled Adapters</h3>
      <ul>
        {adapters.map((adapter) => (
          <li key={adapter.key}>
            {adapter.displayName} ({adapter.key}) - auth: {adapter.authType} - actions:{" "}
            {adapter.supportedActions.join(", ") || "none"} - triggers:{" "}
            {adapter.supportedTriggers.join(", ") || "none"}
          </li>
        ))}
      </ul>
    </div>
  );
}
