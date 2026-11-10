# Inbox

The inbox collects what background runs need to put in front of you: a pending tool approval, a result, an error. Background runs are runs from a [schedule](./01_overview.md) or a [trigger](./02_triggers.md). Runs you start in the chat create no entries; there you see the result directly.

**Path:** Left sidebar → **Inbox**. The number next to it is the count of open entries and updates on its own.

## Kinds of Entries

| Kind | Created when | Closed by |
| --- | --- | --- |
| **Approval** | a background run wants to call a tool it may not use on its own | your answer, the end of the waiting time, or the end of the run |
| **Result** | a run has finished and reporting is switched on | **Done** |
| **Error** | a run fails | **Done** |

When a result is reported is set at the source: on a schedule with **Report the result**, on a trigger with **Report to the inbox** (every result, errors only, nothing). An error of a scheduled run always reaches the inbox.

Result and error show the beginning of the answer as plain text and lead to the full conversation with **Open chat**.

## Approvals

An approval shows the source, the MCP server and the tool, the arguments (expandable) and the time until which the run waits. Approvals are always listed first, because a run is waiting for each of them.

| Answer | Effect |
| --- | --- |
| **Allow once** | This one call is executed. The next call of the same tool asks again. |
| **Allow for this run** | This call and all further calls of the same tool in this run are executed. |
| **Refuse** | The call is rejected. The run is told and answers accordingly. |

None of the answers changes the agent's settings. If a tool should run without asking permanently, allow it on the agent.

An approval cannot be dismissed with **Done**. It needs an answer; otherwise the run would keep waiting.

### When an Approval Is Created

- **Schedule:** only when **Ask for approvals in the inbox** is switched on for the job. Switched off, the job approves every tool call itself.
- **Trigger:** when tool approval is set to **Ask in the inbox**. This is the default.

Tools the agent is always allowed to use do not ask in either case.

### Waiting Time

An approval left unanswered counts as refused after 24 hours, and the run carries on with the refusal. The duration is adjustable under Administration → General → **Inbox approval wait** (1 to 720 hours).

The time a run waits for an approval does not count against the tool loop timeout. This also applies to approvals in the chat.

### When the Run Is No Longer Waiting

An entry can have expired without your answer:

| Note | Cause |
| --- | --- |
| Not answered in time | The waiting time ran out. |
| Run was stopped | The run was ended while it was waiting. |
| Host was restarted | A run does not survive a restart of the host; its open approvals can no longer be answered. |

## Notifications

If you have allowed notifications for Ontheia in the browser, it announces a new approval. Results of scheduled runs with **Report the result** announce themselves on completion as before.

## Visibility

Every user sees only their own entries. This also applies to administrators. An approval can only be answered by the owner of the run.
