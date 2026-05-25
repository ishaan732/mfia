const homePanel = document.querySelector("#homePanel");
const gamePanel = document.querySelector("#gamePanel");
const createForm = document.querySelector("#createForm");
const joinForm = document.querySelector("#joinForm");
const hostNameInput = document.querySelector("#hostName");
const joinNameInput = document.querySelector("#joinName");
const joinCodeInput = document.querySelector("#joinCode");
const reconnectCodeInput = document.querySelector("#reconnectCode");
const createPasswordInput = document.querySelector("#createPassword");
const joinPasswordInput = document.querySelector("#joinPassword");
const playerCountInput = document.querySelector("#playerCount");
const mafiaCountInput = document.querySelector("#mafiaCount");
const detectiveCountInput = document.querySelector("#detectiveCount");
const doctorCountInput = document.querySelector("#doctorCount");
const nightSecondsInput = document.querySelector("#nightSeconds");
const voteSecondsInput = document.querySelector("#voteSeconds");
const maxRoundsInput = document.querySelector("#maxRounds");
const autoResolveInput = document.querySelector("#autoResolve");
const errorMessage = document.querySelector("#errorMessage");
const roomKicker = document.querySelector("#roomKicker");
const roomTitle = document.querySelector("#roomTitle");
const inviteLink = document.querySelector("#inviteLink");
const copyInvite = document.querySelector("#copyInvite");
const joinedCount = document.querySelector("#joinedCount");
const seenCount = document.querySelector("#seenCount");
const roomCode = document.querySelector("#roomCode");
const timerCountdown = document.querySelector("#timerCountdown");
const spectatorCount = document.querySelector("#spectatorCount");
const reconnectCodeDisplay = document.querySelector("#reconnectCodeDisplay");
const instructionBand = document.querySelector("#instructionBand");
const hostActions = document.querySelector("#hostActions");
const startGame = document.querySelector("#startGame");
const resolveNight = document.querySelector("#resolveNight");
const startVote = document.querySelector("#startVote");
const resolveVote = document.querySelector("#resolveVote");
const extendTimer = document.querySelector("#extendTimer");
const resetGame = document.querySelector("#resetGame");
const readyButton = document.querySelector("#readyButton");
const leaveRoom = document.querySelector("#leaveRoom");
const playerCards = document.querySelector("#playerCards");
const hostSettings = document.querySelector("#hostSettings");
const passwordState = document.querySelector("#passwordState");
const settingsMaxPlayers = document.querySelector("#settingsMaxPlayers");
const settingsMafia = document.querySelector("#settingsMafia");
const settingsDetective = document.querySelector("#settingsDetective");
const settingsDoctor = document.querySelector("#settingsDoctor");
const settingsNightSeconds = document.querySelector("#settingsNightSeconds");
const settingsVoteSeconds = document.querySelector("#settingsVoteSeconds");
const settingsMaxRounds = document.querySelector("#settingsMaxRounds");
const settingsPassword = document.querySelector("#settingsPassword");
const settingsAutoResolve = document.querySelector("#settingsAutoResolve");
const saveSettings = document.querySelector("#saveSettings");
const endScreen = document.querySelector("#endScreen");
const winnerTitle = document.querySelector("#winnerTitle");
const endRoles = document.querySelector("#endRoles");
const voteResultsPanel = document.querySelector("#voteResultsPanel");
const voteResultsRound = document.querySelector("#voteResultsRound");
const voteResultsList = document.querySelector("#voteResultsList");
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
const spectateRoom = document.querySelector("#spectateRoom");
const openRoleGuide = document.querySelector("#openRoleGuide");
const closeRoleGuide = document.querySelector("#closeRoleGuide");
const roleGuideDialog = document.querySelector("#roleGuideDialog");
const themeSelect = document.querySelector("#themeSelect");
const soundToggle = document.querySelector("#soundToggle");
const qrImage = document.querySelector("#qrImage");
const privateNotes = document.querySelector("#privateNotes");
const gameHistory = document.querySelector("#gameHistory");

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
let lastPhaseKey = "";
let lastWarningKey = "";
let audioContext = null;
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
  clampNumber(nightSecondsInput, 10, 300);
  clampNumber(voteSecondsInput, 10, 300);
  clampNumber(maxRoundsInput, 0, 20);
}

