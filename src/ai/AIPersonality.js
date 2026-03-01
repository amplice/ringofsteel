export const AI_PRESETS = {
  easy: {
    reactionFrames: 30,    // 500ms
    decisionNoise: 0.4,    // High randomness
    aggression: 0.3,       // Passive
    parryRate: 0.05,       // Rarely attempts parry
    dodgeRate: 0.1,
    stanceChangeRate: 0.05,
  },
  medium: {
    reactionFrames: 15,    // 250ms
    decisionNoise: 0.2,
    aggression: 0.5,
    parryRate: 0.15,
    dodgeRate: 0.2,
    stanceChangeRate: 0.1,
  },
  hard: {
    reactionFrames: 6,     // 100ms
    decisionNoise: 0.08,
    aggression: 0.7,
    parryRate: 0.35,
    dodgeRate: 0.3,
    stanceChangeRate: 0.2,
  },
};
