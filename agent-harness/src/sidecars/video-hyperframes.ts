/**
 * video-hyperframes.ts
 * 
 * HeyGen Hyperframes Video Editing Skill for Meowju.
 * Enables "Video as Code" workflows using HTML, CSS, and GSAP.
 */

import { execSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface HyperframeComposition {
  name: string;
  id: string; // mandatory data-composition-id
  width: number;
  height: number;
  html: string;
  css: string;
  js?: string;
  duration: number; // in seconds
}

export class VideoHyperframesSkill {
  private workspace: string;

  constructor(workspace: string) {
    this.workspace = workspace;
  }

  /**
   * Initializes a new Hyperframes project.
   */
  public init(projectName: string): string {
    const projectPath = join(this.workspace, projectName);
    if (!existsSync(projectPath)) {
      console.log(`[Hyperframes] Initializing project: ${projectName}`);
      execSync(`npx hyperframes init ${projectName}`, { cwd: this.workspace });
    }
    return projectPath;
  }

  /**
   * Installs the official Hyperframes agent skills.
   */
  public installSkills(): void {
    console.log("[Hyperframes] Installing agent skills...");
    execSync(`npx skills add heygen-com/hyperframes`, { cwd: this.workspace });
  }

  /**
   * Creates or updates a composition file.
   */
  public saveComposition(projectName: string, comp: HyperframeComposition): void {
    const projectPath = join(this.workspace, projectName);
    const htmlPath = join(projectPath, "index.html");
    const cssPath = join(projectPath, "style.css");

    // Wrap CSS in a basic structure if not provided
    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="canvas" 
         class="canvas" 
         data-composition-id="${comp.id}" 
         data-width="${comp.width}" 
         data-height="${comp.height}">
        ${comp.html}
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
    <script>
        ${comp.js || ""}
    </script>
</body>
</html>`;

    writeFileSync(htmlPath, fullHtml);
    writeFileSync(cssPath, comp.css);
    console.log(`[Hyperframes] Saved composition: ${comp.name}`);
  }

  /**
   * Renders the video using the Hyperframes CLI.
   */
  public async render(projectName: string): Promise<string> {
    console.log(`[Hyperframes] Rendering ${projectName}...`);
    const projectPath = join(this.workspace, projectName);
    
    return new Promise((resolve, reject) => {
      try {
        const output = execSync(`npx hyperframes render`, { cwd: projectPath }).toString();
        resolve(output);
      } catch (e) {
        reject(e);
      }
    });
  }
}
