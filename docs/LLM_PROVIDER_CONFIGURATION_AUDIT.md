# LLM Provider Configuration Audit

**Date**: July 17, 2026

## Why Stub Mode Is Active

No `.env` file exists. `dotenv` is not installed. Server reads `process.env` directly. No API keys set → stub mode.

## Supported Providers

| Provider   | Env Variable                        | Default Model            |
| ---------- | ----------------------------------- | ------------------------ |
| OpenAI     | `OPENAI_API_KEY`                    | gpt-4o-mini              |
| Anthropic  | `ANTHROPIC_API_KEY`                 | claude-sonnet-4-20250514 |
| Gemini     | `GEMINI_API_KEY`                    | gemini-2.5-flash         |
| OpenRouter | `OPENROUTER_API_KEY`                | openai/gpt-4o-mini       |
| Groq       | `GROQ_API_KEY`                      | llama3-8b-8192           |
| Ollama     | `OLLAMA_URL` or `OLLAMA_LOCAL=true` | llama3                   |

## How to Enable

```bash
export OPENAI_API_KEY=sk-your-key
npm run dev:server
```

Or for free local AI: `export OLLAMA_LOCAL=true` (requires Ollama installed).

Backend does NOT auto-load .env files. Set vars in shell or use docker-compose.
