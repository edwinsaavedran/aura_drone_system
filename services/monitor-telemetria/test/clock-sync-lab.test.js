const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applySlewCorrection,
  applyStepCorrection,
  chooseTimestampForPurpose,
  classifyFutureTimestamp,
  classifyTelemetryPackets,
  compareWithClockUncertainty,
  computeNtpExchange,
  createNtpTimestamps,
  evaluateAuditConfidence,
  evaluateStaleSync,
  evaluateTelemetryImpact,
  parseArgs,
  runClockSyncLab
} = require("../src/clock-sync-lab");

test("computes NTP round trip delay and estimated offset with four timestamps", () => {
  const exchange = computeNtpExchange({ t0: 1_000, t1: 1_120, t2: 1_130, t3: 1_090 });

  assert.equal(exchange.roundTripDelayMs, 80);
  assert.equal(exchange.estimatedOffsetMs, 80);
});

test("symmetric delay estimates true offset exactly", () => {
  const exchange = createNtpTimestamps({
    clientSendAtMs: 1_000,
    trueOffsetMs: 80,
    clientToServerDelayMs: 40,
    serverToClientDelayMs: 40,
    serverProcessingMs: 10
  });

  assert.equal(exchange.roundTripDelayMs, 80);
  assert.equal(exchange.estimatedOffsetMs, 80);
  assert.equal(exchange.estimationBiasMs, 0);
});

test("asymmetric delay biases estimated offset", () => {
  const exchange = createNtpTimestamps({
    clientSendAtMs: 1_000,
    trueOffsetMs: 80,
    clientToServerDelayMs: 20,
    serverToClientDelayMs: 100,
    serverProcessingMs: 10
  });

  assert.equal(exchange.roundTripDelayMs, 120);
  assert.equal(exchange.estimatedOffsetMs, 40);
  assert.equal(exchange.estimationBiasMs, -40);
});

test("step correction applies full correction immediately", () => {
  const correction = applyStepCorrection({ initialOffsetMs: 120, targetOffsetMs: 0 });

  assert.equal(correction.appliedCorrectionMs, -120);
  assert.deepEqual(
    correction.timeline.map((entry) => entry.offsetMs),
    [120, 0]
  );
});

test("slew correction applies gradual corrections and reaches target after ticks", () => {
  const correction = applySlewCorrection({ initialOffsetMs: 120, targetOffsetMs: 0, ticks: 4 });

  assert.equal(correction.correctionPerTickMs, -30);
  assert.deepEqual(
    correction.timeline.map((entry) => entry.offsetMs),
    [120, 90, 60, 30, 0]
  );
});

test("stale sync degrades confidence as estimated error grows", () => {
  const fresh = evaluateStaleSync({
    lastEstimatedErrorMs: 10,
    driftRateMsPerSecond: 0.1,
    syncAgeMs: 10_000,
    toleranceMs: 50
  });
  const stale = evaluateStaleSync({
    lastEstimatedErrorMs: 10,
    driftRateMsPerSecond: 0.1,
    syncAgeMs: 300_000,
    toleranceMs: 50
  });

  assert.equal(fresh.estimatedErrorMs, 11);
  assert.equal(stale.estimatedErrorMs, 40);
  assert.ok(stale.confidence < fresh.confidence);
});

test("telemetry impact marks events trusted or untrusted based on confidence and tolerance", () => {
  const trusted = evaluateTelemetryImpact({
    clockOffsetMs: 18,
    roundTripDelayMs: 40,
    syncAgeMs: 15_000,
    estimatedErrorMs: 12,
    confidence: 0.9,
    toleranceMs: 50
  });
  const untrusted = evaluateTelemetryImpact({
    clockOffsetMs: 45,
    roundTripDelayMs: 120,
    syncAgeMs: 90_000,
    estimatedErrorMs: 20,
    confidence: 0.55,
    toleranceMs: 50
  });

  assert.equal(trusted.trustedForOrdering, true);
  assert.equal(trusted.trustedForSlaWindow, true);
  assert.equal(trusted.trustedForAuditTimeline, true);
  assert.equal(untrusted.trustedForOrdering, false);
  assert.equal(untrusted.trustedForSlaWindow, false);
  assert.equal(untrusted.trustedForAuditTimeline, true);
});

