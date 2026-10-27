# Chat Reasoning Levels

The composer's reasoning control selects how much thinking the active model may spend. The options are not guessed from a model name: each one comes from a source that knows the model.

## Sources, in priority order

| Source | Applies to | Notes |
|--------|------------|-------|
| LM Studio `/api/v1/models` | `lm-studio` models | Authoritative for normal chat, which talks to the endpoint directly. Read from `capabilities.reasoning.allowed_options`. |
| Pi model registry | Every other provider, and local models without a published configuration | Uses `getSupportedThinkingLevels` and `clampThinkingLevel` from the installed Pi SDK. See [agents/07-reasoning](../agents/07-reasoning.md). |

Normal chat bypasses Pi, so an endpoint that publishes its own reasoning options must win over Pi's registry. Otherwise a model could offer levels the request cannot use.

## Controls

The composer keeps a compact pill showing the current level. Clicking it opens a popover with a discrete slider whose stops are the model's advertised levels, plus the active level name, a chevron that expands the full option list, a capability note, and Refresh. The slider and list write the same setting, so either path is one change. The popover is portaled above the composer so it is never clipped by the input container.

- **Effort models** advertise several levels and get a slider limited to those levels.
- **Boolean models** advertise `off`/`on` in LM Studio, or a `thinkingFormat` transport in Pi, and get a switch instead of a slider inside the popover.
- **Mandatory reasoning** models do not expose `off`; the switch is replaced by a fixed label.
- **Model managed** endpoints configure reasoning themselves, so the pill is disabled.
- **Unknown** endpoints publish nothing. Veyra sends no reasoning field rather than guessing.

## Request mapping

LM Studio rejects a reasoning setting the model does not advertise, so a requested level is clamped to the closest advertised one before the request is built.

- Native `/api/v1/chat` uses a single `reasoning` field (`off`, `on`, `low`, `medium`, `high`).
- OpenAI-compatible `/v1/chat/completions` — used when tools are active — uses `reasoning_effort`, where disabled reasoning is spelled `none` and there is no `on` value.
- When no options are known, no field is sent and the endpoint applies its own default.

Selections are remembered per provider, model, and endpoint. Switching models discards stale results, and Refresh re-reads both the endpoint and the Pi registry.
