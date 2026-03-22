// Load saved settings
chrome.storage.local.get(["apiUrl", "sourceLang", "targetLang"], (data) => {
  if (data.apiUrl) document.getElementById("apiUrl").value = data.apiUrl;
  if (data.sourceLang) document.getElementById("sourceLang").value = data.sourceLang;
  if (data.targetLang) document.getElementById("targetLang").value = data.targetLang;
});

// Save settings on change
["apiUrl", "sourceLang", "targetLang"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    chrome.storage.local.set({
      apiUrl: document.getElementById("apiUrl").value,
      sourceLang: document.getElementById("sourceLang").value,
      targetLang: document.getElementById("targetLang").value,
    });
  });
});

// Translate button
document.getElementById("translateBtn").addEventListener("click", async () => {
  const btn = document.getElementById("translateBtn");
  const status = document.getElementById("status");

  btn.disabled = true;
  status.textContent = "Scanning page for comic images...";
  status.className = "status";

  try {
    const apiUrl = document.getElementById("apiUrl").value;
    const sourceLang = document.getElementById("sourceLang").value;
    const targetLang = document.getElementById("targetLang").value;

    // Check backend connection
    const healthRes = await fetch(`${apiUrl}/api/health`);
    if (!healthRes.ok) throw new Error("Cannot connect to MangaLens backend");

    // Send message to content script to find and translate images
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: "translate",
      apiUrl,
      sourceLang,
      targetLang,
    });

    status.textContent = "Translation started! Check the page.";
    status.className = "status connected";
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    status.className = "status error";
  } finally {
    btn.disabled = false;
  }
});
