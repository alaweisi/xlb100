$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$requiredFiles = @(
  'apps/worker/src/pages/WorkerNotificationsPage.tsx',
  'apps/worker/src/pages/worker-notifications.css',
  'tests/unit/phase27dNotificationPages.test.tsx'
)
foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $file)) { throw "missing Phase27D artifact: $file" }
}

$worker = Get-Content -Raw -LiteralPath 'apps/worker/src/pages/WorkerNotificationsPage.tsx'
$workerApp = Get-Content -Raw -LiteralPath 'apps/worker/src/app/App.tsx'

foreach ($required in @(
  'listNotifications',
  'markNotificationRead',
  'setNotificationArchived',
  'expectedRowVersion: item.rowVersion',
  'idempotencyKey: mutationKey',
  'nextCursorRef',
  'aria-busy',
  'role="status"',
  'isConflict'
  'busyRef.current) return'
)) {
  if (-not $worker.Contains($required)) { throw "Phase27D retained Worker workflow/state boundary missing: $required" }
}
if (-not $workerApp.Contains('route.route === "notifications"')) {
  throw "Phase27D Worker route is not wired"
}
if ($workerApp.Contains('<a href="/worker/notifications"')) {
  throw "Worker Notification entry must not reload and discard the in-memory session"
}
if (-not $workerApp.Contains('onNavigate("/worker/notifications")')) {
  throw "Worker Notification entry must use the existing SPA navigation path"
}
if ($worker -match '(?i)mock|fake notification|demo notification') {
  throw "Phase27D runtime must not contain mock Notification data"
}
if ($worker.Contains('getNotificationUnreadCount')) {
  throw "Phase27D must not invent an unread badge/count surface"
}
if ($worker -match '<a\s|href=') {
  throw "Worker Notification must not invent an unsupported deep link"
}
$workerNavMarker = '(["hall", "tasks", "repairs", "wallet", "profile"] as WorkerRoute[])'
if (-not $workerApp.Contains($workerNavMarker)) { throw "Worker bottom navigation must remain the approved five-item model" }

Write-Output "check-phase27d-notification-ui-boundaries: passed"
