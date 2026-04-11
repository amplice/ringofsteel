function randomWeight(scale) {
  return (Math.random() * 2 - 1) * scale;
}

function softmax(logits, temperature = 1) {
  const safeTemp = Math.max(temperature, 1e-3);
  const scaled = logits.map((value) => value / safeTemp);
  const maxLogit = Math.max(...scaled);
  const exps = scaled.map((value) => Math.exp(value - maxLogit));
  const sum = exps.reduce((acc, value) => acc + value, 0) || 1;
  return exps.map((value) => value / sum);
}

function sampleIndex(probabilities) {
  let roll = Math.random();
  for (let i = 0; i < probabilities.length; i++) {
    roll -= probabilities[i];
    if (roll <= 0) return i;
  }
  return probabilities.length - 1;
}

function normalizeActionMask(actionMask, size) {
  if (!Array.isArray(actionMask) || actionMask.length !== size) return null;
  const normalized = actionMask.map(Boolean);
  return normalized.some(Boolean) ? normalized : null;
}

export class NeuralPolicy {
  constructor({ layerSizes, weights, biases, metadata = {} }) {
    this.layerSizes = [...layerSizes];
    this.weights = weights.map((layer) => Float64Array.from(layer));
    this.biases = biases.map((layer) => Float64Array.from(layer));
    this.metadata = { ...metadata };
  }

  static random({ inputSize, hiddenSizes = [48, 32], outputSize, scale = 0.35, metadata = {} }) {
    const layerSizes = [inputSize, ...hiddenSizes, outputSize];
    const weights = [];
    const biases = [];
    for (let layer = 0; layer < layerSizes.length - 1; layer++) {
      const inSize = layerSizes[layer];
      const outSize = layerSizes[layer + 1];
      const weightLayer = new Float64Array(inSize * outSize);
      const biasLayer = new Float64Array(outSize);
      for (let i = 0; i < weightLayer.length; i++) weightLayer[i] = randomWeight(scale / Math.sqrt(inSize));
      for (let i = 0; i < biasLayer.length; i++) biasLayer[i] = randomWeight(scale * 0.5);
      weights.push(weightLayer);
      biases.push(biasLayer);
    }
    return new NeuralPolicy({ layerSizes, weights, biases, metadata });
  }

  clone(metadata = this.metadata) {
    return new NeuralPolicy({
      layerSizes: this.layerSizes,
      weights: this.weights,
      biases: this.biases,
      metadata: { ...metadata },
    });
  }

  forward(input) {
    let activations = Float64Array.from(input);
    for (let layer = 0; layer < this.weights.length; layer++) {
      const inSize = this.layerSizes[layer];
      const outSize = this.layerSizes[layer + 1];
      const output = new Float64Array(outSize);
      const weightLayer = this.weights[layer];
      const biasLayer = this.biases[layer];
      for (let out = 0; out < outSize; out++) {
        let sum = biasLayer[out];
        const rowOffset = out * inSize;
        for (let i = 0; i < inSize; i++) {
          sum += weightLayer[rowOffset + i] * activations[i];
        }
        output[out] = layer === this.weights.length - 1 ? sum : Math.tanh(sum);
      }
      activations = output;
    }
    return activations;
  }

  act(input, { temperature = 0.7, stochastic = true, actionMask = null } = {}) {
    const logits = Array.from(this.forward(input));
    const mask = normalizeActionMask(actionMask, logits.length);
    const maskedLogits = mask
      ? logits.map((value, index) => (mask[index] ? value : Number.NEGATIVE_INFINITY))
      : logits;

    if (!stochastic) {
      let bestIndex = 0;
      let bestValue = maskedLogits[0];
      for (let i = 1; i < maskedLogits.length; i++) {
        if (maskedLogits[i] > bestValue) {
          bestValue = maskedLogits[i];
          bestIndex = i;
        }
      }
      return { actionIndex: bestIndex, logits: maskedLogits };
    }

    const legalIndices = mask
      ? maskedLogits.map((_, index) => index).filter((index) => mask[index])
      : null;
    const probabilities = mask
      ? (() => {
          const legalLogits = legalIndices.map((index) => maskedLogits[index]);
          const legalProbabilities = softmax(legalLogits, temperature);
          const output = new Array(maskedLogits.length).fill(0);
          for (let i = 0; i < legalIndices.length; i++) {
            output[legalIndices[i]] = legalProbabilities[i];
          }
          return output;
        })()
      : softmax(maskedLogits, temperature);
    const actionIndex = sampleIndex(probabilities);
    return { actionIndex, logits: maskedLogits, probabilities };
  }

  mutate({ rate = 0.12, scale = 0.18 } = {}) {
    const next = this.clone();
    for (const layer of next.weights) {
      for (let i = 0; i < layer.length; i++) {
        if (Math.random() < rate) layer[i] += randomWeight(scale);
      }
    }
    for (const layer of next.biases) {
      for (let i = 0; i < layer.length; i++) {
        if (Math.random() < rate) layer[i] += randomWeight(scale * 0.6);
      }
    }
    return next;
  }

  crossover(other) {
    const child = this.clone();
    for (let layerIndex = 0; layerIndex < child.weights.length; layerIndex++) {
      const childWeights = child.weights[layerIndex];
      const otherWeights = other.weights[layerIndex];
      for (let i = 0; i < childWeights.length; i++) {
        if (Math.random() < 0.5) childWeights[i] = otherWeights[i];
      }
      const childBiases = child.biases[layerIndex];
      const otherBiases = other.biases[layerIndex];
      for (let i = 0; i < childBiases.length; i++) {
        if (Math.random() < 0.5) childBiases[i] = otherBiases[i];
      }
    }
    return child;
  }

  toJSON() {
    return {
      layerSizes: [...this.layerSizes],
      weights: this.weights.map((layer) => Array.from(layer)),
      biases: this.biases.map((layer) => Array.from(layer)),
      metadata: { ...this.metadata },
    };
  }

  static fromJSON(payload) {
    return new NeuralPolicy(payload);
  }
}
