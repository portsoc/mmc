# WP09 — Testing, LocalStorage Migration & Verification

## 1. Objective
Ensure backwards compatibility with legacy local-storage canvases, implement thorough test suites (unit, security rules, concurrent editing), and formulate the production release procedure.

---

## 2. Background & Scope
The existing tool stores user data in browser `localStorage.getItem('mmc')`. When users upgrade or visit the hosted platform, their existing local drafts must not be lost. Additionally, real-time concurrent editing and Firebase security rules require automated validation before deployment.

---

## 3. Scope of Work

### 3.1 Legacy LocalStorage Migration
- **Detection**: On initial load, detect if `localStorage.getItem('mmc')` exists and contains non-empty canvas data.
- **Migration Prompt**:
  - Display a non-intrusive banner or dialog:
    *"We found a canvas saved in your browser storage! Would you like to import it to your new hosted canvas?"*
  - Actions:
    - `[Import to Cloud]`: Copies the local fields into the current Firebase canvas and marks local storage as backed up (`localStorage.setItem('mmc_migrated', 'true')`).
    - `[Keep as Local Draft]`: Leaves local storage untouched.
    - `[Export as JSON]`: Downloads the raw local JSON file for safe archiving.

### 3.2 Automated Test Suite
1. **Security Rules Unit Tests (`@firebase/rules-unit-testing`)**:
   - Verify unauthenticated users can read canvases via valid `readOnlyToken`.
   - Verify unauthenticated users CANNOT write to or modify canvases.
   - Verify non-owners cannot delete a canvas or invite editors.
   - Verify editors can update content and create versions.
   - Verify viewers cannot write to fields or create versions.
2. **Concurrent Editing Simulation**:
   - Script automated test with two headless browser clients typing simultaneously into `#ekp`.
   - Verify both users' texts merge cleanly without divergence or corruption.
3. **Playback & Version Integrity Tests**:
   - Create 3 version waypoints.
   - Run playback slider and assert that canvas fields match the historical snapshots at each waypoint day.

### 3.3 Verification Checklist Prior to Production Launch
- [ ] LocalStorage migration prompt fires correctly on existing student browsers.
- [ ] Multi-user concurrent editing tested across separate devices and networks.
- [ ] Read-only UUID share link works in incognito/unauthenticated browser.
- [ ] Scheduled daily snapshot executes reliably without duplicate runs.
- [ ] History metrics calculate accurately across diverse contributor session lengths.
- [ ] Dark mode and print layouts pass visual regression tests.
- [ ] URL fragment presentation highlighting (`#kp-ka-vp`) works in both live and playback modes.
