import { useEffect, useMemo, useState } from 'react';
import { HelpCircle, Send, X } from 'lucide-react';
import type { PendingQuestion } from '../../types';
import { cn } from '../../lib/utils';
import { NoticeCard, noticeActionClass, noticeSurface } from '../feedback';

interface QuestionRequestCardProps {
  request: PendingQuestion;
  onReply: (requestID: string, answers: string[][], supplementary?: string[]) => Promise<void>;
  onReject: (requestID: string) => Promise<void>;
  tone?: 'default' | 'overlay';
}

export function QuestionRequestCard({ request, onReply, onReject, tone = 'default' }: QuestionRequestCardProps) {
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<'reply' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected({})
    setCustom({})
    setSubmitting(null)
    setError(null)
  }, [request.id])

  const answers = useMemo(
    () => request.questions.map((_, index) => selected[index] ?? []),
    [request.questions, selected],
  )
  const supplementary = useMemo(
    () => request.questions.map((item, index) => item.custom !== false ? custom[index]?.trim() ?? '' : ''),
    [request.questions, custom],
  )
  const canSubmit = answers.length > 0 && answers.every((answer, index) => answer.length > 0 || Boolean(supplementary[index]))

  function toggleOption(questionIndex: number, label: string, multiple?: boolean) {
    setSelected((prev) => {
      const current = prev[questionIndex] ?? [];
      if (multiple) {
        return {
          ...prev,
          [questionIndex]: current.includes(label)
            ? current.filter((item) => item !== label)
            : [...current, label],
        };
      }
      return {
        ...prev,
        [questionIndex]: current[0] === label ? [] : [label],
      };
    });
  }

  async function handleReply() {
    if (submitting || !canSubmit) return;
    setSubmitting('reply');
    setError(null);
    try {
      await onReply(request.id, answers, supplementary);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(null);
    }
  }

  async function handleReject() {
    if (submitting) return;
    setSubmitting('reject');
    setError(null);
    try {
      await onReject(request.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div
      className={cn(
        noticeSurface({ tone: 'info', variant: tone }),
        'p-4',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info"
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.15em] text-info">问题确认</span>
            {request.tool && <span className="text-xs text-text-muted">工具调用: {request.tool.callID}</span>}
          </div>

          <div className="mt-3 space-y-4">
            {request.questions.map((item, index) => {
              const picked = selected[index] ?? [];
              return (
                <div
                  key={`${request.id}-${index}`}
                  className={cn(
                    'rounded-xl border px-3 py-3',
                    tone === 'overlay'
                      ? 'border-highlight/10 bg-highlight/5'
                      : 'border-border bg-bg',
                  )}
                >
                  <div className={cn('text-[10px] uppercase tracking-[0.15em]', tone === 'overlay' ? 'text-text-muted' : 'text-text-muted')}>{item.header}</div>
                  <div className={cn('mt-1 text-sm', tone === 'overlay' ? 'text-text' : 'text-text')}>{item.question}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.options.map((option) => {
                      const active = picked.includes(option.label);
                      return (
                        <button
                          key={option.label}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleOption(index, option.label, item.multiple)}
                          disabled={submitting !== null}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-left text-xs transition-colors',
                            active
                              ? tone === 'overlay'
                                ? 'border-info/30 bg-info/10 text-text'
                                : 'border-accent/35 bg-accent/10 text-text'
                              : tone === 'overlay'
                                ? 'border-highlight/10 bg-scrim/10 text-text hover:border-highlight/20 hover:text-text'
                                : 'border-border bg-card text-text-muted hover:border-accent/30 hover:text-text',
                            submitting !== null && 'cursor-wait opacity-70',
                          )}
                          title={option.description}
                        >
                          <div className="font-medium text-current">{option.label}</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-current/80">{option.description}</div>
                        </button>
                      );
                    })}
                  </div>
                  {item.custom !== false && (
                    <input
                      value={custom[index] ?? ''}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setCustom((prev) => ({ ...prev, [index]: value }));
                      }}
                      maxLength={4000}
                      disabled={submitting !== null}
                      placeholder="自定义回答"
                      className={cn(
                        'mt-3 w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors',
                        tone === 'overlay'
                          ? 'border-highlight/10 bg-scrim/10 text-text placeholder:text-text-muted focus:border-info/30'
                          : 'border-border bg-card text-text placeholder:text-text-muted focus:border-accent/40',
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <NoticeCard tone="error" title="问题答复失败" description={error} variant={tone} className="mt-3" />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleReply()}
              disabled={!canSubmit || submitting !== null}
              aria-busy={submitting === 'reply'}
              className={cn(
                noticeActionClass,
                'border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover',
              )}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              提交回答
            </button>
            <button
              type="button"
              onClick={() => void handleReject()}
              disabled={submitting !== null}
              aria-busy={submitting === 'reject'}
              className={cn(
                noticeActionClass,
                'hover:border-danger/30 hover:text-danger',
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              暂不处理
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
