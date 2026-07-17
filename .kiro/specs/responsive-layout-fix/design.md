# Responsive Layout Fix - Bugfix Design

## Overview

The application's layout shell (Sidebar, TopBar, AppShell) and page-level grids (DashboardPage, LandingPage) use fixed, desktop-only sizing. On viewports below 1024px the Sidebar consumes excessive space, the TopBar overflows horizontally, content offsets are wrong, and multi-column grids force horizontal scroll. This design formalizes the bug condition, defines expected responsive behavior at each breakpoint (mobile < 768px, tablet 768–1023px, desktop ≥ 1024px), and outlines the minimal Tailwind-based fix that preserves all desktop behavior and business logic.

## Glossary

- **Bug_Condition (C)**: The viewport width is below 1024px, causing the layout shell to render incorrectly
- **Property (P)**: The layout adapts responsively — collapsed sidebar on tablet, hidden sidebar + compact TopBar on mobile, single-column grids on mobile
- **Preservation**: All desktop (≥ 1024px) rendering, manual sidebar toggle behavior, navigation routing, and business logic remain unchanged
- **Sidebar**: The `<Sidebar>` component in `src/shared/ui/layout/Sidebar.tsx` — a fixed-position left rail (w-64 expanded / w-16 collapsed)
- **TopBar**: The `<TopBar>` component in `src/shared/ui/layout/TopBar.tsx` — a sticky header with breadcrumbs, status indicators, and actions
- **AppShell**: The `<AppShell>` component in `src/shared/ui/layout/AppShell.tsx` — the root layout composing Sidebar, TopBar, and main content
- **Workspace**: The `<Workspace>` component in `src/shared/ui/layout/Workspace.tsx` — the main content area wrapper
- **Viewport breakpoints**: Tailwind defaults — `md` (768px), `lg` (1024px)

## Bug Details

### Bug Condition

The bug manifests when the viewport width is below 1024px. The Sidebar, TopBar, and page grids render as though the viewport were desktop-sized, causing overflow, displacement, and an unusable mobile experience.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type ViewportState { width: number, component: "sidebar" | "topbar" | "content" | "grid" | "hero" }
  OUTPUT: boolean

  IF input.component IN ["sidebar", "content"] THEN
    RETURN input.width < 1024
  END IF

  IF input.component IN ["topbar", "grid", "hero"] THEN
    RETURN input.width < 768
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Sidebar on 600px mobile**: Sidebar renders at w-64 (256px), consuming 42% of screen width. Expected: hidden entirely, accessible via hamburger toggle.
- **Sidebar on 900px tablet**: Sidebar renders at w-64, leaving only 644px for content. Expected: collapsed to w-16 (64px) icon-only rail automatically.
- **TopBar on 375px mobile**: All elements (AI status, Roblox status, project indicator, search, notifications, user menu) render inline, causing horizontal overflow beyond the viewport. Expected: AI status, Roblox status, and active project hidden; only toggle + breadcrumbs on left, search + notifications + user on right.
- **Dashboard grid on 500px mobile**: 4-column `lg:grid-cols-4` renders at full width forcing horizontal scroll. Expected: single-column stack.
- **Landing hero on 390px mobile**: `text-4xl sm:text-6xl` heading and `lg:grid-cols-[1.1fr_0.9fr]` layout do not collapse below `lg`. Expected: stacked single-column with scaled typography and spacing.
- **Desktop at 1440px**: All elements render as before the fix. Expected: no change.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Desktop viewport (≥ 1024px): full Sidebar at w-64 with labels visible, collapsible to w-16 via manual toggle
- Desktop viewport (≥ 1024px): all TopBar elements rendered inline without modification
- Desktop viewport (≥ 1024px): multi-column grids render at their defined column counts
- Desktop viewport (≥ 1024px): Landing Page hero renders at current typography and layout
- Manual sidebar toggle on desktop continues to switch between w-64 and w-16
- All navigation routing, link behavior, and business logic unchanged at any viewport
- Status indicators, notification behavior, and user menu functionality unchanged

**Scope:**
All inputs where viewport width ≥ 1024px should be completely unaffected by this fix. Additionally, on any viewport:

- Click and keyboard interactions on navigation items
- Data fetching and display logic in pages
- Routing behavior
- Authentication and user state management

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **No viewport-aware sidebar state**: `Sidebar.tsx` applies `w-16` or `w-64` based solely on the `collapsed` prop with no responsive class variants (e.g., `lg:w-64 md:w-16`). There is no media-query-driven auto-collapse or hide behavior.

2. **No mobile overlay pattern**: `Sidebar.tsx` is `fixed inset-y-0 left-0` at all times. Below 768px it should be hidden by default and shown as an overlay only when toggled. No `translate-x` or conditional rendering exists for mobile.

3. **TopBar renders all elements unconditionally**: `TopBar.tsx` lays out AI status, Roblox status, and active project indicators without responsive `hidden md:flex` classes. On narrow viewports these overflow.

