const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const configuredPort = Number(process.env.PORT);
const PORT = Number.isFinite(configuredPort) ? configuredPort : 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, ".data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
const PASSES_FILE = path.join(DATA_DIR, "passes.json");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const OWNER_CODE = process.env.OWNER_CODE || "ishaan";
const AUTO_HIDE_REPORT_COUNT = Number(process.env.AUTO_HIDE_REPORT_COUNT) || 5;
const MAX_ADMIN_PASSES = 100;
const MAX_BODY_BYTES = 7 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_POSTS = 12;
const RATE_LIMIT_MAX_REPORTS = 30;
const postRateLimits = new Map();
const reportRateLimits = new Map();
let postsQueue = Promise.resolve();
let reportsQueue = Promise.resolve();
let passesQueue = Promise.resolve();

const ROLE_DEFINITIONS = {
  owner: {
    label: "Owner",
    permissions: ["viewAdmin", "moderatePosts", "managePasses"]
  },
  admin: {
    label: "Admin",
    permissions: ["viewAdmin", "moderatePosts"]
  }
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
    ...extra
  };
}

function sendJson(response, status, data) {
  response.writeHead(
    status,
    securityHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    })
  );
  response.end(JSON.stringify(data));
}

function sendText(response, status, message) {
  response.writeHead(
    status,
    securityHeaders({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    })
  );
  response.end(message);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanAuthor(value) {
  const author = cleanText(value, 60);
  return author && !author.includes("@") ? author : "LensLog Photographer";
}

function cleanEmail(value) {
  const email = cleanText(value, 120).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function publicPost(post) {
  return {
    id: post.id,
    title: post.title,
    location: post.location,
    camera: post.camera,
    lens: post.lens,
    iso: post.iso,
    aperture: post.aperture,
    shutter: post.shutter,
    category: post.category,
    story: post.story,
    author: post.author,
    image: post.image,
    likes: post.likes || 0,
    createdAt: post.createdAt
  };
}

function adminPost(post) {
  return {
    ...publicPost(post),
    authorEmail: post.authorEmail || "",
    reports: post.reports || 0,
    hidden: Boolean(post.hidden),
    hiddenReason: post.hiddenReason || "",
    reportedAt: post.reportedAt || null,
    deletedAt: post.deletedAt || null
  };
}

function roleDetails(role) {
  return ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.admin;
}

function publicAccess(access) {
  const details = roleDetails(access.role);
  return {
    id: access.id || "owner",
    label: access.label || details.label,
    email: access.email || "",
    role: access.role,
    roleLabel: details.label,
    permissions: details.permissions
  };
}

function publicPass(pass) {
  const details = roleDetails(pass.role);
  return {
    id: pass.id,
    number: pass.number || null,
    label: pass.label,
    email: pass.email || "",
    role: pass.role,
    roleLabel: details.label,
    permissions: details.permissions,
    createdAt: pass.createdAt,
    createdBy: pass.createdBy || "",
    revokedAt: pass.revokedAt || null,
    revokedBy: pass.revokedBy || "",
    lastUsedAt: pass.lastUsedAt || null
  };
}

function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

function safeEqual(value, expected) {
  const left = Buffer.from(String(value || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function generatePassCode() {
  const groups = crypto.randomBytes(9).toString("hex").match(/.{1,3}/g) || [];
  return groups.join("-").toUpperCase();
}

function hasPermission(access, permission) {
  return Boolean(access && roleDetails(access.role).permissions.includes(permission));
}

function canManagePasses(access) {
  return Boolean(access && access.role === "owner");
}

function isUsableStoredPass(pass) {
  return pass && pass.role === "admin" && !pass.revokedAt;
}

function nextAdminPassNumber(passes) {
  const activeNumbers = new Set(
    passes
      .filter(isUsableStoredPass)
      .map((pass) => Number(pass.number))
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= MAX_ADMIN_PASSES)
  );

  for (let number = 1; number <= MAX_ADMIN_PASSES; number += 1) {
    if (!activeNumbers.has(number)) return number;
  }

  return 0;
}

function visiblePosts(posts) {
  return posts.filter((post) => !post.hidden && !post.deletedAt);
}

async function ensureDataStore() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  await ensureJsonArrayFile(POSTS_FILE);
  await ensureJsonArrayFile(REPORTS_FILE);
  await ensureJsonArrayFile(PASSES_FILE);
}

async function ensureJsonArrayFile(filePath) {
  try {
    await fsp.access(filePath);
  } catch {
    await fsp.writeFile(filePath, "[]\n");
  }
}

async function readJsonArray(filePath) {
  await ensureDataStore();
  try {
    const contents = await fsp.readFile(filePath, "utf8");
    const items = JSON.parse(contents);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function writeJsonArray(filePath, items) {
  await ensureDataStore();
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tempFile, `${JSON.stringify(items, null, 2)}\n`);
  await fsp.rename(tempFile, filePath);
}

async function readPosts() {
  return readJsonArray(POSTS_FILE);
}

async function writePosts(posts) {
  await writeJsonArray(POSTS_FILE, posts);
}

async function readReports() {
  return readJsonArray(REPORTS_FILE);
}

async function writeReports(reports) {
  await writeJsonArray(REPORTS_FILE, reports);
}

async function readPasses() {
  return readJsonArray(PASSES_FILE);
}

async function writePasses(passes) {
  await writeJsonArray(PASSES_FILE, passes);
}

function withPostsLock(task) {
  const run = postsQueue.then(task, task);
  postsQueue = run.catch(() => {});
  return run;
}

function withReportsLock(task) {
  const run = reportsQueue.then(task, task);
  reportsQueue = run.catch(() => {});
  return run;
}

function withPassesLock(task) {
  const run = passesQueue.then(task, task);
  passesQueue = run.catch(() => {});
  return run;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function clientKey(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const address = forwarded || request.socket.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(address).digest("hex");
}

function checkRateLimit(store, request, maxRequests) {
  const key = clientKey(request);
  const now = Date.now();
  const existing = store.get(key) || [];
  const recent = existing.filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= maxRequests) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  return true;
}

function detectImageExtension(buffer) {
  if (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }

  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }

  return "";
}

function decodeImage(imageData) {
  const match = /^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=\s]+)$/i.exec(String(imageData || ""));
  if (!match) {
    throw new Error("Upload a PNG, JPG, or WebP image.");
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 4 MB.");
  }

  const extension = detectImageExtension(buffer);
  if (!extension) {
    throw new Error("That image file could not be verified. Try a JPG, PNG, or WebP.");
  }

  return { buffer, extension };
}

async function createPost(request, response) {
  if (!checkRateLimit(postRateLimits, request, RATE_LIMIT_MAX_POSTS)) {
    sendJson(response, 429, { ok: false, error: "Too many submissions. Please try again later." });
    return;
  }

  try {
    const body = await readBody(request);
    if (cleanText(body.website, 120)) {
      sendJson(response, 400, { ok: false, error: "Submission blocked." });
      return;
    }

    const title = cleanText(body.title, 80);
    const location = cleanText(body.location, 80);
    const camera = cleanText(body.camera, 80);
    const lens = cleanText(body.lens, 80);
    const iso = cleanText(body.iso, 20);
    const aperture = cleanText(body.aperture, 20);
    const shutter = cleanText(body.shutter, 20);
    const category = cleanText(body.category, 30) || "Photo";
    const story = cleanText(body.story, 360);
    const author = cleanAuthor(body.author);
    const authorEmail = cleanEmail(body.authorEmail);
    const consent = body.consent === true;

    if (!consent) throw new Error("Confirm that this photo can be shared publicly.");
    if (!title || !location || !camera || !lens || !iso || !aperture || !shutter) {
      throw new Error("Fill in every required camera setting.");
    }

    const image = decodeImage(body.imageData);
    const id = makeId();
    const filename = `${id}.${image.extension}`;
    await ensureDataStore();
    await fsp.writeFile(path.join(UPLOAD_DIR, filename), image.buffer);

    const post = {
      id,
      title,
      location,
      camera,
      lens,
      iso,
      aperture,
      shutter,
      category,
      story,
      author,
      authorEmail,
      image: `/uploads/${filename}`,
      likes: 0,
      reports: 0,
      hidden: false,
      createdAt: Date.now(),
      ipHash: clientKey(request)
    };

    await withPostsLock(async () => {
      const posts = await readPosts();
      posts.unshift(post);
      await writePosts(posts.slice(0, 2000));
    });

    sendJson(response, 201, { ok: true, post: publicPost(post) });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || "Could not publish this photo." });
  }
}

