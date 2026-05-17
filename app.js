const homePanel = document.querySelector("#homePanel");
const gamePanel = document.querySelector("#gamePanel");
const createForm = document.querySelector("#createForm");
const joinForm = document.querySelector("#joinForm");
const hostNameInput = document.querySelector("#hostName");
const joinNameInput = document.querySelector("#joinName");
const joinCodeInput = document.querySelector("#joinCode");
const playerCountInput = document.querySelector("#playerCount");
const mafiaCountInput = document.querySelector("#mafiaCount");
const detectiveCountInput = document.querySelector("#detectiveCount");
const doctorCountInput = document.querySelector("#doctorCount");
const errorMessage = document.querySelector("#errorMessage");
const roomKicker = document.querySelector("#roomKicker");
const roomTitle = document.querySelector("#roomTitle");
const inviteLink = document.querySelector("#inviteLink");
const copyInvite = document.querySelector("#copyInvite");
const joinedCount = document.querySelector("#joinedCount");
const seenCount = document.querySelector("#seenCount");
const roomCode = document.querySelector("#roomCode");
const instructionBand = document.querySelector("#instructionBand");
const hostActions = document.querySelector("#hostActions");
const startGame = document.querySelector("#startGame");
const resetGame = document.querySelector("#resetGame");
const leaveRoom = document.querySelector("#leaveRoom");
const playerCards = document.querySelector("#playerCards");
const myChitPanel = document.querySelector("#myChitPanel");
const myName = document.querySelector("#myName");
const chitCard = document.querySelector("#chitCard");
const roleIcon = document.querySelector("#roleIcon");
const roleName = document.querySelector("#roleName");
const roleHint = document.querySelector("#roleHint");
const revealChit = document.querySelector("#revealChit");
const chatCount = document.querySelector("#chatCount");
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");

const ROLE_DETAILS = {
  Mafia: {
    icon: "M",
    color: "#f2c4bc",
    hint: "Work with any other Mafia. Stay hidden during discussion.",
  },
  Detective: {
    icon: "D",
    color: "#c4dded",
    hint: "Secretly investigate one player during night rounds.",
  },
  Doctor: {
    icon: "+",
    color: "#cbe6d9",
    hint: "Secretly protect one player during night rounds.",
  },
  Civilian: {
    icon: "C",
    color: "#f0dfb8",
    hint: "Find the Mafia through discussion and voting.",
  },
};

let session = JSON.parse(localStorage.getItem("chitMafiaSession") || "null");
let pollId = null;
let lastMessageId = "";

function clampNumber(input, min, max) {
  const value = Number.parseInt(input.value, 10);
  const clamped = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  input.value = clamped;
  return clamped;
}

function normalizeCreateValues() {
  const maxPlayers = clampNumber(playerCountInput, 1, 10);
  const mafia = clampNumber(mafiaCountInput, 0, maxPlayers);
  const detectiveMax = Math.min(1, Math.max(0, maxPlayers - mafia));
  const detective = clampNumber(detectiveCountInput, 0, detectiveMax);
  const doctorMax = Math.min(1, Math.max(0, maxPlayers - mafia - detective));
  clampNumber(doctorCountInput, 0, doctorMax);
}

function saveSession(nextSession) {
  session = nextSession;
  localStorage.setItem("chitMafiaSession", JSON.stringify(session));
}

function clearSession() {
  session = null;
  localStorage.removeItem("chitMafiaSession");
  if (pollId) window.clearInterval(pollId);
  pollId = null;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

function showHome(message = "") {
  homePanel.classList.remove("hidden");
  gamePanel.classList.add("hidden");
  errorMessage.textContent = message;
}

function showGameShell() {
  homePanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  errorMessage.textContent = "";
}

function roomUrl(code) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  return url.toString();
}

function renderChit(role) {
  const details = ROLE_DETAILS[role];
  chitCard.classList.add("revealed");
  chitCard.style.setProperty("--role-color", details.color);
  roleIcon.textContent = details.icon;
  roleName.textContent = role;
  roleHint.textContent = details.hint;
  revealChit.disabled = true;
  revealChit.textContent = "Chit Revealed";
}

function renderHiddenChit() {
  chitCard.classList.remove("revealed");
  chitCard.style.removeProperty("--role-color");
  roleIcon.textContent = "?";
  roleName.textContent = "Hidden";
  roleHint.textContent = "Reveal only when nobody else can see your screen.";
  revealChit.disabled = false;
  revealChit.textContent = "Reveal My Chit";
}

function renderChat(messages = []) {
  const shouldStickToBottom =
    chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 60;
  const newestMessage = messages.at(-1)?.id || "";

  chatCount.textContent = `${messages.length} ${messages.length === 1 ? "message" : "messages"}`;
  chatMessages.innerHTML = "";

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-chat";
    empty.textContent = "No chat messages yet.";
    chatMessages.append(empty);
    lastMessageId = "";
    return;
  }

  messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = `chat-message${message.isMe ? " mine" : ""}`;

    const meta = document.createElement("div");
    meta.className = "chat-meta";

    const name = document.createElement("strong");
    name.textContent = message.isMe ? `${message.name} (you)` : message.name;

    const time = document.createElement("span");
    time.textContent = new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const text = document.createElement("p");
    text.textContent = message.text;

    meta.append(name, time);
    item.append(meta, text);
    chatMessages.append(item);
  });

  if (shouldStickToBottom || newestMessage !== lastMessageId) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  lastMessageId = newestMessage;
}

