# Versioning

**Reference:** See `AI_DEVELOPMENT_GOVERNANCE.md` Section 6 for the complete version workflow.

---

## Version Scheme

This project uses semantic-inspired versioning:

```
vMAJOR.MINOR[-label]
```

- **MAJOR** — Breaking architectural changes (rare, requires full re-validation)
- **MINOR** — Feature additions, improvements, new modules
- **Label** — Descriptive suffix (e.g., `v1.8-runtime`, `v2.0.0-distributed`)

---

## Version History

| Version       | Label             | Description                          |
| ------------- | ----------------- | ------------------------------------ |
| v0.1          | clean-baseline    | Initial repository cleanup           |
| v0.2–v0.3     | orchestrator-core | AgentRegistry, BaseAgent, pipeline   |
| v0.4–v0.5     | llm-wiring        | LLM providers, agent implementations |
| v0.6          | evaluation        | Evaluation layer                     |
| v0.7          | memory            | Shared project memory                |
| v0.8          | planning          | Autonomous planning engine           |
| v0.9          | generation        | Game generation pipeline             |
| v0.95–v0.98   | assembly          | Project assembly system              |
| v0.99         | governance        | CI/CD governance                     |
| v1.0–v1.3     | compiler          | Production compiler platform         |
| v1.4          | eventsource       | Event-sourced persistence            |
| v1.5          | plugins           | Plugin SDK                           |
| v1.6          | studio            | Roblox Studio integration            |
| v1.6.1–v1.6.2 | enforcement       | Architecture boundary enforcement    |
| v1.7          | validated         | Full stack validation pass           |
| v1.7.0        | boundary-firewall | Import boundary firewall             |
| v1.8          | runtime           | Runtime execution layer              |
| v1.9          | governance        | Development governance standards     |
| v2.0.0        | distributed       | Distributed execution                |
| v2.1.0        | analytics         | AI execution analytics               |
| v2.2.0        | agent-autonomy    | Adaptive agent selection             |

---

## Version Completion Criteria

A version is NOT complete until:

1. All code compiles (0 TS errors)
2. Boundary firewall passes (0 violations)
3. Architecture validator passes (STABLE)
4. Version report generated
5. Commit tagged

See `AI_DEVELOPMENT_GOVERNANCE.md` Section 7 for the full validation checklist.
