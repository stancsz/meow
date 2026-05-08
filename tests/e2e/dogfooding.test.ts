import { describe, it, expect } from 'vitest';
import { E2EHarness } from './harness';

/**
 * AGENTIC DOGFOODING TEST
 * 
 * This test uses Claude Code to interact with the MEOW TUI.
 * It ensures that the interface is "Agent-Ready" and can be navigated
 * autonomously by external AI systems.
 */
describe('Agentic Dogfooding', () => {
  
  // NOTE: This test requires Claude Code ('claude') to be installed in the PATH
  it.skip('Claude Code should successfully drive MEOW TUI and verify splits', async () => {
    const harness = new E2EHarness();
    
    // We give Claude Code a mission to dogfood our TUI
    const mission = `
      You are testing the MEOW TUI.
      1. Run 'npm run tui'.
      2. Once it's running, type '/split 2' followed by Enter.
      3. Look at the header. Verify that it contains the text 'Splits: 2' or the agent tag '[AGENT:S:2:'.
      4. Type '/exit' to quit.
      5. If you verified the split successfully, output "DOGFOOD_SUCCESS". Otherwise output "DOGFOOD_FAILURE".
    `;

    // Timeout of 2 minutes for the agent to complete the task
    const result = await harness.spawnSpecialist('claude', mission, { timeout: 120000 });
    
    expect(result.stdout).toContain('DOGFOOD_SUCCESS');
  });

  it('TUI should be spawnable in a subprocess (Smoke Test)', async () => {
    const harness = new E2EHarness();
    
    // Smoke test: just make sure it doesn't crash on start when no TTY is present
    const result = await harness.spawnSpecialist('meow', '--tui', { timeout: 10000 });
    
    // Even without a TTY, it should print the initialization logs to stdout before failing or rendering
    // Actually, blessed might crash if no TTY, but our TUI is built on top of it.
    expect(result.exitCode).not.toBe(1); 
  });
});
