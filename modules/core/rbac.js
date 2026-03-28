const ROLE_PERMISSIONS = {
  admin: new Set([
    "integration:read",
    "integration:manage",
    "sync:read",
    "sync:run",
    "audit:read",
  ]),
  operator: new Set(["integration:read", "sync:read", "sync:run"]),
  viewer: new Set(["integration:read", "sync:read"]),
};

function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || new Set();
}

function authorize(permission) {
  return (req, res, next) => {
    const role = req.user?.role || "viewer";
    const grantedPermissions = permissionsForRole(role);

    if (!grantedPermissions.has(permission)) {
      res.status(403).json({
        error: "Forbidden",
        detail: `Role "${role}" is missing permission "${permission}".`,
      });
      return;
    }

    next();
  };
}

module.exports = {
  authorize,
  permissionsForRole,
  ROLE_PERMISSIONS,
};

