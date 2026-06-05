#!/usr/bin/env node

const CLOCK_SYNC_PRESETS = {
  normal: {
    description: "NTP-style exchange with symmetric delay and exact offset estimation",
    clientSendAtMs: 1_000,
    trueOffsetMs: 80,
    clientToServerDelayMs: 40,
    serverToClientDelayMs: 40,
    serverProcessingMs: 10
  },
  asymmetricDelay: {
    description: "NTP-style exchange with asymmetric delay that biases the estimated offset",
    clientSendAtMs: 1_000,
    trueOffsetMs: 80,
    clientToServerDelayMs: 20,
    serverToClientDelayMs: 100,
    serverProcessingMs: 10
  },
  correctionPolicy: {
    description: "compare abrupt step correction with gradual slew correction",
    initialOffsetMs: 120,
    targetOffsetMs: 0,
    ticks: 4
  },
  staleSync: {
    description: "confidence degrades as drift accumulates after the last sync",
    lastEstimatedOffsetMs: 20,
    lastEstimatedErrorMs: 12,
    driftRateMsPerSecond: 0.08,
    syncAgeMs: 90_000,
    toleranceMs: 50
  },
  telemetryImpact: {
    description: "timestamp metadata decides whether telemetry is trusted for ordering, SLA and audit",
    clockOffsetMs: 18,
    roundTripDelayMs: 40,
    syncAgeMs: 15_000,
    estimatedErrorMs: 12,
    confidence: 0.9,
    toleranceMs: 50
  },
  scenarioAnalysis: {
    description: "AURA scenarios where NTP reduces uncertainty but does not prove causality",
    clockErrorMs: 80,
    auditEstimatedErrorMs: 100,
    futureToleranceMs: 5_000
  }
};

function parseClockTimeMs(value) {
  const [hours, minutes, secondsWithMs] = value.split(":");
  const [seconds, milliseconds = "0"] = secondsWithMs.split(".");
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1_000 + Number(milliseconds.padEnd(3, "0"));
}

function formatSignedMs(value) {
  return `${value >= 0 ? "+" : ""}${value} ms`;
}

function computeNtpExchange(timestamps) {
  const { t0, t1, t2, t3 } = timestamps;
  return {
    t0,
    t1,
    t2,
    t3,
    roundTripDelayMs: (t3 - t0) - (t2 - t1),
    estimatedOffsetMs: ((t1 - t0) + (t2 - t3)) / 2
  };
}

function createNtpTimestamps(options = {}) {
  const clientSendAtMs = options.clientSendAtMs ?? CLOCK_SYNC_PRESETS.normal.clientSendAtMs;
  const trueOffsetMs = options.trueOffsetMs ?? CLOCK_SYNC_PRESETS.normal.trueOffsetMs;
  const clientToServerDelayMs = options.clientToServerDelayMs ?? CLOCK_SYNC_PRESETS.normal.clientToServerDelayMs;
  const serverToClientDelayMs = options.serverToClientDelayMs ?? CLOCK_SYNC_PRESETS.normal.serverToClientDelayMs;
  const serverProcessingMs = options.serverProcessingMs ?? CLOCK_SYNC_PRESETS.normal.serverProcessingMs;

  const t0 = clientSendAtMs;
  const t1 = clientSendAtMs + clientToServerDelayMs + trueOffsetMs;
  const t2 = t1 + serverProcessingMs;
  const t3 = clientSendAtMs + clientToServerDelayMs + serverProcessingMs + serverToClientDelayMs;

  return {
    ...computeNtpExchange({ t0, t1, t2, t3 }),
    trueOffsetMs,
    clientToServerDelayMs,
    serverToClientDelayMs,
    serverProcessingMs,
    estimationBiasMs: computeNtpExchange({ t0, t1, t2, t3 }).estimatedOffsetMs - trueOffsetMs
  };
}

function simulateNormal(options = {}) {
  const exchange = createNtpTimestamps({ ...CLOCK_SYNC_PRESETS.normal, ...options });
  return {
    mode: "normal",
    description: CLOCK_SYNC_PRESETS.normal.description,
    exchange,
    interpretation: "Symmetric delay lets the four-timestamp estimate match the true offset in this deterministic scenario."
  };
}

