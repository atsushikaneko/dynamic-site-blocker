// All state in chrome.storage.session
async function getState() {
  const data = await chrome.storage.session.get([
    "sessionActive", "allowedDomains", "blockedDomains",
    "pendingDomains", "ruleIdCounter", "domainRuleMap", "blockAttempts"
  ]);
  return {
    sessionActive: data.sessionActive || false,
    allowedDomains: data.allowedDomains || [],
    blockedDomains: data.blockedDomains || [],
    pendingDomains: data.pendingDomains || [],
    ruleIdCounter: data.ruleIdCounter || 1,
    domainRuleMap: data.domainRuleMap || {},
    blockAttempts: data.blockAttempts || {},
  };
}

async function setState(partial) {
  await chrome.storage.session.set(partial);
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function shouldIgnore(url) {
  if (!url) return true;
  return /^(chrome|about:|edge|brave|moz-extension|chrome-extension)/.test(url);
}

// Add redirect rule (not block — redirects to our custom page)
async function addBlockRule(domain) {
  const state = await getState();
  const ruleId = state.ruleIdCounter;
  const attempts = (state.blockAttempts[domain] || 0) + 1;

  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{
      id: ruleId,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}&attempts=${attempts}`
        }
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: ["main_frame"],
      },
    }],
  });
  await setState({
    ruleIdCounter: ruleId + 1,
    domainRuleMap: { ...state.domainRuleMap, [domain]: ruleId },
  });
}

async function removeBlockRule(domain) {
  const state = await getState();
  const ruleId = state.domainRuleMap[domain];
  if (ruleId) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
    const newMap = { ...state.domainRuleMap };
    delete newMap[domain];
    await setState({ domainRuleMap: newMap });
  }
}

// Update attempt count and refresh the redirect rule
async function incrementAttempts(domain) {
  const state = await getState();
  const attempts = (state.blockAttempts[domain] || 0) + 1;
  await setState({ blockAttempts: { ...state.blockAttempts, [domain]: attempts } });

  // Update the redirect URL with new attempt count
  const ruleId = state.domainRuleMap[domain];
  if (ruleId) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [{
        id: ruleId,
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}&attempts=${attempts}`
          }
        },
        condition: {
          requestDomains: [domain],
          resourceTypes: ["main_frame"],
        },
      }],
    });
  }
}

async function clearAllRules() {
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  if (existing.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existing.map((r) => r.id),
    });
  }
}

