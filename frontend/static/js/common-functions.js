/**
 * Common Functions for Helpful Tools v2
 * Shared utilities used across multiple tools
 */

/**
 * Get consistent color for a tool based on its name
 * @param {string} toolName - The name of the tool
 * @returns {string} - Hex color code for the tool
 */
function getToolColor(toolName) {
    const colors = {
        // Core tools with unified color scheme
        'json-formatter': '#2196F3',           // Blue
        'json-yaml-xml-converter': '#4CAF50',  // Green  
        'regex-tester': '#9C27B0',             // Purple
        'text-diff': '#FF9800',                // Orange
        'scientific-calculator': '#4a90e2',    // Light Blue
        'jwt-decoder': '#795548',              // Brown
        'cron-parser': '#F44336',              // Red
        'base64-encoder-decoder': '#FF9800',   // Orange
        'url-encoder-decoder': '#9C27B0',      // Purple
        'hash-generator': '#F44336',           // Red
        'qr-code-generator': '#607D8B',        // Blue Grey
        
        // Additional tools for future compatibility
        'password-generator': '#9E9E9E',       // Grey
        'uuid-generator': '#795548',           // Brown
        'color-picker': '#E91E63',             // Pink
        'markdown-preview': '#673AB7',         // Deep Purple
        'xml-formatter': '#8BC34A',            // Light Green
        'csv-formatter': '#00BCD4',            // Cyan
        'minify-js': '#FFC107',                // Amber
        'minify-css': '#03A9F4',               // Light Blue
    };
    
    // Return specific color or default grey
    return colors[toolName] || '#757575';
}

/**
 * Format timestamp for display in history components
 * @param {string|Date} timestamp - The timestamp to format
 * @returns {string} - Formatted timestamp string
 */
function formatHistoryTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) {
        return date.toLocaleTimeString();
    } else if (diffDays <= 7) {
        return date.toLocaleDateString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString();
    }
}

/**
 * Escape HTML characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - HTML-escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Truncate text to a specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} - Truncated text with ellipsis if needed
 */
function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - Success status
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        // Fallback for older browsers
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        } catch (fallbackErr) {
            console.error('Failed to copy text: ', fallbackErr);
            return false;
        }
    }
}

/**
 * Show a temporary status message
 * @param {string} message - Message to display
 * @param {string} type - Message type ('success', 'error', 'info')
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showStatusMessage(message, type = 'info', duration = 3000) {
    // Remove existing status messages
    const existing = document.querySelectorAll('.common-status-message');
    existing.forEach(el => el.remove());
    
    // Create status message element
    const statusEl = document.createElement('div');
    statusEl.className = `common-status-message common-status-${type}`;
    statusEl.textContent = message;
    statusEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#2196F3'};
        color: white;
        border-radius: 4px;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        animation: slideInRight 0.3s ease-out;
    `;
    
    // Add animation styles if not already added
    if (!document.querySelector('#common-status-styles')) {
        const styles = document.createElement('style');
        styles.id = 'common-status-styles';
        styles.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(statusEl);
    
    // Auto-remove after duration
    setTimeout(() => {
        statusEl.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => statusEl.remove(), 300);
    }, duration);
}

/**
 * Debounce function to limit how often a function can be called
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export for module environments (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getToolColor,
        formatHistoryTimestamp,
        escapeHtml,
        truncateText,
        copyToClipboard,
        showStatusMessage,
        debounce
    };
}