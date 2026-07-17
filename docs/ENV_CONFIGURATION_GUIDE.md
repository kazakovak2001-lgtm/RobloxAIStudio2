# Environment Configuration Guide

**Date**: July 17, 2026

## Where to Set OPENAI_API_KEY

The backend does NOT auto-load `.env` files. Set variables in your shell.

### Windows (PowerShell):

```powershell
$env:OPENAI_API_KEY = "sk-your-key-here"
npm run dev:server
```

### Windows (CMD):

```cmd
set OPENAI_API_KEY=sk-your-key-here
npm run dev:server
```

### Linux/Mac:

```bash
OPENAI_API_KEY=sk-your-key npm run dev:server
```

### Docker Compose (auto-loads .env):

```bash
cp .env.example .env
# Uncomment OPENAI_API_KEY in .env
docker compose -f deploy/docker-compose.yml up
```

## Facts

- `.env` doesn't exist (must create)
- `.env` IS gitignored (safe for secrets)
- `dotenv` not installed
- `tsx` doesn't load .env
- Server reads `process.env` directly at boot
- Set key BEFORE starting server

## Verification

Success: `[LLM] OpenAI (model: gpt-4o-mini)`
Failure: `[LLM] No LLM provider configured — stub mode`
