// KlipLink Client Application
// Modern Dark Editorial SaaS Shortlink Manager

const state = {
  authenticated: false,
  username: "admin",
  isDefaultPassword: false,
  requireAuthToCreate: false,
  links: [],
  stats: { total_links: 0, total_clicks: 0 },
  searchQuery: "",
  sortBy: "created_desc",
  activeQrLink: null,
};

// Utilities
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconSvg =
    type === "success"
      ? `<svg class="toast-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`
      : `<svg class="toast-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 200ms ease";
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(isoString) {
  if (!isoString) return "Belum pernah";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

async function copyToClipboard(text, successMsg = "Tautan berhasil disalin!") {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast(successMsg, "success");
    return true;
  } catch (err) {
    console.error("Clipboard copy error:", err);
    showToast("Gagal menyalin tautan", "error");
    return false;
  }
}

// Modal Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "flex";
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "none";
  }
}

// Setup Event Listeners for Modals
document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const modalId = btn.getAttribute("data-close-modal");
    closeModal(modalId);
  });
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      backdrop.style.display = "none";
    }
  });
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-backdrop").forEach((m) => {
      m.style.display = "none";
    });
  }
});

// Authentication API
async function checkAuthStatus() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return;
    const data = await res.json();

    state.authenticated = !!data.authenticated;
    state.username = data.username || "admin";
    state.isDefaultPassword = !!data.is_default_password;
    state.requireAuthToCreate = !!data.require_auth_to_create;

    updateAuthUi();

    if (state.authenticated) {
      await loadDashboardData();
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }
}

function updateAuthUi() {
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navLogoutBtn = document.getElementById("navLogoutBtn");
  const adminSection = document.getElementById("adminSection");
  const defaultPasswordBanner = document.getElementById("defaultPasswordBanner");
  const navLoginText = document.getElementById("navLoginText");

  if (state.authenticated) {
    if (navLoginBtn) navLoginBtn.style.display = "none";
    if (navLogoutBtn) navLogoutBtn.style.display = "inline-flex";
    if (adminSection) adminSection.style.display = "block";
    if (defaultPasswordBanner) {
      defaultPasswordBanner.style.display = state.isDefaultPassword ? "block" : "none";
    }
  } else {
    if (navLoginBtn) {
      navLoginBtn.style.display = "inline-flex";
      navLoginText.textContent = "Masuk Admin";
    }
    if (navLogoutBtn) navLogoutBtn.style.display = "none";
    if (adminSection) adminSection.style.display = "none";
    if (defaultPasswordBanner) defaultPasswordBanner.style.display = "none";
  }
}

// Dashboard Data Loading
async function loadDashboardData() {
  renderSkeleton();
  await Promise.all([fetchStats(), fetchLinks()]);
}

async function fetchStats() {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    const stats = await res.json();
    state.stats = stats;

    const totalLinksEl = document.getElementById("metricTotalLinks");
    const totalClicksEl = document.getElementById("metricTotalClicks");
    const avgClicksEl = document.getElementById("metricAvgClicks");

    if (totalLinksEl) totalLinksEl.textContent = stats.total_links.toLocaleString("id-ID");
    if (totalClicksEl) totalClicksEl.textContent = stats.total_clicks.toLocaleString("id-ID");

    const avg = stats.total_links > 0 ? (stats.total_clicks / stats.total_links).toFixed(1) : "0";
    if (avgClicksEl) avgClicksEl.textContent = avg;
  } catch (err) {
    console.error("Fetch stats error:", err);
  }
}

async function fetchLinks() {
  try {
    const params = new URLSearchParams();
    if (state.searchQuery) params.set("q", state.searchQuery);
    if (state.sortBy) params.set("sort", state.sortBy);

    const res = await fetch(`/api/links?${params.toString()}`);
    if (!res.ok) {
      if (res.status === 401) {
        state.authenticated = false;
        updateAuthUi();
      }
      return;
    }

    const data = await res.json();
    state.links = data.links || [];
    renderLinksList(state.links);
  } catch (err) {
    console.error("Fetch links error:", err);
  }
}

function renderSkeleton() {
  const container = document.getElementById("linksContainer");
  if (!container) return;

  let skeletonHtml = "";
  for (let i = 0; i < 3; i++) {
    skeletonHtml += `
      <div class="skeleton-row">
        <div style="flex: 1;">
          <div class="skeleton-box" style="width: 140px; height: 18px; margin-bottom: 8px;"></div>
          <div class="skeleton-box" style="width: 280px; height: 14px;"></div>
        </div>
        <div style="display: flex; gap: 8px;">
          <div class="skeleton-box" style="width: 50px; height: 30px;"></div>
          <div class="skeleton-box" style="width: 50px; height: 30px;"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = skeletonHtml;
}

