const { randomUUID } = require("node:crypto");

function requestContext() {
  return (req, res, next) => {
    const requestId = req.get("x-correlation-id") || randomUUID();
    const tenantId = req.get("x-tenant-id") || null;

    req.context = {
      requestId,
      tenantId,
      startedAt: Date.now(),
    };

    req.user = {
      id: req.get("x-user-id") || "anonymous",
      role: req.get("x-user-role") || "viewer",
    };

    res.setHeader("x-request-id", requestId);
    next();
  };
}

module.exports = {
  requestContext,
};

