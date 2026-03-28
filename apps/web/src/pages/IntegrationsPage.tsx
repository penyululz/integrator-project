import { FormEvent, useEffect, useState } from "react";
import { apiClient } from "../api";

type Integration = {
  id: string;
  name: string;
  adapter_key: string;
  status: string;
};

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [name, setName] = useState("");
  const [adapterKey, setAdapterKey] = useState("webhook");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await apiClient().get("/integrations");
      setIntegrations(response.data.integrations || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
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
          <option value="webhook">webhook</option>
          <option value="sheets">sheets</option>
          <option value="email">email</option>
          <option value="shopify">shopify</option>
          <option value="slack">slack</option>
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
    </div>
  );
}

