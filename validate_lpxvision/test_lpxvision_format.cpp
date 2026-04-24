/**
 * test_lpxvision_format.cpp
 * 
 * Test program to:
 * 1. Generate rainbow_test_cpp.lpr using C++ LPXVision
 * 2. Compare headers with rainbow_test_js.lpr
 * 3. Display side-by-side cell values in specified region
 */

#include <iostream>
#include <fstream>
#include <vector>
#include <cstring>
#include <iomanip>
#include <cmath>
#include <ctime>
#include <algorithm>

struct LPXImageData {
    float spiralPer;  // Should be float, not uint32_t
    std::vector<uint32_t> cellArray;
    uint32_t length;
    double x_ofs;
    double y_ofs;
};

struct LPRHeader {
    float spiralPer;
    uint32_t length;
    uint32_t viewlength;
    uint32_t numCellTypes;
    float x_ofs;
    float y_ofs;
    uint32_t startIndex;
    uint32_t startPer;
    uint32_t tilt;
    uint32_t viewIndex;
    uint32_t timestamp;
    uint8_t reserved[20]; // Pad to 64 bytes
};

struct RetinaCell {
    uint8_t mwh;
    uint8_t hue;
    uint8_t mwh_x;
    uint8_t hue_x;
    uint8_t mwh_y;
    uint8_t hue_y;
    uint8_t mwh_z;
    uint8_t hue_z;
};

/**
 * Read LPXImage binary file (new format from test_generate_rainbow_spiral.py)
 */
LPXImageData readLPXImageBinary(const std::string& filePath) {
    std::cout << "Reading LPXImage from " << filePath << std::endl;
    
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        throw std::runtime_error("Could not open file: " + filePath);
    }
    
    LPXImageData data;
    
    // Read header matching the new LPXImage binary format:
    // totalLength, length, nMaxCells, spiralPer, width, height, x_ofs, y_ofs
    uint32_t totalLength, nMaxCells, width, height, x_ofs_scaled, y_ofs_scaled;
    uint32_t numCells;
    uint32_t spiralPer_int;
    
    file.read(reinterpret_cast<char*>(&totalLength), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&numCells), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&nMaxCells), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&spiralPer_int), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&width), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&height), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&x_ofs_scaled), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&y_ofs_scaled), sizeof(uint32_t));
    
    data.spiralPer = static_cast<float>(spiralPer_int);
    
    std::cout << "Total Length: " << totalLength << ", Length: " << numCells 
              << ", Max Cells: " << nMaxCells << ", Spiral Period: " << data.spiralPer 
              << ", Size: " << width << "x" << height << std::endl;
    
    // Read cell array directly
    data.cellArray.resize(numCells);
    file.read(reinterpret_cast<char*>(data.cellArray.data()), numCells * sizeof(uint32_t));
    
    data.length = numCells;
    data.x_ofs = 0.0;
    data.y_ofs = 0.0;
    
    file.close();
    
    std::cout << "Successfully read " << data.cellArray.size() << " cells" << std::endl;
    return data;
}

/**
 * Simplified LPXVision processing (matching JS algorithm)
 */
class SimpleLPXVision {
public:
    // Constants (matching JS)
    static constexpr double INV_2_PI = 1.0 / (2.0 * 3.14159265358979323846);
    static constexpr double ANG0 = 3.0 * 3.14159265358979323846 / 4.0;
    static constexpr int NUM_IDENTIFIERS = 8;
    static constexpr int NUM_IDENTIFIER_BITS = 3;
    static constexpr double EIGHT_BIT_RANGE = 255.9999;
    static constexpr int DIFFERENCE_BITS = 5;
    
    double spiralPer;
    int length;
    int viewlength;
    double x_ofs;
    double y_ofs;
    int numCellTypes;
    std::vector<uint32_t> retinaCells;
    int startIndex;
    int startPer;
    int tilt;
    int viewIndex;
    
    SimpleLPXVision() : spiralPer(0), length(0), viewlength(0), x_ofs(0), y_ofs(0), 
                       numCellTypes(NUM_IDENTIFIERS), startIndex(0), startPer(0), 
                       tilt(0), viewIndex(0) {}
    
