
"use esversion:6";

/**
 * LPXImage Module.
 */

//"use strict";

/**
 * @private
 */
var zlib = require('zlib');

/**
 * @private
 */
const util = require('util');

/**
 * @private
 */
var fs = require('fs');

/**
 * @private
 */
const EventEmitter = require('events');

/**
 * @private
 */
var jpeg = require('jpeg-js');

/**
 * @private
 */
var lpxScan = require('bindings')('lpxScan.node');

/**
 * @private
 */
var btoa = require('btoa');

var cwd = __dirname;

// Global Methods:

/**
 * Binary search returning either the elem index or
 * the index that would precede elem in the Array.
 * 
 * @param {Object} elem The object to find in the Array.
 * @param {Function} comparator The comparison function.
 * @returns {Number} The Array index of elem if found or 
 * the index that would precede elem if not found.
 */
Array.prototype.binarySearch = function (elem, comparator){
	var low = 0, high = this.length - 1,
		i, comparison;
	while (low <= high) {
		i = Math.floor((low + high) / 2);
		comparison = comparator(this[i], elem);
		if (comparison < 0){
			low = i + 1;
			continue;
		}
		if (comparison > 0){
			high = i - 1;
			continue;
		}
		return i;	// return the index corresponding to elem
	}
	return high;	// return the index that would precede elem.
};

var sv_A = Math.PI * Math.sqrt(3.0);	// Spiral construction constant for hexagonal cells.
var r0 = 0.455;							// The radius in pixels to the center of the LPXImage cell at absolute angle zero.
var maxSpiralRad = 3000;				// Maximum constructed spiral radius in pixels.

var TWO_PI = Math.PI * 2.0;
var inv_TWO_PI = 1.0 / TWO_PI;
var FOUR_PI = TWO_PI * 2.0;
var ONE_THIRD = 1.0 / 3.0;
var TWO_THIRDS = 2.0 / 3.0;

/**
 * Flag used to recreate LPXScanTables object when necessary.
 * 
 * @private
 */
var makeNewArrays = false;

/**
 * The LPXScanTables object containing static LPXImage cell  
 * values by pixel location on an x-y image.
 * 
 * @private
 */
var lpScanTables;

/**
 * Constructor for a Rect object that can hold the 
 * x and y boundaries of a rectangle.
 * 
 * @constructor
 */
var Rect = function (){
	/**
	 * Low x boundary.
	 */
	this.xMin = 0;
	/**
	 * High x boundary.
	 */
	this.xMax = 0;
	/**
	 * Low y boundary.
	 */
	this.yMin = 0;
	/**
	 * High y boundary.
	 */
	this.yMax = 0;
};

/**
 * Constructor for a ViewParams object to hold  
 * parameters for rendering an LPXImage to a 
 * rectilinear image.
 * 
 * @constructor
 */
var ViewParams = function (){
	/**
	 * Horizontal offset from the center of the image.
	 */
	this.x = 0;
	/**
	 * Vertical offset from the center of the image.
	 */
	this.y = 0;
	/**
	 * Offset into the LPXImage cell array at which to 
	 * start rendering the display.
	 */
	this.cellOffset = 0;
	/**
	 * Number of LPXImage cells to be displayed.
	 */
	this.cellRange = 0;
};

/**
 * Generates, with saturation, an unsigned char value from 
 * an integer.
 * 
 * @param {Number} i The integer value to convert.
 * @returns {Number} The resulting integer value with unsigned 
 * char range.
 * @private
 */
function intToByte(i){
	if (i > 255){ i = 255; }
	if (i < 0){ i = 0; }
	return i;
}

/**
 * Generates, with saturation, an unsigned char value from a 
 * float.
 * 
 * @param {Number} f The floating point value to convert.
 * @returns {Number} The resulting integer value with unsigned 
 * byte range.
 * @private
 */
function floatToByte(f){
	return intToByte(Math.floor(f));
}

/**
 * Generates, with saturation, an unsigned 11-bit value from 
 * an integer.
 * 
 * @param {Number} i The integer value to convert.
 * @returns {Number} The resulting integer value with unsigned 
 * 11-bit range.
 * @private
 */
function intTo11Bits(i){
	if (i > 0x7ff){ i = 0x7ff; }
	if (i < 0){ i = 0; }
	return i;
}

/**
 * Generates, with saturation, an unsigned 11-bit value from 
 * a float.
 * 
 * @param {Number} f The floating point value to convert.
 * @returns {Number} The resulting integer value with unsigned 
 * 11-bit range.
 * @private
 */
function floatTo11Bits(f){
	return intTo11Bits(Math.floor(f));
}

/**
 * Converts cell colors to a buffer of RGB color values.
 * 
 * @param {Number} wh The monochrome cell color component.
 * @param {Number} yb The yellow-blue cell color component.
 * @param {Number} gr The green-red cell color component.
 * @returns {Buffer} Buffer of [red, green, blue] byte values.
 * @private
 */
function whYbGrToRGB(wh, yb, gr){
	yb = yb - 1024.0;
	gr = gr - 1024.0;
	
	var red, grn, blu;
	
	wh = 0.25 * wh;
	
	var whNorm = 0.002 * wh;
	yb = yb * whNorm;
	gr = gr * whNorm;
	
	var grN = 0.5 * gr;
	var ybN = ONE_THIRD * yb;
	
	red = wh - grN + ybN;
	grn = wh + grN + ybN;
	blu = wh - TWO_THIRDS * yb;

	var rgb = new Buffer(3);
	
	rgb[0] = floatToByte(red);
	rgb[1] = floatToByte(grn);
	rgb[2] = floatToByte(blu);
	
	return rgb;
}

/**
 * Extracts the red, green and yellow components 
 * from an LPXImage cell.
 * 
 * @param {Number} lpCell UInt32 LPXImage cell value.
 * @returns {Buffer} Buffer of [red, green, blue] byte values.
 * @private
 */
function getRGBFromLPCell(lpCell){
	
	var wh = lpCell & 0x000003ff;
	var yb = (lpCell >>> 10) & 0x000007ff;
	var gr = (lpCell >>> 21) & 0x000007ff;
	
	var rgb = whYbGrToRGB(wh, yb, gr);
	
	return rgb;
}

/**
 * Creates a pixel from byte values of blue, green and red.
 * 
 * @param {Number} blu The blue byte value.
 * @param {Number} grn The green byte value.
 * @param {Number} red The red byte value.
 * @returns {Number} The UInt32 pixel value.
 */
function createPixelFromBGR(blu, grn, red){
	var pixel = 0;
	
	pixel = pixel | red;
	pixel = pixel << 8;
	pixel = pixel | grn;
	pixel = pixel << 8;
	pixel = pixel | blu;
	
	return pixel;
}

/**
 * Converts RGB pixel color values to an array of cell colors.
 * 
 * @param {Number} red Red value in the range 0.0 <= red < 255.0.
 * @param {Number} grn Green value in the range 0.0 <= grn < 255.0.
 * @param {Number} blu Blue value in the range 0.0 <= blu < 255.0.
 * @returns {Array} Array of [monochrome, yellow-blue, green-red] 
 * byte values.
 * @private
 */
function rgbToWhYbGr(red, grn, blu){
	var yel = 0.5 * (grn + red);
	var yb = yel - blu;
	var gr = grn - red;
	var wh = ONE_THIRD * (red + grn + blu);
	
	var whNorm = 500.0 / wh;
	
	yb = yb * whNorm;
	yb = yb + 1024.0;
	
	gr = gr * whNorm;
	gr = gr + 1024.0;
	wh = 4.0 * wh;
	
	var whYbGr = [wh,yb,gr];
	return whYbGr;
}

/**
 * Generates, with saturation, an unsigned 10-bit value from 
 * an integer.
 * 
 * @param {Number} i The integer value to convert.
 * @returns {Number} The resulting integer value with unsigned 
 * 10-bit range.
 * @private
 */
function intTo10Bits(i){
	if (i > 0x3ff){ i = 0x3ff; }
	if (i < 0){ i = 0; }
	return i;
}

/**
 * Generates, with saturation, a 10-bit unsigned value from a 
 * float.
 * 
 * @param {Number} f The floating point value to convert.
 * @returns {Number} The resulting integer value with unsigned 
 * 10-bit range.
 * @private
 */
function floatTo10Bits(f){
	return intTo10Bits(Math.floor(f));
}

/**
 * Forms an LPXImage cell from integer image color components and 
 * white level.
 * 
 * @param {Number} wh The monochrome value as integer with unsigned 
 * 10-bit range.
 * @param {Number} yb The blue-yellow value as an integer with 
 * unsigned 11-bit range.
 * @param {Number} gr The green-red value as an integer with 
 * unsigned 11-bit range.
 * @returns {Number} The LPXImage cell value.
 * @private
 */
function packLPImageCell(wh, yb, gr){
	var num = gr;							// MSB is green-red component
	num = num << 11;
	num = num | yb;
	num = num << 10;
	num = num | wh;							// LSB is white level
	return num;
}

/**
 * Creates a log-polar image cell value from red, green and blue pixel 
 * color components. These can be integer values from single pixels or
 * floating point averaged values from groups of pixels. In the latter
 * case (which is more common) color resolution better than eight bits 
 * can be obtained by the averaging process.
 * 
 * @param {Number} red The red component in the range 0 <= red <= 255.0.
 * @param {Number} grn The green component in the range 0 <= green <= 255.0.
 * @param {Number} blu The blue component in the range 0 <= blue <= 255.0.
 * @returns {Number} Value of the log-polar image cell.
 * @private
 */
function createLPCellFromRGB(red, grn, blu){
	var whYbGr = rgbToWhYbGr(red, grn, blu);
	
	var cell = packLPImageCell(floatTo10Bits(whYbGr[0]), floatTo11Bits(whYbGr[1]), floatTo11Bits(whYbGr[2]));
	return cell;
}

/**
 * Gets the spiral period number corresponding to the supplied 
 * LPXImage spiral period string or number in the range 12 to 
 * 384.
 * 
 * @param {(String | Number)} period Either a string of the form
 * LPXnnn where nnn is the number of LPXImage cells per spiral 
 * revolution or just that number. If period is undefined, then
 * returns the default value of 48.5.
 * 
 * @returns {Number} The spiral period number or 0 if the param 
 * value is invalid.
 * @private
 */
function getPeriod(period){
	var spPer = 48.5;
	
	if (period === undefined){
		return spPer;
	}
	else if (typeof(period) === 'string'){
		if (period.slice(0,3) === 'LPX'){
			spPer = Number(period.slice(3));
			return spPer + 0.5;
		}
		var errStr = "String not recognized: " + period;
		throw new Error(errStr);
	}
	else if (typeof(period) === 'number'){
		if (period >= 12 && period <= 384.5){
			return Math.floor(period) + 0.5;
		}
		throw new Error("Spiral period out of range 12 to 384.");
	}
	var errMsg = "Argument not recognized: " + period;
	throw new Error(errMsg);
}

/**
 * Gets the index of the hexagonal LPXImage cell that contains the 
 * point (x, y) specified in dimensions of rectilinear image pixels.
 * 
 * @param {Number} x Horizontal displacement from the center of the spiral.
 * @param {Number} y Vertical displacement from the center of the spiral.
 * @param {Number} spiralPer The integer number of cells per revolution of the spiral.
 * @returns {Number} The integer index of the cell containing the point (x,y).
 * @private
 */
