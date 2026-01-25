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
                    break;

                case 'response.audio.delta':
                    // Audio is streaming through WebRTC track, nothing to do here
                    break;

                case 'response.audio_transcript.delta':
                    // Could show partial transcript if desired
                    break;

                case 'response.audio_transcript.done':
                    this.log('Assistant said:', event.transcript);
                    break;

                case 'response.function_call_arguments.done':
                    // Function call completed, execute it
                    this.handleFunctionCall(event.call_id, event.name, JSON.parse(event.arguments));
                    break;

                case 'response.done':
                    this.log('Response completed');
                    showVoiceToast('Ready');
                    break;

                case 'error':
                    this.error('Server error:', event.error);
                    showVoiceToast('Error: ' + (event.error?.message || 'Unknown'));
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

                    case 'set_destination':
                        const destSelect = document.getElementById('destination-country');
                        if (destSelect && args.country) {
                            destSelect.value = args.country;
                            destSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            result.message = `Destination set to ${args.country}`;
                        }
                        break;

                    case 'set_duration':
                        const monthsInput = document.getElementById('assignment-months');
                        if (monthsInput && args.months) {
                            monthsInput.value = args.months;
                            monthsInput.dispatchEvent(new Event('change', { bubbles: true }));
                            result.message = `Duration set to ${args.months} months`;
                        }
                        break;

                    case 'set_salary':
                        const salaryInput = document.getElementById('monthly-salary');
                        if (salaryInput && args.salary) {
                            salaryInput.value = args.salary;
                            salaryInput.dispatchEvent(new Event('change', { bubbles: true }));
                            result.message = `Salary set to €${args.salary.toLocaleString()}`;
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

                    case 'get_form_state':
                        result = this.getFormState();
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
         * Get current form state - all field values
         */
        getFormState() {
            const homeCountryEl = document.getElementById('home-country');
            const destinationEl = document.getElementById('destination-country');
            const salaryEl = document.getElementById('monthly-salary');
            const durationEl = document.getElementById('assignment-months');
            const dailyAllowanceEl = document.getElementById('daily-allowance');
            const workingDaysEl = document.getElementById('working-days');

            const state = {
                success: true,
                homeCountry: homeCountryEl ? homeCountryEl.value : null,
                destinationCountry: destinationEl ? destinationEl.value : null,
                monthlySalary: salaryEl ? parseFloat(salaryEl.value) || null : null,
                durationMonths: durationEl ? parseInt(durationEl.value) || null : null,
                dailyAllowance: dailyAllowanceEl ? parseFloat(dailyAllowanceEl.value) || null : null,
                workingDaysPerMonth: workingDaysEl ? parseInt(workingDaysEl.value) || null : null
            };

            // Build a human-readable summary
            const parts = [];
            if (state.homeCountry) parts.push(`Home country: ${state.homeCountry}`);
            if (state.destinationCountry) parts.push(`Destination: ${state.destinationCountry}`);
            if (state.monthlySalary) parts.push(`Salary: €${state.monthlySalary.toLocaleString()}`);
            if (state.durationMonths) parts.push(`Duration: ${state.durationMonths} months`);
            if (state.dailyAllowance) parts.push(`Daily allowance: €${state.dailyAllowance}`);
            if (state.workingDaysPerMonth) parts.push(`Working days/month: ${state.workingDaysPerMonth}`);

            state.summary = parts.length > 0
                ? `Current form values: ${parts.join(', ')}`
                : 'Form is empty - no values set yet';

            this.log('Form state:', state);
            return state;
        }

        /**
         * Get explanation of current results
         */
        getResultsExplanation() {
            const totalCostEl = document.querySelector('.total-cost-value') || document.querySelector('[id*="total"]');
            const destinationEl = document.getElementById('destination-country');
            const monthsEl = document.getElementById('assignment-months');

            if (totalCostEl && totalCostEl.textContent.includes('€')) {
                return {
                    success: true,
                    hasResults: true,
                    totalCost: totalCostEl.textContent,
                    destination: destinationEl ? destinationEl.value : 'Unknown',
                    months: monthsEl ? monthsEl.value : 'Unknown',
                    message: `Total cost is ${totalCostEl.textContent} for ${monthsEl?.value || 'the'} months to ${destinationEl?.value || 'destination'}`
                };
            } else {
                return {
                    success: true,
                    hasResults: false,
                    message: 'No results displayed yet. Please fill in the form and calculate.'
                };
            }
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

        // Set destination
        if (transcript.includes('destination') || transcript.includes('going to') || transcript.includes('deploy to')) {
            for (const [keyword, country] of Object.entries(countryMatches)) {
                if (transcript.includes(keyword)) {
                    const destSelect = document.getElementById('destination-country');
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
                const monthsInput = document.getElementById('assignment-months');
                if (monthsInput) {
                    monthsInput.value = months;
                    monthsInput.dispatchEvent(new Event('change'));
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
                const salaryInput = document.getElementById('monthly-salary');
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
        const destinationEl = document.getElementById('destination-country');
        const monthsEl = document.getElementById('assignment-months');

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
            if (voiceBtnText) voiceBtnText.textContent = currentMode === 'realtime' ? 'AI Listening...' : 'Listening...';
            if (voiceBtnMobile) voiceBtnMobile.classList.add('listening');
        } else {
            if (voiceBtn) voiceBtn.classList.remove('listening');
            if (voiceBtnText) voiceBtnText.textContent = 'Voice Commands';
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

        console.log('[VOICE] Voice module ready');
    }

    // Auto-initialise
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVoiceModule);
    } else {
        initVoiceModule();
    }

})();
