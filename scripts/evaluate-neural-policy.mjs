import fs from 'node:fs';
import { NeuralPolicy } from '../src/ai/neural/NeuralPolicy.js';
import { NeuralArena } from '../src/ai/neural/NeuralArena.js';

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    options[key] = value ?? true;
  }
  return options;
}

function numberOption(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const args = parseArgs(process.argv.slice(2));
if (!args.model) {
  throw new Error('Pass --model=<path-to-policy-json>');
}

const payload = JSON.parse(fs.readFileSync(args.model, 'utf8'));
const policy = NeuralPolicy.fromJSON(payload);
const arena = new NeuralArena();
const char = args.char || policy.metadata?.char || 'ronin';
const opponents = (args.opponents || 'spearman:spearman_heavy_bully,ronin:ronin_duelist,knight:knight_sentinel')
  .split(',')
  .map((entry) => {
    const [opponentChar, opponentProfile] = entry.split(':');
    return { opponentChar, opponentProfile };
  })
  .filter((entry) => entry.opponentChar && entry.opponentProfile);

const repeats = numberOption(args.repeats, 3);
const stochastic = args.stochastic === true || args.stochastic === 'true';
const results = [];
const aggregatePolicyStats = {
  decisionCount: 0,
  committedActionCount: 0,
  actionSelections: {},
  actionFrames: {},
  stateFrames: {},
};

function mergeCounts(target, source = {}) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

for (const opponent of opponents) {
  for (let i = 0; i < repeats; i++) {
    for (const policySide of [1, 2]) {
      const match = arena.runMatch({
        policy,
        policyChar: char,
        opponentChar: opponent.opponentChar,
        opponentProfile: opponent.opponentProfile,
        policySide,
        roundsToWin: numberOption(args.rounds, 3),
        maxRoundFrames: numberOption(args.maxRoundFrames, 60 * 18),
        maxMatchRounds: numberOption(args.maxMatchRounds, 7),
        temperature: numberOption(args.temperature, 0.2),
        stochastic,
      });
      aggregatePolicyStats.decisionCount += match.policyStats?.decisionCount || 0;
      aggregatePolicyStats.committedActionCount += match.policyStats?.committedActionCount || 0;
      mergeCounts(aggregatePolicyStats.actionSelections, match.policyStats?.actionSelections);
      mergeCounts(aggregatePolicyStats.actionFrames, match.policyStats?.actionFrames);
      mergeCounts(aggregatePolicyStats.stateFrames, match.policyStats?.stateFrames);
      results.push({
        ...opponent,
        policySide,
        winner: match.policyWinner,
        policyScore: policySide === 1 ? match.p1Score : match.p2Score,
        opponentScore: policySide === 1 ? match.p2Score : match.p1Score,
      });
    }
  }
}

const wins = results.filter((entry) => entry.winner === 1).length;
const losses = results.filter((entry) => entry.winner === 2).length;
const draws = results.filter((entry) => entry.winner == null).length;
console.log(JSON.stringify({
  char,
  model: args.model,
  stochastic,
  wins,
  losses,
  draws,
  aggregatePolicyStats,
  results,
}, null, 2));
