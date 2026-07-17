# Implementation Plan

## Overview

This task list follows the exploratory bugfix workflow for the responsive layout fix. The bug condition is: viewport width < 1024px causes layout shell components (Sidebar, TopBar, AppShell, page grids, Landing hero) to render at desktop sizes. The fix introduces viewport-aware responsive behavior using Tailwind breakpoints (md: 768px, lg: 1024px) while preserving all desktop (≥ 1024px) behavior.

## Task Dependency Graph

```json
{
  "waves": [["1", "2"], ["3"], ["4"]]
}
```

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Layout Components Do Not Adapt Below 1024px
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate layout components render at desktop sizes regardless of viewport width
  - **Scoped PBT Approach**: Generate viewport widths in range 320–1023px and assert responsive behavior for each component type
  - Bug Condition from design: `isBugCondition(input)` returns true when `input.width < 1024` for sidebar/content components, or `input.width < 768` for topbar/grid/hero components
  - Test assertions (Expected Behavior):
    - Sidebar at width < 768px: must be hidden off-screen (translateX -100% or display none)
    - Sidebar at width 768–1023px: must be collapsed to w-16 (64px width)
    - TopBar at width < 768px: AI status, Roblox status, and active project elements must not be visible
    - TopBar at width < 768px: container scrollWidth must not exceed clientWidth (no overflow)
    - Page grids at width < 768px: must render single-column layout (gridTemplateColumns = 1 column)
    - Landing hero at width < 768px: no horizontal overflow, scaled typography and spacing
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found:
    - Sidebar computed width = 256px at viewport 600px (should be 0/hidden)
    - Sidebar computed width = 256px at viewport 900px (should be 64px)
    - TopBar container scrollWidth > clientWidth at viewport 375px
    - Dashboard grid renders multiple columns at viewport 500px
    - Landing hero triggers horizontal scroll at viewport 390px
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Desktop Layout Unchanged at Viewport ≥ 1024px
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (viewport width ≥ 1024px):
    - Observe: Sidebar at 1024px renders at width 256px (w-64) when expanded
    - Observe: Sidebar at 1024px renders at width 64px (w-16) when manually collapsed
    - Observe: TopBar at 1024px+ renders all elements (AI status, Roblox connection, search, notifications, user menu, breadcrumbs, active project) visible
    - Observe: Dashboard page at 1280px renders 4-column card grid and xl:grid-cols-[1.2fr_0.8fr] secondary grid
    - Observe: Landing hero at 1440px renders two-column grid with full desktop typography
    - Observe: Manual sidebar toggle at 1200px switches between w-64 and w-16 correctly
  - Write property-based tests:
    - Generate random viewport widths in range 1024–2560px
    - For each width, assert Sidebar width is 256px (expanded) or 64px (manually collapsed)
    - For each width, assert all TopBar elements (AI status, Roblox status, active project) are visible
    - For each width, assert page grid column count matches desktop configuration (4 columns for cards)
    - For each width, assert Landing Page hero grid is two-column with desktop typography classes
    - For each width, assert main content offset equals sidebar width (ml-64 or ml-16)
    - Assert manual sidebar toggle toggles between w-64 and w-16 at any desktop width
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline desktop behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 3. Fix for responsive layout — components do not adapt below 1024px

  - [ ] 3.1 Add viewport detection to AppShell
    - Introduce a `useMediaQuery` or `useBreakpoint` hook in AppShell to determine current breakpoint (mobile < 768px, tablet 768–1023px, desktop ≥ 1024px)
    - Track `mobileOpen` state for mobile sidebar overlay
    - Auto-collapse sidebar on tablet (force `collapsed = true` when viewport is md but not lg)
    - Pass viewport state and `mobileOpen` prop to Sidebar component
    - Wire toggle handler to control mobile sidebar open/close
    - _Bug_Condition: isBugCondition(input) where input.width < 1024 for sidebar/content_
    - _Expected_Behavior: AppShell manages responsive state and propagates to children_
    - _Preservation: Desktop (≥ 1024px) behavior unchanged — no auto-collapse, no mobileOpen interference_
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.1, 3.4, 3.5_

  - [ ] 3.2 Implement responsive Sidebar behavior
    - Replace static `collapsed ? "w-16" : "w-64"` with responsive variants incorporating Tailwind breakpoints
    - Mobile (< 768px): Apply `-translate-x-full` by default to hide off-screen; use `translate-x-0` when `mobileOpen` is true
    - Tablet (768–1023px): Force `w-16` icon-only rail regardless of collapsed prop
    - Desktop (≥ 1024px): Keep existing `w-64` / `w-16` toggle behavior unchanged
    - Add backdrop overlay when sidebar is open on mobile (semi-transparent background, click to close)
    - Accept `mobileOpen` prop from AppShell
    - _Bug_Condition: isBugCondition(input) where input.width < 1024 for sidebar component_
    - _Expected_Behavior: Sidebar width = 0 (hidden) on mobile, 64px on tablet, 256px/64px on desktop_
    - _Preservation: Desktop rendering unchanged — w-64 expanded, w-16 collapsed, manual toggle works_
    - _Requirements: 2.1, 2.2, 3.1, 3.5_

  - [ ] 3.3 Implement responsive TopBar behavior
    - Add `hidden md:flex` to AI status indicator container
    - Add `hidden md:flex` to Roblox connection status container
    - Add `hidden md:flex` to active project indicator container
    - Ensure sidebar toggle button remains visible and prominent on mobile as hamburger menu
    - Verify no horizontal overflow at any mobile viewport width
    - _Bug_Condition: isBugCondition(input) where input.width < 768 for topbar component_
    - _Expected_Behavior: Non-essential elements hidden on mobile, toggle button visible_
    - _Preservation: All TopBar elements visible and rendered unchanged at ≥ 768px_
    - _Requirements: 2.3, 2.5, 3.2_

  - [ ] 3.4 Adjust main content offset in AppShell/Workspace
    - Apply responsive margin/padding classes to main content wrapper: `lg:ml-64 md:ml-16 ml-0`
    - Ensure offset matches sidebar state at each breakpoint (256px desktop expanded, 64px tablet, 0px mobile)
    - Handle dynamic offset when sidebar is manually collapsed on desktop (`lg:ml-16`)
    - Optionally hide side panels in Workspace below md breakpoint
    - _Bug_Condition: isBugCondition(input) where input.width < 1024 for content component_
    - _Expected_Behavior: Content offset = 0 on mobile, 64px on tablet, 256px/64px on desktop_
    - _Preservation: Desktop content offset unchanged (w-64 or w-16 depending on collapse state)_
    - _Requirements: 2.4, 3.4_

  - [ ] 3.5 Fix page grid responsive breakpoints
    - DashboardPage: Change secondary grid from `xl:grid-cols-[1.2fr_0.8fr]` to `lg:grid-cols-[1.2fr_0.8fr]` so it collapses to single-column below lg
    - Verify 4-card grid already uses `lg:grid-cols-4` (collapses below lg) — confirm no changes needed
    - Ensure all multi-column grids (Analytics, Projects) collapse to single-column below md (768px)
    - _Bug_Condition: isBugCondition(input) where input.width < 768 for grid component_
    - _Expected_Behavior: Single-column stacked layout on mobile, multi-column on desktop_
    - _Preservation: Desktop grid configurations unchanged at ≥ 1024px_
    - _Requirements: 2.6, 3.3_

  - [ ] 3.6 Scale Landing Page hero for mobile
    - Adjust hero heading typography: `text-2xl sm:text-4xl lg:text-6xl` for progressive scaling
    - Reduce hero padding: change `py-20` to `py-10 md:py-20`
    - Reduce hero gap: change `gap-16` to `gap-8 md:gap-16`
    - Verify `lg:grid-cols-[1.1fr_0.9fr]` hero grid collapses to single-column below lg
    - Scale "How it works" section padding: `p-4 md:p-8`
    - Add mobile padding adjustments to pricing/FAQ sections
    - Ensure no horizontal scroll at any mobile viewport width
    - _Bug_Condition: isBugCondition(input) where input.width < 768 for hero component_
    - _Expected_Behavior: Scaled typography, reduced spacing, single-column layout on mobile_
    - _Preservation: Desktop hero typography, spacing, and two-column layout unchanged at ≥ 1024px_
    - _Requirements: 2.7, 3.6_

  - [ ] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Layout Components Adapt Below 1024px
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all bug condition inputs
    - When this test passes, it confirms:
      - Sidebar hidden on mobile, collapsed on tablet
      - TopBar hides non-essential elements on mobile
      - Content offset adjusts correctly
      - Grids collapse to single-column on mobile
      - Landing hero scales on mobile
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms all responsive behavior is correctly implemented)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Desktop Layout Unchanged at Viewport ≥ 1024px
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions to desktop behavior)
    - Confirm all preservation assertions still hold:
      - Sidebar width correct at desktop viewports
      - All TopBar elements visible at desktop viewports
      - Grid configurations unchanged at desktop viewports
      - Landing hero layout unchanged at desktop viewports
      - Manual sidebar toggle still functions correctly
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run full test suite (unit, property-based, integration)
  - Verify bug condition exploration test passes (confirms fix works)
  - Verify preservation property tests pass (confirms no regressions)
  - Run any existing project tests to catch unintended breakage
  - Manually verify (or document for manual QA): resize browser 1440px → 900px → 375px → 1440px and confirm layout adapts at each transition
  - Ensure no TypeScript errors or lint warnings introduced
  - Ask the user if questions arise

## Notes

- Property-based tests generate random viewport widths across the full range to catch edge cases at breakpoint boundaries
- The observation-first methodology for preservation tests ensures we capture real pre-fix behavior, not assumed behavior
- All responsive changes use Tailwind utility classes — no custom CSS or media queries needed
- The fix is purely presentational (CSS/class changes) — no business logic, routing, or data-fetching changes
- Test framework: use project's existing test setup (Vitest + Testing Library recommended for component rendering at specific viewport widths)
