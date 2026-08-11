import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, FileCode2, Layers3, Minimize2, RotateCcw, ScanSearch } from 'lucide-react';
import type { MetaPartCard as MetaPartCardData } from '../../../types';
import { cn } from '../../../lib/utils';
import { MarkdownContent } from './MarkdownContent';

interface MetaPartCardProps {
  part: MetaPartCardData;
}

function iconForType(type: string) {
  switch (type) {
    case 'patch':
      return <FileCode2 className="h-4 w-4" />;
    case 'retry':
      return <RotateCcw className="h-4 w-4" />;
    case 'snapshot':
    case 'compaction':
      return <ScanSearch className="h-4 w-4" />;
    default:
      return <Layers3 className="h-4 w-4" />;
  }
}

function toneClass(tone: MetaPartCardData['tone']) {
  switch (tone) {
    case 'accent':
      return 'border-accent/25 text-accent';
    case 'warning':
      return 'border-amber-500/30 text-amber-400';
    case 'muted':
      return 'border-border text-text-muted';
    default:
      return 'border-border text-text';
  }
}

export function MetaPartCard({ part }: MetaPartCardProps) {
  const [expanded, setExpanded] = useState(part.tone === 'warning');
  const isCompaction = part.type === 'compaction';
  const before = part.contextTokensBefore;
  const after = part.contextTokensAfter;
  const saved = typeof before === 'number' && typeof after === 'number' ? Math.max(0, before - after) : undefined;
  const reduction = saved !== undefined && before ? Math.round((saved / before) * 100) : undefined;

  if (isCompaction) {
    return (
      <section className="mx-auto my-[1.25vh] w-[84%] min-w-[36vh] max-w-[88vh] overflow-hidden rounded-[1.1vh] border border-border/80 bg-card/70 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="group flex min-h-[5.7vh] w-full items-center gap-[0.85vh] px-[1.15vh] py-[0.75vh] text-left transition-colors hover:bg-accent/[0.035]"
        >
          <span className="flex h-[3.2vh] w-[3.2vh] shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Minimize2 className="h-[1.7vh] w-[1.7vh]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-[0.65vh]">
              <span className="shrink-0 font-serif text-[1.6vh] text-text">{part.title}</span>
              <span className="shrink-0 rounded-full border border-accent/20 bg-accent/[0.06] px-[0.65vh] py-[0.08vh] text-[1.02vh] font-medium tracking-[0.1em] text-accent">
                压缩
              </span>
              {before !== undefined && after !== undefined ? (
                <span className="ml-auto shrink-0 text-[1.2vh] tabular-nums text-text-muted/70">
                  {before.toLocaleString()} → <span className="text-text-muted">{after.toLocaleString()}</span>
                </span>
              ) : null}
            </span>
            <span className="mt-[0.25vh] flex min-w-0 items-center gap-[0.55vh] text-[1.28vh] text-text-muted">
              <span className="truncate">{part.summary}</span>
              {reduction !== undefined ? <span className="shrink-0 text-accent/80">减少 {reduction}%</span> : null}
            </span>
          </span>
          <span className="flex h-[2.4vh] w-[2.4vh] shrink-0 items-center justify-center rounded-full text-text-muted/65 transition-colors group-hover:bg-bg group-hover:text-text">
            {expanded ? <ChevronDown className="h-[1.45vh] w-[1.45vh]" /> : <ChevronRight className="h-[1.45vh] w-[1.45vh]" />}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="min-w-0 border-t border-border/70 bg-bg/45 px-[1.45vh] py-[1.2vh]">
                <div className="mb-[0.8vh] flex items-center gap-[0.7vh] text-[1.12vh] font-medium tracking-[0.12em] text-text-muted">
                  <span>压缩摘要</span>
                  {after !== undefined ? <span className="ml-auto font-normal tracking-normal text-text-muted/60">当前上下文 {after.toLocaleString()} tokens</span> : null}
                </div>
                {part.detail ? (
                  <div className="min-w-0 max-h-[42vh] overflow-x-hidden overflow-y-auto pr-[0.6vh] text-[1.38vh] leading-[1.65] text-text [overflow-wrap:anywhere] [&_*]:max-w-full">
                    <MarkdownContent content={part.detail} />
                  </div>
                ) : (
                  <p className="text-[1.3vh] text-text-muted">这条旧记录没有保存可展示的摘要内容。</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    );
  }

  return (
    <div className="my-2 max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-white/5"
      >
        <span className={cn('mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border bg-bg', toneClass(part.tone))}>
          {iconForType(part.type)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-serif text-sm text-text">{part.title}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-text-muted">
              {part.type}
            </span>
          </div>
          {part.summary && <div className="mt-1 text-xs leading-relaxed text-text-muted">{part.summary}</div>}
        </div>
        <span className="mt-0.5 flex-shrink-0 text-text-muted">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && part.detail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border bg-bg px-3 py-3">
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-text-muted">{part.detail}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
