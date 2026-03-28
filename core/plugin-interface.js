class PluginAdapterInterface {
  constructor({ name, version = "1.0.0", category = "integration" } = {}) {
    if (!name) {
      throw new Error("PluginAdapterInterface requires a name.");
    }

    this.name = name;
    this.version = version;
    this.category = category;
    this.initialized = false;
  }

  async init(_context = {}) {
    this.initialized = true;
  }

  async trigger(_input = {}, _context = {}) {
    throw new Error(`Adapter "${this.name}" does not implement trigger().`);
  }

  async action(_input = {}, _context = {}) {
    throw new Error(`Adapter "${this.name}" does not implement action().`);
  }

  capabilities() {
    return {
      trigger: true,
      action: true,
    };
  }

  metadata() {
    return {
      name: this.name,
      version: this.version,
      category: this.category,
      initialized: this.initialized,
      capabilities: this.capabilities(),
    };
  }
}

module.exports = PluginAdapterInterface;

