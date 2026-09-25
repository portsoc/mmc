# AGENTS.md — Agent & Developer Operating Manual for MMC

This document is the authoritative engineering and design guide for AI agents and software engineers working on the **Mission Model Canvas (MMC)** codebase. Any agent or developer interacting with this repository must adhere to the patterns, styling rules, and architectural invariants documented below.

---

## 1. Project Background & Philosophy

- **Origin**: The Mission Model Canvas is an adaptation of Alexander Osterwalder's Business Model Canvas designed by Strategyzer AG and Steve Blank, tailored for mission-driven organizations, government agencies, defense, intelligence, and educational institutions where success is measured by mission impact rather than commercial profit.
- **Portsmouth Implementation**: Designed and developed by Rich Boakes at the University of Portsmouth.
- **Licensing**: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0).
- **Core Design Ethos**:
  - **Zero bloat**: Instant-loading, minimal footprint, and zero runtime dependencies where possible.
  - **Distraction-free UX**: Focus remains purely on thinking, drafting, and discussing mission architecture.
  - **Fidelity to physical canvases**: The visual grid replicates a physical whiteboard or butcher-paper canvas with 9 standard operational blocks plus problem description and creator attribution.
  - **Keyboard-driven speed**: Smooth interactions with intuitive escape keys, focus indicators, and URL-hash-driven presentation states.

---

## 2. Existing Codebase Architecture & Anatomy

The existing codebase is intentionally vanilla and dependency-free:

```
/Users/rjb/mmc/
├── index.html        # Semantic HTML5 structure & usage dialog
├── styles.css        # Responsive CSS Grid, custom properties, dark mode, print styles
├── script.js         # State management, local storage, defocus toggling, hash updates
├── README.md         # Attribution & license
├── i/                # SVG iconography for each canvas block and help dialog
│   ├── be.svg        # Beneficiaries
│   ├── bs.svg        # Buy-in Support
│   ├── de.svg        # Deployment
│   ├── help.svg      # Usage / help icon
│   ├── if.svg        # Impact Factors / Mission Achievement
│   ├── ka.svg        # Key Activities
│   ├── kp.svg        # Key Partners
│   ├── kr.svg        # Key Resources
│   ├── mb.svg        # Mission Budget / Cost
│   └── vp.svg        # Value Propositions
└── AGENTS.md         # This manual
```

---

## 3. DOM & Component Map

The canvas consists of an outer `.grid-container` housing a `<header>`, 9 `.grid-item` sections, and a `<footer>`:

| ID | CSS Grid Area | Title | Description / Content ID | Icon |
| :--- | :--- | :--- | :--- | :--- |
| `mmd` | In `header` | Mission/Problem Description | `<p id="mmd" contenteditable>` | N/A |
| `by` | In `header` | Designed by | `<p id="by" contenteditable>` | N/A |
| `kp` | `kp` | Key Partners | `<section id="ekp" class="e" contenteditable="true">` | `i/kp.svg` |
| `ka` | `ka` | Key Activities | `<section id="eka" class="e" contenteditable="true">` | `i/ka.svg` |
| `vp` | `vp` | Value Propositions | `<section id="evp" class="e" contenteditable="true">` | `i/vp.svg` |
| `bs` | `bs` | Buy-in Support | `<section id="ebs" class="e" contenteditable="true">` | `i/bs.svg` |
| `be` | `be` | Beneficiaries | `<section id="ebe" class="e" contenteditable="true">` | `i/be.svg` |
| `kr` | `kr` | Key Resources | `<section id="ekr" class="e" contenteditable="true">` | `i/kr.svg` |
| `de` | `de` | Deployment | `<section id="ede" class="e" contenteditable="true">` | `i/de.svg` |
| `mb` | `mb` | Mission Budget/Cost | `<section id="emb" class="e" contenteditable="true">` | `i/mb.svg` |
| `if` | `if` | Impact Factors | `<section id="eif" class="e" contenteditable="true">` | `i/if.svg` |

- Dialog: `<dialog id="usage">` rendered modally via `dialog.showModal()`.
- Help trigger: `<img id="help" src="i/help.svg" alt="help">`.

---

## 4. Design System & CSS Styling Rules

### 4.1 CSS Custom Properties (Colors)
```css
:root {
  --white: #FFFFFE;
  --black: #222222;
  --superblack: #000000;
  --darkgrey: #666666;
  --lightgrey: #BBBBBB;
  --uop1: #FF00FF77; /* Portsmouth Purple accent with transparency */
}
```

### 4.2 Dark Mode Rules
- Controlled via `@media (prefers-color-scheme: dark)`:
  - `--white: #000000;`
  - `--black: #DFDFDF;`
  - `--superblack: #FFFFFF;`
  - `--darkgrey: #999999;`
  - `--lightgrey: #444444;`
  - `--uop1: #FF00FF77;`
  - All SVG images invert dynamically: `img { filter: invert(1); }`.
- Any new icons or graphics added MUST be pure SVG or adapt properly to inversion in dark mode.

### 4.3 Desktop Grid (10 columns × 5 rows)
```css
--grid-template-areas:
  "header header header header header header header header header header"
  "kp     kp     ka     ka     vp     vp     bs     bs     be     be"
  "kp     kp     kr     kr     vp     vp     de     de     be     be"
  "mb     mb     mb     mb     mb     if     if     if     if     if"
  "footer footer footer footer footer footer footer footer footer footer";
--grid-template-columns: repeat(10, 1fr);
--grid-template-rows: min-content auto auto auto min-content;
```