async function reportPost(request, response) {
  if (!checkRateLimit(reportRateLimits, request, RATE_LIMIT_MAX_REPORTS)) {
    sendJson(response, 429, { ok: false, error: "Too many reports. Please try again later." });
    return;
  }

  try {
    const body = await readBody(request);
    if (cleanText(body.website, 120)) {
      sendJson(response, 400, { ok: false, error: "Report blocked." });
      return;
    }

    const postId = cleanText(body.postId, 100);
    const reason = cleanText(body.reason, 160) || "Needs review";
    if (!postId) throw new Error("Photo not found.");

    const reporterHash = clientKey(request);
    let reportCount = 0;
    let hidden = false;
    let logged = false;

    await withPostsLock(async () => {
      const posts = await readPosts();
      const post = posts.find((item) => item.id === postId && !item.deletedAt);
      if (!post) throw new Error("Photo not found.");

      const reportHashes = Array.isArray(post.reportHashes) ? post.reportHashes : [];
      if (!reportHashes.includes(reporterHash)) {
        post.reportHashes = [...reportHashes, reporterHash].slice(-100);
        post.reports = (post.reports || 0) + 1;
        post.reportedAt = Date.now();
        if (post.reports >= AUTO_HIDE_REPORT_COUNT) {
          post.hidden = true;
          post.hiddenReason = "Reported by the community";
        }
        await writePosts(posts);
        logged = true;
      }

      reportCount = post.reports || 0;
      hidden = Boolean(post.hidden);
    });

    if (logged) {
      await withReportsLock(async () => {
        const reports = await readReports();
        reports.unshift({
          id: makeId(),
          postId,
          reason,
          createdAt: Date.now(),
          reporterHash
        });
        await writeReports(reports.slice(0, 2000));
      });
    }

    sendJson(response, 200, { ok: true, reports: reportCount, hidden });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || "Could not report this photo." });
  }
}

