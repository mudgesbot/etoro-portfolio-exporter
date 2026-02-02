# eToro Portfolio Exporter

Chrome extension to export your eToro portfolio data to Excel, CSV, or JSON.

**Version:** 1.2.0 | **License:** MIT | **Privacy:** 100% local, no data sent anywhere

## Features

- 📊 **Structured Export** — Stocks, ETFs, Crypto, Smart Portfolios
- 📁 **Multiple Formats** — Excel (.xlsx), CSV, JSON, Clipboard
- 🔒 **Privacy First** — Runs entirely in your browser
- 🌍 **International** — Supports EU number formats (1.234,56 and 1,234.56)
- 📈 **Full Data** — Symbol, units, prices, P&L, invested amount, direction (Long/Short)

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
cd /Users/mudges/clawd/projects/etoro-chrome-extension
pip install openai pyperclip  # or just use Ollama locally
```

## Usage

### Quick Method (via Mudges)

1. Open [eToro Portfolio](https://www.etoro.com/portfolio)
2. Click extension icon → "Scrape Page"
3. Click "Copy JSON"
4. Paste to Mudges: "Parse this eToro data: [paste]"

### Local Parsing

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
- Scroll through your entire portfolio before clicking "Scrape"
- For large portfolios (50+), scroll slowly to ensure everything loads

**AI parsing fails**
- Check if Ollama is running: `curl localhost:11434/api/tags`
- Or set `OPENAI_API_KEY` environment variable

## Privacy & Security

- Extension runs 100% locally in your browser
- AI parsing can be done locally with Ollama
- No data sent anywhere unless you explicitly use cloud APIs
- CSV exports are sanitized against formula injection attacks
- Content scripts validate message senders to prevent spoofing

## Changelog

### v1.2.0 (2026-02-02)
**Security & Quality Improvements**
- 🔒 Added sender validation for Chrome runtime messages
- 🔒 CSV injection protection (sanitizes `=`, `+`, `-`, `@` prefixes)
- 🔒 Removed debug exposure (`window.__etoroScraper`)
- 🌍 EU number format support (both `1,234.56` and `1.234,56`)
- 📈 Support for Short positions (not just Long)
- 🐛 Fixed: Multiple trades of same symbol now captured correctly
- 🐛 Fixed: Header rows no longer appear in position data
- ✨ Better error handling with UI state reset

### v1.1.0 (2026-02-02)
- Structured data parsing (stocks, ETFs, crypto, smart portfolios)
- Excel/CSV export with formatted columns
- Custom trading chart icon

### v1.0.0 (2026-02-02)
- Initial release
- Raw page scraping with AI-assisted parsing
