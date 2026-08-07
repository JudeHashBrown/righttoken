# Dashboard task windows and mail routing design

## Goal

Keep the dashboard focused on recent actionable work without changing or deleting historical task records, and route the aggregate reply card into the newest pending mail conversation.

## Dashboard metrics

### Due today

- Count only open tasks whose `dueAt` falls within the current Shanghai calendar day.
- Also require `createdAt >= now - 168 hours`.
- Calculate the overdue note from that same filtered set with `dueAt < now`, so the overdue number is always a subset of the displayed total.
- Keep old tasks unchanged in storage and available through ordinary task views.

### Urgent tasks

- Count only open tasks with priority `URGENT`.
- Also require `createdAt >= now - 72 hours`.
- Keep older urgent tasks unchanged in storage and available through ordinary task views.

### Permissions

- Preserve the existing administrator and operator scopes.
- Dashboard links must apply the same recent-task windows as their cards so list results agree with the displayed counts.

## Pending mail routing

- Change the dashboard reply-card destination to `/mail?view=pending`.
- The pending-mail view remains ordered by most recently updated conversation first.
- When no explicit conversation is selected and pending conversations exist, automatically select and render the first conversation.
- Preserve explicit `selected` links and the existing empty state.

## Testing

- Verify the 168-hour and 72-hour boundaries with a fixed `now`.
- Verify the overdue note is derived from the same due-today population.
- Verify dashboard shortcut URLs carry the matching fixed time windows.
- Verify the pending-mail destination automatically opens the latest authorized conversation while explicit selection still wins.
- Run unit, integration, type, lint, and production-build checks.
