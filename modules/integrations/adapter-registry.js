class AdapterRegistry {
  constructor(adapters = {}) {
    this.adapters = new Map(Object.entries(adapters));
  }

  register(name, adapter) {
    this.adapters.set(name, adapter);
  }

  get(name) {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Adapter "${name}" has not been registered.`);
    }

    return adapter;
  }

  list() {
    return [...this.adapters.entries()].map(([name, adapter]) => ({
      name,
      provider: adapter.provider,
      baseUrl: adapter.baseUrl,
    }));
  }
}

module.exports = AdapterRegistry;

