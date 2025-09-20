/**
 * Tests for source selector state management and pagination functionality
 */

// Mock localStorage for testing
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => store[key] = value.toString(),
        removeItem: (key) => delete store[key],
        clear: () => store = {}
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

// Import source selector classes (would need to be adapted for actual test environment)
// For now, this is a structure showing what should be tested

describe('ExplorerState', () => {
    let explorerState;

    beforeEach(() => {
        explorerState = new ExplorerState('test-source-123');
    });

    test('should initialize with correct default values', () => {
        expect(explorerState.sourceId).toBe('test-source-123');
        expect(explorerState.expandedPaths).toBeInstanceOf(Set);
        expect(explorerState.expandedPaths.size).toBe(0);
        expect(explorerState.loadedData).toBeInstanceOf(Map);
        expect(explorerState.scrollPosition).toBe(0);
        expect(explorerState.selectedFile).toBeNull();
        expect(explorerState.currentPage).toBe(1);
        expect(explorerState.totalPages).toBe(1);
        expect(explorerState.hasMoreData).toBe(false);
    });

    test('should add and remove expanded paths', () => {
        const path = 's3://bucket/folder/';

        explorerState.addExpandedPath(path);
        expect(explorerState.isExpanded(path)).toBe(true);
        expect(explorerState.expandedPaths.has(path)).toBe(true);

        explorerState.removeExpandedPath(path);
        expect(explorerState.isExpanded(path)).toBe(false);
        expect(explorerState.expandedPaths.has(path)).toBe(false);
    });

    test('should update lastAccessed when paths are modified', () => {
        const initialTime = explorerState.lastAccessed;

        // Wait a bit to ensure time difference
        setTimeout(() => {
            explorerState.addExpandedPath('test/path');
            expect(explorerState.lastAccessed).toBeGreaterThan(initialTime);
        }, 10);
    });

    test('should store and retrieve loaded data with caching', () => {
        const path = 'folder1';
        const testData = [
            { name: 'file1.txt', size: 100 },
            { name: 'file2.txt', size: 200 }
        ];

        explorerState.setLoadedData(path, testData, 1);

        const retrieved = explorerState.getLoadedData(path);
        expect(retrieved).not.toBeNull();
        expect(retrieved.data).toEqual(testData);
        expect(retrieved.page).toBe(1);
        expect(retrieved.timestamp).toBeDefined();
    });

    test('should expire cached data after timeout', (done) => {
        const path = 'folder1';
        const testData = [{ name: 'file1.txt' }];

        explorerState.setLoadedData(path, testData, 1);

        // Mock old timestamp (6 minutes ago)
        explorerState.loadedData.get(path).timestamp = Date.now() - (6 * 60 * 1000);

        const retrieved = explorerState.getLoadedData(path);
        expect(retrieved).toBeNull();
        done();
    });
});

describe('SourceSelectorState', () => {
    let state;

    beforeEach(() => {
        state = new SourceSelectorState();
    });

    test('should initialize with empty state', () => {
        expect(state.explorerStates).toBeInstanceOf(Map);
        expect(state.explorerStates.size).toBe(0);
        expect(state.currentExplorerSourceId).toBeNull();
    });

    test('should create explorer state for new source', () => {
        const sourceId = 'test-source-123';
        const explorerState = state.getExplorerState(sourceId);

        expect(explorerState).toBeInstanceOf(ExplorerState);
        expect(explorerState.sourceId).toBe(sourceId);
        expect(state.explorerStates.has(sourceId)).toBe(true);
    });

    test('should return existing explorer state for known source', () => {
        const sourceId = 'test-source-123';
        const firstCall = state.getExplorerState(sourceId);
        const secondCall = state.getExplorerState(sourceId);

        expect(firstCall).toBe(secondCall);
    });

    test('should cleanup old explorer states', () => {
        const oldSourceId = 'old-source';
        const newSourceId = 'new-source';

        // Create old state (set old timestamp)
        const oldState = state.getExplorerState(oldSourceId);
        oldState.lastAccessed = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago

        // Create new state
        state.getExplorerState(newSourceId);

        // Trigger cleanup
        state.cleanupOldStates();

        expect(state.explorerStates.has(oldSourceId)).toBe(false);
        expect(state.explorerStates.has(newSourceId)).toBe(true);
    });
});

