document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const status = document.getElementById("status");
  const listsContainer = document.getElementById("listsContainer");
  const blockedList = document.getElementById("blockedList");
  const allowedList = document.getElementById("allowedList");

  function updateUI(state) {
    if (state.sessionActive) {
      startBtn.style.display = "none";
      stopBtn.style.display = "block";
      listsContainer.style.display = "block";
      status.textContent = "Session active";
      status.className = "status active";

      renderBlockedList(state.blocked);
      renderAllowedList(state.allowed);
    } else {
      startBtn.style.display = "block";
      stopBtn.style.display = "none";
      listsContainer.style.display = "none";
      status.textContent = "Session inactive";
      status.className = "status";
    }
  }

  function renderBlockedList(domains) {
    blockedList.innerHTML = "";
    if (!domains || domains.length === 0) {
      blockedList.innerHTML = '<span class="empty">None</span>';
      return;
    }
    domains.forEach((domain) => {
      const item = document.createElement("div");
      item.className = "domain-item blocked";

      const name = document.createElement("span");
      name.className = "domain-name";
      name.textContent = domain;
      item.appendChild(name);

      const btn = document.createElement("button");
      btn.className = "action-btn unblock";
      btn.textContent = "Unblock";
      btn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "unblock", domain }, () => loadState());
      });
      item.appendChild(btn);

      blockedList.appendChild(item);
    });
  }

  function renderAllowedList(domains) {
    allowedList.innerHTML = "";
    if (!domains || domains.length === 0) {
      allowedList.innerHTML = '<span class="empty">None</span>';
      return;
    }
    domains.forEach((domain) => {
      const item = document.createElement("div");
      item.className = "domain-item allowed";

      const name = document.createElement("span");
      name.className = "domain-name";
      name.textContent = domain;
      item.appendChild(name);

      const btn = document.createElement("button");
      btn.className = "action-btn revoke";
      btn.textContent = "Block";
      btn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "revokeAllow", domain }, () => loadState());
      });
      item.appendChild(btn);

      allowedList.appendChild(item);
    });
  }

  function loadState() {
    chrome.runtime.sendMessage({ type: "getState" }, (state) => {
      if (state) updateUI(state);
    });
  }

  startBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "startSession" }, () => loadState());
  });

  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "endSession" }, () => loadState());
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "state") updateUI(msg);
  });

  loadState();
});
