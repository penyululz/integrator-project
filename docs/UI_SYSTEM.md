# UI System: Integrator Platform

This document defines the current UI/UX system used by Integrator and the product interaction patterns expected across pages.

## Core Principles

### Flow-First

- prioritize end-to-end outcomes over isolated configuration forms
- guide users through: connect app -> build automation -> test -> inspect result

### Agent-First

- AI and agent actions are first-class workflow building blocks
- agent execution should be explainable in plain language

### Explain Everything

- each state should answer:
  - what happened
  - why it happened
  - what to do next

### Progressive Complexity

- show essentials first
- reveal advanced controls (JSON, raw mappings, developer adapters) only when needed

## Builder UX System

### Canvas

- free-form visual canvas with:
  - draggable nodes
  - edge rendering
  - branch path differentiation
  - zoom/pan/minimap
- visual hierarchy:
  - trigger -> action/AI/branch/delay -> result

### Node Types

- trigger node
- action node
- branch node
- delay node
- AI/agent node
- result node

### Inspector Panel

- selected node opens inspector for detailed editing
- canvas focuses on structure and readability
- inspector handles full config depth

## Agent UX

### Reasoning Timeline

- represented as sequential blocks:
  - Thinking
  - Tool Call
  - Tool Result
  - Decision
- each block supports summary + expanded details

### Memory Visibility

- workflow/run memory surfaced in builder and runs contexts
- memory state is visible and auditable, not hidden internals

### Tool Explanation

- tool selections can show:
  - why this tool
  - confidence level
  - fallback/blocked rationale

### Approval States

- visual states include:
  - awaiting approval
  - approved and resumed
  - denied
- approval-linked runs should provide direct navigation to approvals

## Runs UX

- timeline-first run detail
- clear status badges (queued/running/retrying/waiting/failed/dead-lettered/succeeded)
- explicit retry and approval visibility
- minimal ambiguity on next action

## Catalog UX

- app cards with:
  - icon/name/description
  - readiness tier
  - connection status
  - setup method and primary CTA
- support-model awareness:
  - native, generic, community

## Onboarding UX

- goal-first onboarding and starter templates
- strong first-success path with in-app testing and result handoff
- copy favors outcome language over internal platform terms

## UX Quality Rules

- one primary CTA per section
- consistent spacing, typography hierarchy, and state labels
- clear empty/loading/error states on every key surface
- avoid hidden dead ends; provide recovery and return paths
