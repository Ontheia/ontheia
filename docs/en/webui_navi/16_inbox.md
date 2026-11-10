# Inbox

**Path:** Left sidebar → Inbox (below "New Chat")

Concept and behavior: [Inbox](/en/automation/03_inbox/).

---

## Structure

```
left panel (filter)    | right panel
───────────────────────┼──────────────────────────────────────────────
Open (count)           │ Header: heading + button [Mark all done]
All                    │ List of entries, approvals first
                       │ [Load more] when there are further entries
```

| Filter | Shows |
| --- | --- |
| **Open** | Entries that are not dealt with yet. |
| **All** | Also entries that are done or expired, dimmed. |

---

## Entry

| Element | Description |
| --- | --- |
| Icon | Green check = result · red warning triangle = error · yellow shield = approval. |
| Title | Name of the schedule or trigger. |
| Badges | Kind (result, error, approval) and source (schedule, trigger). Closed entries also show their state, approvals the answer given. |
| Time | When the entry was created. |
| Text | Result and error: beginning of the answer or the error text. Approval: server and tool, the arguments (expandable) and until when the run waits. |

### Actions

| Button | On | Effect |
| --- | --- | --- |
| **[Open chat]** | all entries whose chat exists | Opens the run's chat. |
| **[Done]** | result, error | Closes the entry. |
| **[Allow once]** | approval | Executes this one tool call. |
| **[Allow for this run]** | approval | Allows the tool for the rest of the run. |
| **[Refuse]** | approval | Rejects the tool call. |
| **[Mark all done]** | header | Closes all open results and errors. Approvals stay open. |

---

## Counter in the Sidebar

The number next to **Inbox** is the count of open entries (above 99: "99+"). With the sidebar collapsed, a dot on the icon shows that something is open.
