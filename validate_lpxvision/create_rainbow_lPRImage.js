#!/usr/bin/env node

/**
 * Create Rainbow LPRetinaImage from LPXImage
 * 
 * This script reads the rainbow_test_lpximage.lpx file and converts it to a 
 * binary LPRetinaImage object using the pure JavaScript LPXVision algorithm,
 * then saves the result as rainbow_test_js.lpr in binary format.
 * 
 * This is a standalone version that doesn't require the FFI C++ library.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants from LPXVision (extracted from lpx_vision.js)
const INV_2_PI = 1.0 / (2.0 * Math.PI);
const ANG0 = 3.0 * Math.PI / 4.0;
const NUM_IDENTIFIERS = 8;
const NUM_IDENTIFIER_BITS = 3;
const EIGHT_BIT_RANGE = 255.9999;
const DIFFERENCE_BITS = 5;

const identifierName = ['mwh', 'hue', 'mwh_x', 'hue_x', 'mwh_y', 'hue_y', 'mwh_z', 'hue_z'];

/**
 * Read binary LPXImage file format
 */
function readLPXImageBinary(filePath) {
    console.log(`Reading LPXImage from ${filePath}`);
    
    const buffer = fs.readFileSync(filePath);
    let offset = 0;
    
    // Read header information - based on hex dump analysis
    const header1 = buffer.readUInt32LE(offset); offset += 4;
    const header2 = buffer.readUInt32LE(offset); offset += 4; 
    const header3 = buffer.readUInt32LE(offset); offset += 4;
    const spiralPer = buffer.readUInt32LE(offset); offset += 4;
    
    // Skip additional header data
    offset += 16;
    
    // Read cell data
    const remainingBytes = buffer.length - offset;
    const numCells = Math.floor(remainingBytes / 4);
    
    console.log(`Headers: [${header1}, ${header2}, ${header3}], Spiral Period: ${spiralPer}, Cells: ${numCells}`);
    
    const cellArray = [];
    for (let i = 0; i < numCells; i++) {
        cellArray.push(buffer.readUInt32LE(offset));
        offset += 4;
    }
    
    console.log(`Successfully read ${cellArray.length} cells`);
    
    return {
        spiralPer: spiralPer,
        cellArray: cellArray,
        length: numCells,
        x_ofs: 0.0,
        y_ofs: 0.0,
        offset: 0,
        range: undefined,
        foveaPeriods: Math.floor(spiralPer * 0.1)
    };
}

/**
 * Creates LPXImage-compatible object from raw data
 */
function createLPXImageProxy(data) {
    return {
        spiralPer: data.spiralPer || 0,
        cellArray: data.cellArray || [],
        length: data.length || 0,
        x_ofs: data.x_ofs || 0,
        y_ofs: data.y_ofs || 0,
        range: data.range,
        offset: data.offset || 0,
        geometry: {
            getFoveaPeriods: (spPer) => data.foveaPeriods || Math.floor(spPer * 0.1)
        },
        cell: {
            // For rainbow data, extract from RGB format
            extractCell_wht_blk: function(cellData) {
                const r = (cellData >> 16) & 0xFF;
                const g = (cellData >> 8) & 0xFF;
                const b = cellData & 0xFF;
                return Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
            },
            extractCell_grn_red: function(cellData) {
                const r = (cellData >> 16) & 0xFF;
                const g = (cellData >> 8) & 0xFF;
                return Math.floor((g - r) * 4);
            },
            extractCell_yel_blu: function(cellData) {
                const r = (cellData >> 16) & 0xFF;
                const g = (cellData >> 8) & 0xFF;
                const b = cellData & 0xFF;
                return Math.floor(((r + g) / 2 - b) * 4);
            }
        }
    };
}

// LPXVision algorithm functions

function getViewLength(spiralPer) {
    let sp = Math.floor(spiralPer);
    spiralPer = sp + 0.5;
    let vp = Math.round(spiralPer / 3.0);
    let viewlength = Math.round(vp * spiralPer);
    
    while ((viewlength % 4) !== 0) {
        viewlength += 1;
    }
    
    return viewlength;
}

