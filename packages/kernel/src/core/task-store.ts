/**
 * task-store.ts
 *
 * Simple file-based task persistence.
 * Tasks are stored in .meow/tasks.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface Task {
  id: string;
  content: string;
  status: "pending" | "completed";
  createdAt: string;
}

const TASK_DIR = ".meow";
const TASK_FILE = join(TASK_DIR, "tasks.json");

function ensureDir(): void {
  if (!existsSync(TASK_DIR)) {
    mkdirSync(TASK_DIR, { recursive: true });
  }
}

function loadTasks(): Task[] {
  try {
    const content = readFileSync(TASK_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]): void {
  ensureDir();
  writeFileSync(TASK_FILE, JSON.stringify(tasks, null, 2), "utf-8");
}

export function listTasks(): Task[] {
  return loadTasks();
}

export function addTask(content: string): Task {
  const tasks = loadTasks();
  const task: Task = {
    id: `t${Date.now()}`,
    content,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function completeTask(id: string): Task | null {
  const tasks = loadTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  task.status = "completed";
  saveTasks(tasks);
  return task;
}

export function deleteTask(id: string): boolean {
  const tasks = loadTasks();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;
  tasks.splice(index, 1);
  saveTasks(tasks);
  return true;
}

export function formatTasks(tasks: Task[]): string {
  if (tasks.length === 0) return "No tasks.";

  const pending = tasks.filter((t) => t.status === "pending");
  const completed = tasks.filter((t) => t.status === "completed");

  let output = "";
  if (pending.length > 0) {
    output += "## Pending\n";
    pending.forEach((t) => {
      output += `  [${t.id}] ${t.content}\n`;
    });
  }
  if (completed.length > 0) {
    output += "\n## Completed\n";
    completed.forEach((t) => {
      output += `  [${t.id}] ${t.content}\n`;
    });
  }
  return output;
}

