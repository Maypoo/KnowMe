export const spring = {
  default: { type: 'spring', bounce: 0, duration: 0.4 },
  snappy: { type: 'spring', bounce: 0, duration: 0.3 },
  gentle: { type: 'spring', bounce: 0, duration: 0.5 },
  momentum: { type: 'spring', bounce: 0.2, duration: 0.4 },
  drawer: { type: 'spring', bounce: 0.2, duration: 0.4 },
  bouncy: { type: 'spring', bounce: 0.35, duration: 0.6 },
}

export const ease = {
  standard: [0.4, 0, 0.2, 1],
  entrance: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
  appleOut: [0.16, 1, 0.3, 1],
  appleInOut: [0.4, 0, 0.2, 1],
}

export function project(initialVelocity, decelerationRate = 0.998) {
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate)
}

export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

export const tap = {
  scale: 0.97,
  transition: { duration: 0.1, ease: 'easeOut' },
}

export const press = {
  whileTap: { scale: 0.97 },
  transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
}
