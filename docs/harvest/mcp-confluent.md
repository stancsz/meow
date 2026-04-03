---
name: mcp-confluent
repo: https://github.com/confluentinc/mcp-confluent
why: MCP server for Apache Kafka/Confluent. Enables agents to produce/consume Kafka messages, manage topics, and stream data.
minimalSlice: "A minimal mcp-confluent integration: MCP server wrapper that exposes Kafka operations (produce/consume/topics) as MCP tools."
fit: sidecar
status: pending
complexity: 3
---

# Harvest: MCP Confluent from confluentinc

**Source:** `https://github.com/confluentinc/mcp-confluent`

## Core Trick

MCP server exposing Apache Kafka/Confluent operations as MCP tools for streaming data workflows.

## Minimal Slice for Meow

Implement as `src/sidecars/kafka.ts`:
1. MCP server wrapper for confluent-kafka
2. Expose produce/consume/topics as MCP tools
3. Stream results back to agent
4. Integration with existing MCP client

## Why Worth It

- Data streaming capability
- Real-time data processing
- Extends Meow to event-driven architectures
