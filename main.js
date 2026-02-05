/**
 * Smart Channel Swapper - UXP Plugin for Photoshop
 * 
 * Calculates optimal Smart Channel Swapper settings to transform source colors 
 * to target colors using least squares optimization.
 * 
 * @license MIT
 */

const { app, core } = require('photoshop');
const { executeAsModal } = core;

// Store color pairs: [{id, source: {r,g,b}, target: {r,g,b}}, ...]
let colorPairs = [];
let nextPairId = 1;

// ============================================================================
// UI Event Handlers
// ============================================================================

// Add new color pair
document.getElementById('addPairBtn').addEventListener('click', () => {
    addColorPair();
});

document.getElementById('calculateBtn').addEventListener('click', async () => {
    // Get all pairs that have both source and target
    const validPairs = colorPairs.filter(p => p.source && p.target);
    
    if (validPairs.length === 0) {
        showResult('Please add at least one complete color pair (source + target).');
        return;
    }

    const preventClipping = document.getElementById('clippingToggle').checked;
    
    try {
        const sourceColors = validPairs.map(p => p.source);
        const targetColors = validPairs.map(p => p.target);
        
        const matrix = computeChannelSwapperMatrix(
            sourceColors,
            targetColors,
            preventClipping
        );
        
        // Format and display results
        const resultText = formatMatrixForDisplay(matrix);
        showResult(resultText);
        
        // Apply to Smart Channel Swapper layer
        await executeAsModal(
            () => applyChannelSwapperSettings(matrix),
            { commandName: 'Apply Smart Channel Swapper Settings' }
        );
    } catch (err) {
        console.error('Error calculating:', err);
        showResult('Error: ' + err.message);
    }
});

// ============================================================================
// Color Pair Management
// ============================================================================

function addColorPair() {
    const id = nextPairId++;
    const pair = { id, source: null, target: null };
    colorPairs.push(pair);
    renderColorPairs();
    showResult(`Added color pair #${colorPairs.length}`);
}

function removeColorPair(id) {
    colorPairs = colorPairs.filter(p => p.id !== id);
    renderColorPairs();
    showResult(`Color pair removed. ${colorPairs.length} pair(s) remaining.`);
}

function setSourceForPair(id) {
    const pair = colorPairs.find(p => p.id === id);
    if (pair) {
        pair.source = getCurrentForegroundColor();
        renderColorPairs();
        showResult(`Source set for pair: RGB(${pair.source.r}, ${pair.source.g}, ${pair.source.b})`);
    }
}

function setTargetForPair(id) {
    const pair = colorPairs.find(p => p.id === id);
    if (pair) {
        pair.target = getCurrentForegroundColor();
        renderColorPairs();
        showResult(`Target set for pair: RGB(${pair.target.r}, ${pair.target.g}, ${pair.target.b})`);
    }
}

