/**
 * Encyclopedia Page Renderer
 *
 * Transforms JSON encyclopedia data (sections of text + base64 images)
 * into a rich, visual layout. The entire page is click-to-explore:
 * click any text or image to generate a detailed page about that subject.
 */

export class EncyclopediaRenderer {
    constructor(container) {
        this.container = container;

        // Callback when user clicks content to explore
        this.onExploreClick = null;

        // Callback when user requests video from an image
        this.onVideoRequest = null;

        // Color themes for different topic categories
        this.topicThemes = {
            space:   { primary: '#1b2631', primaryDark: '#0d1317', accent: '#5dade2', bg: '#eaf2f8' },
            nature:  { primary: '#196f3d', primaryDark: '#0e3d22', accent: '#f4d03f', bg: '#eafaf1' },
            animals: { primary: '#0e6655', primaryDark: '#073d33', accent: '#e74c3c', bg: '#e8f6f3' },
            history: { primary: '#7b241c', primaryDark: '#4a1610', accent: '#d4ac0d', bg: '#fdf2e9' },
            science: { primary: '#154360', primaryDark: '#0b2233', accent: '#48c9b0', bg: '#e8f8f5' },
            body:    { primary: '#6c3483', primaryDark: '#3d1e4a', accent: '#f39c12', bg: '#f4ecf7' },
            ocean:   { primary: '#1a5276', primaryDark: '#0e2f44', accent: '#1abc9c', bg: '#ebf5fb' },
            tech:    { primary: '#2c3e50', primaryDark: '#1a252f', accent: '#e74c3c', bg: '#f2f3f4' },
            default: { primary: '#1a5276', primaryDark: '#0e2f44', accent: '#f39c12', bg: '#fdfefe' },
        };

        // Layout patterns to alternate for visual variety
        this.layoutPatterns = [
            'layout-full-width',
            'layout-text-left',
            'layout-text-right',
            'layout-sidebar',
            'layout-text-left',
            'layout-full-width',
        ];
    }

