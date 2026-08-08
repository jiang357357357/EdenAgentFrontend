import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import type { PendingQuestion } from "../../types"
import { cn } from "../../lib/utils"

interface QuestionDecisionOverlayProps {
  request: PendingQuestion
  onReply: (requestID: string, answers: string[][]) => Promise<void>
  onReject: (requestID: string) => Promise<void>
  fillWindow?: boolean
}

const dialogMotion = {
  initial: { opacity: 0, y: "-0.5vh", scale: 0.985 },
  animate: { opacity: 1, y: "-2.5vh", scale: 1 },
  exit: { opacity: 0, y: "-1vh", scale: 0.99 },
}

export function QuestionDecisionOverlay({ request, onReply, onReject, fillWindow = false }: QuestionDecisionOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Record<number, string[]>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState<"reply" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const answers = useMemo(
    () =>
      request.questions.map((_, index) => {
        const picked = selected[index] ?? []
        const customValue = custom[index]?.trim()
        return customValue ? [...picked, customValue] : picked
      }),
    [custom, request.questions, selected],
  )
  const canSubmit = answers.length > 0 && answers.every((answer) => answer.length > 0)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    return () => previousFocus?.focus()
  }, [])

  async function handleReply() {
    if (submitting) return
    if (!canSubmit) {
      setError("请先完成所有问题的选择。")
      dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')?.focus()
      return
    }
    setSubmitting("reply")
    setError(null)
    try {
      await onReply(request.id, answers)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      setSubmitting(null)
    }
  }

  async function handleReject() {
    if (submitting) return
    setSubmitting("reject")
    setError(null)
    try {
      await onReject(request.id)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      setSubmitting(null)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      void handleReject()
      return
    }
    if (event.key !== "Tab") return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function updateOption(questionIndex: number, label: string, multiple = false) {
    setSelected((current) => {
      const picked = current[questionIndex] ?? []
      return {
        ...current,
        [questionIndex]: multiple
          ? picked.includes(label)
            ? picked.filter((item) => item !== label)
            : [...picked, label]
          : [label],
      }
    })
  }

  const eyebrow = request.questions[0]?.header || "需要确认"

  return (
    <motion.div
      key={`question-backdrop-${request.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(247,243,237,0.74)] p-4 backdrop-blur-[2px]"
      aria-hidden={false}
    >
      <motion.div
        ref={dialogRef}
        {...dialogMotion}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`question-title-${request.id}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex flex-col overflow-hidden rounded-[1.8vh] border border-stone-200/90 bg-card text-text shadow-[0_2.4vh_7vh_rgba(68,55,43,0.16),0_0.35vh_1.3vh_rgba(68,55,43,0.08)] outline-none",
          fillWindow
            ? "h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)]"
            : "h-[74.5vh] max-h-[74.5vh] w-[32vw] min-w-[min(300px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]",
        )}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            void handleReply()
          }}
        >
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto px-[clamp(18px,1.8vw,36px)] pb-[2vh] pt-[4.7vh]",
              request.questions.length === 1 && "question-decision-body-single",
            )}
          >
            <p className="text-[1.55vh] font-medium tracking-[0.02em] text-accent">{eyebrow}</p>

            <div className="mt-[1.5vh] space-y-[3vh]">
              {request.questions.map((item, questionIndex) => {
                const picked = selected[questionIndex] ?? []
                return (
                  <fieldset
                    key={`${request.id}-${questionIndex}`}
                    className={cn(questionIndex > 0 && "border-t border-border pt-[3vh]")}
                  >
                    {questionIndex > 0 && (
                      <p className="mb-[0.9vh] text-[1.45vh] font-medium tracking-[0.02em] text-accent">
                        {item.header || `问题 ${questionIndex + 1}`}
                      </p>
                    )}
                    <legend
                      id={questionIndex === 0 ? `question-title-${request.id}` : undefined}
                      className="mb-[1.7vh] block w-full font-serif text-[2.8vh] font-medium leading-[1.35] text-text"
                    >
                      {item.question}
                    </legend>

                    <div className="space-y-[1.25vh]">
                      {item.options.map((option) => {
                        const checked = picked.includes(option.label)
                        return (
                          <label
                            key={option.label}
                            className={cn(
                              "flex cursor-pointer items-center gap-[1vw] rounded-[1vh] border px-[1vw] py-[1.35vh] transition-[border-color,background-color,box-shadow]",
                              option.description ? "min-h-[9vh]" : "min-h-[6.8vh]",
                              checked
                                ? "border-accent/45 bg-accent/[0.06] shadow-[0_0_0_1px_rgba(217,119,6,0.08)]"
                                : "border-border bg-card hover:border-stone-300 hover:bg-stone-50/60",
                              submitting && "cursor-wait opacity-70",
                            )}
                          >
                            <input
                              type={item.multiple ? "checkbox" : "radio"}
                              name={`question-${request.id}-${questionIndex}`}
                              value={option.label}
                              checked={checked}
                              disabled={submitting !== null}
                              onChange={() => updateOption(questionIndex, option.label, item.multiple)}
                              className={cn(
                                "h-[2.3vh] w-[2.3vh] flex-none accent-amber-600 outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                                item.multiple ? "rounded-[0.35vh]" : "rounded-full",
                              )}
                            />
                            <span className="min-w-0">
                              <span className="block text-[1.8vh] font-medium leading-[1.35] text-text">{option.label}</span>
                              {option.description && (
                                <span className="mt-[0.35vh] block text-[1.45vh] leading-[1.45] text-text-muted">
                                  {option.description}
                                </span>
                              )}
                            </span>
                          </label>
                        )
                      })}
                    </div>

                    {item.custom !== false && (
                      <label className="mt-[1.8vh] block border-t border-border pt-[1.5vh]">
                        <span className="mb-[0.8vh] block text-[1.45vh] font-medium text-text-muted">补充说明（可选）</span>
                        <textarea
                          value={custom[questionIndex] ?? ""}
                          onChange={(event) =>
                            setCustom((current) => ({ ...current, [questionIndex]: event.target.value }))
                          }
                          disabled={submitting !== null}
                          rows={2}
                          placeholder="请输入补充说明（可选）"
                          className="min-h-[8vh] w-full resize-y rounded-[1vh] border border-border bg-card px-[0.8vw] py-[1.1vh] text-[1.5vh] leading-[1.45] text-text outline-none transition-colors placeholder:text-text-lighter focus:border-accent/55 focus:ring-2 focus:ring-accent/10 disabled:cursor-wait disabled:opacity-70"
                        />
                      </label>
                    )}
                  </fieldset>
                )
              })}
            </div>

            {error && (
              <div role="alert" className="mt-[1.5vh] rounded-[1vh] border border-red-200 bg-red-50 px-[0.8vw] py-[1vh] text-[1.4vh] text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex-none px-[clamp(18px,1.8vw,36px)] pb-[3.9vh]">
            <button
              type="submit"
              disabled={submitting !== null}
              className="flex h-[5.4vh] w-full items-center justify-center rounded-[1vh] bg-accent px-[1vw] text-[1.8vh] font-semibold text-white shadow-[0_0.55vh_1.5vh_rgba(217,119,6,0.2)] transition-[background-color,box-shadow,transform,opacity] hover:bg-amber-700 hover:shadow-[0_0.8vh_1.9vh_rgba(217,119,6,0.25)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-accent disabled:opacity-50 disabled:shadow-none"
            >
              {submitting === "reply" ? "正在提交…" : "确认选择"}
            </button>
            <button
              type="button"
              disabled={submitting !== null}
              onClick={() => void handleReject()}
              className="mt-[1.8vh] flex h-[4.5vh] w-full items-center justify-center rounded-[0.8vh] text-[1.65vh] text-text-lighter outline-none transition-colors hover:bg-stone-50 hover:text-text-muted focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-wait disabled:opacity-60"
            >
              {submitting === "reject" ? "正在处理…" : "暂不处理"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