function getColorAngle(myb, mgr, ang) {
    let angle;
    let mag = Math.sqrt(myb * myb + mgr * mgr);
    if (mag < 50) {
        angle = 0.0;
    } else {
        angle = Math.atan2(myb, mgr);
        if (angle < -ang) {
            angle = Math.PI + (Math.PI + angle);
        }
        angle += ang;
    }
    return angle;
}

function getColorDifference(color1, color0) {
    let diff = color1 - color0;
    
    if (diff > Math.PI) {
        diff = diff - 2 * Math.PI;
    } else if (diff < -Math.PI) {
        diff = diff + 2 * Math.PI;
    }
    
    return diff;
}

function setCellBits(n, retinaCells, i, range_bits) {
    retinaCells[i] = (retinaCells[i] | n);
    retinaCells[i] = (retinaCells[i] << range_bits);
}

function rescaleToMinMax(val, movMin, movMax, idx) {
    val = Math.floor(val);
    
    if (val < movMin) {
        val = movMin;
    } else if (val > movMax) {
        val = movMax;
    }
    
    let range = movMax - movMin;
    if (range < 10) {
        range = 10;
    }
    
    val = Math.round(255 * (val - movMin) / range);
    return val;
}

function getMovingMin(mwh, idx, viewlength) {
    let minVal = 1023;
    let minIdx;
    for (let i = idx - viewlength + 1; i <= idx; i += 1) {
        let mwh_i = mwh[i];
        if (mwh_i < minVal) {
            minVal = mwh_i;
            minIdx = i;
        }
    }
    return { minVal: minVal, minIdx: minIdx };
}

function getMovingMax(mwh, idx, viewlength) {
    let maxVal = 0;
    let maxIdx;
    for (let i = idx - viewlength + 1; i <= idx; i += 1) {
        let mwh_i = mwh[i];
        if (mwh_i > maxVal) {
            maxVal = mwh_i;
            maxIdx = i;
        }
    }
    return { maxVal: maxVal, maxIdx: maxIdx };
}

function getMovingMinParams(mwh, j, movMin, movMinIdx, viewlength) {
    let mwh_j = mwh[j];
    if (mwh_j < movMin) {
        movMin = mwh_j;
        movMinIdx = j;
    } else if ((j - viewlength) === movMinIdx) {
        let min = getMovingMin(mwh, j, viewlength);
        movMin = min.minVal;
        movMinIdx = min.minIdx;
    }
    return { minVal: movMin, minIdx: movMinIdx };
}

function getMovingMaxParams(mwh, j, movMax, movMaxIdx, viewlength) {
    let mwh_j = mwh[j];
    if (mwh_j > movMax) {
        movMax = mwh_j;
        movMaxIdx = j;
    } else if ((j - viewlength) === movMaxIdx) {
        let max = getMovingMax(mwh, j, viewlength);
        movMax = max.maxVal;
        movMaxIdx = max.maxIdx;
    }
    return { maxVal: movMax, maxIdx: movMaxIdx };
}

/**
 * Core LPXVision processing function
 */
