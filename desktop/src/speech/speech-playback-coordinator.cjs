class SpeechPlaybackCoordinator {
  constructor(onStop, options = {}) {
    this.onStop = typeof onStop === "function" ? onStop : () => {}
    this.onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {}
    this.active = null
    this.sequence = 0
    this.now = typeof options.now === "function" ? options.now : () => Date.now()
    this.autoDedupeTtlMs = Number.isFinite(options.autoDedupeTtlMs)
      ? Math.max(0, options.autoDedupeTtlMs)
      : 10 * 60 * 1000
    this.completedAutomaticSegments = new Map()
  }

  pruneAutomaticSegments(now) {
    for (const [segmentId, completedAt] of this.completedAutomaticSegments) {
      if (now - completedAt > this.autoDedupeTtlMs) this.completedAutomaticSegments.delete(segmentId)
    }
    while (this.completedAutomaticSegments.size > 512) {
      const oldest = this.completedAutomaticSegments.keys().next().value
      if (oldest === undefined) break
      this.completedAutomaticSegments.delete(oldest)
    }
  }

  emit(event, details = {}) {
    this.onEvent(event, details)
  }

  claim({ ownerId, surface, segmentId, intent = "auto", preferredAutoSurface = null }) {
    const request = { ownerId, surface, segmentId, intent, preferredAutoSurface }
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
      this.emit("claim-denied", { ...request, reason: "invalid-owner" })
      return { granted: false, reason: "invalid-owner" }
    }
    if (!surface || !segmentId) {
      this.emit("claim-denied", { ...request, reason: "invalid-request" })
      return { granted: false, reason: "invalid-request" }
    }
    if (intent === "auto" && preferredAutoSurface && surface !== preferredAutoSurface) {
      this.emit("claim-denied", { ...request, reason: "not-preferred-surface" })
      return { granted: false, reason: "not-preferred-surface" }
    }
    if (intent === "auto") {
      const now = this.now()
      this.pruneAutomaticSegments(now)
      if (this.completedAutomaticSegments.has(segmentId)) {
        this.emit("claim-denied", { ...request, reason: "duplicate-auto-segment" })
        return { granted: false, reason: "duplicate-auto-segment" }
      }
    }

    if (
      this.active &&
      this.active.ownerId === ownerId &&
      this.active.surface === surface &&
      this.active.segmentId === segmentId
    ) {
      this.emit("claim-reused", { ...request, leaseId: this.active.leaseId })
      return { granted: true, leaseId: this.active.leaseId }
    }

    // Automatic speech must never cut off an existing utterance. It waits in
    // the renderer queue until the current automatic or manual lease ends.
    if (intent === "auto" && this.active) {
      const reason = this.active.intent === "manual"
        ? "manual-playback-active"
        : "automatic-playback-active"
      this.emit("claim-denied", {
        ...request,
        reason,
        activeLeaseId: this.active.leaseId,
        activeOwnerId: this.active.ownerId,
        activeSurface: this.active.surface,
        activeSegmentId: this.active.segmentId,
      })
      return { granted: false, reason }
    }

    const previous = this.active
    const lease = {
      leaseId: `speech_${Date.now()}_${++this.sequence}`,
      ownerId,
      surface,
      segmentId,
      intent,
    }
    this.active = lease
    if (previous) {
      this.emit("playback-preempted", {
        previousLeaseId: previous.leaseId,
        previousOwnerId: previous.ownerId,
        previousSurface: previous.surface,
        previousSegmentId: previous.segmentId,
        previousIntent: previous.intent,
        replacementLeaseId: lease.leaseId,
        replacementOwnerId: lease.ownerId,
        replacementSurface: lease.surface,
        replacementSegmentId: lease.segmentId,
        replacementIntent: lease.intent,
      })
      this.onStop(previous.ownerId, {
        type: "stop",
        leaseId: previous.leaseId,
        reason: "playback-preempted",
        replacementIntent: lease.intent,
        replacementSurface: lease.surface,
      })
    }
    this.emit("claim-granted", { ...request, leaseId: lease.leaseId })
    return { granted: true, leaseId: lease.leaseId }
  }

  release(ownerId, leaseId, outcome = "completed") {
    if (!this.active || this.active.ownerId !== ownerId || this.active.leaseId !== leaseId) {
      this.emit("release-ignored", { ownerId, leaseId, outcome })
      return false
    }
    const released = this.active
    this.active = null
    if (released.intent === "auto" && outcome === "completed") {
      const now = this.now()
      this.pruneAutomaticSegments(now)
      this.completedAutomaticSegments.set(released.segmentId, now)
    }
    this.emit("lease-released", {
      ownerId,
      leaseId,
      outcome,
      surface: released.surface,
      segmentId: released.segmentId,
      intent: released.intent,
    })
    return true
  }

  revokeOwner(ownerId, reason = "owner-unavailable") {
    if (!this.active || this.active.ownerId !== ownerId) return false
    const previous = this.active
    this.active = null
    this.emit("owner-revoked", {
      ownerId,
      reason,
      leaseId: previous.leaseId,
      surface: previous.surface,
      segmentId: previous.segmentId,
      intent: previous.intent,
    })
    this.onStop(previous.ownerId, { type: "stop", leaseId: previous.leaseId, reason })
    return true
  }

  snapshot() {
    return this.active ? { ...this.active } : null
  }
}

module.exports = { SpeechPlaybackCoordinator }
