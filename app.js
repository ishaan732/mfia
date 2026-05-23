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
const resolveNight = document.querySelector("#resolveNight");
const startVote = document.querySelector("#startVote");
const resolveVote = document.querySelector("#resolveVote");
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
const actionPanel = document.querySelector("#actionPanel");
const actionTitle = document.querySelector("#actionTitle");
const actionBody = document.querySelector("#actionBody");
const phaseLabel = document.querySelector("#phaseLabel");

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

function phaseName(phase) {
  return {
    lobby: "Lobby",
    night: "Night",
    day: "Day",
    vote: "Voting",
    ended: "Game Over",
  }[phase] || "Room";
}

function createPlayerSelect(players, filterPlayer, selectedId = "") {
  const select = document.createElement("select");
  select.name = "targetId";
  select.required = true;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a player";
  select.append(placeholder);

  players.filter(filterPlayer).forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.isMe ? `${player.name} (you)` : player.name;
    option.selected = player.id === selectedId;
    select.append(option);
  });

  return select;
}

function addActionText(text) {
  const paragraph = document.createElement("p");
  paragraph.className = "action-text";
  paragraph.textContent = text;
  actionBody.append(paragraph);
}

function renderActionForm({ buttonText, endpoint, players, filterPlayer, selectedId, extraText }) {
  if (extraText) addActionText(extraText);

  const form = document.createElement("form");
  form.className = "action-form";
  const select = createPlayerSelect(players, filterPlayer, selectedId);
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "primary-button";
  button.textContent = buttonText;

  form.append(select, button);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const room = await requestJson(`/api/rooms/${session.code}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({
          token: session.token,
          targetId: select.value,
        }),
      });
      renderRoom(room);
    } catch (error) {
      instructionBand.textContent = error.message;
    }
  });
  actionBody.append(form);
}

function renderActionPanel(room, me) {
  actionBody.innerHTML = "";
  actionPanel.classList.toggle("hidden", !room.started || !me);
  if (!room.started || !me) return;

  const phase = room.phase || "night";
  actionTitle.textContent = phase === "ended" ? "Game Over" : `${phaseName(phase)} Action`;
  phaseLabel.textContent = phase === "ended" ? room.winner || "Finished" : `Round ${room.round || 1}`;

  if (phase === "ended") {
    addActionText(`${room.winner} win. The host can reset chits to play again.`);
    return;
  }

  if (!me.alive) {
    addActionText("You have been eliminated. You can still watch and chat, but you cannot act or vote.");
    return;
  }

  if (!room.myRole) {
    addActionText("Reveal your chit before taking game actions.");
    return;
  }

  if (phase === "night") {
    if (room.myRole === "Mafia") {
      const team = room.mafiaTeam.length > 1 ? ` Your Mafia team: ${room.mafiaTeam.join(", ")}.` : "";
      renderActionForm({
        buttonText: room.myNightAction?.mafiaSubmitted ? "Change Target" : "Choose Target",
        endpoint: "night-action",
        players: room.players,
        filterPlayer: (player) => player.alive && !room.mafiaTeam.includes(player.name),
        extraText: `Pick one non-Mafia player to attack.${team}`,
      });
      return;
    }

    if (room.myRole === "Detective") {
      const result = room.myNightAction?.detectiveResult;
      renderActionForm({
        buttonText: result ? "Check Someone Else" : "Check Player",
        endpoint: "night-action",
        players: room.players,
        filterPlayer: (player) => player.alive && !player.isMe,
        extraText: result
          ? `${result.targetName} is ${result.alignment}.`
          : "Choose one living player to secretly investigate.",
      });
      return;
    }

    if (room.myRole === "Doctor") {
      renderActionForm({
        buttonText: room.myNightAction?.doctorSubmitted ? "Change Protection" : "Protect Player",
        endpoint: "night-action",
        players: room.players,
        filterPlayer: (player) => player.alive,
        extraText: "Choose one living player to protect tonight. You may protect yourself.",
      });
      return;
    }

    addActionText("You are sleeping this night. Watch for the host to resolve night actions.");
    return;
  }

  if (phase === "day") {
    addActionText("Discuss in chat. Share suspicions, defend yourself, and ask the host to start voting when ready.");
    return;
  }

  if (phase === "vote") {
    renderActionForm({
      buttonText: room.myVoteTargetId ? "Change Vote" : "Vote",
      endpoint: "vote",
      players: room.players,
      filterPlayer: (player) => player.alive && !player.isMe,
      selectedId: room.myVoteTargetId,
      extraText: "Vote for one living player to eliminate.",
    });
  }
}

function renderRoom(room) {
  const me = room.players.find((player) => player.isMe);
  const isHost = me?.isHost;

  const phase = room.phase || (room.started ? "night" : "lobby");
  roomKicker.textContent = phaseName(phase);
  roomTitle.textContent = phase === "lobby" ? "Waiting Room" : `Round ${room.round || 1}`;
  roomCode.textContent = room.code;
  joinedCount.textContent = `${room.players.length}/${room.maxPlayers}`;
  seenCount.textContent = room.players.filter((player) => player.seen).length;
  inviteLink.value = roomUrl(room.code);
  hostActions.classList.toggle("hidden", !isHost);
  myChitPanel.classList.toggle("hidden", !room.started || !me);
  startGame.classList.toggle("hidden", room.started);
  resolveNight.classList.toggle("hidden", phase !== "night");
  startVote.classList.toggle("hidden", phase !== "day");
  resolveVote.classList.toggle("hidden", phase !== "vote");
  startGame.disabled = room.started;
  resolveNight.disabled = !room.started || phase !== "night";
  startVote.disabled = !room.started || phase !== "day";
  resolveVote.disabled = !room.started || phase !== "vote";
  resetGame.disabled = !room.started;

  if (phase === "ended") {
    instructionBand.textContent = `${room.winner} win. The host can reset chits to play again.`;
  } else if (phase === "night") {
    instructionBand.textContent = "Night phase: role players choose actions privately, then the host resolves night.";
  } else if (phase === "day") {
    instructionBand.textContent = "Day phase: discuss in chat, then the host starts voting.";
  } else if (phase === "vote") {
    instructionBand.textContent = "Voting phase: alive players vote. The host resolves voting when ready.";
  } else {
    instructionBand.textContent = isHost
      ? "Share the invite link, then start when everyone is in."
      : "You are in the room. Wait for the host to start and pass the chits.";
  }

  if (me) {
    myName.textContent = `${me.name}'s chit`;
  }

  if (room.myRole) {
    renderChit(room.myRole);
  } else {
    renderHiddenChit();
  }

  renderChat(room.messages);
  renderActionPanel(room, me);

  playerCards.innerHTML = "";
  room.players.forEach((player, index) => {
    const card = document.createElement("article");
    card.className = `player-card${player.seen ? " seen" : ""}${player.alive ? "" : " dead"}`;

    const topLine = document.createElement("div");
    topLine.className = "player-topline";

    const number = document.createElement("span");
    number.className = "player-number";
    number.textContent = index + 1;

    const badge = document.createElement("span");
    badge.className = "seen-badge";
    badge.textContent = player.alive ? (room.started ? (player.seen ? "Seen" : "Hidden") : "Joined") : "Out";

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

async function runHostCommand(endpoint) {
  try {
    await requestJson(`/api/rooms/${session.code}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify({ token: session.token }),
    });
    await refreshRoom();
  } catch (error) {
    instructionBand.textContent = error.message;
  }
}

resolveNight.addEventListener("click", () => runHostCommand("resolve-night"));
startVote.addEventListener("click", () => runHostCommand("start-vote"));
resolveVote.addEventListener("click", () => runHostCommand("resolve-vote"));

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
