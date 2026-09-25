// WP02 — Role hierarchy helpers. Mirrors the checks encoded in firestore.rules
// so the client can gate UI state without waiting on a rejected write.
export const ROLES = Object.freeze({
  OWNER: 'owner',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  PUBLIC_VIEWER: 'public_viewer'
});

const RANK = {
  [ROLES.PUBLIC_VIEWER]: 0,
  [ROLES.VIEWER]: 1,
  [ROLES.EDITOR]: 2,
  [ROLES.OWNER]: 3
};

export function roleOf(canvasData, uid) {
  if (!uid) return null;
  if (canvasData?.ownerId && canvasData.ownerId === uid) return ROLES.OWNER;
  return canvasData?.roles?.[uid] ?? null;
}

export function hasRole(canvasData, uid, minimumRole) {
  const role = roleOf(canvasData, uid);
  if (!role) return false;
  return RANK[role] >= RANK[minimumRole];
}

export function isOwner(canvasData, uid) {
  return roleOf(canvasData, uid) === ROLES.OWNER;
}

export function canEdit(canvasData, uid) {
  return hasRole(canvasData, uid, ROLES.EDITOR);
}

export function canView(canvasData, uid, hasPublicToken = false) {
  if (hasPublicToken && canvasData?.isPublicReadOnlyEnabled) return true;
  return hasRole(canvasData, uid, ROLES.VIEWER);
}
