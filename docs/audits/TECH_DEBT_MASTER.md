# TECH DEBT MASTER

**Generated**: 2026-07-13
**Project**: Roblox AI Studio DevKit
**Current Version**: v1.3.3

---

## EXECUTIVE SUMMARY

This document consolidates all technical debt items across the project into a single master tracking document. It serves as the definitive source for prioritizing remediation efforts during the architectural refactoring.

**Overall Debt Score**: 27/100 (Acceptable for v1.x project)

- Critical: 0 items
- High: 3 items
- Medium: 6 items
- Low: 5 items
- Informational: 3 items

---

## 1. CRITICAL DEBT (0)

**No critical technical debt identified.**

---

## 2. HIGH DEBT (3)

### TD-H1: Large File - aiPipelineIntegrator.ts

- **ID**: TD-H1
- **File**: `server/src/execution/aiPipelineIntegrator.ts`
- **Lines**: 628
- **Impact**: Hard to maintain; memory update logic should be extracted
- **Remediation**: Extract memory update logic into separate service
- **Effort**: 4 hours
- **Priority**: HIGH
- **Phase**: Phase 5 (Server Refactor)

### TD-H2: Dead Code Files

- **ID**: TD-H2
- **Files**:
  - `server/src/engine/GameGenerationEngine.ts`
  - `server/src/pipeline/PipelineRunner.ts`
  - `server/src/execution/pipelineEngine.ts`
  - `server/src/execution/incrementalGenerator.ts`
  - `server/src/governance/orchestrator.ts`
  - `server/src/_quarantine/llm/LLMProvider.ts`
- **Impact**: Grep pollution, developer confusion
- **Remediation**: Delete dead files after confirming no imports
- **Effort**: 2 hours
- **Priority**: HIGH
- **Phase**: Phase 0 (immediate cleanup)

### TD-H3: Stale Documentation

- **ID**: TD-H3
- **Files**:
  - `docs/API.md`
  - `docs/ARCHITECTURE.md`
  - `IMPLEMENTATION_COMPLETE.md`
  - `IMPLEMENTATION_SUMMARY.md`
  - `QUICK_REFERENCE.md`
- **Impact**: New developers get incorrect mental model
- **Remediation**: Update or archive stale documentation
- **Effort**: 6 hours
- **Priority**: HIGH
- **Phase**: Phase 3 (Documentation Cleanup)

---

## 3. MEDIUM DEBT (6)

### TD-M1: Verbose Socket.io Bridge

- **ID**: TD-M1
- **File**: `server/src/index.ts`
- **Issue**: Socket.io bridge is 100+ lines of switch/case
- **Impact**: Verbose; could be auto-dispatched
- **Remediation**: Extract to separate module with event mapping
- **Effort**: 3 hours
- **Priority**: MEDIUM
- **Phase**: Phase 5 (Server Refactor)

### TD-M2: Type Safety - `as any` Casts

- **ID**: TD-M2
- **Files**: Various assembly/ files
- **Count**: 15 instances
- **Impact**: Reduced type safety at serialization boundaries
- **Remediation**: Replace with proper type guards or schema validation
- **Effort**: 4 hours
- **Priority**: MEDIUM
- **Phase**: Phase 5 (Server Refactor)

### TD-M3: Synchronous File Operations

- **ID**: TD-M3
- **Files**:
  - `server/src/assembly/AssemblyPersistenceStore.ts`
  - `server/src/assembly/AssemblyHistoryIndex.ts`
- **Issue**: Sync FS in persistence layer
- **Impact**: Blocks event loop during writes
- **Remediation**: Convert to async file operations
- **Effort**: 2 hours
- **Priority**: MEDIUM
- **Phase**: Phase 5 (Server Refactor)

### TD-M4: Misplaced File - aiGovernance.ts

- **ID**: TD-M4
- **File**: `server/src/governance/aiGovernance.ts`
- **Issue**: Should be in `validation/` folder
- **Impact**: Confusing placement
- **Remediation**: Move to `server/src/validation/aiGovernance.ts`
- **Effort**: 1 hour
- **Priority**: MEDIUM
- **Phase**: Phase 5 (Server Refactor)

### TD-M5: Partially Superseded File

- **ID**: TD-M5
- **Files**:
  - `server/src/compiler/CompilerOrchestrator.ts` (v1.0)
  - `server/src/compiler/CompilerAPI.ts` (v1.1)
