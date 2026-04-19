# The Composer (Input Area)

In the Composer, you configure your Run before sending the message.

## 1. Selectors (Pickers)
Before sending a message, you choose who should respond:
- **Agent or Provider:** Select a specialized AI persona or a direct AI provider (e.g., OpenAI).
- **Task or Chain:** Select a specific task or a multi-stage workflow (Chain).
- **Preselection:** Ontheia remembers your last selection for new chats. You can permanently change this default in your user settings.

## 2. Text Input
The input field supports multi-line text. 
- **Send:** Press `Enter` to send or `Shift + Enter` for a line break.
- **Cancel:** While a Run is in progress, the send button turns into a **Stop button**, with which you can immediately cancel the generation.

## 3. Tool Authorization (Security)
If an agent wants to perform an action (e.g., send an email or read from the calendar), an **Authorization Banner** appears directly above the input field, depending on the configuration.

- **Details:** You can see exactly which tool the agent wants to use and which data (arguments) it is transmitting.
- **Decision:**
    - **Allow Once:** The agent may perform this single action and then continue.
    - **Decline:** The action is blocked. The agent receives an error message and usually tries to solve the task without this tool or aborts.
    - **Always Allow:** (If available) Unlocks authorization for this tool permanently for this Run.
- **Queue:** If an agent plans several actions simultaneously (e.g., in a Chain or through delegation), you will see a counter display (e.g., `+2`), signaling how many more authorizations are pending.

## 4. Prompt Templates
Using the template icon in the Composer, you can save and reuse frequently used texts.

- **Save:** Saves the current input text as a new template with a title.
- **Load:** Inserts the template text directly into the input area.
- **Template Variables:** Templates support variables in the form `${variable}` or `{{variable}}`. They are automatically replaced with current values when inserted.

| Variable | Example Output |
|---|---|
| `${user_name}` | Jane Doe |
| `${user_email}` | jane@example.com |
| `${current_date}` | Wednesday, March 25, 2026 |
| `${current_time}` | 14:30 |
| `${agent_label}` | Master Assistant |
| `${chat_id}` | UUID of the current chat |

  Further variables (e.g. `${agent_id}`, `${task_id}`, `${role}`) are also available — see the full list in the Admin documentation under *Tasks / Configuration*.

## 5. Token Display (Usage)
After the agent has responded, a small statistic appears right-aligned under the message (e.g., `1,250 / 80 Tokens`).
- **First Number:** Shows the number of tokens sent to the model (your message + context + system prompts).
- **Second Number:** Shows the number of tokens in the agent's response.
- **Purpose:** This helps you estimate the complexity of your context and the cost/load of the Run.
