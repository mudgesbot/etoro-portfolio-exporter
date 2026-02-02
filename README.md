# eToro Portfolio Exporter

Chrome extension + AI parser to export your eToro portfolio data.

## How It Works

1. **Chrome Extension** captures raw page content (text, tables, numbers)
2. **AI Parser** extracts structured portfolio data using LLM
3. **Result**: Clean JSON with all your positions

This approach is **robust** — it doesn't rely on fragile CSS selectors that break when eToro changes their layout. The AI understands the content semantically.

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
- Make sure you're on etoro.com/portfolio
- Scroll to load all positions first
- Try refreshing the page

**AI parsing fails**
- Check if Ollama is running: `curl localhost:11434/api/tags`
- Or set `OPENAI_API_KEY` environment variable

## Privacy

- Extension runs 100% locally in your browser
- AI parsing can be done locally with Ollama
- No data sent anywhere unless you explicitly use cloud APIs
