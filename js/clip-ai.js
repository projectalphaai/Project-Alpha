/* Project Alpha — Sprint 12: Viral Clip AI (additive, self-contained module)
 * Reuses global helpers already defined by js/dashboard.js (loaded first): showToast,
 * escapeHtml, openModal, closeModal, setButtonLoading. Does not modify any other module.
 */

const CLIP_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube"];
const CLIP_PLATFORM_LABELS = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };
const CLIP_MOMENT_TYPE_LABELS = {
  hook: "Hook",
  emotional: "Emotional",
  scene_change: "Scene change",
  high_energy_audio: "High-energy audio",
  pause: "Pause",
  emphasis: "Emphasis"
};

const clipState = {
  sources: [],
  activeSourceId: null,
  moments: [],
  selectedMomentIds: new Set(),
  autoLoadedMomentsFor: new Set(),
  clips: [],
  libraryFilter: { platform: "", renderStatus: "" },
  topSortBy: "watchTime",
  pollHandle: null
};

// --- Formatting helpers --------------------------------------------------

function clipFmtDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function clipFmtNumber(n) {
  if (n == null || Number.isNaN(n)) return "0";
  return Math.round(n).toLocaleString();
}

function clipFmtBytes(n) {
  if (!n) return "";
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

function clipResolveUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//.test(url)) return url;
  return window.PA_CONFIG?.api?.(url) || url;
}

function clipAiSectionActive() {
  return Boolean(document.getElementById("clip-ai")?.classList.contains("active"));
}

// --- Multipart upload with real progress (js/api.js forces
// Content-Type: application/json on any request body, which breaks
// multipart boundaries — mirrors dashboard.js's uploadMediaFiles workaround,
// using XHR here to also get real upload-progress events). ---
function uploadClipSourceXhr(file, title, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = window.PA_CONFIG?.api?.("/api/clips/sources") || "/api/clips/sources";
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const err = new Error(data?.error || `Upload failed (${xhr.status})`);
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    const formData = new FormData();
    formData.append("video", file);
    if (title) formData.append("title", title);
    xhr.send(formData);
  });
}

// --- Upload UI ------------------------------------------------------------

function initClipUpload() {
  const dropzone = document.getElementById("clip-dropzone");
  const input = document.getElementById("clip-video-input");
  const label = document.getElementById("clip-dropzone-label");
  const form = document.getElementById("clip-upload-form");
  if (!dropzone || !input || !form) return;

  const updateDropzoneLabel = () => {
    const file = input.files?.[0];
    if (label) label.textContent = file ? `${file.name} (${clipFmtBytes(file.size)})` : "Drag a video here or click to browse";
  };

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer?.files?.length) {
      input.files = e.dataTransfer.files;
      updateDropzoneLabel();
    }
  });
  input.addEventListener("change", updateDropzoneLabel);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("clip-upload-error");
    if (errEl) errEl.hidden = true;

    const file = input.files?.[0];
    if (!file) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = "Choose a video file first.";
      }
      return;
    }

    const title = document.getElementById("clip-source-title")?.value.trim() || "";
    const btn = document.getElementById("clip-upload-submit");
    const progressWrap = document.getElementById("clip-upload-progress");
    const progressBar = document.getElementById("clip-upload-progress-bar");
    const progressLabel = document.getElementById("clip-upload-progress-label");

    setButtonLoading(btn, true);
    if (progressWrap) progressWrap.hidden = false;
    if (progressBar) progressBar.style.width = "0%";

    try {
      const data = await uploadClipSourceXhr(file, title, (pct) => {
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressLabel) progressLabel.textContent = `Uploading… ${pct}%`;
      });
      clipState.sources.unshift(data.source);
      renderClipSourceList();
      showToast("Video uploaded — transcription starting in the background", "success");
      form.reset();
      updateDropzoneLabel();
      startClipPolling();
    } catch (err) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || "Upload failed.";
      }
    } finally {
      setButtonLoading(btn, false);
      if (progressWrap) progressWrap.hidden = true;
    }
  });
}

// --- Sources ---------------------------------------------------------------

async function fetchClipSources({ silent = false } = {}) {
  try {
    const data = await AlphaAPI.api("/api/clips/sources");
    clipState.sources = data.sources || [];
    renderClipSourceList();
    maybeAutoLoadMoments();
  } catch (err) {
    if (!silent) showToast(err.message || "Failed to load source videos.", "error");
  }
}

