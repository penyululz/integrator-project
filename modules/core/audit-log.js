class AuditLog {
  constructor({ maxEntries = 5_000 } = {}) {
    this.maxEntries = maxEntries;
    this.entries = [];
  }

  append(event) {
    const entry = {
      id: this.entries.length + 1,
      timestamp: new Date().toISOString(),
      ...event,
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    return entry;
  }

  list({ limit = 100, actorId, action } = {}) {
    let items = [...this.entries];

    if (actorId) {
      items = items.filter((entry) => entry.actorId === actorId);
    }

    if (action) {
      items = items.filter((entry) => entry.action === action);
    }

    return items.slice(-Math.max(1, limit)).reverse();
  }
}

module.exports = AuditLog;