function simulateAsymmetricDelay(options = {}) {
  const exchange = createNtpTimestamps({ ...CLOCK_SYNC_PRESETS.asymmetricDelay, ...options });
  return {
    mode: "asymmetric-delay",
    description: CLOCK_SYNC_PRESETS.asymmetricDelay.description,
    exchange,
    interpretation: "Asymmetric network delay is interpreted as clock offset, so the estimate is biased."
  };
}

function applyStepCorrection(options = {}) {
  const initialOffsetMs = options.initialOffsetMs ?? CLOCK_SYNC_PRESETS.correctionPolicy.initialOffsetMs;
  const targetOffsetMs = options.targetOffsetMs ?? CLOCK_SYNC_PRESETS.correctionPolicy.targetOffsetMs;
  const appliedCorrectionMs = targetOffsetMs - initialOffsetMs;

  return {
    policy: "step",
    initialOffsetMs,
    targetOffsetMs,
    appliedCorrectionMs,
    timeline: [
      { tick: 0, offsetMs: initialOffsetMs, appliedCorrectionMs: 0 },
      { tick: 1, offsetMs: targetOffsetMs, appliedCorrectionMs }
    ]
  };
}

function applySlewCorrection(options = {}) {
  const initialOffsetMs = options.initialOffsetMs ?? CLOCK_SYNC_PRESETS.correctionPolicy.initialOffsetMs;
  const targetOffsetMs = options.targetOffsetMs ?? CLOCK_SYNC_PRESETS.correctionPolicy.targetOffsetMs;
  const ticks = options.ticks ?? CLOCK_SYNC_PRESETS.correctionPolicy.ticks;
  const correctionPerTickMs = (targetOffsetMs - initialOffsetMs) / ticks;
  const timeline = [{ tick: 0, offsetMs: initialOffsetMs, appliedCorrectionMs: 0 }];

  for (let tick = 1; tick <= ticks; tick += 1) {
    timeline.push({
      tick,
      offsetMs: initialOffsetMs + correctionPerTickMs * tick,
      appliedCorrectionMs: correctionPerTickMs
    });
  }

  return {
    policy: "slew",
    initialOffsetMs,
    targetOffsetMs,
    ticks,
    correctionPerTickMs,
    timeline
  };
}

function simulateCorrectionPolicy(options = {}) {
  return {
    mode: "correction-policy",
    description: CLOCK_SYNC_PRESETS.correctionPolicy.description,
    step: applyStepCorrection(options),
    slew: applySlewCorrection(options),
    interpretation: "Step is immediate but can reorder apparent time; slew is slower but avoids an abrupt clock jump."
  };
}

function evaluateStaleSync(options = {}) {
  const lastEstimatedOffsetMs = options.lastEstimatedOffsetMs ?? CLOCK_SYNC_PRESETS.staleSync.lastEstimatedOffsetMs;
  const lastEstimatedErrorMs = options.lastEstimatedErrorMs ?? CLOCK_SYNC_PRESETS.staleSync.lastEstimatedErrorMs;
  const driftRateMsPerSecond = options.driftRateMsPerSecond ?? CLOCK_SYNC_PRESETS.staleSync.driftRateMsPerSecond;
  const syncAgeMs = options.syncAgeMs ?? CLOCK_SYNC_PRESETS.staleSync.syncAgeMs;
  const toleranceMs = options.toleranceMs ?? CLOCK_SYNC_PRESETS.staleSync.toleranceMs;
  const driftSinceLastSyncMs = driftRateMsPerSecond * (syncAgeMs / 1_000);
  const estimatedErrorMs = lastEstimatedErrorMs + Math.abs(driftSinceLastSyncMs);
  const confidence = Math.max(0, Math.min(1, 1 - estimatedErrorMs / toleranceMs));

  return {
    lastEstimatedOffsetMs,
    driftSinceLastSyncMs,
    syncAgeMs,
    estimatedErrorMs,
    confidence,
    toleranceMs
  };
}

function simulateStaleSync(options = {}) {
  return {
    mode: "stale-sync",
    description: CLOCK_SYNC_PRESETS.staleSync.description,
    sync: evaluateStaleSync(options),
    interpretation: "A sync result gets stale: drift increases estimated error and lowers confidence."
  };
}

