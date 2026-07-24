# DESIGN SYSTEM

**Generated**: 2026-07-13
**Project**: Roblox AI Studio DevKit
**Phase**: UX-1 - Design System

---

## EXECUTIVE SUMMARY

This design system defines the visual identity for the Roblox AI Studio Control Center. It provides a comprehensive set of design tokens, components, and guidelines to ensure consistency across the application.

**Design Philosophy**: Dark Developer Environment

- Professional
- Modern
- Minimal
- High information density
- Suitable for long development sessions

**Inspiration**: VS Code, Roblox Studio, Figma, modern AI IDE platforms

---

## 1. COLOR SYSTEM

### 1.1 Semantic Colors

**Primary Colors**:

```javascript
// Brand Blue
brand-50:  #eef8ff
brand-100: #d9edff
brand-200: #bce0ff
brand-300: #8fc7ff
brand-400: #5fa9ff
brand-500: #347cff  // Primary
brand-600: #2259ff
brand-700: #1d45d8
brand-800: #1e3cae
brand-900: #20398a

// Accent Purple
accent-50:  #f5f3ff
accent-100: #ede9fe
accent-200: #ddd6fe
accent-300: #c4b5fd
accent-400: #a78bfa
accent-500: #8b5cf6  // Secondary
accent-600: #7c3aed
accent-700: #6d28d9
accent-800: #5b21b6
accent-900: #4c1d95
```

**Semantic Status Colors**:

```javascript
// Success (Green)
success-50:  #f0fdf4
success-100: #dcfce7
success-200: #bbf7d0
success-300: #86efac
success-400: #4ade80
success-500: #22c55e  // Primary success
success-600: #16a34a
success-700: #15803d
success-800: #166534
success-900: #14532d

// Warning (Yellow)
warning-50:  #fefce8
warning-100: #fef9c3
warning-200: #fef08a
warning-300: #fde047
warning-400: #facc15
warning-500: #eab308  // Primary warning
warning-600: #ca8a04
warning-700: #a16207
warning-800: #854d0e
warning-900: #713f12

// Error (Red)
error-50:  #fef2f2
error-100: #fee2e2
error-200: #fecaca
error-300: #fca5a5
error-400: #f87171
error-500: #ef4444  // Primary error
error-600: #dc2626
error-700: #b91c1c
error-800: #991b1b
error-900: #7f1d1d

// Info (Cyan)
info-50:  #ecfeff
info-100: #cffafe
info-200: #a5f3fc
info-300: #67e8f9
info-400: #22d3ee
info-500: #06b6d4  // Primary info
info-600: #0891b2
info-700: #0e7490
info-800: #155e75
info-900: #164e63
```

**Neutral Colors**:

```javascript
// Slate (Backgrounds, borders, text)
slate-50:  #f8fafc
slate-100: #f1f5f9
slate-200: #e2e8f0
slate-300: #cbd5e1
slate-400: #94a3b8
slate-500: #64748b
slate-600: #475569
slate-700: #334155
slate-800: #1e293b
slate-900: #0f172a
slate-950: #020617  // Primary background
```

### 1.2 Color Usage Guidelines

**Backgrounds**:

