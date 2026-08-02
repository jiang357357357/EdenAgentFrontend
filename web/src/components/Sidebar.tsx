import { Menu, LogOut, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Session } from '../types';
import type { AuthUser } from '../lib/auth';

interface SidebarProps {
  sessions: Session[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void> | void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  currentUser?: AuthUser | null;
  onLogout: () => void;
}

export function Sidebar({ 
  sessions, 
  activeId, 
  onSelect,
  onDelete,
  isOpen, 
  setIsOpen,
  currentUser,
  onLogout,
}: SidebarProps) {
  
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-30 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[28vw] transform flex-col border-r border-border bg-bg shadow-2xl transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        
        {/* Header / New Chat */}
        <div className="flex items-center justify-between px-[2vw] py-[3.2vh]">
            <div className="flex items-center gap-[1.2vw] font-serif text-[3.2vh] tracking-[0.1em] text-text">
                <span className="flex h-[7.5vh] w-[4.2vw] items-center justify-center rounded-[0.8vh] border border-accent bg-card text-[2.2vh] text-accent">M</span>
                MonAgent
            </div>
          <div className="flex items-center gap-[0.45vw]">
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-[0.9vh] p-[1.25vh] text-text-muted transition-colors hover:bg-card"
              aria-label="收起侧栏"
              title="收起侧栏"
            >
              <Menu className="h-[3vh] w-[3vh]" />
            </button>
          </div>
        </div>
        
        {/* Session List */}
        <div className="flex-1 space-y-[3vh] overflow-y-auto px-[2vw] py-[1vh]">
           <div>
              <span className="mb-[2vh] block text-[1.55vh] uppercase tracking-[0.2em] text-text-muted">会话记录</span>
              <ul className="space-y-[0.8vh]">
                {sessions.map(session => (
                    <li key={session.id} className="group relative focus-within:z-10">
                        <button
                          onClick={() => onSelect(session.id)}
                          className={cn(
                              "flex w-full items-center gap-[1vw] truncate rounded-[0.8vh] py-[1.8vh] pl-[1vw] pr-[4vw] text-left text-[2.25vh] transition-colors",
                              activeId === session.id 
                                ? "bg-card text-text border border-transparent border-l-accent" 
                                : "text-text-muted hover:bg-card hover:text-text border border-transparent border-l-transparent"
                          )}
                        >
                            <span className="truncate">{session.title}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            if (!window.confirm(`永久删除会话“${session.title}”？删除后无法恢复。`)) return
                            void onDelete(session.id)
                          }}
                          className="absolute right-[0.65vw] top-1/2 flex h-[3.6vh] w-[3.6vh] -translate-y-1/2 items-center justify-center rounded-[0.55vh] text-text-muted opacity-0 transition hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 group-hover:opacity-100 group-focus-within:opacity-100"
                          aria-label={`永久删除会话：${session.title}`}
                          title="永久删除会话"
                        >
                          <Trash2 className="h-[2.1vh] w-[2.1vh]" />
                        </button>
                    </li>
                ))}
              </ul>
           </div>
        </div>

        <div className="border-t border-border px-[2vw] py-[2.2vh]">
          <div className="mb-[2vh] min-w-0">
            <div className="truncate text-[2.2vh] text-text">{currentUser?.username ?? '未登录'}</div>
            <div className="text-[1.45vh] uppercase tracking-[0.16em] text-text-muted">
              {currentUser?.is_superuser ? 'Core Admin' : currentUser?.is_staff ? 'Core Staff' : 'Core User'}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-[0.8vw] rounded-full border border-border bg-card px-[1vw] py-[1.65vh] text-[1.85vh] uppercase tracking-[0.15em] text-text-muted transition-colors hover:border-accent/40 hover:text-accent"
          >
            <LogOut className="h-[2.5vh] w-[2.5vh]" />
            退出登录
          </button>
        </div>

      </aside>
    </>
  );
}
