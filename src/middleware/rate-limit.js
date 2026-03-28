function createRateLimiter({ windowMs = 60_000, maxRequests = 240 } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = buckets.get(key) || [];
    const recent = bucket.filter((timestamp) => now - timestamp < windowMs);

    if (recent.length >= maxRequests) {
      res.status(429).json({
        error: "Too many requests",
        detail: "Request limit exceeded for the current window.",
      });
      return;
    }

    recent.push(now);
    buckets.set(key, recent);
    next();
  };
}

module.exports = {
  createRateLimiter,
};

