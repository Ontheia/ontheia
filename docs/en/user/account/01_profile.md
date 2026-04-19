# Profile & Privacy

Manage your identity and control access to your data.

## 1. Personal Information
- **Display Name:** The name you are greeted with in the system and which is visible in team functions (e.g., with shared agents).
- **Email:** Your unique identifier. Note: The email address is permanently linked to your account and can only be changed by an administrator.

## 2. Avatar
Personalize your profile with a picture:
- **Upload:** Supports common image formats up to a size of 2 MB.
- **Initials:** If no image has been uploaded, Ontheia automatically displays your initials based on your display name.

## 3. Privacy: Memory Access
Ontheia respects your privacy. Via the option **"Admin may manage my Memory Namespaces"**, you decide for yourself:
- **Deactivated (Standard):** Even administrators have no insight into your personal memory content.
- **Activated:** An administrator can help you with problems or structure your knowledge base. However, every access is logged in the system audit.

## 4. Privacy: My Data (GDPR)

Ontheia gives you full control over your personal data — without administrator involvement.

### Export Data (Art. 20 GDPR)

You can download a complete copy of your data at any time. The export includes:
- Your user profile
- All your chats including messages
- Your execution history (run logs)
- Your memory entries from the vector database

The export includes: profile, settings, chats, run logs, cron jobs, and memory entries. The file is downloaded as `ontheia-export.json`.

### Delete Account (Art. 17 GDPR)

You can permanently delete your account and all associated personal data. A confirmation dialog appears before the final deletion.

**What is deleted:** Profile, sessions, settings, chats, run logs, cron jobs, memory entries.

**What is retained:** Agents, tasks, chains, and providers — these are system resources assigned to the entire system and do not belong to you personally.

> ⚠️ Deletion is irreversible. Create an export first if you want to back up your data.
