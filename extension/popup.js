let collectedUsers = [];
let isRunning = false;

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const exportBtn = document.getElementById('exportBtn');
  const status = document.getElementById('status');
  const results = document.getElementById('results');

  // Load saved settings
  chrome.storage.local.get(['settings', 'collectedUsers'], (data) => {
    if (data.settings) {
      document.getElementById('keyword').value = data.settings.keyword || '';
      document.getElementById('minFollowers').value = data.settings.minFollowers || 0;
      document.getElementById('maxFollowers').value = data.settings.maxFollowers || 1000000;
      document.getElementById('limit').value = data.settings.limit || 100;
    }
    if (data.collectedUsers) {
      collectedUsers = data.collectedUsers;
      updateResults();
    }
  });

  startBtn.addEventListener('click', async () => {
    if (isRunning) {
      // Stop
      isRunning = false;
      startBtn.textContent = 'Start Scraping';
      sendMessage({ action: 'stop' });
      return;
    }

    const settings = {
      keyword: document.getElementById('keyword').value.trim(),
      minFollowers: parseInt(document.getElementById('minFollowers').value) || 0,
      maxFollowers: parseInt(document.getElementById('maxFollowers').value) || Infinity,
      limit: parseInt(document.getElementById('limit').value) || 100,
    };

    // Save settings
    chrome.storage.local.set({ settings });

    // Clear previous results
    collectedUsers = [];
    chrome.storage.local.set({ collectedUsers: [] });
    updateResults();

    // Check if we're on X.com
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url?.match(/https:\/\/(x|twitter)\.com/)) {
      showStatus('Please navigate to x.com first', 'error');
      return;
    }

    isRunning = true;
    startBtn.textContent = 'Stop';
    showStatus('Scraping...', 'info');

    sendMessage({ action: 'start', settings });
  });

  exportBtn.addEventListener('click', () => {
    if (collectedUsers.length === 0) {
      showStatus('No users to export', 'error');
      return;
    }
    exportTsv();
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'userFound') {
      // Duplicate check
      if (collectedUsers.some(u => u.username === message.user.username)) {
        return;
      }
      collectedUsers.push(message.user);
      chrome.storage.local.set({ collectedUsers });
      updateResults();
    } else if (message.action === 'status') {
      showStatus(message.text, message.type || 'info');
    } else if (message.action === 'done') {
      isRunning = false;
      startBtn.textContent = 'Start Scraping';
      showStatus(`Done! Found ${collectedUsers.length} users`, 'success');
    }
  });

  function showStatus(text, type = 'info') {
    status.textContent = text;
    status.className = type;
  }

  function updateResults() {
    results.innerHTML = collectedUsers.slice(-10).reverse().map(user => `
      <div class="user-item">
        <span class="username">@${user.username}</span>
        <span class="followers">${formatNumber(user.followersCount)} followers</span>
        <div>${truncate(user.bio, 50)}</div>
      </div>
    `).join('');

    if (collectedUsers.length > 0) {
      showStatus(`Collected: ${collectedUsers.length} users`, 'info');
    }
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  async function sendMessage(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, message);
  }

  function exportTsv() {
    const headers = ['username', 'displayName', 'bio', 'followersCount', 'followingCount', 'profileUrl'];
    const rows = collectedUsers.map(user => [
      user.username,
      escapeTsv(user.displayName),
      escapeTsv(user.bio),
      user.followersCount,
      user.followingCount,
      user.profileUrl,
    ].join('\t'));

    const tsv = [headers.join('\t'), ...rows].join('\n');
    const blob = new Blob([tsv], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: `x-users-${Date.now()}.tsv`,
      saveAs: true,
    });
  }

  function escapeTsv(value) {
    if (!value) return '';
    return value.replace(/[\t\n\r]/g, ' ').trim();
  }
});
