import { Check, ChevronDown, LoaderCircle, Route } from "lucide-react"
import { resolveCoreAssetUrl } from "../../../lib/auth"
import { cn } from "../../../lib/utils"
import type { CompanionDirectorRun } from "../../../types"
import type { SessionParticipant } from "../../../lib/agent-client"

interface DirectorPlanCardProps {
  run: CompanionDirectorRun
  participants: SessionParticipant[]
}

function participantFor(participants: SessionParticipant[], assistantID: number | string) {
  return participants.find((participant) => String(participant.assistantID) === String(assistantID))
}

function participantName(participants: SessionParticipant[], assistantID?: number | string | null) {
  if (assistantID === undefined || assistantID === null) return "未指定"
  const participant = participantFor(participants, assistantID)
  return participant?.assistantName || participant?.characterName || `助手 ${assistantID}`
}

const sceneLabels: Record<string, string> = {
  social: "社交聊天",
  coding: "编程开发",
  game: "游戏场景",
  daily: "日常事务",
  research: "信息研究",
  mixed: "混合场景",
  general: "综合对话",
}

const executionLabels: Record<string, string> = {
  solo: "单助手",
  lead_support: "主辅协作",
  ensemble: "多人互动",
}

const observationLabels: Record<string, string> = {
  none: "无需观察",
  on_demand: "按需观察",
  shared: "共享观察",
  independent: "独立观察",
}

function statusText(run: CompanionDirectorRun) {
  if (run.status === "planning") return "正在根据上下文安排发言"
  if (run.status === "running" && run.activeBeatIndex !== undefined) {
    return `正在执行 ${run.activeBeatIndex + 1} / ${run.beats.length}`
  }
  if (run.status === "completed") return "本轮编排完成"
  if (run.status === "failed") return "本轮编排中断"
  return `已选择 ${run.beats.length} 个发言节拍`
}

function fallbackDescription(diagnostic?: string | null) {
  if (diagnostic === "director_output_truncated") return "导演输出被模型截断，已由主助手安全接续"
  if (diagnostic === "director_output_empty") return "导演没有返回公开计划，已由主助手安全接续"
  if (diagnostic === "director_output_invalid_json") return "导演计划格式无效，已由主助手安全接续"
  if (diagnostic === "director_output_no_valid_beats") return "导演没有选出有效助手，已由主助手安全接续"
  if (diagnostic === "director_request_failed") return "导演请求失败，已由主助手安全接续"
  return "导演不可用时的安全回退"
}