function getLPXCellIndex(x, y, spiralPer){
	
	// HOW THE CELL INDEX VALUE IS CALCULATED
	//
	// Step 1: Find the cell that bounds the point angularly along spiral r1.
	// 
	// Given the absolute angle derived from cell index ii,
	//
	// ang = pitchAng * ii
	//
	// and
	//
	// pitch = 1 / spiralPer
	//
	// and equations of the spiral through the center of a cell and the center  
	// of a cell one row above as functions of absolute angle ang:
	//
	// r1 = r0 * (sv_A * pitch + 1)^(ang / TWO_PI)
	//
	// r2 = r0 * (sv_A * pitch + 1)^((ang + TWO_PI) / TWO_PI)
	//
	// then after solving for ang we have:
	//
	// ang  = TWO_PI * log(r1 / r0) / log((sv_A * pitch) + 1)
	//
	// Since cell index ii can be decomposed into an integer period index iPer 
	// and an integer half-cell index j that selects half cells through one 
	// period then because the half-cell period is 2 * spiralPer,
	//
	// ang = pitchAng * (iPer * (2 * spiralPer) + j) / 2
	//
	// Expanding the r1 equation and rearranging:
	//
	// pitchAng * ((iPer * 2 * spiralPer) + j) / 2 = TWO_PI * log(r1 / r0) / log((sv_A * pitch) + 1)
	// (iPer * 2 * spiralPer) + j = 2 * TWO_PI * log(r1 / r0) / log(sv_A * pitch + 1) / pitchAng
	//
	// results in:
	//
	// iPer * 2 * spiralPer = (2 * TWO_PI * log(r1 / r0) / log(sv_A * pitch + 1) / pitchAng) - j
	//
	// iPer = ((2 * TWO_PI * log(r1 / r0) / log(sv_A * pitch + 1) / pitchAng) - j) * pitch / 2
	//
	// The above equation determines the period index iPer from r in some 
	// cell determined by r1 for a fixed value j. Thus for some r in the
	// range r1 to r2, iPer is just the floor of the right side of the
	// equation:
	//
	// iPer = floor(((2 * TWO_PI * log(r1 / r0) / log(sv_A * pitch + 1) / pitchAng) - j) * pitch / 2)
	//
	// Observing that because of the floor operation in the equation above 
	// j is not restricted just to integer values, let j be the continuous 
	// variable with ang the one-period angle:
	//
	// j = 2 * ang / pitchAng
	//
	// After calculating iPer using j as above, the r1 half-cell index can be 
	// found from:
	//
	// iCell_2 = iPer * (2 * spiralPer) + floor(j)
	//
	// and the cell index from
	//
	// iCell = floor(iCell_2 / 2)
	//
	// Step 2: Within the bounded region determined above find which one of 
	// five possible regions the point is in.
	//
	// Three of these regions (1, 2, 3) belong to the cell that bounds the spiral 
	// along r1. The other two (4) and (5) belong to cells in the next higher period. 
	//
	//                   |
	//  3*s_2  * * * * * * * * * * *  r2: radial centerlines of cells with regions 4 and 5
	//           *       *       *
	//           *       *       *
	//           *   4   *   5   *
	//  2*s_2  * *       *       * 
	//           *     * * *     *
	//           *   *   *   *   *
	//           * *  3  *  2  * *
	//   s_2   * * * * * * * * * *    
	//           *               *
	//           *       1       *
	//           *               *
	//    0    * * * * * * * * * * *  r1: radial centerline of cell with regions 1,2,3
	//                   |
	//                   ^ Half-cell boundary along r1
	//
	// The correct region is determined by constructing diagonal bounds to 
	// separate Region 3 from 4 and Region 2 from 5 and using comparisons to 
	// find point location relative to the boundaries.
	
	if (x === 0 && y === 0){
		return 0;
	}
		
	spiralPer = Math.floor(spiralPer) + 0.5;
	
	var radius = Math.sqrt(x * x + y * y);
	var angle = Math.atan2(y, x);
	
	var pitch = 1.0 / spiralPer;
	var pitchAng = 0.99999999 * TWO_PI * pitch;			// Fixup for roundoff error 
	var invPitchAng = 1.0 / pitchAng;
	
	var ang = angle < 0.0 ? angle + TWO_PI : angle;		// Map angles to range 0 to TWO_PI
	
	var arg = ang * invPitchAng;
	var j = 2 * arg - 0.0000001;						// Offset the angle enough that the low 
														// boundary is included in the cell.
	var sv_A_pitch_1 = sv_A * pitch + 1;
	
	var iPer = Math.floor(((FOUR_PI * Math.log(radius / r0) / Math.log(sv_A_pitch_1) * invPitchAng) - j) * pitch * 0.5);
	
	var iPer_2_spiralPer = iPer * 2 * spiralPer;
	
	var iCell_2 = iPer_2_spiralPer + Math.floor(j);		// Half-period index
	
	var absAng = 0.5 * (iPer_2_spiralPer + j) * pitchAng;
	
	var ang1 = 0.5 * iCell_2 * pitchAng;				// Absolute ang1 on half-cell boundaries
														
	var r1 = r0 * Math.pow(sv_A_pitch_1, (absAng / TWO_PI));  // Radius through center of cell at ang
	
	var r2 = r1 * sv_A_pitch_1;							// Radius through center of cells at next spiral period
	var s_2 = (r2 - r1) * ONE_THIRD;
		
	var iCell = Math.floor(iCell_2 / 2);				// Index of bounding cell
	
	var dr = radius - r1;								// The part of radius within r1 to r2
	var da = absAng - ang1;								// The part of ang in the half-cell with lower bound ang1
	
	if (dr < s_2){										// Region 1
		return iCell;
	}
	if (dr >= s_2 && dr < 2.0 * s_2){
		
		var width = Math.PI * pitch;
		var bound = width * (dr - s_2) / s_2;
		
		if (iCell_2 % 2 > 0.0){							// If in the upper half-cell
			if (da >= width - bound){					// If Region 4
				iCell = iCell + Math.floor(spiralPer) + 1;
				return iCell;
			}
			else{										// Else if Region 3
				return iCell;
			}
		}
		else {											// Else in the lower half-cell
			if (da < bound){							// If Region 5
				iCell = iCell + Math.floor(spiralPer);
			}
			return iCell;								// Else if Region 2
		}
	}
	else {						//	if (dr >= 2.0 * s_2)
		if (iCell_2 % 2 > 0.0){							// If Region 4
			iCell = iCell + Math.floor(spiralPer) + 1;
		}
		else{											// Else if Region 5
			iCell = iCell + Math.floor(spiralPer);
		}
		return iCell;
	}
}

/**
 * Gets the radius in rectilinear pixels of a circle that would 
 * enclose a log-polar image with the specified spiral period and 
 * array length.
 * 
 * @param {Number} length The length of the log-polar image array.
 * @param {Number} spiralPer The number of LPXImage cells in one 
 * spiral revolution.
 * @returns {Number} The radius value.
 * @private
 */
function getSpiralRadius(length, spiralPer){
	spiralPer = Math.floor(spiralPer) + 0.5;
	var revs = length / spiralPer;
	var r1 = r0 * Math.pow((sv_A / spiralPer) + 1, revs);
	return r1;
}

/**
 * Gets the radius in rectilinear pixels of the LPXImage fovea region defined as 
 * PI times the diameter of the region within which an LPXImage cell is smaller 
 * than a rectilinear image pixel.
 * 
 * @param {Number} spiralPer The number of cells in one spiral revolution.
 * @returns {Number} The fovea radius.
 * @private
 */
function getFoveaRadius(spiralPer){
	spiralPer = Math.floor(spiralPer) + 0.5;
	return Math.PI / (Math.exp(TWO_PI / spiralPer) - 1.0);
}

/**
 * Gets the number of revolutions of the log-polar spiral through 
 * the fovea region for a log-polar image with the specified spiralPer.
 * 
 * @param {Number} spiralPer The number of cells in one spiral revolution.
 * @returns {Number} The number of revolutions.
 * @private
 */
function getFoveaPeriods(spiralPer){
	spiralPer = Math.floor(spiralPer) + 0.5;
	return Math.floor(Math.log(getFoveaRadius(spiralPer) / r0) *
			spiralPer / TWO_PI) + 1;
}

/**
 * Gets the number of LPXImage cells through the fovea region.
 * 
 * @param {Number} spiralPer The number of cells in one spiral revolution.
 * @returns {Number} The number of cells.
 * @private
 */
function getFoveaLength(spiralPer){
	spiralPer = Math.floor(spiralPer) + 0.5;
	return Math.floor(getFoveaPeriods(spiralPer) * spiralPer);
}

/**
 * Calculates the bounding box of an LPXImage scan 
 * on a rectilinear image taking into account possible 
 * x, y offsets of the scan so that the resulting 
 * bounding box is completely within the bounds of the 
 * rectilinear image.
 * 
 * @param {LPXImage} lpImage The LPXImage for which
 * the bounding box is to be calculated.
 * 
 * @param {Number} w_s The width of the rectilinear image.
 * @param {Number} h_s The Height of the rectilinear image.
 * @returns {Rect} The bounding rectangle with coordinates
 * relative to the lower left corner of the rectilinear
 * image.
 * @private
 */
function getScanBoundingBox(lpImage, w_s, h_s){
	
	var pos = lpImage.getPosition();
	var j_ofs = Math.floor(pos.x_ofs);
	var k_ofs = Math.floor(pos.y_ofs);
	
	var spRad = Math.floor(getSpiralRadius(lpImage.length, lpImage.spiralPer));
	var boundLeft = -spRad;
	var boundRight = spRad;
	var boundTop = spRad;
	var boundBottom = -spRad;
															// Get the xyImage col and row limits 
	var imgWid_2 = Math.floor(0.5 * w_s);					// introduced by the bounding box and
	var imgHt_2 = Math.floor(0.5 * h_s);					// scan offsets.
	var xMin = imgWid_2 + boundLeft + j_ofs;
	if (xMin < 0){
		xMin = 0;
	}
		
	var xMax = w_s - (imgWid_2 - boundRight) + j_ofs;
	if (xMax > w_s){
		xMax = w_s;
	}
		
	var yMin = imgHt_2 + boundBottom + k_ofs;
	if (yMin < 0){
		yMin = 0;
	}
		
	var yMax = h_s - (imgHt_2 - boundTop) + k_ofs;
	if (yMax > h_s){
		yMax = h_s;
	}
	
	var rect = new Rect();
	rect.xMin = xMin;
	rect.xMax = xMax;
	rect.yMin = yMin;
	rect.yMax = yMax;
	return rect;
}

/**
 * Renders an LPXImage object to a standard rectilinear 
 * image in a nodejs buffer.
 * 
 * @param {Object} xyImage The object that will contain 
 * the rendered LPXImage. At a minimum this object 
 * contains a width value, xyImage.width, a height value, 
 * xyImage.height, and a nodejs buffer, xyImage.data, 
 * of size 4 * xyImage.width * xyImage.height to
 * contain the RGB or BGR pixels in four byte units 
 * determined by references (data.slice()) provided to 
 * the first color byte of each type in the buffer: 
 * xyImage.redBuff, xyImage.grnBuff, and xyImage.bluBuff.
 * 
 * @param {LPXImage} lpImage The LPXImage object to render. The 
 * LPXImage cells will be rendered only up to the length of the 
 * cell array. Moreover, cells containing the special marker 
 * value 0x00200400 are not rendered. Unrendered cells permit 
 * any image pixels already filled in xyImage to continue to 
 * display in the final image.
 * 
 * @param {Object} viewParams A ViewParams object that provides 
 * optional display settings for rendered scan placement, offset 
 * and range.
 * 
 * If no viewParams argument is provided then the placement 
 * defaults to the the offsets at which the LPXImage was 
 * originally captured, cellOffset is zero and cellRange is 
 * the number of cells that will fit on the rendered image.
 * 
 * @private
 */
function renderTo(xyImage, lpImage, viewParams){
	var w_s = xyImage.width;
	var h_s = xyImage.height;
	
	var scanTables = lpImage.getScanTables();
	
	var maxLen = lpImage.nMaxCells;
	
	var j_ofs, k_ofs, pos, cellOffset, cellRange;
	if (viewParams === undefined){
		pos = lpImage.getPosition();	// The position where the scan was taken on the original image
		
		j_ofs = Math.floor(pos.x_ofs);
		k_ofs = Math.floor(pos.y_ofs);
		
		cellOffset = 0;
		cellRange = maxLen;
	}
	else{
		pos = lpImage.getPosition();	// The position where the scan was taken on the original image
		
		j_ofs = Math.floor(pos.x_ofs);
		k_ofs = Math.floor(pos.y_ofs);
										// Add any additional offsets for rendering the image.
		j_ofs += Math.floor(viewParams.x);
		k_ofs += Math.floor(viewParams.y);
		
		cellOffset = viewParams.cellOffset;
		cellRange = viewParams.cellRange;
	}
	
	var box = getScanBoundingBox(lpImage, w_s, h_s);
	var colMin_s = box.xMin;
	var colMax_s = box.xMax;
	var rowMin_s = box.yMin;
	var rowMax_s = box.yMax;
	
	var cellMax = cellOffset + cellRange;
	if (cellMax > maxLen) {
		cellMax = maxLen;
	}
	
	var red = new Buffer(cellMax);
	var grn = new Buffer(cellMax);
	var blu = new Buffer(cellMax);
	
	for (var i = 0; i < cellMax; i += 1){
		var rgb = getRGBFromLPCell(lpImage.cellArray[i]);
		red[i] = rgb[0];
		grn[i] = rgb[1];
		blu[i] = rgb[2];
	}
	
	var w_m = scanTables.mapWidth;
	var h_m = w_m;
	
	var j0 = j_ofs + Math.floor(w_s / 2);
	var k0 = k_ofs + Math.floor(h_s / 2);
	
	var ws_wm_jofs = Math.floor((w_m - w_s) / 2) - j_ofs;	// Column offset into the scan map
	var hs_hm_kofs = Math.floor((h_m - h_s) / 2) - k_ofs;	// Row offset into the scan map
	
	var i_m, i_m_0, i_s, i_s_0, i_s_ofs, i_s_max, i_m_ofs, k_s;
	
	var i_m_ofs_0 = ws_wm_jofs + w_m * hs_hm_kofs;		// Index offset into the scan map
	
	scanTables.initGetCellIndexForPixel();
	
	i_m_ofs = i_m_ofs_0 + w_m * rowMin_s;				// Scan map offset for the k_s rectilinear image row
	
	i_s_ofs = w_s * rowMin_s;							// Index offset for the k_s rectilinear image row
	
	var outerPixelCellIdx = scanTables.outerPixelCellIdx;
	var outerPixelIndex = scanTables.outerPixelIndex;
	var iAr_max = scanTables.length - 2;
	var nextPixIdx = 1;
	var iAr = 0;
	
	var lpCell = null;
	var pixel = null;
	var iCellLast = 0;
	
	var lastFoveaIndex = scanTables.lastFoveaIndex;
	var iCell = lastFoveaIndex;
	
	var pix = {
		red: 0,
		grn: 0,
		blu: 0
	};
	
	for (k_s = rowMin_s; k_s < rowMax_s; k_s += 1){
		
		i_s_max = i_s_ofs + colMax_s;
		
		i_s_0 = i_s_ofs + colMin_s;
		i_m_0 = i_m_ofs + colMin_s;
		
		for (i_s = i_s_0, i_m = i_m_0;
				i_s < i_s_max; i_s += 1, i_m += 1){		// Render the row.
			
			while (i_m >= nextPixIdx && iAr < iAr_max){
				iAr += 1;
				iCell = outerPixelCellIdx[iAr];
				nextPixIdx = outerPixelIndex[iAr+1];
			}
			
			if (iCell < cellOffset || iCell >= cellMax){
				continue;								// Don't read outside of specified cell range.					
			}
			
			if (iCell === lastFoveaIndex){				// The pixel is in the fovea region.
														// So get the cell index from the position.
				var iC = getLPXCellIndex(i_s - i_s_ofs - j0, k_s - k0, lpImage.spiralPer);
				pix.red = red[iC];
				pix.grn = grn[iC];
				pix.blu = blu[iC];
//				pixel = createPixelFromBGR(blu[iC], grn[iC], red[iC]);
			}
			else if (iCell !== iCellLast){				// Otherwise, use the cell value from the scan table.
				
				pix.red = red[iCell];
				pix.grn = grn[iCell];
				pix.blu = blu[iCell];
//				pixel = createPixelFromBGR(blu[iCell], grn[iCell], red[iCell]);
				iCellLast = iCell;						// Got a new iCell so record the old.
			}
														// For above cases, a pixel value was calculated.
														// If not, the last pixel value is used again.
			if (lpCell === 0x00200400){					// For this special lpCell value 
				continue;								// don't write the pixel.
			}
			
			var i_b = 4 * i_s;
			
			xyImage.redBuff[i_b] = pix.red;
			xyImage.grnBuff[i_b] = pix.grn;
			xyImage.bluBuff[i_b] = pix.blu;
			
//			xyImage.array[i_s] = pixel;					// Write the pixel value.			
		}
		
		i_s_ofs += w_s;									// Set the map and image offsets for the next row.
		i_m_ofs += w_m;
	}
	
	return;
}


