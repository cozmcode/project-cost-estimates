# Resource Optimization Engine (Staffing) - Feature Specifications

## Overview
The Resource Optimization Engine is a decision-support tool designed to match a global roster of employees to international project demands. This document reflects the current implementation used by the Staffing tab in `app.html` and the logic in `js/staffing-engine.js`. There is a separate, older optimisation flow inside `js/app-logic.js` that is not wired to the Staffing tab; it should be reconciled later if you want a single source of truth.

---

## 1. Input Parameters (Current UI)

### Project Demand (The "Need")
The user defines the requirements for the deployment:
- Destination Country: Brazil, USA, Singapore (current select options in `app.html`).
- Role Required: Lead Engineer, Senior Technician, Project Manager.
- Headcount: 1, 2, 3, or 5 (no 4 in the UI).
- Duration: 3, 6, or 12 months.

### Supply Source (The "Roster")
The engine currently loads a mock roster from `js/mock-data.js`:
- Current size: 5 demo employees in `MOCK_DATA.employees` (the "158 Employees Loaded" label in the UI is placeholder text).
- Fields used: first_name, last_name, nationality, current_location, role, base_salary_eur, skills.

### Optimization Weights (The "Sliders")
The user adjusts three sliders (0-100) to indicate priorities:
- Speed: prioritise candidates who can deploy quickly.
- Cost: prioritise lower base salary and cheaper travel.
- Compliance: prioritise lower legal risk.

Weights are normalised so they sum to 1 before scoring. If all three sliders are 0, the engine falls back to ~0.33 for each weight.

---

## 2. The Logic Engine (Current Behaviour)

### Step A: Filtering
Candidates are filtered by role only. Skills are not currently used for filtering or scoring.

### Step B: Scoring Algorithms

#### Speed Score (Visa Logic)
- If the candidate is already in the destination country, speed score is 100 and visa type is "Already in Country".
- Otherwise the engine looks up visa rules by `${nationality}_${destination}` in `MOCK_DATA.visaRules`.
- If no rule is found, it uses a default of 30 days with type "Standard Application".
- Score formula: `max(0, 100 - days * 1.6)`, which reaches 0 at 62.5 days.
- Example: 25 days -> 60 points, 60 days -> 4 points.

#### Cost Score (Base Salary + Flight)
- Total assignment cost = `(base_salary_eur * durationMonths) + flightCost`.
- Flight costs are looked up by `${current_location}_${destination}` in `MOCK_DATA.flightCosts`.
- If no route is found, the fallback flight cost is 1000 EUR.
- Score anchors are fixed: 30,000 EUR -> 100 points, 100,000 EUR -> 0 points, clamped.
- This score is not normalised to the candidate pool and does not scale with duration.

#### Compliance Score (Risk Logic)
- Default score is 100.
- If visa type contains "Tourist" or "Waiver" AND destination is Brazil AND duration > 1 month, the score drops to 50 and a risk note is attached.
- There are no other jurisdiction-specific penalties yet.

### Step C: Weighted Ranking
Final score is the weighted sum of the three scores using the normalised weights, rounded to a whole number. The engine returns the top N candidates only (no alternates).

---

## 3. Data Sources (Mock/Prototype)

### Visa Rules Matrix (Current Rules)
| Origin | Destination | Type | Wait Time |
| :--- | :--- | :--- | :--- |
| Finland | Brazil | Visa Waiver (90 days) | 0 days |
| Portugal | Brazil | Visa Waiver | 0 days |
| India | Brazil | Consular Visa Required | 25 days |
| UK | Brazil | Visa Waiver | 0 days |
| Finland | USA | ESTA Waiver | 3 days |
| Portugal | USA | ESTA Waiver | 3 days |
| India | USA | B1/B2 Interview Required | 60 days |
| Finland | Singapore | Employment Pass | 14 days |
| India | Singapore | Employment Pass | 21 days |

If a rule is missing, the engine uses a 30-day "Standard Application" fallback.

### Flight Cost Estimates (Current Rules)
- Finland -> Brazil: 1200
- Portugal -> Brazil: 800
- India -> Brazil: 1500
- UAE -> Brazil: 1300
- Brazil -> Brazil: 0
- Finland -> USA: 900
- Portugal -> USA: 700
- India -> USA: 1100
- Finland -> Singapore: 1000
- India -> Singapore: 400
- UAE -> Singapore: 500

If a route is missing, the engine uses a 1000 EUR fallback.

---

## 4. User Interface Results (Staffing Tab)
The results table shows:
- Rank: #1, #2, etc.
- Candidate: name, nationality, and current location.
- Visa Status (Speed): green badge for 0 days, orange otherwise, with processing days shown.
- Est. Cost: total assignment cost in EUR.
- AI Score: final weighted score (0-100).
- Action: Select button (currently does not trigger additional logic).

Risk notes are computed in the engine but not displayed in the table.

---

## 5. Accuracy Notes and Improvement Candidates
- Replace the mock roster with real data and update the UI roster count so it is not misleading.
- Add skills-based filtering or weighting; currently skills only display in data and do not influence scoring.
- Make cost anchors dynamic (by duration or relative to the candidate pool) to avoid skewed scoring.
- Expand compliance logic beyond Brazil waiver rules, and document jurisdiction-specific thresholds.
- Consider using location-based visa rules rather than nationality-only rules.