// Badge
async function updateBadge() {
  const state = await getState();
  if (state.sessionActive) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#e74c3c" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// Broadcast to popup
async function broadcastState() {
  const state = await getState();
  chrome.runtime.sendMessage({
    type: "state",
    sessionActive: state.sessionActive,
    blocked: state.blockedDomains,
    allowed: state.allowedDomains,
  }).catch(() => {});
}

// Prompt user with overlay
async function promptForDomain(domain, tabId) {
  const state = await getState();
  if (state.allowedDomains.includes(domain)) return;
  if (state.blockedDomains.includes(domain)) return;
  if (state.pendingDomains.includes(domain)) return;

  await setState({ pendingDomains: [...state.pendingDomains, domain] });

  let decision = null;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (d) => {
        return new Promise((resolve) => {
          const existing = document.getElementById("dsb-overlay");
          if (existing) existing.remove();

          const overlay = document.createElement("div");
          overlay.id = "dsb-overlay";
          overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          `;

          const box = document.createElement("div");
          box.style.cssText = `
            background: #1a1a2e; border-radius: 12px; padding: 32px;
            max-width: 400px; width: 90%; text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          `;

          const icon = document.createElement("div");
          icon.textContent = "🛡️";
          icon.style.cssText = "font-size: 40px; margin-bottom: 12px;";

          const title = document.createElement("div");
          title.textContent = "New site detected";
          title.style.cssText = "color: #fff; font-size: 18px; font-weight: 700; margin-bottom: 8px;";

          const domainEl = document.createElement("div");
          domainEl.textContent = d;
          domainEl.style.cssText = "color: #e74c3c; font-size: 15px; font-weight: 600; margin-bottom: 20px; word-break: break-all;";

          const question = document.createElement("div");
          question.textContent = "Do you need this site right now?";
          question.style.cssText = "color: #999; font-size: 13px; margin-bottom: 20px;";

          const btnRow = document.createElement("div");
          btnRow.style.cssText = "display: flex; gap: 12px;";

          const blockBtn = document.createElement("button");
          blockBtn.textContent = "🚫 Block";
          blockBtn.style.cssText = `
            flex: 1; padding: 12px 0; border: none; border-radius: 8px;
            background: #e74c3c; color: #fff; font-size: 14px; font-weight: 700;
            cursor: pointer; font-family: inherit;
          `;

          const allowBtn = document.createElement("button");
          allowBtn.textContent = "✅ Allow";
          allowBtn.style.cssText = `
            flex: 1; padding: 12px 0; border: 1px solid #333; border-radius: 8px;
            background: #2a2a3e; color: #aaa; font-size: 14px; font-weight: 700;
            cursor: pointer; font-family: inherit;
          `;

          blockBtn.addEventListener("click", () => { overlay.remove(); resolve(true); });
          allowBtn.addEventListener("click", () => { overlay.remove(); resolve(false); });

          btnRow.appendChild(blockBtn);
          btnRow.appendChild(allowBtn);
          box.appendChild(icon);
          box.appendChild(title);
          box.appendChild(domainEl);
          box.appendChild(question);
          box.appendChild(btnRow);
          overlay.appendChild(box);
          document.body.appendChild(overlay);
        });
      },
      args: [domain],
    });
    decision = results && results[0] && results[0].result;
  } catch (e) {
    console.log(`[DSB] inject failed: ${domain} ${e.message}`);
  }

  const freshState = await getState();
  const newPending = freshState.pendingDomains.filter((d) => d !== domain);

  if (decision === true) {
    await setState({
      blockedDomains: [...freshState.blockedDomains, domain],
      pendingDomains: newPending,
      blockAttempts: { ...freshState.blockAttempts, [domain]: 0 },
    });
    await addBlockRule(domain);
    // Redirect all tabs with this domain to block page
    const allTabs = await chrome.tabs.query({});
    for (const t of allTabs) {
      if (t.url && getDomain(t.url) === domain) {
        try {
          await chrome.tabs.update(t.id, {
            url: chrome.runtime.getURL(`blocked.html?domain=${encodeURIComponent(domain)}&attempts=1`)
          });
        } catch {}
      }
    }
  } else if (decision === false) {
    await setState({
      allowedDomains: [...freshState.allowedDomains, domain],
      pendingDomains: newPending,
    });
  } else {
    await setState({ pendingDomains: newPending });
  }

  await broadcastState();
}

// === Session control ===

async function startSession() {
  console.log("[DSB] === SESSION START ===");
  await clearAllRules();
  await setState({
    sessionActive: true,
    allowedDomains: [],
    blockedDomains: [],
    pendingDomains: [],
    ruleIdCounter: 1,
    domainRuleMap: {},
    blockAttempts: {},
  });
  await updateBadge();
  await broadcastState();
}

async function endSession() {
  console.log("[DSB] === SESSION END ===");
  await clearAllRules();
  await setState({
    sessionActive: false,
    allowedDomains: [],
    blockedDomains: [],
    pendingDomains: [],
    ruleIdCounter: 1,
    domainRuleMap: {},
    blockAttempts: {},
  });
  await updateBadge();
  await broadcastState();
}

// === Listeners ===

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const state = await getState();
  if (!state.sessionActive) return;

  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (!tab.url || shouldIgnore(tab.url)) return;

  const domain = getDomain(tab.url);
  if (!domain) return;

  if (state.blockedDomains.includes(domain)) {
    await incrementAttempts(domain);
    return;
  }

  await promptForDomain(domain, activeInfo.tabId);
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const state = await getState();
  if (!state.sessionActive) return;
  if (shouldIgnore(details.url)) return;

  const domain = getDomain(details.url);
  if (!domain) return;

  if (state.blockedDomains.includes(domain)) {
    await incrementAttempts(domain);
    return;
  }

  await promptForDomain(domain, details.tabId);
});

// Messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "startSession") {
    startSession().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "endSession") {
    endSession().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "getState") {
    getState().then((state) => {
      sendResponse({
        sessionActive: state.sessionActive,
        blocked: state.blockedDomains,
        allowed: state.allowedDomains,
      });
    });
    return true;
  }
  // Unblock: move from blocked to allowed
  if (msg.type === "unblock") {
    (async () => {
      const domain = msg.domain;
      const state = await getState();
      if (state.blockedDomains.includes(domain)) {
        await setState({
          blockedDomains: state.blockedDomains.filter((d) => d !== domain),
          allowedDomains: [...state.allowedDomains, domain],
        });
        await removeBlockRule(domain);
        await broadcastState();
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  // Revoke allow: move from allowed to blocked
  if (msg.type === "revokeAllow") {
    (async () => {
      const domain = msg.domain;
      const state = await getState();
      if (state.allowedDomains.includes(domain)) {
        await setState({
          allowedDomains: state.allowedDomains.filter((d) => d !== domain),
          blockedDomains: [...state.blockedDomains, domain],
          blockAttempts: { ...state.blockAttempts, [domain]: 0 },
        });
        await addBlockRule(domain);
        // Redirect existing tabs with this domain
        const allTabs = await chrome.tabs.query({});
        for (const t of allTabs) {
          if (t.url && getDomain(t.url) === domain) {
            try {
              await chrome.tabs.update(t.id, {
                url: chrome.runtime.getURL(`blocked.html?domain=${encodeURIComponent(domain)}&attempts=1`)
              });
            } catch {}
          }
        }
        await broadcastState();
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// Init
chrome.runtime.onStartup.addListener(() => updateBadge());
chrome.runtime.onInstalled.addListener(() => {
  setState({ sessionActive: false });
  updateBadge();
});
