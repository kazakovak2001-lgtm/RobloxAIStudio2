# Testing Strategy

**Project**: Roblox AI Studio Control Center  
**Date**: July 15, 2026  
**Framework**: Vitest v4.1.9  
**Status**: Foundation Ready

---

## Current State

| Item                   | Status                    |
| ---------------------- | ------------------------- |
| Vitest installed       | ✅                        |
| Test script configured | ✅ (`npm run test`)       |
| Watch mode             | ✅ (`npm run test:watch`) |
| CI integration         | ✅ (test job in pipeline) |
| Existing tests         | 1 file (smoke tests)      |
| Coverage configured    | ❌ (not yet)              |
| vitest.config.ts       | ❌ (uses Vite defaults)   |

---

## Recommended Configuration

### vitest.config.ts (to create)

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/__tests__/setup.ts"],
      thresholds: {
        statements: 20,
        branches: 20,
        functions: 20,
        lines: 20,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

---

## Test Directory Convention

```
src/
├── __tests__/
│   └── setup.ts              # Global test setup (jsdom, cleanup)
├── services/
│   └── __tests__/
│       ├── projectService.test.ts
│       ├── conceptApi.test.ts
│       └── studioBridgeApi.smoke.test.ts  (existing)
├── shared/
│   └── ui/
│       └── __tests__/
│           ├── Button.test.tsx
│           ├── Card.test.tsx
│           └── Toast.test.tsx
├── features/
│   └── workspace/
│       └── __tests__/
│           └── usePipelineStream.test.ts
└── providers/
    └── __tests__/
        └── AuthContext.test.tsx
```

Convention: `__tests__/` directory co-located with the module being tested.

---

## Test Types & Priority

### Priority 1: Service Layer (Unit Tests)

- projectService.ts — CRUD operations
- conceptApi.ts — AI generation API
- socket.ts — WebSocket connection
- aiEngine.ts — AI engine orchestration

### Priority 2: shared/ui Components (Component Tests)

- Button — Variants, sizes, link mode
- Card — Rendering, className pass-through
- Toast — Variants, dismiss behavior
- Input — Value binding, placeholder
- Modal — Open/close, overlay click

### Priority 3: Hooks (Hook Tests)

- usePipelineStream — WebSocket state management
- useSocket — Connection lifecycle

### Priority 4: Provider Tests

- AuthContext — login/logout/register flow
- ToastProvider — toast creation/dismissal

### Priority 5: Integration Tests (Future)

- Workspace page rendering
- Route navigation
- Lazy loading verification

---

## Coverage Strategy

### Phase 1: Baseline (Current Sprint)

- Target: 20% coverage threshold
- Focus: Services layer (highest business value)

### Phase 2: Growth (Next 2 sprints)

- Target: 40% coverage threshold
- Focus: shared/ui components + hooks

### Phase 3: Maturity (3-5 sprints)

- Target: 60% coverage threshold
- Focus: Integration tests, provider tests

### Phase 4: Excellence (6+ sprints)

- Target: 80% coverage threshold
- Focus: Edge cases, error paths, accessibility

---

## Testing Conventions

### File Naming

- Unit tests: `*.test.ts`
- Component tests: `*.test.tsx`
- Integration tests: `*.integration.test.ts`

### Test Structure

```typescript
describe("ModuleName", () => {
  describe("functionName", () => {
    it("should do expected behavior", () => {
      // Arrange
      // Act
      // Assert
    });

    it("should handle error case", () => {
      // ...
    });
  });
});
```

### Assertions

- Use Vitest's built-in expect
- Use @testing-library/react for component tests (install when needed)
- Avoid snapshot tests for components (brittle)

---

## CI Integration (Already Active)

```yaml
test:
  name: Test Suite
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "npm"
    - run: npm ci
    - run: npm run test
```

The test job is already in the merge gate. Tests must pass before merge.