/**
 * Renders an LPXImage object to a standard rectilinear 
 * image in a JavaScript array.
 * 
 * @param {Object} xyImage The rectilinear image object 
 * that will contain the rendered LPXImage. At a minimum 
 * this object contains three elements: a width value, 
 * xyImage.width, a height value, xyImage.height and a 
 * JavaScript array, xyImage.array, of size width * height 
 * that will be filled with the rendered image.
 *  
 * @param {LPXImage} lpImage The LPXImage object to render. The 
 * LPXImage cells will be rendered only up to the length of the 
 * cell array. Moreover, cells containing the special marker 
 * value 0x00200400 are not rendered. Unrendered cells permit 
 * any image pixels already filled in xyImage to continue to 
 * display in the final image.
 * 
 * @param {Object} viewParams A ViewParams object that provides 
 * optional display settings for rendered scan placement, offset 
 * and range.
 * 
 * If no viewParams argument is provided then the placement 
 * defaults to the the offsets at which the LPXImage was 
 * originally captured, cellOffset is zero and cellRange is 
 * the number of cells that will fit on the rendered image.
 * 
 * @private
 */
function renderToArray(xyImage, lpImage, viewParams){
	var w_s = xyImage.width;
	var h_s = xyImage.height;
	
	var scanTables = lpImage.getScanTables();
	
	var maxLen = lpImage.nMaxCells;
	
	var j_ofs, k_ofs, pos, cellOffset, cellRange;
	if (viewParams === undefined){
		pos = lpImage.getPosition();	// The position where the scan was taken on the original image
		
		j_ofs = Math.floor(pos.x_ofs);
		k_ofs = Math.floor(pos.y_ofs);
		
		cellOffset = 0;
		cellRange = maxLen;
	}
	else{
		pos = lpImage.getPosition();	// The position where the scan was taken on the original image
		
		j_ofs = Math.floor(pos.x_ofs);
		k_ofs = Math.floor(pos.y_ofs);
										// Add any additional offsets for rendering the image.
		j_ofs += Math.floor(viewParams.x);
		k_ofs += Math.floor(viewParams.y);
		
		cellOffset = viewParams.cellOffset;
		cellRange = viewParams.cellRange;
	}
	
	var box = getScanBoundingBox(lpImage, w_s, h_s);
	var colMin_s = box.xMin;
	var colMax_s = box.xMax;
	var rowMin_s = box.yMin;
	var rowMax_s = box.yMax;
	
	var cellMax = cellOffset + cellRange;
	if (cellMax > maxLen) {
		cellMax = maxLen;
	}
	
	var red = new Buffer(cellMax);
	var grn = new Buffer(cellMax);
	var blu = new Buffer(cellMax);
	
	for (var i = 0; i < cellMax; i += 1){
		var rgb = getRGBFromLPCell(lpImage.cellArray[i]);
		red[i] = rgb[0];
		grn[i] = rgb[1];
		blu[i] = rgb[2];
	}
	
	var w_m = scanTables.mapWidth;
	var h_m = w_m;
	
	var j0 = j_ofs + Math.floor(w_s / 2);
	var k0 = k_ofs + Math.floor(h_s / 2);
	
	var ws_wm_jofs = Math.floor((w_m - w_s) / 2) - j_ofs;	// Column offset into the scan map
	var hs_hm_kofs = Math.floor((h_m - h_s) / 2) - k_ofs;	// Row offset into the scan map
	
	var i_m, i_m_0, i_s, i_s_0, i_s_ofs, i_s_max, i_m_ofs, k_s;
	
	var i_m_ofs_0 = ws_wm_jofs + w_m * hs_hm_kofs;		// Index offset into the scan map
	
	scanTables.initGetCellIndexForPixel();
	
	i_m_ofs = i_m_ofs_0 + w_m * rowMin_s;				// Scan map offset for the k_s rectilinear image row
	
	i_s_ofs = w_s * rowMin_s;							// Index offset for the k_s rectilinear image row
	
	var outerPixelCellIdx = scanTables.outerPixelCellIdx;
	var outerPixelIndex = scanTables.outerPixelIndex;
	var iAr_max = scanTables.length - 2;
	var nextPixIdx = 1;
	var iAr = 0;
	
	var lpCell = null;
	var pixel = null;
	var iCellLast = 0;
	
	var lastFoveaIndex = scanTables.lastFoveaIndex;
	var iCell = lastFoveaIndex;
	
	for (k_s = rowMin_s; k_s < rowMax_s; k_s += 1){
		
		i_s_max = i_s_ofs + colMax_s;
		
		i_s_0 = i_s_ofs + colMin_s;
		i_m_0 = i_m_ofs + colMin_s;
		
		for (i_s = i_s_0, i_m = i_m_0;
				i_s < i_s_max; i_s += 1, i_m += 1){		// Render the row.
			
			while (i_m >= nextPixIdx && iAr < iAr_max){
				iAr += 1;
				iCell = outerPixelCellIdx[iAr];
				nextPixIdx = outerPixelIndex[iAr+1];
			}
			
			if (iCell < cellOffset || iCell >= cellMax){
				continue;								// Don't read outside of specified cell range.					
			}
			
			if (iCell === lastFoveaIndex){				// The pixel is in the fovea region.
														// So get the cell index from the position.
				var iC = getLPXCellIndex(i_s - i_s_ofs - j0, k_s - k0, lpImage.spiralPer);
				pixel = createPixelFromBGR(blu[iC], grn[iC], red[iC]);
			}
			else if (iCell !== iCellLast){				// Otherwise, use the cell value from the scan table.
				
				pixel = createPixelFromBGR(blu[iCell], grn[iCell], red[iCell]);
				iCellLast = iCell;						// Got a new iCell so record the old.
			}
														// For above cases, a pixel value was calculated.
														// If not, the last pixel value is used again.
			if (lpCell === 0x00200400){					// For this special lpCell value 
				continue;								// don't write the pixel.
			}
			
			xyImage.array[i_s] = pixel;					// Write the pixel value.			
		}
		
		i_s_ofs += w_s;									// Set the map and image offsets for the next row.
		i_m_ofs += w_m;
	}
	
	return;
}

/**
 * Scans the fovea region of a rectilinear image into an LPXImage.
 * 
 * @param {Object} xyImage The object containing the 
 * rectilinear image to be scanned.
 * @param {LPXImage} lpImage The LPXImage object that receives 
 * the scan.
 * @private
 */
function scanFovea(xyImage, lpImage){
	var w_s = xyImage.width;
	var h_s = xyImage.height;
	
	var scanTables = lpImage.getScanTables();
	
	var innerCells = scanTables.innerCells;
	var cellArray = lpImage.cellArray;
	
	var pos = lpImage.getPosition();
	var x_ofs = pos.x_ofs, y_ofs = pos.y_ofs;
	
	var j_ofs = Math.floor(x_ofs);
	var k_ofs = Math.floor(y_ofs);
	
	var w_m = scanTables.mapWidth;
	var h_m = w_m;
	
	var ws_wm_jofs = Math.floor((w_m - w_s) / 2) - j_ofs;	// Column offset into the scan map
	var hs_hm_kofs = Math.floor((h_m - h_s) / 2) - k_ofs;	// Row offset into the scan map
	
	var j_m = 0, j_m_last;
	var k_m = 0, k_m_last;
	var iLast = 0;
	var i_s, j_s, k_s;
	var blu, grn, red;

	var nMax = scanTables.innerLength;
	
	for (var i = 0; i < nMax; i += 1){			// i is the LPXImage cell index
		j_m_last = j_m;
		j_m = innerCells[i].x;					// j_m is the scan map colum index
		
		k_m_last = k_m;
		k_m = innerCells[i].y;					// k_m is the scan map row index
		
		if (j_m === j_m_last && k_m === k_m_last){	// If the pixel is the same as the previous pixel
			cellArray[i] = cellArray[iLast];		// then the cell color is the same as the last 
			continue;								// assigned cell color.
		}
		
		j_s = j_m - ws_wm_jofs;					// j_s is the rectilinear image col index
		k_s = k_m - hs_hm_kofs;					// k_s is the rectilinear image row index
		i_s = 4 * (j_s + w_s * k_s);			// i_s is the rectilinear image array index.
		
		blu = xyImage.bluBuff[i_s];
		grn = xyImage.grnBuff[i_s];
		red = xyImage.redBuff[i_s];
		
		cellArray[i] = createLPCellFromRGB(red, grn, blu);
		
		iLast = i;								// Record the last assigned cell index.
	}
	return;
}

var maxScanAccumsLength = 0;
var accR = [];
var accG = [];
var accB = [];
var count = [];

/**
 * Constructs accumulators to be used by the LPXImage.scanFrom()
 * function.
 * 
 * @param {Number} length The lengths of the accumultor arrays.
 * @returns {Object} An object containing four arrays of the 
 * specified length that are identified as: {accR, accG, accB, count}
 * where the first three arrays contain red, green and blue accumulated 
 * pixel values respectively and count contains the number of pixels 
 * accumulated at corresponding index positions in the acc arrays.
 * @private
 */
function makeScanAccums(length){
	if (length > maxScanAccumsLength){
		accR.length = 0;
		accR = new Array(length);
		accG.length = 0;
		accG = new Array(length);
		accB.length = 0;
		accB = new Array(length);
		count.length = 0;
		count = new Array(length);
		maxScanAccumsLength = length;
	}
	for (var i = 0; i < length; i += 1){
		accR[i] = 0;
		accG[i] = 0;
		accB[i] = 0;
		count[i] = 0;
	}
	return { accR: accR, accG: accG, accB: accB, count: count};
}

/**
 * Scans an LPXImage object from a rectilinear image.
 * 
 * @param {Object} xyImage The object containing the 
 * rectilinear image data. At a minimum this object 
 * contains a width value, xyImage.width, a height 
 * value, xyImage.height, and a node.js buffer, 
 * xyImage.data, containing the RGB or BGR pixels 
 * in four byte units with the following references 
 * (data.slice()) to the first color byte of each type
 * in the buffer: xyImage.redBuff, xyImage.grnBuff, 
 * and xyImage.bluBuff.
 * 
 * @param {LPXImage} lpImage The LPXImage object that 
 * receives the log-polar scan.
 * 
 * @param {Number} x The horizontal position of the center
 * of the spiral scan relative to the center of the 
 * rectilinear image. Positive values to the right.
 * 
 * @param {Number} y The vertical position of the center
 * of the spiral scan relative to the center of the 
 * rectilinear image. Positive values up.
 * 
 * If no position argument the scan defaults to (0, 0).
 * @private
 */