function renderColorPairs() {
    const container = document.getElementById('colorPairsList');
    
    if (colorPairs.length === 0) {
        container.innerHTML = '<div class="empty-state">Click "+ Add Pair" to start</div>';
        return;
    }
    
    // Check if any color has been set
    const hasAnyColor = colorPairs.some(pair => pair.source !== null || pair.target !== null);
    
    // Show help message if no colors have been set yet
    let helpMessage = '';
    if (!hasAnyColor) {
        helpMessage = '<div class="color-help">Click color squares to set from foreground</div>';
    }
    
    const pairsHTML = colorPairs.map((pair, index) => {
        const hasSource = pair.source !== null;
        const hasTarget = pair.target !== null;
        
        const sourceStyle = hasSource 
            ? `background-color: rgb(${pair.source.r}, ${pair.source.g}, ${pair.source.b});` 
            : '';
        const targetStyle = hasTarget 
            ? `background-color: rgb(${pair.target.r}, ${pair.target.g}, ${pair.target.b});` 
            : '';
        
        const sourceClass = hasSource ? 'color-swatch' : 'color-swatch empty';
        const targetClass = hasTarget ? 'color-swatch' : 'color-swatch empty';
        
        const sourceText = hasSource 
            ? `Source: RGB(${pair.source.r}, ${pair.source.g}, ${pair.source.b})` 
            : 'Click to set source color';
        const targetText = hasTarget 
            ? `Target: RGB(${pair.target.r}, ${pair.target.g}, ${pair.target.b})` 
            : 'Click to set target color';
        
        return `
            <div class="color-pair" data-id="${pair.id}">
                <span class="pair-number">${index + 1}</span>
                <div class="${sourceClass}" style="${sourceStyle}" title="${sourceText}" data-action="setSource" data-pair-id="${pair.id}"></div>
                <span class="arrow">→</span>
                <div class="${targetClass}" style="${targetStyle}" title="${targetText}" data-action="setTarget" data-pair-id="${pair.id}"></div>
                <button class="remove-btn" data-action="remove" data-pair-id="${pair.id}" title="Remove pair">✕</button>
            </div>
        `;
    }).join('');
    
    container.innerHTML = helpMessage + pairsHTML;
}

// Set up event delegation once on page load (not on every render)
function initializeEventListeners() {
    const container = document.getElementById('colorPairsList');
    
    container.addEventListener('click', (e) => {
        // Find the element with data-action (could be the target or a parent)
        const actionElement = e.target.closest('[data-action]');
        if (!actionElement) return;
        
        const action = actionElement.dataset.action;
        const pairId = parseInt(actionElement.dataset.pairId, 10);
        
        if (!action || isNaN(pairId)) return;
        
        if (action === 'remove') {
            removeColorPair(pairId);
        } else if (action === 'setSource') {
            setSourceForPair(pairId);
        } else if (action === 'setTarget') {
            setTargetForPair(pairId);
        }
    });
}

// Initialize on page load
initializeEventListeners();
renderColorPairs();

// ============================================================================
// Photoshop Integration
// ============================================================================

const batchPlay = require('photoshop').action.batchPlay;
const LAYER_NAME = 'Smart Channel Swapper';

/**
 * Create a Smart Channel Swapper adjustment layer with the specified settings.
 * Replaces any existing helper layer and removes the auto-created mask.
 * 
 * Note: Photoshop internally uses "grain" for green channel (legacy naming)
 * 
 * @param {Object} settings - Smart Channel Swapper values (redRed, redGreen, etc.)
 */
async function createChannelSwapperWithSettings(settings) {
    const doc = app.activeDocument;
    
    // Delete existing helper layer if present
    for (const layer of doc.layers) {
        if (layer.name === LAYER_NAME) {
            await batchPlay([{
                _obj: 'delete',
                _target: [{ _ref: 'layer', _id: layer.id }]
            }], {});
            break;
        }
    }
    
    // Build the Smart Channel Swapper descriptor
    const channelMixerDescriptor = {
        _obj: 'channelMixer', // Photoshop API: do not change
        presetKind: { _enum: 'presetKindType', _value: 'presetKindCustom' },
        monochromatic: false,
        red: {
            _obj: 'channelMatrix',
            red:      { _unit: 'percentUnit', _value: settings.redRed },
            grain:    { _unit: 'percentUnit', _value: settings.redGreen },
            blue:     { _unit: 'percentUnit', _value: settings.redBlue },
            constant: { _unit: 'percentUnit', _value: settings.redConst }
        },
        grain: {
            _obj: 'channelMatrix',
            red:      { _unit: 'percentUnit', _value: settings.greenRed },
            grain:    { _unit: 'percentUnit', _value: settings.greenGreen },
            blue:     { _unit: 'percentUnit', _value: settings.greenBlue },
            constant: { _unit: 'percentUnit', _value: settings.greenConst }
        },
        blue: {
            _obj: 'channelMatrix',
            red:      { _unit: 'percentUnit', _value: settings.blueRed },
            grain:    { _unit: 'percentUnit', _value: settings.blueGreen },
            blue:     { _unit: 'percentUnit', _value: settings.blueBlue },
            constant: { _unit: 'percentUnit', _value: settings.blueConst }
        }
    };

    // Create the adjustment layer
    await batchPlay([{
        _obj: 'make',
        _target: [{ _ref: 'adjustmentLayer' }],
        using: {
            _obj: 'adjustmentLayer',
            name: LAYER_NAME,
            type: channelMixerDescriptor
        }
    }], {});

    // Delete the auto-created mask so eyedropper samples from image, not mask
    const helperLayer = doc.layers.find(l => l.name === LAYER_NAME);
    if (helperLayer) {
        await batchPlay([
            { _obj: 'select', _target: [{ _ref: 'channel', _enum: 'channel', _value: 'mask' }] },
            { _obj: 'delete', _target: [{ _ref: 'channel', _enum: 'channel', _value: 'mask' }] }
        ], {});
    }
}

