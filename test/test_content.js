// Tests for content.js parsing functions
// Run: node --test test/test_content.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mock Chrome APIs before requiring content.js
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    onMessage: { addListener: () => {} }
  }
};
global.window = { location: { href: 'https://www.etoro.com/portfolio' } };
global.document = { body: { innerText: '' }, querySelectorAll: () => [] };

const {
  parseNumber, parseCurrencyValue, parsePositionText,
  classifyAssetType, calculatePLPercent, detectCurrency,
  getCurrencySymbol, isHeaderLine, CRYPTO_SYMBOLS
} = require('../content.js');


// ── Sample data from real eToro portfolio ──────────────────────────────────────

const SAMPLE_POSITIONS = [
  {
    text: 'HLIO Helios Technologies Inc 71.99 -0.7082 (-0.97%) 9.25926 Long 54 €140.58',
    expected: { symbol: 'HLIO', name: 'Helios Technologies Inc', type: 'Stock', direction: 'Long', price: 71.99, units: 9.25926, avgOpen: 54, plValue: 140.58 }
  },
  {
    text: 'ASML.NV ASML Holding NV 1188.01 -16.79 (-1.39%) 0.459259 Long 941.4 €126.80',
    expected: { symbol: 'ASML.NV', name: 'ASML Holding NV', type: 'Stock', direction: 'Long', price: 1188.01, units: 0.459259, avgOpen: 941.4, plValue: 126.8 }
  },
  {
    text: 'XLE State Street Energy Select Sector SPDR ETF 53.39 -0.2403 (-0.45%) 6.74891 Long 44.4516 €50.63',
    expected: { symbol: 'XLE', name: 'State Street Energy Select Sector SPDR ETF', type: 'ETF', direction: 'Long', price: 53.39, units: 6.74891, avgOpen: 44.4516, plValue: 50.63 }
  },
  {
    text: 'CEMS.DE iShares Edge MSCI Europe Value Factor UCITS ETF 12.732 -0.028 (-0.22%) 78.375499 Long 10.98 €160.17',
    expected: { symbol: 'CEMS.DE', name: 'iShares Edge MSCI Europe Value Factor UCITS ETF', type: 'ETF', direction: 'Long', price: 12.732, units: 78.375499, avgOpen: 10.98, plValue: 160.17 }
  },
  {
    text: 'ITA iShares US Aerospace & Defense ETF 232.97 -1.87 (-0.8%) 1.52404 Long 196.8448 €46.21',
    expected: { symbol: 'ITA', type: 'ETF', direction: 'Long', plValue: 46.21 }
  },
  {
    text: 'EUNN.DE iShares Core MSCI Japan IMI UCITS ETF 66.649 1.299 (1.99%) 11.648921 Long 59.074 €106.15',
    expected: { symbol: 'EUNN.DE', type: 'ETF', direction: 'Long', price: 66.649, plValue: 106.15 }
  },
  {
    text: 'COP 24/5 ConocoPhillips Co 107.83 -0.862 (-0.79%) 1.02669 Long 97.4 €9.13',
    expected: { symbol: 'COP', name: '24/5 ConocoPhillips Co', type: 'Stock', direction: 'Long', plValue: 9.13 }
  },
  {
    text: 'VRT Vertiv Holdings Co 198.69 -3.31 (-1.64%) 1.94704 Long 205.44 -€10.54',
    expected: { symbol: 'VRT', name: 'Vertiv Holdings Co', type: 'Stock', direction: 'Long', plValue: -10.54 }
  },
  {
    text: 'AVGO 24/5 Broadcom Inc 343.68 -0.2563 (-0.07%) 0.9082 Long 407.4 -€48.18',
    expected: { symbol: 'AVGO', type: 'Stock', direction: 'Long', plValue: -48.18 }
  },
  {
    text: 'QCOM 24/5 Qualcomm Inc 138.41 -0.518 (-0.37%) 4.16988 Long 143.79784 -€18.12',
    expected: { symbol: 'QCOM', type: 'Stock', direction: 'Long', price: 138.41, plValue: -18.12 }
  },
  {
    text: 'LEN 24/5 Lennar Corp 116.29 2.22 (1.94%) 1.46002 Long 136.969 -€25.12',
    expected: { symbol: 'LEN', type: 'Stock', plValue: -25.12 }
  },
  {
    text: 'WDEF.L WisdomTree Europe Defence UCITS ETF 33.225 -0.264 (-0.79%) 26.09154 Long 32.973 €28.92',
    expected: { symbol: 'WDEF.L', type: 'ETF', direction: 'Long', plValue: 28.92 }
  },
  {
    text: 'BRNT.L WisdomTree Brent Crude Oil 53.34 0.0998 (0.19%) 1.974333 Long 50.65 €4.59',
    expected: { symbol: 'BRNT.L', type: 'Stock', direction: 'Long', plValue: 4.59 }
  },
];