### 4.4 Mobile Layout (`@media (width < 40em)`)
Transitions to a single-column stacked layout:
`header -> be -> bs -> de -> vp -> kp -> ka -> kr -> mb -> if -> footer`.

### 4.5 Print Layout (`@media print`)
- Backgrounds force-rendered as pure white (`--white: #ffffff`).
- Dialogs and `#help` button are hidden (`display: none;`).
- Links print in solid `--black`.

### 4.6 Focus & Presentation State Styling
- **Focus glow**: `.grid-item:has(*:focus)` triggers `box-shadow: inset 0 0 1em var(--uop1);`.
- **Icon colorization & focus revelation**:
  - Panel icons (`h2 img`) in idle state render in clean, subtle monochrome (`filter: grayscale(100%); opacity: 0.6;`).
  - When a panel has focus (`.grid-item:has(*:focus)`, `.grid-item:focus-within`, or `.hi`), its icon blooms into full colour with colored fills and line art (`filter: grayscale(0%); opacity: 1; transform: scale(1.1);`).
  - In dark mode, idle icons render with `filter: grayscale(100%) invert(0.9);` for crisp white/silver contrast on black, while focused icons reveal their true, vivid colors (`filter: grayscale(0%) invert(0)`).
- **Defocus/Dimming state**: `.lo` class sets `opacity: 0.5;`.
- **Loading skeleton/scaffold**: When `[data-loading]` is present on `#app-root`, the entire background of each named panel (`.grid-item`) shimmers smoothly behind the text, eliminating any white padding borders around inner animating elements.
- **Help button hover**: Transitions to saturated color and scales up (`scale(1.1)`).

### 4.7 Emoji Bullets & Drag-to-Associate Block Styling
- **Default Emoji Bullet (`⚫`)**: Every newline automatically starts with an emoji black circle bullet (`⚫ `).
- **Smart Backspace / Delete**: Pressing Backspace on a line with only the bullet deletes the bullet and merges the cursor into the end of the previous line.
- **Right-Click Customization Popup**: Right-clicking any bullet opens an anchored popover allowing the user to:
  - Input any custom character or emoji.
  - Quick-select from bullet characters currently used in the document.
  - Pick from up to 10 recently used characters.
  - Choose two color swatches: foreground (text) and background (block fill).
- **Full Block Colorization**: The chosen background color covers the entire line block (`.canvas-row`), including behind the emoji bullet.
- **Drag-to-Associate**: Bullets can be dragged onto any other text row across any of the 9 canvas panels. Dropping immediately applies the same emoji character, foreground color, and background color to the target row, forming a visual association.
- **Zero Extra Markup**: Saved cleanly as `${bullet} ${text}` per line in Firestore and Yjs CRDT with zero artificial tags or bracket noise.

---

## 5. Event Handling & State Machine

1. **Click / Shift-Click Behavior**:
   - Standard click inside a grid item focuses its `contenteditable` section.
   - `Shift + Click` or `Meta + Click` toggles the `.lo` class on that `.grid-item` (dimming it).
   - Typing in any dimmed block immediately removes `.lo`.
2. **URL Hash Synchronization**:
   - When blocks are dimmed or highlighted, `updateURL()` collects active (non-dimmed) IDs and joins them with hyphens: `#kp-ka-vp`.
   - On page load, `handleFragment()` reads `window.location.hash` and applies `.lo` to any unmentioned blocks. This allows presenters to share direct links that highlight specific canvas sections during lectures or pitches.
3. **Keyboard Controls**:
   - `Escape`: Blurs the active editable element.
   - `Ctrl + Escape`: Prompts the user with a confirmation dialog to wipe all canvas fields.
4. **Local Persistence (Legacy)**:
   - Synchronized on every `input` event to `localStorage.getItem('mmc')` as `{ current: [{ id, content }] }`.

---

## 6. Rules & Invariants for AI Agents

1. **Preserve Vanilla Elegance**:
   - Do NOT introduce bulky UI component libraries (Bootstrap, Tailwind, MUI) or massive heavy bundlers unless explicitly commanded.
   - Keep styles consolidated, semantic, and aligned with CSS Custom Properties.
2. **Preserve Grid Integrity**:
   - The 10-column desktop grid and mobile order are pedagogical standards of the Mission Model Canvas. Do not alter grid item placements or column spans without explicit pedagogical justification.
3. **Accessibility (a11y) First**:
   - All editable fields must have semantic identifiers and accessible labels (`aria-labelledby` or `<label for="...">`).
   - SVG icons must feature descriptive `aria-labelledby` or `alt` attributes.
   - Focus rings and contrast must meet WCAG 2.1 AA standards in both light and dark modes.
4. **Preserve Presentation Feature**:
   - The URL fragment hash highlighting (`#kp-vp-be`) is used actively in teaching and presentations. Do not remove or break this mechanism when adding Firebase routing or share links.
5. **No Regressions on Offline/Local Fallback**:
   - Even when integrated with Firebase, graceful fallback or local drafting capabilities should be preserved when the network is unavailable.
