#!/usr/bin/env node

const BASE_TIME_MS = Date.UTC(2026, 5, 4, 15, 0, 0);

const PHYSICAL_TIME_PRESETS = {
  normal: {
    description: "baseline clocks with small tolerated skew",
    offsetsMs: [0, 15, -10]
  },
  skew: {
    description: "client clocks disagree enough to invert reported order",
    offsetsMs: [120, -90, 20]
  },
  drift: {
    description: "one node gains time on every tick",
    startOffsetMs: 5,
    driftPerTickMs: 12,
    ticks: 6
  },
  tolerance: {
    description: "server accepts timestamps only inside a skew window",
    thresholdMs: 100,
    offsetsMs: [20, -85, 140, -160]
  }
};

function formatIso(ms) {
  return new Date(ms).toISOString();
}

function createPhysicalTimeEvent(index, options = {}) {
  const actualOffsetMs = options.actualOffsetMs ?? index * 100;
  const serverReceivedAtMs = (options.baseTimeMs ?? BASE_TIME_MS) + actualOffsetMs;
  const clockOffsetMs = options.clockOffsetMs ?? 0;
  const clientReportedAtMs = serverReceivedAtMs + clockOffsetMs;
  const thresholdMs = options.thresholdMs ?? 100;
  const clockSkewMs = clientReportedAtMs - serverReceivedAtMs;

  return {
    eventId: `evt-physical-${String(index + 1).padStart(3, "0")}`,
    correlationId: options.correlationId ?? "corr-session-21-physical-time",
    nodeId: options.nodeId ?? `drone-${String(index + 1).padStart(3, "0")}`,
    actualOrder: index + 1,
    actualOccurredAtMs: serverReceivedAtMs,
    clientReportedAtMs,
    serverReceivedAtMs,
    clockSkewMs,
    acceptedWithinTolerance: Math.abs(clockSkewMs) <= thresholdMs,
    clientReportedAt: formatIso(clientReportedAtMs),
    serverReceivedAt: formatIso(serverReceivedAtMs)
  };
}

function createEventsWithOffsets(options = {}) {
  const offsetsMs = options.offsetsMs ?? PHYSICAL_TIME_PRESETS.normal.offsetsMs;
  return offsetsMs.map((clockOffsetMs, index) =>
    createPhysicalTimeEvent(index, {
      ...options,
      clockOffsetMs,
      nodeId: `node-${String(index + 1).padStart(2, "0")}`
    })
  );
}

function sortByClientReportedAt(events) {
  return [...events].sort((left, right) => left.clientReportedAtMs - right.clientReportedAtMs);
}

function sortByServerReceivedAt(events) {
  return [...events].sort((left, right) => left.serverReceivedAtMs - right.serverReceivedAtMs);
}

function simulateWallClockVsMonotonic(options = {}) {
  const startWallClockMs = options.startWallClockMs ?? BASE_TIME_MS;
  const monotonicStartMs = options.monotonicStartMs ?? 1_000;
  const realDurationMs = options.realDurationMs ?? 250;
  const wallClockJumpMs = options.wallClockJumpMs ?? -600;

  const endWallClockMs = startWallClockMs + realDurationMs + wallClockJumpMs;
  const monotonicEndMs = monotonicStartMs + realDurationMs;

  return {
    realDurationMs,
    wallClockJumpMs,
    wallClockDurationMs: endWallClockMs - startWallClockMs,
    monotonicDurationMs: monotonicEndMs - monotonicStartMs,
    startWallClock: formatIso(startWallClockMs),
    endWallClock: formatIso(endWallClockMs)
  };
}

function simulateSkew(options = {}) {
  const events = createEventsWithOffsets({
    offsetsMs: options.offsetsMs ?? PHYSICAL_TIME_PRESETS.skew.offsetsMs,
    thresholdMs: options.thresholdMs
  });
  const actualOrder = sortByServerReceivedAt(events).map((event) => event.eventId);
  const clientReportedOrder = sortByClientReportedAt(events).map((event) => event.eventId);

  return {
    mode: "skew",
    description: PHYSICAL_TIME_PRESETS.skew.description,
    events,
    actualOrder,
    clientReportedOrder,
    clientOrderInvertsActualOrder: actualOrder.join("|") !== clientReportedOrder.join("|")
  };
}

