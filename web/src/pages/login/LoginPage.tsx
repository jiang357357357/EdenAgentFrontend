import { useState } from 'react';
import { KeyRound, Loader, LockKeyhole, UserRound } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  isSubmitting?: boolean;
  error?: string;
}

export function LoginPage({ onLogin, isSubmitting = false, error }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onLogin(username.trim(), password);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="relative flex h-[100vh] w-[100vw] items-center justify-center overflow-hidden bg-bg p-[3.2vh] text-text"
    >
      <div className="pointer-events-none fixed inset-0 opacity-[0.38] [background-image:linear-gradient(color-mix(in_srgb,var(--color-scrim)_13%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--color-scrim)_10%,transparent)_1px,transparent_1px)] [background-size:3vw_3vw]" />

      <main className="relative w-[min(92vw,52vh)] overflow-hidden rounded-[2.4vh] border border-border bg-card/95 shadow-[0_3vh_8vh_color-mix(in_srgb,var(--color-scrim)_12%,transparent)] backdrop-blur">
        <div className="absolute inset-x-0 top-0 h-[0.55vh] bg-accent" />

        <section className="flex min-h-[58vh] items-center px-[4vh] py-[5vh]">
          <div className="w-full">
            <div className="mb-[4vh]">
              <div className="mb-[2vh] flex h-[7vh] w-[7vh] items-center justify-center rounded-[1.7vh] border border-accent/20 bg-accent/10 text-accent">
                <KeyRound className="h-[3.1vh] w-[3.1vh]" />
              </div>
              <h2 className="font-serif text-[5.2vh] leading-none text-text">身份验证</h2>
              <p className="mt-[1.6vh] text-[2.25vh] text-text-muted">使用 Core 账号登录</p>
            </div>

            <form className="space-y-[2.5vh]" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-[1vh] block text-[2.1vh] text-text-muted">用户名</span>
                <div className="flex h-[8.5vh] items-center gap-[1.4vh] rounded-[1.7vh] border border-border bg-card/92 px-[2vh] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-highlight)_5%,transparent)] transition-colors focus-within:border-accent/50">
                  <UserRound className="h-[2.6vh] w-[2.6vh] text-text-muted" />
                  <input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="请输入用户名"
                    autoComplete="username"
                    disabled={isSubmitting}
                    className="w-full bg-transparent text-[2.35vh] text-text outline-none placeholder:text-text-muted"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-[1vh] block text-[2.1vh] text-text-muted">密码</span>
                <div className="flex h-[8.5vh] items-center gap-[1.4vh] rounded-[1.7vh] border border-border bg-card/92 px-[2vh] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-highlight)_5%,transparent)] transition-colors focus-within:border-accent/50">
                  <LockKeyhole className="h-[2.6vh] w-[2.6vh] text-text-muted" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="w-full bg-transparent text-[2.35vh] text-text outline-none placeholder:text-text-muted"
                  />
                </div>
              </label>

              {error ? (
                <div className="rounded-[1.7vh] border border-danger/30 bg-danger-dim px-[1.5vw] py-[1.8vh] text-[2.1vh] text-danger">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-[8.5vh] w-full items-center justify-center gap-[1.2vh] rounded-[1.7vh] border border-accent bg-accent px-[2vh] text-[2.25vh] font-medium text-on-accent shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader className="h-[2.7vh] w-[2.7vh] animate-spin" /> : null}
                {isSubmitting ? '登录中...' : '登录'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </motion.div>
  );
}
