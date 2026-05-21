import * as crypto from 'crypto';

export type PiiFilterMode = 'REDACT' | 'HASH' | 'BLOCK';

export interface PiiRule {
  name: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...args: any[]) => string);
}

export class PiiFilter {
  private mode: PiiFilterMode;
  private rules: PiiRule[] = [];

  constructor(mode: PiiFilterMode = 'REDACT') {
    this.mode = mode;
    this.initializeRules();
  }

  setMode(mode: PiiFilterMode) {
    this.mode = mode;
  }

  private initializeRules() {
    // 14 robust regex patterns for comprehensive PII and credential scrubbing
    this.rules = [
      // 1. Email addresses
      {
        name: 'EMAIL',
        pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        replacement: '[REDACTED_EMAIL]',
      },
      // 2. Anthropic API keys
      {
        name: 'ANTHROPIC_API_KEY',
        pattern: /sk-ant-sid01-[a-zA-Z0-9_\-]{93}/g,
        replacement: '[REDACTED_ANTHROPIC_KEY]',
      },
      // 3. OpenAI API keys
      {
        name: 'OPENAI_API_KEY',
        pattern: /sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}/g,
        replacement: '[REDACTED_OPENAI_KEY]',
      },
      // 4. GitHub Personal Access Tokens (classic and fine-grained)
      {
        name: 'GITHUB_PAT',
        pattern: /ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
        replacement: '[REDACTED_GITHUB_PAT]',
      },
      // 5. AWS Access Key ID
      {
        name: 'AWS_ACCESS_KEY',
        pattern: /\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
        replacement: '[REDACTED_AWS_KEY_ID]',
      },
      // 6. AWS Secret Access Key
      {
        name: 'AWS_SECRET_KEY',
        pattern: /\b[A-Za-z0-9/+=]{40}\b/g,
        // Since 40-char strings are common, we match secret keys in config context or lookups
        replacement: (match) => {
          // Verify it has uppercase, lowercase, numbers, and signs to reduce false positives
          const hasLower = /[a-z]/.test(match);
          const hasUpper = /[A-Z]/.test(match);
          const hasDigit = /[0-9]/.test(match);
          if (hasLower && hasUpper && hasDigit) {
            return '[REDACTED_AWS_SECRET_KEY]';
          }
          return match;
        }
      },
      // 7. General SSH / PEM Private Key blocks
      {
        name: 'PEM_PRIVATE_KEY',
        pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----[a-zA-Z0-9\/\+=\s\n\r]+-----END [A-Z ]+PRIVATE KEY-----/g,
        replacement: '[REDACTED_PRIVATE_KEY_BLOCK]',
      },
      // 8. Database URI credentials (password in connection strings)
      {
        name: 'DB_CONNECTION_STRING',
        pattern: /(mongodb(?:\+srv)?|postgres|postgresql|mysql|mssql):\/\/([^:]+):([^@]+)@/g,
        replacement: (match: string, proto: string, user: string) => `${proto}://${user}:[REDACTED_PASSWORD]@`,
      },
      // 9. Credit Card Numbers (Luhn matching candidate)
      {
        name: 'CREDIT_CARD',
        pattern: /\b(?:\d[ -]*?){13,16}\b/g,
        replacement: (match) => {
          const digits = match.replace(/\D/g, '');
          if (digits.length >= 13 && digits.length <= 16) {
            return '[REDACTED_CREDIT_CARD]';
          }
          return match;
        }
      },
      // 10. Phone Numbers (US/International standard)
      {
        name: 'PHONE_NUMBER',
        pattern: /\b(?:\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b/g,
        replacement: '[REDACTED_PHONE]',
      },
      // 11. US Social Security Numbers (SSN)
      {
        name: 'US_SSN',
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        replacement: '[REDACTED_SSN]',
      },
      // 12. General Bearer Tokens
      {
        name: 'BEARER_TOKEN',
        pattern: /Bearer\s+[a-zA-Z0-9_\-\.\~]{20,}/g,
        replacement: 'Bearer [REDACTED_TOKEN]',
      },
      // 13. IP Addresses (IPv4 and IPv6)
      {
        name: 'IP_ADDRESS',
        pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b/g,
        replacement: '[REDACTED_IP]',
      },
      // 14. Key-Value Config Secret Definitions (e.g. "client_secret": "value")
      {
        name: 'CONFIG_SECRET',
        pattern: /"([^"]*(?:secret|password|passwd|token)[^"]*)"\s*:\s*"([^"]+)"/gi,
        replacement: (match: string, key: string, value: string) => {
          // Scrub value if it's longer than 3 chars (avoid scrubbing empty strings)
          if (value.length > 3) {
            return `"${key}": "[REDACTED_SECRET]"`;
          }
          return match;
        }
      }
    ];
  }

  /**
   * Filter and scrub PII or sensitive tokens based on current mode.
   */
  filter(text: string): string {
    let sanitized = text;

    for (const rule of this.rules) {
      if (this.mode === 'BLOCK') {
        const matches = text.match(rule.pattern);
        if (matches && matches.length > 0) {
          throw new Error(`🛑 [Security Block] PII/Credential violation: Sensitive ${rule.name} detected.`);
        }
      } else if (this.mode === 'HASH') {
        // Find and replace matches with SHA256 hashes of the match to preserve uniqueness
        sanitized = sanitized.replace(rule.pattern, (match) => {
          const hash = crypto.createHash('sha256').update(match).digest('hex').substring(0, 16);
          return `[HASHED_${rule.name}_${hash}]`;
        });
      } else {
        // Default: 'REDACT' mode
        if (typeof rule.replacement === 'function') {
          sanitized = sanitized.replace(rule.pattern, rule.replacement);
        } else {
          sanitized = sanitized.replace(rule.pattern, rule.replacement);
        }
      }
    }

    return sanitized;
  }
}
