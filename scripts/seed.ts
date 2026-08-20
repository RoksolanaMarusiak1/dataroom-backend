/**
 * Seed script — populates the local dev database with a deliberately
 * diverse set of scenarios by hitting the real running API with axios
 * (never Prisma directly), so this also acts as an end-to-end smoke test.
 *
 * Usage: npm run seed
 *
 * Expects a FRESH database. Re-running against data from a previous run
 * will fail fast on the first duplicate-email registration (see
 * registerUser below) rather than silently creating duplicate rooms.
 */
import axios, { type AxiosResponse } from 'axios';
import FormData from 'form-data';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
// Vite's default port; this session's dev server has sometimes landed on
// 5175 instead when 5173/5174 were already taken — override if needed.
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const PASSWORD = 'TestPass123';

const http = axios.create({
  baseURL: API_BASE_URL,
  validateStatus: () => true,
});

async function step<T>(
  label: string,
  fn: () => Promise<AxiosResponse<T>>,
): Promise<T> {
  const res = await fn();
  const ok = res.status >= 200 && res.status < 300;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} -> ${res.status}`);
  if (!ok) {
    console.error(res.data);
    throw new Error(`Seed step failed: ${label} (status ${res.status})`);
  }
  return res.data;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function registerUser(
  email: string,
  fullName: string,
): Promise<{ token: string }> {
  const res = await http.post('/auth/register', {
    email,
    password: PASSWORD,
    fullName,
  });
  if (res.status === 409) {
    throw new Error(
      `${email} already exists — this script expects a fresh database. ` +
        `Reset it (e.g. \`npx prisma migrate reset\`) before re-seeding.`,
    );
  }
  const ok = res.status >= 200 && res.status < 300;
  console.log(`${ok ? 'OK  ' : 'FAIL'} register ${email} -> ${res.status}`);
  if (!ok) {
    console.error(res.data);
    throw new Error(`Seed step failed: register ${email} (status ${res.status})`);
  }
  return { token: res.data.accessToken as string };
}

async function createRoom(token: string, name: string) {
  return step<{ id: string; name: string }>(`create room "${name}"`, () =>
    http.post(
      '/data-rooms',
      { name },
      { headers: authHeader(token) },
    ),
  );
}

async function createFolder(
  token: string,
  name: string,
  dataRoomId: string,
  parentId?: string,
) {
  return step<{ id: string; name: string }>(`create folder "${name}"`, () =>
    http.post(
      '/folders',
      { name, dataRoomId, parentId },
      { headers: authHeader(token) },
    ),
  );
}

async function uploadFile(
  token: string,
  dataRoomId: string,
  filename: string,
  folderId?: string,
) {
  const form = new FormData();
  const content = `Seed file: ${filename}\nGenerated ${new Date().toISOString()}\n`;
  form.append('file', Buffer.from(content), {
    filename,
    contentType: 'text/plain',
  });
  form.append('dataRoomId', dataRoomId);
  if (folderId) form.append('folderId', folderId);

  return step<{ id: string; name: string }>(`upload "${filename}"`, () =>
    http.post('/files/upload', form, {
      headers: { ...authHeader(token), ...form.getHeaders() },
    }),
  );
}

async function shareByEmail(
  token: string,
  itemType: 'ROOM' | 'FOLDER' | 'FILE',
  itemId: string,
  email: string,
) {
  return step<{ id: string }>(`share ${itemType} ${itemId} with ${email}`, () =>
    http.post(
      '/shares',
      { itemType, itemId, email },
      { headers: authHeader(token) },
    ),
  );
}

async function createPublicLink(
  token: string,
  itemType: 'ROOM' | 'FOLDER' | 'FILE',
  itemId: string,
) {
  return step<{ id: string; publicToken: string }>(
    `create public link on ${itemType} ${itemId}`,
    () =>
      http.post(
        '/shares',
        { itemType, itemId },
        { headers: authHeader(token) },
      ),
  );
}

