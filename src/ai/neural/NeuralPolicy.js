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
  constructor({ layerSizes, weights, biases, recurrentWeights = null, recurrentBias = null, metadata = {} }) {
    this.layerSizes = [...layerSizes];
    this.weights = weights.map((layer) => Float64Array.from(layer));
    this.biases = biases.map((layer) => Float64Array.from(layer));
    this.metadata = { ...metadata };
    this.recurrentSize = Number.isFinite(metadata.recurrentSize) && metadata.recurrentSize > 0
      ? metadata.recurrentSize
      : 0;
    this.inputSize = Number.isFinite(metadata.inputSize) && metadata.inputSize > 0
      ? metadata.inputSize
      : (this.recurrentSize > 0
          ? Math.floor((recurrentWeights?.input?.length || 0) / Math.max(this.recurrentSize, 1))
          : layerSizes[0]);
    this.recurrentWeights = recurrentWeights
      ? {
          input: Float64Array.from(recurrentWeights.input),
          hidden: Float64Array.from(recurrentWeights.hidden),
        }
      : null;
    this.recurrentBias = recurrentBias ? Float64Array.from(recurrentBias) : null;
  }

  static random({ inputSize, hiddenSizes = [48, 32], outputSize, scale = 0.35, metadata = {}, recurrentSize = 0 }) {
    const denseInputSize = recurrentSize > 0 ? recurrentSize : inputSize;
    const layerSizes = [denseInputSize, ...hiddenSizes, outputSize];
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

    const recurrent = recurrentSize > 0
      ? {
          recurrentWeights: {
            input: (() => {
              const layer = new Float64Array(recurrentSize * inputSize);
              for (let i = 0; i < layer.length; i++) layer[i] = randomWeight(scale / Math.sqrt(inputSize));
              return layer;
            })(),
            hidden: (() => {
              const layer = new Float64Array(recurrentSize * recurrentSize);
              for (let i = 0; i < layer.length; i++) layer[i] = randomWeight(scale / Math.sqrt(recurrentSize || 1));
              return layer;
            })(),
          },
          recurrentBias: (() => {
            const layer = new Float64Array(recurrentSize);
            for (let i = 0; i < layer.length; i++) layer[i] = randomWeight(scale * 0.4);
            return layer;
          })(),
        }
      : { recurrentWeights: null, recurrentBias: null };

    return new NeuralPolicy({
      layerSizes,
      weights,
      biases,
      recurrentWeights: recurrent.recurrentWeights,
      recurrentBias: recurrent.recurrentBias,
      metadata: {
        ...metadata,
        inputSize,
        recurrentSize,
      },
    });
  }

  clone(metadata = this.metadata) {
    return new NeuralPolicy({
      layerSizes: this.layerSizes,
      weights: this.weights,
      biases: this.biases,
      recurrentWeights: this.recurrentWeights,
      recurrentBias: this.recurrentBias,
      metadata: { ...metadata },
    });
  }

  createInitialRecurrentState() {
    return this.recurrentSize > 0 ? new Float64Array(this.recurrentSize) : null;
  }

  _resolveRecurrentState(recurrentState) {
    if (this.recurrentSize <= 0) return null;
    if (recurrentState instanceof Float64Array && recurrentState.length === this.recurrentSize) return recurrentState;
    if (recurrentState instanceof Float32Array && recurrentState.length === this.recurrentSize) return Float64Array.from(recurrentState);
    if (Array.isArray(recurrentState) && recurrentState.length === this.recurrentSize) return Float64Array.from(recurrentState);
    return this.createInitialRecurrentState();
  }

  _computeRecurrentState(input, recurrentState = null) {
    if (this.recurrentSize <= 0) return { hidden: null, previous: null };
    const previous = this._resolveRecurrentState(recurrentState);
    const hidden = new Float64Array(this.recurrentSize);
    for (let row = 0; row < this.recurrentSize; row++) {
      let sum = this.recurrentBias[row];
      const inputOffset = row * this.inputSize;
      for (let i = 0; i < this.inputSize; i++) {
        sum += this.recurrentWeights.input[inputOffset + i] * input[i];
      }
      const hiddenOffset = row * this.recurrentSize;
      for (let i = 0; i < this.recurrentSize; i++) {
        sum += this.recurrentWeights.hidden[hiddenOffset + i] * previous[i];
      }
      hidden[row] = Math.tanh(sum);
    }
    return { hidden, previous };
  }

  _forwardDense(initialActivations) {
    let activations = Float64Array.from(initialActivations);
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

  forwardWithState(input, recurrentState = null) {
    const recurrent = this._computeRecurrentState(input, recurrentState);
    const logits = this._forwardDense(recurrent.hidden ?? input);
    return { logits, recurrentState: recurrent.hidden };
  }

  forward(input, recurrentState = null) {
    return this.forwardWithState(input, recurrentState).logits;
  }

  forwardDetailed(input, recurrentState = null) {
    const recurrent = this._computeRecurrentState(input, recurrentState);
    const activations = [Float64Array.from(recurrent.hidden ?? input)];
    const preActivations = [];
    let current = activations[0];
    for (let layer = 0; layer < this.weights.length; layer++) {
      const inSize = this.layerSizes[layer];
      const outSize = this.layerSizes[layer + 1];
      const z = new Float64Array(outSize);
      const a = new Float64Array(outSize);
      const weightLayer = this.weights[layer];
      const biasLayer = this.biases[layer];
      for (let out = 0; out < outSize; out++) {
        let sum = biasLayer[out];
        const rowOffset = out * inSize;
        for (let i = 0; i < inSize; i++) {
          sum += weightLayer[rowOffset + i] * current[i];
        }
        z[out] = sum;
        a[out] = layer === this.weights.length - 1 ? sum : Math.tanh(sum);
      }
      preActivations.push(z);
      activations.push(a);
      current = a;
    }
    return {
      activations,
      preActivations,
      logits: activations[activations.length - 1],
      recurrent,
    };
  }

  cloneZeroGradients() {
    return {
      weightGrads: this.weights.map((layer) => new Float64Array(layer.length)),
      biasGrads: this.biases.map((layer) => new Float64Array(layer.length)),
      recurrentInputGrads: this.recurrentWeights ? new Float64Array(this.recurrentWeights.input.length) : null,
      recurrentHiddenGrads: this.recurrentWeights ? new Float64Array(this.recurrentWeights.hidden.length) : null,
      recurrentBiasGrads: this.recurrentBias ? new Float64Array(this.recurrentBias.length) : null,
    };
  }

  applyGradients(
    { weightGrads, biasGrads, recurrentInputGrads = null, recurrentHiddenGrads = null, recurrentBiasGrads = null },
    { learningRate = 0.01, l2 = 0 } = {},
  ) {
    for (let layerIndex = 0; layerIndex < this.weights.length; layerIndex++) {
      const weights = this.weights[layerIndex];
      const biases = this.biases[layerIndex];
      const wGrad = weightGrads[layerIndex];
      const bGrad = biasGrads[layerIndex];
      for (let i = 0; i < weights.length; i++) {
        const regularized = wGrad[i] + (weights[i] * l2);
        weights[i] -= learningRate * regularized;
      }
      for (let i = 0; i < biases.length; i++) {
        biases[i] -= learningRate * bGrad[i];
      }
    }

    if (this.recurrentWeights && recurrentInputGrads && recurrentHiddenGrads && this.recurrentBias && recurrentBiasGrads) {
      for (let i = 0; i < this.recurrentWeights.input.length; i++) {
        const regularized = recurrentInputGrads[i] + (this.recurrentWeights.input[i] * l2);
        this.recurrentWeights.input[i] -= learningRate * regularized;
      }
      for (let i = 0; i < this.recurrentWeights.hidden.length; i++) {
        const regularized = recurrentHiddenGrads[i] + (this.recurrentWeights.hidden[i] * l2);
        this.recurrentWeights.hidden[i] -= learningRate * regularized;
      }
      for (let i = 0; i < this.recurrentBias.length; i++) {
        this.recurrentBias[i] -= learningRate * recurrentBiasGrads[i];
      }
    }
  }

  act(input, { temperature = 0.7, stochastic = true, actionMask = null, recurrentState = null } = {}) {
    const forward = this.forwardWithState(input, recurrentState);
    const logits = Array.from(forward.logits);
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
      return { actionIndex: bestIndex, logits: maskedLogits, recurrentState: forward.recurrentState };
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
    return { actionIndex, logits: maskedLogits, probabilities, recurrentState: forward.recurrentState };
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
    if (next.recurrentWeights) {
      for (let i = 0; i < next.recurrentWeights.input.length; i++) {
        if (Math.random() < rate) next.recurrentWeights.input[i] += randomWeight(scale);
      }
      for (let i = 0; i < next.recurrentWeights.hidden.length; i++) {
        if (Math.random() < rate) next.recurrentWeights.hidden[i] += randomWeight(scale * 0.9);
      }
    }
    if (next.recurrentBias) {
      for (let i = 0; i < next.recurrentBias.length; i++) {
        if (Math.random() < rate) next.recurrentBias[i] += randomWeight(scale * 0.6);
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
    if (child.recurrentWeights && other.recurrentWeights) {
      for (let i = 0; i < child.recurrentWeights.input.length; i++) {
        if (Math.random() < 0.5) child.recurrentWeights.input[i] = other.recurrentWeights.input[i];
      }
      for (let i = 0; i < child.recurrentWeights.hidden.length; i++) {
        if (Math.random() < 0.5) child.recurrentWeights.hidden[i] = other.recurrentWeights.hidden[i];
      }
    }
    if (child.recurrentBias && other.recurrentBias) {
      for (let i = 0; i < child.recurrentBias.length; i++) {
        if (Math.random() < 0.5) child.recurrentBias[i] = other.recurrentBias[i];
      }
    }
    return child;
  }

  toJSON() {
    return {
      layerSizes: [...this.layerSizes],
      weights: this.weights.map((layer) => Array.from(layer)),
      biases: this.biases.map((layer) => Array.from(layer)),
      recurrentWeights: this.recurrentWeights
        ? {
            input: Array.from(this.recurrentWeights.input),
            hidden: Array.from(this.recurrentWeights.hidden),
          }
        : null,
      recurrentBias: this.recurrentBias ? Array.from(this.recurrentBias) : null,
      metadata: { ...this.metadata },
    };
  }

  static fromJSON(payload) {
    return new NeuralPolicy(payload);
  }
}
