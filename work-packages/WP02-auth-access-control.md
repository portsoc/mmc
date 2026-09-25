# WP02 — Authentication & Role-Based Access Control

## 1. Objective
Implement user authentication supporting friction-free guest onboarding (anonymous auth) as well as permanent accounts (Google OAuth, Email/Password/Link), with strong role-based access rules.

---

## 2. Background & Context
Students and workshop participants frequently need to jump into a canvas within seconds without a cumbersome registration process. However, to support persistent ownership, invitations, and version history, identity must be established and upgradeable.

---

## 3. Scope of Work

### 3.1 Authentication Providers
1. **Anonymous Authentication (`signInAnonymously`)**:
   - Every visitor without an existing session is automatically assigned an anonymous Firebase session.
   - Allows instant canvas creation, drafting, and editing.
2. **Account Linking & Persistent Sign-in**:
   - Provide "Sign in with Google" and "Sign in with Email" options.
   - If an anonymous user signs in, call `linkWithCredential` or `linkWithPopup` to preserve their created canvases under their newly linked persistent account.
3. **User Profile State**:
   - Store user display name, avatar, and email in `/users/{uid}`.
   - For anonymous users, prompt for a friendly display name (e.g. "Alex (Guest)") to ensure collaboration avatars and edit history are human-readable.

### 3.2 Role Hierarchy
Every canvas defines roles in its document under `roles: { [uid]: role }`:
- **`owner`**:
  - Full administrative rights: delete canvas, change ownership, manage collaborators, revoke public link, restore snapshots.
- **`editor`**:
  - Can edit all canvas fields concurrently, create named version waypoints, view history metrics.
- **`viewer`**:
  - Can view canvas contents, observe real-time edits, use evolution playback slider, but cannot modify text.
- **`public_viewer`** (unauthenticated token holder):
  - Read-only access granted via the UUID share link.

### 3.3 Security Rules Specification (`firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isCanvasOwner(canvasData) {
      return isAuthenticated() && canvasData.ownerId == request.auth.uid;
    }
    
    function isCanvasEditor(canvasData) {
      return isAuthenticated() && (
        canvasData.roles[request.auth.uid] in ['owner', 'editor']
      );
    }
    
    function isCanvasViewer(canvasData) {
      return isAuthenticated() && (
        canvasData.roles[request.auth.uid] in ['owner', 'editor', 'viewer']
      );
    }

    match /canvases/{canvasId} {
      allow read: if isCanvasViewer(resource.data) 
                  || (resource.data.isPublicReadOnlyEnabled == true && request.auth == null);
      allow create: if isAuthenticated();
      allow update: if isCanvasEditor(resource.data);
      allow delete: if isCanvasOwner(resource.data);
      
      match /versions/{versionId} {
        allow read: if isCanvasViewer(get(/databases/$(database)/documents/canvases/$(canvasId)).data);
        allow create: if isCanvasEditor(get(/databases/$(database)/documents/canvases/$(canvasId)).data);
      }
    }
  }
}
```

---

## 4. Deliverables & Acceptance Criteria
- [x] Seamless anonymous guest initialization on first load.
- [ ] User profile modal for entering nickname or linking Google/Email account. (Google linking via toolbar sign-in button done; no nickname entry, no Email/password auth)
- [x] Role check utility (`hasRole(canvasId, 'editor')`, `isOwner(...)`).
- [x] `firestore.rules` enforcing role-based permissions tested via the Firebase Emulator.
- [x] Read-only mode UI automatically enforced when user has viewer role.
