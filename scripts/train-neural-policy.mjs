import fs from 'node:fs';
import path from 'node:path';
import { NeuralPolicy } from '../src/ai/neural/NeuralPolicy.js';
import { NEURAL_OBSERVATION_SIZE } from '../src/ai/neural/NeuralObservation.js';
import { NEURAL_ACTIONS } from '../src/ai/neural/NeuralPolicyController.js';
import { NeuralArena } from '../src/ai/neural/NeuralArena.js';
import { AI_CLASS_PROFILE_SETS } from '../src/ai/AIPersonality.js';

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

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function defaultOpponentSchedule(policyChar) {
  const selfProfiles = AI_CLASS_PROFILE_SETS[policyChar] ?? [];
  return [
    { opponentChar: 'spearman', opponentProfile: 'spearman_heavy_bully' },
    { opponentChar: 'spearman', opponentProfile: 'spearman_evasive' },
    { opponentChar: 'ronin', opponentProfile: 'ronin_duelist' },
    { opponentChar: 'ronin', opponentProfile: 'ronin_evasive' },
    { opponentChar: 'knight', opponentProfile: 'knight_sentinel' },
    { opponentChar: 'knight', opponentProfile: 'knight_bulwark' },
    ...selfProfiles.slice(0, 2).map((profile) => ({ opponentChar: policyChar, opponentProfile: profile })),
  ];
}

function parseOpponentSchedule(raw, policyChar) {
  if (!raw) return defaultOpponentSchedule(policyChar);
  return raw.split(',').map((entry) => {
    const [opponentChar, opponentProfile] = entry.split(':');
    return { opponentChar, opponentProfile };
  }).filter((entry) => entry.opponentChar && entry.opponentProfile);
}

function scoreMatch(match) {
  const roundDiff = match.p1Score - match.p2Score;
  if (match.winner === 1) return 3 + roundDiff;
  if (match.winner === 2) return -3 + roundDiff;
  return roundDiff * 0.5;
}

function evaluateCandidate(arena, candidate, config, hallOfFame) {
  let score = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const details = [];

  for (const opponent of config.opponents) {
    for (let repeat = 0; repeat < config.repeatsPerOpponent; repeat++) {
      const match = arena.runMatch({
        policy: candidate,
        policyChar: config.char,
        opponentChar: opponent.opponentChar,
        opponentProfile: opponent.opponentProfile,
        roundsToWin: config.roundsToWin,
        maxRoundFrames: config.maxRoundFrames,
        maxMatchRounds: config.maxMatchRounds,
        temperature: config.temperature,
        stochastic: true,
      });
      const matchScore = scoreMatch(match);
      score += matchScore;
      if (match.winner === 1) wins++;
      else if (match.winner === 2) losses++;
      else draws++;
      details.push({ ...opponent, matchScore, winner: match.winner, p1Score: match.p1Score, p2Score: match.p2Score });
    }
  }

  for (const champion of hallOfFame.slice(-config.hallOfFameCount)) {
    const match = arena.runSelfPlay({
      policyA: candidate,
      charA: config.char,
      policyB: champion.policy,
      charB: config.char,
      roundsToWin: config.roundsToWin,
      maxRoundFrames: config.maxRoundFrames,
      maxMatchRounds: config.maxMatchRounds,
      temperature: config.temperature,
      stochastic: true,
    });
    const matchScore = scoreMatch(match);
    score += matchScore * config.selfPlayWeight;
    if (match.winner === 1) wins++;
    else if (match.winner === 2) losses++;
    else draws++;
    details.push({ opponentChar: config.char, opponentProfile: champion.label, matchScore, winner: match.winner, p1Score: match.p1Score, p2Score: match.p2Score, selfPlay: true });
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
  selfPlayWeight: numberOption(args.selfPlayWeight, 0.75),
  output: args.output || `.local/neural/${Date.now()}-${args.char || 'ronin'}-policy.json`,
  opponents: parseOpponentSchedule(args.opponents, args.char || 'ronin'),
};

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

const hallOfFame = [];
const history = [];

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
    const result = evaluateCandidate(arena, candidate, config, hallOfFame);
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
  hallOfFame.push({ label: `elite_g${generation}`, policy: elite.clone() });
  history.push({
    generation,
    bestScore: top[0].score,
    wins: top[0].wins,
    losses: top[0].losses,
    draws: top[0].draws,
    topScores: top.map((entry) => entry.score),
  });

  console.log(`[neural-train] gen=${generation} bestScore=${top[0].score.toFixed(2)} wins=${top[0].wins} losses=${top[0].losses} draws=${top[0].draws}`);
}

elite.metadata.training = {
  ...config,
  hiddenSizes,
  history,
};

ensureDir(config.output);
fs.writeFileSync(config.output, JSON.stringify(elite.toJSON(), null, 2));
console.log(`[neural-train] saved ${config.output}`);