// ── parseNumber ────────────────────────────────────────────────────────────────

describe('parseNumber', () => {
  it('parses simple integers', () => {
    assert.equal(parseNumber('54'), 54);
    assert.equal(parseNumber('0'), 0);
    assert.equal(parseNumber('1234'), 1234);
  });

  it('parses US decimal format', () => {
    assert.equal(parseNumber('71.99'), 71.99);
    assert.equal(parseNumber('12.732'), 12.732);
    assert.equal(parseNumber('0.459259'), 0.459259);
    assert.equal(parseNumber('78.375499'), 78.375499);
    assert.equal(parseNumber('143.79784'), 143.79784);
  });

  it('parses US thousands format', () => {
    assert.equal(parseNumber('1,234.56'), 1234.56);
    assert.equal(parseNumber('9,773.23'), 9773.23);
    assert.equal(parseNumber('11,227.65'), 11227.65);
  });

  it('parses EU decimal format (comma as decimal)', () => {
    assert.equal(parseNumber('0,459259'), 0.459259);
    assert.equal(parseNumber('78,375499'), 78.375499);
    assert.equal(parseNumber('12,73'), 12.73);
  });

  it('parses EU thousands format (dot separator, comma decimal)', () => {
    assert.equal(parseNumber('1.234,56'), 1234.56);
    assert.equal(parseNumber('9.773,23'), 9773.23);
    assert.equal(parseNumber('11.227,65'), 11227.65);
  });

  it('parses EU thousands with multiple dots', () => {
    assert.equal(parseNumber('1.234.567'), 1234567);
  });

  it('parses negative numbers', () => {
    assert.equal(parseNumber('-0.7082'), -0.7082);
    assert.equal(parseNumber('-16.79'), -16.79);
    assert.equal(parseNumber('-3.31'), -3.31);
    assert.equal(parseNumber('-48.18'), -48.18);
  });

  it('handles unicode minus signs', () => {
    assert.equal(parseNumber('\u2212123.45'), -123.45);  // minus sign
    assert.equal(parseNumber('\u201348.18'), -48.18);     // en-dash
    assert.equal(parseNumber('\uFF0D10.54'), -10.54);     // fullwidth minus
  });

  it('strips currency symbols', () => {
    assert.equal(parseNumber('€140.58'), 140.58);
    assert.equal(parseNumber('$1234.56'), 1234.56);
    assert.equal(parseNumber('£99.99'), 99.99);
  });

  it('handles negative currency values', () => {
    assert.equal(parseNumber('-€48.18'), -48.18);
    assert.equal(parseNumber('€-48.18'), -48.18);
    assert.equal(parseNumber('-$10.54'), -10.54);
  });

  it('returns null for empty/invalid input', () => {
    assert.equal(parseNumber(null), null);
    assert.equal(parseNumber(undefined), null);
    assert.equal(parseNumber(''), null);
    assert.equal(parseNumber('abc'), null);
    assert.equal(parseNumber('-'), null);
  });

  it('parses real portfolio values from sample data', () => {
    assert.equal(parseNumber('9.25926'), 9.25926);
    assert.equal(parseNumber('44.4516'), 44.4516);
    assert.equal(parseNumber('941.4'), 941.4);
    assert.equal(parseNumber('1188.01'), 1188.01);
    assert.equal(parseNumber('205.44'), 205.44);
    assert.equal(parseNumber('407.4'), 407.4);
  });
});


// ── parseCurrencyValue ─────────────────────────────────────────────────────────

describe('parseCurrencyValue', () => {
  it('parses positive euro values', () => {
    assert.equal(parseCurrencyValue('€140.58'), 140.58);
    assert.equal(parseCurrencyValue('€50.63'), 50.63);
    assert.equal(parseCurrencyValue('€0.32'), 0.32);
  });

  it('parses negative euro values', () => {
    assert.equal(parseCurrencyValue('-€10.54'), -10.54);
    assert.equal(parseCurrencyValue('-€48.18'), -48.18);
    assert.equal(parseCurrencyValue('-€25.12'), -25.12);
  });

  it('returns 0 for null/empty', () => {
    assert.equal(parseCurrencyValue(null), 0);
    assert.equal(parseCurrencyValue(''), 0);
    assert.equal(parseCurrencyValue(undefined), 0);
  });
});


