// MangaLens Content Script
// Translates comic images in-place on webtoon/manga reading sites.
// Supports both direct image capture (non-DRM) and canvas capture (DRM sites).

(function () {
  "use strict";

  if (window.__mangalensLoaded) return;
  window.__mangalensLoaded = true;

  // ── Constants ───────────────────────────────────────────────────────
  const ML_ATTR = "data-mangalens";
  const ML_PREFIX = "mangalens";
  const MIN_IMG_W = 200;
  const MIN_IMG_H = 300;
  const POLL_INTERVAL = 1500;
  const POLL_TIMEOUT = 300; // seconds

  // ── Site Detection ──────────────────────────────────────────────────
  const SITE_CONFIGS = {
    "comic.naver.com": {
      name: "Naver Webtoon",
      method: "direct",
      defaultLang: "ko",
      selectors: [".wt_viewer img", "#comic_view_area img", ".viewer-img img"],
      reading: "vertical",
    },
    "www.webtoons.com": {
      name: "Webtoons",
      method: "direct",
      defaultLang: "auto",
      selectors: [".viewer_img img", "#_imageList img", "._images img"],
      reading: "vertical",
    },
    "page.kakao.com": {
      name: "Kakao Page",
      method: "canvas",
      defaultLang: "ko",
      selectors: ["canvas", ".css-1jxcs1 img", ".page-viewer img"],
      reading: "vertical",
      drm: true,
    },
    "mangadex.org": {
      name: "MangaDex",
      method: "direct",
      defaultLang: "ja",
      selectors: [".md--page img", ".reader--page img"],
      reading: "horizontal",
    },
    "mangaplus.shueisha.co.jp": {
      name: "Manga Plus",
      method: "canvas",
      defaultLang: "ja",
      selectors: ["canvas", ".zao-image img", ".page-image img"],
      reading: "horizontal",
      drm: true,
    },
    "lezhin.com": {
      name: "Lezhin Comics",
      method: "canvas",
      defaultLang: "ko",
      selectors: ["canvas", ".lzCnts img"],
      reading: "vertical",
      drm: true,
    },
    "toomics.com": {
      name: "Toomics",
      method: "canvas",
      defaultLang: "ko",
      selectors: ["canvas", ".toon_img img"],
      reading: "vertical",
      drm: true,
    },
    "tapas.io": {
      name: "Tapas",
      method: "direct",
      defaultLang: "en",
      selectors: [".viewer__body img", ".js-episode-article img"],
      reading: "vertical",
    },
    "tappytoon.com": {
      name: "Tappytoon",
      method: "direct",
      defaultLang: "ko",
      selectors: [".viewer-page img", ".episode-viewer img"],
      reading: "vertical",
    },
    "rawdevart.com": {
      name: "RawDevArt",
      method: "direct",
      defaultLang: "ja",
      selectors: ["#img-reader-container img", ".page-break img"],
      reading: "horizontal",
    },
    "raw.senmanga.com": {
      name: "SenManga",
      method: "direct",
      defaultLang: "ja",
      selectors: ["#viewer img", ".reader-main img"],
      reading: "horizontal",
    },
    "manganato.com": {
      name: "Manganato",
      method: "direct",
      defaultLang: "ja",
      selectors: [".container-chapter-reader img"],
      reading: "vertical",
    },
    "chapmanganato.to": {
      name: "Manganato",
      method: "direct",
      defaultLang: "ja",
      selectors: [".container-chapter-reader img"],
      reading: "vertical",
    },
    "readmanganato.com": {
      name: "Manganato",
      method: "direct",
      defaultLang: "ja",
      selectors: [".container-chapter-reader img"],
      reading: "vertical",
    },
    "www.mangago.me": {
      name: "Mangago",
      method: "direct",
      defaultLang: "ja",
      selectors: ["#page1 img", ".page-img img"],
      reading: "horizontal",
    },
  };

  const hostname = window.location.hostname;
  const siteConfig = SITE_CONFIGS[hostname] || null;

  // ── State ───────────────────────────────────────────────────────────
  let translationState = {
    active: false,
    progress: 0,
    total: 0,
    stage: "",
    chapterId: null,
    showOriginal: false,
  };
  let floatingPanel = null;
  let _cachedSeries = {};

  // ── Message Listener ────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case "translate":
        translatePage(message.apiUrl, message.sourceLang, message.targetLang, message.mode);
        sendResponse({ ok: true });
        break;

      case "translate_selected":
        enableSelectionMode(message.apiUrl, message.sourceLang, message.targetLang);
        sendResponse({ ok: true });
        break;

      case "get_page_info":
        sendResponse({
          hostname,
          siteConfig: siteConfig
            ? { name: siteConfig.name, method: siteConfig.method, reading: siteConfig.reading, drm: !!siteConfig.drm }
            : null,
          imageCount: findComicImages().length,
          title: document.title,
          url: window.location.href,
        });
        break;

      case "toggle_original":
        toggleAllImages();
        sendResponse({ ok: true });
        break;
    }
    return false;
  });

  // ── Full Page Translation ───────────────────────────────────────────
  async function translatePage(apiUrl, sourceLang, targetLang, mode) {
    if (translationState.active) {
      showNotification("Translation already in progress", "warning");
      return;
    }

    const images = findComicImages();
    if (images.length === 0) {
      showNotification("No comic images found on this page.", "warning");
      return;
    }

    translationState.active = true;
    translationState.total = images.length;
    translationState.progress = 0;

    showFloatingPanel();
    updatePanel("Capturing images...", 0, images.length);

    const seriesTitle = buildSeriesTitle();
    let series;

    try {
      series = await getOrCreateSeries(apiUrl, seriesTitle, sourceLang, targetLang);
    } catch (err) {
      showNotification("Failed to connect to MangaLens backend", "error");
      hideFloatingPanel();
      translationState.active = false;
      return;
    }

    // Capture images based on site method
    const captureMethod = siteConfig?.method === "canvas" ? captureViaCanvas : captureViaImage;
    const captured = [];

    for (let i = 0; i < images.length; i++) {
      const el = images[i];
      el.setAttribute(ML_ATTR, "processing");
      updatePanel(`Capturing image ${i + 1}/${images.length}...`, i, images.length);

      try {
        const dataUrl = await captureMethod(el);
        if (dataUrl) {
          captured.push({ el, dataUrl, index: i });
        }
      } catch (err) {
        console.warn("MangaLens: Failed to capture image", i, err);
      }
    }

    if (captured.length === 0) {
      showNotification("Could not capture any images", "error");
      hideFloatingPanel();
      translationState.active = false;
      return;
    }

    updatePanel("Uploading to MangaLens...", 0, 1);

    try {
      // Upload via background script (avoids CORS)
      const uploadResult = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "UPLOAD_IMAGES",
            apiUrl,
            seriesId: series.id,
            chapterNumber: Date.now(),
            images: captured.map((c) => c.dataUrl),
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response.ok) {
              reject(new Error(response.error || "Upload failed"));
            } else {
              resolve(response.chapter);
            }
          }
        );
      });

      translationState.chapterId = uploadResult.id;

      // Poll for pipeline completion, try WebSocket first
      await trackProgress(apiUrl, uploadResult.id);

      // Fetch translated pages
      const pagesResp = await apiFetch(`${apiUrl}/api/chapters/${uploadResult.id}/pages`);
      const pages = pagesResp.sort((a, b) => a.page_number - b.page_number);

      let translatedCount = 0;
      for (let i = 0; i < Math.min(captured.length, pages.length); i++) {
        const page = pages[i];
        const { el } = captured[i];

        if (page.translated_path) {
          const translatedUrl = `${apiUrl}/${page.translated_path}`;
          el.dataset.mlOriginalSrc = el.src || el.dataset.src || "";
          el.dataset.mlTranslatedSrc = translatedUrl;
          el.src = translatedUrl;
          el.setAttribute(ML_ATTR, "translated");
          addToggleButton(el);
          translatedCount++;
        } else {
          el.setAttribute(ML_ATTR, "no-text");
        }
      }

      updatePanel(`Done! ${translatedCount}/${captured.length} pages translated`, captured.length, captured.length);
      showNotification(`Translated ${translatedCount} page(s)!`, "success");

      setTimeout(() => hideFloatingPanel(), 4000);
    } catch (err) {
      console.error("MangaLens:", err);
      showNotification(`Translation failed: ${err.message}`, "error");
      updatePanel(`Error: ${err.message}`, 0, 1, true);
    } finally {
      translationState.active = false;
    }
  }

  // ── Selection Mode ──────────────────────────────────────────────────
  function enableSelectionMode(apiUrl, sourceLang, targetLang) {
    showNotification("Click on an image to translate it", "info");
    document.body.classList.add(`${ML_PREFIX}-selection-mode`);

    function onClick(e) {
      const el = e.target.closest("img") || e.target.closest("canvas");
      if (!el) return;

      e.preventDefault();
      e.stopPropagation();
      document.body.classList.remove(`${ML_PREFIX}-selection-mode`);
      document.removeEventListener("click", onClick, true);

      translateSingleImage(el, apiUrl, sourceLang, targetLang);
    }

    document.addEventListener("click", onClick, true);

    // ESC to cancel
    function onKeyDown(e) {
      if (e.key === "Escape") {
        document.body.classList.remove(`${ML_PREFIX}-selection-mode`);
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKeyDown);
        showNotification("Selection cancelled", "info");
      }
    }
    document.addEventListener("keydown", onKeyDown);
  }

  async function translateSingleImage(el, apiUrl, sourceLang, targetLang) {
    const overlay = createProgressOverlay(el, "Capturing...");

    try {
      const captureMethod = siteConfig?.method === "canvas" ? captureViaCanvas : captureViaImage;
      const dataUrl = await captureMethod(el);
      if (!dataUrl) throw new Error("Could not capture image");

      setOverlayText(overlay, "Uploading...");

      const seriesTitle = buildSeriesTitle();
      const series = await getOrCreateSeries(apiUrl, seriesTitle, sourceLang, targetLang);

      const uploadResult = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "UPLOAD_IMAGES",
            apiUrl,
            seriesId: series.id,
            chapterNumber: Date.now(),
            images: [dataUrl],
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response.ok) {
              reject(new Error(response.error || "Upload failed"));
            } else {
              resolve(response.chapter);
            }
          }
        );
      });

      // Poll with overlay updates
      await trackProgressWithOverlay(apiUrl, uploadResult.id, overlay);

      const pagesResp = await apiFetch(`${apiUrl}/api/chapters/${uploadResult.id}/pages`);

      if (pagesResp[0]?.translated_path) {
        const translatedUrl = `${apiUrl}/${pagesResp[0].translated_path}`;
        el.dataset.mlOriginalSrc = el.src || "";
        el.dataset.mlTranslatedSrc = translatedUrl;
        if (el.tagName === "IMG") {
          el.src = translatedUrl;
        }
        el.setAttribute(ML_ATTR, "translated");
        removeOverlay(overlay);
        addToggleButton(el);
        showNotification("Image translated!", "success");
      } else {
        setOverlayText(overlay, "No text detected");
        setTimeout(() => removeOverlay(overlay), 3000);
      }
    } catch (err) {
      setOverlayText(overlay, `Error: ${err.message}`);
      setTimeout(() => removeOverlay(overlay), 5000);
    }
  }

  // ── Image Capture Methods ───────────────────────────────────────────

  // Canvas capture: works for DRM sites like Kakao Page.
  // Captures the rendered pixels from a canvas element, or draws an img to canvas.
  async function captureViaCanvas(el) {
    try {
      let canvas;

      if (el.tagName === "CANVAS") {
        // Already a canvas element (Kakao Page, Manga Plus DRM viewer)
        canvas = el;
      } else {
        // Draw the displayed image onto an offscreen canvas
        canvas = document.createElement("canvas");
        const w = el.naturalWidth || el.width || el.clientWidth;
        const h = el.naturalHeight || el.height || el.clientHeight;
        if (w < MIN_IMG_W || h < MIN_IMG_H) return null;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(el, 0, 0, w, h);
      }

      return canvas.toDataURL("image/png");
    } catch (e) {
      console.warn("MangaLens: Canvas capture tainted, trying fallback", e);
      return await captureViaImage(el);
    }
  }

  // Direct image capture: fetches the image URL or draws to canvas.
  async function captureViaImage(el) {
    if (el.tagName === "CANVAS") {
      try {
        return el.toDataURL("image/png");
      } catch {
        return null;
      }
    }

    // Try canvas draw first (works for same-origin or CORS-enabled images)
    try {
      const canvas = document.createElement("canvas");
      const w = el.naturalWidth || el.width || el.clientWidth;
      const h = el.naturalHeight || el.height || el.clientHeight;
      if (w < MIN_IMG_W || h < MIN_IMG_H) return null;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(el, 0, 0, w, h);
      return canvas.toDataURL("image/png");
    } catch (e) {
      // Canvas tainted by CORS, try fetching the raw image
      console.warn("MangaLens: Canvas draw tainted, fetching via URL");
    }

    // Fetch the image URL as blob and convert to data URL
    try {
      const imgUrl = el.src || el.dataset.src || el.currentSrc;
      if (!imgUrl) return null;
      const resp = await fetch(imgUrl, { mode: "cors", credentials: "omit" });
      const blob = await resp.blob();
      return await blobToDataUrl(blob);
    } catch (e) {
      console.error("MangaLens: Cannot capture image:", e);
      return null;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  // ── Image Detection ─────────────────────────────────────────────────
  function findComicImages() {
    let images = [];

    // Try site-specific selectors first
    if (siteConfig?.selectors) {
      for (const selector of siteConfig.selectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          images = Array.from(found);
          break;
        }
      }
    }

    // Fallback: find all large images
    if (images.length === 0) {
      images = Array.from(document.querySelectorAll("img"));
    }

    // Also check for canvas elements (DRM viewers)
    if (images.length === 0 || (siteConfig?.method === "canvas")) {
      const canvases = Array.from(document.querySelectorAll("canvas")).filter((c) => {
        return c.width >= MIN_IMG_W && c.height >= MIN_IMG_H;
      });
      if (canvases.length > 0 && images.length === 0) {
        images = canvases;
      } else if (canvases.length > 0) {
        images = [...images, ...canvases];
      }
    }

    // Filter by size and exclude already-processed
    return images.filter((el) => {
      if (el.getAttribute(ML_ATTR)) return false;

      if (el.tagName === "CANVAS") {
        return el.width >= MIN_IMG_W && el.height >= MIN_IMG_H;
      }

      const w = el.naturalWidth || el.width || el.clientWidth;
      const h = el.naturalHeight || el.height || el.clientHeight;
      return w >= MIN_IMG_W && h >= MIN_IMG_H;
    });
  }

  // ── Series Management ───────────────────────────────────────────────
  function buildSeriesTitle() {
    const siteName = siteConfig?.name || hostname;
    const pageTitle = document.title.replace(/[\n\r\t]/g, " ").trim();
    return `[${siteName}] ${pageTitle}`.slice(0, 120);
  }

  async function getOrCreateSeries(apiUrl, title, sourceLang, targetLang) {
    const key = `${title}__${sourceLang}__${targetLang}`;
    if (_cachedSeries[key]) return _cachedSeries[key];

    const series = await apiFetch(`${apiUrl}/api/series/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, source_language: sourceLang, target_language: targetLang }),
    });

    _cachedSeries[key] = series;
    return series;
  }

  // ── Progress Tracking ───────────────────────────────────────────────
  async function trackProgress(apiUrl, chapterId) {
    const STAGE_LABELS = {
      pending: "Queued...",
      ocr: "Detecting text...",
      analyzing: "Analyzing context...",
      translating: "Translating...",
      inpainting: "Removing original text...",
      typesetting: "Rendering translated text...",
      completed: "Done!",
      failed: "Failed",
    };

    // Try WebSocket first
    const wsUrl = apiUrl.replace(/^http/, "ws") + `/ws/pipeline/${chapterId}`;
    let resolved = false;

    return new Promise((resolve, reject) => {
      let ws;
      let pollFallback = false;

      try {
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const label = STAGE_LABELS[data.status] || data.status;
            updatePanel(label, data.progress || 0, data.total || 1);

            if (data.status === "completed") {
              resolved = true;
              ws.close();
              resolve();
            } else if (data.status === "failed") {
              resolved = true;
              ws.close();
              reject(new Error(data.error_message || "Pipeline failed"));
            }
          } catch {}
        };

        ws.onerror = () => {
          if (!resolved) pollFallback = true;
        };

        ws.onclose = () => {
          if (!resolved && pollFallback) {
            pollForCompletion(apiUrl, chapterId, STAGE_LABELS).then(resolve).catch(reject);
          }
        };

        // Timeout: fall back to polling if WS doesn't connect quickly
        setTimeout(() => {
          if (!resolved && ws.readyState !== WebSocket.OPEN) {
            pollFallback = true;
            try { ws.close(); } catch {}
          }
        }, 3000);

      } catch {
        // WebSocket not available, fall back to polling
        pollForCompletion(apiUrl, chapterId, STAGE_LABELS).then(resolve).catch(reject);
      }
    });
  }

  async function pollForCompletion(apiUrl, chapterId, labels) {
    for (let i = 0; i < POLL_TIMEOUT; i++) {
      await sleep(POLL_INTERVAL);
      try {
        const ch = await apiFetch(`${apiUrl}/api/chapters/${chapterId}`);

        if (ch.status === "completed") {
          updatePanel("Done!", 1, 1);
          return;
        }
        if (ch.status === "failed") {
          throw new Error(ch.error_message || "Pipeline failed");
        }

        const label = labels[ch.status] || ch.status;
        updatePanel(label, 0, 1);
      } catch (err) {
        if (err.message.includes("Pipeline failed") || err.message.includes("failed")) throw err;
      }
    }
    throw new Error("Translation timed out");
  }

  async function trackProgressWithOverlay(apiUrl, chapterId, overlay) {
    const STAGE_LABELS = {
      pending: "Queued...",
      ocr: "Detecting text...",
      analyzing: "Analyzing...",
      translating: "Translating...",
      inpainting: "Removing text...",
      typesetting: "Rendering...",
    };

    for (let i = 0; i < POLL_TIMEOUT; i++) {
      await sleep(POLL_INTERVAL);
      try {
        const ch = await apiFetch(`${apiUrl}/api/chapters/${chapterId}`);
        if (ch.status === "completed") return;
        if (ch.status === "failed") throw new Error(ch.error_message || "Pipeline failed");
        setOverlayText(overlay, STAGE_LABELS[ch.status] || ch.status);
      } catch (err) {
        if (err.message.includes("failed")) throw err;
      }
    }
    throw new Error("Translation timed out");
  }

  // ── Toggle Original/Translated ──────────────────────────────────────
  function toggleAllImages() {
    const translated = document.querySelectorAll(`[${ML_ATTR}="translated"]`);
    translationState.showOriginal = !translationState.showOriginal;

    translated.forEach((el) => {
      if (el.tagName !== "IMG") return;
      if (translationState.showOriginal) {
        el.src = el.dataset.mlOriginalSrc;
      } else {
        el.src = el.dataset.mlTranslatedSrc;
      }
    });
  }

  function addToggleButton(el) {
    // Remove existing toggle if any
    const existing = el.parentElement?.querySelector(`.${ML_PREFIX}-toggle`);
    if (existing) existing.remove();

    const btn = document.createElement("button");
    btn.className = `${ML_PREFIX}-toggle`;
    btn.textContent = "Show Original";
    let showingOriginal = false;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showingOriginal = !showingOriginal;
      if (el.tagName === "IMG") {
        el.src = showingOriginal ? el.dataset.mlOriginalSrc : el.dataset.mlTranslatedSrc;
      }
      btn.textContent = showingOriginal ? "Show Translated" : "Show Original";
      btn.classList.toggle(`${ML_PREFIX}-toggle--active`, showingOriginal);
    });

    const parent = el.parentElement;
    if (parent) {
      const pos = getComputedStyle(parent).position;
      if (!pos || pos === "static") parent.style.position = "relative";
      parent.appendChild(btn);
    }
  }

  // ── Floating Progress Panel ─────────────────────────────────────────
  function showFloatingPanel() {
    if (floatingPanel) return;

    floatingPanel = document.createElement("div");
    floatingPanel.className = `${ML_PREFIX}-panel`;
    floatingPanel.innerHTML = `
      <div class="${ML_PREFIX}-panel-header">
        <div class="${ML_PREFIX}-panel-logo">M</div>
        <span class="${ML_PREFIX}-panel-title">MangaLens</span>
        <button class="${ML_PREFIX}-panel-close" title="Close">&times;</button>
      </div>
      <div class="${ML_PREFIX}-panel-body">
        <div class="${ML_PREFIX}-panel-status">Initializing...</div>
        <div class="${ML_PREFIX}-panel-progress">
          <div class="${ML_PREFIX}-panel-progress-bar"></div>
        </div>
        <div class="${ML_PREFIX}-panel-detail"></div>
      </div>
      <div class="${ML_PREFIX}-panel-actions" style="display:none">
        <button class="${ML_PREFIX}-panel-toggle-btn">Toggle Original / Translated</button>
      </div>
    `;

    // Close button
    floatingPanel.querySelector(`.${ML_PREFIX}-panel-close`).addEventListener("click", hideFloatingPanel);

    // Toggle button
    floatingPanel.querySelector(`.${ML_PREFIX}-panel-toggle-btn`).addEventListener("click", toggleAllImages);

    // Make draggable
    makeDraggable(floatingPanel, floatingPanel.querySelector(`.${ML_PREFIX}-panel-header`));

    document.body.appendChild(floatingPanel);
  }

  function updatePanel(statusText, current, total, isError) {
    if (!floatingPanel) return;

    const statusEl = floatingPanel.querySelector(`.${ML_PREFIX}-panel-status`);
    const progressBar = floatingPanel.querySelector(`.${ML_PREFIX}-panel-progress-bar`);
    const detailEl = floatingPanel.querySelector(`.${ML_PREFIX}-panel-detail`);
    const actionsEl = floatingPanel.querySelector(`.${ML_PREFIX}-panel-actions`);

    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.classList.toggle(`${ML_PREFIX}-panel-error`, !!isError);
    }

    if (progressBar && total > 0) {
      const pct = Math.min(100, Math.round((current / total) * 100));
      progressBar.style.width = `${pct}%`;
    }

    if (detailEl) {
      detailEl.textContent = total > 0 ? `${current} / ${total}` : "";
    }

    // Show toggle button when done
    if (actionsEl && statusText.startsWith("Done")) {
      actionsEl.style.display = "block";
    }
  }

  function hideFloatingPanel() {
    if (floatingPanel) {
      floatingPanel.remove();
      floatingPanel = null;
    }
  }

  // ── Progress Overlay (per-image) ────────────────────────────────────
  function createProgressOverlay(el, text) {
    const overlay = document.createElement("div");
    overlay.className = `${ML_PREFIX}-overlay`;
    overlay.innerHTML = `<div class="${ML_PREFIX}-spinner"></div><span class="${ML_PREFIX}-overlay-text">${text}</span>`;

    const parent = el.parentElement;
    if (parent) {
      const pos = getComputedStyle(parent).position;
      if (!pos || pos === "static") parent.style.position = "relative";
      parent.appendChild(overlay);
    }
    return overlay;
  }

  function setOverlayText(overlay, text) {
    const span = overlay?.querySelector(`.${ML_PREFIX}-overlay-text`);
    if (span) span.textContent = text;
  }

  function removeOverlay(overlay) {
    if (overlay) overlay.remove();
  }

  // ── Notifications ───────────────────────────────────────────────────
  function showNotification(text, type) {
    const existing = document.querySelector(`.${ML_PREFIX}-notification`);
    if (existing) existing.remove();

    const notif = document.createElement("div");
    notif.className = `${ML_PREFIX}-notification ${ML_PREFIX}-${type}`;
    notif.textContent = text;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 5000);
  }

  // ── Draggable Panel ─────────────────────────────────────────────────
  function makeDraggable(panel, handle) {
    let isDragging = false;
    let startX, startY, origX, origY;

    handle.style.cursor = "grab";

    handle.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      handle.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = `${origX + dx}px`;
      panel.style.top = `${origY + dy}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      handle.style.cursor = "grab";
    });
  }

  // ── Fetch Helper ────────────────────────────────────────────────────
  async function apiFetch(url, opts = {}) {
    const resp = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`API ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