/**
 * Get the current foreground color from Photoshop.
 * @returns {{r: number, g: number, b: number}} RGB values (0-255)
 */
function getCurrentForegroundColor() {
    const fg = app.foregroundColor;
    return {
        r: Math.round(fg.rgb.red),
        g: Math.round(fg.rgb.green),
        b: Math.round(fg.rgb.blue)
    };
}

/**
 * Apply the computed Smart Channel Swapper matrix to Photoshop.
 * @param {number[][]} matrix - 3x3 matrix of percentages
 */
async function applyChannelSwapperSettings(matrix) {
    if (!app.activeDocument) {
        throw new Error('No document open');
    }
    
    await createChannelSwapperWithSettings({
        redRed:     Math.round(matrix[0][0]),
        redGreen:   Math.round(matrix[0][1]),
        redBlue:    Math.round(matrix[0][2]),
        redConst:   0,
        greenRed:   Math.round(matrix[1][0]),
        greenGreen: Math.round(matrix[1][1]),
        greenBlue:  Math.round(matrix[1][2]),
        greenConst: 0,
        blueRed:    Math.round(matrix[2][0]),
        blueGreen:  Math.round(matrix[2][1]),
        blueBlue:   Math.round(matrix[2][2]),
        blueConst:  0
    });
}

// ============================================================================
// Matrix Computation (Least Squares Optimization)
// ============================================================================

/**
 * Compute optimal 3x3 Smart Channel Swapper matrix to transform source colors to targets.
 * 
 * Uses least squares optimization to find the best matrix M where:
 *   source_RGB × M^T ≈ target_RGB
 * 
 * @param {Array<{r,g,b}>} sourceColors - Source colors (0-255)
 * @param {Array<{r,g,b}>} targetColors - Target colors (0-255)
 * @param {boolean} preventClipping - Constrain row sums to prevent clipping
 * @param {number} maxSum - Maximum absolute row sum in percent (default: 100)
 * @returns {number[][]} 3x3 matrix of percentages
 */
function computeChannelSwapperMatrix(sourceColors, targetColors, preventClipping = true, maxSum = 100) {
    // Normalize colors to [0, 1]
    const src = sourceColors.map(c => [c.r / 255, c.g / 255, c.b / 255]);
    const tgt = targetColors.map(c => [c.r / 255, c.g / 255, c.b / 255]);
    
    const matrix = [];
    
    // Solve for each output channel independently
    for (let channel = 0; channel < 3; channel++) {
        const targetValues = tgt.map(t => t[channel]);
        const weights = solveLeastSquares(src, targetValues);
        
        // Convert to percentages
        let row = weights.map(w => w * 100);
        
        // Apply clipping prevention by scaling if row sum exceeds bounds
        if (preventClipping) {
            const rowSum = row.reduce((sum, val) => sum + val, 0);
            if (Math.abs(rowSum) > maxSum) {
                const scale = maxSum / Math.abs(rowSum);
                row = row.map(v => v * scale);
            }
        }
        
        // Clamp values to Photoshop's valid range
        row = row.map(v => Math.max(-200, Math.min(200, v)));
        matrix.push(row);
    }
    
    return matrix;
}