function renderLinksList(links) {
  const container = document.getElementById("linksContainer");
  if (!container) return;

  if (links.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <p style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">Belum ada tautan</p>
        <p style="font-size: 0.85rem;">Gunakan formulir di atas untuk memperpendek tautan pertama Anda.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = links
    .map((item) => {
      return `
      <div class="link-item" data-id="${item.id}">
        <div class="link-main">
          <div class="link-slug-row">
            <a href="${escapeHtml(item.short_url)}" target="_blank" rel="noopener noreferrer" class="link-slug">
              /${escapeHtml(item.slug)}
            </a>
            <span class="badge-clicks">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>${item.clicks.toLocaleString("id-ID")} klik</span>
            </span>
            ${
              item.title
                ? `<span class="text-muted" style="font-size: 0.8rem; font-weight: 500;">(${escapeHtml(
                    item.title
                  )})</span>`
                : ""
            }
          </div>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="link-target" title="${escapeHtml(item.url)}">
            ${escapeHtml(item.url)}
          </a>
          <div class="link-meta">
            <span>Dibuat: ${formatDate(item.created_at)}</span>
            <span>Terakhir diklik: ${formatDate(item.last_clicked_at)}</span>
          </div>
        </div>

        <div class="link-actions">
          <button class="btn btn-secondary btn-sm btn-copy-link" data-url="${escapeHtml(item.short_url)}">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            <span>Salin</span>
          </button>

          <button class="btn btn-secondary btn-sm btn-qr-link" data-slug="${escapeHtml(item.slug)}" data-url="${escapeHtml(item.short_url)}">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <span>QR</span>
          </button>

          <button class="btn btn-secondary btn-sm btn-edit-link" data-id="${item.id}">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Edit</span>
          </button>

          <button class="btn btn-danger btn-sm btn-delete-link" data-id="${item.id}" data-slug="${escapeHtml(item.slug)}">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Hapus</span>
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  attachLinkActionHandlers();
}

function attachLinkActionHandlers() {
  // Copy button
  document.querySelectorAll(".btn-copy-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-url");
      copyToClipboard(url);
    });
  });

  // QR button
  document.querySelectorAll(".btn-qr-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slug = btn.getAttribute("data-slug");
      const url = btn.getAttribute("data-url");
      openQrModal(slug, url);
    });
  });

  // Edit button
  document.querySelectorAll(".btn-edit-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const item = state.links.find((l) => l.id === id);
      if (item) openEditModal(item);
    });
  });

  // Delete button
  document.querySelectorAll(".btn-delete-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const slug = btn.getAttribute("data-slug");
      openDeleteModal(id, slug);
    });
  });
}

// QR Modal Handler
async function openQrModal(slug, shortUrl) {
  state.activeQrLink = { slug, shortUrl };
  const qrDisplay = document.getElementById("qrSlugDisplay");
  const qrContainer = document.getElementById("qrContainer");

  if (qrDisplay) qrDisplay.textContent = shortUrl;
  if (qrContainer) {
    qrContainer.innerHTML = '<div class="skeleton-box" style="width: 220px; height: 220px;"></div>';
  }

  openModal("qrModal");

  try {
    const res = await fetch(`/qr/${encodeURIComponent(slug)}`);
    if (res.ok) {
      const svgText = await res.text();
      if (qrContainer) qrContainer.innerHTML = svgText;
    }
  } catch (err) {
    console.error("Failed to load QR code:", err);
  }
}

// Download QR SVG
document.getElementById("btnDownloadQr")?.addEventListener("click", () => {
  if (!state.activeQrLink) return;
  const qrContainer = document.getElementById("qrContainer");
  const svg = qrContainer?.querySelector("svg");
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  const downloadLink = document.createElement("a");
  downloadLink.href = blobUrl;
  downloadLink.download = `${state.activeQrLink.slug}-qr.svg`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(blobUrl);

  showToast("File QR Code SVG berhasil diunduh!", "success");
});

// Edit Modal Handler
function openEditModal(link) {
  const idInput = document.getElementById("editLinkId");
  const slugInput = document.getElementById("editSlug");
  const urlInput = document.getElementById("editUrl");
  const titleInput = document.getElementById("editTitle");
  const errorMsg = document.getElementById("editErrorMsg");

  if (idInput) idInput.value = link.id;
  if (slugInput) slugInput.value = link.slug;
  if (urlInput) urlInput.value = link.url;
  if (titleInput) titleInput.value = link.title || "";
  if (errorMsg) errorMsg.style.display = "none";

  openModal("editModal");
}

document.getElementById("editForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("editLinkId")?.value;
  const slug = document.getElementById("editSlug")?.value.trim();
  const url = document.getElementById("editUrl")?.value.trim();
  const title = document.getElementById("editTitle")?.value.trim() || null;
  const errorMsg = document.getElementById("editErrorMsg");
  const submitBtn = document.getElementById("btnEditSubmit");

  if (!id || !slug || !url) return;

  if (submitBtn) submitBtn.disabled = true;
  if (errorMsg) errorMsg.style.display = "none";

  try {
    const res = await fetch(`/api/links/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, url, title }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (errorMsg) {
        errorMsg.textContent = data.error || "Gagal memperbarui link.";
        errorMsg.style.display = "block";
      }
      return;
    }

    closeModal("editModal");
    showToast("Tautan berhasil diperbarui!", "success");
    await fetchLinks();
  } catch (err) {
    if (errorMsg) {
      errorMsg.textContent = "Terjadi kesalahan jaringan.";
      errorMsg.style.display = "block";
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// Delete Modal Handler
function openDeleteModal(id, slug) {
  const deleteIdInput = document.getElementById("deleteLinkId");
  const deleteSlugSpan = document.getElementById("deleteLinkSlug");

  if (deleteIdInput) deleteIdInput.value = id;
  if (deleteSlugSpan) deleteSlugSpan.textContent = `/${slug}`;

  openModal("deleteModal");
}

document.getElementById("btnConfirmDelete")?.addEventListener("click", async () => {
  const id = document.getElementById("deleteLinkId")?.value;
  if (!id) return;

  const btn = document.getElementById("btnConfirmDelete");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`/api/links/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (res.ok) {
      closeModal("deleteModal");
      showToast("Tautan berhasil dihapus.", "success");
      await loadDashboardData();
    } else {
      const data = await res.json();
      showToast(data.error || "Gagal menghapus tautan", "error");
    }
  } catch {
    showToast("Terjadi kesalahan jaringan saat menghapus", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
});

// Form URL Shortener Handler (Public & Admin)
document.getElementById("createLinkForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const urlInput = document.getElementById("inputUrl");
  const slugInput = document.getElementById("inputSlug");
  const submitBtn = document.getElementById("btnSubmitCreate");
  const resultCard = document.getElementById("resultCard");
  const resultShortUrl = document.getElementById("resultShortUrl");

  const url = urlInput?.value.trim();
  const slug = slugInput?.value.trim() || undefined;

  if (!url) return;

  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, slug }),
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Gagal membuat tautan", "error");
      return;
    }

    const created = data.link;

    // Show result card
    if (resultCard && resultShortUrl) {
      resultShortUrl.href = created.short_url;
      resultShortUrl.textContent = created.short_url;
      resultCard.style.display = "block";

      // Setup result buttons
      const btnCopyResult = document.getElementById("btnCopyResult");
      const btnQrResult = document.getElementById("btnQrResult");

      if (btnCopyResult) {
        btnCopyResult.onclick = () => copyToClipboard(created.short_url);
      }
      if (btnQrResult) {
        btnQrResult.onclick = () => openQrModal(created.slug, created.short_url);
      }
    }

    showToast("Tautan pendek berhasil dibuat!", "success");

    // Clear form
    if (urlInput) urlInput.value = "";
    if (slugInput) slugInput.value = "";

    // If authenticated, refresh dashboard data
    if (state.authenticated) {
      await loadDashboardData();
    }
  } catch (err) {
    console.error("Create link error:", err);
    showToast("Terjadi kesalahan jaringan.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// Search & Sort Handlers
let searchDebounceTimeout = null;
document.getElementById("searchInput")?.addEventListener("input", (e) => {
  const query = e.target.value;
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(async () => {
    state.searchQuery = query;
    await fetchLinks();
  }, 250);
});

document.getElementById("sortSelect")?.addEventListener("change", async (e) => {
  state.sortBy = e.target.value;
  await fetchLinks();
});

document.getElementById("btnRefreshList")?.addEventListener("click", async () => {
  await loadDashboardData();
  showToast("Data tautan telah diperbarui", "success");
});

// Login & Logout Flow
document.getElementById("navLoginBtn")?.addEventListener("click", () => {
  if (state.authenticated) {
    const adminSec = document.getElementById("adminSection");
    adminSec?.scrollIntoView({ behavior: "smooth" });
  } else {
    const errorMsg = document.getElementById("loginErrorMsg");
    if (errorMsg) errorMsg.style.display = "none";
    openModal("loginModal");
    setTimeout(() => document.getElementById("loginPassword")?.focus(), 50);
  }
});

document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const passwordInput = document.getElementById("loginPassword");
  const errorMsg = document.getElementById("loginErrorMsg");
  const submitBtn = document.getElementById("btnLoginSubmit");

  const password = passwordInput?.value.trim();
  if (!password) return;

  if (submitBtn) submitBtn.disabled = true;
  if (errorMsg) errorMsg.style.display = "none";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (errorMsg) {
        errorMsg.textContent = data.error || "Password salah.";
        errorMsg.style.display = "block";
      }
      return;
    }

    closeModal("loginModal");
    if (passwordInput) passwordInput.value = "";
    showToast("Berhasil masuk ke dasbor admin!", "success");

    await checkAuthStatus();

    const adminSec = document.getElementById("adminSection");
    adminSec?.scrollIntoView({ behavior: "smooth" });
  } catch {
    if (errorMsg) {
      errorMsg.textContent = "Terjadi kesalahan jaringan.";
      errorMsg.style.display = "block";
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.getElementById("navLogoutBtn")?.addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
    state.authenticated = false;
    updateAuthUi();
    showToast("Anda telah keluar dari dasbor", "success");
  } catch (err) {
    console.error("Logout error:", err);
  }
});

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  checkAuthStatus();
});
