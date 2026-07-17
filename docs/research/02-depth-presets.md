# Research Depth Presets

| Preset | Rounds | Max Sources | ArXiv | Wikipedia | Contradiction | Audit |
|--------|--------|-------------|-------|-----------|---------------|-------|
| `lightning` | 1 | 15 | No | No | No | No |
| `quick` | 3 | 35 | No | No | No | Yes (5 citations) |
| `standard` | 5 | 75 | No | Yes | No | Yes |
| `deep` | 8 | 150 | Yes | Yes | Yes (200 pairs) | Yes |
| `exhaustive` | 10 | 300 | Yes | Yes | Yes (500 pairs) | Yes |

## Configuration

Each preset configures 31 parameters including:
- `searchRounds`, `maxSources`, `queriesPerStep`
- `perSourceRead`, `crossSourceVerify`
- `contradictionDetect`, `contradictionMaxPairs`, `contradictionTopK`
- `gapAnalysis`, `selfCritiquePass`
- `maxSections`, `sectionMaxWords`
- `reasoningEnabled`, `enableArxiv`, `enableWikipedia`
- `adaptiveDeepening`, `auditMaxCitations`

Config is defined in `src/modules/research/research-config.ts`. Custom profiles are supported.
