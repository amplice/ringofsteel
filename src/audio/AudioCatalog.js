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
    createVariant('defense:parry:01', '/audio/defense/parry-01.wav', 1),
  ], {
    cooldownMs: 45,
    playbackRateMin: 0.99,
    playbackRateMax: 1.03,
    volume: 0.44,
  }),
  [AUDIO_EVENT_IDS.defenseClash]: createEvent([
    createVariant('defense:clash:01', '/audio/defense/clash-01.wav', 1),
  ], {
    cooldownMs: 55,
    playbackRateMin: 0.98,
    playbackRateMax: 1.02,
    volume: 0.5,
  }),
  [AUDIO_EVENT_IDS.hitQuick]: createEvent([
    createVariant('hit:quick:01', '/audio/hit/light-01.wav', 1, 0.19),
  ], {
    cooldownMs: 25,
    playbackRateMin: 0.99,
    playbackRateMax: 1.02,
    volume: 0.48,
  }),
  [AUDIO_EVENT_IDS.hitHeavy]: createEvent([
    createVariant('hit:heavy:01', '/audio/hit/heavy-01.wav', 1, 0.19),
  ], {
    cooldownMs: 35,
    playbackRateMin: 0.985,
    playbackRateMax: 1.015,
    volume: 0.56,
  }),
  [AUDIO_EVENT_IDS.hitThrust]: createEvent([
    createVariant('hit:thrust:01', '/audio/hit/thrust-01.wav', 1, 0.13),
  ], {
    cooldownMs: 25,
    playbackRateMin: 0.99,
    playbackRateMax: 1.02,
    volume: 0.5,
  }),
  [AUDIO_EVENT_IDS.movementSidestep]: createEvent([
    createVariant('movement:sidestep:01', '/audio/movement/sidestep-01.ogg', 1),
  ], {
    cooldownMs: 65,
    playbackRateMin: 0.98,
    playbackRateMax: 1.04,
    volume: 0.26,
  }),
  [AUDIO_EVENT_IDS.movementBackstep]: createEvent([
    createVariant('movement:backstep:01', '/audio/movement/backstep-01.ogg', 1),
  ], {
    cooldownMs: 80,
    playbackRateMin: 0.98,
    playbackRateMax: 1.03,
    volume: 0.28,
  }),
  [AUDIO_EVENT_IDS.movementFootstep]: createEvent([
    createVariant('movement:footstep:01', '/audio/movement/footstep-01.wav', 1),
  ], {
    cooldownMs: 70,
    playbackRateMin: 0.97,
    playbackRateMax: 1.03,
    volume: 0.18,
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
