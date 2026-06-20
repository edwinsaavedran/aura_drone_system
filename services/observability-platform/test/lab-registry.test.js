const test = require("node:test");
const assert = require("node:assert/strict");
const { listLabModes, listLabs, runLab } = require("../src/lab-registry");

const expectedClockSyncModeIds = [
  "normal",
  "asymmetric-delay",
  "correction-policy",
  "stale-sync",
  "telemetry-impact",
  "scenario-analysis"
];
const expectedPhysicalTimeModeIds = ["normal", "skew", "drift", "tolerance"];
const expectedLamportModeIds = ["causal-chain", "concurrent-events", "merge-and-tie-break"];
const expectedVectorClockModeIds = ["causal-chain", "concurrent-events", "merge-and-conflict"];
const expectedMutualExclusionModeIds = ["contended-queue", "fairness-rounds", "critical-section-safety", "delay-and-reorder"];
const expectedDistributedLocksModeIds = ["lock-acquire-and-hold", "lease-expiry-and-reacquire", "renewal-jitter-and-risk", "stale-owner-and-fencing-warning"];

test("lab registry lists Session 21 through Session 26 labs", () => {
  const labs = listLabs();

  assert.deepEqual(labs.map((lab) => lab.id), ["physical-time", "clock-sync", "lamport-ordering", "vector-clocks", "mutual-exclusion", "distributed-locks"]);
  assert.equal(labs.find((lab) => lab.id === "physical-time").session, 21);
  assert.equal(labs.find((lab) => lab.id === "physical-time").defaultMode, "normal");
  assert.match(labs.find((lab) => lab.id === "clock-sync").relationship, /Sesión 21/);
  assert.equal(labs.find((lab) => lab.id === "lamport-ordering").session, 23);
  assert.match(labs.find((lab) => lab.id === "lamport-ordering").relationship, /Sesión 24/);
  assert.equal(labs.find((lab) => lab.id === "vector-clocks").session, 24);
  assert.match(labs.find((lab) => lab.id === "vector-clocks").relationship, /Sesión 25/);
  assert.equal(labs.find((lab) => lab.id === "mutual-exclusion").session, 25);
  assert.match(labs.find((lab) => lab.id === "mutual-exclusion").relationship, /Sesión 26/);
  assert.equal(labs.find((lab) => lab.id === "distributed-locks").session, 26);
  assert.match(labs.find((lab) => lab.id === "distributed-locks").relationship, /Sesión 27/);
});

test("lab registry lists modes and runs clock sync scenario analysis", () => {
  assert.deepEqual(listLabModes("clock-sync").map((mode) => mode.id), expectedClockSyncModeIds);

  const result = runLab("clock-sync", "scenario-analysis");
  assert.equal(result.metrics.overlappingWindows, true);
  assert.equal(result.decisions.find((decision) => decision.id === "incident-audit").decision, "exact-order-not-trusted");
});

test("lab registry runs each clock sync mode", () => {
  listLabModes("clock-sync").forEach((mode) => {
    const result = runLab("clock-sync", mode.id);

    assert.equal(result.mode, mode.id);
  });
});

test("lab registry lists modes and runs physical time Session 21 drift mode", () => {
  assert.deepEqual(listLabModes("physical-time").map((mode) => mode.id), expectedPhysicalTimeModeIds);

  const result = runLab("physical-time", "drift");
  assert.equal(result.labId, "physical-time");
  assert.equal(result.session, 21);
  assert.equal(result.mode, "drift");
  assert.equal(result.raw.mode, "drift");
  assert.equal(result.metrics.finalClockSkewMs, 65);
});

test("lab registry runs each physical time mode", () => {
  listLabModes("physical-time").forEach((mode) => {
    const result = runLab("physical-time", mode.id);

    assert.equal(result.mode, mode.id);
  });
});

test("lab registry lists modes and runs Lamport ordering Session 23 causal chain", () => {
  assert.deepEqual(listLabModes("lamport-ordering").map((mode) => mode.id), expectedLamportModeIds);

  const result = runLab("lamport-ordering", "causal-chain");
  assert.equal(result.labId, "lamport-ordering");
  assert.equal(result.session, 23);
  assert.equal(result.metrics.causalEdges, 4);
  assert.equal(result.raw.mode, "causal-chain");
});

test("lab registry runs each Lamport ordering mode", () => {
  listLabModes("lamport-ordering").forEach((mode) => {
    const result = runLab("lamport-ordering", mode.id);

    assert.equal(result.mode, mode.id);
  });
});

test("lab registry lists modes and runs Vector clocks Session 24 causal chain", () => {
  assert.deepEqual(listLabModes("vector-clocks").map((mode) => mode.id), expectedVectorClockModeIds);

  const result = runLab("vector-clocks", "causal-chain");
  assert.equal(result.labId, "vector-clocks");
  assert.equal(result.session, 24);
  assert.equal(result.metrics.happenedBeforeComparisons, 3);
  assert.equal(result.raw.mode, "causal-chain");
});

test("lab registry runs each Vector clocks mode", () => {
  listLabModes("vector-clocks").forEach((mode) => {
    const result = runLab("vector-clocks", mode.id);

    assert.equal(result.mode, mode.id);
  });
});

test("lab registry lists modes and runs Mutual exclusion Session 25 contended queue", () => {
  assert.deepEqual(listLabModes("mutual-exclusion").map((mode) => mode.id), expectedMutualExclusionModeIds);

  const result = runLab("mutual-exclusion", "contended-queue");
  assert.equal(result.labId, "mutual-exclusion");
  assert.equal(result.session, 25);
  assert.equal(result.metrics.safetyViolations, 0);
  assert.equal(result.raw.mode, "contended-queue");
});

test("lab registry runs each Mutual exclusion mode", () => {
  listLabModes("mutual-exclusion").forEach((mode) => {
    const result = runLab("mutual-exclusion", mode.id);

    assert.equal(result.mode, mode.id);
  });
});

test("lab registry lists modes and runs Distributed locks Session 26 acquire and hold", () => {
  assert.deepEqual(listLabModes("distributed-locks").map((mode) => mode.id), expectedDistributedLocksModeIds);

  const result = runLab("distributed-locks", "lock-acquire-and-hold");
  assert.equal(result.labId, "distributed-locks");
  assert.equal(result.session, 26);
  assert.equal(result.metrics.expired, false);
  assert.equal(result.raw.mode, "lock-acquire-and-hold");
});

test("lab registry runs each Distributed locks mode", () => {
  listLabModes("distributed-locks").forEach((mode) => {
    const result = runLab("distributed-locks", mode.id);

    assert.equal(result.mode, mode.id);
  });
});
