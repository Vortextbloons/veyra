# Model-specific agent reasoning

Veyra reads the installed Pi SDK's model registry, including the user's `.pi/agent/models.json`, and uses Pi's `getSupportedThinkingLevels` and `clampThinkingLevel`. No provider requests, auth-file reads, model-name heuristics, or additional SDK installation are needed for the lookup. Registry access uses an in-memory credential store, and the bridge returns only provider/model identity and reasoning capabilities.

The installed SDK inspected during implementation was Pi 0.80.6. Its catalogs already distinguish models with extra-high effort from models with max effort. Pi's `thinkingLevelMap` can set an unsupported level to `null`; this also handles models whose reasoning cannot be turned off.

## Controls and synchronization

- Effort-capable models show only the levels Pi advertises for that exact model.
- Boolean thinking adapters such as Qwen and Together show on/off rather than imply they can apply several effort levels.
- Models without reasoning support show a disabled No reasoning control.
- Compatible endpoints declaring `supportsReasoningEffort: false` without another thinking transport show Model managed.
- Unknown or ambiguous model routes show Reasoning unknown. Veyra does not guess capabilities from a model's name.

Selections are remembered per provider, model, and endpoint. A model switch immediately discards stale capability results. Refresh reloads Pi metadata after a configuration change. Runs recheck the registry and clamp the requested level with Pi's own helper. The CLI receives separate `--provider`, `--model`, and `--thinking` arguments, preserving slash-containing model IDs.

Provider IDs are matched first. A custom provider name can resolve through a unique exact endpoint/model match. A different endpoint or an ambiguous match is rejected instead of silently routing to another provider. Custom endpoints still need to be configured and authenticated in Pi.

LM Studio setup adds missing models to `models.json` while preserving existing providers, models, compatibility options, and thinking mappings. New local models default to unverified reasoning support instead of being marked reasoning-capable because the user selected a level. Configure verified capabilities in Pi before enabling their controls. Reasoning metadata describes what Pi can request; the endpoint remains responsible for honoring it.

Lookup subprocesses are cached in the UI, run off the Tauri command thread, and have a deadline. Stop also cancels startup during capability inspection so a cancelled task cannot subsequently launch the agent.

## References

- [Pi model configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md)
- [Pi AI model helpers](https://github.com/earendil-works/pi/blob/main/packages/ai/src/models.ts)
- [Pi RPC integration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)

The installed version's source and exports take precedence over newer online documentation.