function scanFrom(xyImage, lpImage, x, y){
	var scanTables = lpImage.getScanTables();
	
	var x_ofs = 0, y_ofs = 0;
	if (x !== undefined){
		x_ofs = x;
		y_ofs = y;
	}
	
	lpImage.setPosition(x_ofs, y_ofs);		// Record the LPXImage scan position.
	
	var w_s = xyImage.width;
	var h_s = xyImage.height;
	
	lpImage.width = w_s;					// Record the xyImage width and height.
	lpImage.height = h_s;
	
	scanFovea(xyImage, lpImage);
		
	var nCells = lpImage.length;
	var cellMax = lpImage.nMaxCells;
	if (cellMax > nCells) {
		cellMax = nCells;
	}
	
	var cellArray = lpImage.cellArray;
	
	var w_m = scanTables.mapWidth;
	var h_m = w_m;
															
	var box = getScanBoundingBox(lpImage, w_s, h_s);
	var colMin_s = box.xMin;
	var colMax_s = box.xMax;
	var rowMin_s = box.yMin;
	var rowMax_s = box.yMax;
	
	var j_ofs = Math.floor(x_ofs);
	var k_ofs = Math.floor(y_ofs);
	
	var ws_wm_jofs = Math.floor((w_m - w_s) / 2) - j_ofs;	// Column offset into the scan map
	var hs_hm_kofs = Math.floor((h_m - h_s) / 2) - k_ofs;	// Row offset into the scan map
	
	var scanAccums = makeScanAccums(cellMax);
	var accR = scanAccums.accR;
	var accG = scanAccums.accG;
	var accB = scanAccums.accB;
	var count = scanAccums.count;
	
	var redBuffer = xyImage.redBuff;
	var grnBuffer = xyImage.grnBuff;
	var bluBuffer = xyImage.bluBuff;
	
	var outerPixelCellIdx = scanTables.outerPixelCellIdx;
	var outerPixelIndex = scanTables.outerPixelIndex.slice(1);
	
	var iAr = 0;
	var iAr_max = scanTables.length - 3;
	var iCell = 0;
	
	var i_m_ofs_0 = ws_wm_jofs + w_m * hs_hm_kofs;	// Index offset into the scan map
	var i_s_ofs, i_m_ofs, i_m_0, i_m_max, iBuff0, nextPixIdx = 1;
	
	i_m_ofs = i_m_ofs_0 + w_m * rowMin_s;			// Scan map offset for the k_s rectilinear image row
	i_s_ofs = w_s * rowMin_s;						// Index offset for the k_s rectilinear image row
	
	for (var k_s = rowMin_s; k_s < rowMax_s; k_s += 1){
		
		i_m_max = colMax_s + i_m_ofs;
		
		iBuff0 = 4 * (i_s_ofs + colMin_s);
		i_m_0 = i_m_ofs + colMin_s;
		
		for (var i_m = i_m_0, iBuf = iBuff0; i_m < i_m_max; i_m += 1, iBuf += 4){
													// Update iCell at the cell boundaries
													// provided by the scanTables outerPixel arrays.
			while (i_m >= nextPixIdx && iAr < iAr_max){
				iAr += 1;
				nextPixIdx = outerPixelIndex[iAr];
				iCell = outerPixelCellIdx[iAr];
			}
			
			if (iCell >= cellMax){
				continue;
			}
							
			accR[iCell] += redBuffer[iBuf];			// Accumulate pixel colors into accumulators 
			accG[iCell] += grnBuffer[iBuf];			// for LPXImage cells.
			accB[iCell] += bluBuffer[iBuf];
			
			count[iCell] += 1;						// Keep a count for averaging the accumulated pixel colors.
		}
		
		i_s_ofs += w_s;								// Set the map and image offsets for the next row
		i_m_ofs += w_m;
	}
	
	var fR, fG, fB, norm;
	
	var strt = scanTables.lastFoveaIndex + 1;
	
	for (var i = strt; i < cellMax; i += 1){
		if (count[i] === 0){
			continue;
		}
			
		norm = 1.0 / count[i];
		
		fR = norm * accR[i];
		fG = norm * accG[i];
		fB = norm * accB[i];
		
		cellArray[i] = createLPCellFromRGB(fR, fG, fB);
	}
	return;
}

/**
 * Extracts the 10-bit monochrome component from an LPXImage cell.
 * 
 * @param lpCell {Number} The LPXImage cell value.
 * @returns {Number} The monochrome component in the range 0 to 1023 as an unsigned integer.
 * @private
 */
function extractCell_wht_blk(lpCell){
	return (lpCell & 0x000003ff);
}

/**
 * Extracts the 11-bit yellow - blue component from an LPXImage cell.
 * 
 * @param lpCell {Number} The LPXImage cell value.
 * @returns {Number} The blue-yellow component in the range -1024 to 1023 as a signed integer.
 * @private
 */
function extractCell_yel_blu(lpCell){
	return ((lpCell >>> 10) & 0x000007ff) - 1024;
}

/**
 * Extracts the 11-bit green - red component from an LPXImage cell.
 * 
 * @param lpCell {Number} The LPXImage cell value.
 * @returns {Number} The green-red component in the range -1024 to 1023 as a signed integer.
 * @private
 */
function extractCell_grn_red(lpCell){
	return ((lpCell >>> 21) & 0x000007ff) - 1024;
}

/**
 * Geometric constants that are used to construct a log-polar spiral. 
 * These are read only.
 * @private
 */
var constant = {
	
	/**
	 * r0
	 * 
	 * @global
	 * @alias constant.r0
	 * @memberof! constant
	 */
	r0: r0,
	
	/**
	 * sv_A
	 * 
	 * @global
	 * @alias constant.sv_A
	 * @memberof! constant
	 */
	sv_A: sv_A,
	
	/**
	 * maxSpiralRad
	 * 
	 * @global
	 * @alias constant.maxSpiralRad
	 * @memberof! constant
	 */
	maxSpiralRad: maxSpiralRad
};

/**
 * Gets the position of the LPXImage cell with the 
 * specified index.
 * 
 * @param {Number} spiralPer The spiral period of the
 * LPXImage object.
 * @param {Number} index The cell index.
 * @returns {Object} An object with coordinate members:
 * {x, y, radius, angle}.
 * 
 * @private
 */
function getLPXCellPosition(index, spiralPer){
	spiralPer = Math.floor(spiralPer) + 0.5;
	var pitch = 1.0 / spiralPer;
	var pitchAng = TWO_PI * pitch;
	var sv_A_pitch_1 = sv_A * pitch + 1;
	
	var ang = pitchAng * (index + 0.5);
	var radius = r0 * Math.pow(sv_A_pitch_1, ang * inv_TWO_PI);
	
	var sinAng = Math.sin(ang);
	var cosAng = Math.cos(ang);
	var x = radius * cosAng;
	var y = radius * sinAng;
	
	return {x: x, y: y, radius: radius, angle: ang};
}

/**
 * Geometry information functions for an LPXImage object.
 * 
 * @private
 */
var geometry = {
	/**
	 * Gets the index of the LPXImage cell that contains the 
	 * specified point (x, y) in pixel coordinates.
	 * 
	 * @global
	 * @alias geometry.getCellIndex
	 * @memberof! geometry
	 * 
	 * @param {Number} x The horizontal position relative to the 
	 * center of the log-polar spiral.
	 * @param {Number} y The vertical position relative to the
	 * center of the log-polar spiral.
	 * @param {Number} spiralPer The number of LPXImage cells 
	 * through one revolution of the log-polar spiral. 
	 * @returns {Number} The index of the cell in the cell array.
	 */
	getLPXCellIndex: function (x, y, spiralPer){
		return getLPXCellIndex(x, y, spiralPer);
	},
	
	/**
	 * Gets the position in pixels (relative to the center 
	 * of the LPXImage spiral) of the LPXImage cell with the 
	 * specified index.
	 * 
	 * @global
	 * @alias geometry.getLPXCellPosition
	 * @memberof! geometry
	 * 
	 * @param {Number} spiralPer The spiral period of the
	 * LPXImage object.
	 * 
	 * @param {Number} index The cell index.
	 * 
	 * @returns {Object} An object with coordinate members:
	 * {x, y, radius, angle}. The angle value is the absolute 
	 * angle from the orgin of the spiral and will generally 
	 * be much larger than two times pi.
	 */
	getLPXCellPosition: function (index, spiralPer){
		return getLPXCellPosition(index, spiralPer);
	},

	/**
	 * Gets the number of LPXImage cells through the fovea region.
	 * 
	 * @global
	 * @alias geometry.getFoveaLength
	 * @memberof! geometry
	 * 
	 * @param {Number} spiralPer The number of LPXImage cells 
	 * through one revolution of the log-polar spiral.
	 * @returns {Number} The number of cells.
	 */
	getFoveaLength: function (spiralPer){
		return getFoveaLength(spiralPer);
	},
		
	/**
	 * Gets the number of revolutions of the log-polar spiral 
	 * through the fovea region for this log-polar image.
	 * 
	 * @global
	 * @alias geometry.getFoveaPeriods
	 * @memberof! geometry
	 * 
	 * @param {Number} spiralPer The number of LPXImage cells 
	 * through one revolution of the log-polar spiral.
	 * or number.
	 * @returns {Number} The number of revolutions.
	 */
	getFoveaPeriods: function (spiralPer){
		return getFoveaPeriods(spiralPer);
	},
			
	/**
	 * Gets the radius in rectilinear pixels of the fovea region.
	 * 
	 * @global
	 * @alias geometry.getFoveaRadius
	 * @memberof! geometry
	 * 
	 * @param {Number} spiralPer The number of LPXImage cells 
	 * through one revolution of the log-polar spiral.
	 * @returns {Number} The fovea radius.
	 */
	getFoveaRadius: function (spiralPer){
		return getFoveaRadius(spiralPer);
	},
	
	/**
	 * Gets the radius in rectilinear pixels of a circle that would 
	 * enclose a log-polar image with the specified spiral period and 
	 * array length.
	 * 
	 * @global
	 * @alias geometry.getSpiralRadius
	 * @memberof! geometry
	 * 
	 * @param {Number} length The length of the log-polar image array.
	 * @param {Number} spiralPer The number of LPXImage cells in one 
	 * spiral revolution.
	 * @returns {Number} The radius value.
	 */
	getSpiralRadius: function (length, spiralPer){
		return Math.round(getSpiralRadius(length, spiralPer));
	},
	
	/**
	 * Gets the radius in rectilinear pixels of a circle that would 
	 * enclose a log-polar image with the largest supported number 
	 * of LPXImage cells based on the current size of the scan map.
	 * 
	 * @global
	 * @alias geometry.getMaxSpiralRadius
	 * @memberof! geometry
	 * 
	 * @returns {Number} The radius value.
	 */
	getMaxSpiralRadius: function (){
		return maxSpiralRad;
	},
	
	/**
	 * Gets the expansion rate of the spiral through one revolution.
	 * 
	 * @global
	 * @alias geometry.getSpiralExpansionRate
	 * @memberof! geometry
	 * 
	 * @param {Number} spiralPer The number of LPXImage cells 
	 * through one revolution of the log-polar spiral.
	 * 
	 * @returns {Number} Expansion rate as the ratio of radii of 
	 * cells separated by one spiral period.
	 */
	getSpiralExpansionRate: function(spiralPer){
		spiralPer = Math.floor(spiralPer) + 0.5;
		var spiralRate = (sv_A / spiralPer) + 1;
		return spiralRate;
	}
};

/**
 * Dissection and construction methods for LPXImage cells.
 * 
 * @private
 */
var cell = {
	/**
	 * Forms an LPXImage cell from integer image color components and 
	 * white level.
	 * 
	 * @global
	 * @alias cell.packLPImageCell
	 * @memberof! cell
	 * 
	 * @param {Number} wh The monochrome value as integer with unsigned 
	 * 10-bit range.
	 * @param {Number} by The blue-yellow value as an integer with 
	 * unsigned 11-bit range.
	 * @param {Number} gr The green-red value as an integer with 
	 * unsigned 11-bit range.
	 * @returns {Number} The LPXImage cell value.
	 */
	packLPImageCell: function (wh, by, gr){
		return packLPImageCell(wh, by, gr);
	},
			
	/**
	 * Extracts the 10-bit monochrome component from an LPXImage cell.
	 * 
	 * @global
	 * @memberof! cell
	 * @alias cell.extractCell_wht_blk
	 * 
	 * @param cell {Number} The LPXImage cell value.
	 * @returns {Number} The monochrome component in the range 0 to 
	 * 1023 as an unsigned integer.
	 */
	extractCell_wht_blk: function (cell){
		return extractCell_wht_blk(cell);
	},
	
	/**
	 * Extracts the 11-bit blue - yellow component from an LPXImage 
	 * cell.
	 * 
	 * @memberof! cell
	 * @alias cell.extractCell_yel_blu
	 * @global
	 * 
	 * @param cell {Number} The LPXImage cell value.
	 * @returns {Number} The blue-yellow component in the range
	 * -1024 to 1023 as a signed integer.
	 */
	extractCell_yel_blu: function (cell){
		return extractCell_yel_blu(cell);
	},
	
	/**
	 * Extracts the 11-bit green - red component from an LPXImage cell.
	 * 
	 * @memberof! cell
	 * @alias cell.extractCell_grn_red
	 * @global
	 * 
	 * @param cell {Buffer} The LPXImage cell.
	 * @returns {Number} The green-red component in the range -1024 
	 * to 1023 as a signed integer.
	 */
	extractCell_grn_red: function (cell){
		return extractCell_grn_red(cell);
	},
		
	/**
	 * Creates a log-polar image cell value from red, green and blue pixel 
	 * color components. These can be integer values from single pixels or
	 * floating point averaged values from groups of pixels. In the latter
	 * case color resolution better than eight bits can be obtained by the
	 * averaging process.
	 * 
	 * @alias cell.createLPCellFromRGB
	 * @memberof! cell
	 * @global
	 * 
	 * @param {Number} red The red component in the 
	 * range 0 <= red <= 255.0.
	 * @param {Number} grn The green component in 
	 * the range 0 <= green <= 255.0.
	 * @param {Number} blu The blue component in 
	 * the range 0 <= blue <= 255.0.
	 * @returns {Number} Value of the log-polar image cell.
	 */
	createLPCellFromRGB: function (red, grn, blu){
		return createLPCellFromRGB(red, grn, blu);
	}
};

/**
 * Numeric conversion methods for accessing the contents of 
 * LPXImage cells and pixels.
 * 
 * @private
 */
