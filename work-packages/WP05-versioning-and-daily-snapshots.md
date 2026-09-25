# WP05 — Versioning System & Automated Daily Snapshots

## 1. Objective
Implement explicit, user-created named version waypoints alongside an automated background daily snapshot mechanism for all active canvases.

---

## 2. Background & Requirements
User Requirements:
- "I want the ability to create versions (with an automated daily snapshot)"
- "with versions as particular waypoiunts on specific days."

Canvases in educational and strategy workshops evolve rapidly over multiple days of stakeholder interviews and iterative customer discovery. Users must be able to anchor named milestones (waypoints) and rely on automated daily backups to trace evolutionary progress.

---

## 3. Data Structure

### Version Document: `/canvases/{canvasId}/versions/{versionId}`
```json
{
  "id": "v_20260923_1400",
  "canvasId": "c_9f82a174",
  "name": "Pitch Deck Draft 1",
  "description": "Adjusted Value Proposition after mentoring session with Rich.",
  "type": "manual", // "manual" | "daily_auto"
  "dateKey": "2026-09-23", // For fast timeline querying
  "createdAt": "2026-09-23T14:00:00Z",
  "createdBy": {
    "uid": "usr_abc123",
    "name": "Alex"
  },
  "fields": {
    "mmd": "...",
    "by": "...",
    "kp": "...",
    "ka": "...",
    "vp": "...",
    "bs": "...",
    "be": "...",
    "kr": "...",
    "de": "...",
    "mb": "...",
    "if": "..."
  },
  "wordCountTotal": 342,
  "stats": {
    "sectionsFilled": 9,
    "topContributor": "Alex"
  }
}
```

---

## 4. Technical Implementation

### 4.1 Manual Version Waypoints
1. **Creation Modal**:
   - Accessible via the top collaboration toolbar (`Snapshot / Waypoint` button).
   - Prompts for a Version Name (e.g. "Week 3 Validation") and an optional note/description.
2. **Snapshot Creation**:
   - Freezes current values across all 11 fields.
   - Calculates summary metrics (word counts, non-empty sections).
   - Stores new document in `/canvases/{canvasId}/versions/`.
   - Emits toast notification and updates version timeline.

### 4.2 Automated Daily Snapshots
We provide two implementation patterns depending on the Firebase billing tier:

#### Pattern A: Cloud Function with Cloud Scheduler (Recommended for Blaze Plan)
- A scheduled Cloud Function triggers daily at midnight UTC:
  ```javascript
  exports.dailyCanvasSnapshot = onSchedule("0 0 * * *", async (event) => {
    const today = new Date().toISOString().split('T')[0];
    const modifiedSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const activeCanvases = await db.collection('canvases')
      .where('updatedAt', '>=', modifiedSince)
      .get();
      
    for (const doc of activeCanvases.docs) {
      const data = doc.data();
      if (data.lastSnapshotDate !== today) {
        await createDailySnapshot(doc.id, data, today);
        await doc.ref.update({ lastSnapshotDate: today });
      }
    }
  });
  ```

#### Pattern B: Client-Side Lazy Snapshot (Free Spark Plan Fallback)
- On canvas load or on the first write of the day:
  - Check if `lastSnapshotDate < today`.
  - If true and canvas has existing content, run an automated snapshot transaction creating a `daily_auto` version with `name: "Daily Snapshot: YYYY-MM-DD"`.

### 4.3 Version History Drawer & Restore Workflow
- Users can browse past versions in a side drawer.
- Selecting a version opens a read-only preview of that historical canvas state.
- "Restore this Version" action (Owner only): Overwrites the live canvas content with the snapshot, logging an audit record.

---

## 5. Deliverables & Acceptance Criteria
- [ ] Working "Create Waypoint" UI modal with title and description inputs.
- [ ] Version documents accurately capture all 11 fields and creator info.
- [ ] Automated daily snapshot executes once per calendar day when activity is detected.
- [ ] Version list drawer displaying chronologically ordered waypoints with distinguishing badges (`Manual Waypoint` vs `Daily Auto Snapshot`).
- [ ] Safe version preview and owner-authorized restore mechanism.
