class PluginManager {
  constructor({ adapters = [], logger = console } = {}) {
    this.logger = logger;
    this.adapters = new Map();
    this.context = {};

    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter) {
    if (!adapter || typeof adapter !== "object") {
      throw new Error("Adapter must be an object.");
    }

    if (!adapter.name) {
      throw new Error("Adapter must define a name.");
    }

    if (this.adapters.has(adapter.name)) {
      throw new Error(`Adapter "${adapter.name}" is already registered.`);
    }

    this.adapters.set(adapter.name, adapter);
  }

  async initialize(context = {}) {
    this.context = {
      ...context,
    };

    for (const adapter of this.adapters.values()) {
      if (typeof adapter.init === "function") {
        await adapter.init(this.context);
      }
    }
  }

  get(name) {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`Plugin adapter "${name}" is not registered.`);
    }
    return adapter;
  }

  has(name) {
    return this.adapters.has(name);
  }

  list() {
    return [...this.adapters.values()].map((adapter) =>
      typeof adapter.metadata === "function"
        ? adapter.metadata()
        : {
            name: adapter.name,
          },
    );
  }

  async runAction(name, input = {}) {
    const adapter = this.get(name);
    if (typeof adapter.action !== "function") {
      throw new Error(`Adapter "${name}" does not expose action().`);
    }

    return adapter.action(input, this.context);
  }

  async runTrigger(name, input = {}) {
    const adapter = this.get(name);
    if (typeof adapter.trigger !== "function") {
      throw new Error(`Adapter "${name}" does not expose trigger().`);
    }

    return adapter.trigger(input, this.context);
  }
}

module.exports = PluginManager;