describe('PersistentCache', () => {
    let cache;

    beforeEach(() => {
        localStorageMock.clear();
        cache = new PersistentCache();
    });

    test('should save and load state to localStorage', () => {
        const state = new SourceSelectorState();
        state.currentExplorerSourceId = 'test-source';

        cache.saveState(state);

        const loaded = cache.loadState();
        expect(loaded.currentExplorerSourceId).toBe('test-source');
    });

    test('should handle corrupted localStorage data gracefully', () => {
        localStorageMock.setItem('source-selector-state', 'invalid-json');

        const loaded = cache.loadState();
        expect(loaded).toBeInstanceOf(SourceSelectorState);
        expect(loaded.currentExplorerSourceId).toBeNull();
    });

    test('should cache folder data with proper key generation', () => {
        const sourceId = 'test-source';
        const path = 'folder1';
        const data = { items: [{ name: 'file1.txt' }] };
        const pagination = { page: 1, limit: 50 };

        cache.cacheFolderData(sourceId, path, data, pagination);

        const retrieved = cache.getCachedFolderData(sourceId, path, pagination);
        expect(retrieved).not.toBeNull();
        expect(retrieved.data.items).toEqual(data.items);
    });

    test('should respect cache TTL for folder data', () => {
        const sourceId = 'test-source';
        const path = 'folder1';
        const data = { items: [{ name: 'file1.txt' }] };
        const pagination = { page: 1, limit: 50 };

        cache.cacheFolderData(sourceId, path, data, pagination);

        // Mock old timestamp
        const cacheKey = cache.generateFolderCacheKey(sourceId, path, pagination);
        const cached = JSON.parse(localStorageMock.getItem(cacheKey));
        cached.timestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
        localStorageMock.setItem(cacheKey, JSON.stringify(cached));

        const retrieved = cache.getCachedFolderData(sourceId, path, pagination);
        expect(retrieved).toBeNull();
    });

    test('should clear cache correctly', () => {
        const sourceId = 'test-source';
        cache.cacheFolderData(sourceId, 'path1', { items: [] }, { page: 1, limit: 50 });
        cache.cacheFolderData(sourceId, 'path2', { items: [] }, { page: 1, limit: 50 });

        cache.clearCache(sourceId);

        const retrieved1 = cache.getCachedFolderData(sourceId, 'path1', { page: 1, limit: 50 });
        const retrieved2 = cache.getCachedFolderData(sourceId, 'path2', { page: 1, limit: 50 });

        expect(retrieved1).toBeNull();
        expect(retrieved2).toBeNull();
    });
});

describe('SourceSelector Path Conversion', () => {
    let sourceSelector;

    beforeEach(() => {
        sourceSelector = new SourceSelector({
            containerId: 'test-container',
            showFetchButton: true,
            showEditButton: true
        });
    });

    test('should convert S3 paths correctly', () => {
        const source = { type: 's3' };

        // Test root conversion
        expect(sourceSelector.getRelativePathForAPI('s3://bucket/', source)).toBe('');

        // Test folder conversion
        expect(sourceSelector.getRelativePathForAPI('s3://bucket/folder/', source)).toBe('folder');

        // Test nested folder conversion
        expect(sourceSelector.getRelativePathForAPI('s3://bucket/folder/subfolder/', source)).toBe('folder/subfolder');

        // Test file conversion
        expect(sourceSelector.getRelativePathForAPI('s3://bucket/file.txt', source)).toBe('file.txt');
    });

    test('should convert local file paths correctly', () => {
        const source = {
            type: 'local_file',
            config: { path: '/home/user/documents' }
        };

        // Test subfolder conversion
        expect(sourceSelector.getRelativePathForAPI('/home/user/documents/folder', source)).toBe('folder');

        // Test nested subfolder conversion
        expect(sourceSelector.getRelativePathForAPI('/home/user/documents/folder/subfolder', source)).toBe('folder/subfolder');

        // Test file conversion
        expect(sourceSelector.getRelativePathForAPI('/home/user/documents/file.txt', source)).toBe('file.txt');
    });

    test('should handle empty or null paths', () => {
        const source = { type: 's3' };

        expect(sourceSelector.getRelativePathForAPI('', source)).toBe('');
        expect(sourceSelector.getRelativePathForAPI(null, source)).toBe('');
        expect(sourceSelector.getRelativePathForAPI(undefined, source)).toBe('');
    });

    test('should fallback to original path for unknown source types', () => {
        const source = { type: 'unknown_type' };
        const originalPath = 'some/original/path';

        expect(sourceSelector.getRelativePathForAPI(originalPath, source)).toBe(originalPath);
    });
});

