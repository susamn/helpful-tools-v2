/**
 * Schema Inference Unit Tests
 * Tests the improved JSONL schema detection functionality
 */

// Test data sets
const testDataSets = {
    sparseFields: `{"name": "Alice", "age": 25, "email": "alice@example.com"}
{"name": "Bob", "age": 30, "email": "bob@example.com"}
{"name": "Carol", "age": 35, "email": "carol@example.com"}
{"name": "Dave", "age": 40, "email": "dave@example.com", "premium": true}
{"name": "Eve", "age": 28, "country": "USA", "email": "eve@example.com"}
{"name": "Frank", "age": 45, "department": "Engineering", "email": "frank@example.com"}`,

    nestedVariations: `{"user": {"id": 1, "name": "Alice"}, "metadata": {"created": "2024-01-01"}}
{"profile": {"name": "Bob", "skills": ["JS", "Python"]}, "settings": {"theme": "dark"}}
{"analytics": {"views": 1000, "clicks": 50}, "user": {"name": "Carol"}}
{"settings": {"language": "en"}, "metadata": {"version": "1.0"}}
{"user": {"id": 5, "name": "Eve"}, "custom": {"tags": ["important"]}}`,

    largeDataset: generateLargeDataset(50)
};

function generateLargeDataset(count) {
    const objects = [];
    for (let i = 1; i <= count; i++) {
        const obj = {
            id: i,
            name: `User ${i}`,
            email: `user${i}@example.com`
        };

        // Add variations at different intervals
        if (i % 10 === 0) obj.premium = true;
        if (i % 15 === 0) obj.country = ['USA', 'Canada', 'UK'][i % 3];
        if (i % 20 === 0) obj.department = ['Engineering', 'Marketing', 'Sales'][i % 3];
        if (i % 25 === 0) obj.settings = { theme: 'dark', notifications: true };

        objects.push(JSON.stringify(obj));
    }
    return objects.join('\n');
}

// Test suite
class SchemaInferenceTests {
    constructor() {
        this.results = [];
        this.parser = null;
    }

    async runAllTests() {
        console.log('🧪 Starting Schema Inference Tests\n');

        try {
            // Initialize parser
            this.parser = new JSONDocumentParser({
                maxDepth: 4,
                jsonlSampleSize: 10
            });

            await this.testSparseFieldDetection();
            await this.testNestedVariations();
            await this.testLargeDatasetSampling();
            await this.testRepresentativeObjectSelection();
            await this.testSchemaCoverage();

            this.printResults();
        } catch (error) {
            console.error('❌ Test suite failed:', error);
        }
    }

    async testSparseFieldDetection() {
        this.test('Sparse Field Detection', async () => {
            const document = await this.parser.parse(testDataSets.sparseFields);

            // Should detect JSONL format
            this.assert(document._jsonlFormat === true, 'Should detect JSONL format');

            // Get root suggestions
            const suggestions = this.parser.getRootSuggestions(document);
            const suggestionTexts = suggestions.map(s => s.text);

            // Should include all fields, including sparse ones
            this.assert(suggestionTexts.includes('$.name'), 'Should include name field');
            this.assert(suggestionTexts.includes('$.age'), 'Should include age field');
            this.assert(suggestionTexts.includes('$.email'), 'Should include email field');
            this.assert(suggestionTexts.includes('$.premium'), 'Should include sparse premium field');
            this.assert(suggestionTexts.includes('$.country'), 'Should include sparse country field');
            this.assert(suggestionTexts.includes('$.department'), 'Should include sparse department field');

            return {
                totalSuggestions: suggestions.length,
                detectedFields: suggestionTexts.length,
                sparseFieldsDetected: ['$.premium', '$.country', '$.department'].filter(f => suggestionTexts.includes(f)).length
            };
        });
    }

    async testNestedVariations() {
        this.test('Nested Variations Detection', async () => {
            const document = await this.parser.parse(testDataSets.nestedVariations);
            const suggestions = this.parser.getRootSuggestions(document);
            const suggestionTexts = suggestions.map(s => s.text);

            // Should detect all top-level keys from different objects
            this.assert(suggestionTexts.includes('$.user'), 'Should include user field');
            this.assert(suggestionTexts.includes('$.metadata'), 'Should include metadata field');
            this.assert(suggestionTexts.includes('$.profile'), 'Should include profile field');
            this.assert(suggestionTexts.includes('$.settings'), 'Should include settings field');
            this.assert(suggestionTexts.includes('$.analytics'), 'Should include analytics field');
            this.assert(suggestionTexts.includes('$.custom'), 'Should include custom field');

            return {
                uniqueTopLevelKeys: suggestionTexts.length,
                expectedKeys: 6,
                coverage: suggestionTexts.length / 6 * 100
            };
        });
    }

