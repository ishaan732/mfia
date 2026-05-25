const homePanel = document.querySelector("#homePanel");
const gamePanel = document.querySelector("#gamePanel");
const createForm = document.querySelector("#createForm");
const joinForm = document.querySelector("#joinForm");
const hostNameInput = document.querySelector("#hostName");
const joinNameInput = document.querySelector("#joinName");
const joinCodeInput = document.querySelector("#joinCode");
const reconnectCodeInput = document.querySelector("#reconnectCode");
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
const timerCountdown = document.querySelector("#timerCountdown");
const reconnectCodeDisplay = document.querySelector("#reconnectCodeDisplay");
const instructionBand = document.querySelector("#instructionBand");
const hostActions = document.querySelector("#hostActions");
const startGame = document.querySelector("#startGame");
const resolveNight = document.querySelector("#resolveNight");
const startVote = document.querySelector("#startVote");
const resolveVote = document.querySelector("#resolveVote");
const extendTimer = document.querySelector("#extendTimer");
const resetGame = document.querySelector("#resetGame");
const leaveRoom = document.querySelector("#leaveRoom");
const playerCards = document.querySelector("#playerCards");
const endScreen = document.querySelector("#endScreen");
const winnerTitle = document.querySelector("#winnerTitle");
const endRoles = document.querySelector("#endRoles");
const myChitPanel = document.querySelector("#myChitPanel");
const myName = document.querySelector("#myName");
const chitCard = document.querySelector("#chitCard");
const roleIcon = document.querySelector("#roleIcon");
const roleName = document.querySelector("#roleName");
const roleHint = document.querySelector("#roleHint");
const revealChit = document.querySelector("#revealChit");
const chatCount = document.querySelector("#chatCount");
const chatTabs = document.querySelector("#chatTabs");
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInputLabel = document.querySelector("#chatInputLabel");
const chatInput = document.querySelector("#chatInput");
const chatNote = document.querySelector("#chatNote");
const actionPanel = document.querySelector("#actionPanel");
const actionTitle = document.querySelector("#actionTitle");
const actionBody = document.querySelector("#actionBody");
const phaseLabel = document.querySelector("#phaseLabel");
const gameLog = document.querySelector("#gameLog");

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

let session = null;
let pollId = null;
let timerId = null;
let lastRoom = null;
let activeChatChannel = "room";
let serverClockOffset = 0;
const lastMessageIds = {
  room: "",
  mafia: "",
  dead: "",
};

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

function readSessionStore() {
  const store = JSON.parse(localStorage.getItem("chitMafiaSessions") || "{}");
  const legacySession = JSON.parse(localStorage.getItem("chitMafiaSession") || "null");
  if (legacySession?.code && !store[legacySession.code]) {
    store[legacySession.code] = legacySession;
  }
  return store;
}

function writeSessionStore(store) {
  localStorage.setItem("chitMafiaSessions", JSON.stringify(store));
}

function savedSessionFor(code) {
  if (!code) return null;
  return readSessionStore()[code.toUpperCase()] || null;
}

function saveSession(nextSession) {
  session = nextSession;
  const store = readSessionStore();
  store[session.code] = session;
  writeSessionStore(store);
  localStorage.setItem("chitMafiaSession", JSON.stringify(session));
}