function getAdminToken(requestUrl, request) {
  const passHeader = request.headers["x-admin-pass"];
  const header = request.headers["x-admin-token"];
  const authorization = String(request.headers.authorization || "");
  if (passHeader) return String(passHeader);
  if (header) return String(header);
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);
  if (requestUrl.searchParams.has("pass")) return requestUrl.searchParams.get("pass") || "";
  return requestUrl.searchParams.get("token") || "";
}

async function authenticateSecret(secret, options = {}) {
  const value = String(secret || "").trim();
  if (!value) return null;

  const ownerCodes = [OWNER_CODE, ADMIN_TOKEN].filter(Boolean);
  const isOwnerCode = ownerCodes.some((code) => safeEqual(hashSecret(value), hashSecret(code)));
  if (isOwnerCode) {
    return {
      id: "owner",
      label: "Site Owner",
      email: "",
      role: "owner",
      source: "environment"
    };
  }

  const codeHash = hashSecret(value);
  let access = null;

  await withPassesLock(async () => {
    const passes = await readPasses();
    const pass = passes.find((item) => item.codeHash === codeHash && isUsableStoredPass(item));
    if (!pass) return;

    if (options.touch) {
      pass.lastUsedAt = Date.now();
      await writePasses(passes);
    }

    access = {
      id: pass.id,
      label: pass.label,
      email: pass.email || "",
      role: pass.role,
      source: "pass"
    };
  });

  return access;
}

