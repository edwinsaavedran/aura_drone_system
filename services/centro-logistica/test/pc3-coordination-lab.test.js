const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { FleetManager, runScenario } = require("../src/pc3-coordination-lab");

const serviceRoot = path.join(__dirname, "..");

function validRequest(overrides = {}) {
  return {
    droneId: "Drone-Alpha-1",
    missionId: "M-2002",
    actor: "LC2",
    nowMs: 4600,
    lease: { lockKey: "lock:drone:Alpha", owner: "LC2", acquiredAtMs: 4500, ttlMs: 3000 },
    fence: 22,
    leader: { id: "RP4", epoch: 7 },
    ...overrides
  };
}

test("PC3 accepts the documented LC2 assignment and preserves it deterministically", () => {
  const first = runScenario();
  const second = runScenario();

  assert.deepEqual(first, second);
  assert.equal(first.lc2.decision, "accepted");
  assert.equal(first.lc2.missionId, "M-2002");
  assert.equal(first.lc2.leaseDeadline, 7500);
  assert.deepEqual(first.assignments, [["Drone-Alpha-1", { missionId: "M-2002", actor: "LC2", fence: 22, leaderEpoch: 7 }]]);
});

test("PC3 rejects a live lease used by an actor other than its owner without persistence", () => {
  const fleetManager = new FleetManager();
  const result = fleetManager.assignDroneIfAvailable(validRequest({ actor: "LC1", missionId: "M-2001" }));

  assert.deepEqual(result, {
    decision: "rejected", reason: "lease_owner_mismatch", droneId: "Drone-Alpha-1", missionId: "M-2001",
    actor: "LC1", leaseOwner: "LC2", leaseDeadline: 7500, fence: 22
  });
  assert.deepEqual(Array.from(fleetManager.assignments.entries()), []);
});

test("PC3 rejects the expired and stale fenced LC1 attempt", () => {
  const result = runScenario().lc1Old;

  assert.equal(result.decision, "rejected");
  assert.equal(result.reason, "lease_expired");
  assert.equal(result.leaseDeadline, 3000);
  assert.equal(result.fenceStale, true);
});

test("PC3 rejects a stale fencing token before it can overwrite an assignment", () => {
  const fleetManager = new FleetManager();
  fleetManager.assignDroneIfAvailable(validRequest());

  const result = fleetManager.assignDroneIfAvailable(validRequest({ missionId: "M-2001", fence: 21 }));

  assert.deepEqual(result, {
    decision: "rejected", reason: "stale_fence", droneId: "Drone-Alpha-1", missionId: "M-2001",
    actor: "LC2", leaseDeadline: 7500, fence: 21, latestFence: 22
  });
});

test("PC3 rejects a current-fence second mission to prevent double assignment", () => {
  const fleetManager = new FleetManager();
  fleetManager.assignDroneIfAvailable(validRequest());

  const result = fleetManager.assignDroneIfAvailable(validRequest({ missionId: "M-2001", fence: 23 }));

  assert.equal(result.reason, "drone_already_assigned");
  assert.equal(result.assignedMissionId, "M-2002");
});

test("PC3 rejects RP5 before evaluating its expired lease or assignment", () => {
  const result = runScenario().rp5OldLeader;

  assert.equal(result.decision, "rejected");
  assert.equal(result.reason, "stale_leader");
  assert.equal(result.leaderEpoch, 6);
});

test("PC3 rejects malformed coordination requests", () => {
  const fleetManager = new FleetManager();

  assert.throws(() => fleetManager.assignDroneIfAvailable(validRequest({ nowMs: -1 })), /nowMs must be a non-negative finite number/);
  assert.throws(() => fleetManager.assignDroneIfAvailable(validRequest({ fence: -1 })), /fence must be a non-negative integer/);
  assert.throws(() => fleetManager.assignDroneIfAvailable(validRequest({ lease: { owner: "LC2", acquiredAtMs: -1, ttlMs: 3000 } })), /lease.acquiredAtMs must be a non-negative finite number/);
  assert.throws(() => fleetManager.assignDroneIfAvailable(validRequest({ lease: { owner: "LC2", acquiredAtMs: 4500, ttlMs: 0 } })), /lease.ttlMs must be a positive finite number/);
  assert.throws(() => fleetManager.assignDroneIfAvailable(validRequest({ leader: { id: "RP4", epoch: -1 } })), /leader.epoch must be a non-negative integer/);
  assert.throws(() => new FleetManager({ currentLeaderEpoch: -1 }), /currentLeaderEpoch must be a non-negative integer/);
});

test("PC3 package script executes the documented deterministic JSON evidence", () => {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const output = execFileSync(npm, ["run", "lab:pc3-coordination"], { cwd: serviceRoot, encoding: "utf8" });
  const payload = JSON.parse(output.slice(output.indexOf("{")));

  assert.equal(payload.lc2.decision, "accepted");
  assert.equal(payload.lc2.missionId, "M-2002");
  assert.equal(payload.lc1Old.reason, "lease_expired");
  assert.equal(payload.lc1Old.fenceStale, true);
  assert.equal(payload.rp5OldLeader.reason, "stale_leader");
  assert.deepEqual(payload.assignments, [["Drone-Alpha-1", { missionId: "M-2002", actor: "LC2", fence: 22, leaderEpoch: 7 }]]);
});
