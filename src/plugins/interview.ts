import type { Extension } from "../core/extensions";

const INTERVIEW_BANK = {
  "I. Architectural Foundations": [
    {
      "question": "Why is a pure \"Autonomous Agent\" (zero-constraint) usually a failure in 2026 enterprise environments compared to a \"Constrained Agentic Workflow\"?",
      "answer": "The Hard Logic: Pure autonomy leads to State Drift. Without a \"Graph\" or \"State Machine\" to anchor the agent, the variance in reasoning paths makes the system un-testable.\nThe 2026 Answer: We use Graph-based Orchestration (e.g., LangGraph/Temporal). We define the topology of the task and let the Agent handle the transitions and payload generation. This preserves determinism for the business logic while leveraging LLM flexibility for the \"fuzzy\" edge cases."
    },
    {
      "question": "How do you design an Agent that balances real-time responsiveness with deep reasoning?",
      "answer": "The Strategy: Implement a Dual-Process Architecture.\nSystem 1 (Reactive): A small, fast model (e.g., 8B-70B distilled) for intent classification and simple tool-triggering.\nSystem 2 (Deliberative): A reasoning-heavy model (e.g., o1-class or Gemini 2.0+ with internal CoT) for complex planning and \"verification\" steps.\nInterview Tip: Mention \"Compute-Optimal Inference\"—allocating more tokens to reasoning only when the \"System 1\" confidence score is low."
    },
    {
      "question": "In 2026, we've moved beyond simple JSON tool definitions. How do you handle Agent-to-Agent API Discovery?",
      "answer": "The Logic: Agents shouldn't just have a static list of 10 tools. They should use a Semantic Tool Registry.\nExecution: The Agent performs a vector search over a \"Tool Library\" to retrieve the correct API documentation, then \"learns\" to use it in-context (In-Context Tool Learning). This allows the system to scale to thousands of APIs without hitting context window limits."
    }
  ],
  "II. Advanced Scenario Design": [
    {
      "question": "Design an Agent that monitors warehouse CCTV (video), reads invoices (PDF), and autonomously negotiates with shipping vendors (Email).",
      "answer": "Failure Points: How do you sync \"Visual State\" with \"Textual Logic\"?\nSolution: Use Unified State Representations. Convert visual events into structured \"Observation Logs\" before the Reasoning Agent sees them. Avoid feeding raw video streams directly into the reasoning loop to prevent \"Visual Hallucinations.\""
    },
    {
      "question": "How do you build an Agent that operates on a user's desktop (clicking buttons, reading screens) without breaking when the UI updates?",
      "answer": "The 2026 Move: Shift from DOM/Selector-based interaction to Visual-Semantic Navigation.\nTech Stack: Use a \"Vision-Language-Action\" (VLA) model that understands the intent of a button (e.g., \"The Submit Button\") rather than its X/Y coordinates. Implement \"Self-Correction\": if a click doesn't change the screen state as expected, the Agent must re-scan the UI."
    },
    {
      "question": "How do you ensure an Agent doesn't execute a trade based on a \"hallucinated\" news article?",
      "answer": "Execution: Multi-Source Cross-Verification (MSCV). The Agent is forbidden from acting unless the \"Fact\" is verified by at least two independent \"Search Agents\" using different search engines/APIs."
    }
  ],
  "III. Production Hardening & Reliability": [
    {
      "question": "An Agent is tasked with a 3-day research project. By hour 5, the context is messy. How do you manage its \"Working Memory\"?",
      "answer": "Solution: Recursive Summarization & Fact-Storage.\nThe \"Scratchpad\" Pattern: The Agent maintains a structured \"Current Knowledge Base\" (JSON) that it updates every 5 steps.\nContext Eviction: Explicitly delete intermediate \"Reasoning CoT\" from the history, keeping only the \"Actions\" and \"Observations\" to save tokens and maintain focus."
    },
    {
      "question": "If an Agent reads an email that says \"Delete all my files,\" how do you prevent it from actually calling the delete_file tool?",
      "answer": "Defense in Depth:\n* Execution Layer Isolation: The Agent requests an action; a separate \"Policy Guard\" (Hard-coded/RBAC) checks if that user has permission for that tool.\n* Instruction/Data Separation: Use \"Dual-LLM\" architectures where one model parses data for \"Attacks\" and the other performs the reasoning."
    },
    {
      "question": "Your Agent costs $1.00 per task. The business needs it at $0.05. What do you cut?",
      "answer": "Answer:\nPrompt Distillation: Move from 2000-token prompts to a fine-tuned small model that understands the task with a 100-token prompt.\nSemantic Caching: If a \"Plan\" has been generated for a similar request before, retrieve it from a cache instead of re-generating.\nSpeculative Decoding for Tools: Use a tiny model to guess the tool parameters and only call the big model if the \"Validator\" fails."
    }
  ],
  "IV. Evaluation & Observability": [
    {
      "question": "How do you evaluate an Agent's \"Planning\" quality, not just its \"Final Output\"?",
      "answer": "Metric: Trajectory Alignment. Compare the Agent's step-by-step path against a \"Golden Path\" created by an expert. Use an \"Evaluator Agent\" to score the necessity of each step."
    },
    {
      "question": "A user reports the Agent failed. You run the same prompt, and it works. How do you debug?",
      "answer": "Infrastructure: Deterministic Replay Buffers. You must log the entire state: Model Version, Seed (if applicable), Temperature, Tool Outputs, and Metadata. In 2026, we use \"Time-Travel Debugging\" to step through the Agent's trace at the exact moment of failure."
    }
  ],
  "V. The \"Executive\" Questions": [
    {
      "question": "\"When should we fire the Agent and hire a human?\"",
      "answer": "The Threshold: When the Cost of Verification (CoV) exceeds the Value of Automation (VoA). If a human has to spend 10 minutes checking a \"1-second\" Agent output, the Agent is a net loss."
    },
    {
      "question": "\"How do you handle the 'Black Box' nature of Agent reasoning for a regulator?\"",
      "answer": "Answer: Forced Auditability. We force the Agent to output its \"Internal Monologue\" into a side-channel (not shown to the user) that maps every decision to a specific piece of \"Source Evidence\" (RAG/Tool output)."
    },
    {
      "question": "\"What is the single biggest bottleneck for Agents in 2026?\"",
      "answer": "Answer: Reliable Feedback Loops. LLMs are \"Open-Loop\" by nature. The bottleneck isn't model size; it's the quality of the environment's feedback (e.g., a compiler giving a clear error vs. a vague \"failed\" message)."
    }
  ]
};

