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

// Atlas persona voice phrases for instant feedback
const VOICE_PHRASES = [
    "Oh, {topic}! This is one of my absolute favorites! Let me take you on a journey!",
    "Now here's where it gets truly remarkable — {topic}! Let me create something special!",
    "{topic}! Picture this — I'm putting together a stunning visual story for you!",
    "What a brilliant choice! {topic} has such a fascinating story. Let me show you!",
    "{topic}! I've been waiting for someone to ask about this! One moment!",
    "Oh, {topic}! What most people don't realize is how incredible this subject is. Let's explore!",
];

class App {
    constructor() {
        this.sessionId = crypto.randomUUID();
        this.pageCache = {};  // cacheKey -> pageData
        this.tabs = [];       // [{ id, topic, pageData, loading }]
        this.activeTabId = null;
        this._narrationQueue = [];  // Queue of text segments to narrate
        this._isNarrating = false;  // Whether narration is currently playing
        this._narrationEnabled = true; // User can toggle narration

        // Initialize components
        this.voiceManager = new VoiceManager(this.sessionId);
        this.contentWs = null;

        // DOM elements
        this.micBtn = document.getElementById('mic-btn');
        this.heroMicBtn = document.getElementById('hero-mic-btn');
        this.statusText = document.getElementById('status-text');
        this.transcriptText = document.getElementById('transcript-text');
        // transcript-bar removed; transcriptText is now a plain span
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

        // Help bubble
        this.helpBubble = document.getElementById('help-bubble');
        this.helpBubbleText = document.getElementById('help-bubble-text');
        this.helpBubbleClose = document.getElementById('help-bubble-close');
        this._helpIndex = 0;
        this._helpTimer = null;
        this._helpDismissed = false;

        // Create a renderer
        this.renderer = new EncyclopediaRenderer(this.pageContainer);

        this._initContentWebSocket();
        this._initVoiceCallbacks();
        this._initUI();
        this._initHelpBubble();
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
            // status shown via transcriptText

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
            // status shown via transcriptText

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
        // Shared mic toggle logic
        const toggleMic = async () => {
            this._stopNarration();
            await this.voiceManager.toggle();
            const listening = this.voiceManager.isListening;
            this.micBtn.classList.toggle('listening', listening);
            if (this.heroMicBtn) this.heroMicBtn.classList.toggle('listening', listening);
            if (listening) {
                this._showVoiceOverlay('hearing', '', 'Listening... Speak now!');
            } else {
                this._hideVoiceOverlay();
            }
        };

        // Floating mic button (bottom of screen, visible on encyclopedia pages)
        this.micBtn.addEventListener('click', async () => {
            try {
                await toggleMic();
            } catch (err) {
                console.error('Mic toggle failed:', err);
                this.statusText.textContent = 'Mic error - try typing instead';
            }
        });

        // Hero mic button (big button on welcome screen)
        if (this.heroMicBtn) {
            this.heroMicBtn.addEventListener('click', async () => {
                try {
                    await toggleMic();
                } catch (err) {
                    console.error('Mic toggle failed:', err);
                    this.statusText.textContent = 'Mic error - try typing instead';
                }
            });
        }

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
        document.body.classList.add('has-content');
        this.transcriptText.textContent = `Loading: ${topic}`;
        this.transcriptBar.classList.add('active');

        // If this is the first tab, show it (with loading state)
        if (this.tabs.length === 1) {
            this._switchToTab(tabId);
        }

        try {
            // Gather prior explored topics for context-aware generation
            const priorTopics = this.tabs
                .filter((t) => t.topic.toLowerCase() !== topic.toLowerCase() && !t.loading)
                .map((t) => t.topic)
                .slice(-5);  // last 5 topics for context

            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: topic,
                    focus: focus,
                    session_id: this.sessionId,
                    prior_topics: priorTopics,
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

        // If this tab is active, render it and start narration
        if (this.activeTabId === tabId) {
            this._hideLoading();
            this.renderer.renderPage(pageData);
            this._narratePage(pageData);
        }

        // Show contextual help tip when content arrives
        if (!this._helpDismissed) {
            this._helpIndex = 0; // reset to show category-appropriate tips
            clearTimeout(this._helpTimer);
            this._helpTimer = setTimeout(() => this._showNextHelpTip(), 3000);
        }

        this.transcriptText.textContent = `Ready: ${pageData.topic}`;
        // transcript auto-clears
        setTimeout(() => { this.transcriptText.textContent = ''; }, 3000);
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

        // Stop narration from previous tab
        this._stopNarration();
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
            // Re-narrate when switching to a completed tab
            this._narratePage(tab.pageData);
        }

        this.transcriptText.textContent = tab.loading ? `Loading: ${tab.topic}` : tab.topic;
        // transcript auto-clears
        setTimeout(() => { this.transcriptText.textContent = ''; }, 2000);
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
                document.body.classList.remove('has-content');
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

    /**
     * Smart help bubble — rotates through contextual, fun tips to guide the user.
     */
    _initHelpBubble() {
        // Tips rotate based on what the user has done
        this._helpTips = {
            welcome: [
                "Hey! I'm Atlas, your Encyclopia guide. Hit that big red button and say any topic!",
                "Try saying \"Tell me about black holes\" — I dare you.",
                "Fun fact: I can illustrate anything. Even quantum physics. Mostly.",
                "Type a topic below, or just talk to me. I don't bite.",
                "Pro tip: I work best when you're curious. So... be curious!",
            ],
            firstPage: [
                "See something interesting? Click any bold word to explore deeper!",
                "Every image is clickable — tap one to learn more about what's in it.",
                "Want a video? Hit the play button on any illustration!",
                "I'm narrating this page for you. Click the mic to interrupt me anytime.",
            ],
            exploring: [
                "You're on a roll! I draw connections between topics you've explored.",
                "Try clicking a \"Related Topic\" chip at the bottom of the page.",
                "Switch between your tabs to revisit earlier discoveries.",
                "Ask me to compare two things — like \"volcanoes vs earthquakes\"!",
            ],
        };

        // Show first tip after a short delay
        setTimeout(() => this._showNextHelpTip(), 2500);

        // Close button
        if (this.helpBubbleClose) {
            this.helpBubbleClose.addEventListener('click', () => {
                this._helpDismissed = true;
                this.helpBubble.classList.add('hidden');
                clearTimeout(this._helpTimer);
            });
        }
    }

    _showNextHelpTip() {
        if (this._helpDismissed || !this.helpBubble) return;

        // Pick tip category based on state
        let category = 'welcome';
        if (this.tabs.length > 1) {
            category = 'exploring';
        } else if (this.tabs.length === 1) {
            category = 'firstPage';
        }

        const tips = this._helpTips[category];
        const tip = tips[this._helpIndex % tips.length];
        this._helpIndex++;

        this.helpBubbleText.textContent = tip;
        this.helpBubble.classList.remove('hidden');
        // Re-trigger animation
        this.helpBubble.style.animation = 'none';
        this.helpBubble.offsetHeight; // reflow
        this.helpBubble.style.animation = '';

        // Auto-rotate every 12 seconds, hide after 3 rotations per category
        clearTimeout(this._helpTimer);
        if (this._helpIndex <= tips.length * 1.5) {
            this._helpTimer = setTimeout(() => this._showNextHelpTip(), 12000);
        } else {
            // After enough tips, fade out
            this._helpTimer = setTimeout(() => {
                this.helpBubble.classList.add('hidden');
            }, 8000);
        }
    }

    /**
     * Narrate encyclopedia sections aloud for seamless text+image+audio interleaving.
     * Each section's text is spoken via SpeechSynthesis as the user reads, creating
     * a documentary-like experience where narration accompanies visuals.
     */
    _narratePage(pageData) {
        if (!this._narrationEnabled || !('speechSynthesis' in window)) return;

        // Stop any ongoing narration
        this._stopNarration();

        // Build narration queue from page sections
        this._narrationQueue = [];

        // Opening line
        this._narrationQueue.push(
            `Welcome to our exploration of ${pageData.topic}. Let me guide you through this.`
        );

        if (pageData.sections) {
            for (const section of pageData.sections) {
                if (!section.text) continue;
                // Strip markdown, extract clean narration text
                const clean = section.text
                    .replace(/^#{1,3}\s+/gm, '')       // remove headings markup
                    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
                    .replace(/\*(.+?)\*/g, '$1')         // italic
                    .replace(/^[-*]\s+/gm, '')           // list markers
                    .replace(/\n{2,}/g, '\n')
                    .trim();

                if (clean.length < 20) continue;

                // Take first ~300 chars per section for narration (keep it concise)
                const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
                let narrationText = '';
                for (const s of sentences) {
                    if (narrationText.length + s.length > 350) break;
                    narrationText += s;
                }
                if (narrationText.trim()) {
                    this._narrationQueue.push(narrationText.trim());
                }
            }
        }

        // Start narrating
        this._playNextNarration();
    }

    /**
     * Play the next segment in the narration queue.
     */
    _playNextNarration() {
        if (this._narrationQueue.length === 0) {
            this._isNarrating = false;
            return;
        }

        this._isNarrating = true;
        const text = this._narrationQueue.shift();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 0.7;

        // Pick a warm, clear English voice
        const voices = speechSynthesis.getVoices();
        const preferred = voices.find(
            (v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Samantha'))
        ) || voices.find((v) => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;

        utterance.onend = () => {
            // Small pause between sections for natural pacing
            setTimeout(() => this._playNextNarration(), 600);
        };

        utterance.onerror = () => {
            this._playNextNarration();
        };

        speechSynthesis.speak(utterance);
    }

    /**
     * Stop all narration immediately (e.g., when user starts speaking or switches tabs).
     */
    _stopNarration() {
        this._narrationQueue = [];
        this._isNarrating = false;
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
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
