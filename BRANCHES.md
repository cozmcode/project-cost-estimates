# FSE Deployment Cost Calculator - Branch Overview

**Live URL**: https://cozmcode.github.io/project-cost-estimates
**Repository**: https://github.com/Cozmcode/project-cost-estimates

---

## Branch Summary

| Branch | Status | Purpose | Key Changes |
|--------|--------|---------|-------------|
| `main` | Production | Live on GitHub Pages | Core calculator + basic staffing engine |
| `staffing-spec-alignment` | Active Development | Aligning staffing engine with specs | Voice commands, async visa API, carbon footprint |
| `feature/voice-commands` | Feature Branch | Voice assistant integration | Kokoro TTS voice commands |
| `feature/staffing-engine-v2` | Feature Branch | Staffing engine improvements | Netlify branch deploy config |

---

## Branch Details

### 1. `main` (Production)

**Deployed to**: https://cozmcode.github.io/project-cost-estimates

The stable production branch containing:
- FSE cost calculator with tax/social security calculations
- Basic staffing engine (Resource Optimisation Engine)
- OTP-based authentication via Supabase
- Settings modal for host country social security toggles
- Portugal per diem with city selectors

**Recent commits**:
- `551d181` Add Netlify config for branch deploy previews
- `4b0167e` Port Staffing Engine UI to index.html (Main Entry Point)
- `30263bd` Merge Staffing Engine and restore tax bracket updates
- `6dd3e0f` Implement Resource Optimisation Engine (Staffing)

---

### 2. `staffing-spec-alignment` (Current Active Branch)

**Purpose**: Aligning the staffing engine implementation with the specification document.

**Key features added** (vs main):
- Voice commands integration with OpenAI Realtime API
- Async visa requirement API calls
- Carbon footprint display in Staffing Engine
- Updated handoff documentation for LLM continuity
- Calculator and staffing engine bug fixes

**Files changed** (vs main):
| File | Changes |
|------|---------|
| `STAFFING_ENGINE_SPECS.md` | +115 lines - New spec document |
| `js/voice-commands.js` | +489 lines - Voice assistant module |
| `js/app-logic.js` | +647 lines - Enhanced calculation logic |
| `ideas/staffing-engine-v2.md` | +224 lines - V2 planning document |
| `app.html` | UI updates for voice commands |
| `css/app.css` | +171 lines - Voice UI styling |

**Recent commits**:
- `cfa8f04` Fix calculator and staffing engine critical bugs
- `b7b2761` Update handoff documentation for LLM continuity
- `4205120` Implement async visa API + carbon footprint display
- `13e70b2` Update Portugal per diem source
- `757b4b3` Update staffing engine spec

**Uncommitted changes**:
- `app.html` - Minor changes (+4 lines)
- `js/voice-commands.js` - Major refactor (+731/-233 lines)
- `supabase/functions/realtime-token/` - New OpenAI Realtime API token generator
- `supabase/functions/tts/` - New OpenAI TTS proxy function

---

### 3. `feature/voice-commands`

**Purpose**: Voice assistant integration using Kokoro TTS.

**Key features** (vs main):
- Kokoro TTS voice commands feature
- Voice UI components in app.html
- Voice command styling

**Files changed** (vs main):
| File | Changes |
|------|---------|
| `js/voice-commands.js` | +469 lines - Voice module |
| `app.html` | +41 lines - Voice UI |
| `css/app.css` | +166 lines - Voice styling |

**Note**: This branch was the starting point for voice features. The `staffing-spec-alignment` branch has evolved this further with OpenAI Realtime API integration.

---

### 4. `feature/staffing-engine-v2`

**Purpose**: Staffing engine version 2 improvements.

**Files changed** (vs main): None - only differs by Netlify config commit hash.

**Status**: This branch appears to track `main` closely with only the Netlify deployment config difference.

---

## Current Work in Progress

### Uncommitted Changes on `staffing-spec-alignment`

#### 1. Voice Commands Refactor (`js/voice-commands.js`)
Major refactoring (+731/-233 lines) likely implementing:
- OpenAI Realtime API integration (WebRTC-based)
- Function calling for calculator controls
- Enhanced voice activity detection

#### 2. New Supabase Edge Functions

**`supabase/functions/realtime-token/`**
- Generates ephemeral tokens for OpenAI Realtime API
- Includes system instructions and tool definitions
- Uses `gpt-realtime-mini` model with Nova voice
- Server-side VAD (voice activity detection)

**`supabase/functions/tts/`**
- Proxies TTS requests to OpenAI
- Keeps API key secure server-side
- Uses `tts-1` model with configurable voice

---

## Merge Strategy

1. **`feature/voice-commands`** → Can be closed (superseded by staffing-spec-alignment)
2. **`feature/staffing-engine-v2`** → Minimal differences, can be deleted
3. **`staffing-spec-alignment`** → Complete uncommitted work, then merge to `main`

---

## Testing URLs

| Branch | URL |
|--------|-----|
| `main` | https://cozmcode.github.io/project-cost-estimates |
| Other branches | Use Netlify branch deploys if configured |

---

*Last updated: 25 January 2026*
