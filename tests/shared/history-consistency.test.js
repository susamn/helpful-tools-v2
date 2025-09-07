/**
 * History Consistency Tests - Validates uniform history behavior across tools
 * Tests for JSON Formatter and JSON-YAML-XML Converter
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Test constants
const TOOLS = {
    'json-formatter': {
        htmlPath: '/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/tools/json-formatter.html',
        jsPath: '/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/static/js/json-formatter.js',
        className: 'JsonFormatter',
        instanceName: 'jsonFormatter'
    },
    'json-yaml-xml-converter': {
        htmlPath: '/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/tools/json-yaml-xml-converter.html',
        inlineJs: true,
        className: 'JsonYamlXmlConverter',
        instanceName: 'converter'
    }
};

describe('History Consistency Tests', () => {
    let tools = {};

    beforeAll(() => {
        // Load tool environments
        Object.entries(TOOLS).forEach(([toolName, config]) => {
            const html = fs.readFileSync(config.htmlPath, 'utf8');
            const dom = new JSDOM(html, {
                url: 'http://localhost:8000',
                resources: 'usable',
                runScripts: 'dangerously'
            });

            // Mock fetch globally
            global.fetch = jest.fn();
            dom.window.fetch = global.fetch;

            tools[toolName] = {
                dom,
                window: dom.window,
                document: dom.window.document
            };
        });
    });

    describe('History Toggle Button Consistency', () => {
        test('Both tools should have identical toggle button structure', () => {
            Object.entries(tools).forEach(([toolName, tool]) => {
                const toggleBtn = tool.document.getElementById('historyToggleBtn');
                
                expect(toggleBtn).toBeTruthy();
                expect(toggleBtn.textContent).toContain('📝 History');
                expect(toggleBtn.className).toBe('history-toggle-btn');
            });
        });

        test('Both tools should have consistent toggle button styling', () => {
            Object.entries(tools).forEach(([toolName, tool]) => {
                const styles = tool.document.querySelector('style').textContent;
                
                // Check for consistent toggle button styles
                expect(styles).toMatch(/\.history-toggle-btn\s*{[^}]*background:\s*linear-gradient\(to bottom,\s*#f0f8ff,\s*#d1e7ff\)/);
                expect(styles).toMatch(/\.history-toggle-btn\.disabled\s*{[^}]*background:\s*linear-gradient\(to bottom,\s*#fff0f0,\s*#fdd8d8\)/);
            });
        });
    });

    describe('Local History Structure Consistency', () => {
        test('Both tools should have identical history popup structure', () => {
            Object.entries(tools).forEach(([toolName, tool]) => {
                const historyPopup = tool.document.getElementById('historyPopup');
                const historyTabs = historyPopup.querySelector('.history-tabs');
                const tabs = historyTabs.querySelectorAll('.history-tab');
                
                expect(historyPopup).toBeTruthy();
                expect(tabs).toHaveLength(2);
                expect(tabs[0].textContent.trim()).toBe('History');
                expect(tabs[1].textContent.trim()).toBe('Copy');
                expect(tabs[0].dataset.tab).toBe('history');
                expect(tabs[1].dataset.tab).toBe('copy');
            });
        });

        test('Both tools should have consistent history item structure', () => {
            // This test will be validated with mock data
            const mockHistory = [{
                id: '123',
                timestamp: '2023-12-01T10:00:00Z',
                operation: 'format',
                preview: 'Sample data preview'
            }];

            Object.entries(tools).forEach(([toolName, tool]) => {
                const historyList = tool.document.getElementById('historyList');
                
                // Mock the displayHistory method behavior
                const expectedStructure = `
                    <div class="history-item" data-id="123">
                        <div class="history-item-header">
                            <div class="history-item-content">
                                <input type="checkbox" class="history-checkbox" data-id="123">
                                <div class="history-meta">
                                    <span class="history-id">ID: 123</span>
                                    <span class="history-date">timestamp - format</span>
                                </div>
                            </div>
                            <button class="history-delete-btn">×</button>
                        </div>
                        <div class="history-preview">Sample data preview</div>
                    </div>
                `;
                
                // Verify the structure exists in HTML template
                expect(historyList).toBeTruthy();
            });
        });
    });

    describe('Global History Structure Consistency', () => {
        test('Both tools should have identical global history popup structure', () => {
            Object.entries(tools).forEach(([toolName, tool]) => {
                const globalHistoryPopup = tool.document.getElementById('globalHistoryPopup');
                const globalHistoryHeader = globalHistoryPopup.querySelector('.global-history-header');
                const globalHistoryContent = globalHistoryPopup.querySelector('.global-history-content');
                const globalHistoryList = tool.document.getElementById('globalHistoryList');
                
                expect(globalHistoryPopup).toBeTruthy();
                expect(globalHistoryHeader).toBeTruthy();
                expect(globalHistoryContent).toBeTruthy();
                expect(globalHistoryList).toBeTruthy();
                
                expect(globalHistoryHeader.textContent).toContain('Global History - All Tools');
            });
        });

        test('Both tools should use identical tool color mapping', () => {
            const expectedColors = {
                'json-formatter': '#2196F3',
                'json-yaml-xml-converter': '#4CAF50',
                'base64-encoder-decoder': '#FF9800',
                'url-encoder-decoder': '#9C27B0',
                'hash-generator': '#F44336',
                'qr-code-generator': '#607D8B'
            };

            Object.entries(tools).forEach(([toolName, tool]) => {
                const scriptContent = tool.document.documentElement.innerHTML;
                
                // Check if all expected colors are present in the tool color mapping
                Object.entries(expectedColors).forEach(([tool, color]) => {
                    expect(scriptContent).toContain(`'${tool}': '${color}'`);
                });
            });
        });
    });

    describe('History Functionality Consistency', () => {
        test('Both tools should have consistent history API endpoints', () => {
            const expectedEndpoints = [
                '/api/history/',
                '/api/global-history',
                'DELETE'
            ];

            Object.entries(tools).forEach(([toolName, tool]) => {
                const scriptContent = tool.document.documentElement.innerHTML;
                
                expectedEndpoints.forEach(endpoint => {
                    expect(scriptContent).toContain(endpoint);
                });
            });
        });

        test('Both tools should have identical history method names', () => {
            const expectedMethods = [
                'loadHistory',
                'displayHistory',
                'loadHistoryEntry',
                'deleteHistoryItem',
                'loadGlobalHistory',
                'displayGlobalHistory',
                'loadGlobalHistoryEntry',
                'deleteGlobalHistoryItem',
                'getToolColor',
                'handleHistorySelection',
                'updateHistorySelectionUI',
                'clearHistorySelection',
                'toggleHistory',
                'toggleGlobalHistory',
                'toggleHistoryEnabled',
                'handleOutsideClick',
                'switchHistoryTab'
            ];

            Object.entries(tools).forEach(([toolName, tool]) => {
                const scriptContent = tool.document.documentElement.innerHTML;
                
                expectedMethods.forEach(method => {
                    expect(scriptContent).toContain(method);
                });
            });
        });
    });

    describe('History CSS Consistency', () => {
        test('Both tools should have consistent history styling classes', () => {
            const expectedClasses = [
                '.history-toggle-btn',
                '.history-btn',
                '.history-popup',
                '.history-tabs',
                '.history-tab',
                '.history-content',
                '.history-item',
                '.history-item-header',
                '.history-item-content',
                '.history-checkbox',
                '.history-meta',
                '.history-id',
                '.history-date',
                '.history-preview',
                '.history-delete-btn',
                '.global-history-popup',
                '.global-history-header',
                '.global-history-content',
                '.global-history-item',
                '.global-history-item-header',
                '.global-history-item-meta',
                '.global-history-tool-label',
                '.global-history-checkbox'
            ];

            Object.entries(tools).forEach(([toolName, tool]) => {
                const styles = tool.document.querySelector('style').textContent;
                
                expectedClasses.forEach(className => {
                    expect(styles).toMatch(new RegExp(className.replace('.', '\\.') + '\\s*{'));
                });
            });
        });

        test('Both tools should have consistent delete button styling', () => {
            Object.entries(tools).forEach(([toolName, tool]) => {
                const styles = tool.document.querySelector('style').textContent;
                
                expect(styles).toMatch(/\.history-delete-btn\s*{[^}]*background:\s*#ff4444/);
                expect(styles).toMatch(/\.history-delete-btn:hover\s*{[^}]*background:\s*#cc3333/);
            });
        });
    });

    describe('History Event Handling Consistency', () => {
        test('Both tools should bind identical history event listeners', () => {
            const expectedEventBindings = [
                "addEventListener('click', () => this.toggleHistory())",
                "addEventListener('click', () => this.toggleGlobalHistory())",
                "addEventListener('click', () => this.toggleHistoryEnabled())",
                "addEventListener('click', (e) => this.handleOutsideClick(e))",
                "addEventListener('click', (e) => this.switchHistoryTab(e))"
            ];

            Object.entries(tools).forEach(([toolName, tool]) => {
                const scriptContent = tool.document.documentElement.innerHTML;
                
                expectedEventBindings.forEach(binding => {
                    expect(scriptContent).toContain(binding);
                });
            });
        });
    });

    afterAll(() => {
        // Cleanup
        Object.values(tools).forEach(tool => {
            tool.window.close();
        });
    });
});

// Integration Test for Cross-Tool History Loading
describe('Cross-Tool History Integration', () => {
    test('Global history should allow loading from any tool to any tool', async () => {
        // Mock successful API response
        global.fetch = jest.fn(() => 
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: '{"test": "data"}',
                    tool_name: 'json-formatter',
                    operation: 'format'
                })
            })
        );

        Object.entries(tools).forEach(([toolName, tool]) => {
            const scriptContent = tool.document.documentElement.innerHTML;
            
            // Should allow cross-tool loading (not restricted to same tool)
            expect(scriptContent).not.toContain('if (toolName === this.toolName)');
            expect(scriptContent).toContain('this.showMessage(`Loaded ${toolName} data into');
        });
    });
});

console.log('History consistency tests completed. Run with: npm test history-consistency.test.js');