/**
 * Generic Document Query Suggestion Engine
 * Supports JSON, YAML, XML with their respective query languages
 */

class DocumentQuerySuggestionEngine {
    constructor(documentType, queryLanguage, options = {}) {
        this.documentType = documentType.toLowerCase();
        this.queryLanguage = queryLanguage.toLowerCase();
        this.options = {
            maxCacheSize: options.maxCacheSize || 10,
            maxDepth: options.maxDepth || 5,
            debounceMs: options.debounceMs || 1000,
            ...options
        };

        // Initialize components
        this.parser = this.createParser(this.documentType);
        this.evaluator = this.createEvaluator(this.queryLanguage);
        this.cache = new DocumentCache(this.options.maxCacheSize);

        // State management
        this.currentDocument = null;
        this.availablePaths = [];
        this.isInitialized = false;
    }

    /**
     * Factory method to create document parser
     */
    createParser(documentType) {
        const parsers = {
            'json': () => new JSONDocumentParser(),
            'yaml': () => new YAMLDocumentParser(),
            'yml': () => new YAMLDocumentParser(),
            'xml': () => new XMLDocumentParser()
        };

        const parserFactory = parsers[documentType];
        if (!parserFactory) {
            throw new Error(`Unsupported document type: ${documentType}`);
        }

        return parserFactory();
    }

    /**
     * Factory method to create query evaluator
     */
    createEvaluator(queryLanguage) {
        const evaluators = {
            'jsonpath': () => new JSONPathEvaluator(),
            'xpath': () => new XPathEvaluator(),
            'yq': () => new YQEvaluator(),
            'jq': () => new JQEvaluator(),
            'css': () => new CSSEvaluator() // For XML/HTML
        };

        const evaluatorFactory = evaluators[queryLanguage];
        if (!evaluatorFactory) {
            throw new Error(`Unsupported query language: ${queryLanguage}`);
        }

        return evaluatorFactory();
    }

    /**
     * Initialize engine with document content
     */
    async initialize(documentContent) {
        try {
            // Check cache first
            const cacheKey = this.generateCacheKey(documentContent);
            let parsedDocument = this.cache.get(cacheKey);

            if (!parsedDocument) {
                // Parse document
                parsedDocument = await this.parser.parse(documentContent);
                this.cache.set(cacheKey, parsedDocument);
            }

            this.currentDocument = parsedDocument;

            // Extract available paths
            this.availablePaths = await this.parser.extractPaths(parsedDocument, this.options.maxDepth);

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize suggestion engine:', error);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Get contextual suggestions for the current query input
     */
    async getSuggestions(queryInput, cursorPosition) {
        if (!this.isInitialized || !this.currentDocument) {
            return [];
        }

        try {
            // Parse query context
            const context = this.parseQueryContext(queryInput, cursorPosition);

            // Get suggestions based on context
            const suggestions = await this.generateContextualSuggestions(context);

            return suggestions.map(suggestion => ({
                text: suggestion.text,
                displayText: suggestion.displayText || suggestion.text,
                type: suggestion.type || 'property',
                description: suggestion.description,
                replaceStart: suggestion.replaceStart ?? context.replaceStart,
                replaceEnd: suggestion.replaceEnd ?? context.replaceEnd,
                insertText: suggestion.insertText || suggestion.text
            }));
        } catch (error) {
            console.error('Error generating suggestions:', error);
            return [];
        }
    }

    /**
     * Parse the current query context for suggestions
     */
    parseQueryContext(queryInput, cursorPosition = null) {
        const pos = cursorPosition ?? queryInput.length;

        // Handle union expressions (comma-separated)
        const beforeCursor = queryInput.substring(0, pos);
        const afterCursor = queryInput.substring(pos);

        // Find current expression boundaries
        const lastCommaIndex = beforeCursor.lastIndexOf(',');
        const nextCommaIndex = afterCursor.indexOf(',');

        let expressionStart = lastCommaIndex >= 0 ? lastCommaIndex + 1 : 0;
        const expressionEnd = nextCommaIndex >= 0 ? pos + nextCommaIndex : queryInput.length;

        // Skip whitespace
        while (expressionStart < queryInput.length && /\s/.test(queryInput[expressionStart])) {
            expressionStart++;
        }

        const currentExpression = queryInput.substring(expressionStart, expressionEnd).trim();

        return {
            fullQuery: queryInput,
            currentExpression,
            cursorPosition: pos,
            expressionStart,
            expressionEnd,
            replaceStart: expressionStart,
            replaceEnd: expressionEnd,
            beforeExpression: queryInput.substring(0, expressionStart),
            afterExpression: queryInput.substring(expressionEnd),
            toolName: this.options.toolName // Pass toolName for data history suggestions
        };
    }

    /**
     * Generate contextual suggestions based on query context
     */
    async generateContextualSuggestions(context) {
        const { currentExpression } = context;

        if (!currentExpression) {
            return this.getRootSuggestions();
        }

        // Delegate to query language specific evaluator
        return await this.evaluator.getSuggestions(
            this.currentDocument,
            currentExpression,
            context,
            this.availablePaths
        );
    }

    /**
     * Get root-level suggestions
     */
    getRootSuggestions() {
        if (!this.currentDocument) return [];

        return this.evaluator.getRootSuggestions(this.currentDocument);
    }

    /**
     * Validate a complete query
     */
    async validateQuery(query) {
        if (!this.isInitialized) return { valid: false, error: 'Engine not initialized' };

        try {
            await this.evaluator.evaluate(this.currentDocument, query);
            return { valid: true };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Execute a query and return results
     */
    async executeQuery(query) {
        if (!this.isInitialized) {
            throw new Error('Engine not initialized');
        }

        return await this.evaluator.evaluate(this.currentDocument, query);
    }

    /**
     * Generate cache key for document content
     */
    generateCacheKey(content) {
        // Simple hash function for caching
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `${this.documentType}_${this.queryLanguage}_${hash}`;
    }

    /**
     * Clear cache and reset state
     */
    reset() {
        this.cache.clear();
        this.currentDocument = null;
        this.availablePaths = [];
        this.isInitialized = false;
    }

    /**
     * Get engine information
     */
    getInfo() {
        return {
            documentType: this.documentType,
            queryLanguage: this.queryLanguage,
            isInitialized: this.isInitialized,
            cacheSize: this.cache.size(),
            availablePathsCount: this.availablePaths.length,
            supportedFeatures: this.evaluator.getSupportedFeatures()
        };
    }
}

/**
 * Simple LRU Cache implementation
 */
class DocumentCache {
    constructor(maxSize = 10) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (this.cache.has(key)) {
            // Move to end (most recently used)
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }
        return null;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove least recently used (first item)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DocumentQuerySuggestionEngine, DocumentCache };
} else if (typeof window !== 'undefined') {
    window.DocumentQuerySuggestionEngine = DocumentQuerySuggestionEngine;
    window.DocumentCache = DocumentCache;
}