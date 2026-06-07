# Composer

The Composer is the input bar at the bottom of the chat view. It consists of three areas.

---

## Text Input

Multi-line textarea for the message. Grows automatically with content.

- **Enter** → Send message (desktop)
- **Shift + Enter** → Line break
- **Button ↑ (Send)** → Submit message
- **Button ■ (Stop)** → Abort active run (appears during execution)

---

## Tool Approval Banner

When an agent wants to call a tool and the tool approval mode is set to "Ask", an approval banner appears above the textarea:

| Action | Description |
| --- | --- |
| **Approve once** | Tool is allowed for this single call. |
| **Always allow** | Tool is permanently allowed for the entire session. |
| **Deny** | Tool call is rejected. |

Tool name, MCP server, and call arguments are shown in the banner.

---

## Bottom Bar (Composer Bar)

Left side: **Provider/Agent selection** — right side: **Action buttons**.

### Provider/Agent Selection (left)

Two coupled dropdowns:

| Dropdown | Content |
| --- | --- |
| **Primary** | Provider (e.g. "OpenAI") or Agent (e.g. "W_Ontheia") |
| **Secondary** | For provider: model · For agent: task or chain |

Only entries with "Show in Composer" enabled appear in the selection.

### Action Buttons (right)

| Button | Description |
| --- | --- |
| **Shield / ShieldCheck** | Toggle tool approval mode: "Ask" ↔ "Full access". Only visible when an agent is selected. |
| **Sparkles** | Optimize prompt — sends the current input for AI reformulation. |
| **Bookmark+** | Open prompt templates (see below). |

---

## Prompt Templates (Popover)

Opens via the bookmark button. Allows saving and reusing frequent inputs.

**Scope selection:** Templates can be assigned to a scope:

| Scope | Description |
| --- | --- |
| **Task** | Specific to the currently selected task. |
| **Agent** | Specific to the currently selected agent. |
| **Chain** | Specific to the currently selected chain. |
| **Global** | Available across all contexts. |

**Actions:** Insert template into textarea · Save template · Delete template.

---

## Warnings & Errors

Warning notices and error messages are shown as toast notifications above the Composer. Each can be dismissed individually via the **×** button.
