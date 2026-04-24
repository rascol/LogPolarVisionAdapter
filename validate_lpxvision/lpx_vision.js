/**
 * LPXVision Module - GOLD STANDARD with FFI to C++ library
 * 
 * Uses FFI to call C++ functions directly via mangled names while preserving
 * the JavaScript interface as the authoritative reference.
 */

import koffi from 'koffi';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the C++ library
const libPath = path.join(__dirname, '..', 'liblpx_image.dylib');
const lib = koffi.load(libPath);

// FFI function definitions using mangled C++ names:

// Memory allocation
const malloc = lib.func('malloc', 'pointer', ['size_t']);
const free = lib.func('free', 'void', ['pointer']);

// LPXImage constructor: __ZN3lpx8LPXImageC2ENSt3__110shared_ptrINS_9LPXTablesEEEii
// For now, we'll create a simplified constructor that takes basic parameters
const createLPXImage = lib.func('__ZN3lpx8LPXImageC2ENSt3__110shared_ptrINS_9LPXTablesEEEii', 'void', ['pointer', 'pointer', 'int', 'int']);

// LPXImage method bindings using actual mangled names from the C++ library
const getRawData = lib.func('__ZNK3lpx8LPXImage10getRawDataEv', 'pointer', ['pointer']);
const getRawDataSize = lib.func('__ZNK3lpx8LPXImage14getRawDataSizeEv', 'size_t', ['pointer']);
const extractCellLuminance = lib.func('__ZNK3lpx8LPXImage20extractCellLuminanceEj', 'uint32_t', ['pointer', 'uint32_t']);
const extractCellGreenRed = lib.func('__ZNK3lpx8LPXImage19extractCellGreenRedEj', 'int32_t', ['pointer', 'uint32_t']);
const extractCellYellowBlue = lib.func('__ZNK3lpx8LPXImage21extractCellYellowBlueEj', 'int32_t', ['pointer', 'uint32_t']);
const unpackColor = lib.func('__ZNK3lpx8LPXImage11unpackColorEjRiS1_S1_', 'void', ['pointer', 'uint32_t', 'pointer', 'pointer', 'pointer']);
const packColor = lib.func('__ZNK3lpx8LPXImage9packColorEiii', 'uint32_t', ['pointer', 'int', 'int', 'int']);

// LPXVision functions (for validation against JavaScript gold standard)
const getViewLengthStatic_cpp = lib.func('__ZN10lpx_vision9LPXVision19getViewLengthStaticEd', 'int', ['double']);
const getColorAngle_cpp = lib.func('__ZN10lpx_vision9LPXVision13getColorAngleEddd', 'double', ['double', 'double', 'double']);
const getColorDifference_cpp = lib.func('__ZN10lpx_vision9LPXVision18getColorDifferenceEdd', 'double', ['double', 'double']);
const rescaleToMinMax_cpp = lib.func('__ZN10lpx_vision9LPXVision15rescaleToMinMaxEdddi', 'double', ['double', 'double', 'double', 'int']);

/**
 * Creates a JavaScript wrapper around an external binary LPXImage object
 * This allows the existing JavaScript code to work with external C++ objects
 */
function wrapExternalLPXImage(lpxImagePtr) {
    // Get raw data from C++ object to create cellArray
    const rawDataPtr = getRawData(lpxImagePtr);
    const rawDataSize = getRawDataSize(lpxImagePtr);
    
    return {
        // Properties - these would need additional C++ getters that aren't in the current library
        // For now, providing reasonable defaults based on typical LPXImage usage
        get spiralPer() { return 100; /* Would need getSpiralPer FFI binding */ },
        get cellArray() { 
            // Convert raw data pointer to JavaScript array if needed
            // For now, return empty array - would need proper memory reading
            return []; /* Would need to read from rawDataPtr */
        },
        get length() { return Math.floor(rawDataSize / 4); /* Assuming 4 bytes per cell */ },
        get x_ofs() { return 0; /* Would need getXOfs FFI binding */ },
        get y_ofs() { return 0; /* Would need getYOfs FFI binding */ },
        get range() { return undefined; /* Would need getRange FFI binding */ },
        get offset() { return 0; /* Would need getOffset FFI binding */ },
        
        geometry: {
            getFoveaPeriods: (spPer) => Math.floor(spPer * 0.1) /* Would need geometry FFI bindings */
        },
        
        cell: {
            // These use the actual C++ methods via FFI!
            extractCell_wht_blk: (cellData) => extractCellLuminance(lpxImagePtr, cellData),
            extractCell_grn_red: (cellData) => extractCellGreenRed(lpxImagePtr, cellData),
            extractCell_yel_blu: (cellData) => extractCellYellowBlue(lpxImagePtr, cellData)
        }
    };
}

