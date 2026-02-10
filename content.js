// eToro Portfolio Exporter - Content Script
// Extracts structured portfolio data from etoro.com

(function() {
  'use strict';

  const CRYPTO_SYMBOLS = new Set([
    'BTC', 'ETH', 'XRP', 'ADA', 'SOL', 'DOGE', 'DOT', 'AVAX', 'LINK',
    'MATIC', 'SHIB', 'UNI', 'LTC', 'ATOM', 'XLM', 'ALGO', 'NEAR', 'FTM',
    'MANA', 'SAND', 'AXS', 'APE', 'FIL', 'AAVE', 'EOS', 'XTZ', 'IOTA',
    'NEO', 'DASH', 'ETC', 'MKR', 'COMP', 'ZEC', 'BAT', 'ENJ', 'FLOW',
    'CHZ', 'CRO', 'GRT', 'SNX', 'SUSHI', 'YFI', 'BNB', 'TRX', 'BCH',
    'HBAR', 'VET', 'THETA', 'ICP', 'FTT', 'EGLD', 'ONE', 'GALA', 'LRC',
    'IMX', 'CRV', 'JASMY', 'KSM', 'ZIL', 'RUNE', 'CELO', 'STORJ', 'ANKR',
    'LUNC', 'APT', 'ARB', 'OP', 'SUI', 'SEI', 'TIA', 'JUP', 'PEPE', 'WIF',
    'BONK', 'FLOKI', 'RNDR', 'INJ', 'STX', 'ORDI'
  ]);

  // Currency symbol patterns for auto-detection
  const CURRENCY_MAP = {
    '€': 'EUR',
    '$': 'USD',
    '£': 'GBP',
    'A$': 'AUD',
    'C$': 'CAD',
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (sender?.id !== chrome.runtime.id) {
      return false;
    }
    if (request.action === 'scrapePortfolio') {
      const data = scrapePortfolio();
      sendResponse(data);
    }
    return true;
  });

  function detectCurrency(pageText) {
    // Look for currency symbols near numbers on the page
    const eurMatch = pageText.match(/€[\d,.\s]/g);
    const usdMatch = pageText.match(/\$[\d,.\s]/g);
    const gbpMatch = pageText.match(/£[\d,.\s]/g);

    const counts = {
      'EUR': (eurMatch || []).length,
      'USD': (usdMatch || []).length,
      'GBP': (gbpMatch || []).length,
    };

    let best = 'USD';
    let bestCount = 0;
    for (const [currency, count] of Object.entries(counts)) {
      if (count > bestCount) {
        best = currency;
        bestCount = count;
      }
    }
    return best;
  }

  function getCurrencySymbol(currency) {
    const symbols = { 'EUR': '€', 'USD': '$', 'GBP': '£', 'AUD': 'A$', 'CAD': 'C$' };
    return symbols[currency] || '$';
  }

  function scrapePortfolio() {
    const result = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      currency: 'USD',
      currencySymbol: '$',
      portfolio: {
        totalValue: null,
        totalPL: null,
        totalPLPercent: null
      },
      positions: [],
      errors: []
    };

    try {
      if (!isPortfolioPage()) {
        result.errors.push('Not on eToro portfolio page');
        return result;
      }

      // Get visible text content
      const pageText = document.body.innerText;

      // Auto-detect currency from page content
      result.currency = detectCurrency(pageText);
      result.currencySymbol = getCurrencySymbol(result.currency);
      const sym = result.currencySymbol;
      const symEsc = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Try to extract total values from page
      const totalPattern = new RegExp(symEsc + '([\\d,]+\\.?\\d*)', 'g');
      const totalMatch = pageText.match(totalPattern);
      if (totalMatch && totalMatch.length >= 2) {
        result.portfolio.rawTotals = totalMatch.slice(-4);
      }

      // Extract from grid data elements (primary method)
      const gridItems = document.querySelectorAll('[class*="grid"], [class*="row"], [class*="position"], [class*="instrument"]');
      const parsedFromGrid = new Set();

      gridItems.forEach(el => {
        const text = el.innerText.trim();
        if (!text || text.length < 10 || text.length > 500) return;

        // Skip navigation/header elements
        if (text.includes('Home') && text.includes('Wallet')) return;
        if (isHeaderLine(text)) return;

        const position = parsePositionText(text, sym);
        if (position && position.symbol) {
          result.positions.push(position);
          parsedFromGrid.add(text.substring(0, 80));
        }
      });

      // Fallback: parse from full page text (only lines not already captured)
      const lines = pageText.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        if (isHeaderLine(line)) return;
        // Skip lines that were likely already parsed from grid elements
        if (parsedFromGrid.has(line.trim().substring(0, 80))) return;

        const position = parsePositionText(line, sym);
        if (position && position.symbol) {
          result.positions.push(position);
        }
      });

      // Deduplicate identical positions (same symbol + units + avgOpen = same trade)
      const seen = new Set();
      result.positions = result.positions.filter(p => {
        const key = `${p.symbol}|${p.units}|${p.avgOpen}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      // Calculate totals if we have positions
      if (result.positions.length > 0) {
        result.portfolio.totalPL = result.positions
          .reduce((sum, p) => sum + (p.plValue || 0), 0)
          .toFixed(2);
      }

    } catch (error) {
      result.errors.push(error.message);
    }

    return result;
  }

  function parsePositionText(text, currencySymbol) {
    const position = {
      symbol: null,
      name: null,
      type: null,
      direction: null,
      price: null,
      units: null,
      avgOpen: null,
      pl: null,
      plValue: null,
      plPercent: null
    };

    // Clean up text
    text = text.replace(/Close Trade/g, '').replace(/\s+/g, ' ').trim();

    // Escape currency symbol for use in regex
    const sym = currencySymbol || '€';
    const symEsc = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Unified currency+sign pattern: handles both "€-123" and "-€123"
    const plPattern = `(-?${symEsc}-?[\\d,.]+)`;

    // Pattern 1: Copy Trader - "AnoKam Kamil Florowski €86.40"
    // Checked before Smart Portfolio because it's more specific (exact "Firstname Lastname" format)
    const copyRe = new RegExp(`^([A-Za-z]+)\\s+([A-Z][a-z]+\\s+[A-Z][a-z]+)\\s+${plPattern}$`);
    const copyMatch = text.match(copyRe);
    if (copyMatch) {
      position.symbol = copyMatch[1];
      position.name = copyMatch[2];
      position.type = 'Copy Trading';
      position.pl = copyMatch[3];
      position.plValue = parseCurrencyValue(copyMatch[3]);
      return position;
    }

    // Pattern 2: Smart Portfolio - "AI-Revolution Artificial Intelligence Revolution €235.80"
    const smartRe = new RegExp(`^([A-Za-z-]+)\\s+(.+?)\\s+${plPattern}$`);
    const smartMatch = text.match(smartRe);
    if (smartMatch && !text.includes('Long') && !text.includes('Short')) {
      position.symbol = smartMatch[1];
      position.name = smartMatch[2];
      position.type = 'Smart Portfolio';
      position.pl = smartMatch[3];
      position.plValue = parseCurrencyValue(smartMatch[3]);
      return position;
    }

    // Pattern 3: Regular position - "SYMBOL Name Price Change (%) Units Long AvgOpen €P/L"
    const stockRe = new RegExp(`^([A-Z0-9.]+)\\s+(.+?)\\s+([\\d,.]+)\\s+(-?[\\d,.]+)\\s+\\((-?[\\d,.]+)%\\)\\s+([\\d,.]+)\\s+(Long|Short)\\s+([\\d,.]+)\\s+${plPattern}`);
    const stockMatch = text.match(stockRe);
    if (stockMatch) {
      position.symbol = stockMatch[1];
      position.name = stockMatch[2].trim();
      position.price = parseNumber(stockMatch[3]);
      position.change = parseNumber(stockMatch[4]);
      position.changePercent = parseNumber(stockMatch[5]);
      position.units = parseNumber(stockMatch[6]);
      position.direction = stockMatch[7];
      position.avgOpen = parseNumber(stockMatch[8]);
      position.pl = stockMatch[9];
      position.plValue = parseCurrencyValue(stockMatch[9]);

      position.type = classifyAssetType(position.symbol, position.name);
      position.plPercent = calculatePLPercent(position);

      return position;
    }

    // Pattern 4: Simpler format without change data
    const simpleRe = new RegExp(`^([A-Z0-9.]+)\\s+(.+?)\\s+([\\d,.]+)\\s+([\\d,.]+)\\s+(Long|Short)\\s+([\\d,.]+)\\s+${plPattern}`);
    const simpleMatch = text.match(simpleRe);
    if (simpleMatch) {
      position.symbol = simpleMatch[1];
      position.name = simpleMatch[2].trim();
      position.price = parseNumber(simpleMatch[3]);
      position.units = parseNumber(simpleMatch[4]);
      position.direction = simpleMatch[5];
      position.avgOpen = parseNumber(simpleMatch[6]);
      position.pl = simpleMatch[7];
      position.plValue = parseCurrencyValue(simpleMatch[7]);
      position.type = classifyAssetType(position.symbol, position.name);
      position.plPercent = calculatePLPercent(position);
      return position;
    }

    return null;
  }

  function classifyAssetType(symbol, name) {
    const nameLower = (name || '').toLowerCase();
    if (symbol.includes('.DE') || symbol.includes('.L') || symbol.includes('.NV') ||
        symbol.includes('.PA') || symbol.includes('.AS') || symbol.includes('.MI')) {
      return nameLower.includes('etf') ? 'ETF' : 'Stock';
    }
    if (CRYPTO_SYMBOLS.has(symbol)) {
      return 'Crypto';
    }
    if (nameLower.includes('etf') || nameLower.includes('spdr') || nameLower.includes('ishares') || nameLower.includes('vanguard')) {
      return 'ETF';
    }
    return 'Stock';
  }

  function calculatePLPercent(position) {
    if (!position.avgOpen || !position.units) return null;
    const invested = position.avgOpen * position.units;
    if (invested <= 0) return null;
    return ((position.plValue / invested) * 100).toFixed(2);
  }

  function parseCurrencyValue(str) {
    if (!str) return 0;
    const num = parseNumber(str);
    if (num === null) return 0;
    return num;
  }

  function parseNumber(value) {
    if (value === null || value === undefined) return null;
    let str = String(value).trim();
    if (!str) return null;

    // Normalize unicode minus variants to ASCII hyphen
    str = str.replace(/[\u2212\u2013\u2014\u2015\uFE58\uFF0D]/g, '-');

    const negative = str.includes('-');
    str = str.replace(/[^0-9,.\-]/g, '');
    if (!str || str === '-') return null;

    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    const commaCount = (str.match(/,/g) || []).length;
    const dotCount = (str.match(/\./g) || []).length;

    // Both comma and dot present - last one is decimal separator
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        // EU format: 1.234,56
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        // US format: 1,234.56
        str = str.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      const afterComma = str.substring(lastComma + 1);
      const beforeComma = str.substring(0, lastComma).replace('-', '');

      if (commaCount === 1) {
        if (afterComma.length !== 3 || beforeComma.length <= 2) {
          // EU decimal: 0,459259 or 12,586 or 78,375499
          str = str.replace(',', '.');
        } else {
          // Likely thousands: 1,234
          str = str.replace(/,/g, '');
        }
      } else {
        // Multiple commas = thousands separators
        str = str.replace(/,/g, '');
      }
    } else if (lastDot !== -1) {
      if (dotCount === 1) {
        // Single dot - treat as decimal (safe default)
      } else {
        // Multiple dots = EU thousands: 1.234.567
        str = str.replace(/\./g, '');
      }
    }

    const num = parseFloat(str);
    if (Number.isNaN(num)) return null;
    if (negative && num > 0) return -num;
    return num;
  }

  function isPortfolioPage() {
    return window.location.href.includes('etoro.com/portfolio');
  }

  function isHeaderLine(text) {
    const line = text.toLowerCase();
    if (line.includes('asset') && line.includes('price') && line.includes('units')) return true;
    if (line.includes('p/l') && line.includes('open')) return true;
    if (line.includes('buy') && line.includes('sell') && line.includes('trade')) return true;
    return false;
  }

  // Export for testing (no-op in browser where module is undefined)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseNumber, parseCurrencyValue, parsePositionText,
      classifyAssetType, calculatePLPercent, detectCurrency,
      getCurrencySymbol, isHeaderLine, CRYPTO_SYMBOLS
    };
  }

  console.log('eToro Portfolio Exporter loaded');
})();