    // Cell extraction methods (matching JS)
    uint32_t extractCell_wht_blk(uint32_t cellData) {
        uint32_t r = (cellData >> 16) & 0xFF;
        uint32_t g = (cellData >> 8) & 0xFF;
        uint32_t b = cellData & 0xFF;
        return static_cast<uint32_t>(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    int32_t extractCell_grn_red(uint32_t cellData) {
        uint32_t r = (cellData >> 16) & 0xFF;
        uint32_t g = (cellData >> 8) & 0xFF;
        return static_cast<int32_t>((g - r) * 4);
    }
    
    int32_t extractCell_yel_blu(uint32_t cellData) {
        uint32_t r = (cellData >> 16) & 0xFF;
        uint32_t g = (cellData >> 8) & 0xFF;
        uint32_t b = cellData & 0xFF;
        return static_cast<int32_t>(((r + g) / 2 - b) * 4);
    }
    
    int getViewLength(double spiralPer_param) {
        int sp = static_cast<int>(spiralPer_param);
        double exactSpiralPer = sp + 0.5;
        int vp = static_cast<int>(std::round(exactSpiralPer / 3.0));
        int viewlength = static_cast<int>(std::round(vp * exactSpiralPer));
        
        while ((viewlength % 4) != 0) {
            viewlength += 1;
        }
        
        return viewlength;
    }
    
    double getColorAngle(double myb, double mgr, double ang) {
        double angle;
        double mag = std::sqrt(myb * myb + mgr * mgr);
        if (mag < 50) {
            angle = 0.0;
        } else {
            angle = std::atan2(myb, mgr);
            if (angle < -ang) {
                angle = 3.14159265358979323846 + (3.14159265358979323846 + angle);
            }
            angle += ang;
        }
        return angle;
    }
    
    void setCellBits(int n, int i, int range_bits) {
        retinaCells[i] = (retinaCells[i] | n);
        retinaCells[i] = (retinaCells[i] << range_bits);
    }
    
    double getColorDifference(double color1, double color0) {
        double diff = color1 - color0;
        
        if (diff > 3.14159265358979323846) {
            diff = diff - 2 * 3.14159265358979323846;
        } else if (diff < -3.14159265358979323846) {
            diff = diff + 2 * 3.14159265358979323846;
        }
        
        return diff;
    }
    
    std::pair<double, int> getMovingMin(const std::vector<uint32_t>& mwh, int idx, int viewlength) {
        double minVal = 1023;
        int minIdx = -1;
        for (int i = idx - viewlength + 1; i <= idx; i++) {
            if (i >= 0 && i < static_cast<int>(mwh.size())) {
                double mwh_i = mwh[i];
                if (mwh_i < minVal) {
                    minVal = mwh_i;
                    minIdx = i;
                }
            }
        }
        return std::make_pair(minVal, minIdx);
    }
    
    std::pair<double, int> getMovingMax(const std::vector<uint32_t>& mwh, int idx, int viewlength) {
        double maxVal = 0;
        int maxIdx = -1;
        for (int i = idx - viewlength + 1; i <= idx; i++) {
            if (i >= 0 && i < static_cast<int>(mwh.size())) {
                double mwh_i = mwh[i];
                if (mwh_i > maxVal) {
                    maxVal = mwh_i;
                    maxIdx = i;
                }
            }
        }
        return std::make_pair(maxVal, maxIdx);
    }
    
    std::pair<double, int> getMovingMinParams(const std::vector<uint32_t>& mwh, int j, double movMin, int movMinIdx, int viewlength) {
        if (j < static_cast<int>(mwh.size())) {
            double mwh_j = mwh[j];
            if (mwh_j < movMin) {
                movMin = mwh_j;
                movMinIdx = j;
            } else if ((j - viewlength) == movMinIdx) {
                auto minResult = getMovingMin(mwh, j, viewlength);
                movMin = minResult.first;
                movMinIdx = minResult.second;
            }
        }
        return std::make_pair(movMin, movMinIdx);
    }
    
    std::pair<double, int> getMovingMaxParams(const std::vector<uint32_t>& mwh, int j, double movMax, int movMaxIdx, int viewlength) {
        if (j < static_cast<int>(mwh.size())) {
            double mwh_j = mwh[j];
            if (mwh_j > movMax) {
                movMax = mwh_j;
                movMaxIdx = j;
            } else if ((j - viewlength) == movMaxIdx) {
                auto maxResult = getMovingMax(mwh, j, viewlength);
                movMax = maxResult.first;
                movMaxIdx = maxResult.second;
            }
        }
        return std::make_pair(movMax, movMaxIdx);
    }
    
    // Overloaded functions for signed integer arrays
    std::pair<double, int> getMovingMin(const std::vector<double>& mwh, int idx, int viewlength) {
        double minVal = 1023;
        int minIdx = -1;
        for (int i = idx - viewlength + 1; i <= idx; i++) {
            if (i >= 0 && i < static_cast<int>(mwh.size())) {
                double mwh_i = mwh[i];
                if (mwh_i < minVal) {
                    minVal = mwh_i;
                    minIdx = i;
                }
            }
        }
        return std::make_pair(minVal, minIdx);
    }
    
    std::pair<double, int> getMovingMax(const std::vector<double>& mwh, int idx, int viewlength) {
        double maxVal = 0;
        int maxIdx = -1;
        for (int i = idx - viewlength + 1; i <= idx; i++) {
            if (i >= 0 && i < static_cast<int>(mwh.size())) {
                double mwh_i = mwh[i];
                if (mwh_i > maxVal) {
                    maxVal = mwh_i;
                    maxIdx = i;
                }
            }
        }
        return std::make_pair(maxVal, maxIdx);
    }
    
    std::pair<double, int> getMovingMinParams(const std::vector<double>& mwh, int j, double movMin, int movMinIdx, int viewlength) {
        if (j < static_cast<int>(mwh.size())) {
            double mwh_j = mwh[j];
            if (mwh_j < movMin) {
                movMin = mwh_j;
                movMinIdx = j;
            } else if ((j - viewlength) == movMinIdx) {
                auto minResult = getMovingMin(mwh, j, viewlength);
                movMin = minResult.first;
                movMinIdx = minResult.second;
            }
        }
        return std::make_pair(movMin, movMinIdx);
    }
    
    std::pair<double, int> getMovingMaxParams(const std::vector<double>& mwh, int j, double movMax, int movMaxIdx, int viewlength) {
        if (j < static_cast<int>(mwh.size())) {
            double mwh_j = mwh[j];
            if (mwh_j > movMax) {
                movMax = mwh_j;
                movMaxIdx = j;
            } else if ((j - viewlength) == movMaxIdx) {
                auto maxResult = getMovingMax(mwh, j, viewlength);
                movMax = maxResult.first;
                movMaxIdx = maxResult.second;
            }
        }
        return std::make_pair(movMax, movMaxIdx);
    }
    
    double rescaleToMinMax(double val, double movMin, double movMax, int idx) {
        // Don't floor val here - preserve JavaScript's double precision behavior
        
        if (val < movMin) {
            val = movMin;
        } else if (val > movMax) {
            val = movMax;
        }
        
        double range = movMax - movMin;
        if (range < 10) {
            range = 10;
        }
        
        val = std::round(255 * (val - movMin) / range);
        return val;
    }
    
    void processLPXImage(const LPXImageData& lpxData) {
        std::cout << "Converting LPXImage to LPRetinaImage using complete C++ LPXVision algorithm..." << std::endl;
        
        spiralPer = lpxData.spiralPer;
        viewlength = getViewLength(spiralPer);
        x_ofs = lpxData.x_ofs;
        y_ofs = lpxData.y_ofs;
        
        int spPer = static_cast<int>(spiralPer);
        const auto& cellArray = lpxData.cellArray;
        int foveaOfs = spPer * static_cast<int>(spiralPer * 0.1); // getFoveaPeriods
        
        int lpxLength = lpxData.length;
        int comparelen = lpxLength - foveaOfs;
        
        length = comparelen;
        
        int viewOfs = viewlength + 1;
        int mwhOfs = viewOfs + spPer;
        
        std::cout << "Processing " << comparelen << " cells with view length " 
                  << viewlength << ", fovea offset " << foveaOfs << std::endl;
        
        if (comparelen <= 0 || foveaOfs >= lpxLength) {
            std::cout << "Warning: Invalid cell range, creating minimal retina cells" << std::endl;
            retinaCells = {0, 0, 0, 0};
            length = 4;
            return;
        }
        
        // Initialize arrays (matching JS implementation)
        // All arrays need to accommodate mwhOfs indexing since that's the largest offset used
        std::vector<uint32_t> mwh(comparelen + mwhOfs);
        std::vector<int32_t> mgr(comparelen + mwhOfs);
        std::vector<int32_t> myb(comparelen + mwhOfs);
        std::vector<double> hue(comparelen + mwhOfs);
        
        std::vector<double> mwh_x(comparelen + mwhOfs);
        std::vector<double> mwh_y(comparelen + mwhOfs);
        std::vector<double> mwh_z(comparelen + mwhOfs);
        
        // Initialize retina cells
        retinaCells.assign(comparelen, 0);
        
        // Build arrays back one view length (matching JS)
        for (int i = 0; i < mwhOfs; i++) {
            int arrayIdx = i + foveaOfs - mwhOfs;
            if (arrayIdx >= 0 && arrayIdx < static_cast<int>(cellArray.size())) {
                mwh[i] = extractCell_wht_blk(cellArray[arrayIdx]);
            } else {
                mwh[i] = 0; // Safe default for out-of-bounds access
            }
        }
        
        // Initialize mwh_x, mwh_y, mwh_z arrays (matching JS)
        for (int i = 0; i < mwhOfs; i++) {
            if (i < spPer) {
                mwh_x[i] = 0;
                mwh_y[i] = 0;
                mwh_z[i] = 0;
            } else {
                mwh_x[i] = 512.0 + (static_cast<double>(mwh[i]) - static_cast<double>(mwh[i-1])) / 4.0;
                
                if (i-spPer-1 >= 0) {
                    mwh_y[i] = 512.0 + (static_cast<double>(mwh[i]) - static_cast<double>(mwh[i-spPer-1])) / 4.0;
                } else {
                    mwh_y[i] = 512.0;
                }
                
                mwh_z[i] = 512.0 + (static_cast<double>(mwh[i]) - static_cast<double>(mwh[i-spPer])) / 4.0;
            }
        }
        
        // FIRST PASS: mwh and hue identifiers (matching JS implementation)
        double mwhMovMin = 0, mwhMovMax = 1023;
        int mwhMovMinIdx = 0, mwhMovMaxIdx = 0;
        
        for (int i = 0; i < comparelen; i++) {
            int j = i + mwhOfs;
            int k = i + foveaOfs;
            
            if (k < static_cast<int>(cellArray.size())) {
                // Initialize moving min/max on first iteration
                if (i == 0) {
                    auto minResult = getMovingMin(mwh, j, viewlength);
                    mwhMovMin = minResult.first;
                    mwhMovMinIdx = minResult.second;
                    
                    auto maxResult = getMovingMax(mwh, j, viewlength);
                    mwhMovMax = maxResult.first;
                    mwhMovMaxIdx = maxResult.second;
                }
                
                // Extract monochrome identifier
                mwh[j] = extractCell_wht_blk(cellArray[k]);
                
                // Update moving min/max parameters
                auto minResult = getMovingMinParams(mwh, j, mwhMovMin, mwhMovMinIdx, viewlength);
                mwhMovMin = minResult.first;
                mwhMovMinIdx = minResult.second;
                
                auto maxResult = getMovingMaxParams(mwh, j, mwhMovMax, mwhMovMaxIdx, viewlength);
                mwhMovMax = maxResult.first;
                mwhMovMaxIdx = maxResult.second;
                
                // Rescale and set mwh identifier
                double wht = rescaleToMinMax(mwh[j], mwhMovMin, mwhMovMax, j);
                int n = std::floor(wht);
                n = n >> DIFFERENCE_BITS;
                setCellBits(n, i, NUM_IDENTIFIER_BITS);
                
                // Extract color components
                mgr[j] = extractCell_grn_red(cellArray[k]);
                myb[j] = extractCell_yel_blu(cellArray[k]);
                
                // Generate hue angle and set hue identifier
                hue[j] = getColorAngle(myb[j], mgr[j], ANG0);
                double scaled = EIGHT_BIT_RANGE * INV_2_PI * hue[j];
                n = std::floor(scaled);
                int n_original = n;
                n = n >> DIFFERENCE_BITS;
                
                // Debug first 5 cells' hue calculations
                if (i < 5) {
                    std::cout << "Cell " << i << " Hue Debug: myb=" << myb[j] << ", mgr=" << mgr[j] 
                              << ", hue_angle=" << hue[j] << ", scaled=" << scaled 
                              << ", floored=" << n_original << ", after_shift=" << n << std::endl;
                }
                
                setCellBits(n, i, NUM_IDENTIFIER_BITS);
            }
        }
        
        // SECOND PASS: mwh_x and hue_x identifiers (forward differences along spiral)
        double mwh_xMovMin = 0, mwh_xMovMax = 1023;
        int mwh_xMovMinIdx = 0, mwh_xMovMaxIdx = 0;
        
        for (int i = 0; i < comparelen; i++) {
            int j = i + viewOfs;
            
            if (i == 0) {
                auto minResult = getMovingMin(mwh_x, j, viewlength);
                mwh_xMovMin = minResult.first;
                mwh_xMovMinIdx = minResult.second;
                
                auto maxResult = getMovingMax(mwh_x, j, viewlength);
                mwh_xMovMax = maxResult.first;
                mwh_xMovMaxIdx = maxResult.second;
            }
            
            // Calculate forward difference exactly like JavaScript
            // JavaScript: mwh_x[j] = Math.floor(512 + (mwh[j] - mwh[j-1]) / 4);
            mwh_x[j] = std::floor(512.0 + (static_cast<double>(mwh[j]) - static_cast<double>(mwh[j-1])) / 4.0);
            
            // Update moving parameters
            auto minResult = getMovingMinParams(mwh_x, j, mwh_xMovMin, mwh_xMovMinIdx, viewlength);
            mwh_xMovMin = minResult.first;
            mwh_xMovMinIdx = minResult.second;
            
            auto maxResult = getMovingMaxParams(mwh_x, j, mwh_xMovMax, mwh_xMovMaxIdx, viewlength);
            mwh_xMovMax = maxResult.first;
            mwh_xMovMaxIdx = maxResult.second;
            
            // Set mwh_x identifier
            double rescaled_diff = rescaleToMinMax(mwh_x[j], mwh_xMovMin, mwh_xMovMax, j);
            int n = std::floor(rescaled_diff);
            n = n >> DIFFERENCE_BITS;
            setCellBits(n, i, NUM_IDENTIFIER_BITS);
            
            // Set hue_x identifier (color difference)
            // JavaScript: let hue_x = getColorDifference(hue[j], hue[j-1]);
            double hue_x = getColorDifference(hue[j], hue[j-1]);
            double scaled_hue_x = EIGHT_BIT_RANGE * INV_2_PI * (hue_x + 3.14159265358979323846);
            n = std::floor(scaled_hue_x);
            n = n >> DIFFERENCE_BITS;
            setCellBits(n, i, NUM_IDENTIFIER_BITS);
        }
        
        // THIRD PASS: mwh_y and hue_y identifiers (-60 degrees from spiral)
        double mwh_yMovMin = 0, mwh_yMovMax = 1023;
        int mwh_yMovMinIdx = 0, mwh_yMovMaxIdx = 0;
        
        for (int i = 0; i < comparelen; i++) {
            int j = i + viewOfs;  // Use viewOfs for consistency with JavaScript
            
            if (i == 0) {
                auto minResult = getMovingMin(mwh_y, j, viewlength);
                mwh_yMovMin = minResult.first;
                mwh_yMovMinIdx = minResult.second;
                
                auto maxResult = getMovingMax(mwh_y, j, viewlength);
                mwh_yMovMax = maxResult.first;
                mwh_yMovMaxIdx = maxResult.second;
            }
            
            // Calculate -60 degree difference exactly like JavaScript
            // JavaScript uses: mwh_y[j] = Math.floor(512 + (mwh[j] - mwh[j-spPer-1]) / 4);
            mwh_y[j] = std::floor(512.0 + (static_cast<double>(mwh[j]) - static_cast<double>(mwh[j-spPer-1])) / 4.0);
            
            // Update moving parameters
            auto minResult = getMovingMinParams(mwh_y, j, mwh_yMovMin, mwh_yMovMinIdx, viewlength);
            mwh_yMovMin = minResult.first;
            mwh_yMovMinIdx = minResult.second;
            
            auto maxResult = getMovingMaxParams(mwh_y, j, mwh_yMovMax, mwh_yMovMaxIdx, viewlength);
            mwh_yMovMax = maxResult.first;
            mwh_yMovMaxIdx = maxResult.second;
            
            // Set mwh_y identifier
            double diff = rescaleToMinMax(mwh_y[j], mwh_yMovMin, mwh_yMovMax, j);
            int n = std::floor(diff);
            n = n >> DIFFERENCE_BITS;
            setCellBits(n, i, NUM_IDENTIFIER_BITS);
            
            // Set hue_y identifier
            // JavaScript uses: let hue_y = getColorDifference(hue[j], hue[j-spPer-1]);
            double hue_y = getColorDifference(hue[j], hue[j-spPer-1]);
            double scaled_hue_y = EIGHT_BIT_RANGE * INV_2_PI * (hue_y + 3.14159265358979323846);
            n = std::floor(scaled_hue_y);
            n = n >> DIFFERENCE_BITS;
            setCellBits(n, i, NUM_IDENTIFIER_BITS);
        }
        
        // FOURTH PASS: mwh_z and hue_z identifiers (-120 degrees from spiral)
        double mwh_zMovMin = 0, mwh_zMovMax = 1023;
        int mwh_zMovMinIdx = 0, mwh_zMovMaxIdx = 0;
        
        for (int i = 0; i < comparelen; i++) {
            int j = i + viewOfs;  // Use viewOfs for consistency with JavaScript
            
            if (i == 0) {
                auto minResult = getMovingMin(mwh_z, j, viewlength);
                mwh_zMovMin = minResult.first;
                mwh_zMovMinIdx = minResult.second;
                
                auto maxResult = getMovingMax(mwh_z, j, viewlength);
                mwh_zMovMax = maxResult.first;
                mwh_zMovMaxIdx = maxResult.second;
            }
            
            // Calculate -120 degree difference exactly like JavaScript
            // JavaScript uses: mwh_z[j] = Math.floor(512 + (mwh[j] - mwh[j-spPer]) / 4);
            mwh_z[j] = std::floor(512.0 + (static_cast<double>(mwh[j]) - static_cast<double>(mwh[j-spPer])) / 4.0);
            
            // Update moving parameters
            auto minResult = getMovingMinParams(mwh_z, j, mwh_zMovMin, mwh_zMovMinIdx, viewlength);
            mwh_zMovMin = minResult.first;
            mwh_zMovMinIdx = minResult.second;
            
            auto maxResult = getMovingMaxParams(mwh_z, j, mwh_zMovMax, mwh_zMovMaxIdx, viewlength);
            mwh_zMovMax = maxResult.first;
            mwh_zMovMaxIdx = maxResult.second;
            
            // Set mwh_z identifier
            double diff = rescaleToMinMax(mwh_z[j], mwh_zMovMin, mwh_zMovMax, j);
            int n = std::floor(diff);
            n = n >> DIFFERENCE_BITS;
            setCellBits(n, i, NUM_IDENTIFIER_BITS);
            
            // Set hue_z identifier (final identifier uses 0 range_bits)
            // JavaScript uses: let hue_z = getColorDifference(hue[j], hue[j-spPer]);
            double hue_z = getColorDifference(hue[j], hue[j-spPer]);
            double scaled_hue_z = EIGHT_BIT_RANGE * INV_2_PI * (hue_z + 3.14159265358979323846);
            n = std::floor(scaled_hue_z);
            n = n >> DIFFERENCE_BITS;
            setCellBits(n, i, 0); // Final identifier uses 0 range_bits
        }
        
        std::cout << "Generated " << retinaCells.size() << " retina cells with all 8 identifiers" << std::endl;
        
        // Debug: show first few cell values in hex
        std::cout << "\nFirst 5 C++ cell values (hex):" << std::endl;
        for (int i = 0; i < std::min(5, static_cast<int>(retinaCells.size())); i++) {
            std::cout << "Cell " << i << ": 0x" << std::hex << retinaCells[i] << std::dec << std::endl;
        }
    }
};

/**
 * Save LPRetinaImage as binary file in 32-bit format
 */
void saveLPRetinaImageBinary(const SimpleLPXVision& lpVision, const std::string& filePath) {
    std::cout << "Saving binary LPRetinaImage to " << filePath << std::endl;
    
    const size_t headerSize = 64;
    const size_t retinaCellsSize = lpVision.retinaCells.size() * 4;
    const size_t totalSize = headerSize + retinaCellsSize;
    
    std::vector<char> buffer(totalSize, 0);
    size_t offset = 0;
    
    // Write header (matching JS format exactly)
    float spiralPerFloat = static_cast<float>(lpVision.spiralPer);
    std::memcpy(buffer.data() + offset, &spiralPerFloat, 4); offset += 4;
    
    uint32_t length32 = static_cast<uint32_t>(lpVision.length);
    std::memcpy(buffer.data() + offset, &length32, 4); offset += 4;
    
    uint32_t viewlength32 = static_cast<uint32_t>(lpVision.viewlength);
    std::memcpy(buffer.data() + offset, &viewlength32, 4); offset += 4;
    
    uint32_t numCellTypes32 = static_cast<uint32_t>(lpVision.numCellTypes);
    std::memcpy(buffer.data() + offset, &numCellTypes32, 4); offset += 4;
    
    float x_ofsFloat = static_cast<float>(lpVision.x_ofs);
    std::memcpy(buffer.data() + offset, &x_ofsFloat, 4); offset += 4;
    
    float y_ofsFloat = static_cast<float>(lpVision.y_ofs);
    std::memcpy(buffer.data() + offset, &y_ofsFloat, 4); offset += 4;
    
    uint32_t startIndex32 = static_cast<uint32_t>(lpVision.startIndex);
    std::memcpy(buffer.data() + offset, &startIndex32, 4); offset += 4;
    
    uint32_t startPer32 = static_cast<uint32_t>(lpVision.startPer);
    std::memcpy(buffer.data() + offset, &startPer32, 4); offset += 4;
    
    uint32_t tilt32 = static_cast<uint32_t>(lpVision.tilt);
    std::memcpy(buffer.data() + offset, &tilt32, 4); offset += 4;
    
    uint32_t viewIndex32 = static_cast<uint32_t>(lpVision.viewIndex);
    std::memcpy(buffer.data() + offset, &viewIndex32, 4); offset += 4;
    
    uint32_t timestamp = static_cast<uint32_t>(time(nullptr));
    std::memcpy(buffer.data() + offset, &timestamp, 4); offset += 4;
    
    // Skip to retina cells section (offset = 64)
    offset = headerSize;
    
    // Write retina cells as 32-bit values
    for (size_t i = 0; i < lpVision.retinaCells.size(); i++) {
        uint32_t cellValue32 = lpVision.retinaCells[i];
        std::memcpy(buffer.data() + offset, &cellValue32, 4);
        offset += 4;
    }
    
    // Write file
    std::ofstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        throw std::runtime_error("Could not create file: " + filePath);
    }
    
    file.write(buffer.data(), totalSize);
    file.close();
    
    std::cout << "Successfully saved binary LPRetinaImage (" << totalSize << " bytes)" << std::endl;
}

/**
 * Read LPR header
 */
LPRHeader readLPRHeader(const std::string& filePath) {
    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        throw std::runtime_error("Could not open file: " + filePath);
    }
    