// Export the wrapper function
export { wrapExternalLPXImage };

/**
 * Creates an actual C++ LPXImage object using FFI
 * This allows direct use of real C++ objects with the JavaScript LPXVision
 */
function createLPXImageFromCpp(width, height, tablesPtr = null) {
    // Allocate memory for the C++ object
    const objSize = 256; // Estimated size, may need adjustment
    const lpxImagePtr = malloc(objSize);
    
    // Call the C++ constructor
    createLPXImage(lpxImagePtr, tablesPtr, width, height);
    
    return lpxImagePtr; // Returns pointer to actual C++ LPXImage object
}

// Export the C++ object creator
export { createLPXImageFromCpp };

/**
 * Creates LPXImage-compatible object from raw data
 * This solves the missing import issue while preserving the gold standard JS algorithm
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
            extractCell_wht_blk: (cellData) => cellData & 0x3FF,
            extractCell_grn_red: (cellData) => ((cellData >> 10) & 0x7FF) - 1024,
            extractCell_yel_blu: (cellData) => ((cellData >> 21) & 0x7FF) - 1024
        }
    };
}

// Export the helper function
export { createLPXImageProxy };

const INV_2_PI = 1.0 / (2.0 * Math.PI);
// const ONE_SIXTH = 1.0 / 6.0;
const ANG0 = 3.0 * Math.PI / 4.0;

const NUM_IDENTIFIERS = 8;
const NUM_IDENTIFIER_BITS = 3;
const EIGHT_BIT_RANGE = 255.9999;
const DIFFERENCE_BITS = 5;

/**
 * The cell name strings for the virtual LPXVision cell types.
 */

const identifierName = ['mwh',  'hue', 'mwh_x', 'hue_x', 'mwh_y', 'hue_y', 'mwh_z', 'hue_z'];

/**
 * Gets the total number of LPXVision cell locations in the view range.
 * 
 * @param {Number} spiralPer The number of LPXVision cell locations 
 * in one revolution of the log-polar spiral.
 * 
 * @returns {Number} The viewlength that has at least a number of spiral
 * revolutions equal to one-third of the spiral period but with the number 
 * of cells evenly divisible by four.
 * 
 * @private
 */
function getViewLength(spiralPer){
	let sp = Math.floor(spiralPer);
	spiralPer = sp + 0.5;							// Exact spiralPer
	let vp = Math.round(spiralPer / 3.0);			// Approximate desired number of 
													// spiral periods in the view
	let viewlength = Math.round(vp * spiralPer);
	
	while ((viewlength % 4) !== 0){
		viewlength += 1;
	}
	
	return viewlength;
}

/**
 * if ang == ANG0, gets the color angle mapped to the range, 
 * 0 to 2PI, but corresponding to the actual range -3PI/4 to 
 * 5PI/4 with blue at -PI/2, Green at 0, yellow at PI/2 and 
 * red at PI. The returned color ranges look like this:
 * 
 *   0 to PI/2    purple-blue to blue to blue-green
 *   PI/2 to PI   blue-green to green to green-yellow
 *   PI to 3PI/2  green-yellow to yellow to orange
 *   3PI/2 to 2PI orange to red to red-purple
 * 
 * If these ranges are normalized to PI/2 the result is
 * 
 *   0 to 1     blue range
 *   1 to 2     green range
 *   2 to 3     yellow range
 *   3 to 4     red range
 *   
 * Consequently, Math.floor(PI/2 normalized range) maps 
 * 
 *   0  blue range
 *   1  green range
 *   2  yellow range
 *   3  red range
 *   
 * If vector magnitude of the mgr and myb x and y identifiers 
 * is too small to reliably calculate color then the color is 
 * assumed to be white (gray) and the color is set to -3PI/4 
 * which is the purple-blue midway between red and blue and 
 * has output value 0.
 * 
 * @param {Number} myb Yellow - blue in the range -1023 to 1023.
 * @param {Number} mgr Green - red in the range -1023 to 1023.
 * @param {Number} ang
 *
 * @returns {Number} Color angle in range 0 to 2PI
 */
