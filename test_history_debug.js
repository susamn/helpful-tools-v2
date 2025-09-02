// Debug script to test history functionality
console.log('Testing history API calls...');

// Test 1: Test saving to history
const testData = {
    data: {
        pattern: 'test\\d+',
        testText: 'line1\ntest123\nline3',
        flags: 'g'
    },
    operation: 'test'
};

fetch('/api/history/regex-tester', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(testData)
})
.then(response => response.json())
.then(result => {
    console.log('Save result:', result);
    return result.id;
})
.then(historyId => {
    console.log('Testing history load...');
    return fetch(`/api/history/regex-tester?limit=3`);
})
.then(response => response.json())
.then(history => {
    console.log('History list:', history);
    
    // Test displayHistory function logic
    console.log('Testing displayHistory parsing...');
    const historyEntries = history.history || [];
    
    historyEntries.forEach((entry, index) => {
        console.log(`Entry ${index}:`, entry);
        
        try {
            // This is what the JavaScript code does
            const data = entry.preview ? JSON.parse(entry.preview) : JSON.parse(entry.data);
            console.log(`  Parsed data:`, data);
            console.log(`  Pattern: ${data.pattern}`);
            console.log(`  TestText preview: ${data.testText.substring(0, 30)}...`);
        } catch (error) {
            console.log(`  ❌ Failed to parse entry:`, error);
        }
    });
})
.catch(error => {
    console.error('Error:', error);
});