// ── parsePositionText (Pattern 3: regular positions with change data) ──────────

describe('parsePositionText - real eToro positions', () => {
  for (const { text, expected } of SAMPLE_POSITIONS) {
    it(`parses ${expected.symbol}`, () => {
      const result = parsePositionText(text, '€');
      assert.ok(result, `Failed to parse: ${text}`);
      assert.equal(result.symbol, expected.symbol);
      if (expected.name) assert.equal(result.name, expected.name);
      if (expected.type) assert.equal(result.type, expected.type);
      if (expected.direction) assert.equal(result.direction, expected.direction);
      if (expected.price) assert.equal(result.price, expected.price);
      if (expected.units) assert.equal(result.units, expected.units);
      if (expected.avgOpen) assert.equal(result.avgOpen, expected.avgOpen);
      assert.equal(result.plValue, expected.plValue);
    });
  }

  it('calculates P/L percentage for HLIO', () => {
    const result = parsePositionText(
      'HLIO Helios Technologies Inc 71.99 -0.7082 (-0.97%) 9.25926 Long 54 €140.58', '€'
    );
    // invested = 54 * 9.25926 = 500.00004, plPercent = (140.58 / 500.00004) * 100 ≈ 28.12
    assert.equal(result.plPercent, '28.12');
  });

  it('handles "Close Trade" text in input', () => {
    const result = parsePositionText(
      'HLIO Helios Technologies Inc Close Trade 71.99 -0.7082 (-0.97%) 9.25926 Long 54 €140.58', '€'
    );
    assert.ok(result);
    assert.equal(result.symbol, 'HLIO');
    assert.equal(result.plValue, 140.58);
  });
});


// ── parsePositionText (Pattern 1: Smart Portfolios) ────────────────────────────

describe('parsePositionText - Smart Portfolios', () => {
  it('parses smart portfolio with hyphenated name', () => {
    const result = parsePositionText('AI-Revolution Artificial Intelligence Revolution €235.80', '€');
    assert.ok(result);
    assert.equal(result.symbol, 'AI-Revolution');
    assert.equal(result.name, 'Artificial Intelligence Revolution');
    assert.equal(result.type, 'Smart Portfolio');
    assert.equal(result.plValue, 235.80);
  });

  it('parses smart portfolio with negative P/L', () => {
    const result = parsePositionText('GainersQtr Top Quarterly Gainers -€15.20', '€');
    assert.ok(result);
    assert.equal(result.symbol, 'GainersQtr');
    assert.equal(result.type, 'Smart Portfolio');
    assert.equal(result.plValue, -15.20);
  });
});


// ── parsePositionText (Pattern 2: Copy Trading) ───────────────────────────────

describe('parsePositionText - Copy Trading', () => {
  it('parses copy trader position', () => {
    const result = parsePositionText('AnoKam Kamil Florowski €86.40', '€');
    assert.ok(result);
    assert.equal(result.symbol, 'AnoKam');
    assert.equal(result.name, 'Kamil Florowski');
    assert.equal(result.type, 'Copy Trading');
    assert.equal(result.plValue, 86.40);
  });

  it('parses copy trader with negative P/L', () => {
    const result = parsePositionText('TraderX John Smith -€42.10', '€');
    assert.ok(result);
    assert.equal(result.symbol, 'TraderX');
    assert.equal(result.type, 'Copy Trading');
    assert.equal(result.plValue, -42.10);
  });
});


// ── parsePositionText (Pattern 4: simple format) ──────────────────────────────

describe('parsePositionText - simple format (no change data)', () => {
  it('parses position without change column', () => {
    const result = parsePositionText('AAPL Apple Inc 175.50 5.5 Long 150.00 €140.25', '€');
    assert.ok(result);
    assert.equal(result.symbol, 'AAPL');
    assert.equal(result.name, 'Apple Inc');
    assert.equal(result.price, 175.5);
    assert.equal(result.units, 5.5);
    assert.equal(result.direction, 'Long');
    assert.equal(result.avgOpen, 150);
    assert.equal(result.plValue, 140.25);
  });

  it('parses Short position', () => {
    const result = parsePositionText('TSLA Tesla Inc 250.00 3.0 Short 280.00 €90.00', '€');
    assert.ok(result);
    assert.equal(result.direction, 'Short');
    assert.equal(result.plValue, 90);
  });
});


