# Browser Interaction Skill
This skill enables SimpleClaw to navigate and interact with web pages using `agent-browser`.

## Capabilities
- **navigate(url)**: Open any URL.
- **click(selector)**: Click an element on the page.
- **type(selector, text)**: Type text into a field.
- **snapshot()**: Get the DOM structure and current state. Use this FREQUENTLY to see what's on the page.
- **screenshot()**: Get a visual screenshot (if supported).
- **wait()**: Wait for elements to load or animations to finish.

## Bypassing Anti-Bot Protection
If you see "Unusual traffic", "CAPTCHA", or "Access Denied":
1.  **Direct travel URLs**: Construct URLs directly for sites like Google Flights, Kayak, or Expedia instead of searching on Google/Bing.
    -   *Google Flights*: `https://www.google.com/travel/flights/search?q=flights+from+[ORIGIN]+to+[DEST]+on+[DATE]`
    -   *Kayak*: `https://www.kayak.com/flights/[ORIG_CODE]-[DEST_CODE]/[DATE]`
2.  **Alternative Search**: Try `https://duckduckgo.com/?q=flights+from+YYC+to+HKG`. It is often more lenient than Google.
3.  **Snapshot first**: Use `snapshot()` immediately upon navigation to check if you are blocked. If blocked, immediately pivot to a different site/strategy.

## Example Workflow
1. `browser({ action: "navigate", url: "https://www.google.com/travel/flights/search?q=flights+from+YYC+to+HKG+on+2026-05-15" })`
2. `browser({ action: "snapshot" })`
3. (If blocked) `browser({ action: "navigate", url: "https://www.kayak.com/flights/YYC-HKG/2026-05-15" })`
4. Finalize with a professional summary.

