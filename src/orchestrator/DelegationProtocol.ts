import * as fs from 'fs';
import * as path from 'path';
import { Task } from './Task';

export class DelegationProtocol {
  private static auditLogPath = path.join(process.cwd(), '.meow', 'logs', 'delegation-audit.jsonl');

  public static getDelegate(filePath: string): 'claude' | 'aider' | 'opencode' | 'browseros' | 'qa' {
    const ext = path.extname(filePath).toLowerCase();

    // Source files
    if (['.ts', '.js', '.py', '.go', '.rs', '.tsx', '.jsx', '.cpp', '.c', '.h', '.java'].includes(ext)) {
      return 'claude';
    }

    // Web/browser automation files
    if (['.html', '.css', '.scss', '.sass'].includes(ext)) {
      return 'browseros';
    }

    return 'claude';
  }

  public static determineSpecialistForTask(task: Task): 'claude' | 'aider' | 'opencode' | 'browseros' | 'qa' {
    const allFiles = new Set<string>();

    if (task.requiredFiles) {
      for (const f of task.requiredFiles) {
        allFiles.add(f);
      }
    }

    if (task.producedFiles) {
      for (const artifact of task.producedFiles) {
        allFiles.add(artifact.path);
      }
    }

    let delegate: 'claude' | 'aider' | 'opencode' | 'browseros' | 'qa' = 'claude';

    if (allFiles.size > 0) {
      const fileList = Array.from(allFiles);
      const isSource = fileList.some(f => ['.ts', '.js', '.py', '.go', '.rs', '.tsx', '.jsx', '.cpp', '.c', '.h', '.java'].includes(path.extname(f).toLowerCase()));
      const isWeb = fileList.some(f => ['.html', '.css', '.scss', '.sass'].includes(path.extname(f).toLowerCase()));

      // QA specialist for test files
      const isTest = fileList.some(f => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__'));
      if (isTest) {
        delegate = 'qa';
      } else if (isWeb) {
        delegate = 'browseros';
      } else if (isSource) {
        delegate = 'claude';
      }
    }

    // Log delegation decision
    this.logDecision(task.id, Array.from(allFiles), delegate);

    return delegate;
  }

  private static logDecision(taskId: string, files: string[], delegate: string): void {
    const logDir = path.dirname(this.auditLogPath);
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logEntry = JSON.stringify({
        timestamp: Date.now(),
        taskId,
        files,
        assignedSpecialist: delegate,
      }) + '\n';

      fs.appendFileSync(this.auditLogPath, logEntry, 'utf8');
    } catch (error) {
      console.warn(`[DelegationProtocol] Failed to write audit log:`, error);
    }
  }
}
