// eToro Portfolio Exporter - Popup Script

let portfolioData = null;

const statusEl = document.getElementById('status');
const previewEl = document.getElementById('preview');
const previewTextEl = document.getElementById('previewText');

const scrapeBtn = document.getElementById('scrape');
const downloadExcelBtn = document.getElementById('downloadExcel');
const downloadJsonBtn = document.getElementById('downloadJson');
const copyJsonBtn = document.getElementById('copyJson');
const copyTableBtn = document.getElementById('copyTable');

function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function enableExportButtons(enabled) {
  downloadExcelBtn.disabled = !enabled;
  downloadJsonBtn.disabled = !enabled;
  copyJsonBtn.disabled = !enabled;
  copyTableBtn.disabled = !enabled;
}

function resetPortfolioState() {
  portfolioData = null;
  enableExportButtons(false);
  previewEl.style.display = 'none';
  previewTextEl.textContent = '';
}

function showPreview(data) {
  const count = data.positions?.length || 0;
  let preview = `✅ Found ${count} position(s)\n\n`;
  
  if (count > 0) {
    // Show summary
    let totalPL = 0;
    let winners = 0;
    let losers = 0;
    
    data.positions.forEach(p => {
      if (p.plValue > 0) winners++;
      else if (p.plValue < 0) losers++;
      totalPL += p.plValue || 0;
    });
    
    preview += `P/L: €${totalPL.toFixed(2)}\n`;
    preview += `Winners: ${winners} | Losers: ${losers}\n\n`;
    
    // Show top positions
    preview += `Top positions:\n`;
    data.positions.slice(0, 5).forEach(p => {
      const pl = p.pl || '€0';
      const icon = (p.plValue || 0) >= 0 ? '🟢' : '🔴';
      preview += `${icon} ${p.symbol}: ${pl}\n`;
    });
    
    if (count > 5) {
      preview += `... and ${count - 5} more`;
    }
  }
  
  previewTextEl.textContent = preview;
  previewEl.style.display = 'block';
}

function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  const trimmed = str.trimStart();
  if (trimmed && ['=', '+', '-', '@'].includes(trimmed[0])) {
    str = `'${str}`;
  }
  return str;
}

function csvEscape(value) {
  const sanitized = sanitizeCsvCell(value);
  const escaped = sanitized.replace(/"/g, '""');
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function toCSV(data) {
  if (!data.positions || data.positions.length === 0) {
    return 'No positions found';
  }
  
  const headers = ['Symbol', 'Name', 'Type', 'Price', 'Units', 'Avg Open', 'P/L', 'P/L %'];
  const rows = [headers.map(csvEscape).join(',')];
  
  data.positions.forEach(p => {
    const row = [
      p.symbol || '',
      p.name || '',
      p.type || '',
      p.price || '',
      p.units || '',
      p.avgOpen || '',
      p.pl || '',
      p.plPercent ? `${p.plPercent}%` : ''
    ];
    rows.push(row.map(csvEscape).join(','));
  });
  
  // Add totals row
  const totalPL = data.positions.reduce((sum, p) => sum + (p.plValue || 0), 0);
  rows.push('');
  rows.push(['TOTAL', '', '', '', '', '', `€${totalPL.toFixed(2)}`, ''].map(csvEscape).join(','));
  rows.push(['Generated', data.timestamp, '', '', '', '', '', ''].map(csvEscape).join(','));
  
  return rows.join('\n');
}

function toTable(data) {
  if (!data.positions || data.positions.length === 0) {
    return 'No positions found';
  }
  
  let table = 'Symbol\tName\tType\tPrice\tUnits\tAvg Open\tP/L\n';
  table += '─'.repeat(80) + '\n';
  
  data.positions.forEach(p => {
    table += `${p.symbol}\t${p.name}\t${p.type}\t${p.price || '-'}\t${p.units || '-'}\t${p.avgOpen || '-'}\t${p.pl}\n`;
  });
  
  const totalPL = data.positions.reduce((sum, p) => sum + (p.plValue || 0), 0);
  table += '─'.repeat(80) + '\n';
  table += `TOTAL\t\t\t\t\t\t€${totalPL.toFixed(2)}\n`;
  
  return table;
}

// Read Portfolio button
scrapeBtn.addEventListener('click', async () => {
  setStatus('Reading portfolio...', 'info');
  scrapeBtn.disabled = true;
  resetPortfolioState();
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url?.includes('etoro.com/portfolio')) {
      setStatus('Please open your eToro Portfolio page first.', 'error');
      scrapeBtn.disabled = false;
      return;
    }
    
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapePortfolio' });
    
    if (response) {
      if (response.errors && response.errors.length > 0) {
        setStatus(`Error: ${response.errors.join(', ')}`, 'error');
        scrapeBtn.disabled = false;
        return;
      }

      portfolioData = response;
      const count = response.positions?.length || 0;
      
      if (count > 0) {
        setStatus(`✓ Found ${count} positions`, 'success');
        enableExportButtons(true);
        showPreview(response);
      } else {
        setStatus('No positions found. Make sure you\'re on the Portfolio page and scroll to load all positions.', 'error');
        resetPortfolioState();
      }
    } else {
      setStatus('No response. Try refreshing the page.', 'error');
      resetPortfolioState();
    }
  } catch (error) {
    console.error('Scrape error:', error);
    setStatus(`Error: ${error.message}`, 'error');
    resetPortfolioState();
  }
  
  scrapeBtn.disabled = false;
});

// Download Excel (CSV)
downloadExcelBtn.addEventListener('click', () => {
  if (!portfolioData) return;
  
  const csv = toCSV(portfolioData);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `etoro-portfolio-${date}.csv`;
  a.click();
  
  URL.revokeObjectURL(url);
  setStatus('✓ CSV downloaded!', 'success');
});

// Download JSON
downloadJsonBtn.addEventListener('click', () => {
  if (!portfolioData) return;
  
  const blob = new Blob([JSON.stringify(portfolioData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `etoro-portfolio-${date}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  setStatus('✓ JSON downloaded!', 'success');
});

// Copy JSON
copyJsonBtn.addEventListener('click', async () => {
  if (!portfolioData) return;
  
  try {
    await navigator.clipboard.writeText(JSON.stringify(portfolioData, null, 2));
    setStatus('✓ JSON copied!', 'success');
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`, 'error');
  }
});

// Copy Table
copyTableBtn.addEventListener('click', async () => {
  if (!portfolioData) return;
  
  try {
    const table = toTable(portfolioData);
    await navigator.clipboard.writeText(table);
    setStatus('✓ Table copied!', 'success');
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`, 'error');
  }
});

// Check if on eToro on load
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab?.url?.includes('etoro.com/portfolio')) {
    setStatus('Ready! Click "Read Portfolio" to export.', 'success');
  } else if (tab?.url?.includes('etoro.com')) {
    setStatus('Navigate to Portfolio page for best results.', 'info');
  }
});
