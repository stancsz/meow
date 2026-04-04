/**
 * search.ts
 *
 * Add code search skill
 */

import { type Skill } from "./loader.ts";

export const search: Skill = {
  name: "search",
  description: "Add code search skill",
  async execute(context) {
    return { success: true, message: "search skill executed" };
  },
};
