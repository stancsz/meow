import express from 'express';
import { cloudFunctionHandler } from './cloud-function';

/**
 * Local Emulator wrapper for the real Cloud Function Worker handler.
 * This runs the same cloudFunctionHandler logic but wrapped in an Express
 * server so it can be invoked locally by the dispatcher during testing.
 */
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Forward requests to the same handler defined for GCP
app.post('/', (req, res) => {
  // We type-cast here to bridge the minor differences between express.Request and ff.Request
  // GCP Functions Framework natively wraps express, so this is very close to real execution
  cloudFunctionHandler(req as any, res as any);
});

// Optionally support a /health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: 'local-emulator' });
});

export const startEmulator = () => {
  const server = app.listen(port, () => {
    console.log(`[Local Emulator] Cloud Function Worker simulator listening on port ${port}`);
  });
  return server;
};

// Start automatically if run directly via CLI (e.g. bun run src/workers/local-emulator.ts)
if (require.main === module) {
  startEmulator();
}

export default app;
