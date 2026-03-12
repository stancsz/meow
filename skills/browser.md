# Browser Interaction Skill
This skill enables SimpleClaw to navigate and interact with web pages using `agent-browser`.

## Capabilities
- **navigate(url)**: Open any URL.
- **click(selector)**: Click an element on the page.
- **type(selector, text)**: Type text into a field.
- **snapshot()**: Get the DOM structure and current state. Use this FREQUENTLY to see what's on the page.
- **screenshot()**: Get a visual screenshot (if supported).
- **wait()**: Wait for elements to load or animations to finish.

## Guidance for Flights & Search
1. **Search Engines first**: If you don't know the exact URL, start by navigating to `https://www.google.com/search?q=flights+from+Calgary+to+Hong+Kong`.
2. **Examine Snapshots**: After every action, call `snapshot()` to see the new state of the page. Look for text like "$", travel times, and airline names.
3. **Be Persistent**: If a selector doesn't work, try another one or look for broader elements.
4. **Summary Format**: When returning flight info, provide a clean summary including:
   - Price range (e.g., $400 - $1200 CAD)
   - Airlines (e.g., Air Canada, Cathay Pacific)
   - Travel duration
   - Cheapest months
   - Reference URLs

## Example Workflow
1. `browser({ action: "navigate", url: "https://www.google.com/search?q=flights+from+YYC+to+HKG" })`
2. `browser({ action: "snapshot" })`
3. (Optional) `browser({ action: "click", selector: "..." })` if you need to expand results.
4. Finalize with a professional summary.