async function revokeShare(token: string, shareId: string) {
  return step(`revoke share ${shareId}`, () =>
    http.delete(`/shares/${shareId}`, { headers: authHeader(token) }),
  );
}

async function main() {
  console.log(`Seeding against ${API_BASE_URL} ...\n`);

  // ---- Users -------------------------------------------------------------
  console.log('--- Users ---');
  const owner1 = await registerUser('owner1@test.com', 'Alice Owner');
  const owner2 = await registerUser('owner2@test.com', 'Bob Owner');
  const viewer = await registerUser('viewer@test.com', 'Cara Viewer');
  const stranger = await registerUser('stranger@test.com', 'Dan Stranger');

  // ---- Room A: empty ------------------------------------------------------
  console.log('\n--- Room A (empty) ---');
  const roomA = await createRoom(
    owner1.token,
    'Acme Acquisition — Empty Room',
  );

  // ---- Room B: simple + name conflict --------------------------------------
  console.log('\n--- Room B (simple + name conflict) ---');
  const roomB = await createRoom(owner1.token, 'Acme Acquisition — Simple');
  await uploadFile(owner1.token, roomB.id, 'Cover Letter.txt');
  const contracts = await createFolder(owner1.token, 'Contracts', roomB.id);
  const nda1 = await uploadFile(
    owner1.token,
    roomB.id,
    'NDA.txt',
    contracts.id,
  );
  const nda2 = await uploadFile(
    owner1.token,
    roomB.id,
    'NDA.txt',
    contracts.id,
  );
  console.log(
    `    name-conflict check: "${nda1.name}" then "${nda2.name}" (expect the second to be auto-renamed)`,
  );

  // ---- Room C: deep structure + sharing ------------------------------------
  console.log('\n--- Room C (deep structure + sharing) ---');
  const roomC = await createRoom(
    owner1.token,
    'Acme Acquisition — Deep Structure',
  );
  const financials = await createFolder(owner1.token, 'Financials', roomC.id);
  await uploadFile(owner1.token, roomC.id, 'Financials Overview.txt', financials.id);
  const year2025 = await createFolder(
    owner1.token,
    '2025',
    roomC.id,
    financials.id,
  );
  await uploadFile(owner1.token, roomC.id, '2025 Summary.txt', year2025.id);
  const q4 = await createFolder(owner1.token, 'Q4', roomC.id, year2025.id);
  await uploadFile(owner1.token, roomC.id, 'Q4 Report.txt', q4.id);
  const termSheet = await uploadFile(owner1.token, roomC.id, 'Term Sheet.txt');

  await shareByEmail(owner1.token, 'FOLDER', year2025.id, 'viewer@test.com');
  await shareByEmail(owner1.token, 'FILE', termSheet.id, 'viewer@test.com');
  const publicShare = await createPublicLink(owner1.token, 'FOLDER', financials.id);

  // create-then-revoke, proving revocation doesn't error; Room A is
  // otherwise untouched since this happens before anyone looks at it.
  const tempShare = await shareByEmail(
    owner1.token,
    'ROOM',
    roomA.id,
    'viewer@test.com',
  );
  await revokeShare(owner1.token, tempShare.id);

  // ---- Bob's Room: unrelated, for isolation --------------------------------
  console.log("\n--- Bob's Room (isolation check) ---");
  const bobRoom = await createRoom(owner2.token, "Bob's Room");
  const bobFolder = await createFolder(owner2.token, 'Notes', bobRoom.id);
  await uploadFile(owner2.token, bobRoom.id, 'Bob File.txt', bobFolder.id);

  // ---- Verification (the actual smoke-test assertions) ---------------------
  console.log('\n--- Verification ---');
  const viewerShares = await step<
    { itemType: string; item: { name: string } }[]
  >('GET /shares/received as viewer', () =>
    http.get('/shares/received', { headers: authHeader(viewer.token) }),
  );
  console.log(
    `    viewer sees: ${viewerShares.map((s) => `${s.itemType} "${s.item.name}"`).join(', ')}`,
  );
  if (viewerShares.length !== 2) {
    throw new Error(
      `Expected viewer to have exactly 2 received shares, got ${viewerShares.length}`,
    );
  }

  const strangerShares = await step<unknown[]>(
    'GET /shares/received as stranger',
    () => http.get('/shares/received', { headers: authHeader(stranger.token) }),
  );
  if (strangerShares.length !== 0) {
    throw new Error(
      `Expected stranger to have 0 received shares, got ${strangerShares.length}`,
    );
  }

  const owner2Rooms = await step<{ name: string }[]>(
    'GET /data-rooms as owner2',
    () => http.get('/data-rooms', { headers: authHeader(owner2.token) }),
  );
  if (owner2Rooms.length !== 1 || owner2Rooms[0].name !== "Bob's Room") {
    throw new Error(
      `Expected owner2 to see exactly [Bob's Room], got ${JSON.stringify(owner2Rooms)}`,
    );
  }

  const owner1Rooms = await step<{ name: string }[]>(
    'GET /data-rooms as owner1',
    () => http.get('/data-rooms', { headers: authHeader(owner1.token) }),
  );
  if (owner1Rooms.length !== 3) {
    throw new Error(
      `Expected owner1 to see exactly 3 rooms, got ${owner1Rooms.length}`,
    );
  }

  // ---- Summary --------------------------------------------------------------
  const publicUrl = `${FRONTEND_URL}/public/${publicShare.publicToken}`;

  console.log('\n' + '='.repeat(78));
  console.log('SEED COMPLETE');
  console.log('='.repeat(78));

  console.log('\nAccounts (all password: TestPass123)');
  console.log('  owner1@test.com    Alice Owner    — primary account, browse everything below');
  console.log('  owner2@test.com    Bob Owner      — separate owner, for isolation check');
  console.log('  viewer@test.com    Cara Viewer    — receives shares from owner1');
  console.log('  stranger@test.com  Dan Stranger   — has zero access to anything');

  console.log('\nAs owner1@test.com, check these three rooms:');
  console.log(`  "${roomA.name}"`);
  console.log('    -> should show the empty-state UI (no folders, no files)');
  console.log(`  "${roomB.name}"`);
  console.log('    -> root: "Cover Letter.txt" file + "Contracts" folder');
  console.log(`    -> inside Contracts: "${nda1.name}" and "${nda2.name}"`);
  console.log('    -> confirms the server-side name-conflict " (1)" suffix');
  console.log(`  "${roomC.name}"`);
  console.log('    -> Financials > 2025 > Q4, one file at each level');
  console.log('    -> confirms breadcrumbs render correctly 3 levels deep');
  console.log('    -> also has a standalone root-level "Term Sheet.txt"');

  console.log('\nPublic link (open logged out, or in a private window):');
  console.log(`  ${publicUrl}`);
  console.log('    -> should show "Financials" (type: folder) with no login required');

  console.log('\nAs viewer@test.com, check "Shared with me" on /rooms:');
  console.log('  -> the "2025" folder — clicking it should navigate straight in and');
  console.log('     show "Q4" nested inside (inherited access, not directly shared)');
  console.log('  -> "Term Sheet.txt" as a standalone file row with just a Download action');
  console.log('  -> exactly these 2 entries, nothing else (no Room A leftover from the revoked share)');

  console.log('\nAs owner2@test.com, check /rooms:');
  console.log('  -> only "Bob\'s Room" under "My data rooms"');
  console.log('  -> "Shared with me" is empty');
  console.log('  -> none of owner1\'s Acme rooms are visible anywhere');

  console.log('\nAs stranger@test.com, check /rooms:');
  console.log('  -> "My data rooms" is empty');
  console.log('  -> "Shared with me" is empty');

  console.log('\n' + '='.repeat(78) + '\n');
}

main().catch((err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