test("parseArgs supports flags and positional modes", () => {
  assert.deepEqual(parseArgs(["--normal"]), { mode: "normal" });
  assert.deepEqual(parseArgs(["--asymmetric-delay"]), { mode: "asymmetric-delay" });
  assert.deepEqual(parseArgs(["--correction-policy"]), { mode: "correction-policy" });
  assert.deepEqual(parseArgs(["--stale-sync"]), { mode: "stale-sync" });
  assert.deepEqual(parseArgs(["--telemetry-impact"]), { mode: "telemetry-impact" });
  assert.deepEqual(parseArgs(["asymmetric-delay"]), { mode: "asymmetric-delay" });
  assert.deepEqual(parseArgs(["--mode", "stale-sync"]), { mode: "stale-sync" });
  assert.deepEqual(parseArgs(["--telemetry-impact", "--tolerance-ms=75"]), { mode: "telemetry-impact", toleranceMs: 75 });
  assert.deepEqual(parseArgs(["--scenario-analysis"]), { mode: "scenario-analysis" });
});

test("scenario analysis does not assert battery low before mission assignment inside clock uncertainty", () => {
  const result = compareWithClockUncertainty("10:20:00.100", "10:20:00.130", 80);

  assert.equal(result.differenceMs, 30);
  assert.equal(result.canEstablishTemporalOrder, false);
  assert.equal(result.decision, "uncertain-order");
  assert.match(result.recommendation, /fresh safety confirmation/);
});

test("scenario analysis marks late telemetry out-of-order without discarding it automatically", () => {
  const packets = classifyTelemetryPackets([
    { id: "P1", occurredAt: "10:20:00.100", receivedAt: "10:20:00.300", battery: 60 },
    { id: "P2", occurredAt: "10:20:00.200", receivedAt: "10:20:00.400", battery: 59 },
    { id: "P3", occurredAt: "10:19:59.900", receivedAt: "10:20:01.000", battery: 62 }
  ]);

  assert.equal(packets[2].id, "P3");
  assert.equal(packets[2].outOfOrder, true);
  assert.equal(packets[2].keepForAudit, true);
  assert.equal(packets[2].staleForOperationalState, true);
});

test("scenario analysis refuses exact incident order when all audit events are within error window", () => {
  const audit = evaluateAuditConfidence(
    [
      { service: "centro-logistica", timestamp: "10:30:00.100", event: "MissionAssigned" },
      { service: "gestor-flota", timestamp: "10:30:00.050", event: "DroneAvailable" },
      { service: "monitor-telemetria", timestamp: "10:30:00.020", event: "BatteryLow" },
      { service: "planificador-rutas", timestamp: "10:30:00.090", event: "RoutePlanned" }
    ],
    100
  );

  assert.equal(audit.exactTotalOrderTrusted, false);
  assert.equal(audit.tooClosePairs.length, 6);
  assert.ok(audit.recommendedMetadata.includes("causationId"));
  assert.ok(audit.recommendedMetadata.includes("sourceSequence"));
});

test("scenario analysis uses occurrence time for business SLA and ingestion times for delay", () => {
  const sla = chooseTimestampForPurpose({
    missionStartedOccurredAt: "10:00:00",
    deliveryCompletedOccurredAt: "10:29:58",
    completedReceivedAt: "10:31:10",
    completedProcessedAt: "10:31:30",
    promisedSlaMs: 30 * 60_000
  });

  assert.equal(sla.businessSlaTimestamp, "occurredAt");
  assert.equal(sla.businessDurationMs, 1_798_000);
  assert.equal(sla.metBusinessSla, true);
  assert.equal(sla.ingestionDelayMs, 72_000);
  assert.equal(sla.processingDelayMs, 20_000);
});

test("scenario analysis accepts small future timestamps as skewed instead of invalid", () => {
  const future = classifyFutureTimestamp({
    occurredAt: "10:40:05",
    backendCurrentTime: "10:40:03",
    futureToleranceMs: 5_000
  });

  assert.equal(future.futureByMs, 2_000);
  assert.equal(future.withinFutureTolerance, true);
  assert.equal(future.invalid, false);
  assert.match(future.recommendation, /Accept with uncertainty/);
});

test("scenario analysis mode returns all teaching scenarios", () => {
  const report = runClockSyncLab({ mode: "scenario-analysis" });

  assert.equal(report.mode, "scenario-analysis");
  assert.equal(report.lowBatteryVsMission.canEstablishTemporalOrder, false);
  assert.deepEqual(report.telemetry.byEventTime, ["P3", "P1", "P2"]);
  assert.equal(report.audit.exactTotalOrderTrusted, false);
  assert.equal(report.deliverySla.metBusinessSla, true);
  assert.equal(report.futureTimestamp.invalid, false);
});
