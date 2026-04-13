import spearmanHardPayload from '../../data/neuralHard/spearman-hard.json';
import roninHardPayload from '../../data/neuralHard/ronin-hard.json';
import knightHardPayload from '../../data/neuralHard/knight-hard.json';
import { NeuralPolicy } from './NeuralPolicy.js';

const HARD_NEURAL_POLICY_MAP = Object.freeze({
  spearman: NeuralPolicy.fromJSON(spearmanHardPayload),
  ronin: NeuralPolicy.fromJSON(roninHardPayload),
  knight: NeuralPolicy.fromJSON(knightHardPayload),
});

export function getHardNeuralPolicy(charId) {
  return HARD_NEURAL_POLICY_MAP[charId] || null;
}
