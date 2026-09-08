function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

// Native requests wrap MonOs context in trigger; Core presence wraps facts in payload.
// Older saved records already contain flat activity facts.
export function selfAwakeActivity(value: unknown): Record<string, unknown> {
  const context = record(value)
  const trigger = record(context.trigger)
  const activity = record(trigger.user_activity ?? context.user_activity)
  if (activity.available === false) return { available: false }
  const facts = record(activity.payload ?? activity)
  return { ...facts, captured_at: facts.captured_at ?? activity.captured_at }
}

export function selfAwakeObservations(value: unknown): string[] {
  const observations = record(value).observations
  return Array.isArray(observations)
    ? observations.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : []
}
