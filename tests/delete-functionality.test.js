/**
 * Delete Functionality Tests
 * Tests for history delete operations in both local and global history
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');

// Mock fetch globally
global.fetch = jest.fn();

describe('History Delete Functionality Tests', () => {
    let jsonFormatterDom, converterDom;
    let jsonFormatterInstance, converterInstance;

    beforeAll(() => {
        // Setup JSON Formatter
        const jsonFormatterHtml = fs.readFileSync(
            '/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/tools/json-formatter.html', 
            'utf8'
        );
        jsonFormatterDom = new JSDOM(jsonFormatterHtml, {
            url: 'http://localhost:8000',
            resources: 'usable',
            runScripts: 'dangerously'
        });
        jsonFormatterDom.window.fetch = global.fetch;

        // Setup Converter
        const converterHtml = fs.readFileSync(
            '/home/susamn/dotfiles/workspace/tools/helpful-tools-v2/tools/json-yaml-xml-converter.html', 
            'utf8'
        );
        converterDom = new JSDOM(converterHtml, {
            url: 'http://localhost:8000',
            resources: 'usable',
            runScripts: 'dangerously'
        });
        converterDom.window.fetch = global.fetch;

        // Wait for instances to be created
        return new Promise(resolve => {
            setTimeout(() => {
                jsonFormatterInstance = jsonFormatterDom.window.jsonFormatter;
                converterInstance = converterDom.window.converter;
                resolve();
            }, 100);
        });
    });

    beforeEach(() => {
        fetch.mockClear();
    });

    describe('DELETE API Endpoints', () => {
        test('DELETE /api/history/{tool}/{id} should return 200 for valid deletion', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, message: 'History entry deleted' })
            });

            const response = await fetch('/api/history/json-formatter/test-id', {
                method: 'DELETE'
            });

            expect(fetch).toHaveBeenCalledWith('/api/history/json-formatter/test-id', {
                method: 'DELETE'
            });
            expect(response.ok).toBe(true);
        });

        test('DELETE /api/global-history/{id} should return 200 for valid deletion', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, message: 'Global history entry deleted' })
            });

            const response = await fetch('/api/global-history/test-id', {
                method: 'DELETE'
            });

            expect(fetch).toHaveBeenCalledWith('/api/global-history/test-id', {
                method: 'DELETE'
            });
            expect(response.ok).toBe(true);
        });
    });

    describe('JSON Formatter Delete Functionality', () => {
        test('deleteHistoryItem should call correct API and refresh both histories', async () => {
            // Mock successful deletion
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            // Mock refresh calls
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });

            const showMessageSpy = jest.spyOn(jsonFormatterInstance, 'showMessage');
            const loadHistorySpy = jest.spyOn(jsonFormatterInstance, 'loadHistory');
            const loadGlobalHistorySpy = jest.spyOn(jsonFormatterInstance, 'loadGlobalHistory');

            await jsonFormatterInstance.deleteHistoryItem('test-id');

            expect(fetch).toHaveBeenCalledWith('/api/history/json-formatter/test-id', {
                method: 'DELETE'
            });
            expect(showMessageSpy).toHaveBeenCalledWith('History item deleted', 'success');
            expect(loadHistorySpy).toHaveBeenCalled();
            expect(loadGlobalHistorySpy).toHaveBeenCalled();
        });

        test('deleteGlobalHistoryItem should call correct API and refresh both histories', async () => {
            // Mock successful deletion
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            // Mock refresh calls
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });

            const showMessageSpy = jest.spyOn(jsonFormatterInstance, 'showMessage');
            const loadHistorySpy = jest.spyOn(jsonFormatterInstance, 'loadHistory');
            const loadGlobalHistorySpy = jest.spyOn(jsonFormatterInstance, 'loadGlobalHistory');

            await jsonFormatterInstance.deleteGlobalHistoryItem('test-id');

            expect(fetch).toHaveBeenCalledWith('/api/global-history/test-id', {
                method: 'DELETE'
            });
            expect(showMessageSpy).toHaveBeenCalledWith('History item deleted', 'success');
            expect(loadHistorySpy).toHaveBeenCalled();
            expect(loadGlobalHistorySpy).toHaveBeenCalled();
        });

        test('delete methods should handle API errors gracefully', async () => {
            // Mock failed deletion
            fetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            const showMessageSpy = jest.spyOn(jsonFormatterInstance, 'showMessage');

            await jsonFormatterInstance.deleteHistoryItem('test-id');

            expect(showMessageSpy).toHaveBeenCalledWith('Failed to delete history item', 'error');
        });
    });

    describe('Converter Delete Functionality', () => {
        test('deleteHistoryItem should call correct API and refresh both histories', async () => {
            // Mock successful deletion
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            // Mock refresh calls for loadHistory and loadGlobalHistory
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });

            const updateStatusSpy = jest.spyOn(converterInstance, 'updateStatus');
            const loadHistorySpy = jest.spyOn(converterInstance, 'loadHistory');
            const loadGlobalHistorySpy = jest.spyOn(converterInstance, 'loadGlobalHistory');

            await converterInstance.deleteHistoryItem('test-id');

            expect(fetch).toHaveBeenCalledWith('/api/history/json-yaml-xml-converter/test-id', {
                method: 'DELETE'
            });
            expect(updateStatusSpy).toHaveBeenCalledWith('History item deleted');
            expect(loadHistorySpy).toHaveBeenCalled();
            expect(loadGlobalHistorySpy).toHaveBeenCalled();
        });

        test('deleteGlobalHistoryItem should call correct API and refresh both histories', async () => {
            // Mock successful deletion
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });

            // Mock refresh calls
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });

            const updateStatusSpy = jest.spyOn(converterInstance, 'updateStatus');
            const loadHistorySpy = jest.spyOn(converterInstance, 'loadHistory');
            const loadGlobalHistorySpy = jest.spyOn(converterInstance, 'loadGlobalHistory');

            await converterInstance.deleteGlobalHistoryItem('test-id');

            expect(fetch).toHaveBeenCalledWith('/api/global-history/test-id', {
                method: 'DELETE'
            });
            expect(updateStatusSpy).toHaveBeenCalledWith('Global history item deleted');
            expect(loadHistorySpy).toHaveBeenCalled();
            expect(loadGlobalHistorySpy).toHaveBeenCalled();
        });
    });

    describe('Delete Button UI Integration', () => {
        test('JSON Formatter local history should have delete buttons with correct onclick handlers', () => {
            const mockHistory = [{
                id: 'test-123',
                timestamp: '2023-12-01T10:00:00Z',
                operation: 'format',
                preview: 'Test data'
            }];

            jsonFormatterInstance.displayHistory(mockHistory);

            const deleteBtn = jsonFormatterDom.window.document.querySelector('.history-delete-btn');
            expect(deleteBtn).toBeTruthy();
            expect(deleteBtn.getAttribute('onclick')).toContain("deleteHistoryItem('test-123')");
        });

        test('JSON Formatter global history should have delete buttons with correct onclick handlers', () => {
            const mockGlobalHistory = [{
                id: 'global-123',
                timestamp: '2023-12-01T10:00:00Z',
                operation: 'format',
                preview: 'Global test data',
                tool_name: 'json-formatter'
            }];

            jsonFormatterInstance.displayGlobalHistory(mockGlobalHistory);

            const deleteBtn = jsonFormatterDom.window.document.querySelector('.history-delete-btn');
            expect(deleteBtn).toBeTruthy();
            expect(deleteBtn.getAttribute('onclick')).toContain("deleteGlobalHistoryItem('global-123')");
        });

        test('Converter local history should have delete buttons with correct onclick handlers', () => {
            const mockHistory = [{
                id: 'conv-123',
                timestamp: '2023-12-01T10:00:00Z',
                operation: 'convert',
                preview: 'Converter test data'
            }];

            converterInstance.displayHistory(mockHistory);

            const deleteBtn = converterDom.window.document.querySelector('.history-delete-btn');
            expect(deleteBtn).toBeTruthy();
            expect(deleteBtn.getAttribute('onclick')).toContain("deleteHistoryItem('conv-123')");
        });

        test('Converter global history should have delete buttons with correct onclick handlers', () => {
            const mockGlobalHistory = [{
                id: 'global-conv-123',
                timestamp: '2023-12-01T10:00:00Z',
                operation: 'convert',
                preview: 'Global converter test data',
                tool_name: 'json-yaml-xml-converter'
            }];

            converterInstance.displayGlobalHistory(mockGlobalHistory);

            const deleteBtn = converterDom.window.document.querySelector('.history-delete-btn');
            expect(deleteBtn).toBeTruthy();
            expect(deleteBtn.getAttribute('onclick')).toContain("deleteGlobalHistoryItem('global-conv-123')");
        });
    });

    describe('CSS Layout for Delete Buttons', () => {
        test('Both tools should have proper CSS for history-delete-btn', () => {
            const jsonFormatterStyles = jsonFormatterDom.window.document.querySelector('style').textContent;
            const converterStyles = converterDom.window.document.querySelector('style').textContent;

            // Check that both have delete button styles
            expect(jsonFormatterStyles).toMatch(/\.history-delete-btn\s*{[^}]*background:\s*#ff4444/);
            expect(converterStyles).toMatch(/\.history-delete-btn\s*{[^}]*background:\s*#ff4444/);
        });

        test('Both tools should have proper flexbox layout for history items', () => {
            const jsonFormatterStyles = jsonFormatterDom.window.document.querySelector('style').textContent;
            const converterStyles = converterDom.window.document.querySelector('style').textContent;

            // Check that both have proper header layout
            expect(jsonFormatterStyles).toMatch(/\.history-item-header\s*{[^}]*display:\s*flex/);
            expect(converterStyles).toMatch(/\.history-item-header\s*{[^}]*display:\s*flex/);
        });
    });

    describe('No Confirmation Dialog Tests', () => {
        test('JSON Formatter delete methods should not call confirm()', async () => {
            const confirmSpy = jest.spyOn(jsonFormatterDom.window, 'confirm');
            
            // Mock successful deletion
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });

            await jsonFormatterInstance.deleteHistoryItem('test-id');

            expect(confirmSpy).not.toHaveBeenCalled();
            confirmSpy.mockRestore();
        });

        test('Converter delete methods should not call confirm()', async () => {
            const confirmSpy = jest.spyOn(converterDom.window, 'confirm');
            
            // Mock successful deletion
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true })
            });
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ history: [] })
            });

            await converterInstance.deleteHistoryItem('test-id');

            expect(confirmSpy).not.toHaveBeenCalled();
            confirmSpy.mockRestore();
        });
    });

    afterAll(() => {
        jsonFormatterDom.window.close();
        converterDom.window.close();
    });
});

console.log('Delete functionality tests completed. Run with: npm test delete-functionality.test.js');