# Feature Branch: staffing-engine-v2

## Branch Purpose
This branch implements 4 major improvements to the FSE Deployment Cost Calculator, focusing on the **Staffing Engine** (Resource Optimization Engine) module.

## Current Status: IN PROGRESS (Partially Complete)
**Last Updated:** 2026-01-25 11:30 UTC
**Branch:** `feature/staffing-engine-v2`
**Remote:** Pushed to `origin/feature/staffing-engine-v2`

---

## Features Being Implemented

### 1. ✅ Async Visa API Integration (COMPLETE)
**Files Modified:** `js/staffing-engine.js`

**Changes Made:**
- Converted `optimizeTeam()` to async function (line 15)
- Converted `calculateScores()` to async function (line 45)
- Added `fetchVisaRequirements(nationality, destination)` helper method (lines 107-112)
- Updated scoring loop to use `Promise.all()` for parallel candidate evaluation (line 20)
- Changed visa data format from `{days, type}` to `{waitDays, visaType}` for API compatibility

**Current State:**
The method `fetchVisaRequirements` currently returns mock data from `MOCK_DATA.visaRules`. It is structured to be easily replaced with a real API call.

**Ready for real API - replace the method body with:**
```javascript
async fetchVisaRequirements(nationality, destination) {
    const response = await fetch(`https://api.sherpa.io/v2/requirements?origin=${nationality}&destination=${destination}&apiKey=YOUR_KEY`);
    const data = await response.json();
    return { waitDays: data.processingDays || 30, visaType: data.visaCategory || 'Standard' };
}
```

---

### 2. ✅ Carbon Footprint Display (COMPLETE)
**Files Modified:** `js/mock-data.js`, `index.html`

**Changes Made:**
- Added `carbonFootprint` object to `MOCK_DATA` with kg CO2 estimates per route (lines 97-113 in mock-data.js)
- Data based on IATA/ICAO methodology for economy class flights
- Updated `runOptimization()` in `index.html` to display CO2 badge in results table
- Added color-coded display: green (<500kg), yellow (<1500kg), red (≥1500kg)

**Current Routes Covered:**
| Route | CO2 (kg) |
|-------|----------|
| Finland → Brazil | 1850 |
| Portugal → Brazil | 1420 |
| India → Brazil | 2100 |
| UAE → Brazil | 1650 |
| Finland → USA | 1200 |
| Portugal → USA | 1050 |
| India → USA | 2400 |
| Finland → Singapore | 1580 |
| India → Singapore | 450 |
| UAE → Singapore | 680 |

**NOT YET IMPLEMENTED:**
- Sustainability slider in UI (4th optimization weight)
- `sustainabilityScore` in `calculateScores()` method
- Integration with real CO2 API (e.g., IATA CO2 Connect, Climatiq)

---

### 3. 🔲 Real-Time Tax API (NOT STARTED)
**Files to Modify:** `js/app-logic.js`, possibly new `js/tax-api.js`

**Proposed Approach:**
1. Create a Supabase Edge Function or Cloudflare Worker as a proxy to the tax API
2. Replace hardcoded brackets in `js/tax-rules.json` with live lookup
3. Cache results for 24 hours to avoid excessive API calls
4. Fallback to static JSON if API fails

**Recommended Provider:** Sprintax (specialized in non-resident tax)

**Research Notes:**
- Finland has no social security agreement with Brazil (confirmed Jan 2026)
- Finland signed agreement with Uruguay in Oct 2025 (pending ratification)
- Brazil has agreements with: Belgium, Canada, France, Germany, Italy, Japan, USA

---

### 4. 🔲 Cost-of-Living Per Diem Suggestions (NOT STARTED)
**Files to Modify:** `index.html`, `js/app-logic.js`

**Proposed Approach:**
1. Integrate Numbeo API for city-level cost data
2. Add city selector when user picks a host country
3. Fetch real-time "Meal, Inexpensive Restaurant" and "Hotel" indices
4. Calculate "actual daily cost" = meal × 3 + hotel
5. Compare to statutory per diem rate
6. Show "⚠️ Recommended Top-Up: €XX" alert if statutory < 50% of actual

**Numbeo API Example:**
```javascript
const response = await fetch('https://www.numbeo.com/api/city_prices?api_key=KEY&query=San%20Francisco');
const data = await response.json();
const mealCost = data.prices.find(p => p.item_id === 1)?.average_price;
```

---

## Files Modified in This Branch

| File | Status | Summary |
|------|--------|---------|
| `js/staffing-engine.js` | ✅ Modified | Async visa logic, Promise.all scoring |
| `js/mock-data.js` | ✅ Modified | API-compatible visa format, CO2 data added |
| `index.html` | ✅ Modified | Async runOptimization, CO2 display in results |
| `ideas/staffing-engine-v2.md` | ✅ Created | This documentation |
| `app.html` | ⚠️ NEEDS UPDATE | Has old sync runOptimization (duplicate code) |
| `STAFFING_ENGINE_SPECS.md` | ℹ️ Exists | User-created spec doc |

---

## Known Issues

1. **Duplicate Code:** `runOptimization()` exists in both `index.html` and `app.html`. Only `index.html` has been updated. The `app.html` version will break because it calls the now-async `optimizeTeam()` synchronously.

2. **IDE Lint Errors:** The IDE shows false-positive lint errors for template literals inside `<script>` tags. These are not real JavaScript errors.

3. **Missing Routes:** Some flight routes (e.g., UK → Brazil, Portugal → Singapore) are missing from `flightCosts` and `carbonFootprint`. The engine uses fallback values (1000 EUR, 0 kg CO2).

---

## How to Continue This Work

### Priority 1: Fix app.html (CRITICAL)
Copy the updated `runOptimization()` function from `index.html` (lines 837-925) to `app.html`. The exact location in app.html is in the inline `<script>` tag near the end of the file.

### Priority 2: Add Sustainability Slider
1. Add HTML for 4th slider in Staffing Engine UI (both files):
```html
<!-- Sustainability Slider -->
<div>
    <div class="flex justify-between text-sm mb-2">
        <span class="font-medium text-gray-300">Sustainability (CO2)</span>
        <span class="text-green-400 font-bold" id="label-sustainability">50%</span>
    </div>
    <input type="range" id="slider-sustainability" min="0" max="100" value="50"
        class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-400"
        oninput="updateOptimization()">
