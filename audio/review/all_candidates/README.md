# All Candidates

Merged review library from the original shortlist plus all later rounds.

Included source sets:
- udio/review/candidates as seed
- udio/review/itch_pass/candidates
- udio/review/round2/candidates
- udio/review/round3/candidates
- udio/review/round4/candidates
- udio/review/round5/candidates
- udio/review/round6/candidates

Rules:
- merged by usage/category folder
- duplicates removed by SHA-256 file hash, not by filename
- surviving files are prefixed with their source set, e.g. ound5__...wav

Files:
- manifest.csv: every copied file and its origin
- duplicates-skipped.csv: duplicate files that were omitted because identical content was already kept

Notes:
- this is a review library only, no runtime wiring changes
- licensing status still depends on the source set; use the source README files for that context
