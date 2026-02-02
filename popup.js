// eToro Portfolio Exporter - Popup Script

let portfolioData = null;

const statusEl = document.getElementById('status');
const previewEl = document.getElementById('preview');
const previewTextEl = document.getElementById('previewText');

const scrapeBtn = document.getElementById('scrape');
const copyJsonBtn = document.getElementById('copyJson');
const downloadBtn = document.getElementById('download');

function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function enableExportButtons(enabled) {
  copyJsonBtn.disabled = !enabled;
  downloadBtn.disabled = !enabled;
}

function showPreview(data) {
  let preview = 'Captured for AI parsing:\n';
  
  const textLen = data.visibleText?.length || 0;
  preview += `• ${textLen.toLocaleString()} chars of text\n`;
  
  const tableCount = data.tables?.length || 0;
  if (tableCount > 0) {
    preview += `• ${tableCount} table(s)\n`;
  }
  
  const gridCount = data.gridData?.length || 0;
  if (gridCount > 0) {
    preview += `• ${gridCount} grid items\n`;
  }
  
  const numCount = data.numbers?.length || 0;
  if (numCount > 0) {
    preview += `• ${numCount} numbers found\n`;
  }
  
  preview += '\nCopy JSON and paste to Mudges for parsing!';
  
  previewTextEl.textContent = preview;
  previewEl.style.display = 'block';
}

// Scrape button
scrapeBtn.addEventListener('click', async () => {
  setStatus('Scraping portfolio...', 'info');
  scrapeBtn.disabled = true;
  
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url?.includes('etoro.com')) {
      setStatus('Please open etoro.com first', 'error');
      scrapeBtn.disabled = false;
      return;
    }
    
    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapePortfolio' });
    
    if (response) {
      portfolioData = response;
      const textLen = response.visibleText?.length || 0;
      
      if (textLen > 100) {
        setStatus(`✓ Captured ${(textLen/1000).toFixed(1)}K chars`, 'success');
        enableExportButtons(true);
        showPreview(response);
      } else {
        setStatus('Not enough content. Try scrolling first.', 'error');
      }
    } else {
      setStatus('No response from page. Refresh and try again.', 'error');
    }
  } catch (error) {
    console.error('Scrape error:', error);
    setStatus(`Error: ${error.message}`, 'error');
  }
  
  scrapeBtn.disabled = false;
});

// Copy JSON
copyJsonBtn.addEventListener('click', async () => {
  if (!portfolioData) return;
  
  try {
    await navigator.clipboard.writeText(JSON.stringify(portfolioData, null, 2));
    setStatus('✓ JSON copied to clipboard!', 'success');
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`, 'error');
  }
});

// Download JSON
downloadBtn.addEventListener('click', () => {
  if (!portfolioData) return;
  
  const blob = new Blob([JSON.stringify(portfolioData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `etoro-portfolio-${date}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  setStatus('✓ Downloaded!', 'success');
});

// Check if we're on eToro on load
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.url?.includes('etoro.com/portfolio')) {
    setStatus('Ready to scrape!', 'success');
  } else if (tab?.url?.includes('etoro.com')) {
    setStatus('Navigate to Portfolio page, then scrape.', 'info');
  }
});
