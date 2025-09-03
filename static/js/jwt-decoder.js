/**
 * JWT Decoder Tool - JavaScript Logic
 * Features: JWT parsing, validation, syntax highlighting, history integration
 */

class JwtDecoder {
    constructor() {
        this.toolName = 'jwt-decoder';
        this.currentJWT = null;
        this.historyEnabled = localStorage.getItem(`${this.toolName}-historyEnabled`) !== 'false';
        this.fontSize = parseInt(localStorage.getItem(`${this.toolName}-fontSize`) || '13');
        this.initializeElements();
        this.attachEventListeners();
        this.loadHistory();
        this.updateTokenInfo();
        this.applyFontSize();
    }

    initializeElements() {
        this.elements = {
            jwtInput: document.getElementById('jwtInput'),
            decodedContent: document.getElementById('decodedContent'),
            statusText: document.getElementById('statusText'),
            jwtStatus: document.getElementById('jwtStatus'),
            jwtAlgorithm: document.getElementById('jwtAlgorithm'),
            tokenInfo: document.getElementById('tokenInfo'),
            historyBtn: document.getElementById('historyBtn'),
            historyPopup: document.getElementById('historyPopup'),
            historyList: document.getElementById('historyList'),
            globalHistoryList: document.getElementById('globalHistoryList'),
            globalHistoryBtn: document.getElementById('globalHistoryBtn'),
            globalHistoryPopup: document.getElementById('globalHistoryPopup'),
            fontIncreaseBtn: document.getElementById('fontIncreaseBtn'),
            fontDecreaseBtn: document.getElementById('fontDecreaseBtn')
        };
    }

    attachEventListeners() {
        // History button
        this.elements.historyBtn.addEventListener('click', () => this.toggleHistory());
        
        // Global history button
        this.elements.globalHistoryBtn.addEventListener('click', () => this.toggleGlobalHistory());
        
        // History tabs
        document.querySelectorAll('.history-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchHistoryTab(e));
        });
        
        // Outside click handler
        document.addEventListener('click', (e) => this.handleOutsideClick(e));
        
