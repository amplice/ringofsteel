import fs from 'node:fs';
import path from 'node:path';
import { NeuralPolicy } from '../src/ai/neural/NeuralPolicy.js';
import { NEURAL_OBSERVATION_SIZE } from '../src/ai/neural/NeuralObservation.js';
import { NEURAL_ACTIONS } from '../src/ai/neural/NeuralPolicyController.js';
import { NeuralArena } from '../src/ai/neural/NeuralArena.js';

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

function defaultOpponentSchedule(policyChar) {
  return DEFAULT_CURRICULA[policyChar] ?? DEFAULT_CURRICULA.ronin;
}

function parseOpponentSchedule(raw, policyChar) {
  if (!raw) return defaultOpponentSchedule(policyChar);
  return raw.split(',').map((entry) => {
    const [opponentChar, opponentProfile, rawWeight] = entry.split(':');
    const weight = Number(rawWeight);
    return { opponentChar, opponentProfile, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 };
  }).filter((entry) => entry.opponentChar && entry.opponentProfile);
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

function evaluateScriptedMatch(arena, candidate, config, opponent, policySide, stochastic) {
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
  });
}

function evaluateSelfPlayMatch(arena, candidate, config, championPolicy, perspectiveSide, stochastic) {
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
      });
}

function evaluateCandidate(arena, candidate, config, hallOfFame, generation) {
  let score = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const details = [];
  const scriptedPhaseWeight = getScriptedPhaseWeight(generation, config);

  if (scriptedPhaseWeight > 0) {
    for (const opponent of config.opponents) {
      const opponentWeight = getOpponentWeight(opponent);
      for (let repeat = 0; repeat < config.repeatsPerOpponent; repeat++) {
        for (const policySide of [1, 2]) {
          const match = evaluateScriptedMatch(arena, candidate, config, opponent, policySide, true);
          const matchScore = match.reward ?? 0;
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
  }

  const selfPlayOpponents = hallOfFame.slice(-Math.max(config.hallOfFameCount, 1));
  for (const champion of selfPlayOpponents) {
    for (const perspectiveSide of [1, 2]) {
      const match = evaluateSelfPlayMatch(arena, candidate, config, champion.policy, perspectiveSide, true);
      const matchScore = match.reward ?? 0;
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
        const match = evaluateScriptedMatch(arena, candidate, config, opponent, policySide, false);
        const matchScore = match.reward ?? 0;
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

    for (const champion of selfPlayOpponents) {
      for (const perspectiveSide of [1, 2]) {
        const match = evaluateSelfPlayMatch(arena, candidate, config, champion.policy, perspectiveSide, false);
        const matchScore = match.reward ?? 0;
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

  return { score, wins, losses, draws, details };
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
  selfPlayWarmupGenerations: 0,
  scriptedRampGenerations: 0,
  output: args.output || `.local/neural/${Date.now()}-${args.char || 'ronin'}-policy.json`,
  opponents: parseOpponentSchedule(args.opponents, args.char || 'ronin'),
};
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
    topScores: top.map((entry) => entry.score),
  });

  console.log(
    `[neural-train] gen=${generation} scriptedWeight=${getScriptedPhaseWeight(generation, config).toFixed(2)} bestScore=${top[0].score.toFixed(2)} wins=${top[0].wins} losses=${top[0].losses} draws=${top[0].draws}`,
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
