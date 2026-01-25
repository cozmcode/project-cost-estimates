/**
 * Voice Commands Module for FSE Deployment Cost Calculator
 * Uses Kokoro TTS for high-quality speech synthesis with browser TTS fallback
 * Uses Web Speech API for voice recognition
 *
 * Wrapped in IIFE to avoid conflicts with other scripts
 */

(function() {
    'use strict';

    // Kokoro TTS instance
    let kokoroTTS = null;
    let audioContext = null;
    let isKokoroReady = false;
    let currentAudioSource = null;

    // Voice recognition
    let voiceRecognition = null;
    let voiceIsListening = false;

    /**
     * Initialise Kokoro TTS
     * Loads the ~100MB model in the background
     */
    async function initKokoroTTS() {
        const statusEl = document.getElementById('ttsStatus');
        const statusText = document.getElementById('ttsStatusText');

        if (!statusEl) {
            console.warn('[VOICE] TTS status element not found');
            return;
        }

        try {
            statusText.textContent = 'Loading Kokoro TTS (~100MB)...';

            // Dynamic import of Kokoro
            const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js');

            kokoroTTS = await KokoroTTS.from_pretrained(
                "onnx-community/Kokoro-82M-ONNX",
                { dtype: "q8" }
            );

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            isKokoroReady = true;

            statusEl.classList.remove('loading');
            statusEl.classList.add('ready');
            statusEl.innerHTML = '<span>✓</span><span id="ttsStatusText">Kokoro TTS Ready</span>';

            console.log('[VOICE] Kokoro TTS loaded successfully');
        } catch (error) {
            console.error('[VOICE] Failed to load Kokoro TTS:', error);
            statusEl.classList.remove('loading');
            statusEl.classList.add('error');
            statusEl.innerHTML = '<span>⚠</span><span id="ttsStatusText">TTS Unavailable (using fallback)</span>';
        }
    }

    /**
     * Initialise Voice Recognition (Web Speech API)
     */
    function initVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            const voiceBtn = document.getElementById('voiceBtn');
            if (voiceBtn) voiceBtn.style.display = 'none';
            console.warn('[VOICE] Speech recognition not supported in this browser');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.continuous = true;  // Keep listening
        voiceRecognition.interimResults = false;
        voiceRecognition.lang = 'en-GB';

        voiceRecognition.onresult = function(event) {
            // Get the latest result
            const lastResult = event.results[event.results.length - 1];
            if (lastResult.isFinal) {
                const transcript = lastResult[0].transcript.toLowerCase().trim();
                handleVoiceCommand(transcript);
            }
        };

        voiceRecognition.onend = function() {
            // Restart if still supposed to be listening
            if (voiceIsListening) {
                try {
                    voiceRecognition.start();
                } catch (e) {
                    // Already started
                }
            }
        };

        voiceRecognition.onerror = function(event) {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                showVoiceToast('Voice error: ' + event.error);
            }
            // Keep listening unless manually stopped
            if (voiceIsListening && event.error !== 'not-allowed') {
                setTimeout(() => {
                    try {
                        voiceRecognition.start();
                    } catch (e) {}
                }, 100);
            }
        };

        console.log('[VOICE] Voice recognition initialised');
    }

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
    function startListening() {
        if (!voiceRecognition) {
            showVoiceToast('Voice not supported in this browser');
            return;
        }
        voiceIsListening = true;
        try {
            voiceRecognition.start();
        } catch (e) {}

        // Update desktop button
        const voiceBtn = document.getElementById('voiceBtn');
        const voiceBtnText = document.getElementById('voiceBtnText');
        if (voiceBtn) voiceBtn.classList.add('listening');
        if (voiceBtnText) voiceBtnText.textContent = 'Listening...';

        // Update mobile button
        const voiceBtnMobile = document.getElementById('voiceBtnMobile');
        if (voiceBtnMobile) voiceBtnMobile.classList.add('listening');

        showVoiceToast('Voice active. Say "help" for commands.');
    }

    /**
     * Stop listening for voice commands
     */
    function stopListening() {
        voiceIsListening = false;
        try {
            voiceRecognition.stop();
        } catch (e) {}

        // Update desktop button
        const voiceBtn = document.getElementById('voiceBtn');
        const voiceBtnText = document.getElementById('voiceBtnText');
        if (voiceBtn) voiceBtn.classList.remove('listening');
        if (voiceBtnText) voiceBtnText.textContent = 'Voice Commands';

        // Update mobile button
        const voiceBtnMobile = document.getElementById('voiceBtnMobile');
        if (voiceBtnMobile) voiceBtnMobile.classList.remove('listening');

        showVoiceToast('Voice commands off');
    }

    /**
     * Handle voice command
     */
    function handleVoiceCommand(transcript) {
        showVoiceToast('Heard: "' + transcript + '"');
        console.log('[VOICE] Command received:', transcript);

        // Country matching for common destinations
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
            speak('Available commands: Say calculate to run cost analysis. Say clear or reset to start over. Say set destination followed by a country name. Say set months followed by a number. Say staffing to switch to staffing engine. Say calculator to switch to cost analysis. Say stop listening to turn off voice.');
            return;
        }

        // Stop listening
        if (transcript.includes('stop listening') || transcript.includes('turn off voice')) {
            speak('Voice commands off. Click the microphone to reactivate.');
            stopListening();
            return;
        }

        // Calculate / run estimate
        if (transcript.includes('calculate') || transcript.includes('run estimate') || transcript.includes('estimate cost')) {
            speak('Running cost analysis now.');
            if (typeof window.calculateCosts === 'function') {
                window.calculateCosts();
            }
            return;
        }

        // Clear / Reset form
        if (transcript.includes('clear') || transcript.includes('reset') || transcript.includes('start over')) {
            speak('Clearing the form.');
            if (typeof window.resetForm === 'function') {
                window.resetForm();
            }
            return;
        }

        // Populate demo data
        if (transcript.includes('demo') || transcript.includes('populate') || transcript.includes('sample')) {
            speak('Populating with sample data.');
            if (typeof window.autoPopulateDemo === 'function') {
                window.autoPopulateDemo();
            }
            return;
        }

        // Switch to Calculator/Cost Analysis
        if (transcript.includes('calculator') || transcript.includes('cost analysis') || transcript.includes('cost tab')) {
            speak('Switching to cost analysis.');
            if (typeof window.switchMainTab === 'function') {
                window.switchMainTab('calculator');
            }
            return;
        }

        // Switch to Staffing Engine
        if (transcript.includes('staffing') || transcript.includes('staff') || transcript.includes('candidates')) {
            speak('Switching to staffing engine.');
            if (typeof window.switchMainTab === 'function') {
                window.switchMainTab('staffing');
            }
            return;
        }

        // Set destination country
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
            speak('Sorry, I did not recognise the destination country. Try saying destination followed by a country name like Brazil, USA, or Germany.');
            return;
        }

        // Set assignment months
        const monthsMatch = transcript.match(/(\d+)\s*(months?|month)/);
        if (monthsMatch || transcript.includes('months') || transcript.includes('duration')) {
            const months = monthsMatch ? parseInt(monthsMatch[1]) : null;
            if (months && months > 0 && months <= 60) {
                const monthsInput = document.getElementById('assignment-months');
                if (monthsInput) {
                    monthsInput.value = months;
                    monthsInput.dispatchEvent(new Event('change'));
                    speak('Assignment duration set to ' + months + ' months');
                }
            } else if (!months) {
                speak('Please say the number of months, for example "6 months" or "12 months".');
            } else {
                speak('Please enter a duration between 1 and 60 months.');
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
                    speak('Monthly salary set to ' + salary.toLocaleString() + ' euros');
                }
            } else {
                speak('Please say salary followed by an amount, for example "salary 7000".');
            }
            return;
        }

        // Explain current results
        if (transcript.includes('explain') || transcript.includes('what is') || transcript.includes('tell me') || transcript.includes('describe')) {
            explainResults();
            return;
        }

        // Nothing matched
        speak('Sorry, I did not understand that command. Say "help" to hear available commands.');
    }

    /**
     * Explain the current results on screen
     */
    function explainResults() {
        const totalCostEl = document.querySelector('.total-cost-value') || document.querySelector('[id*="total"]');
        const destinationEl = document.getElementById('destination-country');
        const monthsEl = document.getElementById('assignment-months');

        if (totalCostEl && totalCostEl.textContent.includes('€')) {
            const destination = destinationEl ? destinationEl.value : 'the destination';
            const months = monthsEl ? monthsEl.value : 'the duration';
            const total = totalCostEl.textContent;

            speak(`The current estimate shows a total cost of ${total} for a ${months} month assignment to ${destination}. This includes taxes, social security contributions, per diem allowances, and administrative fees.`);
        } else {
            speak('No results are currently displayed. Please fill in the assignment details and click calculate, or say "populate" to load sample data.');
        }
    }

    /**
     * Speak text using Kokoro TTS or browser fallback
     */
    async function speak(text) {
        showVoiceToast('Generating speech...');

        // Stop any currently playing audio
        if (currentAudioSource) {
            try {
                currentAudioSource.stop();
            } catch (e) {}
            currentAudioSource = null;
        }

        // Cancel any browser TTS in progress
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        // Use Kokoro if ready, otherwise fall back to browser TTS
        if (isKokoroReady && kokoroTTS) {
            try {
                // Generate audio with Kokoro (using British female voice)
                const audio = await kokoroTTS.generate(text, {
                    voice: "bf_emma"  // British female voice
                });

                // Resume audio context if suspended (browser autoplay policy)
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                // Get the raw audio data
                const rawAudio = audio.toWav();

                // Decode and play
                const audioBuffer = await audioContext.decodeAudioData(rawAudio.buffer);
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);

                currentAudioSource = source;
                source.start(0);
                showVoiceToast('Speaking (Kokoro)...');

                source.onended = () => {
                    currentAudioSource = null;
                };
            } catch (error) {
                console.error('[VOICE] Kokoro TTS error:', error);
                // Fall back to browser TTS
                speakWithBrowserTTS(text);
            }
        } else {
            // Fall back to browser TTS
            speakWithBrowserTTS(text);
        }
    }

    /**
     * Fallback: Speak using browser's built-in TTS
     */
    function speakWithBrowserTTS(text) {
        const synth = window.speechSynthesis;
        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-GB';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        const voices = synth.getVoices();
        const preferredVoice = voices.find(v => v.lang.includes('en-GB')) || voices.find(v => v.lang.includes('en'));
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        synth.speak(utterance);
        showVoiceToast('Speaking (browser)...');
    }

    /**
     * Show toast notification for voice feedback
     */
    function showVoiceToast(message) {
        const toast = document.getElementById('voiceToast');
        if (!toast) return;

        toast.textContent = message;
        toast.classList.add('visible');

        // Clear previous timeout
        if (toast.hideTimeout) {
            clearTimeout(toast.hideTimeout);
        }

        toast.hideTimeout = setTimeout(() => {
            toast.classList.remove('visible');
        }, 3000);
    }

    /**
     * Initialise voice module when DOM is ready
     */
    function initVoiceModule() {
        console.log('[VOICE] Initialising voice module...');

        // Start loading Kokoro TTS in the background
        initKokoroTTS();

        // Initialise voice recognition
        initVoiceRecognition();

        // Make toggleVoice available globally
        window.toggleVoice = toggleVoice;
        window.speak = speak;
        window.showVoiceToast = showVoiceToast;
    }

    // Auto-initialise when script loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVoiceModule);
    } else {
        initVoiceModule();
    }

})();
