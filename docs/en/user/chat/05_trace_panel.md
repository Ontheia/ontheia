# In-depth Diagnosis: The Trace-Panel

The Trace-Panel is the central analysis tool in Ontheia. It provides deep insight into how the AI works by bundling information from memory, executed tools, and technical system events in one place.

## Activation
The Trace-Panel is controlled via the **Eye Icon** at the top right of the chat window. 
- **Show:** Click the icon to open the diagnostic details for the current chat.
- **Hide:** Clicking again closes the panel to refocus on the conversation.
- **Automatic Reset:** When switching between different chats, the panel is automatically closed for privacy reasons.

## Structure & Tabs

The panel is divided into four specialized areas:

### 1. Memory
All information that the agent has retrieved from long-term memory is listed here.
- **Preview:** Entries are initially displayed compactly (max. 5 lines).
- **Details:** The "Show All" button can be used to display the full context of an entry.
- **Relevance:** The score indicates how well the found document fits the question asked.

### 2. Tools
Track every action the agent has performed via MCP servers (Model Context Protocol).
- **Live & History:** The panel shows both the tool calls of the current Run and all past actions of this chat.
- **Transparency:** You see the exact arguments sent to the tool, as well as the result or error messages from the server.
- **Status Indicators:** Color dots immediately signal success (Green), ongoing processes (Yellow), or errors (Red).

### 3. Reasoning
Shows the model's intermediate thoughts, provided the provider exposes them (e.g. Anthropic Extended Thinking or the reasoning summaries of the OpenAI Responses API).
- **Origin:** Each entry is labeled with the agent that produced it. For delegated runs the respective sub-agent's label appears; otherwise "Reasoning".
- **Preview & Details:** Longer chains of thought are truncated to five lines and can be expanded in full via "Show more".
- **Withheld Content:** If the provider releases only parts of the reasoning, an italic note points this out.
- **Prerequisite:** The tab only fills up when a reasoning effort is set on the model and the run actually had a thinking phase. For simple requests it may stay empty.

### 4. Events (Chain of Events)
The chronological list of all technical background events of a Run.
- **Timing:** Timestamps for the start of the request, receipt of tokens, and completion.
- **Provider Retries:** If a request to the provider fails transiently (network blip or HTTP 429/5xx), a `provider_retry` warning appears with the actual error cause. The run is retried automatically up to twice instead of discarding the work already done.
- **JSON Deep Dive:** For experts, the raw data of each event can be expanded individually.

## Exporting JSON
The **"Copy JSON"** button at the top of the panel copies the entire trace as JSON to the clipboard. The menu offers two variants:
- **Copy without reasoning:** Exports the trace without the model's internal thought processes — suitable for sharing and bug reports.
- **Copy with reasoning:** Additionally includes the full reasoning entries.

## Why Use the Trace-Panel?
The Trace-Panel helps you see through the AI's "black box." It is essential for understanding the factual basis on which the agent responds, why it chooses certain tools, or where a complex workflow (Chain) is stalling.