async function authenticateAdmin(requestUrl, request) {
  return authenticateSecret(getAdminToken(requestUrl, request));
}

async function requireAdmin(requestUrl, request, response, permission) {
  const access = await authenticateAdmin(requestUrl, request);
  if (!access || (permission && !hasPermission(access, permission))) {
    sendJson(response, 403, { ok: false, error: "Admin access denied." });
    return null;
  }
  return access;
}

async function listAdminPosts(requestUrl, request, response) {
  const access = await requireAdmin(requestUrl, request, response, "viewAdmin");
  if (!access) return;
  const posts = await readPosts();
  sendJson(response, 200, { ok: true, access: publicAccess(access), posts: posts.map(adminPost) });
}

async function updateAdminPost(requestUrl, request, response, postId) {
  const access = await requireAdmin(requestUrl, request, response, "moderatePosts");
  if (!access) return;

  try {
    const body = request.method === "PATCH" ? await readBody(request) : {};
    let updatedPost = null;
    let uploadToRemove = "";

    await withPostsLock(async () => {
      const posts = await readPosts();
      const post = posts.find((item) => item.id === postId);
      if (!post) throw new Error("Photo not found.");

      if (request.method === "DELETE") {
        post.hidden = true;
        post.deletedAt = Date.now();
        post.hiddenReason = `Removed by ${access.label}`;
        uploadToRemove = post.image;
      } else {
        post.hidden = Boolean(body.hidden);
        post.hiddenReason = post.hidden ? cleanText(body.hiddenReason, 120) || `Hidden by ${access.label}` : "";
        if (body.deletedAt === null) post.deletedAt = null;
      }

      updatedPost = adminPost(post);
      await writePosts(posts);
    });

    if (uploadToRemove) {
      const uploadPath = safePath(UPLOAD_DIR, uploadToRemove.replace(/^\/uploads/, ""));
      if (uploadPath) await fsp.unlink(uploadPath).catch(() => {});
    }

    sendJson(response, 200, { ok: true, post: updatedPost });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || "Could not update this photo." });
  }
}

async function createAdminSession(request, response) {
  try {
    const body = await readBody(request);
    const access = await authenticateSecret(body.passCode, { touch: true });
    if (!access) {
      sendJson(response, 403, { ok: false, error: "That pass is not allowed." });
      return;
    }

    sendJson(response, 200, { ok: true, access: publicAccess(access) });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || "Could not check that pass." });
  }
}

async function listAdminPasses(requestUrl, request, response) {
  const access = await requireAdmin(requestUrl, request, response, "managePasses");
  if (!access) return;
  if (!canManagePasses(access)) {
    sendJson(response, 403, { ok: false, error: "Only the owner can manage admin passes." });
    return;
  }
  const passes = await readPasses();
  sendJson(response, 200, { ok: true, access: publicAccess(access), passes: passes.map(publicPass) });
}

async function createAdminPass(requestUrl, request, response) {
  const access = await requireAdmin(requestUrl, request, response, "managePasses");
  if (!access) return;
  if (!canManagePasses(access)) {
    sendJson(response, 403, { ok: false, error: "Only the owner can give admin passes." });
    return;
  }

  try {
    const body = await readBody(request);
    const role = "admin";
    const label = cleanText(body.label, 80);
    const email = cleanEmail(body.email);

    if (!label) throw new Error("Add a name for this pass.");

    let code = "";
    let pass = null;

    await withPassesLock(async () => {
      const passes = await readPasses();
      const number = nextAdminPassNumber(passes);
      if (!number) throw new Error("All 100 admin pass slots are used. Revoke one before creating another.");

      code = `ADMIN-${String(number).padStart(3, "0")}-${generatePassCode()}`;
      pass = {
        id: makeId(),
        number,
        label,
        email,
        role,
        codeHash: hashSecret(code),
        createdAt: Date.now(),
        createdBy: access.label,
        revokedAt: null,
        lastUsedAt: null
      };
      passes.unshift(pass);
      await writePasses(passes.slice(0, 500));
    });

    sendJson(response, 201, { ok: true, pass: publicPass(pass), code });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || "Could not create this pass." });
  }
}

