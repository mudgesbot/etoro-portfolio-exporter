# Code Review: eToro Portfolio Exporter

**Reviewer:** Claude (automated review)
**Date:** 2026-02-10
**Scope:** Full codebase (manifest.json, popup.html, popup.js, content.js, parse_portfolio.py, README.md)

---

## Summary

This is a well-structured, privacy-focused Chrome Extension (Manifest V3) that scrapes eToro portfolio data and exports it to CSV/JSON/clipboard, with an optional Python AI-powered parser. The codebase is ~1,100 lines across 6 files. Overall code quality is reasonable for a personal utility, but there are several bugs, security gaps, and documentation inconsistencies that should be addressed.

**Findings:** 5 bugs, 4 security issues, 8 code quality issues, 5 documentation issues

---

## Bugs

### B1. Version mismatch between manifest and README
**Severity:** Medium
**Files:** `manifest.json:4`, `README.md:5`

`manifest.json` declares version `1.0.0` but `README.md` and the changelog say version `1.2.0`. Chrome will show `1.0.0` in the extensions page. The manifest version should be kept in sync.

```json
// manifest.json line 4
"version": "1.0.0",  // Should be "1.2.0"
```

### B2. Incomplete crypto symbol detection
**Severity:** Low
**File:** `content.js:162`

Only 5 crypto symbols are recognized: `['ETH', 'BTC', 'XRP', 'ADA', 'SOL']`. All other cryptos (DOGE, DOT, AVAX, LINK, MATIC, SHIB, etc.) will be misclassified as "Stock".

```js
} else if (['ETH', 'BTC', 'XRP', 'ADA', 'SOL'].includes(position.symbol)) {
```

Consider maintaining a more complete list, or using a heuristic (e.g., eToro may have a CSS class or attribute that indicates asset type).

### B3. CSV export missing UTF-8 BOM for Excel compatibility
**Severity:** Medium
**File:** `popup.js:197`

The CSV file is created without a UTF-8 BOM (`\uFEFF`). European Excel installations often need the BOM to correctly interpret UTF-8 characters like `€`. Without it, the euro symbol and accented characters in position names may render as mojibake.

```js
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
// Should be: new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
```

### B4. Unicode minus sign not handled
**Severity:** Low
**File:** `content.js:210-211`

The `parseNumber` function checks for ASCII hyphen-minus (`-`) but eToro's UI may render unicode minus signs (`\u2212`, `\u2013`, `\u2014`). These would be stripped by the regex without being detected as negative, resulting in negative P/L values being reported as positive.

```js
const negative = str.includes('-');
str = str.replace(/[^0-9,.\-]/g, '');
```

Should also check for and normalize unicode minus variants before processing.

### B5. P/L percentage calculation ignores short position mechanics
**Severity:** Low
**File:** `content.js:171-176`

The P/L percentage is calculated as `(plValue / invested) * 100` regardless of direction. For short positions, the relationship between average open, current price, and P/L is inverted. If eToro already reports the signed P/L value, this may work coincidentally, but the logic doesn't account for direction.

---

## Security Issues

### S1. Bare `except` clause catches system exceptions
**Severity:** Medium
**File:** `parse_portfolio.py:34`

The bare `except:` catches `KeyboardInterrupt`, `SystemExit`, and other exceptions that should propagate. This can make the script hard to kill.

```python
try:
    resp = requests.get('http://localhost:11434/api/tags', timeout=2)
    if resp.status_code == 200:
        return 'ollama', None
except:  # Should be: except Exception:
    pass
```

### S2. No Content Security Policy in manifest
**Severity:** Low
**File:** `manifest.json`

No `content_security_policy` is defined. While Manifest V3 has strict defaults, explicitly declaring a CSP is a defense-in-depth practice that documents the extension's security posture.

### S3. Unvalidated JSON from LLM responses
**Severity:** Medium
**File:** `parse_portfolio.py:76, 94, 114`

LLM responses are parsed with `json.loads()` without validation against an expected schema. A malformed or adversarial LLM response could produce unexpected data structures that downstream consumers don't handle.

```python
return json.loads(result['response'])  # No schema validation
```

### S4. CSV injection: minus sign (`-`) not sanitized
**Severity:** Low
**File:** `popup.js:74-75`

The `sanitizeCsvCell` function intentionally skips `-` to preserve negative numbers. This is a reasonable trade-off, but the changelog at `README.md:126` claims `-` is sanitized, which is inaccurate. The actual risk is low since `-` alone doesn't trigger formula execution in modern spreadsheet apps, but the documentation should match the code.

---

## Code Quality Issues

### Q1. Hardcoded currency symbol throughout
**Severity:** Medium
**Files:** `content.js:22`, `popup.js:50`, `popup.js:139`

The currency is hardcoded to `EUR`/`€` in multiple places. Users with USD, GBP, or other currency accounts will see incorrect currency symbols. The currency should be detected from the page or made configurable.

```js
// content.js:22
currency: 'EUR',

// popup.js:50
preview += `P/L: €${totalPL.toFixed(2)}\n`;

// popup.js:139
table += `TOTAL\t\t\t\t\t\t€${totalPL.toFixed(2)}\n`;
```

