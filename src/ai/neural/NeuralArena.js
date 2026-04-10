import { AIController } from '../AIController.js';
import { CHARACTER_DEFS } from '../../entities/CharacterDefs.js';
import { FighterSim } from '../../sim/FighterSim.js';
import { MatchSim } from '../../sim/MatchSim.js';
import { FRAME_DURATION, FIGHT_START_DISTANCE, ROUNDS_TO_WIN } from '../../core/Constants.js';
import { NeuralPolicyController } from './NeuralPolicyController.js';

export class NeuralArena {
  constructor() {
    this.characterDefs = CHARACTER_DEFS;
  }

  createFighter(playerIndex, charId) {
    const charDef = this.characterDefs[charId];
    if (!charDef) throw new Error(`Unknown character '${charId}'`);
    return new FighterSim(playerIndex, charId, charDef);
  }

  runMatch({
    policy,
    policyChar = 'ronin',
    opponentProfile = 'medium',
    opponentChar = 'spearman',
    roundsToWin = ROUNDS_TO_WIN,
    maxRoundFrames = 60 * 25,
    maxMatchRounds = 9,
    temperature = 0.7,
    stochastic = true,
  }) {
    const fighter1 = this.createFighter(0, policyChar);
    const fighter2 = this.createFighter(1, opponentChar);
    const sim = new MatchSim({ fighter1, fighter2 });
    const policyController = new NeuralPolicyController(policy, { temperature, stochastic });
    const scriptedController = new AIController(opponentProfile);

    const match = {
      p1Score: 0,
      p2Score: 0,
      winner: null,
      rounds: [],
    };

    for (let roundIndex = 0; roundIndex < maxMatchRounds; roundIndex++) {
      if (match.p1Score >= roundsToWin || match.p2Score >= roundsToWin) break;
      const round = this.runRound({ sim, policyController, scriptedController, maxRoundFrames });
      match.rounds.push(round);
      if (round.winner === 1) match.p1Score++;
      if (round.winner === 2) match.p2Score++;
    }

    match.winner = match.p1Score === match.p2Score
      ? null
      : (match.p1Score > match.p2Score ? 1 : 2);

    return match;
  }

  runSelfPlay({
    policyA,
    charA = 'ronin',
    policyB,
    charB = 'spearman',
    roundsToWin = ROUNDS_TO_WIN,
    maxRoundFrames = 60 * 25,
    maxMatchRounds = 9,
    temperature = 0.7,
    stochastic = true,
  }) {
    const fighter1 = this.createFighter(0, charA);
    const fighter2 = this.createFighter(1, charB);
    const sim = new MatchSim({ fighter1, fighter2 });
    const controllerA = new NeuralPolicyController(policyA, { temperature, stochastic });
    const controllerB = new NeuralPolicyController(policyB, { temperature, stochastic });

    const match = { p1Score: 0, p2Score: 0, winner: null, rounds: [] };
    for (let roundIndex = 0; roundIndex < maxMatchRounds; roundIndex++) {
      if (match.p1Score >= roundsToWin || match.p2Score >= roundsToWin) break;
      sim.startRound(FIGHT_START_DISTANCE);
      controllerA.reset();
      controllerB.reset();

      let steps = 0;
      while (!sim.roundOver && steps < maxRoundFrames) {
        sim.step(FRAME_DURATION, {
          controller1: (fighter, opponent, innerSim, dt) => controllerA.step(fighter, opponent, innerSim, dt),
          controller2: (fighter, opponent, innerSim, dt) => controllerB.step(fighter, opponent, innerSim, dt),
        });
        steps++;
      }

      const winner = sim.winner;
      match.rounds.push({ winner, steps, killReason: sim.killReason });
      if (winner === 1) match.p1Score++;
      if (winner === 2) match.p2Score++;
    }

    match.winner = match.p1Score === match.p2Score ? null : (match.p1Score > match.p2Score ? 1 : 2);
    return match;
  }

  runRound({ sim, policyController, scriptedController, maxRoundFrames }) {
    sim.startRound(FIGHT_START_DISTANCE);
    policyController.reset();
    scriptedController.reset();

    let steps = 0;
    while (!sim.roundOver && steps < maxRoundFrames) {
      sim.step(FRAME_DURATION, {
        controller1: (fighter, opponent, innerSim, dt) => policyController.step(fighter, opponent, innerSim, dt),
        controller2: (fighter, opponent, innerSim, dt) => scriptedController.update(fighter, opponent, innerSim.frameCount, dt),
      });
      steps++;
    }

    return {
      winner: sim.winner,
      killReason: sim.killReason,
      steps,
      frameCount: sim.frameCount,
    };
  }
}
