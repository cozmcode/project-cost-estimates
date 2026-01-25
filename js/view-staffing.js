// Staffing View Logic
// Handles the UI interactions for the Resource Optimization Engine (Staffing Tab)

// Tab switching logic for Staffing Engine
function switchMainTab(tab) {
    const calcSection = document.getElementById('section-calculator');
    const staffSection = document.getElementById('section-staffing');
    const analyticsSection = document.getElementById('section-analytics');
    const navCalc = document.getElementById('nav-calculator');
    const navStaff = document.getElementById('nav-staffing');
    const navAnalytics = document.getElementById('nav-analytics');

    // Hide all
    if (calcSection) calcSection.classList.add('hidden');
    if (staffSection) staffSection.classList.add('hidden');
    if (analyticsSection) analyticsSection.classList.add('hidden');
    
    // Deactivate all navs
    if (navCalc) navCalc.classList.remove('nav-tab-active');
    if (navStaff) navStaff.classList.remove('nav-tab-active');
    if (navAnalytics) navAnalytics.classList.remove('nav-tab-active');

    // Show active
    if (tab === 'calculator') {
        if (calcSection) calcSection.classList.remove('hidden');
        if (navCalc) navCalc.classList.add('nav-tab-active');
    } else if (tab === 'staffing') {
        if (staffSection) staffSection.classList.remove('hidden');
        if (navStaff) navStaff.classList.add('nav-tab-active');
    } else if (tab === 'analytics') {
        if (analyticsSection) analyticsSection.classList.remove('hidden');
        if (navAnalytics) navAnalytics.classList.add('nav-tab-active');
    }
}

// Optimisation preset weights
const OPTIMIZATION_PRESETS = {
    cost: { cost: 70, speed: 15, compliance: 15 },
    speed: { speed: 70, cost: 15, compliance: 15 },
    compliance: { compliance: 70, cost: 15, speed: 15 }
};

// Select optimisation preset
function selectPreset(button) {
    document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
    button.classList.add('selected');
    // Auto-run optimization when preset changes
    runOptimizationDebounced();
}

// Get selected preset weights
function getSelectedWeights() {
    const selected = document.querySelector('.preset-card.selected');
    return OPTIMIZATION_PRESETS[selected?.dataset.preset || 'cost'];
}

// Toggle skill chip selection
function toggleSkill(button) {
    button.classList.toggle('selected');
    // Auto-run optimization when skills change
    runOptimizationDebounced();
}

// Debounced optimization runner (prevents too many calls)
let optimizationTimeout = null;
function runOptimizationDebounced() {
    if (optimizationTimeout) clearTimeout(optimizationTimeout);
    optimizationTimeout = setTimeout(() => {
        runOptimization();
    }, 300);
}

// Add change listeners to all form inputs for auto-update
document.addEventListener('DOMContentLoaded', function() {
    const inputs = ['projectDestination', 'projectRole', 'projectCount', 'projectDuration'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', runOptimizationDebounced);
        }
    });
});

// Get array of selected skills
function getSelectedSkills() {
    const chips = document.querySelectorAll('#skillsSelector .skill-chip.selected');
    return Array.from(chips).map(chip => chip.dataset.skill);
}

