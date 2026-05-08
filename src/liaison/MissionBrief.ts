// MissionBrief: L1 -> L2 communication schema
// Produced by Liaison after intent extraction, consumed by Architect for planning

export interface MissionBrief {
  /** Unique identifier for this mission */
  missionId: string;
  /** Original user input that triggered this mission */
  rawInput: string;
  /** High-level intent classification */
  intent: 'implement' | 'debug' | 'refactor' | 'research' | 'test' | 'deploy' | 'unknown';
  /** Specific domain/topic being targeted */
  domain: string;
  /** Desired outcome - what success looks like */
  desiredOutcome: string;
  /** Constraints and non-goals */
  constraints: string[];
  /** Files likely to be involved (from context) */
  targetFiles: string[];
  /** Any explicit test commands or success criteria provided */
  successCriteria?: {
    testCmd?: string;
    acceptanceCriteria?: string[];
  };
  /** Priority level for scheduling */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Timestamp when this brief was created */
  createdAt: number;
  /** Estimated complexity (0-100) */
  complexity: number;
}

export function createMissionBrief(rawInput: string): MissionBrief {
  return {
    missionId: `mission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    rawInput,
    intent: 'unknown',
    domain: 'general',
    desiredOutcome: '',
    constraints: [],
    targetFiles: [],
    priority: 'normal',
    createdAt: Date.now(),
    complexity: 50,
  };
}
