/**
 * Standalone Validation Popup System
 * Handles displaying detailed validation results in a popup
 */

class ValidationPopup {
    static instance = null;
    static currentValidationResult = null;

    /**
     * Initialize the validation popup system
     */
    static async init() {
        if (ValidationPopup.instance) {
            return ValidationPopup.instance;
        }

        try {
            // Load the validation popup HTML
            const response = await fetch('/components/validation.html');
            if (!response.ok) {
                throw new Error('Failed to load validation popup HTML');
            }

            const html = await response.text();

            // Create a temporary div to hold the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // Append the popup to the body
            document.body.appendChild(tempDiv.firstElementChild);

            ValidationPopup.instance = true;
            return true;

        } catch (error) {
            console.error('Failed to initialize validation popup:', error);
            return false;
        }
    }

    /**
     * Show validation results in popup
     * @param {Object} validationResult - The validation result object
     * @param {string} validatorName - Name of the validator used
     * @param {string} validatorType - Type of validator used
     */
    static async show(validationResult, validatorName = 'Unknown', validatorType = 'unknown') {
        // Ensure popup is initialized
        const initialized = await ValidationPopup.init();
        if (!initialized) {
            console.error('Could not initialize validation popup');
            return;
        }

        ValidationPopup.currentValidationResult = validationResult;

        // Get popup elements
        const overlay = document.getElementById('validationPopupOverlay');
        const statusElement = document.getElementById('validationResultStatus');
        const validatorInfoElement = document.getElementById('validationValidatorInfo');
        const detailsElement = document.getElementById('validationDetails');

        if (!overlay || !statusElement || !validatorInfoElement || !detailsElement) {
            console.error('Validation popup elements not found');
            return;
        }

        // Set validation status
        if (validationResult.success && validationResult.valid) {
            statusElement.className = 'validation-result-status valid';
            statusElement.textContent = 'Data is Valid';
        } else {
            statusElement.className = 'validation-result-status invalid';
            statusElement.textContent = 'Data is Invalid';
        }

        // Set validator info
        validatorInfoElement.textContent = `Validated using: ${validatorName} (${validatorType})`;

        // Build details content
        let detailsHTML = '';

        if (validationResult.success && validationResult.valid) {
            // For valid results, show a simple success message
            detailsHTML = '<div class="validation-no-issues">✓ Data passes all validation rules</div>';
        } else {
            // For invalid results, show errors and warnings
            const errors = validationResult.errors || [];
            const warnings = validationResult.warnings || [];

            if (errors.length > 0) {
                detailsHTML += '<div class="validation-section">';
                detailsHTML += '<div class="validation-section-title">Errors</div>';
                detailsHTML += '<div class="validation-errors">';
                errors.forEach(error => {
                    detailsHTML += `<div class="validation-error-item">${ValidationPopup.escapeHtml(error)}</div>`;
                });
                detailsHTML += '</div>';
                detailsHTML += '</div>';
            }

            if (warnings.length > 0) {
                detailsHTML += '<div class="validation-section">';
                detailsHTML += '<div class="validation-section-title">Warnings</div>';
                detailsHTML += '<div class="validation-warnings">';
                warnings.forEach(warning => {
                    detailsHTML += `<div class="validation-warning-item">${ValidationPopup.escapeHtml(warning)}</div>`;
                });
                detailsHTML += '</div>';
                detailsHTML += '</div>';
            }

            if (errors.length === 0 && warnings.length === 0) {
                detailsHTML = '<div class="validation-no-issues">No specific error details available</div>';
            }
        }

        detailsElement.innerHTML = detailsHTML;

        // Show the popup
        overlay.style.display = 'block';

        // Add click outside to close
        overlay.addEventListener('click', ValidationPopup.handleOverlayClick);

        // Add escape key to close
        document.addEventListener('keydown', ValidationPopup.handleEscapeKey);
    }

    /**
     * Close the validation popup
     */
    static close() {
        const overlay = document.getElementById('validationPopupOverlay');
        if (overlay) {
            overlay.style.display = 'none';

            // Remove event listeners
            overlay.removeEventListener('click', ValidationPopup.handleOverlayClick);
            document.removeEventListener('keydown', ValidationPopup.handleEscapeKey);
        }

        ValidationPopup.currentValidationResult = null;
    }

    /**
     * Handle clicking outside popup to close
     */
    static handleOverlayClick(event) {
        if (event.target.id === 'validationPopupOverlay') {
            ValidationPopup.close();
        }
    }

    /**
     * Handle escape key to close popup
     */
    static handleEscapeKey(event) {
        if (event.key === 'Escape') {
            ValidationPopup.close();
        }
    }

    /**
     * Escape HTML characters
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Check if popup is currently open
     */
    static isOpen() {
        const overlay = document.getElementById('validationPopupOverlay');
        return overlay && overlay.style.display === 'block';
    }

    /**
     * Get the current validation result
     */
    static getCurrentResult() {
        return ValidationPopup.currentValidationResult;
    }
}

// Make ValidationPopup globally available
window.ValidationPopup = ValidationPopup;