function evaluateTelemetryImpact(options = {}) {
  const clockOffsetMs = options.clockOffsetMs ?? CLOCK_SYNC_PRESETS.telemetryImpact.clockOffsetMs;
  const roundTripDelayMs = options.roundTripDelayMs ?? CLOCK_SYNC_PRESETS.telemetryImpact.roundTripDelayMs;
  const syncAgeMs = options.syncAgeMs ?? CLOCK_SYNC_PRESETS.telemetryImpact.syncAgeMs;
  const estimatedErrorMs = options.estimatedErrorMs ?? CLOCK_SYNC_PRESETS.telemetryImpact.estimatedErrorMs;
  const confidence = options.confidence ?? CLOCK_SYNC_PRESETS.telemetryImpact.confidence;
  const toleranceMs = options.toleranceMs ?? CLOCK_SYNC_PRESETS.telemetryImpact.toleranceMs;
  const withinTolerance = Math.abs(clockOffsetMs) + estimatedErrorMs <= toleranceMs;

  return {
    clockOffsetMs,
    roundTripDelayMs,
    syncAgeMs,
    confidence,
    toleranceMs,
    estimatedErrorMs,
    trustedForOrdering: withinTolerance && confidence >= 0.8 && roundTripDelayMs <= toleranceMs,
    trustedForSlaWindow: withinTolerance && confidence >= 0.6,
    trustedForAuditTimeline: confidence >= 0.4 && estimatedErrorMs <= toleranceMs * 2
  };
}

function simulateTelemetryImpact(options = {}) {
  return {
    mode: "telemetry-impact",
    description: CLOCK_SYNC_PRESETS.telemetryImpact.description,
    telemetry: evaluateTelemetryImpact(options),
    interpretation: "Synchronization metadata supports operational decisions, but each use case needs an explicit tolerance and confidence rule."
  };
}

function compareWithClockUncertainty(first, second, estimatedErrorMs) {
  const firstMs = typeof first === "number" ? first : parseClockTimeMs(first);
  const secondMs = typeof second === "number" ? second : parseClockTimeMs(second);
  const differenceMs = secondMs - firstMs;
  const canEstablishTemporalOrder = Math.abs(differenceMs) > estimatedErrorMs;

  return {
    firstMs,
    secondMs,
    differenceMs,
    estimatedErrorMs,
    canEstablishTemporalOrder,
    decision: canEstablishTemporalOrder ? "timestamp-order-usable" : "uncertain-order",
    recommendation: canEstablishTemporalOrder
      ? "Use timestamp order with the stated error margin."
      : "Do not assign blindly; require a fresh safety confirmation or mark the decision as uncertain."
  };
}

function classifyTelemetryPackets(packets) {
  let newestEventMsSeen = -Infinity;

  return packets.map((packet) => {
    const occurredAtMs = parseClockTimeMs(packet.occurredAt);
    const receivedAtMs = parseClockTimeMs(packet.receivedAt);
    const outOfOrder = occurredAtMs < newestEventMsSeen;
    newestEventMsSeen = Math.max(newestEventMsSeen, occurredAtMs);

    return {
      ...packet,
      occurredAtMs,
      receivedAtMs,
      outOfOrder,
      staleForOperationalState: outOfOrder,
      keepForAudit: true,
      recommendation: outOfOrder
        ? "Mark stale/out-of-order and keep for audit; do not overwrite newer operational state automatically."
        : "Use as current telemetry if it passes the normal freshness policy."
    };
  });
}

function orderTelemetryByEventTime(packets) {
  return [...packets].sort((left, right) => parseClockTimeMs(left.occurredAt) - parseClockTimeMs(right.occurredAt));
}

