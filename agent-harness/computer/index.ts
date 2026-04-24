/**
 * index.ts — Desktop Agent module entry point
 *
 * Re-exports all public types and functions from the computer modules.
 * Import from here rather than individual files for a stable API.
 */

// Re-export types
export type {
  Point, BoundingBox,
  ClickResult, TypeResult, ScreenshotResult,
  ToolResult,
  A11yElement,
} from "./computer_controller.js";

export type {
  TextElement, ScreenState, ElementMatch, ScreenDiff,
} from "./screen_recognition.js";

export type {
  RiskLevel, ActionContext, RiskAssessment, ApprovalRequest,
  TriggerChannel,
} from "./human_in_the_loop.js";

export type {
  TaskStep, TaskResult, StepResult, AgentConfig,
} from "./computer_agent.js";

// Re-export functions
export {
  click, doubleClick, type, pressKey, screenshot,
  moveMouse, openApp, focusWindow, closeWindow, drag, scroll,
  getA11yTree,
  init as initController, isReady as controllerReady,
  configure as configureController, getConfig as getControllerConfig,
  setSimulated, isSimulated,
} from "./computer_controller.js";

export {
  capture, captureRegion, findElement, findAllElements,
  waitForElement, waitForElementGone, compareScreens,
  setMockElements, clearMockElements,
  configure as configureScreen,
} from "./screen_recognition.js";

export {
  riskAssessment, requiresApproval, promptHuman,
  approve, reject, getPendingRequest, getRiskSummary,
  handleCliCommand, loadPendingRequest, reset,
  configure as configureHitl, getConfig as getHitlConfig,
} from "./human_in_the_loop.js";

export {
  DesktopAgent, desktopAgent, executeTask,
} from "./computer_agent.js";