function createLPXVision(lpImage) {
    console.log('Converting LPXImage to LPRetinaImage using LPXVision algorithm...');
    
    const lpR = {
        spiralPer: lpImage.spiralPer,
        viewlength: getViewLength(lpImage.spiralPer),
        x_ofs: lpImage.x_ofs,
        y_ofs: lpImage.y_ofs,
        numCellTypes: NUM_IDENTIFIERS,
        retinaCells: [],
        startIndex: 0,
        startPer: 0,
        tilt: 0,
        viewIndex: 0,
        getCellIdentifierName: function(i) {
            return identifierName[i];
        }
    };
    
    let spPer = Math.floor(lpImage.spiralPer);
    let cellArray = lpImage.cellArray;
    let foveaOfs = spPer * lpImage.geometry.getFoveaPeriods(spPer);
    let viewlength = lpR.viewlength;
    
    let viewOfs = viewlength + 1;
    let mwhOfs = viewOfs + spPer;
    
    let length = lpImage.length;
    let comparelen = length - foveaOfs;
    
    lpR.length = comparelen;
    
    console.log(`Processing ${comparelen} cells with view length ${viewlength}, fovea offset ${foveaOfs}`);
    
    if (comparelen <= 0 || foveaOfs >= length) {
        console.log('Warning: Invalid cell range, creating minimal retina cells');
        lpR.retinaCells = [0, 0, 0, 0]; // Minimal valid retina cells
        lpR.length = 4;
        return lpR;
    }
    
    // Initialize arrays
    let mwh = new Array(comparelen + mwhOfs);
    let mgr = new Array(comparelen + viewOfs);
    let myb = new Array(comparelen + viewOfs);
    let hue = new Array(comparelen + viewOfs);
    
    // Initialize retina cells
    for (let i = 0; i < comparelen; i++) {
        lpR.retinaCells.push(0);
    }
    
    // Build arrays back one view length
    for (let i = 0; i < mwhOfs && (i + foveaOfs - mwhOfs) < cellArray.length; i++) {
        mwh[i] = lpImage.cell.extractCell_wht_blk(cellArray[i + foveaOfs - mwhOfs]);
    }
    
    // Initialize additional arrays for complete processing
    let mwh_x = new Array(comparelen + mwhOfs);
    let mwh_y = new Array(comparelen + mwhOfs);
    let mwh_z = new Array(comparelen + mwhOfs);
    
    // Initialize mwh_x, mwh_y, mwh_z arrays
    for (let i = 0; i < mwhOfs; i++) {
        if (i < spPer) {
            mwh_x[i] = 0;
            mwh_y[i] = 0;
            mwh_z[i] = 0;
        } else {
            mwh_x[i] = 512 + (mwh[i] - mwh[i-1]) / 4;
            mwh_y[i] = 512 + (mwh[i] - mwh[i-spPer-1]) / 4;
            mwh_z[i] = 512 + (mwh[i] - mwh[i-spPer]) / 4;
        }
    }
    
    // Process main vision cells - FIRST PASS: mwh and hue identifiers
    let mwhMovMin = 0, mwhMovMax = 1023, mwhMovMinIdx = 0, mwhMovMaxIdx = 0;
    
    for (let i = 0; i < comparelen; i += 1) { // Process ALL cells
        let j = i + mwhOfs;
        let k = i + foveaOfs;
        
        if (k < cellArray.length) {
            // Initialize moving min/max on first iteration
            if (i === 0) {
                let min = getMovingMin(mwh, j, viewlength);
                mwhMovMin = min.minVal;
                mwhMovMinIdx = min.minIdx;
                
                let max = getMovingMax(mwh, j, viewlength);
                mwhMovMax = max.maxVal;
                mwhMovMaxIdx = max.maxIdx;
            }
            
            // Extract monochrome identifier
            mwh[j] = lpImage.cell.extractCell_wht_blk(cellArray[k]);
            
            // Update moving min/max parameters
            let min = getMovingMinParams(mwh, j, mwhMovMin, mwhMovMinIdx, viewlength);
            mwhMovMin = min.minVal;
            mwhMovMinIdx = min.minIdx;
            
            let max = getMovingMaxParams(mwh, j, mwhMovMax, mwhMovMaxIdx, viewlength);
            mwhMovMax = max.maxVal;
            mwhMovMaxIdx = max.maxIdx;
            
            // Rescale and set mwh identifier
            let wht = rescaleToMinMax(mwh[j], mwhMovMin, mwhMovMax, j);
            let n = Math.floor(wht);
            n = n >>> DIFFERENCE_BITS;
            setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
            
            // Extract color components
            mgr[j] = lpImage.cell.extractCell_grn_red(cellArray[k]);
            myb[j] = lpImage.cell.extractCell_yel_blu(cellArray[k]);
            
            // Generate hue angle and set hue identifier
            hue[j] = getColorAngle(myb[j], mgr[j], ANG0);
            n = Math.floor(EIGHT_BIT_RANGE * INV_2_PI * hue[j]);
            n = n >>> DIFFERENCE_BITS;
            setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
        }
    }
    
    // SECOND PASS: mwh_x and hue_x identifiers (forward differences along spiral)
    let mwh_xMovMin = 0, mwh_xMovMax = 1023, mwh_xMovMinIdx = 0, mwh_xMovMaxIdx = 0;
    
    for (let i = 0; i < comparelen; i += 1) {
        let j = i + viewOfs;
        
        if (i === 0) {
            let min = getMovingMin(mwh_x, j, viewlength);
            mwh_xMovMin = min.minVal;
            mwh_xMovMinIdx = min.minIdx;
            
            let max = getMovingMax(mwh_x, j, viewlength);
            mwh_xMovMax = max.maxVal;
            mwh_xMovMaxIdx = max.maxIdx;
        }
        
        // Calculate forward difference
        mwh_x[j] = Math.floor(512 + (mwh[j] - mwh[j-1]) / 4);
        
        // Update moving parameters
        let min = getMovingMinParams(mwh_x, j, mwh_xMovMin, mwh_xMovMinIdx, viewlength);
        mwh_xMovMin = min.minVal;
        mwh_xMovMinIdx = min.minIdx;
        
        let max = getMovingMaxParams(mwh_x, j, mwh_xMovMax, mwh_xMovMaxIdx, viewlength);
        mwh_xMovMax = max.maxVal;
        mwh_xMovMaxIdx = max.maxIdx;
        
        // Set mwh_x identifier
        let diff = rescaleToMinMax(mwh_x[j], mwh_xMovMin, mwh_xMovMax, j);
        let n = Math.floor(diff);
        n = n >>> DIFFERENCE_BITS;
        setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
        
        // Set hue_x identifier (color difference)
        let hue_x = getColorDifference(hue[j], hue[j-1]);
        n = Math.floor(EIGHT_BIT_RANGE * INV_2_PI * (hue_x + Math.PI));
        n = n >>> DIFFERENCE_BITS;
        setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
    }
    
    // THIRD PASS: mwh_y and hue_y identifiers (-60 degrees from spiral)
    let mwh_yMovMin = 0, mwh_yMovMax = 1023, mwh_yMovMinIdx = 0, mwh_yMovMaxIdx = 0;
    
    for (let i = 0; i < comparelen; i += 1) {
        let j = i + viewOfs;
        
        if (i === 0) {
            let min = getMovingMin(mwh_y, j, viewlength);
            mwh_yMovMin = min.minVal;
            mwh_yMovMinIdx = min.minIdx;
            
            let max = getMovingMax(mwh_y, j, viewlength);
            mwh_yMovMax = max.maxVal;
            mwh_yMovMaxIdx = max.maxIdx;
        }
        
        // Calculate -60 degree difference
        mwh_y[j] = Math.floor(512 + (mwh[j] - mwh[j-spPer-1]) / 4);
        
        // Update moving parameters
        let min = getMovingMinParams(mwh_y, j, mwh_yMovMin, mwh_yMovMinIdx, viewlength);
        mwh_yMovMin = min.minVal;
        mwh_yMovMinIdx = min.minIdx;
        
        let max = getMovingMaxParams(mwh_y, j, mwh_yMovMax, mwh_yMovMaxIdx, viewlength);
        mwh_yMovMax = max.maxVal;
        mwh_yMovMaxIdx = max.maxIdx;
        
        // Set mwh_y identifier
        let diff = rescaleToMinMax(mwh_y[j], mwh_yMovMin, mwh_yMovMax, j);
        let n = Math.floor(diff);
        n = n >>> DIFFERENCE_BITS;
        setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
        
        // Set hue_y identifier
        let hue_y = getColorDifference(hue[j], hue[j-spPer-1]);
        n = Math.floor(EIGHT_BIT_RANGE * INV_2_PI * (hue_y + Math.PI));
        n = n >>> DIFFERENCE_BITS;
        setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
    }
    
    // FOURTH PASS: mwh_z and hue_z identifiers (-120 degrees from spiral)
    let mwh_zMovMin = 0, mwh_zMovMax = 1023, mwh_zMovMinIdx = 0, mwh_zMovMaxIdx = 0;
    
    for (let i = 0; i < comparelen; i += 1) {
        let j = i + viewOfs;
        
        if (i === 0) {
            let min = getMovingMin(mwh_z, j, viewlength);
            mwh_zMovMin = min.minVal;
            mwh_zMovMinIdx = min.minIdx;
            
            let max = getMovingMax(mwh_z, j, viewlength);
            mwh_zMovMax = max.maxVal;
            mwh_zMovMaxIdx = max.maxIdx;
        }
        
        // Calculate -120 degree difference
        mwh_z[j] = Math.floor(512 + (mwh[j] - mwh[j-spPer]) / 4);
        
        // Update moving parameters
        let min = getMovingMinParams(mwh_z, j, mwh_zMovMin, mwh_zMovMinIdx, viewlength);
        mwh_zMovMin = min.minVal;
        mwh_zMovMinIdx = min.minIdx;
        
        let max = getMovingMaxParams(mwh_z, j, mwh_zMovMax, mwh_zMovMaxIdx, viewlength);
        mwh_zMovMax = max.maxVal;
        mwh_zMovMaxIdx = max.maxIdx;
        
        // Set mwh_z identifier
        let diff = rescaleToMinMax(mwh_z[j], mwh_zMovMin, mwh_zMovMax, j);
        let n = Math.floor(diff);
        n = n >>> DIFFERENCE_BITS;
        setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
        
        // Set hue_z identifier (note: different range_bits = 0 for final identifier)
        let hue_z = getColorDifference(hue[j], hue[j-spPer]);
        n = Math.floor(EIGHT_BIT_RANGE * INV_2_PI * (hue_z + Math.PI));
        n = n >>> DIFFERENCE_BITS;
        setCellBits(n, lpR.retinaCells, i, 0); // Final identifier uses 0 range_bits
    }
    
    console.log(`Generated ${lpR.retinaCells.length} retina cells`);
    return lpR;
}

