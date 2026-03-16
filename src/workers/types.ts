export interface WorkerPayload {
  sessionId: string;
  taskId: string;
  skillRef: string;
  credentialId: string;
  parameters: Record<string, any>;
}

export interface WorkerResponse {
  success: boolean;
  taskId: string;
  output?: any;
  error?: string;
}

export interface SkillManifest {
  skill_name: string;
  version: string;
  required_credentials: string[];
  allowed_domains: string[];
  author?: string;
  [key: string]: any;
}