function simulateDrift(options = {}) {
  const ticks = options.ticks ?? PHYSICAL_TIME_PRESETS.drift.ticks;
  const startOffsetMs = options.startOffsetMs ?? PHYSICAL_TIME_PRESETS.drift.startOffsetMs;
  const driftPerTickMs = options.driftPerTickMs ?? PHYSICAL_TIME_PRESETS.drift.driftPerTickMs;

  const timeline = Array.from({ length: ticks }, (_value, index) => {
    const clockSkewMs = startOffsetMs + index * driftPerTickMs;
    const serverReceivedAtMs = BASE_TIME_MS + index * 1_000;
    return {
      tick: index + 1,
      nodeId: "node-drifting-clock",
      serverReceivedAtMs,
      clientReportedAtMs: serverReceivedAtMs + clockSkewMs,
      clockSkewMs,
      errorGrowthMs: clockSkewMs - startOffsetMs,
      serverReceivedAt: formatIso(serverReceivedAtMs),
      clientReportedAt: formatIso(serverReceivedAtMs + clockSkewMs)
    };
  });

  return {
    mode: "drift",
    description: PHYSICAL_TIME_PRESETS.drift.description,
    startOffsetMs,
    driftPerTickMs,
    ticks,
    timeline,
    finalClockSkewMs: timeline[timeline.length - 1].clockSkewMs,
    totalErrorGrowthMs: timeline[timeline.length - 1].errorGrowthMs
  };
}

function evaluateTolerance(events, thresholdMs) {
  return events.map((event) => ({
    ...event,
    acceptedWithinTolerance: Math.abs(event.clockSkewMs) <= thresholdMs
  }));
}

function simulateTolerance(options = {}) {
  const thresholdMs = options.thresholdMs ?? PHYSICAL_TIME_PRESETS.tolerance.thresholdMs;
  const events = createEventsWithOffsets({
    offsetsMs: options.offsetsMs ?? PHYSICAL_TIME_PRESETS.tolerance.offsetsMs,
    thresholdMs
  });
  const evaluatedEvents = evaluateTolerance(events, thresholdMs);

  return {
    mode: "tolerance",
    description: PHYSICAL_TIME_PRESETS.tolerance.description,
    thresholdMs,
    events: evaluatedEvents,
    accepted: evaluatedEvents.filter((event) => event.acceptedWithinTolerance).length,
    rejected: evaluatedEvents.filter((event) => !event.acceptedWithinTolerance).length
  };
}

function simulateNormal(options = {}) {
  const events = createEventsWithOffsets({
    offsetsMs: options.offsetsMs ?? PHYSICAL_TIME_PRESETS.normal.offsetsMs,
    thresholdMs: options.thresholdMs
  });
  return {
    mode: "normal",
    description: PHYSICAL_TIME_PRESETS.normal.description,
    wallClock: simulateWallClockVsMonotonic(options),
    events,
    tolerance: simulateTolerance({ thresholdMs: options.thresholdMs ?? 100, offsetsMs: events.map((event) => event.clockSkewMs) })
  };
}

function parseArgs(argv) {
  const options = { mode: "normal" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--normal") {
      options.mode = "normal";
    } else if (arg === "--skew") {
      options.mode = "skew";
    } else if (arg === "--drift") {
      options.mode = "drift";
    } else if (arg === "--tolerance") {
      options.mode = "tolerance";
    } else if (arg === "--mode") {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg.startsWith("--threshold-ms=")) {
      options.thresholdMs = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--ticks=")) {
      options.ticks = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--drift-per-tick-ms=")) {
      options.driftPerTickMs = Number(arg.split("=")[1]);
    } else if (!arg.startsWith("--")) {
      options.mode = arg;
    }
  }

  return options;
}

