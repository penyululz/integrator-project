# OSS v1 Limitations and Roadmap

This project is launch-ready for OSS v1, but intentionally scoped. This document lists honest limitations and what comes next.

## Current Limitations (v1)

- UI workflow builder is form/JSON-assisted only (no drag-and-drop canvas).
- Plugin loading is local-manifest based; no remote plugin marketplace/install flow.
- Identity is JWT + provider OAuth; no SSO/SAML/SCIM or enterprise directory sync.
- Alert channels are limited to Slack incoming webhook, SMTP email, and generic webhook.
- Operator controls are single-run focused; no bulk recovery operations yet.
- Self-hosted deployment is Docker Compose-first; no official GitOps/Kubernetes package yet.

## Intentionally Post-v1

- Hosted SaaS control plane and tenant billing/metering.
- Enterprise identity federation and policy engine.
- Marketplace/distribution UX for third-party adapters.
- Full visual workflow canvas and advanced collaboration UX.
- Expanded incident tooling (on-call integrations, escalations, runbooks).

## Roadmap Themes

### Theme A: GitOps and Deployment Maturity

- container/image release hardening
- Kubernetes/Helm reference deployment
- GitOps-friendly environment/config patterns

### Theme B: Enterprise Identity and Governance

- SSO federation (OIDC/SAML)
- SCIM provisioning
- stronger org-level policy controls and audit exports

### Theme C: Ecosystem Expansion

- adapter publishing/discovery workflow
- richer SDK examples and contributor templates
- compatibility validation tooling for plugin upgrades

### Theme D: Hosted SaaS Readiness

- usage metering model evolution
- tenancy operations tooling
- hosted operational control plane

### Theme E: Operator Experience

- bulk operator actions (replay/cancel groups)
- richer run investigation UX
- stronger incident-oriented dashboards and runbooks

## How to Use This Document

- For OSS launch notes, include the "Current Limitations" section in release messaging.
- For roadmap planning, track one milestone per theme and keep each milestone operationally testable.
