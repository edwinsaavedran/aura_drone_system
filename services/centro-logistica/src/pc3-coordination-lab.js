// PC3 - Coordination lab: simulación acotada de lease, fencing y líder viejo.
// No implementa consenso real ni infraestructura distribuida: solo reglas
// locales de decisión sobre un recurso protegido (Drone-Alpha-1).

class FleetManager {
  constructor() {
    this.assignments = new Map();
    this.latestFenceByDrone = new Map();
    this.currentLeaderEpoch = 7;
    this.auditLog = [];
  }

  assignDroneIfAvailable({ droneId, missionId, actor, nowMs, lease, fence, leader }) {
    // Orden de validación: primero autoridad (líder), luego vigencia (lease),
    // luego antigüedad del token (fence), y al final disponibilidad del dron.
    if (this.isLeaderStale(leader)) {
      return this.decide({
        decision: 'rejected',
        reason: 'stale-leader',
        detail: `leader ${leader.id} epoch=${leader.epoch} < currentLeaderEpoch=${this.currentLeaderEpoch}`,
        droneId, missionId, actor, nowMs, fence,
      });
    }

    if (this.isLeaseExpired(lease, nowMs)) {
      const leaseDeadline = lease.acquiredAtMs + lease.ttlMs;
      return this.decide({
        decision: 'rejected',
        reason: 'lease-expired',
        detail: `leaseDeadline=${leaseDeadline}ms < nowMs=${nowMs}ms (owner=${lease.owner})`,
        droneId, missionId, actor, nowMs, fence,
      });
    }

    if (this.isFenceStale(droneId, fence)) {
      const latest = this.latestFenceByDrone.get(droneId);
      return this.decide({
        decision: 'rejected',
        reason: 'stale-fence',
        detail: `fence=${fence} <= latestAcceptedFence=${latest}`,
        droneId, missionId, actor, nowMs, fence,
      });
    }

    if (this.assignments.has(droneId)) {
      const current = this.assignments.get(droneId);
      return this.decide({
        decision: 'rejected',
        reason: 'drone-already-assigned',
        detail: `${droneId} ya asignado a ${current.missionId} con fence=${current.fence}`,
        droneId, missionId, actor, nowMs, fence,
      });
    }

    this.assignments.set(droneId, { missionId, actor, fence, assignedAtMs: nowMs });
    this.latestFenceByDrone.set(droneId, fence);
    return this.decide({
      decision: 'accepted',
      reason: 'valid-lease-fence-and-leader',
      detail: `asignación persistida con fence=${fence}`,
      droneId, missionId, actor, nowMs, fence,
    });
  }

  isLeaseExpired(lease, nowMs) {
    return nowMs > lease.acquiredAtMs + lease.ttlMs;
  }

  isFenceStale(droneId, fence) {
    const latest = this.latestFenceByDrone.get(droneId);
    return latest !== undefined && fence <= latest;
  }

  isLeaderStale(leader) {
    return leader.epoch < this.currentLeaderEpoch;
  }

  decide(entry) {
    this.auditLog.push(entry);
    return entry;
  }
}

function runScenario() {
  const fleetManager = new FleetManager();

  // LC2: lease vigente, fence más alto conocido, líder actual (epoch 7).
  const lc2 = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2002',
    actor: 'LC2',
    nowMs: 4600,
    lease: {
      lockKey: 'lock:drone:Alpha',
      owner: 'LC2',
      acquiredAtMs: 4500,
      ttlMs: 3000,
    },
    fence: 22,
    leader: { id: 'RP4', epoch: 7 },
  });

  // LC1 despierta tarde: su lease venció en 3000ms y su fence (21) ya fue
  // superado por el fence aceptado de LC2 (22).
  const lc1Old = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2001',
    actor: 'LC1-old',
    nowMs: 7600,
    lease: {
      lockKey: 'lock:drone:Alpha',
      owner: 'LC1',
      acquiredAtMs: 0,
      ttlMs: 3000,
    },
    fence: 21,
    leader: { id: 'RP4', epoch: 7 },
  });

  // RP5 despierta creyéndose líder, pero su epoch (6) es anterior al actual (7).
  const rp5OldLeader = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2003',
    actor: 'RP5-old-leader',
    nowMs: 8000,
    lease: {
      lockKey: 'lock:drone:Alpha',
      owner: 'RP5',
      acquiredAtMs: 0,
      ttlMs: 3000,
    },
    fence: 20,
    leader: { id: 'RP5', epoch: 6 },
  });

  // Caso extra: reintento con lease y líder válidos, pero el dron ya está
  // asignado -> demuestra la prevención de doble asignación como regla propia.
  const lc3Duplicate = fleetManager.assignDroneIfAvailable({
    droneId: 'Drone-Alpha-1',
    missionId: 'M-2004',
    actor: 'LC3',
    nowMs: 9000,
    lease: {
      lockKey: 'lock:drone:Alpha',
      owner: 'LC3',
      acquiredAtMs: 8500,
      ttlMs: 3000,
    },
    fence: 23,
    leader: { id: 'RP4', epoch: 7 },
  });

  return {
    lc2,
    lc1Old,
    rp5OldLeader,
    lc3Duplicate,
    assignments: Array.from(fleetManager.assignments.entries()),
    auditLog: fleetManager.auditLog,
    limitations: [
      'Simulación en un solo proceso: no hay red, ni pérdida de mensajes, ni relojes reales.',
      'El epoch del líder y los fences se validan contra estado local, no contra un servicio de coordinación.',
      'El tiempo (nowMs) es inyectado, no medido: no se prueba drift ni pausas de GC reales.',
      'No hay persistencia: un reinicio pierde latestFenceByDrone y assignments.',
      'No implementa consenso, quórum ni failover real (fuera del alcance de la Fase 5).',
    ],
  };
}

console.log(JSON.stringify(runScenario(), null, 2));

module.exports = { FleetManager, runScenario };
