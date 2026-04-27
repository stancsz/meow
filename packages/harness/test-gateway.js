// MeowGateway Dogfood Test
const WebSocket = require('ws');

console.log('[TEST] Starting MeowGateway dogfood test...');

const ws = new WebSocket('ws://localhost:8080', {
  headers: { 'Authorization': 'Bearer test_token' }
});

ws.on('open', () => {
  console.log('[TEST] ✅ WebSocket Connected');
  
  // Send a PROMPT message
  const msg = JSON.stringify({
    type: 'PROMPT',
    payload: { text: 'Hello gateway', token: 'test_token' }
  });
  ws.send(msg);
  console.log('[TEST] Sent PROMPT message');
});

ws.on('message', (data) => {
  console.log('[TEST] Received:', data.toString());
});

ws.on('error', (e) => {
  console.log('[TEST] ❌ WebSocket Error:', e.message);
});

ws.on('close', () => {
  console.log('[TEST] Connection closed');
  process.exit(0);
});

setTimeout(() => {
  console.log('[TEST] Test complete');
  ws.close();
  process.exit(0);
}, 5000);