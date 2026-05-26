export const DEFAULT_HARD_AI_PROFILES = Object.freeze({
  spearman: 'spearman_heavy_bully',
  ronin: 'ronin_aggressor',
  knight: 'knight_balanced_guard',
  huscarl: 'aggressor',
});

export const HARD_AI_MATCHUP_PROFILE_MAP = Object.freeze({
  spearman: Object.freeze({
    ronin: 'spearman_ronin_reactive_line',
    knight: 'spearman_knight_balanced',
    huscarl: 'spearman_ronin_pressure',
  }),
  ronin: Object.freeze({
    spearman: 'ronin_aggressor',
    knight: 'ronin_aggressor',
    huscarl: 'ronin_spear_counter',
  }),
  knight: Object.freeze({
    spearman: 'knight_balanced_guard',
    ronin: 'knight_ronin_guard',
    huscarl: 'knight_bulwark',
  }),
  huscarl: Object.freeze({
    spearman: 'aggressor',
    ronin: 'huscarl_raider',
    knight: 'scrapper',
  }),
});

export function resolveHardAIProfile(charId, opponentCharId = null) {
  const matchupProfiles = HARD_AI_MATCHUP_PROFILE_MAP[charId];
  return matchupProfiles?.[opponentCharId] ?? DEFAULT_HARD_AI_PROFILES[charId] ?? 'hard';
}
