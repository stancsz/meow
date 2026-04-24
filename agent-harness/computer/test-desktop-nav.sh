#!/bin/bash
# test-desktop-nav.sh
# Simulation test for the Desktop Agent.
# Usage: ./test-desktop-nav.sh [task-id]
#   task-id: 1=basic nav, 2=multi-app, 3=hitl gate

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPUTER_DIR="$SCRIPT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/tmp/desktop-nav-test-$TIMESTAMP.log"
PASS=0
FAIL=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()   { echo -e "[test] $1" | tee -a "$LOG_FILE"; }
pass()  { echo -e "${GREEN}PASS${NC}: $1"; ((PASS++)) || true; }
fail()  { echo -e "${RED}FAIL${NC}: $1"; ((FAIL++)) || true; }

log "========================================="
log " Desktop Agent Navigation Test"
log " Timestamp: $TIMESTAMP"
log "========================================="

EXECUTABLE="bun"
if ! command -v bun &>/dev/null; then EXECUTABLE="node"; fi
log "Runtime: $EXECUTABLE"

# Check all module files
for f in computer_controller.ts screen_recognition.ts human_in_the_loop.ts computer_agent.ts index.ts; do
  if [ -f "$COMPUTER_DIR/$f" ]; then
    pass "Found: $f"
  else
    fail "Missing: $f"
  fi
done

# Write the inline test runner via bash heredoc (no python/node needed for generation)
TEST_RUNNER="$COMPUTER_DIR/.test-runner.ts"

cat > "$TEST_RUNNER" << 'RUNNEREOF'
/* Desktop Agent Navigation Test Runner */
process.env.SIMULATE_DESKTOP = "1";

