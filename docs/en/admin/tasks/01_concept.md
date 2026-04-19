# Task Concept in Ontheia

While an Agent provides the basic identity and AI binding (Provider/Model), a **Task** defines the specific mission.

## The Hierarchy

An Agent can possess multiple Tasks. A Task, in turn, bundles specific instructions that are only passed to the Agent at the start of a Run.

- **Agent:** "Who am I?" (e.g., a Senior Developer with access to the file system).
- **Task:** "What am I doing right now?" (e.g., "Performing code review" or "Writing documentation").

## Advantages of the Separation

1. **Reusability:** A Task like "Data Analysis" can be assigned to different Agents (with different LLMs).
2. **Precision:** The narrowly defined Task context reduces the likelihood of the AI straying from the topic (reducing hallucinations).
3. **Structuring:** Users see clear use cases in the WebUI instead of an empty prompt input.
