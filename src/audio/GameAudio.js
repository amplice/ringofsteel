import { AttackType, FighterState, HitResult } from '../core/Constants.js';
import { AUDIO_EVENT_DEFS, AUDIO_EVENT_IDS } from './AudioCatalog.js';
import { getAttackStartSoundId } from './AttackStartSoundMap.js';

const FOOTSTEP_PHASE_INTERVAL = 2;

export class GameAudio {
  constructor(soundManager) {
    this.sound = soundManager;
    this._eventCooldowns = new Map();
    this._eventVariantIndices = new Map();
    this._fighterSnapshots = [null, null];
  }

  async preload(listAudioAssets) {
    await this.sound.preload(listAudioAssets);
  }

  resetFighterState(fighters = []) {
    this._fighterSnapshots = [
      this._captureFighterSnapshot(fighters[0] ?? null),
      this._captureFighterSnapshot(fighters[1] ?? null),
    ];
  }

  updateFighters(fighters = []) {
    for (let i = 0; i < 2; i++) {
      const fighter = fighters[i] ?? null;
      const previous = this._fighterSnapshots[i];
      const current = this._captureFighterSnapshot(fighter);
      if (!fighter || !current) {
        this._fighterSnapshots[i] = current;
        continue;
      }

      const enteredAttack = current.state === FighterState.ATTACK_ACTIVE
        && current.attackType
        && (
          !previous
          || previous.state !== FighterState.ATTACK_ACTIVE
          || previous.attackType !== current.attackType
        );
      if (enteredAttack) {
        this.playEvent(getAttackStartSoundId(current.charId, current.attackType));
      }

      const enteredSidestep = current.state === FighterState.SIDESTEP
        && previous?.state !== FighterState.SIDESTEP;
      if (enteredSidestep) {
        this.playEvent(AUDIO_EVENT_IDS.movementSidestep);
      }

      const enteredBackstep = current.state === FighterState.DODGE
        && previous?.state !== FighterState.DODGE;
      if (enteredBackstep) {
        this.playEvent(AUDIO_EVENT_IDS.movementBackstep);
      }

      const isWalking = current.state === FighterState.WALK_FORWARD || current.state === FighterState.WALK_BACK;
      const changedFootstepBucket = isWalking
        && previous
        && current.footstepBucket !== previous.footstepBucket;
      if (changedFootstepBucket) {
        this.playEvent(AUDIO_EVENT_IDS.movementFootstep);
      }

      this._fighterSnapshots[i] = current;
    }
  }

  handleCombatEvent(event) {
    if (!event) return;
    if (event.type === 'ring_out') return;
    if (event.type !== 'combat_result') return;

    switch (event.result) {
      case HitResult.CLASH:
        this.playEvent(AUDIO_EVENT_IDS.defenseClash);
        break;
      case HitResult.PARRIED:
        this.playEvent(AUDIO_EVENT_IDS.defenseParry);
        break;
      case HitResult.BLOCKED:
        this.playEvent(AUDIO_EVENT_IDS.defenseBlock);
        break;
      case HitResult.LETHAL_HIT:
        this.playHit(event.attackerType);
        break;
    }
  }

  playHit(attackType) {
    if (attackType === AttackType.HEAVY) {
      this.playEvent(AUDIO_EVENT_IDS.hitHeavy);
      return;
    }
    if (attackType === AttackType.THRUST) {
      this.playEvent(AUDIO_EVENT_IDS.hitThrust);
      return;
    }
    this.playEvent(AUDIO_EVENT_IDS.hitQuick);
  }

  playEvent(eventId, overrides = {}) {
    const definition = AUDIO_EVENT_DEFS[eventId];
    if (!definition) return false;

    const now = performance.now();
    const lastPlayed = this._eventCooldowns.get(eventId) ?? -Infinity;
    if (now - lastPlayed < definition.cooldownMs) {
      return false;
    }

    const variant = this._pickVariant(eventId, definition.variants);
    const playbackRate = this._randomBetween(definition.playbackRateMin, definition.playbackRateMax);
    const played = this.sound.play(variant.id, {
      volume: (overrides.volume ?? definition.volume) * (variant.volume ?? 1),
      playbackRate: overrides.playbackRate ?? playbackRate,
      startOffset: overrides.startOffset ?? variant.startOffset ?? 0,
    });
    if (played) {
      this._eventCooldowns.set(eventId, now);
    }
    return played;
  }

  _pickVariant(eventId, variants) {
    if (variants.length <= 1) return variants[0];
    const previousIndex = this._eventVariantIndices.get(eventId) ?? -1;
    let nextIndex = Math.floor(Math.random() * variants.length);
    if (nextIndex === previousIndex) {
      nextIndex = (nextIndex + 1) % variants.length;
    }
    this._eventVariantIndices.set(eventId, nextIndex);
    return variants[nextIndex];
  }

  _randomBetween(min, max) {
    if (min === max) return min;
    return min + Math.random() * (max - min);
  }

  _captureFighterSnapshot(fighter) {
    if (!fighter) return null;
    return {
      state: fighter.state,
      attackType: fighter.currentAttackType,
      charId: fighter.charDef?.id ?? fighter.charId ?? null,
      footstepBucket: Math.floor((fighter.walkPhase ?? 0) / FOOTSTEP_PHASE_INTERVAL),
    };
  }
}
