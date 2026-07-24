# Design System Execution Report

**Project**: Roblox AI Studio Control Center  
**Phase**: UX-3C.6 — Design System Migration  
**Date**: July 13, 2026  
**Status**: READY FOR EXECUTION  
**Type**: EXECUTION PLAN ONLY - NO CODE CHANGES MADE

---

## Executive Summary

**Current Design System Compliance**: 6/10  
**Target Design System Compliance**: 9.5/10  
**Total Atomic Tasks**: 12  
**Estimated Total Effort**: 80 hours  
**Risk Level**: HIGH  
**Build Stability**: Must be preserved after each task

This report provides a detailed, atomic execution plan for upgrading all remaining legacy components to match the design system. Each task is designed to be executed independently with immediate validation.

---

## Task Overview

| Task ID                             | Description                                       | Files Affected           | Effort   | Risk   |
| ----------------------------------- | ------------------------------------------------- | ------------------------ | -------- | ------ |
| DS-1                                | Audit workspace components for design violations  | src/features/workspace/* | 4 hours  | LOW    |
| DS-2                                | Fix color violations in workspace components      | src/features/workspace/* | 8 hours  | MEDIUM |
| DS-3                                | Fix spacing violations in workspace components    | src/features/workspace/* | 8 hours  | MEDIUM |
| DS-4                                | Fix typography violations in workspace components | src/features/workspace/* | 6 hours  | MEDIUM |
| DS-5                                | Fix radius violations in workspace components     | src/features/workspace/* | 4 hours  | LOW    |
| DS-6                                | Fix shadow violations in workspace components     | src/features/workspace/* | 4 hours  | LOW    |
| DS-7                                | Fix animation violations in workspace components  | src/features/workspace/* | 4 hours  | LOW    |
| DS-8                                | Add responsive classes to workspace components    | src/features/workspace/* | 12 hours | MEDIUM |
| DS-9                                | Add ARIA labels to workspace components           | src/features/workspace/* | 8 hours  | MEDIUM |
| DS-10                               | Add keyboard navigation to workspace components   | src/features/workspace/* | 8 hours  | MEDIUM |
| DS-11                               | Run design system compliance audit                | All components           | 4 hours  | LOW    |
| DS-12: Final validation and cleanup | Multiple                                          | 2 hours                  | LOW      |

---

## Task DS-1: Audit Workspace Components for Design Violations

### Task Description

Audit all workspace components to identify design system violations.

### Exact Files Affected

- src/features/workspace/components/* (all workspace components)

### Dependency Analysis

**Incoming Dependencies**: None
**Outgoing Dependencies**: None (audit only)

### Implementation Order

1. Process each workspace component
2. Check for color violations (custom colors vs design tokens)
3. Check for spacing violations (arbitrary spacing vs 4px base unit)
4. Check for typography violations (custom fonts/sizes vs design tokens)
5. Check for radius violations (custom radius vs design tokens)
6. Check for shadow violations (custom shadows vs design tokens)
7. Check for animation violations (custom animations vs design tokens)
8. Check for responsive violations (missing responsive classes)
9. Check for accessibility violations (missing ARIA labels, keyboard navigation)
10. Document all violations

### Risk Assessment

**Risk Level**: LOW

- Audit only
- No code changes
- Documentation

### Rollback Strategy

N/A (audit only)

### Validation Checklist

- [ ] All workspace components audited
- [ ] Color violations documented
- [ ] Spacing violations documented
- [ ] Typography violations documented
- [ ] Radius violations documented
- [ ] Shadow violations documented
- [ ] Animation violations documented
- [ ] Responsive violations documented
- [ ] Accessibility violations documented

### Estimated Effort

4 hours

### Expected Repository State After Completion

- Design violations documented
- Build stable

---

## Task DS-2: Fix Color Violations in Workspace Components

### Task Description

Fix color violations in workspace components to use design tokens.

### Exact Files Affected

- src/features/workspace/components/* (components with color violations)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each component with color violations
2. Replace custom colors with design tokens:
   - Custom blue → brand-500
   - Custom green → success-400
   - Custom red → error-400
   - Custom yellow → warning-400
   - Custom gray → slate-900, slate-800, slate-500, etc.
3. Replace background colors with design tokens
4. Replace text colors with design tokens
5. Replace border colors with design tokens
6. Validate each component
7. Validate build

### Color Token Mapping

```typescript
// Custom colors → Design tokens
custom-blue → brand-500
custom-green → success-400
custom-red → error-400
custom-yellow → warning-400
custom-gray-900 → slate-950
custom-gray-800 → slate-900
custom-gray-700 → slate-800
custom-gray-500 → slate-500
custom-gray-400 → slate-400
custom-gray-300 → slate-300
```

### Risk Assessment

**Risk Level**: MEDIUM

- Affects visual appearance
- Must match design system
- Visual testing required

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] Color violations fixed
- [ ] All colors use design tokens
- [ ] No custom colors remain
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`
- [ ] Visual appearance correct

### Estimated Effort

8 hours

### Expected Repository State After Completion

- Color violations fixed
- All colors use design tokens
- Build stable

---

## Task DS-3: Fix Spacing Violations in Workspace Components

### Task Description

Fix spacing violations in workspace components to use 4px base unit.

### Exact Files Affected

- src/features/workspace/components/* (components with spacing violations)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each component with spacing violations
2. Replace arbitrary spacing with 4px base unit:
   - Custom padding → p-4, p-6, p-8, etc.
   - Custom margin → m-4, m-6, m-8, etc.
   - Custom gap → gap-4, gap-6, gap-8, etc.
3. Replace custom spacing values with Tailwind spacing scale
4. Validate each component
5. Validate build

### Spacing Token Mapping

```typescript
// Arbitrary spacing → 4px base unit
padding: 8px → p-2
padding: 12px → p-3
padding: 16px → p-4
padding: 20px → p-5
padding: 24px → p-6
padding: 32px → p-8
padding: 40px → p-10
padding: 48px → p-12
```

### Risk Assessment

**Risk Level**: MEDIUM

- Affects layout
- Must match design system
- Visual testing required

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] Spacing violations fixed
- [ ] All spacing uses 4px base unit
- [ ] No arbitrary spacing remains
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`
- [ ] Layout correct

### Estimated Effort

8 hours

### Expected Repository State After Completion

- Spacing violations fixed
- All spacing uses 4px base unit
- Build stable

---

## Task DS-4: Fix Typography Violations in Workspace Components

### Task Description

Fix typography violations in workspace components to use design tokens.

### Exact Files Affected

- src/features/workspace/components/* (components with typography violations)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each component with typography violations
2. Replace custom fonts with design tokens:
   - Custom font → font-sans (Inter)
   - Custom monospace → font-mono (JetBrains Mono)
3. Replace custom font sizes with design tokens:
   - Custom sizes → text-xs, text-sm, text-base, text-lg, text-xl, text-2xl
4. Replace custom font weights with design tokens:
   - Custom weights → font-normal, font-medium, font-semibold, font-bold
5. Validate each component
6. Validate build

### Typography Token Mapping

```typescript
// Custom typography → Design tokens
font-family: Arial → font-sans
font-family: monospace → font-mono
font-size: 12px → text-xs
font-size: 14px → text-sm
font-size: 16px → text-base
font-size: 18px → text-lg
font-size: 20px → text-xl
font-size: 24px → text-2xl
font-weight: 400 → font-normal
font-weight: 500 → font-medium
font-weight: 600 → font-semibold
font-weight: 700 → font-bold
```

### Risk Assessment

**Risk Level**: MEDIUM

- Affects typography
- Must match design system
- Visual testing required

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] Typography violations fixed
- [ ] All fonts use design tokens
- [ ] All font sizes use design tokens
- [ ] All font weights use design tokens
- [ ] No custom typography remains
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`
- [ ] Typography correct

### Estimated Effort

6 hours

### Expected Repository State After Completion

- Typography violations fixed
- All typography uses design tokens
- Build stable

---

## Task DS-5: Fix Radius Violations in Workspace Components

### Task Description

Fix radius violations in workspace components to use design tokens.

### Exact Files Affected

- src/features/workspace/components/* (components with radius violations)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each component with radius violations
2. Replace custom radius with design tokens:
   - Custom radius → rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-full
3. Validate each component
4. Validate build

### Radius Token Mapping

```typescript
// Custom radius → Design tokens
border-radius: 4px → rounded-sm
border-radius: 8px → rounded-md
border-radius: 12px → rounded-lg
border-radius: 16px → rounded-xl
border-radius: 9999px → rounded-full
```

### Risk Assessment

**Risk Level**: LOW

- Affects border radius
- Simple change
- Low risk

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] Radius violations fixed
- [ ] All radius uses design tokens
- [ ] No custom radius remains
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`

### Estimated Effort

4 hours

### Expected Repository State After Completion

- Radius violations fixed
- All radius uses design tokens
- Build stable

---

## Task DS-6: Fix Shadow Violations in Workspace Components

### Task Description

Fix shadow violations in workspace components to use design tokens.

### Exact Files Affected

- src/features/workspace/components/* (components with shadow violations)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each component with shadow violations
2. Replace custom shadows with design tokens:
   - Elevated elements → shadow-glow
   - Standard elements → no shadow or standard Tailwind shadows
3. Validate each component
4. Validate build

### Shadow Token Mapping

```typescript
// Custom shadows → Design tokens
custom-glow → shadow-glow
custom-shadow → shadow-lg or shadow-xl
no shadow → no class
```

### Risk Assessment

**Risk Level**: LOW

- Affects shadows
- Simple change
- Low risk

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] Shadow violations fixed
- [ ] All shadows use design tokens
- [ ] No custom shadows remain
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`

### Estimated Effort

4 hours

### Expected Repository State After Completion

- Shadow violations fixed
- All shadows use design tokens
- Build stable

---

## Task DS-7: Fix Animation Violations in Workspace Components

### Task Description

Fix animation violations in workspace components to use design tokens.

### Exact Files Affected

- src/features/workspace/components/* (components with animation violations)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each component with animation violations
2. Replace custom animations with design tokens:
   - Custom durations → duration-150, duration-200, duration-300, duration-500
   - Custom easing → ease-out, ease-in-out
3. Validate each component
4. Validate build

### Animation Token Mapping

```typescript
// Custom animations → Design tokens
transition: 150ms → duration-150
transition: 200ms → duration-200
transition: 300ms → duration-300
transition: 500ms → duration-500
ease-in-out → ease-in-out
ease-out → ease-out
```

### Risk Assessment

**Risk Level**: LOW

- Affects animations
- Simple change
- Low risk

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] Animation violations fixed
- [ ] All animations use design tokens
- [ ] No custom animations remain
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`

### Estimated Effort

4 hours

### Expected Repository State After Completion

- Animation violations fixed
- All animations use design tokens
- Build stable

---

## Task DS-8: Add Responsive Classes to Workspace Components

### Task Description

Add responsive classes to workspace components for mobile, tablet, and desktop.

### Exact Files Affected

- src/features/workspace/components/* (all workspace components)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each workspace component
2. Add responsive classes for:
   - Padding: p-4 md:p-6 lg:p-8
   - Font size: text-sm md:text-base lg:text-lg
   - Grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
   - Flex: flex-col md:flex-row
3. Test on mobile (375px)
4. Test on tablet (768px)
5. Test on desktop (1024px+)
6. Validate each component
7. Validate build

### Responsive Breakpoints

```typescript
// Breakpoints
Mobile: < 768px
Tablet: 768px - 1023px
Desktop: ≥ 1024px

// Responsive classes
p-4 → p-4 md:p-6 lg:p-8
text-sm → text-sm md:text-base lg:text-lg
grid-cols-1 → grid-cols-1 md:grid-cols-2 lg:grid-cols-3
```

### Risk Assessment

**Risk Level**: MEDIUM

- Affects responsive behavior
- Requires testing on multiple devices
- Complex change

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] Responsive classes added
- [ ] Mobile layout correct
- [ ] Tablet layout correct
- [ ] Desktop layout correct
- [ ] No broken imports
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`

### Estimated Effort

12 hours

### Expected Repository State After Completion

- Responsive classes added
- All breakpoints tested
- Build stable

---

## Task DS-9: Add ARIA Labels to Workspace Components

### Task Description

Add ARIA labels to workspace components for accessibility.

### Exact Files Affected

- src/features/workspace/components/* (all interactive components)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each interactive component
2. Add aria-label to buttons without text
3. Add aria-label to icon-only buttons
4. Add aria-describedby to modals
5. Add aria-labelledby to modals
6. Add aria-expanded to dropdowns
7. Add aria-haspopup to dropdowns
8. Add role="tablist" and aria-selected to tabs
9. Validate each component
10. Validate build

### ARIA Label Examples

```typescript
// Button with icon
<button aria-label="Close dialog">
  <X />
</button>

// Modal
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
>

// Dropdown
<button aria-expanded={isOpen} aria-haspopup="true">

// Tabs
<div role="tablist">
  <button role="tab" aria-selected={isActive}>
```

### Risk Assessment

**Risk Level**: MEDIUM

- Affects accessibility
- Requires screen reader testing
- Important for compliance

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] ARIA labels added to all interactive elements
- [ ] aria-label added to icon-only buttons
- [ ] aria-describedby added to modals
- [ ] aria-labelledby added to modals
- [ ] aria-expanded added to dropdowns
- [ ] aria-haspopup added to dropdowns
- [ ] role and aria-selected added to tabs
- [ ] No broken imports
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`
- [ ] Screen reader test passes (if available)

### Estimated Effort

8 hours

### Expected Repository State After Completion

- ARIA labels added
- Accessibility improved
- Build stable

---

## Task DS-10: Add Keyboard Navigation to Workspace Components

### Task Description

Add keyboard navigation to workspace components for accessibility.

### Exact Files Affected

- src/features/workspace/components/* (all interactive components)

### Dependency Analysis

**Incoming Dependencies**: DS-1 (audit complete)
**Outgoing Dependencies**: None

### Implementation Order

1. Process each interactive component
2. Add onKeyDown handlers to buttons
3. Add Enter key support to buttons
4. Add Space key support to buttons
5. Add Escape key support to modals
6. Add Arrow key support to dropdowns
7. Add Arrow key support to tabs
8. Add focus management to modals
9. Validate each component
10. Validate build

### Keyboard Navigation Examples

```typescript
// Button
<button
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') handleClick();
  }}
>

// Modal
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('keydown', handleEscape);
  return () => document.removeEventListener('keydown', handleEscape);
}, [onClose]);

// Dropdown
<button
  onKeyDown={(e) => {
    if (e.key === 'ArrowDown') openDropdown();
  }}
>
```

### Risk Assessment

**Risk Level**: MEDIUM

- Affects keyboard navigation
- Requires keyboard testing
- Important for accessibility

### Rollback Strategy

```bash
# Rollback command
git checkout HEAD -- src/features/workspace/components/
```

### Validation Checklist

- [ ] Keyboard navigation added to all interactive elements
- [ ] Enter key works on buttons
- [ ] Space key works on buttons
- [ ] Escape key closes modals
- [ ] Arrow keys navigate dropdowns
- [ ] Arrow keys navigate tabs
- [ ] Focus management implemented
- [ ] No broken imports
- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`
- [ ] Keyboard navigation test passes

### Estimated Effort

8 hours

### Expected Repository State After Completion

- Keyboard navigation added
- Accessibility improved
- Build stable

---

## Task DS-11: Run Design System Compliance Audit

### Task Description

Run a comprehensive design system compliance audit on all components.

### Exact Files Affected

- All components (validation only)

### Dependency Analysis

**Incoming Dependencies**: All previous tasks
**Outgoing Dependencies**: None

### Implementation Order

1. Audit all shared/ui components
2. Audit all workspace components
3. Verify design token usage
4. Verify color compliance
5. Verify spacing compliance
6. Verify typography compliance
7. Verify radius compliance
8. Verify shadow compliance
9. Verify animation compliance
10. Verify responsive behavior
11. Verify accessibility (ARIA labels)
12. Verify accessibility (keyboard navigation)
13. Verify dark theme compliance
14. Calculate compliance score
15. Document results

### Risk Assessment

**Risk Level**: LOW

- Audit only
- No code changes
- Documentation

### Rollback Strategy

N/A (audit only)

### Validation Checklist

- [ ] All components audited
- [ ] Design token usage verified
- [ ] Color compliance verified
- [ ] Spacing compliance verified
- [ ] Typography compliance verified
- [ ] Radius compliance verified
- [ ] Shadow compliance verified
- [ ] Animation compliance verified
- [ ] Responsive behavior verified
- [ ] ARIA labels verified
- [ ] Keyboard navigation verified
- [ ] Dark theme compliance verified
- [ ] Compliance score calculated
- [ ] Compliance score ≥ 9.5/10

### Estimated Effort

4 hours

### Expected Repository State After Completion

- Design system compliance documented
- Compliance score ≥ 9.5/10
- Build stable

---

## Task DS-12: Final Validation and Cleanup

### Task Description

Perform final validation of all design system migration changes.

### Exact Files Affected

- Multiple (validation only)

### Dependency Analysis

**Incoming Dependencies**: All previous tasks
**Outgoing Dependencies**: None

### Implementation Order

1. Run TypeScript build
2. Run lint
3. Run full build
4. Test all routes in browser
5. Test all user flows
6. Test responsive behavior on all breakpoints
7. Test keyboard navigation
8. Test dark theme
9. Verify design system compliance
10. Update DESIGN_SYSTEM_MIGRATION_REPORT.md with completion status
11. Generate completion summary

### Risk Assessment

**Risk Level**: LOW

- Validation only
- No code changes

### Rollback Strategy

N/A (validation only)

### Validation Checklist

- [ ] TypeScript build passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`
- [ ] Application runs: `npm run dev`
- [ ] All routes functional
- [ ] All user flows functional
- [ ] Responsive behavior correct
- [ ] Keyboard navigation functional
- [ ] Dark theme correct
- [ ] Design system compliance ≥ 9.5/10
- [ ] DESIGN_SYSTEM_MIGRATION_REPORT.md updated

### Estimated Effort

2 hours

### Expected Repository State After Completion

- Design system compliance ≥ 9.5/10
- All violations fixed
- Responsive behavior implemented
- Accessibility improved
- Build stable
- All functionality preserved

---

## Execution Order Summary

**Phase 1: Audit (Low Risk)**

1. DS-1: Audit workspace components

**Phase 2: Fix Visual Violations (Medium Risk)** 2. DS-2: Fix color violations 3. DS-3: Fix spacing violations 4. DS-4: Fix typography violations

**Phase 3: Fix Design Token Violations (Low Risk)** 5. DS-5: Fix radius violations 6. DS-6: Fix shadow violations 7. DS-7: Fix animation violations

**Phase 4: Add Responsive and Accessibility (Medium Risk)** 8. DS-8: Add responsive classes 9. DS-9: Add ARIA labels 10. DS-10: Add keyboard navigation

**Phase 5: Validation (Low Risk)** 11. DS-11: Run design system compliance audit 12. DS-12: Final validation and cleanup

---

## Global Validation Commands

After each task, run:

```bash
# TypeScript check
npm run typecheck

# Lint
npm run lint

# Build
npm run build

# Dev server (manual testing)
npm run dev
```

---

## Rollback Procedure

If any task fails validation:

1. Stop execution immediately
2. Use the rollback command specified in the task
3. Verify build stability
4. Investigate failure
5. Fix issue before retrying
6. Document issue in execution report

---

## Completion Criteria

Phase UX-3C.6 is complete when:

- [ ] All 12 tasks executed
- [ ] All validation checks pass
- [ ] Color violations fixed
- [ ] Spacing violations fixed
- [ ] Typography violations fixed
- [ ] Radius violations fixed
- [ ] Shadow violations fixed
- [ ] Animation violations fixed
- [ ] Responsive classes added
- [ ] ARIA labels added
- [ ] Keyboard navigation added
- [ ] Design system compliance ≥ 9.5/10
- [ ] Build stable
- [ ] All functionality preserved
- [ ] DESIGN_SYSTEM_EXECUTION_REPORT.md updated with actual results

---

## Expected Final Repository State

After completing all tasks:

- All workspace components design system compliant
- All colors use design tokens
- All spacing uses 4px base unit
- All typography uses design tokens
- All radius uses design tokens
- All shadows use design tokens
- All animations use design tokens
- All components responsive
- All components accessible (ARIA labels)
- All components accessible (keyboard navigation)
- Design system compliance ≥ 9.5/10
- Build stable
- All functionality preserved

---

## Notes

- Execute tasks in order
- Validate after each task
- Do not proceed if validation fails
- Document any issues encountered
- Update this report with actual results after execution
