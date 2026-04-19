# Admin Console › Users

**Path:** Avatar dropdown → Administration → Users

---

## Section: System Access

| Field | Type | Description |
| --- | --- | --- |
| Allow Self-Registration (Self-Signup) | Checkbox | Allows new users to register independently without admin intervention. |
| Require admin approval for new users | Checkbox | Newly registered users remain in "Pending" status until an admin activates them. |

> Changes take effect immediately — no Apply button required.

---

## Section: User Management

Table of all registered users. Columns: **Email / Name**, **Role**, **Status**, **Last Login**, **Actions** (Edit / Delete).

Button **[Create User]** opens a modal dialog.

---

## Modal: Create User / Edit User

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| Email | Text | ✓ (create only) | Disabled when editing an existing user. |
| Display Name | Text | | Visible name in the interface. |
| Password | Password | ✓ (create only) | At least 8 characters. Not shown when editing. |
| Role | Dropdown | ✓ | `User` or `Administrator`. Cannot be changed on your own account. |
| Status | Dropdown | ✓ | `Active`, `Pending`, or `Locked`. Cannot be changed on your own account. |
| Admin memory access allowed | Checkbox | | Read-only — controlled by the user themselves, not changeable by admin. |

> Save via **[Save]** in the modal. Cancel with **[Cancel]**.