    /**
     * Render a complete encyclopedia page from structured data.
     * @param {Object} pageData - { topic, focus, sections: [{ text, images }] }
     */
    renderPage(pageData) {
        this.container.classList.remove('hidden');
        this.container.innerHTML = '';

        const theme = this._getTheme(pageData.topic);
        this.container.style.setProperty('--primary', theme.primary);
        this.container.style.setProperty('--primary-dark', theme.primaryDark);
        this.container.style.setProperty('--accent', theme.accent);
        this.container.style.setProperty('--page-bg', theme.bg);

        // Title banner
        const banner = document.createElement('div');
        banner.className = 'page-banner';
        banner.innerHTML = `
            <h1 class="page-title">${this._escapeHtml(pageData.topic)}</h1>
            ${pageData.focus && pageData.focus !== 'general overview'
                ? `<p class="page-subtitle">${this._escapeHtml(pageData.focus)}</p>`
                : ''}
        `;
        this.container.appendChild(banner);

        // Accent bar
        const accentBar = document.createElement('div');
        accentBar.className = 'page-accent-bar';
        this.container.appendChild(accentBar);

        // Click hint banner
        const clickHint = document.createElement('div');
        clickHint.className = 'click-hint';
        clickHint.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M2 2l6.5 6.5"/>
            </svg>
            Click any text or image to explore it in detail
        `;
        this.container.appendChild(clickHint);

        // Render each section with alternating layouts
        let relatedTopics = [];
        if (pageData.sections && pageData.sections.length > 0) {
            pageData.sections.forEach((section, index) => {
                // Extract related topics from the last section
                const extracted = this._extractRelatedTopics(section.text);
                if (extracted.topics.length > 0) {
                    relatedTopics = extracted.topics;
                    if (extracted.remainingText.trim().length < 20) {
                        return;
                    }
                    section = { ...section, text: extracted.remainingText };
                }

                const sectionEl = this._renderSection(section, index);
                this.container.appendChild(sectionEl);
            });
        }

        // Render related topics footer
        if (relatedTopics.length > 0) {
            const relatedEl = this._renderRelatedTopics(relatedTopics);
            this.container.appendChild(relatedEl);
        }

        // Scroll to top of new page
        this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Render a single section with text and/or images.
     */
    _renderSection(section, index) {
        const el = document.createElement('div');
        const hasImages = section.images && section.images.length > 0;
        const hasText = section.text && section.text.trim().length > 0;

        // Choose layout based on content and position
        let layout;
        if (index === 0 && hasImages) {
            layout = 'layout-hero';
        } else if (hasImages && hasText) {
            layout = this.layoutPatterns[index % this.layoutPatterns.length];
        } else {
            layout = 'layout-full-width';
        }

        el.className = `encyclopedia-section ${layout}`;
        el.style.animationDelay = `${0.1 + index * 0.1}s`;

        // Text content - entire section is clickable
        if (hasText) {
            const textEl = document.createElement('div');
            textEl.className = 'section-text';
            textEl.innerHTML = this._renderMarkdown(section.text);
            this._makeClickable(textEl);
            el.appendChild(textEl);
        }

        // Images - each image is clickable
        if (hasImages) {
            const imageContainer = document.createElement('div');
            imageContainer.className = section.images.length > 1
                ? 'image-container image-grid'
                : 'image-container image-single';

            section.images.forEach((img) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'image-wrapper clickable-area';

                const imgEl = document.createElement('img');
                imgEl.src = `data:${img.mime_type};base64,${img.data}`;
                imgEl.className = 'encyclopedia-image';
                imgEl.loading = 'lazy';
                imgEl.alt = `Illustration for encyclopedia content`;

                // Clicking an image uses the nearby section heading/text as context
                wrapper.addEventListener('click', (e) => {
                    // Don't trigger explore if user clicked the video button
                    if (e.target.closest('.video-btn')) return;
                    e.stopPropagation();
                    const sectionParent = wrapper.closest('.encyclopedia-section');
                    // Find the first non-generic heading in this section
                    let topic = '';
                    const headings = sectionParent?.querySelectorAll('h1, h2, h3') || [];
                    for (const h of headings) {
                        const t = h.textContent.trim();
                        if (!this._isGenericHeading(t)) { topic = t; break; }
                    }
                    if (!topic) topic = this._extractTopicFromText(section.text);
                    if (topic && this.onExploreClick) {
                        this._showRipple(wrapper, e);
                        this.onExploreClick(topic);
                    }
                });

                wrapper.appendChild(imgEl);

                // Video generation button overlay
                const videoBtn = document.createElement('button');
                videoBtn.className = 'video-btn';
                videoBtn.title = 'Create video from this image';
                videoBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <span>Create Video</span>
                `;
                videoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onVideoRequest) {
                        const sectionParent = wrapper.closest('.encyclopedia-section');
                        let topic = '';
                        const headings = sectionParent?.querySelectorAll('h1, h2, h3') || [];
                        for (const h of headings) {
                            const t = h.textContent.trim();
                            if (!this._isGenericHeading(t)) { topic = t; break; }
                        }
                        if (!topic) topic = this._extractTopicFromText(section.text);
                        this.onVideoRequest(img.data, img.mime_type, topic || 'this image', wrapper);
                    }
                });
                wrapper.appendChild(videoBtn);

                imageContainer.appendChild(wrapper);
            });

            el.appendChild(imageContainer);
        }

        return el;
    }

    /**
     * Generic section headings that should NOT be used as exploration topics.
     * These are structural labels, not meaningful subjects.
     */
    static GENERIC_HEADINGS = new Set([
        'overview', 'introduction', 'key facts', 'deep dive', 'how it works',
        'did you know', 'did you know?', 'fun facts', 'fun fact', 'facts',
        'summary', 'conclusion', 'related topics', 'explore more',
        'what is it', 'what is it?', 'why it matters', 'in detail',
        'quick facts', 'fast facts', 'at a glance', 'the basics',
        'main features', 'key features', 'characteristics', 'description',
        'background', 'history', 'origins', 'timeline', 'gallery',
    ]);

    _isGenericHeading(text) {
        return EncyclopediaRenderer.GENERIC_HEADINGS.has(text.toLowerCase().replace(/[:#?!]/g, '').trim());
    }

    /**
     * Make text elements clickable for exploration.
     * Clicking a heading, paragraph, bold term, or list item triggers exploration.
     */
    _makeClickable(textEl) {
        // Headings are clickable (skip generic section labels)
        textEl.querySelectorAll('h1, h2, h3').forEach((heading) => {
            const topic = heading.textContent.trim();
            if (this._isGenericHeading(topic)) return; // skip generic headings
            heading.classList.add('clickable-area');
            heading.addEventListener('click', (e) => {
                e.stopPropagation();
                if (topic && this.onExploreClick) {
                    this._showRipple(heading, e);
                    this.onExploreClick(topic);
                }
            });
        });

        // Bold terms are clickable
        textEl.querySelectorAll('strong').forEach((strong) => {
            const term = strong.textContent.trim();
            if (term.length > 2 && !/^\d+$/.test(term)) {
                strong.classList.add('clickable-area', 'clickable-term');
                strong.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onExploreClick) {
                        this._showRipple(strong, e);
                        this.onExploreClick(term);
                    }
                });
            }
        });

        // Paragraphs are clickable (use selection or full paragraph topic)
        textEl.querySelectorAll('p').forEach((p) => {
            p.classList.add('clickable-area');
            p.addEventListener('click', (e) => {
                // Don't trigger if user clicked a bold term or heading (already handled)
                if (e.target.closest('strong, h1, h2, h3')) return;
                e.stopPropagation();

                // Check if user selected text
                const selection = window.getSelection();
                const selectedText = selection?.toString().trim();
                if (selectedText && selectedText.length > 2) {
                    if (this.onExploreClick) {
                        this._showRipple(p, e);
                        this.onExploreClick(selectedText);
                    }
                    return;
                }

                // Otherwise use the paragraph's topic (first sentence or closest heading)
                const topic = this._extractTopicFromElement(p);
                if (topic && this.onExploreClick) {
                    this._showRipple(p, e);
                    this.onExploreClick(topic);
                }
            });
        });

        // List items are clickable
        textEl.querySelectorAll('li').forEach((li) => {
            li.classList.add('clickable-area');
            li.addEventListener('click', (e) => {
                if (e.target.closest('strong')) return;
                e.stopPropagation();
                // Extract meaningful topic from list item
                const boldInLi = li.querySelector('strong');
                const topic = boldInLi
                    ? boldInLi.textContent.trim()
                    : this._extractTopicFromText(li.textContent);
                if (topic && this.onExploreClick) {
                    this._showRipple(li, e);
                    this.onExploreClick(topic);
                }
            });
        });
    }

    /**
     * Extract a topic from a paragraph element by finding the nearest heading.
     * Skips generic section headings and falls back to text content.
     */
    _extractTopicFromElement(el) {
        // Walk backwards to find a meaningful (non-generic) heading
        let prev = el.previousElementSibling;
        while (prev) {
            if (/^H[1-3]$/.test(prev.tagName)) {
                const headingText = prev.textContent.trim();
                if (!this._isGenericHeading(headingText)) {
                    return headingText;
                }
            }
            prev = prev.previousElementSibling;
        }
        // Fallback: use first sentence of the paragraph
        return this._extractTopicFromText(el.textContent);
    }

    /**
     * Extract a meaningful topic string from raw text.
     */
    _extractTopicFromText(text) {
        if (!text) return '';
        // Get first meaningful sentence
        const cleaned = text.replace(/^#+\s*/, '').replace(/\*+/g, '').trim();
        const firstSentence = cleaned.split(/[.!?]/)[0].trim();
        // Limit length
        if (firstSentence.length > 60) {
            return firstSentence.substring(0, 60).trim();
        }
        return firstSentence;
    }

    /**
     * Show a ripple/highlight effect on clicked element.
     */
    _showRipple(el, event) {
        el.classList.add('click-flash');
        setTimeout(() => el.classList.remove('click-flash'), 500);
    }

    /**
     * Extract related topics from text content.
     */
    _extractRelatedTopics(text) {
        if (!text) return { topics: [], remainingText: text };

        const relatedMatch = text.match(/##\s*RELATED\s*TOPICS[:\s]*([\s\S]*?)$/i);
        if (!relatedMatch) return { topics: [], remainingText: text };

        const relatedSection = relatedMatch[1];
        const topics = [];

        const lines = relatedSection.split('\n');
        for (const line of lines) {
            const match = line.match(/^[-*]\s+\**([^*\n]+)\**\s*$/);
            if (match) {
                const topic = match[1].trim().replace(/\*+/g, '');
                if (topic.length > 1) {
                    topics.push(topic);
                }
            }
        }

        const remainingText = text.replace(/##\s*RELATED\s*TOPICS[:\s]*[\s\S]*$/i, '').trim();
        return { topics, remainingText };
    }

    /**
     * Render the related topics footer with clickable chips.
     */
    _renderRelatedTopics(topics) {
        const el = document.createElement('div');
        el.className = 'related-topics';
        el.innerHTML = `<h3>Explore Related Topics</h3>`;

        const chipsContainer = document.createElement('div');
        chipsContainer.className = 'related-chips';

        topics.forEach((topic) => {
            const chip = document.createElement('button');
            chip.className = 'related-chip';
            chip.textContent = topic;
            chip.addEventListener('click', () => {
                if (this.onExploreClick) {
                    this.onExploreClick(topic);
                }
            });
            chipsContainer.appendChild(chip);
        });

        el.appendChild(chipsContainer);
        return el;
    }

    /**
     * Basic markdown-to-HTML rendering for encyclopedia content.
     */
    _renderMarkdown(text) {
        if (!text) return '';

        let html = text
            // Escape HTML entities first
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            // Headers
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            // Bold and italic
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // List items
            .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
            .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
            // Wrap consecutive <li> in <ul>
            .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
            // Paragraphs: double newlines
            .replace(/\n\n+/g, '</p><p>')
            // Single newlines within paragraphs
            .replace(/\n/g, '<br>');

        // Wrap in paragraph if not already wrapped
        if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<p>')) {
            html = '<p>' + html + '</p>';
        }

        // Clean up empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');
        html = html.replace(/<p>\s*(<h[1-3]>)/g, '$1');
        html = html.replace(/(<\/h[1-3]>)\s*<\/p>/g, '$1');
        html = html.replace(/<p>\s*(<ul>)/g, '$1');
        html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');

        return html;
    }

    /**
     * Get color theme based on topic keywords.
     */
    _getTheme(topic) {
        const lower = (topic || '').toLowerCase();

        if (/space|planet|star|galaxy|solar|moon|astro|universe|cosmos|nebula/i.test(lower)) {
            return this.topicThemes.space;
        }
        if (/animal|dinosaur|bird|fish|insect|mammal|reptile|wildlife|species/i.test(lower)) {
            return this.topicThemes.animals;
        }
        if (/plant|tree|forest|ocean|volcano|earth|mountain|river|nature|climate|weather/i.test(lower)) {
            return this.topicThemes.nature;
        }
        if (/history|ancient|war|civilization|empire|pharaoh|medieval|roman|greek|dynasty/i.test(lower)) {
            return this.topicThemes.history;
        }
        if (/body|heart|brain|cell|dna|organ|muscle|bone|blood|anatomy/i.test(lower)) {
            return this.topicThemes.body;
        }
        if (/science|atom|chemistry|physics|element|molecule|quantum|energy|force/i.test(lower)) {
            return this.topicThemes.science;
        }
        if (/sea|ocean|marine|coral|whale|shark|submarine|deep|underwater/i.test(lower)) {
            return this.topicThemes.ocean;
        }
        if (/tech|computer|robot|ai|machine|digital|internet|code|software/i.test(lower)) {
            return this.topicThemes.tech;
        }

        return this.topicThemes.default;
    }

    /**
     * Escape HTML special characters to prevent XSS.
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}
