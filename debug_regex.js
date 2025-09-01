// Debug script to test regex patterns
const patterns = [
    {
        name: "USA Phone",
        pattern: "\\(?([0-9]{3})\\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})",
        text: "Call me at (555) 123-4567\nOr try 555-123-4567\nAlso 555.123.4567\nInvalid: 12-345-6789",
        expectedMatches: 3
    },
    {
        name: "Strong Password",
        pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$",
        text: "Password123!\nweakpass\nSTRONG456#\nAbc123\nMyP@ssw0rd",
        expectedMatches: 2
    },
    {
        name: "Email",
        pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
        text: "Contact: john@example.com\nsupport@company.org\nInvalid: not-email\nuser@test.co.uk",
        expectedMatches: 3
    },
    {
        name: "ISO Date",
        pattern: "\\d{4}-\\d{2}-\\d{2}",
        text: "Today: 2024-03-15\nBirthday: 1990-12-25\nInvalid: 2024/03/15\nAlso: 2023-01-01",
        expectedMatches: 3
    },
    {
        name: "US Dollar",
        pattern: "\\$([0-9]{1,3}(,[0-9]{3})*|[0-9]+)(\\.[0-9]{2})?",
        text: "Price: $19.99\nExpensive: $1,234.56\nCheap: $5\nCost: $12,345.00\nInvalid: 19.99",
        expectedMatches: 4
    }
];

function testPattern(patternObj) {
    console.log(`\nTesting ${patternObj.name}:`);
    console.log(`Pattern: /${patternObj.pattern}/g`);
    console.log(`Text: ${JSON.stringify(patternObj.text)}`);
    
    try {
        const regex = new RegExp(patternObj.pattern, 'g');
        const matches = [];
        let match;
        
        while ((match = regex.exec(patternObj.text)) !== null) {
            matches.push({
                match: match[0],
                index: match.index,
                groups: match.slice(1)
            });
            
            // Prevent infinite loop
            if (match.index === regex.lastIndex) {
                regex.lastIndex++;
            }
        }
        
        console.log(`Found ${matches.length} matches (expected ${patternObj.expectedMatches}):`);
        matches.forEach((m, i) => {
            console.log(`  ${i+1}. "${m.match}" at ${m.index} groups: [${m.groups.map(g => `"${g}"`).join(', ')}]`);
        });
        
        if (matches.length !== patternObj.expectedMatches) {
            console.log(`❌ MISMATCH: Expected ${patternObj.expectedMatches}, got ${matches.length}`);
            
            // Test line by line for multiline patterns
            const lines = patternObj.text.split('\n');
            console.log('Line-by-line analysis:');
            lines.forEach((line, i) => {
                const lineRegex = new RegExp(patternObj.pattern, 'g');
                const lineMatches = [];
                let lineMatch;
                while ((lineMatch = lineRegex.exec(line)) !== null) {
                    lineMatches.push(lineMatch[0]);
                    if (lineMatch.index === lineRegex.lastIndex) {
                        lineRegex.lastIndex++;
                    }
                }
                console.log(`  Line ${i+1}: "${line}" → ${lineMatches.length} matches: [${lineMatches.join(', ')}]`);
            });
        } else {
            console.log(`✅ PASS`);
        }
        
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
    }
}

// Test all patterns
patterns.forEach(testPattern);

// Test specific problematic patterns
console.log('\n=== SPECIFIC ISSUE TESTING ===');

// Test strong password pattern issues
console.log('\nStrong Password Pattern Analysis:');
const passwordPattern = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$";
const passwordTests = [
    "Password123!",  // Should match
    "weakpass",      // Should not match
    "STRONG456#",    // Should not match (no lowercase)
    "Abc123",        // Should not match (no special char, too short)
    "MyP@ssw0rd"     // Should match
];

passwordTests.forEach(password => {
    const regex = new RegExp(passwordPattern);
    const match = regex.test(password);
    console.log(`  "${password}" → ${match ? 'MATCH' : 'NO MATCH'}`);
});

console.log('\nTesting multiline with m flag:');
const multilineText = "Password123!\nweakpass\nSTRONG456#\nAbc123\nMyP@ssw0rd";
const regexMultiline = new RegExp(passwordPattern, 'gm');
let multiMatch;
let multiMatches = [];
while ((multiMatch = regexMultiline.exec(multilineText)) !== null) {
    multiMatches.push(multiMatch[0]);
    if (multiMatch.index === regexMultiline.lastIndex) {
        regexMultiline.lastIndex++;
    }
}
console.log(`Multiline matches: [${multiMatches.join(', ')}]`);