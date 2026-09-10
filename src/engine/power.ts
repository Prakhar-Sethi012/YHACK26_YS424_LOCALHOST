export interface PowerModelInputs {
  mass: number;
  slopeRadians: number;
  velocity: number;
  acceleration: number;
  rollingResistance: number;
  dragCoefficient: number;
  frontalArea: number;
  airDensity: number;
  avionicsWatts: number;
}

const GRAVITY = 9.81;

export function instantaneousPowerDraw(inputs: PowerModelInputs): number {
  const {
    mass,
    slopeRadians,
    velocity,
    acceleration,
    rollingResistance,
    dragCoefficient,
    frontalArea,
    airDensity,
    avionicsWatts,
  } = inputs;

  const gravityComponent = mass * GRAVITY * Math.sin(slopeRadians);
  const rollingComponent = mass * GRAVITY * rollingResistance * Math.cos(slopeRadians);
  const dragComponent = 0.5 * airDensity * dragCoefficient * frontalArea * velocity ** 2;
  const inertialComponent = mass * acceleration;

  const tractiveForcePower =
    (gravityComponent + rollingComponent + dragComponent + inertialComponent) * velocity;

  return avionicsWatts + tractiveForcePower;
}
