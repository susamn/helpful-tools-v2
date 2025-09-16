/**
 * Generic Autocomplete Adapter
 * Integrates DocumentQuerySuggestionEngine with any input field
 */

class AutocompleteAdapter {
    constructor(inputElement, options = {}) {
        this.inputElement = inputElement;
        this.options = {
            // Engine options
            documentType: options.documentType || 'json',
            queryLanguage: options.queryLanguage || 'jsonpath',

            // UI options
            maxSuggestions: options.maxSuggestions || 10,
            debounceMs: options.debounceMs || 1000,
            minQueryLength: options.minQueryLength || 1,
            showDescriptions: options.showDescriptions !== false,
            showSampleValues: options.showSampleValues !== false,

            // Styling options
            cssPrefix: options.cssPrefix || 'dqs',
            containerClass: options.containerClass || 'autocomplete-container',
            dropdownClass: options.dropdownClass || 'autocomplete-dropdown',
            itemClass: options.itemClass || 'autocomplete-item',
            selectedClass: options.selectedClass || 'selected',

            // Keyboard options
            enableKeyboardNavigation: options.enableKeyboardNavigation !== false,
            selectOnTab: options.selectOnTab !== false,
            closeOnEscape: options.closeOnEscape !== false,

            // Callbacks
            onSelect: options.onSelect || null,
            onShow: options.onShow || null,
            onHide: options.onHide || null,
            onError: options.onError || null,

            ...options
        };

        // State
        this.engine = null;
        this.dropdown = null;
        this.isVisible = false;
        this.selectedIndex = -1;
        this.currentSuggestions = [];
        this.debounceTimer = null;

        this.initialize();
    }

    /**
     * Initialize the adapter
     */
    async initialize() {
        try {
            // Create suggestion engine
            this.engine = new DocumentQuerySuggestionEngine(
                this.options.documentType,
                this.options.queryLanguage,
                {
                    maxCacheSize: this.options.maxCacheSize,
                    debounceMs: this.options.debounceMs
                }
            );

            // Create dropdown UI
            this.createDropdown();

            // Attach event listeners
            this.attachEventListeners();

            console.log(`AutocompleteAdapter initialized for ${this.options.documentType}/${this.options.queryLanguage}`);
        } catch (error) {
            console.error('Failed to initialize AutocompleteAdapter:', error);
            this.handleError(error);
        }
    }

    /**
     * Set document content for suggestions
     */
    async setDocument(documentContent) {
        if (!this.engine) {
            throw new Error('Adapter not initialized');
        }

        try {
            const success = await this.engine.initialize(documentContent);
            if (!success) {
                throw new Error('Failed to initialize engine with document');
            }

            return true;
        } catch (error) {
            console.error('Failed to set document:', error);
            this.handleError(error);
            return false;
        }
    }

    /**
     * Create dropdown UI element
     */
    createDropdown() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = this.options.containerClass;
        this.container.style.position = 'relative';

        // Create dropdown
        this.dropdown = document.createElement('div');
        this.dropdown.className = this.options.dropdownClass;
        this.dropdown.style.display = 'none';
        this.dropdown.style.position = 'absolute';
        this.dropdown.style.zIndex = '1000';

        // Add CSS classes with prefix
        this.dropdown.classList.add(`${this.options.cssPrefix}-dropdown`);

        // Position dropdown relative to input
        this.updateDropdownPosition();

        // Add to DOM
        document.body.appendChild(this.dropdown);

