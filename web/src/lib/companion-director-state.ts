import type {
  CompanionDirectorBeat,
  CompanionDirectorExecution,
  CompanionDirectorRun,
  CompanionDirectorScene,
} from "../types"

export function latestCompanionDirectorRun(
  runs: CompanionDirectorRun[] | undefined,
): CompanionDirectorRun | undefined {
  return runs?.at(-1)
}

export function startCompanionDirectorRun(participantCount: number, userMessageID?: string): CompanionDirectorRun {
  return {
    beats: [],
    status: "planning",
    completedBeatIndexes: [],
    participantCount,
    userMessageID,
  }
}

export function directorRunForLocalPrompt(
  participantCount: number,
  userMessageID?: string,
): CompanionDirectorRun | undefined {
  return participantCount > 1 ? startCompanionDirectorRun(participantCount, userMessageID) : undefined
}

export function setCompanionDirectorPlan(input: {
  planID: string
  userMessageID?: string
  source: string
  diagnostic?: string | null
  scene?: CompanionDirectorScene
  execution?: CompanionDirectorExecution
  beats: CompanionDirectorBeat[]
  participantCount?: number
}): CompanionDirectorRun {
  return {
    planID: input.planID,
    userMessageID: input.userMessageID,
    source: input.source,
    diagnostic: input.diagnostic,
    scene: input.scene,
    execution: input.execution,
    beats: input.beats,
    status: "planned",
    completedBeatIndexes: [],
    participantCount: input.participantCount,
  }
}

export function applyCompanionSpeakerEvent(
  current: CompanionDirectorRun | undefined,
  input: { planID: string; beatIndex: number; phase: "started" | "finished" },
): CompanionDirectorRun | undefined {
  if (!current || (current.planID && current.planID !== input.planID)) return current
  if (input.phase === "started") {
    return {
      ...current,
      status: "running",
      activeBeatIndex: input.beatIndex,
    }
  }
  const completedBeatIndexes = Array.from(
    new Set([...current.completedBeatIndexes, input.beatIndex]),
  ).sort((left, right) => left - right)
  return {
    ...current,
    status: completedBeatIndexes.length >= current.beats.length ? "completed" : "running",
    activeBeatIndex: undefined,
    completedBeatIndexes,
  }
}

export function completeCompanionDirectorRun(
  current: CompanionDirectorRun | undefined,
): CompanionDirectorRun | undefined {
  if (!current || current.status === "planning" || current.status === "failed") return current
  return { ...current, status: "completed", activeBeatIndex: undefined }
}
