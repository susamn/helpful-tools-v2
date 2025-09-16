/**
 * Document Query Suggestions Library
 * Main entry point and convenience functions
 */

// Version information
const VERSION = '1.0.0';

/**
 * Main library namespace
 */
const DocumentQuerySuggestions = {
    VERSION,

    // Core classes
    DocumentQuerySuggestionEngine,
    DocumentCache,

    // Base classes
    DocumentParser,
    QueryEvaluator,

    // Parsers
    JSONDocumentParser,
    YAMLDocumentParser,
    // XMLDocumentParser, // Would be added when implemented

    // Evaluators
    JSONPathEvaluator,
    YQEvaluator,
    // XPathEvaluator, // Would be added when implemented

    // Adapters
    AutocompleteAdapter,

    /**
     * Convenience factory functions
     */

    /**
     * Create a JSON + JSONPath suggestion engine
     */
    createJsonEngine(options = {}) {
        return new DocumentQuerySuggestionEngine('json', 'jsonpath', options);
    },

    /**
     * Create a YAML + yq suggestion engine
     */
    createYamlEngine(options = {}) {
        return new DocumentQuerySuggestionEngine('yaml', 'yq', options);
    },

    /**
     * Create an autocomplete adapter for an input element
     */
    createAutocomplete(inputElement, documentType, queryLanguage, options = {}) {
        return new AutocompleteAdapter(inputElement, {
            documentType,
            queryLanguage,
            ...options
        });
    },

    /**
     * Quick setup for JSON autocomplete
     */
    setupJsonAutocomplete(inputElement, documentContent, options = {}) {
        const adapter = new AutocompleteAdapter(inputElement, {
            documentType: 'json',
            queryLanguage: 'jsonpath',
            ...options
        });

        if (documentContent) {
            adapter.setDocument(documentContent);
        }

        return adapter;
    },

    /**
     * Quick setup for YAML autocomplete
     */
    setupYamlAutocomplete(inputElement, documentContent, options = {}) {
        const adapter = new AutocompleteAdapter(inputElement, {
            documentType: 'yaml',
            queryLanguage: 'yq',
            ...options
        });

        if (documentContent) {
            adapter.setDocument(documentContent);
        }

        return adapter;
    },

    /**
     * Utility functions
     */

    /**
     * Detect document type from content
     */
    detectDocumentType(content) {
        content = content.trim();

        // Try JSON first
        try {
            JSON.parse(content);
            return 'json';
        } catch (e) {
            // Check for JSONL
            const lines = content.split('\n').filter(l => l.trim());
            if (lines.length > 1) {
                let validJsonLines = 0;
                for (let i = 0; i < Math.min(3, lines.length); i++) {
                    try {
                        JSON.parse(lines[i].trim());
                        validJsonLines++;
                    } catch (e) {
                        break;
                    }
                }
                if (validJsonLines > 1) {
                    return 'json'; // JSONL is handled by JSON parser
                }
            }
        }

        // Check for XML
        if (content.startsWith('<') && content.includes('>')) {
            return 'xml';
        }

        // Default to YAML for everything else
        return 'yaml';
    },

    /**
     * Get appropriate query language for document type
     */
    getDefaultQueryLanguage(documentType) {
        const mapping = {
            'json': 'jsonpath',
            'yaml': 'yq',
            'yml': 'yq',
            'xml': 'xpath'
        };
        return mapping[documentType.toLowerCase()] || 'jsonpath';
    },

    /**
     * Auto-setup autocomplete with detection
     */
    autoSetupAutocomplete(inputElement, documentContent, options = {}) {
        const documentType = this.detectDocumentType(documentContent);
        const queryLanguage = this.getDefaultQueryLanguage(documentType);

        const adapter = new AutocompleteAdapter(inputElement, {
            documentType,
            queryLanguage,
            ...options
        });

        adapter.setDocument(documentContent);
        return adapter;
    },

    /**
     * Get supported formats
     */
    getSupportedFormats() {
        return {
            documents: ['json', 'yaml', 'xml'],
            queries: ['jsonpath', 'yq', 'xpath'],
            combinations: [
                { document: 'json', query: 'jsonpath' },
                { document: 'yaml', query: 'yq' },
                { document: 'xml', query: 'xpath' }
            ]
        };
    },

    /**
     * Validate document and query combination
     */
    isValidCombination(documentType, queryLanguage) {
        const valid = {
            'json': ['jsonpath'],
            'yaml': ['yq'],
            'xml': ['xpath']
        };
        return valid[documentType]?.includes(queryLanguage) || false;
    },

    /**
     * Get library information
     */
    getInfo() {
        return {
            name: 'Document Query Suggestions',
            version: VERSION,
            description: 'Generic autocomplete library for structured documents',
            author: 'Generated with Claude Code',
            supportedFormats: this.getSupportedFormats(),
            features: [
                'Multi-format document parsing',
                'Contextual query suggestions',
                'Union query support',
                'Lightweight caching',
                'Keyboard navigation',
                'Extensible architecture'
            ]
        };
    }
};

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    // CommonJS
    module.exports = DocumentQuerySuggestions;
} else if (typeof define === 'function' && define.amd) {
    // AMD
    define([], function() {
        return DocumentQuerySuggestions;
    });
} else if (typeof window !== 'undefined') {
    // Browser global
    window.DocumentQuerySuggestions = DocumentQuerySuggestions;

    // Also export individual classes to global scope for convenience
    Object.assign(window, {
        DocumentQuerySuggestionEngine,
        DocumentCache,
        DocumentParser,
        QueryEvaluator,
        JSONDocumentParser,
        YAMLDocumentParser,
        JSONPathEvaluator,
        YQEvaluator,
        AutocompleteAdapter
    });
}

// Auto-initialize if in browser and DOM is ready
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Add global CSS if not already present
    if (!document.getElementById('dqs-default-styles')) {
        const style = document.createElement('style');
        style.id = 'dqs-default-styles';
        style.textContent = `
            /* Default Document Query Suggestions Styles */
            .dqs-dropdown {
                background: white;
                border: 1px solid #ccc;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                max-height: 200px;
                overflow-y: auto;
                font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
                font-size: 12px;
                z-index: 1000;
            }

            .dqs-item {
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #f0f0f0;
                position: relative;
            }

            .dqs-item:last-child {
                border-bottom: none;
            }

            .dqs-item:hover {
                background: #f0f8ff;
            }

            .dqs-item.selected {
                background: #007acc;
                color: white;
            }

            .dqs-suggestion-content {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .dqs-suggestion-text {
                font-weight: 600;
            }

            .dqs-suggestion-description {
                font-size: 11px;
                opacity: 0.8;
            }

            .dqs-suggestion-value {
                font-size: 10px;
                font-style: italic;
                opacity: 0.7;
            }

            .dqs-suggestion-type {
                position: absolute;
                right: 8px;
                top: 8px;
                background: rgba(0,0,0,0.1);
                padding: 2px 6px;
                border-radius: 2px;
                font-size: 9px;
                text-transform: uppercase;
            }

            .dqs-item.selected .dqs-suggestion-type {
                background: rgba(255,255,255,0.2);
            }

            /* Type-specific colors */
            .dqs-type-property .dqs-suggestion-text { color: #0066cc; }
            .dqs-type-array_element .dqs-suggestion-text { color: #cc6600; }
            .dqs-type-function .dqs-suggestion-text { color: #6600cc; }
            .dqs-type-filter .dqs-suggestion-text { color: #cc0066; }
        `;
        document.head.appendChild(style);
    }

    console.log('📚 Document Query Suggestions Library loaded', DocumentQuerySuggestions.getInfo());
}