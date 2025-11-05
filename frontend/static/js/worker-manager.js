/**
 * Worker Manager
 * Manages communication with web workers for heavy processing
 */

class WorkerManager {
    constructor(workerPath) {
        this.workerPath = workerPath;
        this.worker = null;
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.supported = typeof Worker !== 'undefined';
        this.initialized = false;

        if (this.supported) {
            this.initWorker();
        } else {
            console.warn('Web Workers not supported in this browser. Falling back to synchronous processing.');
        }
    }

    /**
     * Initialize the worker
     */
    initWorker() {
        try {
            this.worker = new Worker(this.workerPath);

            this.worker.onmessage = (e) => {
                this.handleWorkerMessage(e.data);
            };

            this.worker.onerror = (error) => {
                console.error('Worker error:', error);
                this.handleWorkerError(error);
            };

            this.initialized = true;
            console.log('Worker initialized:', this.workerPath);
        } catch (error) {
            console.error('Failed to initialize worker:', error);
            this.supported = false;
        }
    }

    /**
     * Handle message from worker
     */
    handleWorkerMessage(data) {
        const { id, success, result, error } = data;

        const request = this.pendingRequests.get(id);
        if (!request) {
            console.warn('Received response for unknown request:', id);
            return;
        }

        // Remove from pending
        this.pendingRequests.delete(id);

        // Resolve or reject promise
        if (success) {
            request.resolve(result);
        } else {
            request.reject(new Error(error.message));
        }
    }

    /**
     * Handle worker error
     */
    handleWorkerError(error) {
        console.error('Worker error:', error);

        // Reject all pending requests
        for (const [id, request] of this.pendingRequests) {
            request.reject(new Error('Worker encountered an error'));
        }
        this.pendingRequests.clear();

        // Try to reinitialize
        this.worker.terminate();
        this.initWorker();
    }

    /**
     * Execute operation in worker
     */
    execute(operation, data, timeout = 30000) {
        return new Promise((resolve, reject) => {
            // If workers not supported, fall back to synchronous processing
            if (!this.supported || !this.initialized) {
                try {
                    const result = this.fallbackSync(operation, data);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
                return;
            }

            // Generate unique request ID
            const id = ++this.requestId;

            // Store promise callbacks
            this.pendingRequests.set(id, { resolve, reject });

            // Set timeout
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Worker operation timed out after ${timeout}ms`));
                }
            }, timeout);

            // Override reject to clear timeout
            const originalReject = reject;
            const wrappedReject = (error) => {
                clearTimeout(timeoutId);
                originalReject(error);
            };

            // Update pending request
            this.pendingRequests.set(id, {
                resolve: (result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                },
                reject: wrappedReject
            });

            // Send message to worker
            this.worker.postMessage({ id, operation, data });
        });
    }

    /**
     * Fallback synchronous processing (when workers not supported)
     */
    fallbackSync(operation, data) {
        // These operations will fall back to the original synchronous code
        // This is just a placeholder - the actual JsonTool methods will be used
        throw new Error(`Worker not available. Operation '${operation}' should be handled by fallback code.`);
    }

    /**
     * Cancel all pending requests
     */
    cancelAll() {
        for (const [id, request] of this.pendingRequests) {
            request.reject(new Error('Request cancelled'));
        }
        this.pendingRequests.clear();
    }

    /**
     * Terminate worker
     */
    terminate() {
        this.cancelAll();

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.initialized = false;
        }
    }

    /**
     * Restart worker
     */
    restart() {
        this.terminate();
        if (this.supported) {
            this.initWorker();
        }
    }

    /**
     * Check if worker is ready
     */
    isReady() {
        return this.supported && this.initialized;
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WorkerManager };
} else if (typeof window !== 'undefined') {
    window.WorkerManager = WorkerManager;
}