async function revokeAdminPass(requestUrl, request, response, passId) {
  const access = await requireAdmin(requestUrl, request, response, "managePasses");
  if (!access) return;
  if (!canManagePasses(access)) {
    sendJson(response, 403, { ok: false, error: "Only the owner can revoke admin passes." });
    return;
  }

  try {
    let revokedPass = null;

    await withPassesLock(async () => {
      const passes = await readPasses();
      const pass = passes.find((item) => item.id === passId);
      if (!pass) throw new Error("Pass not found.");
      if (pass.id === access.id) throw new Error("You cannot revoke the pass you are using.");

      pass.revokedAt = pass.revokedAt || Date.now();
      pass.revokedBy = access.label;
      revokedPass = publicPass(pass);
      await writePasses(passes);
    });

    sendJson(response, 200, { ok: true, pass: revokedPass });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || "Could not revoke this pass." });
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safePath(root, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const cleanPath = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(root, `.${cleanPath}`);
  return isInside(root, resolved) ? resolved : null;
}

function sendFile(request, response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath);
    const cacheControl = extension === ".html" ? "no-cache" : "public, max-age=3600";
    response.writeHead(
      200,
      securityHeaders({
        "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
        "Cache-Control": cacheControl
      })
    );
    response.end(request.method === "HEAD" ? undefined : data);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/health") {
    const posts = await readPosts();
    sendJson(response, 200, {
      ok: true,
      app: "LensLog",
      posts: visiblePosts(posts).length,
      storage: DATA_DIR,
      time: new Date().toISOString()
    });
    return;
  }

  if (requestUrl.pathname === "/api/posts" && request.method === "GET") {
    const posts = await readPosts();
    sendJson(response, 200, { ok: true, posts: visiblePosts(posts).map(publicPost) });
    return;
  }

  if (requestUrl.pathname === "/api/posts" && request.method === "POST") {
    await createPost(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/reports" && request.method === "POST") {
    await reportPost(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/admin/session" && request.method === "POST") {
    await createAdminSession(request, response);
    return;
  }

  if (requestUrl.pathname === "/api/admin/posts" && request.method === "GET") {
    await listAdminPosts(requestUrl, request, response);
    return;
  }

  if (requestUrl.pathname === "/api/admin/passes" && request.method === "GET") {
    await listAdminPasses(requestUrl, request, response);
    return;
  }

  if (requestUrl.pathname === "/api/admin/passes" && request.method === "POST") {
    await createAdminPass(requestUrl, request, response);
    return;
  }

  const adminPassMatch = /^\/api\/admin\/passes\/([^/]+)$/.exec(requestUrl.pathname);
  if (adminPassMatch && request.method === "DELETE") {
    await revokeAdminPass(requestUrl, request, response, adminPassMatch[1]);
    return;
  }

  const adminPostMatch = /^\/api\/admin\/posts\/([^/]+)$/.exec(requestUrl.pathname);
  if (adminPostMatch && (request.method === "PATCH" || request.method === "DELETE")) {
    await updateAdminPost(requestUrl, request, response, adminPostMatch[1]);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, securityHeaders({ Allow: "GET, HEAD, POST, PATCH, DELETE" }));
    response.end();
    return;
  }

  if (requestUrl.pathname.startsWith("/uploads/")) {
    const uploadPath = safePath(UPLOAD_DIR, requestUrl.pathname.replace(/^\/uploads/, ""));
    if (!uploadPath) {
      sendText(response, 403, "Forbidden");
      return;
    }
    sendFile(request, response, uploadPath);
    return;
  }

  const filePath = safePath(PUBLIC_DIR, requestUrl.pathname);
  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  sendFile(request, response, filePath);
});

ensureDataStore()
  .then(() => {
    server.listen(PORT, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : PORT;
      console.log(`LensLog running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Could not prepare data store:", error);
    process.exit(1);
  });