/**
 * Save LPRetinaImage as binary file
 * Each retina cell is 3 bytes (24 bits) embedded in a 32-bit unsigned int
 */
function saveLPRetinaImageBinary(lpVision, filePath) {
    console.log(`Saving binary LPRetinaImage to ${filePath}`);
    
    const headerSize = 64;
    const retinaCellsSize = lpVision.retinaCells.length * 4; // 4 bytes per retina cell (32-bit uint)
    const totalSize = headerSize + retinaCellsSize;
    
    const buffer = Buffer.alloc(totalSize);
    let offset = 0;
    
    // Write header
    buffer.writeFloatLE(lpVision.spiralPer, offset); offset += 4;
    buffer.writeUInt32LE(lpVision.length, offset); offset += 4;
    buffer.writeUInt32LE(lpVision.viewlength, offset); offset += 4;
    buffer.writeUInt32LE(lpVision.numCellTypes, offset); offset += 4;
    buffer.writeFloatLE(lpVision.x_ofs, offset); offset += 4;
    buffer.writeFloatLE(lpVision.y_ofs, offset); offset += 4;
    buffer.writeUInt32LE(lpVision.startIndex, offset); offset += 4;
    buffer.writeUInt32LE(lpVision.startPer, offset); offset += 4;
    buffer.writeUInt32LE(lpVision.tilt, offset); offset += 4;
    buffer.writeUInt32LE(lpVision.viewIndex, offset); offset += 4;
    buffer.writeUInt32LE(Math.floor(Date.now() / 1000), offset); offset += 4;
    
    // Skip to retina cells section
    offset = headerSize;
    
    // Write retina cells as 32-bit values
    console.log(`Writing ${lpVision.retinaCells.length} retina cells (4 bytes each)...`);
    for (let i = 0; i < lpVision.retinaCells.length; i++) {
        const cellValue = lpVision.retinaCells[i];
        // Each retina cell should be a 32-bit value containing 8 identifiers × 3 bits = 24 bits
        buffer.writeUInt32LE(cellValue & 0xFFFFFFFF, offset);
        offset += 4;
    }
    
    fs.writeFileSync(filePath, buffer);
    
    console.log(`Successfully saved binary LPRetinaImage:`);
    console.log(`  File size: ${buffer.length} bytes (header: ${headerSize}, cells: ${retinaCellsSize})`);
    console.log(`  Retina cells: ${lpVision.retinaCells.length} × 4 bytes each`);
    console.log(`  Cell format: 8 identifiers × 3 bits = 24 bits in 32-bit uint`);
    console.log(`  Spiral Period: ${lpVision.spiralPer}`);
    console.log(`  View Length: ${lpVision.viewlength}`);
    
    return buffer.length;
}