var convert = {
	/**
	 * Generates, with saturation, an unsigned char value from a 
	 * float.
	 * 
	 * @global
	 * @alias convert.floatToByte
	 * @memberof! convert
	 * 
	 * @param {Number} f The floating point value to convert.
	 * @returns {Number} An unsigned integer in the range 
	 * 0 to 255.
	 */
	floatToByte: function (f){ return floatToByte(f); },
	
	/**
	 * Generates, with saturation, an unsigned char value from an 
	 * integer.
	 * 
	 * @global
	 * @alias convert.intToByte
	 * @memberof! convert
	 * 
	 * @param {Number} i The integer value to convert.
	 * @returns {Number} An unsigned integer in the range 
	 * 0 to 255 inclusive.
	 */
	intToByte: function (i){ return intToByte(i); },
	
	/**
	 * Generates, with saturation, a 10-bit unsigned value from a 
	 * float.
	 * 
	 * @global
	 * @alias convert.floatTo10Bits
	 * @memberof! convert
	 * 
	 * @param {Number} f The floating point value to convert.
	 * @returns {Number} An unsigned integer in the range 
	 * 0 to 1023 inclusive.
	 */
	floatTo10Bits: function (f){ return intTo10Bits(Math.floor(f)); },
	
	/**
	 * Generates, with saturation, an unsigned 10-bit value from an 
	 * integer.
	 * 
	 * @global
	 * @alias convert.intTo10Bits
	 * @memberof! convert
	 * 
	 * @param {Number} i The integer value to convert.
	 * @returns {Number} An unsigned integer in the range 
	 * 0 to 1023 inclusive.
	 */
	intTo10Bits: function (i){ return intTo10Bits(i); },
	
	/**
	 * Generates, with saturation, an 11-bit unsigned value from a 
	 * float.
	 * 
	 * @global
	 * @alias convert.floatTo11Bits
	 * @memberof! convert
	 * 
	 * @param {Number} f The floating point value to convert.
	 * @returns {Number} An unsigned integer in the range 
	 * 0 to 2047 inclusive.
	 */
	floatTo11Bits: function (f){ return floatTo11Bits(f); },
	
	/**
	 * Generates, with saturation, an unsigned 11-bit value from an 
	 * integer.
	 * 
	 * @global
	 * @alias convert.intTo11Bits
	 * @memberof! convert
	 * 
	 * @param {Number} i The integer value to convert.
	 * @returns {Number} An unsigned integer in the range 
	 * 0 to 2047 inclusive.
	 */
	intTo11Bits: function (i){ return intTo11Bits(i); }
};

/**
 * Constructor for a PositionPair object that can hold a pair 
 * of position variables.
 * 
 * @constructor
 */
var PositionPair = function (){
	/**
	 * Horizontal position or displacement value.
	 */
	this.x = 0;					// x index
	/**
	 * Vertical position or displacement value.
	 */
	this.y = 0;					// y index
};

/**
 * Converts a buffer to a JavaScript array.
 * 
 * @param {Buffer} buffer The buffer to convert.
 * @returns {Array} The resulting array.
 */
function bufferToInt32Array(buffer){
	var length = buffer.length;
	var array = new Array(length / 4);
	
	var val;
	for (var i = 0, j = 0; i < length / 4; i += 1, j += 4){
		val = buffer[j];
		val |= buffer[j+1] << 8;
		val |= buffer[j+2] << 16;
		val |= buffer[j+3] << 24;
		array[i] = val;
	}
	return array;
}

/**
 * For the purpose of saving a LPXScanTables object, this function 
 * converts an LPXScanTables object to a JSON string. A skeleton 
 * copy of the LPXScanTables object is made and that copy is 
 * stringified instead of the LPXScanTables object in order to 
 * avoid stringifying all of the functions that are attached to an 
 * LPXScanTables object.
 * 
 * @param {Object} scnTab The LPXScanTables object to jsonize.
 * 
 * @param {Object} lpXSTemp The skeleton object to use.
 * 
 * @returns {Buffer} The stringified LPXScanTables object contained
 * in a Buffer.
 * 
 * @private
 */
function jsonizeScanTables(scnTab, lpXSTemp){
	lpXSTemp.mapWidth = scnTab.mapWidth;
	lpXSTemp.spiralPer = scnTab.spiralPer;
	lpXSTemp.lastFoveaIndex = scnTab.lastFoveaIndex;
	lpXSTemp.lastCellIndex = scnTab.lastCellIndex;
	lpXSTemp.length = scnTab.length;
	lpXSTemp.innerLength = scnTab.innerLength;
	
	lpXSTemp.outerPixelIndex.length = 0;
	lpXSTemp.outerPixelCellIdx.length = 0;
	var i;
	for (i = 0; i < lpXSTemp.length; i += 1){
		lpXSTemp.outerPixelIndex.push(scnTab.outerPixelIndex[i]);
		lpXSTemp.outerPixelCellIdx.push(scnTab.outerPixelCellIdx[i]);
	}
	
	lpXSTemp.innerCells.length = 0;
	for (i = 0; i < lpXSTemp.innerLength; i += 1){
		lpXSTemp.innerCells.push(scnTab.innerCells[i]);
	}
	
	var json = JSON.stringify(lpXSTemp);
	
	var jsonBuf = new Buffer(json);
	return jsonBuf;
}

/**
 * Synchronously saves an LPXScanTables object as a gzip 
 * compressed JSON object converted to Base64.
 * 
 * @param {Object} scnTab The LPXScanTables object to save.
 * @param {String} dirName The directory to save to.
 * 
 * @private
 */
function saveScanTablesJSON_GZ_B64(scnTab, dirName){
	
	var jsonBuf = jsonizeScanTables(scnTab, scnTab.lpXSTemp);
	
	var scnTabName = 'ScanTables' + Math.floor(scnTab.spiralPer) + '.json';	// Scan tables name identifies the spiral period.
	
	if (dirName === undefined){
		dirName = '.';									// Use the directory containing the calling script.
	}

	zlib.gzip(jsonBuf, function (err, rslt){
		
		if (err){ throw new Error(err); }
		
		var objName = dirName + '/' + scnTabName + '.gz';
		
		objName += '.b64';									// Will be saving as a base64 text file.
		
		var exists = fs.existsSync(objName);
		if (exists === true){								// If a previous base64 scan tables version exists
			fs.unlinkSync(objName);							// delete it.
		}
		
		var rsltB64 = btoa(rslt);							// Create base64 string.
		
		var rsltB64Buf = new Buffer(rsltB64);				// Convert the string to a buffer.
		
		var fd = fs.openSync(objName,'w');
		fs.writeSync(fd, rsltB64Buf, 0, rsltB64Buf.length, 0);
		fs.closeSync(fd);
		
	});
}

/**
 * Synchronously saves an LPXScanTables object as a JSON object.
 * 
 * @param {Object} scnTab The LPXScanTables object to save.
 * @param {String} dirName The directory to save to.
 * 
 * @private
 */

function saveScanTablesJSON(scnTab, dirName){
	
	var jsonBuf = jsonizeScanTables(scnTab, scnTab.lpXSTemp);
	
	var scnTabName = 'ScanTables' + Math.floor(scnTab.spiralPer) + '.json';	// Scan tables name identifies the spiral period.
	
	if (dirName === undefined){
		dirName = cwd;									// Use the directory containing the LPXImage module
	}
	
	var objName = dirName + '/' + scnTabName;

	var exists = fs.existsSync(objName);
	if (exists === true){								// If a previous ScanTables object exists
		fs.unlinkSync(objName);							// delete it.
	}
	var fd = fs.openSync(objName,'w');
	fs.writeSync(fd, jsonBuf, 0, jsonBuf.length, 0);
	fs.closeSync(fd);
}

/**
 * Synchronously loads a JSONized LPXScanTables object.
 * 
 * @param {Object} scnTab An empty LPXScanTables object to 
 * fill on load.
 * @param {String} fileName The filename of the LPXScanTables 
 * object to be loaded.
 * 
 * @private
 */

function loadJSONSync(scnTab, fileName){
	
	var jsonStr = fs.readFileSync(fileName);
		
	var sct = JSON.parse(jsonStr);
	
	scnTab.mapWidth = sct.mapWidth;
	scnTab.length = sct.length;
	scnTab.innerLength = sct.innerLength;
	
	var makeNewArrays = false;
	if (scnTab.outerPixelIndex.length === 0 || sct.length > scnTab.outerPixelIndex.length){
		scnTab.outerPixelIndex.length = 0;
		scnTab.outerPixelCellIdx.length = 0;
		scnTab.innerCells.length = 0;
		makeNewArrays = true;
	}
	
	var i;
	for (i = 0; i < sct.length; i += 1){
		if (makeNewArrays === true){
			scnTab.outerPixelIndex.push(sct.outerPixelIndex[i]);
			scnTab.outerPixelCellIdx.push(sct.outerPixelCellIdx[i]);
		}
		else {
			scnTab.outerPixelIndex[i] = sct.outerPixelIndex[i];
			scnTab.outerPixelCellIdx[i] = sct.outerPixelCellIdx[i];
		}
	}
	
	for (i = 0; i < sct.innerLength; i += 1){
		if (makeNewArrays === true){
			scnTab.innerCells.push(sct.innerCells[i]);
		}
		else {
			scnTab.innerCells[i].x = sct.innerCells[i].x;
			scnTab.innerCells[i].y = sct.innerCells[i].y;
		}
	}
	
	scnTab.lastFoveaIndex = sct.lastFoveaIndex;
	scnTab.lastCellIndex = sct.lastCellIndex;
	scnTab.spiralPer = sct.spiralPer;
}

/**
 * Constructor for static log-polar image scanning tables 
 * that are used for fast LPXImage scanning of rectilinear
 * images.
 * 
 * @constructor
 * @param {(Number | String)} arg The number of LPXImage cells in 
 * one revolution of the spiral or the dirName containing the 
 * scan tables files.
 */