        // Font size controls
        this.elements.fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
        this.elements.fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());
        
        // Auto-decode on input change
        this.elements.jwtInput.addEventListener('input', () => {
            this.updateTokenInfo();
            clearTimeout(this.decodeTimer);
            this.decodeTimer = setTimeout(() => {
                if (this.elements.jwtInput.value.trim() && this.isValidJWT(this.elements.jwtInput.value.trim())) {
                    this.decodeJWT();
                } else if (this.elements.jwtInput.value.trim()) {
                    this.elements.jwtStatus.textContent = 'INVALID';
                    this.elements.jwtStatus.className = 'jwt-indicator invalid';
                } else {
                    this.elements.jwtStatus.textContent = 'WAITING';
                    this.elements.jwtStatus.className = 'jwt-indicator';
                }
            }, 500);
        });
    }

    handleOutsideClick(event) {
        if (!this.elements.historyPopup.contains(event.target) && 
            !this.elements.historyBtn.contains(event.target)) {
            this.elements.historyPopup.classList.remove('show');
        }
        
        // Also handle global history popup
        if (!this.elements.globalHistoryPopup.contains(event.target) && 
            !this.elements.globalHistoryBtn.contains(event.target)) {
            this.elements.globalHistoryPopup.classList.remove('show');
        }
    }

    isValidJWT(token) {
        if (!token || typeof token !== 'string') return false;
        const parts = token.split('.');
        return parts.length === 3;
    }

    base64UrlDecode(str) {
        // Convert base64url to base64
        str = str.replace(/-/g, '+').replace(/_/g, '/');

        // Add proper padding
        const pad = str.length % 4;
        if (pad) {
            if (pad === 1) {
                throw new Error('Invalid base64url string');
            }
            str += new Array(5 - pad).join('=');
        }

        try {
            return atob(str);
        } catch (e) {
            throw new Error('Invalid base64 encoding');
        }
    }

    parseJWT(token) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format. Token must have 3 parts separated by dots.');
        }

        try {
            const header = JSON.parse(this.base64UrlDecode(parts[0]));
            const payload = JSON.parse(this.base64UrlDecode(parts[1]));
            const signature = parts[2];

            return {
                header,
                payload,
                signature,
                parts: {
                    header: parts[0],
                    payload: parts[1],
                    signature: parts[2]
                }
            };
        } catch (e) {
            throw new Error('Failed to decode JWT: ' + e.message);
        }
    }

    syntaxHighlightJSON(json) {
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\\"])*\"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            let cls = 'json-number';
            if (/^\"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return 'Not set';
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const isExpired = date < now;

        const formatted = date.toLocaleString() + ' (' + date.toISOString() + ')';
        return {
            formatted,
            isExpired
        };
    }

    async decodeJWT() {
        const input = this.elements.jwtInput.value.trim();
        const decodedContent = this.elements.decodedContent;
        const statusText = this.elements.statusText;
        const jwtStatus = this.elements.jwtStatus;
        const jwtAlgorithm = this.elements.jwtAlgorithm;

        if (!input) {
            statusText.textContent = 'Please enter a JWT token';
            statusText.style.color = '#ff8800';
            return;
        }

        try {
            const decoded = this.parseJWT(input);
            this.currentJWT = decoded;

            // Save to history
            await this.saveToHistory(input);

            // Update status indicators
            jwtStatus.textContent = 'VALID';
            jwtStatus.className = 'jwt-indicator valid';

            const algorithm = decoded.header.alg || 'Unknown';
            jwtAlgorithm.textContent = algorithm;
            jwtAlgorithm.style.background = '#388e3c';
            jwtAlgorithm.style.color = 'white';
            jwtAlgorithm.style.padding = '2px 6px';
            jwtAlgorithm.style.borderRadius = '3px';
            jwtAlgorithm.style.fontSize = '10px';

            // Create JWT info section
            let infoSection = '<div class="jwt-info">';

            // Add timestamp info if available
            if (decoded.payload.iat) {
                const iat = this.formatTimestamp(decoded.payload.iat);
                infoSection += `<div class="info-row"><span class="info-label">Issued At:</span><span class="info-value">${iat.formatted}</span></div>`;
            }

            if (decoded.payload.exp) {
                const exp = this.formatTimestamp(decoded.payload.exp);
                const expClass = exp.isExpired ? 'expired' : 'valid-time';
                infoSection += `<div class="info-row"><span class="info-label">Expires At:</span><span class="info-value ${expClass}">${exp.formatted}</span></div>`;
            }

            if (decoded.payload.nbf) {
                const nbf = this.formatTimestamp(decoded.payload.nbf);
                infoSection += `<div class="info-row"><span class="info-label">Not Before:</span><span class="info-value">${nbf.formatted}</span></div>`;
            }

            if (decoded.payload.iss) {
                infoSection += `<div class="info-row"><span class="info-label">Issuer:</span><span class="info-value">${decoded.payload.iss}</span></div>`;
            }

            if (decoded.payload.aud) {
                const audience = Array.isArray(decoded.payload.aud) ? decoded.payload.aud.join(', ') : decoded.payload.aud;
                infoSection += `<div class="info-row"><span class="info-label">Audience:</span><span class="info-value">${audience}</span></div>`;
            }

            infoSection += '</div>';

            // Create JWT parts visualization
            const partsSection = `
                <div class="jwt-parts">
                    <div class="jwt-part jwt-header-part">Header: ${decoded.parts.header}</div>
                    <div class="jwt-part jwt-payload-part">Payload: ${decoded.parts.payload}</div>
                    <div class="jwt-part jwt-signature-part">Signature: ${decoded.parts.signature}</div>
                </div>
            `;

            // Create decoded sections
            const headerJSON = JSON.stringify(decoded.header, null, 2);
            const payloadJSON = JSON.stringify(decoded.payload, null, 2);

            decodedContent.innerHTML = `
                ${infoSection}
                ${partsSection}
                <div class="jwt-section">
                    <div class="section-header">
                        Header
                        <button class="copy-section-btn" onclick="window.jwtDecoder?.copySection('header')">Copy</button>
                    </div>
                    <div class="section-content">${this.syntaxHighlightJSON(headerJSON)}</div>
                </div>
                <div class="jwt-section">
                    <div class="section-header">
                        Payload
                        <button class="copy-section-btn" onclick="window.jwtDecoder?.copySection('payload')">Copy</button>
                    </div>
                    <div class="section-content">${this.syntaxHighlightJSON(payloadJSON)}</div>
                </div>
                <div class="jwt-section">
                    <div class="section-header">
                        Signature (Base64URL)
                        <button class="copy-section-btn" onclick="window.jwtDecoder?.copySection('signature')">Copy</button>
                    </div>
                    <div class="section-content">${decoded.signature}</div>
                </div>
            `;

            statusText.textContent = 'JWT decoded successfully';
            statusText.style.color = '#008000';
            
            // Apply font size to newly created content
            this.applyFontSize();

        } catch (error) {
            this.currentJWT = null;
            jwtStatus.textContent = 'INVALID';
            jwtStatus.className = 'jwt-indicator invalid';
            jwtAlgorithm.textContent = '';
            jwtAlgorithm.style.background = '';
            jwtAlgorithm.style.color = '';
            jwtAlgorithm.style.padding = '';

            decodedContent.innerHTML = `<div class="error-display">Error: ${error.message}</div>`;
            statusText.textContent = 'JWT decoding error';
            statusText.style.color = '#cc0000';
        }
    }

    copySection(section) {
        if (!this.currentJWT) return;

        let content = '';
        if (section === 'header') {
            content = JSON.stringify(this.currentJWT.header, null, 2);
        } else if (section === 'payload') {
            content = JSON.stringify(this.currentJWT.payload, null, 2);
        } else if (section === 'signature') {
            content = this.currentJWT.signature;
        }

        navigator.clipboard.writeText(content).then(() => {
            this.showCopyFeedback(`${section.charAt(0).toUpperCase() + section.slice(1)} copied to clipboard`);
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = content;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showCopyFeedback(`${section.charAt(0).toUpperCase() + section.slice(1)} copied to clipboard`);
        });
    }

    copyDecoded() {
        if (!this.currentJWT) return;

        const content = `Header:\n${JSON.stringify(this.currentJWT.header, null, 2)}\n\nPayload:\n${JSON.stringify(this.currentJWT.payload, null, 2)}\n\nSignature:\n${this.currentJWT.signature}`;

        navigator.clipboard.writeText(content).then(() => {
            this.showCopyFeedback('Full decoded JWT copied to clipboard');
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = content;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showCopyFeedback('Full decoded JWT copied to clipboard');
        });
    }

    showCopyFeedback(message) {
        const statusText = this.elements.statusText;
        const originalText = statusText.textContent;
        const originalColor = statusText.style.color;

        statusText.textContent = message;
        statusText.style.color = '#008000';

        setTimeout(() => {
            statusText.textContent = originalText;
            statusText.style.color = originalColor;
        }, 2000);
    }

    clearAll() {
        this.elements.jwtInput.value = '';
        this.elements.decodedContent.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #999; font-style: italic;">
                Enter a JWT token on the left to see its decoded content
            </div>
        `;
        this.elements.jwtStatus.textContent = 'WAITING';
        this.elements.jwtStatus.className = 'jwt-indicator';
        this.elements.jwtAlgorithm.textContent = '';
        this.elements.jwtAlgorithm.style.background = '';
        this.elements.statusText.textContent = 'Ready - Paste a JWT token to decode';
        this.elements.statusText.style.color = '#666';
        this.currentJWT = null;
        this.updateTokenInfo();
    }

    loadSampleJWT() {
        const sampleJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyNDI2MjIsImF1ZCI6InNhbXBsZS1hdWRpZW5jZSIsImlzcyI6InNhbXBsZS1pc3N1ZXIifQ.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ';
        this.elements.jwtInput.value = sampleJWT;
        this.updateTokenInfo();
        this.decodeJWT();
    }

    updateTokenInfo() {
        const input = this.elements.jwtInput.value;
        const parts = input.split('.');
        this.elements.tokenInfo.textContent = `Token length: ${input.length} | Parts: ${parts.length}`;
    }

    // History functions
    async saveToHistory(jwtToken) {
        if (!this.historyEnabled) return;
        
        try {
            const response = await fetch('/api/history/jwt-decoder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: jwtToken,
                    operation: 'decode'
                })
            });
            
            if (!response.ok) {
                console.error('Failed to save to history');
            }
        } catch (error) {
            console.error('Error saving to history:', error);
        }
    }

    async loadHistory() {
        try {
            const response = await fetch(`/api/history/${this.toolName}?limit=20`);
            const result = await response.json();
            
            this.displayHistory(result.history || []);
        } catch (error) {
            console.error('Error loading history:', error);
            this.elements.historyList.innerHTML = '<div class="history-item">Failed to load history</div>';
        }
    }

    async loadGlobalHistory() {
        try {
            const response = await fetch('/api/global-history?limit=20');
            const result = await response.json();
            
            this.displayGlobalHistory(result.history || []);
        } catch (error) {
            console.error('Error loading global history:', error);
            this.elements.globalHistoryList.innerHTML = '<div class="history-item">Failed to load global history</div>';
        }
    }

    displayHistory(history) {
        if (history.length === 0) {
            this.elements.historyList.innerHTML = '<div class="history-item">No history available</div>';
            return;
        }

        const historyHtml = history.map(item => {
            const preview = item.preview || 'No preview available';
            const truncatedPreview = preview.length > 50 ? preview.substring(0, 50) + '...' : preview;
            
            return `
                <div class="history-item" data-id="${item.id}">
                    <div class="history-date">${item.formatted_date || new Date(item.timestamp).toLocaleString()}</div>
                    <div class="history-preview">${truncatedPreview}</div>
                </div>
            `;
        }).join('');

        this.elements.historyList.innerHTML = historyHtml;

        // Add click event listeners
        this.elements.historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                if (item.dataset.id) {
                    this.loadHistoryEntry(item.dataset.id);
                }
            });
        });
    }

    displayGlobalHistory(history) {
        const globalHistoryList = document.getElementById('globalHistoryList');
        if (history.length === 0) {
            globalHistoryList.innerHTML = '<div class="global-history-item">No global history available</div>';
            return;
        }

        const historyHtml = history.map(item => {
            const toolName = item.tool || 'Unknown';
            const preview = item.preview || (item.data ? JSON.stringify(item.data).substring(0, 50) + '...' : 'No preview');
            
            return `
                <div class="global-history-item" data-id="${item.id}" data-tool="${item.tool}">
                    <div class="history-date">${toolName} - ${new Date(item.timestamp).toLocaleString()}</div>
                    <div class="history-preview">${preview}</div>
                </div>
            `;
        }).join('');

        globalHistoryList.innerHTML = historyHtml;

        // Add click event listeners for global history
        globalHistoryList.querySelectorAll('.global-history-item').forEach(item => {
            item.addEventListener('click', () => {
                if (item.dataset.tool === this.toolName && item.dataset.id) {
                    this.loadHistoryEntry(item.dataset.id);
                    this.toggleGlobalHistory(); // Close popup after loading
                }
            });
        });
    }

    async loadHistoryEntry(entryId) {
        try {
            const response = await fetch(`/api/history/${this.toolName}/${entryId}`);
            const entry = await response.json();
            
            if (entry.data) {
                this.elements.jwtInput.value = entry.data;
                this.updateTokenInfo();
                this.decodeJWT();
                this.toggleHistory(); // Close history popup
            }
        } catch (error) {
            console.error('Error loading history entry:', error);
        }
    }

    toggleHistory() {
        this.elements.historyPopup.classList.toggle('show');
        if (this.elements.historyPopup.classList.contains('show')) {
            this.loadHistory(); // Refresh when opening
        }
    }

    toggleGlobalHistory() {
        this.elements.globalHistoryPopup.classList.toggle('show');
        if (this.elements.globalHistoryPopup.classList.contains('show')) {
            this.loadGlobalHistory(); // Refresh when opening
        }
    }

    switchHistoryTab(event) {
        const tabName = event.target.dataset.tab;
        
        // Update tab buttons
        document.querySelectorAll('.history-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Update tab content
        const historyTab = document.getElementById('historyTab');
        const globalTab = document.getElementById('globalTab');
        
        if (tabName === 'history') {
            historyTab.classList.add('active');
            globalTab.classList.remove('active');
            this.loadHistory();
        } else if (tabName === 'global') {
            historyTab.classList.remove('active');
            globalTab.classList.add('active');
            this.loadGlobalHistory();
        }
    }
    
    // Font size methods
    increaseFontSize() {
        if (this.fontSize < 24) {
            this.fontSize += 1;
            this.applyFontSize();
            this.saveFontSize();
        }
    }
    
    decreaseFontSize() {
        if (this.fontSize > 8) {
            this.fontSize -= 1;
            this.applyFontSize();
            this.saveFontSize();
        }
    }
    
    applyFontSize() {
        this.elements.jwtInput.style.fontSize = `${this.fontSize}px`;
        
        // Apply font size to all section content areas
        const sectionContents = document.querySelectorAll('.section-content');
        sectionContents.forEach(section => {
            section.style.fontSize = `${this.fontSize}px`;
        });
    }
    
    saveFontSize() {
        localStorage.setItem(`${this.toolName}-fontSize`, this.fontSize.toString());
    }
}

// Global functions for onclick handlers
function decodeJWT() {
    window.jwtDecoder?.decodeJWT();
}

function clearAll() {
    window.jwtDecoder?.clearAll();
}

function loadSampleJWT() {
    window.jwtDecoder?.loadSampleJWT();
}

function copyDecoded() {
    window.jwtDecoder?.copyDecoded();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.jwtDecoder = new JwtDecoder();
});