function normalizeSettingsValues() {
  const maxPlayers = clampNumber(settingsMaxPlayers, Math.max(1, lastRoom?.players?.length || 1), 10);
  const mafia = clampNumber(settingsMafia, maxPlayers > 1 ? 1 : 0, maxPlayers);
  const detectiveMax = Math.min(1, Math.max(0, maxPlayers - mafia));
  const detective = clampNumber(settingsDetective, 0, detectiveMax);
  const doctorMax = Math.min(1, Math.max(0, maxPlayers - mafia - detective));
  clampNumber(settingsDoctor, 0, doctorMax);
  clampNumber(settingsNightSeconds, 10, 300);
  clampNumber(settingsVoteSeconds, 10, 300);
  clampNumber(settingsMaxRounds, 0, 20);
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
  loadPrivateNotes();
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
  privateNotes.value = "";
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

function notesKey() {
  return session ? `chitMafiaNotes:${session.code}:${session.token}` : "";
}

function loadPrivateNotes() {
  privateNotes.value = notesKey() ? localStorage.getItem(notesKey()) || "" : "";
}

function playTone(type) {
  if (!soundToggle.checked) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const frequency = { phase: 620, message: 420, warning: 880 }[type] || 520;
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.2);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeSelect.value = theme;
  localStorage.setItem("chitMafiaTheme", theme);
}