function evaluateAuditConfidence(events, estimatedErrorMs) {
  const normalizedEvents = events.map((event) => ({ ...event, timestampMs: parseClockTimeMs(event.timestamp) }));
  const tooClosePairs = [];

  for (let leftIndex = 0; leftIndex < normalizedEvents.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedEvents.length; rightIndex += 1) {
      const left = normalizedEvents[leftIndex];
      const right = normalizedEvents[rightIndex];
      const differenceMs = Math.abs(right.timestampMs - left.timestampMs);
      if (differenceMs <= estimatedErrorMs) {
        tooClosePairs.push({ left: left.service, right: right.service, differenceMs });
      }
    }
  }

  return {
    estimatedErrorMs,
    exactTotalOrderTrusted: tooClosePairs.length === 0,
    tooClosePairs,
    recommendedMetadata: [
      "correlationId",
      "causationId",
      "messageId",
      "commandId",
      "sourceSequence",
      "receivedAt",
      "processedAt",
      "localMonotonicSequence",
      "traceId",
      "spanId"
    ],
    limitation: "Physical-time audit cannot prove exact order when events are inside the uncertainty window."
  };
}

function chooseTimestampForPurpose(delivery) {
  const startedAtMs = parseClockTimeMs(delivery.missionStartedOccurredAt);
  const completedAtMs = parseClockTimeMs(delivery.deliveryCompletedOccurredAt);
  const receivedAtMs = parseClockTimeMs(delivery.completedReceivedAt);
  const processedAtMs = parseClockTimeMs(delivery.completedProcessedAt);
  const businessDurationMs = completedAtMs - startedAtMs;
  const ingestionDelayMs = receivedAtMs - completedAtMs;
  const processingDelayMs = processedAtMs - receivedAtMs;

  return {
    businessSlaTimestamp: "occurredAt",
    operationalMonitoringTimestamp: "receivedAt",
    processingDelayTimestamp: "processedAt",
    businessDurationMs,
    businessDurationMinutes: businessDurationMs / 60_000,
    metBusinessSla: businessDurationMs <= delivery.promisedSlaMs,
    ingestionDelayMs,
    processingDelayMs
  };
}

function classifyFutureTimestamp(event) {
  const occurredAtMs = parseClockTimeMs(event.occurredAt);
  const backendCurrentTimeMs = parseClockTimeMs(event.backendCurrentTime);
  const futureByMs = occurredAtMs - backendCurrentTimeMs;
  const withinFutureTolerance = futureByMs <= event.futureToleranceMs;

  return {
    occurredAtMs,
    backendCurrentTimeMs,
    futureByMs,
    withinFutureTolerance,
    invalid: futureByMs > event.futureToleranceMs,
    recommendation: withinFutureTolerance
      ? "Accept with uncertainty/skew metadata, refresh clock sync, and avoid wall-clock timeouts."
      : "Quarantine or reject according to policy because the future skew exceeds tolerance."
  };
}

function simulateScenarioAnalysis(options = {}) {
  const clockErrorMs = options.clockErrorMs ?? CLOCK_SYNC_PRESETS.scenarioAnalysis.clockErrorMs;
  const auditEstimatedErrorMs = options.auditEstimatedErrorMs ?? CLOCK_SYNC_PRESETS.scenarioAnalysis.auditEstimatedErrorMs;
  const futureToleranceMs = options.futureToleranceMs ?? CLOCK_SYNC_PRESETS.scenarioAnalysis.futureToleranceMs;
  const telemetryPackets = [
    { id: "P1", occurredAt: "10:20:00.100", receivedAt: "10:20:00.300", battery: 60 },
    { id: "P2", occurredAt: "10:20:00.200", receivedAt: "10:20:00.400", battery: 59 },
    { id: "P3", occurredAt: "10:19:59.900", receivedAt: "10:20:01.000", battery: 62 }
  ];

  return {
    mode: "scenario-analysis",
    description: CLOCK_SYNC_PRESETS.scenarioAnalysis.description,
    lowBatteryVsMission: compareWithClockUncertainty("10:20:00.100", "10:20:00.130", clockErrorMs),
    telemetry: {
      packets: classifyTelemetryPackets(telemetryPackets),
      byEventTime: orderTelemetryByEventTime(telemetryPackets).map((packet) => packet.id)
    },
    audit: evaluateAuditConfidence(
      [
        { service: "centro-logistica", timestamp: "10:30:00.100", event: "MissionAssigned" },
        { service: "gestor-flota", timestamp: "10:30:00.050", event: "DroneAvailable" },
        { service: "monitor-telemetria", timestamp: "10:30:00.020", event: "BatteryLow" },
        { service: "planificador-rutas", timestamp: "10:30:00.090", event: "RoutePlanned" }
      ],
      auditEstimatedErrorMs
    ),
    deliverySla: chooseTimestampForPurpose({
      missionStartedOccurredAt: "10:00:00",
      deliveryCompletedOccurredAt: "10:29:58",
      completedReceivedAt: "10:31:10",
      completedProcessedAt: "10:31:30",
      promisedSlaMs: 30 * 60_000
    }),
    futureTimestamp: classifyFutureTimestamp({
      occurredAt: "10:40:05",
      backendCurrentTime: "10:40:03",
      futureToleranceMs
    }),
    interpretation: "NTP reduces timestamp uncertainty, but causality still needs explicit metadata and conservative policies."
  };
}

