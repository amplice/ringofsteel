import { AIController } from './AIController.js';
import { PlannerAIController } from './PlannerAIController.js';

const SCRIPTED_KIND = 'scripted';
const PLANNER_KIND = 'planner';

function buildRaw(kind, profile) {
  return kind === SCRIPTED_KIND ? profile : `${kind}:${profile}`;
}

export function normalizeControllerSpec(spec) {
  if (spec && typeof spec === 'object') {
    const kind = spec.kind === PLANNER_KIND ? PLANNER_KIND : SCRIPTED_KIND;
    const profile = String(spec.profile ?? spec.raw ?? 'medium').trim();
    return {
      kind,
      profile,
      raw: spec.raw ? String(spec.raw) : buildRaw(kind, profile),
    };
  }

  const raw = String(spec ?? 'medium').trim();
  const colonIndex = raw.indexOf(':');
  if (colonIndex > 0) {
    const maybeKind = raw.slice(0, colonIndex);
    const profile = raw.slice(colonIndex + 1).trim();
    if (maybeKind === PLANNER_KIND || maybeKind === SCRIPTED_KIND) {
      return {
        kind: maybeKind,
        profile,
        raw,
      };
    }
  }

  return {
    kind: SCRIPTED_KIND,
    profile: raw,
    raw,
  };
}

export function createControllerFromSpec(spec) {
  const normalized = normalizeControllerSpec(spec);
  const controller = normalized.kind === PLANNER_KIND
    ? new PlannerAIController(normalized.profile)
    : new AIController(normalized.profile);

  controller.controllerSpec = normalized.raw;
  controller.controllerProfile = normalized.profile;
  controller.controllerKind = normalized.kind;
  return controller;
}

export function resetControllerInstance(controller) {
  if (typeof controller?.resetRound === 'function') controller.resetRound();
  else if (typeof controller?.reset === 'function') controller.reset();
}
