// KlipLink Client Application - Solid Matte Workbench

const state = {
  authenticated: false,
  username: "admin",
  isDefaultPassword: false,
  requireAuthToCreate: false,
  links: [],
  searchQuery: "",
  sortBy: "created_desc",
  activeQrLink: null,
};

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 150ms ease";
    setTimeout(() => toast.remove(), 150);
  }, 2600);
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(isoString) {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

async function copyToClipboard(text, successMsg = "Tautan berhasil disalin") {
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

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "";
  }
}

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
      document.body.style.overflow = "";
    }
  });
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-backdrop").forEach((m) => {
      m.style.display = "none";
    });
    document.body.style.overflow = "";
  }
});

document.getElementById("btnDismissBanner")?.addEventListener("click", () => {
  const banner = document.getElementById("defaultPasswordBanner");
  if (banner) banner.style.display = "none";
});
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
      await fetchLinks();
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }
}

function updateAuthUi() {
  const navLoginBtn = document.getElementById("navLoginBtn");
  const navLogoutBtn = document.getElementById("navLogoutBtn");
  const userIndicator = document.getElementById("userIndicator");
  const usernameDisplay = document.getElementById("usernameDisplay");
  const adminSection = document.getElementById("adminSection");
  const defaultPasswordBanner = document.getElementById("defaultPasswordBanner");

  if (state.authenticated) {
    if (navLoginBtn) navLoginBtn.style.display = "none";
    if (navLogoutBtn) navLogoutBtn.style.display = "inline-flex";
    if (userIndicator) userIndicator.style.display = "inline-flex";
    if (usernameDisplay) usernameDisplay.textContent = state.username;
    if (adminSection) adminSection.style.display = "block";
    if (defaultPasswordBanner) {
      defaultPasswordBanner.style.display = state.isDefaultPassword ? "block" : "none";
    }
  } else {
    if (navLoginBtn) navLoginBtn.style.display = "inline-flex";
    if (navLogoutBtn) navLogoutBtn.style.display = "none";
    if (userIndicator) userIndicator.style.display = "none";
    if (adminSection) adminSection.style.display = "none";
    if (defaultPasswordBanner) defaultPasswordBanner.style.display = "none";
  }
}

async function fetchLinks() {
  const tbody = document.getElementById("linksTableBody");
  if (tbody && state.links.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Memuat tautan...</td></tr>`;
  }

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

    const badge = document.getElementById("linkCountBadge");
    if (badge) badge.textContent = `${state.links.length} tautan`;

    renderTableRows(state.links);
  } catch (err) {
    console.error("Fetch links error:", err);
  }
}

function renderTableRows(links) {
  const tbody = document.getElementById("linksTableBody");
  if (!tbody) return;

  if (links.length === 0) {
    if (state.searchQuery) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty">
            <p class="table-empty-title">Tidak ada hasil</p>
            <p class="table-empty-desc">Tidak ditemukan tautan yang cocok dengan kata kunci "${escapeHtml(state.searchQuery)}".</p>
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty">
            <p class="table-empty-title">Belum ada tautan</p>
            <p class="table-empty-desc">Tautan yang dibuat akan ditampilkan pada tabel ini.</p>
          </td>
        </tr>`;
    }
    return;
  }

  tbody.innerHTML = links
    .map((item) => {
      return `
      <tr data-id="${item.id}">
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <a href="${escapeHtml(item.short_url)}" target="_blank" rel="noopener noreferrer" class="table-slug-link">
              /${escapeHtml(item.slug)}
            </a>
            <button class="btn btn-secondary btn-sm btn-icon btn-copy-slug" data-url="${escapeHtml(item.short_url)}" title="Salin tautan" type="button" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;">
              Salin
            </button>
          </div>
          ${
            item.title
              ? `<span style="font-size: 0.725rem; color: var(--text-muted); display: block; margin-top: 0.15rem;">${escapeHtml(
                  item.title
                )}</span>`
              : ""
          }
        </td>
        <td>
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="table-url-truncate" title="${escapeHtml(item.url)}">
            ${escapeHtml(item.url)}
          </a>
        </td>
        <td style="text-align: right; font-family: var(--font-mono); font-size: 0.825rem; color: var(--text-secondary);">
          ${item.clicks.toLocaleString("id-ID")}
        </td>
        <td style="font-size: 0.775rem; color: var(--text-muted);">
          ${formatDate(item.created_at)}
        </td>
        <td class="table-actions-cell">
          <button class="btn btn-secondary btn-sm btn-qr-action" data-slug="${escapeHtml(item.slug)}" data-url="${escapeHtml(item.short_url)}" type="button">
            QR
          </button>
          <button class="btn btn-secondary btn-sm btn-edit-action" data-id="${item.id}" type="button">
            Edit
          </button>
          <button class="btn btn-danger btn-sm btn-delete-action" data-id="${item.id}" data-slug="${escapeHtml(item.slug)}" type="button">
            Hapus
          </button>
        </td>
      </tr>`;
    })
    .join("");

  attachTableHandlers();
}

