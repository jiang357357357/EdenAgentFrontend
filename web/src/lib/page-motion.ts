/** Mount the destination immediately; avoid filtering an entire page of translucent surfaces. */
export const pageEnterMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.14, ease: [0.16, 1, 0.3, 1] },
} as const