function maybeAutoLoadMoments() {
  if (!clipState.activeSourceId) return;
  const active = clipState.sources.find((s) => s.id === clipState.activeSourceId);
  if (!active) return;
  if (active.status === "ready" && !clipState.autoLoadedMomentsFor.has(active.id)) {
    selectClipSource(active.id, { silent: true });
  } else if (active.status !== "ready") {
    const metaEl = document.getElementById("clip-moments-meta");
    if (metaEl) metaEl.textContent = `Status: ${active.status}…`;
  }
}

function renderClipSourceList() {
  const ul = document.getElementById("clip-source-list");
  const empty = document.getElementById("clip-sources-empty");
  if (!ul) return;

  if (!clipState.sources.length) {
    ul.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  ul.innerHTML = clipState.sources
    .map((s) => {
      const active = s.id === clipState.activeSourceId ? "active" : "";
      const canView = s.status === "ready";
      const created = s.createdAt ? new Date(s.createdAt).toLocaleString() : "";
      return `<li class="clip-source-item ${active}" data-source-id="${escapeHtml(s.id)}">
        <div class="clip-source-info">
          <strong>${escapeHtml(s.title || "Untitled video")}</strong>
          <span class="clip-source-meta">${clipFmtDuration(s.durationSec)} · ${clipFmtBytes(s.sizeBytes)} · ${escapeHtml(created)}</span>
          ${s.errorMessage ? `<span class="clip-source-meta" style="color:#fca5a5">${escapeHtml(s.errorMessage)}</span>` : ""}
        </div>
        <div class="clip-source-actions">
          <span class="clip-status-pill status-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
          <button type="button" class="btn btn-outline-glow btn-sm" data-select-source="${escapeHtml(s.id)}" ${canView ? "" : "disabled"}>View moments</button>
          <button type="button" class="btn btn-outline-glow btn-sm danger" data-delete-source="${escapeHtml(s.id)}">Delete</button>
        </div>
      </li>`;
    })
    .join("");
}

async function selectClipSource(id, { silent = false } = {}) {
  try {
    const data = await AlphaAPI.api(`/api/clips/sources/${id}`);
    clipState.activeSourceId = id;
    clipState.moments = data.moments || [];
    clipState.selectedMomentIds.clear();
    clipState.autoLoadedMomentsFor.add(id);
    renderClipSourceList();
    renderClipMoments();
    if (!silent) document.getElementById("clip-moments-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (!silent) showToast(err.message || "Failed to load moments.", "error");
  }
}

async function handleSourceListClick(e) {
  const viewBtn = e.target.closest("[data-select-source]");
  if (viewBtn) {
    selectClipSource(viewBtn.getAttribute("data-select-source"));
    return;
  }
  const delBtn = e.target.closest("[data-delete-source]");
  if (delBtn) {
    const id = delBtn.getAttribute("data-delete-source");
    try {
      await AlphaAPI.api(`/api/clips/sources/${id}`, { method: "DELETE" });
      clipState.sources = clipState.sources.filter((s) => s.id !== id);
      clipState.clips = clipState.clips.filter((c) => c.sourceId !== id);
      if (clipState.activeSourceId === id) {
        clipState.activeSourceId = null;
        clipState.moments = [];
        const panel = document.getElementById("clip-moments-panel");
        if (panel) panel.hidden = true;
      }
      renderClipSourceList();
      renderClipLibrary();
      showToast("Source video deleted", "info");
    } catch (err) {
      showToast(err.message || "Delete failed.", "error");
    }
  }
}

// --- Moments + clip creation -------------------------------------------

function renderClipPlatformCheckboxes() {
  const grid = document.getElementById("clip-create-platforms-grid");
  if (!grid || grid.dataset.built) return;
  grid.dataset.built = "1";
  grid.innerHTML = CLIP_PLATFORMS.map((p) => {
    const soon = p === "tiktok" || p === "youtube" ? ` <span class="badge-soon">Publish soon</span>` : "";
    return `<label class="platform-checkbox">
      <input type="checkbox" name="clip-platform" value="${p}">
      ${CLIP_PLATFORM_LABELS[p]}${soon}
    </label>`;
  }).join("");
}

function renderClipMoments() {
  const panel = document.getElementById("clip-moments-panel");
  const ul = document.getElementById("clip-moment-list");
  const emptyEl = document.getElementById("clip-moments-empty");
  const titleEl = document.getElementById("clip-moments-source-title");
  const metaEl = document.getElementById("clip-moments-meta");
  if (!panel || !ul) return;

  panel.hidden = false;
  const source = clipState.sources.find((s) => s.id === clipState.activeSourceId);
  if (titleEl) titleEl.textContent = source ? source.title || "Untitled video" : "";
  if (metaEl) metaEl.textContent = source ? `${clipFmtDuration(source.durationSec)} total` : "";

  if (!clipState.moments.length) {
    ul.innerHTML = "";
    if (emptyEl) emptyEl.hidden = false;
  } else {
    if (emptyEl) emptyEl.hidden = true;
    ul.innerHTML = clipState.moments
      .map((m) => {
        const checked = clipState.selectedMomentIds.has(m.id) ? "checked" : "";
        return `<li class="moment-item">
          <input type="checkbox" data-moment-id="${escapeHtml(m.id)}" ${checked}>
          <div class="moment-body">
            <div class="moment-head">
              <span class="moment-type-badge type-${escapeHtml(m.type)}">${escapeHtml(CLIP_MOMENT_TYPE_LABELS[m.type] || m.type)}</span>
              <span class="moment-time">${clipFmtDuration(m.startSec)}–${clipFmtDuration(m.endSec)}</span>
              <span class="moment-score">Score ${m.score}/100</span>
            </div>
            <p class="moment-explanation">${escapeHtml(m.explanation || "")}</p>
          </div>
        </li>`;
      })
      .join("");
  }

  renderClipPlatformCheckboxes();

  const sourceIdInput = document.getElementById("clip-create-source-id");
  if (sourceIdInput) sourceIdInput.value = clipState.activeSourceId || "";

  const startInput = document.getElementById("clip-create-start");
  const endInput = document.getElementById("clip-create-end");
  if (source?.durationSec && startInput && endInput) {
    startInput.max = source.durationSec;
    endInput.max = source.durationSec;
    if (Number(endInput.value) > source.durationSec) endInput.value = source.durationSec.toFixed(1);
  }
}

function handleMomentCheckboxChange(e) {
  const cb = e.target.closest("[data-moment-id]");
  if (!cb) return;
  const id = cb.getAttribute("data-moment-id");
  if (cb.checked) clipState.selectedMomentIds.add(id);
  else clipState.selectedMomentIds.delete(id);
}

function useSelectedMomentsRange() {
  const selected = clipState.moments.filter((m) => clipState.selectedMomentIds.has(m.id));
  if (!selected.length) {
    showToast("Select at least one moment first.", "error");
    return;
  }
  const start = Math.min(...selected.map((m) => m.startSec));
  const end = Math.max(...selected.map((m) => m.endSec));
  const startInput = document.getElementById("clip-create-start");
  const endInput = document.getElementById("clip-create-end");
  if (startInput) startInput.value = start.toFixed(1);
  if (endInput) endInput.value = end.toFixed(1);

  const titleInput = document.getElementById("clip-create-title");
  if (titleInput && !titleInput.value.trim()) {
    const top = [...selected].sort((a, b) => b.score - a.score)[0];
    if (top?.explanation) titleInput.value = top.explanation.slice(0, 120);
  }
}

async function handleCreateClipsSubmit(e) {
  e.preventDefault();
  const sourceId = document.getElementById("clip-create-source-id")?.value;
  if (!sourceId) return;

  const platforms = Array.from(document.querySelectorAll('input[name="clip-platform"]:checked')).map((el) => el.value);
  const platformError = document.getElementById("clip-create-platform-error");
  if (!platforms.length) {
    if (platformError) platformError.hidden = false;
    return;
  }
  if (platformError) platformError.hidden = true;

  const startSec = Number(document.getElementById("clip-create-start")?.value || 0);
  const endSec = Number(document.getElementById("clip-create-end")?.value || 0);
  const title = document.getElementById("clip-create-title")?.value.trim() || "";
  const hashtags = document.getElementById("clip-create-hashtags")?.value.trim() || "";
  const zoom = document.getElementById("clip-create-zoom")?.value || "none";
  const transition = document.getElementById("clip-create-transition")?.value || "none";
  const momentIds = Array.from(clipState.selectedMomentIds);

  const btn = document.getElementById("clip-create-submit");
  setButtonLoading(btn, true);
  try {
    const data = await AlphaAPI.api(`/api/clips/sources/${sourceId}/clips`, {
      method: "POST",
      body: { startSec, endSec, momentIds, platforms, title, hashtags, style: { zoom, transition } }
    });
    showToast(`Queued ${data.clips.length} clip(s) for rendering`, "success");
    clipState.clips = [...data.clips, ...clipState.clips];
    renderClipLibrary();
    startClipPolling();
  } catch (err) {
    showToast(err.message || "Failed to create clips.", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

// --- Clip library ------------------------------------------------------

async function fetchClipLibrary({ silent = false } = {}) {
  try {
    const data = await AlphaAPI.api("/api/clips/clips");
    clipState.clips = data.clips || [];
    renderClipLibrary();
  } catch (err) {
    if (!silent) showToast(err.message || "Failed to load clips.", "error");
  }
}

function updateClipInState(clip) {
  const idx = clipState.clips.findIndex((c) => c.id === clip.id);
  if (idx >= 0) clipState.clips[idx] = clip;
  else clipState.clips.unshift(clip);
  renderClipLibrary();
}

function renderClipLibrary() {
  const grid = document.getElementById("clip-library-grid");
  const empty = document.getElementById("clip-library-empty");
  if (!grid) return;

  let list = clipState.clips;
  if (clipState.libraryFilter.platform) list = list.filter((c) => c.platform === clipState.libraryFilter.platform);
  if (clipState.libraryFilter.renderStatus) list = list.filter((c) => c.renderStatus === clipState.libraryFilter.renderStatus);

  if (!list.length) {
    grid.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = list
    .map((c) => {
      let thumb;
      if (c.renderStatus === "ready" && c.thumbnailUrl) {
        thumb = `<img src="${clipResolveUrl(c.thumbnailUrl)}" alt="">`;
      } else if (c.renderStatus === "ready" && c.outputUrl) {
        thumb = `<video src="${clipResolveUrl(c.outputUrl)}" muted preload="metadata"></video>`;
      } else {
        thumb = `<div class="clip-card-thumb-placeholder">${escapeHtml(c.renderStatus)}…</div>`;
      }
      return `<div class="clip-card" data-clip-id="${escapeHtml(c.id)}">
        <div class="clip-card-thumb">
          ${thumb}
          <span class="clip-render-pill status-${escapeHtml(c.renderStatus)}">${escapeHtml(c.renderStatus)}</span>
          <img class="platform-badge-icon" src="../img/${escapeHtml(c.platform)}.svg" alt="${escapeHtml(c.platform)}" title="${escapeHtml(CLIP_PLATFORM_LABELS[c.platform] || c.platform)}">
        </div>
        <div class="clip-card-body">
          <p class="clip-card-title">${escapeHtml(c.title || "Untitled clip")}</p>
          ${c.hashtags ? `<p class="clip-card-hashtags">${escapeHtml(c.hashtags)}</p>` : ""}
          <span class="clip-card-meta">${clipFmtDuration(c.startSec)}–${clipFmtDuration(c.endSec)} · ${clipFmtDuration((c.endSec || 0) - (c.startSec || 0))} long</span>
          ${c.errorMessage ? `<p class="clip-card-error">${escapeHtml(c.errorMessage)}</p>` : ""}
          <div class="clip-card-actions">
            <button type="button" class="btn btn-outline-glow btn-sm" data-clip-action="edit">Edit</button>
            <button type="button" class="btn btn-outline-glow btn-sm" data-clip-action="duplicate">Duplicate</button>
            <button type="button" class="btn btn-outline-glow btn-sm" data-clip-action="regenerate">Regenerate</button>
            <button type="button" class="btn btn-glow btn-sm" data-clip-action="publish">Publish</button>
            <button type="button" class="btn btn-outline-glow btn-sm danger" data-clip-action="delete">Delete</button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

async function handleClipCardAction(e) {
  const btn = e.target.closest("[data-clip-action]");
  if (!btn) return;
  const card = btn.closest("[data-clip-id]");
  const clipId = card?.getAttribute("data-clip-id");
  if (!clipId) return;
  const action = btn.getAttribute("data-clip-action");

  if (action === "edit") {
    openClipEditor(clipId);
    return;
  }
  if (action === "delete") {
    try {
      await AlphaAPI.api(`/api/clips/clips/${clipId}`, { method: "DELETE" });
      clipState.clips = clipState.clips.filter((c) => c.id !== clipId);
      renderClipLibrary();
      showToast("Clip deleted", "info");
    } catch (err) {
      showToast(err.message || "Delete failed.", "error");
    }
    return;
  }
  if (action === "duplicate") {
    try {
      const data = await AlphaAPI.api(`/api/clips/clips/${clipId}/duplicate`, { method: "POST" });
      clipState.clips.unshift(data.clip);
      renderClipLibrary();
      startClipPolling();
      showToast("Clip duplicated", "success");
    } catch (err) {
      showToast(err.message || "Duplicate failed.", "error");
    }
    return;
  }
  if (action === "regenerate") {
    try {
      const data = await AlphaAPI.api(`/api/clips/clips/${clipId}/regenerate`, { method: "POST" });
      updateClipInState(data.clip);
      startClipPolling();
      showToast("Regenerating clip", "success");
    } catch (err) {
      showToast(err.message || "Regenerate failed.", "error");
    }
    return;
  }
  if (action === "publish") {
    try {
      await AlphaAPI.api(`/api/clips/clips/${clipId}/publish`, { method: "POST" });
      showToast("Clip published", "success");
    } catch (err) {
      showToast(err.message || (err.data?.comingSoon ? "Publishing for this platform is coming soon." : "Publish failed."), err.data?.comingSoon ? "info" : "error");
    }
  }
}

async function generateSimilarClips(clipId, btn) {
  if (!clipId) return;
  if (btn) setButtonLoading(btn, true);
  try {
    const data = await AlphaAPI.api(`/api/clips/clips/${clipId}/generate-similar`, { method: "POST", body: { count: 3 } });
    clipState.clips = [...(data.createdClips || []), ...clipState.clips];
    renderClipLibrary();
    startClipPolling();
    showToast(`${data.explanation ? data.explanation + " — " : ""}${data.createdClips.length} similar clip(s) created`, "success");
  } catch (err) {
    showToast(err.message || "Generate Similar failed.", "error");
  } finally {
    if (btn) setButtonLoading(btn, false);
  }
}

// --- Timeline editor modal -----------------------------------------------

function renderClipEditorRuler(clip) {
  const ruler = document.getElementById("clip-editor-ruler");
  if (!ruler) return;
  const source = clipState.sources.find((s) => s.id === clip.sourceId);
  const total = source?.durationSec || clip.endSec || 1;
  const startPct = Math.max(0, Math.min(100, (clip.startSec / total) * 100));
  const endPct = Math.max(0, Math.min(100, (clip.endSec / total) * 100));
  ruler.innerHTML = `<div class="clip-timeline-range" style="left:${startPct}%;right:${100 - endPct}%"></div>`;
}

async function openClipEditor(clipId) {
  try {
    const data = await AlphaAPI.api(`/api/clips/clips/${clipId}`);
    const clip = data.clip;

    document.getElementById("clip-editor-id").value = clip.id;
    document.getElementById("clip-editor-start").value = clip.startSec;
    document.getElementById("clip-editor-end").value = clip.endSec;
    document.getElementById("clip-editor-title-input").value = clip.title || "";
    document.getElementById("clip-editor-hashtags").value = clip.hashtags || "";
    document.getElementById("clip-editor-zoom").value = clip.style?.zoom || "none";
    document.getElementById("clip-editor-transition").value = clip.style?.transition || "none";

    const pill = document.getElementById("clip-editor-status-pill");
    if (pill) {
      pill.textContent = clip.renderStatus;
      pill.className = `clip-render-pill status-${clip.renderStatus}`;
    }

    const video = document.getElementById("clip-editor-video");
    const videoEmpty = document.getElementById("clip-editor-video-empty");
    if (clip.renderStatus === "ready" && clip.outputUrl) {
      video.src = clipResolveUrl(clip.outputUrl);
      video.hidden = false;
      if (videoEmpty) videoEmpty.hidden = true;
    } else {
      video.removeAttribute("src");
      video.hidden = true;
      if (videoEmpty) videoEmpty.hidden = false;
    }

    const renderErr = document.getElementById("clip-editor-render-error");
    if (renderErr) {
      if (clip.renderStatus === "failed" && clip.errorMessage) {
        renderErr.hidden = false;
        renderErr.textContent = clip.errorMessage;
      } else {
        renderErr.hidden = true;
      }
    }

    const aiBox = document.getElementById("clip-editor-ai-explanation");
    const aiText = document.getElementById("clip-editor-ai-explanation-text");
    if (aiBox && aiText) {
      if (clip.aiExplanation?.momentExplanation) {
        aiBox.hidden = false;
        const pct = Math.round((clip.aiExplanation.similarity || 0) * 100);
        aiText.textContent = `Generated as similar to a previous clip (similarity ${pct}%): ${clip.aiExplanation.momentExplanation}`;
      } else {
        aiBox.hidden = true;
      }
    }

    renderClipEditorRuler(clip);

    const mergeSelect = document.getElementById("clip-editor-merge-select");
    if (mergeSelect) {
      const others = clipState.clips.filter((c) => c.sourceId === clip.sourceId && c.id !== clip.id);
      mergeSelect.innerHTML =
        `<option value="">Select a clip…</option>` +
        others
          .map(
            (c) =>
              `<option value="${escapeHtml(c.id)}">${escapeHtml(c.title || CLIP_PLATFORM_LABELS[c.platform] || c.platform)} (${clipFmtDuration(c.startSec)}–${clipFmtDuration(c.endSec)})</option>`
          )
          .join("");
    }

    const pubList = document.getElementById("clip-editor-publications-list");
    const pubEmpty = document.getElementById("clip-editor-analytics-empty");
    if (pubList && pubEmpty) {
      if (!data.publications?.length) {
        pubList.innerHTML = "";
        pubEmpty.hidden = false;
      } else {
        pubEmpty.hidden = true;
        pubList.innerHTML = data.publications
          .map((p) => `<li>${escapeHtml(CLIP_PLATFORM_LABELS[p.platform] || p.platform)} — ${escapeHtml(p.status)}${p.errorMessage ? ` (${escapeHtml(p.errorMessage)})` : ""}</li>`)
          .join("");
      }
    }

    openModal("clip-editor-modal");
  } catch (err) {
    showToast(err.message || "Failed to load clip.", "error");
  }
}

function initClipEditorModalHandlers() {
  ["clip-editor-start", "clip-editor-end"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      const clipId = document.getElementById("clip-editor-id")?.value;
      const clip = clipState.clips.find((c) => c.id === clipId);
      if (!clip) return;
      renderClipEditorRuler({
        ...clip,
        startSec: Number(document.getElementById("clip-editor-start")?.value || 0),
        endSec: Number(document.getElementById("clip-editor-end")?.value || 0)
      });
    });
  });

  document.getElementById("clip-editor-save-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("clip-editor-save-btn");
    const clipId = document.getElementById("clip-editor-id")?.value;
    if (!clipId) return;
    setButtonLoading(btn, true);
    try {
      const body = {
        startSec: Number(document.getElementById("clip-editor-start")?.value || 0),
        endSec: Number(document.getElementById("clip-editor-end")?.value || 0),
        title: document.getElementById("clip-editor-title-input")?.value.trim() || "",
        hashtags: document.getElementById("clip-editor-hashtags")?.value.trim() || "",
        style: {
          zoom: document.getElementById("clip-editor-zoom")?.value || "none",
          transition: document.getElementById("clip-editor-transition")?.value || "none"
        }
      };
      const data = await AlphaAPI.api(`/api/clips/clips/${clipId}`, { method: "PUT", body });
      updateClipInState(data.clip);
      showToast("Saved — clip is re-rendering", "success");
      startClipPolling();
      await openClipEditor(clipId);
    } catch (err) {
      showToast(err.message || "Failed to save clip.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });

  document.getElementById("clip-editor-delete-btn")?.addEventListener("click", async () => {
    const clipId = document.getElementById("clip-editor-id")?.value;
    if (!clipId) return;
    try {
      await AlphaAPI.api(`/api/clips/clips/${clipId}`, { method: "DELETE" });
      clipState.clips = clipState.clips.filter((c) => c.id !== clipId);
      renderClipLibrary();
      closeModal("clip-editor-modal");
      showToast("Clip deleted", "info");
    } catch (err) {
      showToast(err.message || "Delete failed.", "error");
    }
  });

  document.getElementById("clip-editor-duplicate-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("clip-editor-duplicate-btn");
    const clipId = document.getElementById("clip-editor-id")?.value;
    if (!clipId) return;
    setButtonLoading(btn, true);
    try {
      const data = await AlphaAPI.api(`/api/clips/clips/${clipId}/duplicate`, { method: "POST" });
      clipState.clips.unshift(data.clip);
      renderClipLibrary();
      startClipPolling();
      showToast("Clip duplicated", "success");
      closeModal("clip-editor-modal");
    } catch (err) {
      showToast(err.message || "Duplicate failed.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });

  document.getElementById("clip-editor-regenerate-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("clip-editor-regenerate-btn");
    const clipId = document.getElementById("clip-editor-id")?.value;
    if (!clipId) return;
    setButtonLoading(btn, true);
    try {
      const data = await AlphaAPI.api(`/api/clips/clips/${clipId}/regenerate`, { method: "POST" });
      updateClipInState(data.clip);
      startClipPolling();
      showToast("Regenerating clip", "success");
      await openClipEditor(clipId);
    } catch (err) {
      showToast(err.message || "Regenerate failed.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });

  document.getElementById("clip-editor-merge-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("clip-editor-merge-btn");
    const clipId = document.getElementById("clip-editor-id")?.value;
    const withClipId = document.getElementById("clip-editor-merge-select")?.value;
    if (!clipId || !withClipId) {
      showToast("Select a clip to merge with.", "error");
      return;
    }
    setButtonLoading(btn, true);
    try {
      const data = await AlphaAPI.api(`/api/clips/clips/${clipId}/merge`, { method: "POST", body: { withClipId } });
      clipState.clips.unshift(data.clip);
      renderClipLibrary();
      startClipPolling();
      showToast("Clips merged into a new clip", "success");
      closeModal("clip-editor-modal");
    } catch (err) {
      showToast(err.message || "Merge failed.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });

  document.getElementById("clip-editor-publish-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("clip-editor-publish-btn");
    const clipId = document.getElementById("clip-editor-id")?.value;
    if (!clipId) return;
    setButtonLoading(btn, true);
    try {
      await AlphaAPI.api(`/api/clips/clips/${clipId}/publish`, { method: "POST" });
      showToast("Clip published", "success");
      await openClipEditor(clipId);
    } catch (err) {
      showToast(err.message || (err.data?.comingSoon ? "Publishing for this platform is coming soon." : "Publish failed."), err.data?.comingSoon ? "info" : "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });

  document.getElementById("clip-editor-generate-similar-btn")?.addEventListener("click", async (e) => {
    const clipId = document.getElementById("clip-editor-id")?.value;
    await generateSimilarClips(clipId, e.currentTarget);
    closeModal("clip-editor-modal");
  });
}

// --- Top Performing Clips ------------------------------------------------

async function loadTopPerformingClips() {
  const select = document.getElementById("top-clips-sort");
  clipState.topSortBy = select?.value || "watchTime";
  await fetchTopPerformingClips();
}

async function fetchTopPerformingClips() {
  const table = document.getElementById("top-clips-table");
  const empty = document.getElementById("top-clips-empty");
  const tbody = document.getElementById("top-clips-tbody");
  if (empty) {
    empty.hidden = false;
    empty.textContent = "Loading…";
  }
  if (table) table.hidden = true;

  try {
    const data = await AlphaAPI.api(`/api/clips/clips/top-performing?sortBy=${encodeURIComponent(clipState.topSortBy)}`);
    if (!data.hasData) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = data.message || "No clips have real analytics yet.";
      }
      if (table) table.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (table) table.hidden = false;
    if (tbody) {
      tbody.innerHTML = data.clips
        .map((row, idx) => {
          const c = row.clip;
          const m = row.metrics;
          return `<tr data-clip-id="${escapeHtml(c.id)}">
            <td><span class="rank-badge">${idx + 1}</span></td>
            <td><div class="clip-title-cell">${c.thumbnailUrl ? `<img src="${clipResolveUrl(c.thumbnailUrl)}" alt="">` : ""}<span>${escapeHtml(c.title || "Untitled clip")}</span></div></td>
            <td>${escapeHtml(CLIP_PLATFORM_LABELS[c.platform] || c.platform)}</td>
            <td>${clipFmtNumber(m.views)}</td>
            <td>${clipFmtDuration(m.watchTimeSec)}</td>
            <td>${m.retentionPct != null ? `${m.retentionPct.toFixed(1)}%` : "—"}</td>
            <td>${clipFmtNumber(m.shares)}</td>
            <td>${clipFmtNumber(m.saves)}</td>
            <td>${clipFmtNumber(m.comments)}</td>
            <td>${clipFmtNumber(m.reach)}</td>
            <td>${clipFmtNumber(m.followersGained)}</td>
            <td><button type="button" class="btn btn-outline-glow btn-sm" data-generate-similar="${escapeHtml(c.id)}">Generate Similar</button></td>
          </tr>`;
        })
        .join("");
    }
  } catch (err) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = err.message || "Failed to load ranking.";
    }
    if (table) table.hidden = true;
  }
}

function handleTopClipsTableClick(e) {
  const btn = e.target.closest("[data-generate-similar]");
  if (!btn) return;
  generateSimilarClips(btn.getAttribute("data-generate-similar"), btn);
}

// --- Init / polling ------------------------------------------------------

function startClipPolling() {
  if (clipState.pollHandle) return;
  clipState.pollHandle = setInterval(async () => {
    const hasPendingSource = clipState.sources.some((s) => ["uploaded", "transcribing", "analyzing"].includes(s.status));
    const hasPendingClip = clipState.clips.some((c) => ["queued", "rendering"].includes(c.renderStatus));
    if (!clipAiSectionActive() || (!hasPendingSource && !hasPendingClip)) {
      clearInterval(clipState.pollHandle);
      clipState.pollHandle = null;
      return;
    }
    if (hasPendingSource) await fetchClipSources({ silent: true });
    if (hasPendingClip) await fetchClipLibrary({ silent: true });
  }, 4000);
}

async function loadClipAiSectionData() {
  await fetchClipSources();
  await fetchClipLibrary();
  startClipPolling();
}

function bindClipAiSectionTriggers() {
  document.querySelectorAll('.sidebar-nav a[data-section="clip-ai"]').forEach((a) => {
    a.addEventListener("click", () => loadClipAiSectionData());
  });
  document.querySelectorAll('.sidebar-nav a[data-section="top-performing-clips"]').forEach((a) => {
    a.addEventListener("click", () => loadTopPerformingClips());
  });

  const hash = window.location.hash.replace("#", "");
  if (hash === "clip-ai") loadClipAiSectionData();
  if (hash === "top-performing-clips") loadTopPerformingClips();
}

function initClipAiModule() {
  initClipUpload();
  bindClipAiSectionTriggers();
  initClipEditorModalHandlers();

  document.getElementById("clip-filter-platform")?.addEventListener("change", (e) => {
    clipState.libraryFilter.platform = e.target.value;
    renderClipLibrary();
  });
  document.getElementById("clip-filter-status")?.addEventListener("change", (e) => {
    clipState.libraryFilter.renderStatus = e.target.value;
    renderClipLibrary();
  });
  document.getElementById("clip-use-selected-moments")?.addEventListener("click", useSelectedMomentsRange);
  document.getElementById("clip-create-form")?.addEventListener("submit", handleCreateClipsSubmit);
  document.getElementById("clip-source-list")?.addEventListener("click", handleSourceListClick);
  document.getElementById("clip-moment-list")?.addEventListener("change", handleMomentCheckboxChange);
  document.getElementById("clip-library-grid")?.addEventListener("click", handleClipCardAction);
  document.getElementById("top-clips-sort")?.addEventListener("change", loadTopPerformingClips);
  document.getElementById("top-clips-tbody")?.addEventListener("click", handleTopClipsTableClick);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.AlphaAuth || !window.AlphaAPI) return;
  const session = await AlphaAuth.getSession();
  if (!session) return;
  initClipAiModule();
});