// ── parsePositionText with USD ─────────────────────────────────────────────────

describe('parsePositionText - USD currency', () => {
  it('parses position with $ currency', () => {
    const result = parsePositionText('AAPL Apple Inc 175.50 1.23 (0.71%) 5.5 Long 150.00 $140.25', '$');
    assert.ok(result);
    assert.equal(result.symbol, 'AAPL');
    assert.equal(result.plValue, 140.25);
    assert.equal(result.pl, '$140.25');
  });

  it('parses negative $ P/L', () => {
    const result = parsePositionText('TSLA Tesla Inc 250.00 -3.50 (-1.38%) 3.0 Long 280.00 -$90.00', '$');
    assert.ok(result);
    assert.equal(result.plValue, -90);
  });
});


// ── parsePositionText edge cases ──────────────────────────────────────────────

describe('parsePositionText - edge cases', () => {
  it('returns null for non-position text', () => {
    assert.equal(parsePositionText('Hello world', '€'), null);
    assert.equal(parsePositionText('', '€'), null);
    assert.equal(parsePositionText('Portfolio Overview', '€'), null);
  });

  it('returns null for header lines', () => {
    // These short strings should return null because they don't match any pattern
    assert.equal(parsePositionText('Symbol Name Price', '€'), null);
  });
});


// ── classifyAssetType ──────────────────────────────────────────────────────────

describe('classifyAssetType', () => {
  it('classifies .DE suffix as Stock or ETF', () => {
    assert.equal(classifyAssetType('CEMS.DE', 'iShares Edge MSCI Europe Value Factor UCITS ETF'), 'ETF');
    assert.equal(classifyAssetType('KGX.DE', 'KION GROUP'), 'Stock');
    assert.equal(classifyAssetType('2B76.DE', 'iShares Automation & Robotics UCITS ETF'), 'ETF');
  });

  it('classifies .L suffix as Stock or ETF', () => {
    assert.equal(classifyAssetType('WDEF.L', 'WisdomTree Europe Defence UCITS ETF'), 'ETF');
    assert.equal(classifyAssetType('BRNT.L', 'WisdomTree Brent Crude Oil'), 'Stock');
  });

  it('classifies .NV suffix', () => {
    assert.equal(classifyAssetType('ASML.NV', 'ASML Holding NV'), 'Stock');
  });

  it('classifies crypto symbols', () => {
    assert.equal(classifyAssetType('BTC', 'Bitcoin'), 'Crypto');
    assert.equal(classifyAssetType('ETH', 'Ethereum'), 'Crypto');
    assert.equal(classifyAssetType('DOGE', 'Dogecoin'), 'Crypto');
    assert.equal(classifyAssetType('SOL', 'Solana'), 'Crypto');
    assert.equal(classifyAssetType('AVAX', 'Avalanche'), 'Crypto');
    assert.equal(classifyAssetType('PEPE', 'Pepe'), 'Crypto');
  });

  it('classifies ETFs by name keywords', () => {
    assert.equal(classifyAssetType('XLE', 'State Street Energy Select Sector SPDR ETF'), 'ETF');
    assert.equal(classifyAssetType('IEUR', 'iShares Core MSCI Europe ETF'), 'ETF');
    assert.equal(classifyAssetType('VTI', 'Vanguard Total Stock Market ETF'), 'ETF');
  });

  it('defaults to Stock for unrecognized symbols', () => {
    assert.equal(classifyAssetType('HLIO', 'Helios Technologies Inc'), 'Stock');
    assert.equal(classifyAssetType('COP', '24/5 ConocoPhillips Co'), 'Stock');
    assert.equal(classifyAssetType('VRT', 'Vertiv Holdings Co'), 'Stock');
  });
});


// ── calculatePLPercent ─────────────────────────────────────────────────────────

describe('calculatePLPercent', () => {
  it('calculates correct P/L % for HLIO', () => {
    const pct = calculatePLPercent({ avgOpen: 54, units: 9.25926, plValue: 140.58 });
    assert.equal(pct, '28.12');
  });

  it('calculates correct P/L % for ASML.NV', () => {
    const pct = calculatePLPercent({ avgOpen: 941.4, units: 0.459259, plValue: 126.8 });
    assert.equal(pct, '29.33');
  });

  it('calculates negative P/L %', () => {
    const pct = calculatePLPercent({ avgOpen: 407.4, units: 0.9082, plValue: -48.18 });
    assert.equal(pct, '-13.02');
  });

  it('calculates P/L % for AVGO from sample data', () => {
    const pct = calculatePLPercent({ avgOpen: 407.4, units: 0.9082, plValue: -48.18 });
    assert.equal(pct, '-13.02');
  });

  it('returns null for missing data', () => {
    assert.equal(calculatePLPercent({ avgOpen: null, units: 5, plValue: 10 }), null);
    assert.equal(calculatePLPercent({ avgOpen: 100, units: null, plValue: 10 }), null);
    assert.equal(calculatePLPercent({ avgOpen: 0, units: 5, plValue: 10 }), null);
  });
});


