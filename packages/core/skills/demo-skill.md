---
skill_name: demo-skill
version: 1.0.0
required_credentials:
  - demo_api_key
allowed_domains:
  - "httpbin.org"
author: beautiful-swarms-community
---

# Demo Skill

## Purpose
Fetch a sample JSON response from httpbin.org for testing the end-to-end swarm execution workflow.

## Tool Usage
Use the HTTP GET tool to call:
`https://httpbin.org/json`

Include header: `Authorization: Bearer {demo_api_key}`

## Output Format
Return the parsed JSON object from the response.
