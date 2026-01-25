/**
 * Voice Commands Module for FSE Deployment Cost Calculator
 *
 * Architecture:
 * - Primary: OpenAI Realtime API via WebRTC for natural language understanding
 * - Fallback: OpenAI TTS via Supabase Edge Function + keyword-based commands
 *
 * Wrapped in IIFE to avoid conflicts with other scripts
 */

(function() {
    'use strict';

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    const CONFIG = {
        // Feature flag for Realtime API - set to false to use fallback mode
        USE_REALTIME_API: true,

        // API endpoints
        REALTIME_TOKEN_ENDPOINT: 'https://cwflqdfytvniozxcreiq.supabase.co/functions/v1/realtime-token',
        TTS_ENDPOINT: 'https://cwflqdfytvniozxcreiq.supabase.co/functions/v1/tts',

        // WebRTC configuration
        MAX_RECONNECT_ATTEMPTS: 3,
        SESSION_TIMEOUT_MS: 120000,  // 2 minutes max session

        // Logging
        DEBUG: true
    };

    // =========================================================================
    // SHARED STATE
    // =========================================================================

    let voiceIsListening = false;
    let currentMode = null;  // 'realtime' or 'fallback'

    // Platform detection
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // =========================================================================
    // REALTIME API MANAGER (Primary Mode)
    // =========================================================================

    class RealtimeManager {
        constructor() {
            this.peerConnection = null;
            this.dataChannel = null;
            this.audioElement = null;
            this.localStream = null;
            this.isConnected = false;
            this.reconnectAttempts = 0;
            this.sessionTimeout = null;
            this.pendingFunctionCalls = new Map();
        }

        log(message, ...args) {
            if (CONFIG.DEBUG) {
                console.log(`[REALTIME] ${message}`, ...args);
            }
        }

        error(message, ...args) {
            console.error(`[REALTIME] ${message}`, ...args);
        }

        /**
         * Connect to OpenAI Realtime API via WebRTC
         */
        async connect() {
            this.log('Initiating connection...');

            try {
                // Step 1: Get ephemeral token from Supabase Edge Function
                this.log('Fetching ephemeral token...');
                const tokenResponse = await fetch(CONFIG.REALTIME_TOKEN_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!tokenResponse.ok) {
                    const error = await tokenResponse.json().catch(() => ({}));
                    throw new Error(error.error || `Token request failed: ${tokenResponse.status}`);
                }

                const { token, expires_at, session_id } = await tokenResponse.json();
                this.log('Token obtained, expires:', expires_at);

                // Step 2: Create RTCPeerConnection
                this.peerConnection = new RTCPeerConnection();

                // Step 3: Set up audio output
                this.audioElement = document.getElementById('realtimeAudioOutput');
                if (!this.audioElement) {
                    this.audioElement = document.createElement('audio');
                    this.audioElement.id = 'realtimeAudioOutput';
                    this.audioElement.autoplay = true;
                    document.body.appendChild(this.audioElement);
                }

                this.peerConnection.ontrack = (event) => {
                    this.log('Received audio track from OpenAI');
                    this.audioElement.srcObject = event.streams[0];
                };

                // Step 4: Set up data channel for events
                this.dataChannel = this.peerConnection.createDataChannel('oai-events');
                this.dataChannel.onopen = () => {
                    this.log('Data channel opened');
                    this.isConnected = true;
                    showVoiceToast('Voice assistant connected. Speak naturally!');

                    // Send initial form state to model so it knows current values
                    this.sendInitialFormState();
                };
                this.dataChannel.onclose = () => {
                    this.log('Data channel closed');
                    this.handleDisconnect();
                };
                this.dataChannel.onerror = (error) => {
                    this.error('Data channel error:', error);
                };
                this.dataChannel.onmessage = (event) => {
                    this.handleServerEvent(JSON.parse(event.data));
                };

                // Step 5: Get microphone access
                this.log('Requesting microphone access...');
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
                this.log('Microphone access granted');

                // Step 6: Create and set local SDP offer
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);

                // Step 7: Send offer to OpenAI and get answer
                // Using gpt-realtime-mini for lowest latency
                this.log('Sending SDP offer to OpenAI...');
                const sdpResponse = await fetch(
                    'https://api.openai.com/v1/realtime?model=gpt-realtime-mini',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/sdp'
                        },
                        body: offer.sdp
                    }
                );

                if (!sdpResponse.ok) {
                    throw new Error(`SDP exchange failed: ${sdpResponse.status}`);
                }

                const answerSdp = await sdpResponse.text();
                await this.peerConnection.setRemoteDescription({
                    type: 'answer',
                    sdp: answerSdp
                });

                this.log('WebRTC connection established!');
                this.reconnectAttempts = 0;

                // Set session timeout
                this.sessionTimeout = setTimeout(() => {
                    this.log('Session timeout reached, disconnecting...');
                    showVoiceToast('Voice session expired. Click to restart.');
                    this.disconnect();
                }, CONFIG.SESSION_TIMEOUT_MS);

                return true;

            } catch (error) {
                this.error('Connection failed:', error.message);

                // Attempt reconnection
                if (this.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
                    this.reconnectAttempts++;
                    this.log(`Reconnection attempt ${this.reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS}...`);
                    showVoiceToast(`Reconnecting... (${this.reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return this.connect();
                }

                // Fall back to basic mode
                showVoiceToast('Using basic voice commands');
                return false;
            }
        }

        /**
         * Handle events from the OpenAI Realtime server
         */
        handleServerEvent(event) {
            this.log('Server event:', event.type);

            switch (event.type) {
                case 'session.created':
                    this.log('Session created:', event.session?.id);
                    addChatMessage('Session connected', 'system');
                    showVoiceChatPanel();
                    break;

                case 'session.updated':
                    this.log('Session updated');
                    break;

                case 'input_audio_buffer.speech_started':
                    this.log('User started speaking');
                    showVoiceToast('Listening...');
                    break;

                case 'input_audio_buffer.speech_stopped':
                    this.log('User stopped speaking');
                    showVoiceToast('Processing...');
                    break;

                case 'conversation.item.input_audio_transcription.completed':
                    const transcript = event.transcript;
                    this.log('User said:', transcript);
                    showVoiceToast(`Heard: "${transcript.substring(0, 50)}..."`);
                    addChatMessage(transcript, 'user');
                    break;

                case 'response.audio.delta':
                    // Audio is streaming through WebRTC track, nothing to do here
                    break;

                case 'response.audio_transcript.delta':
                    // Could show partial transcript if desired
                    break;

                case 'response.audio_transcript.done':
                    this.log('Assistant said:', event.transcript);
                    if (event.transcript) {
                        addChatMessage(event.transcript, 'assistant');
                    }
                    break;

                case 'response.function_call_arguments.done':
                    // Execute function without displaying in chat (cleaner UX)
                    this.log(`Function call: ${event.name}(${event.arguments})`);
                    this.handleFunctionCall(event.call_id, event.name, JSON.parse(event.arguments));
                    break;

                case 'response.done':
                    this.log('Response completed');
                    showVoiceToast('Ready');
                    break;

                case 'error':
                    this.error('Server error:', event.error);
                    showVoiceToast('Error: ' + (event.error?.message || 'Unknown'));
                    addChatMessage('Error: ' + (event.error?.message || 'Unknown'), 'system');
                    break;

                default:
                    this.log('Unhandled event type:', event.type);
            }
        }

        /**
         * Handle function calls from the model
         */
        handleFunctionCall(callId, name, args) {
            this.log(`Function call: ${name}`, args);
            let result = { success: true };

            try {
                switch (name) {
                    case 'calculate_costs':
                        if (typeof window.calculateCosts === 'function') {
                            window.calculateCosts();
                        } else {
                            result = { success: false, error: 'Calculate function not available' };
                        }
                        break;

                    case 'reset_form':
                        if (typeof window.resetForm === 'function') {
                            window.resetForm();
                        }
                        break;

                    case 'set_home_country':
                        const homeSelect = document.getElementById('homeCountry');
                        if (homeSelect && args.country) {
                            this.log(`Setting home country to: "${args.country}"`);
                            homeSelect.value = args.country;
                            homeSelect.dispatchEvent(new Event('change', { bubbles: true }));

                            if (homeSelect.value === args.country) {
                                result.message = `Home country set to ${args.country}`;
                                this.log(`Home country successfully set to ${args.country}`);
                            } else {
                                result.success = false;
                                result.error = `Could not set home country to ${args.country}. Valid options are: Finland, Portugal`;
                                this.error(`Failed to set home country. Current value: ${homeSelect.value}`);
                            }
                        } else {
                            result.success = false;
                            result.error = homeSelect ? 'No country provided' : 'Home country dropdown not found';
                            this.error('set_home_country failed:', result.error);
                        }
                        break;

                    case 'set_destination':
                        const destSelect = document.getElementById('hostCountry');
                        if (destSelect && args.country) {
                            // Map natural language country names to dropdown values
                            const countryValueMap = {
                                'United Kingdom': 'UK',
                                'United States': 'USA',
                                'United States of America': 'USA',
                                'United Arab Emirates': 'UAE',
                                'South Africa': 'SouthAfrica'
                            };
                            const countryValue = countryValueMap[args.country] || args.country;
                            this.log(`Setting destination: "${args.country}" -> "${countryValue}"`);
                            destSelect.value = countryValue;
                            destSelect.dispatchEvent(new Event('change', { bubbles: true }));

                            // Verify the value was actually set
                            if (destSelect.value === countryValue) {
                                result.message = `Destination set to ${args.country}`;
                                this.log(`Destination successfully set to ${countryValue}`);
                            } else {
                                result.success = false;
                                result.error = `Could not set destination to ${args.country}. Valid options are: ${Array.from(destSelect.options).map(o => o.text).join(', ')}`;
                                this.error(`Failed to set destination. Current value: ${destSelect.value}`);
                            }
                        } else {
                            result.success = false;
                            result.error = destSelect ? 'No country provided' : 'Host country dropdown not found';
                            this.error('set_destination failed:', result.error);
                        }
                        break;

                    case 'set_destination_city':
                        const citySelect = document.getElementById('hostCity');
                        if (citySelect && args.city) {
                            // Check if the city dropdown is visible (only for UK/USA)
                            const cityContainer = document.getElementById('citySelectorContainer');
                            if (!cityContainer || cityContainer.classList.contains('hidden')) {
                                result.success = false;
                                result.error = 'City selection is only available for UK and USA destinations';
                                this.error('set_destination_city failed: city selector not visible');
                            } else {
                                citySelect.value = args.city;
                                citySelect.dispatchEvent(new Event('change', { bubbles: true }));

                                if (citySelect.value === args.city) {
                                    result.message = `City set to ${args.city}`;
                                    this.log(`City successfully set to ${args.city}`);
                                } else {
                                    result.success = false;
                                    const availableCities = Array.from(citySelect.options).map(o => o.value).join(', ');
                                    result.error = `Could not set city to ${args.city}. Available: ${availableCities}`;
                                }
                            }
                        } else {
                            result.success = false;
                            result.error = citySelect ? 'No city provided' : 'City dropdown not found - select UK or USA first';
                        }
                        break;

                    case 'set_duration':
                        const monthsSelect = document.getElementById('assignmentLength');
                        if (monthsSelect && args.months) {
                            monthsSelect.value = args.months;
                            monthsSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            result.message = `Duration set to ${args.months} months`;
                            this.log(`Duration set to ${args.months} months`);
                        } else {
                            result.success = false;
                            result.error = monthsSelect ? 'No months provided' : 'Assignment length dropdown not found';
                        }
                        break;

                    case 'set_salary':
                        const salaryInput = document.getElementById('monthlySalary');
                        if (salaryInput && args.salary) {
                            salaryInput.value = args.salary;
                            salaryInput.dispatchEvent(new Event('change', { bubbles: true }));
                            result.message = `Salary set to €${args.salary.toLocaleString()}`;
                            this.log(`Salary set to €${args.salary}`);
                        } else {
                            result.success = false;
                            result.error = salaryInput ? 'No salary provided' : 'Monthly salary input not found';
                        }
                        break;

                    case 'set_daily_allowance':
                        const allowanceInput = document.getElementById('dailyAllowance');
                        if (allowanceInput && args.amount !== undefined) {
                            allowanceInput.value = args.amount;
                            allowanceInput.dispatchEvent(new Event('change', { bubbles: true }));
                            result.message = `Daily allowance set to €${args.amount}`;
                            this.log(`Daily allowance set to €${args.amount}`);
                        } else {
                            result.success = false;
                            result.error = allowanceInput ? 'No amount provided' : 'Daily allowance input not found';
                        }
                        break;

                    case 'set_working_days':
                        const workingDaysInput = document.getElementById('workingDays');
                        if (workingDaysInput && args.days) {
                            workingDaysInput.value = args.days;
                            workingDaysInput.dispatchEvent(new Event('change', { bubbles: true }));
                            result.message = `Working days set to ${args.days}`;
                            this.log(`Working days set to ${args.days}`);
                        } else {
                            result.success = false;
                            result.error = workingDaysInput ? 'No days provided' : 'Working days input not found';
                        }
                        break;

                    case 'switch_tab':
                        if (typeof window.switchMainTab === 'function' && args.tab) {
                            window.switchMainTab(args.tab);
                            result.message = `Switched to ${args.tab} tab`;
                        }
                        break;

                    case 'load_demo_data':
                        if (typeof window.autoPopulateDemo === 'function') {
                            window.autoPopulateDemo();
                            result.message = 'Demo data loaded';
                        }
                        break;

                    case 'explain_results':
                        result = this.getResultsExplanation();
                        break;

                    case 'explain_tax':
                        result = this.getTaxExplanation();
                        break;

                    case 'explain_social_security':
                        result = this.getSocialSecurityExplanation();
                        break;

                    case 'explain_per_diem':
                        result = this.getPerDiemExplanation();
                        break;

                    case 'explain_admin_fees':
                        result = this.getAdminFeesExplanation();
                        break;

                    case 'get_form_state':
                        result = this.getFormState();
                        break;

                    case 'toggle_social_security':
                        const ssNoAgreement = document.getElementById('settingSSNoAgreement');
                        const ssWithAgreement = document.getElementById('settingSSWithAgreement');
                        const scenario = args.scenario || 'both';
                        const ssEnabled = args.enabled;

                        if (scenario === 'no_agreement' || scenario === 'both') {
                            if (ssNoAgreement) {
                                ssNoAgreement.checked = ssEnabled;
                                this.log(`SS No Agreement set to: ${ssEnabled}`);
                            }
                        }
                        if (scenario === 'with_agreement' || scenario === 'both') {
                            if (ssWithAgreement) {
                                ssWithAgreement.checked = ssEnabled;
                                this.log(`SS With Agreement set to: ${ssEnabled}`);
                            }
                        }

                        // Trigger settings save and recalculation
                        if (typeof window.saveSettings === 'function') {
                            window.saveSettings();
                        }
                        if (typeof window.recalculateIfNeeded === 'function') {
                            window.recalculateIfNeeded();
                        }

                        result.message = `Social security ${ssEnabled ? 'enabled' : 'disabled'}${scenario !== 'both' ? ` for ${scenario.replace('_', ' ')} scenario` : ''}`;
                        break;

                    case 'set_currency_display':
                        const eurBtn = document.getElementById('currency-eur');
                        const localBtn = document.getElementById('currency-local');

                        if (args.currency === 'EUR' && eurBtn) {
                            eurBtn.click();
                            result.message = 'Switched display to EUR';
                            this.log('Currency switched to EUR');
                        } else if (args.currency === 'LOCAL' && localBtn) {
                            localBtn.click();
                            result.message = 'Switched display to local currency';
                            this.log('Currency switched to local');
                        } else {
                            result.success = false;
                            result.error = 'Currency button not found';
                        }
                        break;

                    case 'open_settings':
                        const settingsPanel = document.querySelector('.settings-panel');
                        if (settingsPanel) {
                            settingsPanel.classList.add('expanded');
                            result.message = 'Settings panel opened';
                            this.log('Settings panel expanded');
                        } else {
                            result.success = false;
                            result.error = 'Settings panel not found';
                        }
                        break;

                    case 'highlight_map':
                        if (typeof window.highlightMapCountry === 'function' && args.country) {
                            const found = window.highlightMapCountry(args.country);
                            if (found) {
                                result.message = `Highlighted ${args.country} on the analytics map`;
                            } else {
                                result.success = false;
                                result.error = `Country "${args.country}" not found on the map`;
                            }
                        } else {
                            result.success = false;
                            result.error = 'Map highlight function not available or no country provided';
                        }
                        break;

                    case 'run_optimization':
                        if (typeof window.runOptimization === 'function') {
                            // Switch to staffing tab first
                            if (typeof window.switchMainTab === 'function') {
                                window.switchMainTab('staffing');
                            }
                            window.runOptimization();
                            result.message = 'Running staffing optimization engine';
                        } else {
                            result.success = false;
                            result.error = 'Optimization function not available';
                        }
                        break;

                    case 'stop_voice':
                        result.message = 'Voice commands stopped';
                        this.log('Stopping voice via function call');
                        // Delay to allow goodbye message to be spoken
                        setTimeout(() => {
                            stopListening();
                        }, 1500);
                        break;

                    default:
                        result = { success: false, error: `Unknown function: ${name}` };
                }
            } catch (error) {
                this.error('Function execution error:', error);
                result = { success: false, error: error.message };
            }

            // Send function result back to the model
            this.sendFunctionResult(callId, result);
        }

        /**
         * Send initial form state to the model when session connects
         */
        sendInitialFormState() {
            if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
                this.error('Cannot send initial form state - data channel not open');
                return;
            }

            const formState = this.getFormState();
            this.log('Sending initial form state to model:', formState.summary);

            // Send as a conversation item so the model has context
            const event = {
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: `[SYSTEM CONTEXT - Current form state] ${formState.summary}. Use this information and don't ask the user for values that are already set.`
                        }
                    ]
                }
            };

            this.dataChannel.send(JSON.stringify(event));
            this.log('Initial form state sent to model');
        }

        /**
         * Get current form state - all field values
         */
        getFormState() {
            const homeCountryEl = document.getElementById('homeCountry');
            const destinationEl = document.getElementById('hostCountry');
            const salaryEl = document.getElementById('monthlySalary');
            const durationEl = document.getElementById('assignmentLength');
            const dailyAllowanceEl = document.getElementById('dailyAllowance');
            const workingDaysEl = document.getElementById('workingDays');

            // Detect current tab
            let currentTab = 'calculator';
            const staffSection = document.getElementById('section-staffing');
            const analyticsSection = document.getElementById('section-analytics');
            if (staffSection && !staffSection.classList.contains('hidden')) {
                currentTab = 'staffing';
            } else if (analyticsSection && !analyticsSection.classList.contains('hidden')) {
                currentTab = 'analytics';
            }

            const state = {
                success: true,
                currentTab: currentTab,
                homeCountry: homeCountryEl ? homeCountryEl.value : null,
                destinationCountry: destinationEl ? destinationEl.value : null,
                monthlySalary: salaryEl ? parseFloat(salaryEl.value) || null : null,
                durationMonths: durationEl ? parseInt(durationEl.value) || null : null,
                dailyAllowance: dailyAllowanceEl ? parseFloat(dailyAllowanceEl.value) || null : null,
                workingDaysPerMonth: workingDaysEl ? parseInt(workingDaysEl.value) || null : null
            };

            // Build a human-readable summary
            const parts = [];
            parts.push(`Current page: ${currentTab}`);
            if (state.homeCountry) parts.push(`Home country: ${state.homeCountry}`);
            if (state.destinationCountry) parts.push(`Destination: ${state.destinationCountry}`);
            if (state.monthlySalary) parts.push(`Salary: €${state.monthlySalary.toLocaleString()}`);
            if (state.durationMonths) parts.push(`Duration: ${state.durationMonths} months`);
            if (state.dailyAllowance) parts.push(`Daily allowance: €${state.dailyAllowance}`);
            if (state.workingDaysPerMonth) parts.push(`Working days/month: ${state.workingDaysPerMonth}`);

            state.summary = parts.length > 0
                ? `Current state - ${parts.join(', ')}`
                : 'Form is empty - no values set yet';

            this.log('Form state:', state);
            return state;
        }

        /**
         * Get full explanation of current results (overview of all cost components)
         */
        getResultsExplanation() {
            const data = window.lastCalculationData;

            // Check if we have calculation data
            if (!data) {
                return {
                    success: true,
                    hasResults: false,
                    message: 'No results displayed yet. Please fill in the form and calculate.'
                };
            }

            const formatCurrency = (val) => '€' + Math.round(val).toLocaleString('en-GB');
            const destination = data.config?.name || data.hostCountry || 'destination';
            const months = data.assignmentLength || 'the';

            // Build comprehensive breakdown
            const breakdown = {
                salary: {
                    amount: formatCurrency(data.grossSalary),
                    note: `Base salary for ${months} months`
                },
                tax: {
                    amount: formatCurrency(data.taxAmountEUR),
                    rate: `${data.effectiveTaxRate?.toFixed(1) || 0}%`
                },
                socialSecurity: {
                    amount: formatCurrency(data.totalSocialSecurity || data.socialSecurityCost || 0),
                    reason: data.socialSecExclusionReason || (data.socialSecIncluded ? 'Included' : 'Excluded')
                },
                perDiem: {
                    amount: formatCurrency(data.totalPerDiem || data.totalAllowances),
                    dailyRate: formatCurrency(data.dailyAllowance),
                    workingDays: data.totalWorkingDays
                },
                adminFees: {
                    amount: formatCurrency(data.totalAdminFees)
                }
            };

            // Build natural language message
            const parts = [];
            parts.push(`Total additional cost is ${formatCurrency(data.additionalCostTotal)} for ${months} months to ${destination}.`);
            parts.push(`Tax is ${breakdown.tax.amount} at ${breakdown.tax.rate} effective rate.`);

            const ssAmount = data.totalSocialSecurity || data.socialSecurityCost || 0;
            if (ssAmount === 0) {
                parts.push(`Social security is ${formatCurrency(0)}${data.socialSecExclusionReason ? ' due to ' + data.socialSecExclusionReason : ''}.`);
            } else {
                parts.push(`Social security is ${formatCurrency(ssAmount)}.`);
            }

            parts.push(`Per diem is ${breakdown.perDiem.amount} at ${breakdown.perDiem.dailyRate} per day for ${breakdown.perDiem.workingDays} working days.`);
            parts.push(`Admin fees are ${breakdown.adminFees.amount}.`);

            return {
                success: true,
                hasResults: true,
                totalCost: formatCurrency(data.additionalCostTotal),
                duration: `${months} months`,
                destination: destination,
                breakdown: breakdown,
                message: parts.join(' ')
            };
        }

        /**
         * Expand a breakdown group in the UI, collapse others, and scroll to it
         */
        expandBreakdownGroup(groupId) {
            // First, collapse all other breakdown groups
            const allGroups = document.querySelectorAll('.breakdown-group');
            allGroups.forEach(g => {
                if (g.id !== `group-${groupId}`) {
                    g.classList.remove('expanded');
                }
            });

            // Now expand the target group
            const group = document.getElementById(`group-${groupId}`);
            if (group) {
                if (!group.classList.contains('expanded')) {
                    group.classList.add('expanded');
                }
                // Scroll to the group with some offset for the header
                setTimeout(() => {
                    group.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
                this.log(`Expanded and scrolled to breakdown group: ${groupId}`);
            }
        }

        /**
         * Get detailed tax breakdown explanation with step-by-step arithmetic
         */
        getTaxExplanation() {
            // Expand the tax section in the UI
            this.expandBreakdownGroup('tax');

            const data = window.lastCalculationData;

            if (!data) {
                return {
                    success: true,
                    hasResults: false,
                    message: 'No results displayed yet. Please calculate costs first to see tax details.'
                };
            }

            const formatCurrency = (val) => '€' + Math.round(val).toLocaleString('en-GB');
            const config = data.config || {};
            const currencySymbol = config.currencySymbol || '€';
            const formatLocal = (val) => currencySymbol + Math.round(val).toLocaleString('en-GB');

            // Build bracket breakdown with arithmetic
            const brackets = [];
            if (data.taxBracketBreakdown && data.taxBracketBreakdown.length > 0) {
                for (const bracket of data.taxBracketBreakdown) {
                    const ratePercent = (bracket.rate * 100).toFixed(0) + '%';
                    const minFormatted = formatLocal(bracket.min);
                    const maxFormatted = bracket.max ? formatLocal(bracket.max) : '∞';
                    const taxableInBracket = bracket.taxableAmount || 0;
                    brackets.push({
                        bracket: `${ratePercent} on ${minFormatted} to ${maxFormatted}`,
                        taxableAmount: formatLocal(taxableInBracket),
                        taxAmount: formatLocal(bracket.taxAmount),
                        rate: ratePercent
                    });
                }
            }

            // Build natural language explanation with step-by-step arithmetic
            const parts = [];
            const countryName = config.name || data.hostCountry;

            parts.push(`Tax breakdown on ${formatLocal(data.taxableIncomeLocal)} taxable income.`);

            // Show each bracket with arithmetic (e.g., "£11,320 at 20% equals £2,264")
            if (data.taxBracketBreakdown && data.taxBracketBreakdown.length > 0) {
                for (const bracket of data.taxBracketBreakdown) {
                    const ratePercent = (bracket.rate * 100).toFixed(0);
                    const taxableInBracket = formatLocal(bracket.taxableAmount || 0);
                    const taxFromBracket = formatLocal(bracket.taxAmount);
                    parts.push(`${taxableInBracket} at ${ratePercent}% equals ${taxFromBracket}.`);
                }
            }

            // Show total and conversion to EUR
            parts.push(`Total tax is ${formatLocal(data.taxAmountLocal)} which converts to ${formatCurrency(data.taxAmountEUR)}.`);
            parts.push(`Effective rate is ${data.effectiveTaxRate?.toFixed(1) || 0}%.`);

            return {
                success: true,
                hasResults: true,
                taxAmount: formatCurrency(data.taxAmountEUR),
                taxableIncome: formatLocal(data.taxableIncomeLocal),
                method: data.taxCalculationMethod || 'Unknown',
                effectiveRate: `${data.effectiveTaxRate?.toFixed(1) || 0}%`,
                brackets: brackets,
                message: parts.join(' ')
            };
        }

        /**
         * Get social security breakdown explanation with detailed calculations
         */
        getSocialSecurityExplanation() {
            // Expand the social security section in the UI
            this.expandBreakdownGroup('social');

            const data = window.lastCalculationData;

            if (!data) {
                return {
                    success: true,
                    hasResults: false,
                    message: 'No results displayed yet. Please calculate costs first to see social security details.'
                };
            }

            const formatCurrency = (val) => '€' + Math.round(val).toLocaleString('en-GB');
            const totalSS = data.totalSocialSecurity || data.socialSecurityCost || 0;
            const employerSS = data.employerSocialSec || 0;
            const employeeSS = data.employeeSocialSec || 0;
            const grossSalary = data.grossSalary || 0;
            const config = data.config || {};
            const countryName = config.name || data.hostCountry;
            const homeCountry = document.getElementById('homeCountry')?.value || 'Finland';
            const employerRate = ((config.employerSocialSec || 0) * 100).toFixed(1);
            const employeeRate = ((config.employeeSocialSec || 0) * 100).toFixed(1);

            // Build detailed explanation
            const parts = [];
            parts.push(`Social security breakdown for ${countryName}.`);
            parts.push(`Contribution base is ${formatCurrency(grossSalary)}.`);

            // Agreement status
            if (data.hasAgreement) {
                parts.push(`${homeCountry} has a reciprocal agreement with ${countryName}.`);
            } else {
                parts.push(`No reciprocal agreement between ${homeCountry} and ${countryName}.`);
            }

            if (totalSS === 0) {
                if (data.socialSecExclusionReason) {
                    parts.push(`Social security is zero because: ${data.socialSecExclusionReason}.`);
                } else if (data.hasAgreement) {
                    parts.push(`Contributions remain payable in ${homeCountry} only.`);
                } else {
                    parts.push(`No host country social security contributions are required.`);
                }
            } else {
                // Employer calculation
                parts.push(`Employer rate is ${employerRate}%.`);
                parts.push(`${formatCurrency(grossSalary)} times ${employerRate}% equals ${formatCurrency(employerSS)} employer contribution.`);

                // Employee calculation
                parts.push(`Employee rate is ${employeeRate}%.`);
                parts.push(`${formatCurrency(grossSalary)} times ${employeeRate}% equals ${formatCurrency(employeeSS)} employee contribution.`);

                // Cap note if applicable
                if (config.employeeSocialSecCap) {
                    const currencySymbol = config.currencySymbol || '€';
                    parts.push(`Note: employee contributions are capped at ${currencySymbol}${config.employeeSocialSecCap.toLocaleString('en-GB')} per month.`);
                }

                // Total
                parts.push(`Total social security cost is ${formatCurrency(totalSS)}.`);
            }

            return {
                success: true,
                hasResults: true,
                contributionBase: formatCurrency(grossSalary),
                totalAmount: formatCurrency(totalSS),
                employerRate: employerRate + '%',
                employerPortion: formatCurrency(employerSS),
                employeeRate: employeeRate + '%',
                employeePortion: formatCurrency(employeeSS),
                hasAgreement: data.hasAgreement || false,
                hasCap: !!config.employeeSocialSecCap,
                reason: data.socialSecExclusionReason || (totalSS === 0 ? 'Reciprocal agreement' : 'Contributions required'),
                message: parts.join(' ')
            };
        }

        /**
         * Get per diem breakdown explanation
         */
        getPerDiemExplanation() {
            // Expand the per diem section in the UI
            this.expandBreakdownGroup('perdiem');

            const data = window.lastCalculationData;

            if (!data) {
                return {
                    success: true,
                    hasResults: false,
                    message: 'No results displayed yet. Please calculate costs first to see per diem details.'
                };
            }

            const formatCurrency = (val) => '€' + Math.round(val).toLocaleString('en-GB');
            const formatDecimal = (val) => '€' + val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const totalPerDiem = data.totalPerDiem || data.totalAllowances || 0;
            const dailyRate = data.dailyAllowance || 0;
            const workingDays = data.totalWorkingDays || 0;
            const countryName = data.config?.name || data.hostCountry;
            const homeCountry = document.getElementById('homeCountry')?.value || 'Finland';

            // Build explanation
            const parts = [];
            parts.push(`Per diem is ${formatCurrency(totalPerDiem)} total.`);
            parts.push(`Daily allowance is ${formatDecimal(dailyRate)}.`);

            if (data.perDiemBasisText) {
                parts.push(`This is based on ${data.perDiemBasisText}.`);
            } else {
                parts.push(`This is based on ${homeCountry}'s destination rate for ${countryName}.`);
            }

            parts.push(`Over ${workingDays} working days, this totals ${formatCurrency(totalPerDiem)}.`);
            parts.push(`Per diem is typically tax-exempt.`);

            // Add source info if available
            if (data.perDiemSourceName) {
                parts.push(`Source: ${data.perDiemSourceName}.`);
                if (data.perDiemSourceUrl) {
                    parts.push(`The source URL is ${data.perDiemSourceUrl}`);
                }
            }

            return {
                success: true,
                hasResults: true,
                totalAmount: formatCurrency(totalPerDiem),
                dailyRate: formatDecimal(dailyRate),
                workingDays: workingDays,
                basis: data.perDiemBasisText || `${homeCountry} destination rate for ${countryName}`,
                source: data.perDiemSourceName || null,
                sourceUrl: data.perDiemSourceUrl || null,
                sourceYear: data.perDiemSourceYear || null,
                taxExempt: true,
                message: parts.join(' ')
            };
        }

        /**
         * Get admin fees breakdown explanation
         */
        getAdminFeesExplanation() {
            // Expand the admin section in the UI
            this.expandBreakdownGroup('admin');

            const data = window.lastCalculationData;

            if (!data) {
                return {
                    success: true,
                    hasResults: false,
                    message: 'No results displayed yet. Please calculate costs first to see admin fees details.'
                };
            }

            const formatCurrency = (val) => '€' + Math.round(val).toLocaleString('en-GB');
            const totalAdminFees = data.totalAdminFees || 0;
            const countryName = data.config?.name || data.hostCountry;

            // Build explanation
            const parts = [];
            parts.push(`Admin fees are ${formatCurrency(totalAdminFees)}.`);
            parts.push(`These are one-time administrative costs for visa processing, work permits, and immigration compliance for ${countryName}.`);

            // Add breakdown if available
            if (data.adminFeesBreakdown) {
                const breakdown = data.adminFeesBreakdown;
                if (breakdown.visa) parts.push(`Visa fees: ${formatCurrency(breakdown.visa)}.`);
                if (breakdown.workPermit) parts.push(`Work permit: ${formatCurrency(breakdown.workPermit)}.`);
                if (breakdown.other) parts.push(`Other fees: ${formatCurrency(breakdown.other)}.`);
            }

            parts.push(`Admin fees are typically a one-time cost, not recurring monthly.`);

            return {
                success: true,
                hasResults: true,
                totalAmount: formatCurrency(totalAdminFees),
                country: countryName,
                message: parts.join(' ')
            };
        }

        /**
         * Send function result back to the model
         */
        sendFunctionResult(callId, result) {
            if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
                this.error('Cannot send function result - data channel not open');
                return;
            }

            const event = {
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify(result)
                }
            };

            this.dataChannel.send(JSON.stringify(event));
            this.log('Sent function result for call:', callId);

            // Trigger response generation
            this.dataChannel.send(JSON.stringify({ type: 'response.create' }));
        }

        /**
         * Handle disconnection
         */
        handleDisconnect() {
            this.isConnected = false;
            voiceIsListening = false;
            updateVoiceButtonUI(false);

            if (this.sessionTimeout) {
                clearTimeout(this.sessionTimeout);
                this.sessionTimeout = null;
            }
        }

        /**
         * Disconnect and clean up
         */
        disconnect() {
            this.log('Disconnecting...');

            if (this.sessionTimeout) {
                clearTimeout(this.sessionTimeout);
                this.sessionTimeout = null;
            }

            if (this.dataChannel) {
                this.dataChannel.close();
                this.dataChannel = null;
            }

            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            if (this.audioElement) {
                this.audioElement.srcObject = null;
            }

            this.isConnected = false;
            this.log('Disconnected');
        }
    }

    // =========================================================================
    // FALLBACK MODE (Keyword-based commands with OpenAI TTS)
    // =========================================================================

    let voiceRecognition = null;
    let lastProcessedTranscript = '';
    let lastProcessedTime = 0;
    let currentAudio = null;
    let isSpeaking = false;
    let speechQueue = [];

    /**
     * Initialise Voice Recognition (Web Speech API)
     */
    function initVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error('[VOICE] Speech recognition not supported in this browser');
            const voiceBtn = document.getElementById('voiceBtn');
            const voiceBtnMobile = document.getElementById('voiceBtnMobile');
            if (voiceBtn) voiceBtn.style.display = 'none';
            if (voiceBtnMobile) voiceBtnMobile.style.display = 'none';
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = false;
        voiceRecognition.lang = 'en-GB';
        voiceRecognition.maxAlternatives = 1;

        voiceRecognition.onstart = function() {
            console.log('[VOICE] Recognition STARTED');
        };

        voiceRecognition.onresult = function(event) {
            const lastResult = event.results[event.results.length - 1];
            if (lastResult.isFinal) {
                const transcript = lastResult[0].transcript.toLowerCase().trim();
                const now = Date.now();

                if (transcript === lastProcessedTranscript && (now - lastProcessedTime) < 2000) {
                    return;
                }
                if (transcript.length < 2) {
                    return;
                }

                lastProcessedTranscript = transcript;
                lastProcessedTime = now;
                handleVoiceCommand(transcript);
            }

            // Safari workaround
            if (isSafari && voiceIsListening) {
                try {
                    voiceRecognition.stop();
                    setTimeout(() => {
                        if (voiceIsListening) voiceRecognition.start();
                    }, 300);
                } catch (e) {}
            }
        };

        voiceRecognition.onend = function() {
            if (voiceIsListening && currentMode === 'fallback') {
                setTimeout(() => {
                    try {
                        voiceRecognition.start();
                    } catch (e) {}
                }, 100);
            }
        };

        voiceRecognition.onerror = function(event) {
            console.error('[VOICE] Recognition ERROR:', event.error);

            if (event.error === 'not-allowed' || event.error === 'audio-capture') {
                voiceIsListening = false;
                updateVoiceButtonUI(false);
                showVoiceToast(event.error === 'not-allowed' ? 'Microphone permission denied' : 'Microphone not available');
            } else if (voiceIsListening && currentMode === 'fallback') {
                setTimeout(() => {
                    try { voiceRecognition.start(); } catch (e) {}
                }, 500);
            }
        };

        console.log('[VOICE] Voice recognition initialised (Safari=' + isSafari + ')');
    }

    /**
     * Handle voice command (fallback mode - keyword matching)
     */
    function handleVoiceCommand(transcript) {
        showVoiceToast('Heard: "' + transcript + '"');
        console.log('[VOICE] Processing command:', transcript);

        const countryMatches = {
            'brazil': 'Brazil',
            'usa': 'USA',
            'united states': 'USA',
            'america': 'USA',
            'germany': 'Germany',
            'uk': 'UK',
            'united kingdom': 'UK',
            'britain': 'UK',
            'england': 'UK',
            'uae': 'UAE',
            'dubai': 'UAE',
            'emirates': 'UAE',
            'singapore': 'Singapore',
            'australia': 'Australia',
            'mexico': 'Mexico',
            'india': 'India',
            'south africa': 'SouthAfrica'
        };

        // Help command
        if (transcript.includes('help') || transcript.includes('commands')) {
            speak('Available commands: Say calculate to run cost analysis. Say clear or reset to start over. Say destination followed by a country name. Say staffing to switch to staffing engine. Say stop listening to turn off voice.');
            return;
        }

        // Stop listening
        if (transcript.includes('stop listening') || transcript.includes('turn off voice')) {
            speak('Voice commands off.');
            stopListening();
            return;
        }

        // Calculate
        if (transcript.includes('calculate') || transcript.includes('run estimate') || transcript.includes('estimate cost')) {
            speak('Running cost analysis now.');
            if (typeof window.calculateCosts === 'function') {
                window.calculateCosts();
            }
            return;
        }

        // Clear / Reset
        if (transcript.includes('clear') || transcript.includes('reset') || transcript.includes('start over')) {
            speak('Clearing the form.');
            if (typeof window.resetForm === 'function') {
                window.resetForm();
            }
            return;
        }

        // Demo data
        if (transcript.includes('demo') || transcript.includes('populate') || transcript.includes('sample')) {
            speak('Populating with sample data.');
            if (typeof window.autoPopulateDemo === 'function') {
                window.autoPopulateDemo();
            }
            return;
        }

        // Switch to Calculator
        if (transcript.includes('calculator') || transcript.includes('cost analysis') || transcript.includes('cost tab')) {
            speak('Switching to cost analysis.');
            if (typeof window.switchMainTab === 'function') {
                window.switchMainTab('calculator');
            }
            return;
        }

        // Switch to Staffing
        if (transcript.includes('staffing') || transcript.includes('staff') || transcript.includes('candidates')) {
            speak('Switching to staffing engine.');
            if (typeof window.switchMainTab === 'function') {
                window.switchMainTab('staffing');
            }
            return;
        }

        // Switch to Analytics
        if (transcript.includes('analytics') || transcript.includes('map') || transcript.includes('insights')) {
            speak('Switching to global deployment insights.');
            if (typeof window.switchMainTab === 'function') {
                window.switchMainTab('analytics');
            }
            return;
        }

        // Highlight map (Analytics)
        if (transcript.includes('show costs in') || transcript.includes('highlight') || transcript.includes('zoom to')) {
            for (const [keyword, country] of Object.entries(countryMatches)) {
                if (transcript.includes(keyword)) {
                    if (typeof window.highlightMapCountry === 'function') {
                        const found = window.highlightMapCountry(country);
                        if (found) {
                            speak('Highlighting ' + country + ' on the map.');
                            return;
                        }
                    }
                }
            }
        }

        // Run optimization (Staffing)
        if (transcript.includes('run engine') || transcript.includes('optimize') || transcript.includes('find best')) {
            speak('Running the resource optimization engine.');
            if (typeof window.runOptimization === 'function') {
                // Ensure we are on staffing tab
                if (typeof window.switchMainTab === 'function') {
                    window.switchMainTab('staffing');
                }
                window.runOptimization();
            }
            return;
        }

        // Set destination
        if (transcript.includes('destination') || transcript.includes('going to') || transcript.includes('deploy to')) {
            for (const [keyword, country] of Object.entries(countryMatches)) {
                if (transcript.includes(keyword)) {
                    const destSelect = document.getElementById('hostCountry');
                    if (destSelect) {
                        destSelect.value = country;
                        destSelect.dispatchEvent(new Event('change'));
                        speak('Destination set to ' + country);
                    }
                    return;
                }
            }
            speak('Sorry, I did not recognise the destination country.');
            return;
        }

        // Set months
        const monthsMatch = transcript.match(/(\d+)\s*(months?|month)/);
        if (monthsMatch || transcript.includes('months') || transcript.includes('duration')) {
            const months = monthsMatch ? parseInt(monthsMatch[1]) : null;
            if (months && months > 0 && months <= 60) {
                const monthsSelect = document.getElementById('assignmentLength');
                if (monthsSelect) {
                    monthsSelect.value = months;
                    monthsSelect.dispatchEvent(new Event('change'));
                    speak('Duration set to ' + months + ' months');
                }
            } else {
                speak('Please say the number of months, for example 6 months.');
            }
            return;
        }

        // Set salary
        const salaryMatch = transcript.match(/salary.*?(\d+)/);
        if (salaryMatch || transcript.includes('salary')) {
            const salary = salaryMatch ? parseInt(salaryMatch[1]) : null;
            if (salary) {
                const salaryInput = document.getElementById('monthlySalary');
                if (salaryInput) {
                    salaryInput.value = salary;
                    salaryInput.dispatchEvent(new Event('change'));
                    speak('Salary set to ' + salary.toLocaleString() + ' euros');
                }
            }
            return;
        }

        // Explain results
        if (transcript.includes('explain') || transcript.includes('what is') || transcript.includes('tell me')) {
            explainResults();
            return;
        }

        // Nothing matched
        speak('Sorry, I did not understand. Say help for available commands.');
    }

    /**
     * Explain current results (fallback mode)
     */
    function explainResults() {
        const totalCostEl = document.querySelector('.total-cost-value') || document.querySelector('[id*="total"]');
        const destinationEl = document.getElementById('hostCountry');
        const monthsEl = document.getElementById('assignmentLength');

        if (totalCostEl && totalCostEl.textContent.includes('€')) {
            const destination = destinationEl ? destinationEl.value : 'the destination';
            const months = monthsEl ? monthsEl.value : 'the duration';
            const total = totalCostEl.textContent;
            speak(`The estimate shows a total cost of ${total} for a ${months} month assignment to ${destination}.`);
        } else {
            speak('No results displayed. Fill in the details and click calculate.');
        }
    }

    /**
     * Speak text using OpenAI TTS (fallback mode)
     */
    async function speak(text) {
        if (isSpeaking) {
            if (speechQueue.length < 3) {
                speechQueue.push(text);
            }
            return;
        }

        await speakImmediate(text);

        while (speechQueue.length > 0) {
            const nextText = speechQueue.shift();
            await speakImmediate(nextText);
        }
    }

    async function speakImmediate(text) {
        console.log('[VOICE] Speaking:', text.substring(0, 50) + '...');
        showVoiceToast('Speaking...');
        isSpeaking = true;

        if (currentAudio) {
            currentAudio.pause();
            URL.revokeObjectURL(currentAudio.src);
            currentAudio = null;
        }

        try {
            const response = await fetch(CONFIG.TTS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, voice: 'nova' }),
            });

            if (!response.ok) {
                throw new Error(`TTS request failed: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            currentAudio = new Audio(audioUrl);

            await new Promise((resolve, reject) => {
                currentAudio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    currentAudio = null;
                    resolve();
                };
                currentAudio.onerror = (e) => {
                    URL.revokeObjectURL(audioUrl);
                    currentAudio = null;
                    reject(e);
                };
                currentAudio.play().catch(reject);
            });

        } catch (error) {
            console.error('[VOICE] TTS error:', error.message);
            showVoiceToast('Speech unavailable');
        } finally {
            isSpeaking = false;
        }
    }

    // =========================================================================
    // SHARED UI FUNCTIONS
    // =========================================================================

    function updateVoiceButtonUI(listening) {
        const voiceBtn = document.getElementById('voiceBtn');
        const voiceBtnText = document.getElementById('voiceBtnText');
        const voiceBtnMobile = document.getElementById('voiceBtnMobile');

        if (listening) {
            if (voiceBtn) voiceBtn.classList.add('listening');
            if (voiceBtnText) voiceBtnText.textContent = currentMode === 'realtime' ? 'Listening...' : 'Listening...';
            if (voiceBtnMobile) voiceBtnMobile.classList.add('listening');
        } else {
            if (voiceBtn) voiceBtn.classList.remove('listening');
            if (voiceBtnText) voiceBtnText.textContent = 'Voice';
            if (voiceBtnMobile) voiceBtnMobile.classList.remove('listening');
        }
    }

    function showVoiceToast(message) {
        const toast = document.getElementById('voiceToast');
        if (!toast) return;

        toast.textContent = message;
        toast.classList.add('visible');

        if (toast.hideTimeout) {
            clearTimeout(toast.hideTimeout);
        }

        toast.hideTimeout = setTimeout(() => {
            toast.classList.remove('visible');
        }, 3000);
    }

    // =========================================================================
    // VOICE CHAT PANEL
    // =========================================================================

    /**
     * Toggle voice chat panel visibility
     */
    function toggleVoiceChatPanel() {
        const panel = document.getElementById('voiceChatPanel');
        if (panel) {
            panel.classList.toggle('hidden');
        }
    }

    /**
     * Show the voice chat panel
     */
    function showVoiceChatPanel() {
        const panel = document.getElementById('voiceChatPanel');
        if (panel) {
            panel.classList.remove('hidden');
        }
    }

    /**
     * Add a message to the voice chat panel
     * @param {string} text - Message text
     * @param {string} type - 'user', 'assistant', 'system', or 'function'
     */
    function addChatMessage(text, type = 'system') {
        const messagesContainer = document.getElementById('voiceChatMessages');
        if (!messagesContainer) return;

        // Remove empty state message if present
        const emptyMsg = messagesContainer.querySelector('.voice-chat-empty');
        if (emptyMsg) emptyMsg.remove();

        // Create message element
        const msgEl = document.createElement('div');
        msgEl.className = `voice-chat-message ${type}`;
        msgEl.textContent = text;

        // Add to container
        messagesContainer.appendChild(msgEl);

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Keep only last 50 messages
        const messages = messagesContainer.querySelectorAll('.voice-chat-message');
        if (messages.length > 50) {
            messages[0].remove();
        }
    }

    /**
     * Clear all chat messages
     */
    function clearChatMessages() {
        const messagesContainer = document.getElementById('voiceChatMessages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="voice-chat-empty">Voice conversation will appear here when active...</div>';
        }
    }

    // =========================================================================
    // MAIN CONTROL FUNCTIONS
    // =========================================================================

    let realtimeManager = null;

    /**
     * Toggle voice listening on/off
     */
    function toggleVoice() {
        if (voiceIsListening) {
            stopListening();
        } else {
            startListening();
        }
    }

    /**
     * Start listening for voice commands
     */
    async function startListening() {
        console.log('[VOICE] Starting voice listening...');

        // Check microphone availability
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
            if (audioInputDevices.length === 0) {
                showVoiceToast('No microphone detected. Please connect a microphone.');
                return;
            }
        } catch (e) {
            console.warn('[VOICE] Could not enumerate devices:', e.message);
        }

        // Try Realtime API first if enabled
        if (CONFIG.USE_REALTIME_API && !isSafari) {  // Safari has WebRTC issues
            console.log('[VOICE] Attempting Realtime API connection...');

            if (!realtimeManager) {
                realtimeManager = new RealtimeManager();
            }

            const connected = await realtimeManager.connect();
            if (connected) {
                currentMode = 'realtime';
                voiceIsListening = true;
                updateVoiceButtonUI(true);
                return;
            }

            console.log('[VOICE] Realtime API failed, falling back to basic mode');
        }

        // Fallback to keyword-based mode
        currentMode = 'fallback';
        await startFallbackListening();
    }

    /**
     * Start fallback listening mode (Web Speech API)
     */
    async function startFallbackListening() {
        if (!voiceRecognition) {
            console.error('[VOICE] Voice recognition not initialised');
            showVoiceToast('Voice not supported in this browser');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());

            voiceIsListening = true;
            updateVoiceButtonUI(true);
            voiceRecognition.start();
            showVoiceToast('Voice active. Say "help" for commands.');
        } catch (error) {
            console.error('[VOICE] Microphone error:', error.name);
            handleMicrophoneError(error);
        }
    }

    /**
     * Handle microphone permission errors
     */
    function handleMicrophoneError(error) {
        voiceIsListening = false;
        updateVoiceButtonUI(false);

        if (error.name === 'NotFoundError') {
            showVoiceToast('Try: Quit Chrome (Cmd+Q), reopen, then try again.');
        } else if (error.name === 'NotAllowedError') {
            if (error.message.includes('system')) {
                showVoiceToast('Blocked by macOS. Enable in System Settings → Privacy → Microphone → Chrome.');
            } else {
                showVoiceToast('Microphone blocked. Click the lock icon in address bar.');
            }
        } else if (error.name === 'NotReadableError') {
            showVoiceToast('Microphone busy. Close other apps using it.');
        } else {
            showVoiceToast('Microphone error: ' + error.message);
        }
    }

    /**
     * Stop listening for voice commands
     */
    function stopListening() {
        console.log('[VOICE] Stopping voice listening...');
        voiceIsListening = false;

        if (currentMode === 'realtime' && realtimeManager) {
            realtimeManager.disconnect();
        }

        if (currentMode === 'fallback' && voiceRecognition) {
            try { voiceRecognition.stop(); } catch (e) {}
        }

        currentMode = null;
        updateVoiceButtonUI(false);
        showVoiceToast('Voice commands off');
    }

    /**
     * Diagnostic function for microphone issues
     */
    async function diagnoseMicrophone() {
        console.log('[VOICE DIAGNOSTIC] ========================================');
        console.log('[VOICE DIAGNOSTIC] Running microphone diagnostics...');

        if (!navigator.mediaDevices) {
            console.error('[VOICE DIAGNOSTIC] navigator.mediaDevices not available (insecure context?)');
            return;
        }

        try {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
            console.log('[VOICE DIAGNOSTIC] Permission status:', permissionStatus.state);
        } catch (e) {
            console.warn('[VOICE DIAGNOSTIC] Could not query permission:', e.message);
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(d => d.kind === 'audioinput');
            console.log('[VOICE DIAGNOSTIC] Audio inputs found:', audioInputs.length);
            audioInputs.forEach((d, i) => console.log(`  ${i + 1}. ${d.label || '(unlabelled)'}`));
        } catch (e) {
            console.error('[VOICE DIAGNOSTIC] Could not enumerate devices:', e.message);
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('[VOICE DIAGNOSTIC] getUserMedia SUCCESS');
            stream.getTracks().forEach(t => t.stop());
        } catch (e) {
            console.error('[VOICE DIAGNOSTIC] getUserMedia FAILED:', e.name, e.message);
        }

        console.log('[VOICE DIAGNOSTIC] ========================================');
    }

    // =========================================================================
    // INITIALISATION
    // =========================================================================

    function initVoiceModule() {
        console.log('[VOICE] ========================================');
        console.log('[VOICE] Initialising voice module...');
        console.log('[VOICE] Mode: ' + (CONFIG.USE_REALTIME_API ? 'Realtime API (with fallback)' : 'Fallback only'));
        console.log('[VOICE] Platform:', isSafari ? 'Safari' : 'Non-Safari');
        console.log('[VOICE] ========================================');

        // Always initialise fallback for Safari or when Realtime fails
        initVoiceRecognition();

        // Expose global functions
        window.toggleVoice = toggleVoice;
        window.speak = speak;
        window.showVoiceToast = showVoiceToast;
        window.diagnoseMicrophone = diagnoseMicrophone;
        window.toggleVoiceChatPanel = toggleVoiceChatPanel;
        window.addChatMessage = addChatMessage;
        window.clearChatMessages = clearChatMessages;

        console.log('[VOICE] Voice module ready');
    }

    // Auto-initialise
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVoiceModule);
    } else {
        initVoiceModule();
    }

})();
