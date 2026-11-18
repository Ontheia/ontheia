# Triggers (Webhook)

A trigger starts an agent or a chain when another system calls its address. This lets Ontheia react to events instead of waiting for input in the chat or for a schedule: a sensor reports a value, a script has finished, a service has a new document.

Every user can create triggers of their own. The run acts as the trigger's owner, with that user's role and rights. An admin can also create and manage triggers for other users through the API (see the API reference); the web UI shows everyone only their own.

## Flow

```
Sender (device, script, service)
  │  POST /hooks/<id>   Authorization: Bearer <token>   JSON data
  ▼
Ontheia checks the token  →  answers 202 at once
  │
  ├─ trigger idle      →  the run starts
  └─ run still active  →  queue, run once more, or skip
  │
  ▼
Run in the background, in a chat of its own
  │
  ├─ needs a tool      →  approval in the inbox (default)
  └─ done or failed    →  entry in the inbox
```

The sender does not wait for the result. It receives `202` with `event_id` (and `run_id` when the run starts at once); the run carries on afterwards.

A trigger works off one call at a time. Different triggers run at the same time, up to three per user.

## Creating a Trigger

**Path:** Avatar dropdown → Automation → Triggers (Webhook) → **[New trigger]**

After saving, Ontheia shows three things once, each with a copy button:

- the **address** (`…/hooks/<id>`)
- the **token**
- a ready-made **`curl` example**

The token is visible in this dialog only. Ontheia stores a fingerprint of it (SHA-256), not the token itself. If it gets lost, **New token** (key icon) creates another one; the previous token stops working from then on.

The dialog's fields are described in the [interface reference](/en/webui_navi/11_automation/).

## Calling a Trigger

```bash
curl -X POST 'https://my-domain.com/api/hooks/<id>' \
  -H 'Authorization: Bearer ontr_…' \
  -H 'Content-Type: application/json' \
  -d '{"event": "opened", "battery": 87}'
```

| Requirement | Value |
| --- | --- |
| Method | `POST` |
| Token | Header `Authorization: Bearer <token>` or `X-Ontheia-Token: <token>` |
| Data | JSON (`Content-Type: application/json`), at most 256 KB |

The token is accepted in a header only, not in the address. In an address it ends up in the logs of every proxy on the way.

The address is the base address of the host API followed by `/hooks/<id>`. Behind a reverse proxy set up as in the [guide](/en/configuration/04_reverse_proxy/) it reads `https://my-domain.com/api/hooks/<id>`; the interface shows the correct address.

### Responses

| Status | Meaning |
| --- | --- |
| `202` `{"status":"accepted", …}` | Accepted, the run has started. |
| `202` `{"status":"queued", "event_id": …}` | Accepted, the call waits for its run. |
| `202` `{"status":"duplicate", "event_id": …}` | A call with the same `Idempotency-Key` has already arrived; it is not run again. |
| `202` `{"status":"skipped","reason":"overlap"}` | Skipped (mode "Skip"), because a run of this trigger is still active. `reason: "busy"`: the user already has three trigger runs active. |
| `400` | The `Idempotency-Key` header is empty or longer than 200 characters. |
| `401` | The token is missing or wrong, the trigger is unknown or deactivated. All cases answer alike, so the response says nothing about which triggers exist. |
| `404` | Triggers are switched off for this installation. |
| `413` | Data larger than 256 KB. |
| `415` | The data is not JSON. |
| `429` | `queue_full`: 100 calls are already waiting. `rate_limited`: per-minute limit in mode "Skip". `too_many_failed_attempts`: too many failed attempts from this address. |
| `503` | `queue_unavailable`: the call could not be stored. Send it again. |

### Avoiding double delivery

If the sender passes an `Idempotency-Key` header (unique per event, at most 200 characters), Ontheia does not run a second call with the same key and answers `duplicate`. This prevents double runs when a sender retries because a response got lost on the way. The key holds as long as the first call is in the log. A skipped or refused call does not take it: the retry with the same key is admitted as usual.

## While a run is active

What happens to a call that arrives while the trigger is still running is set by the field **While a run is active**:

| Mode | Behaviour | Suited for |
| --- | --- | --- |
| **Queue** (default) | Every call waits and runs in turn, in the order received. | Calls that are each a job of their own, such as a mail. |
| **Run once more** | At most one call waits. A newer one replaces it (status "Replaced"); the active run is followed by exactly one more, with the newest call. | Agents that look for their work themselves, such as all documents with a certain tag. A burst of ten calls leads to two runs instead of ten. |
| **Skip** | The call is dropped, the sender receives `skipped`. | Messages where only the newest counts, or senders that retry by themselves on `skipped`. |

