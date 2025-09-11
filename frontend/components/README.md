# Source Selector Component

A reusable modal-based source selector component for the Helpful Tools v2 application. This component provides a user-friendly interface for selecting and fetching data from configured sources.

## Files

- `source-selector.html` - The HTML template with embedded CSS styling
- `/static/js/source-selector.js` - The JavaScript component class
- `/static/js/source-selector-loader.js` - Utility functions for easy integration

## Features

- **Source Selection** - Browse and select from available data sources
- **Dynamic Variables** - Edit source path variables (dates, IDs, etc.)
- **Test Connection** - Validate source connectivity before fetching
- **Data Fetching** - Load data directly into your tool
- **Multiple Instances** - Support for multiple selectors per page
- **Responsive Design** - Works across different screen sizes

## Quick Integration

### 1. Include Scripts in your HTML

```html
<!-- Add these script tags to your tool's HTML -->
<script src="/static/js/source-selector.js"></script>
<script src="/static/js/source-selector-loader.js"></script>
```

### 2. Basic Usage

```javascript
// Simple integration - loads template and creates selector
const selector = await createSourceSelector({
    containerId: 'myToolSourceSelector', // Unique ID for this instance
    onFetch: (data, source) => {
        // Handle the fetched data
        console.log('Received data:', data);
        console.log('From source:', source.name);
        
        // Example: Load data into your tool
        document.getElementById('myInput').value = data;
    },
    onEdit: (source) => {
        // Optional: Handle source edits
        console.log('Source edited:', source);
    },
    showEditButton: true,    // Show edit button for dynamic variables
    showFetchButton: true    // Show fetch button
});

// Show the selector
selector.show();
```

### 3. Advanced Usage

```javascript
class MyTool {
    constructor() {
        this.initializeSourceSelector();
    }
    
    async initializeSourceSelector() {
        try {
            this.sourceSelector = await createSourceSelector({
                containerId: 'myToolSourceSelector',
                onFetch: (data, source) => this.handleSourceData(data, source),
                onEdit: (source) => this.handleSourceEdit(source),
                showEditButton: true,
                showFetchButton: true
            });
        } catch (error) {
            console.error('Failed to initialize source selector:', error);
            // Handle gracefully - maybe show manual input only
        }
    }
    
    handleSourceData(data, source) {
        // Process the data
        this.loadDataIntoTool(data);
        
        // Show source info in UI
        this.displaySourceInfo(source);
        
        // Save to history if applicable
        this.saveToHistory(data, `load-from-${source.type}`);
    }
    
    handleSourceEdit(source) {
        // Source was edited, maybe refresh display
        console.log(`Source ${source.name} was updated`);
    }
    
    openSourceSelector() {
        if (this.sourceSelector) {
            this.sourceSelector.show();
        }
    }
}
```

### 4. Multiple Selectors

```javascript
// For tools that need multiple source selectors (like text diff)
class TextDiffTool {
    async initializeSourceSelectors() {
        try {
            // Selector for left text
            this.leftSelector = await createSourceSelector({
                containerId: 'leftSourceSelector',
                onFetch: (data, source) => this.loadData(data, 'left'),
                showEditButton: true,
                showFetchButton: true
            });
            
            // Selector for right text  
            this.rightSelector = await createSourceSelector({
                containerId: 'rightSourceSelector', 
                onFetch: (data, source) => this.loadData(data, 'right'),
                showEditButton: true,
                showFetchButton: true
            });
        } catch (error) {
            console.error('Failed to initialize source selectors:', error);
        }
    }
    
    showLeftSelector() {
        this.leftSelector?.show();
    }
    
    showRightSelector() {
        this.rightSelector?.show();
    }
}
```

## Component Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `containerId` | string | `'sourceSelector'` | Unique ID for this selector instance |
| `onFetch` | function | `null` | Callback when data is fetched: `(data, source) => {}` |
| `onEdit` | function | `null` | Callback when source is edited: `(source) => {}` |
| `showEditButton` | boolean | `true` | Show edit button for sources with dynamic variables |
| `showFetchButton` | boolean | `true` | Show fetch button to load data |
| `allowMultiSelect` | boolean | `false` | Allow selecting multiple sources (future feature) |

## Methods

### `show()`
Shows the source selector modal.

### `hide()`  
Hides the source selector modal.

### `loadSources()`
Refreshes the sources list from the API.

### `destroy()`
Removes the component from the DOM and cleans up event listeners.

## CSS Classes

The component includes comprehensive CSS styling. Key classes for customization:

- `.source-selector-modal` - Main modal container
- `.source-item` - Individual source item
- `.source-btn` - Action buttons (Edit, Test, Fetch)
- `.dynamic-vars-modal` - Variables editing modal

## Error Handling

The component includes robust error handling:

- **Template Loading** - Falls back to inline HTML if external template fails
- **API Errors** - Shows user-friendly error messages  
- **Network Issues** - Graceful degradation with retry options
- **Initialization Failures** - Fallback to legacy SourceSelector class

## Browser Compatibility

- Modern browsers with ES2017+ support
- Uses `fetch()` API for network requests
- Uses `async/await` for asynchronous operations
- CSS Grid and Flexbox for layout

## Example HTML Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Tool</title>
</head>
<body>
    <!-- Your tool UI -->
    <button id="loadFromSource">📂 Load from Source</button>
    <textarea id="dataInput"></textarea>
    
    <!-- Scripts -->
    <script src="/static/js/source-selector.js"></script>
    <script src="/static/js/source-selector-loader.js"></script>
    <script>
        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', async () => {
            const selector = await createSourceSelector({
                containerId: 'mySourceSelector',
                onFetch: (data, source) => {
                    document.getElementById('dataInput').value = data;
                }
            });
            
            document.getElementById('loadFromSource').addEventListener('click', () => {
                selector.show();
            });
        });
    </script>
</body>
</html>
```

This approach makes the source selector component highly reusable while maintaining backward compatibility with existing tools.