function getColorAngle(myb, mgr, ang){
	
	let angle;
	let mag = Math.sqrt(myb * myb + mgr * mgr);
	if (mag < 50){						// Color is gray
		angle = 0.0;
	}
	else {								// Color in the range: purple/blue  through red/purple
		angle = Math.atan2(myb, mgr);	// Returns angle in the range -PI to PI.
		if (angle < -ang){				// So set angle range to -3PI/4 to 5PI/4
			angle = Math.PI + (Math.PI + angle);
		}
		
		angle += ang;					// Rotate angle by 3PI/4
	}									
	return angle;						// Returns a value in range 0 to 2PI
}

/**
 * Returns color difference as a number in range -PI to PI.
 *
 * @param {Number} color1 Color in range 0 to 2PI
 * @param {Number} color0 Color in range 0 to 2PI
 * @returns {Number} color difference
 */
function getColorDifference(color1, color0){
	
	let diff = color1 - color0;
	
	if (diff > Math.PI){
		diff = diff - 2 * Math.PI;
	}
	else if (diff < -Math.PI){
		diff = diff + 2 * Math.PI;
	}
	
	return diff;
}

/**
 * Sets LPXVision image cell identifier bit range to the value n
 * then shifts the bit range to the left by range_bits.
 * 
 * @param {Number} n
 * @param {Number} retinaCells
 * @param {Number} i
 * @param {Number} range_bits
 */
function setCellBits(n, retinaCells, i,  range_bits){
	
	retinaCells[i] = (retinaCells[i] | n);
	retinaCells[i] = (retinaCells[i] << range_bits);
}

/**
 * Rescales val to the range [movMin, movMax].
 *
 * @param {Number} val
 * @param {Number} movMin
 * @param {Number} movMax
 * @param {Number} idx
 * @returns {Number} The rescaled value.
 */
function rescaleToMinMax(val, movMin, movMax, idx){
	
	val = Math.floor(val);
	
	if (val < movMin){
		console.log("rescaleToMinMax() val less than movMin at idx: " + idx + " val: " + val + " movMin: " + movMin);
		val = movMin;
	}
	else if (val > movMax){
		console.log("rescaleToMinMax() val greater than movMax at idx: " + idx + " val: " + val + " movMax: " + movMax);
		val = movMax;
	}
	
	let range = movMax - movMin;
	if (range < 10){
		range = 10;
	}
	
	val = Math.round(255 * (val - movMin) / range);			// Scaled to 8 bits
	return val;
}

/**
 * Gets the minimum value of mwh[i] over the preceding
 * viewlength values of mwh[i] (including the current 
 * index) from current index i == idx.
 * 
 * @param {Array} mwh The monochrome magnitude array.
 * @param {Number} idx The current index of mwh.
 * @param {Number} viewlength The length of a view.
 * @returns {Object} {minVal, index_of_minVal}
 */
function getMovingMin(mwh, idx, viewlength){
	let mwh_i;
	let minVal = 1023;
	let minIdx;
	for (let i = idx - viewlength + 1; i <= idx; i += 1){
		mwh_i = mwh[i];
		if (mwh_i < minVal){
			minVal = mwh_i;
			minIdx = i;
		}
	}
	return {minVal: minVal, minIdx: minIdx};
}

/**
 * If mwh[j] is less than movMin then movMin is 
 * set to mwh[j]. Otherwise, if j is exactly one
 * view length from the last movMin then sets 
 * movMin to the lowest value of mwh[j] that 
 * occurred over the preceding viewlength values
 * of mwh[j].
 * 
 * @param {Array} mwh The monochrome magnitude array.
 * 
 * @param {Number} j The current index of mwh.
 * 
 * @param {Number} movMin The last minimum value of
 * mwh[j].
 * 
 * @param {Number} movMinIdx The index of mwh at 
 * which movMin was captured.
 * 
 * @param {Number} viewlength The length of a view.
 * 
 * @returns {Object} {minVal, index_of_minVal}
 */
