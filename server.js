const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = __dirname;
const rooms = new Map();
const TIMER_SECONDS = {
  night: 45,
  vote: 60,
};
const TIMER_EXTENSION_SECONDS = 30;

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

function makeReconnectCode(room) {
  let code = "";
  do {
    code = String(crypto.randomInt(0, 100_000_000)).padStart(8, "0");
  } while (room.players.some((player) => player.reconnectCode === code));
  return code;
}

function cleanName(name, fallback) {
  return String(name || fallback).trim().slice(0, 24) || fallback;
}

function cleanReconnectCode(code) {
  return String(code || "").replace(/\D/g, "").slice(0, 8);
}

function cleanMessage(message) {
  return String(message || "").trim().replace(/\s+/g, " ").slice(0, 160);
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

function alivePlayers(room) {
  return room.players.filter((player) => player.alive);
}

function playerName(room, playerId) {
  return room.players.find((player) => player.id === playerId)?.name || "Nobody";
}

function phaseNameForLog(phase) {
  return {
    night: "night",
    day: "day",
    vote: "voting",
  }[phase] || "round";
}

function setPhaseTimer(room, phase) {
  const seconds = TIMER_SECONDS[phase] || 0;
  room.phaseDurationSeconds = seconds;
  room.phaseEndsAt = seconds ? Date.now() + seconds * 1000 : null;
}

function addSystemMessage(room, text) {
  if (!room.log) room.log = [];
  room.log.push({
    id: crypto.randomUUID(),
    name: "Game",
    text,
    createdAt: Date.now(),
  });
  room.log = room.log.slice(-80);
}

function addChatMessage(room, channel, player, text) {
  const collectionName = {
    room: "messages",
    mafia: "mafiaMessages",
    dead: "deadMessages",
  }[channel];

  if (!room[collectionName]) room[collectionName] = [];
  room[collectionName].push({
    id: crypto.randomUUID(),
    playerId: player.id,
    name: player.name,
    text,
    createdAt: Date.now(),
  });
  room[collectionName] = room[collectionName].slice(-80);
}

function newNightState() {
  return {
    mafiaTargetId: null,
    doctorTargetId: null,
    detectiveChecks: {},
  };
}

function clearRoundActions(room) {
  room.night = newNightState();
  room.votes = {};
}

function checkWinner(room) {
  const alive = alivePlayers(room);
  const mafiaCount = alive.filter((player) => player.role === "Mafia").length;
  const townCount = alive.length - mafiaCount;

  if (mafiaCount === 0) return "Civilians";
  if (mafiaCount >= townCount) return "Mafia";
  return null;
}

function endIfWon(room) {
  const winner = checkWinner(room);
  if (!winner) return false;

  room.phase = "ended";
  room.winner = winner;
  setPhaseTimer(room, "ended");
  addSystemMessage(room, `${winner} win the game.`);
  return true;
}

function requireHost(room, player) {
  if (player.id !== room.hostId) {
    throw new Error("Only the host can do that.");
  }
}

function requirePhase(room, phase) {
  if (room.phase !== phase) {
    throw new Error(`This action is only available during ${phase}.`);
  }
}

function livingTarget(room, targetId) {
  return room.players.find((player) => player.id === targetId && player.alive);
}

function serializeRoom(room, token) {
  const player = findPlayer(room, token);
  const myDetectiveCheck = player ? room.night?.detectiveChecks?.[player.id] : null;
  const mafiaTarget = room.night?.mafiaTargetId;
  const doctorTarget = room.night?.doctorTargetId;
  const canSeeMafiaChat = player?.role === "Mafia" && player.seen;
  const canUseMafiaChat = canSeeMafiaChat && player.alive && room.phase === "night";
  const canUseDeadChat = Boolean(room.started && player && !player.alive && room.phase !== "ended");

  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    started: room.started,
    phase: room.phase || (room.started ? "night" : "lobby"),
    round: room.round || 0,
    winner: room.winner || null,
    serverNow: Date.now(),
    phaseEndsAt: room.phaseEndsAt || null,
    phaseDurationSeconds: room.phaseDurationSeconds || 0,
    myRole: player?.seen ? player.role : null,
    myAlive: player?.alive ?? true,
    myReconnectCode: player?.reconnectCode || null,
    canUseMafiaChat,
    canUseDeadChat,
    myVoteTargetId: player ? room.votes?.[player.id] || null : null,
    myNightAction: player
      ? {
          mafiaSubmitted: player.role === "Mafia" ? Boolean(mafiaTarget) : false,
          doctorSubmitted: player.role === "Doctor" ? Boolean(doctorTarget) : false,
          detectiveResult: myDetectiveCheck
            ? {
                targetName: playerName(room, myDetectiveCheck.targetId),
                alignment: myDetectiveCheck.alignment,
              }
            : null,
        }
      : null,
    mafiaTeam: player?.role === "Mafia" && player.seen
      ? room.players
          .filter((roomPlayer) => roomPlayer.role === "Mafia")
          .map((roomPlayer) => roomPlayer.name)
      : [],
    players: room.players.map((roomPlayer) => ({
      id: roomPlayer.id,
      name: roomPlayer.name,
      seen: roomPlayer.seen,
      alive: roomPlayer.alive ?? true,
      role: room.phase === "ended" ? roomPlayer.role : null,
      isHost: roomPlayer.id === room.hostId,
      isMe: roomPlayer.token === token,
    })),
    messages: (room.messages || []).map((message) => ({
      id: message.id,
      name: message.name,
      text: message.text,
      createdAt: message.createdAt,
      isMe: message.playerId === player?.id,
    })),
    mafiaMessages: canUseMafiaChat
      ? (room.mafiaMessages || []).map((message) => ({
          id: message.id,
          name: message.name,
          text: message.text,
          createdAt: message.createdAt,
          isMe: message.playerId === player?.id,
        }))
      : [],
    deadMessages: canUseDeadChat
      ? (room.deadMessages || []).map((message) => ({
          id: message.id,
          name: message.name,
          text: message.text,
          createdAt: message.createdAt,
          isMe: message.playerId === player?.id,
        }))
      : [],
    gameLog: (room.log || []).map((entry) => ({
      id: entry.id,
      name: entry.name,
      text: entry.text,
      createdAt: entry.createdAt,
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
        messages: [],
        mafiaMessages: [],
        deadMessages: [],
        log: [],
        hostId: "",
        started: false,
        phase: "lobby",
        round: 0,
        winner: null,
        night: newNightState(),
        votes: {},
        phaseEndsAt: null,
        phaseDurationSeconds: 0,
        createdAt: Date.now(),
      };
      const player = {
        id: crypto.randomUUID(),
        name: cleanName(body.hostName, "Host"),
        token: makeToken(),
        reconnectCode: makeReconnectCode(room),
        role: null,
        seen: false,
        alive: true,
      };
      room.hostId = player.id;
      room.players.push(player);
      addSystemMessage(room, `${player.name} created the room.`);
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
        const body = await readBody(request);
        const name = cleanName(body.name, "Player");
        const reconnectCode = cleanReconnectCode(body.reconnectCode);
        if (reconnectCode) {
          const reconnectingPlayer = room.players.find(
            (roomPlayer) =>
              roomPlayer.name.toLowerCase() === name.toLowerCase() &&
              roomPlayer.reconnectCode === reconnectCode,
          );
          if (!reconnectingPlayer) {
            sendJson(response, 403, { error: "No player in this room matches that name and reconnect code." });
            return;
          }
          addSystemMessage(room, `${reconnectingPlayer.name} reconnected.`);
          sendJson(response, 200, { code: room.code, token: reconnectingPlayer.token });
          return;
        }
        if (room.started) {
          sendJson(response, 409, { error: "This game has already started. Enter your reconnect code to get back in." });
          return;
        }
        if (room.players.length >= room.maxPlayers) {
          sendJson(response, 409, { error: "This room is full." });
          return;
        }
        if (room.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
          sendJson(response, 409, { error: "That name is already in this room. Enter their reconnect code to rejoin." });
          return;
        }
        const player = {
          id: crypto.randomUUID(),
          name,
          token: makeToken(),
          reconnectCode: makeReconnectCode(room),
          role: null,
          seen: false,
          alive: true,
        };
        room.players.push(player);
        addSystemMessage(room, `${player.name} joined the room.`);
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
          roomPlayer.alive = true;
        });
        room.started = true;
        room.phase = "night";
        room.round = 1;
        room.winner = null;
        room.mafiaMessages = [];
        room.deadMessages = [];
        room.log = [];
        clearRoundActions(room);
        setPhaseTimer(room, "night");
        addSystemMessage(room, "Round 1 night has begun. Mafia, Detective, and Doctor can act.");
        sendJson(response, 200, serializeRoom(room, player.token));
        return;
      }

      if (request.method === "POST" && parts[3] === "reset") {
        if (player.id !== room.hostId) {
          sendJson(response, 403, { error: "Only the host can reset the game." });
          return;
        }
        room.started = false;
        room.phase = "lobby";
        room.round = 0;
        room.winner = null;
        setPhaseTimer(room, "lobby");
        clearRoundActions(room);
        room.players.forEach((roomPlayer) => {
          roomPlayer.role = null;
          roomPlayer.seen = false;
          roomPlayer.alive = true;
        });
        room.messages = [];
        room.mafiaMessages = [];
        room.deadMessages = [];
        room.log = [];
        addSystemMessage(room, "The game was reset. Waiting for a new start.");
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

      if (request.method === "POST" && parts[3] === "night-action") {
        if (room.phase !== "night") {
          sendJson(response, 409, { error: "Night actions are only available at night." });
          return;
        }
        if (!player.alive) {
          sendJson(response, 409, { error: "Eliminated players cannot act." });
          return;
        }
        if (!player.seen) {
          sendJson(response, 409, { error: "Reveal your chit before taking a role action." });
          return;
        }

        const target = livingTarget(room, body.targetId);
        if (!target) {
          sendJson(response, 400, { error: "Choose a living player." });
          return;
        }
        if (!room.night) room.night = newNightState();

        if (player.role === "Mafia") {
          if (target.role === "Mafia") {
            sendJson(response, 400, { error: "Mafia must choose a non-Mafia target." });
            return;
          }
          room.night.mafiaTargetId = target.id;
          addSystemMessage(room, "Mafia have chosen their target.");
          sendJson(response, 200, serializeRoom(room, player.token));
          return;
        }

        if (player.role === "Detective") {
          room.night.detectiveChecks[player.id] = {
            targetId: target.id,
            alignment: target.role === "Mafia" ? "Mafia" : "Not Mafia",
          };
          sendJson(response, 200, serializeRoom(room, player.token));
          return;
        }

        if (player.role === "Doctor") {
          room.night.doctorTargetId = target.id;
          addSystemMessage(room, "Doctor has protected someone.");
          sendJson(response, 200, serializeRoom(room, player.token));
          return;
        }

        sendJson(response, 400, { error: "Your role does not have a night action." });
        return;
      }

      if (request.method === "POST" && parts[3] === "resolve-night") {
        if (player.id !== room.hostId) {
          sendJson(response, 403, { error: "Only the host can resolve the night." });
          return;
        }
        if (room.phase !== "night") {
          sendJson(response, 409, { error: "The game is not in the night phase." });
          return;
        }

        const target = livingTarget(room, room.night?.mafiaTargetId);
        const protectedId = room.night?.doctorTargetId;
        if (target && target.id !== protectedId) {
          target.alive = false;
          addSystemMessage(room, `${target.name} was eliminated during the night.`);
        } else if (target && target.id === protectedId) {
          addSystemMessage(room, "Nobody was eliminated. The Doctor protected the target.");
        } else {
          addSystemMessage(room, "Nobody was eliminated during the night.");
        }

        if (!endIfWon(room)) {
          room.phase = "vote";
          room.votes = {};
          setPhaseTimer(room, "vote");
          addSystemMessage(room, "Voting has started. Discuss quickly, then alive players should vote.");
        }
        sendJson(response, 200, serializeRoom(room, player.token));
        return;
      }

      if (request.method === "POST" && parts[3] === "start-vote") {
        if (player.id !== room.hostId) {
          sendJson(response, 403, { error: "Only the host can start voting." });
          return;
        }
        if (room.phase !== "day") {
          sendJson(response, 409, { error: "Voting can only start during the day." });
          return;
        }
        room.phase = "vote";
        room.votes = {};
        setPhaseTimer(room, "vote");
        addSystemMessage(room, "Voting has started. Alive players should vote for one suspect.");
        sendJson(response, 200, serializeRoom(room, player.token));
        return;
      }

      if (request.method === "POST" && parts[3] === "extend-timer") {
        if (player.id !== room.hostId) {
          sendJson(response, 403, { error: "Only the host can extend the timer." });
          return;
        }
        if (!room.started || room.phase === "lobby" || room.phase === "ended") {
          sendJson(response, 409, { error: "There is no active timer to extend." });
          return;
        }
        const baseTime = Math.max(Date.now(), room.phaseEndsAt || Date.now());
        room.phaseEndsAt = baseTime + TIMER_EXTENSION_SECONDS * 1000;
        room.phaseDurationSeconds = Math.ceil((room.phaseEndsAt - Date.now()) / 1000);
        addSystemMessage(room, `The host added ${TIMER_EXTENSION_SECONDS} seconds to the ${phaseNameForLog(room.phase)} timer.`);
        sendJson(response, 200, serializeRoom(room, player.token));
        return;
      }

      if (request.method === "POST" && parts[3] === "vote") {
        if (room.phase !== "vote") {
          sendJson(response, 409, { error: "Voting is not open right now." });
          return;
        }
        if (!player.alive) {
          sendJson(response, 409, { error: "Eliminated players cannot vote." });
          return;
        }
        const target = livingTarget(room, body.targetId);
        if (!target) {
          sendJson(response, 400, { error: "Choose a living player." });
          return;
        }
        if (target.id === player.id) {
          sendJson(response, 400, { error: "You cannot vote for yourself." });
          return;
        }
        if (!room.votes) room.votes = {};
        room.votes[player.id] = target.id;
        sendJson(response, 200, serializeRoom(room, player.token));
        return;
      }

      if (request.method === "POST" && parts[3] === "resolve-vote") {
        if (player.id !== room.hostId) {
          sendJson(response, 403, { error: "Only the host can resolve voting." });
          return;
        }
        if (room.phase !== "vote") {
          sendJson(response, 409, { error: "The game is not in the voting phase." });
          return;
        }

        const tallies = new Map();
        for (const voter of alivePlayers(room)) {
          const targetId = room.votes?.[voter.id];
          if (livingTarget(room, targetId)) {
            tallies.set(targetId, (tallies.get(targetId) || 0) + 1);
          }
        }

        const ranked = [...tallies.entries()].sort((left, right) => right[1] - left[1]);
        if (ranked.length === 0) {
          addSystemMessage(room, "No valid votes were cast. Nobody was eliminated.");
        } else if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
          addSystemMessage(room, "The vote was tied. Nobody was eliminated.");
        } else {
          const eliminated = livingTarget(room, ranked[0][0]);
          eliminated.alive = false;
          addSystemMessage(room, `${eliminated.name} was voted out with ${ranked[0][1]} vote(s).`);
        }

        if (!endIfWon(room)) {
          room.round = (room.round || 1) + 1;
          room.phase = "night";
          clearRoundActions(room);
          setPhaseTimer(room, "night");
          addSystemMessage(room, `Round ${room.round} night has begun.`);
        }
        sendJson(response, 200, serializeRoom(room, player.token));
        return;
      }

      if (request.method === "POST" && parts[3] === "messages") {
        const text = cleanMessage(body.message);
        if (!text) {
          sendJson(response, 400, { error: "Message cannot be empty." });
          return;
        }
        const channel = ["room", "mafia", "dead"].includes(body.channel) ? body.channel : "room";
        if (channel === "mafia") {
          if (player.role !== "Mafia" || !player.seen) {
            sendJson(response, 403, { error: "Only revealed Mafia can use Mafia chat." });
            return;
          }
          if (!player.alive || room.phase !== "night") {
            sendJson(response, 409, { error: "Mafia chat is only open to living Mafia at night." });
            return;
          }
        } else if (channel === "dead") {
          if (!room.started || player.alive || room.phase === "ended") {
            sendJson(response, 403, { error: "Dead chat is only for eliminated players during the game." });
            return;
          }
        } else if (room.started && !player.alive && room.phase !== "ended") {
          sendJson(response, 403, { error: "Eliminated players can read the room, but they chat in Dead Chat." });
          return;
        }
        addChatMessage(room, channel, player, text);
        sendJson(response, 201, serializeRoom(room, player.token));
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