- **Issue**: Both exist with overlapping functionality
- **Impact**: Confusion about which to use
- **Remediation**: Merge or deprecate one
- **Effort**: 4 hours
- **Priority**: MEDIUM
- **Phase**: Phase 5 (Server Refactor)

### TD-M6: ESLint Configuration

- **ID**: TD-M6
- **File**: `.eslintrc.json`
- **Issue**: ESLint exists but may not cover all rules
- **Impact**: No automated style enforcement
- **Remediation**: Review and enhance ESLint rules
- **Effort**: 2 hours
- **Priority**: MEDIUM
- **Phase**: Phase 6 (Project Quality)

---

## 4. LOW DEBT (5)

### TD-L1: Repeated Singleton Pattern

- **ID**: TD-L1
- **Files**: Various `*Registry.ts` files
- **Count**: 8 instances
- **Impact**: Code duplication
- **Remediation**: Create generic singleton factory
- **Effort**: 3 hours
- **Priority**: LOW
- **Phase**: Phase 5 (Server Refactor)

### TD-L2: Duplicated Event Emission Helper

- **ID**: TD-L2
- **Files**:
  - `server/src/execution/aiPipelineIntegrator.ts`
  - `server/src/assembly/AssemblyBuilder.ts`
  - `server/src/generation/GenerationPipeline.ts`
- **Impact**: ~20 lines each duplicated
- **Remediation**: Extract to shared utility
- **Effort**: 1 hour
- **Priority**: LOW
- **Phase**: Phase 5 (Server Refactor)

### TD-L3: Husky Pre-commit Not Enforced

- **ID**: TD-L3
- **File**: `.husky/`
- **Issue**: commitlint exists but not enforced for dev
- **Impact**: Inconsistent commit messages
- **Remediation**: Add commit-msg hook
- **Effort**: 0.5 hours
- **Priority**: LOW
- **Phase**: Phase 6 (Project Quality)

### TD-L4: Generated Build Artifacts

- **ID**: TD-L4
- **Files**:
  - `vite.config.js`
  - `vite.config.d.ts`
  - `vite.config.js.map`
  - `vite.config.d.ts.map`
- **Issue**: Generated artifacts in repo
- **Impact**: Cosmetic noise
- **Remediation**: Update .gitignore
- **Effort**: 0.25 hours
- **Priority**: LOW
- **Phase**: Phase 0 (immediate)

### TD-L5: Stale Root Documentation

- **ID**: TD-L5
- **Files**:
  - `IMPLEMENTATION_COMPLETE.md`
  - `IMPLEMENTATION_SUMMARY.md`
  - `QUICK_REFERENCE.md`
- **Issue**: Outdated content
- **Impact**: Misleading
- **Remediation**: Archive to docs/archive/
- **Effort**: 0.5 hours
- **Priority**: LOW
- **Phase**: Phase 3 (Documentation Cleanup)

---

## 5. INFORMATIONAL DEBT (3)

### TD-I1: No Test Suite

- **ID**: TD-I1
- **Issue**: No comprehensive test suite exists
- **Impact**: Cannot verify behavior during refactoring
- **Remediation**: Add unit and integration tests
- **Effort**: 40 hours (large effort)
- **Priority**: INFORMATIONAL
- **Phase**: Phase 6 (Project Quality)

### TD-I2: CI/CD Pipeline Inactive

- **ID**: TD-I2
- **File**: `.github/workflows/ci.yml`
- **Issue**: CI/CD YAML exists but may not be active
- **Impact**: Builds not verified on push
- **Remediation**: Activate and enhance CI/CD
- **Effort**: 4 hours
- **Priority**: INFORMATIONAL
- **Phase**: Phase 6 (Project Quality)

### TD-I3: Storage Directory Creation

- **ID**: TD-I3
- **Directory**: `storage/`
- **Issue**: Directory doesn't exist until first assembly build
- **Impact**: Expected behavior, not a bug
- **Remediation**: Document expected behavior
- **Effort**: 0.25 hours
- **Priority**: INFORMATIONAL
- **Phase**: Phase 3 (Documentation Cleanup)

---

## 6. DEBT BY PHASE

### Phase 0: Immediate Cleanup

- TD-H2: Dead code removal (2h)
- TD-L4: Update .gitignore (0.25h)
- **Total**: 2.25 hours

### Phase 2: Plugin Merge

- No direct debt items
- **Total**: 0 hours

### Phase 3: Documentation Cleanup

