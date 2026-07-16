export const TRAFFIC_STEPS = Object.freeze([5, 25, 50, 100]);

export const REQUIRED_PORTS = Object.freeze({
  registry: ["inspectDigests"],
  terraform: ["reviewPlan", "apply"],
  kubernetes: ["deployNoTraffic", "rollback"],
  backup: ["verify"],
  migration: ["run"],
  smoke: ["run"],
  jobs: ["switchToTke", "observeSingleActive", "returnToLighthouse"],
  traffic: ["setWeight", "observe", "rollback"],
  lifecycle: ["observe", "retire"],
  checkpoint: ["load", "save"],
  process: ["afterCheckpoint"],
  clock: ["now"],
});

export function assertSimulationPorts(ports) {
  for (const [portName, methods] of Object.entries(REQUIRED_PORTS)) {
    const port = ports?.[portName];
    if (!port || typeof port !== "object") {
      throw new TypeError(`simulation port ${portName} is required`);
    }
    for (const method of methods) {
      if (typeof port[method] !== "function") {
        throw new TypeError(`simulation port ${portName}.${method}() is required`);
      }
    }
  }
  return ports;
}

export function assertTrafficPlan(steps) {
  if (!Array.isArray(steps) || steps.length !== TRAFFIC_STEPS.length) {
    throw new Error("traffic plan must be exactly 5/25/50/100");
  }
  for (let index = 0; index < TRAFFIC_STEPS.length; index += 1) {
    if (steps[index] !== TRAFFIC_STEPS[index]) {
      throw new Error("traffic plan must be exactly 5/25/50/100");
    }
  }
}
