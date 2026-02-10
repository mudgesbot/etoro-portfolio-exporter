# eToro Portfolio Exporter

Chrome extension to export your eToro portfolio data to CSV or JSON.

**Version:** 1.3.0 | **License:** MIT | **Privacy:** 100% local, no data sent anywhere

## Features

- **Structured Export** — Stocks, ETFs, Crypto, Smart Portfolios, Copy Trading
- **Multiple Formats** — CSV (Excel-compatible), JSON, Clipboard (table format)
- **Privacy First** — Runs entirely in your browser, no data sent anywhere
- **International** — Supports EU number formats (1.234,56 and 1,234.56)
- **Multi-Currency** — Auto-detects your account currency (EUR, USD, GBP)
- **Full Data** — Symbol, units, prices, P&L, P&L %, direction (Long/Short)

## How It Works

1. **Chrome Extension** scrapes your portfolio page with smart pattern matching
2. **Structured Parser** extracts positions using regex (no CSS selector fragility)
3. **Export** to your preferred format

Optional: Use the Python AI parser for complex/edge cases.

## Installation

### Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this folder

### Python Parser (optional)

```bash
pip install openai pyperclip  # or just use Ollama locally
```

## Usage

### Quick Method

1. Open [eToro Portfolio](https://www.etoro.com/portfolio)
2. **Scroll down** to load all positions (eToro uses lazy loading)
3. Click the extension icon → "Read Portfolio"
4. Export via CSV, JSON, or copy to clipboard

### AI-Assisted Parsing (optional)

For complex portfolios, you can use the Python parser with a local or cloud LLM:

```bash
# From clipboard
python parse_portfolio.py --clipboard

# From file
python parse_portfolio.py scrape.json -o portfolio.json

# From stdin
cat scrape.json | python parse_portfolio.py -
```

Supports:
- **Ollama** (local, free) — auto-detected at localhost:11434
- **OpenAI** — set `OPENAI_API_KEY`
- **Anthropic** — set `ANTHROPIC_API_KEY`

## Output Format

```json
{
  "portfolio_value": "$12,345.67",
  "total_profit_loss": "+$1,234.56",
  "total_profit_loss_percent": "+11.1%",
  "positions": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc",
      "units": "5.5",
      "avg_price": "$150.00",
      "current_price": "$175.50",
      "invested": "$825.00",
      "value": "$965.25",
      "profit_loss": "+$140.25",
      "profit_loss_percent": "+17.0%"
    }
  ],
  "extraction_confidence": "high"
}
```

## Icons

Add PNG icons to `icons/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## Troubleshooting

**Extension shows "No data captured"**
- Make sure you're on `etoro.com/portfolio` (not the main page)
- **Scroll down** to load all positions — eToro uses lazy loading!
- Try refreshing the page and waiting a few seconds

**Some positions missing**
- eToro lazy-loads content as you scroll
- Scroll through your entire portfolio before clicking "Read Portfolio"
- For large portfolios (50+), scroll slowly to ensure everything loads

**AI parsing fails**
- Check if Ollama is running: `curl localhost:11434/api/tags`
- Or set `OPENAI_API_KEY` environment variable

## Privacy & Security

- Extension runs 100% locally in your browser
- AI parsing can be done locally with Ollama
- No data sent anywhere unless you explicitly use cloud APIs
- CSV exports are sanitized against formula injection attacks (=, +, @)
- Content scripts validate message senders to prevent spoofing

## Changelog

### v1.3.0 (2026-02-10)
**Bug Fixes & Improvements from Code Review**
- Auto-detect account currency from page (EUR, USD, GBP) instead of hardcoding
- Expanded crypto symbol recognition (70+ symbols)
- Handle unicode minus signs in P/L values
- Unified currency+sign regex patterns across all position types
- Added P/L % column to table export
- Added UTF-8 BOM to CSV for proper Excel unicode support
- Added message retry with backoff for content script communication
- Deduplicated total P/L calculation into shared helper
- Reduced duplicate extraction by tracking grid-parsed lines
- Fixed bare `except` clause in Python parser
- Added schema validation for LLM responses
- Fixed version mismatch (manifest now matches changelog)
- Fixed README inaccuracies (stale UI references, format claims)

### v1.2.0 (2026-02-02)
**Security & Quality Improvements**
- Added sender validation for Chrome runtime messages
- CSV injection protection (sanitizes `=`, `+`, `@` prefixes)
- Removed debug exposure (`window.__etoroScraper`)
- EU number format support (both `1,234.56` and `1.234,56`)
- Support for Short positions (not just Long)
- Fixed: Multiple trades of same symbol now captured correctly
- Fixed: Header rows no longer appear in position data
- Better error handling with UI state reset

### v1.1.0 (2026-02-02)
- Structured data parsing (stocks, ETFs, crypto, smart portfolios)
- Excel/CSV export with formatted columns
- Custom trading chart icon

### v1.0.0 (2026-02-02)
- Initial release
- Raw page scraping with AI-assisted parsing
