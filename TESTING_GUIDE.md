# FSE Cost Calculator - Testing Guide

This guide provides step-by-step instructions for authorized users to log in and test the FSE Deployment Cost Calculator, including the new Analytics tab and Voice Command features.

## 1. Authentication

The application is gated. Only pre-approved email addresses can access the calculator.

**Authorized Test Accounts:**
- `benjamin.oghene@thecozm.com`
- `khadeeja001@hotmail.com`
- `siobhan@thecozm.com`

**Login Steps:**
1. Navigate to: [https://cozmcode.github.io/project-cost-estimates/](https://cozmcode.github.io/project-cost-estimates/)
2. Enter your email address in the sign-in box.
3. Click **"Continue"**.
4. Check your email inbox for a **"Magic Link"** or **"Verification Code"** (8 digits).
   - *Note: Check Spam/Junk folder if not received within 1 minute.*
5. Enter the 8-digit code if prompted.
6. You will be redirected to the main dashboard.

---

## 2. Manual Testing (The "Happy Path")

### A. Cost Analysis Tab (Default)
1. **Inputs:**
   - **Home Country:** Select "Finland".
   - **Host Country:** Select "Brazil".
   - **Monthly Salary:** Enter `5000`.
   - **Assignment Length:** Enter `6` months.
2. **Action:**
   - Observe the **"Daily Allowance"** field auto-populate (e.g., €72 for Brazil).
   - Observe the **"Total Assignment Cost"** update automatically at the bottom.
3. **Verify:**
   - Check the **"Calculation Workings"** breakdown (click to expand).
   - Verify that **Per Diem** is calculated as Tax-Exempt.
   - Verify that **Social Security** shows a "No Reciprocal Agreement" warning for Brazil (if applicable).

### B. Staffing Engine Tab
1. Click the **"Staffing Engine"** tab at the top.
2. **Project Demand:**
   - Destination: "USA".
   - Role: "Lead Engineer".
   - Duration: "6 Months".
3. **Optimisation:**
   - Click the **"Lowest Cost"** preset card.
   - Click the **"Run Engine"** button.
4. **Results:**
   - Wait for the spinner (~1 second).
   - A list of candidates should appear.
   - Verify that candidates have a **CO2 Badge** (e.g., "1200 kg CO2") and a **Visa Status** badge.

### C. Analytics Tab (New)
1. Click the **"Analytics"** tab at the top.
2. **Verify:**
   - **Roster Overview** cards are visible (Total Engineers, Deployment Ready).
   - **Global Cost Trends** list shows monthly costs for Brazil, USA, etc.

---

## 3. Voice Command Testing

The app supports voice commands to navigate and control the calculator.

**Setup:**
1. Ensure your device has a microphone.
2. Click the **"Voice"** button (microphone icon) in the header.
3. Allow microphone permissions if prompted.
4. The button should turn **Red** (Listening).

**Test Commands:**

| Action | Command to Say | Expected Outcome |
| :--- | :--- | :--- |
| **Navigation** | "Go to Staffing" | Switches to Staffing Engine tab |
| | "Show Analytics" | Switches to Analytics tab |
| | "Back to Calculator" | Switches to Cost Analysis tab |
| **Calculator Input** | "Set home country to Finland" | Updates Home Country dropdown |
| | "Set host country to Singapore" | Updates Host Country dropdown |
| | "Salary is 8000 euros" | Updates Monthly Salary field |
| | "Duration is 12 months" | Updates Assignment Length field |
| **Optimisation** | "Run optimization" | Triggers the "Run Engine" button on Staffing tab |
| **Queries** | "What is the tax rate in Brazil?" | Voice response with Brazil's tax rate |

**Troubleshooting:**
- If voice recognition fails, ensure you are in a quiet environment.
- Speak clearly and at a normal pace.
- Check the console (F12 > Console) for any "Speech Recognition" errors.

---

## 4. Reporting Issues

If you encounter bugs or "infinite loading" screens:
1. **Clear Data:** Click the **"Log Out"** button to clear your session.
2. **Hard Refresh:** Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac).
3. **Contact:** Report the issue to Benjamin with a screenshot.