// ── detectCurrency ─────────────────────────────────────────────────────────────

describe('detectCurrency', () => {
  it('detects EUR from page text', () => {
    const text = '€485.55 €9,773.23 €968.86 €11,227.65 HLIO €140.58 ASML.NV €126.80';
    assert.equal(detectCurrency(text), 'EUR');
  });

  it('detects USD from page text', () => {
    const text = '$485.55 $9,773.23 $968.86 $11,227.65 AAPL $140.58';
    assert.equal(detectCurrency(text), 'USD');
  });

  it('detects GBP from page text', () => {
    const text = '£485.55 £9,773.23 £968.86 £11,227.65';
    assert.equal(detectCurrency(text), 'GBP');
  });

  it('defaults to USD when no currency symbols found', () => {
    assert.equal(detectCurrency('some text without currency'), 'USD');
  });

  it('picks the most frequent currency', () => {
    const text = '€100 €200 €300 $50 $60';
    assert.equal(detectCurrency(text), 'EUR');
  });
});


// ── getCurrencySymbol ──────────────────────────────────────────────────────────

describe('getCurrencySymbol', () => {
  it('returns correct symbols', () => {
    assert.equal(getCurrencySymbol('EUR'), '€');
    assert.equal(getCurrencySymbol('USD'), '$');
    assert.equal(getCurrencySymbol('GBP'), '£');
  });

  it('defaults to $ for unknown currencies', () => {
    assert.equal(getCurrencySymbol('JPY'), '$');
    assert.equal(getCurrencySymbol(''), '$');
  });
});


// ── isHeaderLine ───────────────────────────────────────────────────────────────

describe('isHeaderLine', () => {
  it('detects header lines', () => {
    assert.equal(isHeaderLine('Asset Price Units P/L'), true);
    assert.equal(isHeaderLine('Open P/L (%) Avg Open'), true);
    assert.equal(isHeaderLine('Buy Sell Trade History'), true);
  });

  it('does not flag position lines as headers', () => {
    assert.equal(isHeaderLine('HLIO Helios Technologies Inc'), false);
    assert.equal(isHeaderLine('AAPL Apple Inc 175.50'), false);
  });
});


// ── CRYPTO_SYMBOLS ─────────────────────────────────────────────────────────────

describe('CRYPTO_SYMBOLS', () => {
  it('includes major crypto symbols', () => {
    for (const sym of ['BTC', 'ETH', 'XRP', 'ADA', 'SOL', 'DOGE', 'DOT', 'AVAX', 'LINK', 'MATIC']) {
      assert.ok(CRYPTO_SYMBOLS.has(sym), `Missing: ${sym}`);
    }
  });

  it('includes newer/meme coins', () => {
    for (const sym of ['PEPE', 'WIF', 'BONK', 'FLOKI', 'ARB', 'OP', 'SUI']) {
      assert.ok(CRYPTO_SYMBOLS.has(sym), `Missing: ${sym}`);
    }
  });

  it('does not include stock symbols', () => {
    for (const sym of ['AAPL', 'TSLA', 'HLIO', 'AVGO', 'QCOM']) {
      assert.ok(!CRYPTO_SYMBOLS.has(sym), `Should not contain: ${sym}`);
    }
  });
});


// ── Integration: full position count matches sample data ───────────────────────

