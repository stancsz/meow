---
description: Fast setup for SimpleClaw with Agentic Browser and GCP infra
---

# SimpleClaw Setup Workflow
Use this workflow to quickly bootstrap SimpleClaw for local or cloud deployment.

// turbo-all
1. Install dependencies
```bash
npm install
```

2. Initialize environment
```bash
cp .env.example .env
```

3. Initialize Infrastructure (Optional)
If you want to deploy to GCP:
```bash
cd terraform
terraform init
```

4. Launch Local CLI for Testing
```bash
npx tsx cli/index.ts
```

5. Run Management Server (Dev mode)
```bash
cd server
npm run dev
```
