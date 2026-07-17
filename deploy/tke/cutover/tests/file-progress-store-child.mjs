import { createFileProgressStore } from "../file-progress-store.mjs";

function parseEnvironment(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return JSON.parse(process.env[name]);
}

const command = process.argv[2];
const options = parseEnvironment("XLB_FILE_STORE_OPTIONS");
const store = createFileProgressStore(options);

if (command === "cas") {
  const request = parseEnvironment("XLB_FILE_STORE_CAS");
  process.stdout.write(`${JSON.stringify({ won: store.compareAndSwap(request.expectedRevision, request.next) })}\n`);
} else if (command === "load") {
  process.stdout.write(`${JSON.stringify({ value: store.load() })}\n`);
} else if (command === "hold") {
  const lock = store.acquireLock();
  process.stdout.write(`${JSON.stringify({
    ready: true,
    pid: process.pid,
    nonce: lock.nonce,
    releaseId: lock.releaseId,
    planSha256: lock.planSha256,
  })}\n`);
  // Deliberately do not install a signal cleanup handler: killing this fixture
  // simulates a crashed owner and leaves the exclusive directory for recovery.
  setInterval(() => {}, 60_000);
} else {
  throw new Error(`unknown child fixture command: ${command}`);
}