- TD-H3: Stale documentation (6h)
- TD-L5: Archive root docs (0.5h)
- TD-I3: Document storage behavior (0.25h)
- **Total**: 6.75 hours

### Phase 4: Frontend Migration

- No direct debt items
- **Total**: 0 hours

### Phase 5: Server Refactor

- TD-H1: Extract aiPipelineIntegrator (4h)
- TD-M1: Extract socket bridge (3h)
- TD-M2: Fix `as any` casts (4h)
- TD-M3: Async file operations (2h)
- TD-M4: Move aiGovernance (1h)
- TD-M5: Merge compiler files (4h)
- TD-L1: Singleton factory (3h)
- TD-L2: Event emission helper (1h)
- **Total**: 22 hours

### Phase 6: Project Quality

- TD-M6: Enhance ESLint (2h)
- TD-L3: Add commit-msg hook (0.5h)
- TD-I1: Add test suite (40h)
- TD-I2: Activate CI/CD (4h)
- **Total**: 46.5 hours

---

## 7. DEBT BY CATEGORY

### Code Quality

- TD-H1: Large file
- TD-M2: Type safety
- TD-M6: ESLint
- TD-L1: Singleton pattern
- TD-L2: Event emission helper
- **Total**: 5 items

### Architecture

- TD-M5: Superseded files
- TD-M4: Misplaced file
- **Total**: 2 items

### Performance

- TD-M3: Sync file operations
- **Total**: 1 item

### Documentation

- TD-H3: Stale docs
- TD-L5: Stale root docs
- TD-I3: Storage behavior
- **Total**: 3 items

### Dead Code

- TD-H2: Dead files
- TD-L4: Build artifacts
- **Total**: 2 items

### Infrastructure

- TD-M1: Socket bridge
- TD-L3: Husky hooks
- TD-I1: Test suite
- TD-I2: CI/CD
- **Total**: 4 items

---

## 8. REMEDIATION PRIORITY MATRIX

### Do First (High Impact, Low Effort)

1. TD-L4: Update .gitignore (0.25h)
2. TD-H2: Dead code removal (2h)
3. TD-M4: Move aiGovernance (1h)
4. TD-L3: Add commit-msg hook (0.5h)
5. TD-L5: Archive root docs (0.5h)

### Do Second (High Impact, Medium Effort)

1. TD-H1: Extract aiPipelineIntegrator (4h)
2. TD-M1: Extract socket bridge (3h)
3. TD-M3: Async file operations (2h)
4. TD-M2: Fix `as any` casts (4h)

### Do Third (Medium Impact, Medium Effort)

1. TD-M5: Merge compiler files (4h)
2. TD-M6: Enhance ESLint (2h)
3. TD-L1: Singleton factory (3h)
4. TD-L2: Event emission helper (1h)

### Do Later (High Effort)

1. TD-H3: Stale documentation (6h)
2. TD-I2: Activate CI/CD (4h)
3. TD-I1: Add test suite (40h)

---

## 9. DEBT SCORE CALCULATION

**Formula**: (Critical × 10) + (High × 5) + (Medium × 1.5) + (Low × 0.5)

**Calculation**:

- Critical: 0 × 10 = 0
- High: 3 × 5 = 15
- Medium: 6 × 1.5 = 9
- Low: 5 × 0.5 = 2.5
- **Total**: 26.5 points

**Rounded Score**: 27/100

**Assessment**: Acceptable for a v1.x project. No blockers for continued development.

---

## 10. TRACKING

### Completed

- None

### In Progress

- None

### Blocked

- None

### Deferred

- TD-I1: Test suite (deferred to Phase 6 due to large effort)

---

## 11. RECOMMENDATIONS

### Immediate Actions

1. Update .gitignore to exclude build artifacts
2. Remove confirmed dead code
3. Add commit-msg hook for conventional commits

### Short-term Actions (Next Sprint)

1. Extract large file (aiPipelineIntegrator)
2. Move misplaced file (aiGovernance)
3. Extract socket bridge logic

### Medium-term Actions (Next Quarter)

1. Fix type safety issues (`as any` casts)
2. Convert sync file operations to async
3. Merge or deprecate superseded compiler files

### Long-term Actions (Next 6 Months)

1. Add comprehensive test suite
2. Activate and enhance CI/CD pipeline
3. Create singleton factory for registries

---

**Document Status**: DRAFT
**Last Updated**: 2026-07-13
**Next Review**: After Phase 0 completion
**Owner**: Architecture Team
