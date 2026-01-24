// FSE Deployment Cost Calculator - Application Logic
// Handles calculations, staffing optimisation, and UI interactions

// Tax rules loaded from JSON (will be fetched on page load)
let taxRules = null;

// ===== SETTINGS MANAGEMENT =====
// Settings persist to localStorage and affect SS calculations globally

const SETTINGS_STORAGE_KEY = 'fse-calculator-settings';

// Default settings
const defaultSettings = {
    includeSSNoAgreement: true,   // Include host SS when NO reciprocal agreement (default: ON)
    includeSSWithAgreement: false // Include host SS when agreement EXISTS (default: OFF)
};

// Load settings from localStorage
function loadSettings() {
    try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...defaultSettings, ...parsed };
        }
    } catch (e) {
        console.warn('Failed to load settings:', e);
    }
    return { ...defaultSettings };
}

// Save settings to localStorage
function saveSettings() {
    try {
        const settings = {
            includeSSNoAgreement: document.getElementById('settingSSNoAgreement')?.checked ?? defaultSettings.includeSSNoAgreement,
            includeSSWithAgreement: document.getElementById('settingSSWithAgreement')?.checked ?? defaultSettings.includeSSWithAgreement
        };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        console.log('[SETTINGS] Saved:', settings);
    } catch (e) {
        console.warn('Failed to save settings:', e);
    }
}

// Apply saved settings to UI toggles
function applySettingsToUI() {
    const settings = loadSettings();
    const noAgreementToggle = document.getElementById('settingSSNoAgreement');
    const withAgreementToggle = document.getElementById('settingSSWithAgreement');

    if (noAgreementToggle) noAgreementToggle.checked = settings.includeSSNoAgreement;
    if (withAgreementToggle) withAgreementToggle.checked = settings.includeSSWithAgreement;

    console.log('[SETTINGS] Applied to UI:', settings);
}

// Open settings modal
function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        // Apply current settings to UI when modal opens
        applySettingsToUI();
    }
}

// Close settings modal
function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Close modal when clicking outside (on overlay)
document.addEventListener('click', function(event) {
    const modal = document.getElementById('settingsModal');
    if (modal && event.target === modal) {
        closeSettingsModal();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeSettingsModal();
    }
});

// Re-calculate if results are currently displayed
function recalculateIfNeeded() {
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection && !resultsSection.classList.contains('hidden')) {
        calculateCosts();
    }
}

// Get current settings for use in calculations
function getSettings() {
    return loadSettings();
}

