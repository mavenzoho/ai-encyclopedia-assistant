/**
 * AI Encyclopedia - Main Application Controller
 *
 * Tabbed encyclopedia explorer with:
 * - Background tab loading (stay on current tab while new content generates)
 * - Instant voice feedback via browser SpeechSynthesis
 * - Click anywhere to explore in new tabs
 * - Image-to-video generation with Veo
 */

import { VoiceManager } from './voice.js';
import { EncyclopediaRenderer } from './renderer.js';

// Enthusiastic voice phrases for instant feedback
const VOICE_PHRASES = [
    "Oh, {topic}! This is amazing! Let's explore it together!",
    "Great choice! {topic} is fascinating! Let me create something special!",
    "Ooh, {topic}! I love this topic! Let me build you a beautiful page!",
    "{topic}! What a wonderful subject! Let's dive in!",
    "Excellent! {topic} is one of my favorites! Creating your page now!",
    "Oh wow, {topic}! You're going to love what I find! One moment!",
];

class App {
    constructor() {
        this.sessionId = crypto.randomUUID();
        this.pageCache = {};  // cacheKey -> pageData
        this.tabs = [];       // [{ id, topic, pageData, loading }]
        this.activeTabId = null;

        // Initialize components
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
        this.tabBar = document.getElementById('tab-bar');
        this.tabList = document.getElementById('tab-list');
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');

        // Voice overlay elements
        this.voiceOverlay = document.getElementById('voice-overlay');
        this.voiceOverlayText = document.getElementById('voice-overlay-text');
        this.voiceOverlayLabel = document.getElementById('voice-overlay-label');
        this.voiceOverlayStatus = document.getElementById('voice-overlay-status');
        this._voiceOverlayTimeout = null;

        // Create a renderer
        this.renderer = new EncyclopediaRenderer(this.pageContainer);

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
            setTimeout(() => this._initContentWebSocket(), 3000);
        };
    }

    /**
     * Set up voice manager callbacks.
     */
    _initVoiceCallbacks() {
        this.voiceManager.onTranscription = (text, partial) => {
            // Show in topbar
            this.transcriptText.textContent = text;
            this.transcriptBar.classList.add('active');

            // Show prominently in voice overlay
            this._showVoiceOverlay('hearing', text, partial ? 'Listening...' : 'I heard you!');

            if (!partial && text && text.length > 5) {
                // Heard a complete phrase - show confirmation then hide
                this._showVoiceOverlay('heard', text, 'Processing your request...');
                setTimeout(() => this._hideVoiceOverlay(), 2500);
            }
        };

        this.voiceManager.onOutputTranscription = (text) => {
            this.transcriptText.textContent = text;
            this.transcriptBar.classList.add('active');

            // Show AI's response text on screen
            this._showVoiceOverlay('speaking', text, 'AI is speaking');
            clearTimeout(this._voiceOverlayTimeout);
            this._voiceOverlayTimeout = setTimeout(() => this._hideVoiceOverlay(), 4000);
        };

        this.voiceManager.onStatusChange = (status) => {
            this.statusText.textContent = status;
        };
    }

    /**
     * Show the voice overlay with transcription text.
     */
    _showVoiceOverlay(mode, text, label) {
        if (!this.voiceOverlay) return;
        this.voiceOverlay.classList.remove('hidden');
        this.voiceOverlay.dataset.mode = mode;
        if (text) this.voiceOverlayText.textContent = text;
        if (label) this.voiceOverlayLabel.textContent = label;

        // Clear any pending hide
        clearTimeout(this._voiceOverlayTimeout);
    }

    /**
     * Hide the voice overlay.
     */
    _hideVoiceOverlay() {
        if (!this.voiceOverlay) return;
        this.voiceOverlay.classList.add('hidden');
        this.voiceOverlayText.textContent = '';
    }

    /**
     * Initialize UI event handlers.
     */
    _initUI() {
        // Microphone toggle
        this.micBtn.addEventListener('click', async () => {
            try {
                await this.voiceManager.toggle();
                this.micBtn.classList.toggle('listening', this.voiceManager.isListening);
                if (this.voiceManager.isListening) {
                    this._showVoiceOverlay('hearing', '', 'Listening... Speak now!');
                } else {
                    this._hideVoiceOverlay();
                }
            } catch (err) {
                console.error('Mic toggle failed:', err);
                this.statusText.textContent = 'Mic error - try typing instead';
            }
        });

        // Suggestion chips on welcome screen
        document.querySelectorAll('.chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const topic = chip.dataset.topic;
                this._openTopic(topic);
            });
        });

        // Search input
        if (this.searchInput) {
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._handleSearch();
                }
            });
        }
        if (this.searchBtn) {
            this.searchBtn.addEventListener('click', () => {
                this._handleSearch();
            });
        }

        // Wire up renderer click-to-explore
        this.renderer.onExploreClick = (topic) => {
            this._openTopic(topic);
        };

        // Wire up renderer image-to-video (replaces image in-place)
        this.renderer.onVideoRequest = (imageData, mimeType, topic, imageWrapper) => {
            this._generateVideo(imageData, mimeType, topic, imageWrapper);
        };
    }

    /**
     * Handle search input submission.
     */
    _handleSearch() {
        const query = this.searchInput.value.trim();
        if (query.length > 0) {
            this._openTopic(query);
            this.searchInput.value = '';
            this.searchInput.blur();
        }
    }

    /**
     * Speak an enthusiastic phrase about the topic using browser SpeechSynthesis.
     */
    _speakTopicFeedback(topic) {
        if (!('speechSynthesis' in window)) return;

        // Cancel any ongoing speech
        speechSynthesis.cancel();

        const phrase = VOICE_PHRASES[Math.floor(Math.random() * VOICE_PHRASES.length)]
            .replace('{topic}', topic);

        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.rate = 1.1;
        utterance.pitch = 1.1;
        utterance.volume = 0.8;

        // Try to pick a good English voice
        const voices = speechSynthesis.getVoices();
        const preferred = voices.find(
            (v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha'))
        ) || voices.find((v) => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;

        speechSynthesis.speak(utterance);
    }

    /**
     * Open a topic - creates a new background tab and generates the page.
     * Stays on the current tab while loading happens in background.
     */
    async _openTopic(topic, focus = 'general overview') {
        const cacheKey = `${topic.toLowerCase()}|${focus.toLowerCase()}`;

        // Speak instantly
        this._speakTopicFeedback(topic);

        // If cached, open it in a new tab instantly
        if (this.pageCache[cacheKey]) {
            this._createTab(topic, this.pageCache[cacheKey]);
            return;
        }

        // Check if topic already has a loading tab
        const existingTab = this.tabs.find(
            (t) => t.topic.toLowerCase() === topic.toLowerCase()
        );
        if (existingTab) {
            // Flash the tab to show it's already loading/exists
            const tabBtn = this.tabList.querySelector(`[data-tab-id="${existingTab.id}"]`);
            if (tabBtn) {
                tabBtn.classList.add('tab-flash');
                setTimeout(() => tabBtn.classList.remove('tab-flash'), 600);
            }
            return;
        }

        // Create a "loading" tab in the background
        const tabId = this._createLoadingTab(topic);

        this.welcomeScreen.classList.add('hidden');
        this.transcriptText.textContent = `Loading: ${topic}`;
        this.transcriptBar.classList.add('active');

        // If this is the first tab, show it (with loading state)
        if (this.tabs.length === 1) {
            this._switchToTab(tabId);
        }

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
                this._updateTabWithError(tabId, result.message);
            } else if (result.type === 'encyclopedia_page') {
                this.pageCache[cacheKey] = result;
                this._updateTabWithContent(tabId, result);
            }
        } catch (err) {
            console.error('API request failed:', err);
            this._updateTabWithError(tabId, 'Connection error. Please try again.');
        }
    }

    /**
     * Create a loading tab (in the background, doesn't switch away from current tab).
     */
    _createLoadingTab(topic) {
        const tabId = `tab-${Date.now()}`;

        // Add tab data with loading state
        this.tabs.push({ id: tabId, topic, pageData: null, loading: true });

        // Show the tab bar
        this.tabBar.classList.remove('hidden');
        document.body.classList.add('has-tabs');

        // Create tab button with loading indicator
        const tabBtn = document.createElement('button');
        tabBtn.className = 'tab-btn tab-loading';
        tabBtn.dataset.tabId = tabId;
        tabBtn.innerHTML = `
            <span class="tab-spinner"></span>
            <span class="tab-label">${this._escapeHtml(topic)}</span>
            <span class="tab-close" title="Close tab">&times;</span>
        `;

        // Click tab to switch
        tabBtn.querySelector('.tab-label').addEventListener('click', () => {
            this._switchToTab(tabId);
        });

        // Close tab
        tabBtn.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeTab(tabId);
        });

        this.tabList.appendChild(tabBtn);
        tabBtn.scrollIntoView({ behavior: 'smooth', inline: 'end' });

        return tabId;
    }

    /**
     * Update a loading tab with actual content.
     */
    _updateTabWithContent(tabId, pageData) {
        const tab = this.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        tab.pageData = pageData;
        tab.loading = false;

        // Update tab button - remove loading state, add ready indicator
        const tabBtn = this.tabList.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabBtn) {
            tabBtn.classList.remove('tab-loading');
            tabBtn.classList.add('tab-ready');
            // Remove spinner
            const spinner = tabBtn.querySelector('.tab-spinner');
            if (spinner) spinner.remove();
            // Brief flash to notify user
            setTimeout(() => tabBtn.classList.remove('tab-ready'), 1500);
        }

        // If this tab is active, render it
        if (this.activeTabId === tabId) {
            this._hideLoading();
            this.renderer.renderPage(pageData);
        }

        this.transcriptText.textContent = `Ready: ${pageData.topic}`;
        this.transcriptBar.classList.add('active');
        setTimeout(() => this.transcriptBar.classList.remove('active'), 2000);
    }

    /**
     * Update a loading tab with an error.
     */
    _updateTabWithError(tabId, message) {
        const tab = this.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        tab.loading = false;

        const tabBtn = this.tabList.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabBtn) {
            tabBtn.classList.remove('tab-loading');
            tabBtn.classList.add('tab-error');
            const spinner = tabBtn.querySelector('.tab-spinner');
            if (spinner) spinner.remove();
        }

        if (this.activeTabId === tabId) {
            this._hideLoading();
            this.pageContainer.innerHTML = `
                <div style="text-align:center;padding:4rem 2rem;color:#666;">
                    <h2 style="color:#e74c3c;">Error</h2>
                    <p>${this._escapeHtml(message)}</p>
                    <button onclick="window.app._closeTab('${tabId}')"
                            style="margin-top:1rem;padding:0.5rem 1.5rem;border:2px solid #e74c3c;background:transparent;color:#e74c3c;border-radius:20px;cursor:pointer;font-weight:600;">
                        Close Tab
                    </button>
                </div>`;
        }
    }

    /**
     * Handle a received encyclopedia page (from content WebSocket).
     */
    _onPageReceived(pageData) {
        this._hideLoading();
        this.welcomeScreen.classList.add('hidden');
        this._createTab(pageData.topic, pageData);
    }

    /**
     * Create a completed tab for a topic (for cached content).
     */
    _createTab(topic, pageData) {
        const tabId = `tab-${Date.now()}`;

        // Check if topic already has an open tab
        const existingTab = this.tabs.find(
            (t) => t.topic.toLowerCase() === topic.toLowerCase()
        );
        if (existingTab) {
            this._switchToTab(existingTab.id);
            return;
        }

        this.tabs.push({ id: tabId, topic, pageData, loading: false });

        this.tabBar.classList.remove('hidden');
        document.body.classList.add('has-tabs');

        const tabBtn = document.createElement('button');
        tabBtn.className = 'tab-btn';
        tabBtn.dataset.tabId = tabId;
        tabBtn.innerHTML = `
            <span class="tab-label">${this._escapeHtml(topic)}</span>
            <span class="tab-close" title="Close tab">&times;</span>
        `;

        tabBtn.querySelector('.tab-label').addEventListener('click', () => {
            this._switchToTab(tabId);
        });

        tabBtn.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeTab(tabId);
        });

        this.tabList.appendChild(tabBtn);
        this._switchToTab(tabId);
        tabBtn.scrollIntoView({ behavior: 'smooth', inline: 'end' });
    }

    /**
     * Switch to a specific tab.
     */
    _switchToTab(tabId) {
        const tab = this.tabs.find((t) => t.id === tabId);
        if (!tab) return;

        this.activeTabId = tabId;

        // Update tab button styles
        this.tabList.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tabId === tabId);
        });

        if (tab.loading) {
            // Show loading state for this tab
            this._showLoading();
            this.pageContainer.classList.add('hidden');
        } else if (tab.pageData) {
            this._hideLoading();
            this.renderer.renderPage(tab.pageData);
        }

        this.transcriptText.textContent = tab.loading ? `Loading: ${tab.topic}` : tab.topic;
        this.transcriptBar.classList.add('active');
        setTimeout(() => this.transcriptBar.classList.remove('active'), 1500);
    }

    /**
     * Close a tab.
     */
    _closeTab(tabId) {
        const index = this.tabs.findIndex((t) => t.id === tabId);
        if (index === -1) return;

        this.tabs.splice(index, 1);

        const tabBtn = this.tabList.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabBtn) tabBtn.remove();

        if (this.activeTabId === tabId) {
            if (this.tabs.length > 0) {
                const newIndex = Math.min(index, this.tabs.length - 1);
                this._switchToTab(this.tabs[newIndex].id);
            } else {
                this.activeTabId = null;
                this.pageContainer.classList.add('hidden');
                this.pageContainer.innerHTML = '';
                this._hideLoading();
                this.welcomeScreen.classList.remove('hidden');
                this.tabBar.classList.add('hidden');
                document.body.classList.remove('has-tabs');
            }
        }
    }

    /**
     * Generate a video from an image using Veo, replacing the image in-place.
     * @param {string} imageData - base64 image data
     * @param {string} mimeType - image MIME type
     * @param {string} topic - topic for animation prompt
     * @param {HTMLElement} imageWrapper - the .image-wrapper element containing the image
     */
    async _generateVideo(imageData, mimeType, topic, imageWrapper) {
        if (!imageWrapper) return;

        // Show loading overlay on the image itself
        const overlay = document.createElement('div');
        overlay.className = 'video-loading-overlay';
        overlay.innerHTML = `
            <div class="spinner"><div class="spinner-ring"></div><div class="spinner-ring"></div><div class="spinner-ring"></div></div>
            <p>Creating video...</p>
            <p class="video-hint">This may take 30-60 seconds</p>
        `;
        imageWrapper.style.position = 'relative';
        imageWrapper.appendChild(overlay);

        // Disable the video button while generating
        const videoBtn = imageWrapper.querySelector('.video-btn');
        if (videoBtn) videoBtn.style.display = 'none';

        try {
            const response = await fetch('/api/generate-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_data: imageData,
                    mime_type: mimeType,
                    topic: topic,
                }),
            });

            const result = await response.json();

            if (result.status === 'error') {
                overlay.innerHTML = `
                    <p style="color:#fff;font-weight:600;">Video Error</p>
                    <p style="color:rgba(255,255,255,0.8);font-size:0.85rem;">${this._escapeHtml(result.message)}</p>
                `;
                setTimeout(() => {
                    overlay.remove();
                    if (videoBtn) videoBtn.style.display = '';
                }, 3000);
            } else if (result.video_data) {
                // Replace the image with a video element
                overlay.remove();
                const img = imageWrapper.querySelector('.encyclopedia-image');
                if (img) {
                    const video = document.createElement('video');
                    video.controls = true;
                    video.autoplay = true;
                    video.loop = true;
                    video.className = 'encyclopedia-image encyclopedia-video';
                    video.innerHTML = `
                        <source src="data:${result.video_mime_type || 'video/mp4'};base64,${result.video_data}"
                                type="${result.video_mime_type || 'video/mp4'}">
                    `;
                    img.replaceWith(video);
                }
                // Remove the video button since we already have the video
                if (videoBtn) videoBtn.remove();
            }
        } catch (err) {
            console.error('Video generation failed:', err);
            overlay.innerHTML = `
                <p style="color:#fff;font-weight:600;">Connection Error</p>
                <p style="color:rgba(255,255,255,0.8);font-size:0.85rem;">Please try again</p>
            `;
            setTimeout(() => {
                overlay.remove();
                if (videoBtn) videoBtn.style.display = '';
            }, 3000);
        }
    }

    _showLoading() {
        this.loadingOverlay.classList.remove('hidden');
    }

    _hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
