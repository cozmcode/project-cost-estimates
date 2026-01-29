// Move Screening Wizard Logic
// Handles the 3-step screening wizard: Assignment Details → Business Justification → AI Decision

const SCREENING_ENDPOINT = 'https://cwflqdfytvniozxcreiq.supabase.co/functions/v1/screen-move';

// Character counter for justification textarea
document.addEventListener('DOMContentLoaded', function () {
    const textarea = document.getElementById('screenJustification');
    const counter = document.getElementById('screenJustificationCount');
    if (textarea && counter) {
        textarea.addEventListener('input', function () {
            counter.textContent = textarea.value.length;
        });
    }
});

/**
 * Navigate to the next screening step
 */
function nextScreeningStep(step) {
    // Validate current step before advancing
    const currentStep = step - 1;
    if (!validateScreeningStep(currentStep)) return;

    showScreeningStep(step);
}

/**
 * Navigate to the previous screening step
 */
function prevScreeningStep(step) {
    showScreeningStep(step);
}

/**
 * Show a specific screening step and update progress bar
 */
function showScreeningStep(step) {
    // Hide all steps
    document.querySelectorAll('.screening-step').forEach(el => el.classList.add('hidden'));

    // Show target step
    const target = document.getElementById(`screening-step-${step}`);
    if (target) target.classList.remove('hidden');

    // Update progress bar
    document.querySelectorAll('.screening-progress-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s === step) el.classList.add('active');
        else if (s < step) el.classList.add('completed');
    });

    // Update connecting lines
    const line1 = document.getElementById('screening-line-1');
    const line2 = document.getElementById('screening-line-2');
    if (line1) line1.classList.toggle('completed', step > 1);
    if (line2) line2.classList.toggle('completed', step > 2);
}

/**
 * Validate a screening step's required fields
 */
function validateScreeningStep(step) {
    if (step === 1) {
        const fields = [
            { id: 'screenHomeCountry', label: 'Home Country' },
            { id: 'screenHostCountry', label: 'Host Country' },
            { id: 'screenMonthlySalary', label: 'Monthly Salary' },
            { id: 'screenAssignmentLength', label: 'Assignment Duration' },
            { id: 'screenJobTitle', label: 'Role / Job Title' }
        ];

        const missing = [];
        fields.forEach(f => {
            const el = document.getElementById(f.id);
            if (!el || !el.value || el.value.trim() === '') {
                missing.push(f.label);
                if (el) el.classList.add('border-red-400');
            } else {
                if (el) el.classList.remove('border-red-400');
            }
        });

        if (missing.length > 0) {
            showScreeningToast(`Please complete: ${missing.join(', ')}`, 'error');
            return false;
        }
        return true;
    }

    if (step === 2) {
        const radioGroups = [
            { name: 'screenBusinessCase', label: 'Business case question' },
            { name: 'screenShortTrip', label: 'Short-term trip question' },
            { name: 'screenInitiator', label: 'Move initiator question' },
            { name: 'screenExistingProject', label: 'Existing project question' }
        ];

        const missing = [];
        radioGroups.forEach(g => {
            const checked = document.querySelector(`input[name="${g.name}"]:checked`);
            if (!checked) missing.push(g.label);
        });

        const justification = document.getElementById('screenJustification');
        if (!justification || justification.value.trim().length < 50) {
            missing.push('Business justification (minimum 50 characters)');
        }

        const localSearch = document.getElementById('screenLocalSearch');
        if (!localSearch || !localSearch.value) {
            missing.push('Local market search');
        }

        if (missing.length > 0) {
            showScreeningToast(`Please complete: ${missing.join(', ')}`, 'error');
            return false;
        }
        return true;
    }

    return true;
}

/**
 * Submit screening for AI evaluation
 */