function parseArgs(argv) {
  const options = { mode: "normal" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--normal") {
      options.mode = "normal";
    } else if (arg === "--asymmetric-delay") {
      options.mode = "asymmetric-delay";
    } else if (arg === "--correction-policy") {
      options.mode = "correction-policy";
    } else if (arg === "--stale-sync") {
      options.mode = "stale-sync";
    } else if (arg === "--telemetry-impact") {
      options.mode = "telemetry-impact";
    } else if (arg === "--scenario-analysis") {
      options.mode = "scenario-analysis";
    } else if (arg === "--mode") {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg.startsWith("--tolerance-ms=")) {
      options.toleranceMs = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--ticks=")) {
      options.ticks = Number(arg.split("=")[1]);
    } else if (!arg.startsWith("--")) {
      options.mode = arg;
    }
  }

  return options;
}

function runClockSyncLab(options = {}) {
  const mode = options.mode ?? "normal";
  if (mode === "normal") {
    return simulateNormal(options);
  }
  if (mode === "asymmetric-delay") {
    return simulateAsymmetricDelay(options);
  }
  if (mode === "correction-policy") {
    return simulateCorrectionPolicy(options);
  }
  if (mode === "stale-sync") {
    return simulateStaleSync(options);
  }
  if (mode === "telemetry-impact") {
    return simulateTelemetryImpact(options);
  }
  if (mode === "scenario-analysis") {
    return simulateScenarioAnalysis(options);
  }

  throw new Error(
    `clock sync mode '${mode}' is not supported. Use one of: normal, asymmetric-delay, correction-policy, stale-sync, telemetry-impact, scenario-analysis`
  );
}

function printExchange(exchange) {
  console.log("NTP-style four timestamps");
  console.log(`- t0 client send: ${exchange.t0} ms`);
  console.log(`- t1 server receive: ${exchange.t1} ms`);
  console.log(`- t2 server send: ${exchange.t2} ms`);
  console.log(`- t3 client receive: ${exchange.t3} ms`);
  console.log(`- roundTripDelayMs = ${exchange.roundTripDelayMs} ms`);
  console.log(`- estimatedOffsetMs = ${exchange.estimatedOffsetMs} ms`);
  console.log(`- trueOffsetMs = ${exchange.trueOffsetMs} ms`);
  console.log(`- estimationBiasMs = ${exchange.estimationBiasMs} ms`);
}

function printCorrectionPolicy(report) {
  console.log("Step correction");
  report.step.timeline.forEach((entry) => {
    console.log(`- tick ${entry.tick}: offset=${entry.offsetMs}ms appliedCorrection=${entry.appliedCorrectionMs}ms`);
  });
  console.log("Slew correction");
  report.slew.timeline.forEach((entry) => {
    console.log(`- tick ${entry.tick}: offset=${entry.offsetMs}ms appliedCorrection=${entry.appliedCorrectionMs}ms`);
  });
}

