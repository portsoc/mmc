import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLES, roleOf, hasRole, isOwner, canEdit, canView } from '../../js/roles.js';

describe('roles', () => {
  const canvas = { roles: { u1: 'owner', u2: 'editor', u3: 'viewer' }, isPublicReadOnlyEnabled: true };

  it('roleOf returns the assigned role', () => {
    assert.equal(roleOf(canvas, 'u1'), ROLES.OWNER);
    assert.equal(roleOf(canvas, 'unknown'), null);
    assert.equal(roleOf({ ownerId: 'u_owner' }, 'u_owner'), ROLES.OWNER);
  });

  it('hasRole respects the rank hierarchy', () => {
    assert.equal(hasRole(canvas, 'u1', ROLES.VIEWER), true);
    assert.equal(hasRole(canvas, 'u3', ROLES.EDITOR), false);
  });

  it('isOwner only true for owner role', () => {
    assert.equal(isOwner(canvas, 'u1'), true);
    assert.equal(isOwner(canvas, 'u2'), false);
  });

  it('canEdit true for owner and editor, false for viewer', () => {
    assert.equal(canEdit(canvas, 'u1'), true);
    assert.equal(canEdit(canvas, 'u2'), true);
    assert.equal(canEdit(canvas, 'u3'), false);
  });

  it('canView allows public token holders when enabled', () => {
    assert.equal(canView(canvas, null, true), true);
    assert.equal(canView({ ...canvas, isPublicReadOnlyEnabled: false }, null, true), false);
  });
});
