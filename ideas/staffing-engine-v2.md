# Feature Branch: staffing-engine-v2

## Branch Purpose
This branch implements 4 major improvements to the FSE Deployment Cost Calculator, focusing on the **Staffing Engine** (Resource Optimization Engine) module.

## Current Status: IN PROGRESS

---

## Features Being Implemented

### 1. ✅ Async Visa API Integration (DONE)
**File:** `js/staffing-engine.js`

**Changes Made:**
- Converted `optimizeTeam()` to async function
- Converted `calculateScores()` to async function
- Added `fetchVisaRequirements(nationality, destination)` helper method
- Updated scoring logic to use `Promise.all()` for parallel candidate evaluation
- Changed visa data format from `{days, type}` to `{waitDays, visaType}` for API compatibility

**Ready for real API:**
Replace the `fetchVisaRequirements` method body with:
```javascript
const response = await fetch(`https://api.sherpa.io/v2/requirements?origin=${nationality}&destination=${destination}`);
const data = await response.json();
return { waitDays: data.processingDays, visaType: data.visaCategory };
```

### 2. ✅ Carbon Footprint Data (DONE)
**File:** `js/mock-data.js`

**Changes Made:**
- Added `carbonFootprint` object with kg CO2 estimates per route
- Data based on IATA/ICAO methodology for economy class flights

**TODO:**
- Add `sustainabilityScore` to `calculateScores()` in staffing-engine.js
- Add 4th slider for "Sustainability" weight in UI
- Display CO2 badge in results table

### 3. 🔲 Real-Time Tax API (NOT STARTED)
**Proposed:**
- Create Edge Function wrapper for Sprintax or similar API
- Replace hardcoded brackets in `tax-rules.json` with live lookup

### 4. 🔲 Cost-of-Living Per Diem Suggestions (NOT STARTED)
**Proposed:**
- Integrate Numbeo API for city-level cost data
- Add "Recommended Top-Up" alert when statutory per diem < 50% of actual costs

---

## Files Modified

| File | Status | Notes |
|------|--------|-------|
| `js/staffing-engine.js` | Modified | Async visa logic |
| `js/mock-data.js` | Modified | API-compatible format + CO2 data |
| `index.html` | Needs Update | `runOptimization()` must be async |
| `app.html` | Needs Update | Same as above |

---

## How to Continue This Work

### Step 1: Update UI to handle async engine
In both `index.html` and `app.html`, find the `runOptimization()` function and change:
```javascript
// FROM:
const results = staffingEngine.optimizeTeam(project, weights);

// TO:
const results = await staffingEngine.optimizeTeam(project, weights);
```
Also add `async` keyword to the function declaration.

### Step 2: Add Sustainability Slider
Add a 4th slider in the Staffing Engine UI:
```html
<div>
    <div class="flex justify-between text-sm mb-2">
        <span class="font-medium text-gray-300">Sustainability (CO2)</span>
        <span class="text-green-400 font-bold" id="label-sustainability">50%</span>
    </div>
    <input type="range" id="slider-sustainability" min="0" max="100" value="50" ...>
</div>
```

### Step 3: Add Sustainability Score to Engine
In `staffing-engine.js`, add to `calculateScores()`:
```javascript
// --- Sustainability Score (Carbon Logic) ---
const carbonKey = `${candidate.current_location}_${project.country}`;
const carbonKg = MOCK_DATA.carbonFootprint[carbonKey] || 1500;
// 0 kg = 100pts, 2500 kg = 0pts
let sustainabilityScore = Math.max(0, 100 - (carbonKg / 25));
```

### Step 4: Update Weighted Scoring
Modify the final score calculation to include 4 weights instead of 3.

---

## Testing Checklist
- [ ] Run Engine with Speed=100 - Finnish candidates should rank higher for Brazil
- [ ] Run Engine with Cost=100 - Indian/Portuguese candidates should rank higher
- [ ] Run Engine with Compliance=100 - Avoid waiver-based travel for long projects
- [ ] Verify async loading works (no UI freeze)
- [ ] Check console for errors

---

## Git Commands
```bash
# Check current status
git status

# Commit current progress
git add .
git commit -m "WIP: Async visa logic + carbon footprint data"

# Push to remote
git push -u origin feature/staffing-engine-v2
```