/**
 * Solve least squares: find w that minimizes ||A*w - b||²
 * Uses normal equations: w = (A^T * A)^(-1) * A^T * b
 * 
 * @param {number[][]} A - Matrix of coefficients (n × m)
 * @param {number[]} b - Target vector (n × 1)
 * @returns {number[]} Solution vector (m × 1)
 */
function solveLeastSquares(A, b) {
    const n = A.length;
    const m = A[0].length;
    
    // Compute A^T * A (m × m matrix)
    const ATA = Array.from({ length: m }, (_, i) =>
        Array.from({ length: m }, (_, j) =>
            A.reduce((sum, row) => sum + row[i] * row[j], 0)
        )
    );
    
    // Compute A^T * b (m × 1 vector)
    const ATb = Array.from({ length: m }, (_, i) =>
        A.reduce((sum, row, k) => sum + row[i] * b[k], 0)
    );
    
    // Add small regularization for numerical stability
    const epsilon = 1e-10;
    for (let i = 0; i < m; i++) {
        ATA[i][i] += epsilon;
    }
    
    return solveLinearSystem(ATA, ATb);
}

/**
 * Solve linear system Ax = b using Gaussian elimination with partial pivoting.
 * 
 * @param {number[][]} A - Coefficient matrix (n × n)
 * @param {number[]} b - Right-hand side vector (n × 1)
 * @returns {number[]} Solution vector (n × 1)
 */
function solveLinearSystem(A, b) {
    const n = A.length;
    
    // Create augmented matrix [A|b]
    const aug = A.map((row, i) => [...row, b[i]]);
    
    // Forward elimination with partial pivoting
    for (let col = 0; col < n; col++) {
        // Find pivot row
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
                maxRow = row;
            }
        }
        [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
        
        // Skip if pivot is essentially zero (singular matrix)
        if (Math.abs(aug[col][col]) < 1e-12) continue;
        
        // Eliminate column below pivot
        for (let row = col + 1; row < n; row++) {
            const factor = aug[row][col] / aug[col][col];
            for (let j = col; j <= n; j++) {
                aug[row][j] -= factor * aug[col][j];
            }
        }
    }
    
    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        if (Math.abs(aug[i][i]) < 1e-12) {
            x[i] = i === 0 ? 1 : 0; // Default for singular case
            continue;
        }
        x[i] = aug[i][n];
        for (let j = i + 1; j < n; j++) {
            x[i] -= aug[i][j] * x[j];
        }
        x[i] /= aug[i][i];
    }
    
    return x;
}

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Display a message in the results output area.
 * @param {string} text - Message to display
 */
function showResult(text) {
    document.getElementById('resultsOutput').textContent = text;
}

/**
 * Format the computed matrix as human-readable text.
 * @param {number[][]} matrix - 3x3 matrix of percentages
 * @returns {string} Formatted display string
 */
function formatMatrixForDisplay(matrix) {
    const channels = ['Red', 'Green', 'Blue'];
    const lines = ['Smart Channel Swapper Settings:', ''];
    
    for (let i = 0; i < 3; i++) {
        lines.push(`${channels[i]} Output:`);
        for (let j = 0; j < 3; j++) {
            const value = Math.round(matrix[i][j]);
            lines.push(`  ${channels[j]}: ${value >= 0 ? '+' : ''}${value}%`);
        }
        lines.push('');
    }
    
    return lines.join('\n');
}

// ============================================================================
// Initialization
// ============================================================================

initializeEventListeners();
renderColorPairs();