export function DirectorPlanCard({ run, participants }: DirectorPlanCardProps) {
  const planning = run.status === "planning"

  return (
    <details className="group mx-[1vw] mb-[1.5vh] ml-[6.1vw] max-w-[78%] rounded-[1vh] border border-border/80 bg-card/55 shadow-sm backdrop-blur-sm open:bg-card/80">
      <summary className="flex min-h-[5.7vh] cursor-pointer list-none items-center gap-[0.85vw] px-[1vw] py-[0.8vh] [&::-webkit-details-marker]:hidden">
        <span className="flex h-[3.2vh] w-[3.2vh] shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          {planning ? <LoaderCircle className="h-[1.8vh] w-[1.8vh] animate-spin" /> : <Route className="h-[1.8vh] w-[1.8vh]" />}
        </span>
        <span className="shrink-0 text-[1.55vh] font-medium text-text">导演选择</span>

        {planning ? (
          <span className="min-w-0 flex-1 truncate text-[1.42vh] text-text-muted">
            正在阅读 {run.participantCount ?? participants.length} 位在场助手与当前对话…
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-[0.45vw] overflow-x-auto py-[0.15vh]">
            {run.scene ? (
              <span className="shrink-0 rounded-full border border-accent/25 bg-accent/8 px-[0.6vw] py-[0.35vh] text-[1.28vh] text-accent">
                {sceneLabels[run.scene.domain] || run.scene.domain}
              </span>
            ) : null}
            {run.execution ? (
              <span className="shrink-0 rounded-full border border-border/60 bg-bg/45 px-[0.6vw] py-[0.35vh] text-[1.28vh] text-text-muted">
                {executionLabels[run.execution.mode] || run.execution.mode}
              </span>
            ) : null}
            {run.beats.map((beat, index) => {
              const participant = participantFor(participants, beat.assistantID)
              const name = participant?.assistantName || participant?.characterName || `助手 ${beat.assistantID}`
              const avatar = resolveCoreAssetUrl(participant?.avatarUrl)
              const active = run.activeBeatIndex === index
              const completed = run.completedBeatIndexes.includes(index)
              return (
                <span key={`${String(beat.assistantID)}-${index}`} className="contents">
                  {index > 0 ? <span className="shrink-0 text-[1.35vh] text-text-muted/65">→</span> : null}
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-[0.38vw] rounded-full border px-[0.5vw] py-[0.3vh] text-[1.35vh] transition-colors",
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : completed
                          ? "border-border/70 bg-bg/65 text-text"
                          : "border-border/50 bg-bg/35 text-text-muted",
                    )}
                  >
                    <span className="flex h-[2.35vh] w-[2.35vh] items-center justify-center overflow-hidden rounded-full bg-card font-serif text-[1vh]">
                      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover object-top" /> : name.slice(0, 1)}
                    </span>
                    <span>{name}</span>
                    {completed ? <Check className="h-[1.25vh] w-[1.25vh] text-emerald-600" /> : null}
                  </span>
                </span>
              )
            })}
          </span>
        )}

        <span className="shrink-0 text-[1.25vh] text-text-muted">{statusText(run)}</span>
        <ChevronDown className="h-[1.55vh] w-[1.55vh] shrink-0 text-text-muted transition-transform group-open:rotate-180" />
      </summary>

      {!planning ? (
        <div className="border-t border-border/65 px-[1vw] pb-[1vh] pt-[0.8vh]">
          {run.scene || run.execution ? (
            <div className="mb-[0.85vh] grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-[0.7vw] rounded-[0.65vh] bg-bg/40 px-[0.8vw] py-[0.7vh] text-[1.25vh] leading-[1.55]">
              <div className="min-w-0">
                <span className="text-text-muted">场景</span>
                <span className="ml-[0.55vw] font-medium text-text">
                  {run.scene ? sceneLabels[run.scene.domain] || run.scene.domain : "未判断"}
                </span>
                {run.scene?.summary ? <span className="ml-[0.55vw] text-text-muted">{run.scene.summary}</span> : null}
              </div>
              <div className="min-w-0 truncate text-text-muted">
                {run.execution ? (
                  <>
                    <span>主助手</span>
                    <span className="ml-[0.55vw] font-medium text-text">
                      {participantName(participants, run.execution.leadAssistantID)}
                    </span>
                    <span className="mx-[0.45vw] text-border">·</span>
                    <span>{observationLabels[run.execution.observationStrategy] || run.execution.observationStrategy}</span>
                  </>
                ) : null}
              </div>
              {run.execution?.toolOwnerAssistantID !== undefined && run.execution.toolOwnerAssistantID !== null ? (
                <div className="col-span-2 text-text-muted">
                  副作用工具负责人
                  <span className="ml-[0.55vw] font-medium text-text">
                    {participantName(participants, run.execution.toolOwnerAssistantID)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mb-[0.7vh] flex items-center justify-between text-[1.22vh] text-text-muted">
            <span>
              {run.status === "failed" && run.error
                ? run.error
                : run.source === "model"
                ? "根据角色与对话动态编排"
                : run.source === "single"
                  ? "单助手会话，无需额外选角"
                  : fallbackDescription(run.diagnostic)}
            </span>
            <span>{run.beats.length} 个节拍</span>
          </div>
          <div className="space-y-[0.55vh]">
            {run.beats.map((beat, index) => {
              const participant = participantFor(participants, beat.assistantID)
              const name = participant?.assistantName || participant?.characterName || `助手 ${beat.assistantID}`
              return (
                <div key={`${String(beat.assistantID)}-detail-${index}`} className="grid grid-cols-[2.2vh_7vw_minmax(0,1fr)] items-start gap-[0.55vw] text-[1.35vh] leading-[1.55]">
                  <span className="mt-[0.12vh] flex h-[2vh] w-[2vh] items-center justify-center rounded-full bg-bg text-[1.12vh] text-text-muted">
                    {index + 1}
                  </span>
                  <span className="truncate font-medium text-text">{name}</span>
                  <span className="text-text-muted">{beat.intent || "参与当前对话"}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </details>
  )
}
