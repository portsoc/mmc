# WP06 — History Metrics & Contributor Analytics

## 1. Objective
Track and display rich contribution metrics indicating who has edited the canvas the most, with both aggregate and per-field analytical breakdowns.

---

## 2. Background & Requirements
User Requirement:
- "And some history metrics showing who's edited things the most."

In academic group projects and startup cohorts, course tutors and team leads need visibility into participation equity. The system must measure contributions fairly without slowing down typing performance.

---

## 3. Contribution Tracking Architecture

### 3.1 Metrics Collected
1. **Gross Keystroke / Edit Operations**: Total number of edit batches or transactions committed by each user.
2. **Net Character / Word Contribution**: Quantitative character count attributed to each collaborator across the entire canvas and per individual section.
3. **Active Session Duration**: Aggregate time spent actively focused on the canvas.
4. **Section Dominance**: Identifies which collaborator has written the primary draft for each of the 9 blocks.

### 3.2 Data Structure: `/canvases/{canvasId}/metrics/contributions`
```json
{
  "totalWords": 420,
  "totalEdits": 184,
  "lastUpdated": "2026-09-23T12:15:00Z",
  "contributors": {
    "usr_alex": {
      "name": "Alex",
      "avatarColor": "#0076A6",
      "wordsContributed": 210,
      "percentage": 50.0,
      "editCount": 92,
      "sectionsEdited": ["kp", "ka", "vp", "mmd"]
    },
    "usr_bob": {
      "name": "Bob",
      "avatarColor": "#621360",
      "wordsContributed": 147,
      "percentage": 35.0,
      "editCount": 64,
      "sectionsEdited": ["bs", "be", "de"]
    },
    "usr_charlie": {
      "name": "Charlie",
      "avatarColor": "#FF00FF",
      "wordsContributed": 63,
      "percentage": 15.0,
      "editCount": 28,
      "sectionsEdited": ["mb", "if"]
    }
  },
  "fieldAttribution": {
    "kp": { "usr_alex": 80, "usr_bob": 20 },
    "ka": { "usr_alex": 95, "usr_charlie": 5 },
    "vp": { "usr_alex": 70, "usr_bob": 30 },
    "bs": { "usr_bob": 100 },
    "be": { "usr_bob": 85, "usr_charlie": 15 },
    "kr": { "usr_charlie": 100 },
    "de": { "usr_bob": 90, "usr_alex": 10 },
    "mb": { "usr_charlie": 80, "usr_alex": 20 },
    "if": { "usr_charlie": 90, "usr_bob": 10 }
  }
}
```

---

## 4. UI & Visualizations

### 4.1 "Contributor Stats" Modal / Drawer
Triggered from the top collaboration bar via a dedicated `Metrics` button (bar chart icon):
1. **Overview Bar**:
   - A multi-segmented horizontal progress bar with segments colored according to each user's assigned palette color (reminiscent of GitHub language stats).
2. **Contributor Leaderboard**:
   - Ranked list showing:
     - Avatar with initials / profile image
     - Contributor name
     - Percentage of total text contributed (`50%`, `35%`, etc.)
     - Number of edit sessions & words authored
3. **Canvas Heatmap / Attribution Mode (Toggle)**:
   - A toggle button in the metrics drawer: "Highlight Text by Contributor".
   - When enabled, text in each section receives a subtle colored underline or highlight corresponding to the author who wrote it.

---

## 5. Deliverables & Acceptance Criteria
- [ ] Lightweight client-side attribution listener updating user metrics without UI stutter.
- [ ] Clean, accessible metrics modal matching Portsmouth styling and dark mode.
- [ ] Interactive contribution bar chart showing proportional contributions.
- [ ] Per-section breakdown showing who contributed most to each block.
- [ ] Contributor highlighting toggle in the canvas view.
