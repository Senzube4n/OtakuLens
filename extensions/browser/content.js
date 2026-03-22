// MangaLens content script — translates comic images in-place
// Works on ANY site because it captures rendered images from the DOM via canvas,
// bypassing DRM and CORS restrictions.

(function () {
  const MANGALENS_ATTR = "data-mangalens";
  const MIN_IMAGE_WIDTH = 200;
  const MIN_IMAGE_HEIGHT = 300;

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "translate") {
      translatePage(message.apiUrl, message.sourceLang, message.targetLang, message.mode);
    }
    if (message.action === "translate_selected") {
      enableSelectionMode(message.apiUrl, message.sourceLang, message.targetLang);
    }
  });

  // ── Full page translation ──────────────────────────────────────────
  async function translatePage(apiUrl, sourceLang, targetLang, mode = "all") {
    const images = findComicImages();

    if (images.length === 0) {
      showNotification("No comic images found on this page.", "warning");
      return;
    }

    showNotification(`Found ${images.length} image(s). Translating...`, "info");

    // Reuse or create a series for this site
    const seriesTitle = `${window.location.hostname} — ${document.title}`.slice(0, 100);
    const series = await getOrCreateSeries(apiUrl, seriesTitle, sourceLang, targetLang);

    // Capture all images as blobs via canvas (bypasses CORS/DRM)
    const blobs = [];
    for (const img of images) {
      img.setAttribute(MANGALENS_ATTR, "processing");
      const blob = await captureImageAsBlob(img);
      if (blob) blobs.push({ img, blob });
    }

    if (blobs.length === 0) {
      showNotification("Could not capture any images.", "error");
      return;
    }

    // Upload all images as a chapter
    const formData = new FormData();
    formData.append("chapter_number", String(Date.now())); // Unique chapter number
    blobs.forEach(({ blob }, i) => {
      formData.append("files", blob, `page_${(i + 1).toString().padStart(4, "0")}.png`);
    });

    showNotification("Uploading to MangaLens...", "info");

    try {
      const uploadRes = await fetch(`${apiUrl}/api/series/${series.id}/chapters/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const chapter = await uploadRes.json();

      // Show progress overlay on first image
      const progressEl = createOverlay(blobs[0].img, "Processing...");

      // Poll for completion
      await pollCompletion(apiUrl, chapter.id, progressEl);

      // Replace images with translated versions
      const pagesRes = await fetch(`${apiUrl}/api/chapters/${chapter.id}/pages`);
      const pages = await pagesRes.json();
      const sortedPages = pages.sort((a, b) => a.page_number - b.page_number);

      for (let i = 0; i < Math.min(blobs.length, sortedPages.length); i++) {
        const page = sortedPages[i];
        const img = blobs[i].img;

        if (page.translated_path) {
          img.dataset.originalSrc = img.src;
          img.dataset.translatedSrc = `${apiUrl}/${page.translated_path}`;
          img.src = img.dataset.translatedSrc;
          img.setAttribute(MANGALENS_ATTR, "translated");
          addToggleButton(img);
        }
      }

      progressEl.remove();
      showNotification(`Translated ${sortedPages.filter(p => p.translated_path).length} pages!`, "success");

    } catch (err) {
      showNotification(`Translation failed: ${err.message}`, "error");
      console.error("MangaLens:", err);
    }
  }

  // ── Selection mode — click to translate individual images ──────────
  function enableSelectionMode(apiUrl, sourceLang, targetLang) {
    showNotification("Click on an image to translate it", "info");

    document.body.style.cursor = "crosshair";

    function onClick(e) {
      const img = e.target.closest("img");
      if (!img) return;

      e.preventDefault();
      e.stopPropagation();
      document.body.style.cursor = "";
      document.removeEventListener("click", onClick, true);

      translateSingleImage(img, apiUrl, sourceLang, targetLang);
    }

    document.addEventListener("click", onClick, true);
  }

  async function translateSingleImage(img, apiUrl, sourceLang, targetLang) {
    const overlay = createOverlay(img, "Capturing...");

    try {
      const blob = await captureImageAsBlob(img);
      if (!blob) throw new Error("Could not capture image");

      overlay.textContent = "Uploading...";

      const seriesTitle = `${window.location.hostname}`.slice(0, 100);
      const series = await getOrCreateSeries(apiUrl, seriesTitle, sourceLang, targetLang);

      const formData = new FormData();
      formData.append("chapter_number", String(Date.now()));
      formData.append("files", blob, "page.png");

      const uploadRes = await fetch(`${apiUrl}/api/series/${series.id}/chapters/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const chapter = await uploadRes.json();

      await pollCompletion(apiUrl, chapter.id, overlay);

      const pagesRes = await fetch(`${apiUrl}/api/chapters/${chapter.id}/pages`);
      const pages = await pagesRes.json();

      if (pages[0]?.translated_path) {
        img.dataset.originalSrc = img.src;
        img.dataset.translatedSrc = `${apiUrl}/${pages[0].translated_path}`;
        img.src = img.dataset.translatedSrc;
        img.setAttribute(MANGALENS_ATTR, "translated");
        overlay.remove();
        addToggleButton(img);
        showNotification("Image translated!", "success");
      } else {
        overlay.textContent = "No text detected";
        setTimeout(() => overlay.remove(), 3000);
      }
    } catch (err) {
      overlay.textContent = `Error: ${err.message}`;
      setTimeout(() => overlay.remove(), 5000);
    }
  }

  // ── Canvas capture — works even with CORS/DRM ─────────────────────
  async function captureImageAsBlob(img) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");

      // Draw the image — this works because the image is already rendered in the DOM
      // The browser has already decoded it, so we can paint it to canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      });
    } catch (e) {
      // Canvas tainted by CORS — fall back to fetching the URL
      console.warn("MangaLens: Canvas capture failed (CORS), trying fetch fallback");
      try {
        const resp = await fetch(img.src);
        return await resp.blob();
      } catch {
        console.error("MangaLens: Cannot capture image:", img.src);
        return null;
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function findComicImages() {
    return Array.from(document.querySelectorAll("img")).filter((img) => {
      if (img.getAttribute(MANGALENS_ATTR)) return false;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      return w >= MIN_IMAGE_WIDTH && h >= MIN_IMAGE_HEIGHT;
    });
  }

  let _cachedSeries = {};
  async function getOrCreateSeries(apiUrl, title, sourceLang, targetLang) {
    const key = `${title}__${sourceLang}__${targetLang}`;
    if (_cachedSeries[key]) return _cachedSeries[key];

    const res = await fetch(`${apiUrl}/api/series/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, source_language: sourceLang, target_language: targetLang }),
    });
    const series = await res.json();
    _cachedSeries[key] = series;
    return series;
  }

  async function pollCompletion(apiUrl, chapterId, overlay) {
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch(`${apiUrl}/api/chapters/${chapterId}`);
        const ch = await res.json();

        if (ch.status === "completed") return;
        if (ch.status === "failed") throw new Error(ch.error_message || "Pipeline failed");

        const labels = { ocr: "Detecting text...", analyzing: "Analyzing...", translating: "Translating...", inpainting: "Removing text...", typesetting: "Rendering..." };
        overlay.textContent = labels[ch.status] || ch.status;
      } catch (err) {
        if (err.message.includes("Pipeline failed")) throw err;
      }
    }
    throw new Error("Translation timed out");
  }

  function createOverlay(img, text) {
    const overlay = document.createElement("div");
    overlay.className = "mangalens-overlay";
    overlay.innerHTML = `<div class="mangalens-spinner"></div><span>${text}</span>`;
    const parent = img.parentElement;
    parent.style.position = parent.style.position || "relative";
    parent.appendChild(overlay);
    return overlay;
  }

  function addToggleButton(img) {
    const btn = document.createElement("button");
    btn.className = "mangalens-toggle";
    btn.innerHTML = "&#x1F310; Original";
    let showingOriginal = false;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (showingOriginal) {
        img.src = img.dataset.translatedSrc;
        btn.innerHTML = "&#x1F310; Original";
        showingOriginal = false;
      } else {
        img.src = img.dataset.originalSrc;
        btn.innerHTML = "&#x1F310; Translated";
        showingOriginal = true;
      }
    });

    const parent = img.parentElement;
    parent.style.position = parent.style.position || "relative";
    parent.appendChild(btn);
  }

  function showNotification(text, type) {
    const existing = document.querySelector(".mangalens-notification");
    if (existing) existing.remove();

    const notif = document.createElement("div");
    notif.className = `mangalens-notification mangalens-${type}`;
    notif.textContent = text;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 5000);
  }
})();
