// Load saved settings
chrome.storage.local.get(["apiUrl", "sourceLang", "targetLang"], (data) => {
  if (data.apiUrl) document.getElementById("apiUrl").value = data.apiUrl;
  if (data.sourceLang) document.getElementById("sourceLang").value = data.sourceLang;
  if (data.targetLang) document.getElementById("targetLang").value = data.targetLang;
});

// Save settings on change
["apiUrl", "sourceLang", "targetLang"].forEach((id) => {
  document.getElementById(id).addEventListener("change", saveSettings);
});

function saveSettings() {
  chrome.storage.local.set({
    apiUrl: document.getElementById("apiUrl").value,
    sourceLang: document.getElementById("sourceLang").value,
    targetLang: document.getElementById("targetLang").value,
  });
}

function getSettings() {
  return {
    apiUrl: document.getElementById("apiUrl").value,
    sourceLang: document.getElementById("sourceLang").value,
    targetLang: document.getElementById("targetLang").value,
  };
}

async function sendToContentScript(action) {
  const status = document.getElementById("status");
  const { apiUrl, sourceLang, targetLang } = getSettings();

  try {
    // Check backend connection
    const healthRes = await fetch(`${apiUrl}/api/health`);
    if (!healthRes.ok) throw new Error("Cannot connect to MangaLens backend");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action, apiUrl, sourceLang, targetLang });

    status.textContent = action === "translate" ? "Translating... check the page" : "Click an image on the page";
    status.className = "status connected";
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    status.className = "status error";
  }
}

// Translate all images
document.getElementById("translateBtn").addEventListener("click", () => {
  saveSettings();
  sendToContentScript("translate");
});

// Click-to-translate mode
document.getElementById("selectBtn").addEventListener("click", () => {
  saveSettings();
  sendToContentScript("translate_selected");
  window.close(); // Close popup so user can click on images
});
