const STORAGE_KEY = "lenslog-state-v1";
const USER_ID_KEY = "lenslog-local-user-id";
const MAX_SOURCE_IMAGE_BYTES = 18 * 1024 * 1024;
const MAX_UPLOAD_SIDE = 1800;
const PHOTO_FALLBACK = "./assets/photo-fallback.svg";
const memoryStore = {};
const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore[key] || null;
  }
}

function writeStored(key, value) {
  memoryStore[key] = value;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function getLocalUserId() {
  const saved = readStored(USER_ID_KEY);
  if (saved) return saved;
  const next = `local-${uid()}`;
  writeStored(USER_ID_KEY, next);
  return next;
}

const localUserId = getLocalUserId();

const samplePosts = [
  {
    id: uid(),
    sample: true,
    title: "Rain trails in Colaba",
    location: "Mumbai, India",
    camera: "Fujifilm X-T5",
    lens: "23mm f/2",
    iso: "800",
    aperture: "f/2.8",
    shutter: "1/160s",
    category: "Street",
    story: "I waited for the taxi headlights to hit the wet road and kept the frame low.",
    author: "Anaya Rao",
    image: "./assets/sample-street.svg",
    likes: 32,
    createdAt: Date.now() - 1000 * 60 * 60 * 3
  },
  {
    id: uid(),
    sample: true,
    title: "Blue hour above Pangong",
    location: "Ladakh, India",
    camera: "Nikon Z8",
    lens: "24-70mm f/2.8",
    iso: "200",
    aperture: "f/8",
    shutter: "1/80s",
    category: "Landscape",
    story: "The air was clear after sunset, so I underexposed a little to keep the mountain edges clean.",
    author: "Kabir Sen",
    image: "./assets/sample-landscape.svg",
    likes: 57,
    createdAt: Date.now() - 1000 * 60 * 60 * 10
  },
  {
    id: uid(),
    sample: true,
    title: "Window light portrait",
    location: "Bengaluru, India",
    camera: "Canon R6 Mark II",
    lens: "50mm f/1.4",
    iso: "400",
    aperture: "f/1.8",
    shutter: "1/320s",
    category: "Portrait",
    story: "Soft curtain light did most of the work. I focused on the near eye and kept the background simple.",
    author: "Meera Iyer",
    image: "./assets/sample-portrait.svg",
    likes: 44,
    createdAt: Date.now() - 1000 * 60 * 60 * 18
  },
  {
    id: uid(),
    sample: true,
    title: "Heron at first light",
    location: "Keoladeo, India",
    camera: "Sony A1",
    lens: "200-600mm",
    iso: "1250",
    aperture: "f/6.3",
    shutter: "1/2000s",
    category: "Wildlife",
    story: "Fast shutter, quiet mode, and a patient crouch near the reeds caught the takeoff.",
    author: "Dev Malhotra",
    image: "./assets/sample-wildlife.svg",
    likes: 71,
    createdAt: Date.now() - 1000 * 60 * 60 * 24
  }
];

const defaultState = {
  userId: localUserId,
  profile: {
    name: "",
    email: "",
    camera: "",
    location: ""
  },
  posts: samplePosts,
  myPostIds: [],
  liked: [],
  reported: [],
  theme: "light"
};

const sampleSignatures = new Set(samplePosts.map((post) => `${post.title}|${post.author}`));
const sampleImageByTitle = Object.fromEntries(samplePosts.map((post) => [post.title, post.image]));

const qs = (selector) => document.querySelector(selector);
const clone = (value) => JSON.parse(JSON.stringify(value));

let state = loadState();
let uploadedImage = "";
let activeSort = "recent";
let activeView = "all";
let toastTimer;
let newestPostId = "";

const feedGrid = qs("#feedGrid");
const template = qs("#postTemplate");
const authDialog = qs("#authDialog");

function loadState() {
  try {
    const saved = JSON.parse(readStored(STORAGE_KEY));
    if (!saved) return clone(defaultState);
    const merged = {
      ...clone(defaultState),
      ...saved,
      userId: saved.userId || localUserId,
      profile: {
        ...clone(defaultState.profile),
        ...(saved.profile || {})
      },
      myPostIds: saved.myPostIds || [],
      liked: saved.liked || [],
      reported: saved.reported || []
    };
    merged.posts = (saved.posts && saved.posts.length ? saved.posts : samplePosts).map((post) => migratePost(post, merged.userId));
    return merged;
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  return writeStored(STORAGE_KEY, JSON.stringify(state));
}

function canUseApi() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function normalizeApiPost(post) {
  return {
    id: post.id,
    title: post.title,
    location: post.location,
    camera: post.camera,
    lens: post.lens,
    iso: post.iso,
    aperture: post.aperture,
    shutter: post.shutter,
    category: post.category || "Photo",
    story: post.story || "",
    author: post.author || "LensLog Photographer",
    image: post.image,
    likes: post.likes || 0,
    createdAt: post.createdAt || Date.now(),
    mine: state.myPostIds.includes(post.id)
  };
}

async function loadSharedPosts() {
  if (!canUseApi()) return;

  try {
    const response = await fetch("/api/posts", {
      headers: {
        "Accept": "application/json"
      }
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load shared posts.");

    const sharedPosts = data.posts.map(normalizeApiPost);
    const localOnlyMine = state.posts.filter((post) => isMine(post) && !sharedPosts.some((shared) => shared.id === post.id));
    state.posts = [...localOnlyMine, ...sharedPosts, ...samplePosts];
    renderPosts();
    updateProfileUI();
  } catch {
    showToast("Shared feed could not refresh. Showing saved posts.");
  }
}

async function publishSharedPost(post) {
  if (!canUseApi()) return { ok: false, offline: true };

  const response = await fetch("/api/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
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
      authorEmail: state.profile.email,
      imageData: post.image,
      consent: qs("#consentInput").checked,
      website: ""
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not publish this photo.");
  return { ok: true, post: normalizeApiPost(data.post) };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("That picture could not be read. Try another file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That picture could not be prepared. Try a JPG, PNG, WebP, or phone photo."));
    image.src = url;
  });
}

async function prepareUploadImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Choose a photo under 18 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, MAX_UPLOAD_SIDE / largestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("That picture could not be prepared. Try another file.");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch (error) {
    const dataUrl = await readFileAsDataUrl(file);
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(dataUrl)) throw error;
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function reportSharedPost(post) {
  if (!canUseApi()) {
    showToast("Reports work on the live web app.");
    return;
  }
  if (state.reported.includes(post.id)) {
    showToast("This shot is already marked for review.");
    return;
  }

  const response = await fetch("/api/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      postId: post.id,
      reason: "Community review",
      website: ""
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not report this shot.");

  state.reported = [post.id, ...state.reported].slice(0, 500);
  saveState();
  showToast(data.hidden ? "Thanks. This shot has been hidden for review." : "Thanks. This shot is marked for review.");
  if (data.hidden) {
    state.posts = state.posts.filter((item) => item.id !== post.id);
    renderPosts();
    updateProfileUI();
  } else {
    renderPosts();
  }
}

function migratePost(post, userId) {
  const isSample = post.sample || sampleSignatures.has(`${post.title}|${post.author}`);
  if (isSample) {
    return {
      ...post,
      sample: true,
      mine: false,
      image: sampleImageByTitle[post.title] || post.image || PHOTO_FALLBACK
    };
  }

  return {
    ...post,
    mine: typeof post.mine === "undefined" ? true : post.mine,
    ownerId: post.ownerId || userId
  };
}

function initials(nameOrEmail) {
  const source = nameOrEmail || "ID";
  const parts = source.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
  const first = parts[0] || "ID";
  const second = parts[1] || "";
  return (first.charAt(0) || "I").toUpperCase() + (second.charAt(0) || first.charAt(1) || "D").toUpperCase();
}

function normalizeGmailId(value) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed.replace(/\s+/g, "")}@gmail.com`;
}

function currentAuthor(profile = state.profile) {
  return profile.name || "LensLog Photographer";
}

function isMine(post) {
  return state.myPostIds.includes(post.id) || post.mine === true || post.ownerId === state.userId || (state.profile.email && post.ownerEmail === state.profile.email);
}

function claimMinePosts() {
  const author = currentAuthor();
  state.posts = state.posts.map((post) => {
    if (!isMine(post)) return post;
    return {
      ...post,
      mine: true,
      ownerId: state.userId,
      ownerEmail: state.profile.email,
      author
    };
  });
}

function applyTheme() {
  document.documentElement.classList.toggle("dark", state.theme === "dark");
  qs("#themeToggle").innerHTML = state.theme === "dark" ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showToast(message) {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setAppStatus(message, tone, hideDelay) {
  const status = qs("#appStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("ready", "error", "hide");
  if (tone) status.classList.add(tone);
  if (hideDelay) {
    setTimeout(() => status.classList.add("hide"), hideDelay);
  }
}

function showFeedNotice(title, text) {
  const notice = qs("#feedNotice");
  if (!notice) return;
  qs("#feedNoticeTitle").textContent = title;
  qs("#feedNoticeText").textContent = text;
  notice.hidden = false;
}

function myPosts() {
  return state.posts.filter(isMine);
}

function topStyleFor(posts) {
  const counts = {};
  let best = "";
  let bestCount = 0;
  posts.forEach((post) => {
    const category = post.category || "Unstyled";
    counts[category] = (counts[category] || 0) + 1;
    if (counts[category] > bestCount) {
      best = category;
      bestCount = counts[category];
    }
  });
  return best || "Not set";
}

function renderMyShots() {
  const grid = qs("#myShotsGrid");
  if (!grid) return;
  const posts = myPosts().sort((a, b) => b.createdAt - a.createdAt);
  grid.innerHTML = "";

  if (!posts.length) {
    const empty = document.createElement("p");
    empty.className = "panel";
    empty.textContent = "No shared shots yet.";
    grid.append(empty);
    return;
  }

  posts.slice(0, 8).forEach((post) => {
    const card = document.createElement("article");
    card.className = "mini-shot";

    const image = document.createElement("img");
    image.src = post.image;
    image.alt = post.title;
    image.onerror = () => {
      image.onerror = null;
      image.src = PHOTO_FALLBACK;
    };

    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = post.title;
    const details = document.createElement("span");
    details.textContent = `${post.location} - ${post.camera}`;

    body.append(title, details);
    card.append(image, body);
    grid.append(card);
  });
}

function updateProfileUI() {
  const profile = state.profile;
  const signedIn = Boolean(profile.email);
  const mine = myPosts();
  const label = signedIn ? profile.name || profile.email : "Sign in";
  const avatar = initials(profile.name || profile.email);

  qs("#topName").textContent = label;
  qs("#topAvatar").textContent = avatar;
  qs("#profileAvatar").textContent = avatar;
  qs("#profileName").textContent = signedIn ? profile.name || "Photographer" : "Your photographer profile";
  qs("#profileEmail").textContent = signedIn ? profile.email : "Sign in with your Gmail ID to save this browser profile.";
  qs("#profileCamera").textContent = profile.camera || "Not set";
  qs("#profileLocation").textContent = profile.location || "Not set";
  qs("#profileShots").textContent = mine.length;
  qs("#profileTopStyle").textContent = topStyleFor(mine);
  qs("#profileStatus").textContent = signedIn ? "Profile saved." : "";
  qs("#profileStatus").classList.toggle("ready", signedIn);

  qs("#nameField").value = profile.name;
  qs("#emailField").value = profile.email;
  qs("#favCameraField").value = profile.camera;
  qs("#homeLocationField").value = profile.location;
  renderMyShots();
}

function filteredPosts() {
  const search = qs("#searchInput").value.trim().toLowerCase();
  const style = qs("#styleFilter").value;
  const posts = state.posts.filter((post) => {
    const matchesStyle = style === "all" || post.category === style;
    const matchesView = activeView === "all" || isMine(post);
    const haystack = [post.title, post.location, post.camera, post.lens, post.iso, post.aperture, post.shutter, post.author, post.story]
      .join(" ")
      .toLowerCase();
    return matchesView && matchesStyle && (!search || haystack.includes(search));
  });

  return posts.sort((a, b) => {
    if (activeSort === "popular") return b.likes - a.likes;
    if (activeSort === "nearby") return a.location.localeCompare(b.location);
    return b.createdAt - a.createdAt;
  });
}

function renderPosts() {
  const posts = filteredPosts();
  feedGrid.innerHTML = "";

  if (!posts.length) {
    feedGrid.innerHTML = '<p class="panel">No shots match those filters yet.</p>';
  }

  posts.forEach((post) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.toggle("new-post", post.id === newestPostId);
    node.querySelector(".photo").src = post.image;
    node.querySelector(".photo").alt = post.title;
    node.querySelector(".photo").onerror = (event) => {
      event.currentTarget.onerror = null;
      event.currentTarget.src = PHOTO_FALLBACK;
    };
    node.querySelector(".tag").textContent = isMine(post) ? `Yours - ${post.category}` : post.category;
    node.querySelector("h3").textContent = post.title;
    node.querySelector(".location").textContent = post.location;
    node.querySelector(".story").textContent = post.story || "Shared as a quick settings note.";
    node.querySelector(".camera").textContent = post.camera;
    node.querySelector(".lens").textContent = post.lens;
    node.querySelector(".iso").textContent = post.iso;
    node.querySelector(".aperture").textContent = post.aperture;
    node.querySelector(".shutter").textContent = post.shutter;
    node.querySelector(".author").textContent = post.author;

    const likeButton = node.querySelector(".like-button");
    likeButton.classList.toggle("active", state.liked.includes(post.id));
    likeButton.title = `${post.likes} likes`;
    likeButton.addEventListener("click", () => {
      const liked = state.liked.includes(post.id);
      state.liked = liked ? state.liked.filter((id) => id !== post.id) : [...state.liked, post.id];
      post.likes += liked ? -1 : 1;
      saveState();
      renderPosts();
    });

    const reportButton = node.querySelector(".report-button");
    const canReport = !post.sample && canUseApi();
    reportButton.hidden = !canReport;
    reportButton.classList.toggle("active", state.reported.includes(post.id));
    reportButton.disabled = state.reported.includes(post.id);
    reportButton.title = state.reported.includes(post.id) ? "Marked for review" : "Report photo";
    reportButton.addEventListener("click", async () => {
      reportButton.disabled = true;
      try {
        await reportSharedPost(post);
      } catch (error) {
        reportButton.disabled = false;
        showToast(error.message || "Could not report this shot.");
      }
    });

    feedGrid.append(node);
  });

  qs("#shotCount").textContent = state.posts.length;
  qs("#placeCount").textContent = new Set(state.posts.map((post) => post.location)).size;
  refreshIcons();
}

function openProfileDialog() {
  authDialog.hidden = false;
  authDialog.setAttribute("aria-hidden", "false");
  qs("#nameField").focus();
}

function closeProfileDialog() {
  authDialog.hidden = true;
  authDialog.setAttribute("aria-hidden", "true");
}

function saveProfileFromForm() {
  state.profile = {
    name: qs("#nameField").value.trim(),
    email: normalizeGmailId(qs("#emailField").value),
    camera: qs("#favCameraField").value.trim(),
    location: qs("#homeLocationField").value.trim()
  };
  claimMinePosts();
  const persisted = saveState();
  updateProfileUI();
  renderPosts();
  showToast(persisted ? "Profile saved." : "Profile saved for this session.");
  setAppStatus("Profile saved.", "ready", 3000);
  closeProfileDialog();
}

function bindEvents() {
  qs("#openAuth").addEventListener("click", openProfileDialog);
  qs("#editProfile").addEventListener("click", openProfileDialog);
  qs("#closeAuth").addEventListener("click", closeProfileDialog);
  authDialog.addEventListener("click", (event) => {
    if (event.target === authDialog) closeProfileDialog();
  });
  qs("#themeToggle").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveState();
    applyTheme();
  });

  qs("#googleDemo").addEventListener("click", () => {
    if (!qs("#nameField").value.trim()) qs("#nameField").value = "LensLog Photographer";
    if (!qs("#emailField").value.trim()) qs("#emailField").value = "photographer@gmail.com";
    if (!qs("#favCameraField").value.trim()) qs("#favCameraField").value = "Fujifilm X-T5";
    if (!qs("#homeLocationField").value.trim()) qs("#homeLocationField").value = "Mumbai, India";
    saveProfileFromForm();
  });

  qs("#authForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveProfileFromForm();
  });

  qs("#searchInput").addEventListener("input", renderPosts);
  qs("#styleFilter").addEventListener("change", renderPosts);
  qs("#resetFilters").addEventListener("click", () => {
    qs("#searchInput").value = "";
    qs("#styleFilter").value = "all";
    activeView = "all";
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === "all"));
    renderPosts();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      activeView = button.dataset.view;
      renderPosts();
    });
  });

  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-sort]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      activeSort = button.dataset.sort;
      renderPosts();
    });
  });

  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(button.dataset.jump).scrollIntoView({ behavior: "smooth" }));
  });

  qs("#photoUpload").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    qs("#uploadStatus").textContent = "Preparing photo...";
    qs("#uploadStatus").classList.remove("ready");
    setAppStatus("Preparing photo...", "ready", 3000);
    try {
      uploadedImage = await prepareUploadImage(file);
      qs("#uploadPreview").src = uploadedImage;
      qs("#uploadPreview").style.display = "block";
      qs(".upload-box").classList.add("has-image");
      qs(".upload-empty").style.display = "none";
      qs("#uploadStatus").textContent = `${file.name} added. Add the settings, then press Publish to LensLog.`;
      qs("#uploadStatus").classList.add("ready");
      setAppStatus("Picture selected. Press Publish to add it to Feed.", "ready", 5000);
      showToast("Picture selected.");
    } catch (error) {
      uploadedImage = "";
      event.target.value = "";
      qs("#uploadStatus").textContent = error.message || "That picture could not be read. Try another file.";
      qs("#uploadStatus").classList.remove("ready");
      showToast("Picture could not be added.");
    }
  });

  qs("#shareForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!uploadedImage) {
      qs("#uploadStatus").textContent = "Add a picture before publishing.";
      qs("#uploadStatus").classList.remove("ready");
      qs("#photoUpload").focus();
      showToast("Add a picture before publishing.");
      return;
    }
    if (!qs("#consentInput").checked) {
      showToast("Confirm that the photo can be shared publicly.");
      qs("#consentInput").focus();
      return;
    }

    const author = currentAuthor();
    let post = {
      id: uid(),
      mine: true,
      ownerId: state.userId,
      ownerEmail: state.profile.email,
      title: qs("#titleInput").value.trim(),
      location: qs("#locationInput").value.trim(),
      camera: qs("#cameraInput").value.trim(),
      lens: qs("#lensInput").value.trim(),
      iso: qs("#isoInput").value.trim(),
      aperture: qs("#apertureInput").value.trim(),
      shutter: qs("#shutterInput").value.trim(),
      category: qs("#categoryInput").value,
      story: qs("#storyInput").value.trim(),
      author,
      image: uploadedImage,
      likes: 0,
      createdAt: Date.now()
    };

    try {
      const shared = await publishSharedPost(post);
      if (shared.ok) {
        post = {
          ...shared.post,
          mine: true,
          ownerId: state.userId,
          ownerEmail: state.profile.email
        };
      }
    } catch (error) {
      qs("#uploadStatus").textContent = error.message || "Could not publish. Try again.";
      qs("#uploadStatus").classList.remove("ready");
      showToast(error.message || "Could not publish. Try again.");
      return;
    }

    if (!state.myPostIds.includes(post.id)) {
      state.myPostIds = [post.id, ...state.myPostIds].slice(0, 500);
    }
    state.posts = [post, ...state.posts];
    newestPostId = post.id;
    const persisted = saveState();
    event.target.reset();
    uploadedImage = "";
    qs("#uploadPreview").removeAttribute("src");
    qs("#uploadPreview").style.display = "none";
    qs(".upload-box").classList.remove("has-image");
    qs(".upload-empty").style.display = "grid";
    qs("#uploadStatus").textContent = "No photo added yet.";
    qs("#uploadStatus").classList.remove("ready");
    qs("#searchInput").value = "";
    qs("#styleFilter").value = "all";
    activeSort = "recent";
    activeView = "all";
    document.querySelectorAll("[data-sort]").forEach((item) => item.classList.toggle("active", item.dataset.sort === "recent"));
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === "all"));
    updateProfileUI();
    renderPosts();
    showFeedNotice("New shot added", `"${post.title}" is now visible in Feed and My shared shots.`);
    qs("#profileStatus").textContent = `New shot added. Shared shots: ${myPosts().length}.`;
    qs("#profileStatus").classList.add("ready");
    setAppStatus("New shot added to Feed and Profile.", "ready");
    showToast(persisted ? "New shot added." : "New shot added for this session.");
    qs("#feed").scrollIntoView({ behavior: "smooth" });
  });

  window.addEventListener("hashchange", updateActiveNav);
  window.addEventListener("scroll", updateActiveNav, { passive: true });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "http:" && location.protocol !== "https:") return;
  navigator.serviceWorker
    .register("./service-worker.js")
    .then((registration) => registration.update())
    .catch(() => {});
}

function updateActiveNav() {
  const sections = ["feed", "share", "profile"];
  const current = [...sections].reverse().find((id) => document.getElementById(id).getBoundingClientRect().top <= 120) || "feed";
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("href") === `#${current}`);
  });
}

function startApp() {
  try {
    applyTheme();
    bindEvents();
    updateProfileUI();
    renderPosts();
    updateActiveNav();
    registerServiceWorker();
    setAppStatus("LensLog ready.", "ready", 1800);
    loadSharedPosts();
  } catch (error) {
    setAppStatus("LensLog could not start. Refresh the page.", "error");
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", startApp);