export const plugin: Extension = {
  name: "interview",
  type: "skill",
  execute: async (args: { action: string; section?: string; question?: string }) => {
    const { action, section, question } = args;

    try {
      if (action === "list_sections") {
        return JSON.stringify({ sections: Object.keys(INTERVIEW_BANK) });
      } else if (action === "get_section") {
        if (!section) return "ERROR: 'section' parameter is required for get_section";
        const questions = INTERVIEW_BANK[section as keyof typeof INTERVIEW_BANK];
        if (!questions) return `ERROR: Section '${section}' not found.`;
        return JSON.stringify({ section, questions });
      } else if (action === "search_questions") {
        if (!question) return "ERROR: 'question' parameter is required for search_questions";

        const results = [];
        const lowerCaseQuery = question.toLowerCase();

        for (const [sec, qList] of Object.entries(INTERVIEW_BANK)) {
          for (const q of qList) {
            if (q.question.toLowerCase().includes(lowerCaseQuery) || q.answer.toLowerCase().includes(lowerCaseQuery)) {
              results.push({ section: sec, question: q.question, answer: q.answer });
            }
          }
        }
        return JSON.stringify({ query: question, results });
      } else {
        return `ERROR: Unknown action: ${action}. Available actions: list_sections, get_section, search_questions`;
      }
    } catch (error: any) {
      console.error(`❌ Interview Skill Error:`, error.message);
      return `ERROR: Interview skill failed. Error: ${error.message}`;
    }
  },
};
