// Test importing the actual module from /app/jobs
console.log('Testing lean-agent import from /app/jobs...');
import { runLeanAgent } from '../../agent-kernel/src/core/lean-agent.ts';
console.log('lean-agent loaded:', typeof runLeanAgent);
