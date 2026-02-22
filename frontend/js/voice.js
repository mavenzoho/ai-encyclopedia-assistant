/**
 * Voice Manager
 *
 * Handles microphone capture, WebSocket communication for voice streaming,
 * and audio playback of agent responses. Uses AudioWorklet API for
 * low-latency audio processing.
 */

export class VoiceManager {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.ws = null;
        this.isListening = false;
        this.isConnected = false;
        this.isVoiceReady = false;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 5;

        // Audio capture
        this.captureContext = null;
        this.captureStream = null;
        this.recorderNode = null;

        // Audio playback
        this.playbackContext = null;
        this.playerNode = null;

        // Callbacks
        this.onTranscription = null;
        this.onOutputTranscription = null;
        this.onStatusChange = null;
        this.onToolEvent = null;

        this._connect();
    }

    /**
     * Connect to the voice WebSocket.
     */
    _connect() {
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            this.onStatusChange?.('Voice unavailable - use text input');
            return;
        }

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws/voice/${this.sessionId}`;

        try {
            this.ws = new WebSocket(url);
            this.ws.binaryType = 'arraybuffer';
        } catch (err) {
            console.error('Failed to create voice WebSocket:', err);
            this.onStatusChange?.('Voice connection failed - use text input');
            return;
        }

        this.ws.onopen = () => {
            this.isConnected = true;
            this._reconnectAttempts = 0;
            this.onStatusChange?.('Connecting voice...');
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                // Binary PCM audio response - play it
                this._playAudio(event.data);
            } else {
                // JSON event
                try {
                    const data = JSON.parse(event.data);
                    this._handleEvent(data);
                } catch (e) {
                    console.warn('Failed to parse voice event:', e);
                }
            }
        };

        this.ws.onclose = (event) => {
            this.isConnected = false;
            this.isVoiceReady = false;
            if (this.isListening) {
                this.stopListening();
            }
            this._reconnectAttempts++;
            const delay = Math.min(3000 * this._reconnectAttempts, 15000);
            this.onStatusChange?.(`Disconnected - reconnecting in ${Math.round(delay / 1000)}s...`);
            setTimeout(() => this._connect(), delay);
        };

        this.ws.onerror = (err) => {
            console.error('Voice WebSocket error:', err);
            this.onStatusChange?.('Voice connection error');
        };
    }

    /**
     * Handle JSON events from the voice WebSocket.
     */
    _handleEvent(event) {
        switch (event.type) {
            case 'voice_ready':
                this.isVoiceReady = true;
                this.onStatusChange?.('Ready - click mic to speak');
                break;
            case 'input_transcription':
                this.onTranscription?.(event.data, event.partial);
                break;
            case 'output_transcription':
                this.onOutputTranscription?.(event.data);
                break;
            case 'transcription':
                if (event.is_output) {
                    this.onOutputTranscription?.(event.data);
                } else {
                    this.onTranscription?.(event.data, false);
                }
                break;
            case 'tool_call':
            case 'tool_result':
                this.onToolEvent?.(event);
                break;
            case 'error':
                console.error('Voice error:', event.data);
                this.onStatusChange?.(`Voice error: ${event.data}`);
                break;
        }
    }

    /**
     * Toggle microphone on/off.
     */
    async toggle() {
        if (this.isListening) {
            this.stopListening();
        } else {
            await this.startListening();
        }
    }

    /**
     * Start capturing microphone audio and streaming to the agent.
     */
    async startListening() {
        // Check WebSocket connection first
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.onStatusChange?.('Not connected - trying to reconnect...');
            this._reconnectAttempts = 0;
            this._connect();
            return;
        }

        try {
            // Request microphone access
            this.captureStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: { ideal: 16000 },
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            // Create AudioContext for capture (browser native rate)
            this.captureContext = new AudioContext();

            // Load the PCM recorder worklet
            await this.captureContext.audioWorklet.addModule('/static/js/worklets/pcm-recorder.js');

            // Create audio source from microphone
            const source = this.captureContext.createMediaStreamSource(this.captureStream);

            // Create recorder worklet node
            this.recorderNode = new AudioWorkletNode(this.captureContext, 'pcm-recorder');

            // When the worklet produces PCM chunks, send them over WebSocket
            this.recorderNode.port.onmessage = (event) => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(event.data);
                }
            };

            // Connect: mic -> recorder worklet
            source.connect(this.recorderNode);
            // Connect to destination to keep the audio pipeline alive
            this.recorderNode.connect(this.captureContext.destination);

            this.isListening = true;
            this.onStatusChange?.('Listening...');
        } catch (err) {
            console.error('Failed to start microphone:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                this.onStatusChange?.('Microphone access denied');
            } else if (err.name === 'NotFoundError') {
                this.onStatusChange?.('No microphone found');
            } else {
                this.onStatusChange?.(`Mic error: ${err.message}`);
            }
        }
    }

    /**
     * Stop capturing microphone audio.
     */
    stopListening() {
        // Stop all media tracks
        if (this.captureStream) {
            this.captureStream.getTracks().forEach((track) => track.stop());
            this.captureStream = null;
        }

        // Close audio context
        if (this.captureContext) {
            this.captureContext.close().catch(() => {});
            this.captureContext = null;
            this.recorderNode = null;
        }

        this.isListening = false;
        this.onStatusChange?.(this.isConnected ? 'Click mic to speak' : 'Disconnected');
    }

    /**
     * Send a text message through the voice WebSocket (for chips/typed input).
     */
    sendText(text) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'text', data: text }));
        }
    }

    /**
     * Play PCM audio response from the agent.
     */
    async _playAudio(pcmArrayBuffer) {
        try {
            // Initialize playback context on first use (24kHz to match Gemini output)
            if (!this.playbackContext) {
                this.playbackContext = new AudioContext({ sampleRate: 24000 });
                await this.playbackContext.audioWorklet.addModule(
                    '/static/js/worklets/pcm-player.js'
                );
                this.playerNode = new AudioWorkletNode(this.playbackContext, 'pcm-player');
                this.playerNode.connect(this.playbackContext.destination);
            }

            // Resume if suspended (browsers require user gesture)
            if (this.playbackContext.state === 'suspended') {
                await this.playbackContext.resume();
            }

            // Send Int16 samples to the player worklet
            const int16Samples = new Int16Array(pcmArrayBuffer);
            this.playerNode.port.postMessage({ samples: int16Samples });
        } catch (err) {
            console.error('Audio playback error:', err);
        }
    }

    /**
     * Clear playback buffer (e.g., on interruption).
     */
    clearPlayback() {
        if (this.playerNode) {
            this.playerNode.port.postMessage({ command: 'clear' });
        }
    }

    /**
     * Clean up all resources.
     */
    destroy() {
        this.stopListening();
        this._maxReconnectAttempts = 0; // Prevent reconnection
        if (this.playbackContext) {
            this.playbackContext.close().catch(() => {});
        }
        if (this.ws) {
            this.ws.close();
        }
    }
}
