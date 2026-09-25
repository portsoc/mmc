# WP08 — Collaboration UI, Top Toolbar & Visual Polish

## 1. Objective
Add collaboration controls, presence avatars, and action dialogs while preserving the distraction-free, minimalist aesthetic, responsive layout, and dark mode fidelity of the Portsmouth MMC.

---

## 2. Background & UI Design Constraints
The existing canvas header has:
- Title: "The Mission Model Canvas"
- Editable Mission Description (`#mmd`)
- Editable Author (`#by`)
- Help Icon (`#help`)

We must introduce collaboration capabilities (Sharing, Versions, Metrics, Playback, and Presence) **without** turning the interface into a cluttered enterprise dashboard.

---

## 3. UI Component Specifications

### 3.1 Top Collaboration Toolbar
Positioned elegantly in the top-right of the canvas header or in a slim top utility strip:

```
[ MMC Logo / Title ]   [ 👥 Avatars (3) ]   [ ⏱ Playback ]   [ 🔖 Waypoint ]   [ 📊 Metrics ]   [ 🔗 Share ]   [ ❓ Help ]
```

1. **Active Collaborator Avatars**:
   - Small circular avatar pills with user initials or Google profile images.
   - Colored ring around each avatar matching the user's presence color.
   - Tooltip shows user name, email, and whether they are actively editing or viewing.
2. **Action Buttons**:
   - `Playback`: Opens the bottom timeline playback dock (WP07).
   - `Waypoint`: Opens the "Save Version / Waypoint" dialog (WP05).
   - `Metrics`: Opens the "Contributor Metrics & Stats" drawer (WP06).
   - `Share`: Opens the "Share & Invite" modal (WP03).
   - `Help`: Existing `<dialog id="usage">` modal.

### 3.2 Modal Dialogs (Native `<dialog>`)
In keeping with the vanilla architectural ethos, all popups utilize native HTML5 `<dialog>` elements styled with the existing Portsmouth theme:

1. **`<dialog id="share-modal">`**:
   - Tab 1: **Read-Only Link**:
     - Displays the generated UUID URL (`https://mmc.app/view/<uuid>`).
     - "Copy Link" button with instant clipboard feedback.
     - Toggle: "Allow anyone with this link to view".
   - Tab 2: **Invite Collaborators**:
     - Email input field + role dropdown (`Editor` vs `Viewer`).
     - "Send Invite" button.
     - List of active collaborators with role badges and revoke buttons (owner only).
2. **`<dialog id="waypoint-modal">`**:
   - Input for Waypoint Name (e.g. "Milestone 2 Validation").
   - Textarea for brief description / notes.
   - "Save Snapshot" button.
3. **`<dialog id="metrics-modal">`**:
   - Visual contribution bar and contributor rankings.

### 3.3 Theme & Accessibility Integrity
- Full dark mode compliance (`@media (prefers-color-scheme: dark)`):
  - Buttons and dialogs adapt seamlessly to dark palette (`--white: #000000; --black: #DFDFDF;`).
  - No low-contrast text.
- Print media rules (`@media print`):
  - The collaboration toolbar, playback controls, and modals are hidden (`display: none;`).
  - Only the pristine Mission Model Canvas is printed.

---

## 4. Deliverables & Acceptance Criteria
- [x] Top collaboration toolbar seamlessly integrated into `<header>` without breaking desktop CSS grid or mobile layout.
- [x] Active presence avatars reflecting online users in real time. (`renderPresence` in `app.js`, driven by `collab.js` RTDB awareness)
- [x] Styled native `<dialog>` modals for Share, Waypoint creation, and Metrics. (Share/collaborator modal done; Waypoint and Metrics modals are stubs pending WP05/WP06)
- [ ] Consistent dark mode and print styling across all newly added UI elements. (base styling added for sign-in/badge/toolbar; not yet audited against dark mode + print)
- [ ] Zero layout shifts or overflow bugs on mobile viewport (`< 40em`). (not yet verified)
