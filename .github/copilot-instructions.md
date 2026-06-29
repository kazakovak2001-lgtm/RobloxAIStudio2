Roblox AI Studio – Copilot Instructions

Project Overview

This is Roblox AI Studio, a SaaS platform for AI-assisted game development for Roblox.

The goal is to build a system that transforms natural language prompts into fully designed Roblox games including:

- game design
- architecture
- Lua scripts
- UI systems
- maps and gameplay logic
- testing and optimization
- export to Roblox Studio

---

Core Vision

This is not a simple code generator.

This is an AI orchestration platform (AI OS for game development).

The system is built around:

- AI Agents (Planner, Designer, Builder, Lua, UI, QA)
- AI Pipeline Engine
- Multi-provider AI system
- Real-time execution monitoring
- Prompt-driven game generation

---

Current Architecture

Frontend:

- React + TypeScript + Vite
- Tailwind CSS
- Modular component system

Backend:

- Node.js / FastAPI (REST API)
- AI Orchestrator
- Multi-agent pipeline engine
- Project management system

AI Layer:

- AI Manager (multi-provider support)
- AI Router (model selection logic)
- Prompt Manager (separated prompt system)
- Context Manager (minimal context per agent)
- Memory system (short + long term)
- Streaming execution (SSE/WebSocket)

---

Development Rules

Always follow:

- Clean Architecture
- Separation of concerns
- Modular design
- Type safety (TypeScript)
- No monolithic code
- Extend existing modules instead of rewriting them

Never:

- refactor entire architecture without explicit instruction
- merge frontend and backend logic
- bypass AI pipeline structure
- remove agent separation

---

AI Agent Behavior Model

Each AI agent has:

- clear responsibility
- defined input schema
- defined output schema
- isolated context
- ability to iterate

Agents must not overlap responsibilities.

---

Development Philosophy

This project prioritizes:

- scalability
- modular AI orchestration
- long-term extensibility
- production-ready SaaS architecture

Not:

- quick prototypes
- single-file solutions
- hardcoded logic

---

Copilot Role

GitHub Copilot is used as:

- implementation assistant
- boilerplate generator
- low-level coding support

It must NOT:

- redesign architecture
- change system boundaries
- modify AI pipeline logic

---

Final Goal

A production SaaS platform that can:

- generate complete Roblox games from text prompts
- manage AI agents autonomously
- stream generation process in real time
- export usable Roblox Studio projects