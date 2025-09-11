/**
 * Source Selector Loader Utility
 * 
 * Provides a simple way to load and use the source selector component in any tool.
 * This function fetches the HTML template and injects it into the page.
 */

/**
 * Load the source selector HTML template into the current page
 * @param {string} containerId - Optional container ID for the source selector (defaults to 'sourceSelector')
 * @returns {Promise<void>}
 */
async function loadSourceSelector(containerId = 'sourceSelector') {
    try {
        // Check if this specific containerId is already loaded
        if (document.getElementById(containerId) || document.getElementById(`${containerId}-overlay`)) {
            console.log(`Source selector already loaded for container ID: ${containerId}`);
            return;
        }

        // Fetch the HTML template
        const response = await fetch('/components/source-selector.html');
        if (!response.ok) {
            throw new Error(`Failed to fetch source selector template: ${response.status}`);
        }

        const html = await response.text();
        
        // Create a temporary container
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Update IDs if a custom containerId is provided
        if (containerId !== 'sourceSelector') {
            const elements = tempDiv.querySelectorAll('[id*="sourceSelector"]');
            elements.forEach(element => {
                element.id = element.id.replace('sourceSelector', containerId);
            });
        }

        // Append all child elements to body (don't append the wrapper div)
        while (tempDiv.firstChild) {
            document.body.appendChild(tempDiv.firstChild);
        }
        
        console.log(`Source selector loaded with container ID: ${containerId}`);
        
    } catch (error) {
        console.error('Failed to load source selector:', error);
        throw error;
    }
}

/**
 * Create and initialize a SourceSelector instance with the loaded template
 * @param {Object} options - SourceSelector options
 * @returns {Promise<SourceSelector>} The initialized SourceSelector instance
 */
async function createSourceSelector(options = {}) {
    // Ensure the template is loaded first
    await loadSourceSelector(options.containerId);
    
    // Create the SourceSelector instance
    const selector = new SourceSelector(options);
    
    // Wait for it to be initialized
    return new Promise((resolve) => {
        const checkInitialized = () => {
            if (selector.initialized) {
                resolve(selector);
            } else {
                setTimeout(checkInitialized, 50);
            }
        };
        checkInitialized();
    });
}

// Export functions for use in other modules
window.loadSourceSelector = loadSourceSelector;
window.createSourceSelector = createSourceSelector;