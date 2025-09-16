# 📚 Document Query Suggestions

A lightweight, generic autocomplete library for structured documents (JSON, YAML, XML) with contextual query suggestions for their respective query languages (JSONPath, yq, XPath).

## 🎯 Features

- **Multi-format Support**: JSON, YAML, XML documents
- **Advanced JSONL Support**: Intelligent schema inference for varying document structures
- **Contextual Suggestions**: Smart autocomplete based on document structure
- **Multiple Query Languages**: JSONPath, yq, XPath
- **Union Queries**: Support for comma-separated expressions
- **Comprehensive Schema Detection**: Finds all fields across entire JSONL datasets
- **IDE-like Experience**: Keyboard navigation, real-time suggestions
- **Lightweight**: Modular architecture with minimal dependencies
- **Extensible**: Easy to add new document types and query languages
- **Caching**: Intelligent caching for performance
- **Performance Optimized**: Smart sampling for large datasets

## 🚀 Quick Start

### Basic Usage

```html
<!-- Include the library -->
<script src="document-query-suggestions/index.js"></script>

<!-- Your input field -->
<input type="text" id="queryInput" placeholder="Type your query...">

<script>
// Auto-setup with document detection
const jsonData = '{"users": [{"name": "Alice", "age": 25}]}';
const adapter = DocumentQuerySuggestions.autoSetupAutocomplete(
    document.getElementById('queryInput'),
    jsonData
);
</script>
```

### Manual Setup

```javascript
// Create engine for specific format
const engine = new DocumentQuerySuggestionEngine('json', 'jsonpath');
await engine.initialize(jsonData);

// Create autocomplete adapter
const adapter = new AutocompleteAdapter(inputElement, {
    documentType: 'json',
    queryLanguage: 'jsonpath',
    maxSuggestions: 10,
    debounceMs: 1000
});

await adapter.setDocument(jsonData);
```

## 📖 Supported Formats

| Document Type | Query Language | Example Query |
|---------------|----------------|---------------|
| JSON          | JSONPath       | `$.users[0].name` |
| YAML          | yq             | `.users[0].name` |
| XML           | XPath          | `//users/user[1]/name` |

## 💡 Examples

### JSON + JSONPath

```javascript
const jsonData = {
    "store": {
        "book": [
            {"title": "Book 1", "price": 8.95},
            {"title": "Book 2", "price": 12.99}
        ]
    }
};

// Setup autocomplete
const adapter = DocumentQuerySuggestions.setupJsonAutocomplete(
    document.getElementById('jsonQuery'),
    JSON.stringify(jsonData)
);

// Example queries with autocomplete:
// $.store.book[0].title
// $.store.book[*].price
// $.store.book[?(@.price < 10)]
```

### YAML + yq

```javascript
const yamlData = `
users:
  - name: Alice
    age: 25
  - name: Bob
    age: 30
config:
  database:
    host: localhost
`;

// Setup autocomplete
const adapter = DocumentQuerySuggestions.setupYamlAutocomplete(
    document.getElementById('yamlQuery'),
    yamlData
);

// Example queries with autocomplete:
// .users[0].name
// .users[] | .age
// .config.database.host
```

## 🛠️ API Reference

### DocumentQuerySuggestionEngine

Main engine class for parsing documents and generating suggestions.

```javascript
const engine = new DocumentQuerySuggestionEngine(documentType, queryLanguage, options);

// Initialize with document
await engine.initialize(documentContent);

// Get suggestions
const suggestions = await engine.getSuggestions(query, cursorPosition);

// Execute query
const results = await engine.executeQuery(query);
```

### AutocompleteAdapter

UI adapter for integrating with input elements.

```javascript
const adapter = new AutocompleteAdapter(inputElement, options);

// Set document
await adapter.setDocument(documentContent);

// Options
{
    documentType: 'json',           // Document format
    queryLanguage: 'jsonpath',      // Query language
    maxSuggestions: 10,             // Max suggestions shown
    debounceMs: 1000,              // Debounce delay
    showDescriptions: true,         // Show descriptions
    showSampleValues: true,         // Show sample values
    enableKeyboardNavigation: true, // Keyboard support
    onSelect: (suggestion) => {},   // Selection callback
    onError: (error) => {}          // Error callback
}
```

### Convenience Functions

```javascript
// Auto-detect document type and setup
DocumentQuerySuggestions.autoSetupAutocomplete(input, content);

// Create specific engines
DocumentQuerySuggestions.createJsonEngine(options);
DocumentQuerySuggestions.createYamlEngine(options);

// Quick setup
DocumentQuerySuggestions.setupJsonAutocomplete(input, content);
DocumentQuerySuggestions.setupYamlAutocomplete(input, content);

// Utilities
DocumentQuerySuggestions.detectDocumentType(content);
DocumentQuerySuggestions.getDefaultQueryLanguage(documentType);
DocumentQuerySuggestions.getSupportedFormats();
```

## 🎮 Interactive Demo

Open `demo.html` in your browser to see the library in action with:
- JSON + JSONPath examples
- YAML + yq examples
- Real-time autocomplete
- Sample data sets
- Query execution

## 🏗️ Architecture