        // Handle clicks outside to close
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.hide();
            }
        });
    }

    /**
     * Attach event listeners to input element
     */
    attachEventListeners() {
        // Keyboard events
        this.inputElement.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.inputElement.addEventListener('keyup', (e) => this.handleKeyUp(e));
        this.inputElement.addEventListener('input', (e) => this.handleInput(e));

        // Focus events
        this.inputElement.addEventListener('focus', () => this.handleFocus());
        this.inputElement.addEventListener('blur', () => this.handleBlur());

        // Window resize to reposition dropdown
        window.addEventListener('resize', () => this.updateDropdownPosition());
    }

    /**
     * Handle keyboard down events
     */
    handleKeyDown(e) {
        if (!this.isVisible) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.navigateDown();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.navigateUp();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectSuggestion(this.selectedIndex);
                }
                break;
            case 'Tab':
                if (this.options.selectOnTab && this.selectedIndex >= 0) {
                    e.preventDefault();
                    this.selectSuggestion(this.selectedIndex);
                }
                break;
            case 'Escape':
                if (this.options.closeOnEscape) {
                    e.preventDefault();
                    this.hide();
                }
                break;
        }
    }

    /**
     * Handle keyboard up events
     */
    handleKeyUp(e) {
        // Skip navigation keys
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
            return;
        }

        this.debouncedSuggest();
    }

    /**
     * Handle input events
     */
    handleInput(e) {
        this.debouncedSuggest();
    }

    /**
     * Handle focus events
     */
    handleFocus() {
        if (this.inputElement.value.length >= this.options.minQueryLength) {
            this.debouncedSuggest();
        }
    }

    /**
     * Handle blur events
     */
    handleBlur() {
        // Delay hiding to allow clicking on dropdown items
        setTimeout(() => {
            if (!this.dropdown.matches(':hover')) {
                this.hide();
            }
        }, 150);
    }

    /**
     * Debounced suggestion trigger
     */
    debouncedSuggest() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.showSuggestions();
        }, this.options.debounceMs);
    }

    /**
     * Show suggestions for current input
     */
    async showSuggestions() {
        if (!this.engine || !this.engine.isInitialized) {
            return;
        }

        const query = this.inputElement.value;

        if (query.length < this.options.minQueryLength) {
            this.hide();
            return;
        }

        try {
            const cursorPos = this.inputElement.selectionStart;
            const suggestions = await this.engine.getSuggestions(query, cursorPos);

            if (suggestions.length === 0) {
                this.hide();
                return;
            }

            // Limit suggestions
            this.currentSuggestions = suggestions.slice(0, this.options.maxSuggestions);

            this.renderSuggestions();
            this.show();
        } catch (error) {
            console.error('Error getting suggestions:', error);
            this.handleError(error);
        }
    }

    /**
     * Render suggestions in dropdown
     */
    renderSuggestions() {
        // Clear existing content
        this.dropdown.innerHTML = '';

        this.currentSuggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = this.options.itemClass;
            item.classList.add(`${this.options.cssPrefix}-item`);

            // Add type-specific class
            if (suggestion.type) {
                item.classList.add(`${this.options.cssPrefix}-type-${suggestion.type}`);
            }

            // Create content
            const content = this.createSuggestionContent(suggestion);
            item.appendChild(content);

            // Add click handler
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.selectSuggestion(index);
            });

            // Add hover handler
            item.addEventListener('mouseenter', () => {
                this.setSelected(index);
            });

            this.dropdown.appendChild(item);
        });

        // Select first item by default
        if (this.currentSuggestions.length > 0) {
            this.setSelected(0);
        }
    }

    /**
     * Create suggestion content element
     */
    createSuggestionContent(suggestion) {
        const container = document.createElement('div');
        container.className = `${this.options.cssPrefix}-suggestion-content`;

        // Main text
        const textElement = document.createElement('div');
        textElement.className = `${this.options.cssPrefix}-suggestion-text`;
        textElement.textContent = suggestion.displayText || suggestion.text;
        container.appendChild(textElement);

        // Description
        if (this.options.showDescriptions && suggestion.description) {
            const descElement = document.createElement('div');
            descElement.className = `${this.options.cssPrefix}-suggestion-description`;
            descElement.textContent = suggestion.description;
            container.appendChild(descElement);
        }

        // Sample value
        if (this.options.showSampleValues && suggestion.sampleValue !== undefined && suggestion.sampleValue !== null) {
            const valueElement = document.createElement('div');
            valueElement.className = `${this.options.cssPrefix}-suggestion-value`;
            valueElement.textContent = `= ${suggestion.sampleValue}`;
            container.appendChild(valueElement);
        }

        // Type indicator
        if (suggestion.type) {
            const typeElement = document.createElement('span');
            typeElement.className = `${this.options.cssPrefix}-suggestion-type`;
            typeElement.textContent = suggestion.type;
            container.appendChild(typeElement);
        }

        return container;
    }

    /**
     * Navigation methods
     */
    navigateDown() {
        const newIndex = this.selectedIndex + 1;
        this.setSelected(newIndex < this.currentSuggestions.length ? newIndex : 0);
    }

    navigateUp() {
        const newIndex = this.selectedIndex - 1;
        this.setSelected(newIndex >= 0 ? newIndex : this.currentSuggestions.length - 1);
    }

    setSelected(index) {
        // Remove previous selection
        if (this.selectedIndex >= 0) {
            const prevItem = this.dropdown.children[this.selectedIndex];
            if (prevItem) {
                prevItem.classList.remove(this.options.selectedClass);
            }
        }

        // Set new selection
        this.selectedIndex = index;
        if (index >= 0 && index < this.dropdown.children.length) {
            const item = this.dropdown.children[index];
            item.classList.add(this.options.selectedClass);
            item.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Select a suggestion
     */
    selectSuggestion(index) {
        if (index < 0 || index >= this.currentSuggestions.length) {
            return;
        }

        const suggestion = this.currentSuggestions[index];
        this.applySuggestion(suggestion);
        this.hide();

        // Call callback
        if (this.options.onSelect) {
            this.options.onSelect(suggestion, this.inputElement);
        }
    }

    /**
     * Apply suggestion to input field
     */
    applySuggestion(suggestion) {
        if (suggestion.replaceStart !== undefined && suggestion.replaceEnd !== undefined) {
            // Precise replacement
            const value = this.inputElement.value;
            const newValue = value.substring(0, suggestion.replaceStart) +
                           suggestion.insertText +
                           value.substring(suggestion.replaceEnd);

            this.inputElement.value = newValue;

            // Set cursor position
            const cursorPos = suggestion.replaceStart + suggestion.insertText.length;
            this.inputElement.setSelectionRange(cursorPos, cursorPos);
        } else {
            // Simple replacement
            this.inputElement.value = suggestion.insertText || suggestion.text;
        }

        this.inputElement.focus();
    }

    /**
     * Show/hide dropdown
     */
    show() {
        this.updateDropdownPosition();
        this.dropdown.style.display = 'block';
        this.isVisible = true;

        if (this.options.onShow) {
            this.options.onShow(this.dropdown);
        }
    }

    hide() {
        this.dropdown.style.display = 'none';
        this.isVisible = false;
        this.selectedIndex = -1;
        this.currentSuggestions = [];

        if (this.options.onHide) {
            this.options.onHide(this.dropdown);
        }
    }

    /**
     * Update dropdown position
     */
    updateDropdownPosition() {
        if (!this.inputElement) return;

        const inputRect = this.inputElement.getBoundingClientRect();
        const dropdown = this.dropdown;

        dropdown.style.position = 'fixed';
        dropdown.style.left = inputRect.left + 'px';
        dropdown.style.top = (inputRect.bottom + 2) + 'px';
        dropdown.style.minWidth = inputRect.width + 'px';
    }

    /**
     * Error handling
     */
    handleError(error) {
        console.error('AutocompleteAdapter error:', error);

        if (this.options.onError) {
            this.options.onError(error);
        }
    }

    /**
     * Public API methods
     */
    destroy() {
        if (this.dropdown && this.dropdown.parentNode) {
            this.dropdown.parentNode.removeChild(this.dropdown);
        }

        clearTimeout(this.debounceTimer);

        // Remove event listeners would need references stored
        // For simplicity, just clear major references
        this.engine = null;
        this.dropdown = null;
        this.inputElement = null;
    }

    getEngine() {
        return this.engine;
    }

    isInitialized() {
        return this.engine && this.engine.isInitialized;
    }

    getSupportedFormats() {
        return {
            documents: ['json', 'yaml', 'xml'],
            queries: ['jsonpath', 'yq', 'xpath']
        };
    }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AutocompleteAdapter };
} else if (typeof window !== 'undefined') {
    window.AutocompleteAdapter = AutocompleteAdapter;
}