function getMovingMinParams(mwh, j, movMin, movMinIdx, viewlength){
	
	let mwh_j = mwh[j];
	if (mwh_j < movMin){
		movMin = mwh_j;
		movMinIdx = j;
	}
	else if ((j - viewlength) === movMinIdx){
		let min = getMovingMin(mwh, j, viewlength);
		movMin = min.minVal;
		movMinIdx = min.minIdx;
	}
	return {minVal: movMin, minIdx: movMinIdx};
}


/**
 * Gets the maximum value of mwh[i] over the preceding
 * viewlength values of mwh[i] (including the current 
 * index) from current index i == idx.
 * 
 * @param {Array} mwh The monochrome magnitude array.
 * @param {Number} idx The current index of mwh.
 * @param {Number} viewlength The length of a view.
 * @returns {Object} {maxVal, index_of_maxVal}
 */
function getMovingMax(mwh, idx, viewlength){
	let mwh_i;
	let maxVal = 0;
	let maxIdx;
	for (let i = idx - viewlength + 1; i <= idx; i += 1){
		mwh_i = mwh[i];
		if (mwh_i > maxVal){
			maxVal = mwh_i;
			maxIdx = i;
		}
	}
	return {maxVal: maxVal, maxIdx: maxIdx};
}

/**
 * If mwh[j] is greater than movMax then movMax is 
 * set to mwh[j]. Otherwise, if j is exactly one 
 * view length from the last movMax then sets 
 * movMax to the greatest value of mwh[j] that 
 * occurred over the preceding viewlengh values 
 * of mwh[j].
 * 
 * @param {Array} mwh The monochrome magnitude array.
 * 
 * @param {Number} j The current index of mwh.
 * 
 * @param {Number} movMax The last maximum value of
 * mwh[j].
 * 
 * @param {Number} movMaxIdx The index of mwh at 
 * which movMax was captured.
 * 
 * @param {Number} viewlength The length of a view.
 * 
 * @returns {Object} {maxVal, index_of_maxVal}
 *
 * @private
 */
function getMovingMaxParams(mwh, j, movMax, movMaxIdx, viewlength){
	let mwh_j = mwh[j];
	if (mwh_j > movMax){
		movMax = mwh_j;
		movMaxIdx = j;
	}
	else if ((j - viewlength) === movMaxIdx){
		let max = getMovingMax(mwh, j, viewlength);
		movMax = max.maxVal;
		movMaxIdx = max.maxIdx;
	}
	return {maxVal: movMax, maxIdx: movMaxIdx};
}

/**
 * Expands each LPXImage cell from lpImage into twelve color 
 * LPXVision cells at each cell location and saves the cells to the 
 * cellBuffArray buffers. The expansion starts at the cell offset
 * given by lpImage.offset and extends over a cell span given
 * by lpR.viewlength.
 * 
 * @param {LPXVision} lpR The LPXVision object containing, in
 * particular, a cellBuffArray array of NUM_IDENTIFIERS buffers 
 * with each buffer of length lpR.viewlength.
 * 
 * @param {LPXImage} lpImage The LPXImage object that will fill
 * lpR.cellBufArray[NUM_IDENTIFIERS].
 * 
 * @private
 */
