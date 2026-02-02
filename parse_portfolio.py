#!/usr/bin/env python3
"""
Parse eToro portfolio data using AI.

Takes raw scraped data from the Chrome extension and uses an LLM
to extract structured portfolio information.

Usage:
    python parse_portfolio.py <input.json> [--output portfolio.json]
    python parse_portfolio.py --clipboard  # Read from clipboard
    cat scrape.json | python parse_portfolio.py -

Requires:
    pip install openai pyperclip
    
Set OPENAI_API_KEY or use local Ollama (auto-detected)
"""

import json
import sys
import argparse
import os
from pathlib import Path

def get_llm_client():
    """Get an LLM client - tries Ollama first, then OpenAI."""
    
    # Try Ollama first (local, free)
    try:
        import requests
        resp = requests.get('http://localhost:11434/api/tags', timeout=2)
        if resp.status_code == 200:
            return 'ollama', None
    except:
        pass
    
    # Try OpenAI
    api_key = os.environ.get('OPENAI_API_KEY')
    if api_key:
        try:
            from openai import OpenAI
            return 'openai', OpenAI(api_key=api_key)
        except ImportError:
            print("Warning: openai package not installed", file=sys.stderr)
    
    # Try Anthropic
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if api_key:
        try:
            from anthropic import Anthropic
            return 'anthropic', Anthropic(api_key=api_key)
        except ImportError:
            pass
    
    return None, None

def parse_with_ollama(raw_data: dict) -> dict:
    """Parse using local Ollama."""
    import requests
    
    prompt = build_prompt(raw_data)
    
    response = requests.post(
        'http://localhost:11434/api/generate',
        json={
            'model': 'llama3.2',  # or mistral, etc.
            'prompt': prompt,
            'stream': False,
            'format': 'json'
        },
        timeout=60
    )
    
    if response.status_code == 200:
        result = response.json()
        return json.loads(result['response'])
    else:
        raise Exception(f"Ollama error: {response.text}")

def parse_with_openai(client, raw_data: dict) -> dict:
    """Parse using OpenAI API."""
    prompt = build_prompt(raw_data)
    
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a data extraction assistant. Extract structured portfolio data from raw web scrapes. Always respond with valid JSON."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"},
        temperature=0
    )
    
    return json.loads(response.choices[0].message.content)

def parse_with_anthropic(client, raw_data: dict) -> dict:
    """Parse using Anthropic API."""
    prompt = build_prompt(raw_data)
    
    response = client.messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=4096,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )
    
    # Extract JSON from response
    text = response.content[0].text
    # Find JSON in response
    start = text.find('{')
    end = text.rfind('}') + 1
    if start >= 0 and end > start:
        return json.loads(text[start:end])
    raise Exception("No JSON found in response")

def build_prompt(raw_data: dict) -> str:
    """Build the extraction prompt."""
    
    # Prepare context
    visible_text = raw_data.get('visibleText', '')[:8000]
    tables = raw_data.get('tables', [])
    grid_data = raw_data.get('gridData', [])[:50]
    numbers = raw_data.get('numbers', [])[:30]
    
    prompt = """Extract portfolio positions from this eToro page scrape.

Return a JSON object with this structure:
{
  "portfolio_value": "total portfolio value as string with currency",
  "available_cash": "available cash if shown",
  "total_profit_loss": "total P/L as string with currency and sign",
  "total_profit_loss_percent": "total P/L percentage",
  "positions": [
    {
      "symbol": "ticker symbol (e.g., AAPL, TSLA)",
      "name": "full company name",
      "units": "number of units/shares",
      "avg_price": "average purchase price",
      "current_price": "current market price",
      "invested": "amount invested",
      "value": "current value",
      "profit_loss": "P/L amount with sign",
      "profit_loss_percent": "P/L percentage with sign"
    }
  ],
  "extraction_confidence": "high/medium/low",
  "notes": "any issues or uncertainties"
}

Only include fields you can find. Use null for missing values.
Include ALL positions you can identify.

--- PAGE DATA ---

VISIBLE TEXT:
"""
    prompt += visible_text[:6000]
    
    if tables:
        prompt += "\n\nTABLES FOUND:\n"
        for t in tables[:3]:
            prompt += f"Headers: {t.get('headers', [])}\n"
            for row in t.get('rows', [])[:10]:
                prompt += f"  {row}\n"
    
    if grid_data:
        prompt += "\n\nGRID/LIST DATA:\n"
        for item in grid_data[:30]:
            prompt += f"- {item}\n"
    
    if numbers:
        prompt += f"\n\nNUMBERS FOUND: {', '.join(numbers[:20])}\n"
    
    prompt += "\n--- END DATA ---\n\nExtract the portfolio data as JSON:"
    
    return prompt

def main():
    parser = argparse.ArgumentParser(description='Parse eToro portfolio with AI')
    parser.add_argument('input', nargs='?', default='-', 
                        help='Input JSON file (or - for stdin, --clipboard for clipboard)')
    parser.add_argument('--clipboard', '-c', action='store_true',
                        help='Read from clipboard')
    parser.add_argument('--output', '-o', help='Output file (default: stdout)')
    parser.add_argument('--raw', action='store_true', 
                        help='Also include raw scrape in output')
    args = parser.parse_args()
    
    # Read input
    if args.clipboard:
        try:
            import pyperclip
            raw_text = pyperclip.paste()
        except ImportError:
            print("Error: pyperclip not installed. Run: pip install pyperclip", file=sys.stderr)
            sys.exit(1)
    elif args.input == '-':
        raw_text = sys.stdin.read()
    else:
        raw_text = Path(args.input).read_text()
    
    try:
        raw_data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Get LLM client
    provider, client = get_llm_client()
    
    if not provider:
        print("Error: No LLM available. Set OPENAI_API_KEY or run Ollama locally.", file=sys.stderr)
        sys.exit(1)
    
    print(f"Using {provider} for parsing...", file=sys.stderr)
    
    # Parse
    try:
        if provider == 'ollama':
            result = parse_with_ollama(raw_data)
        elif provider == 'openai':
            result = parse_with_openai(client, raw_data)
        elif provider == 'anthropic':
            result = parse_with_anthropic(client, raw_data)
    except Exception as e:
        print(f"Error parsing: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Add metadata
    result['_parsed_at'] = raw_data.get('timestamp')
    result['_source_url'] = raw_data.get('url')
    
    if args.raw:
        result['_raw_scrape'] = raw_data
    
    # Output
    output_json = json.dumps(result, indent=2, ensure_ascii=False)
    
    if args.output:
        Path(args.output).write_text(output_json)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(output_json)

if __name__ == '__main__':
    main()