describe('integration: parse all 21 sample positions', () => {
  const sampleLines = [
    'HLIO Helios Technologies Inc 71.99 -0.7082 (-0.97%) 9.25926 Long 54 €140.58',
    'ASML.NV ASML Holding NV 1188.01 -16.79 (-1.39%) 0.459259 Long 941.4 €126.80',
    'XLE State Street Energy Select Sector SPDR ETF 53.39 -0.2403 (-0.45%) 6.74891 Long 44.4516 €50.63',
    'CEMS.DE iShares Edge MSCI Europe Value Factor UCITS ETF 12.732 -0.028 (-0.22%) 78.375499 Long 10.98 €160.17',
    'ITA iShares US Aerospace & Defense ETF 232.97 -1.87 (-0.8%) 1.52404 Long 196.8448 €46.21',
    'EUNN.DE iShares Core MSCI Japan IMI UCITS ETF 66.649 1.299 (1.99%) 11.648921 Long 59.074 €106.15',
    'IQQS.DE iShares EURO STOXX Small UCITS ETF 52.141 0.021 (0.04%) 14.372783 Long 47.9 €79.13',
    'COP 24/5 ConocoPhillips Co 107.83 -0.862 (-0.79%) 1.02669 Long 97.4 €9.13',
    'IEUR iShares Core MSCI Europe ETF 75.76 -0.0939 (-0.12%) 14.42311 Long 69.3318 €77.82',
    'BRNT.L WisdomTree Brent Crude Oil 53.34 0.0998 (0.19%) 1.974333 Long 50.65 €4.59',
    'WDEF.L WisdomTree Europe Defence UCITS ETF 33.225 -0.264 (-0.79%) 26.09154 Long 32.973 €28.92',
    '2B76.DE iShares Automation & Robotics UCITS ETF 14.306 0.026 (0.18%) 11.873337 Long 14.422 €2.27',
    'FLR.US Fluor Corp 47.95 -0.2921 (-0.61%) 4.21319 Long 47.47 €1.98',
    'KGX.DE KION GROUP 63.2 1.8 (2.93%) 1.330894 Long 64.4 €0.32',
    'NEE 24/5 NextEra Energy Inc 89.58 0.1054 (0.12%) 2.23564 Long 89.46 €0.49',
    'VRT Vertiv Holdings Co 198.69 -3.31 (-1.64%) 1.94704 Long 205.44 -€10.54',
    'QCOM 24/5 Qualcomm Inc 138.41 -0.518 (-0.37%) 4.16988 Long 143.79784 -€18.12',
    'APP 24/5 Applovin Corp 464.9 4.52 (0.98%) 1.03004 Long 485.4199 -€17.13',
    'LEN 24/5 Lennar Corp 116.29 2.22 (1.94%) 1.46002 Long 136.969 -€25.12',
    'AVGO 24/5 Broadcom Inc 343.68 -0.2563 (-0.07%) 0.9082 Long 407.4 -€48.18',
    'ABT 24/5 Abbott Laboratories 112.09 1.02 (0.92%) 1.12841 Long 132.93 -€19.58',
  ];

  it('parses all 21 positions successfully', () => {
    const parsed = sampleLines.map(line => parsePositionText(line, '€')).filter(Boolean);
    assert.equal(parsed.length, 21, `Expected 21, got ${parsed.length}`);
  });

  it('total P/L matches sample data', () => {
    const parsed = sampleLines.map(line => parsePositionText(line, '€')).filter(Boolean);
    const totalPL = parsed.reduce((sum, p) => sum + (p.plValue || 0), 0);
    // Sample data says totalPL = 696.52
    assert.ok(Math.abs(totalPL - 696.52) < 0.02, `Total P/L ${totalPL.toFixed(2)} should be ~696.52`);
  });

  it('identifies correct number of ETFs', () => {
    const parsed = sampleLines.map(line => parsePositionText(line, '€')).filter(Boolean);
    const etfs = parsed.filter(p => p.type === 'ETF');
    // XLE, CEMS.DE, ITA, EUNN.DE, IQQS.DE, IEUR, WDEF.L, 2B76.DE = 8
    assert.equal(etfs.length, 8, `Expected 8 ETFs, got ${etfs.length}: ${etfs.map(e => e.symbol).join(', ')}`);
  });

  it('identifies correct number of Stocks', () => {
    const parsed = sampleLines.map(line => parsePositionText(line, '€')).filter(Boolean);
    const stocks = parsed.filter(p => p.type === 'Stock');
    // HLIO, ASML.NV, COP, BRNT.L, FLR.US, KGX.DE, NEE, VRT, QCOM, APP, LEN, AVGO, ABT = 13
    assert.equal(stocks.length, 13, `Expected 13 Stocks, got ${stocks.length}: ${stocks.map(s => s.symbol).join(', ')}`);
  });

  it('all positions have P/L percentage calculated', () => {
    const parsed = sampleLines.map(line => parsePositionText(line, '€')).filter(Boolean);
    const withPercent = parsed.filter(p => p.plPercent !== null);
    assert.equal(withPercent.length, 21);
  });
});
