/**
 * tutorial.ts — Interactive Tutorial Walkthrough Skill
 *
 * Runs the onboarding tutorial for new users.
 */

import { type Skill } from "./loader.ts";
import { runTutorial, isTutorialCompleted, formatTutorialStep, getTutorialSteps } from "../sidecars/onboarding.ts";

export const tutorial: Skill = {
  name: "tutorial",
  description: "Run the interactive tutorial walkthrough",
  async execute(args) {
    const isRestart = args?.trim().toLowerCase() === "restart";

    if (isRestart) {
      const { resetOnboarding, markTutorialCompleted } = await import("../sidecars/onboarding.ts");
      resetOnboarding();
      markTutorialCompleted();
    }

    const completed = isTutorialCompleted();
    const steps = getTutorialSteps();

    if (completed && !isRestart) {
      return {
        success: true,
        message: `Tutorial already completed! Use /tutorial restart to redo it.

Quick recap of what you learned:
1. Read files with the read tool
2. Search with grep and glob
3. Run shell commands (with --dangerous flag)
4. Manage tasks with /add, /tasks, /done
5. Sessions auto-save between sessions

Type /help to see all available commands!`,
      };
    }

    await runTutorial(false);

    return {
      success: true,
      message: "Tutorial complete! You're ready to use Meow.",
    };
  },
};
