/**
 * Scientific Calculator with Graph Plotter
 * Features: Scientific calculations, function plotting, history integration
 */

class ScientificCalculator {
    constructor() {
        this.currentExpression = '';
        this.angleMode = 'deg';
        this.graphFunctions = [];
        this.graphState = {
            xMin: -10,
            xMax: 10,
            yMin: -10,
            yMax: 10,
            width: 0,
            height: 0
        };
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.localHistory = [];
        this.fontSize = parseInt(localStorage.getItem('scientific-calculator-fontSize') || '16');

        this.functionExamples = {
            quadratic: 'x^2',
            sine: 'sin(x)',
            exponential: 'e^x',
            logarithmic: 'ln(x)',
            polynomial: 'x^3 - 2*x^2 + x - 1',
            trigonometric: 'sin(x) + cos(2*x)',
            rational: '1/x',
            absolute: 'abs(x)'
        };

        this.init();
    }

    init() {
        this.updateDisplay();
        this.configMath();
        this.setupEventListeners();
        this.updateZoomInputs();
        this.loadLocalHistory();
        this.updatePopupPositions();
        this.applyFontSize();
        setTimeout(() => this.initGraph(), 100);
    }

    configMath() {
        if (typeof math !== 'undefined') {
            math.config({ angles: this.angleMode });
        }
    }

    setupEventListeners() {
        // Graph canvas events
        const canvas = document.getElementById('graphCanvas');
        if (canvas) {
            canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
            canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
            canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
            canvas.addEventListener('wheel', this.onWheel.bind(this));
            canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
        }

        // Function input validation
        const functionInput = document.getElementById('functionInput');
        if (functionInput) {
            functionInput.addEventListener('input', this.validateAndUpdateInput.bind(this));
            functionInput.addEventListener('keyup', this.onFunctionInputKeyup.bind(this));
        }

        // History buttons
        const historyToggle = document.getElementById('historyToggle');
        if (historyToggle) {
            historyToggle.addEventListener('click', this.toggleLocalHistory.bind(this));
        }

        const globalHistoryBtn = document.getElementById('globalHistoryBtn');
        if (globalHistoryBtn) {
            globalHistoryBtn.addEventListener('click', this.toggleGlobalHistory.bind(this));
        }
        
        // Font size controls
        const fontIncreaseBtn = document.getElementById('fontIncreaseBtn');
        const fontDecreaseBtn = document.getElementById('fontDecreaseBtn');
        if (fontIncreaseBtn) {
            fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
        }
        if (fontDecreaseBtn) {
            fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());
        }

