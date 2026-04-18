# Round 2 Sound Review

This is the second-pass candidate set for everything after `attack_start`.

Scope:
- `defense/*`
- `hit/*`
- `movement/*`
- `ui/*`
- `system/*`

Approach:
- prefer free itch packs with explicit `CC BY 4.0` or clearly permissive terms
- keep a few older `CC0` carry-overs only where they are still useful
- do not assume these are final; they are review folders

## Main Sources

| Key | Source | License | URL |
|---|---|---|---|
| swords_blades_pack_ccby | Swords & Blades Sound Pack | CC BY 4.0 | https://thesoundrack.itch.io/swords-blades-sound-pack |
| tagirijus_whooshes_ogg | Whoosh Sound Effects | CC BY 4.0 | https://tagirijus.itch.io/whoosh-sound-effects |
| ivy_weaponry_ccby | Weaponry Sound Pack | CC BY 4.0 | https://ivyism.itch.io/weaponry-pack |
| potion_synth_booster_ui | synth booster - ui audio pack | CC BY 4.0 | https://potion-of-midi.itch.io/synth-booster-ui-audio-pack |
| hove_sword_pack_free | Sword Combat Sound Effects Pack Free Version | Custom permissive / royalty-free | https://hoveaudio.itch.io/sword-combat-sound-effects-pack-free-version |
| carryover_cc0 | earlier review library carry-overs | CC0 | see `audio/review/README.md` |

## Folder Intent

- `defense/block`
  - muted guard contact
- `defense/parry`
  - bright, precise deflection
- `defense/clash`
  - bigger steel-on-steel event
- `hit/light`
  - crisp, short confirms
- `hit/heavy`
  - weightier contact with more body
- `hit/thrust`
  - narrower, sharper impact
- `movement/sidestep`
  - short lateral burst
- `movement/backstep`
  - retreat burst
- `movement/footstep`
  - hard-floor arena steps
- `ui/menu_confirm`
  - positive selection / accept
- `ui/menu_back`
  - cancel / back / close
- `ui/round_start`
  - short pre-fight / fight-call accent
- `ui/round_win_ko`
  - round-end / KO accent
- `system/ring_out`
  - bigger out-of-arena cue

## Notes

- `movement/footstep` stayed CC0 carry-over because I did not find a clearly better free itch candidate worth adding right now.
- `system/ring_out` uses the Hove `Ring FX` candidates because they are much more on-theme than the older generic bells.
- `ui/*` got a real itch pass via `synth booster`, with CC0 Kenney carry-overs only as grounded alternatives.
- `attack_start` is already chosen and wired separately; this folder is only for the remaining roles.