function updateQr(code) {
  if (!code) {
    qrImage.removeAttribute("src");
    return;
  }
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(roomUrl(code))}`;
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
  const spectatorLocked = room.isSpectator;
  const channels = [
    {
      id: "room",
      label: "Room",
      inputLabel: "Room message",
      placeholder: spectatorLocked ? "Spectators are read-only" : roomLocked ? "Eliminated players use Dead Chat" : "Type to the room",
      messages: room.messages || [],
      canSend: !roomLocked && !spectatorLocked && !room.myMuted,
      note: spectatorLocked
        ? "Spectators can watch but cannot chat or vote."
        : room.myMuted
          ? "The host muted your chat."
          : roomLocked
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
  if (newestMessage && lastMessageIds[activeConfig.id] && newestMessage !== lastMessageIds[activeConfig.id]) {
    playTone("message");
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
  const secondsLeft = Math.ceil(remainingMs / 1000);
  timerCountdown.textContent = formatSeconds(secondsLeft);
  timerCountdown.classList.remove("expired");
  const warningKey = `${lastRoom.code}:${lastRoom.phase}:${lastRoom.round}`;
  if (secondsLeft <= 10 && warningKey !== lastWarningKey) {
    lastWarningKey = warningKey;
    playTone("warning");
  }
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

function renderGameHistory(history = []) {
  gameHistory.innerHTML = "";
  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-chat";
    empty.textContent = "No finished games yet.";
    gameHistory.append(empty);
    return;
  }
  history.forEach((game) => {
    const item = document.createElement("article");
    item.className = "log-entry";
    const title = document.createElement("span");
    title.textContent = `${game.winner} win - round ${game.round}`;
    const text = document.createElement("p");
    text.textContent = game.players.map((player) => `${player.name}: ${player.role}`).join(", ");
    item.append(title, text);
    gameHistory.append(item);
  });
}

function renderVoteResults(results) {
  voteResultsPanel.classList.toggle("hidden", !results);
  if (!results) return;

  voteResultsRound.textContent = `Round ${results.round}`;
  voteResultsList.innerHTML = "";
  const summary = document.createElement("p");
  summary.className = "action-text";
  summary.textContent = results.eliminatedName
    ? `${results.eliminatedName} was voted out.`
    : results.tied
      ? "The vote tied. Nobody was eliminated."
      : "Nobody was eliminated.";
  voteResultsList.append(summary);

  results.rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "result-row";
    item.textContent = `${row.voterName} voted for ${row.targetName}`;
    voteResultsList.append(item);
  });
}

function renderHostSettings(room, isHost) {
  hostSettings.classList.toggle("hidden", !isHost || room.started);
  if (!isHost || room.started) return;
  passwordState.textContent = room.settings.hasPassword ? "Password on" : "No password";
  settingsMaxPlayers.value = room.maxPlayers;
  settingsMafia.value = room.roles.mafia;
  settingsDetective.value = room.roles.detective;
  settingsDoctor.value = room.roles.doctor;
  settingsNightSeconds.value = room.settings.nightSeconds;
  settingsVoteSeconds.value = room.settings.voteSeconds;
  settingsMaxRounds.value = room.settings.maxRounds;
  settingsAutoResolve.checked = room.settings.autoResolve;
}

function renderActionStatus(room) {
  if (!room.actionStatus?.length) return;
  addActionText(
    room.actionStatus
      .map((status) => `${status.label}: ${status.done ? "done" : "waiting"}`)
      .join(" | "),
  );
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
  renderActionStatus(room);

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
  const phaseKey = `${room.code}:${phase}:${room.round}:${room.winner || ""}`;
  if (lastPhaseKey && phaseKey !== lastPhaseKey) {
    playTone("phase");
  }
  lastPhaseKey = phaseKey;

  roomKicker.textContent = phaseName(phase);
  roomTitle.textContent = phase === "lobby"
    ? "Waiting Room"
    : phase === "ended"
      ? "Game Over"
      : `Round ${room.round || 1}`;
  roomCode.textContent = room.code;
  joinedCount.textContent = `${room.players.length}/${room.maxPlayers}`;
  seenCount.textContent = room.players.filter((player) => player.seen).length;
  spectatorCount.textContent = room.spectators.length;
  inviteLink.value = roomUrl(room.code);
  updateQr(room.code);
  reconnectCodeDisplay.textContent = room.myReconnectCode || "--------";
  hostActions.classList.toggle("hidden", !me || (room.started && !isHost));
  readyButton.classList.toggle("hidden", room.started || !me);
  readyButton.textContent = me?.ready ? "Ready ✓" : "Ready";
  readyButton.disabled = room.started || !me;
  myChitPanel.classList.toggle("hidden", !room.started || !me);
  startGame.classList.toggle("hidden", room.started || !isHost);
  resolveNight.classList.toggle("hidden", !isHost || phase !== "night");
  startVote.classList.toggle("hidden", !isHost || phase !== "day");
  resolveVote.classList.toggle("hidden", !isHost || phase !== "vote");
  extendTimer.classList.toggle("hidden", !isHost || !room.started || phase === "lobby" || phase === "ended");
  resetGame.classList.toggle("hidden", !isHost);
  startGame.disabled = room.started || !room.players.every((player) => player.ready);
  resolveNight.disabled = !room.started || phase !== "night";
  startVote.disabled = !room.started || phase !== "day";
  resolveVote.disabled = !room.started || phase !== "vote";
  extendTimer.disabled = !room.started || phase === "lobby" || phase === "ended";
  resetGame.disabled = !room.started;
  renderHostSettings(room, isHost);

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
  renderGameHistory(room.history);
  renderVoteResults(room.voteResults);
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
    badge.textContent = room.started
      ? player.alive ? (player.seen ? "Seen" : "Hidden") : "Out"
      : player.ready ? "Ready" : "Not ready";

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.isMe ? `${player.name} (you)` : player.name;

    topLine.append(number, badge);
    card.append(topLine, name);
    if (player.muted) {
      const muted = document.createElement("span");
      muted.className = "player-role";
      muted.textContent = "Muted";
      card.append(muted);
    }
    if (phase === "ended" && player.role) {
      const role = document.createElement("span");
      role.className = "player-role";
      role.textContent = player.role;
      card.append(role);
    }
    if (isHost && !player.isHost) {
      const controls = document.createElement("div");
      controls.className = "player-controls";

      const muteButton = document.createElement("button");
      muteButton.type = "button";
      muteButton.className = "ghost-button small-button";
      muteButton.textContent = player.muted ? "Unmute" : "Mute";
      muteButton.addEventListener("click", () => runHostCommand("mute", {
        targetId: player.id,
        muted: !player.muted,
      }));
      controls.append(muteButton);

      if (!room.started) {
        const kickButton = document.createElement("button");
        kickButton.type = "button";
        kickButton.className = "ghost-button small-button";
        kickButton.textContent = "Kick";
        kickButton.addEventListener("click", () => runHostCommand("kick", { targetId: player.id }));
        controls.append(kickButton);
      }
      card.append(controls);
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
        password: createPasswordInput.value,
        roles: {
          mafia: Number(mafiaCountInput.value),
          detective: Number(detectiveCountInput.value),
          doctor: Number(doctorCountInput.value),
        },
        settings: {
          nightSeconds: Number(nightSecondsInput.value),
          voteSeconds: Number(voteSecondsInput.value),
          maxRounds: Number(maxRoundsInput.value),
          autoResolve: autoResolveInput.checked,
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
        password: joinPasswordInput.value,
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

spectateRoom.addEventListener("click", async () => {
  try {
    const code = joinCodeInput.value.trim().toUpperCase();
    const room = await requestJson(`/api/rooms/${code}/spectate`, {
      method: "POST",
      body: JSON.stringify({
        name: joinNameInput.value.trim() || "Spectator",
        password: joinPasswordInput.value,
      }),
    });
    saveSession({ code: room.code, token: room.token, spectator: true });
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

readyButton.addEventListener("click", () => {
  const me = lastRoom?.players.find((player) => player.isMe);
  runHostCommand("ready", { ready: !me?.ready });
});

saveSettings.addEventListener("click", async () => {
  normalizeSettingsValues();
  try {
    await requestJson(`/api/rooms/${session.code}/settings`, {
      method: "POST",
      body: JSON.stringify({
        token: session.token,
        maxPlayers: Number(settingsMaxPlayers.value),
        roles: {
          mafia: Number(settingsMafia.value),
          detective: Number(settingsDetective.value),
          doctor: Number(settingsDoctor.value),
        },
        settings: {
          nightSeconds: Number(settingsNightSeconds.value),
          voteSeconds: Number(settingsVoteSeconds.value),
          maxRounds: Number(settingsMaxRounds.value),
          autoResolve: settingsAutoResolve.checked,
        },
        password: settingsPassword.value,
      }),
    });
    settingsPassword.value = "";
    await refreshRoom();
  } catch (error) {
    instructionBand.textContent = error.message;
  }
});

async function runHostCommand(endpoint, extraBody = {}) {
  try {
    await requestJson(`/api/rooms/${session.code}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify({ token: session.token, ...extraBody }),
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