function clearSession() {
  const code = session?.code;
  session = null;
  if (code) {
    const store = readSessionStore();
    delete store[code];
    writeSessionStore(store);
  }
  localStorage.removeItem("chitMafiaSession");
  if (pollId) window.clearInterval(pollId);
  if (timerId) window.clearInterval(timerId);
  pollId = null;
  timerId = null;
  lastRoom = null;
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

function chatConfigFor(room, me) {
  const roomLocked = Boolean(room.started && me && !me.alive && room.phase !== "ended");
  const channels = [
    {
      id: "room",
      label: "Room",
      inputLabel: "Room message",
      placeholder: roomLocked ? "Eliminated players use Dead Chat" : "Type to the room",
      messages: room.messages || [],
      canSend: !roomLocked,
      note: roomLocked
        ? "You can read the room chat, but eliminated players only send messages in Dead Chat."
        : "Everyone in the room can see this chat.",
    },
  ];

  if (room.canUseMafiaChat || room.mafiaMessages?.length) {
    channels.push({
      id: "mafia",
      label: "Mafia",
      inputLabel: "Mafia message",
      placeholder: room.canUseMafiaChat ? "Plan with Mafia" : "Mafia chat opens at night",
      messages: room.mafiaMessages || [],
      canSend: room.canUseMafiaChat,
      note: "Only revealed Mafia can see this chat.",
    });
  }

  if (room.canUseDeadChat || room.deadMessages?.length) {
    channels.push({
      id: "dead",
      label: "Dead",
      inputLabel: "Dead chat message",
      placeholder: room.canUseDeadChat ? "Talk with eliminated players" : "Dead chat is closed",
      messages: room.deadMessages || [],
      canSend: room.canUseDeadChat,
      note: "Only eliminated players can see Dead Chat during the game.",
    });
  }

  if (!channels.some((channel) => channel.id === activeChatChannel)) {
    activeChatChannel = room.canUseDeadChat ? "dead" : "room";
  }

  return channels;
}

function renderChatPanel(room, me) {
  const channels = chatConfigFor(room, me);
  const activeConfig = channels.find((channel) => channel.id === activeChatChannel) || channels[0];
  const messages = activeConfig.messages;
  const shouldStickToBottom =
    chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 60;
  const newestMessage = messages.at(-1)?.id || "";

  chatTabs.querySelectorAll(".chat-tab").forEach((tab) => {
    const channel = channels.find((item) => item.id === tab.dataset.channel);
    tab.classList.toggle("hidden", !channel);
    tab.classList.toggle("active", activeConfig.id === tab.dataset.channel);
    tab.disabled = !channel;
    if (channel) tab.textContent = channel.label;
  });

  chatCount.textContent = `${messages.length} ${messages.length === 1 ? "message" : "messages"}`;
  chatInputLabel.textContent = activeConfig.inputLabel;
  chatInput.placeholder = activeConfig.placeholder;
  chatInput.disabled = !activeConfig.canSend;
  chatForm.querySelector("button").disabled = !activeConfig.canSend;
  chatNote.textContent = activeConfig.note;
  chatMessages.innerHTML = "";

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-chat";
    empty.textContent = `No ${activeConfig.label.toLowerCase()} messages yet.`;
    chatMessages.append(empty);
    lastMessageIds[activeConfig.id] = "";
    return;
  }

  messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = `chat-message ${activeConfig.id}${message.isMe ? " mine" : ""}`;

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

  if (shouldStickToBottom || newestMessage !== lastMessageIds[activeConfig.id]) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  lastMessageIds[activeConfig.id] = newestMessage;
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

function formatSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateTimerDisplay() {
  if (!lastRoom?.phaseEndsAt) {
    timerCountdown.textContent = "--";
    timerCountdown.classList.remove("expired");
    return;
  }
  const remainingMs = lastRoom.phaseEndsAt - (Date.now() + serverClockOffset);
  if (remainingMs <= 0) {
    timerCountdown.textContent = "Time up";
    timerCountdown.classList.add("expired");
    return;
  }
  timerCountdown.textContent = formatSeconds(Math.ceil(remainingMs / 1000));
  timerCountdown.classList.remove("expired");
}

function startTimer() {
  if (timerId) window.clearInterval(timerId);
  updateTimerDisplay();
  timerId = window.setInterval(updateTimerDisplay, 500);
}

function renderGameLog(entries = []) {
  gameLog.innerHTML = "";
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-chat";
    empty.textContent = "No game events yet.";
    gameLog.append(empty);
    return;
  }

  entries.slice(-12).reverse().forEach((entry) => {
    const item = document.createElement("article");
    item.className = "log-entry";

    const time = document.createElement("span");
    time.textContent = new Date(entry.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const text = document.createElement("p");
    text.textContent = entry.text;

    item.append(time, text);
    gameLog.append(item);
  });
}

function renderEndScreen(room) {
  endScreen.classList.toggle("hidden", room.phase !== "ended");
  if (room.phase !== "ended") return;

  winnerTitle.textContent = `${room.winner} Win`;
  endRoles.innerHTML = "";
  room.players.forEach((player) => {
    const item = document.createElement("article");
    item.className = `role-reveal ${player.alive ? "alive" : "dead"}`;

    const name = document.createElement("strong");
    name.textContent = player.isMe ? `${player.name} (you)` : player.name;

    const role = document.createElement("span");
    role.textContent = player.role || "Unknown";

    const status = document.createElement("small");
    status.textContent = player.alive ? "Survived" : "Eliminated";

    item.append(name, role, status);
    endRoles.append(item);
  });
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
    addActionText("You have been eliminated. You can watch the game and use Dead Chat, but you cannot act or vote.");
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
  lastRoom = room;
  serverClockOffset = (room.serverNow || Date.now()) - Date.now();
  startTimer();

  const me = room.players.find((player) => player.isMe);
  const isHost = me?.isHost;

  const phase = room.phase || (room.started ? "night" : "lobby");
  roomKicker.textContent = phaseName(phase);
  roomTitle.textContent = phase === "lobby"
    ? "Waiting Room"
    : phase === "ended"
      ? "Game Over"
      : `Round ${room.round || 1}`;
  roomCode.textContent = room.code;
  joinedCount.textContent = `${room.players.length}/${room.maxPlayers}`;
  seenCount.textContent = room.players.filter((player) => player.seen).length;
  inviteLink.value = roomUrl(room.code);
  reconnectCodeDisplay.textContent = room.myReconnectCode || "--------";
  hostActions.classList.toggle("hidden", !isHost);
  myChitPanel.classList.toggle("hidden", !room.started || !me);
  startGame.classList.toggle("hidden", room.started);
  resolveNight.classList.toggle("hidden", phase !== "night");
  startVote.classList.toggle("hidden", phase !== "day");
  resolveVote.classList.toggle("hidden", phase !== "vote");
  extendTimer.classList.toggle("hidden", !room.started || phase === "lobby" || phase === "ended");
  startGame.disabled = room.started;
  resolveNight.disabled = !room.started || phase !== "night";
  startVote.disabled = !room.started || phase !== "day";
  resolveVote.disabled = !room.started || phase !== "vote";
  extendTimer.disabled = !room.started || phase === "lobby" || phase === "ended";
  resetGame.disabled = !room.started;

  if (phase === "ended") {
    instructionBand.textContent = `${room.winner} win. The host can reset chits to play again.`;
  } else if (phase === "night") {
    instructionBand.textContent = "Night phase: role players choose privately before the timer ends, then the host resolves night and starts voting.";
  } else if (phase === "day") {
    instructionBand.textContent = "Day phase: discuss in chat, then the host starts voting.";
  } else if (phase === "vote") {
    instructionBand.textContent = "Voting phase: discuss quickly, vote before the timer ends, then the host resolves voting.";
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

  renderChatPanel(room, me);
  renderGameLog(room.gameLog);
  renderEndScreen(room);
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
    if (phase === "ended" && player.role) {
      const role = document.createElement("span");
      role.className = "player-role";
      role.textContent = player.role;
      card.append(role);
    }
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
      body: JSON.stringify({
        name: joinNameInput.value.trim() || "Player",
        reconnectCode: reconnectCodeInput.value.trim(),
      }),
    });
    saveSession({ code: room.code, token: room.token });
    reconnectCodeInput.value = "";
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
extendTimer.addEventListener("click", () => runHostCommand("extend-timer"));

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
        channel: activeChatChannel,
      }),
    });
    renderRoom(room);
  } catch (error) {
    instructionBand.textContent = error.message;
    chatInput.value = message;
  }
});

chatTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".chat-tab");
  if (!tab || tab.disabled) return;
  activeChatChannel = tab.dataset.channel;
  if (lastRoom) {
    const me = lastRoom.players.find((player) => player.isMe);
    renderChatPanel(lastRoom, me);
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
  const normalizedCode = inviteCode.toUpperCase();
  joinCodeInput.value = normalizedCode;
  session = savedSessionFor(normalizedCode);
} else {
  session = JSON.parse(localStorage.getItem("chitMafiaSession") || "null");
}

normalizeCreateValues();
if (session) {
  refreshRoom();
  startPolling();
}
