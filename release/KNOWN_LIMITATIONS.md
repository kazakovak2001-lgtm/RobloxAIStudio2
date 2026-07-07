# Known Limitations — v3.0 Beta

1. **LLM Integration** — Stub responses without API keys. Real generation requires provider configuration.
2. **Memory Persistence** — In-memory only. Restarts lose stored knowledge.
3. **Studio Bridge** — Polling-based queue drain. No active WebSocket push.
4. **Roblox Studio Plugin** — Not implemented. Communication protocol is ready.
5. **Vector Search** — Knowledge retrieval is tag/category-based. No embeddings.
6. **Parallel Agent Execution** — Interface ready, execution is sequential.
7. **Token Cost Tracking** — Not implemented. Provider metrics track usage only.
8. **Frontend Integration** — Socket.io events bridge exists but frontend is not wired to all v2+ features.
