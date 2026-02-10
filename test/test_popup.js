// Tests for popup.js export functions
// Run: node --test test/test_popup.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mock browser APIs before requiring popup.js
const mockEl = () => ({ disabled: false, textContent: '', className: '', style: {}, addEventListener: () => {} });
global.document = {
  getElementById: () => mockEl(),
  createElement: () => ({ href: '', download: '', click: () => {} })
};
global.chrome = { tabs: { query: (q, cb) => cb && cb([]) } };
global.navigator = { clipboard: { writeText: async () => {} } };
global.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
global.Blob = class Blob { constructor() {} };

const {
  sanitizeCsvCell, csvEscape, toCSV, toTable,
  getCurrencySymbol, getTotalPL
} = require('../popup.js');


// ── Sample portfolio data (from real eToro export) ─────────────────────────────

const SAMPLE_DATA = {
  timestamp: '2026-02-10T14:45:50.208Z',
  url: 'https://www.etoro.com/portfolio/overview',
  currency: 'EUR',
  currencySymbol: '€',
  positions: [
    { symbol: 'HLIO', name: 'Helios Technologies Inc', type: 'Stock', direction: 'Long', price: 71.99, units: 9.25926, avgOpen: 54, pl: '€140.58', plValue: 140.58, plPercent: '28.12' },
    { symbol: 'ASML.NV', name: 'ASML Holding NV', type: 'Stock', direction: 'Long', price: 1188.01, units: 0.459259, avgOpen: 941.4, pl: '€126.80', plValue: 126.8, plPercent: '29.33' },
    { symbol: 'XLE', name: 'State Street Energy Select Sector SPDR ETF', type: 'ETF', direction: 'Long', price: 53.39, units: 6.74891, avgOpen: 44.4516, pl: '€50.63', plValue: 50.63, plPercent: '16.88' },
    { symbol: 'VRT', name: 'Vertiv Holdings Co', type: 'Stock', direction: 'Long', price: 198.69, units: 1.94704, avgOpen: 205.44, pl: '-€10.54', plValue: -10.54, plPercent: '-2.64' },
    { symbol: 'AVGO', name: '24/5 Broadcom Inc', type: 'Stock', direction: 'Long', price: 343.68, units: 0.9082, avgOpen: 407.4, pl: '-€48.18', plValue: -48.18, plPercent: '-13.02' },
  ]
};

const EMPTY_DATA = { positions: [] };
const USD_DATA = { currencySymbol: '$', positions: [{ plValue: 100 }, { plValue: -30 }] };


// ── getCurrencySymbol ──────────────────────────────────────────────────────────

describe('getCurrencySymbol', () => {
  it('returns symbol from data', () => {
    assert.equal(getCurrencySymbol(SAMPLE_DATA), '€');
    assert.equal(getCurrencySymbol(USD_DATA), '$');
  });

  it('defaults to $ when missing', () => {
    assert.equal(getCurrencySymbol(null), '$');
    assert.equal(getCurrencySymbol({}), '$');
    assert.equal(getCurrencySymbol({ currencySymbol: undefined }), '$');
  });
});


// ── getTotalPL ─────────────────────────────────────────────────────────────────

describe('getTotalPL', () => {
  it('sums P/L from sample data', () => {
    const total = getTotalPL(SAMPLE_DATA);
    // 140.58 + 126.8 + 50.63 + (-10.54) + (-48.18) = 259.29
    assert.ok(Math.abs(total - 259.29) < 0.01, `Expected ~259.29, got ${total}`);
  });

  it('returns 0 for empty positions', () => {
    assert.equal(getTotalPL(EMPTY_DATA), 0);
  });

  it('returns 0 for null data', () => {
    assert.equal(getTotalPL(null), 0);
    assert.equal(getTotalPL(undefined), 0);
  });

  it('handles positions with null plValue', () => {
    const data = { positions: [{ plValue: 50 }, { plValue: null }, { plValue: -20 }] };
    assert.equal(getTotalPL(data), 30);
  });
});


// ── sanitizeCsvCell ────────────────────────────────────────────────────────────

describe('sanitizeCsvCell', () => {
  it('prefixes = with apostrophe', () => {
    assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  });

  it('prefixes + with apostrophe', () => {
    assert.equal(sanitizeCsvCell('+cmd|stuff'), "'+cmd|stuff");
  });

  it('prefixes @ with apostrophe', () => {
    assert.equal(sanitizeCsvCell('@SUM(A1)'), "'@SUM(A1)");
  });

  it('does NOT sanitize minus (needed for negative numbers)', () => {
    assert.equal(sanitizeCsvCell('-10.54'), '-10.54');
    assert.equal(sanitizeCsvCell('-€48.18'), '-€48.18');
  });

  it('passes through normal values', () => {
    assert.equal(sanitizeCsvCell('HLIO'), 'HLIO');
    assert.equal(sanitizeCsvCell('140.58'), '140.58');
    assert.equal(sanitizeCsvCell('Helios Technologies Inc'), 'Helios Technologies Inc');
  });

  it('handles null/undefined', () => {
    assert.equal(sanitizeCsvCell(null), '');
    assert.equal(sanitizeCsvCell(undefined), '');
  });

  it('converts numbers to strings', () => {
    assert.equal(sanitizeCsvCell(42), '42');
    assert.equal(sanitizeCsvCell(0), '0');
  });
});


