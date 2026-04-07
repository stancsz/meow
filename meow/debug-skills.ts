// Debug script to test skill lookup
import { findSkill, getAllSkills } from "./src/skills/index.ts";

console.log("All registered skills:", getAllSkills().map(s => s.name));
console.log("findSkill('exec'):", findSkill("exec"));
console.log("findSkill('/exec'):", findSkill("/exec"));
console.log("findSkill('simplify'):", findSkill("simplify"));
console.log("findSkill('mcp'):", findSkill("mcp"));