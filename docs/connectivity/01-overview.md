# Connectivity Module

The connectivity system controls whether Veyra uses internet-dependent features based on user preference and system network status.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/connectivity/connectivity-types.ts` | Type definitions |
| `src/lib/connectivity/connectivity-service.ts` | Connectivity resolution logic |
| `src/lib/connectivity/provider-connectivity.ts` | Provider-specific connectivity checks |
| `src/lib/connectivity/feature-capabilities.ts` | Feature availability based on connectivity |
| `src/lib/connectivity/useConnectivity.ts` | React hook for connectivity state |
| `src/stores/connectivity-store.ts` | Zustand connectivity store |

## Preferences

| Preference | Description |
|------------|-------------|
| `auto` | Detect network status automatically |
| `online` | Force online mode (internet features enabled) |
| `offline` | Force offline mode (privacy mode — no internet features) |

## Effective Connectivity

Resolves user preference against system network status:
- `offline` preference always results in `offline`
- `online` preference always results in `online`  
- `auto` checks actual system network status

## Requirements

| Requirement | Description |
|-------------|-------------|
| `none` | No connectivity needed |
| `local_service` | Requires local service (LM Studio, Docker) |
| `internet` | Requires internet access |
