const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const ROOT_DIR = path.resolve(__dirname, "..");
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

let dataDir;
let port;
let serverProcess;

async function api(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: {
      "Accept": "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : {}
  };
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const response = await api("/api/health");
      if (response.status === 200 && response.body.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw new Error("Server did not start.");
}

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "lenslog-api-"));
  port = 33000 + Math.floor(Math.random() * 1000);
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ADMIN_TOKEN: "test-admin",
      AUTO_HIDE_REPORT_COUNT: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer();
});

after(async () => {
  if (serverProcess) serverProcess.kill();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test("photo submissions are published, reported, and removable", async () => {
  const emptyFeed = await api("/api/posts");
  assert.equal(emptyFeed.status, 200);
  assert.deepEqual(emptyFeed.body.posts, []);

  const invalidPost = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({ title: "Missing settings" })
  });
  assert.equal(invalidPost.status, 400);
  assert.match(invalidPost.body.error, /Confirm/);

  const created = await api("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      title: "Test frame",
      location: "Mumbai, India",
      camera: "Sony A7 IV",
      lens: "35mm f/1.8",
      iso: "400",
      aperture: "f/2.8",
      shutter: "1/250s",
      category: "Street",
      story: "A test frame for the shared feed.",
      author: "Test Photographer",
      authorEmail: "test@gmail.com",
      imageData: PNG_1X1,
      consent: true,
      website: ""
    })
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.post.title, "Test frame");
  assert.equal(created.body.post.author, "Test Photographer");
  assert.ok(created.body.post.image.startsWith("/uploads/"));

  const visibleFeed = await api("/api/posts");
  assert.equal(visibleFeed.status, 200);
  assert.equal(visibleFeed.body.posts.length, 1);
  assert.equal(visibleFeed.body.posts[0].id, created.body.post.id);

  const report = await api("/api/reports", {
    method: "POST",
    body: JSON.stringify({
      postId: created.body.post.id,
      reason: "Test report",
      website: ""
    })
  });
  assert.equal(report.status, 200);
  assert.equal(report.body.hidden, true);

  const hiddenFeed = await api("/api/posts");
  assert.equal(hiddenFeed.status, 200);
  assert.equal(hiddenFeed.body.posts.length, 0);

  const adminList = await api("/api/admin/posts", {
    headers: { "X-Admin-Token": "test-admin" }
  });
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body.access.role, "owner");
  assert.equal(adminList.body.posts[0].hidden, true);
  assert.equal(adminList.body.posts[0].reports, 1);

  const ownerSession = await api("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ passCode: "test-admin" })
  });
  assert.equal(ownerSession.status, 200);
  assert.equal(ownerSession.body.access.role, "owner");

  const moderatorPass = await api("/api/admin/passes", {
    method: "POST",
    headers: { "X-Admin-Pass": "test-admin" },
    body: JSON.stringify({
      label: "Test Moderator",
      email: "mod@gmail.com",
      role: "moderator"
    })
  });
  assert.equal(moderatorPass.status, 201);
  assert.equal(moderatorPass.body.pass.role, "moderator");
  assert.match(moderatorPass.body.code, /^LL-[a-f0-9]{4}/);

  const moderatorList = await api("/api/admin/posts", {
    headers: { "X-Admin-Pass": moderatorPass.body.code }
  });
  assert.equal(moderatorList.status, 200);
  assert.equal(moderatorList.body.access.role, "moderator");
  assert.equal(moderatorList.body.posts.length, 1);

  const deniedPassList = await api("/api/admin/passes", {
    headers: { "X-Admin-Pass": moderatorPass.body.code }
  });
  assert.equal(deniedPassList.status, 403);

  const revokedPass = await api(`/api/admin/passes/${moderatorPass.body.pass.id}`, {
    method: "DELETE",
    headers: { "X-Admin-Pass": "test-admin" }
  });
  assert.equal(revokedPass.status, 200);
  assert.equal(revokedPass.body.pass.revokedAt > 0, true);

  const revokedCannotEnter = await api("/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ passCode: moderatorPass.body.code })
  });
  assert.equal(revokedCannotEnter.status, 403);

  const removed = await api(`/api/admin/posts/${created.body.post.id}`, {
    method: "DELETE",
    headers: { "X-Admin-Token": "test-admin" }
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.post.deletedAt > 0, true);
});
