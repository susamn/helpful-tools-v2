// Test the fixed regex logic
function findMatches(regex, text, flags, pattern) {
    const matches = [];
    let match;
    
    // Check if pattern has line anchors (^ or $) and handle multiline correctly
    const hasLineAnchors = pattern.includes('^') || pattern.includes('$');
    const isMultilineText = text.includes('\n');
    
    if (hasLineAnchors && isMultilineText && !flags.includes('m')) {
        // For patterns with line anchors on multiline text, test each line separately
        const lines = text.split('\n');
        let globalOffset = 0;
        
        lines.forEach((line, lineIndex) => {
            try {
                const lineRegex = new RegExp(pattern, flags.replace('g', '')); // Remove global for individual line testing
                const lineMatch = lineRegex.exec(line);
                
                if (lineMatch) {
                    matches.push({
                        match: lineMatch[0],
                        index: globalOffset + lineMatch.index,
                        endIndex: globalOffset + lineMatch.index + lineMatch[0].length,
                        groups: lineMatch.slice(1),
                        fullMatch: lineMatch
                    });
                }
            } catch (e) {
                // Skip invalid patterns for individual lines
            }
            
            globalOffset += line.length + 1; // +1 for the newline character
        });
    } else {
        // Standard matching logic
        if (flags.includes('g')) {
            while ((match = regex.exec(text)) !== null) {
                matches.push({
                    match: match[0],
                    index: match.index,
                    endIndex: match.index + match[0].length,
                    groups: match.slice(1),
                    fullMatch: match
                });
                
                // Prevent infinite loop on zero-length matches
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }
            }
        } else {
            match = regex.exec(text);
            if (match) {
                matches.push({
                    match: match[0],
                    index: match.index,
                    endIndex: match.index + match[0].length,
                    groups: match.slice(1),
                    fullMatch: match
                });
            }
        }
    }
    
    return matches;
}

// Test the problematic Strong Password pattern
console.log('Testing fixed Strong Password pattern:');
const pattern = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$";
const text = "Password123!\nweakpass\nSTRONG456#\nAbc123\nMyP@ssw0rd";
const flags = "g"; // Without multiline flag

try {
    const regex = new RegExp(pattern, flags);
    const matches = findMatches(regex, text, flags, pattern);
    
    console.log(`Pattern: /${pattern}/${flags}`);
    console.log(`Text: ${JSON.stringify(text)}`);
    console.log(`Found ${matches.length} matches:`);
    
    matches.forEach((match, i) => {
        console.log(`  ${i+1}. "${match.match}" at ${match.index}-${match.endIndex}`);
    });
    
    // Also test with multiline flag
    console.log('\nTesting with multiline flag:');
    const flagsWithMultiline = "gm";
    const regexMultiline = new RegExp(pattern, flagsWithMultiline);
    const matchesMultiline = findMatches(regexMultiline, text, flagsWithMultiline, pattern);
    
    console.log(`Pattern: /${pattern}/${flagsWithMultiline}`);
    console.log(`Found ${matchesMultiline.length} matches:`);
    
    matchesMultiline.forEach((match, i) => {
        console.log(`  ${i+1}. "${match.match}" at ${match.index}-${match.endIndex}`);
    });
    
} catch (error) {
    console.log(`Error: ${error.message}`);
}

// Test other patterns to make sure they still work
console.log('\n=== Testing other patterns ===');

const otherPatterns = [
    {
        name: "USA Phone",
        pattern: "\\(?([0-9]{3})\\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})",
        text: "Call me at (555) 123-4567\nOr try 555-123-4567",
        flags: "g"
    },
    {
        name: "Email",
        pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
        text: "Contact: john@example.com\nsupport@company.org",
        flags: "g"
    }
];

otherPatterns.forEach(testCase => {
    console.log(`\nTesting ${testCase.name}:`);
    try {
        const regex = new RegExp(testCase.pattern, testCase.flags);
        const matches = findMatches(regex, testCase.text, testCase.flags, testCase.pattern);
        console.log(`  Found ${matches.length} matches: [${matches.map(m => `"${m.match}"`).join(', ')}]`);
    } catch (error) {
        console.log(`  Error: ${error.message}`);
    }
});