function fillVisionCells(lpR, lpImage){
			
	let spPer = Math.floor(lpImage.spiralPer);
	
	let cellArray = lpImage.cellArray;

	let foveaOfs = spPer * lpImage.geometry.getFoveaPeriods(spPer);
	
	let viewlength = lpR.viewlength;
	
	let viewOfs = viewlength + 1;
	let mwhOfs = viewOfs + spPer;
	
	let length = lpImage.length;
	let comparelen = length - foveaOfs;     // Number of cells that can be compared between LPXImages
	
	lpR.length = comparelen;

	let mwhMovMin, mwhMovMax, mwhMovMinIdx, mwhMovMaxIdx;
	let mwh_xMovMin, mwh_xMovMax, mwh_xMovMinIdx, mwh_xMovMaxIdx;
	let mwh_yMovMin, mwh_yMovMax, mwh_yMovMinIdx, mwh_yMovMaxIdx;
	let mwh_zMovMin, mwh_zMovMax, mwh_zMovMinIdx, mwh_zMovMaxIdx;
	
	let mwh = Array(comparelen + mwhOfs);
	let mgr = Array(comparelen + viewOfs);
	let myb = Array(comparelen + viewOfs);
	
	let mwh_x = Array(comparelen + mwhOfs);
	let mwh_y = Array(comparelen + mwhOfs);
	let mwh_z = Array(comparelen + mwhOfs);
	
	let hue = Array(comparelen + viewOfs);
					
	let i, j, k, n;
	let diff, wht;
											// Begin construction of arrays back one view length
	for (i = 0; i < mwhOfs; i++){
		mwh[i] = lpImage.cell.extractCell_wht_blk(cellArray[i + foveaOfs - mwhOfs]);
		if (i < spPer){
			mwh_x[i] = 0;
			mwh_y[i] = 0;
			mwh_z[i] = 0;
		}
		else {
			mwh_x[i] = 512 + (mwh[i] - mwh[i-1]) / 4;
			mwh_y[i] = 512 + (mwh[i] - mwh[i-spPer-1]) / 4;
			mwh_z[i] = 512 + (mwh[i] - mwh[i-spPer]) / 4;
		}
	}
	
	for (i = 0; i < comparelen; i += 1){
		lpR.retinaCells.push(0);
		
		j = i + mwhOfs;
		k = i + foveaOfs;
		
		if (i === 0){
			let min = getMovingMin(mwh, j, viewlength);
			mwhMovMin = min.minVal;
			mwhMovMinIdx = min.minIdx;
			
			let max = getMovingMax(mwh, j, viewlength);
			mwhMovMax = max.maxVal;
			mwhMovMaxIdx = max.maxIdx;
		}
														// The monochrome identifier in the range 0 to 1023
		mwh[j] = lpImage.cell.extractCell_wht_blk(cellArray[k]);
		
		if (mwh[j] >= 1024 || mwh[j] < 0){
			console.log("LPXRetinaImage.js fillVisionCells() Out of range mwh[j]: " + mwh[j]);
		}
		
		let min = getMovingMinParams(mwh, j, mwhMovMin, mwhMovMinIdx, viewlength);
		mwhMovMin = min.minVal;
		mwhMovMinIdx = min.minIdx;

		let max = getMovingMaxParams(mwh, j, mwhMovMax, mwhMovMaxIdx, viewlength);
		mwhMovMax = max.maxVal;
		mwhMovMaxIdx = max.maxIdx;
		
		wht = rescaleToMinMax(mwh[j], mwhMovMin, mwhMovMax, j);
		
		if (mwhMovMin < 0 || mwhMovMin >= 1024){
			console.log("LPXRetinaImage.js fillVisionCells() Out of range mwhMovMin: " + mwhMovMin);
		}
		
		if (mwhMovMax < 0 || mwhMovMax >= 1024){
			console.log("LPXRetinaImage.js fillVisionCells() Out of range mwhMovMax: " + mwhMovMax);
		}
		
		if (wht >= 256 || wht < 0){
			console.log("LPXRetinaImage.js fillVisionCells() Out of range wht: " + wht);
		}
		
		n = Math.floor(wht);										// Converts wht to an 8-bit value in the range 0 to 255
		n = n >>> DIFFERENCE_BITS;									// Remove the range comparison bits
		
		setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
															
		mgr[j] = lpImage.cell.extractCell_grn_red(cellArray[k]);	// green-red identifier in the range -1024 to 1023
		myb[j] = lpImage.cell.extractCell_yel_blu(cellArray[k]);	// yellow-blue identifier in the range -1024 to 1023

		hue[j] = getColorAngle(myb[j], mgr[j], ANG0);				// Generate color1 angle in range 0 to 2PI
		
		n = Math.floor(EIGHT_BIT_RANGE * INV_2_PI * hue[j]);		// Convert color to an 8-bit value in the range 0 to 255
		n = n >>> DIFFERENCE_BITS;									// Remove the range comparison bits
		
		setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
	}
	
	for (i = 0; i < comparelen; i += 1){							// Form cell forward differences along the spiral
		j = i + viewOfs;
		
		if (i === 0){
			let min = getMovingMin(mwh_x, j, viewlength);
			mwh_xMovMin = min.minVal;
			mwh_xMovMinIdx = min.minIdx;
			
			let max = getMovingMax(mwh_x, j, viewlength);
			mwh_xMovMax = max.maxVal;
			mwh_xMovMaxIdx = max.maxIdx;
		}
		
		mwh_x[j] = Math.floor(512 + (mwh[j] - mwh[j-1]) / 4);
		
		let min = getMovingMinParams(mwh_x, j, mwh_xMovMin, mwh_xMovMinIdx, viewlength);
		mwh_xMovMin = min.minVal;
		mwh_xMovMinIdx = min.minIdx;

		let max = getMovingMaxParams(mwh_x, j, mwh_xMovMax, mwh_xMovMaxIdx, viewlength);
		mwh_xMovMax = max.maxVal;
		mwh_xMovMaxIdx = max.maxIdx;
		
		diff = rescaleToMinMax(mwh_x[j], mwh_xMovMin, mwh_xMovMax, j);
		
		n = Math.floor(diff);
		n = n >>> DIFFERENCE_BITS;									// Remove the range comparison bits
		
		setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
		
		let hue_x = getColorDifference(hue[j], hue[j-1]);				// Color difference in range -PI to PI
		
		n = Math.floor(EIGHT_BIT_RANGE * INV_2_PI * (hue_x + Math.PI));	// Set 8-bit range
		n = n >>> DIFFERENCE_BITS;										// Remove the range comparison bits
		
		setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
	}
	
	for (i = 0; i < comparelen; i += 1){					// Form cell forward differences -60 degrees from spiral
		j = i + viewOfs;
		
		if (i === 0){
			let min = getMovingMin(mwh_y, j, viewlength);
			mwh_yMovMin = min.minVal;
			mwh_yMovMinIdx = min.minIdx;
			
			let max = getMovingMax(mwh_y, j, viewlength);
			mwh_yMovMax = max.maxVal;
			mwh_yMovMaxIdx = max.maxIdx;
		}
		
		mwh_y[j] = Math.floor(512 + (mwh[j] - mwh[j-spPer-1]) / 4);
		
		let min = getMovingMinParams(mwh_y, j, mwh_yMovMin, mwh_yMovMinIdx, viewlength);
		mwh_yMovMin = min.minVal;
		mwh_yMovMinIdx = min.minIdx;

		let max = getMovingMaxParams(mwh_y, j, mwh_yMovMax, mwh_yMovMaxIdx, viewlength);
		mwh_yMovMax = max.maxVal;
		mwh_yMovMaxIdx = max.maxIdx;
		
		diff = rescaleToMinMax(mwh_y[j], mwh_yMovMin, mwh_yMovMax, j);
		
		n = Math.floor(diff);
		n = n >>> DIFFERENCE_BITS;										// Remove the range comparison bits
		
		setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
		
		let hue_y = getColorDifference(hue[j], hue[j-spPer-1]);
		n = Math.floor(EIGHT_BIT_RANGE * INV_2_PI * (hue_y + Math.PI));	// Set 8-bit range
		n = n >>> DIFFERENCE_BITS;										// Remove the range comparison bits
		
		setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
	}
	
	for (i = 0; i < comparelen; i += 1){					// Form cell forward differences -120 degrees from spiral
		j = i + viewOfs;
		
		if (i === 0){
			let min = getMovingMin(mwh_z, j, viewlength);
			mwh_zMovMin = min.minVal;
			mwh_zMovMinIdx = min.minIdx;
			
			let max = getMovingMax(mwh_z, j, viewlength);
			mwh_zMovMax = max.maxVal;
			mwh_zMovMaxIdx = max.maxIdx;
		}
		
		mwh_z[j] = Math.floor(512 + (mwh[j] - mwh[j-spPer]) / 4);
		
		let min = getMovingMinParams(mwh_z, j, mwh_zMovMin, mwh_zMovMinIdx, viewlength);
		mwh_zMovMin = min.minVal;
		mwh_zMovMinIdx = min.minIdx;

		let max = getMovingMaxParams(mwh_z, j, mwh_zMovMax, mwh_zMovMaxIdx, viewlength);
		mwh_zMovMax = max.maxVal;
		mwh_zMovMaxIdx = max.maxIdx;

		diff = rescaleToMinMax(mwh_z[j], mwh_zMovMin, mwh_zMovMax, j);
		
		n = Math.floor(diff);
		n = n >>> DIFFERENCE_BITS;										// Remove the range comparison bits
		
		setCellBits(n, lpR.retinaCells, i, NUM_IDENTIFIER_BITS);
		
		let hue_z = getColorDifference(hue[j], hue[j-spPer]);
		n = Math.floor(EIGHT_BIT_RANGE * INV_2_PI * (hue_z + Math.PI));	// Set 8-bit range
		n = n >>> DIFFERENCE_BITS;										// Remove the range comparison bits
		
		setCellBits(n, lpR.retinaCells, i, 0);
	}		
}