```
document-query-suggestions/
├── core/
│   ├── SuggestionEngine.js     # Main engine
│   ├── DocumentParser.js       # Parser interface
│   └── QueryEvaluator.js      # Evaluator interface
├── parsers/
│   ├── JSONDocumentParser.js   # JSON/JSONL parser
│   ├── YAMLDocumentParser.js   # YAML parser
│   └── XMLDocumentParser.js    # XML parser (future)
├── evaluators/
│   ├── JSONPathEvaluator.js    # JSONPath evaluator
│   ├── YQEvaluator.js          # yq evaluator
│   └── XPathEvaluator.js       # XPath evaluator (future)
├── adapters/
│   └── AutocompleteAdapter.js  # UI integration
├── index.js                    # Main entry point
├── demo.html                   # Interactive demo
└── README.md                   # This file
```

## 🔧 Extending the Library

### Adding a New Document Parser

```javascript
class MyDocumentParser extends DocumentParser {
    async parse(content) {
        // Parse your document format
        return parsedDocument;
    }

    getRootSuggestions(document) {
        // Return root-level suggestions
        return suggestions;
    }

    // Implement other required methods...
}
```

### Adding a New Query Evaluator

```javascript
class MyQueryEvaluator extends QueryEvaluator {
    async evaluate(document, query) {
        // Evaluate query against document
        return results;
    }

    async getSuggestions(document, partialQuery, context) {
        // Generate contextual suggestions
        return suggestions;
    }

    // Implement other required methods...
}
```

## 📝 Query Language Examples

### JSONPath
- `$.store.book[0].title` - First book title
- `$.store.book[*].author` - All book authors
- `$.store.book[?(@.price < 10)]` - Books under $10
- `$..author` - All authors (recursive)
- `$.users[0].name,$.metadata.id` - Union query

### yq (YAML Query)
- `.users[0].name` - First user name
- `.users[]` - All users
- `.users[] | .age` - All user ages
- `.config.database.host` - Database host
- `.items[1:3]` - Slice of items

### XPath (XML)
- `//book[1]/title` - First book title
- `//book[@price < 10]` - Books under $10
- `/store/book/title` - All book titles
- `//author/text()` - All author text content

## 🎨 Styling

The library includes default CSS classes that you can customize:

```css
.dqs-dropdown {
    /* Dropdown container */
}

.dqs-item {
    /* Suggestion item */
}

.dqs-item.selected {
    /* Selected item */
}

.dqs-suggestion-text {
    /* Main suggestion text */
}

.dqs-suggestion-description {
    /* Description text */
}

.dqs-type-property .dqs-suggestion-text {
    /* Property suggestions */
    color: #0066cc;
}
```

## ⚡ Performance

- **Lightweight**: ~50KB total minified
- **Caching**: LRU cache for parsed documents
- **Debouncing**: Configurable suggestion delays
- **Lazy Loading**: Only load needed parsers/evaluators
- **Memory Efficient**: Limited suggestion counts and depths

## 🤝 Contributing

The library is designed to be easily extensible:

1. **New Document Types**: Extend `DocumentParser`
2. **New Query Languages**: Extend `QueryEvaluator`
3. **New UI Adapters**: Use `AutocompleteAdapter` as reference
4. **Optimizations**: Improve caching, parsing, or suggestion algorithms

## 📄 License

Proprietary - For licensing information, please contact the author.

## 🧠 Advanced Schema Inference

The library includes intelligent schema inference for JSONL files with varying document structures:

### Key Features
- **Sparse Field Detection**: Finds fields that exist in only some documents
- **Representative Sampling**: Efficiently samples large datasets for schema diversity
- **Schema Variation Detection**: Identifies documents with different field structures
- **Complete Coverage**: Ensures all possible fields are discovered

### Example
```jsonl
{"name": "Alice", "age": 25}
{"name": "Bob", "age": 30}
{"name": "Carol", "premium": true}    // sparse field
{"name": "Dave", "country": "USA"}   // sparse field
```

**Result**: Autocomplete suggests `$.name`, `$.age`, `$.premium`, `$.country` - all fields detected!

See [Schema Inference Documentation](docs/SCHEMA_INFERENCE.md) for detailed information.

## 🧪 Testing

### Interactive Tests
- **Schema Inference Test**: `/tests/jsonl-schema-inference-test.html`
- **Unit Tests**: `/tests/schema-inference.test.js`

### Running Tests
```html
<!-- Load test page -->
<script src="tests/schema-inference.test.js"></script>
<script>
const tests = new SchemaInferenceTests();
tests.runAllTests();
</script>
```

## 🔮 Future Enhancements

- **XML + XPath**: Full XML support with XPath evaluation
- **More Query Languages**: Support for jq, CSS selectors, etc.
- **Advanced Filters**: More sophisticated filtering expressions
- **Performance**: WebWorker support for large documents
- **Plugins**: Plugin system for custom extensions
- **TypeScript**: Full TypeScript definitions
- **Package Managers**: npm, yarn, CDN distribution
- **Schema Learning**: Machine learning for schema prediction

---

**Ready to supercharge your document querying experience? Get started with the demo and explore the possibilities!** 🚀