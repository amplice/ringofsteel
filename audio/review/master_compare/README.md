# Master Compare

Single review library for side-by-side comparison.

What is here:
- all unique candidate files from every earlier review source set
- explicit `CURRENT__...` files copied into each slot folder for what the game is currently using live

Use this instead of jumping between rounds.

Layout:
- `candidates/<slot>/...`
- examples:
  - `attack_start/knight_heavy`
  - `defense/block`
  - `hit/thrust`
  - `movement/footstep`

Files:
- `current-live-files.csv`: maps each live runtime sound to the `CURRENT__...` compare copy
- `candidates/`: all unique options grouped by slot

Notes:
- candidate files are still prefixed by source set, e.g. `seed__`, `round5__`, `round6__`
- `CURRENT__...` entries are there only to make the live choice obvious in the same folder
