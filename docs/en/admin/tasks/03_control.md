# Control & Assignment

Tasks must be assigned to one or more agents to be usable in the application.

## 1. Assignment to Agents
Under "Tasks per Agent," you can see a list of all registered agents and the tasks assigned to them.
- **New Assignment:** Select the desired agent at the top of the form and fill in the task data.
- **UUID:** Each task automatically receives a unique ID, which is used for internal links (e.g., in **Chains**).

## 2. Visibility in the Composer
Use the **"Show in Composer"** checkbox to control whether this task is visible to the end user in the dropdown menu.
- **Enabled (Default):** The user can explicitly select this task.
- **Deactivated:** The task is "hidden." This is useful for intermediate steps in complex **Chains** that should not be started directly by the user.

## 3. Deleting Tasks
When a task is deleted, it is irretrievably removed from the database. Ensure that no active **Chains** still reference this task to avoid error messages during execution.
