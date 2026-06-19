const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const cleanPath = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(PUBLIC_DIR, `.${cleanPath}`);
  return resolved.startsWith(PUBLIC_DIR) ? resolved : null;
}

function sendFile(request, response, filePath) {
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

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      app: "LensLog",
      time: new Date().toISOString()
    });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Allow": "GET, HEAD" });
    response.end();
    return;
  }

  const filePath = safePath(requestUrl.pathname);
  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  sendFile(request, response, filePath);
});

server.listen(PORT, () => {
  console.log(`LensLog running on http://localhost:${PORT}`);
});