function attachTableHandlers() {
  document.querySelectorAll(".btn-copy-slug").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-url");
      copyToClipboard(url);
    });
  });

  document.querySelectorAll(".btn-qr-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slug = btn.getAttribute("data-slug");
      const url = btn.getAttribute("data-url");
      openQrModal(slug, url);
    });
  });

  document.querySelectorAll(".btn-edit-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const item = state.links.find((l) => l.id === id);
      if (item) openEditModal(item);
    });
  });

  document.querySelectorAll(".btn-delete-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const slug = btn.getAttribute("data-slug");
      openDeleteModal(id, slug);
    });
  });
}

async function openQrModal(slug, shortUrl) {
  state.activeQrLink = { slug, shortUrl };
  const qrDisplay = document.getElementById("qrSlugDisplay");
  const qrContainer = document.getElementById("qrContainer");

  if (qrDisplay) qrDisplay.textContent = shortUrl;
  if (qrContainer) qrContainer.innerHTML = '<span style="color: #555; font-size: 0.8rem;">Memuat QR...</span>';

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

  showToast("File QR SVG berhasil diunduh");
});

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
        errorMsg.textContent = data.error || "Gagal memperbarui tautan.";
        errorMsg.style.display = "block";
      }
      return;
    }

    closeModal("editModal");
    showToast("Tautan berhasil diperbarui");
    await fetchLinks();
  } catch {
    if (errorMsg) {
      errorMsg.textContent = "Terjadi kesalahan koneksi.";
      errorMsg.style.display = "block";
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

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
      showToast("Tautan berhasil dihapus");
      await fetchLinks();
    } else {
      const data = await res.json();
      showToast(data.error || "Gagal menghapus tautan", "error");
    }
  } catch {
    showToast("Terjadi kesalahan koneksi saat menghapus", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
});

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

    if (resultCard && resultShortUrl) {
      resultShortUrl.href = created.short_url;
      resultShortUrl.textContent = created.short_url;
      resultCard.style.display = "block";

      const btnCopyResult = document.getElementById("btnCopyResult");
      const btnQrResult = document.getElementById("btnQrResult");

      if (btnCopyResult) btnCopyResult.onclick = () => copyToClipboard(created.short_url);
      if (btnQrResult) btnQrResult.onclick = () => openQrModal(created.slug, created.short_url);
    }

    showToast("Tautan pendek berhasil dibuat");

    if (urlInput) urlInput.value = "";
    if (slugInput) slugInput.value = "";

    if (state.authenticated) {
      await fetchLinks();
    }
  } catch {
    showToast("Terjadi kesalahan koneksi", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

let searchDebounce = null;
document.getElementById("searchInput")?.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    state.searchQuery = query;
    await fetchLinks();
  }, 200);
});

document.getElementById("sortSelect")?.addEventListener("change", async (e) => {
  state.sortBy = e.target.value;
  await fetchLinks();
});

document.getElementById("btnRefreshList")?.addEventListener("click", async () => {
  await fetchLinks();
  showToast("Daftar tautan diperbarui");
});

document.getElementById("navLoginBtn")?.addEventListener("click", () => {
  const errorMsg = document.getElementById("loginErrorMsg");
  if (errorMsg) errorMsg.style.display = "none";
  openModal("loginModal");
  setTimeout(() => document.getElementById("loginPassword")?.focus(), 50);
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
        errorMsg.textContent = data.error || "Kata sandi salah.";
        errorMsg.style.display = "block";
      }
      return;
    }

    closeModal("loginModal");
    if (passwordInput) passwordInput.value = "";
    showToast("Berhasil masuk");

    await checkAuthStatus();
  } catch {
    if (errorMsg) {
      errorMsg.textContent = "Terjadi kesalahan koneksi.";
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
    showToast("Berhasil keluar");
  } catch (err) {
    console.error("Logout error:", err);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  checkAuthStatus();
});