- Primary: `slate-950` (#020617)
- Secondary: `slate-900` (#0f172a)
- Tertiary: `slate-800` (#1e293b)
- Card: `slate-900/70` (with backdrop blur)

**Text**:

- Primary: `slate-50` (#f8fafc)
- Secondary: `slate-400` (#94a3b8)
- Tertiary: `slate-500` (#64748b)
- Disabled: `slate-600` (#475569)

**Borders**:

- Primary: `white/10`
- Secondary: `white/5`
- Accent: `brand-400/40`
- Success: `success-400/40`
- Warning: `warning-400/40`
- Error: `error-400/40`

**Interactive Elements**:

- Primary action: `brand-500` to `accent-500` gradient
- Secondary action: `white/10` background
- Hover: `white/15` background
- Active: `white/20` background

---

## 2. TYPOGRAPHY

### 2.1 Font Family

**Primary**: Inter

```css
font-family:
  "Inter",
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Roboto,
  sans-serif;
```

**Monospace**: JetBrains Mono (for code)

```css
font-family: "JetBrains Mono", "Fira Code", monospace;
```

### 2.2 Type Scale

**Display**:

```css
text-display-xl: 4.5rem / 5rem (72px / 80px) - font-weight 800
text-display-lg: 3.75rem / 4.5rem (60px / 72px) - font-weight 700
text-display-md: 3rem / 3.75rem (48px / 60px) - font-weight 700
text-display-sm: 2.25rem / 2.5rem (36px / 40px) - font-weight 600
```

**Headings**:

```css
text-h1: 2rem / 2.5rem (32px / 40px) - font-weight 600
text-h2: 1.5rem / 2rem (24px / 32px) - font-weight 600
text-h3: 1.25rem / 1.75rem (20px / 28px) - font-weight 500
text-h4: 1rem / 1.5rem (16px / 24px) - font-weight 500
```

**Body**:

```css
text-lg: 1.125rem / 1.75rem (18px / 28px) - font-weight 400
text-base: 1rem / 1.5rem (16px / 24px) - font-weight 400
text-sm: 0.875rem / 1.25rem (14px / 20px) - font-weight 400
text-xs: 0.75rem / 1rem (12px / 16px) - font-weight 400
```

**Code**:

```css
text-code-lg: 0.875rem / 1.25rem (14px / 20px) - font-weight 400
text-code-base: 0.8125rem / 1.25rem (13px / 20px) - font-weight 400
text-code-sm: 0.75rem / 1rem (12px / 16px) - font-weight 400
```

### 2.3 Typography Usage Guidelines

**Page Titles**: `text-display-sm` or `text-h1`

- Dashboard: "Your studio command center"
- Projects: "Your project library"
- AI Studio: "AI Workspace"

**Section Titles**: `text-h2` or `text-h3`

- Card titles
- Section headers
- Widget titles

**Body Text**: `text-base` or `text-sm`

- Descriptions
- Labels
- Content

**Code**: `text-code-base` with monospace font

- Code snippets
- API endpoints
- File paths

**Labels**: `text-xs` uppercase with tracking

- Section labels
- Status labels
- Metadata

---

## 3. SPACING

### 3.1 Spacing Scale

**Base Unit**: 4px (0.25rem)

**Scale**:

```css
space-0: 0
space-1: 0.25rem (4px)
space-2: 0.5rem (8px)
space-3: 0.75rem (12px)
space-4: 1rem (16px)
space-5: 1.25rem (20px)
space-6: 1.5rem (24px)
space-8: 2rem (32px)
space-10: 2.5rem (40px)
space-12: 3rem (48px)
space-16: 4rem (64px)
space-20: 5rem (80px)
space-24: 6rem (96px)
```

### 3.2 Spacing Usage Guidelines

**Component Padding**:

- Small: `p-3` (12px)
- Medium: `p-4` (16px)
- Large: `p-6` (24px)
- Extra Large: `p-8` (32px)

**Component Gap**:

- Tight: `gap-2` (8px)
- Normal: `gap-3` (12px)
- Loose: `gap-4` (16px)
- Extra Loose: `gap-6` (24px)

**Section Spacing**:

- Between sections: `gap-6` (24px) or `gap-8` (32px)
- Between cards: `gap-4` (16px)
- Between list items: `gap-3` (12px)

---

## 4. BORDERS

### 4.1 Border Radius Scale

```css
rounded-none: 0
rounded-sm: 0.125rem (2px)
rounded: 0.25rem (4px)
rounded-md: 0.375rem (6px)
rounded-lg: 0.5rem (8px)
rounded-xl: 0.75rem (12px)
rounded-2xl: 1rem (16px)
rounded-3xl: 1.5rem (24px)
rounded-full: 9999px
```

### 4.2 Border Width Scale

```css
border: 1px
border-2: 2px
border-4: 4px
border-8: 8px
```

### 4.3 Border Usage Guidelines

**Cards**: `rounded-2xl` or `rounded-3xl`
**Buttons**: `rounded-full`
**Inputs**: `rounded-xl` or `rounded-2xl`
**Badges**: `rounded-full`
**Modals**: `rounded-3xl`
**Code blocks**: `rounded-lg`

**Border Width**:

- Default: `border` (1px)
- Emphasis: `border-2` (2px)
- Heavy: `border-4` (4px)

---

## 5. SHADOWS

### 5.1 Shadow Scale

```css
shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)
shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)
shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)
shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25)
```

**Custom Shadows**:

```css
shadow-glow: 0 0 0 1px rgba(255,255,255,0.06), 0 18px 60px rgba(12, 20, 40, 0.45)
shadow-glow-sm: 0 0 0 1px rgba(255,255,255,0.06), 0 10px 40px rgba(12, 20, 40, 0.35)
shadow-inner-glow: inset 0 0 20px rgba(52, 124, 255, 0.1)
```

### 5.2 Shadow Usage Guidelines

**Cards**: `shadow-glow`
**Modals**: `shadow-2xl`
**Dropdowns**: `shadow-xl`
**Tooltips**: `shadow-lg`
**Buttons**: No shadow (use hover elevation)

---

## 6. ANIMATIONS

### 6.1 Duration Scale

```css
duration-75: 75ms
duration-100: 100ms
duration-150: 150ms
duration-200: 200ms
duration-300: 300ms
duration-500: 500ms
duration-700: 700ms
duration-1000: 1000ms
```

### 6.2 Easing Functions

```css
ease-linear: linear
ease-in: cubic-bezier(0.4, 0, 1, 1)
ease-out: cubic-bezier(0, 0, 0.2, 1)
ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55)
```

### 6.3 Animation Presets

**Transitions**:

```css
transition-all: all 200ms ease-in-out
transition-colors: color 150ms ease-in-out
transition-opacity: opacity 150ms ease-in-out
transition-transform: transform 200ms ease-out
```

**Hover Effects**:

```css
hover-lift: hover:-translate-y-1
hover-scale: hover:scale-1.02
hover-brightness: hover:brightness-110
```

**Loading**:

```css
animate-spin: spin 1s linear infinite
animate-pulse: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite
animate-bounce: bounce 1s infinite
```

### 6.4 Animation Usage Guidelines

**Micro-interactions**: `duration-150` to `duration-200`
**Panel transitions**: `duration-200` to `duration-300`
**Modal transitions**: `duration-300`
**Loading states**: `animate-spin` or `animate-pulse`

**Easing**:

- Default: `ease-out`
- Enter: `ease-out`
- Exit: `ease-in`

---

## 7. ICONS

### 7.1 Icon Library

**Primary**: Lucide React

- Modern, consistent icon set
- Tree-shakeable
- Customizable stroke width

**Icon Sizes**:

```css
icon-xs: 12px
icon-sm: 16px
icon-md: 20px
icon-lg: 24px
icon-xl: 32px
icon-2xl: 48px
```

### 7.2 Icon Usage Guidelines

**Navigation**: `icon-md` (20px)
**Buttons**: `icon-sm` (16px)
**Status**: `icon-sm` (16px)
**Hero**: `icon-xl` (32px) or `icon-2xl` (48px)

**Icon Colors**:

- Primary: `brand-400`
- Secondary: `slate-400`
- Success: `success-400`
- Warning: `warning-400`
- Error: `error-400`

---

## 8. LAYOUT

### 8.1 Container Widths

```css
container-sm: 640px
container-md: 768px
container-lg: 1024px
container-xl: 1280px
container-2xl: 1536px
```

### 8.2 Grid System

**Default Grid**: 12 columns

```css
grid-cols-1: 1 column
grid-cols-2: 2 columns
grid-cols-3: 3 columns
grid-cols-4: 4 columns
grid-cols-6: 6 columns
grid-cols-12: 12 columns
```

**Gap**: `gap-4` (16px) or `gap-6` (24px)

### 8.3 Breakpoints

```css
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

---

## 9. COMPONENT PATTERNS

### 9.1 Card Pattern

```css
.card-base {
  @apply rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-glow backdrop-blur-xl;
}

.card-hover {
  @apply transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/40;
}
```

### 9.2 Button Pattern

```css
.button-primary {
  @apply bg-gradient-to-r from-brand-500 to-accent text-white shadow-glow hover:translate-y-[-1px];
}

.button-secondary {
  @apply border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15;
}

.button-ghost {
  @apply text-slate-300 hover:bg-white/10 hover:text-white;
}
```

### 9.3 Input Pattern

```css
.input-base {
  @apply rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition-colors focus:border-brand-400/50;
}
```

---

## 10. ACCESSIBILITY

### 10.1 Contrast Ratios

**Minimum**: 4.5:1 for normal text
**Large Text**: 3:1 for text ≥ 18px
**Interactive Elements**: 3:1 for buttons and links

### 10.2 Focus States

```css
.focus-ring {
  @apply focus:outline-none focus:ring-2 focus:ring-brand-400/70 focus:ring-offset-2 focus:ring-offset-slate-950;
}
```

### 10.3 Keyboard Navigation

**Tab Order**: Logical left-to-right, top-to-bottom
**Skip Links**: Provide skip-to-content link
**Focus Traps**: Trap focus in modals

---

## 11. DARK MODE

**Primary Theme**: Dark mode only

- No light mode support
- Optimized for long development sessions
- High contrast for readability
- Subtle gradients for depth

---

## 12. IMPLEMENTATION

### 12.1 Tailwind Config

```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        // Add all color scales from section 1
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.06), 0 18px 60px rgba(12, 20, 40, 0.45)",
        "glow-sm":
          "0 0 0 1px rgba(255,255,255,0.06), 0 10px 40px rgba(12, 20, 40, 0.35)",
        "inner-glow": "inset 0 0 20px rgba(52, 124, 255, 0.1)",
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "slide-up": "slideUp 300ms ease-out",
        "slide-down": "slideDown 300ms ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
};
```

### 12.2 CSS Variables

```css
:root {
  --color-bg-primary: #020617;
  --color-bg-secondary: #0f172a;
  --color-bg-tertiary: #1e293b;
  --color-text-primary: #f8fafc;
  --color-text-secondary: #94a3b8;
  --color-text-tertiary: #64748b;
  --color-brand-primary: #347cff;
  --color-brand-secondary: #7c3aed;
  --color-success: #22c55e;
  --color-warning: #eab308;
  --color-error: #ef4444;
  --color-info: #06b6d4;
  --border-radius-sm: 0.125rem;
  --border-radius-md: 0.375rem;
  --border-radius-lg: 0.5rem;
  --border-radius-xl: 0.75rem;
  --border-radius-2xl: 1rem;
  --border-radius-3xl: 1.5rem;
  --spacing-unit: 4px;
  --transition-fast: 150ms;
  --transition-normal: 200ms;
  --transition-slow: 300ms;
}
```

---

## 13. SUMMARY

### 13.1 Design Tokens

**Colors**: 50+ semantic colors
**Typography**: 12 type scales
**Spacing**: 13 spacing values
**Borders**: 9 radius values
**Shadows**: 6 shadow values + 3 custom
**Animations**: 8 duration values + 4 easing functions
**Icons**: 6 size values

### 13.2 Next Steps

**Phase UX-2**: Create Component Library

- Implement design tokens in Tailwind config
- Create reusable UI components
- Document component patterns

**Phase UX-3**: Redesign Main Screens

- Apply design system to screens
- Ensure consistency
- Validate accessibility

---

**Design System Status**: ✅ COMPLETE
**Next Phase**: UX-2 - Component Library
**Owner**: Design Team
