# Engineering Handbook

**Project**: Roblox AI Studio Control Center  
**Version**: 1.0  
**Date**: July 13, 2026  
**Status**: ACTIVE

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Folder Structure](#2-folder-structure)
3. [Naming Conventions](#3-naming-conventions)
4. [Component Architecture](#4-component-architecture)
5. [Design System Rules](#5-design-system-rules)
6. [Import Rules](#6-import-rules)
7. [Documentation Workflow](#7-documentation-workflow)
8. [AI Development Workflow](#8-ai-development-workflow)
9. [Feature Implementation Workflow](#9-feature-implementation-workflow)
10. [Refactoring Rules](#10-refactoring-rules)
11. [Code Review Checklist](#11-code-review-checklist)
12. [Definition of Ready](#12-definition-of-ready)
13. [Definition of Done](#13-definition-of-done)
14. [Architectural Principles](#14-architectural-principles)
15. [Repository Maintenance Rules](#15-repository-maintenance-rules)

---

## 1. Introduction

This Engineering Handbook defines the standards, workflows, and best practices for the Roblox AI Studio Control Center project. All team members must follow these guidelines to ensure code quality, consistency, and maintainability.

### 1.1 Purpose

- Establish consistent development standards
- Define clear workflows for common tasks
- Ensure architectural integrity
- Facilitate onboarding of new team members
- Maintain code quality over time

### 1.2 Scope

This handbook applies to:
- Frontend development (React/TypeScript)
- Backend development (Node.js/Express)
- Plugin development (Lua)
- Documentation
- Infrastructure and configuration

### 1.3 Compliance

All team members must comply with this handbook. Violations should be addressed during code review. Suggestions for improvements should be submitted as pull requests to this document.

---

## 2. Folder Structure

### 2.1 Frontend Structure

```
src/
├── app/                    # Application configuration
│   ├── config/            # App configuration
│   ├── providers/         # App-level providers
│   └── router/           # Router configuration
├── components/            # Reusable UI components (DEPRECATED - use shared/ui)
├── entities/             # Domain entities (future)
├── features/             # Feature modules
│   └── [feature-name]/
│       ├── components/    # Feature-specific components
│       ├── hooks/         # Feature-specific hooks
│       ├── services/      # Feature-specific services
│       ├── types/         # Feature-specific types
│       └── index.ts       # Feature exports
├── hooks/                 # Shared React hooks
├── pages/                 # Page components
├── providers/             # React providers
├── services/              # API services
├── shared/                # Shared code
│   ├── constants/
│   ├── contracts/
│   ├── events/
│   ├── types/
│   └── ui/               # Shared UI components (UX-3)
├── styles/                # Global styles
├── types/                 # Shared TypeScript types
├── utils/                 # Shared utilities
├── App.tsx                # Root component
└── main.tsx               # Entry point
```

### 2.2 Backend Structure

```
server/src/
├── [domain]/             # Domain-specific modules
├── routes/               # API routes
├── services/             # Business logic
├── repositories/         # Data access
├── middleware/           # Express middleware
├── types/                # TypeScript types
└── utils/                # Utilities
```

### 2.3 Plugin Structure

```
studio-plugin/
├── plugin.lua            # Main plugin entry point
├── src/
│   ├── commands/         # Plugin commands
│   ├── core/            # Core functionality
│   ├── services/        # Plugin services
│   ├── ui/              # UI components
│   └── utils/           # Utilities
└── assets/              # Plugin assets
```

### 2.4 Directory Rules

- **app/**: Application-level configuration only
- **components/**: DEPRECATED - use shared/ui instead
- **features/**: Feature modules with self-contained logic
- **pages/**: Route-level components only
- **providers/**: React Context providers only
- **services/**: API service functions only
- **shared/**: Code shared across features
- **shared/ui/**: Reusable UI components (design system compliant)
- **hooks/**: Shared React hooks only
- **types/**: Shared TypeScript types only
- **utils/**: Pure utility functions only

---

## 3. Naming Conventions

### 3.1 File Naming

**Components**: PascalCase
- `Button.tsx`
- `UserProfile.tsx`
- `DashboardPage.tsx`

**Hooks**: camelCase with `use` prefix
- `useSocket.ts`
- `usePipelineStream.ts`
- `useAuth.ts`

**Services**: camelCase
- `projectService.ts`
- `aiEngine.ts`
- `socket.ts`

**Types**: camelCase
- `user.types.ts`
- `project.types.ts`

**Utilities**: camelCase
- `cn.ts`
- `formatDate.ts`

**Constants**: UPPER_SNAKE_CASE
- `API_URL.ts`
- `CONFIG.ts`

**Tests**: camelCase with `.test.ts` or `.spec.ts` suffix
- `Button.test.ts`
- `projectService.spec.ts`

### 3.2 Variable Naming

**Variables**: camelCase
```typescript
const userName = 'John';
const isActive = true;
const maxRetries = 3;
```

**Constants**: UPPER_SNAKE_CASE
```typescript
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://api.example.com';
```

**Types/Interfaces**: PascalCase
```typescript
interface UserProfile {
  name: string;
  email: string;
}

type Status = 'active' | 'inactive';
```

**Enums**: PascalCase
```typescript
enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}
```

### 3.3 Component Naming

**Component Names**: PascalCase, descriptive
```typescript
// Good
<UserProfileCard />
<DashboardPage />
<GenerationStatusPanel />

// Bad
<Card />
<Page />
<Panel />
```

**Prop Names**: camelCase
```typescript
interface ButtonProps {
  onClick: () => void;
  isLoading: boolean;
  disabled: boolean;
}
```

### 3.4 Function Naming

**Functions**: camelCase, descriptive verbs
```typescript
// Good
function getUserById(id: string) {}
function calculateTotal(items: Item[]) {}
function validateForm(data: FormData) {}

// Bad
function user(id: string) {}
function total(items: Item[]) {}
function check(data: FormData) {}
```

### 3.5 CSS Class Naming

**Tailwind Classes**: Use utility classes, avoid custom classes
```typescript
// Good
<div className="bg-slate-900 p-4 rounded-lg">

// Bad
<div className="custom-card">
```

**Custom Classes**: kebab-case
```css
/* Good */
.user-profile-card {}
.status-indicator {}

/* Bad */
.userProfileCard {}
.statusIndicator {}
```

---

## 4. Component Architecture

### 4.1 Component Principles

**Single Responsibility**: Each component should have one clear purpose
```typescript
// Good - Single responsibility
function UserAvatar({ src, alt }: AvatarProps) {
  return <img src={src} alt={alt} className="rounded-full" />;
}

// Bad - Multiple responsibilities
function User({ user, onUpdate, onDelete }: UserProps) {
  return (
    <div>
      <img src={user.avatar} />
      <button onClick={onUpdate}>Edit</button>
      <button onClick={onDelete}>Delete</button>
    </div>
  );
}
```

**Composition over Inheritance**: Prefer composition
```typescript
// Good - Composition
function Card({ children, header, footer }: CardProps) {
  return (
    <div className="card">
      {header && <div className="card-header">{header}</div>}
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}

// Bad - Inheritance
class Card extends BaseCard {
  // ...
}
```

**Props Interface**: Always define props interface
```typescript
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function Button({ children, variant = 'primary', size = 'md', onClick }: ButtonProps) {
  // ...
}
```

### 4.2 Component Organization

**Feature Components**: Organize by feature
```
src/features/workspace/
├── components/
│   ├── GenerationStatusPanel.tsx
│   ├── ArtifactExplorer.tsx
│   └── ...
├── hooks/
│   ├── usePipelineStream.ts
│   └── ...
├── services/
│   └── ...
├── types/
│   └── ...
└── index.ts
```

**Shared Components**: Organize by category
```
src/shared/ui/
├── layout/
│   ├── AppShell.tsx
│   ├── Sidebar.tsx
│   └── ...
├── dashboard/
│   ├── ProjectOverview.tsx
│   └── ...
├── ai/
│   ├── AIChatPanel.tsx
│   └── ...
└── ...
```

### 4.3 Component Size Guidelines

**Maximum Lines**: 500 lines per component
- If component exceeds 500 lines, consider splitting
- Extract sub-components
- Extract hooks
- Extract utilities

**Example**:
```typescript
// Before - 800 lines
function GenerationStatusPanel({ pipeline }: Props) {
  // ... 800 lines of code
}

// After - Split into smaller components
function GenerationStatusPanel({ pipeline }: Props) {
  return (
    <div>
      <PipelineHeader pipeline={pipeline} />
      <PipelineSteps steps={pipeline.steps} />
      <PipelineFooter pipeline={pipeline} />
    </div>
  );
}
```

### 4.4 State Management

**Local State**: Use useState for component-local state
```typescript
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**Global State**: Use Context for app-wide state
```typescript
const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // ...
}
```

**Server State**: Use services for API data
```typescript
function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects().then(data => {
      setProjects(data);
      setLoading(false);
    });
  }, []);

  // ...
}
```

### 4.5 Component Exports

**Named Exports**: Use named exports for components
```typescript
// Good
export function Button({ children }: ButtonProps) {
  // ...
}

export function Card({ children }: CardProps) {
  // ...
}

// Bad
export default function Button({ children }: ButtonProps) {
  // ...
}
```

**Barrel Exports**: Use index.ts for feature exports
```typescript
// src/features/workspace/index.ts
export { Workspace } from './Workspace';
export { PipelineView } from './PipelineView';
export { usePipelineStream } from './hooks/usePipelineStream';
export type { PipelineState } from './types';
```

---

## 5. Design System Rules

### 5.1 Design Token Usage

**Colors**: Use design tokens only
```typescript
// Good
<div className="bg-brand-500 text-white">
<div className="bg-slate-900 border-white/10">
<div className="text-success-400">

// Bad
<div className="bg-blue-500 text-white">
<div className="bg-gray-900 border-gray-700">
<div className="text-green-400">
```

**Spacing**: Use 4px base unit
```typescript
// Good
<div className="p-4 m-2 gap-4">
<div className="p-6 m-4 gap-6">

// Bad
<div className="p-[20px] m-[10px]">
<div className="p-5 m-2.5">
```

**Typography**: Use design system fonts
```typescript
// Good
<div className="font-sans text-sm">
<div className="font-mono text-xs">

// Bad
<div className="font-arial text-sm">
<div className="font-mono text-[12px]">
```

### 5.2 Component Compliance

**All Components Must**:
- Use design tokens for colors
- Use design tokens for spacing
- Use design tokens for typography
- Use design tokens for radius
- Use design tokens for shadows
- Use design tokens for animations
- Support dark theme (slate-950 background)
- Be responsive (mobile, tablet, desktop)
- Meet WCAG AA accessibility standards

### 5.3 Dark Theme

**Background Colors**:
- Primary: `bg-slate-950`
- Elevated: `bg-slate-900`
- Nested: `bg-slate-800`

**Text Colors**:
- Primary: `text-slate-100`
- Secondary: `text-slate-400`
- Muted: `text-slate-500`

**Border Colors**:
- Default: `border-white/10`
- Active: `border-brand-500/30`

### 5.4 Responsive Design

**Breakpoints**:
- Mobile: < 768px
- Tablet: 768px - 1023px
- Desktop: ≥ 1024px

**Responsive Classes**:
```typescript
// Good
<div className="p-4 md:p-6 lg:p-8">
<div className="text-sm md:text-base lg:text-lg">
<div className="grid-cols-1 md:grid-cols-2 lg:grid-cols-3">

// Bad
<div className="p-4">
<div className="text-sm">
```

### 5.5 Accessibility

**ARIA Labels**: Add to all interactive elements
```typescript
// Good
<button aria-label="Close dialog" onClick={onClose}>
  <X />
</button>

// Bad
<button onClick={onClose}>
  <X />
</button>
```

**Keyboard Navigation**: Ensure all interactive elements are keyboard accessible
```typescript
// Good
<button
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') handleClick();
  }}
>
  Click me
</button>
```

**Focus Management**: Manage focus for modals and dialogs
```typescript
function Modal({ open, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [open]);

  // ...
}
```

---

## 6. Import Rules

### 6.1 Path Aliases

**Always Use Path Aliases**: Never use relative imports for internal modules
```typescript
// Good
import { Button } from '@/shared/ui/Button';
import { listProjects } from '@/services/projectService';
import { useSocket } from '@/hooks/useSocket';

// Bad
import { Button } from '../../shared/ui/Button';
import { listProjects } from '../services/projectService';
import { useSocket } from '../hooks/useSocket';
```

**Available Aliases**:
- `@/` → src/
- `@/app` → src/app/
- `@/components` → src/components/
- `@/entities` → src/entities/
- `@/features` → src/features/
- `@/hooks` → src/hooks/
- `@/pages` → src/pages/
- `@/providers` → src/providers/
- `@/services` → src/services/
- `@/shared` → src/shared/
- `@/styles` → src/styles/
- `@/types` → src/types/
- `@/utils` → src/utils/

### 6.2 Import Ordering

**Standard Order**:
1. React and third-party libraries
2. Internal imports (grouped by category)
3. Type imports
4. Styles

**Example**:
```typescript
// 1. React and third-party
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Settings } from 'lucide-react';

// 2. Internal - Layout
import { AppShell } from '@/shared/ui/layout';

// 2. Internal - Components
import { Button } from '@/shared/ui/Button';

// 2. Internal - Services
import { listProjects } from '@/services/projectService';

// 3. Type imports
import type { Project } from '@/types';

// 4. Styles
import './styles.css';
```

### 6.3 Type Imports

**Use `import type` for type-only imports**:
```typescript
// Good
import type { Project } from '@/types';
import type { ButtonProps } from '@/shared/ui/Button';

// Bad
import { Project } from '@/types';
import { ButtonProps } from '@/shared/ui/Button';
```

### 6.4 Named vs Default Exports

**Prefer Named Exports**:
```typescript
// Good
export function Button({ children }: ButtonProps) {
  // ...
}

// Bad
export default function Button({ children }: ButtonProps) {
  // ...
}
```

---

## 7. Documentation Workflow

### 7.1 Component Documentation

**Every Component Must Have**:
- JSDoc comment describing purpose
- Props interface with descriptions
- Usage example (if complex)
- Accessibility notes (if applicable)

**Example**:
```typescript
/**
 * Button component for user interactions.
 * Supports multiple variants and sizes.
 * 
 * @example
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Click me
 * </Button>
 */
interface ButtonProps {
  /** Button content */
  children: React.ReactNode;
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Disabled state */
  disabled?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export function Button({ children, variant = 'primary', size = 'md', disabled, onClick }: ButtonProps) {
  // ...
}
```

### 7.2 Function Documentation

**Every Function Must Have**:
- JSDoc comment describing purpose
- Parameter descriptions
- Return type description
- Usage example (if complex)

**Example**:
```typescript
/**
 * Fetches all projects from the API.
 * 
 * @param options - Query options for filtering
 * @returns Promise resolving to array of projects
 * 
 * @example
 * const projects = await listProjects({ limit: 10 });
 */
export async function listProjects(options?: QueryOptions): Promise<Project[]> {
  // ...
}
```

### 7.3 Architecture Documentation

**Update Documentation When**:
- Adding new features
- Changing folder structure
- Adding new components
- Changing architectural patterns
- Resolving technical debt

**Documents to Update**:
- Component Registry (component changes)
- Feature Registry (feature changes)
- Architecture Map (structural changes)
- Technical Debt Report (debt resolution)

### 7.4 README Files

**Feature README**: Each feature should have a README
```markdown
# Workspace Feature

## Purpose
Manages game generation workspace.

## Components
- GenerationStatusPanel
- ArtifactExplorer
- ...

## Hooks
- usePipelineStream

## Services
- workspaceService

## Usage
```typescript
import { Workspace } from '@/features/workspace';
```
```

---

## 8. AI Development Workflow

### 8.1 AI Feature Development

**Before Starting**:
1. Check Component Registry for existing AI components
2. Check Feature Registry for existing AI features
3. Review AI architecture documentation
4. Verify AI provider configuration

**Development Steps**:
1. Design AI component interface
2. Implement using shared/ui/ai components
3. Integrate with AI services
4. Add error handling
5. Add loading states
6. Test with different AI providers
7. Document component

### 8.2 AI Component Guidelines

**Use Existing AI Components**:
- AIChatPanel for chat interfaces
- PromptInput for prompt input
- AgentCard for agent selection
- CodeDiffViewer for code diffs
- GenerationHistory for history

**AI Service Integration**:
```typescript
// Good - Use existing service
import { generateCode } from '@/services/aiEngine';

const result = await generateCode(prompt, options);

// Bad - Direct API call
const response = await fetch('/api/ai/generate', {
  method: 'POST',
  body: JSON.stringify({ prompt }),
});
```

### 8.3 AI Error Handling

**Always Handle AI Errors**:
```typescript
try {
  const result = await generateCode(prompt);
  setResult(result);
} catch (error) {
  if (error instanceof AIError) {
    setError(error.message);
  } else {
    setError('Failed to generate code');
  }
}
```

### 8.4 AI Loading States

**Always Show Loading State**:
```typescript
const [loading, setLoading] = useState(false);
const [result, setResult] = useState(null);

const handleGenerate = async () => {
  setLoading(true);
  try {
    const result = await generateCode(prompt);
    setResult(result);
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading(false);
  }
};

return (
  <div>
    {loading ? <Loader /> : <ResultDisplay result={result} />}
  </div>
);
```

---

## 9. Feature Implementation Workflow

### 9.1 Feature Development Process

**Phase 1: Analysis**
1. Check Component Registry for existing components
2. Check Feature Registry for existing features
3. Review Architecture Map for structural implications
4. Identify reusable components
5. Identify reusable services

**Phase 2: Design**
1. Design component interface
2. Design service interface
3. Design data flow
4. Design error handling
5. Design loading states

**Phase 3: Implementation**
1. Create feature directory structure
2. Implement components (use shared/ui where possible)
3. Implement services
4. Implement hooks
5. Implement types
6. Create feature index.ts

**Phase 4: Integration**
1. Integrate with routing
2. Integrate with providers
3. Integrate with services
4. Test feature end-to-end

**Phase 5: Documentation**
1. Update Component Registry
2. Update Feature Registry
3. Update Architecture Map
4. Add component documentation
5. Add feature README

### 9.2 Feature Structure

**Standard Feature Structure**:
```
src/features/[feature-name]/
├── components/
│   ├── [ComponentName].tsx
│   └── index.ts
├── hooks/
│   ├── [useHook].ts
│   └── index.ts
├── services/
│   ├── [serviceName].ts
│   └── index.ts
├── types/
│   ├── [types].ts
│   └── index.ts
├── [FeatureName].tsx
├── index.ts
└── README.md
```

### 9.3 Feature Exports

**Export from Feature Index**:
```typescript
// src/features/workspace/index.ts
export { Workspace } from './Workspace';
export { PipelineView } from './PipelineView';
export { usePipelineStream } from './hooks/usePipelineStream';
export { getPipelineStatus } from './services/pipelineService';
export type { PipelineState, PipelineStep } from './types';
```

---

## 10. Refactoring Rules

### 10.1 When to Refactor

**Refactor When**:
- Component exceeds 500 lines
- Function exceeds 50 lines
- Cyclomatic complexity > 10
- Duplicate code detected
- Design system violation
- Performance issue
- Accessibility issue

### 10.2 Refactoring Process

**Step 1: Analysis**
1. Identify refactoring opportunity
2. Assess impact
3. Create feature branch
4. Write tests (if none exist)

**Step 2: Refactoring**
1. Make small, incremental changes
2. Run tests after each change
3. Verify functionality
4. Check for regressions

**Step 3: Validation**
1. Run all tests
2. Run TypeScript check
3. Run lint
4. Manual testing
5. Update documentation

**Step 4: Integration**
1. Create pull request
2. Code review
3. Address feedback
4. Merge to main

### 10.3 Refactoring Guidelines

**Extract Components**: Break down large components
```typescript
// Before - Large component
function LargeComponent() {
  return (
    <div>
      <Header />
      <Body />
      <Footer />
    </div>
  );
}

// After - Extracted components
function LargeComponent() {
  return (
    <div>
      <ComponentHeader />
      <ComponentBody />
      <ComponentFooter />
    </div>
  );
}
```

**Extract Hooks**: Extract logic into hooks
```typescript
// Before - Logic in component
function Component() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData().then(result => {
      setData(result);
      setLoading(false);
    });
  }, []);

  // ...
}

// After - Extracted hook
function useData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData().then(result => {
      setData(result);
      setLoading(false);
    });
  }, []);

  return { data, loading };
}

function Component() {
  const { data, loading } = useData();
  // ...
}
```

**Extract Services**: Extract API calls into services
```typescript
// Before - API call in component
function Component() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => setProjects(data));
  }, []);

  // ...
}

// After - Extracted service
// src/services/projectService.ts
export async function listProjects(): Promise<Project[]> {
  const response = await fetch('/api/projects');
  return response.json();
}

function Component() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  // ...
}
```

---

## 11. Code Review Checklist

### 11.1 Before Submitting PR

**Code Quality**:
- [ ] Code follows naming conventions
- [ ] Code follows folder structure
- [ ] Code uses path aliases
- [ ] Code uses design tokens
- [ ] Code is properly formatted
- [ ] No console.log statements
- [ ] No commented-out code

**Functionality**:
- [ ] Feature works as expected
- [ ] Error handling implemented
- [ ] Loading states implemented
- [ ] Edge cases handled
- [ ] Accessibility requirements met

**Testing**:
- [ ] Unit tests written (if applicable)
- [ ] Tests pass
- [ ] Manual testing completed
- [ ] Cross-browser testing completed

**Documentation**:
- [ ] Component documentation added
- [ ] Function documentation added
- [ ] Component Registry updated
- [ ] Feature Registry updated
- [ ] Architecture Map updated (if needed)

### 11.2 During Code Review

**Review Checklist**:
- [ ] Code is readable and maintainable
- [ ] Code follows handbook guidelines
- [ ] No security vulnerabilities
- [ ] No performance issues
- [ ] No accessibility issues
- [ ] No design system violations
- [ ] Proper error handling
- [ ] Proper TypeScript types
- [ ] No unnecessary dependencies

### 11.3 After Code Review

**Integration Checklist**:
- [ ] All feedback addressed
- [ ] Tests pass
- [ ] TypeScript build passes
- [ ] Lint passes
- [ ] Documentation updated
- [ ] PR description clear
- [ ] Commit messages descriptive

---

## 12. Definition of Ready

### 12.1 Feature Requirements

**Before Starting Feature Development**:
- [ ] Feature requirements documented
- [ ] Feature design approved
- [ ] Technical feasibility verified
- [ ] Dependencies identified
- [ ] Impact on existing features assessed
- [ ] Component Registry checked for existing components
- [ ] Feature Registry checked for existing features
- [ ] Architecture Map reviewed for structural implications

### 12.2 Component Requirements

**Before Starting Component Development**:
- [ ] Component purpose defined
- [ ] Component interface designed
- [ ] Component props interface defined
- [ ] Design system compliance verified
- [ ] Accessibility requirements identified
- [ ] Responsive requirements identified
- [ ] Component Registry checked for similar components

### 12.3 Task Requirements

**Before Starting Any Task**:
- [ ] Task clearly defined
- [ ] Acceptance criteria defined
- [ ] Effort estimated
- [ ] Dependencies identified
- [ ] Impact assessed
- [ ] Risk assessment completed

---

## 13. Definition of Done

### 13.1 Feature Done

**Feature is Done When**:
- [ ] All requirements implemented
- [ ] All acceptance criteria met
- [ ] Code reviewed and approved
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Component Registry updated
- [ ] Feature Registry updated
- [ ] Architecture Map updated (if needed)
- [ ] No known bugs
- [ ] Performance acceptable
- [ ] Accessibility compliant
- [ ] Design system compliant

### 13.2 Component Done

**Component is Done When**:
- [ ] Component implements requirements
- [ ] Component follows design system
- [ ] Component is accessible
- [ ] Component is responsive
- [ ] Component documented
- [ ] Component tested
- [ ] Component Registry updated
- [ ] Code reviewed and approved

### 13.3 Bug Fix Done

**Bug Fix is Done When**:
- [ ] Bug reproduced
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Fix tested
- [ ] Regression testing completed
- [ ] Documentation updated (if needed)
- [ ] Code reviewed and approved

---

## 14. Architectural Principles

### 14.1 Core Principles

**Separation of Concerns**:
- UI components should not contain business logic
- Services should not contain UI logic
- Features should be self-contained

**DRY (Don't Repeat Yourself)**:
- Reuse existing components
- Reuse existing services
- Reuse existing hooks
- Extract common logic

**SOLID Principles**:
- **S**ingle Responsibility: Each module has one reason to change
- **O**pen/Closed: Open for extension, closed for modification
- **L**iskov Substitution: Subtypes must be substitutable
- **I**nterface Segregation: Small, specific interfaces
- **D**ependency Inversion: Depend on abstractions

### 14.2 Frontend Principles

**Component Composition**:
- Prefer composition over inheritance
- Use slot-based composition
- Keep components small and focused

**State Management**:
- Local state for component-specific state
- Context for app-wide state
- Services for server state
- Avoid prop drilling

**Performance**:
- Use React.memo for expensive components
- Use useMemo for expensive computations
- Use useCallback for stable function references
- Lazy load routes
- Code split by route

### 14.3 Backend Principles

**Clean Architecture**:
- Routes → Services → Repositories
- Depend on abstractions
- Business logic in services
- Data access in repositories

**API Design**:
- RESTful endpoints
- Consistent response format
- Proper error handling
- Rate limiting
- Input validation

### 14.4 Plugin Principles

**Plugin Architecture**:
- Plugin should be self-contained
- Plugin should not depend on specific UI
- Plugin should use standard communication protocol
- Plugin should handle errors gracefully

---

## 15. Repository Maintenance Rules

### 15.1 Branch Strategy

**Main Branch**:
- Always deployable
- No direct commits
- Only merged via pull requests

**Feature Branches**:
- Named: `feature/[feature-name]`
- Created from main
- Merged to main via pull request

**Bugfix Branches**:
- Named: `bugfix/[bug-description]`
- Created from main
- Merged to main via pull request

**Hotfix Branches**:
- Named: `hotfix/[hotfix-description]`
- Created from main
- Merged to main and release branches

### 15.2 Commit Messages

**Format**: `type(scope): description`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```bash
feat(workspace): add generation status panel
fix(auth): resolve login token expiration
docs(readme): update installation instructions
refactor(components): extract button component
```

### 15.3 Pull Request Guidelines

**PR Title**: Follow commit message format
**PR Description**: Include:
- Description of changes
- Related issue number
- Screenshots (if UI changes)
- Testing instructions
- Breaking changes (if any)

**PR Checklist**:
- [ ] Code follows handbook
- [ ] Tests pass
- [ ] TypeScript build passes
- [ ] Lint passes
- [ ] Documentation updated
- [ ] No merge conflicts

### 15.4 Release Process

**Versioning**: Semantic Versioning (SemVer)
- MAJOR: Breaking changes
- MINOR: New features (backwards compatible)
- PATCH: Bug fixes (backwards compatible)

**Release Steps**:
1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag
4. Deploy to production
5. Announce release

### 15.5 Code of Conduct

**Be Respectful**:
- Treat all team members with respect
- Provide constructive feedback
- Accept feedback gracefully
- Collaborate effectively

**Be Professional**:
- Write clear, professional code
- Write clear, professional documentation
- Communicate clearly and effectively
- Meet commitments

**Be Inclusive**:
- Welcome new team members
- Share knowledge
- Help others learn
- Celebrate successes

---

## Appendix

### A. Quick Reference

**Path Aliases**:
- `@/shared/ui/Button` - Shared UI components
- `@/services/projectService` - API services
- `@/hooks/useSocket` - React hooks
- `@/features/workspace` - Feature modules

**Design Tokens**:
- Colors: brand-500, accent-500, success-400, error-400
- Spacing: p-4, m-4, gap-4 (4px base unit)
- Typography: font-sans, font-mono
- Radius: rounded-lg, rounded-xl, rounded-full

**Component Naming**:
- Components: PascalCase (Button, UserProfile)
- Hooks: camelCase with use prefix (useSocket)
- Services: camelCase (projectService)
- Types: camelCase (user.types.ts)

### B. Resources

**Documentation**:
- Component Registry: docs/COMPONENT_REGISTRY.md
- Feature Registry: docs/FEATURE_REGISTRY.md
- Architecture Map: docs/PROJECT_ARCHITECTURE_MAP.md
- Design System: docs/design/DESIGN_SYSTEM.md

**Tools**:
- TypeScript: https://www.typescriptlang.org/
- React: https://react.dev/
- Tailwind CSS: https://tailwindcss.com/
- Vite: https://vitejs.dev/

### C. Contact

**Questions**: Contact the tech lead or architect
**Suggestions**: Submit as pull requests to this handbook
**Issues**: Create GitHub issue with label "handbook"

---

**Document Version**: 1.0  
**Last Updated**: July 13, 2026  
**Next Review**: October 13, 2026