4. **AppShell does not pass viewport context**: `AppShell.tsx` does not track viewport size or communicate responsive state (auto-collapsed, hidden) to child components.

5. **Page grids lack mobile breakpoints**: `DashboardPage.tsx` uses `lg:grid-cols-4` (falls back to 1 column below `lg`) which is partially correct, but the second grid (`xl:grid-cols-[1.2fr_0.8fr]`) only collapses below `xl`, not below `md`. The Landing Page hero grid uses `lg:grid-cols-[1.1fr_0.9fr]` which is fine above `lg` but doesn't address mobile spacing/typography adequately.

6. **No hamburger visibility logic**: The sidebar toggle button in `TopBar.tsx` is always visible but has no effect on mobile because the sidebar cannot be shown/hidden as an overlay.

## Correctness Properties

Property 1: Bug Condition - Sidebar Adapts to Viewport Width

_For any_ viewport state where the width is less than 1024px, the Sidebar SHALL either collapse to icon-only mode (768–1023px) or be hidden off-screen by default (< 768px), ensuring it does not consume excessive horizontal space or displace content.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition - TopBar Collapses Non-Essential Elements on Mobile

_For any_ viewport state where the width is less than 768px, the TopBar SHALL hide non-essential elements (AI status, Roblox connection status, active project indicator) so that no horizontal overflow occurs.

**Validates: Requirements 2.3, 2.5**

Property 3: Bug Condition - Main Content Offset Matches Sidebar State

_For any_ viewport state where the width is less than 1024px, the main content area SHALL adjust its left offset to match the current sidebar width (w-16 on tablet, zero on mobile) so content fills the available horizontal space without being occluded.

**Validates: Requirements 2.4**

Property 4: Bug Condition - Page Grids Collapse on Mobile

_For any_ viewport state where the width is less than 768px, multi-column page grids (Dashboard cards, Analytics panels, Projects list) SHALL render in a single-column stacked layout without horizontal scrolling.

**Validates: Requirements 2.6**

Property 5: Bug Condition - Landing Page Hero Scales on Mobile

_For any_ viewport state where the width is less than 768px, the Landing Page hero section SHALL scale its typography, padding, and grid layout to fit within the mobile viewport without triggering horizontal scroll.

**Validates: Requirements 2.7**

Property 6: Preservation - Desktop Layout Unchanged