    LPRHeader header;
    file.read(reinterpret_cast<char*>(&header), sizeof(LPRHeader));
    file.close();
    
    return header;
}

/**
 * Extract 8 identifiers from 32-bit retina cell
 */
RetinaCell extractRetinaCell(uint32_t cellValue) {
    RetinaCell cell;
    
    // Extract 8 identifiers, each 3 bits
    // Packed from MSB to LSB: mwh(21-23) hue(18-20) mwh_x(15-17) hue_x(12-14) mwh_y(9-11) hue_y(6-8) mwh_z(3-5) hue_z(0-2)
    cell.mwh = (cellValue >> 21) & 0x7;   // bits 21-23
    cell.hue = (cellValue >> 18) & 0x7;   // bits 18-20
    cell.mwh_x = (cellValue >> 15) & 0x7; // bits 15-17
    cell.hue_x = (cellValue >> 12) & 0x7; // bits 12-14
    cell.mwh_y = (cellValue >> 9) & 0x7;  // bits 9-11
    cell.hue_y = (cellValue >> 6) & 0x7;  // bits 6-8
    cell.mwh_z = (cellValue >> 3) & 0x7;  // bits 3-5
    cell.hue_z = cellValue & 0x7;         // bits 0-2
    
    return cell;
}

/**
 * Compare LPR files and display specified region
 */