// Run Optimization (async to support API calls)
async function runOptimization() {
    // Show loading state
    const runButton = document.querySelector('#section-staffing .btn-primary');
    // Guard clause if button doesn't exist (e.g. if script loads before DOM)
    if (!runButton) return;
    
    const originalText = runButton.innerHTML;
    runButton.innerHTML = '<span class="flex items-center gap-2"><svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Optimising...</span>';
    runButton.disabled = true;

    try {
        // 1. Get Inputs
        const project = {
            country: document.getElementById('projectDestination').value,
            role: document.getElementById('projectRole').value,
            durationMonths: parseInt(document.getElementById('projectDuration').value),
            count: parseInt(document.getElementById('projectCount').value),
            requiredSkills: getSelectedSkills()
        };

        // Get weights from selected preset
        const weights = getSelectedWeights();

        // 2. Run Engine (async)
        const results = await staffingEngine.optimizeTeam(project, weights);

        // 3. Render Results
        const tbody = document.getElementById('staffing-results-body');
        tbody.innerHTML = '';

        results.forEach((candidate, index) => {
            const details = candidate.scores.details;

            // Get CO2 footprint for this route
            const carbonKey = `${candidate.current_location}_${project.country}`;
            const carbonKg = MOCK_DATA.carbonFootprint?.[carbonKey] || 0;

            // Skills match calculation (using brand colours)
            const skillsMatch = details.skillsMatch || { percentage: 0, matched: [], total: 0 };
            const skillsMatchClass = skillsMatch.percentage === 100 ? 'skills-badge full-match' :
                                    skillsMatch.percentage >= 50 ? 'skills-badge partial-match' :
                                    skillsMatch.percentage > 0 ? 'skills-badge low-match' : 'skills-badge no-match';
            const skillsDisplay = skillsMatch.total > 0
                ? `${skillsMatch.matched.length}/${skillsMatch.total} (${skillsMatch.percentage}%)`
                : 'N/A';

            // Compliance risks (using brand colours)
            const risks = details.risks || [];
            const complianceScore = candidate.scores.complianceScore;
            const complianceClass = complianceScore >= 80 ? 'compliance-bar-fill high' :
                                   complianceScore >= 50 ? 'compliance-bar-fill medium' :
                                   'compliance-bar-fill low';
            const riskHtml = risks.length > 0
                ? risks.map(r => `<div class="risk-badge ${r.includes('CRITICAL') ? 'critical' : r.includes('WARNING') ? 'warning' : 'note'}">${r}</div>`).join('')
                : '';

            // Visa badge styling (brand colours)
            const visaBadgeClass = details.visaDays === 0 ? 'visa-badge in-country' : 'visa-badge processing';

            // Carbon indicator styling (brand colours)
            const carbonIndicatorClass = carbonKg < 500 ? 'carbon-indicator low' : carbonKg < 1500 ? 'carbon-indicator medium' : 'carbon-indicator high';

            const tr = document.createElement('tr');
            tr.className = 'bg-white border-b hover:bg-gray-50';
            tr.innerHTML = `
                <td class="px-6 py-4 font-bold" style="color: var(--cozm-dark-indigo);">#${index + 1}</td>
                <td class="px-6 py-4">
                    <div class="font-bold" style="color: var(--cozm-dark-indigo);">${candidate.first_name} ${candidate.last_name}</div>
                    <div class="text-xs" style="color: var(--cozm-light-sky-blue);">${candidate.nationality} • From ${candidate.current_location}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="${skillsMatchClass}">
                        ${skillsDisplay}
                    </span>
                    ${skillsMatch.matched.length > 0 ? `<div class="text-xs mt-1" style="color: var(--cozm-light-sky-blue);">${skillsMatch.matched.join(', ')}</div>` : ''}
                </td>
                <td class="px-6 py-4">
                    <span class="${visaBadgeClass}">
                        ${details.visaType}
                    </span>
                    <div class="text-xs mt-1" style="color: var(--cozm-light-sky-blue);">${details.visaDays} days processing</div>
                    ${riskHtml}
                </td>
                <td class="px-6 py-4 font-medium" style="color: var(--cozm-dark-indigo);">
                    €${details.totalCost.toLocaleString()}
                    <div class="${carbonIndicatorClass}">
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
                        ${carbonKg > 0 ? carbonKg + ' kg CO₂' : 'No flight'}
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <div class="score-bar" style="width: 100px;">
                            <div class="score-bar-fill" style="width: ${candidate.finalScore}%;"></div>
                        </div>
                        <span class="text-xs font-bold" style="color: var(--cozm-dark-indigo);">${candidate.finalScore}</span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <button class="font-bold text-sm" style="color: var(--cozm-teal);" onmouseover="this.style.color='var(--cozm-dark-indigo)'" onmouseout="this.style.color='var(--cozm-teal)'">Select</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('staffing-results').classList.remove('hidden');
        // Scroll to results
        document.getElementById('staffing-results').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('[Staffing Engine] Error:', error);
        alert('Error running optimisation. Check console for details.');
    } finally {
        // Restore button
        if (runButton) {
            runButton.innerHTML = originalText;
            runButton.disabled = false;
        }
    }
}
