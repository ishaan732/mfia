const ADMIN_PASS_KEY = "lenslog-admin-pass-v1";
const memoryStore = {};

const qs = (selector) => document.querySelector(selector);
const fmtDate = (value) => (value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never");
const initials = (value) => {
  const parts = String(value || "Admin").split(/[.\s_-]+/).filter(Boolean);
  return `${parts[0]?.[0] || "A"}${parts[1]?.[0] || parts[0]?.[1] || "D"}`.toUpperCase();
};

let adminPass = readStored(ADMIN_PASS_KEY) || "";
let access = null;
let toastTimer;

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore[key] || "";
  }
}

function writeStored(key, value) {
  memoryStore[key] = value;
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function removeStored(key) {
  delete memoryStore[key];
  try {
    localStorage.removeItem(key);
  } catch {}
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function permission(name) {
  return access?.permissions?.includes(name);
}

function isOwner() {
  return access?.role === "owner";
}

async function api(path, options = {}) {
  const headers = {
    "Accept": "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {})
  };
  if (options.auth !== false && adminPass) headers["X-Admin-Pass"] = adminPass;

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function unlock(passCode) {
  const data = await api("/api/admin/session", {
    method: "POST",
    auth: false,
    body: { passCode }
  });
  adminPass = passCode;
  access = data.access;
  writeStored(ADMIN_PASS_KEY, adminPass);
  showDashboard();
  await loadDashboard();
}

function showDashboard() {
  qs("#loginPanel").hidden = true;
  qs("#dashboardPanel").hidden = false;
  qs("#forgetPass").hidden = false;
  qs("#adminName").textContent = access.label;
  qs("#adminRole").textContent = access.roleLabel;
  qs("#adminAvatar").textContent = initials(access.label);
  qs("#passPanel").hidden = !isOwner();
  refreshIcons();
}

function showLogin(message = "") {
  qs("#loginPanel").hidden = false;
  qs("#dashboardPanel").hidden = true;
  qs("#forgetPass").hidden = true;
  qs("#loginStatus").textContent = message;
  qs("#loginStatus").classList.toggle("ready", !message);
  refreshIcons();
}

async function loadDashboard() {
  const posts = await api("/api/admin/posts");
  if (posts.access) access = posts.access;
  renderPosts(posts.posts);

  if (isOwner()) {
    const passes = await api("/api/admin/passes");
    renderPasses(passes.passes);
  }

  showDashboard();
}

function renderPasses(passes) {
  const list = qs("#passList");
  if (!passes.length) {
    list.innerHTML = '<p class="admin-empty">No passes created yet.</p>';
    return;
  }

  list.innerHTML = passes
    .map((pass) => {
      const revoked = Boolean(pass.revokedAt);
      const canRevoke = !revoked && isOwner();
      return `
        <article class="admin-row ${revoked ? "is-revoked" : ""}">
          <div>
            <strong>${escapeHtml(pass.label)}</strong>
            <span>${escapeHtml(pass.email || "No Gmail set")}</span>
            <span>Admin pass ${pass.number ? `#${String(pass.number).padStart(3, "0")}` : ""} - created ${fmtDate(pass.createdAt)}</span>
            <span>Last used: ${fmtDate(pass.lastUsedAt)}</span>
          </div>
          <div class="admin-row-actions">
            <span class="admin-pill">${revoked ? "Revoked" : "Active"}</span>
            ${
              canRevoke
                ? `<button class="secondary-button" data-revoke-pass="${pass.id}" type="button"><i data-lucide="ban"></i> Revoke</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
  refreshIcons();
}

function renderPosts(posts) {
  const list = qs("#adminPostList");
  if (!posts.length) {
    list.innerHTML = '<p class="admin-empty">No shared photos yet.</p>';
    return;
  }

  list.innerHTML = posts
    .map((post) => {
      const removed = Boolean(post.deletedAt);
      const hidden = Boolean(post.hidden);
      return `
        <article class="admin-row post-admin-row ${removed ? "is-revoked" : ""}">
          <img src="${escapeHtml(post.image)}" alt="" />
          <div>
            <strong>${escapeHtml(post.title)}</strong>
            <span>${escapeHtml(post.location)} - ${escapeHtml(post.camera)}</span>
            <span>By ${escapeHtml(post.author)}${post.authorEmail ? ` - ${escapeHtml(post.authorEmail)}` : ""}</span>
            <span>Reports: ${post.reports || 0} - ${removed ? "Removed" : hidden ? "Hidden" : "Visible"}</span>
          </div>
          <div class="admin-row-actions">
            ${
              permission("moderatePosts") && !removed
                ? `<button class="secondary-button" data-toggle-post="${post.id}" data-hidden="${hidden}" type="button"><i data-lucide="${
                    hidden ? "eye" : "eye-off"
                  }"></i> ${hidden ? "Show" : "Hide"}</button>
                  <button class="secondary-button danger-button" data-remove-post="${post.id}" type="button"><i data-lucide="trash-2"></i> Remove</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
  refreshIcons();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bindEvents() {
  qs("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    qs("#loginStatus").textContent = "Checking pass...";
    try {
      await unlock(qs("#passCodeInput").value.trim());
      showToast("Admin unlocked.");
    } catch (error) {
      qs("#loginStatus").textContent = error.message;
      qs("#loginStatus").classList.remove("ready");
    }
  });

  qs("#forgetPass").addEventListener("click", () => {
    adminPass = "";
    access = null;
    removeStored(ADMIN_PASS_KEY);
    qs("#passCodeInput").value = "";
    showLogin("Pass forgotten.");
  });

  qs("#refreshPosts").addEventListener("click", () => loadDashboard().catch((error) => showToast(error.message)));
  qs("#refreshPasses").addEventListener("click", () => loadDashboard().catch((error) => showToast(error.message)));

  qs("#passForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await api("/api/admin/passes", {
        method: "POST",
        body: {
          label: qs("#passLabelInput").value.trim(),
          email: qs("#passEmailInput").value.trim()
        }
      });
      qs("#newPassBox").hidden = false;
      qs("#newPassCode").value = data.code;
      event.target.reset();
      showToast("Admin pass created.");
      await loadDashboard();
    } catch (error) {
      showToast(error.message);
    }
  });

  qs("#copyPass").addEventListener("click", async () => {
    const code = qs("#newPassCode").value;
    try {
      await navigator.clipboard.writeText(code);
      showToast("Pass copied.");
    } catch {
      qs("#newPassCode").select();
      showToast("Pass selected.");
    }
  });

  document.addEventListener("click", async (event) => {
    const revokeButton = event.target.closest("[data-revoke-pass]");
    const toggleButton = event.target.closest("[data-toggle-post]");
    const removeButton = event.target.closest("[data-remove-post]");

    try {
      if (revokeButton) {
        revokeButton.disabled = true;
        await api(`/api/admin/passes/${revokeButton.dataset.revokePass}`, { method: "DELETE" });
        showToast("Pass revoked.");
        await loadDashboard();
      }

      if (toggleButton) {
        toggleButton.disabled = true;
        const hidden = toggleButton.dataset.hidden === "true";
        await api(`/api/admin/posts/${toggleButton.dataset.togglePost}`, {
          method: "PATCH",
          body: {
            hidden: !hidden,
            hiddenReason: hidden ? "" : `Hidden by ${access.label}`
          }
        });
        showToast(hidden ? "Photo shown." : "Photo hidden.");
        await loadDashboard();
      }

      if (removeButton) {
        removeButton.disabled = true;
        await api(`/api/admin/posts/${removeButton.dataset.removePost}`, { method: "DELETE" });
        showToast("Photo removed.");
        await loadDashboard();
      }
    } catch (error) {
      showToast(error.message);
      await loadDashboard().catch(() => {});
    }
  });
}

async function startAdmin() {
  bindEvents();
  refreshIcons();
  if (!adminPass) {
    showLogin();
    return;
  }
  try {
    await unlock(adminPass);
  } catch {
    adminPass = "";
    removeStored(ADMIN_PASS_KEY);
    showLogin("Saved pass expired or was revoked.");
  }
}

document.addEventListener("DOMContentLoaded", startAdmin);
