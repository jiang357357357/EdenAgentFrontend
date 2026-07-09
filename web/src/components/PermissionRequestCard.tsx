import { useId, useMemo, useState } from 'react';
import { Check, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { PendingPermission } from '../types';
import { cn } from '../lib/utils';

interface PermissionRequestCardProps {
  request: PendingPermission;
  onReply: (requestID: string, reply: 'once' | 'always' | 'reject', message?: string) => Promise<void>;
  tone?: 'default' | 'overlay';
}

function stringify(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function PermissionRequestCard({ request, onReply, tone = 'default' }: PermissionRequestCardProps) {
  const titleId = useId();
  const [submitting, setSubmitting] = useState<'once' | 'always' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAlwaysAllow = request.always.length > 0;
  const metadata = useMemo(() => {
    const entries = Object.entries(request.metadata ?? {});
    if (entries.length === 0) return '';
    return entries.map(([key, value]) => `${key}: ${stringify(value)}`).join('\n\n');
  }, [request.metadata]);
  const patternSummary = request.patterns.length > 0 ? request.patterns.join(', ') : '当前工具调用';
  const requestSummary = [
    `权限: ${request.permission}`,
    `范围: ${patternSummary}`,
    request.tool?.callID ? `工具调用: ${request.tool.callID}` : '',
    metadata ? `参数:\n${metadata}` : '',
    canAlwaysAllow ? `记住范围: ${request.always.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  async function handleReply(reply: 'once' | 'always' | 'reject') {
    setSubmitting(reply);
    setError(null);
    try {
      await onReply(request.id, reply);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      title={requestSummary}
      className={cn(
        'w-full max-w-full min-w-0 overflow-hidden rounded-lg border px-3 py-2',
        tone === 'overlay'
          ? 'border-orange-300/15 bg-stone-950/78 text-stone-100 shadow-none backdrop-blur-md'
          : 'border-amber-500/20 bg-card shadow-sm',
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border',
            tone === 'overlay'
              ? 'border-orange-300/20 bg-orange-300/10 text-orange-200'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-400',
          )}
        >
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn('flex-shrink-0 text-[10px] uppercase tracking-[0.15em]', tone === 'overlay' ? 'text-orange-200/80' : 'text-amber-400')}>权限请求</span>
          <span id={titleId} className={cn('min-w-0 truncate text-sm font-medium', tone === 'overlay' ? 'text-stone-50' : 'text-text')}>{request.permission}</span>
          <span
            className={cn(
              'hidden min-w-0 max-w-[46%] truncate rounded-md border px-2 py-1 text-[11px] sm:inline-block',
              tone === 'overlay'
                ? 'border-white/10 bg-white/5 text-stone-300'
                : 'border-border bg-bg text-text-muted',
            )}
          >
            {patternSummary}
          </span>
          {request.tool?.callID && (
            <span className={cn('hidden flex-shrink-0 text-[11px] md:inline', tone === 'overlay' ? 'text-stone-400' : 'text-text-muted')}>
              {request.tool.callID}
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleReply('once')}
            disabled={submitting !== null}
            aria-busy={submitting === 'once'}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors',
              tone === 'overlay'
                ? 'border-orange-300/35 bg-orange-300/15 text-orange-100 hover:border-orange-300/50 hover:bg-orange-300/20'
                : 'border-accent bg-accent text-white hover:border-amber-700 hover:bg-amber-700',
              'disabled:cursor-wait disabled:opacity-60',
            )}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {submitting === 'once' ? '处理中' : '本次允许'}
          </button>
          {canAlwaysAllow && (
            <button
              type="button"
              onClick={() => void handleReply('always')}
              disabled={submitting !== null}
              aria-busy={submitting === 'always'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs transition-colors',
                tone === 'overlay'
                  ? 'border-white/10 bg-white/5 text-stone-100 hover:border-orange-300/30 hover:bg-orange-300/10'
                  : 'border-border bg-bg text-text hover:border-accent/40 hover:text-accent',
                'disabled:cursor-wait disabled:opacity-60',
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {submitting === 'always' ? '处理中' : '始终允许'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleReply('reject')}
            disabled={submitting !== null}
            aria-busy={submitting === 'reject'}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs transition-colors',
              'border-red-500/25 bg-red-500/10 text-red-300 hover:border-red-500/40 disabled:cursor-wait disabled:opacity-60',
            )}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {submitting === 'reject' ? '处理中' : '拒绝'}
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