        // Overlay click
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.addEventListener('click', this.closeAllPopups.bind(this));
        }

        // Keyboard support
        document.addEventListener('keydown', this.onKeyDown.bind(this));

        // Window resize
        window.addEventListener('resize', () => {
            setTimeout(() => this.initGraph(), 100);
        });

        // Zoom inputs
        ['xMinInput', 'xMaxInput', 'yMinInput', 'yMaxInput'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('keydown', (e) => e.stopPropagation());
            }
        });
    }

    // Calculator Functions
    updateDisplay() {
        const expressionEl = document.getElementById('expression');
        const resultEl = document.getElementById('result');
        if (expressionEl) expressionEl.textContent = this.currentExpression;
        if (!resultEl.textContent || resultEl.textContent === 'Error') {
            if (resultEl) resultEl.textContent = '0';
        }
    }

    appendNumber(num) {
        this.currentExpression += num;
        this.updateDisplay();
    }

    appendOperator(op) {
        if (op === '.') {
            // Prevent multiple decimals in same number
            const parts = this.currentExpression.split(/[\+\-\*\/\(\)]/);
            const lastPart = parts[parts.length - 1];
            if (lastPart.includes('.')) return;
        }
        this.currentExpression += op;
        this.updateDisplay();
    }

    appendFunction(func) {
        this.currentExpression += func;
        this.updateDisplay();
    }

    appendConstant(constant) {
        this.currentExpression += constant;
        this.updateDisplay();
    }

    backspace() {
        this.currentExpression = this.currentExpression.slice(0, -1);
        this.updateDisplay();
    }

    clearEntry() {
        this.currentExpression = '';
        this.updateDisplay();
        const resultEl = document.getElementById('result');
        if (resultEl) resultEl.textContent = '0';
    }

    clearAll() {
        this.currentExpression = '';
        this.updateDisplay();
        const resultEl = document.getElementById('result');
        if (resultEl) resultEl.textContent = '0';
        this.setStatusText('Calculator cleared');
    }

    updateAngleMode() {
        const selected = document.querySelector('input[name="angleMode"]:checked');
        if (selected) {
            this.angleMode = selected.value;
            this.configMath();
        }
    }

    calculate() {
        if (!this.currentExpression.trim()) return;

        try {
            // Replace constants and functions for math.js
            let expr = this.currentExpression
                .replace(/pi/g, 'pi')
                .replace(/e(?![a-z])/g, 'e')
                .replace(/\^/g, '^')
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/√/g, 'sqrt')
                .replace(/factorial\(/g, '')
                .replace(/!\)/g, '!');

            // Handle implicit multiplication
            expr = expr.replace(/(\d)(pi|e|sin|cos|tan|log|ln|sqrt)/g, '$1*$2');
            expr = expr.replace(/(pi|e|\))(\d)/g, '$1*$2');
            expr = expr.replace(/(\d)\(/g, '$1*(');
            expr = expr.replace(/\)(\d)/g, ')*$1');

            const result = math.evaluate(expr);
            const resultText = this.formatResult(result);

            const resultEl = document.getElementById('result');
            if (resultEl) resultEl.textContent = resultText;

            this.setStatusText('Calculated successfully');

        } catch (error) {
            const resultEl = document.getElementById('result');
            if (resultEl) resultEl.textContent = 'Error';
            this.setStatusText('Error: ' + error.message);
        }
    }

    formatResult(result) {
        if (typeof result === 'number') {
            if (Math.abs(result) < 0.0001 && result !== 0) {
                return result.toExponential(6);
            }
            return result.toString();
        }
        return result.toString();
    }

    plotCurrentExpression() {
        if (!this.currentExpression.trim()) return;
        const functionInput = document.getElementById('functionInput');
        if (functionInput) {
            functionInput.value = this.currentExpression;
            this.plotFunction();
        }
    }

    // Graph Functions
    initGraph() {
        const canvas = document.getElementById('graphCanvas');
        if (!canvas) return;

        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        this.graphState.width = canvas.width;
        this.graphState.height = canvas.height;

        this.drawGrid();
        this.plotAllFunctions();
    }

    drawGrid() {
        const canvas = document.getElementById('graphCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Calculate step sizes
        const xRange = this.graphState.xMax - this.graphState.xMin;
        const yRange = this.graphState.yMax - this.graphState.yMin;
        const xStep = this.calculateNiceStep(xRange / 10);
        const yStep = this.calculateNiceStep(yRange / 10);
        
        // Draw minor grid
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 0.5;
        
        const xMinorStep = xStep / 5;
        const yMinorStep = yStep / 5;
        
        // Minor vertical lines
        for (let x = Math.ceil(this.graphState.xMin / xMinorStep) * xMinorStep; x <= this.graphState.xMax; x += xMinorStep) {
            const canvasX = ((x - this.graphState.xMin) / (this.graphState.xMax - this.graphState.xMin)) * canvas.width;
            ctx.beginPath();
            ctx.moveTo(canvasX, 0);
            ctx.lineTo(canvasX, canvas.height);
            ctx.stroke();
        }
        
        // Minor horizontal lines
        for (let y = Math.ceil(this.graphState.yMin / yMinorStep) * yMinorStep; y <= this.graphState.yMax; y += yMinorStep) {
            const canvasY = canvas.height - ((y - this.graphState.yMin) / (this.graphState.yMax - this.graphState.yMin)) * canvas.height;
            ctx.beginPath();
            ctx.moveTo(0, canvasY);
            ctx.lineTo(canvas.width, canvasY);
            ctx.stroke();
        }

        // Draw major grid with labels
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        
        // Major vertical lines with X labels
        for (let x = Math.ceil(this.graphState.xMin / xStep) * xStep; x <= this.graphState.xMax; x += xStep) {
            const canvasX = ((x - this.graphState.xMin) / (this.graphState.xMax - this.graphState.xMin)) * canvas.width;
            ctx.beginPath();
            ctx.moveTo(canvasX, 0);
            ctx.lineTo(canvasX, canvas.height);
            ctx.stroke();
            
            if (Math.abs(x) > 0.0001 || x === 0) {
                const label = this.formatNumber(x);
                const zeroY = canvas.height - ((-this.graphState.yMin) / (this.graphState.yMax - this.graphState.yMin)) * canvas.height;
                const labelY = Math.min(Math.max(zeroY + 15, 15), canvas.height - 5);
                ctx.fillText(label, canvasX, labelY);
            }
        }

        // Major horizontal lines with Y labels
        ctx.textAlign = 'left';
        for (let y = Math.ceil(this.graphState.yMin / yStep) * yStep; y <= this.graphState.yMax; y += yStep) {
            const canvasY = canvas.height - ((y - this.graphState.yMin) / (this.graphState.yMax - this.graphState.yMin)) * canvas.height;
            ctx.beginPath();
            ctx.moveTo(0, canvasY);
            ctx.lineTo(canvas.width, canvasY);
            ctx.stroke();
            
            if (Math.abs(y) > 0.0001 || y === 0) {
                const label = this.formatNumber(y);
                const zeroX = ((-this.graphState.xMin) / (this.graphState.xMax - this.graphState.xMin)) * canvas.width;
                const labelX = Math.max(zeroX + 5, 5);
                if (labelX < canvas.width - 30) {
                    ctx.fillText(label, labelX, canvasY - 3);
                }
            }
        }

        // Draw axes
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;

        // X-axis
        const zeroY = canvas.height - ((-this.graphState.yMin) / (this.graphState.yMax - this.graphState.yMin)) * canvas.height;
        if (zeroY >= 0 && zeroY <= canvas.height) {
            ctx.beginPath();
            ctx.moveTo(0, zeroY);
            ctx.lineTo(canvas.width, zeroY);
            ctx.stroke();
        }

        // Y-axis
        const zeroX = ((-this.graphState.xMin) / (this.graphState.xMax - this.graphState.xMin)) * canvas.width;
        if (zeroX >= 0 && zeroX <= canvas.width) {
            ctx.beginPath();
            ctx.moveTo(zeroX, 0);
            ctx.lineTo(zeroX, canvas.height);
            ctx.stroke();
        }
    }

    plotFunction() {
        const input = document.getElementById('functionInput');
        if (!input || !input.value.trim()) return;
        
        const validation = this.validateFunction(input.value.trim());
        if (!validation.valid) {
            this.setStatusText('Cannot plot: ' + validation.error);
            return;
        }

        this.graphFunctions = [{ expr: input.value.trim(), color: '#4a90e2', id: Date.now() }];
        this.plotAllFunctions();
        this.updateLegend();
        this.saveToHistory(input.value.trim(), 'plot');
    }

    addToGraph() {
        const input = document.getElementById('functionInput');
        if (!input || !input.value.trim()) return;
        
        const validation = this.validateFunction(input.value.trim());
        if (!validation.valid) {
            this.setStatusText('Cannot add: ' + validation.error);
            return;
        }

        const colors = ['#4a90e2', '#ff6b35', '#388e3c', '#9c27b0', '#ff9800', '#e91e63', '#00bcd4', '#8bc34a'];
        const color = colors[this.graphFunctions.length % colors.length];

        this.graphFunctions.push({ expr: input.value.trim(), color: color, id: Date.now() });
        this.plotAllFunctions();
        this.updateLegend();
        this.saveToHistory(input.value.trim(), 'add');
    }

    plotAllFunctions() {
        this.drawGrid();
        
        this.graphFunctions.forEach(func => {
            this.plotSingleFunction(func, func.color);
        });

        this.setStatusText(`Plotted ${this.graphFunctions.length} function(s)`);
    }

    plotSingleFunction(functionObj, color) {
        const canvas = document.getElementById('graphCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const expression = typeof functionObj === 'string' ? functionObj : functionObj.expr;
        const isDerivative = functionObj.isDerivative || false;

        try {
            let expr = expression
                .replace(/derivative\(/g, '')
                .replace(/pi/g, 'pi')
                .replace(/e(?![a-z])/g, 'e')
                .replace(/\^/g, '^')
                .replace(/×/g, '*')
                .replace(/÷/g, '/')
                .replace(/√/g, 'sqrt');
            
            if (isDerivative && expr.endsWith(')')) {
                expr = expr.slice(0, -1);
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = isDerivative ? 1.5 : 2;
            if (isDerivative) {
                ctx.setLineDash([5, 5]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.beginPath();

            let firstPoint = true;
            const step = (this.graphState.xMax - this.graphState.xMin) / (canvas.width * 2);

            for (let x = this.graphState.xMin; x <= this.graphState.xMax; x += step) {
                try {
                    let y;
                    
                    if (isDerivative) {
                        y = this.numericalDerivative(expr, x);
                    } else {
                        y = math.evaluate(expr, { x: x });
                    }

                    if (typeof y === 'number' && isFinite(y)) {
                        const canvasX = ((x - this.graphState.xMin) / (this.graphState.xMax - this.graphState.xMin)) * canvas.width;
                        const canvasY = canvas.height - ((y - this.graphState.yMin) / (this.graphState.yMax - this.graphState.yMin)) * canvas.height;

                        if (canvasY >= -100 && canvasY <= canvas.height + 100) {
                            if (firstPoint) {
                                ctx.moveTo(canvasX, canvasY);
                                firstPoint = false;
                            } else {
                                ctx.lineTo(canvasX, canvasY);
                            }
                        } else {
                            firstPoint = true;
                        }
                    } else {
                        firstPoint = true;
                    }
                } catch (e) {
                    firstPoint = true;
                }
            }

            ctx.stroke();
            ctx.setLineDash([]);

        } catch (error) {
            this.setStatusText('Error plotting function: ' + error.message);
        }
    }

    clearGraph() {
        this.graphFunctions = [];
        this.drawGrid();
        this.updateLegend();
        this.setStatusText('Graph cleared');
    }

    resetZoom() {
        this.graphState.xMin = -10;
        this.graphState.xMax = 10;
        this.graphState.yMin = -10;
        this.graphState.yMax = 10;
        this.updateZoomInputs();
        this.plotAllFunctions();
        this.setGraphInfo('View reset to (-10,10) x (-10,10)');
    }

    calculateNiceStep(roughStep) {
        const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
        const normalizedStep = roughStep / magnitude;
        
        if (normalizedStep <= 1) return magnitude;
        if (normalizedStep <= 2) return 2 * magnitude;
        if (normalizedStep <= 5) return 5 * magnitude;
        return 10 * magnitude;
    }

    formatNumber(num) {
        if (Math.abs(num) < 0.0001 && num !== 0) return num.toExponential(1);
        if (Math.abs(num) >= 1000) return num.toExponential(1);
        if (num === Math.floor(num)) return num.toString();
        return num.toFixed(2).replace(/\.?0+$/, '');
    }

    updateLegend() {
        const legend = document.getElementById('functionLegend');
        if (!legend) return;
        
        if (this.graphFunctions.length === 0) {
            legend.style.display = 'none';
            return;
        }
        
        legend.style.display = 'block';
        legend.innerHTML = this.graphFunctions.map((func) => {
            const displayExpr = func.isDerivative ? 
                `d/dx(${func.originalExpr})` : 
                func.expr;
            const lineStyle = func.isDerivative ? 
                'border-bottom: 2px dashed;' : 
                '';
            
            return `<div class="legend-item">
                <div class="legend-color" style="background-color: ${func.color}; ${lineStyle}"></div>
                <div class="legend-text">${displayExpr}</div>
                <div class="legend-remove" onclick="calculator.removeFunction(${func.id})" title="Remove function">×</div>
            </div>`;
        }).join('');
    }

    removeFunction(id) {
        this.graphFunctions = this.graphFunctions.filter(func => func.id !== id);
        this.plotAllFunctions();
        this.updateLegend();
    }

    loadExample(type) {
        const example = this.functionExamples[type];
        if (example) {
            const input = document.getElementById('functionInput');
            if (input) input.value = example;
        }
    }

    updateZoom() {
        const xMin = parseFloat(document.getElementById('xMinInput').value);
        const xMax = parseFloat(document.getElementById('xMaxInput').value);
        const yMin = parseFloat(document.getElementById('yMinInput').value);
        const yMax = parseFloat(document.getElementById('yMaxInput').value);
        
        if (isNaN(xMin) || isNaN(xMax) || isNaN(yMin) || isNaN(yMax)) return;
        if (xMin >= xMax || yMin >= yMax) return;
        
        this.graphState.xMin = xMin;
        this.graphState.xMax = xMax;
        this.graphState.yMin = yMin;
        this.graphState.yMax = yMax;
        
        this.plotAllFunctions();
    }

    updateZoomInputs() {
        const inputs = {
            xMinInput: this.graphState.xMin,
            xMaxInput: this.graphState.xMax,
            yMinInput: this.graphState.yMin,
            yMaxInput: this.graphState.yMax
        };

        Object.entries(inputs).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.value = value;
        });
    }

    fitToData() {
        if (this.graphFunctions.length === 0) return;
        
        let yValues = [];
        const step = (this.graphState.xMax - this.graphState.xMin) / 1000;
        
        this.graphFunctions.forEach(func => {
            try {
                let expr = func.expr
                    .replace(/pi/g, 'pi')
                    .replace(/e(?![a-z])/g, 'e')
                    .replace(/\^/g, '^')
                    .replace(/×/g, '*')
                    .replace(/÷/g, '/')
                    .replace(/√/g, 'sqrt');
                
                for (let x = this.graphState.xMin; x <= this.graphState.xMax; x += step) {
                    try {
                        const y = math.evaluate(expr, { x: x });
                        if (typeof y === 'number' && isFinite(y)) {
                            yValues.push(y);
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        });
        
        if (yValues.length === 0) return;
        
        const yMin = Math.min(...yValues);
        const yMax = Math.max(...yValues);
        const yPadding = (yMax - yMin) * 0.1;
        
        this.graphState.yMin = yMin - yPadding;
        this.graphState.yMax = yMax + yPadding;
        
        this.updateZoomInputs();
        this.plotAllFunctions();
        
        this.setStatusText('Fitted to data range');
    }

    plotDerivative() {
        const input = document.getElementById('functionInput');
        if (!input || !input.value.trim()) return;
        
        try {
            const colors = ['#4a90e2', '#ff6b35', '#388e3c', '#9c27b0', '#ff9800', '#e91e63', '#00bcd4', '#8bc34a'];
            const color = colors[this.graphFunctions.length % colors.length];
            
            const derivativeExpr = `derivative(${input.value.trim()})`;
            this.graphFunctions.push({ 
                expr: derivativeExpr, 
                color: color, 
                id: Date.now(),
                isDerivative: true,
                originalExpr: input.value.trim()
            });
            
            this.plotAllFunctions();
            this.updateLegend();
            this.setStatusText(`Added derivative of ${input.value.trim()}`);
            this.saveToHistory(`d/dx(${input.value.trim()})`, 'derivative');
            
        } catch (error) {
            this.setStatusText('Error calculating derivative: ' + error.message);
        }
    }

    numericalDerivative(expr, x, h = 0.0001) {
        try {
            const y1 = math.evaluate(expr, { x: x + h });
            const y2 = math.evaluate(expr, { x: x - h });
            return (y1 - y2) / (2 * h);
        } catch (e) {
            return NaN;
        }
    }

    // Event Handlers
    onMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.offsetX;
        this.lastMouseY = e.offsetY;
    }

    onMouseMove(e) {
        // Update coordinate display
        const x = this.graphState.xMin + (e.offsetX / this.graphState.width) * (this.graphState.xMax - this.graphState.xMin);
        const y = this.graphState.yMax - (e.offsetY / this.graphState.height) * (this.graphState.yMax - this.graphState.yMin);
        
        const coordDisplay = document.getElementById('coordinateDisplay');
        if (coordDisplay) {
            coordDisplay.textContent = `x: ${this.formatNumber(x)}, y: ${this.formatNumber(y)}`;
            coordDisplay.style.display = 'block';
        }
        
        if (this.isDragging) {
            const deltaX = e.offsetX - this.lastMouseX;
            const deltaY = e.offsetY - this.lastMouseY;

            const xRange = this.graphState.xMax - this.graphState.xMin;
            const yRange = this.graphState.yMax - this.graphState.yMin;

            const dx = -(deltaX / this.graphState.width) * xRange;
            const dy = (deltaY / this.graphState.height) * yRange;

            this.graphState.xMin += dx;
            this.graphState.xMax += dx;
            this.graphState.yMin += dy;
            this.graphState.yMax += dy;

            this.updateZoomInputs();
            this.plotAllFunctions();

            this.lastMouseX = e.offsetX;
            this.lastMouseY = e.offsetY;
        }
    }

    onMouseUp() {
        this.isDragging = false;
    }

    onWheel(e) {
        e.preventDefault();

        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        
        const mouseX = this.graphState.xMin + (e.offsetX / this.graphState.width) * (this.graphState.xMax - this.graphState.xMin);
        const mouseY = this.graphState.yMax - (e.offsetY / this.graphState.height) * (this.graphState.yMax - this.graphState.yMin);

        this.graphState.xMin = mouseX - (mouseX - this.graphState.xMin) * zoomFactor;
        this.graphState.xMax = mouseX + (this.graphState.xMax - mouseX) * zoomFactor;
        this.graphState.yMin = mouseY - (mouseY - this.graphState.yMin) * zoomFactor;
        this.graphState.yMax = mouseY + (this.graphState.yMax - mouseY) * zoomFactor;

        this.updateZoomInputs();
        this.plotAllFunctions();
    }

    onMouseLeave() {
        const coordDisplay = document.getElementById('coordinateDisplay');
        if (coordDisplay) coordDisplay.style.display = 'none';
    }

    onKeyDown(e) {
        if (document.activeElement.tagName === 'INPUT') return;

        const key = e.key;
        if (key >= '0' && key <= '9') {
            this.appendNumber(key);
        } else if (key === '+') {
            this.appendOperator('+');
        } else if (key === '-') {
            this.appendOperator('-');
        } else if (key === '*') {
            this.appendOperator('*');
        } else if (key === '/') {
            e.preventDefault();
            this.appendOperator('/');
        } else if (key === 'Enter') {
            this.calculate();
        } else if (key === 'Escape') {
            this.clearEntry();
        } else if (key === 'Backspace') {
            this.backspace();
        } else if (key === '.') {
            this.appendOperator('.');
        } else if (key === '(') {
            this.appendOperator('(');
        } else if (key === ')') {
            this.appendOperator(')');
        }
    }

    onFunctionInputKeyup(e) {
        if (e.key === 'Enter') {
            this.plotFunction();
        }
    }

    // Validation
    validateFunction(expr) {
        try {
            if (!expr.trim()) return { valid: false, error: 'Empty function' };
            
            // Test evaluation at a few points
            const testPoints = [0, 1, -1, 0.5, 2];
            let validPoints = 0;
            
            for (const x of testPoints) {
                try {
                    const result = math.evaluate(expr.replace(/\^/g, '^'), { x: x });
                    if (typeof result === 'number' && isFinite(result)) {
                        validPoints++;
                    }
                } catch (e) {
                    // Some functions might not be defined at certain points
                }
            }
            
            if (validPoints === 0) {
                return { valid: false, error: 'Function produces no valid values' };
            }
            
            return { valid: true, error: null };
            
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    validateAndUpdateInput() {
        const input = document.getElementById('functionInput');
        if (!input) return;
        
        const value = input.value;
        
        if (!value.trim()) {
            input.className = 'function-input';
            return;
        }
        
        const validation = this.validateFunction(value);
        
        if (validation.valid) {
            input.className = 'function-input valid';
            this.setStatusText('Function is valid');
        } else {
            input.className = 'function-input error';
            this.setStatusText('Error: ' + validation.error);
        }
    }

    // History Management
    saveToHistory(expression, operation) {
        const historyEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            data: JSON.stringify({ expression: expression }),
            operation: operation,
            preview: `${operation}: ${expression}`
        };

        // Save to local storage
        this.localHistory.unshift(historyEntry);
        if (this.localHistory.length > 20) {
            this.localHistory = this.localHistory.slice(0, 20);
        }
        localStorage.setItem('scientific-calculator-history', JSON.stringify(this.localHistory));

        // Save to global history
        const payload = {
            data: JSON.stringify({ expression: expression }),
            operation: operation
        };

        fetch('/api/history/scientific-calculator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(error => console.error('Failed to save to global history:', error));
    }

    loadLocalHistory() {
        try {
            const saved = localStorage.getItem('scientific-calculator-history');
            this.localHistory = saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Failed to load local history:', error);
            this.localHistory = [];
        }
    }

    toggleLocalHistory() {
        const popup = document.getElementById('historyPopup');
        
        if (popup) {
            if (popup.classList.contains('show')) {
                this.closeHistoryPopup();
            } else {
                this.displayLocalHistory(this.localHistory);
                popup.classList.add('show');
            }
        }
    }

    toggleGlobalHistory() {
        const popup = document.getElementById('globalHistoryPopup');
        
        if (popup) {
            if (popup.classList.contains('show')) {
                this.closeGlobalHistoryPopup();
            } else {
                this.loadGlobalHistory();
                popup.classList.add('show');
            }
        }
    }

    displayLocalHistory(history) {
        const content = document.getElementById('historyContent');
        if (!content) return;

        if (history.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No plotting history yet</p>';
            return;
        }

        const historyHtml = history.map(entry => {
            const data = JSON.parse(entry.data);
            const preview = `${entry.operation}: ${data.expression}`;
            
            return `
                <div class="history-item" data-id="${entry.id}">
                    <div class="history-item-header">
                        <div class="history-item-content">
                            <input type="checkbox" class="history-checkbox" data-id="${entry.id}">
                            <div class="history-meta">
                                <span class="history-id">ID: ${entry.id}</span>
                                <span class="history-date">${this.formatTimestamp(entry.timestamp)} - ${entry.operation}</span>
                            </div>
                        </div>
                        <button class="history-delete-btn" onclick="calculator.deleteHistoryItem('${entry.id}')">×</button>
                    </div>
                    <div class="history-preview" onclick="calculator.loadFromHistory('${entry.id}')">${preview}</div>
                </div>
            `;
        }).join('');

        content.innerHTML = historyHtml;
    }

    displayGlobalHistory(history) {
        const content = document.getElementById('globalHistoryContent');
        if (!content) return;

        if (history.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No global history yet</p>';
            return;
        }

        const historyHtml = history.map(entry => {
            const toolColor = this.getToolColor(entry.tool_name);
            
            return `
                <div class="history-item" data-id="${entry.id}">
                    <div class="history-item-header">
                        <div class="history-item-content">
                            <input type="checkbox" class="history-checkbox" data-id="${entry.id}">
                            <div class="history-meta">
                                <span class="history-id">ID: ${entry.id}</span>
                                <span class="history-date">${this.formatTimestamp(entry.timestamp)} - ${entry.operation}</span>
                                <span class="tool-label" style="background-color: ${toolColor};">${entry.tool_name}</span>
                            </div>
                        </div>
                        <button class="history-delete-btn" onclick="calculator.deleteGlobalHistoryItem('${entry.id}')">×</button>
                    </div>
                    <div class="history-preview" onclick="calculator.loadFromGlobalHistory('${entry.id}')">${entry.preview}</div>
                </div>
            `;
        }).join('');

        content.innerHTML = historyHtml;
    }

    loadGlobalHistory() {
        fetch('/api/global-history?limit=50')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.displayGlobalHistory(data.history);
                }
            })
            .catch(error => console.error('Failed to load global history:', error));
    }

    loadFromHistory(entryId) {
        const entry = this.localHistory.find(h => h.id === entryId);
        if (entry) {
            const data = JSON.parse(entry.data);
            const input = document.getElementById('functionInput');
            if (input) {
                input.value = data.expression;
                this.closeHistoryPopup();
                this.plotFunction();
            }
        }
    }

    loadFromGlobalHistory(entryId) {
        fetch(`/api/global-history-entry/${entryId}`)
            .then(response => response.json())
            .then(entry => {
                if (entry && entry.tool_name === 'scientific-calculator') {
                    const data = JSON.parse(entry.data);
                    const input = document.getElementById('functionInput');
                    if (input) {
                        input.value = data.expression;
                        this.closeGlobalHistoryPopup();
                        this.plotFunction();
                    }
                }
            })
            .catch(error => console.error('Failed to load global history entry:', error));
    }

    deleteHistoryItem(entryId) {
        this.localHistory = this.localHistory.filter(h => h.id !== entryId);
        localStorage.setItem('scientific-calculator-history', JSON.stringify(this.localHistory));
        this.displayLocalHistory(this.localHistory);

        // Also delete from global history
        fetch(`/api/history/scientific-calculator/${entryId}`, { method: 'DELETE' })
            .catch(error => console.error('Failed to delete from global history:', error));
    }

    deleteGlobalHistoryItem(entryId) {
        fetch(`/api/global-history-entry/${entryId}`, { method: 'DELETE' })
            .then(() => {
                this.loadGlobalHistory();
            })
            .catch(error => console.error('Failed to delete global history item:', error));
    }

    deleteSelectedHistory() {
        const checkboxes = document.querySelectorAll('#historyPopup .history-checkbox:checked');
        checkboxes.forEach(checkbox => {
            const entryId = checkbox.dataset.id;
            this.deleteHistoryItem(entryId);
        });
    }

    deleteSelectedGlobalHistory() {
        const checkboxes = document.querySelectorAll('#globalHistoryPopup .history-checkbox:checked');
        const promises = Array.from(checkboxes).map(checkbox => {
            const entryId = checkbox.dataset.id;
            return fetch(`/api/global-history-entry/${entryId}`, { method: 'DELETE' });
        });

        Promise.all(promises).then(() => {
            this.loadGlobalHistory();
        }).catch(error => console.error('Failed to delete selected global history:', error));
    }

    clearLocalHistory() {
        this.localHistory = [];
        localStorage.removeItem('scientific-calculator-history');
        this.displayLocalHistory(this.localHistory);

        // Also clear tool history
        fetch('/api/history/scientific-calculator', { method: 'DELETE' })
            .catch(error => console.error('Failed to clear global history:', error));
    }

    clearGlobalHistory() {
        fetch('/api/global-history', { method: 'DELETE' })
            .then(() => {
                this.loadGlobalHistory();
            })
            .catch(error => console.error('Failed to clear global history:', error));
    }

    closeHistoryPopup() {
        const popup = document.getElementById('historyPopup');
        if (popup) popup.classList.remove('show');
    }

    closeGlobalHistoryPopup() {
        const popup = document.getElementById('globalHistoryPopup');
        if (popup) popup.classList.remove('show');
    }

    closeAllPopups() {
        this.closeHistoryPopup();
        this.closeGlobalHistoryPopup();
    }

    // Update popup positioning for proper display
    updatePopupPositions() {
        const localPopup = document.getElementById('historyPopup');
        const globalPopup = document.getElementById('globalHistoryPopup');
        
        if (localPopup) {
            localPopup.style.left = '0';
            localPopup.style.right = 'auto';
        }
        
        if (globalPopup) {
            globalPopup.style.right = '0';
            globalPopup.style.left = 'auto';
        }
    }

    // Utility Functions
    formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 0) return `${days}d ago`;
            if (hours > 0) return `${hours}h ago`;
            if (minutes > 0) return `${minutes}m ago`;
            return 'Just now';
        } catch {
            return 'Unknown';
        }
    }

    getToolColor(toolName) {
        const colors = {
            'scientific-calculator': '#4a90e2',
            'json-formatter': '#388e3c',
            'regex-tester': '#9c27b0',
            'text-diff': '#ff9800',
            'cron-parser': '#e91e63'
        };
        return colors[toolName] || '#6b7280';
    }

    setStatusText(text) {
        const statusEl = document.getElementById('statusText');
        if (statusEl) statusEl.textContent = text;
    }

    setGraphInfo(text) {
        const graphInfoEl = document.getElementById('graphInfo');
        if (graphInfoEl) graphInfoEl.textContent = text;
    }
    
    // Font size methods
    increaseFontSize() {
        if (this.fontSize < 24) {
            this.fontSize += 1;
            this.applyFontSize();
            this.saveFontSize();
        }
    }
    
    decreaseFontSize() {
        if (this.fontSize > 8) {
            this.fontSize -= 1;
            this.applyFontSize();
            this.saveFontSize();
        }
    }
    
    applyFontSize() {
        const displayEl = document.getElementById('display');
        const historyListEl = document.getElementById('historyList');
        const functionInputEl = document.getElementById('functionInput');
        
        if (displayEl) displayEl.style.fontSize = `${this.fontSize}px`;
        if (historyListEl) historyListEl.style.fontSize = `${this.fontSize}px`;
        if (functionInputEl) functionInputEl.style.fontSize = `${this.fontSize}px`;
    }
    
    saveFontSize() {
        localStorage.setItem('scientific-calculator-fontSize', this.fontSize.toString());
    }
}

// Global functions for HTML onclick handlers
let calculator;

function appendNumber(num) { calculator.appendNumber(num); }
function appendOperator(op) { calculator.appendOperator(op); }
function appendFunction(func) { calculator.appendFunction(func); }
function appendConstant(constant) { calculator.appendConstant(constant); }
function backspace() { calculator.backspace(); }
function clearEntry() { calculator.clearEntry(); }
function clearAll() { calculator.clearAll(); }
function updateAngleMode() { calculator.updateAngleMode(); }
function calculate() { calculator.calculate(); }
function plotCurrentExpression() { calculator.plotCurrentExpression(); }
function plotFunction() { calculator.plotFunction(); }
function addToGraph() { calculator.addToGraph(); }
function plotDerivative() { calculator.plotDerivative(); }
function clearGraph() { calculator.clearGraph(); }
function resetZoom() { calculator.resetZoom(); }
function updateZoom() { calculator.updateZoom(); }
function fitToData() { calculator.fitToData(); }
function loadExample(type) { calculator.loadExample(type); }
function closeHistoryPopup() { calculator.closeHistoryPopup(); }
function closeGlobalHistoryPopup() { calculator.closeGlobalHistoryPopup(); }
function deleteSelectedHistory() { calculator.deleteSelectedHistory(); }
function deleteSelectedGlobalHistory() { calculator.deleteSelectedGlobalHistory(); }
function clearLocalHistory() { calculator.clearLocalHistory(); }
function clearGlobalHistory() { calculator.clearGlobalHistory(); }

// Initialize when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    calculator = new ScientificCalculator();
});