# Browser Interaction Skill
This skill enables SimpleClaw to navigate and interact with web pages using `agent-browser`.

## Capabilities
- **Navigation**: Open any URL.
- **Interaction**: Click elements, type text into fields.
- **Analysis**: Take snapshots of the page state (DOM refs) or screenshots.

## Usage
When the user asks to "check the price of X" or "login to Y", use the browser tool to perform the actions.
Always start by navigating to the target URL.
Use snapshots to understand the page structure and find selectors.
