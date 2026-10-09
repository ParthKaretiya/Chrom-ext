const statusEl = document.getElementById("status");

async function sendAction(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || !tab.url.startsWith("https://web.whatsapp.com/")) {
    statusEl.textContent = "Please open web.whatsapp.com in the active tab.";
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "WA_AREA_BLUR", action });
    statusEl.textContent = action === "select"
      ? "Drag on the page to choose an area."
      : action === "toggle"
        ? "Blur visibility toggled."
        : "All blur areas cleared.";
  } catch (error) {
    statusEl.textContent = "Refresh WhatsApp Web, then try again.";
  }
}

document.getElementById("select").addEventListener("click", () => sendAction("select"));
document.getElementById("toggle").addEventListener("click", () => sendAction("toggle"));
document.getElementById("clear").addEventListener("click", () => sendAction("clear"));