    async testLargeDatasetSampling() {
        this.test('Large Dataset Sampling Efficiency', async () => {
            const document = await this.parser.parse(testDataSets.largeDataset);

            // Test representative object selection
            const representative = this.parser.getRepresentativeObjects(document.objects, 10);

            this.assert(representative.length <= 10, 'Should limit representative objects to 10');
            this.assert(representative.length >= 3, 'Should include at least 3 objects');

            // Test schema coverage
            const originalSchemas = new Set();
            const representativeSchemas = new Set();

            document.objects.forEach(obj => {
                if (typeof obj === 'object' && obj !== null) {
                    originalSchemas.add(JSON.stringify(Object.keys(obj).sort()));
                }
            });

            representative.forEach(obj => {
                if (typeof obj === 'object' && obj !== null) {
                    representativeSchemas.add(JSON.stringify(Object.keys(obj).sort()));
                }
            });

            const coverage = representativeSchemas.size / originalSchemas.size * 100;
            this.assert(coverage >= 80, `Schema coverage should be >= 80%, got ${coverage}%`);

            return {
                totalObjects: document.objects.length,
                representativeObjects: representative.length,
                originalSchemas: originalSchemas.size,
                capturedSchemas: representativeSchemas.size,
                coverage: coverage
            };
        });
    }

    async testRepresentativeObjectSelection() {
        this.test('Representative Object Selection Algorithm', async () => {
            // Test with known data patterns
            const testObjects = [
                { id: 1, name: 'A' },
                { id: 2, name: 'B' },
                { id: 3, name: 'C' },
                { id: 4, name: 'D', premium: true },        // new schema
                { id: 5, name: 'E' },
                { id: 6, name: 'F', country: 'USA' },       // new schema
                { id: 7, name: 'G' },
                { id: 8, name: 'H', premium: true, country: 'CA' }  // new schema
            ];

            const representative = this.parser.getRepresentativeObjects(testObjects, 5);

            // Should include objects with different schemas
            const schemas = representative.map(obj => Object.keys(obj).sort().join(','));
            const uniqueSchemas = new Set(schemas);

            this.assert(uniqueSchemas.size >= 3, 'Should capture multiple schema variations');

            // Should include first few objects
            this.assert(representative.some(obj => obj.id <= 3), 'Should include early objects');

            // Should include objects with unique schemas
            this.assert(representative.some(obj => obj.premium), 'Should include premium schema');
            this.assert(representative.some(obj => obj.country), 'Should include country schema');

            return {
                totalObjects: testObjects.length,
                selectedObjects: representative.length,
                uniqueSchemas: uniqueSchemas.size,
                selectedIds: representative.map(obj => obj.id)
            };
        });
    }

    async testSchemaCoverage() {
        this.test('Complete Schema Coverage Verification', async () => {
            const document = await this.parser.parse(testDataSets.sparseFields);

            // Extract all unique keys from original data
            const allKeys = new Set();
            document.objects.forEach(obj => {
                if (typeof obj === 'object' && obj !== null) {
                    Object.keys(obj).forEach(key => allKeys.add(key));
                }
            });

            // Get suggestions and extract detected keys
            const suggestions = this.parser.getRootSuggestions(document);
            const detectedKeys = suggestions.map(s => s.text.replace('$.', ''));

            // Calculate coverage
            const coverage = detectedKeys.length / allKeys.size * 100;
            this.assert(coverage === 100, `Should detect 100% of keys, got ${coverage}%`);

            // Verify specific keys
            const expectedKeys = ['name', 'age', 'email', 'premium', 'country', 'department'];
            expectedKeys.forEach(key => {
                this.assert(detectedKeys.includes(key), `Should detect key: ${key}`);
            });

            return {
                originalKeys: Array.from(allKeys).sort(),
                detectedKeys: detectedKeys.sort(),
                coverage: coverage,
                missingKeys: Array.from(allKeys).filter(key => !detectedKeys.includes(key))
            };
        });
    }

    test(name, testFunc) {
        console.log(`🔍 Running: ${name}`);
        try {
            const result = testFunc();
            if (result instanceof Promise) {
                return result.then(data => {
                    this.results.push({ name, status: 'PASS', data, error: null });
                    console.log(`  ✅ PASS`);
                    if (data) console.log(`     ${JSON.stringify(data, null, 2)}`);
                }).catch(error => {
                    this.results.push({ name, status: 'FAIL', data: null, error: error.message });
                    console.log(`  ❌ FAIL: ${error.message}`);
                });
            } else {
                this.results.push({ name, status: 'PASS', data: result, error: null });
                console.log(`  ✅ PASS`);
                if (result) console.log(`     ${JSON.stringify(result, null, 2)}`);
            }
        } catch (error) {
            this.results.push({ name, status: 'FAIL', data: null, error: error.message });
            console.log(`  ❌ FAIL: ${error.message}`);
        }
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }

    printResults() {
        console.log('\n📊 Test Results Summary');
        console.log('========================');

        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;

        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📈 Success Rate: ${(passed / this.results.length * 100).toFixed(1)}%`);

        if (failed > 0) {
            console.log('\n💥 Failures:');
            this.results.filter(r => r.status === 'FAIL').forEach(result => {
                console.log(`  • ${result.name}: ${result.error}`);
            });
        }

        console.log('\n🎉 Schema inference testing completed!');
    }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SchemaInferenceTests, testDataSets };
} else if (typeof window !== 'undefined') {
    window.SchemaInferenceTests = SchemaInferenceTests;
    window.testDataSets = testDataSets;
}

// Auto-run if loaded directly in browser
if (typeof window !== 'undefined' && window.JSONDocumentParser) {
    console.log('🚀 Schema Inference Tests loaded - call new SchemaInferenceTests().runAllTests() to run');
}