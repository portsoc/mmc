# WP03 — Data Model, UUID Sharing & Invitations

## 1. Objective
Design and implement the Firestore and Realtime Database data schemas, UUID-based read-only link sharing, and collaborator invitation flows.

---

## 2. Background & Context
The user requirements specify:
- "When an MMC is created by a user they should be able to invite others to edit."
- "Each MMC should also have a uuid based link that can eb share for read-only access."
- "Backed by a firebase database."

We need a flexible, queryable data schema that separates canvas metadata, live content, versions, and invitation states while providing secure UUID lookup.

---

## 3. Data Schemas

### 3.1 Document: `/canvases/{canvasId}`
```json
{
  "id": "c_9f82a174",
  "title": "Maritime Robotics Surveillance",
  "ownerId": "usr_abc123",
  "createdAt": "2026-09-23T10:00:00Z",
  "updatedAt": "2026-09-23T12:00:00Z",
  "lastSnapshotDate": "2026-09-23",
  "roles": {
    "usr_abc123": "owner",
    "usr_def456": "editor"
  },
  "readOnlyToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "isPublicReadOnlyEnabled": true,
  "fields": {
    "mmd": "Autonomous surveillance for coastal environmental protection.",
    "by": "Rich Boakes & Student Team",
    "kp": "Portsmouth Port Authority, Royal Navy, Marine Biology Dept",
    "ka": "Autonomous sensor deployment, weekly telemetry analysis",
    "vp": "Zero-emission marine observation at 10% traditional cost",
    "bs": "Harbor Master sign-off, Environmental Agency funding",
    "be": "Coastal communities, marine researchers, naval logistics",
    "kr": "ASV hulls, satellite uplink transponders, battery bank",
    "de": "Dockside gantry launching, cloud streaming dashboard",
    "mb": "£45k prototype CAPEX, £1.2k/mo satellite bandwidth OPEX",
    "if": "85% reduction in fuel consumption, 3x increase in survey hours"
  }
}
```

### 3.2 Collection: `/public_tokens/{readOnlyUuid}`
Enables fast `O(1)` security lookups for unauthenticated visitors holding a UUID link without querying all canvases:
```json
{
  "canvasId": "c_9f82a174",
  "createdAt": "2026-09-23T10:00:00Z",
  "active": true
}
```

### 3.3 Subcollection: `/canvases/{canvasId}/invites/{inviteId}`
```json
{
  "email": "student@port.ac.uk",
  "role": "editor",
  "invitedBy": "usr_abc123",
  "inviteToken": "inv_8829aef10",
  "status": "pending", // "pending" | "accepted" | "revoked"
  "createdAt": "2026-09-23T11:00:00Z",
  "expiresAt": "2026-10-23T11:00:00Z"
}
```

---

## 4. Feature Implementation Details

### 4.1 UUID Read-Only Link Sharing
1. **Generation**: When a canvas is created, a v4 UUID is generated (`crypto.randomUUID()`) and stored as `readOnlyToken`.
2. **URL Pattern**:
   - `https://mmc.port.ac.uk/view/f47ac10b-58cc-4372-a567-0e02b2c3d479`
   - or query parameter: `https://mmc.port.ac.uk/?view=f47ac10b-58cc-4372-a567-0e02b2c3d479`
3. **Behavior in Read-Only Mode**:
   - All `contenteditable` attributes are set to `false`.
   - Editing event listeners (`saveContent`, input handlers) are disabled.
   - An informative badge is rendered at the top: `Read-Only Link Active (Copy Link / Request Edit Access)`.
   - Shift-click defocusing (`.lo`) and presentation hash highlighting (`#kp-vp`) remain completely operational for presenters.
   - The user can still interact with the History Playback slider to inspect the canvas's evolution.

### 4.2 Collaborator Invitation Flow
1. **Invite Modal (Owner only)**:
   - "Invite Collaborator": Owner enters email address and selects role (`Editor` or `Viewer`).
   - "Share Direct Edit Link": Generates an editor invite token link for fast classroom distribution.
2. **Redemption Flow**:
   - When an invited recipient navigates to the invite URL, the app authenticates the user (or prompts anonymous guest nickname).
   - A Cloud Function or Firestore transaction validates the token, marks the invite as accepted, and injects `roles[currentUser.uid] = role` into the canvas document.

---

## 5. Deliverables & Acceptance Criteria
- [x] Firestore schema deployed and configured. (deployed to emulator; not yet to a live project)
- [x] Read-only UUID generation on canvas creation.
- [ ] Working read-only route (`/view/:uuid`) with `contenteditable="false"` enforcement. (not yet wired — invite route exists, view-only route does not)
- [x] Collaborator invite dialog with email invite and shareable editor link. (email delivery is console-log only, no email provider configured)
- [x] Token redemption logic adding users to `canvas.roles`. (via `redeemInvite` Cloud Function, verified against emulator)
- [x] Test cases for unauthorized modification rejection on read-only links. (covered by Firestore rules test suite, 7/7 passing)
