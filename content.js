// eToro Portfolio Exporter - Content Script
// Extracts structured portfolio data from etoro.com

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
      currency: 'EUR',
      portfolio: {
        totalValue: null,
        totalPL: null,
        totalPLPercent: null
      },
      positions: [],
      errors: []
    };

    try {
      // Get visible text content
      const pageText = document.body.innerText;
      
      // Try to extract total values from page
      const totalMatch = pageText.match(/€([\d,]+\.?\d*)/g);
      if (totalMatch && totalMatch.length >= 2) {
        // Usually last big numbers are totals
        result.portfolio.rawTotals = totalMatch.slice(-4);
      }

      // Find all position rows - look for patterns like "SYMBOL Name Price Change Units..."
      const positionPatterns = [
        // Pattern: SYMBOL.XX Name Price Change (%) Units Long AvgOpen P/L
        /([A-Z0-9]+(?:\.[A-Z]+)?)\s+([^€\d]+?)\s+([\d,.]+)\s+(-?[\d,.]+)\s+\((-?[\d,.]+)%\)\s+([\d,.]+)\s+Long\s+([\d,.]+)\s+(-?€[\d,.]+)/g,
        // Pattern for Smart Portfolios: Name €P/L
        /^([A-Za-z-]+)\s+([A-Za-z\s]+)\s+(€[\d,.]+)$/gm
      ];

      // Extract from grid data elements
      const gridItems = document.querySelectorAll('[class*="grid"], [class*="row"], [class*="position"], [class*="instrument"]');
      
      gridItems.forEach(el => {
        const text = el.innerText.trim();
        if (!text || text.length < 10 || text.length > 500) return;
        
        // Skip navigation/header elements
        if (text.includes('Home') && text.includes('Wallet')) return;
        if (text.includes('Asset') && text.includes('Price') && text.includes('Units')) return;
        
        const position = parsePositionText(text);
        if (position && position.symbol) {
          // Avoid duplicates
          if (!result.positions.find(p => p.symbol === position.symbol)) {
            result.positions.push(position);
          }
        }
      });

      // Also try parsing from full page text
      const lines = pageText.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        const position = parsePositionText(line);
        if (position && position.symbol) {
          if (!result.positions.find(p => p.symbol === position.symbol)) {
            result.positions.push(position);
          }
        }
      });

      // Calculate totals if we have positions
      if (result.positions.length > 0) {
        let totalPL = 0;
        result.positions.forEach(p => {
          if (p.plValue) {
            totalPL += p.plValue;
          }
        });
        result.portfolio.totalPL = totalPL.toFixed(2);
      }

    } catch (error) {
      result.errors.push(error.message);
    }

    return result;
  }

  function parsePositionText(text) {
    const position = {
      symbol: null,
      name: null,
      type: null,
      price: null,
      units: null,
      avgOpen: null,
      pl: null,
      plValue: null,
      plPercent: null
    };

    // Clean up text
    text = text.replace(/Close Trade/g, '').replace(/\s+/g, ' ').trim();
    
    // Pattern 1: Smart Portfolio - "AI-Revolution Artificial Intelligence Revolution €235.80"
    const smartMatch = text.match(/^([A-Za-z-]+)\s+(.+?)\s+(€-?[\d,.]+)$/);
    if (smartMatch && !text.includes('Long')) {
      position.symbol = smartMatch[1];
      position.name = smartMatch[2];
      position.type = 'Smart Portfolio';
      position.pl = smartMatch[3];
      position.plValue = parseEuroValue(smartMatch[3]);
      return position;
    }

    // Pattern 2: Copy Trader - "AnoKam Kamil Florowski €86.40"  
    const copyMatch = text.match(/^([A-Za-z]+)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(€-?[\d,.]+)$/);
    if (copyMatch) {
      position.symbol = copyMatch[1];
      position.name = copyMatch[2];
      position.type = 'Copy Trading';
      position.pl = copyMatch[3];
      position.plValue = parseEuroValue(copyMatch[3]);
      return position;
    }

    // Pattern 3: Regular position - "SYMBOL Name Price Change (%) Units Long AvgOpen €P/L"
    // Example: "CEMS.DE iShares Edge MSCI Europe Value Factor UCITS ETF 12.563 0.135 (1.09%) 78.375499 Long 10.980 €138.87"
    const stockMatch = text.match(/^([A-Z0-9.]+)\s+(.+?)\s+([\d,.]+)\s+(-?[\d,.]+)\s+\((-?[\d,.]+)%\)\s+([\d,.]+)\s+Long\s+([\d,.]+)\s+(-?€[\d,.]+)/);
    if (stockMatch) {
      position.symbol = stockMatch[1];
      position.name = stockMatch[2].trim();
      position.price = parseFloat(stockMatch[3].replace(',', ''));
      position.change = parseFloat(stockMatch[4].replace(',', ''));
      position.changePercent = parseFloat(stockMatch[5].replace(',', ''));
      position.units = parseFloat(stockMatch[6].replace(',', ''));
      position.avgOpen = parseFloat(stockMatch[7].replace(',', ''));
      position.pl = stockMatch[8];
      position.plValue = parseEuroValue(stockMatch[8]);
      
      // Determine type
      if (position.symbol.includes('.DE') || position.symbol.includes('.L') || position.symbol.includes('.NV')) {
        position.type = position.name.toLowerCase().includes('etf') ? 'ETF' : 'Stock';
      } else if (['ETH', 'BTC', 'XRP', 'ADA', 'SOL'].includes(position.symbol)) {
        position.type = 'Crypto';
      } else if (position.name.toLowerCase().includes('etf') || position.name.toLowerCase().includes('spdr')) {
        position.type = 'ETF';
      } else {
        position.type = 'Stock';
      }
      
      // Calculate P/L percentage
      if (position.avgOpen && position.units) {
        const invested = position.avgOpen * position.units;
        if (invested > 0) {
          position.plPercent = ((position.plValue / invested) * 100).toFixed(2);
        }
      }
      
      return position;
    }

    // Pattern 4: Simpler format without change data
    const simpleMatch = text.match(/^([A-Z0-9.]+)\s+(.+?)\s+([\d,.]+)\s+([\d,.]+)\s+Long\s+([\d,.]+)\s+(-?€[\d,.]+)/);
    if (simpleMatch) {
      position.symbol = simpleMatch[1];
      position.name = simpleMatch[2].trim();
      position.price = parseFloat(simpleMatch[3].replace(',', ''));
      position.units = parseFloat(simpleMatch[4].replace(',', ''));
      position.avgOpen = parseFloat(simpleMatch[5].replace(',', ''));
      position.pl = simpleMatch[6];
      position.plValue = parseEuroValue(simpleMatch[6]);
      position.type = 'Stock';
      return position;
    }

    return null;
  }

  function parseEuroValue(str) {
    if (!str) return 0;
    const negative = str.includes('-');
    const num = parseFloat(str.replace(/[€,\-]/g, '').trim());
    return negative ? -num : num;
  }

  window.__etoroScraper = { scrapePortfolio, parsePositionText };
  console.log('eToro Portfolio Exporter loaded');
})();
