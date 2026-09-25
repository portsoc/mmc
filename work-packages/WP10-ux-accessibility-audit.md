# WP10 — UX, Usability & Accessibility Remediation

## 1. Objective
A heuristic UX review and WCAG 2.2 AA-oriented accessibility audit of the current UI (login gate, hamburger menu, modals, playback sidebar, and the core editable canvas), conducted after WP08's Material-inspired redesign. Findings are prioritized by severity and mapped to concrete fixes, so this package can be worked like the others rather than as prose feedback.

## 2. Method
Static review of `index.html`, `styles.css`, `js/app.js`, and `script.js` against WCAG 2.2 AA success criteria (keyboard operability, name/role/value, focus visibility, color contrast, non-text content) and standard usability heuristics (visibility of system status, error prevention/recovery, consistency). Not a substitute for testing with an actual screen reader (VoiceOver/NVDA) or automated tooling (axe, Lighthouse) — recommended as a follow-up once these fixes land.

---

## 3. Findings

### 3.1 Critical — blocks keyboard/screen-reader users entirely

| # | Issue | Location | Impact |
|---|---|---|---|
| C1 | Help trigger is an `<img>` with a click handler, not a button | `index.html:65` (`<img id="help" src="i/help.svg" alt="help">`), `script.js:128` | Cannot be reached by Tab, has no keyboard activation, and is announced by screen readers as a static image, not a control. The usage-instructions dialog is completely unreachable without a mouse. |
| C2 | The nine `contenteditable` canvas sections have no accessible role or name | `index.html:68-76` (`<section class="e" contenteditable="true">`) | A screen reader lands on each section with no indication it's an editable field or which MMC block it belongs to beyond the visually-adjacent `<h2>` — there's no programmatic association (no `aria-labelledby`) between the heading and the editable region itself (only the decorative `<img>` inside the heading has one). |
| C3 | Hamburger menu (`#app-menu`) isn't a real menu and doesn't manage focus | `index.html:41`, `js/app.js:142-165` | No `role="menu"`/`role="menuitem"`, no arrow-key navigation, no `Escape`-to-close, and no focus is moved into the menu on open or returned to the trigger on close. A keyboard user can Tab into it only by luck of DOM order, and closing it (via the document-level click listener) never restores focus to `#menu-btn`. |
| C4 | Login gate error message isn't announced | `index.html:20`, `js/app.js:118-120` | `#login-error` only toggles `hidden`; with no `role="alert"`/`aria-live`, a screen reader user who fails to sign in gets total silence — the single most important failure state in the app is invisible to them. |

### 3.2 Serious — usable but degraded for a large group of users

| # | Issue | Location | Impact |
|---|---|---|---|
| S1 | Focus indicator uses a low-contrast translucent magenta glow instead of a visible outline | `styles.css:216-225` (`--uop1: #FF00FF77`, `.hi`, `.grid-item:has(*:focus)`) | The box-shadow glow is soft and blends into busy backgrounds; it does not meet WCAG 2.2's 3:1 non-text contrast requirement for focus indicators (SC 2.4.11) against the white card background, and disappears when `.lo` (opacity 0.5) is also applied. |
| S2 | Presence avatars and contributor highlighting encode identity by color alone | `styles.css:428-440`, `js/app.js` `applyContributorHighlight` | `colorForUser(uid)` assigns a background hue with no secondary cue (pattern, initial-only relies on 1 character, no text label anywhere else). Color-blind users (~8% of men) cannot reliably distinguish collaborators in the presence strip or trace which contributor wrote which field. |
| S3 | Destructive actions use blocking native `confirm()` instead of styled, accessible dialogs | `js/app.js:239` (restore version), `js/app.js:161` (sign out) | Functionally accessible (native dialogs are screen-reader friendly), but stylistically jarring against the Material redesign, and — more importantly — impossible to style consistently or add a "why" explanation to. Sign-out's consequence (permanent loss of the guest identity, per earlier product decision) isn't explained in the confirm text at all, just "Sign out?". |
| S4 | `<dialog>` "Close" buttons rely on visual position, not a discoverable label pattern | `index.html:94,114,124,133,141` | Each dialog's close button just says "Close" or "OK" with no context — acceptable alone, but combine with C3-style screen-reader users jumping directly via heading navigation and the relationship between e.g. "Close" and *which* dialog is lost outside of DOM order. Low cost fix: `aria-label="Close waypoint dialog"` etc. |
| S5 ic | Icon-only buttons depend on `title` attribute for their tooltip, which is not keyboard-accessible | `index.html:38,147,152,155` | `title` tooltips don't appear on keyboard focus in most browsers (only on mouse hover), so sighted keyboard users get no visual label at all — they have `aria-label` too (good), but there's no visible focus tooltip equivalent for low-vision users who don't use a screen reader. |

### 3.3 Moderate — usability polish

