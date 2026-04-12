import fs from 'node:fs';
import path from 'node:path';
import { NeuralPolicy } from '../src/ai/neural/NeuralPolicy.js';
import { NEURAL_OBSERVATION_SIZE } from '../src/ai/neural/NeuralObservation.js';
import { NEURAL_ACTIONS } from '../src/ai/neural/NeuralPolicyController.js';
import { NeuralArena } from '../src/ai/neural/NeuralArena.js';
import { FIGHT_START_DISTANCE } from '../src/core/Constants.js';

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawValue] = arg.slice(2).split('=');
    options[rawKey] = rawValue ?? true;
  }
  return options;
}

function numberOption(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRoundSetupFactory(config, seedKey, stochastic) {
  if ((config.startDistanceJitter ?? 0) <= 0 && (config.startLateralJitter ?? 0) <= 0) return null;

  const baseSeed = hashString(`${config.char}|${seedKey}`);
  const salt = stochastic ? Math.floor(Math.random() * 0xFFFFFFFF) : 0;
  return (roundIndex = 0) => {
    const rng = mulberry32((baseSeed + salt + Math.imul(roundIndex + 1, 0x9E3779B1)) >>> 0);
    const distanceDelta = (rng() * 2 - 1) * config.startDistanceJitter;
    const lateralOffset = (rng() * 2 - 1) * config.startLateralJitter;
    return {
      startDistance: clamp(FIGHT_START_DISTANCE + distanceDelta, 1.4, FIGHT_START_DISTANCE + 1.5),
      lateralOffset,
    };
  };
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const DEFAULT_CURRICULA = Object.freeze({
  spearman: Object.freeze([
    { opponentChar: 'ronin', opponentProfile: 'ronin_duelist', weight: 1.2 },
    { opponentChar: 'ronin', opponentProfile: 'ronin_evasive', weight: 1 },
    { opponentChar: 'knight', opponentProfile: 'knight_sentinel', weight: 1.2 },
    { opponentChar: 'knight', opponentProfile: 'knight_bulwark', weight: 1 },
    { opponentChar: 'spearman', opponentProfile: 'spearman_heavy_bully', weight: 1.35 },
    { opponentChar: 'spearman', opponentProfile: 'spearman_evasive', weight: 1 },
  ]),
  ronin: Object.freeze([
    { opponentChar: 'spearman', opponentProfile: 'spearman_heavy_bully', weight: 1.8 },
    { opponentChar: 'spearman', opponentProfile: 'spearman_evasive', weight: 1.15 },
    { opponentChar: 'knight', opponentProfile: 'knight_sentinel', weight: 0.8 },
    { opponentChar: 'knight', opponentProfile: 'knight_bulwark', weight: 1 },
    { opponentChar: 'ronin', opponentProfile: 'ronin_duelist', weight: 1.8 },
    { opponentChar: 'ronin', opponentProfile: 'ronin_evasive', weight: 1.2 },
  ]),
  knight: Object.freeze([
    { opponentChar: 'spearman', opponentProfile: 'spearman_heavy_bully', weight: 1.35 },
    { opponentChar: 'spearman', opponentProfile: 'spearman_evasive', weight: 1 },
    { opponentChar: 'ronin', opponentProfile: 'ronin_duelist', weight: 1.15 },
    { opponentChar: 'ronin', opponentProfile: 'ronin_evasive', weight: 1.15 },
    { opponentChar: 'knight', opponentProfile: 'knight_sentinel', weight: 1.3 },
    { opponentChar: 'knight', opponentProfile: 'knight_bulwark', weight: 1 },
  ]),
});

const DEFAULT_REGULARIZER_BY_CHAR = Object.freeze({
  spearman: Object.freeze({
    actionDiversityWeight: 18,
    actionDominanceThreshold: 0.72,
    actionDominancePenalty: 32,
  }),
  ronin: Object.freeze({
    actionDiversityWeight: 8,
    actionDominanceThreshold: 0.84,
    actionDominancePenalty: 14,
  }),
  knight: Object.freeze({
    actionDiversityWeight: 14,
    actionDominanceThreshold: 0.76,
    actionDominancePenalty: 24,
  }),
});

function defaultOpponentSchedule(policyChar) {
  return DEFAULT_CURRICULA[policyChar] ?? DEFAULT_CURRICULA.ronin;
}

function defaultRegularizerConfig(policyChar) {
  return DEFAULT_REGULARIZER_BY_CHAR[policyChar] ?? DEFAULT_REGULARIZER_BY_CHAR.ronin;
}

function parseOpponentSchedule(raw, policyChar) {
  if (!raw) return defaultOpponentSchedule(policyChar);
  return raw.split(',').map((entry) => {
    const [opponentChar, opponentProfile, rawWeight] = entry.split(':');
    const weight = Number(rawWeight);
    return { opponentChar, opponentProfile, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 };
  }).filter((entry) => entry.opponentChar && entry.opponentProfile);
}

function parseNeuralOpponents(raw) {
  if (!raw) return [];
  return raw.split(',').map((entry) => {
    const [opponentChar, modelPath, rawWeight, rawLabel] = entry.split('|');
    const weight = Number(rawWeight);
    if (!opponentChar || !modelPath) return null;
    const payload = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    return {
      opponentChar,
      modelPath,
      label: rawLabel || `${opponentChar}_neural`,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      policy: NeuralPolicy.fromJSON(payload),
    };
  }).filter(Boolean);
}

function getScriptedPhaseWeight(generation, config) {
  if (generation < config.selfPlayWarmupGenerations) return 0;
  const rampProgress = clamp(
    (generation - config.selfPlayWarmupGenerations + 1) / Math.max(config.scriptedRampGenerations, 1),
    0,
    1,
  );
  return rampProgress * config.scriptedWeight;
}

function getOpponentWeight(opponent) {
  return Number.isFinite(opponent?.weight) && opponent.weight > 0 ? opponent.weight : 1;
}

function mergeActionCounts(target, source = {}) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

function createActionStatsAccumulator() {
  return {
    actionSelections: {},
    decisionCount: 0,
  };
}

function ingestPolicyStats(accumulator, policyStats) {
  if (!policyStats) return;
  accumulator.decisionCount += policyStats.decisionCount || 0;
  mergeActionCounts(accumulator.actionSelections, policyStats.actionSelections);
}

function computeActionRegularizer(accumulator, config) {
  const actionEntries = Object.entries(accumulator.actionSelections)
    .filter(([action]) => action !== 'idle');
  const total = actionEntries.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0) return { bonus: 0, entropy: 0, maxShare: 1 };

  const probabilities = actionEntries
    .map(([, count]) => count / total)
    .filter((value) => value > 0);
  const entropy = probabilities.reduce((sum, p) => sum - (p * Math.log(p)), 0);
  const maxEntropy = Math.log(actionEntries.length || 1) || 1;
  const normalizedEntropy = clamp(entropy / maxEntropy, 0, 1);
  const maxShare = Math.max(...probabilities);
  const diversityBonus = normalizedEntropy * config.actionDiversityWeight;
  const dominancePenalty = Math.max(0, maxShare - config.actionDominanceThreshold) * config.actionDominancePenalty;
  return {
    bonus: diversityBonus - dominancePenalty,
    entropy: normalizedEntropy,
    maxShare,
  };
}

function evaluateScriptedMatch(arena, candidate, config, opponent, policySide, stochastic, seedKey) {
  return arena.runMatch({
    policy: candidate,
    policyChar: config.char,
    opponentChar: opponent.opponentChar,
    opponentProfile: opponent.opponentProfile,
    policySide,
    roundsToWin: config.roundsToWin,
    maxRoundFrames: config.maxRoundFrames,
    maxMatchRounds: config.maxMatchRounds,
    temperature: stochastic ? config.temperature : config.validationTemperature,
    stochastic,
    roundSetup: createRoundSetupFactory(config, seedKey, stochastic),
  });
}

function evaluateSelfPlayMatch(arena, candidate, config, championPolicy, perspectiveSide, stochastic, seedKey) {
  return perspectiveSide === 1
    ? arena.runSelfPlay({
        policyA: candidate,
        charA: config.char,
        policyB: championPolicy,
        charB: config.char,
        perspectiveSide,
        roundsToWin: config.roundsToWin,
        maxRoundFrames: config.maxRoundFrames,
        maxMatchRounds: config.maxMatchRounds,
        temperature: stochastic ? config.temperature : config.validationTemperature,
        stochastic,
        roundSetup: createRoundSetupFactory(config, seedKey, stochastic),
      })
    : arena.runSelfPlay({
        policyA: championPolicy,
        charA: config.char,
        policyB: candidate,
        charB: config.char,
        perspectiveSide,
        roundsToWin: config.roundsToWin,
        maxRoundFrames: config.maxRoundFrames,
        maxMatchRounds: config.maxMatchRounds,
        temperature: stochastic ? config.temperature : config.validationTemperature,
        stochastic,
        roundSetup: createRoundSetupFactory(config, seedKey, stochastic),
      });
}

function evaluateNeuralOpponentMatch(arena, candidate, config, opponent, perspectiveSide, stochastic, seedKey) {
  return perspectiveSide === 1
    ? arena.runSelfPlay({
        policyA: candidate,
        charA: config.char,
        policyB: opponent.policy,
        charB: opponent.opponentChar,
        perspectiveSide,
        roundsToWin: config.roundsToWin,
        maxRoundFrames: config.maxRoundFrames,
        maxMatchRounds: config.maxMatchRounds,
        temperature: stochastic ? config.temperature : config.validationTemperature,
        stochastic,
        roundSetup: createRoundSetupFactory(config, seedKey, stochastic),
      })
    : arena.runSelfPlay({
        policyA: opponent.policy,
        charA: opponent.opponentChar,
        policyB: candidate,
        charB: config.char,
        perspectiveSide,
        roundsToWin: config.roundsToWin,
        maxRoundFrames: config.maxRoundFrames,
        maxMatchRounds: config.maxMatchRounds,
        temperature: stochastic ? config.temperature : config.validationTemperature,
        stochastic,
        roundSetup: createRoundSetupFactory(config, seedKey, stochastic),
      });
}

function evaluateCandidate(arena, candidate, config, hallOfFame, generation) {
  let score = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const details = [];
  const actionStats = createActionStatsAccumulator();
  const scriptedPhaseWeight = getScriptedPhaseWeight(generation, config);

  if (scriptedPhaseWeight > 0) {
    for (const opponent of config.opponents) {
      const opponentWeight = getOpponentWeight(opponent);
      for (let repeat = 0; repeat < config.repeatsPerOpponent; repeat++) {
        for (const policySide of [1, 2]) {
          const match = evaluateScriptedMatch(
            arena,
            candidate,
            config,
            opponent,
            policySide,
            true,
            `${opponent.opponentChar}:${opponent.opponentProfile}:stochastic:${policySide}:${repeat}:${generation}`,
          );
          const matchScore = match.reward ?? 0;
          ingestPolicyStats(actionStats, match.policyStats);
          score += matchScore * scriptedPhaseWeight * opponentWeight;
          if (match.policyWinner === 1) wins++;
          else if (match.policyWinner === 2) losses++;
          else draws++;
          details.push({
            ...opponent,
            policySide,
            matchScore,
            weightedMatchScore: matchScore * scriptedPhaseWeight * opponentWeight,
            winner: match.policyWinner,
            policyScore: policySide === 1 ? match.p1Score : match.p2Score,
            opponentScore: policySide === 1 ? match.p2Score : match.p1Score,
          });
        }
      }
    }

    for (const opponent of config.neuralOpponents) {
      const opponentWeight = getOpponentWeight(opponent);
      for (let repeat = 0; repeat < config.repeatsPerOpponent; repeat++) {
        for (const perspectiveSide of [1, 2]) {
          const match = evaluateNeuralOpponentMatch(
            arena,
            candidate,
            config,
            opponent,
            perspectiveSide,
            true,
            `${opponent.label}:neural-stochastic:${perspectiveSide}:${repeat}:${generation}`,
          );
          const matchScore = match.reward ?? 0;
          ingestPolicyStats(actionStats, match.policyStats);
          score += matchScore * scriptedPhaseWeight * opponentWeight;
          if (match.policyWinner === 1) wins++;
          else if (match.policyWinner === 2) losses++;
          else draws++;
          details.push({
            opponentChar: opponent.opponentChar,
            opponentProfile: opponent.label,
            perspectiveSide,
            matchScore,
            weightedMatchScore: matchScore * scriptedPhaseWeight * opponentWeight,
            winner: match.policyWinner,
            policyScore: perspectiveSide === 1 ? match.p1Score : match.p2Score,
            opponentScore: perspectiveSide === 1 ? match.p2Score : match.p1Score,
            neuralOpponent: true,
          });
        }
      }
    }
  }

  const selfPlayOpponents = hallOfFame.slice(-Math.max(config.hallOfFameCount, 1));
  for (const champion of selfPlayOpponents) {
    for (const perspectiveSide of [1, 2]) {
      const match = evaluateSelfPlayMatch(
        arena,
        candidate,
        config,
        champion.policy,
        perspectiveSide,
        true,
        `${champion.label}:selfplay-stochastic:${perspectiveSide}:${generation}`,
      );
      const matchScore = match.reward ?? 0;
      ingestPolicyStats(actionStats, match.policyStats);
      score += matchScore * config.selfPlayWeight;
      if (match.policyWinner === 1) wins++;
      else if (match.policyWinner === 2) losses++;
      else draws++;
      details.push({
        opponentChar: config.char,
        opponentProfile: champion.label,
        perspectiveSide,
        matchScore,
        winner: match.policyWinner,
        policyScore: perspectiveSide === 1 ? match.p1Score : match.p2Score,
        opponentScore: perspectiveSide === 1 ? match.p2Score : match.p1Score,
        selfPlay: true,
      });
    }
  }

  if (config.deterministicEvalWeight > 0) {
    for (const opponent of config.opponents) {
      const opponentWeight = getOpponentWeight(opponent);
      for (const policySide of [1, 2]) {
        const match = evaluateScriptedMatch(
          arena,
          candidate,
          config,
          opponent,
          policySide,
          false,
          `${opponent.opponentChar}:${opponent.opponentProfile}:deterministic:${policySide}`,
        );
        const matchScore = match.reward ?? 0;
        ingestPolicyStats(actionStats, match.policyStats);
        score += matchScore * scriptedPhaseWeight * opponentWeight * config.deterministicEvalWeight;
        details.push({
          ...opponent,
          policySide,
          matchScore,
          weightedMatchScore: matchScore * scriptedPhaseWeight * opponentWeight * config.deterministicEvalWeight,
          winner: match.policyWinner,
          policyScore: policySide === 1 ? match.p1Score : match.p2Score,
          opponentScore: policySide === 1 ? match.p2Score : match.p1Score,
          deterministicValidation: true,
        });
      }
    }

    for (const opponent of config.neuralOpponents) {
      const opponentWeight = getOpponentWeight(opponent);
      for (const perspectiveSide of [1, 2]) {
        const match = evaluateNeuralOpponentMatch(
          arena,
          candidate,
          config,
          opponent,
          perspectiveSide,
          false,
          `${opponent.label}:neural-deterministic:${perspectiveSide}`,
        );
        const matchScore = match.reward ?? 0;
        ingestPolicyStats(actionStats, match.policyStats);
        score += matchScore * scriptedPhaseWeight * opponentWeight * config.deterministicEvalWeight;
        details.push({
          opponentChar: opponent.opponentChar,
          opponentProfile: opponent.label,
          perspectiveSide,
          matchScore,
          weightedMatchScore: matchScore * scriptedPhaseWeight * opponentWeight * config.deterministicEvalWeight,
          winner: match.policyWinner,
          policyScore: perspectiveSide === 1 ? match.p1Score : match.p2Score,
          opponentScore: perspectiveSide === 1 ? match.p2Score : match.p1Score,
          neuralOpponent: true,
          deterministicValidation: true,
        });
      }
    }

    for (const champion of selfPlayOpponents) {
      for (const perspectiveSide of [1, 2]) {
        const match = evaluateSelfPlayMatch(
          arena,
          candidate,
          config,
          champion.policy,
          perspectiveSide,
          false,
          `${champion.label}:selfplay-deterministic:${perspectiveSide}`,
        );
        const matchScore = match.reward ?? 0;
        ingestPolicyStats(actionStats, match.policyStats);
        score += matchScore * config.selfPlayWeight * config.deterministicEvalWeight;
        details.push({
          opponentChar: config.char,
          opponentProfile: champion.label,
          perspectiveSide,
          matchScore,
          winner: match.policyWinner,
          policyScore: perspectiveSide === 1 ? match.p1Score : match.p2Score,
          opponentScore: perspectiveSide === 1 ? match.p2Score : match.p1Score,
          selfPlay: true,
          deterministicValidation: true,
        });
      }
    }
  }

  const regularizer = computeActionRegularizer(actionStats, config);
  score += regularizer.bonus;

  return { score, wins, losses, draws, details, regularizer, actionStats };
}

const args = parseArgs(process.argv.slice(2));
const config = {
  char: args.char || 'ronin',
  generations: numberOption(args.generations, 4),
  population: numberOption(args.population, 10),
  survivors: numberOption(args.survivors, 3),
  repeatsPerOpponent: numberOption(args.repeats, 2),
  roundsToWin: numberOption(args.rounds, 3),
  maxRoundFrames: numberOption(args.maxRoundFrames, 60 * 18),
  maxMatchRounds: numberOption(args.maxMatchRounds, 7),
  temperature: numberOption(args.temperature, 0.75),
  hallOfFameCount: numberOption(args.hallOfFame, 3),
  selfPlayWeight: numberOption(args.selfPlayWeight, 1),
  scriptedWeight: numberOption(args.scriptedWeight, 1),
  deterministicEvalWeight: numberOption(args.deterministicEvalWeight, 0.35),
  validationTemperature: numberOption(args.validationTemperature, 0.15),
  startDistanceJitter: numberOption(args.startDistanceJitter, 0.45),
  startLateralJitter: numberOption(args.startLateralJitter, 0.55),
  actionDiversityWeight: 0,
  actionDominanceThreshold: 0,
  actionDominancePenalty: 0,
  selfPlayWarmupGenerations: 0,
  scriptedRampGenerations: 0,
  output: args.output || `.local/neural/${Date.now()}-${args.char || 'ronin'}-policy.json`,
  opponents: parseOpponentSchedule(args.opponents, args.char || 'ronin'),
  neuralOpponents: parseNeuralOpponents(args.neuralOpponents),
};
const regularizerDefaults = defaultRegularizerConfig(config.char);
config.actionDiversityWeight = numberOption(args.actionDiversityWeight, regularizerDefaults.actionDiversityWeight);
config.actionDominanceThreshold = numberOption(args.actionDominanceThreshold, regularizerDefaults.actionDominanceThreshold);
config.actionDominancePenalty = numberOption(args.actionDominancePenalty, regularizerDefaults.actionDominancePenalty);
config.selfPlayWarmupGenerations = numberOption(
  args.selfPlayWarmup,
  Math.max(4, Math.floor(config.generations * 0.25)),
);
config.scriptedRampGenerations = numberOption(
  args.scriptedRamp,
  Math.max(2, Math.floor(config.generations * 0.2)),
);

const arena = new NeuralArena();
const hiddenSizes = (args.hidden || '48,32').split(',').map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
let elite = args.seed
  ? NeuralPolicy.fromJSON(JSON.parse(fs.readFileSync(args.seed, 'utf8')))
  : NeuralPolicy.random({
      inputSize: NEURAL_OBSERVATION_SIZE,
      hiddenSizes,
      outputSize: NEURAL_ACTIONS.length,
      metadata: { char: config.char, createdAt: new Date().toISOString() },
    });

const hallOfFame = [{ label: 'seed_elite', policy: elite.clone({ ...elite.metadata, label: 'seed_elite' }) }];
const history = [];
let bestOverallScore = Number.NEGATIVE_INFINITY;
let bestOverallElite = elite.clone({ ...elite.metadata, bestOverall: true, generation: -1 });
let bestCompetitiveScore = Number.NEGATIVE_INFINITY;
let bestCompetitiveElite = null;

for (let generation = 0; generation < config.generations; generation++) {
  const population = [elite.clone({ ...elite.metadata, generation })];
  while (population.length < config.population) {
    if (population.length > 2 && hallOfFame.length > 0) {
      const partner = hallOfFame[Math.floor(Math.random() * hallOfFame.length)].policy;
      population.push(elite.crossover(partner).mutate({ rate: 0.14, scale: 0.16 }));
    } else {
      population.push(elite.mutate({ rate: 0.14, scale: 0.16 }));
    }
  }

  const ranked = population.map((candidate, index) => {
    const result = evaluateCandidate(arena, candidate, config, hallOfFame, generation);
    return { candidate, index, ...result };
  }).sort((a, b) => b.score - a.score);

  const top = ranked.slice(0, config.survivors);
  elite = top[0].candidate.clone({
    ...top[0].candidate.metadata,
    char: config.char,
    generation,
    score: top[0].score,
    wins: top[0].wins,
    losses: top[0].losses,
    draws: top[0].draws,
    hiddenSizes,
  });
  if (top[0].score > bestOverallScore) {
    bestOverallScore = top[0].score;
    bestOverallElite = elite.clone({
      ...elite.metadata,
      bestOverall: true,
      bestOverallScore,
      bestGeneration: generation,
    });
  }
  if (getScriptedPhaseWeight(generation, config) > 0 && top[0].score > bestCompetitiveScore) {
    bestCompetitiveScore = top[0].score;
    bestCompetitiveElite = elite.clone({
      ...elite.metadata,
      bestCompetitive: true,
      bestCompetitiveScore,
      bestCompetitiveGeneration: generation,
    });
  }
  hallOfFame.push({ label: `elite_g${generation}`, policy: elite.clone() });
  history.push({
    generation,
    scriptedPhaseWeight: getScriptedPhaseWeight(generation, config),
    bestScore: top[0].score,
    wins: top[0].wins,
    losses: top[0].losses,
    draws: top[0].draws,
    actionEntropy: top[0].regularizer?.entropy ?? 0,
    actionMaxShare: top[0].regularizer?.maxShare ?? 1,
    actionRegularizerBonus: top[0].regularizer?.bonus ?? 0,
    topScores: top.map((entry) => entry.score),
  });

  console.log(
    `[neural-train] gen=${generation} scriptedWeight=${getScriptedPhaseWeight(generation, config).toFixed(2)} bestScore=${top[0].score.toFixed(2)} wins=${top[0].wins} losses=${top[0].losses} draws=${top[0].draws} entropy=${(top[0].regularizer?.entropy ?? 0).toFixed(2)} maxShare=${(top[0].regularizer?.maxShare ?? 1).toFixed(2)}`,
  );
}

const selectedElite = bestCompetitiveElite ?? bestOverallElite;
selectedElite.metadata.training = {
  ...config,
  hiddenSizes,
  history,
  bestOverallScore,
  bestGeneration: bestOverallElite.metadata.bestGeneration,
  bestCompetitiveScore: Number.isFinite(bestCompetitiveScore) ? bestCompetitiveScore : null,
  bestCompetitiveGeneration: bestCompetitiveElite?.metadata?.bestCompetitiveGeneration ?? null,
  finalGeneration: elite.metadata.generation,
};

ensureDir(config.output);
fs.writeFileSync(config.output, JSON.stringify(selectedElite.toJSON(), null, 2));
console.log(`[neural-train] saved ${config.output}`);
