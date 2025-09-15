/**
 * Generic validation utilities for use across all tools
 * Provides type-agnostic validation using the validator system
 */

class ValidationUtils {
    constructor() {
        this.currentValidators = [];
        this.currentSourceId = null;
    }

    /**
     * Load validators for a specific source
     * @param {string} sourceId - The source ID to load validators for
     * @returns {Promise<Array>} - Array of validators
     */
    async loadValidatorsForSource(sourceId) {
        try {
            const response = await fetch(`/api/sources/${sourceId}/validators`);
            const result = await response.json();

            if (result.success) {
                this.currentValidators = result.validators;
                this.currentSourceId = sourceId;
                return this.currentValidators;
            } else {
                console.error('Failed to load validators:', result.error);
                this.currentValidators = [];
                return [];
            }
        } catch (error) {
            console.error('Error loading validators:', error);
            this.currentValidators = [];
            return [];
        }
    }

    /**
     * Populate a select element with validators
     * @param {HTMLSelectElement} selectElement - The select element to populate
     * @param {string} sourceId - The source ID to load validators for
     */
    async populateValidatorSelect(selectElement, sourceId) {
        const validators = await this.loadValidatorsForSource(sourceId);

        // Clear existing options except the first one
        selectElement.innerHTML = '<option value="">Select validator...</option>';

        validators.forEach(validator => {
            const option = document.createElement('option');
            option.value = validator.validator_id;
            option.textContent = `${validator.name} (${validator.type})`;
            selectElement.appendChild(option);
        });

        // Enable/disable based on whether validators exist
        selectElement.disabled = validators.length === 0;

        return validators.length > 0;
    }

    /**
     * Validate data using a specific validator
     * @param {string} validatorId - The validator ID to use
     * @param {any} data - The data to validate (will be converted to appropriate format)
     * @param {string} sourceId - The source ID (optional, defaults to current)
     * @returns {Promise<Object>} - Validation result
     */
    async validateData(validatorId, data, sourceId = null) {
        try {
            const targetSourceId = sourceId || this.currentSourceId;
            if (!targetSourceId) {
                throw new Error('No source ID specified for validation');
            }

            // Convert data to string for validation API
            let dataString;
            if (typeof data === 'string') {
                dataString = data;
            } else {
                dataString = JSON.stringify(data);
            }

            const response = await fetch(`/api/sources/${targetSourceId}/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    validator_id: validatorId,
                    data: dataString
                })
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error validating data:', error);
            return {
                success: false,
                valid: false,
                errors: [`Validation error: ${error.message}`],
                warnings: []
            };
        }
    }

    /**
     * Get a specific validator by ID
     * @param {string} validatorId - The validator ID to find
     * @returns {Object|null} - The validator object or null if not found
     */
    getValidator(validatorId) {
        return this.currentValidators.find(v => v.validator_id === validatorId) || null;
    }

    /**
     * Update validation status display
     * @param {HTMLElement} statusElement - The status display element
     * @param {Object} validationResult - The validation result
     * @param {string} validatorName - The name of the validator used (optional)
     * @param {string} validatorType - The type of validator used (optional)
     */
    updateValidationStatus(statusElement, validationResult, validatorName = '', validatorType = 'unknown') {
        if (!statusElement) return;

        statusElement.className = 'validation-status';

        if (validationResult.success && validationResult.valid) {
            statusElement.classList.add('valid');
            statusElement.innerHTML = 'VALID';
            statusElement.title = validatorName ? `Validated with ${validatorName}` : 'Data is valid';
        } else {
            statusElement.classList.add('invalid');

            // Create the invalid status with show button
            const showBtn = document.createElement('button');
            showBtn.className = 'validation-show-btn';
            showBtn.textContent = 'Show';

            // Store validation data on the button for the onclick handler
            showBtn.validationData = {
                result: validationResult,
                validatorName: validatorName,
                validatorType: validatorType
            };

            showBtn.onclick = (e) => {
                e.stopPropagation();
                const data = e.target.validationData;
                if (data) {
                    window.validationUtils.showValidationDetails(data.result, data.validatorName, data.validatorType);
                } else {
                    console.error('No validation data found on button');
                }
            };

            statusElement.innerHTML = 'INVALID ';
            statusElement.appendChild(showBtn);

            // Create tooltip with basic error info
            const errors = validationResult.errors || ['Validation failed'];
            const errorText = errors.slice(0, 2).join(', ') + (errors.length > 2 ? '...' : '');
            statusElement.title = validatorName ?
                `${validatorName}: ${errorText}` :
                errorText;
        }
    }

    /**
     * Clear validation status display
     * @param {HTMLElement} statusElement - The status display element
     */
    clearValidationStatus(statusElement) {
        if (!statusElement) return;

        statusElement.className = 'validation-status';
        statusElement.textContent = '';
        statusElement.title = '';
    }

    /**
     * Show validation in progress
     * @param {HTMLElement} statusElement - The status display element
     */
    showValidationInProgress(statusElement) {
        if (!statusElement) return;

        statusElement.className = 'validation-status validating';
        statusElement.textContent = 'VALIDATING...';
        statusElement.title = 'Validation in progress';
    }

    /**
     * Enable or disable validation controls
     * @param {Object} controls - Object containing control elements
     * @param {boolean} enabled - Whether to enable or disable
     */
    setValidationControlsEnabled(controls, enabled) {
        if (controls.validatorSelect) {
            controls.validatorSelect.disabled = !enabled;
        }
        if (controls.validateBtn) {
            controls.validateBtn.disabled = !enabled;
        }
        if (controls.validationControls) {
            controls.validationControls.style.display = enabled ? 'flex' : 'none';
        }
    }

    /**
     * Show detailed validation results in popup
     * @param {Object} validationResult - The validation result
     * @param {string} validatorName - The name of the validator used
     * @param {string} validatorType - The type of validator used
     */
    async showValidationDetails(validationResult, validatorName = 'Unknown', validatorType = 'unknown') {
        if (window.ValidationPopup) {
            await window.ValidationPopup.show(validationResult, validatorName, validatorType);
        } else {
            console.warn('ValidationPopup not available - showing alert instead');
            const errors = validationResult.errors || [];
            const warnings = validationResult.warnings || [];

            let message = `Validation Results:\n\n`;
            if (errors.length > 0) {
                message += `Errors:\n${errors.join('\n')}\n\n`;
            }
            if (warnings.length > 0) {
                message += `Warnings:\n${warnings.join('\n')}`;
            }

            alert(message);
        }
    }

    /**
     * Get validation types available on the system
     * @returns {Promise<Array>} - Array of available validator types
     */
    async getAvailableValidatorTypes() {
        try {
            const response = await fetch('/api/validators/types');
            const result = await response.json();

            if (result.success) {
                return result.types;
            } else {
                console.error('Failed to load validator types:', result.error);
                return [];
            }
        } catch (error) {
            console.error('Error loading validator types:', error);
            return [];
        }
    }
}

// Create a global instance for use across tools
window.ValidationUtils = ValidationUtils;
window.validationUtils = new ValidationUtils();