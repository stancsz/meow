---
name: github
version: 1.0.0
required_credentials:
  - github_token
allowed_domains:
  - "api.github.com"
  - "github.com"
---
# GitHub Automation Skill
This skill uses the official `gh` CLI to interact with GitHub issues, PRs, and repos.

## Usage
When asked to perform a GitHub action, use the `gh` tool available in the environment. Ensure `GITHUB_TOKEN` is set using the provided credential.

Example:
```bash
gh issue list --repo myorg/myrepo
```