async function submitScreening() {
    // Validate step 2 first
    if (!validateScreeningStep(2)) return;

    // Move to step 3 (shows loading)
    showScreeningStep(3);

    const loadingEl = document.getElementById('screening-loading');
    const resultEl = document.getElementById('screening-result');
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (resultEl) resultEl.classList.add('hidden');

    // Collect all form data
    const data = {
        homeCountry: document.getElementById('screenHomeCountry').value,
        hostCountry: document.getElementById('screenHostCountry').value,
        monthlySalary: parseFloat(document.getElementById('screenMonthlySalary').value),
        assignmentMonths: parseInt(document.getElementById('screenAssignmentLength').value),
        workingDays: parseInt(document.getElementById('screenWorkingDays').value),
        employeeName: document.getElementById('screenEmployeeName').value || 'Not specified',
        jobTitle: document.getElementById('screenJobTitle').value,
        businessCase: document.querySelector('input[name="screenBusinessCase"]:checked')?.value,
        shortTrip: document.querySelector('input[name="screenShortTrip"]:checked')?.value,
        initiator: document.querySelector('input[name="screenInitiator"]:checked')?.value,
        justification: document.getElementById('screenJustification').value,
        localSearch: document.getElementById('screenLocalSearch').value,
        existingProject: document.querySelector('input[name="screenExistingProject"]:checked')?.value
    };

    try {
        const response = await fetch(SCREENING_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        renderScreeningResult(result, data);
    } catch (error) {
        console.error('[Screening] Error:', error);
        renderScreeningResult({
            decision: 'error',
            reasoning: 'Unable to connect to the screening service. Please try again later.',
            confidence: 0,
            flags: ['Service unavailable']
        }, data);
    } finally {
        if (loadingEl) loadingEl.classList.add('hidden');
    }
}

/**
 * Render the AI screening result
 */
function renderScreeningResult(result, data) {
    const container = document.getElementById('screening-result');
    if (!container) return;
    container.classList.remove('hidden');

    const isApproved = result.decision === 'approved';
    const isError = result.decision === 'error';

    const cardClass = isError ? 'screening-result-card error' : isApproved ? 'screening-result-card approved' : 'screening-result-card rejected';
    const icon = isApproved
        ? '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
        : isError
            ? '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>'
            : '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

    const title = isError ? 'Service Error' : isApproved ? 'Move Approved' : 'Move Not Approved';
    const subtitle = isError ? '' : `Confidence: ${result.confidence}%`;

    const flagsHtml = (result.flags && result.flags.length > 0)
        ? `<div class="mt-4 flex flex-wrap gap-2">${result.flags.map(f => `<span class="screening-flag">${f}</span>`).join('')}</div>`
        : '';

    const actionHtml = isApproved
        ? `<button onclick="proceedToCostAnalysis()" class="btn-primary px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 mx-auto mt-6">
               Proceed to Cost Analysis
               <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
           </button>`
        : isError
            ? `<button onclick="showScreeningStep(2)" class="px-6 py-3 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 mx-auto mt-6">Try Again</button>`
            : `<div class="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
                   <p class="text-sm font-semibold text-gray-700 mb-1">What you can do:</p>
                   <ul class="text-xs text-gray-500 space-y-1 list-disc list-inside">
                       <li>Review the flags above and address the concerns raised</li>
                       <li>Provide additional documentation or business case evidence</li>
                       <li>Consider alternative staffing arrangements (local hire, contractor)</li>
                       <li>Consult with your mobility team for guidance</li>
                   </ul>
                   <button onclick="resetScreening()" class="mt-4 px-4 py-2 rounded-lg font-semibold text-xs border border-gray-200 text-gray-600 hover:bg-gray-100">Start New Screening</button>
               </div>`;

    container.innerHTML = `
        <div class="${cardClass}">
            <div class="flex items-center gap-3 mb-4">
                ${icon}
                <div>
                    <h3 class="text-lg font-bold">${title}</h3>
                    ${subtitle ? `<p class="text-sm opacity-75">${subtitle}</p>` : ''}
                </div>
            </div>
            <p class="text-sm leading-relaxed">${result.reasoning}</p>
            ${flagsHtml}
            ${actionHtml}
        </div>
    `;
}

/**
 * Copy screening data to Cost Analysis and switch tabs
 */
function proceedToCostAnalysis() {
    // Map screening values to Cost Analysis fields
    const homeCountry = document.getElementById('screenHomeCountry').value;
    const hostCountry = document.getElementById('screenHostCountry').value;
    const salary = document.getElementById('screenMonthlySalary').value;
    const duration = document.getElementById('screenAssignmentLength').value;
    const workingDays = document.getElementById('screenWorkingDays').value;

    // Set Cost Analysis form values
    const homeEl = document.getElementById('homeCountry');
    const hostEl = document.getElementById('hostCountry');
    const salaryEl = document.getElementById('monthlySalary');
    const durationEl = document.getElementById('assignmentLength');
    const workingDaysEl = document.getElementById('workingDays');

    if (homeEl && homeCountry) homeEl.value = homeCountry;
    if (hostEl && hostCountry) hostEl.value = hostCountry;
    if (salaryEl && salary) salaryEl.value = salary;
    if (durationEl && duration) durationEl.value = duration;
    if (workingDaysEl && workingDays) workingDaysEl.value = workingDays;

    // Trigger country info update
    if (typeof updateCountryInfo === 'function') {
        updateCountryInfo();
    }

    // Switch to calculator tab
    switchMainTab('calculator');

    showScreeningToast('Assignment details transferred to Cost Analysis', 'success');
}

/**
 * Reset screening wizard to step 1
 */
function resetScreening() {
    // Clear all form fields
    document.getElementById('screenHomeCountry').value = 'Finland';
    document.getElementById('screenHostCountry').value = 'Brazil';
    document.getElementById('screenMonthlySalary').value = '7000';
    document.getElementById('screenAssignmentLength').value = '6';
    document.getElementById('screenWorkingDays').value = '22';
    document.getElementById('screenEmployeeName').value = '';
    document.getElementById('screenJobTitle').value = 'Field Service Engineer';
    document.getElementById('screenJustification').value = '';
    document.getElementById('screenJustificationCount').textContent = '0';
    document.getElementById('screenLocalSearch').value = '';

    // Clear radio buttons
    document.querySelectorAll('#section-screening input[type="radio"]').forEach(r => r.checked = false);

    // Clear validation highlights
    document.querySelectorAll('#section-screening .border-red-400').forEach(el => el.classList.remove('border-red-400'));

    // Reset result
    const resultEl = document.getElementById('screening-result');
    if (resultEl) {
        resultEl.classList.add('hidden');
        resultEl.innerHTML = '';
    }

    // Go back to step 1
    showScreeningStep(1);
}

/**
 * Show a toast notification for screening
 */
function showScreeningToast(message, type) {
    // Reuse the voice toast element if available
    const toast = document.getElementById('voiceToast');
    if (toast) {
        toast.textContent = message;
        toast.className = 'voice-toast show';
        if (type === 'error') toast.style.background = 'var(--cozm-red)';
        else if (type === 'success') toast.style.background = 'var(--cozm-teal)';
        else toast.style.background = 'var(--cozm-dark-indigo)';

        setTimeout(() => {
            toast.className = 'voice-toast';
            toast.style.background = '';
        }, 3000);
    }
}

// Expose functions to window for onclick handlers
window.nextScreeningStep = nextScreeningStep;
window.prevScreeningStep = prevScreeningStep;
window.submitScreening = submitScreening;
window.proceedToCostAnalysis = proceedToCostAnalysis;
window.resetScreening = resetScreening;
window.showScreeningStep = showScreeningStep;