var LPXScanTables = function (arg){
	
	this.lpXSTemp = {
		mapWidth: 0,
		spiralPer: 0,
		lastFoveaIndex: 0,
		lastCellIndex: 0,
		length: 0,
		innerLength: 0,
		outerPixelIndex: [],
		outerPixelCellIdx: [],
		innerCells: []
	};
	
	// Members:
	
	this.lastPixIdx = 0;
	this.nextPixIdx = 0;
	this.iAr = 0;
	this.outerCellIndex = 0;
		
	/**
	 * The width (and height) of the scan map in pixels.
	 */
	this.mapWidth = 0;
	
	/**
	 * The number of LPXImage cells in one revolution 
	 * of the spiral.
	 */
	this.spiralPer = 0;
	
	/**
	 * The current active length of the outerPixel arrays.
	 */
	this.length = 0;
	
	/**
	 * Sequential Array of pixel indexes at which the LPXImage 
	 * cell index changed value. The cell index value is provided
	 * in the Array: this.outerPixelCellIdx[].
	 */
	this.outerPixelIndex = [];
	
	/**
	 * Array of LPXImage cell indexes corresponding the the 
	 * pixel indexes provided in the Array of pixel index 
	 * values: this.outerPixelIndex.
	 */
	this.outerPixelCellIdx = [];
	
	/**
	 * The current active length of the innerCells array.
	 */
	this.innerLength = 0;
	
	/**
	 * Array of PositionPair objects for pixels in the fovea 
	 * region that provide the x,y location of the pixel to be
	 * used to color an LPXImage cell with the specified index.
	 */
	this.innerCells = [];
	
	this.lastFoveaIndex = 0;
	
	this.lastCellIndex = 0;
	
// Methods:
	/**
	 * Generates the scan map lookup tables, this.outerPixelIndex, 
	 * and this.outerPixelCellIdx, that determine which LPXImage 
	 * cell gets data contributed from a particular rectilinear 
	 * pixel.
	 */
	this.makeScanMaps = function (){
		var w = this.mapWidth;
		var h = this.mapWidth;
		
		var w_2 = w / 2;
		var h_2 = h / 2;
		
		var lastFoveaIndex = this.lastFoveaIndex;
		var lastCi = lastFoveaIndex;
		
		var i_m, j_m, j_m_0, k_m, iCell;
		
		var i = 0;
		
		for (k_m = 0; k_m < h; k_m += 1){
			
			j_m_0 = w * k_m;
			var y = k_m - h_2;					// Put y == 0 halfway up table vertical axis
			
			for (j_m = 0; j_m < w; j_m += 1){
				
				var x = j_m - w_2;				// Put x == 0 halfway along table horizontal axis
				
				iCell = getLPXCellIndex(x, y, this.spiralPer);
				
				if (iCell !== lastCi){
					
					i_m = j_m + j_m_0;
					if (makeNewArrays === true){
						this.outerPixelIndex.push(i_m);
					}
					else {
						this.outerPixelIndex[i] = i_m;
					}
					
					if (iCell > lastFoveaIndex){
						if (makeNewArrays === true){
							this.outerPixelCellIdx.push(iCell);
						}
						else {
							this.outerPixelCellIdx[i] = iCell;
						}
						lastCi = iCell;
					}
					else {						// Mark pixels processed by makeFoveaMap()
						if (makeNewArrays === true){
							this.outerPixelCellIdx.push(lastFoveaIndex);
						}						// with the throw-away index lastFoveaIndex. This
						else {					// eliminates a comparison in the scan loop of
							this.outerPixelCellIdx[i] = lastFoveaIndex;
						}						// the scan function.
						lastCi = lastFoveaIndex;
					}
					i += 1;
				}
			}
		}
		if (makeNewArrays === true){
			this.outerPixelIndex.push(1000000000);	// Provide a last index value to terminate 
			this.outerPixelCellIdx.push(-1);		// getCellIndexForPixel().
		}
		else {
			this.outerPixelIndex[i] = 1000000000;
			this.outerPixelCellIdx[i] = -1;
		}
		i += 1;
		this.length = i;
		this.lastCellIndex = lastCi;
	};
	
	/**
	 * Initializes the getCellIndexForPixel() function.
	 */
	this.initGetCellIndexForPixel = function () {
		this.lastPixIdx = 0;
		this.nextPixIdx = 1;
		this.iAr = 0;
		this.outerCellIndex = 0;
	};
	
	/**
	 * Efficiently retrieves, from the outerPixel arrays, 
	 * cell index values for advancing pixel indexes and
	 * less efficiently retrieves cell indexes for pixel 
	 * indexes in random order.
	 * 
	 * @param {Number} i The pixel index
	 * @returns {Number} The cell index to which the pixel
	 * contributes its color information.
	 */
	this.getCellIndexForPixel = function (i){
		function compLowToHigh(a, b){
			if (a > b){
				return 1;
			}
				
			if (a < b){
				return -1;
			}
			return 0;
		}
		
		var iAr_max = this.length - 2;
		
		if (i <= this.lastPixIdx){
			this.iAr = this.outerPixelIndex.binarySearch(i, compLowToHigh);
			if (this.iAr > iAr_max){
				this.iAr = iAr_max;
			}
			this.lastPixIdx = this.outerPixelIndex[this.iAr];
			this.outerCellIndex = this.outerPixelCellIdx[this.iAr];
			this.nextPixIdx = this.outerPixelIndex[this.iAr+1];
		}
		else {
			while (i >= this.nextPixIdx && this.iAr < iAr_max){
				this.iAr += 1;
				this.outerCellIndex = this.outerPixelCellIdx[this.iAr];
				this.lastPixIdx = this.nextPixIdx;
				this.nextPixIdx = this.outerPixelIndex[this.iAr+1];
			}
		}
		return this.outerCellIndex;
	};
	
	/**
	 * Generates the innerCells assignment table for cells
	 * located in the fovea region defined as the region of
	 * the log-polar scan where the areas of LPXImage cells
	 * are smaller than the (virtual) area of a pixel.
	 * The table assigns the coordinates of the pixel that
	 * contains the cell to each cell in the table with 
	 * coordinates as the (col, row) position in the scan map 
	 * and the table ordered by cell index. Coordinates are 
	 * relative to (0,0) at the lower left corner of the 
	 * scan map.
	 */
	this.makeFoveaMap = function (){
		
		var nMax = getFoveaLength(this.spiralPer);
		var p0 = new PositionPair();
		
		p0.x = 0.5 * this.mapWidth;					// Set p0 to scan map center
		p0.y = p0.x;
		
		var pitch = 1.0 / this.spiralPer;
		var pitchAng = TWO_PI * pitch;
		var sv_A_pitch_1 = sv_A * pitch + 1;
		
		this.innerLength = 0;
		
		var angle0 = 0.5 * pitchAng;

		var ang = 0.0;
		for (var i = 0; i < nMax; i += 1){
			ang = i * pitchAng + angle0;

			var posPair = this.getCellXYPos(sv_A_pitch_1, ang, p0);
			if (makeNewArrays === true){
				this.innerCells.push(posPair);
			}
			else {
				this.innerCells[i].x = posPair.x;
				this.innerCells[i].y = posPair.y;
			}
			this.innerLength += 1;
		}
		this.lastFoveaIndex = nMax - 1;
	};
	
	/**
	 * Creates a position pair p as the coordinates of the pixel
	 * that encloses the center of an LPXImage cell on the spiral 
	 * generated by the absolute angle ang and offsets the value 
	 * of p by the coordinates of the scan map center.
	 * 
	 * @param {Number} sv_A_pitch_1 A pitch factor.
	 * @param {Number} ang The absolute angle value.
	 * @param {CellIndex} p0 Position coordinates of the scan 
	 * map center.
	 * @returns {CellIndex} The returned x, y position.
	 */
	this.getCellXYPos = function (sv_A_pitch_1, ang, p0){
		var r1 = r0 * Math.pow(sv_A_pitch_1, ang * inv_TWO_PI);
		var x = Math.floor(r1 * Math.cos(ang)) + p0.x;
		var y = Math.floor(r1 * Math.sin(ang)) + p0.y;
		
		return {x: x, y: y};
	};
	
	/**
	 * Synchronously saves this LPXScanTables object as a JSON object.
	 * 
	 * @param {String} dirName The directory to save to.
	 */
	this.saveJSON = function (dirName){
		saveScanTablesJSON(this, dirName);
	};
	
	/**
	 * Synchronously saves this LPXScanTables object as a gzip 
	 * compressed JSON object converted to Base64.
	 * 
	 * @param {String} dirName The directory to save to.
	 */
	this.saveJSON_BZ_B64 = function (dirName){
		saveScanTablesJSON_GZ_B64(this, dirName);
	};
	
	/**
	 * Synchronously loads this empty LPXScanTables object from a 
	 * JSONized LPXScanTables object in the filesystem.
	 * 
	 * @param {String} fileName The filename of the LPXScanTables 
	 * object to be loaded.
	 */
	this.loadJSONSync = function (fileName){
		loadJSONSync(this, fileName);
	};
	
	/**
	 * Creates LPXScanTables for an LPXImage object with the specified
	 * spiralPer.
	 * 
	 * @param {(Number|String)} arg The spiral period of the LPXImage
	 * object expressed as a number, in which case the LPXScanTables
	 * object might be created from scratch or as a string, in which 
	 * case the LPXScanTables object is loaded from the file system 
	 * using the filename provided by the string. If arg is a number
	 * the LPXScanTables object is created from scratch only if none
	 * exists or if the spiral period specified by arg differs from 
	 * that of the existing LPXScanTables object.
	 */
	this.setTablesFor = function (arg){
		if (typeof(arg) === 'number'){
			if (this.spiralPer !== 0 && Math.floor(arg) === Math.floor(this.spiralPer)){
				return;						// The tables are already set.
			}
			if (this.outerPixelIndex.length === 0 || Math.floor(arg) > Math.floor(this.spiralPer)){
				this.outerPixelIndex.length = 0;
				this.outerPixelCellIdx.length = 0;
				this.innerCells.length = 0;
				makeNewArrays = true;
			}
			this.spiralPer = Math.floor(arg) + 0.5;
			this.mapWidth = 2 * maxSpiralRad;
			this.makeFoveaMap();
			this.makeScanMaps();
			
			makeNewArrays = false;
		}
		else if (typeof(arg) === 'string'){
			loadJSONSync(this, arg);
		}
	};
	
// Initialization:
	if (typeof(arg) === 'number'){
		var fileName = cwd + '/ScanTables' + Math.floor(arg) + '.json';
		if (fs.existsSync(fileName)){
			this.setTablesFor(fileName);
		}
		else {
			console.log("Constructing scan tables...");
			
			this.setTablesFor(arg);
			
			console.log("Scan tables are constructed.");
			
			this.saveJSON();
		}
	}
	else {
		this.setTablesFor(arg);
	}
};

/**
 * Synchronously saves the LPXImage object to the file system 
 * as a set of files in a directory with a name constructed 
 * from the timestamp of the LPXImage object prefixed with "LPXI_".
 * 
 * @param {LPXImage} lpI The LPXImage object to save.
 * @param {String} dirName The file system directory where the 
 * LPXImage object will be stored.
 * 
 * @returns {String} The filename including dirname of the saved file.
 * 
 * @private
 */
function saveLPXImageSync(lpI, dirName){
	var lpVTS = JSON.stringify(lpI.timestamp);
														// The directory name for this LPXImage object as
	var lpIName = 'LPXI' + Math.floor(lpI.spiralPer) + '_' + lpVTS;
														// 'LPXInn_mmmmmmmmm
	var tmpName = lpIName + "_new";						// Create a temporary name for the LPXImage object
	var tmpObjName = dirName + '/' + tmpName;
	
	var lpXTemp = lpI.lpXTemp;
	lpXTemp.spiralPer = lpI.spiralPer;
	lpXTemp.x_ofs = lpI.x_ofs;
	lpXTemp.y_ofs = lpI.y_ofs;
	lpXTemp.nMaxCells = lpI.nMaxCells;
	lpXTemp.cellType = lpI.cellType;
	lpXTemp.recNumber = lpI.recNumber;
	lpXTemp.objectID = lpI.objectID;
	lpXTemp.timestamp = lpI.timestamp;
	lpXTemp.length = lpI.length;
	lpXTemp.width = lpI.width;
	lpXTemp.height = lpI.height;

	var lpI0 = JSON.stringify(lpXTemp);					// A "short" copy of lpI containing the small
														// members in a single JSON string.
	var lpI0Buf = new Buffer(lpI0.length);
	lpI0Buf.write(lpI0);
	
	var fname = [];
	var memberBuff = [];
									// Save the JSON string as the first file in the tmpObjName directory
	fname.push(tmpObjName + '/' + 'lpI0');
	
	memberBuff.push(lpI0Buf);
	
	fname.push(tmpObjName + '/' + 'cellArray');
	
	var i, j;
	var cellBuff = new Buffer(4 * lpI.length);
	for (i = 0, j = 0; i < lpI.length; i += 1, j += 4){
		var val = lpI.cellArray[i] >>> 0;	// The >>> operation forces assignment of UInt32.
		cellBuff.writeUInt32LE(val, j);
	}
	
	memberBuff.push(cellBuff);
	
	i = 0;

	var objName = dirName + '/' + lpIName;
	
	fs.mkdirSync(tmpObjName);
	
	var fd;
	for (i = 0; i < 2; i += 1){
		fd = fs.openSync(fname[i],'w');
		fs.writeSync(fd, memberBuff[i], 0, memberBuff[i].length, 0);
		fs.closeSync(fd);
	}
	
	var exists = fs.existsSync(objName);
	if (exists === true){
		var filenames = fs.readdirSync(objName);
		
		for (j = 0; j < filenames.length; j += 1){
			fs.unlinkSync(objName + '/' + filenames[j]);
		}
			
		fs.rmdirSync(objName);
	}
	fs.renameSync(tmpObjName, objName);
	
	return objName;
}

/**
 * Synchronously loads from the file system the LPXImage 
 * object with the specified filename into an empty LPXImage 
 * object.
 * 
 * @param {LPXImage} lpI The empty LPXImage object to fill.
 * @param {String} filename The filename including directory 
 * name of the file.
 * 
 * @private
 */
function loadLPXImageSync(lpI, filename){
	var buf = fs.readFileSync(filename + "/lpI0");
	var lpObj = JSON.parse(buf);
	
	lpI.spiralPer = lpObj.spiralPer;
	lpI.cellType = lpObj.cellType;
	lpI.recNumber = lpObj.recNumber;
	lpI.objectID = lpObj.objectID;
	lpI.timestamp = lpObj.timestamp;
	lpI.length = lpObj.length;
	lpI.x_ofs = lpObj.x_ofs;
	lpI.y_ofs = lpObj.y_ofs;
	lpI.nMaxCells = lpObj.nMaxCells;
	lpI.width = lpObj.width;
	lpI.height = lpObj.height;
	
	lpI.setLength(lpI.length);
	
	buf.length = 0;
	buf = new Buffer(4 * lpI.length);
	
	var fname = filename + '/' + 'cellArray';
	var fd = fs.openSync(fname, 'r');
	fs.readSync(fd, buf, 0, 4 * lpI.length);
	fs.closeSync(fd);
	
	lpI.cellArray = bufferToInt32Array(buf);
}

/**
 * Copies the data from the LPXImage object lpI to a 
 * new nodejs Buffer and returns the buffer. This data 
 * can be used to re-create an identical LPXImage by 
 * using the load() function.
 * 
 * @param {Object} lpI The LPXImage objec to save.
 * @returns {Buffer} The buffer containing the LPXVision
 * data.
 * 
 * @private
 */
function save(lpI){
	var header;
	var all = [];
	var headerSize = new Buffer(4);		// Will save the header size as a four byte integer
	var totalLength = 0;

	var lpXTemp = lpI.lpXTemp;
	
	lpXTemp.spiralPer = lpI.spiralPer;
	lpXTemp.x_ofs = lpI.x_ofs;
	lpXTemp.y_ofs = lpI.y_ofs;
	lpXTemp.nMaxCells = lpI.nMaxCells;
	lpXTemp.width = lpI.width;
	lpXTemp.height = lpI.height;
	lpXTemp.cellType = lpI.cellType;
	lpXTemp.objectID = lpI.objectID;
	lpXTemp.recNumber = lpI.recNumber;
	lpXTemp.timestamp = lpI.timestamp;
	lpXTemp.length = lpI.length;
	
	header = new Buffer(JSON.stringify(lpXTemp));
	headerSize.writeUInt32LE(header.length, 0);
	
	var cellArrayBuf = new Buffer(4 * lpI.length);
										// Because lpI.cellArray is an array it must be 
										// copied to the buffer element by element.
	for (var i = 0, j = 0; i < lpI.length; i += 1, j += 4){
		var val = lpI.cellArray[i] >>> 0;		// The >>> operation forces assignment of UInt32.
		cellArrayBuf.writeUInt32LE(val, j);
	}
	
	all.push(headerSize);					
	totalLength += 4;
	all.push(header);
	totalLength += header.length;
	all.push(cellArrayBuf);
	totalLength += cellArrayBuf.length;
	
	var buff = Buffer.concat(all, totalLength);
	return buff;
}

