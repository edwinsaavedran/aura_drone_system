class FleetManager {
  constructor({ currentLeaderEpoch = 7 } = {}) {
    if (!Number.isInteger(currentLeaderEpoch) || currentLeaderEpoch < 0) {
      throw new Error("currentLeaderEpoch must be a non-negative integer");
    }
    this.assignments = new Map();
    this.latestFenceByDrone = new Map();
    this.currentLeaderEpoch = currentLeaderEpoch;
  }

  isLeaseExpired(lease, nowMs) {
    return nowMs > lease.acquiredAtMs + lease.ttlMs;
  }

  isFenceStale(droneId, fence) {
    const latestFence = this.latestFenceByDrone.get(droneId);
    return latestFence !== undefined && fence < latestFence;
  }

  isLeaderStale(leader) {
    return leader.epoch < this.currentLeaderEpoch;
  }

  assignDroneIfAvailable({ droneId, missionId, actor, nowMs, lease, fence, leader }) {
    validateAssignmentInput({ droneId, missionId, actor, nowMs, lease, fence, leader });

    const leaseDeadline = lease.acquiredAtMs + lease.ttlMs;
    if (this.isLeaderStale(leader)) {
      return rejected("stale_leader", { droneId, missionId, actor, leaseDeadline, fence, leaderEpoch: leader.epoch });
    }

    const leaseExpired = this.isLeaseExpired(lease, nowMs);
    const fenceStale = this.isFenceStale(droneId, fence);
    const assignedMission = this.assignments.get(droneId);

    if (leaseExpired) {
      return rejected("lease_expired", { droneId, missionId, actor, leaseDeadline, fence, leaseExpired, fenceStale });
    }
    if (fenceStale) {
      return rejected("stale_fence", { droneId, missionId, actor, leaseDeadline, fence, latestFence: this.latestFenceByDrone.get(droneId) });
    }
    if (actor !== lease.owner) {
      return rejected("lease_owner_mismatch", { droneId, missionId, actor, leaseOwner: lease.owner, leaseDeadline, fence });
    }
    if (assignedMission) {
      return rejected("drone_already_assigned", { droneId, missionId, actor, leaseDeadline, fence, assignedMissionId: assignedMission.missionId });
    }

    const assignment = { missionId, actor, fence, leaderEpoch: leader.epoch };
    this.assignments.set(droneId, assignment);
    this.latestFenceByDrone.set(droneId, fence);
    return { decision: "accepted", droneId, missionId, actor, fence, leaderEpoch: leader.epoch, leaseDeadline };
  }
}

function rejected(reason, details) {
  return { decision: "rejected", reason, ...details };
}

function validateAssignmentInput({ droneId, missionId, actor, nowMs, lease, fence, leader }) {
  if (![droneId, missionId, actor].every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error("droneId, missionId, and actor must be non-empty strings");
  }
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error("nowMs must be a non-negative finite number");
  }
  if (!Number.isInteger(fence) || fence < 0) {
    throw new Error("fence must be a non-negative integer");
  }
  if (!lease || typeof lease.owner !== "string" || lease.owner.length === 0) {
    throw new Error("lease.owner must be a non-empty string");
  }
  if (!Number.isFinite(lease.acquiredAtMs) || lease.acquiredAtMs < 0) {
    throw new Error("lease.acquiredAtMs must be a non-negative finite number");
  }
  if (!Number.isFinite(lease.ttlMs) || lease.ttlMs <= 0) {
    throw new Error("lease.ttlMs must be a positive finite number");
  }
  if (!leader || !Number.isInteger(leader.epoch) || leader.epoch < 0) {
    throw new Error("leader.epoch must be a non-negative integer");
  }
}

function runScenario() {
  const fleetManager = new FleetManager();
  const lc2 = fleetManager.assignDroneIfAvailable({
    droneId: "Drone-Alpha-1", missionId: "M-2002", actor: "LC2", nowMs: 4600,
    lease: { lockKey: "lock:drone:Alpha", owner: "LC2", acquiredAtMs: 4500, ttlMs: 3000 },
    fence: 22, leader: { id: "RP4", epoch: 7 }
  });
  const lc1Old = fleetManager.assignDroneIfAvailable({
    droneId: "Drone-Alpha-1", missionId: "M-2001", actor: "LC1-old", nowMs: 7600,
    lease: { lockKey: "lock:drone:Alpha", owner: "LC1", acquiredAtMs: 0, ttlMs: 3000 },
    fence: 21, leader: { id: "RP4", epoch: 7 }
  });
  const rp5OldLeader = fleetManager.assignDroneIfAvailable({
    droneId: "Drone-Alpha-1", missionId: "M-2003", actor: "RP5-old-leader", nowMs: 8000,
    lease: { lockKey: "lock:drone:Alpha", owner: "RP5", acquiredAtMs: 0, ttlMs: 3000 },
    fence: 20, leader: { id: "RP5", epoch: 6 }
  });

  return {
    lc2,
    lc1Old,
    rp5OldLeader,
    assignments: Array.from(fleetManager.assignments.entries()),
    limitations: [
      "This deterministic simulation applies local rules only; it does not implement consensus, quorum, Raft, Paxos, ZooKeeper, etcd, membership, or failover.",
      "It does not model concurrent processes, distributed clocks, lease renewal, or transactional persistence."
    ]
  };
}

if (require.main === module) {
  console.log(JSON.stringify(runScenario(), null, 2));
}

module.exports = { FleetManager, runScenario };
