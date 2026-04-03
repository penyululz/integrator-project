# Setup Guide System

This document describes how Integrator models, serves, and presents app setup guidance for first-time success.

## Why This Exists

The setup guide system moves connection knowledge into product UX so users can connect apps without searching external docs or editing `.env` for workspace-level credentials.

## Setup Guide Model

Each app definition includes a structured setup guide with:

- `purpose` (what this app connection is for)
- `beforeYouStart` (requirements and prerequisites)
- `steps` (ordered setup instructions)
- `requiredFieldKeys` (fields that must be provided)
- `troubleshooting` (common failure causes and fixes)
- `testChecklist` (how to verify connection quality)
- `nextTemplateIds` (recommended next automations)

Connection definitions also include:

- `setupMethod` (`oauth2`, `form`, `none`)
- `setupFields` (typed inputs and targets)
- `platformManagedFields` (platform-level env-dependent fields)

## Setup Experience Stages

Integrator setup UX follows this sequence:

1. Overview
2. Requirements
3. Input
4. Test
5. Success

This wizard-first model is preferred over long static documentation pages.

## API Flow

App setup metadata is built in catalog services and exposed through apps API responses.

Primary route:

- `GET /api/v1/apps`

Returned app metadata includes:

- setup guide payload
- setup fields
- platform requirements
- trust state signals
- `platformSetupMissingFields`

Additional setup routes:

- `PUT /api/v1/apps/:appKey/connection` (create/update connection)
- `POST /api/v1/apps/:appKey/test` (test connection)
- `DELETE /api/v1/apps/:appKey/connection` (disconnect)

## Trust States in UX

The UI should communicate connection trust with clear states:

- `connected`
- `needs_attention`
- `missing_setup`
- `limited`

These states combine credential status, integration state, and platform setup readiness.

## Platform vs Workspace Configuration

### Platform-Level (`.env`)

Reserved for runtime infrastructure and platform-managed app registration values:

- database and redis connectivity
- JWT and encryption keys
- OAuth app registration values

### Workspace/User-Level (Web UI)

Configured in guided setup and stored via encrypted credential pathways:

- API keys
- tokens
- app metadata (for example, default channel or phone number ID)

## UX Principles for Setup

- reduce friction and context switching
- avoid requiring external docs for baseline setup
- explain exactly where each field value comes from
- make "what next" explicit after successful connection
- route users directly into recommended starter templates

## Post-Connect Routing

After successful connection, users should be guided to:

1. a relevant starter template
2. builder test/simulator path
3. runs timeline for success validation

This closes the loop from connection -> automation -> observable result.
