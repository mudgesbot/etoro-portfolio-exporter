// eToro Portfolio Scraper - Content Script
// Captures raw page content for AI parsing

(function() {
  'use strict';

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrapePortfolio') {
      const data = scrapePortfolio();
      sendResponse(data);
    }
    return true;
  });

  function scrapePortfolio() {
    const result = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      method: 'raw-capture-for-ai',
      
      // Primary: visible text content
      visibleText: '',
      
      // Secondary: structured hints we can find
      tables: [],
      numbers: [],
      
      // Metadata
      pageTitle: document.title,
      language: document.documentElement.lang || 'unknown'
    };

    try {
      // 1. Capture all visible text from main content area
      const mainSelectors = [
        'main', '[role="main"]', '.main-content', '#main', 
        '.portfolio', '[class*="portfolio"]', '#app', '.app'
      ];
      
      let mainContent = null;
      for (const sel of mainSelectors) {
        mainContent = document.querySelector(sel);
        if (mainContent) break;
      }
      
      if (!mainContent) {
        mainContent = document.body;
      }
      
      // Get clean visible text
      result.visibleText = getVisibleText(mainContent);
      
      // 2. Extract all tables as structured data
      const tables = document.querySelectorAll('table');
      tables.forEach((table, idx) => {
        const tableData = {
          index: idx,
          headers: [],
          rows: []
        };
        
        // Get headers
        const headers = table.querySelectorAll('th');
        headers.forEach(th => {
          tableData.headers.push(th.textContent.trim());
        });
        
        // Get rows
        const rows = table.querySelectorAll('tr');
        rows.forEach(tr => {
          const cells = tr.querySelectorAll('td');
          if (cells.length > 0) {
            const rowData = [];
            cells.forEach(td => rowData.push(td.textContent.trim()));
            tableData.rows.push(rowData);
          }
        });
        
        if (tableData.rows.length > 0) {
          result.tables.push(tableData);
        }
      });
      
      // 3. Extract all numbers with context (for AI hints)
      const numberPattern = /[\$€£][\d,.]+|[\d,.]+\s*%|[\d,.]+\s*(USD|EUR|GBP)/g;
      const bodyText = document.body.innerText;
      const matches = bodyText.match(numberPattern);
      if (matches) {
        result.numbers = [...new Set(matches)].slice(0, 50); // Unique, max 50
      }
      
      // 4. Look for any JSON data embedded in the page
      const scripts = document.querySelectorAll('script:not([src])');
      scripts.forEach(script => {
        const content = script.textContent;
        if (content && (content.includes('"positions"') || content.includes('"portfolio"'))) {
          // Try to extract JSON-like structures
          try {
            const jsonMatches = content.match(/\{[^{}]{100,}("positions"|"portfolio")[^{}]*\}/g);
            if (jsonMatches) {
              result.embeddedData = jsonMatches.slice(0, 3);
            }
          } catch (e) {
            // Ignore
          }
        }
      });
      
      // 5. Capture screenshot-like grid data (for virtual tables)
      const gridSelectors = [
        '[class*="grid"]', '[class*="list"]', '[class*="row"]',
        '[role="grid"]', '[role="list"]', '[role="row"]'
      ];
      
      const gridItems = [];
      gridSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.textContent.trim();
          if (text.length > 10 && text.length < 500) {
            // Looks like a data row
            if (text.match(/[\$€£%]/) || text.match(/\d+\.\d{2}/)) {
              gridItems.push(text.replace(/\s+/g, ' '));
            }
          }
        });
      });
      
      if (gridItems.length > 0) {
        result.gridData = [...new Set(gridItems)].slice(0, 100);
      }

    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  function getVisibleText(element) {
    // Get text that's actually visible (not hidden)
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip script/style content
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textParts = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text) {
        textParts.push(text);
      }
    }

    return textParts.join(' ').replace(/\s+/g, ' ').trim();
  }

  window.__etoroScraper = { scrapePortfolio };
  console.log('eToro Portfolio Exporter (AI mode) loaded');
})();