/**
 * Loads the empty LPXImage object lpI (created 
 * with a constructor with no arguments) from data 
 * read from a nodejs Buffer at the specified offset 
 * containing data previously created by the save() 
 * function.
 * 
 * @param {Object} lpI The empty LPXImage object 
 * to load with the buffer data.
 * @param {Buffer} buff The buffer to load from.
 * @param {Number} offset The buffer offset to load at.
 * @returns {Number} The total number of bytes read 
 * from the buffer.
 * 
 * @private
 */
function load(lpI, buff, offset){
	if (offset === undefined){
		offset = 0;
	}
	
	var headerSize = buff.readUInt32LE(offset);
	var start = offset + 4;
	
	var end = start + headerSize;
	var lpXTemp = JSON.parse(buff.slice(start, end));

	lpI.spiralPer = lpXTemp.spiralPer;
	lpI.x_ofs = lpXTemp.x_ofs;
	lpI.y_ofs = lpXTemp.y_ofs;
	lpI.nMaxCells = lpXTemp.nMaxCells;
	lpI.width = lpXTemp.width;
	lpI.height = lpXTemp.height;
	lpI.cellType = lpXTemp.cellType;
	lpI.objectID = lpXTemp.objectID;
	lpI.recNumber = lpXTemp.recNumber;
	lpI.timestamp = lpXTemp.timestamp;
	lpI.length = lpXTemp.length;
	
	start = end;
	end = start + 4 * lpXTemp.length;
	
	var cellArrayBuf = buff.slice(start);
	lpI.cellArray = bufferToInt32Array(cellArrayBuf);
	
	return end;
}

var lastCellArray = [];								// test

/**
 * Synchronously saves an LPXImage as a JSON object.
 * 
 * @param {Object} lpI The LPXImage object to save as JSON.
 * 
 * @param {String} dirName The system directory name where 
 * the object will be stored (without a trailing '/').
 * 
 * @param {String} filename The filename of the JSON LPXImage 
 * to be stored. If not supplied the file will be saved with the 
 * filename LPXImageXYZ.json where XYZ is the spiral period 
 * of the LPXImage.
 * 
 * @private
 */
function saveLPXImageJSON(lpI, dirName, filename){
	
	var lpXImageFilename = dirName;
	if (filename === undefined){
		lpXImageFilename += '/' + 'LPXImage' + Math.floor(lpI.spiralPer) + '.json';
	}
	else {
		lpXImageFilename += '/' + filename;
	}
	
	var lpxArray = [];
	lpxArray.push(lpI.spiralPer >>> 0);			// Make it a uint32
	
	var x_ofs = lpI.x_ofs;
	var y_ofs = lpI.y_ofs;
	
	lpxArray.push(x_ofs);
	lpxArray.push(y_ofs);
	
	lpxArray.push(lpI.nMaxCells);
	lpxArray.push(lpI.width);
	lpxArray.push(lpI.height);
	lpxArray.push(0);
	lpxArray.push(lpI.objectID);
	lpxArray.push(lpI.recNumber);
	lpxArray.push(lpI.timestamp);
	lpxArray.push(lpI.length);
	
	for (var i = 0; i < lpI.length; i += 1){
		lpxArray.push(lpI.cellArray[i]);
	}
		
	var json = JSON.stringify(lpxArray);
	
	lpxArray = [];
	
	var jsonBuf = new Buffer(json);
	
	var exists = fs.existsSync(lpXImageFilename);
	if (exists === true){
		fs.unlinkSync(lpXImageFilename);
	}
	
	var fd = fs.openSync(lpXImageFilename,'w');
	fs.writeSync(fd, jsonBuf, 0, jsonBuf.length, 0);
	fs.closeSync(fd);
}

function makeIntBuf(val, array){
	var buf = new Buffer(4);
	buf.writeInt32LE(val, 0);
	array.push(buf);
	return 4;
}

function makeScanTablesArray(lpxImage){
	var sct = lpxImage.getScanTables();		// LPXScanTables object
	var i, totalLength = 0;
	var bufArray = [];
	
	bufArray.push(totalLength);
	totalLength += 1;
	bufArray.push(sct.mapWidth);
	totalLength += 1;
	bufArray.push(Math.floor(sct.spiralPer));
	totalLength += 1;
	bufArray.push(sct.length);
	totalLength += 1;
	bufArray.push(sct.innerLength);
	totalLength += 1;
	bufArray.push(sct.lastFoveaIndex);
	totalLength += 1;
	bufArray.push(sct.lastCellIndex);
	totalLength += 1;
	
	for (i = 0; i < sct.length; i += 1){
		bufArray.push(sct.outerPixelIndex[i]);
		totalLength += 1;
	}
	
	for (i = 0; i < sct.length; i += 1){
		bufArray.push(sct.outerPixelCellIdx[i]);
		totalLength += 1;
	}
	
	for (i = 0; i < sct.innerLength; i += 1){
		bufArray.push(sct.innerCells[i].x);
		bufArray.push(sct.innerCells[i].y);
		totalLength += 2;
	}
	
	bufArray[0] = totalLength;
	
	return bufArray;
}

/**
 * Constructor for LPXImage objects.
 * 
 * An LPXImage object encapsulates a log-polar image object 
 * that may contain image data scanned around a particular 
 * localized point on a two-dimensional image array. 
 * 
 * The constructor takes up to two optional parameters. If both 
 * are provided the first is the LPXImage spiral period and the 
 * second is the number of image cells in the image array. 
 * 
 * The default LPXImage object that is generated when no constructor 
 * arguments are provided is an LPX48 object with an image array of 
 * the maximum supported size.
 * 
 * @constructor
 * 
 * @param {Object} arg1 Either a string of the form LPXnnn where nnn 
 * is the number of LPXImage cells per spiral revolution or just that 
 * number.
 * 
 * @param {Number} length The number of LPXImage cells in the image
 * array. This value may be zero. If length is undefined, creates an
 * LPXImage object of maximum length.
 */
