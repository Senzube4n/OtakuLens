// MangaLens Popup Script
// Controls translation actions and displays site/backend status.

(function () {
  "use strict";

  // ── DOM References ──────────────────────────────────────────────────
  const els = {
    siteStatus: document.getElementById("siteStatus"),
    siteName: document.getElementById("siteName"),
    siteMethod: document.getElementById("siteMethod"),
    backendStatus: document.getElementById("backendStatus"),
    backendText: document.getElementById("backendText"),
    imageCount: document.getElementById("imageCount"),
    sourceLang: document.getElementById("sourceLang"),
    targetLang: document.getElementById("targetLang"),
    apiUrl: document.getElementById("apiUrl"),
    translateBtn: document.getElementById("translateBtn"),
    selectBtn: document.getElementById("selectBtn"),
    toggleBtn: document.getElementById("toggleBtn"),
    settingsToggle: document.getElementById("settingsToggle"),
    settingsContent: document.getElementById("settingsContent"),
    webAppLink: document.getElementById("webAppLink"),
  };

  // Known site profiles (mirrors background.js)
  const KNOWN_SITES = {
    "comic.naver.com": { name: "Naver Webtoon", method: "direct", lang: "ko" },
    "www.webtoons.com": { name: "Webtoons", method: "direct", lang: "auto" },
    "page.kakao.com": { name: "Kakao Page", method: "canvas", lang: "ko", drm: true },
    "mangadex.org": { name: "MangaDex", method: "direct", lang: "ja" },
    "mangaplus.shueisha.co.jp": { name: "Manga Plus", method: "canvas", lang: "ja", drm: true },
    "lezhin.com": { name: "Lezhin Comics", method: "canvas", lang: "ko", drm: true },
    "toomics.com": { name: "Toomics", method: "canvas", lang: "ko", drm: true },
    "tapas.io": { name: "Tapas", method: "direct", lang: "en" },
    "tappytoon.com": { name: "Tappytoon", method: "direct", lang: "ko" },
    "rawdevart.com": { name: "RawDevArt", method: "direct", lang: "ja" },
    "raw.senmanga.com": { name: "SenManga", method: "direct", lang: "ja" },
    "manganato.com": { name: "Manganato", method: "direct", lang: "ja" },
    "chapmanganato.to": { name: "Manganato", method: "direct", lang: "ja" },
    "readmanganato.com": { name: "Manganato", method: "direct", lang: "ja" },
    "www.mangago.me": { name: "Mangago", method: "direct", lang: "ja" },
  };

  let currentTab = null;
  let backendConnected = false;

  // ── Initialize ──────────────────────────────────────────────────────
  init();

  async function init() {
    loadSettings();
    setupEventListeners();
    await detectCurrentSite();
    await checkBackend();
  }

  // ── Load / Save Settings ────────────────────────────────────────────
  function loadSettings() {
    chrome.storage.local.get(["apiUrl", "sourceLang", "targetLang"], (data) => {
      if (data.apiUrl) els.apiUrl.value = data.apiUrl;
      if (data.sourceLang) els.sourceLang.value = data.sourceLang;
      if (data.targetLang) els.targetLang.value = data.targetLang;

      // Update web app link based on backend URL
      const baseUrl = (data.apiUrl || "http://localhost:8000").replace(/:8000/, ":3000");
      els.webAppLink.href = baseUrl;
    });
  }

  function saveSettings() {
    chrome.storage.local.set({
      apiUrl: els.apiUrl.value.replace(/\/+$/, ""),
      sourceLang: els.sourceLang.value,
      targetLang: els.targetLang.value,
    });
  }

  function getSettings() {
    return {
      apiUrl: els.apiUrl.value.replace(/\/+$/, ""),
      sourceLang: els.sourceLang.value,
      targetLang: els.targetLang.value,
    };
  }

  // ── Event Listeners ─────────────────────────────────────────────────
  function setupEventListeners() {
    // Save settings on any change
    ["apiUrl", "sourceLang", "targetLang"].forEach((id) => {
      els[id].addEventListener("change", () => {
        saveSettings();
        if (id === "apiUrl") checkBackend();
      });
    });

    // Translate all
    els.translateBtn.addEventListener("click", () => {
      saveSettings();
      sendAction("translate");
    });

    // Click-to-translate
    els.selectBtn.addEventListener("click", () => {
      saveSettings();
      sendAction("translate_selected");
      window.close();
    });

    // Toggle original/translated
    els.toggleBtn.addEventListener("click", () => {
      sendAction("toggle_original");
    });

    // Settings toggle
    els.settingsToggle.addEventListener("click", () => {
      const open = els.settingsContent.classList.toggle("show");
      els.settingsToggle.classList.toggle("open", open);
    });
  }

  // ── Site Detection ──────────────────────────────────────────────────
  async function detectCurrentSite() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTab = tab;

      if (!tab?.url) {
        setSiteStatus("unknown", "Cannot detect page", "");
        return;
      }

      const url = new URL(tab.url);
      const hostname = url.hostname;
      const profile = KNOWN_SITES[hostname];

      if (profile) {
        const methodLabel = profile.drm ? "Canvas (DRM)" : profile.method === "canvas" ? "Canvas" : "Direct";
        setSiteStatus("supported", profile.name, methodLabel);

        // Auto-set source language
        if (profile.lang && profile.lang !== "auto") {
          els.sourceLang.value = profile.lang;
          saveSettings();
        }

        // Query content script for image count
        queryPageInfo(tab.id);
      } else {
        setSiteStatus("unsupported", hostname, "Generic");
        queryPageInfo(tab.id);
      }
    } catch (err) {
      setSiteStatus("unknown", "Error detecting site", "");
    }
  }

  function setSiteStatus(type, name, method) {
    els.siteStatus.className = `site-status ${type}`;
    els.siteName.textContent = name;
    els.siteMethod.textContent = method;
  }

  async function queryPageInfo(tabId) {
    try {
      chrome.tabs.sendMessage(tabId, { action: "get_page_info" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          // Content script not injected yet
          els.imageCount.style.display = "none";
          return;
        }

        if (response.imageCount > 0) {
          els.imageCount.innerHTML = `<strong>${response.imageCount}</strong> comic image${response.imageCount !== 1 ? "s" : ""} detected`;
          els.imageCount.style.display = "block";
        } else {
          els.imageCount.innerHTML = "No comic images detected on this page";
          els.imageCount.style.display = "block";
        }
      });
    } catch {}
  }

  // ── Backend Health Check ────────────────────────────────────────────
  async function checkBackend() {
    const apiUrl = els.apiUrl.value.replace(/\/+$/, "");

    setBackendStatus("checking", "Checking backend...");

    chrome.runtime.sendMessage(
      { type: "CHECK_BACKEND", apiUrl },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          setBackendStatus("disconnected", "Cannot reach backend");
          backendConnected = false;
          updateButtons();
          return;
        }

        if (response.connected) {
          const ver = response.version ? ` (v${response.version})` : "";
          setBackendStatus("connected", `Connected to MangaLens${ver}`);
          backendConnected = true;
        } else {
          setBackendStatus("disconnected", `Disconnected: ${response.error || "unreachable"}`);
          backendConnected = false;
        }

        updateButtons();
      }
    );
  }

  function setBackendStatus(type, text) {
    els.backendStatus.className = `backend-status ${type}`;
    els.backendText.textContent = text;
  }

  // ── Button State ────────────────────────────────────────────────────
  function updateButtons() {
    const enabled = backendConnected && currentTab;
    els.translateBtn.disabled = !enabled;
    els.selectBtn.disabled = !enabled;
    els.toggleBtn.disabled = !currentTab;
  }

  // ── Send Action to Content Script ───────────────────────────────────
  async function sendAction(action) {
    if (!currentTab) return;

    const { apiUrl, sourceLang, targetLang } = getSettings();

    try {
      chrome.tabs.sendMessage(currentTab.id, {
        action,
        apiUrl,
        sourceLang,
        targetLang,
      });

      if (action === "translate") {
        els.translateBtn.disabled = true;
        els.translateBtn.textContent = "Translating... check page";
        setTimeout(() => {
          els.translateBtn.disabled = false;
          els.translateBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
            Translate This Page
          `;
        }, 3000);
      }
    } catch (err) {
      setBackendStatus("disconnected", `Error: ${err.message}`);
    }
  }
})();
