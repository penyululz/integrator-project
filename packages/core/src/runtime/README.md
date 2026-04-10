# Runtime Composition Layer

This folder centralizes engine bootstrap concerns that should stay portable:

- `adapter-config.ts`: adapter init config + manifest base path resolution
- `module-catalog.ts`: canonical module inventory and layer classification
- `module-registration.ts`: include/exclude module resolution and env-driven toggles

Keep business logic in domain services (`auth`, `workflow`, `alerts`, `retention`, `facility`, `maintenance`, `calendar`, `communication`, `file-storage`) and keep this layer focused on composition only.
