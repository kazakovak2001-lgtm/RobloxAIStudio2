# Root Cause Analysis: Sidebar Not Rendering After Layout Refactor

## Symptom

After the layout architecture refactor, the entire sidebar (including the Roblox AI Studio logo) was no longer rendered on any page, making navigation impossible.

## Root Cause

The regression was caused by **overly aggressive conditional rendering logic in `Sidebar.tsx`** combined with the viewport breakpoint classification in `useBreakpoint.ts`.

### The Faulty Logic (Before Fix)

```tsx
// Sidebar.tsx
const isCollapsed = mode === "collapsed";
const isOverlayVisible = (mode === "overlay" || mode === "hidden") && isOpen;
const showSidebar = breakpoint === "desktop" || isOverlayVisible;

if (!showSidebar) return null;
```

### Why It Failed

1. **`useBreakpoint.ts`** classifies viewports as:
   - `mobile`: < 768px
   - `tablet`: 768px – 1023px
   - `desktop`: ≥ 1024px

2. **`useSidebar.tsx`** maps breakpoints to modes:
   - `desktop` → `"expanded"` or `"collapsed"`
   - `tablet` → `"overlay"`
   - `mobile` → `"hidden"`

3. **The critical flaw**: `showSidebar` only returned `true` when:
   - `breakpoint === "desktop"` (viewport ≥ 1024px), **OR**
   - The overlay was explicitly opened via toggle (`isOpen === true`)

4. **In practice**: Many developer setups (browser with DevTools open, split screen, laptop at native resolution) have a viewport content area **under 1024px**. The hook correctly detected `"tablet"` breakpoint, set `mode = "overlay"`, and since `isOpen` defaults to `false`, the sidebar returned `null`.

## Fix Applied

Changed the sidebar behavior to maintain an **inline collapsed rail** on tablet viewports.

## Lessons Learned

- Conditional `return null` for major layout components is dangerous
- Viewport breakpoints should be tested at the actual developer viewport size
- Navigation must always be accessible without requiring user interaction on any viewport ≥ 768px

> **Note**: This issue has been resolved. Document archived for historical reference.
