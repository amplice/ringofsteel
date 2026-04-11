import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe', shell: false });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(`[${label}] ${text}`);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(`[${label}] ${text}`);
    });

    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

function buildTrainArgs(scriptPath, charId, config, outputPath) {
  return [
    scriptPath,
    `--char=${charId}`,
    `--generations=${config.generations}`,
    `--population=${config.population}`,
    `--survivors=${config.survivors}`,
    `--repeats=${config.repeats}`,
    `--rounds=${config.rounds}`,
    `--maxMatchRounds=${config.maxMatchRounds}`,
    `--maxRoundFrames=${config.maxRoundFrames}`,
    `--temperature=${config.temperature}`,
    `--hallOfFame=${config.hallOfFame}`,
    `--selfPlayWeight=${config.selfPlayWeight}`,
    `--scriptedWeight=${config.scriptedWeight}`,
    `--selfPlayWarmup=${config.selfPlayWarmup}`,
    `--scriptedRamp=${config.scriptedRamp}`,
    `--hidden=${config.hidden}`,
    `--output=${outputPath}`,
  ];
}

const args = parseArgs(process.argv.slice(2));
const chars = (args.chars || 'spearman,ronin,knight').split(',').map((value) => value.trim()).filter(Boolean);
const config = {
  generations: numberOption(args.generations, 4),
  population: numberOption(args.population, 10),
  survivors: numberOption(args.survivors, 3),
  repeats: numberOption(args.repeats, 2),
  rounds: numberOption(args.rounds, 3),
  maxMatchRounds: numberOption(args.maxMatchRounds, 7),
  maxRoundFrames: numberOption(args.maxRoundFrames, 60 * 18),
  temperature: numberOption(args.temperature, 0.75),
  hallOfFame: numberOption(args.hallOfFame, 3),
  selfPlayWeight: numberOption(args.selfPlayWeight, 1),
  scriptedWeight: numberOption(args.scriptedWeight, 1),
  selfPlayWarmup: numberOption(args.selfPlayWarmup, Math.max(4, Math.floor(numberOption(args.generations, 4) * 0.25))),
  scriptedRamp: numberOption(args.scriptedRamp, Math.max(2, Math.floor(numberOption(args.generations, 4) * 0.2))),
  hidden: args.hidden || '48,32',
  outputDir: args.outputDir || '.local/neural',
  parallel: args.parallel === true || args.parallel === 'true',
};

fs.mkdirSync(config.outputDir, { recursive: true });
const scriptPath = path.resolve('scripts/train-neural-policy.mjs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const jobs = chars.map((charId) => ({
  charId,
  outputPath: path.join(config.outputDir, `${timestamp}-${charId}-policy.json`),
}));

if (config.parallel) {
  await Promise.all(jobs.map((job) => runCommand(process.execPath, buildTrainArgs(scriptPath, job.charId, config, job.outputPath), job.charId)));
} else {
  for (const job of jobs) {
    await runCommand(process.execPath, buildTrainArgs(scriptPath, job.charId, config, job.outputPath), job.charId);
  }
}

console.log(JSON.stringify({
  chars,
  parallel: config.parallel,
  outputs: jobs.map((job) => ({ char: job.charId, model: job.outputPath })),
}, null, 2));
