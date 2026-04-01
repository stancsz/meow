---
name: test-shopify-fetch
version: 1.0
description: A simulated skill to fetch Shopify orders for testing the SimpleClaw swarm orchestrator workflow.
required_credentials:
  - shopify_mock_token
---

# Shopify Order Fetcher (Mock)

This skill simulates fetching Shopify orders from the last 24 hours.
It requires a simulated `shopify_mock_token` to demonstrate credential decryption
and JIT skill loading.

## Usage

When this skill is loaded, it simulates fetching orders, returning a structured
JSON payload containing mock Shopify order data.