/**
 * Main execution
 */
function main() {
    try {
        const inputFile = path.join(__dirname, 'rainbow_test_lpximage.lpx');
        const outputFile = path.join(__dirname, 'rainbow_test_js.lpr');
        
        console.log('=== LPXImage to Binary LPRetinaImage Converter ===');
        console.log(`Input:  ${inputFile}`);
        console.log(`Output: ${outputFile}`);
        console.log();
        
        if (!fs.existsSync(inputFile)) {
            throw new Error(`Input file not found: ${inputFile}`);
        }
        
        // Step 1: Read LPXImage
        console.log('Step 1: Reading LPXImage binary file...');
        const lpxData = readLPXImageBinary(inputFile);
        console.log('✓ LPXImage data loaded');
        console.log();
        
        // Step 2: Create LPXImage object using existing function
        console.log('Step 2: Creating LPXImage proxy object...');
        const lpxImage = createLPXImageProxy(lpxData);
        console.log(`✓ LPXImage proxy created with ${lpxImage.length} cells`);
        console.log();
        
        // Step 3: Convert using LPXVision algorithm
        console.log('Step 3: Converting to LPRetinaImage using LPXVision algorithm...');
        const lpVision = createLPXVision(lpxImage);
        console.log(`✓ LPXVision processing complete!`);
        console.log(`  Processed Length: ${lpVision.length}`);
        console.log(`  View Length: ${lpVision.viewlength}`);
        console.log(`  Retina Cells: ${lpVision.retinaCells.length}`);
        console.log(`  Cell Types: ${lpVision.numCellTypes}`);
        console.log();
        
        // Step 4: Save as binary file
        console.log('Step 4: Saving binary LPRetinaImage...');
        const fileSize = saveLPRetinaImageBinary(lpVision, outputFile);
        console.log();
        
        console.log('=== Conversion Complete ===');
        console.log(`✓ Binary LPRetinaImage saved as: ${outputFile}`);
        console.log(`✓ File size: ${fileSize} bytes`);
        
        // Verify the file was created
        if (fs.existsSync(outputFile)) {
            const stats = fs.statSync(outputFile);
            console.log(`✓ File verification: ${stats.size} bytes written`);
            
            // Show hex dump of first 64 bytes (header)
            console.log('\nHex dump of first 64 bytes (header):');
            const sample = fs.readFileSync(outputFile).slice(0, 64);
            for (let i = 0; i < sample.length; i += 16) {
                const chunk = sample.slice(i, Math.min(i + 16, sample.length));
                const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
                const offset = i.toString(16).padStart(8, '0');
                console.log(`  ${offset}: ${hex}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export {
    readLPXImageBinary,
    saveLPRetinaImageBinary
};