// Show social security popup when "No Reciprocal Agreement" badge is clicked
function showSocialSecurityPopup(event) {
    event.stopPropagation(); // Prevent accordion toggle

    // Get current host country from calculation data or default
    const hostCountry = document.getElementById('hostCountry')?.value || 'Brazil';
    const config = countryConfig[hostCountry] || countryConfig.Brazil;
    const countryName = config.name || hostCountry;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'socialSecurityModal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 16px;
    `;

    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        font-family: 'Inter', sans-serif;
    `;

    modal.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px;">
            <div style="flex-shrink: 0; width: 40px; height: 40px; background: #FEF3C7; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <svg style="width: 20px; height: 20px; color: #D97706;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <div>
                <h3 style="font-size: 16px; font-weight: 700; color: #1f2937; margin: 0 0 8px 0;">No Reciprocal Agreement</h3>
                <p style="font-size: 14px; color: #6b7280; margin: 0; line-height: 1.5;">
                    Dual social security contributions apply (no Finland-${countryName} social security reciprocal agreement)
                </p>
            </div>
        </div>
        <button onclick="document.getElementById('socialSecurityModal').remove();" style="
            width: 100%;
            padding: 12px;
            background: #44919c;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            font-family: 'Inter', sans-serif;
        ">Understood</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.remove();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

// Exchange rates cache
let exchangeRatesCache = {
    rates: {},
    lastFetched: null,
    source: 'ECB via Frankfurter API'
};

// Chart instance (for cleanup/re-render)
let costChartInstance = null;

// Current currency display
let currentDisplayCurrency = 'EUR';
let lastCalculationData = null;

// Finnish 2026 per diem rates by country (tax-free daily allowances)
// Source: https://www.vero.fi/syventavat-vero-ohjeet/paatokset/2025/verohallinnon-paatos-verovapaista-matkakustannusten-korvauksista-vuonna-2026/
const finnishPerDiemRates = {
    Brazil: 72,
    USA: 86,
    Germany: 78,
    UK: 84,
    UAE: 69,
    Singapore: 79,
    Australia: 72,
    Mexico: 74,
    India: 57,
    SouthAfrica: 53,
    default: 54  // Finland domestic full per diem €54 in 2026
};
const perDiemSource = 'Finnish Tax Admin 2026';
const perDiemSourceUrl = 'https://www.vero.fi/syventavat-vero-ohjeet/paatokset/2025/verohallinnon-paatos-verovapaista-matkakustannusten-korvauksista-vuonna-2026/';

// Country tax configurations (fallback static rates)
// Social security now split into employer and employee contributions
// Finland's SS agreements list: https://www.kela.fi/international-legislation
const countryConfig = {
    Brazil: {
        taxRate: 0.25,
        currency: 'BRL',
        exchangeRate: 6.187,
        currencySymbol: 'R$',
        deduction: 0,
        employerSocialSec: 0.368,
        employeeSocialSec: 0.14,
        employeeSocialSecCap: 8157.41,
        socialSec: 0.508,
        name: 'Brazil',
        taxSource: 'View Source',
        taxSourceUrl: 'https://www.gov.br/receitafederal/pt-br',
        taxNote: 'Non-resident flat rate (25%)',
        socialSecNote: 'No Finland-Brazil totalization agreement - dual INSS contributions required',
        socialSecSource: 'View Source',
        socialSecSourceUrl: 'https://www.gov.br/previdencia/pt-br/assuntos/acordos-internacionais',
        noTreatyWarning: true
    },
    USA: {
        taxRate: 0.37, currency: 'USD', exchangeRate: 1.08, currencySymbol: '$', deduction: 13850,
        employerSocialSec: 0.0765, employeeSocialSec: 0.0765, socialSec: 0.153, name: 'United States',
        taxSource: 'View Source', taxSourceUrl: 'https://www.irs.gov/individuals/international-taxpayers/tax-rates',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://www.ssa.gov/international/Agreement_Pamphlets/finland.html',
        taxNote: 'Federal progressive rates (10%-37%)',
        noTreatyWarning: false
    },
    Germany: {
        taxRate: 0.45, currency: 'EUR', exchangeRate: 1.0, currencySymbol: '€', deduction: 12096,
        employerSocialSec: 0.21, employeeSocialSec: 0.21, socialSec: 0.42, name: 'Germany',
        taxSource: 'View Source', taxSourceUrl: 'https://www.bundesfinanzministerium.de/Web/EN/Home/home.html',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://www.deutsche-rentenversicherung.de/DRV/EN/International/international_index.html',
        socialSecNote: 'Coordinated via EU Regulation 883/2004',
        taxNote: 'Progressive rates (14%-45%)',
        noTreatyWarning: false
    },
    UK: {
        taxRate: 0.45, currency: 'GBP', exchangeRate: 0.86, currencySymbol: '£', deduction: 12570,
        employerSocialSec: 0.15, employeeSocialSec: 0.08, socialSec: 0.23, name: 'United Kingdom',
        taxSource: 'View Source', taxSourceUrl: 'https://www.gov.uk/government/publications/autumn-budget-2024-overview-of-tax-legislation-and-rates',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://www.gov.uk/government/publications/reciprocal-agreements',
        socialSecNote: 'Covered by EU withdrawal agreement provisions',
        taxNote: 'Progressive rates (20%/40%/45%)',
        noTreatyWarning: false
    },
    UAE: {
        taxRate: 0, currency: 'AED', exchangeRate: 3.96, currencySymbol: 'AED ', deduction: 0,
        employerSocialSec: 0, employeeSocialSec: 0, socialSec: 0, name: 'United Arab Emirates',
        taxSource: 'View Source', taxSourceUrl: 'https://u.ae/en/information-and-services/finance-and-investment/taxation',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://gpssa.gov.ae/pages/en/services/gcc-overview',
        socialSecNote: 'No Finland-UAE agreement - UAE SS applies to GCC nationals only',
        noTreatyWarning: true
    },
    Singapore: {
        taxRate: 0.24, currency: 'SGD', exchangeRate: 1.45, currencySymbol: 'S$', deduction: 0,
        employerSocialSec: 0, employeeSocialSec: 0, socialSec: 0, name: 'Singapore',
        taxSource: 'View Source', taxSourceUrl: 'https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-rates-for-tax-resident-and-non-residents',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://www.cpf.gov.sg/member',
        socialSecNote: 'Foreigners exempt from CPF contributions',
        taxNote: 'Non-resident flat rate (24%)',
        noTreatyWarning: true
    },
    Australia: {
        taxRate: 0.45, currency: 'AUD', exchangeRate: 1.65, currencySymbol: 'A$', deduction: 0,
        employerSocialSec: 0.12, employeeSocialSec: 0, socialSec: 0.12, name: 'Australia',
        taxSource: 'View Source', taxSourceUrl: 'https://www.ato.gov.au/rates/individual-income-tax-rates/',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://www.dss.gov.au/international-social-security-agreements',
        socialSecNote: 'Finland-Australia agreement in force since 2002',
        taxNote: 'Non-resident progressive (from 30%)',
        noTreatyWarning: false
    },
    Mexico: {
        taxRate: 0.30, currency: 'MXN', exchangeRate: 18.5, currencySymbol: 'MX$', deduction: 0,
        employerSocialSec: 0.25, employeeSocialSec: 0.03, socialSec: 0.28, name: 'Mexico',
        taxSource: 'View Source', taxSourceUrl: 'https://www.sat.gob.mx/',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://www.gob.mx/imss',
        socialSecNote: 'No Finland-Mexico agreement - dual contributions may apply',
        taxNote: 'Non-resident progressive (15%/30%)',
        noTreatyWarning: true
    },
    India: {
        taxRate: 0.30, currency: 'INR', exchangeRate: 90.5, currencySymbol: '₹', deduction: 0,
        employerSocialSec: 0.12, employeeSocialSec: 0.12, socialSec: 0.24, name: 'India',
        taxSource: 'View Source', taxSourceUrl: 'https://incometaxindia.gov.in/Pages/default.aspx',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://www.mea.gov.in/bilateral-documents.htm?dtl%2F26465%2FSocial_Security_Agreements',
        socialSecNote: 'Finland-India agreement in force',
        taxNote: 'Progressive rates (same as resident)',
        noTreatyWarning: false
    },
    SouthAfrica: {
        taxRate: 0.45, currency: 'ZAR', exchangeRate: 20.2, currencySymbol: 'R', deduction: 0,
        employerSocialSec: 0.02, employeeSocialSec: 0.01, socialSec: 0.03, name: 'South Africa',
        taxSource: 'View Source', taxSourceUrl: 'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/',
        socialSecSource: 'View Source', socialSecSourceUrl: 'https://www.sars.gov.za/',
        socialSecNote: 'No Finland-South Africa agreement - limited SS obligations',
        taxNote: 'Progressive rates (18%-45%)',
        noTreatyWarning: true
    }
};

// Load tax rules from JSON
async function loadTaxRules() {
    try {
        const response = await fetch('js/tax-rules.json');
        taxRules = await response.json();
        console.log('Tax rules loaded successfully');
    } catch (error) {
        console.warn('Could not load tax rules JSON, using defaults:', error);
    }
}

// Fetch exchange rates from Frankfurter API
async function fetchExchangeRates() {
    // Check cache - refresh if older than 24 hours
    const cacheAge = exchangeRatesCache.lastFetched ?
        (Date.now() - exchangeRatesCache.lastFetched) / (1000 * 60 * 60) : 999;

    if (cacheAge < 24 && Object.keys(exchangeRatesCache.rates).length > 0) {
        console.log('Using cached exchange rates');
        return;
    }

    try {
        const symbols = 'BRL,USD,GBP,AED,SGD,AUD,MXN,INR,ZAR';
        const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${symbols}`);
        const data = await response.json();

        exchangeRatesCache = {
            rates: data.rates,
            lastFetched: Date.now(),
            date: data.date,
            source: 'ECB via Frankfurter API'
        };

        // Update countryConfig with live rates
        if (data.rates.BRL) countryConfig.Brazil.exchangeRate = data.rates.BRL;
        if (data.rates.USD) countryConfig.USA.exchangeRate = data.rates.USD;
        if (data.rates.GBP) countryConfig.UK.exchangeRate = data.rates.GBP;
        if (data.rates.AED) countryConfig.UAE.exchangeRate = data.rates.AED;
        if (data.rates.SGD) countryConfig.Singapore.exchangeRate = data.rates.SGD;
        if (data.rates.AUD) countryConfig.Australia.exchangeRate = data.rates.AUD;
        if (data.rates.MXN) countryConfig.Mexico.exchangeRate = data.rates.MXN;
        if (data.rates.INR) countryConfig.India.exchangeRate = data.rates.INR;
        if (data.rates.ZAR) countryConfig.SouthAfrica.exchangeRate = data.rates.ZAR;

        console.log('Exchange rates updated from ECB:', data.date);
    } catch (error) {
        console.warn('Could not fetch exchange rates, using static fallback:', error);
    }
}

// Calculate progressive tax and return both total and bracket-by-bracket breakdown
function calculateProgressiveTax(income, brackets, returnBreakdown = false) {
    let tax = 0;
    const breakdown = [];

    for (const bracket of brackets) {
        if (income > bracket.min) {
            const maxBracket = bracket.max || Infinity;
            const taxableInBracket = Math.min(income, maxBracket) - bracket.min;
            const taxInBracket = taxableInBracket * bracket.rate;
            tax += taxInBracket;

            // Store breakdown for display
            breakdown.push({
                min: bracket.min,
                max: bracket.max,
                rate: bracket.rate,
                taxableAmount: taxableInBracket,
                taxAmount: taxInBracket
            });
        }
    }

    if (returnBreakdown) {
        return { total: tax, breakdown: breakdown };
    }
    return tax;
}

// Check if assignment triggers tax residency (183-day rule)
function isResidentForTax(assignmentMonths) {
    return (assignmentMonths * 30) >= 183;
}

// Update country info display and per diem
function updateCountryInfo() {
    const countryEl = document.getElementById('hostCountry');
    if (!countryEl) return;

    const country = countryEl.value;
    const config = countryConfig[country];
    if (!config) return;

    const taxPercent = (config.taxRate * 100).toFixed(0);
    const infoEl = document.getElementById('countryTaxInfo');

    if (infoEl) {
        if (config.taxRate === 0) {
            infoEl.textContent = `Tax rate: 0% (Tax-free) | Currency: ${config.currency}`;
        } else {
            infoEl.textContent = `Tax rate: up to ${taxPercent}% | Currency: ${config.currency}`;
        }
    }

    // Auto-populate and lock per diem rate
    const perDiemRate = finnishPerDiemRates[country] || finnishPerDiemRates.default;
    const perDiemInput = document.getElementById('dailyAllowance');
    if (perDiemInput) {
        perDiemInput.value = perDiemRate;
        perDiemInput.disabled = true;
    }

    // Update per diem info text
    const perDiemInfo = document.getElementById('perDiemInfo');
    if (perDiemInfo) {
        perDiemInfo.innerHTML = `<a href="${perDiemSourceUrl}" target="_blank" class="text-cozm-teal hover:underline">${perDiemSource}</a>`;
    }

    // Update local currency label in toggle button
    updateLocalCurrencyLabel();

    // If currently displaying local currency, refresh the display
    if (currentDisplayCurrency === 'LOCAL' && lastCalculationData) {
        updateDisplayValues(lastCalculationData);
    }
}

// Tab switching
function switchTab(tab) {
    const singleTab = document.getElementById('tab-single');
    const bulkTab = document.getElementById('tab-bulk');
    const singleForm = document.getElementById('form-single');
    const bulkForm = document.getElementById('form-bulk');

    if (tab === 'single') {
        if (singleTab) singleTab.className = 'tab-active px-4 py-2 text-sm transition-all';
        if (bulkTab) bulkTab.className = 'tab-inactive px-4 py-2 text-sm transition-all';
        if (singleForm) singleForm.classList.remove('hidden');
        if (bulkForm) bulkForm.classList.add('hidden');
    } else {
        if (singleTab) singleTab.className = 'tab-inactive px-4 py-2 text-sm transition-all';
        if (bulkTab) bulkTab.className = 'tab-active px-4 py-2 text-sm transition-all';
        if (singleForm) singleForm.classList.add('hidden');
        if (bulkForm) bulkForm.classList.remove('hidden');
    }
}

// View switching
function switchView(view) {
    const summaryBtn = document.getElementById('view-summary');
    const detailedBtn = document.getElementById('view-detailed');
    const summaryView = document.getElementById('summary-view');
    const detailedView = document.getElementById('detailed-view');

    if (view === 'summary') {
        if (summaryBtn) summaryBtn.classList.add('active');
        if (detailedBtn) detailedBtn.classList.remove('active');
        if (summaryView) summaryView.classList.remove('hidden');
        if (detailedView) detailedView.classList.add('hidden');
    } else {
        if (summaryBtn) summaryBtn.classList.remove('active');
        if (detailedBtn) detailedBtn.classList.add('active');
        if (summaryView) summaryView.classList.add('hidden');
        if (detailedView) detailedView.classList.remove('hidden');
    }
}

// Toggle assumptions panel
function toggleAssumptions() {
    const panel = document.getElementById('assumptionsPanel');
    const arrow = document.getElementById('assumptionsArrow');
    if (panel) panel.classList.toggle('hidden');
    if (arrow) arrow.style.transform = panel.classList.contains('hidden') ? '' : 'rotate(90deg)';
}

// Toggle calculation workings panel
function toggleWorkings() {
    const panel = document.getElementById('calculationWorkings');
    const arrow = document.getElementById('workingsArrow');
    if (panel) panel.classList.toggle('hidden');
    if (arrow) arrow.style.transform = panel.classList.contains('hidden') ? '' : 'rotate(90deg)';
}

// Format currency with accounting brackets for negative numbers
function formatCurrency(amount, currency = '€') {
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = currency + absAmount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return isNegative ? `(${formatted})` : formatted;
}

function formatCurrencyDecimal(amount, currency = '€') {
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = currency + absAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isNegative ? `(${formatted})` : formatted;
}

// Format currency with local symbol
function formatLocalCurrency(amount, countryKey) {
    const config = countryConfig[countryKey];
    const symbol = config.currencySymbol || config.currency + ' ';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = symbol + absAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isNegative ? `(${formatted})` : formatted;
}

// Calculate costs
// NEW METHODOLOGY (Jan 2026):
// 1. Salary for period (EUR)
// 2. Per Diem (EUR) - tax-exempt, NOT included in tax/SS calculations
// 3. Admin Fees (EUR) - employer costs, NOT included in employee taxable income
// 4. Subtotal in EUR
// 5. Convert salary to local currency
// 6. Apply deductions (if any)
// 7. Calculate tax on SALARY ONLY (not per diem, not admin fees)
// 8. Calculate Social Security on SALARY ONLY:
//    - Employer SS (uncapped for Brazil)
//    - Employee SS (capped for Brazil)
// 9. Total cost for period
// 10. Daily cost
function calculateCosts() {
    const monthlySalary = parseFloat(document.getElementById('monthlySalary').value) || 0;
    const assignmentLength = parseInt(document.getElementById('assignmentLength').value) || 6;
    const dailyAllowance = parseFloat(document.getElementById('dailyAllowance').value) || 0;
    const workingDaysPerMonth = parseInt(document.getElementById('workingDays').value) || 25;
    const hostCountry = document.getElementById('hostCountry').value;
    const config = countryConfig[hostCountry];

    // Calculate totals
    const totalWorkingDays = workingDaysPerMonth * assignmentLength;
    const totalCalendarDays = assignmentLength * 30; // Approximate

    // ===== STEP 1: SALARY =====
    const grossSalary = monthlySalary * assignmentLength;

    // ===== STEP 2: PER DIEM (Tax-exempt) =====
    // Per diem is NOT included in tax or social security calculations
    // when properly documented (tied to actual business travel, reasonable amounts)
    const totalPerDiem = dailyAllowance * totalWorkingDays;

    // ===== STEP 3: ADMIN FEES (Employer costs) =====
    // Admin fees are employer costs, NOT included in employee's taxable income
    const monthlyTaxReports = 200;
    const yearlyTaxReturns = 300;
    const workPermitFee = 1000;
    const visaFee = 200;
    const taxSocialSecReg = 500;
    const serviceProviderFee = 1000;

    // Pro-rate annual fees based on assignment length
    const annualFees = (monthlyTaxReports + yearlyTaxReturns + serviceProviderFee) * (assignmentLength / 12);
    const oneTimeFees = workPermitFee + visaFee + taxSocialSecReg;
    const totalAdminFees = annualFees + oneTimeFees;

    // ===== STEP 4: SUBTOTAL IN EUR =====
    const subtotalEUR = grossSalary + totalPerDiem + totalAdminFees;

    // Get tax rules and exchange rate
    const countryTaxRules = taxRules ? taxRules[hostCountry] : null;
    const isResident = isResidentForTax(assignmentLength);
    const exchangeRate = config.exchangeRate;

    // ===== STEP 5: CONVERT SALARY TO LOCAL CURRENCY =====
    // Only salary is converted for tax calculation (per diem is tax-exempt)
    const salaryLocal = grossSalary * exchangeRate;

    // ===== STEP 6: APPLY DEDUCTIONS =====
    const standardDeduction = config.deduction || 0;
    const taxableIncomeLocal = Math.max(0, salaryLocal - standardDeduction);
    const taxableIncomeEUR = taxableIncomeLocal / exchangeRate;

    // ===== STEP 7: CALCULATE TAX ON SALARY ONLY =====
    let taxAmountLocal = 0;
    let taxCalculationMethod = '';
    let effectiveTaxRate = 0;
    let taxBracketBreakdown = []; // Detailed bracket-by-bracket breakdown

    // Determine which rule to apply
    let bracketsToUse = null;
    let flatRateToUse = null;

    if (countryTaxRules) {
        if (isResident) {
            if (countryTaxRules.taxBrackets) {
                bracketsToUse = countryTaxRules.taxBrackets;
                taxCalculationMethod = 'Progressive brackets (Resident)';
            } else {
                // Resident but no brackets? Fallback to config flat rate (unlikely for these countries)
                flatRateToUse = config.taxRate;
                taxCalculationMethod = `Flat rate (${(flatRateToUse * 100).toFixed(0)}%)`;
            }
        } else {
            // Non-Resident
            if (countryTaxRules.nonResidentBrackets) {
                bracketsToUse = countryTaxRules.nonResidentBrackets;
                taxCalculationMethod = 'Progressive brackets (Non-Resident)';
            } else if (countryTaxRules.useResidentBracketsForNonResident && countryTaxRules.taxBrackets) {
                bracketsToUse = countryTaxRules.taxBrackets;
                taxCalculationMethod = 'Progressive brackets (Non-Resident - Same as Resident)';
            } else if (countryTaxRules.nonResidentRate !== undefined) {
                flatRateToUse = countryTaxRules.nonResidentRate;
                taxCalculationMethod = `Non-Resident Flat Rate (${(flatRateToUse * 100).toFixed(0)}%)`;
            } else if (countryTaxRules.taxBrackets) {
                // Fallback: If only taxBrackets exist and nothing else specified, assume they apply?
                // Or assume flat rate from config?
                // The safest fallback for our updated JSON structure is to use config.taxRate if we don't match above
                flatRateToUse = config.taxRate;
                taxCalculationMethod = `Flat rate (${(flatRateToUse * 100).toFixed(0)}%)`;
            } else {
                flatRateToUse = config.taxRate;
                taxCalculationMethod = `Flat rate (${(flatRateToUse * 100).toFixed(0)}%)`;
            }
        }
    } else {
        flatRateToUse = config.taxRate;
        taxCalculationMethod = `Flat rate (${(flatRateToUse * 100).toFixed(0)}%)`;
    }

    if (bracketsToUse) {
        const taxResult = calculateProgressiveTax(taxableIncomeLocal, bracketsToUse, true);
        taxAmountLocal = taxResult.total;
        taxBracketBreakdown = taxResult.breakdown;
        effectiveTaxRate = taxableIncomeLocal > 0 ? (taxAmountLocal / taxableIncomeLocal) * 100 : 0;
    } else {
        taxAmountLocal = taxableIncomeLocal * flatRateToUse;
        effectiveTaxRate = flatRateToUse * 100;
        taxBracketBreakdown = [{
            min: 0,
            max: null,
            rate: flatRateToUse,
            taxableAmount: taxableIncomeLocal,
            taxAmount: taxAmountLocal
        }];
    }

    const taxAmountEUR = taxAmountLocal / exchangeRate;
    const taxPerDayLocal = taxAmountLocal / totalCalendarDays;
    const taxPerDayEUR = taxAmountEUR / totalCalendarDays;

    // ===== STEP 8: CALCULATE SOCIAL SECURITY ON SALARY ONLY =====
    // Per diem is NOT subject to social security when properly documented
    // Social security is calculated separately for employer and employee
    // SETTINGS: User can toggle whether to include host SS based on agreement status

    let employerSocialSec = 0;
    let employeeSocialSec = 0;
    let socialSecIncluded = true; // Track whether SS is included in calculation
    let socialSecExclusionReason = null;

    // Check settings to determine if host SS should be included
    const settings = getSettings();
    const hasAgreement = !config.noTreatyWarning; // noTreatyWarning=true means NO agreement

    if (hasAgreement && !settings.includeSSWithAgreement) {
        // Agreement exists, but user has toggled OFF host SS for agreement countries
        socialSecIncluded = false;
        socialSecExclusionReason = 'Excluded (A1/CoC exemption assumed)';
    } else if (!hasAgreement && !settings.includeSSNoAgreement) {
        // No agreement, but user has toggled OFF host SS for non-agreement countries
        socialSecIncluded = false;
        socialSecExclusionReason = 'Excluded by user setting';
    }

    if (socialSecIncluded) {
        if (config.employerSocialSec !== undefined) {
            // Use new separate rates
            // Employer SS: typically uncapped
            employerSocialSec = grossSalary * config.employerSocialSec;

            // Employee SS: may be capped (e.g., Brazil INSS capped at BRL 8,157.41/month)
            if (config.employeeSocialSecCap) {
                // Calculate monthly employee SS with cap
                const monthlySalaryLocal = monthlySalary * exchangeRate;
                const cappedMonthlySS = Math.min(
                    monthlySalaryLocal * config.employeeSocialSec,
                    config.employeeSocialSecCap
                );
                // Convert back to EUR and multiply by assignment length
                employeeSocialSec = (cappedMonthlySS / exchangeRate) * assignmentLength;
            } else {
                employeeSocialSec = grossSalary * config.employeeSocialSec;
            }
        } else {
            // Fallback to old combined rate (split 50/50 for display)
            const totalSS = grossSalary * config.socialSec;
            employerSocialSec = totalSS * 0.7; // Employer typically pays more
            employeeSocialSec = totalSS * 0.3;
        }
    }

    const totalSocialSecurity = employerSocialSec + employeeSocialSec;

    // Legacy variable for backwards compatibility
    const socialSecurityCost = totalSocialSecurity;
    const totalAllowances = totalPerDiem; // Rename for legacy compatibility

    // ===== STEP 9: GRAND TOTALS =====
    // Grand Total = Salary + Per Diem + Admin Fees + Tax + Social Security (full cost)
    const grandTotal = grossSalary + totalPerDiem + totalAdminFees + taxAmountEUR + totalSocialSecurity;

    // Additional Cost Total = Per Diem + Admin Fees + Tax + Social Security (excludes salary)
    // This is the incremental cost due to the international assignment
    const additionalCostTotal = totalPerDiem + totalAdminFees + taxAmountEUR + totalSocialSecurity;

    // ===== STEP 10: DAILY COST =====
    // Daily additional cost (not including salary)
    const costPerDay = additionalCostTotal / totalCalendarDays;

    // Store calculation data for currency switching and display
    lastCalculationData = {
        // Core cost components
        grossSalary,
        totalPerDiem,
        totalAdminFees,
        taxAmountEUR,
        totalSocialSecurity,
        employerSocialSec,
        employeeSocialSec,
        grandTotal,
        additionalCostTotal,
        costPerDay,

        // Input values
        monthlySalary,
        assignmentLength,
        dailyAllowance,
        totalWorkingDays,
        totalCalendarDays,

        // Tax calculation details
        taxableIncomeEUR,
        taxableIncomeLocal,
        salaryLocal,
        taxAmountLocal,
        taxPerDayLocal,
        taxPerDayEUR,
        effectiveTaxRate,
        taxCalculationMethod,
        taxBracketBreakdown,
        exchangeRate,

        // Configuration
        config,
        hostCountry,
        countryTaxRules,
        isResident,

        // Social Security settings status
        socialSecIncluded,
        socialSecExclusionReason,
        hasAgreement,

        // Legacy compatibility
        socialSecurityCost,
        totalAllowances
    };

    // Get home country for display
    const homeCountry = document.getElementById('homeCountry').value;

    // Update Assignment Summary Card
    const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setEl('summaryDuration', `${assignmentLength} months`);
    setEl('summaryOrigin', homeCountry);
    setEl('summaryDestination', config.name);
    setEl('summarySalary', formatCurrency(monthlySalary) + '/month');
    setEl('chartPeriodLabel', `(${assignmentLength} months)`);

    // Update Salary breakdown group
    setEl('summaryGrossSalary', formatCurrency(grossSalary));
    setEl('detailMonthlySalary', formatCurrency(monthlySalary));
    setEl('detailSalaryDuration', `${assignmentLength} months`);

    // Update Summary View - main totals
    setEl('summaryTax', formatCurrency(taxAmountEUR));
    setEl('summarySocialSec', formatCurrency(socialSecurityCost));
    setEl('summaryAllowances', formatCurrency(totalAllowances));
    setEl('summaryAdminFees', formatCurrency(totalAdminFees));
    setEl('summaryPerDay', formatCurrencyDecimal(costPerDay));
    // Show additional cost (excludes salary) as the main total
    setEl('summaryTotal', formatCurrency(additionalCostTotal));
    setEl('chartCenterTotal', formatCurrency(additionalCostTotal));

    // Update chart legend values (4 additional cost components - excludes salary)
    setEl('legendPerdiem', formatCurrency(totalAllowances));
    setEl('legendAdmin', formatCurrency(totalAdminFees));
    setEl('legendTax', formatCurrency(taxAmountEUR));
    setEl('legendSocial', formatCurrency(socialSecurityCost));

    // Update breakdown group details
    // Tax details with full bracket-by-bracket breakdown
    setEl('detailTaxableIncome', formatLocalCurrency(taxableIncomeLocal, hostCountry));
    setEl('detailTaxMethod', taxCalculationMethod);
    setEl('detailTaxTotal', formatLocalCurrency(taxAmountLocal, hostCountry));
    setEl('detailTaxRate', `(${effectiveTaxRate.toFixed(1)}% effective)`);

    // Render tax bracket breakdown
    const taxBreakdownEl = document.getElementById('taxBracketBreakdown');
    if (taxBreakdownEl && taxBracketBreakdown.length > 0) {
        const currencySymbol = config.currencySymbol || '€';
        const formatLocal = (val) => currencySymbol + val.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        let breakdownHtml = '';
        for (const bracket of taxBracketBreakdown) {
            const minFormatted = formatLocal(bracket.min);
            const maxFormatted = bracket.max ? formatLocal(bracket.max) : '∞';
            const ratePercent = (bracket.rate * 100).toFixed(0) + '%';
            const taxFormatted = formatLocal(bracket.taxAmount);

            breakdownHtml += `
                <div class="tax-bracket-row">
                    <span class="tax-bracket-range">${minFormatted} – ${maxFormatted}</span>
                    <span class="tax-bracket-rate">@ ${ratePercent}</span>
                    <span class="tax-bracket-amount">= ${taxFormatted}</span>
                </div>
            `;
        }
        taxBreakdownEl.innerHTML = breakdownHtml;
    }

    const taxSourceEl = document.getElementById('detailTaxSource');
    if (taxSourceEl) {
        const sourceUrl = countryTaxRules?.taxSourceUrl || config.taxSourceUrl || '#';
        const sourceName = countryTaxRules?.taxSource || config.taxSource || 'View Source';
        taxSourceEl.innerHTML = `<a href="${sourceUrl}" target="_blank" class="text-cozm-teal hover:underline">${sourceName}</a>`;
    }

    // Social Security details - show employer/employee breakdown
    const totalSSRate = ((config.employerSocialSec || 0) + (config.employeeSocialSec || 0)) * 100;
    setEl('detailSocialRate', totalSSRate.toFixed(1) + '%');

    // Update employer/employee breakdown display
    setEl('detailEmployerSS', formatCurrency(employerSocialSec));
    setEl('detailEmployeeSS', formatCurrency(employeeSocialSec));
    setEl('detailEmployerSSRate', ((config.employerSocialSec || 0) * 100).toFixed(1) + '%');
    setEl('detailEmployeeSSRate', ((config.employeeSocialSec || 0) * 100).toFixed(1) + '%');

    // Social Security warning with clickable link to source
    const socialWarningEl = document.getElementById('detailSocialWarning');
    const socialWarningRow = document.getElementById('detailSocialWarningRow');

    // Show exclusion reason if SS was excluded by settings
    if (!socialSecIncluded && socialSecExclusionReason) {
        if (socialWarningEl) {
            socialWarningEl.innerHTML = `<span class="text-gray-500">${socialSecExclusionReason}</span>`;
        }
        if (socialWarningRow) socialWarningRow.style.display = 'flex';
        // Update the label to show "Status" instead of "Warning"
        const warningLabel = socialWarningRow?.querySelector('.detail-label');
        if (warningLabel) warningLabel.textContent = 'Status';
    } else if (config.noTreatyWarning) {
        if (socialWarningEl) {
            const ssSourceUrl = config.socialSecSourceUrl || 'https://www.kela.fi/international-legislation';
            socialWarningEl.innerHTML = `<a href="${ssSourceUrl}" target="_blank" class="text-amber-600 hover:underline">No Reciprocal Agreement ⚠️</a>`;
        }
        if (socialWarningRow) socialWarningRow.style.display = 'flex';
        // Reset label to "Warning"
        const warningLabel = socialWarningRow?.querySelector('.detail-label');
        if (warningLabel) warningLabel.textContent = 'Warning';
    } else {
        if (socialWarningRow) socialWarningRow.style.display = 'none';
    }

    // Per Diem details
    setEl('detailPerDiemRate', formatCurrency(dailyAllowance));
    setEl('detailWorkingDays', totalWorkingDays.toString());

    // Admin fee details
    setEl('detailVisaFee', formatCurrency(visaFee));
    setEl('detailWorkPermit', formatCurrency(workPermitFee));

    // Render donut chart with 4 additional cost components (excludes salary)
    renderCostChart(totalPerDiem, totalAdminFees, taxAmountEUR, totalSocialSecurity, additionalCostTotal);

    // Show/hide social security badge based on treaty status
    const socialSecBadge = document.getElementById('socialSecBadge');
    if (socialSecBadge) {
        if (config.noTreatyWarning) {
            socialSecBadge.classList.remove('hidden');
            socialSecBadge.href = config.socialSecSourceUrl || 'https://www.kela.fi/international-legislation';
        } else {
            socialSecBadge.classList.add('hidden');
        }
    }

    // Legacy detailed view elements (for backward compatibility - these IDs may still exist)
    const setElementText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    setElementText('detailGrossSalary', formatCurrency(grossSalary));
    setElementText('detailDaysCalc', `${totalWorkingDays} days × €${dailyAllowance}`);
    setElementText('detailAllowances', formatCurrency(totalAllowances));
    setElementText('detailTaxableEUR', formatCurrency(taxableIncomeEUR));
    setElementText('detailTaxableBRL', formatLocalCurrency(taxableIncomeLocal, hostCountry));
    setElementText('detailTaxTotal', formatCurrency(taxAmountEUR));
    setElementText('detailSocialSecTotal', formatCurrency(socialSecurityCost));

    // Exchange rate with source and date
    const rateDate = exchangeRatesCache.date || 'static fallback';
    setElementText('exchangeRateInfo', `1 EUR = ${exchangeRate.toFixed(3)} ${config.currency} (${exchangeRatesCache.source}, ${rateDate})`);

    // Tax rate info with citation
    setElementText('taxRateInfo', config.taxRate === 0 ? 'Tax-free jurisdiction' : taxCalculationMethod);
    setElementText('taxRateValue', effectiveTaxRate.toFixed(1) + '%');

    // Standard deduction (for progressive brackets, show as N/A)
    if (countryTaxRules && countryTaxRules.taxBrackets && isResident) {
        setElementText('detailDeduction', 'Built into brackets');
    } else {
        setElementText('detailDeduction', config.deduction > 0 ? formatLocalCurrency(-config.deduction, hostCountry) : 'N/A');
    }

    // Grand totals (optional elements)
    setElementText('grandTax', formatCurrency(taxAmountEUR));
    setElementText('grandSocialSec', formatCurrency(socialSecurityCost));
    setElementText('grandAllowances', formatCurrency(totalAllowances));
    setElementText('grandAdmin', formatCurrency(totalAdminFees));
    setElementText('grandTotal', formatCurrency(grandTotal));
    setElementText('grandPerDay', formatCurrencyDecimal(costPerDay));

    // Update calculation workings section
    updateCalculationWorkings({
        monthlySalary,
        assignmentLength,
        dailyAllowance,
        totalWorkingDays,
        totalCalendarDays,
        grossSalary,
        totalPerDiem,
        totalAllowances,
        taxableIncomeEUR,
        taxableIncomeLocal,
        salaryLocal,
        exchangeRate,
        taxAmountLocal,
        taxAmountEUR,
        taxPerDayLocal,
        taxPerDayEUR,
        taxCalculationMethod,
        effectiveTaxRate,
        socialSecurityCost,
        employerSocialSec,
        employeeSocialSec,
        totalSocialSecurity,
        totalAdminFees,
        subtotalEUR,
        grandTotal,
        costPerDay,
        hostCountry,
        config,
        countryTaxRules,
        isResident
    });

    // Show results section
    document.getElementById('resultsSection').classList.remove('hidden');

    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Update cost breakdown bar visualisation
function updateCostBreakdownBar(tax, social, perdiem, admin, total) {
    if (total <= 0) return;

    const taxPct = (tax / total * 100).toFixed(1);
    const socialPct = (social / total * 100).toFixed(1);
    const perdiemPct = (perdiem / total * 100).toFixed(1);
    const adminPct = (admin / total * 100).toFixed(1);

    // Update bar segments
    const barTax = document.getElementById('barTax');
    const barSocial = document.getElementById('barSocial');
    const barPerdiem = document.getElementById('barPerdiem');
    const barAdmin = document.getElementById('barAdmin');

    if (barTax) barTax.style.width = taxPct + '%';
    if (barSocial) barSocial.style.width = socialPct + '%';
    if (barPerdiem) barPerdiem.style.width = perdiemPct + '%';
    if (barAdmin) barAdmin.style.width = adminPct + '%';

    // Update legend values and percentages
    const setLegend = (id, value, pct) => {
        const valEl = document.getElementById(id);
        const pctEl = document.getElementById(id + 'Pct');
        if (valEl) valEl.textContent = formatCurrency(value);
        if (pctEl) pctEl.textContent = `(${pct}%)`;
    };

    setLegend('legendTax', tax, taxPct);
    setLegend('legendSocial', social, socialPct);
    setLegend('legendPerdiem', perdiem, perdiemPct);
    setLegend('legendAdmin', admin, adminPct);
}

// Toggle accordion section
function toggleAccordion(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.toggle('open');
    }
}

// Toggle breakdown group (expandable cards in new layout)
function toggleBreakdownGroup(groupId) {
    const group = document.getElementById('group-' + groupId);
    if (group) {
        group.classList.toggle('expanded');
    }
}

// Render donut chart using Chart.js
// Shows 4 additional cost components: Per Diem, Admin Fees, Tax, Social Security (excludes salary)
function renderCostChart(perdiem, admin, tax, social, total) {
    const ctx = document.getElementById('costChart');
    if (!ctx) return;

    // Destroy existing chart if present
    if (costChartInstance) {
        costChartInstance.destroy();
    }

    // Chart data - 4 additional cost components (salary excluded)
    const data = {
        labels: ['Per Diem', 'Admin Fees', 'Tax', 'Social Security'],
        datasets: [{
            data: [perdiem, admin, tax, social],
            backgroundColor: [
                '#83849E', // Per Diem - Grey
                '#BD8941', // Admin Fees - Gold
                '#181C31', // Tax - Dark Navy
                '#3FAFBE'  // Social Security - Light Teal
            ],
            borderWidth: 0,
            hoverOffset: 8
        }]
    };

    // Chart options
    const options = {
        cutout: '65%',
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                display: false // We use custom legend
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: {
                    size: 13,
                    weight: '600'
                },
                bodyFont: {
                    size: 13
                },
                callbacks: {
                    label: function(context) {
                        const value = context.raw;
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                        return `€${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${percentage}%)`;
                    }
                }
            }
        },
        animation: {
            animateRotate: true,
            animateScale: true,
            duration: 800,
            easing: 'easeOutQuart'
        }
    };

    // Create chart
    costChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: data,
        options: options
    });
}

// Switch currency display (EUR/LOCAL)
function switchCurrency(currency) {
    currentDisplayCurrency = currency;

    // Update toggle buttons
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById('currency-' + currency.toLowerCase());
    if (activeBtn) activeBtn.classList.add('active');

    // Re-render with last calculation data if available
    if (lastCalculationData) {
        updateDisplayValues(lastCalculationData);
    }
}

// Get current host country currency info
function getLocalCurrencyInfo() {
    const hostCountry = document.getElementById('hostCountry')?.value || 'Brazil';
    const config = countryConfig[hostCountry] || countryConfig.Brazil;
    return {
        currency: config.currency,
        symbol: config.currencySymbol,
        rate: config.exchangeRate
    };
}

// Update the local currency label when host country changes
function updateLocalCurrencyLabel() {
    const localInfo = getLocalCurrencyInfo();
    const label = document.getElementById('localCurrencyLabel');
    if (label) {
        label.textContent = localInfo.currency;
    }
}

// Update display values based on currency
function updateDisplayValues(calc) {
    let conversionRate, symbol;

    if (currentDisplayCurrency === 'LOCAL') {
        const localInfo = getLocalCurrencyInfo();
        conversionRate = localInfo.rate;
        symbol = localInfo.symbol;
    } else {
        // Default to EUR
        conversionRate = 1;
        symbol = '€';
    }

    // Recalculate values with currency conversion
    const salary = calc.grossSalary * conversionRate;
    const perdiem = (calc.totalPerDiem || calc.totalAllowances) * conversionRate;
    const admin = calc.totalAdminFees * conversionRate;
    const tax = calc.taxAmountEUR * conversionRate;
    const social = (calc.totalSocialSecurity || calc.socialSecurityCost) * conversionRate;
    // Additional cost total (excludes salary)
    const additionalTotal = calc.additionalCostTotal * conversionRate;
    const perDay = calc.costPerDay * conversionRate;

    // Update summary totals
    const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    // Show additional cost (excludes salary) as the main total
    setEl('summaryTotal', formatCurrency(additionalTotal, symbol));
    setEl('chartCenterTotal', formatCurrency(additionalTotal, symbol));
    setEl('summaryPerDay', formatCurrencyDecimal(perDay, symbol));

    // Update breakdown values
    setEl('summarySalary', formatCurrency(salary, symbol));
    setEl('summaryTax', formatCurrency(tax, symbol));
    setEl('summarySocialSec', formatCurrency(social, symbol));
    setEl('summaryAllowances', formatCurrency(perdiem, symbol));
    setEl('summaryAdminFees', formatCurrency(admin, symbol));

    // Update chart legend (only 4 additional cost components)
    setEl('legendTax', formatCurrency(tax, symbol));
    setEl('legendSocial', formatCurrency(social, symbol));
    setEl('legendPerdiem', formatCurrency(perdiem, symbol));
    setEl('legendAdmin', formatCurrency(admin, symbol));

    // Re-render chart with 4 additional cost components (excludes salary)
    renderCostChart(perdiem, admin, tax, social, additionalTotal);
}

// Update the detailed calculation workings display with collapsible sections
// Updated methodology: Tax applies to SALARY only (not per diem/admin fees)
// Social security shows employer/employee breakdown
function updateCalculationWorkings(calc) {
    const workingsContainer = document.getElementById('calculationWorkings');
    if (!workingsContainer) return;

    const rateDate = exchangeRatesCache.date || 'static fallback';
    const taxSource = calc.countryTaxRules ? calc.countryTaxRules.taxSource : 'Default rates';
    const taxSourceUrl = calc.countryTaxRules ? calc.countryTaxRules.taxSourceUrl : '#';

    // Calculate employer and employee SS rates for display
    const employerSSRate = ((calc.config.employerSocialSec || 0) * 100).toFixed(1);
    const employeeSSRate = ((calc.config.employeeSocialSec || 0) * 100).toFixed(1);
    const totalSSRate = (parseFloat(employerSSRate) + parseFloat(employeeSSRate)).toFixed(1);

    // Check if employee SS is capped
    const hasSSCap = calc.config.employeeSocialSecCap ? true : false;
    const ssCapNote = hasSSCap ?
        `Employee INSS capped at ${calc.config.currencySymbol}${calc.config.employeeSocialSecCap.toLocaleString('en-GB')}/month` : '';

    workingsContainer.innerHTML = `
        <div class="space-y-3">
            <!-- Grand Total Summary (always visible) -->
            <div class="grand-total-footer">
                <div class="grand-total-grid">
                    <div class="grand-total-item">
                        <p class="grand-total-item-label">Salary</p>
                        <p class="grand-total-item-value">${formatCurrency(calc.grossSalary)}</p>
                    </div>
                    <div class="grand-total-item">
                        <p class="grand-total-item-label">Per Diem</p>
                        <p class="grand-total-item-value">${formatCurrency(calc.totalPerDiem || calc.totalAllowances)}</p>
                    </div>
                    <div class="grand-total-item">
                        <p class="grand-total-item-label">Admin Fees</p>
                        <p class="grand-total-item-value">${formatCurrency(calc.totalAdminFees)}</p>
                    </div>
                    <div class="grand-total-item">
                        <p class="grand-total-item-label">Tax</p>
                        <p class="grand-total-item-value">${formatCurrency(calc.taxAmountEUR)}</p>
                    </div>
                    <div class="grand-total-item">
                        <p class="grand-total-item-label">Social Security</p>
                        <p class="grand-total-item-value">${formatCurrency(calc.totalSocialSecurity || calc.socialSecurityCost)}</p>
                    </div>
                </div>
                <div class="grand-total-final">
                    <span class="grand-total-final-label">Total Assignment Cost</span>
                    <div class="flex items-center">
                        <span class="grand-total-final-amount">${formatCurrency(calc.grandTotal)}</span>
                        <span class="grand-total-daily">${formatCurrencyDecimal(calc.costPerDay)}/day</span>
                    </div>
                </div>
            </div>

            <!-- Collapsible Section: Salary & Per Diem Breakdown -->
            <div id="accordion-income" class="accordion-section">
                <div class="accordion-header" onclick="toggleAccordion('accordion-income')">
                    <span class="accordion-title">
                        <svg class="w-5 h-5 text-cozm-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Salary & Per Diem Breakdown
                    </span>
                    <svg class="accordion-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
                <div class="accordion-content">
                    <table class="workings-table">
                        <tr class="section-header"><td colspan="2">Salary Calculation</td></tr>
                        <tr><td>Monthly Salary</td><td>${formatCurrency(calc.monthlySalary)}</td></tr>
                        <tr><td>Assignment Length</td><td>× ${calc.assignmentLength} months</td></tr>
                        <tr class="subtotal-row"><td>Gross Salary (EUR)</td><td>${formatCurrency(calc.grossSalary)}</td></tr>
                        <tr class="section-header"><td colspan="2">Per Diem Calculation (Tax-Exempt)</td></tr>
                        <tr><td>Daily Rate (<a href="${perDiemSourceUrl}" target="_blank" class="text-cozm-teal hover:underline">${perDiemSource}</a>)</td><td>${formatCurrency(calc.dailyAllowance)}</td></tr>
                        <tr><td>Working Days</td><td>× ${calc.totalWorkingDays} days</td></tr>
                        <tr class="subtotal-row"><td>Total Per Diem (EUR)</td><td>${formatCurrency(calc.totalPerDiem || calc.totalAllowances)}</td></tr>
                    </table>
                    <div class="info-box mt-4">
                        <p class="info-box-title">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Per Diem Tax Treatment
                        </p>
                        <p class="info-box-text">Per diem allowances are tax-exempt in Brazil when properly documented (tied to actual business travel, reasonable amounts, and documented business purpose).</p>
                    </div>
                </div>
            </div>

            <!-- Collapsible Section: Tax Calculation Details -->
            <div id="accordion-tax" class="accordion-section">
                <div class="accordion-header" onclick="toggleAccordion('accordion-tax')">
                    <span class="accordion-title">
                        <svg class="w-5 h-5 text-cozm-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/></svg>
                        Tax Calculation Details
                        <span class="policy-tooltip">
                            <svg class="policy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <span class="policy-content">Under Wärtsilä's mobility policy, the company covers host country tax obligations. The engineer's take-home pay is protected ("tax equalised").</span>
                        </span>
                    </span>
                    <svg class="accordion-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
                <div class="accordion-content">
                    <div class="info-box mb-4">
                        <p class="info-box-title">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Tax Equalisation Policy
                        </p>
                        <p class="info-box-text">Under Wärtsilä's mobility policy, the company covers host country tax obligations. The engineer's take-home pay is protected ("tax equalised") so they pay no more than they would have in their home country.</p>
                    </div>
                    <table class="workings-table">
                        <tr class="section-header"><td colspan="2">Tax Calculation - ${calc.config.name} (${calc.isResident ? 'Resident' : 'Non-Resident'})</td></tr>
                        <tr><td>Gross Salary (EUR)</td><td>${formatCurrency(calc.grossSalary)}</td></tr>
                        <tr><td>Salary in ${calc.config.currency}</td><td>${formatLocalCurrency(calc.salaryLocal || calc.grossSalary * calc.exchangeRate, calc.hostCountry)}</td></tr>
                        <tr><td>Taxable Base</td><td>Salary only (per diem exempt)</td></tr>
                        <tr><td>Taxable Income (${calc.config.currency})</td><td>${formatLocalCurrency(calc.taxableIncomeLocal, calc.hostCountry)}</td></tr>
                        <tr><td>Calculation Method</td><td>${calc.taxCalculationMethod}</td></tr>
                        <tr><td>Effective Rate</td><td>${calc.effectiveTaxRate.toFixed(1)}%</td></tr>
                        <tr><td>Source</td><td><a href="${taxSourceUrl}" target="_blank" class="text-cozm-teal hover:underline">${taxSource}</a></td></tr>
                        <tr><td>Tax (${calc.config.currency})</td><td>${formatLocalCurrency(calc.taxAmountLocal, calc.hostCountry)}</td></tr>
                        <tr class="subtotal-row"><td>Tax (EUR)</td><td>${formatCurrency(calc.taxAmountEUR)}</td></tr>
                        <tr><td>Tax Per Day (EUR)</td><td>${formatCurrencyDecimal(calc.taxPerDayEUR)}</td></tr>
                    </table>
                </div>
            </div>

            <!-- Collapsible Section: Social Security Details -->
            <div id="accordion-social" class="accordion-section">
                <div class="accordion-header" onclick="toggleAccordion('accordion-social')">
                    <span class="accordion-title">
                        <svg class="w-5 h-5 text-cozm-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        Social Security Details
                        ${calc.config.noTreatyWarning ? '<span class="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded cursor-pointer" onclick="showSocialSecurityPopup(event)">No Reciprocal Agreement</span>' : ''}
                    </span>
                    <svg class="accordion-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
                <div class="accordion-content">
                    ${calc.config.noTreatyWarning ? `
                    <div class="warning-box mb-4">
                        <p class="warning-box-title">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                            No Totalization Agreement
                        </p>
                        <p class="warning-box-text">${calc.config.socialSecNote}</p>
                    </div>
                    ` : `
                    <div class="success-box mb-4">
                        <p class="success-box-title">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Social Security Coverage
                        </p>
                        <p class="success-box-text">Under Wärtsilä's mobility policy, the company covers host country social security contributions. Where a totalization agreement exists, dual contributions may be avoided with proper documentation (A1/Certificate of Coverage).</p>
                    </div>
                    `}
                    <table class="workings-table">
                        <tr class="section-header"><td colspan="2">Social Security - ${calc.config.name}</td></tr>
                        <tr><td>Contribution Base</td><td>Salary only (per diem exempt)</td></tr>
                        <tr><td>Gross Salary (EUR)</td><td>${formatCurrency(calc.grossSalary)}</td></tr>
                        <tr class="section-header"><td colspan="2">Employer Contributions</td></tr>
                        <tr><td>Employer Rate</td><td>${employerSSRate}%</td></tr>
                        <tr><td>Employer INSS + FGTS + RAT</td><td>${formatCurrency(calc.employerSocialSec)}</td></tr>
                        <tr class="section-header"><td colspan="2">Employee Contributions</td></tr>
                        <tr><td>Employee Rate</td><td>${employeeSSRate}%</td></tr>
                        ${hasSSCap ? `<tr><td>Monthly Cap</td><td>${ssCapNote}</td></tr>` : ''}
                        <tr><td>Employee INSS</td><td>${formatCurrency(calc.employeeSocialSec)}</td></tr>
                        ${calc.config.socialSecSource ? `<tr><td>Source</td><td>${calc.config.socialSecSource}</td></tr>` : ''}
                        <tr class="subtotal-row"><td>Total Social Security (EUR)</td><td>${formatCurrency(calc.totalSocialSecurity || calc.socialSecurityCost)}</td></tr>
                        <tr><td>Social Security Per Day (EUR)</td><td>${formatCurrencyDecimal((calc.totalSocialSecurity || calc.socialSecurityCost) / calc.totalCalendarDays)}</td></tr>
                    </table>
                    <div class="info-box mt-4">
                        <p class="info-box-title">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            Social Security Notes
                        </p>
                        <p class="info-box-text">Per diem allowances are NOT subject to social security contributions in Brazil when properly documented as reimbursement for actual business travel expenses.</p>
                    </div>
                </div>
            </div>

            <!-- Collapsible Section: Exchange Rate & Sources -->
            <div id="accordion-fx" class="accordion-section">
                <div class="accordion-header" onclick="toggleAccordion('accordion-fx')">
                    <span class="accordion-title">
                        <svg class="w-5 h-5 text-cozm-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
                        Exchange Rate & Sources
                    </span>
                    <svg class="accordion-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
                <div class="accordion-content">
                    <table class="workings-table">
                        <tr class="section-header"><td colspan="2">Currency Conversion</td></tr>
                        <tr><td>Exchange Rate</td><td>1 EUR = ${calc.exchangeRate.toFixed(3)} ${calc.config.currency}</td></tr>
                        <tr><td>Source</td><td>${exchangeRatesCache.source}</td></tr>
                        <tr><td>Rate Date</td><td>${rateDate}</td></tr>
                        <tr class="section-header"><td colspan="2">Local Currency Values</td></tr>
                        <tr><td>Gross Salary (${calc.config.currency})</td><td>${formatLocalCurrency(calc.grossSalary * calc.exchangeRate, calc.hostCountry)}</td></tr>
                        <tr><td>Per Diem (${calc.config.currency})</td><td>${formatLocalCurrency((calc.totalPerDiem || calc.totalAllowances) * calc.exchangeRate, calc.hostCountry)}</td></tr>
                        <tr><td>Admin Fees (${calc.config.currency})</td><td>${formatLocalCurrency(calc.totalAdminFees * calc.exchangeRate, calc.hostCountry)}</td></tr>
                        <tr class="subtotal-row"><td>Total (${calc.config.currency})</td><td>${formatLocalCurrency(calc.grandTotal * calc.exchangeRate, calc.hostCountry)}</td></tr>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Keep workings container hidden - the new UI shows breakdown in expandable groups
    // workingsContainer.classList.remove('hidden');
}

// File upload handling using SheetJS
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // Map Excel columns to our internal structure
                // Expected columns: Name, Home Country, Host Country, Monthly Salary (EUR), Assignment Length (months)
                const mappedData = jsonData.map(row => ({
                    name: row['Name'] || row['name'] || 'Unknown',
                    home: row['Home Country'] || row['Home'] || 'Unknown',
                    host: row['Host Country'] || row['Host'] || 'Unknown',
                    salary: typeof row['Monthly Salary (EUR)'] === 'number' ? 
                           `€${row['Monthly Salary (EUR)'].toLocaleString()}` : 
                           (row['Monthly Salary (EUR)'] || '0'),
                    duration: typeof row['Assignment Length (months)'] === 'number' ? 
                             `${row['Assignment Length (months)']} months` : 
                             (row['Assignment Length (months)'] || '0')
                }));

                const tbody = document.getElementById('bulkPreviewBody');
                if (tbody) {
                    tbody.innerHTML = mappedData.map(row => `
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3">${row.name}</td>
                            <td class="px-4 py-3">${row.home}</td>
                            <td class="px-4 py-3">${row.host}</td>
                            <td class="px-4 py-3 text-right">${row.salary}</td>
                            <td class="px-4 py-3 text-right">${row.duration}</td>
                        </tr>
                    `).join('');
                }

                const previewEl = document.getElementById('bulkPreview');
                if (previewEl) previewEl.classList.remove('hidden');
                
                showToast(`Loaded ${mappedData.length} records`, 'success');

            } catch (error) {
                console.error('Error reading Excel file:', error);
                showToast('Error reading file. Please check format.', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

// Download template
function downloadTemplate() {
    const excelContent = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="FSE Data">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Name</Data></Cell>
    <Cell><Data ss:Type="String">Home Country</Data></Cell>
    <Cell><Data ss:Type="String">Host Country</Data></Cell>
    <Cell><Data ss:Type="String">Monthly Salary (EUR)</Data></Cell>
    <Cell><Data ss:Type="String">Assignment Length (months)</Data></Cell>
    <Cell><Data ss:Type="String">Daily Allowance (EUR)</Data></Cell>
    <Cell><Data ss:Type="String">Working Days/Month</Data></Cell>
   </Row>
   <Row>
    <Cell><Data ss:Type="String">Mikko Virtanen</Data></Cell>
    <Cell><Data ss:Type="String">Finland</Data></Cell>
    <Cell><Data ss:Type="String">Brazil</Data></Cell>
    <Cell><Data ss:Type="Number">7000</Data></Cell>
    <Cell><Data ss:Type="Number">6</Data></Cell>
    <Cell><Data ss:Type="Number">70</Data></Cell>
    <Cell><Data ss:Type="Number">25</Data></Cell>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fse_cost_template.xls';
    a.click();
    window.URL.revokeObjectURL(url);
}

// Calculate bulk costs (mock)
function calculateBulkCosts() {
    document.getElementById('summaryTax').textContent = '€69,500';
    document.getElementById('summarySocialSec').textContent = '€0';
    document.getElementById('summaryAllowances').textContent = '€78,750';
    document.getElementById('summaryAdminFees').textContent = '€14,200';
    document.getElementById('summaryPerDay').textContent = '€495.23';
    document.getElementById('summaryTotal').textContent = '€162,450';

    const resultsEl = document.getElementById('resultsSection');
    if (resultsEl) {
        resultsEl.classList.remove('hidden');
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ===== STAFFING OPTIMISATION =====

const sampleStaffPool = [
    { id: 1, name: 'Mikko Virtanen', home: 'Finland', skills: ['Marine', 'Electrical'], salary: 7500, available: true },
    { id: 2, name: 'Antti Korhonen', home: 'Finland', skills: ['Marine', 'Mechanical'], salary: 7000, available: true },
    { id: 3, name: 'João Silva', home: 'Portugal', skills: ['Marine', 'Electrical'], salary: 6200, available: true },
    { id: 4, name: 'Maria Santos', home: 'Portugal', skills: ['Electrical', 'Automation'], salary: 6000, available: true },
    { id: 5, name: 'Pekka Nieminen', home: 'Finland', skills: ['Mechanical', 'Automation'], salary: 7200, available: true },
    { id: 6, name: 'Hans Mueller', home: 'Germany', skills: ['Marine', 'Electrical'], salary: 7800, available: true },
    { id: 7, name: 'Sofia Berg', home: 'Finland', skills: ['Marine', 'Mechanical'], salary: 7100, available: false },
    { id: 8, name: 'Carlos Ferreira', home: 'Portugal', skills: ['Mechanical', 'Electrical'], salary: 5800, available: true },
];

const complianceData = {
    Finland: {
        Brazil: { visaWeeks: 8, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        USA: { visaWeeks: 12, complexity: 'high', workPermit: true, a1Required: false, socialSecAgreement: true },
        Germany: { visaWeeks: 2, complexity: 'low', workPermit: false, a1Required: true, socialSecAgreement: true },
        UK: { visaWeeks: 4, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: true },
        UAE: { visaWeeks: 3, complexity: 'low', workPermit: true, a1Required: false, socialSecAgreement: false },
        Singapore: { visaWeeks: 4, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        Australia: { visaWeeks: 8, complexity: 'high', workPermit: true, a1Required: false, socialSecAgreement: true },
        Mexico: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        India: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        SouthAfrica: { visaWeeks: 8, complexity: 'high', workPermit: true, a1Required: false, socialSecAgreement: false },
    },
    Portugal: {
        Brazil: { visaWeeks: 4, complexity: 'low', workPermit: false, a1Required: false, socialSecAgreement: true },
        USA: { visaWeeks: 10, complexity: 'high', workPermit: true, a1Required: false, socialSecAgreement: true },
        Germany: { visaWeeks: 1, complexity: 'low', workPermit: false, a1Required: true, socialSecAgreement: true },
        UK: { visaWeeks: 4, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: true },
        UAE: { visaWeeks: 3, complexity: 'low', workPermit: true, a1Required: false, socialSecAgreement: false },
        Singapore: { visaWeeks: 4, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        Australia: { visaWeeks: 8, complexity: 'high', workPermit: true, a1Required: false, socialSecAgreement: true },
        Mexico: { visaWeeks: 5, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        India: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        SouthAfrica: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
    },
    Germany: {
        Brazil: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: true },
        USA: { visaWeeks: 10, complexity: 'high', workPermit: true, a1Required: false, socialSecAgreement: true },
        UK: { visaWeeks: 4, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: true },
        UAE: { visaWeeks: 3, complexity: 'low', workPermit: true, a1Required: false, socialSecAgreement: false },
        Singapore: { visaWeeks: 4, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        Australia: { visaWeeks: 8, complexity: 'high', workPermit: true, a1Required: false, socialSecAgreement: true },
        Mexico: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        India: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        SouthAfrica: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
    },
    UK: {
        Brazil: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        USA: { visaWeeks: 8, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: true },
        Germany: { visaWeeks: 4, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: true },
        UAE: { visaWeeks: 3, complexity: 'low', workPermit: true, a1Required: false, socialSecAgreement: false },
        Singapore: { visaWeeks: 4, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        Australia: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: true },
        Mexico: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
        India: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: true },
        SouthAfrica: { visaWeeks: 6, complexity: 'medium', workPermit: true, a1Required: false, socialSecAgreement: false },
    }
};

let currentOptimisation = 'cost';
let loadedStaffPool = [];
let selectedTeam = [];
let availableAlternatives = [];
let currentSwapTarget = null;
let selectedAlternativeId = null;

function switchMainTab(tab) {
    const calcSection = document.getElementById('section-calculator');
    const staffSection = document.getElementById('section-staffing');
    const calcTab = document.getElementById('nav-calculator');
    const staffTab = document.getElementById('nav-staffing');

    if (tab === 'calculator') {
        if (calcSection) calcSection.classList.remove('hidden');
        if (staffSection) staffSection.classList.add('hidden');
        if (calcTab) calcTab.classList.add('nav-tab-active');
        if (staffTab) staffTab.classList.remove('nav-tab-active');
    } else {
        if (calcSection) calcSection.classList.add('hidden');
        if (staffSection) staffSection.classList.remove('hidden');
        if (calcTab) calcTab.classList.remove('nav-tab-active');
        if (staffTab) staffTab.classList.add('nav-tab-active');
    }
}

function switchStaffTab(tab) {
    const uploadTab = document.getElementById('staff-tab-upload');
    const manualTab = document.getElementById('staff-tab-manual');
    const uploadForm = document.getElementById('staff-upload');
    const manualForm = document.getElementById('staff-manual');

    if (tab === 'upload') {
        if (uploadTab) uploadTab.className = 'tab-active px-4 py-2 text-sm transition-all';
        if (manualTab) manualTab.className = 'tab-inactive px-4 py-2 text-sm transition-all';
        if (uploadForm) uploadForm.classList.remove('hidden');
        if (manualForm) manualForm.classList.add('hidden');
    } else {
        if (uploadTab) uploadTab.className = 'tab-inactive px-4 py-2 text-sm transition-all';
        if (manualTab) manualTab.className = 'tab-active px-4 py-2 text-sm transition-all';
        if (uploadForm) uploadForm.classList.add('hidden');
        if (manualForm) manualForm.classList.remove('hidden');
    }
}

function handleStaffUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // Map Excel columns to staff pool structure
                // Expected columns: Name, Home Country, Skills, Monthly Salary (EUR), Available
                loadedStaffPool = jsonData.map((row, index) => {
                    const skillsRaw = row['Skills'] || row['Skills (comma separated)'] || '';
                    const availableRaw = row['Available'] || row['Available (Yes/No)'] || 'Yes';
                    
                    return {
                        id: Date.now() + index, // Generate temporary ID
                        name: row['Name'] || 'Unknown',
                        home: row['Home Country'] || 'Unknown',
                        skills: typeof skillsRaw === 'string' ? skillsRaw.split(',').map(s => s.trim()) : [],
                        salary: parseFloat(row['Monthly Salary (EUR)']) || 0,
                        available: String(availableRaw).toLowerCase().includes('yes') || String(availableRaw).toLowerCase() === 'true'
                    };
                });

                showStaffPreview();
                showToast(`Loaded ${loadedStaffPool.length} engineers`, 'success');

            } catch (error) {
                console.error('Error reading staff Excel file:', error);
                showToast('Error reading file. Please check format.', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

function showStaffPreview() {
    const countEl = document.getElementById('staffCount');
    if (countEl) countEl.textContent = loadedStaffPool.filter(s => s.available).length;

    const tbody = document.getElementById('staffPreviewBody');
    if (tbody) {
        tbody.innerHTML = loadedStaffPool.map(staff => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium">${staff.name}</td>
                <td class="px-4 py-3">${staff.home}</td>
                <td class="px-4 py-3">${staff.skills.join(', ')}</td>
                <td class="px-4 py-3 text-right">€${staff.salary.toLocaleString()}</td>
                <td class="px-4 py-3 text-center">
                    ${staff.available
                        ? '<span class="badge badge-success">Available</span>'
                        : '<span class="badge badge-danger">Unavailable</span>'}
                </td>
            </tr>
        `).join('');
    }

    const previewEl = document.getElementById('staffPoolPreview');
    if (previewEl) previewEl.classList.remove('hidden');
}

function downloadStaffTemplate() {
    const excelContent = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Staff Pool">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Name</Data></Cell>
    <Cell><Data ss:Type="String">Home Country</Data></Cell>
    <Cell><Data ss:Type="String">Skills (comma separated)</Data></Cell>
    <Cell><Data ss:Type="String">Monthly Salary (EUR)</Data></Cell>
    <Cell><Data ss:Type="String">Available (Yes/No)</Data></Cell>
   </Row>
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff_pool_template.xls';
    a.click();
    window.URL.revokeObjectURL(url);
}

function addStaffRow() {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;
    const newRow = document.createElement('tr');
    newRow.className = 'hover:bg-gray-50';
    newRow.innerHTML = `
        <td class="px-4 py-2"><input type="text" class="input-field w-full text-sm" placeholder="e.g. Name"></td>
        <td class="px-4 py-2">
            <select class="input-field w-full text-sm">
                <option value="Finland">Finland</option>
                <option value="Portugal">Portugal</option>
                <option value="Germany">Germany</option>
                <option value="UK">UK</option>
            </select>
        </td>
        <td class="px-4 py-2"><input type="text" class="input-field w-full text-sm" placeholder="e.g. Marine, Electrical"></td>
        <td class="px-4 py-2"><input type="number" class="input-field w-full text-sm text-right" value="7000"></td>
        <td class="px-4 py-2 text-center">
            <input type="checkbox" class="w-4 h-4 text-cozm-teal rounded" checked>
        </td>
        <td class="px-4 py-2 text-center">
            <button class="text-gray-400 hover:text-red-500" onclick="removeStaffRow(this)">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(newRow);
}

function removeStaffRow(btn) {
    btn.closest('tr').remove();
}

function selectOptimisation(type) {
    currentOptimisation = type;
    document.querySelectorAll('.optimise-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    const selectedOpt = document.querySelector(`.optimise-option.${type}`);
    if (selectedOpt) selectedOpt.classList.add('selected');
}

function calculateStaffScores(staff, hostCountry, duration) {
    const compliance = complianceData[staff.home]?.[hostCountry] || { visaWeeks: 8, complexity: 'high' };
    const config = countryConfig[hostCountry];

    const totalSalary = staff.salary * duration;
    const taxCost = totalSalary * config.taxRate;
    const socialSecCost = totalSalary * config.socialSec;
    const totalCost = totalSalary + taxCost + socialSecCost + 3200;
    const maxCost = 15000 * duration;
    const costScore = Math.max(0, 100 - (totalCost / maxCost * 100));

    const complexityScores = { low: 90, medium: 60, high: 30 };
    let complianceScore = complexityScores[compliance.complexity] || 50;
    if (compliance.socialSecAgreement) complianceScore += 10;
    if (!compliance.workPermit) complianceScore += 10;
    complianceScore = Math.min(100, complianceScore);

    const maxWeeks = 12;
    const speedScore = Math.max(0, 100 - (compliance.visaWeeks / maxWeeks * 100));

    return {
        cost: Math.round(costScore),
        compliance: Math.round(complianceScore),
        speed: Math.round(speedScore),
        totalCost,
        visaWeeks: compliance.visaWeeks,
        complexity: compliance.complexity,
        workPermit: compliance.workPermit,
        a1Required: compliance.a1Required
    };
}

function optimiseStaffing() {
    const hostCountry = document.getElementById('projectHostCountry').value;
    const duration = parseInt(document.getElementById('projectDuration').value);
    const numNeeded = parseInt(document.getElementById('numEngineers').value);
    const requiredSkillsInput = document.getElementById('requiredSkills').value;
    const requiredSkills = requiredSkillsInput ? requiredSkillsInput.split(',').map(s => s.trim().toLowerCase()) : [];

    const pool = loadedStaffPool.length > 0 ? loadedStaffPool : sampleStaffPool;
    const availablePool = pool.filter(s => s.available);

    const scoredStaff = availablePool.map(staff => {
        const scores = calculateStaffScores(staff, hostCountry, duration);
        let skillMatch = 0;
        if (requiredSkills.length > 0) {
            const staffSkillsLower = staff.skills.map(s => s.toLowerCase());
            skillMatch = requiredSkills.filter(rs => staffSkillsLower.some(ss => ss.includes(rs))).length / requiredSkills.length;
        } else {
            skillMatch = 1;
        }

        let overallScore;
        switch (currentOptimisation) {
            case 'cost': overallScore = scores.cost * 0.6 + scores.compliance * 0.2 + scores.speed * 0.2; break;
            case 'compliance': overallScore = scores.cost * 0.2 + scores.compliance * 0.6 + scores.speed * 0.2; break;
            case 'speed': overallScore = scores.cost * 0.2 + scores.compliance * 0.2 + scores.speed * 0.6; break;
        }
        overallScore = overallScore * (0.5 + skillMatch * 0.5);

        return { ...staff, scores, skillMatch: Math.round(skillMatch * 100), overallScore: Math.round(overallScore) };
    });

    scoredStaff.sort((a, b) => b.overallScore - a.overallScore);
    const recommended = scoredStaff.slice(0, numNeeded);
    const alternatives = scoredStaff.slice(numNeeded);
    displayStaffingResults(recommended, alternatives, hostCountry, duration);
}

function displayStaffingResults(recommended, alternatives, hostCountry, duration) {
    availableAlternatives = [...alternatives];
    const labels = { cost: 'Lowest Cost', compliance: 'Best Compliance', speed: 'Fastest Deployment' };
    const badgeClasses = { cost: 'badge-success', compliance: 'badge-info', speed: 'badge-warning' };
    const labelEl = document.getElementById('optimisedForLabel');
    if (labelEl) {
        labelEl.textContent = labels[currentOptimisation];
        labelEl.className = `badge ${badgeClasses[currentOptimisation]}`;
    }

    const totalCost = recommended.reduce((sum, s) => sum + s.scores.totalCost, 0);
    const avgCompliance = recommended.reduce((sum, s) => sum + s.scores.compliance, 0) / recommended.length;
    const maxVisaWeeks = Math.max(...recommended.map(s => s.scores.visaWeeks));
    const avgOverall = recommended.reduce((sum, s) => sum + s.overallScore, 0) / recommended.length;

    document.getElementById('staffingTotalCost').textContent = formatCurrency(totalCost);
    document.getElementById('staffingComplianceScore').textContent = Math.round(avgCompliance) + '%';
    document.getElementById('staffingMobilisation').textContent = maxVisaWeeks + ' weeks';
    document.getElementById('staffingOverallScore').textContent = Math.round(avgOverall) + '/100';

    updateSelectedIndividualsTable(recommended, hostCountry);

    const container = document.getElementById('recommendedEngineers');
    if (container) {
        container.innerHTML = recommended.map((staff, idx) => `
            <div class="staff-card ${idx === 0 ? 'recommended' : ''}">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full bg-cozm-light-teal flex items-center justify-center text-cozm-teal font-bold text-lg">
                            ${staff.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${staff.name}</h3>
                            <p class="text-sm text-gray-500">${staff.home} → ${countryConfig[hostCountry].name}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        ${idx === 0 ? '<span class="badge badge-success mb-2">Best Match</span>' : ''}
                        <p class="text-2xl font-bold text-cozm-teal">${staff.overallScore}/100</p>
                        <p class="text-xs text-gray-400">Overall Score</p>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-4 mb-4">
                    <div><p class="text-xs text-gray-500 mb-1">Total Cost</p><p class="font-semibold">${formatCurrency(staff.scores.totalCost)}</p></div>
                    <div><p class="text-xs text-gray-500 mb-1">Visa Processing</p><p class="font-semibold">${staff.scores.visaWeeks} weeks</p></div>
                    <div><p class="text-xs text-gray-500 mb-1">Complexity</p><p class="font-semibold capitalize">${staff.scores.complexity}</p></div>
                    <div><p class="text-xs text-gray-500 mb-1">Skill Match</p><p class="font-semibold">${staff.skillMatch}%</p></div>
                </div>
                <div class="grid grid-cols-3 gap-4">
                    <div><div class="flex items-center justify-between text-xs mb-1"><span class="text-gray-500">Cost Score</span><span class="font-medium">${staff.scores.cost}%</span></div><div class="score-bar"><div class="score-bar-fill ${staff.scores.cost >= 70 ? 'high' : staff.scores.cost >= 40 ? 'medium' : 'low'}" style="width: ${staff.scores.cost}%"></div></div></div>
                    <div><div class="flex items-center justify-between text-xs mb-1"><span class="text-gray-500">Compliance Score</span><span class="font-medium">${staff.scores.compliance}%</span></div><div class="score-bar"><div class="score-bar-fill ${staff.scores.compliance >= 70 ? 'high' : staff.scores.compliance >= 40 ? 'medium' : 'low'}" style="width: ${staff.scores.compliance}%"></div></div></div>
                    <div><div class="flex items-center justify-between text-xs mb-1"><span class="text-gray-500">Speed Score</span><span class="font-medium">${staff.scores.speed}%</span></div><div class="score-bar"><div class="score-bar-fill ${staff.scores.speed >= 70 ? 'high' : staff.scores.speed >= 40 ? 'medium' : 'low'}" style="width: ${staff.scores.speed}%"></div></div></div>
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    ${staff.skills.map(s => `<span class="badge badge-info">${s}</span>`).join('')}
                    ${staff.scores.workPermit ? '<span class="badge badge-warning">Work Permit Required</span>' : ''}
                    ${staff.scores.a1Required ? '<span class="badge badge-info">A1 Certificate Required</span>' : ''}
                </div>
            </div>
        `).join('');
    }

    updateAlternativesDisplay();
    const resultsEl = document.getElementById('staffingResults');
    if (resultsEl) {
        resultsEl.classList.remove('hidden');
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateSelectedIndividualsTable(recommended, hostCountry) {
    selectedTeam = [...recommended];
    const tbody = document.getElementById('selectedIndividualsBody');
    if (!tbody) return;

    tbody.innerHTML = selectedTeam.map(staff => {
        const riskLevel = staff.scores.complexity;
        const riskClass = riskLevel === 'low' ? 'low' : riskLevel === 'medium' ? 'medium' : 'high';
        const riskLabel = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);
        return `
            <tr data-staff-id="${staff.id}">
                <td><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-cozm-light-teal flex items-center justify-center text-cozm-teal font-medium text-sm">${staff.name.split(' ').map(n => n[0]).join('')}</div><span class="font-medium">${staff.name}</span></div></td>
                <td><a class="find-alt-link" onclick="openFindAlternative(${staff.id})">Find Alternative</a></td>
                <td><span class="risk-indicator"><span class="risk-dot ${riskClass}"></span>${riskLabel}</span></td>
                <td>${formatCurrency(staff.scores.totalCost)}</td>
                <td>${staff.scores.visaWeeks} weeks</td>
                <td><button class="remove-btn" onclick="removeFromTeam(${staff.id})" title="Remove from team"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button></td>
            </tr>
        `;
    }).join('');
    updateSelectedTotals();
}

function updateSelectedTotals() {
    const totalCost = selectedTeam.reduce((sum, s) => sum + s.scores.totalCost, 0);
    const maxDeployment = selectedTeam.length > 0 ? Math.max(...selectedTeam.map(s => s.scores.visaWeeks)) : 0;
    const costEl = document.getElementById('selectedTotalCost');
    const deploymentEl = document.getElementById('selectedMaxDeployment');
    const countEl = document.getElementById('selectedCount');
    if (costEl) costEl.textContent = formatCurrency(totalCost);
    if (deploymentEl) deploymentEl.textContent = maxDeployment + ' weeks';
    if (countEl) countEl.textContent = selectedTeam.length + ' engineers selected';

    const staffTotalCostEl = document.getElementById('staffingTotalCost');
    const staffMobilisationEl = document.getElementById('staffingMobilisation');
    if (staffTotalCostEl) staffTotalCostEl.textContent = formatCurrency(totalCost);
    if (staffMobilisationEl) staffMobilisationEl.textContent = maxDeployment + ' weeks';

    if (selectedTeam.length > 0) {
        const avgCompliance = selectedTeam.reduce((sum, s) => sum + s.scores.compliance, 0) / selectedTeam.length;
        const avgOverall = selectedTeam.reduce((sum, s) => sum + s.overallScore, 0) / selectedTeam.length;
        const complianceScoreEl = document.getElementById('staffingComplianceScore');
        const overallScoreEl = document.getElementById('staffingOverallScore');
        if (complianceScoreEl) complianceScoreEl.textContent = Math.round(avgCompliance) + '%';
        if (overallScoreEl) overallScoreEl.textContent = Math.round(avgOverall) + '/100';
    }
}

function removeFromTeam(staffId) {
    const staff = selectedTeam.find(s => s.id === staffId);
    if (!staff) return;
    selectedTeam = selectedTeam.filter(s => s.id !== staffId);
    availableAlternatives.push(staff);
    availableAlternatives.sort((a, b) => b.overallScore - a.overallScore);
    const hostCountry = document.getElementById('projectHostCountry').value;
    updateSelectedIndividualsTable(selectedTeam, hostCountry);
    updateAlternativesDisplay();
    showToast(`${staff.name} removed from team`);
}

function updateAlternativesDisplay() {
    const altContainer = document.getElementById('alternativesPanel');
    if (!altContainer) return;
    altContainer.innerHTML = availableAlternatives.slice(0, 5).map(staff => `
        <div class="staff-card opacity-75">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium text-sm">${staff.name.split(' ').map(n => n[0]).join('')}</div>
                    <div><h3 class="font-medium text-gray-900">${staff.name}</h3><p class="text-xs text-gray-500">${staff.home} | ${staff.skills.join(', ')}</p></div>
                </div>
                <div class="flex items-center gap-4">
                    <div class="text-right"><p class="font-semibold text-gray-600">${staff.overallScore}/100</p><p class="text-xs text-gray-400">${formatCurrency(staff.scores.totalCost)}</p></div>
                    <button class="btn-secondary text-sm py-2 px-3" onclick="addToTeam(${staff.id})">Add</button>
                </div>
            </div>
        </div>
    `).join('');
}

function addToTeam(staffId) {
    const staff = availableAlternatives.find(s => s.id === staffId);
    if (!staff) return;
    availableAlternatives = availableAlternatives.filter(s => s.id !== staffId);
    selectedTeam.push(staff);
    const hostCountry = document.getElementById('projectHostCountry').value;
    updateSelectedIndividualsTable(selectedTeam, hostCountry);
    updateAlternativesDisplay();
    showToast(`${staff.name} added to team`);
}

function openFindAlternative(staffId) {
    const staff = selectedTeam.find(s => s.id === staffId);
    if (!staff) return;
    currentSwapTarget = staff;
    selectedAlternativeId = null;
    document.getElementById('modalCurrentName').textContent = staff.name + ' (' + staff.home + ')';
    document.getElementById('confirmSwapBtn').disabled = true;

    const staffSkillsLower = staff.skills.map(s => s.toLowerCase());
    const similarAlternatives = availableAlternatives.filter(alt => {
        const altSkillsLower = alt.skills.map(s => s.toLowerCase());
        return staffSkillsLower.some(ss => altSkillsLower.some(as => as.includes(ss) || ss.includes(as)));
    });

    const displayAlternatives = similarAlternatives.length > 0 ? similarAlternatives : availableAlternatives;
    const listContainer = document.getElementById('modalAlternativesList');
    if (listContainer) {
        listContainer.innerHTML = displayAlternatives.slice(0, 5).map(alt => {
            const riskClass = alt.scores.complexity === 'low' ? 'low' : alt.scores.complexity === 'medium' ? 'medium' : 'high';
            return `
                <div class="modal-alt-item" data-alt-id="${alt.id}" onclick="selectAlternative(${alt.id})">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-cozm-light-teal flex items-center justify-center text-cozm-teal font-medium text-sm">${alt.name.split(' ').map(n => n[0]).join('')}</div>
                        <div><p class="font-medium text-gray-900">${alt.name}</p><p class="text-xs text-gray-500">${alt.home} | ${alt.skills.join(', ')}</p></div>
                    </div>
                    <div class="text-right"><p class="font-semibold">${formatCurrency(alt.scores.totalCost)}</p><div class="flex items-center gap-2 justify-end"><span class="risk-dot ${riskClass}"></span><span class="text-xs text-gray-500">${alt.scores.visaWeeks} weeks</span></div></div>
                </div>
            `;
        }).join('');
        if (displayAlternatives.length === 0) listContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No alternatives available</p>';
    }
    document.getElementById('findAlternativeModal').classList.add('active');
}

function selectAlternative(altId) {
    selectedAlternativeId = altId;
    document.querySelectorAll('.modal-alt-item').forEach(item => item.classList.remove('selected'));
    const selectedItem = document.querySelector(`[data-alt-id="${altId}"]`);
    if (selectedItem) selectedItem.classList.add('selected');
    document.getElementById('confirmSwapBtn').disabled = false;
}

function confirmSwap() {
    if (!currentSwapTarget || !selectedAlternativeId) return;
    const newPerson = availableAlternatives.find(s => s.id === selectedAlternativeId);
    if (!newPerson) return;
    selectedTeam = selectedTeam.filter(s => s.id !== currentSwapTarget.id);
    availableAlternatives.push(currentSwapTarget);
    selectedTeam.push(newPerson);
    availableAlternatives = availableAlternatives.filter(s => s.id !== selectedAlternativeId);
    availableAlternatives.sort((a, b) => b.overallScore - a.overallScore);
    const hostCountry = document.getElementById('projectHostCountry').value;
    updateSelectedIndividualsTable(selectedTeam, hostCountry);
    updateAlternativesDisplay();
    closeAlternativeModal();
    showToast(`Swapped ${currentSwapTarget.name} with ${newPerson.name}`);
}

function closeAlternativeModal() {
    const modal = document.getElementById('findAlternativeModal');
    if (modal) modal.classList.remove('active');
    currentSwapTarget = null;
    selectedAlternativeId = null;
}

function showToast(message, type = 'default') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3000);
}

function toggleAlternatives() {
    const panel = document.getElementById('alternativesPanel');
    const arrow = document.getElementById('alternativesArrow');
    if (panel) panel.classList.toggle('hidden');
    if (arrow) arrow.style.transform = panel.classList.contains('hidden') ? '' : 'rotate(90deg)';
}

function proceedToCalculator() {
    switchMainTab('calculator');
}

// ===== VOICE COMMANDS =====

let recognition = null;
let isListening = false;

function initVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) voiceBtn.style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-GB';

    recognition.onstart = () => {
        isListening = true;
        document.getElementById('voiceBtn').classList.add('listening');
        document.getElementById('voiceStatus').textContent = 'Listening...';
    };

    recognition.onend = () => {
        isListening = false;
        document.getElementById('voiceBtn').classList.remove('listening');
        document.getElementById('voiceStatus').textContent = '';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        processVoiceCommand(transcript);
    };

    recognition.onerror = (event) => {
        isListening = false;
        document.getElementById('voiceBtn').classList.remove('listening');
        document.getElementById('voiceStatus').textContent = '';
        if (event.error === 'not-allowed') showToast('Microphone access denied');
    };
}

function toggleVoiceCommand() {
    if (!recognition) {
        initVoiceRecognition();
        if (!recognition) {
            showToast('Voice commands not supported in this browser');
            return;
        }
    }
    if (isListening) recognition.stop();
    else recognition.start();
}

function processVoiceCommand(transcript) {
    document.getElementById('voiceStatus').textContent = `"${transcript}"`;
    let recognised = false;
    if (transcript.includes('cost') || transcript.includes('cheapest') || transcript.includes('lowest')) {
        selectOptimisation('cost');
        showToast('Optimising for lowest cost', 'success');
        recognised = true;
    } else if (transcript.includes('speed') || transcript.includes('fast') || transcript.includes('quick')) {
        selectOptimisation('speed');
        showToast('Optimising for fastest deployment', 'success');
        recognised = true;
    } else if (transcript.includes('compliance') || transcript.includes('risk') || transcript.includes('safe')) {
        selectOptimisation('compliance');
        showToast('Optimising for best compliance', 'success');
        recognised = true;
    } else if (transcript.includes('find') || transcript.includes('optimise') || transcript.includes('optimize') || transcript.includes('calculate')) {
        optimiseStaffing();
        showToast('Finding optimal team...', 'success');
        recognised = true;
    }

    if (!recognised) showToast('Command not recognised. Try "optimise for cost", "speed", or "compliance"');
    setTimeout(() => { document.getElementById('voiceStatus').textContent = ''; }, 2000);
}

// ===== INITIALIZATION =====

// Global initApp function called by auth check after successful authentication
window.initApp = function() {
    console.log('[APP] initApp called - applying settings');
    applySettingsToUI();
};

document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('startDate');
    if (startDateInput) startDateInput.value = today;

    // Show admin button for superusers
    if (window.currentUserRole === 'superuser') {
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = 'flex';
    }

    // Load and apply user settings from localStorage
    applySettingsToUI();

    await loadTaxRules();
    await fetchExchangeRates();
    updateCountryInfo();
    initVoiceRecognition();

    // Setup drag and drop
    setupDragAndDrop('dropZone', handleFileUpload);
    setupDragAndDrop('staffDropZone', handleStaffUpload);
});

function setupDragAndDrop(elementId, callback) {
    const zone = document.getElementById(elementId);
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) callback({ target: { files } });
    });
}

async function appSignOut() {
    const supabase = window.SupabaseConfig.init();
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

// Auto-populate demo data for demonstrations
function autoPopulateDemo() {
    // Set demo values
    const demoData = {
        homeCountry: 'Finland',
        hostCountry: 'Brazil',
        monthlySalary: 7500,
        assignmentLength: '6',
        workingDays: 22
    };

    // Populate form fields
    const homeCountryEl = document.getElementById('homeCountry');
    const hostCountryEl = document.getElementById('hostCountry');
    const monthlySalaryEl = document.getElementById('monthlySalary');
    const assignmentLengthEl = document.getElementById('assignmentLength');
    const workingDaysEl = document.getElementById('workingDays');

    if (homeCountryEl) homeCountryEl.value = demoData.homeCountry;
    if (hostCountryEl) {
        hostCountryEl.value = demoData.hostCountry;
        updateCountryInfo(); // Update per diem based on host country
    }
    if (monthlySalaryEl) monthlySalaryEl.value = demoData.monthlySalary;
    if (assignmentLengthEl) assignmentLengthEl.value = demoData.assignmentLength;
    if (workingDaysEl) workingDaysEl.value = demoData.workingDays;

    // Visual feedback
    showToast('Demo data loaded - click Generate Estimate', 'success');
}