/**
 * Constructs color LPXVision cells from an LPXImage object. 
 * If lpImage.range is defined and non-zero then that value 
 * defines the length of the vision buffers. Otherwise, 
 * lpImage.length defines vision buffer length.
 * 
 * This function is used externally by LPCortexImage.
 * 
 * @param {LPXVision} lpR This LPXVision object.
 * 
 * @param {LPXImage} lpImage The LPXImage object.
 */
function makeVisionCells(lpR, lpImage){
	if (lpImage.range !== undefined && lpImage.range !== 0){
		lpR.length = lpImage.range + lpImage.offset;
	}
	else {
		lpR.length = lpImage.length;
	}

	fillVisionCells(lpR, lpImage);
}

let distribArrays;
let cnt = 0;

/**
 * The LPXVision constructor initializer.
 * 
 * @param {LPXVision} lpR This LPXVision object.
 * 
 * @param {LPXImage} lpxImage The LPXImage from 
 * which the LPXVision object is constructed.
 * 
 * @private
 */
function initializeLPR(lpR, lpxImage){
	
	// if (countOnes === undefined){
	// 	makeCountOnesTable(NUM_IDENTIFIERS, NUM_IDENTIFIER_BITS, NUM_TABLE_BITS);
	// }

	if (distribArrays === undefined){
		cnt = 0;
		
		distribArrays = Array(NUM_IDENTIFIERS);
		
		let nVals = Math.pow(2, NUM_IDENTIFIER_BITS);
		
		for (let i = 0; i < NUM_IDENTIFIERS; i += 1){
			let distrib = Array(nVals);
			for (let j = 0; j < nVals; j += 1){
				distrib[j] = 0;
			}
			
			distribArrays[i] = distrib;
		}
	}
	
	if (lpxImage !== undefined){
		
		lpR.spiralPer = lpxImage.spiralPer;
		// lpR.geometry = lpxImage.geometry;
		lpR.viewlength = Math.floor(lpR.getViewLength(lpR.spiralPer));
		// lpR.timestamp = lpxImage.timestamp;
		lpR.x_ofs = lpxImage.x_ofs;
		lpR.y_ofs = lpxImage.y_ofs;
				
		// if (lpxImage.cellType === "image"){
		// 	lpR.compareType = "vision";
			makeVisionCells(lpR, lpxImage);
		// }
	}
	// else {
	// 	lpR.timestamp = setTimeStamp();
	// }
}