### Q2. Inconsistent P/L regex patterns across position types
**Severity:** Low
**File:** `content.js:123, 146, 182`

The euro/P&L capture groups differ across patterns:
- Pattern 1 (Smart Portfolio): `(€-?[\d,.]+)` — euro first, then optional minus
- Pattern 3 (Regular): `(-?€[\d,.]+)` — optional minus first, then euro
- These may miss matches depending on which format eToro actually uses

The patterns should be unified to handle both `€-123` and `-€123`.

### Q3. Table export missing P/L percentage column
**Severity:** Low
**File:** `popup.js:130`

The `toTable` function's header includes `P/L` but not `P/L %`, while the CSV export (`toCSV`) includes both. This is an inconsistency between the two export formats.

### Q4. Duplicate total P/L calculation
**Severity:** Low
**Files:** `popup.js:40-48`, `popup.js:117`, `popup.js:137`, `content.js:88-96`

The total P/L is calculated independently in 4 places using the same `reduce`/`forEach` pattern. This should be computed once and stored, or extracted into a shared utility.

### Q5. `parseEuroValue` is a trivial wrapper
**Severity:** Low
**File:** `content.js:199-204`

The function adds no value over calling `parseNumber` directly — it just converts `null` to `0`, which callers could handle. Consider inlining or documenting why the wrapper exists.

```js
function parseEuroValue(str) {
    if (!str) return 0;
    const num = parseNumber(str);
    if (num === null) return 0;
    return num;
}
```

### Q6. No timeout/retry for `chrome.tabs.sendMessage`
**Severity:** Low
**File:** `popup.js:159`

If the content script hasn't finished loading when the popup sends a message, the call fails silently (returns `undefined`). The user sees "No response. Try refreshing the page." without understanding why. A short delay + retry or an explicit readiness check would improve UX.

### Q7. `scrapePortfolio` extracts from both DOM elements and page text, causing double-processing
**Severity:** Low
**File:** `content.js:49-73`

The function first queries DOM elements matching `[class*="grid"]` etc., then separately splits the full page text by newlines and parses each line. This means the same position text is likely parsed twice, relying on deduplication to clean it up. This works but is inefficient and fragile — if any field differs slightly between the two passes, deduplication won't catch it and you'll get near-duplicate entries.

### Q8. Content script loads on all eToro pages
**Severity:** Low
**File:** `manifest.json:23`

The content script matches `https://www.etoro.com/*`, meaning it loads on every eToro page (login, settings, feed, etc.) even though it's only useful on the portfolio page. Narrowing the match to `https://www.etoro.com/portfolio*` would be more efficient, though eToro's SPA routing may complicate this.

---

## Documentation Issues

### D1. README contains hardcoded developer path
**Severity:** Medium
**File:** `README.md:35`

```
cd /Users/mudges/clawd/projects/etoro-chrome-extension
```

This is a developer-specific local path that's meaningless to other users. Should use a generic placeholder or relative path.

### D2. README references "Scrape Page" but button says "Read Portfolio"
**Severity:** Low
**Files:** `README.md:44`, `popup.html:98`

The README says `Click extension icon → "Scrape Page"` but the actual button text is `📖 Read Portfolio` (changed in commit `2528ca0`). The docs weren't updated to match.

### D3. README references "Mudges" (personal tool)
**Severity:** Low
**File:** `README.md:41, 46`

The "Quick Method" section is titled "Quick Method (via Mudges)" and instructs users to "Paste to Mudges". This appears to be a personal tool/alias and is confusing for external users.

### D4. README claims `.xlsx` export but actual format is CSV
**Severity:** Medium
**File:** `README.md:12`

```
📁 **Multiple Formats** — Excel (.xlsx), CSV, JSON, Clipboard
```

The extension exports `.csv` files, not `.xlsx`. The button also says "Excel (CSV)" which is more accurate, but the feature list is misleading.

### D5. Changelog says `-` is sanitized for CSV injection but code doesn't
**Severity:** Low
**File:** `README.md:126`

```
🔒 CSV injection protection (sanitizes `=`, `+`, `-`, `@` prefixes)
```

The actual code at `popup.js:74-75` explicitly does **not** sanitize `-` (with a comment explaining why). The changelog should be corrected.

---

## Positive Observations

- **Privacy-first architecture**: No external calls unless explicitly using the optional AI parser
- **CSV injection protection**: Proactive sanitization of formula characters
- **Sender validation**: Content script validates `sender.id` to prevent cross-extension message spoofing
- **Smart number parsing**: Handles both EU and US number formats with reasonable heuristics
- **Clean IIFE pattern**: Content script properly isolates its scope
- **Good error handling in popup**: UI state resets correctly on errors, scrape button is re-enabled in all paths
- **Deduplication logic**: Prevents duplicate position entries from the dual-pass extraction

---

## Recommended Priority

1. **Fix version mismatch** (B1) — trivial, high visibility
2. **Fix README inaccuracies** (D1-D5) — important for usability
3. **Add UTF-8 BOM to CSV** (B3) — common user-facing issue
4. **Fix bare except** (S1) — quick fix, better behavior
5. **Handle unicode minus** (B4) — data correctness
6. **Detect currency from page** (Q1) — important for non-EUR users
7. **Expand crypto symbol list** (B2) — improves classification accuracy