_For any_ viewport state where the width is 1024px or greater, the Sidebar, TopBar, page grids, and Landing Page hero SHALL produce exactly the same rendered output as before the fix, preserving full desktop functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/shared/ui/layout/Sidebar.tsx`

**Changes**:

1. **Add responsive width classes**: Replace static `collapsed ? "w-16" : "w-64"` with responsive variants: `w-16 lg:w-64` (expanded) / `w-16` (collapsed). On mobile (< md), apply `-translate-x-full` to hide off-screen by default.
2. **Add mobile overlay behavior**: When viewport < 768px, sidebar should use `translate-x-0` when explicitly opened (via toggle) and `-translate-x-full` when closed. Add a backdrop overlay when sidebar is open on mobile.
3. **Accept `mobileOpen` prop**: New boolean prop driven by parent to control mobile overlay visibility.

**File**: `src/shared/ui/layout/TopBar.tsx`

**Changes**:

1. **Hide non-essential elements on mobile**: Add `hidden md:flex` to AI status, Roblox connection status, and active project indicator containers.
2. **Ensure toggle button prominence on mobile**: The existing toggle button is already rendered; ensure it remains visible and functional as the mobile hamburger.

**File**: `src/shared/ui/layout/AppShell.tsx`

**Changes**:

1. **Add viewport detection hook**: Introduce a `useMediaQuery` or `useBreakpoint` hook (or use Tailwind responsive classes directly) to determine current breakpoint.
2. **Auto-collapse sidebar on tablet**: When viewport is `md` but not `lg`, force `collapsed = true` regardless of user toggle state.
3. **Manage mobile sidebar state**: Track `mobileOpen` state, pass to Sidebar, and wire toggle handlers.
4. **Adjust main content offset**: Use responsive margin/padding classes (`lg:ml-64 md:ml-16 ml-0`) on the main content wrapper matching the sidebar state.

**File**: `src/pages/DashboardPage.tsx`

**Changes**:

1. **Fix secondary grid**: Change `xl:grid-cols-[1.2fr_0.8fr]` to `lg:grid-cols-[1.2fr_0.8fr]` so it collapses to single-column below `lg` (consistent with the 4-card grid).

**File**: `src/pages/LandingPage.tsx`

**Changes**:

1. **Scale hero typography on mobile**: Adjust heading sizing to `text-2xl sm:text-4xl lg:text-6xl` for progressive scaling.
2. **Reduce hero padding on mobile**: Change `py-20` to `py-10 md:py-20` and `gap-16` to `gap-8 md:gap-16`.
3. **Ensure "How it works" grid collapses**: The `lg:grid-cols-[0.9fr_1.1fr]` already collapses below `lg`. Verify padding scales (`p-4 md:p-8`).
4. **Scale pricing/FAQ sections**: Add mobile padding adjustments and ensure text sizing does not cause overflow.

**File**: `src/shared/ui/layout/Workspace.tsx` (optional)

**Changes**:

1. **Hide side panels on mobile**: Add responsive hiding for left/right panels below `md` to prevent overflow.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that render layout components at various viewport widths and assert measured dimensions, visibility, and overflow. Run on UNFIXED code to observe failures.

**Test Cases**:

1. **Sidebar at 600px**: Render Sidebar, assert it is not visible in the viewport (will fail — currently renders at w-64)
2. **Sidebar at 900px**: Render Sidebar, assert width is 64px (will fail — currently renders at w-64)
3. **TopBar at 375px**: Render TopBar, assert `.ai-status` and `.roblox-status` are not visible (will fail — currently always rendered)
4. **Dashboard grid at 500px**: Render DashboardPage, assert grid has 1 column (will fail on secondary grid)
5. **Landing hero at 390px**: Render LandingPage hero section, assert no horizontal overflow (will fail — current padding/type too large)

**Expected Counterexamples**:

- Sidebar computed width = 256px at viewport 600px (should be 0)
- Sidebar computed width = 256px at viewport 900px (should be 64px)
- TopBar container scrollWidth > clientWidth at viewport 375px
- Dashboard grid element has gridTemplateColumns with multiple columns at 500px

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed components produce the expected responsive behavior.

**Pseudocode:**

```
FOR ALL viewport WHERE isBugCondition(viewport) DO
  rendered := renderComponentAtWidth(viewport.component, viewport.width)
  IF viewport.component == "sidebar" AND viewport.width < 768 THEN
    ASSERT rendered.sidebar.translateX == -100% OR rendered.sidebar.display == "none"
  ELSE IF viewport.component == "sidebar" AND viewport.width >= 768 AND viewport.width < 1024 THEN
    ASSERT rendered.sidebar.width == 64
  END IF
  IF viewport.component == "topbar" AND viewport.width < 768 THEN
    ASSERT rendered.aiStatus.visible == false
    ASSERT rendered.robloxStatus.visible == false
    ASSERT rendered.activeProject.visible == false
    ASSERT rendered.container.scrollWidth <= rendered.container.clientWidth
  END IF
  IF viewport.component == "grid" AND viewport.width < 768 THEN
    ASSERT rendered.grid.columns == 1
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed components produce the same result as the original.

**Pseudocode:**

```
FOR ALL viewport WHERE NOT isBugCondition(viewport) DO
  ASSERT renderComponentAtWidth_fixed(viewport) == renderComponentAtWidth_original(viewport)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many viewport widths ≥ 1024px and asserts layout matches original
- It catches edge cases at the exact breakpoint boundary (1024px)
- It provides strong guarantees that desktop behavior is unchanged across all component variants

**Test Plan**: Observe rendered output at widths ≥ 1024px on UNFIXED code, capture snapshot properties (sidebar width, TopBar element visibility, grid column count), then assert identical behavior after fix.

**Test Cases**:

1. **Sidebar at 1024px+**: Verify width is 256px (expanded) or 64px (manually collapsed)
2. **TopBar at 1024px+**: Verify all status indicators visible
3. **Dashboard at 1280px**: Verify grid-cols-4 and xl:grid-cols-[1.2fr_0.8fr] render correctly
4. **Landing Page at 1440px**: Verify hero grid is two-column, typography at full desktop size
5. **Manual toggle at 1200px**: Verify sidebar toggles between w-64 and w-16

### Unit Tests

- Test Sidebar renders at correct width for each breakpoint (mobile/tablet/desktop)
- Test Sidebar mobile overlay opens/closes on toggle
- Test TopBar hides non-essential elements below 768px
- Test TopBar shows all elements at 768px+
- Test AppShell passes correct collapsed/mobileOpen state at each breakpoint
- Test main content offset class matches sidebar state

### Property-Based Tests

- Generate random viewport widths (320–2560px) and verify Sidebar width matches expected breakpoint behavior
- Generate random viewport widths and verify TopBar element visibility matches breakpoint rules
- Generate random viewport widths ≥ 1024px and assert rendered output is identical to pre-fix baseline
- Generate random page content configurations and verify no horizontal overflow at widths < 768px

### Integration Tests

- Full app render at 375px: navigate between pages, toggle sidebar overlay, verify no horizontal scroll
- Full app render at 900px: verify sidebar is icon-only, content fills remaining space
- Full app render at 1440px: verify identical to current desktop behavior
- Resize from 1440px → 600px → 1440px: verify layout adapts correctly at each transition and returns to original state
