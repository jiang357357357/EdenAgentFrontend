/** 页面立即挂载并统一淡入，避免整页模糊或等待旧页退场。 */
export const pageEnterMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
} as const