openRoleGuide.addEventListener("click", () => {
  roleGuideDialog.showModal();
});

closeRoleGuide.addEventListener("click", () => {
  roleGuideDialog.close();
});

themeSelect.addEventListener("change", () => {
  applyTheme(themeSelect.value);
});

soundToggle.addEventListener("change", () => {
  localStorage.setItem("chitMafiaSound", soundToggle.checked ? "on" : "off");
  if (soundToggle.checked) playTone("phase");
});

privateNotes.addEventListener("input", () => {
  if (notesKey()) {
    localStorage.setItem(notesKey(), privateNotes.value);
  }
});

leaveRoom.addEventListener("click", () => {
  clearSession();
  window.history.replaceState({}, "", window.location.pathname);
  showHome();
});

[playerCountInput, mafiaCountInput, detectiveCountInput, doctorCountInput].forEach((input) => {
  input.addEventListener("input", normalizeCreateValues);
});

[nightSecondsInput, voteSecondsInput, maxRoundsInput].forEach((input) => {
  input.addEventListener("input", normalizeCreateValues);
});

[
  settingsMaxPlayers,
  settingsMafia,
  settingsDetective,
  settingsDoctor,
  settingsNightSeconds,
  settingsVoteSeconds,
  settingsMaxRounds,
].forEach((input) => {
  input.addEventListener("input", normalizeSettingsValues);
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
applyTheme(localStorage.getItem("chitMafiaTheme") || "classic");
soundToggle.checked = localStorage.getItem("chitMafiaSound") === "on";
if (session) {
  loadPrivateNotes();
  refreshRoom();
  startPolling();
}