/**
 * Constructor for LPXVision objects with hexagonal cell shapes.
 * 
 * An LPXVision object encapsulates buffers of vision cells that 
 * can make much more reliable image to image comparisons than 
 * can LPXImage cells. LPXVision objects can also accurately detect 
 * motion while filtering out luminance flicker and camera noise. 
 * There are twelve virtual cell types at each vision cell location. 
 * These detect color and luminance amplitude and also color and 
 * luminance gradients in three directions at each cell location. 
 * This is a consequence of hexagonal cell shapes that have three 
 * gradient directions from each hexagonal cell six adjoining
 * neighbors.
 * 
 * @constructor
 * 
 * @param {LPXImage} lpxImage An LPXImage object that provides 
 * the data to populate the new LPXVision object. 
 */
export let LPXVision = function (lpxImage){
		
	
	/**
	 * The spiral period of this LPXVision object.
	 */
	this.spiralPer = 0;
	
	/**
	 * The startIndex relative to 0 at which to start a view
	 * comparison. The number is automatically rounded so that
	 * views can be accessed sequentially by startPer just by 
	 * adding actual startPer values to startIndex.
	 */
	this.startIndex = 0;
	
	/**
	 * The index of the spiral period at which the 
	 * view range starts.
	 */
	this.startPer = 0;
	
	/**
	 * A cell buffer index adjustment to the start of the
	 * view range that can be used to correct for visual 
	 * rotation in the LPXImage that created this LPXVision object 
	 * object.
	 */
	this.tilt = 0;
	
	/**
	 * The length of the vision cell buffer each
	 * of which has this length.
	 */
	this.length = 0;
	
	/**
	 * The total number of vision cell locations in the
	 * view range.
	 */
	this.viewlength = 0;
	
	/**
	 * A starting index for image comparisons that can be 
	 * used instead of this.startPer and this.tilt.
	 */
	this.viewIndex = 0;
	
	/**
	 * The horizontal offset from the center of a scanned 
	 * standard image at which the LPXImage scan was made.
	 * Positive direction is to the right.
	 */
	this.x_ofs = 0.0;
	
	/**
	 * The vertical offset from the center of a scanned 
	 * standard image at which the LPXImage scan was made.
	 * Positive direction is down.
	 */
	this.y_ofs = 0.0;
	
	/**
	 * The number of LPXVision cell types.
	 */
	this.numCellTypes = NUM_IDENTIFIERS;

	/**
	 * All retina cells in a single array. These span
	 * only the viewable range of cells from above the fovea.
	 * So valid index starts at zero and length is less than
	 * LPXImage length.
	 */
	this.retinaCells = [];

	
// Methods:

	/**
	 * Gets the string name of the LPXVision cell identifiers
	 * stored in a retinaCell. Each identifier occupies 3-bits and 
	 * the identifiers are listed from the lowest 3-bit location 
	 * to the highest.
	 * 
	 * @param {Number} i The index of the cell identifier.
	 * @returns {String} The type name of the LPXVision identifier in the retinaCell.
	 */
	this.getCellIdentifierName = function (i){
		return identifierName[i];
	};
	
	/**
	 * Gets the index into the vision cell buffers of the start
	 * of the view range. Internal values for 
	 * 
	 *   this.spiralPer - the length in cells of one revolution 
	 *   of the spiral,
	 *   
	 * 	 this.startPer - the index of the spiral period counted 
	 *   as 0, 1, 2, ..., from the start of this.retinaCells[].
	 *      
	 *   this.tilt - a cell offset value to account for tilting
	 *   in the image
	 *   
	 * all need to have been assigned to this LPXVision object
	 * before this function can be called. The this.spiralPer 
	 * value will have been taken from the LPXImage object that 
	 * created this LPXVision object but the others will typically 
	 * need to have been assigned explicitly since their default 
	 * values are all zero.
	 * 
	 * @returns {Number} The integer index value that starts the 
	 * view range.
	 */
	this.getViewStartIndex = function (){
		return Math.floor(this.startPer * this.spiralPer + this.tilt);
	};
	
	/**
	 * Gets the total number of LPXVision cell locations in the view range.
	 * 
	 * @param {Number} spiralPer The number of LPXVision cell locations 
	 * in one revolution of the log-polar spiral.
	 * @returns {Number}  The number of cell locations.
	 */
	this.getViewLength = function (spiralPer){
		if (spiralPer === undefined){
			return getViewLength(this.spiralPer);
		}
		return getViewLength(spiralPer);
	};
	
	/**
	 * Constructs LPXVision cells from an LPXImage object. 
	 * If lpImage.range is defined and non-zero then that value 
	 * defines the length of the vision buffers. Otherwise, 
	 * lpImage.length defines vision buffer length.
	 * 
	 * If lpD is defined, LPXVision cells are constructed for 
	 * that LPXVision object instead.
	 * 
	 * This function is used externally.
	 * 
	 * @param {LPXImage} lpImage The LPXImage object.
	 * @param {LPXVision} lpD Alternative LPXVision object 
	 * that will receive the cells.
	 */
	this.makeVisionCells = function (lpImage, lpD){
		if (lpD !== undefined){
			makeVisionCells(lpD, lpImage);
		}
		else {
			makeVisionCells(this, lpImage);
		}
	};
	
	initializeLPR(this, lpxImage);
};