// ── csvEscape ──────────────────────────────────────────────────────────────────

describe('csvEscape', () => {
  it('escapes values containing commas', () => {
    assert.equal(csvEscape('Helios Technologies, Inc'), '"Helios Technologies, Inc"');
  });

  it('escapes values containing quotes', () => {
    assert.equal(csvEscape('He said "hello"'), '"He said ""hello"""');
  });

  it('escapes values containing newlines', () => {
    assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  });

  it('passes through simple values', () => {
    assert.equal(csvEscape('HLIO'), 'HLIO');
    assert.equal(csvEscape('140.58'), '140.58');
    assert.equal(csvEscape('Stock'), 'Stock');
  });

  it('sanitizes and escapes combined', () => {
    // Sanitized to "'=SUM(A1)" — no comma/quote/newline, so no CSV quoting needed
    assert.equal(csvEscape('=SUM(A1)'), "'=SUM(A1)");
  });

  it('sanitizes and wraps when value also contains comma', () => {
    assert.equal(csvEscape('=SUM(A1,B1)'), "\"'=SUM(A1,B1)\"");
  });
});


// ── toCSV ──────────────────────────────────────────────────────────────────────

describe('toCSV', () => {
  it('generates CSV with correct headers', () => {
    const csv = toCSV(SAMPLE_DATA);
    const lines = csv.split('\n');
    assert.equal(lines[0], 'Symbol,Name,Type,Price,Units,Avg Open,P/L,P/L %');
  });

  it('generates correct number of data rows', () => {
    const csv = toCSV(SAMPLE_DATA);
    const lines = csv.split('\n');
    // header + 5 positions + empty line + TOTAL + Generated = 9 lines
    assert.equal(lines.length, 9);
  });

  it('includes position data in correct order', () => {
    const csv = toCSV(SAMPLE_DATA);
    const lines = csv.split('\n');
    // First position: HLIO
    assert.ok(lines[1].startsWith('HLIO,'));
    assert.ok(lines[1].includes('Helios Technologies Inc'));
    assert.ok(lines[1].includes('Stock'));
    assert.ok(lines[1].includes('140.58'));
    assert.ok(lines[1].includes('28.12%'));
  });

  it('includes negative P/L values without formula sanitization', () => {
    const csv = toCSV(SAMPLE_DATA);
    // VRT has plValue -10.54
    assert.ok(csv.includes('-10.54'), 'Should contain -10.54');
    assert.ok(!csv.includes("'-10.54"), 'Should NOT sanitize minus sign');
  });

  it('includes TOTAL row', () => {
    const csv = toCSV(SAMPLE_DATA);
    assert.ok(csv.includes('TOTAL'));
    assert.ok(csv.includes('259.29'));
  });

  it('includes Generated timestamp', () => {
    const csv = toCSV(SAMPLE_DATA);
    assert.ok(csv.includes('Generated'));
    assert.ok(csv.includes('2026-02-10'));
  });

  it('handles empty positions', () => {
    assert.equal(toCSV(EMPTY_DATA), 'No positions found');
  });

  it('includes P/L percentage in CSV', () => {
    const csv = toCSV(SAMPLE_DATA);
    assert.ok(csv.includes('28.12%'));
    assert.ok(csv.includes('-13.02%'));
  });
});


// ── toTable ────────────────────────────────────────────────────────────────────

describe('toTable', () => {
  it('generates table with correct headers including P/L %', () => {
    const table = toTable(SAMPLE_DATA);
    const firstLine = table.split('\n')[0];
    assert.ok(firstLine.includes('Symbol'));
    assert.ok(firstLine.includes('P/L'));
    assert.ok(firstLine.includes('P/L %'));
  });

  it('uses tab separators', () => {
    const table = toTable(SAMPLE_DATA);
    const dataLine = table.split('\n')[2]; // first data line (after header + divider)
    assert.ok(dataLine.includes('\t'), 'Data rows should be tab-separated');
  });

  it('includes position data', () => {
    const table = toTable(SAMPLE_DATA);
    assert.ok(table.includes('HLIO'));
    assert.ok(table.includes('Helios Technologies Inc'));
    assert.ok(table.includes('€140.58'));
  });

  it('includes P/L % in table rows', () => {
    const table = toTable(SAMPLE_DATA);
    assert.ok(table.includes('28.12%'));
    assert.ok(table.includes('-13.02%'));
  });

  it('uses detected currency symbol in total', () => {
    const table = toTable(SAMPLE_DATA);
    assert.ok(table.includes('€259.29'), `Should contain €259.29, got TOTAL line: ${table.split('\n').find(l => l.includes('TOTAL'))}`);
  });

  it('uses $ for USD data', () => {
    const usdData = {
      currencySymbol: '$',
      positions: [
        { symbol: 'AAPL', name: 'Apple', type: 'Stock', price: 175, units: 5, avgOpen: 150, pl: '$125', plValue: 125, plPercent: '16.67' }
      ]
    };
    const table = toTable(usdData);
    assert.ok(table.includes('$125'));
  });

  it('includes divider lines', () => {
    const table = toTable(SAMPLE_DATA);
    assert.ok(table.includes('─'.repeat(90)));
  });

  it('handles empty positions', () => {
    assert.equal(toTable(EMPTY_DATA), 'No positions found');
  });
});
