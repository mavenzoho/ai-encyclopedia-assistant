/**
 * AI Encyclopedia - Main Application Controller
 *
 * Tabbed encyclopedia explorer: click anywhere on content to open a new
 * detailed page in a new tab. Navigate between explored topics with tabs.
 */

import { VoiceManager } from './voice.js';
import { EncyclopediaRenderer } from './renderer.js';

class App {
    constructor() {
        this.sessionId = crypto.randomUUID();
        this.pageCache = {};  // topic -> pageData
        this.tabs = [];       // [{ id, topic, pageData }]
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

        // Create a renderer (it will render into pageContainer)
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
            this.transcriptText.textContent = text;
            this.transcriptBar.classList.add('active');
            if (!partial && text && text.length > 5) {
                this._showLoading();
            }
        };

        this.voiceManager.onOutputTranscription = (text) => {
            this.transcriptText.textContent = text;
            this.transcriptBar.classList.add('active');
        };

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
            try {
                await this.voiceManager.toggle();
                this.micBtn.classList.toggle('listening', this.voiceManager.isListening);
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

        // Wire up renderer click-to-explore: clicking anything opens a new tab
        this.renderer.onExploreClick = (topic) => {
            this._openTopic(topic);
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
     * Open a topic - creates a new tab and generates the page.
     */
    async _openTopic(topic, focus = 'general overview') {
        const cacheKey = `${topic.toLowerCase()}|${focus.toLowerCase()}`;

        // If cached, open it in a new tab instantly
        if (this.pageCache[cacheKey]) {
            this._createTab(topic, this.pageCache[cacheKey]);
            return;
        }

        // Show loading and create a pending tab
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
                this.pageCache[cacheKey] = result;
                this._onPageReceived(result);
            }
        } catch (err) {
            console.error('API request failed:', err);
            this._hideLoading();
            this.transcriptText.textContent = 'Connection error. Please try again.';
        }
    }

    /**
     * Handle a received encyclopedia page - creates a new tab.
     */
    _onPageReceived(pageData) {
        this._hideLoading();
        this.welcomeScreen.classList.add('hidden');
        this._createTab(pageData.topic, pageData);

        this.transcriptText.textContent = pageData.topic;
        this.transcriptBar.classList.add('active');
        setTimeout(() => this.transcriptBar.classList.remove('active'), 2000);
    }

    /**
     * Create a new tab for a topic.
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

        // Add tab data
        this.tabs.push({ id: tabId, topic, pageData });

        // Show the tab bar
        this.tabBar.classList.remove('hidden');
        document.body.classList.add('has-tabs');

        // Create tab button
        const tabBtn = document.createElement('button');
        tabBtn.className = 'tab-btn';
        tabBtn.dataset.tabId = tabId;
        tabBtn.innerHTML = `
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

        // Switch to the new tab
        this._switchToTab(tabId);

        // Scroll tab into view
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

        // Render the page
        this.renderer.renderPage(tab.pageData);

        // Update transcript
        this.transcriptText.textContent = tab.topic;
        this.transcriptBar.classList.add('active');
        setTimeout(() => this.transcriptBar.classList.remove('active'), 1500);
    }

    /**
     * Close a tab.
     */
    _closeTab(tabId) {
        const index = this.tabs.findIndex((t) => t.id === tabId);
        if (index === -1) return;

        // Remove tab data
        this.tabs.splice(index, 1);

        // Remove tab button
        const tabBtn = this.tabList.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabBtn) tabBtn.remove();

        // If we closed the active tab, switch to another
        if (this.activeTabId === tabId) {
            if (this.tabs.length > 0) {
                // Switch to the previous or last tab
                const newIndex = Math.min(index, this.tabs.length - 1);
                this._switchToTab(this.tabs[newIndex].id);
            } else {
                // No tabs left - show welcome screen
                this.activeTabId = null;
                this.pageContainer.classList.add('hidden');
                this.pageContainer.innerHTML = '';
                this.welcomeScreen.classList.remove('hidden');
                this.tabBar.classList.add('hidden');
                document.body.classList.remove('has-tabs');
            }
        }
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

    /**
     * Escape HTML for safe rendering.
     */
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
