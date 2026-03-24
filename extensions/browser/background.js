// MangaLens Background Service Worker
// Handles communication between popup <-> content script, and API calls to MangaLens backend.

// ── Site Configuration ────────────────────────────────────────────────
const SITE_PROFILES = {
  "comic.naver.com": {
    name: "Naver Webtoon",
    method: "direct",
    defaultLang: "ko",
    imageSelector: ".wt_viewer img, #comic_view_area img, .viewer-img img",
    scrollContainer: ".wt_viewer, #comic_view_area",
    supported: true,
  },
  "www.webtoons.com": {
    name: "Webtoons",
    method: "direct",
    defaultLang: "auto",
    imageSelector: ".viewer_img img, #_imageList img, ._images img",
    scrollContainer: ".viewer_img, #_imageList",
    supported: true,
  },
  "page.kakao.com": {
    name: "Kakao Page",
    method: "canvas",
    defaultLang: "ko",
    imageSelector: "canvas, .css-1jxcs1 img, .page-viewer img",
    scrollContainer: null,
    supported: true,
    drm: true,
  },
  "mangadex.org": {
    name: "MangaDex",
    method: "direct",
    defaultLang: "ja",
    imageSelector: ".md--page img, .reader--page img",
    scrollContainer: null,
    supported: true,
  },
  "mangaplus.shueisha.co.jp": {
    name: "Manga Plus",
    method: "canvas",
    defaultLang: "ja",
    imageSelector: "canvas, .zao-image img, .page-image img",
    scrollContainer: null,
    supported: true,
    drm: true,
  },
  "lezhin.com": {
    name: "Lezhin Comics",
    method: "canvas",
    defaultLang: "ko",
    imageSelector: "canvas, .lzCnts img",
    scrollContainer: null,
    supported: true,
    drm: true,
  },
  "toomics.com": {
    name: "Toomics",
    method: "canvas",
    defaultLang: "ko",
    imageSelector: "canvas, .toon_img img",
    scrollContainer: null,
    supported: true,
    drm: true,
  },
  "tapas.io": {
    name: "Tapas",
    method: "direct",
    defaultLang: "en",
    imageSelector: ".viewer__body img, .js-episode-article img",
    scrollContainer: null,
    supported: true,
  },
  "tappytoon.com": {
    name: "Tappytoon",
    method: "direct",
    defaultLang: "ko",
    imageSelector: ".viewer-page img, .episode-viewer img",
    scrollContainer: null,
    supported: true,
  },
  "rawdevart.com": {
    name: "RawDevArt",
    method: "direct",
    defaultLang: "ja",
    imageSelector: "#img-reader-container img, .page-break img",
    scrollContainer: null,
    supported: true,
  },
  "raw.senmanga.com": {
    name: "SenManga",
    method: "direct",
    defaultLang: "ja",
    imageSelector: "#viewer img, .reader-main img",
    scrollContainer: null,
    supported: true,
  },
  "manganato.com": {
    name: "Manganato",
    method: "direct",
    defaultLang: "ja",
    imageSelector: ".container-chapter-reader img",
    scrollContainer: null,
    supported: true,
  },
  "chapmanganato.to": {
    name: "Manganato",
    method: "direct",
    defaultLang: "ja",
    imageSelector: ".container-chapter-reader img",
    scrollContainer: null,
    supported: true,
  },
  "readmanganato.com": {
    name: "Manganato",
    method: "direct",
    defaultLang: "ja",
    imageSelector: ".container-chapter-reader img",
    scrollContainer: null,
    supported: true,
  },
  "www.mangago.me": {
    name: "Mangago",
    method: "direct",
    defaultLang: "ja",
    imageSelector: "#page1 img, .page-img img",
    scrollContainer: null,
    supported: true,
  },
};

// ── Message Handling ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_SITE_PROFILE":
      handleGetSiteProfile(message, sendResponse);
      return true;

    case "TRANSLATE_PAGE":
      handleTranslatePage(message, sender);
      sendResponse({ ok: true });
      return false;

    case "TRANSLATE_SELECTED":
      handleTranslateSelected(message, sender);
      sendResponse({ ok: true });
      return false;

    case "CHECK_BACKEND":
      handleCheckBackend(message, sendResponse);
      return true;

    case "GET_LANGUAGES":
      handleGetLanguages(message, sendResponse);
      return true;

    case "API_REQUEST":
      handleApiRequest(message, sendResponse);
      return true;

    case "UPLOAD_IMAGES":
      handleUploadImages(message, sendResponse);
      return true;
  }
});

// ── Handlers ──────────────────────────────────────────────────────────
function handleGetSiteProfile(message, sendResponse) {
  const hostname = message.hostname;
  const profile = SITE_PROFILES[hostname] || null;
  sendResponse({
    profile,
    isSupported: !!profile,
    hostname,
  });
}

async function handleCheckBackend(message, sendResponse) {
  try {
    const resp = await fetch(`${message.apiUrl}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    sendResponse({ connected: true, version: data.version });
  } catch (err) {
    sendResponse({ connected: false, error: err.message });
  }
}

async function handleGetLanguages(message, sendResponse) {
  try {
    const resp = await fetch(`${message.apiUrl}/api/languages`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    sendResponse({ languages: data });
  } catch (err) {
    sendResponse({ languages: null, error: err.message });
  }
}

async function handleTranslatePage(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, {
    action: "translate",
    apiUrl: message.apiUrl,
    sourceLang: message.sourceLang,
    targetLang: message.targetLang,
    mode: message.mode || "all",
  });
}

async function handleTranslateSelected(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  chrome.tabs.sendMessage(tabId, {
    action: "translate_selected",
    apiUrl: message.apiUrl,
    sourceLang: message.sourceLang,
    targetLang: message.targetLang,
  });
}

async function handleApiRequest(message, sendResponse) {
  try {
    const opts = {
      method: message.method || "GET",
      signal: AbortSignal.timeout(30000),
    };
    if (message.headers) {
      opts.headers = message.headers;
    }
    if (message.body) {
      opts.headers = { "Content-Type": "application/json", ...opts.headers };
      opts.body = JSON.stringify(message.body);
    }
    const resp = await fetch(message.url, opts);
    const data = await resp.json();
    sendResponse({ ok: resp.ok, status: resp.status, data });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleUploadImages(message, sendResponse) {
  try {
    const formData = new FormData();
    formData.append("chapter_number", String(message.chapterNumber || Date.now()));

    // Convert base64 data URLs to blobs
    for (let i = 0; i < message.images.length; i++) {
      const dataUrl = message.images[i];
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      formData.append("files", blob, `page_${(i + 1).toString().padStart(4, "0")}.png`);
    }

    const uploadResp = await fetch(
      `${message.apiUrl}/api/series/${message.seriesId}/chapters/upload`,
      { method: "POST", body: formData, signal: AbortSignal.timeout(120000) }
    );

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      throw new Error(`Upload failed: ${uploadResp.status} ${errText}`);
    }

    const chapter = await uploadResp.json();
    sendResponse({ ok: true, chapter });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ── Context menu for right-click translate ────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["apiUrl"], (data) => {
    if (!data.apiUrl) {
      chrome.storage.local.set({ apiUrl: "http://localhost:8000" });
    }
  });
});

// Forward popup messages to content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FORWARD_TO_TAB") {
    chrome.tabs.sendMessage(message.tabId, message.payload, (response) => {
      sendResponse(response);
    });
    return true;
  }
});