void compareLPRFiles(const std::string& jsFile, const std::string& cppFile) {
    std::cout << "\n=== LPR File Comparison ===" << std::endl;
    
    // Read headers
    LPRHeader jsHeader = readLPRHeader(jsFile);
    LPRHeader cppHeader = readLPRHeader(cppFile);
    
    std::cout << "\nHeader Comparison:" << std::endl;
    std::cout << "                    JS File       C++ File      Match" << std::endl;
    std::cout << "spiralPer:          " << std::fixed << std::setprecision(1) 
              << std::setw(8) << jsHeader.spiralPer << "      " 
              << std::setw(8) << cppHeader.spiralPer << "      " 
              << (jsHeader.spiralPer == cppHeader.spiralPer ? "✓" : "✗") << std::endl;
    
    std::cout << "length:             " << std::setw(8) << jsHeader.length << "      " 
              << std::setw(8) << cppHeader.length << "      " 
              << (jsHeader.length == cppHeader.length ? "✓" : "✗") << std::endl;
    
    std::cout << "viewlength:         " << std::setw(8) << jsHeader.viewlength << "      " 
              << std::setw(8) << cppHeader.viewlength << "      " 
              << (jsHeader.viewlength == cppHeader.viewlength ? "✓" : "✗") << std::endl;
    
    std::cout << "numCellTypes:       " << std::setw(8) << jsHeader.numCellTypes << "      " 
              << std::setw(8) << cppHeader.numCellTypes << "      " 
              << (jsHeader.numCellTypes == cppHeader.numCellTypes ? "✓" : "✗") << std::endl;
    
    // Read cell arrays for comparison
    std::ifstream jsFileStream(jsFile, std::ios::binary);
    std::ifstream cppFileStream(cppFile, std::ios::binary);
    
    if (!jsFileStream.is_open() || !cppFileStream.is_open()) {
        throw std::runtime_error("Could not open files for cell comparison");
    }
    
    // Skip headers (64 bytes)
    jsFileStream.seekg(64, std::ios::beg);
    cppFileStream.seekg(64, std::ios::beg);
    
    // Calculate region: start = 10 * 4 * 63 = 2520, length = 4 * 63 = 252 cells
    const int start = 10 * 4 * 63;   // 2,520 32-bit ints
    const int length = 4 * 63;       // 252 32-bit ints
    const int end = start + length;  // 2,772 32-bit ints
    
    std::cout << "\nCell Array Comparison:" << std::endl;
    std::cout << "Region: " << start << " to " << end << " (" << length << " cells)" << std::endl;
    std::cout << "Byte offsets: " << (start * 4) << " to " << (end * 4) << std::endl;
    
    // Seek to start position
    jsFileStream.seekg(64 + start * 4, std::ios::beg);
    cppFileStream.seekg(64 + start * 4, std::ios::beg);
    
    std::cout << "\nSide-by-Side Cell Values:" << std::endl;
    std::cout << "Index        JS File [mwh hue mwh_x hue_x mwh_y hue_y mwh_z hue_z]        C++ File [mwh hue mwh_x hue_x mwh_y hue_y mwh_z hue_z]" << std::endl;
    std::cout << std::string(140, '-') << std::endl;
    
    for (int i = 0; i < length; i++) { // Show all rows in the specified region
        uint32_t jsCellValue, cppCellValue;
        jsFileStream.read(reinterpret_cast<char*>(&jsCellValue), 4);
        cppFileStream.read(reinterpret_cast<char*>(&cppCellValue), 4);
        
        RetinaCell jsCell = extractRetinaCell(jsCellValue);
        RetinaCell cppCell = extractRetinaCell(cppCellValue);
        
        std::cout << std::setw(8) << (start + i) 
                  << "   [" << std::setw(3) << static_cast<int>(jsCell.mwh)
                  << " " << std::setw(3) << static_cast<int>(jsCell.hue)
                  << " " << std::setw(5) << static_cast<int>(jsCell.mwh_x)
                  << " " << std::setw(5) << static_cast<int>(jsCell.hue_x)
                  << " " << std::setw(5) << static_cast<int>(jsCell.mwh_y)
                  << " " << std::setw(5) << static_cast<int>(jsCell.hue_y)
                  << " " << std::setw(5) << static_cast<int>(jsCell.mwh_z)
                  << " " << std::setw(5) << static_cast<int>(jsCell.hue_z) << "]   "
                  << "   [" << std::setw(3) << static_cast<int>(cppCell.mwh)
                  << " " << std::setw(3) << static_cast<int>(cppCell.hue)
                  << " " << std::setw(5) << static_cast<int>(cppCell.mwh_x)
                  << " " << std::setw(5) << static_cast<int>(cppCell.hue_x)
                  << " " << std::setw(5) << static_cast<int>(cppCell.mwh_y)
                  << " " << std::setw(5) << static_cast<int>(cppCell.hue_y)
                  << " " << std::setw(5) << static_cast<int>(cppCell.mwh_z)
                  << " " << std::setw(5) << static_cast<int>(cppCell.hue_z) << "]" << std::endl;
    }
    
    jsFileStream.close();
    cppFileStream.close();
}

