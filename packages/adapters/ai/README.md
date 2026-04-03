# AI Adapter

This adapter provides AI-first workflow actions for content generation, rewriting,
summarization, transformation, classification, key-point extraction, and a lightweight
agent loop foundation.

Actions:

- `generateContent`
- `rewriteContent`
- `summarizeText`
- `summarizeUrl`
- `transformContent`
- `extractKeyPoints`
- `classifyText`
- `runAgent`

Credential model:

- `api_key` (optional for local fallback mode)
- Uses OpenAI-compatible endpoint when `apiKey` is present.
- Falls back to deterministic heuristic mode when no key is configured.