var LPXImage = function (arg1, length){
	
	var scanIsPrepared = false;
	var vidStreamIsActive = false;
	
	this.lpXTemp = {
		cellArray: [],
		spiralPer: 0.0,
		x_ofs: 0.0,
		y_ofs: 0.0,
		nMaxCells: 0,
		cellType: "",
		recNumber: 0,
		objectID: null,
		timestamp: 0,
		length: 0,
		width: 0,
		height: 0
	};
	
	/**
	 * For the specified spiralPer returns an LPXScanTables object.
	 * 
	 * @param {Number} spiralPer The spiral period of the LPXImage.
	 * @returns {Object} LPXScanTables object or undefined if none exists 
	 * with the specified spiral period.
	 * 
	 * @private
	 */
	function getScanTables(spiralPer){
		if (lpScanTables === undefined){
			return undefined;
		}
		if (Math.floor(lpScanTables.spiralPer) !== Math.floor(spiralPer)){
			console.log("lpScanTables has wrong spiralPer.");
			console.log("old, new: " + lpScanTables.spiralPer + " " + spiralPer);
			return undefined;
		}
		return lpScanTables;
	}

// Members:
	
	/**
	 * The current record number of this object in an array of log-polar objects.
	 */
	this.recNumber = 0;
	
	/**
	 * A unique object identifier for this object.
	 */
	this.objectID = null;
	
	/**
	 * Creation time as the millisecond value of the date/time 
	 * of creation of this object.
	 */
	this.timestamp = 0;
	
	/**
	 * The classification of LPXImage elements in the cell array.
	 */
	this.cellType = "";
	
	/**
	 * The array containing the LPXImage cells.
	 */
	this.cellArray = [];
	
	/**
	 * The effective length of cellArray. 
	 */
	this.length = 0;
	
	/**
	 * The number of LPXImage cells per spiral revolution.
	 */
	this.spiralPer = 48.5;
	
	/**
	 * The horizontal offset from the center of a scanned 
	 * rectilinear image at which the LPXImage scan was made.
	 */
	this.x_ofs = 0.0;
	
	/**
	 * The vertical offset from the center of a scanned 
	 * rectilinear image at which the LPXImage scan was made.
	 */
	this.y_ofs = 0.0;
	
	/**
	 * The maximum number of LPXImage cells supported by this module. 
	 */
	this.nMaxCells = 0;
	
	/**
	 * The width in pixels of the scanned rectilinear image.
	 */
	this.width = 0;
	
	/**
	 * The height in pixels of the scanned rectilinear image.
	 */
	this.height = 0;
	
	/**
	 * A read-only global containing the geometric constants
	 * that are used to construct a log-polar spiral. 
	 */
	this.constant = constant;
	
	/**
	 * A Global containing dissection and construction 
	 * methods for LPXImage cells.
	 */
	this.cell = cell;
	
	/**
	 * A Global containing numeric conversion methods 
	 * for accessing the contents of LPXImage cells and pixels.
	 */
	this.convert = convert;
	
	/**
	 * A Global containing geometry information functions 
	 * for an LPXImage object. 
	 */
	this.geometry = geometry;
	
	/**
	 * Provides external access to the scan tables constructor.
	 */
	this.LPXScanTables = LPXScanTables;
			
// Methods:
	/**
	 * Gets a timestamp value from system date/time as the millisecond 
	 * value of the Date() object.
	 * 
	 * @returns {Object} The timestamp value.
	 */
	this.getTimestamp = function (){
		var date = new Date();
		
		if (util.isDate(date)){
			return date.valueOf();
		}
	};
	
	/**
	 * Gets the cell object type identifier.
	 * 
	 * @returns {String} The cell object type.
	 */
	this.getCellType = function (){
		return this.cellType;
	};
	
	/**
	 * Zeros the cellArray for this LPXImage object over 
	 * its effective length.
	 */
	this.clear = function (){
		for (var i = 0; i < this.length; i += 1){
			this.cellArray[i] = 0;
		}
	};
			
	/**
	 * Clears any previous cell array up the requested length but creates 
	 * a new array only if the requested length is larger than the existing 
	 * cell array length. This is done to avoid the tendency of the node.js 
	 * V8 engine to suspend performance optimization when large arrays are 
	 * reallocated.
	 * 
	 * @param {Number} len The length value to set.
	 */
	this.setLength = function (len){
		if (this.cellArray.length === 0 || len > this.cellArray.length){
			this.cellArray.length = 0;
			if (len > this.nMaxCells){
				len = this.nMaxCells;
			}
			this.cellArray = new Array(len);
		}
		
		for (var i = 0; i < len; i += 1){	// Zero fill the cellArray to length len
			this.cellArray[i] = 0;
		}
		this.length = len;
	};
		
	/**
	 * Sets the scan location on a rectilinear image relative to its 
	 * center as x and y displacement values in rectilinear pixels.
	 * 
	 * @param {Number} x The horizontal displacement from image center.
	 * @param {Number} y The vertical displacement from image center.
	 */
	this.setPosition = function (x, y){
		this.x_ofs = x;
		this.y_ofs = y;
	};
	
	/**
	 * Gets the scan location on a rectilinear image relative to its 
	 * center as x and y displacement values in rectilinear pixels.
	 * 
	 * @returns {Object} { x_ofs: xValue, y_ofs: yValue }
	 */
	this.getPosition = function (){
		return { x_ofs: this.x_ofs, y_ofs: this.y_ofs };
	};
	
	/**
	 * For the specified spiral period, prepares this LPXImage 
	 * object for scanning by loading an LPXScanTables object 
	 * from the file system or constructing one if none is found.
	 *  
	 * @param {Number} spiralPer The spiral period to set.
	 */
	this.setSpiralPeriod = function (spiralPer){
		spiralPer = getPeriod(spiralPer);
		
		spiralPer = Math.floor(spiralPer);
		
		this.spiralPer = spiralPer + 0.5;
		
		var fileName = cwd + '/ScanTables' + Math.floor(spiralPer) + '.json';
		if (fs.existsSync(fileName)){
			lpScanTables.setTablesFor(fileName);
		}
		else {
			console.log("Constructing scan tables...");
			
			lpScanTables.setTablesFor(spiralPer);
			
			console.log("Scan tables are constructed.");
			
			var sct = getScanTables(spiralPer);
			sct.saveJSON();
		}
	};
	
	/**
	 * Sets this.length so that the scan diameter will 
	 * approximately cover a region of the specified 
	 * diameter.
	 * 
	 * @param {Number} diam The scan diameter in pixels.
	 * 
	 * @returns The resulting value of this.length.
	 */
	this.setScannedDiameter = function (diam){
		var len = getLPXCellIndex(diam / 2, 0, this.spiralPer);
		this.setLength(len);
		return len;
	};
	
	/**
	 * 
	 * Sets this.length so that the scan diameter will 
	 * approximately cover a region of the specified 
	 * area.
	 * 
	 * @param {Number} area The scan area in pixels.
	 * 
	 * @returns The resulting value of this.length.
	 */
	this.setScannedArea = function (area){
		var rad = Math.sqrt(area / Math.PI);
		var len = getLPXCellIndex(rad, 0, this.spiralPer);
		this.setLength(len);
		return len;
	};
	
	/**
	 * Gets the active scan tables for this LPXImage. 
	 * 
	 * @returns The LPXScanTables object.
	 */
	this.getScanTables = function (){
		return getScanTables(this.spiralPer);
	};
	
	/**
	 * Copies the data from this LPXImage object to a 
	 * new nodejs Buffer and returns the buffer. This data 
	 * can be used to re-create an identical LPXImage from
	 * the buffer by using the load() function.
	 * 
	 * @returns {Buffer} The buffer containing the LPXVision
	 * data.
	 */
	this.save = function (){
		return save(this);
	};
	
	/**
	 * Loads this empty LPXImage object (created 
	 * with a constructor with no arguments) from data 
	 * read at the specified offset from a nodejs Buffer 
	 * containing data previously created by the save() 
	 * function.
	 * 
	 * @param {Buffer} buff The buffer to load from.
	 * @param {Number} offset The buffer offset to load 
	 * from. If not specified, loads from zero.
	 * @returns {Number} The total number of bytes read 
	 * from the buffer.
	 */
	this.load = function (buff, offset){
		return load(this, buff, offset);
	};
	
	/**
	 * Synchronously saves the LPXImage object to a collection of 
	 * files in a directory with the same name as the timestamp of 
	 * the LPXImage object prefixed with 'LPXI_. 
	 * 
	 * @param {String} dirName The system directory where the LPXImage 
	 * object directory will be stored.
	 * 
	 * @returns {String} The filename of the saved file.
	 */
	this.saveSync = function (dirName) {
		return saveLPXImageSync(this, dirName);
	};
	
	/**
	 * Synchronously loads the LPXImage object with the specified
	 * filename into this empty LPXImage object.
	 * 
	 * @param {String} filename
	 */
	this.loadSync = function (filename){
		loadLPXImageSync(this, filename);
	};
	
	/**
	 * Synchronously saves this LPXImage as a JSON object.
	 * 
	 * @param {String} dirName The system directory name where 
	 * the object will be stored (without a trailing '/').
	 * 
	 * @param {String} filename The filename of the JSON LPXImage 
	 * to be stored. If not supplied the file will be saved with the 
	 * filename LPXImageXYZ.json where XYZ is the spiral period 
	 * of the LPXImage.
	 */
	this.saveJSON = function (dirname, filename){
		saveLPXImageJSON(this, dirname, filename);
	};
	
	/**
	 * Scans an LPXImage object from a rectilinear image. This 
	 * is the all-JavaScript reference scanner.
	 * 
	 * @param {Object} xyImage The object containing the 
	 * rectilinear image data. At a minimum this object 
	 * contains a width value, xyImage.width, a height 
	 * value, xyImage.height, and a node.js buffer, 
	 * xyImage.data, containing the RGB or BGR pixels 
	 * in four byte units with the following references 
	 * (data.slice()) to the first color byte of each type
	 * in the buffer: xyImage.redBuff, xyImage.grnBuff, 
	 * and xyImage.bluBuff.
	 * 
	 * @param {Number} x The horizontal position of the center
	 * of the spiral scan relative to the center of the 
	 * rectilinear image. Positive values to the right.
	 * 
	 * @param {Number} y The vertical position of the center
	 * of the spiral scan relative to the center of the 
	 * rectilinear image. Positive values up.
	 * 
	 * If no position argument the scan defaults to (0, 0).
	 */
	this.scanFrom = function (xyImage, x, y){
		scanFrom(xyImage, this, x, y);
	};
	
	/**
	 * Loads scan tables and allocates memory for subseqent
	 * LPXImage scans by LPXImage.fastScan().
	 *
	 * @param {Number} width The width of the xy image that
	 * will be scanned.
	 *
	 * @param {Number} height The height of the xy image that
	 * will be scanned.
	 */
	this.fastScanPrepare = function (width, height){
		
		if (width === undefined || height === undefined){
			width = this.width;
			height = this.height;
		}
		else {
			this.width = width;
			this.height = height;
		}
		if (this.width === 0 || this.height === 0){
			throw new Error("width and height must be nonzero");
		}
		
		var sctArray = makeScanTablesArray(this);
		
		if (lpxScan.start(sctArray, width, height) !== 0){
			throw new Error("Unable to prepare.");
		}
		
		scanIsPrepared = true;
	};
	
	/**
	 * Selects an xy image to be scanned into LPXImage.cellArray.
	 * 
	 * @param {Array} xyImage The array containing the x,y image 
	 * to be scanned. This array contains only the RGB32 pixels. 
	 * The required length of this array is width * height as
	 * specified by the width and height params provided to 
	 * LPXImage.fastScanPrepare().
	 * 
	 */
	this.fastScanSelect = function (xyImage){
		if (!scanIsPrepared){
			throw new Error("LPXImage.scanPrepare() was not called.");
		}
		if (util.isArray(xyImage) === false){
			throw new Error("Input image must be an array. Did you use a buffer?");
		}
		lpxScan.select(xyImage);
	};
	
	this.fastScanSelectPtr = function (ptrBuf){
		if (!scanIsPrepared){
			throw new Error("LPXImage.scanPrepare() was not called.");
		}
		lpxScan.selectPtr(ptrBuf.readUInt32LE(0), ptrBuf.readUInt32LE(4));
	};
	
	/**
	 * Scans LPXImage cells into this.cellArray from an
	 * array containing a rectilinear image provided 
	 * by LPXImage.fastScanSelect().
	 * 
	 * @param {Number} x The horizontal position of the 
	 * center of the spiral scan relative to the center 
	 * of the rectilinear image. Positive values to the 
	 * right.
	 * 
	 * @param {Number} y The vertical position of the 
	 * center of the spiral scan relative to the center 
	 * of the rectilinear image.
	 * 
	 * @param {Number} length The length of the scan into
	 * LPXImage.cellArray.
	 * 
	 * If no position arguments then the scan defaults 
	 * to 0, 0 and this.length.
	 */
	this.fastScan = (x, y, length) => {
		if (!scanIsPrepared){
			throw new Error("LPXImage.scanPrepare() was not called.");
		}
		
		if (x === undefined){
			x = 0.0;
			y = 0.0;
			length = this.length;
		}
		else if (length === undefined){
			length = this.length;
		}
		else if (length > this.length){
			this.setLength(length);
		}
		
		lpxScan.scan(x, y, length, this.cellArray);
	};
	
	/**
	 * Releases the memory used by LPXImage.fastScanFrom().
	 */
	this.fastScanRelease = function (){
		lpxScan.stop();
		scanIsPrepared = false;
	};
	
	/**
	 * Allocates memory and transfers scan tables to memory 
	 * for subseqent LPXImage scans.
	 *
	 * @param {Number} width The width in pixels of the video 
	 * image to be scanned.
	 *
	 * @param {Number} height The height in pixels of the video 
	 * image to be scanned.
	 *
	 * @param {String} format The video format. Defaults to 
	 * RGB32.
	 *
	 * @param {String} camera The video device filename. Defaults
	 * to "/dev/video0".
	 */
	this.prepareVidStream = function (width, height, format, camera){
		
		if (camera === undefined){
			camera = "/dev/video0";
		}
		
		if (format === undefined){
			format = "RGB32";
		}
		
		if (width === undefined || height === undefined){
			width = this.width;
			height = this.height;
		}
		else {
			this.width = width;
			this.height = height;
		}
		if (this.width == 0 || this.height == 0){
			throw new Error("width and height must be nonzero");
		}

		var sctArray = makeScanTablesArray(this);	// Copy scan tables into an array for transfer
		
		if (lpxScan.prepareVidStream(sctArray, width, height, format, camera) === false){
			throw new Error("Unable to start USB camera.");
		}
		
		vidStreamIsActive = true;
	};
	
	/**
	 * Gets the next USB video frame each time it 
	 * is called. To avoid loss of frame sync and
	 * to prevent partially blank frames the time 
	 * between calls must be less than the transfer
	 * interval between frames from the camera.
	 */
	this.getVidFrame = lpxScan.getVidFrame;
	
	/**
	 * Captures and performs an LPXImage scan of a video
	 * frame from a USB camera.
	 *
	 * @param {Number} x The horizontal position
	 * of the center of the scan relative to the center
	 * of the vid frame. Positive values to the right.
	 *
	 * @param {Number} y The vertical position of the
	 * center of the scan relative to the center of the
	 * vid frame.
	 * 
	 * @param {Number} length The length of the scan into
	 * LPXImage.cellArray.
	 * 
	 * If no position arguments then the scan defaults 
	 * to 0, 0 and this.length.
	 */
	this.scanVidFrame = function (x, y, length){
		if (x === undefined){
			x = 0.0;
			y = 0.0
			length = this.length;
		}
		else if (length === undefined){
			length = this.length;
		}
		else if (length > this.length){
			this.setLength(length);
		}
		
		lpxScan.scanVidFrame(x, y, length, this.cellArray);
	};
	
	/**
	 * Releases the heap memory used by LPXImage.scanVidFrame().
	 */
	this.releaseVidStream = function (){
		if (vidStreamIsActive){
			lpxScan.releaseVidStream();
			vidStreamIsActive = false;
		}
	};
	
	/**
	 * Renders an LPXImage object to a standard image.
	 * 
	 * @param {Object} xyImage The object that will contain 
	 * the rendered LPXImage. At a minimum this object 
	 * contains a width value, xyImage.width, a height value, 
	 * xyImage.height, and a nodejs buffer, xyImage.data, 
	 * of size 4 * xyImage.width * xyImage.height to contain
	 * the RGB or BGR pixels in four byte units determined by 
	 * references (data.slice()) provided to the first color 
	 * byte of each type in the buffer: xyImage.redBuff, 
	 * xyImage.grnBuff, and xyImage.bluBuff.
	 * 
	 * @param {ViewParams} viewParams A ViewParams object that
	 * provides optional display settings for rendered scan 
	 * placement, offset and range.
	 * 
	 * If viewParams is undefined then the placement defaults 
	 * to the (x, y) image offsets at which the LPXImage was 
	 * originally captured on a rectilinear image, cellOffset 
	 * is zero and cellRange is the smaller of the number of 
	 * cells that will fit on the rendered image or the number 
	 * of cells in the LPXImage.
	 */
	this.renderTo = function (xyImage, viewParams){
		if (viewParams === undefined){
			renderTo(xyImage, this);
		}
		else {
			renderTo(xyImage, this, viewParams);
		}
	};
	
	/**
	 * Renders and saves the rendered xy image of this 
	 * LPXImage to a JPEG file.
	 * 
	 * @param {String} filename The filename to save to.
	 * 
	 * @param {Number} width The xy image width in pixels.
	 * 
	 * @param {Number} height The xy image height in pixels.
	 */
	this.saveLPXImageJPEG = function (filename, width, height){
		if (width === undefined){
			width = this.width;
			height = this.height;
		}
		if (lpScanTables === undefined){
			this.setScanTables();
		}
		var xyDispBuff = new Buffer(4 * width * height);
		var xyImageDisp = {
				width: width,
				height: height,
				data: xyDispBuff,
				redBuff: xyDispBuff.slice(0),
				grnBuff: xyDispBuff.slice(1),
				bluBuff: xyDispBuff.slice(2)
		};
		
		this.renderTo(xyImageDisp);
		var jpegImageData = jpeg.encode(xyImageDisp);
		fs.writeFileSync(filename, jpegImageData.data);
	};
	
	/**
	 * Forces scan tables to be constructed. This should only
	 * be necessary when an LPXImage is constructed without
	 * parameters. In that case, LPXImage.spiralPer must be
	 * set before this function is called.
	 */
	this.setScanTables = function (){
		lpScanTables = new LPXScanTables(this.spiralPer);
	};
	
	/**
	 * Synchronously saves the LPXScanTables for this LPXImage 
	 * object as a JSON object.
	 * 
	 * @param {String} dirName The directory to which to save 
	 * the LPXScanTables object.
	 */
	this.saveScanTablesJSON = function (dirName){
		var sct = getScanTables(this.spiralPer);
		sct.saveJSON(dirName);
	};
	
	/**
	 * Synchronously saves the LPXScanTables object for this 
	 * LPXImage object as a gzip compressed JSON object 
	 * converted to Base64.
	 * 
	 * @param {String} dirName The directory to save to.
	 */
	this.saveScanTablesJSON_GZ_B64 = function (dirName){
		var sct = getScanTables(this.spiralPer);
		sct.saveJSON_BZ_B64(dirName);
	};
	
	/**
	 * The constructor initializer.
	 * @private
	 */
	this.initializeLPI = function (spiralPer, length) {
				
		this.cellType = "image";
		
		this.spiralPer = spiralPer;
				
		if (getScanTables(this.spiralPer) === undefined){
			if (lpScanTables === undefined){
				lpScanTables = new LPXScanTables(this.spiralPer);
			}
			else {
				this.setSpiralPeriod(this.spiralPer);
			}
		}
		
		this.nMaxCells = lpScanTables.lastCellIndex + 1;
		
		if (length !== undefined) {
			this.setLength(length);
		}
		else {
			this.setLength(this.nMaxCells);
		}
		this.timestamp = this.getTimestamp();
	};

// Initialization:
	
	if (arg1 !== undefined){
		var spiralPer = getPeriod(arg1);		// Make conversions if any are necessary.
		if (length === undefined) {
			this.initializeLPI(spiralPer);
		}
		else {
			this.initializeLPI(spiralPer, length);
		}
	}
};

util.inherits(LPXImage, EventEmitter);

module.exports = LPXImage;