| # | Issue | Location | Impact |
|---|---|---|---|
| M1 | No visible loading/pending state during async operations | `js/app.js` throughout (`createCanvas`, `redeemInvite`, sign-in redirect) | Buttons like "Save Snapshot" or "Send Invite" give no spinner/disabled-state feedback beyond the one case that already disables the button (`login-google-btn`). On a slow connection, users may double-click and fire duplicate writes. |
| M2 | Playback sidebar pushes canvas content via a fixed `margin-right`, causing reflow of all nine grid cells | `styles.css:667-670` | Every text block reflows when playback opens/closes — for a user with cognitive/vestibular sensitivity (or just mid-edit) this is a jarring layout shift. `prefers-reduced-motion` is never checked anywhere in the stylesheet (including for `.diff-flash`'s animation). |
| M3 | `#version-preview-body`'s heading levels aren't nested under the modal's `<h1>` | `js/app.js:285` (creates `<h3>` inside a modal whose only other heading is `<h1>`) | Skips `<h2>`, breaking the logical heading outline a screen reader user relies on to skim structure. |
| M4 | The Google "G" logo SVG in the login button has `aria-hidden="true"` but the button text alone doesn't clarify it's specifically Google (fine) — however the *button itself* has no `aria-label`, so if the visible text node were ever removed/changed the accessible name would silently break | `index.html:16-19` | Low risk today since visible text is present and forms the accessible name correctly, but worth a defensive `aria-label="Sign in with Google"` since it's the single gate to the entire app. |
| M5 | Mobile breakpoint (`<40em`, ~640px) has no accompanying check for the login card, dialogs, or playback sidebar | `styles.css:39-57` vs `.login-card` (`max-width: 24em`), `.playback-dock` (`width: 20em; max-width: 90vw`) | The core grid has an explicit mobile layout, but it's untested against the *new* WP08 elements — the playback sidebar is confirmed only to shrink its outer margin at `<60em`, not verified not to overlap or clip on a phone-width viewport per the WP08 acceptance criteria already flagged as unverified. |

### 3.4 Minor

| # | Issue | Location | Impact |
|---|---|---|---|
| N1 | `dialog button` default styling (`styles.css:252-260`) gives every dialog button equal visual weight | Both "Save Snapshot" (primary action) and "Close" (secondary) render identically, with no primary/secondary distinction — inconsistent with `.btn-filled` established elsewhere for the login button. | 
| N2 | No `autocomplete` hints on `#invite-email` | `index.html:106` | Minor convenience loss for browser autofill. |
| N3 | Footer license/attribution text has no landmark distinction from the canvas content | `index.html:77-80` | `<footer>` is a landmark, so this is actually fine — noted only because it sits inside `#app-root` alongside the grid; low priority, included for completeness. |

---

## 4. Deliverables & Acceptance Criteria

- [ ] **C1**: Replace `<img id="help">` with a real `<button>` (icon-only, matching `.icon-btn` pattern already used elsewhere), keeping the same click behavior. Keyboard-focusable and activatable with Enter/Space.
- [ ] **C2**: Add `aria-labelledby="h<fieldid>"` (pointing at the existing `<h2 id="h..">`) directly on each `.e[contenteditable]` section, and `role="textbox"` + `aria-multiline="true"` so assistive tech announces them as editable text fields, not generic containers.
- [ ] **C3**: Convert `#app-menu` to a proper menu pattern: `role="menu"` on the nav, `role="menuitem"` on each `.app-menu-item`, arrow-key navigation between items, `Escape` closes and returns focus to `#menu-btn`, and focus moves to the first item on open.
- [ ] **C4**: Add `role="alert"` (or `aria-live="assertive"`) to `#login-error` so sign-in failures are announced immediately.
- [ ] **S1**: Replace the translucent magenta focus glow with a solid, high-contrast focus outline (e.g. 2px solid `var(--primary)` with sufficient offset) that passes 3:1 contrast against both light and dark surface tokens; keep the magenta `.hi`/`.lo` treatment for the *non-focus* collaborative-highlight use case if desired, but don't rely on it alone for the browser's native focus signal.
- [ ] **S2**: Add a secondary non-color cue to presence avatars/contributor highlights — e.g. a numbered badge or consistent-per-user icon shape in addition to color, and ensure a text-based collaborator list (already present in the share modal) remains the authoritative, color-independent source of truth.
- [ ] **S3**: Replace `confirm()` calls for restore-version and sign-out with styled `<dialog>` confirmations consistent with the rest of the app, and state the actual consequence in the copy (e.g. "Signing out will permanently disconnect this Google account from your guest session..." per the earlier product decision on one-way sign-out).
- [ ] **S4**: Add distinguishing `aria-label`s to each dialog's close/action buttons.
- [ ] **S5**: Add visible (not just `aria-label`) text or a persistent on-focus tooltip equivalent for icon-only buttons, or accept `title` as sufficient for mouse users while confirming `aria-label` covers keyboard/AT users (already true — mainly a documentation/verification item).
- [ ] **M1**: Add a consistent pending/disabled-button pattern for all async-triggering buttons (waypoint save, invite send, restore), not just the login button.
- [ ] **M2**: Respect `prefers-reduced-motion` for `.diff-flash` and the playback-sidebar margin transition; consider `transform`/overlay instead of reflowing the grid via `margin-right`.
- [ ] **M3**: Change `showVersionPreview`'s generated field headings from `<h3>` to `<h2>` to maintain a correct heading hierarchy under the modal's `<h1>`.
- [ ] **M4**: Add defensive `aria-label="Sign in with Google"` to `#login-google-btn`.
- [ ] **M5**: Manually verify (real device or emulator, not just DevTools resize) the login card, all five dialogs, and the playback sidebar at a 360–400px viewport width; fix any overflow/clipping found.
- [ ] **N1–N3**: Address as time allows; not blocking.

## 5. Design Invariants Check
Per `work-packages/README.md` §"Design Invariants to Maintain Across All Packages": none of the above changes touch the pedagogical URL-hash feature (`#kp-ka-vp`) or add runtime dependencies — all fixes are semantic HTML/ARIA attributes and CSS, consistent with the zero-bloat vanilla ethos. Recommend re-running the existing dark-mode/print manual check (already flagged as outstanding in WP08) together with this package, since several fixes here (focus outline color, dialog button styling) interact with those media queries.
