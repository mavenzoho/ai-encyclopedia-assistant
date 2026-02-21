/**
 * AI Encyclopedia - Main Application Controller
 *
 * Wires together the VoiceManager, content WebSocket, and EncyclopediaRenderer
 * to create the full interactive experience.
 */

import { VoiceManager } from './voice.js';
import { EncyclopediaRenderer } from './renderer.js';

class App {
    constructor() {
        this.sessionId = crypto.randomUUID();
        this.topicHistory = [];

        // Initialize components
        this.renderer = new EncyclopediaRenderer(
            document.getElementById('page-container')
        );
        this.voiceManager = new VoiceManager(this.sessionId);
        this.contentWs = null;

        // DOM elements
        this.micBtn = document.getElementById('mic-btn');
        this.statusText = document.getElementById('status-text');
        this.transcriptText = document.getElementById('transcript-text');
        this.transcriptBar = document.getElementById('transcript-bar');
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.pageContainer = document.getElementById('page-container');
        this.topicNav = document.getElementById('topic-history');
        this.historyChips = document.getElementById('history-chips');

        this._initContentWebSocket();
        this._initVoiceCallbacks();
        this._initUI();
    }

    /**
     * Initialize the content delivery WebSocket.
     */
    _initContentWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws/content/${this.sessionId}`;

        this.contentWs = new WebSocket(url);

        this.contentWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'encyclopedia_page') {
                    this._onPageReceived(data);
                }
            } catch (e) {
                console.error('Failed to parse content:', e);
            }
        };

        this.contentWs.onclose = () => {
            // Auto-reconnect
            setTimeout(() => this._initContentWebSocket(), 3000);
        };
    }

    /**
     * Set up voice manager callbacks.
     */
    _initVoiceCallbacks() {
        // User's speech transcription
        this.voiceManager.onTranscription = (text, partial) => {
            this.transcriptText.textContent = text;
            this.transcriptBar.classList.add('active');

            // Show loading when user finishes a substantial utterance
            if (!partial && text && text.length > 5) {
                this._showLoading();
            }
        };

        // Agent's speech transcription (subtitles)
        this.voiceManager.onOutputTranscription = (text) => {
            this.transcriptText.textContent = text;
            this.transcriptBar.classList.add('active');
        };

        // Connection status
        this.voiceManager.onStatusChange = (status) => {
            this.statusText.textContent = status;
        };
    }

    /**
     * Initialize UI event handlers.
     */
    _initUI() {
        // Microphone toggle
        this.micBtn.addEventListener('click', async () => {
            await this.voiceManager.toggle();
            this.micBtn.classList.toggle('listening', this.voiceManager.isListening);
        });

        // Suggestion chips on welcome screen
        document.querySelectorAll('.chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const topic = chip.dataset.topic;
                this._requestTopicViaAPI(topic);
            });
        });
    }

    /**
     * Request an encyclopedia page via the HTTP API (reliable, no Live API needed).
     * Used for chips and typed input.
     */
    async _requestTopicViaAPI(topic, focus = 'general overview') {
        this._showLoading();
        this.welcomeScreen.classList.add('hidden');
        this.transcriptText.textContent = `Exploring: ${topic}`;
        this.transcriptBar.classList.add('active');

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: topic,
                    focus: focus,
                    session_id: this.sessionId,
                }),
            });

            const result = await response.json();

            if (result.status === 'error') {
                console.error('Generation failed:', result.message);
                this._hideLoading();
                this.transcriptText.textContent = `Error: ${result.message}`;
            } else if (result.type === 'encyclopedia_page') {
                // Render the page directly from the API response
                this._onPageReceived(result);
            }
        } catch (err) {
            console.error('API request failed:', err);
            this._hideLoading();
            this.transcriptText.textContent = 'Connection error. Please try again.';
        }
    }

    /**
     * Request via voice WebSocket (used when mic is active).
     */
    _requestTopicViaVoice(topic) {
        this.voiceManager.sendText(`Tell me about ${topic}`);
        this._showLoading();
        this.transcriptText.textContent = `Tell me about ${topic}`;
        this.transcriptBar.classList.add('active');
    }

    /**
     * Handle a received encyclopedia page.
     */
    _onPageReceived(pageData) {
        this._hideLoading();
        this.welcomeScreen.classList.add('hidden');

        // Render the page
        this.renderer.renderPage(pageData);

        // Add to topic history
        this._addToHistory(pageData.topic);

        // Clear transcript after a moment
        setTimeout(() => {
            this.transcriptBar.classList.remove('active');
        }, 2000);
    }

    /**
     * Add a topic to the navigation history.
     */
    _addToHistory(topic) {
        // Avoid duplicates
        if (this.topicHistory.includes(topic)) return;

        this.topicHistory.push(topic);
        this.topicNav.classList.remove('hidden');

        const chip = document.createElement('button');
        chip.className = 'history-chip';
        chip.textContent = topic;
        chip.addEventListener('click', () => {
            this._requestTopicViaAPI(topic);
        });

        this.historyChips.appendChild(chip);
    }

    /**
     * Show the loading overlay.
     */
    _showLoading() {
        this.loadingOverlay.classList.remove('hidden');
    }

    /**
     * Hide the loading overlay.
     */
    _hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }
}

// Initialize app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
