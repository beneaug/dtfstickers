export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
  precision: number;
}

export interface SpringState {
  value: number;
  velocity: number;
}

const SUB_STEPS = 4;

export function stepSpring(
  state: SpringState,
  target: number,
  config: SpringConfig,
  dt: number,
): { value: number; velocity: number; atRest: boolean } {
  let { value, velocity } = state;
  const subDt = dt / SUB_STEPS;

  for (let i = 0; i < SUB_STEPS; i++) {
    const displacement = value - target;
    const acceleration =
      (-config.stiffness * displacement - config.damping * velocity) /
      config.mass;
    velocity += acceleration * subDt;
    value += velocity * subDt;
  }

  const displacement = value - target;
  const atRest =
    Math.abs(displacement) < config.precision &&
    Math.abs(velocity) < config.precision * 10;

  if (atRest) {
    value = target;
    velocity = 0;
  }

  return { value, velocity, atRest };
}

export const SPRING_SNAP_BACK: SpringConfig = {
  stiffness: 180,
  damping: 14,
  mass: 1,
  precision: 0.001,
};

export const SPRING_SNAP_FORWARD: SpringConfig = {
  stiffness: 300,
  damping: 18,
  mass: 1,
  precision: 0.001,
};

export const SPRING_POSITION: SpringConfig = {
  stiffness: 220,
  damping: 22,
  mass: 1,
  precision: 0.5,
};
