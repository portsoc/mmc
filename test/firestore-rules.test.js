// WP09 — Security rules tests against the local Firestore emulator.
// Run: firebase emulators:exec --only firestore "npm --prefix test run test:rules"
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';

const CANVAS_ID = 'c_test1';

let testEnv;

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'mmc-rules-test',
    firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host, port: Number(port) }
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // Reuse a single Firestore instance for both writes — calling
    // ctx.firestore() more than once creates a second client against the
    // same emulator connection, and its settings-lock check collides with
    // the first ("Firestore has already been started...").
    const db = ctx.firestore();
    await db.doc(`canvases/${CANVAS_ID}`).set({
      ownerId: 'owner1',
      roles: { owner1: 'owner', editor1: 'editor', viewer1: 'viewer' },
      memberNames: { owner1: 'Olive', editor1: 'Ed', viewer1: 'Vi' },
      isPublicReadOnlyEnabled: true,
      readOnlyToken: 'tok_abc',
      fields: {}
    });
    await db.doc('public_tokens/tok_abc').set({ canvasId: CANVAS_ID, active: true });
  });
});

describe('canvases security rules', () => {
  it('unauthenticated user can read via public token flag', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertSucceeds(unauth.firestore().doc(`canvases/${CANVAS_ID}`).get());
  });

  it('unauthenticated user cannot write', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc(`canvases/${CANVAS_ID}`).update({ title: 'hack' }));
  });

  it('non-owner cannot delete the canvas', async () => {
    const editor = testEnv.authenticatedContext('editor1');
    await assertFails(editor.firestore().doc(`canvases/${CANVAS_ID}`).delete());
  });

  it('editor can update canvas content', async () => {
    const editor = testEnv.authenticatedContext('editor1');
    await assertSucceeds(editor.firestore().doc(`canvases/${CANVAS_ID}`).update({ 'fields.kp': 'updated' }));
  });

  it('viewer cannot write to fields', async () => {
    const viewer = testEnv.authenticatedContext('viewer1');
    await assertFails(viewer.firestore().doc(`canvases/${CANVAS_ID}`).update({ 'fields.kp': 'nope' }));
  });

  it('viewer cannot create a version', async () => {
    const viewer = testEnv.authenticatedContext('viewer1');
    await assertFails(
      viewer.firestore().doc(`canvases/${CANVAS_ID}/versions/v1`).set({ name: 'x', fields: {} })
    );
  });

  it('editor can create a version', async () => {
    const editor = testEnv.authenticatedContext('editor1');
    await assertSucceeds(
      editor.firestore().doc(`canvases/${CANVAS_ID}/versions/v1`).set({ name: 'x', fields: {} })
    );
  });
});

describe('member names', () => {
  it('owner cannot rename a collaborator', async () => {
    const owner = testEnv.authenticatedContext('owner1');
    await assertFails(owner.firestore().doc(`canvases/${CANVAS_ID}`).update({ 'memberNames.editor1': 'Mallory' }));
  });

  it('editor cannot rename themself', async () => {
    const editor = testEnv.authenticatedContext('editor1');
    await assertFails(editor.firestore().doc(`canvases/${CANVAS_ID}`).update({ 'memberNames.editor1': 'Boss' }));
  });
});

describe('canvas list', () => {
  it('a user can list the canvases they have a role on', async () => {
    const editor = testEnv.authenticatedContext('editor1');
    const snap = await assertSucceeds(
      editor.firestore().collection('canvases').where('roles.editor1', 'in', ['owner', 'editor', 'viewer']).get()
    );
    assert.equal(snap.size, 1);
  });

  it('a user cannot list every canvas', async () => {
    const stranger = testEnv.authenticatedContext('stranger1');
    await assertFails(stranger.firestore().collection('canvases').get());
  });

});

describe('bin', () => {
  const moveToBin = () => testEnv.withSecurityRulesDisabled((ctx) =>
    ctx.firestore().doc(`canvases/${CANVAS_ID}`).update({ binnedAt: new Date() }));
  const canvasAs = (uid) => testEnv.authenticatedContext(uid).firestore().doc(`canvases/${CANVAS_ID}`);

  it('owner can move a canvas to the bin and restore it', async () => {
    const canvas = canvasAs('owner1');
    await assertSucceeds(canvas.update({ binnedAt: new Date() }));
    await assertSucceeds(canvas.update({ binnedAt: null }));
  });

  it('editor cannot move a canvas to the bin', async () => {
    await assertFails(canvasAs('editor1').update({ binnedAt: new Date() }));
  });

  it('editor cannot restore a canvas from the bin', async () => {
    await moveToBin();
    await assertFails(canvasAs('editor1').update({ binnedAt: null }));
  });

  it('editor cannot make themself the owner', async () => {
    await assertFails(canvasAs('editor1').update({ ownerId: 'editor1' }));
  });

  it('editor cannot edit a canvas in the bin', async () => {
    await moveToBin();
    await assertFails(canvasAs('editor1').update({ 'fields.kp': 'x' }));
  });

  it('public link stops working while the canvas is in the bin', async () => {
    await moveToBin();
    await assertFails(testEnv.unauthenticatedContext().firestore().doc(`canvases/${CANVAS_ID}`).get());
  });

  it('owner can delete a canvas for good, but only from the bin', async () => {
    const canvas = canvasAs('owner1');
    await assertFails(canvas.delete());
    await moveToBin();
    await assertSucceeds(canvas.delete());
  });
});

// Fails loudly (rather than silently skipping) if run outside mocha.
assert.ok(typeof describe === 'function', 'This file must be run with mocha.');
