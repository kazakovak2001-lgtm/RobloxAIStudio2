# Roblox AI Studio DevKit Documentation

**Version**: 1.3.3
**Last Updated**: 2026-07-13

Welcome to the Roblox AI Studio DevKit documentation. This is the central hub for all project documentation, architecture guides, development resources, and migration status.

---

## Quick Links

- **[Architecture Overview](#architecture)** - System architecture and design
- **[Development Guide](#development)** - Setup and coding standards
- **[API Documentation](docs/API.md)** - REST API reference
- **[Migration Status](#migration-status)** - Current refactoring progress
- **[Audit Reports](#audit-reports)** - Architecture and technical debt audits

---

## Project Overview

Roblox AI Studio DevKit is an enterprise-grade AI orchestration platform that transforms natural language prompts into complete, validated Roblox game blueprints. It features:

- **AI Agent Pipeline**: 13 specialized agents for game generation
- **Real-time Streaming**: SSE and Socket.io for live updates
- **Clean Architecture**: Strict separation of concerns
- **Multi-Provider Support**: Anthropic, OpenAI, Google, Ollama
- **Roblox Studio Integration**: Plugin for direct Studio sync
- **Production-Ready**: Caching, retry logic, validation, error handling

**Technology Stack**:

- Frontend: React 18, Vite, TailwindCSS
- Backend: Node.js, Express, TypeScript 5.6
- Database: Prisma ORM
- AI: Multi-provider LLM integration
- Real-time: Socket.io, SSE

---

## Architecture

### Core Architecture

- **[System Architecture](docs/ARCHITECTURE.md)** - Complete system architecture overview
- **[Agent Architecture](docs/AGENT_ARCHITECTURE.md)** - AI agent hierarchy and design
- **[API Architecture](docs/API.md)** - REST API design and endpoints

### Architecture Decision Records (ADRs)

Located in [docs/adr/](docs/adr/):

- [ADR-0001: Template](docs/adr/ADR-0001-template.md)
- [ADR-0002: Orchestrator Core](docs/adr/ADR-0002-orchestrator-core.md)
- [ADR-0003: AI Router](docs/adr/ADR-0003-ai-router.md)
- [ADR-0004: Evaluation Layer](docs/adr/ADR-0004-evaluation-layer.md)
- [ADR-0005: Shared Project Memory](docs/adr/ADR-0005-shared-project-memory.md)
- [ADR-0006: Autonomous Planning](docs/adr/ADR-0006-autonomous-planning.md)
- [ADR-0007: Generation Pipeline](docs/adr/ADR-0007-generation-pipeline.md)
- [ADR-0008: Project Assembly](docs/adr/ADR-0008-project-assembly.md)

---

## Development

### Getting Started

- **[Development Setup](docs/development/DEVELOPMENT_SETUP.md)** - Environment setup guide (TODO)
- **[Development Workflow](docs/development/DEVELOPMENT_WORKFLOW.md)** - Development process and workflow
- **[Validation Process](docs/development/VALIDATION_PROCESS.md)** - Code validation and testing
- **[Architecture Rules](docs/development/ARCHITECTURE_RULES.md)** - Architectural guidelines

### Standards

- **[Coding Standards](docs/development/CODING_STANDARDS.md)** - Code style and conventions (TODO)
- **[Contributing](docs/development/CONTRIBUTING.md)** - Contribution guidelines (TODO)
- **[Versioning](docs/development/VERSIONING.md)** - Version management

### Governance

Located in [docs/governance/](docs/governance/):

- [AI Development Governance](docs/governance/AI_DEVELOPMENT_GOVERNANCE.md)
- [Agent Governance](docs/governance/AGENT_GOVERNANCE.md)
- [Code Review Guidelines](docs/governance/CODE_REVIEW_GUIDELINES.md)
- [Release Process](docs/governance/RELEASE_PROCESS.md)
- [Security Guidelines](docs/governance/SECURITY_GUIDELINES.md)
- [Testing Guidelines](docs/governance/TESTING_GUIDELINES.md)
- [Versioning Guidelines](docs/governance/VERSIONING_GUIDELINES.md)

---

## API Documentation

- **[API Reference](docs/API.md)** - Complete REST API documentation
- **Endpoints**:
  - `POST /api/projects/:projectId/blueprints` - Create blueprint
  - `GET /api/blueprints/:blueprintId` - Get blueprint
  - `PUT /api/blueprints/:blueprintId` - Update blueprint
  - `GET /api/blueprints/:blueprintId/validate` - Validate blueprint
  - `POST /api/projects/:projectId/generate` - Start generation
  - `GET /api/projects/:projectId/generation/stream` - Stream updates (SSE)
  - `GET /api/projects/:projectId/generation/:executionId/status` - Get status

---

## Migration Status

### Current Migration Progress

**Overall Progress**: ~35% complete

| Phase     | Status      | Description                 |
| --------- | ----------- | --------------------------- |
| Phase 0   | ✅ Complete | Architecture Audit          |
| Phase 0.5 | ✅ Complete | Audit Validation            |
| Phase 1   | ✅ Complete | Immediate Safe Cleanup      |
| Phase 2   | ✅ Complete | Plugin Merge Analysis       |
| Phase 3   | ✅ Complete | Documentation Cleanup       |
| Phase 2.5 | ⏸️ Pending  | Plugin Merge Execution Plan |
| Phase 4   | ⏸️ Pending  | Frontend Migration          |
| Phase 5   | ⏸️ Pending  | Server Refactor             |
| Phase 6   | ⏸️ Pending  | Project Quality             |

### Migration Documentation

Located in [docs/migration/](docs/migration/):

- [Migration Status](docs/migration/NEXT_PHASE_STATUS.md) - Detailed migration progress
- [Plugin Merge Plan](docs/migration/PLUGIN_MERGE_PLAN.md) - Plugin consolidation strategy
- [Documentation Cleanup Report](docs/migration/DOCUMENTATION_CLEANUP_REPORT.md) - Documentation reorganization

---

## Audit Reports

### Architecture Audits

Located in [docs/audits/](docs/audits/):

- [Master Architecture Audit](docs/audits/MASTER_ARCHITECTURE_AUDIT.md) - Complete architecture analysis
- [Phase 0 Validation Report](docs/audits/PHASE_0_VALIDATION_REPORT.md) - Audit validation results
- [Technical Debt Master](docs/audits/TECH_DEBT_MASTER.md) - Consolidated technical debt tracking
- [Dead Code Removal Report](docs/audits/DEAD_CODE_REMOVAL_REPORT.md) - Dead code cleanup
- [Documentation Status Report](docs/audits/DOCUMENTATION_STATUS_REPORT.md) - Documentation audit

### Project Health

- **Architecture Health**: 87/100
- **Technical Debt**: 24/100 (improved from 27/100)
- **Code Quality**: Improved (dead code removed)
- **Git Hygiene**: Improved (build artifacts untracked)

---

## DevOps

Located in [docs/devops/](docs/devops/):

- [Gitignore Audit](docs/devops/GITIGNORE_AUDIT.md) - .gitignore configuration

---

## Archived Documentation

Historical documentation has been moved to [docs/archive/](docs/archive/):

- Implementation reports
- Previous architecture audits
- Technical debt reports
- Analysis reports
- Planning documents

These documents are preserved for reference but are not current.

---

## Roblox Plugin

### Plugin Status

The project currently has two Roblox Studio plugin directories:

- **RobloxAIStudioPlugin/** - Legacy implementation (v2.1.0)
- **studio-plugin/** - Current implementation (v1.7.0 Alpha)

### Plugin Documentation

- [RobloxAIStudioPlugin README](RobloxAIStudioPlugin/README.md)
- [studio-plugin README](studio-plugin/README.md)
- [Plugin Merge Plan](docs/migration/PLUGIN_MERGE_PLAN.md) - Consolidation strategy

---

## Release Information

Located in [release/](release/):

- [Release Notes](release/RELEASE_NOTES.md)
- [Known Limitations](release/KNOWN_LIMITATIONS.md)
- [Beta Checklist](release/BETA_CHECKLIST.md)

---

## Additional Reports

- [Agent Merge Report](docs/AGENT_MERGE_REPORT.md) - Agent consolidation
- [Changelog](docs/CHANGELOG.md) - Version history
- [Performance Report](docs/PERFORMANCE_REPORT.md) - Performance analysis (archived)

---

## Project Structure

```
RobloxAiStudio-DevKit/
├── docs/                    # Documentation (this directory)
│   ├── architecture/         # Architecture documentation
│   ├── audits/              # Audit reports
│   ├── migration/           # Migration documentation
│   ├── development/         # Development guides
│   ├── governance/          # Governance policies
│   ├── devops/              # DevOps documentation
│   ├── adr/                 # Architecture Decision Records
│   ├── api/                 # API documentation
│   └── archive/             # Archived documentation
├── src/                     # Frontend (React/Vite)
├── server/                  # Backend (Node/Express)
├── RobloxAIStudioPlugin/     # Legacy Roblox plugin
├── studio-plugin/            # Current Roblox plugin
└── scripts/                 # Build/validation scripts
```

---

## Getting Help

- **Documentation**: Check the relevant section above
- **Architecture**: See [Architecture](#architecture) section
- **Development**: See [Development](#development) section
- **Migration**: See [Migration Status](#migration-status) section
- **Issues**: Check audit reports in [docs/audits/](docs/audits/)

---

## Contributing

See [Development Workflow](docs/development/DEVELOPMENT_WORKFLOW.md) for contribution guidelines.

---

**Documentation Version**: 1.3.3
**Last Updated**: 2026-07-13
**Maintained By**: Architecture Team
