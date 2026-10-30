import { motion } from 'motion/react'
import { LoginForm, type LoginFormProps } from './LoginForm'
import { StartupOpening } from '../startup/StartupOpening'
import { useStartupOpeningReplay } from '../startup/useStartupOpeningReplay'

export function LoginPage(props: LoginFormProps) {
  const { opening, visible, sequence, complete } = useStartupOpeningReplay(false)
  return <div className="relative min-h-screen">
    <motion.div inert={opening} aria-hidden={opening} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
    className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto bg-bg p-6 text-text">
    <div className="pointer-events-none fixed inset-0 opacity-[0.38] [background-image:linear-gradient(color-mix(in_srgb,var(--color-scrim)_13%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--color-scrim)_10%,transparent)_1px,transparent_1px)] [background-size:3vw_3vw]" />
    <main className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card/95 p-7 shadow-xl backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1 bg-accent" />
      <LoginForm {...props} />
    </main>
    </motion.div>
    {opening ? <StartupOpening key={sequence} ready active={visible} onComplete={complete} /> : null}
  </div>
}