function runPhysicalTimeLab(options = {}) {
  const mode = options.mode ?? "normal";
  if (mode === "normal") {
    return simulateNormal(options);
  }
  if (mode === "skew") {
    return simulateSkew(options);
  }
  if (mode === "drift") {
    return simulateDrift(options);
  }
  if (mode === "tolerance") {
    return simulateTolerance(options);
  }

  throw new Error(`physical time mode '${mode}' is not supported. Use one of: normal, skew, drift, tolerance`);
}

function printWallClockSection(report) {
  console.log("Wall-clock vs monotonic duration");
  console.log(`- Real duration: ${report.realDurationMs} ms`);
  console.log(`- Wall-clock jump: ${report.wallClockJumpMs} ms`);
  console.log(`- Duration measured with wall clock: ${report.wallClockDurationMs} ms`);
  console.log(`- Duration measured with monotonic clock: ${report.monotonicDurationMs} ms`);
  console.log("Interpretation: use wall-clock timestamps for human/event metadata, not for measuring elapsed duration.");
}

function printEvents(events) {
  events.forEach((event) => {
    console.log(
      `- ${event.eventId} ${event.nodeId}: clientReportedAt=${event.clientReportedAt} serverReceivedAt=${event.serverReceivedAt} skew=${event.clockSkewMs}ms accepted=${event.acceptedWithinTolerance}`
    );
  });
}

function printPhysicalTimeReport(report) {
  console.log(`Physical time lab: ${report.mode}`);
  console.log(`Scenario: ${report.description}`);

  if (report.wallClock) {
    printWallClockSection(report.wallClock);
    console.log("Event metadata with small offsets");
    printEvents(report.events);
    console.log("Interpretation: even healthy clocks have offset; store skew metadata instead of pretending timestamps are perfect.");
    return;
  }

  if (report.mode === "skew") {
    console.log("Events by actual server order:");
    console.log(`- ${report.actualOrder.join(" -> ")}`);
    console.log("Events by clientReportedAt:");
    console.log(`- ${report.clientReportedOrder.join(" -> ")}`);
    printEvents(report.events);
    console.log(
      `Interpretation: clientReportedAt ${report.clientOrderInvertsActualOrder ? "inverts" : "does not invert"} actual order. Physical timestamps alone do not prove global order.`
    );
    return;
  }

  if (report.mode === "drift") {
    console.log(`Start offset: ${report.startOffsetMs} ms`);
    console.log(`Drift per tick: ${report.driftPerTickMs} ms`);
    report.timeline.forEach((entry) => {
      console.log(
        `- tick ${entry.tick}: clientReportedAt=${entry.clientReportedAt} serverReceivedAt=${entry.serverReceivedAt} skew=${entry.clockSkewMs}ms errorGrowth=${entry.errorGrowthMs}ms`
      );
    });
    console.log(`Final skew: ${report.finalClockSkewMs} ms`);
    console.log("Interpretation: synchronization is temporary; drift makes error grow between sync points.");
    return;
  }

  if (report.mode === "tolerance") {
    console.log(`Tolerance window: +/- ${report.thresholdMs} ms`);
    printEvents(report.events);
    console.log(`Accepted: ${report.accepted}`);
    console.log(`Rejected: ${report.rejected}`);
    console.log("Interpretation: client timestamps can help, but only inside explicit tolerance windows and with server-side validation.");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = runPhysicalTimeLab(options);
  printPhysicalTimeReport(report);
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
  BASE_TIME_MS,
  createEventsWithOffsets,
  createPhysicalTimeEvent,
  evaluateTolerance,
  parseArgs,
  runPhysicalTimeLab,
  simulateDrift,
  simulateNormal,
  simulateSkew,
  simulateTolerance,
  simulateWallClockVsMonotonic,
  sortByClientReportedAt,
  sortByServerReceivedAt
};
