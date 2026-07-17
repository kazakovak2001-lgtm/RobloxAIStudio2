# Bugfix Requirements Document

## Introduction

The application layout components (AppShell, Sidebar, TopBar, Workspace) do not adapt to smaller viewport sizes. The Sidebar remains at a fixed desktop width, the main content overflows horizontally, hero sections on the Landing Page do not scale, and the TopBar provides no mobile breakpoint behavior. This causes a broken experience on tablet and mobile viewports. The fix must introduce responsive behavior using the existing Tailwind breakpoints (md: 768px, lg: 1024px) without redesigning the UI or altering business logic.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN viewport width is less than 1024px THEN the Sidebar remains at its full 256px (w-64) fixed width, consuming excessive screen space on tablet viewports

1.2 WHEN viewport width is less than 768px THEN the Sidebar remains visible and overlays or displaces content, making the application unusable on mobile devices

1.3 WHEN viewport width is less than 768px THEN the TopBar displays all elements (AI status, Roblox connection, search, notifications, user menu, breadcrumbs, active project) without collapsing, causing horizontal overflow

1.4 WHEN viewport width is less than 1024px THEN the main content area does not adjust its left margin/offset to account for the sidebar state, resulting in content being hidden behind the sidebar or overflowing horizontally

1.5 WHEN viewport width is less than 768px THEN the TopBar does not provide a hamburger menu toggle to show/hide the Sidebar, leaving users with no way to access navigation on mobile

1.6 WHEN viewport width is less than 768px THEN page layouts using multi-column grids (Dashboard, Analytics, Projects) do not collapse to single-column, causing horizontal scrolling

1.7 WHEN viewport width is less than 768px THEN the Landing Page hero sections do not scale their typography, spacing, or layout to fit the mobile viewport

### Expected Behavior (Correct)

2.1 WHEN viewport width is between 768px and 1023px THEN the system SHALL collapse the Sidebar to its narrow/icon-only state (w-16) automatically

2.2 WHEN viewport width is less than 768px THEN the system SHALL hide the Sidebar completely by default, removing it from the visible layout

2.3 WHEN viewport width is less than 768px THEN the system SHALL collapse non-essential TopBar elements (AI status, Roblox connection status, active project indicator) into a compact or hidden state to prevent horizontal overflow

2.4 WHEN viewport width is less than 1024px THEN the system SHALL adjust the main content area offset to match the current sidebar width (narrow on tablet, zero on mobile) so content fills the available space

2.5 WHEN viewport width is less than 768px THEN the system SHALL display the existing sidebar toggle button in the TopBar as the primary means to show/hide the Sidebar as an overlay

2.6 WHEN viewport width is less than 768px THEN the system SHALL render multi-column page grids in a single-column stacked layout

2.7 WHEN viewport width is less than 768px THEN the system SHALL scale Landing Page hero section typography, padding, and layout to fit within the mobile viewport without horizontal scroll

### Unchanged Behavior (Regression Prevention)

3.1 WHEN viewport width is 1024px or greater THEN the system SHALL CONTINUE TO display the full Sidebar at w-64 (or w-16 when manually collapsed) with all navigation labels visible

3.2 WHEN viewport width is 1024px or greater THEN the system SHALL CONTINUE TO display all TopBar elements (AI status, Roblox connection, search, notifications, user menu, breadcrumbs, active project) without modification

3.3 WHEN viewport width is 1024px or greater THEN the system SHALL CONTINUE TO render page layouts in their existing multi-column grid configurations

3.4 WHEN viewport width is 1024px or greater THEN the system SHALL CONTINUE TO offset the main content area by the full sidebar width (w-64 or w-16 when collapsed)

3.5 WHEN the user manually toggles the Sidebar collapse on desktop THEN the system SHALL CONTINUE TO toggle between w-64 and w-16 states as before

3.6 WHEN viewport width is 1024px or greater THEN the Landing Page hero sections SHALL CONTINUE TO render with their current desktop typography, spacing, and layout

3.7 WHEN any viewport width is used THEN the system SHALL CONTINUE TO preserve all existing navigation functionality, routing behavior, and business logic without modification
