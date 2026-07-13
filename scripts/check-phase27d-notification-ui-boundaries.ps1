$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$requiredFiles = @(
  'apps/customer/src/pages/CustomerNotificationsPage.tsx',
  'apps/worker/src/pages/WorkerNotificationsPage.tsx',
  'apps/worker/src/pages/worker-notifications.css',
  'tests/unit/phase27dNotificationPages.test.tsx'
)
foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $file)) { throw "missing Phase27D artifact: $file" }
}

$customer = Get-Content -Raw -LiteralPath 'apps/customer/src/pages/CustomerNotificationsPage.tsx'
$worker = Get-Content -Raw -LiteralPath 'apps/worker/src/pages/WorkerNotificationsPage.tsx'
$customerApp = Get-Content -Raw -LiteralPath 'apps/customer/src/app/App.tsx'
$workerApp = Get-Content -Raw -LiteralPath 'apps/worker/src/app/App.tsx'
$ui = $customer + "`n" + $worker

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
  if (-not $ui.Contains($required)) { throw "Phase27D real workflow/state boundary missing: $required" }
}
if (-not $customerApp.Contains('currentRoute === "notifications"') -or
    -not $workerApp.Contains('route.route === "notifications"')) {
  throw "Phase27D Customer/Worker routes are not wired"
}
if ($workerApp.Contains('<a href="/worker/notifications"')) {
  throw "Worker Notification entry must not reload and discard the in-memory session"
}
if (-not $workerApp.Contains('onNavigate("/worker/notifications")')) {
  throw "Worker Notification entry must use the existing SPA navigation path"
}
if ($ui -match '(?i)mock|fake notification|demo notification') {
  throw "Phase27D runtime must not contain mock Notification data"
}
if ($ui.Contains('getNotificationUnreadCount')) {
  throw "Phase27D must not invent an unread badge/count surface"
}
if (-not $customer.Contains('/customer/orders?orderId=')) {
  throw "Customer order-created navigation must use the existing safe route"
}
if ($worker -match '<a\s|href=') {
  throw "Worker Notification must not invent an unsupported deep link"
}
$workerNavMarker = '(["hall", "tasks", "repairs", "wallet", "support", "profile", "certification"] as WorkerRoute[])'
if (-not $workerApp.Contains($workerNavMarker)) { throw "Worker bottom navigation must remain the approved seven items" }
$customerShell = Get-Content -Raw -LiteralPath 'apps/customer/src/pages/customerPageShell.tsx'
if (-not $customerShell.Contains('from "@xlb/api-client"')) {
  throw "Customer runtime must consume the API Client through the workspace package boundary"
}
if ($customerShell -match 'packages/api-client/src') {
  throw "Customer runtime must not import API Client source files by relative path"
}
if ($customerShell -match 'customerRouteConfig[\s\S]{0,2000}notifications\s*:') {
  throw "Customer bottom navigation must not gain an eighth Notification item"
}

Write-Output "check-phase27d-notification-ui-boundaries: passed"
