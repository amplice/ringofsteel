export const DEFAULT_HARD_AI_PROFILES = Object.freeze({
  spearman: 'spearman_heavy_bully',
  ronin: 'ronin_aggressor',
  knight: 'knight_balanced_guard',
  huscarl: 'aggressor',
  glaivier: 'glaivier_press',
});

export const HARD_AI_MATCHUP_PROFILE_MAP = Object.freeze({
  spearman: Object.freeze({
    ronin: 'spearman_ronin_reactive_line',
    knight: 'spearman_knight_balanced',
    huscarl: 'spearman_ronin_pressure',
    glaivier: 'spearman_heavy_bully',
  }),
  ronin: Object.freeze({
    spearman: 'ronin_aggressor',
    knight: 'ronin_aggressor',
    huscarl: 'ronin_spear_counter',
    glaivier: 'ronin_spear_counter',
  }),
  knight: Object.freeze({
    spearman: 'knight_balanced_guard',
    ronin: 'knight_ronin_guard',
    huscarl: 'knight_bulwark',
    glaivier: 'knight_ronin_guard',
  }),
  huscarl: Object.freeze({
    spearman: 'aggressor',
    ronin: 'huscarl_raider',
    knight: 'scrapper',
    glaivier: 'skirmisher',
  }),
  glaivier: Object.freeze({
    spearman: 'glaivier_press',
    ronin: 'glaivier_counter',
    knight: 'glaivier_guard',
    huscarl: 'glaivier_counter',
  }),
});

export function resolveHardAIProfile(charId, opponentCharId = null) {
  const matchupProfiles = HARD_AI_MATCHUP_PROFILE_MAP[charId];
  return matchupProfiles?.[opponentCharId] ?? DEFAULT_HARD_AI_PROFILES[charId] ?? 'hard';
}
