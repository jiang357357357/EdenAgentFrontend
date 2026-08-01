class SpeechPlaybackCoordinator {
  constructor(onStop) {
    this.onStop = typeof onStop === "function" ? onStop : () => {}
    this.active = null
    this.sequence = 0
  }

  claim({ ownerId, surface, segmentId, intent = "auto", preferredAutoSurface = null }) {
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return { granted: false, reason: "invalid-owner" }
    if (!surface || !segmentId) return { granted: false, reason: "invalid-request" }
    if (intent === "auto" && preferredAutoSurface && surface !== preferredAutoSurface) {
      return { granted: false, reason: "not-preferred-surface" }
    }

    if (
      this.active &&
      this.active.ownerId === ownerId &&
      this.active.surface === surface &&
      this.active.segmentId === segmentId
    ) {
      return { granted: true, leaseId: this.active.leaseId }
    }

    const previous = this.active
    const lease = {
      leaseId: `speech_${Date.now()}_${++this.sequence}`,
      ownerId,
      surface,
      segmentId,
    }
    this.active = lease
    if (previous) {
      this.onStop(previous.ownerId, {
        type: "stop",
        leaseId: previous.leaseId,
        reason: "playback-preempted",
      })
    }
    return { granted: true, leaseId: lease.leaseId }
  }

  release(ownerId, leaseId) {
    if (!this.active || this.active.ownerId !== ownerId || this.active.leaseId !== leaseId) return false
    this.active = null
    return true
  }

  revokeOwner(ownerId, reason = "owner-unavailable") {
    if (!this.active || this.active.ownerId !== ownerId) return false
    const previous = this.active
    this.active = null
    this.onStop(previous.ownerId, { type: "stop", leaseId: previous.leaseId, reason })
    return true
  }

  snapshot() {
    return this.active ? { ...this.active } : null
  }
}

module.exports = { SpeechPlaybackCoordinator }