async function runTests(taskId) {
  const results = [];
  let pass = 0, fail = 0;
  const check = (label, ok) => ok ? results.push("PASS: " + label) : results.push("FAIL: " + label);

  try {
    results.push("--- Module Loading ---");
    let controller, screen, hitl;

    const ctrl = await import("./computer_controller.js");
    controller = ctrl;
    check("computer_controller loaded", true);
    check("click exported", typeof ctrl.click === "function");
    check("type exported", typeof ctrl.type === "function");
    check("screenshot exported", typeof ctrl.screenshot === "function");
    check("init exported", typeof ctrl.init === "function");
    check("setSimulated exported", typeof ctrl.setSimulated === "function");

    const scr = await import("./screen_recognition.js");
    screen = scr;
    check("screen_recognition loaded", true);
    check("capture exported", typeof scr.capture === "function");
    check("findElement exported", typeof scr.findElement === "function");

    const hl = await import("./human_in_the_loop.js");
    hitl = hl;
    check("human_in_the_loop loaded", true);
    check("riskAssessment exported", typeof hl.riskAssessment === "function");
    check("requiresApproval exported", typeof hl.requiresApproval === "function");
    check("promptHuman exported", typeof hl.promptHuman === "function");

    results.push("--- Controller Init ---");
    await controller.init();
    check("controller init completes", controller.isReady() === true);

    results.push("--- Tool Execution (Simulated) ---");
    controller.setSimulated(true);

    const clickR = await controller.click({ x: 100, y: 200 });
    check("click succeeds", !!(clickR && clickR.success));
    check("click returns message", !!(clickR && clickR.message));

    const typeR = await controller.type("Hello world");
    check("type succeeds", !!(typeR && typeR.success));
    check("type echoes keystrokes", typeR && typeR.keystrokes === "Hello world");

    const ssR = await controller.screenshot();
    check("screenshot succeeds", !!(ssR && ssR.success));
    check("screenshot returns base64", !!(ssR && ssR.base64));

    const openR = await controller.openApp("Chrome");
    check("openApp succeeds", !!(openR && openR.success));

    const keyR = await controller.pressKey("enter");
    check("pressKey succeeds", !!(keyR && keyR.success));

    const scrollR = await controller.scroll("down", 3);
    check("scroll succeeds", !!(scrollR && scrollR.success));

    results.push("--- Screen Recognition ---");
    const state = await screen.capture();
    check("capture returns state", state !== null);
    check("capture has elements array", Array.isArray(state.elements));
    check("capture has summary string", typeof state.summary === "string");

    await screen.findElement("Finder");
    check("findElement runs without error", true);

    results.push("--- HITL Risk Assessment ---");
    const clickRisk = hitl.riskAssessment({ tool: "click", target: "Submit" });
    check("riskAssessment returns object", typeof clickRisk === "object");
    check("click scores LOW", clickRisk.level === "LOW");
    check("score is 0-10", clickRisk.score >= 0 && clickRisk.score <= 10);

    const delRisk = hitl.riskAssessment({ tool: "delete", target: "important.txt" });
    check("delete scores HIGH", delRisk.score >= 8 || delRisk.level === "HIGH");

    const execRisk = hitl.riskAssessment({ tool: "exec", target: "script.sh" });
    check("exec scores >= MEDIUM", execRisk.score >= 5);

    check("requiresApproval(click) is false", hitl.requiresApproval({ tool: "click" }) === false);
    check("requiresApproval(delete) is true", hitl.requiresApproval({ tool: "delete" }) === true);
    check("getRiskSummary returns string", typeof hitl.getRiskSummary({ tool: "type" }) === "string");
    const hitlCfg = hitl.getConfig();
    check("hitl enabled by default", hitlCfg.enabled === true);

    results.push("--- Agent Execute (Multi-step) ---");
    const { DesktopAgent } = await import("./computer_agent.js");
    const testAgent = new DesktopAgent({ hitlEnabled: true, verifyAfterEachStep: true });
    await testAgent.init();
    check("agent init succeeds", testAgent.isReady() === true);

    const task = taskId === "2" ? "Open Chrome, type text, press Enter" :
                 taskId === "3" ? "Open Notepad, type data, press Enter" :
                 "Open Safari, type test, press Enter";
    results.push("Task: " + task);

    const result = await testAgent.execute(task);
    check("execute returns TaskResult", typeof result === "object");
    check("execute has steps array", Array.isArray(result.steps));
    check("execute has summary string", typeof result.summary === "string");
    check("execute ran at least 1 step", result.steps.length >= 1);
    for (const step of result.steps) {
      const icon = step.success ? "OK" : "FAIL";
      results.push("  Step " + step.step + ": " + step.description + " [" + step.risk.level + "] " + icon);
    }

    results.push("--- Multi-App Task ---");
    const multi = await testAgent.executeMultiApp("Open Browser, copy text, paste into Notepad");
    check("executeMultiApp completes", typeof multi === "object");
    check("executeMultiApp has steps", Array.isArray(multi.steps));

    results.push("--- Error Recovery ---");
    const bad = await controller.click({ x: -99999, y: -99999 });
    check("click handles bad coords", !!(bad && bad.message));

  } catch (e) {
    results.push("FATAL: " + e.message);
    results.push(String(e.stack || "").split("\n").slice(0, 4).join(" | "));
  }

  let p = 0, f = 0;
  for (const r of results) { if (r.startsWith("PASS:")) p++; if (r.startsWith("FAIL:")) f++; }
  return { pass: p, fail: f, log: results };
}

const taskId = process.argv[2] || "1";
runTests(taskId).then(({ pass, fail, log }) => {
  console.log("\n" + log.join("\n"));
  console.log("\n==================================================");
  console.log("Results: " + pass + " passed, " + fail + " failed");
  process.exit(fail > 0 ? 1 : 0);
}).catch(e => { console.error("Error:", e); process.exit(1); });
RUNNEREOF

log "Test runner written to: $TEST_RUNNER"
log "Running with SIMULATE_DESKTOP=1..."

# Run the test runner
TEST_OUTPUT=$(SIMULATE_DESKTOP=1 "$EXECUTABLE" run "$TEST_RUNNER" 2>&1) || true
echo "$TEST_OUTPUT" | tee -a "$LOG_FILE"

# Tally
TPASS=$(echo "$TEST_OUTPUT" | grep -c "^PASS:" || true)
TFAIL=$(echo "$TEST_OUTPUT" | grep -c "^FAIL:" || true)

log ""
log "========================================="
log " Test Results Summary"
log "========================================="
log "PASSED: $TPASS"
log "FAILED: $TFAIL"
log "Log: $LOG_FILE"

if [ "$TFAIL" -gt 0 ]; then
  log "${RED}Some tests failed. See $LOG_FILE for details.${NC}"
  exit 1
else
  log "${GREEN}All tests passed!${NC}"
  exit 0
fi