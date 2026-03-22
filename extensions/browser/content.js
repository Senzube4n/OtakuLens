// MangaLens content script — detects comic images on page and overlays translations

(function () {
  const MANGALENS_ATTR = "data-mangalens-processed";
  const MIN_IMAGE_WIDTH = 200;
  const MIN_IMAGE_HEIGHT = 300;

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "translate") {
      translatePage(message.apiUrl, message.sourceLang, message.targetLang);
    }
  });

  async function translatePage(apiUrl, sourceLang, targetLang) {
    // Find all large images on the page (likely comic pages)
    const images = Array.from(document.querySelectorAll("img")).filter((img) => {
      if (img.hasAttribute(MANGALENS_ATTR)) return false;
      return img.naturalWidth >= MIN_IMAGE_WIDTH && img.naturalHeight >= MIN_IMAGE_HEIGHT;
    });

    if (images.length === 0) {
      showNotification("No comic images found on this page.", "warning");
      return;
    }

    showNotification(`Found ${images.length} image(s). Translating...`, "info");

    for (const img of images) {
      img.setAttribute(MANGALENS_ATTR, "true");
      await translateImage(img, apiUrl, sourceLang, targetLang);
    }

    showNotification("Translation complete!", "success");
  }

  async function translateImage(img, apiUrl, sourceLang, targetLang) {
    try {
      // Add loading overlay
      const overlay = createOverlay(img, "Translating...");

      // Fetch image as blob
      const response = await fetch(img.src);
      const blob = await response.blob();

      // Create a temporary series for this page translation
      const seriesRes = await fetch(`${apiUrl}/api/series/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Browser: ${document.title}`,
          source_language: sourceLang,
          target_language: targetLang,
        }),
      });
      const series = await seriesRes.json();

      // Upload the image as a single-page chapter
      const formData = new FormData();
      formData.append("chapter_number", "1");
      formData.append("files", blob, "page.png");

      const uploadRes = await fetch(`${apiUrl}/api/series/${series.id}/chapters/upload/`, {
        method: "POST",
        body: formData,
      });
      const chapter = await uploadRes.json();

      // Poll for completion
      overlay.textContent = "Processing...";
      await pollCompletion(apiUrl, chapter.id, overlay);

      // Get translated image
      const pagesRes = await fetch(`${apiUrl}/api/chapters/${chapter.id}/pages/`);
      const pages = await pagesRes.json();

      if (pages.length > 0 && pages[0].translated_path) {
        // Replace the image with translated version
        const translatedUrl = `${apiUrl}/${pages[0].translated_path}`;
        img.dataset.originalSrc = img.src;
        img.src = translatedUrl;

        // Add toggle button
        overlay.remove();
        addToggleButton(img);
      } else {
        overlay.textContent = "Translation failed";
        setTimeout(() => overlay.remove(), 3000);
      }
    } catch (err) {
      console.error("MangaLens translation error:", err);
    }
  }

  async function pollCompletion(apiUrl, chapterId, overlay) {
    const maxAttempts = 120; // 2 minutes
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 1000));

      try {
        const res = await fetch(`${apiUrl}/api/chapters/${chapterId}/`);
        const chapter = await res.json();

        if (chapter.status === "completed") return;
        if (chapter.status === "failed") throw new Error(chapter.error_message || "Pipeline failed");

        const stages = { ocr: "OCR", analyzing: "Analyzing", translating: "Translating", inpainting: "Cleaning", typesetting: "Typesetting" };
        overlay.textContent = stages[chapter.status] || chapter.status;
      } catch (err) {
        if (err.message.includes("Pipeline failed")) throw err;
      }
    }
    throw new Error("Translation timed out");
  }

  function createOverlay(img, text) {
    const overlay = document.createElement("div");
    overlay.className = "mangalens-overlay";
    overlay.textContent = text;
    img.parentElement.style.position = "relative";
    img.parentElement.appendChild(overlay);
    return overlay;
  }

  function addToggleButton(img) {
    const btn = document.createElement("button");
    btn.className = "mangalens-toggle";
    btn.textContent = "Original";
    btn.addEventListener("click", () => {
      if (img.dataset.showingOriginal === "true") {
        img.src = img.dataset.translatedSrc || img.src;
        img.dataset.showingOriginal = "false";
        btn.textContent = "Original";
      } else {
        img.dataset.translatedSrc = img.src;
        img.src = img.dataset.originalSrc;
        img.dataset.showingOriginal = "true";
        btn.textContent = "Translated";
      }
    });
    img.parentElement.style.position = "relative";
    img.parentElement.appendChild(btn);
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
