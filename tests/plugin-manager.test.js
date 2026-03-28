const test = require("node:test");
const assert = require("node:assert/strict");
const PluginManager = require("../core/plugin-manager");
const PluginAdapterInterface = require("../core/plugin-interface");

class MockAdapter extends PluginAdapterInterface {
  constructor(name) {
    super({ name });
    this.received = [];
  }

  async action(input) {
    this.received.push(input);
    return {
      ok: true,
      input,
    };
  }
}

test("PluginManager registers and runs adapter actions", async () => {
  const manager = new PluginManager();
  const adapter = new MockAdapter("mock");
  manager.register(adapter);

  await manager.initialize({
    env: "test",
  });

  const result = await manager.runAction("mock", {
    hello: "world",
  });

  assert.equal(result.ok, true);
  assert.equal(adapter.received.length, 1);
  assert.equal(manager.list().length, 1);
  assert.equal(manager.list()[0].initialized, true);
});

