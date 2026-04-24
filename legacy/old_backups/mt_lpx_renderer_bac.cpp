/**
 * mt_lpx_renderer.cpp
 * 
 * Multithreaded implementation of Log-Polar Image rendering functions
 * Based on lpx_renderer.cpp with parallel processing for improved performance
 */

 #include "../include/lpx_renderer.h"
 #include "../include/lpx_common.h"  // Include this for floatEquals function
 #include <cmath>
 #include <iostream>
 #include <algorithm>
 #include <thread>
 #include <vector>
 #include <mutex>
 #include <future>
 
 namespace lpx {
 
 // Internal namespace for implementation details
 namespace internal {
 
extern bool set_high_priority();

 // Worker function that processes a portion of the output image for multithreaded rendering
 void renderImageRegion(const std::shared_ptr<LPXImage>& lpxImage, 
                     cv::Mat& output,
                     int rowStart, int rowEnd, 
                     int colMin, int colMax,
                     float spiralPer,
                     const std::shared_ptr<LPXTables>& scanTables,
                     int outputCenterX, int outputCenterY,
                     float scaleFactor,
                     int cellOffset, int maxLen,
                     const std::vector<uint8_t>& red,
                     const std::vector<uint8_t>& green,
                     const std::vector<uint8_t>& blue) {


    // Set this thread to high priority
    // Set this thread to high priority
    set_high_priority();
     
     // Process each row in the assigned region
     for (int y = rowStart; y < rowEnd; y++) {
         // Process each column in the row
         for (int x = colMin; x < colMax; x++) {
             // Calculate coordinates relative to the output image center
             float relX = x - outputCenterX;
             float relY = y - outputCenterY;
             
             // Scale the relative coordinates properly based on the spiral period
             // Use full scale (1.0) to match the expected image size
             float scaledX = relX;
             float scaledY = relY;
             
             // If we're very close to the center, use special fovea handling
             float distFromCenter = std::sqrt(scaledX * scaledX + scaledY * scaledY);
             
            // Direct method: Calculate cell index from relative coordinates
            int cellIndex = getXCellIndex(scaledX, scaledY, spiralPer);
            
            // Add initial bounds check for cellIndex
            if (cellIndex < 0 || cellIndex >= maxLen) {
                cellIndex = 0; // Default to first cell for invalid indices
            }
            
            // Handle the fovea region
            float centerRadius = 100.0f; // Radius for central region
            
            // If the cell index is the last fovea index, use direct cell index calculation
            // This is how the JavaScript implementation identifies fovea region pixels
            bool isFoveaRegion = (cellIndex <= scanTables->lastFoveaIndex) || (distFromCenter < centerRadius);
            
            if (isFoveaRegion) {
                // In the fovea region, calculate cell index directly from relative position
                // This exactly matches how the JavaScript implementation works
                // The key difference: we convert from screen coords back to LOG-POLAR COORDINATES
                float relXtoCenter = x - outputCenterX;
                float relYtoCenter = y - outputCenterY;
                
                // Use direct calculation for the fovea region
                int iC = getXCellIndex(relXtoCenter, relYtoCenter, spiralPer);
                
                // Make sure the calculated index is within valid range
                iC = std::max(0, std::min(iC, maxLen - 1));
                
                // Additional bounds check for fovea calculation
                if (iC < 0 || iC >= maxLen) {
                    iC = 0; // Default to center cell for invalid fovea indices
                }
                
                // Use this value for the current pixel
                cellIndex = iC;
            }
            
            // Ensure the cell index is valid (0 to maxLen-1)
            cellIndex = std::max(0, std::min(cellIndex, maxLen - 1));
            
            // Apply cell offset with bounds checking
            int iCell = cellOffset + cellIndex;
            if (iCell < 0 || iCell >= maxLen) {
                iCell = cellIndex; // Fall back to original cell index if offset is invalid
            }
             
            // Skip special marker cells (only check if iCell is within bounds)
            if (iCell >= 0 && iCell < maxLen && lpxImage->getCellValue(iCell) == 0x00200400) {
                continue;
            }
            
            // Get the color values - use comprehensive bounds checking to prevent crashes
            uint8_t r, g, b;
            if (iCell >= 0 && iCell < maxLen && 
                iCell < static_cast<int>(red.size()) && 
                iCell < static_cast<int>(green.size()) && 
                iCell < static_cast<int>(blue.size())) {
                r = red[iCell];
                g = green[iCell];
                b = blue[iCell];
            } else {
                // Cell index is out of bounds - display black/blank pixel
                r = 0;
                g = 0;
                b = 0;
            }
             
             // Set the pixel color with bounds checking
             cv::Vec3b color(b, g, r); // OpenCV uses BGR format
             if (y >= 0 && y < output.rows && x >= 0 && x < output.cols) {
                 output.at<cv::Vec3b>(y, x) = color;
             }
         }
     }
 }
 
 } // namespace internal
 
 // LPXRenderer implementation
 LPXRenderer::LPXRenderer() {
 }
 
 LPXRenderer::~LPXRenderer() {
 }
 
 bool LPXRenderer::setScanTables(const std::shared_ptr<LPXTables>& tables) {
    if (!tables) {
        return false;
    }
     
    if (!tables->isInitialized()) {
        return false;
    }
     
     // Verify spiralPer is valid
    if (tables->spiralPer < 0.1f || tables->spiralPer > 1000.0f) {
        return false;
    }
     
     scanTablesByPeriod[tables->spiralPer] = tables;
     
     return true;
 }
 
 bool LPXRenderer::hasScanTables(float spiralPer) const {
     for (const auto& entry : scanTablesByPeriod) {
         if (lpx::floatEquals(entry.first, spiralPer)) {
             return true;
         }
     }
     return false;
 }
 
 // Extract RGB values from an LPX cell
 void LPXRenderer::getRGBFromLPCell(uint32_t lpCell, uint8_t& r, uint8_t& g, uint8_t& b) {
     // In our implementation, the cell format is BGR (OpenCV default)
     b = lpCell & 0xFF;
     g = (lpCell >> 8) & 0xFF;
     r = (lpCell >> 16) & 0xFF;
     
 }
 
 Rect LPXRenderer::getScanBoundingBox(const std::shared_ptr<LPXImage>& lpxImage, int width, int height, float scaleFactor) {
     // Calculate spiral radius based on the total number of cells
     // This matches the JavaScript implementation
     float spiralRadius = getSpiralRadius(lpxImage->getLength(), lpxImage->getSpiralPeriod());
     int spRad = static_cast<int>(std::floor(spiralRadius + 0.5f));  // Manual rounding
     
    // Debug output removed
     
     int boundLeft = -spRad;
     int boundRight = spRad;
     int boundTop = spRad;
     int boundBottom = -spRad;
 
    if (boundLeft < -10000 || boundRight > 10000 || boundTop > 10000 || boundBottom < -10000) {
        // Use default bounds for unreasonable values
        boundLeft = -800;
        boundRight = 800;
        boundTop = 800;
        boundBottom = -800;
    }
     
     // Get the image limits
     int imgWid_2 = static_cast<int>(std::floor(0.5f * width + 0.5f));  // Manual rounding
     int imgHt_2 = static_cast<int>(std::floor(0.5f * height + 0.5f));  // Manual rounding
 
    // Debug output removed
     
     // Get the center of the output image
     int imgCenterX = width / 2;
     int imgCenterY = height / 2;
     
     // The center offset for the view
     float xOffset = lpxImage->getXOffset() * scaleFactor;
     float yOffset = lpxImage->getYOffset() * scaleFactor;
     
     // Calculate the adjusted center position
     int adjustedCenterX = imgCenterX + static_cast<int>(xOffset);
     int adjustedCenterY = imgCenterY + static_cast<int>(yOffset);
     
     // Calculate the bounds in relation to the adjusted center
     int xMin = std::max(0, adjustedCenterX - spRad);
     int xMax = std::min(width, adjustedCenterX + spRad);
     int yMin = std::max(0, adjustedCenterY - spRad);
     int yMax = std::min(height, adjustedCenterY + spRad);
 
     Rect rect;
     rect.xMin = xMin;
     rect.xMax = xMax;
     rect.yMin = yMin;
     rect.yMax = yMax;
     
     return rect;
 }
 
 cv::Mat LPXRenderer::renderToImage(const std::shared_ptr<LPXImage>& lpxImage, int width, int height, 
                                    float scale, int cellOffset, int cellRange) {
    if (!lpxImage || lpxImage->getLength() <= 0) {
        return cv::Mat();
    }
     
     float spiralPer = lpxImage->getSpiralPeriod();
     
     // Find scan tables with matching spiral period using float comparison
     std::shared_ptr<LPXTables> scanTables;
     bool foundTables = false;
     
     for (const auto& entry : scanTablesByPeriod) {
         if (lpx::floatEquals(entry.first, spiralPer)) {
             scanTables = entry.second;
             foundTables = true;
             break;
         }
     }
     
    if (!foundTables) {
        return cv::Mat();
    }
     
     // Create output image
     cv::Mat output(height, width, CV_8UC3, cv::Scalar(0, 0, 0));
     
     int maxLen = lpxImage->getLength();
     int w_s = width;
     int h_s = height;
     
     // Image scaling
     float w_scale = static_cast<float>(w_s) / lpxImage->getWidth();
     float h_scale = static_cast<float>(h_s) / lpxImage->getHeight();
     float imageCanvasRatio = std::max(w_scale, h_scale);
     
     // Center-based approach for rendering
     // Map the log-polar image center directly to the output image center
     int outputCenterX = width / 2;
     int outputCenterY = height / 2;
     
     // Define the bounding box for rendering
     int colMin_s = 0;
     int colMax_s = width;
     int rowMin_s = 0;
     int rowMax_s = height;
       
     float scaleFactor = imageCanvasRatio * scale;
     
     // Position offsets - not currently used but kept for future reference
     int j_ofs, k_ofs;
     if (scale == 1.0f) {
         j_ofs = static_cast<int>(std::floor(lpxImage->getXOffset() * scaleFactor + 0.5f));  // Manual rounding
         k_ofs = static_cast<int>(std::floor(lpxImage->getYOffset() * scaleFactor + 0.5f));  // Manual rounding
     } else {
         j_ofs = 0;
         k_ofs = 0;
     }
     // Silence unused variable warnings
     (void)j_ofs;
     (void)k_ofs;
     
     // Cell offset for scaling
     int ofs_0 = getCellArrayOffset(scaleFactor, spiralPer);
     cellOffset += ofs_0;
     
     // Set the range of cells to display
     if (cellRange <= 0) {
         cellRange = maxLen;
     }
     
     // Extract cell colors
     std::vector<uint8_t> red(maxLen);
     std::vector<uint8_t> green(maxLen);
     std::vector<uint8_t> blue(maxLen);
     
     // Debug: Check if cell colors are populated
     int nonZeroCells = 0; // Used for debugging purposes
     
     // Explicitly check the lowest indices - these should be populated by the innermost pixels
     int lowCellsWithValues = 0; // Used for debugging purposes
     
     for (int i = 0; i < 20 && i < maxLen; i++) {
         uint32_t cellValue = lpxImage->getCellValue(i);
         uint8_t r, g, b;
         getRGBFromLPCell(cellValue, r, g, b);
         
         if (cellValue != 0) {
             lowCellsWithValues++;
         }
     }
     
     // Check which fovea cells actually have data
     std::vector<int> nonZeroFoveaCells;
     for (int i = 0; i <= scanTables->lastFoveaIndex && i < maxLen; i++) {
         if (lpxImage->getCellValue(i) != 0) {
             nonZeroFoveaCells.push_back(i);
         }
     }
     
    // Debug output removed
     
     // Now process all cells
     for (int i = 0; i < maxLen; i++) {
         uint32_t cellValue = lpxImage->getCellValue(i);
         if (cellValue != 0) {
             nonZeroCells++;
         }
         
         uint8_t r, g, b;
         getRGBFromLPCell(cellValue, r, g, b);
         red[i] = r;
         green[i] = g;
         blue[i] = b;
     }
     
     // Silence unused variable warnings for debugging variables
     (void)nonZeroCells;
     (void)lowCellsWithValues;
     
     // Set up map dimensions
     int w_m = scanTables->mapWidth;
     (void)w_m; // Silence unused variable warning
     
     // Determine number of threads to use
     unsigned int numThreads = std::max(1u, std::thread::hardware_concurrency() - 1);
     if (numThreads == 0) numThreads = 1; // Safeguard
    // Thread count determined
     
     // Calculate the region height for each thread
     int rowsPerThread = (rowMax_s - rowMin_s) / numThreads;
     if (rowsPerThread < 1) rowsPerThread = 1;
     
     // Create threads
     std::vector<std::thread> threads;
     auto startTime = std::chrono::high_resolution_clock::now();
     
     for (unsigned int t = 0; t < numThreads; t++) {
         int startRow = rowMin_s + t * rowsPerThread;
         int endRow = (t == numThreads - 1) ? rowMax_s : startRow + rowsPerThread;
         
         threads.push_back(std::thread(
             internal::renderImageRegion,
             std::ref(lpxImage),
             std::ref(output),
             startRow, endRow,
             colMin_s, colMax_s,
             spiralPer,
             std::ref(scanTables),
             outputCenterX, outputCenterY,
             scaleFactor,
             cellOffset, maxLen,
             std::ref(red),
             std::ref(green),
             std::ref(blue)
         ));
     }
     
     // Wait for all threads to complete
     for (auto& thread : threads) {
         thread.join();
     }
     
    // Rendering completed
     
     return output;
 }
 
 } // namespace lpx