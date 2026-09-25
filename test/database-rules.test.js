// WP-B — Realtime Database rules tests against the local emulator.
// Run: firebase emulators:exec --only database "npm --prefix test run test:rtdb"
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';

const CANVAS_ID = 'c_test1';
const UPDATE = { clientId: 1, data: [0, 1], ts: 1 };

let testEnv;

before(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'mmc-rules-test',
    database: { rules: readFileSync('../database.rules.json', 'utf8'), host, port: Number(port) }
  });
});

after(async () => {
  await testEnv.cleanup();
});

async function seed({ binned = false } = {}) {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      access: {
        [CANVAS_ID]: { roles: { owner1: 'owner', editor1: 'editor', viewer1: 'viewer' }, binned }
      },
      sessions: { [CANVAS_ID]: { updates: { u1: UPDATE } } }
    });
  });
}

const db = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).database();
const updates = (uid) => db(uid).ref(`sessions/${CANVAS_ID}/updates`);
const awareness = (uid, who = uid) => db(uid).ref(`sessions/${CANVAS_ID}/awareness/${who}`);

describe('live session rules', () => {
  beforeEach(() => seed());

  it('owner, editor and viewer can read the edit history', async () => {
    for (const uid of ['owner1', 'editor1', 'viewer1']) await assertSucceeds(updates(uid).get());
  });

  it('a signed-in stranger cannot read or write the edit history', async () => {
    await assertFails(updates('stranger').get());
    await assertFails(updates('stranger').push(UPDATE));
  });

  it('signed-out visitors cannot read the edit history', async () => {
    await assertFails(updates(null).get());
  });

  it('owner and editor can add edits; viewer cannot', async () => {
    await assertSucceeds(updates('owner1').push(UPDATE));
    await assertSucceeds(updates('editor1').push(UPDATE));
    await assertFails(updates('viewer1').push(UPDATE));
  });

  it('edit history is append-only, even for the owner', async () => {
    await assertFails(updates('owner1').child('u1').remove());
    await assertFails(updates('owner1').child('u1').set(UPDATE));
    await assertFails(updates('owner1').remove());
  });

  it('malformed edits are rejected', async () => {
    await assertFails(updates('editor1').push({ data: [0] }));
  });

  it('members can see presence and set only their own', async () => {
    await assertSucceeds(db('viewer1').ref(`sessions/${CANVAS_ID}/awareness`).get());
    await assertSucceeds(awareness('editor1').set({ field: 'kp' }));
    await assertFails(awareness('editor1', 'owner1').set({ field: 'kp' }));
    await assertFails(awareness('stranger').set({ field: 'kp' }));
    await assertFails(db('stranger').ref(`sessions/${CANVAS_ID}/awareness`).get());
  });

  it('nobody can read or write the access mirror from the browser', async () => {
    await assertFails(db('owner1').ref(`access/${CANVAS_ID}`).get());
    await assertFails(db('owner1').ref(`access/${CANVAS_ID}/roles/stranger`).set('editor'));
  });
});

describe('binned canvas live session', () => {
  beforeEach(() => seed({ binned: true }));

  it('stays readable by members but nobody can add edits', async () => {
    await assertSucceeds(updates('owner1').get());
    await assertFails(updates('owner1').push(UPDATE));
    await assertFails(updates('editor1').push(UPDATE));
  });
});