function printClockSyncReport(report) {
  console.log(`Clock synchronization lab: ${report.mode}`);
  console.log(`Scenario: ${report.description}`);

  if (report.exchange) {
    printExchange(report.exchange);
    console.log(`Interpretation: ${report.interpretation}`);
    return;
  }

  if (report.mode === "correction-policy") {
    printCorrectionPolicy(report);
    console.log(`Interpretation: ${report.interpretation}`);
    return;
  }

  if (report.mode === "stale-sync") {
    const sync = report.sync;
    console.log(`- lastEstimatedOffsetMs: ${sync.lastEstimatedOffsetMs} ms`);
    console.log(`- driftSinceLastSyncMs: ${sync.driftSinceLastSyncMs} ms`);
    console.log(`- syncAgeMs: ${sync.syncAgeMs} ms`);
    console.log(`- estimatedErrorMs: ${sync.estimatedErrorMs} ms`);
    console.log(`- confidence: ${sync.confidence}`);
    console.log(`- toleranceMs: ${sync.toleranceMs} ms`);
    console.log(`Interpretation: ${report.interpretation}`);
    return;
  }

  if (report.mode === "telemetry-impact") {
    const telemetry = report.telemetry;
    console.log(`- clockOffsetMs: ${telemetry.clockOffsetMs} ms`);
    console.log(`- roundTripDelayMs: ${telemetry.roundTripDelayMs} ms`);
    console.log(`- syncAgeMs: ${telemetry.syncAgeMs} ms`);
    console.log(`- confidence: ${telemetry.confidence}`);
    console.log(`- toleranceMs: ${telemetry.toleranceMs} ms`);
    console.log(`- trustedForOrdering: ${telemetry.trustedForOrdering}`);
    console.log(`- trustedForSlaWindow: ${telemetry.trustedForSlaWindow}`);
    console.log(`- trustedForAuditTimeline: ${telemetry.trustedForAuditTimeline}`);
    console.log(`Interpretation: ${report.interpretation}`);
    return;
  }

  if (report.mode === "scenario-analysis") {
    const lowBattery = report.lowBatteryVsMission;
    console.log("Low battery vs mission assignment");
    console.log(`- differenceMs: ${lowBattery.differenceMs} ms`);
    console.log(`- estimatedErrorMs: +/-${lowBattery.estimatedErrorMs} ms`);
    console.log(`- canEstablishTemporalOrder: ${lowBattery.canEstablishTemporalOrder}`);
    console.log(`- decision: ${lowBattery.decision}`);
    console.log("Out-of-order telemetry");
    report.telemetry.packets.forEach((packet) => {
      console.log(`- ${packet.id}: occurredAt=${packet.occurredAt} receivedAt=${packet.receivedAt} battery=${packet.battery} outOfOrder=${packet.outOfOrder}`);
    });
    console.log(`- eventTimeOrder: ${report.telemetry.byEventTime.join(" -> ")}`);
    console.log("Incident audit");
    console.log(`- exactTotalOrderTrusted: ${report.audit.exactTotalOrderTrusted}`);
    console.log(`- tooClosePairs: ${report.audit.tooClosePairs.length}`);
    console.log(`- recommendedMetadata: ${report.audit.recommendedMetadata.join(", ")}`);
    console.log("Delivery SLA");
    console.log(`- businessSlaTimestamp: ${report.deliverySla.businessSlaTimestamp}`);
    console.log(`- businessDurationMs: ${report.deliverySla.businessDurationMs} ms`);
    console.log(`- metBusinessSla: ${report.deliverySla.metBusinessSla}`);
    console.log(`- ingestionDelayMs: ${report.deliverySla.ingestionDelayMs} ms`);
    console.log(`- processingDelayMs: ${report.deliverySla.processingDelayMs} ms`);
    console.log("Future timestamp by local clock drift");
    console.log(`- futureByMs: ${formatSignedMs(report.futureTimestamp.futureByMs)}`);
    console.log(`- withinFutureTolerance: ${report.futureTimestamp.withinFutureTolerance}`);
    console.log(`- invalid: ${report.futureTimestamp.invalid}`);
    console.log(`Interpretation: ${report.interpretation}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = runClockSyncLab(options);
  printClockSyncReport(report);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  CLOCK_SYNC_PRESETS,
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
  orderTelemetryByEventTime,
  parseArgs,
  runClockSyncLab,
  simulateAsymmetricDelay,
  simulateCorrectionPolicy,
  simulateNormal,
  simulateScenarioAnalysis,
  simulateStaleSync,
  simulateTelemetryImpact
};