int main() {
    try {
        const std::string inputFile = "rainbow_test_lpximage.lpx";
        const std::string cppOutputFile = "rainbow_test_cpp.lpr";
        const std::string jsOutputFile = "rainbow_test_js.lpr";
        
        std::cout << "=== C++ LPXVision LPR Generation and Comparison ===" << std::endl;
        std::cout << "Input:      " << inputFile << std::endl;
        std::cout << "C++ Output: " << cppOutputFile << std::endl;
        std::cout << "JS Output:  " << jsOutputFile << std::endl;
        std::cout << std::endl;
        
        // Step 1: Read LPXImage data
        std::cout << "Step 1: Reading LPXImage binary file..." << std::endl;
        LPXImageData lpxData = readLPXImageBinary(inputFile);
        std::cout << "✓ LPXImage data loaded" << std::endl;
        std::cout << std::endl;
        
        // Step 2: Process with simplified C++ LPXVision
        std::cout << "Step 2: Processing with simplified C++ LPXVision..." << std::endl;
        SimpleLPXVision lpVision;
        lpVision.processLPXImage(lpxData);
        std::cout << "✓ C++ LPXVision processing complete" << std::endl;
        std::cout << std::endl;
        
        // Step 3: Save C++ LPR file
        std::cout << "Step 3: Saving C++ LPR file..." << std::endl;
        saveLPRetinaImageBinary(lpVision, cppOutputFile);
        std::cout << "✓ C++ LPR file saved" << std::endl;
        
        // Step 4: Compare files
        compareLPRFiles(jsOutputFile, cppOutputFile);
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
}