describe('SourceSelector State Management', () => {
    let sourceSelector;

    beforeEach(() => {
        document.body.innerHTML = '<div id="test-container"></div>';
        sourceSelector = new SourceSelector({
            containerId: 'test-container',
            showFetchButton: true,
            showEditButton: true
        });
    });

    test('should clear state when explorer is hidden', () => {
        const sourceId = 'test-source';
        const source = { id: sourceId, type: 's3' };

        // Set up initial state
        sourceSelector.currentExplorerSource = source;
        sourceSelector.state.currentExplorerSourceId = sourceId;

        const explorerState = sourceSelector.state.getExplorerState(sourceId);
        explorerState.addExpandedPath('test/path');
        explorerState.selectedFile = 'test/file.txt';
        explorerState.scrollPosition = 100;

        // Hide explorer panel
        sourceSelector.hideExplorerPanel();

        // Verify state is cleared
        expect(sourceSelector.currentExplorerSource).toBeNull();
        expect(sourceSelector.state.currentExplorerSourceId).toBeNull();
        expect(explorerState.expandedPaths.size).toBe(0);
        expect(explorerState.selectedFile).toBeNull();
        expect(explorerState.scrollPosition).toBe(0);
    });

    test('should refresh only root folder without auto-expansion', () => {
        const sourceId = 'test-source';
        const source = { id: sourceId, type: 's3' };

        sourceSelector.currentExplorerSource = source;
        const explorerState = sourceSelector.state.getExplorerState(sourceId);

        // Set up expanded state
        explorerState.addExpandedPath('folder1');
        explorerState.addExpandedPath('folder2');
        explorerState.setLoadedData('folder1', [{ name: 'file1.txt' }], 1);

        // Mock refresh button
        const mockButton = { classList: { add: jest.fn(), remove: jest.fn() } };

        // Mock fetchSourceDataWithCacheBust
        sourceSelector.fetchSourceDataWithCacheBust = jest.fn().mockResolvedValue(true);

        // Trigger refresh
        sourceSelector.refreshExplorer(mockButton);

        // Verify state is cleared but no auto-expansion occurs
        expect(explorerState.expandedPaths.size).toBe(0);
        expect(explorerState.loadedData.size).toBe(0);
        expect(sourceSelector.fetchSourceDataWithCacheBust).toHaveBeenCalledWith(source);
    });
});

describe('Frontend Integration Tests', () => {
    test('should handle nested folder expansion correctly', async () => {
        // Mock fetch for API calls
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    success: true,
                    items: [
                        { name: 'folder1', is_directory: true, path: 's3://bucket/folder1/' },
                        { name: 'file1.txt', is_directory: false, path: 's3://bucket/file1.txt' }
                    ]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    success: true,
                    items: [
                        { name: 'nested_file.txt', is_directory: false, path: 's3://bucket/folder1/nested_file.txt' }
                    ]
                })
            });

        const sourceSelector = new SourceSelector({
            containerId: 'test-container',
            showFetchButton: true,
            showEditButton: true
        });

        const source = { id: 'test-s3', type: 's3' };

        // Load root folder
        const rootResult = await sourceSelector.loadFolderContents('', source);
        expect(rootResult.success).toBe(true);
        expect(rootResult.items).toHaveLength(2);

        // Load nested folder - should convert path correctly
        const nestedResult = await sourceSelector.loadFolderContents('s3://bucket/folder1/', source);
        expect(nestedResult.success).toBe(true);
        expect(nestedResult.items).toHaveLength(1);

        // Verify path conversion was applied
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('path=folder1&')
        );
    });

    test('should persist state across tool switches', () => {
        const sourceSelector = new SourceSelector({
            containerId: 'test-container',
            showFetchButton: true,
            showEditButton: true
        });

        const sourceId = 'test-source';
        const explorerState = sourceSelector.state.getExplorerState(sourceId);

        // Set up state
        explorerState.addExpandedPath('folder1');
        explorerState.selectedFile = 'folder1/file.txt';
        explorerState.scrollPosition = 200;
        sourceSelector.state.currentExplorerSourceId = sourceId;

        // Save state
        sourceSelector.persistentCache.saveState(sourceSelector.state);

        // Simulate new instance (tool switch)
        const newSourceSelector = new SourceSelector({
            containerId: 'test-container-2',
            showFetchButton: true,
            showEditButton: true
        });

        // Load state
        const loadedState = newSourceSelector.persistentCache.loadState();

        expect(loadedState.currentExplorerSourceId).toBe(sourceId);
        const loadedExplorerState = loadedState.getExplorerState(sourceId);
        expect(loadedExplorerState.expandedPaths.has('folder1')).toBe(true);
        expect(loadedExplorerState.selectedFile).toBe('folder1/file.txt');
        expect(loadedExplorerState.scrollPosition).toBe(200);
    });
});

// Test runner configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ExplorerState,
        SourceSelectorState,
        PersistentCache,
        SourceSelector
    };
}