</div>
```

2. Update `updateOptimization()` to include sustainability label

3. Update `runOptimization()` to read 4th weight:
```javascript
const weights = {
    speed: parseInt(document.getElementById('slider-speed').value),
    cost: parseInt(document.getElementById('slider-cost').value),
    compliance: parseInt(document.getElementById('slider-compliance').value),
    sustainability: parseInt(document.getElementById('slider-sustainability').value)
};
```

4. Add `sustainabilityScore` to `calculateScores()` in `staffing-engine.js`:
```javascript
// --- Sustainability Score (Carbon Logic) ---
const carbonKey = `${candidate.current_location}_${project.country}`;
const carbonKg = MOCK_DATA.carbonFootprint?.[carbonKey] || 1500;
// 0 kg = 100pts, 2500 kg = 0pts
const sustainabilityScore = Math.max(0, Math.round(100 - (carbonKg / 25)));
```

5. Update weighted scoring to include 4 weights instead of 3

### Priority 3: Test Everything
- [ ] Run Engine with Speed=100 - Finnish candidates should rank higher for Brazil
- [ ] Run Engine with Cost=100 - Indian/Portuguese candidates should rank higher  
- [ ] Run Engine with Compliance=100 - Avoid waiver-based travel for long projects
- [ ] Verify async loading works (loading spinner appears)
- [ ] Check console for errors
- [ ] Verify CO2 badges display correctly with color coding

---

## Git Commands

```bash
# Check current branch
git branch

# See what's changed
git status
git diff

# Commit and push
git add .
git commit -m "Your message"
git push origin feature/staffing-engine-v2

# When ready to merge
git checkout main
git merge feature/staffing-engine-v2
git push origin main
```

---

## API Research Summary

### Visa APIs (for Priority 1)
- **Sherpa:** Requirements API with eVisa integration
- **Travel Buddy AI:** Free tier, 200+ passports, 210 destinations
- **Zyla API Hub:** Visa Checker API

### Carbon APIs (for Priority 2)
- **IATA CO2 Connect:** Industry standard, uses real airline data
- **Amadeus Flight Emissions:** Part of Flight Offers API
- **Climatiq:** GHG Protocol compliant, broad coverage

### Tax APIs (for Priority 3)
- **Sprintax:** Non-resident tax specialist
- **Quaderno:** VAT/GST focus, 100+ countries

### Cost-of-Living APIs (for Priority 4)
- **Numbeo:** City-level prices, free tier available
- **Expatistan:** Cost of living comparisons
