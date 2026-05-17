const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = __dirname;
const rooms = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return rooms.has(code) ? makeCode() : code;
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function cleanName(name, fallback) {
  return String(name || fallback).trim().slice(0, 24) || fallback;
}

function clamp(value, min, max) {
  const number = Number.parseInt(value, 10);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function findPlayer(room, token) {
  return room.players.find((player) => player.token === token);
}

function serializeRoom(room, token) {
  const player = findPlayer(room, token);
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    started: room.started,
    myRole: player?.seen ? player.role : null,
    players: room.players.map((roomPlayer) => ({
      id: roomPlayer.id,
      name: roomPlayer.name,
      seen: roomPlayer.seen,
      isHost: roomPlayer.id === room.hostId,
      isMe: roomPlayer.token === token,
    })),
  };
}

function roleListFor(room) {
  const playerCount = room.players.length;
  const mafia = clamp(room.roles.mafia, playerCount > 1 ? 1 : 0, playerCount);
  const detective = clamp(room.roles.detective, 0, Math.min(1, playerCount - mafia));
  const doctor = clamp(room.roles.doctor, 0, Math.min(1, playerCount - mafia - detective));
  return [
    ...Array(mafia).fill("Mafia"),
    ...Array(detective).fill("Detective"),
    ...Array(doctor).fill("Doctor"),
    ...Array(playerCount - mafia - detective - doctor).fill("Civilian"),
  ];
}

function serveStatic(request, response) {
  const requestedPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const filePath = requestedPath === "/"
    ? path.join(PUBLIC_DIR, "index.html")
    : path.join(PUBLIC_DIR, path.normalize(requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR) || path.basename(filePath) === "server.js") {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readBody(request);
      const maxPlayers = clamp(body.maxPlayers, 1, 10);
      const room = {
        code: makeCode(),
        maxPlayers,
        roles: {
          mafia: clamp(body.roles?.mafia, maxPlayers > 1 ? 1 : 0, maxPlayers),
          detective: clamp(body.roles?.detective, 0, 1),
          doctor: clamp(body.roles?.doctor, 0, 1),
        },
        players: [],
        hostId: "",
        started: false,
        createdAt: Date.now(),
      };
      const player = {
        id: crypto.randomUUID(),
        name: cleanName(body.hostName, "Host"),
        token: makeToken(),
        role: null,
        seen: false,
      };
      room.hostId = player.id;
      room.players.push(player);
      rooms.set(room.code, room);
      sendJson(response, 201, { code: room.code, token: player.token });
      return;
    }

    if (parts[0] === "api" && parts[1] === "rooms" && parts[2]) {
      const code = parts[2].toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        sendJson(response, 404, { error: "Room not found." });
        return;
      }

      if (request.method === "GET" && parts.length === 3) {
        const token = url.searchParams.get("token");
        if (!findPlayer(room, token)) {
          sendJson(response, 403, { error: "Join the room again to continue." });
          return;
        }
        sendJson(response, 200, serializeRoom(room, token));
        return;
      }

      if (request.method === "POST" && parts[3] === "join") {
        if (room.started) {
          sendJson(response, 409, { error: "This game has already started." });
          return;
        }
        if (room.players.length >= room.maxPlayers) {
          sendJson(response, 409, { error: "This room is full." });
          return;
        }
        const body = await readBody(request);
        const name = cleanName(body.name, "Player");
        if (room.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
          sendJson(response, 409, { error: "That name is already in this room." });
          return;
        }
        const player = {
          id: crypto.randomUUID(),
          name,
          token: makeToken(),
          role: null,
          seen: false,
        };
        room.players.push(player);
        sendJson(response, 201, { code: room.code, token: player.token });
        return;
      }

      const body = await readBody(request);
      const player = findPlayer(room, body.token);
      if (!player) {
        sendJson(response, 403, { error: "Join the room again to continue." });
        return;
      }

      if (request.method === "POST" && parts[3] === "start") {
        if (player.id !== room.hostId) {
          sendJson(response, 403, { error: "Only the host can start the game." });
          return;
        }
        const roles = shuffle(roleListFor(room));
        room.players.forEach((roomPlayer, index) => {
          roomPlayer.role = roles[index];
          roomPlayer.seen = false;
        });
        room.started = true;
        sendJson(response, 200, serializeRoom(room, player.token));
        return;
      }

      if (request.method === "POST" && parts[3] === "reset") {
        if (player.id !== room.hostId) {
          sendJson(response, 403, { error: "Only the host can reset the game." });
          return;
        }
        room.started = false;
        room.players.forEach((roomPlayer) => {
          roomPlayer.role = null;
          roomPlayer.seen = false;
        });
        sendJson(response, 200, serializeRoom(room, player.token));
        return;
      }

      if (request.method === "POST" && parts[3] === "reveal") {
        if (!room.started || !player.role) {
          sendJson(response, 409, { error: "The host has not started the game yet." });
          return;
        }
        player.seen = true;
        sendJson(response, 200, { role: player.role });
        return;
      }
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

setInterval(() => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [code, room] of rooms.entries()) {
    if (room.createdAt < oneDayAgo) {
      rooms.delete(code);
    }
  }
}, 60 * 60 * 1000);

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }
  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Chit Mafia Online running on http://localhost:${PORT}`);
});