Waiting calls:

- also start when a run of another trigger ends and frees one of the user's three slots,
- survive a restart of the host,
- expire after 24 hours (status "Expired", entry in the inbox unless the trigger reports nothing),
- expire at once when the trigger is deactivated, so they do not start unexpectedly when it is switched on again,
- can be discarded one by one in the log.

The trigger list shows how many calls of a trigger are waiting.

## Instruction and Placeholders

The instruction is the text the agent receives as the user message. The received data enters it through placeholders:

| Placeholder | Result |
| --- | --- |
| `{{payload}}` | All received data as a delimited JSON block. |
| `{{payload.field}}` | A single value, nested too (`{{payload.device.id}}`). A missing field leaves the place empty. Values above 2000 characters are cut. |
| `{{name}}` | Name of the trigger. |
| `{{timestamp}}` | Time of the call in the system timezone. |

Example:

```
The mailbox sensor reports "{{payload.event}}" (battery {{payload.battery}} %).
Send me a short message in the messenger.
```

With an empty instruction the agent receives the data with the request to handle it according to its task. That is enough when the agent's task context already says what to do with an event.

## Security

The received data comes from outside the installation. If it contains text that looks like an instruction, a language model may follow it. Ontheia counters this on three levels:

1. **Tool approval through the inbox is the default.** On its own, the run may only use tools that are permanently allowed for the agent. Every other call waits for your answer in the [inbox](/en/automation/03_inbox/). This is the actual safeguard: whatever the data says, it cannot set anything off without you.
2. **The data is marked as data.** `{{payload}}` is inserted as a delimited block that its content cannot close, and the run's system note tells the model that this block and values taken from it are not instructions to follow. This lowers the risk; it does not remove it.
3. **The run has the owner's rights only.** On saving and on every call Ontheia checks whether the owner may use the agent, the task and the chain.

| Tool approval | Behavior | Suited for |
| --- | --- | --- |
| Ask in the inbox | Tool calls wait for an answer, except for permanently allowed tools. | Default, any sender. |
| Allow all tools | The run uses every tool of the agent without asking. | Only senders you trust and whose data no third party can influence. |
| No tools | The run answers without using any tool. | Pure text processing. |

## Limits

| Limit | Value | Effect |
| --- | --- | --- |
| Runs per minute | adjustable per trigger, default 10 | further calls wait; with "Skip": `429` |
| Simultaneous runs | 1 per trigger, 3 per user | further calls wait or are skipped |
| Waiting calls | 100 per trigger | further calls: `429 queue_full` |
| Waiting time | 24 hours | the call expires afterwards |
| Failed attempts | 20 per minute per sender address | further calls: `429` |
| Data size | 256 KB | `413` |

Every run uses tokens at the provider. The per-minute limit is the brake for a sender that sends more than expected: it limits how many runs start, without losing calls.

## Log and Test

The **log** (clock icon) shows a trigger's latest calls with time, status, the received data, the error text and a link to the chat. It keeps the latest 200 entries. Calls with a wrong token are not listed.

| Status | Meaning |
| --- | --- |
| Waiting | The call waits for its run. **Discard** removes it. |
| Running | The run is active. |
| Done | The run has finished. |
| Error | The run failed or could not start. |
| Replaced | Was waiting and was replaced by a newer call ("Run once more"). |
| Expired | Waited longer than 24 hours, or the trigger was deactivated. |
| Discarded | Removed from the queue by hand. |
| Queue full | Refused because 100 calls were already waiting. |
| Limit reached | Refused because of the per-minute limit ("Skip"). |
| Skipped | A run of this trigger was still active ("Skip"). |
| Too many runs | Skipped because the user already had three trigger runs active ("Skip"). |

**Test** (play icon) starts a run with sample data, as if a sender had called the address. The test goes through your sign-in and does not need the token. It follows the same rules as a real call, so it may wait in the queue, and it also works for a deactivated trigger.

## Operation

- **Global switch:** Administration → General → **Webhook triggers**. Switched off, every call answers `404`; the triggers themselves are kept. The change takes effect within 30 seconds.
- **Host restart:** A run does not survive a restart. On start the host marks the log entries and run logs of interrupted runs as errors and open approvals as expired, and reports every interrupted run in the inbox. Waiting calls are kept and start afterwards.
- **No retry:** A run that failed or was interrupted by a restart is not repeated on its own. It may have done part of its work already, such as sending a reply; a second run would repeat that.
