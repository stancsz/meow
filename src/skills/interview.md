---
skill_name: interview
required_credentials: []
---

# Interview Skill

This skill provides access to the "2026 AI Agent Production-Level Interview Bank: The Senior Architect Edition".

## Execution Logic

When this skill is loaded, the worker should use the `interview` tool to explore the interview bank and answer questions related to AI Agent architecture, deployment, production hardening, and evaluation.

### Available Actions

1.  **list_sections**: Returns a list of all available sections in the interview bank.
    *   Parameters: `action: "list_sections"`
2.  **get_section**: Returns all questions and answers within a specific section.
    *   Parameters: `action: "get_section"`, `section: "<section_name>"`
3.  **search_questions**: Searches the entire interview bank for questions or answers matching a given query.
    *   Parameters: `action: "search_questions"`, `question: "<search_term>"`

### Example Usage

*   To see what topics are covered: `{"action": "list_sections"}`
*   To get questions about Architectural Foundations: `{"action": "get_section", "section": "I. Architectural Foundations"}`
*   To find questions about evaluation: `{"action": "search_questions", "question": "evaluate"}`
