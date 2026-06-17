import { ATTACK_START_SOUND_MAP, getAttackStartSoundId } from './AttackStartSoundMap.js';

const createVariant = (id, url, volume = 1, startOffset = 0) => Object.freeze({
  id,
  url,
  volume,
  startOffset,
});

const createEvent = (variants, options = {}) => Object.freeze({
  variants: Object.freeze(variants),
  cooldownMs: options.cooldownMs ?? 0,
  playbackRateMin: options.playbackRateMin ?? 1,
  playbackRateMax: options.playbackRateMax ?? 1,
  volume: options.volume ?? 1,
});

export const AUDIO_EVENT_IDS = Object.freeze({
  defenseBlock: 'defense:block',
  defenseParry: 'defense:parry',
  defenseClash: 'defense:clash',
  hitQuick: 'hit:quick',
  hitHeavy: 'hit:heavy',
  hitThrust: 'hit:thrust',
  movementSidestep: 'movement:sidestep',
  movementBackstep: 'movement:backstep',
  movementFootstep: 'movement:footstep',
  roundStart: 'round:start',
  ringOut: 'system:ring-out',
});

const attackStartEvents = {};
for (const [charId, attackMap] of Object.entries(ATTACK_START_SOUND_MAP)) {
  for (const [attackType, url] of Object.entries(attackMap)) {
    const eventId = getAttackStartSoundId(charId, attackType);
    const baseVolume = attackType === 'heavy'
      ? 0.42
      : attackType === 'thrust'
        ? 0.36
        : 0.34;
    attackStartEvents[eventId] = createEvent(
      [createVariant(eventId, url, 1)],
      {
        cooldownMs: 45,
        playbackRateMin: 0.985,
        playbackRateMax: 1.015,
        volume: baseVolume,
      },
    );
  }
}

export const AUDIO_EVENT_DEFS = Object.freeze({
  ...attackStartEvents,
  [AUDIO_EVENT_IDS.defenseBlock]: createEvent([
    createVariant('defense:block:01', '/audio/defense/block-01.wav', 1),
  ], {
    cooldownMs: 35,
    playbackRateMin: 0.98,
    playbackRateMax: 1.02,
    volume: 0.4,
  }),
  [AUDIO_EVENT_IDS.defenseParry]: createEvent([
    // Second take added from a shipped-but-unused asset; per-variant volume and
    // startOffset are RMS/onset-matched to :01 so neither take stands out.
    createVariant('defense:parry:01', '/audio/defense/parry-01.wav', 1),
    createVariant('defense:parry:02', '/audio/defense/parry-02.wav', 0.87),
  ], {
    cooldownMs: 45,
    playbackRateMin: 0.99,
    playbackRateMax: 1.03,
    volume: 0.44,
  }),
  [AUDIO_EVENT_IDS.defenseClash]: createEvent([
    createVariant('defense:clash:01', '/audio/defense/clash-01.wav', 1),
    createVariant('defense:clash:02', '/audio/defense/clash-02.ogg', 1.75, 0.172),
  ], {
    cooldownMs: 55,
    playbackRateMin: 0.98,
    playbackRateMax: 1.02,
    volume: 0.5,
  }),
  [AUDIO_EVENT_IDS.hitQuick]: createEvent([
    createVariant('hit:quick:01', '/audio/hit/light-01.wav', 1, 0.19),
    createVariant('hit:quick:02', '/audio/hit/light-02.ogg', 0.82),
  ], {
    cooldownMs: 25,
    playbackRateMin: 0.99,
    playbackRateMax: 1.02,
    volume: 0.48,
  }),
  [AUDIO_EVENT_IDS.hitHeavy]: createEvent([
    createVariant('hit:heavy:01', '/audio/hit/heavy-01.wav', 1, 0.19),
    createVariant('hit:heavy:02', '/audio/hit/heavy-02.ogg', 1.33),
  ], {
    cooldownMs: 35,
    playbackRateMin: 0.985,
    playbackRateMax: 1.015,
    volume: 0.56,
  }),
  [AUDIO_EVENT_IDS.hitThrust]: createEvent([
    createVariant('hit:thrust:01', '/audio/hit/thrust-01.wav', 1, 0.13),
    createVariant('hit:thrust:02', '/audio/hit/thrust-02.ogg', 1.32),
  ], {
    cooldownMs: 25,
    playbackRateMin: 0.99,
    playbackRateMax: 1.02,
    volume: 0.5,
  }),
  [AUDIO_EVENT_IDS.movementSidestep]: createEvent([
    createVariant('movement:sidestep:01', '/audio/movement/sidestep-01.ogg', 1),
    createVariant('movement:sidestep:02', '/audio/movement/sidestep-02.wav', 0.2, 0.083),
  ], {
    cooldownMs: 65,
    playbackRateMin: 0.98,
    playbackRateMax: 1.04,
    volume: 0.26,
  }),
  [AUDIO_EVENT_IDS.movementBackstep]: createEvent([
    createVariant('movement:backstep:01', '/audio/movement/backstep-01.ogg', 1),
    createVariant('movement:backstep:02', '/audio/movement/backstep-02.wav', 0.21, 0.083),
  ], {
    cooldownMs: 80,
    playbackRateMin: 0.98,
    playbackRateMax: 1.03,
    volume: 0.28,
  }),
  [AUDIO_EVENT_IDS.movementFootstep]: createEvent([
    createVariant('movement:footstep:01', '/audio/movement/footstep-01.wav', 1),
    createVariant('movement:footstep:03', '/audio/movement/footstep-03.ogg', 0.08),
    createVariant('movement:footstep:04', '/audio/movement/footstep-04.ogg', 0.07, 0.01),
  ], {
    cooldownMs: 70,
    playbackRateMin: 0.97,
    playbackRateMax: 1.03,
    volume: 0.18,
  }),
  // Game-flow stings from shipped-but-previously-unused assets. The :02 takes
  // are hotter than :01, so their per-variant volume is RMS-matched and the
  // startOffset trims measured leading silence (same method as the combat
  // variants above).
  [AUDIO_EVENT_IDS.roundStart]: createEvent([
    createVariant('round:start:01', '/audio/ui/round-start-01.ogg', 1),
    createVariant('round:start:02', '/audio/ui/round-start-02.ogg', 1.46, 0.015),
  ], {
    cooldownMs: 300,
    volume: 0.4,
  }),
  [AUDIO_EVENT_IDS.ringOut]: createEvent([
    createVariant('system:ring-out:01', '/audio/system/ring-out-01.ogg', 1),
    createVariant('system:ring-out:02', '/audio/system/ring-out-02.ogg', 1.41),
  ], {
    cooldownMs: 250,
    volume: 0.5,
  }),
});

export function listAudioAssets() {
  const assets = [];
  for (const definition of Object.values(AUDIO_EVENT_DEFS)) {
    for (const variant of definition.variants) {
      assets.push({ id: variant.id, url: variant.url });
    }
  }
  return assets;
}
