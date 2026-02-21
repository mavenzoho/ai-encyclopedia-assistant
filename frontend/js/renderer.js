/**
 * Encyclopedia Page Renderer
 *
 * Transforms JSON encyclopedia data (sections of text + base64 images)
 * into a rich, DK Books-inspired visual layout.
 */

export class EncyclopediaRenderer {
    constructor(container) {
        this.container = container;

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

        // Render each section with alternating layouts
        if (pageData.sections && pageData.sections.length > 0) {
            pageData.sections.forEach((section, index) => {
                const sectionEl = this._renderSection(section, index);
                this.container.appendChild(sectionEl);
            });
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

        // Text content
        if (hasText) {
            const textEl = document.createElement('div');
            textEl.className = 'section-text';
            textEl.innerHTML = this._renderMarkdown(section.text);
            el.appendChild(textEl);
        }

        // Images
        if (hasImages) {
            const imageContainer = document.createElement('div');
            imageContainer.className = section.images.length > 1
                ? 'image-container image-grid'
                : 'image-container image-single';

            section.images.forEach((img) => {
                const imgEl = document.createElement('img');
                imgEl.src = `data:${img.mime_type};base64,${img.data}`;
                imgEl.className = 'encyclopedia-image';
                imgEl.loading = 'lazy';
                imgEl.alt = `Illustration for encyclopedia content`;
                imageContainer.appendChild(imgEl);
            });

            el.appendChild(imageContainer);
        }

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
