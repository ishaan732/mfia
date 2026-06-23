const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, ".data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const MAX_BODY_BYTES = 7 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_POSTS = 12;
const rateLimits = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(data));
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
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

async function ensureDataStore() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await fsp.access(POSTS_FILE);
  } catch {
    await fsp.writeFile(POSTS_FILE, "[]\n");
  }
}

async function readPosts() {
  await ensureDataStore();
  try {
    const contents = await fsp.readFile(POSTS_FILE, "utf8");
    const posts = JSON.parse(contents);
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

async function writePosts(posts) {
  await ensureDataStore();
  const tempFile = `${POSTS_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, `${JSON.stringify(posts, null, 2)}\n`);
  await fsp.rename(tempFile, POSTS_FILE);
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

function checkRateLimit(request) {
  const key = clientKey(request);
  const now = Date.now();
  const existing = rateLimits.get(key) || [];
  const recent = existing.filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_POSTS) {
    rateLimits.set(key, recent);
    return false;
  }
  recent.push(now);
  rateLimits.set(key, recent);
  return true;
}

function decodeImage(imageData) {
  const match = /^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=\s]+)$/i.exec(String(imageData || ""));
  if (!match) {
    throw new Error("Upload a PNG, JPG, or WebP image.");
  }

  const type = match[1].toLowerCase().replace("jpeg", "jpg");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 4 MB.");
  }

  return { buffer, extension: type === "jpg" ? "jpg" : type };
}

async function createPost(request, response) {
  if (!checkRateLimit(request)) {
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
    const author = cleanText(body.author, 60) || "LensLog Photographer";
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
      createdAt: Date.now(),
      ipHash: clientKey(request)
    };

    const posts = await readPosts();
    posts.unshift(post);
    await writePosts(posts.slice(0, 2000));
    sendJson(response, 201, { ok: true, post: publicPost(post) });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || "Could not publish this photo." });
  }
}

function safePath(root, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const cleanPath = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(root, `.${cleanPath}`);
  return resolved.startsWith(root) ? resolved : null;
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    const cacheControl = extension === ".html" ? "no-cache" : "public, max-age=3600";
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff"
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/health") {
    const posts = await readPosts();
    sendJson(response, 200, {
      ok: true,
      app: "LensLog",
      posts: posts.length,
      time: new Date().toISOString()
    });
    return;
  }

  if (requestUrl.pathname === "/api/posts" && request.method === "GET") {
    const posts = await readPosts();
    sendJson(response, 200, { ok: true, posts: posts.map(publicPost) });
    return;
  }

  if (requestUrl.pathname === "/api/posts" && request.method === "POST") {
    await createPost(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Allow": "GET, HEAD, POST" });
    response.end();
    return;
  }

  if (requestUrl.pathname.startsWith("/uploads/")) {
    const uploadPath = safePath(UPLOAD_DIR, requestUrl.pathname.replace(/^\/uploads/, ""));
    if (!uploadPath) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }
    sendFile(response, uploadPath);
    return;
  }

  const filePath = safePath(PUBLIC_DIR, requestUrl.pathname);
  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  sendFile(response, filePath);
});

ensureDataStore()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`LensLog running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Could not prepare data store:", error);
    process.exit(1);
  });
