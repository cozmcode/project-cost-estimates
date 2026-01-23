// FSE Deployment Cost Calculator - Application Logic
// Handles calculations, staffing optimisation, and UI interactions

// Tax rules loaded from JSON (will be fetched on page load)
let taxRules = null;

// Exchange rates cache
let exchangeRatesCache = {
    rates: {},
    lastFetched: null,
    source: 'ECB via Frankfurter API'
};

// Finnish 2025 per diem rates by country (locked as per requirements)
const finnishPerDiemRates = {
    Brazil: 66,
    USA: 75,
    Germany: 62,
    UK: 83,
    UAE: 74,
    Singapore: 88,
    Australia: 72,
    Mexico: 51,
    India: 55,
    SouthAfrica: 52,
    default: 52
};
const perDiemSource = 'Finnish Tax Administration 2025';
const perDiemSourceUrl = 'https://www.veronmaksajat.fi/neuvot/henkiloverotus/tyo-elaka-ja-etuudet/paivarahat-ja-kilometrikorvaukset/2024/ulkomaan-paivarahat-2025/';

// Country tax configurations (fallback static rates)
const countryConfig = {
    Brazil: { taxRate: 0.275, currency: 'BRL', exchangeRate: 6.187, currencySymbol: 'R$', deduction: 16754.34, socialSec: 0, name: 'Brazil' },
    USA: { taxRate: 0.37, currency: 'USD', exchangeRate: 1.08, currencySymbol: '$', deduction: 13850, socialSec: 0.0765, name: 'United States' },
    Germany: { taxRate: 0.45, currency: 'EUR', exchangeRate: 1.0, currencySymbol: '€', deduction: 10908, socialSec: 0.205, name: 'Germany' },
    UK: { taxRate: 0.45, currency: 'GBP', exchangeRate: 0.86, currencySymbol: '£', deduction: 12570, socialSec: 0.138, name: 'United Kingdom' },
    UAE: { taxRate: 0, currency: 'AED', exchangeRate: 3.96, currencySymbol: 'AED ', deduction: 0, socialSec: 0, name: 'United Arab Emirates' },
    Singapore: { taxRate: 0.22, currency: 'SGD', exchangeRate: 1.45, currencySymbol: 'S$', deduction: 0, socialSec: 0.17, name: 'Singapore' },
    Australia: { taxRate: 0.45, currency: 'AUD', exchangeRate: 1.65, currencySymbol: 'A$', deduction: 18200, socialSec: 0.115, name: 'Australia' },
    Mexico: { taxRate: 0.35, currency: 'MXN', exchangeRate: 18.5, currencySymbol: 'MX$', deduction: 0, socialSec: 0.0625, name: 'Mexico' },
    India: { taxRate: 0.30, currency: 'INR', exchangeRate: 90.5, currencySymbol: '₹', deduction: 250000, socialSec: 0.12, name: 'India' },
    SouthAfrica: { taxRate: 0.45, currency: 'ZAR', exchangeRate: 20.2, currencySymbol: 'R', deduction: 87300, socialSec: 0.01, name: 'South Africa' }
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

// Calculate progressive tax
function calculateProgressiveTax(income, brackets) {
    let tax = 0;
    for (const bracket of brackets) {
        if (income > bracket.min) {
            const maxBracket = bracket.max || Infinity;
            const taxableInBracket = Math.min(income, maxBracket) - bracket.min;
            tax += taxableInBracket * bracket.rate;
        }
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
    const grossSalary = monthlySalary * assignmentLength;
    const totalAllowances = dailyAllowance * totalWorkingDays;

    // Get tax rules for this country
    const countryTaxRules = taxRules ? taxRules[hostCountry] : null;
    const isResident = isResidentForTax(assignmentLength);

    // Use country-specific configuration
    const exchangeRate = config.exchangeRate;

    // Determine what's taxable based on country rules
    let taxableAdminFees = 0;
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

    // Check if admin fees are taxable based on country rules
    let visaFeesTaxableNote = '';
    let relocationTaxableNote = '';

    if (countryTaxRules) {
        if (countryTaxRules.visaFeesTaxable === true) {
            taxableAdminFees += visaFee + workPermitFee;
            visaFeesTaxableNote = `Visa/permit fees TAXABLE: ${countryTaxRules.visaFeesNote}`;
        }
        if (countryTaxRules.relocationTaxable === true) {
            taxableAdminFees += taxSocialSecReg;
            relocationTaxableNote = `Relocation costs TAXABLE: ${countryTaxRules.relocationNote}`;
        }
    }

    // Total taxable income (gross salary + allowances + taxable admin fees)
    // Per diem is typically not taxable in most jurisdictions
    const taxableIncomeEUR = grossSalary + taxableAdminFees;
    const taxableIncomeLocal = taxableIncomeEUR * exchangeRate;

    // Calculate tax using progressive brackets or flat rate
    let taxAmountLocal = 0;
    let taxCalculationMethod = '';
    let effectiveTaxRate = 0;

    if (countryTaxRules && countryTaxRules.taxBrackets && isResident) {
        // Use progressive tax brackets for residents
        taxAmountLocal = calculateProgressiveTax(taxableIncomeLocal, countryTaxRules.taxBrackets);
        taxCalculationMethod = 'Progressive brackets (resident)';
        effectiveTaxRate = taxableIncomeLocal > 0 ? (taxAmountLocal / taxableIncomeLocal) * 100 : 0;
    } else if (countryTaxRules && countryTaxRules.nonResidentRate && !isResident) {
        // Use flat non-resident rate for short assignments
        taxAmountLocal = taxableIncomeLocal * countryTaxRules.nonResidentRate;
        taxCalculationMethod = `Non-resident flat rate (${(countryTaxRules.nonResidentRate * 100).toFixed(0)}%)`;
        effectiveTaxRate = countryTaxRules.nonResidentRate * 100;
    } else {
        // Fallback to old flat rate calculation
        const standardDeduction = config.deduction;
        taxAmountLocal = Math.max(0, (taxableIncomeLocal - standardDeduction) * config.taxRate);
        taxCalculationMethod = `Flat rate with deduction`;
        effectiveTaxRate = config.taxRate * 100;
    }

    const taxAmountEUR = taxAmountLocal / exchangeRate;

    // Tax per day calculations
    const taxPerDayLocal = taxAmountLocal / totalCalendarDays;
    const taxPerDayEUR = taxAmountEUR / totalCalendarDays;

    // Social security based on country
    const socialSecurityCost = grossSalary * config.socialSec;

    // Grand totals
    const grandTotal = taxAmountEUR + socialSecurityCost + totalAllowances + totalAdminFees;
    const costPerDay = grandTotal / totalCalendarDays;

    // Update Summary View
    document.getElementById('summaryTax').textContent = formatCurrency(taxAmountEUR);
    document.getElementById('summarySocialSec').textContent = formatCurrency(socialSecurityCost);
    document.getElementById('summaryAllowances').textContent = formatCurrency(totalAllowances);
    document.getElementById('summaryAdminFees').textContent = formatCurrency(totalAdminFees);
    document.getElementById('summaryPerDay').textContent = formatCurrencyDecimal(costPerDay);
    document.getElementById('summaryTotal').textContent = formatCurrency(grandTotal);

    // Update Detailed View (with null checks for optional elements)
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

    // Update table headers to show selected country
    const tableHeader = document.querySelector('.breakdown-table thead th');
    if (tableHeader) tableHeader.textContent = `Tax Calculation - ${config.name}`;

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

    // Admin fees per day with taxability notes (optional elements)
    setElementText('detailWorkPermitPerDay', formatCurrencyDecimal(workPermitFee / totalCalendarDays));
    setElementText('detailVisaPerDay', formatCurrencyDecimal(visaFee / totalCalendarDays));
    setElementText('detailRegPerDay', formatCurrencyDecimal(taxSocialSecReg / totalCalendarDays));
    setElementText('detailAdminTotal', formatCurrency(totalAdminFees));
    setElementText('detailAdminPerDay', formatCurrencyDecimal(totalAdminFees / totalCalendarDays));

    // Grand totals in detailed view (optional elements)
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
        totalAllowances,
        taxableIncomeEUR,
        taxableIncomeLocal,
        exchangeRate,
        taxAmountLocal,
        taxAmountEUR,
        taxPerDayLocal,
        taxPerDayEUR,
        taxCalculationMethod,
        effectiveTaxRate,
        socialSecurityCost,
        totalAdminFees,
        grandTotal,
        costPerDay,
        hostCountry,
        config,
        countryTaxRules,
        isResident,
        visaFeesTaxableNote,
        relocationTaxableNote,
        taxableAdminFees
    });

    // Show results section
    document.getElementById('resultsSection').classList.remove('hidden');

    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Update the detailed calculation workings display
function updateCalculationWorkings(calc) {
    const workingsContainer = document.getElementById('calculationWorkings');
    if (!workingsContainer) return;

    const rateDate = exchangeRatesCache.date || 'static fallback';
    const taxSource = calc.countryTaxRules ? calc.countryTaxRules.taxSource : 'Default rates';
    const taxSourceUrl = calc.countryTaxRules ? calc.countryTaxRules.taxSourceUrl : '#';

    let adminFeesNotes = '';
    if (calc.visaFeesTaxableNote) {
        adminFeesNotes += `<li class="text-cozm-gold">${calc.visaFeesTaxableNote}</li>`;
    }
    if (calc.relocationTaxableNote) {
        adminFeesNotes += `<li class="text-cozm-gold">${calc.relocationTaxableNote}</li>`;
    }
    if (calc.taxableAdminFees > 0) {
        adminFeesNotes += `<li>Taxable admin fees included in income: ${formatCurrency(calc.taxableAdminFees)}</li>`;
    }

    workingsContainer.innerHTML = `
        <div class="bg-gray-50 rounded-lg p-6 font-mono text-sm">
            <div class="border-b-2 border-gray-300 pb-4 mb-4">
                <h4 class="text-lg font-bold text-gray-900 mb-2">INCOME CALCULATION</h4>
                <table class="w-full">
                    <tr><td class="py-1">Monthly Salary</td><td class="text-right">${formatCurrency(calc.monthlySalary)}</td></tr>
                    <tr><td class="py-1">Assignment Length</td><td class="text-right">× ${calc.assignmentLength} months</td></tr>
                    <tr class="border-t border-gray-300"><td class="py-1 font-semibold">Gross Salary (EUR)</td><td class="text-right font-semibold">${formatCurrency(calc.grossSalary)}</td></tr>
                </table>
                <table class="w-full mt-4">
                    <tr><td class="py-1">Daily Allowance (<a href="${perDiemSourceUrl}" target="_blank" class="text-cozm-teal hover:underline">${perDiemSource}</a>)</td><td class="text-right">${formatCurrency(calc.dailyAllowance)}</td></tr>
                    <tr><td class="py-1">Working Days (${calc.totalWorkingDays / calc.assignmentLength}/month × ${calc.assignmentLength})</td><td class="text-right">× ${calc.totalWorkingDays} days</td></tr>
                    <tr class="border-t border-gray-300"><td class="py-1 font-semibold">Total Per Diem (EUR)</td><td class="text-right font-semibold">${formatCurrency(calc.totalAllowances)}</td></tr>
                </table>
            </div>

            <div class="border-b-2 border-gray-300 pb-4 mb-4">
                <h4 class="text-lg font-bold text-gray-900 mb-2">CURRENCY CONVERSION</h4>
                <table class="w-full">
                    <tr><td class="py-1">Exchange Rate</td><td class="text-right">1 EUR = ${calc.exchangeRate.toFixed(3)} ${calc.config.currency}</td></tr>
                    <tr><td class="py-1">Source</td><td class="text-right">${exchangeRatesCache.source}</td></tr>
                    <tr><td class="py-1">Date</td><td class="text-right">${rateDate}</td></tr>
                </table>
                <table class="w-full mt-4">
                    <tr><td class="py-1">Gross Salary (${calc.config.currency})</td><td class="text-right">${formatLocalCurrency(calc.grossSalary * calc.exchangeRate, calc.hostCountry)}</td></tr>
                    <tr><td class="py-1">Per Diem (${calc.config.currency})</td><td class="text-right">${formatLocalCurrency(calc.totalAllowances * calc.exchangeRate, calc.hostCountry)}</td></tr>
                    <tr class="border-t border-gray-300"><td class="py-1 font-semibold">Total Income (${calc.config.currency})</td><td class="text-right font-semibold">${formatLocalCurrency((calc.grossSalary + calc.totalAllowances) * calc.exchangeRate, calc.hostCountry)}</td></tr>
                </table>
            </div>

            <div class="border-b-2 border-gray-300 pb-4 mb-4">
                <h4 class="text-lg font-bold text-gray-900 mb-2">TAX CALCULATION - ${calc.config.name} (${calc.isResident ? 'Resident' : 'Non-Resident'})</h4>
                <table class="w-full">
                    <tr><td class="py-1">Taxable Income (${calc.config.currency})</td><td class="text-right">${formatLocalCurrency(calc.taxableIncomeLocal, calc.hostCountry)}</td></tr>
                    <tr><td class="py-1">Calculation Method</td><td class="text-right">${calc.taxCalculationMethod}</td></tr>
                    <tr><td class="py-1">Effective Rate</td><td class="text-right">${calc.effectiveTaxRate.toFixed(1)}%</td></tr>
                    <tr><td class="py-1">Source</td><td class="text-right"><a href="${taxSourceUrl}" target="_blank" class="text-cozm-teal hover:underline">${taxSource}</a></td></tr>
                </table>
                <table class="w-full mt-4">
                    <tr><td class="py-1">Tax (${calc.config.currency})</td><td class="text-right">${formatLocalCurrency(calc.taxAmountLocal, calc.hostCountry)}</td></tr>
                    <tr class="border-t border-gray-300"><td class="py-1 font-semibold">Tax (EUR)</td><td class="text-right font-semibold">${formatCurrency(calc.taxAmountEUR)}</td></tr>
                </table>
                <table class="w-full mt-4 bg-cozm-light-teal rounded p-2">
                    <tr><td class="py-1 font-semibold">Tax Per Day (${calc.config.currency})</td><td class="text-right font-semibold">${formatLocalCurrency(calc.taxPerDayLocal, calc.hostCountry)}</td></tr>
                    <tr><td class="py-1 font-semibold">Tax Per Day (EUR)</td><td class="text-right font-semibold">${formatCurrencyDecimal(calc.taxPerDayEUR)}</td></tr>
                </table>
            </div>

            ${adminFeesNotes ? `
            <div class="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                <h5 class="font-semibold text-yellow-800 mb-2">Admin Fees Taxability Notes</h5>
                <ul class="text-sm text-yellow-700 space-y-1">${adminFeesNotes}</ul>
            </div>
            ` : ''}

            <div class="bg-cozm-dark text-white rounded p-4">
                <h4 class="text-lg font-bold mb-2">GRAND TOTAL</h4>
                <table class="w-full">
                    <tr><td class="py-1">Tax Costs</td><td class="text-right">${formatCurrency(calc.taxAmountEUR)}</td></tr>
                    <tr><td class="py-1">Social Security</td><td class="text-right">${formatCurrency(calc.socialSecurityCost)}</td></tr>
                    <tr><td class="py-1">Daily Allowances</td><td class="text-right">${formatCurrency(calc.totalAllowances)}</td></tr>
                    <tr><td class="py-1">Admin Fees</td><td class="text-right">${formatCurrency(calc.totalAdminFees)}</td></tr>
                    <tr class="border-t border-white/30"><td class="py-2 font-bold text-lg">TOTAL ASSIGNMENT COST</td><td class="text-right font-bold text-lg">${formatCurrency(calc.grandTotal)}</td></tr>
                    <tr class="bg-cozm-teal rounded"><td class="py-2 font-bold">COST PER DAY</td><td class="text-right font-bold">${formatCurrencyDecimal(calc.costPerDay)}</td></tr>
                </table>
            </div>
        </div>
    `;

    workingsContainer.classList.remove('hidden');
}

// File upload handling (mock)
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const mockData = [
            { name: 'Mikko Virtanen', home: 'Finland', host: 'Brazil', salary: '€7,500', duration: '12 months' },
            { name: 'João Silva', home: 'Portugal', host: 'USA', salary: '€6,800', duration: '6 months' },
            { name: 'Antti Korhonen', home: 'Finland', host: 'Germany', salary: '€7,200', duration: '9 months' },
            { name: 'Maria Santos', home: 'Portugal', host: 'UAE', salary: '€6,500', duration: '12 months' },
            { name: 'Pekka Nieminen', home: 'Finland', host: 'Singapore', salary: '€8,000', duration: '6 months' },
        ];

        const tbody = document.getElementById('bulkPreviewBody');
        if (tbody) {
            tbody.innerHTML = mockData.map(row => `
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
        loadedStaffPool = [...sampleStaffPool];
        showStaffPreview();
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

document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('startDate');
    if (startDateInput) startDateInput.value = today;

    // Show admin button for superusers
    if (window.currentUserRole === 'superuser') {
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = 'flex';
    }

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