function renderRoom(room) {
  const me = room.players.find((player) => player.isMe);
  const isHost = me?.isHost;

  roomKicker.textContent = room.started ? "Game started" : "Lobby";
  roomTitle.textContent = room.started ? "Private Chits" : "Waiting Room";
  roomCode.textContent = room.code;
  joinedCount.textContent = `${room.players.length}/${room.maxPlayers}`;
  seenCount.textContent = room.players.filter((player) => player.seen).length;
  inviteLink.value = roomUrl(room.code);
  hostActions.classList.toggle("hidden", !isHost);
  myChitPanel.classList.toggle("hidden", !room.started || !me);
  startGame.disabled = room.started;
  resetGame.disabled = !room.started;

  instructionBand.textContent = room.started
    ? "Chits are live. Each player can reveal only their own role on their own device."
    : isHost
      ? "Share the invite link, then start when everyone is in."
      : "You are in the room. Wait for the host to start and pass the chits.";

  if (me) {
    myName.textContent = `${me.name}'s chit`;
  }

  if (room.myRole) {
    renderChit(room.myRole);
  } else {
    renderHiddenChit();
  }

  renderChat(room.messages);

  playerCards.innerHTML = "";
  room.players.forEach((player, index) => {
    const card = document.createElement("article");
    card.className = `player-card${player.seen ? " seen" : ""}`;

    const topLine = document.createElement("div");
    topLine.className = "player-topline";

    const number = document.createElement("span");
    number.className = "player-number";
    number.textContent = index + 1;

    const badge = document.createElement("span");
    badge.className = "seen-badge";
    badge.textContent = room.started ? (player.seen ? "Seen" : "Hidden") : "Joined";

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.isMe ? `${player.name} (you)` : player.name;

    topLine.append(number, badge);
    card.append(topLine, name);
    playerCards.append(card);
  });
}

async function refreshRoom() {
  if (!session) return;
  try {
    const room = await requestJson(`/api/rooms/${session.code}?token=${encodeURIComponent(session.token)}`);
    showGameShell();
    renderRoom(room);
  } catch (error) {
    clearSession();
    showHome(error.message);
  }
}

function startPolling() {
  if (pollId) window.clearInterval(pollId);
  pollId = window.setInterval(refreshRoom, 2000);
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  normalizeCreateValues();

  try {
    const room = await requestJson("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        hostName: hostNameInput.value.trim() || "Host",
        maxPlayers: Number(playerCountInput.value),
        roles: {
          mafia: Number(mafiaCountInput.value),
          detective: Number(detectiveCountInput.value),
          doctor: Number(doctorCountInput.value),
        },
      }),
    });
    saveSession({ code: room.code, token: room.token });
    window.history.replaceState({}, "", roomUrl(room.code));
    await refreshRoom();
    startPolling();
  } catch (error) {
    errorMessage.textContent = error.message;
  }
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const code = joinCodeInput.value.trim().toUpperCase();
    const room = await requestJson(`/api/rooms/${code}/join`, {
      method: "POST",
      body: JSON.stringify({ name: joinNameInput.value.trim() || "Player" }),
    });
    saveSession({ code: room.code, token: room.token });
    window.history.replaceState({}, "", roomUrl(room.code));
    await refreshRoom();
    startPolling();
  } catch (error) {
    errorMessage.textContent = error.message;
  }
});

startGame.addEventListener("click", async () => {
  try {
    await requestJson(`/api/rooms/${session.code}/start`, {
      method: "POST",
      body: JSON.stringify({ token: session.token }),
    });
    await refreshRoom();
  } catch (error) {
    instructionBand.textContent = error.message;
  }
});

resetGame.addEventListener("click", async () => {
  try {
    await requestJson(`/api/rooms/${session.code}/reset`, {
      method: "POST",
      body: JSON.stringify({ token: session.token }),
    });
    await refreshRoom();
  } catch (error) {
    instructionBand.textContent = error.message;
  }
});

revealChit.addEventListener("click", async () => {
  try {
    const result = await requestJson(`/api/rooms/${session.code}/reveal`, {
      method: "POST",
      body: JSON.stringify({ token: session.token }),
    });
    renderChit(result.role);
    await refreshRoom();
  } catch (error) {
    instructionBand.textContent = error.message;
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || !session) return;

  chatInput.value = "";
  try {
    const room = await requestJson(`/api/rooms/${session.code}/messages`, {
      method: "POST",
      body: JSON.stringify({
        token: session.token,
        message,
      }),
    });
    renderRoom(room);
  } catch (error) {
    instructionBand.textContent = error.message;
    chatInput.value = message;
  }
});

copyInvite.addEventListener("click", async () => {
  inviteLink.select();
  await navigator.clipboard.writeText(inviteLink.value);
  copyInvite.textContent = "Copied";
  window.setTimeout(() => {
    copyInvite.textContent = "Copy";
  }, 1200);
});

leaveRoom.addEventListener("click", () => {
  clearSession();
  window.history.replaceState({}, "", window.location.pathname);
  showHome();
});

[playerCountInput, mafiaCountInput, detectiveCountInput, doctorCountInput].forEach((input) => {
  input.addEventListener("input", normalizeCreateValues);
});

const inviteCode = new URLSearchParams(window.location.search).get("room");
if (inviteCode) {
  joinCodeInput.value = inviteCode.toUpperCase();
}

normalizeCreateValues();
if (session) {
  refreshRoom();
  startPolling();
}
