# WP07 — Evolution Playback Engine & Day-by-Day Slider

## 1. Objective
Build an interactive timeline playback bar with a scrubbable slider that plays through calendar days, displaying the chronological evolution of the canvas with named version waypoints.

---

## 2. Background & Requirements
User Requirements:
- "I'd like a 'playback' button with slider that goes through the days, showing the evolution, with versions as particular waypoiunts on specific days."

Watching a Mission Model Canvas evolve over time reveals how problem validation reshapes Value Propositions, Key Activities, and Beneficiaries. This feature turns the canvas into an animated storytelling instrument for pitches, reviews, and post-mortems.

---

## 3. UI/UX Design & Controls

### 3.1 Playback Bar Component
A floating or bottom-docked control bar that appears when clicking the "Playback" button in the top navigation:

```
+----------------------------------------------------------------------------------+
|  [▶ Play] [⏸ Pause]  Day 4 of 12 (18 Oct 2026)  | Waypoint: "Interviews Complete"  |
|                                                                                  |
|  [--|-------o------------●------------------o-----------------------|--] (Slider)  |
|   Day 1               Waypoint 1         Waypoint 2               Today          |
|                                                                                  |
|  Speed: [ 1x | 2x | 5x ]       [Diff Highlights: ON]       [Exit Playback ✖]     |
+----------------------------------------------------------------------------------+
```

### 3.2 Visual Slider Elements
- **Range Slider (`<input type="range">` or custom SVG track)**:
  - Minimum: `0` (Canvas Creation Date).
  - Maximum: `N` (Current Date).
  - Step: `1` (one day per tick).
- **Waypoint Indicators (`●`)**:
  - Pinned circular nodes placed along the slider track at the exact days where named version waypoints exist.
  - Hovering a node displays a tooltip with the waypoint title and author.
  - Clicking a waypoint immediately jumps the slider to that day.
- **Daily Snapshots (`o`)**:
  - Subtle smaller markers indicating days where automated daily snapshots were recorded.

---

## 4. Technical Engine & State Transition

### 4.1 Playback State Machine
1. **Entering Playback Mode**:
   - Canvas shifts to a frozen read-only state (`contenteditable="false"`).
   - A distinct "Playback Mode Active" banner displays at the top of the canvas with an "Exit to Live" button.
2. **Scrubbing & Day Selection**:
   - When the user drags the slider to Day $D$:
     1. Retrieve the latest version snapshot recorded on or before Day $D$.
     2. Update the DOM of all 11 fields (`mmd`, `by`, `ekp`, `eka`, etc.) with that snapshot's content.
     3. Update the header date and active waypoint label.
3. **Automated Playback (Play/Pause Loop)**:
   - When clicking `[Play]`, an interval timer advances the slider by one day every $T$ ms:
     - `1x`: 1200ms per day
     - `2x`: 600ms per day
     - `5x`: 250ms per day
   - Automatically pauses upon reaching "Today" (the latest state).
4. **Visual Diff Highlighting (Optional Toggle)**:
   - When stepping from Day $D-1$ to Day $D$, compare text between the two snapshots.
   - Newly added or altered phrases flash or render with a light green or Portsmouth purple highlight (`var(--uop1)`), clearly demonstrating what changed on that specific day.

---

## 5. Deliverables & Acceptance Criteria
- [ ] Responsive bottom playback dock with Play, Pause, Speed, and Exit controls.
- [ ] Timeline slider spanning creation date to current date.
- [ ] Visual pins on the slider corresponding to named waypoints and snapshots.
- [ ] Smooth DOM content transitions as slider scrubs across days.
- [ ] Safe sandbox: editing is locked during playback, and exiting returns cleanly to live real-time state.
