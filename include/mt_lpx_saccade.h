#ifndef MT_LPX_SACCADE_H
#define MT_LPX_SACCADE_H

#include <cstdint>
#include <cmath>
#include <vector>
#include <array>

// Include LPXVision for Hamming distance methods
#include "lpx_vision.h"

// Forward declarations - exactly what we need from the JS imports
namespace lpx {
    class LPXImage;
}
namespace lpx_vision {
    class LPXVision;
}

// Constants - directly from JavaScript
const int MIN_MOVING_COUNT = 5;                 // Set high enough to avoid pixel noise.
const double MIN_MOVING_DIFF = 0.65;           // Hamming difference above which a cell is detecting motion
extern double FOVEA_LEN;                       // Value determined at startup
const double BREAKAWAY_LIMIT = 100.0;          // Saccade breakaway occurs if this displacement not exceeded

const int frameWidth = 2592;                   // Scan dimensions and constants for the video frame
const int frameHeight = 1944;
const int frameMargin = 350;                   // test set for pixel span of 700

const double halfWidth = frameWidth / 2.0;
const double halfHeight = frameHeight / 2.0;

const double X_LOW = -halfWidth + frameMargin;
const double X_HIGH = halfWidth - frameMargin;
const double Y_LOW = -halfHeight + frameMargin;
const double Y_HIGH = halfHeight - frameMargin;

const int MAX_SACCADE_COUNT = 28;              // Enable random saccade after no motion for 4 seconds
const int XFER_DATA_SIZE = 36;

// Global LR struct - exactly matching JavaScript LR object
struct LR_t {
    bool showImage = false;
    double hDiff = 0.0;
    int coalesceFactor = 3;
    double maxDist = 200.0;
    int maxHistLen = 70;                       // 2.5 seconds at 14 images per second
    int histIndx = 0;
    double minHist = 1.0;
    int redCell = 0;
    int grnCell = 0;
    int viewLen21 = 147;                       // 7 * 21
    int foveaLen21 = 0;
    int offset = 56;
    int foveaLen63 = 0;
    double trackingDiff = 0.13;
    double noTrackingDiff = 0.20;
    double xDiff = 0.0;
    double yDiff = 0.0;
    bool areTracking = false;
    double minTrackDiff = 1.0;
    std::vector<double> diffHistory;
};

extern LR_t LR;  // Global LR object

// Function declarations - directly matching JavaScript functions

// Random number functions
uint32_t randInt32(uint32_t rv);
int getIntInRange(int n, uint32_t rv);
double getFloatInRange(double low, double high, uint32_t rv);
int geometric(double p, uint32_t rv);
int getDiscreteRV(const std::vector<double>& pDensity, int len, uint32_t rv);

// Utility functions
bool posIsInRange(double mov_x, double mov_y, double x, double y);
double displacement(void* lr);

// Camera data struct - exactly matching JavaScript fillDataObject
struct CameraData {
    int tick;
    int lasttick;
    bool isCommand;
    bool isMoving;
    double mov_x;
    double mov_y;
    bool processFile;
    bool showImage;
    bool isSaccadeMaster;
    uint64_t lastCtime;
    double x;
    double y;
    double x_last;
    double y_last;
    int breakaway_count;
    double x_track;
    double y_track;
    bool use_tracking;
    bool maskSaccade;
    void* lpRetina0;        // LPRetinaImage*
    void* lpxImage;         // LPXImage*
    void* lpRetina;         // LPRetinaImage*
    int disableSaccadeCount;
    bool noSaccade;
    bool noSaccadeLast;
};

// Saccade data struct - exactly matching JavaScript saccade object
struct SaccadeData {
    bool isRandom;
    int count;
    int maxCount;
    double mov_x;
    double mov_y;
    double rnd_x;
    double rnd_y;
    double x;
    double y;
    bool reZero;
};

// Cameras data struct - exactly matching JavaScript cameras object
struct CamerasData {
    double minTrackDiff;
    double xDiff;
    double yDiff;
    double hDiff;
    bool areTracking;
};

// LPGazeControl struct - exactly matching JavaScript constructor
struct LPGazeControl {
    SaccadeData saccade;
    CameraData R;
    CameraData L;
    char* filename;
    char* posFilename;
    char* otherPosFilename;
    char* jsonDirname;
    char* jsonFilename;
    char camera;                    // 'R' or 'L'
    bool showAlternating;
    int alternate;
    uint32_t rv;                    // Random variable
    void* imagesR_buf;              // Buffer*
    void* imagesL_buf;              // Buffer*
    void* dataBuf;                  // Buffer*
    void* lpRetina21R;              // LPRetinaImage*
    void* lpxImage21R;              // LPXImage*
    void* lpRetina21L;              // LPRetinaImage*
    void* lpxImage21L;              // LPXImage*
    double mov_xR;
    double mov_yR;
    double mov_xL;
    double mov_yL;
    CamerasData cameras;
};

// Core saccade functions - exactly matching JavaScript
void doMovementSaccade(LPGazeControl* lpG, void* lr);
void doRandomSaccade(LPGazeControl* lpG, void* lr);
void doCommandedSaccade(void* lr);
bool breakGaze(LPGazeControl* lpG, void* lr);
void selectRandomLocation(LPGazeControl* lpG, void* lr);
void locateMovement(LPGazeControl* lpG, void* lr);
void setTrackingDifference(LPGazeControl* lpG, void* lr);
void assignLocationFromMover(LPGazeControl* lpG);
void assignMasterLocationToSlave(LPGazeControl* lpG);
void useTrackingDifference(void* lr);
double distanceLR(LPGazeControl* lpG);
void trackVisualObjects(LPGazeControl* lpG, void* lr, const char* jsonDirname, const char* jsonFilename);

#endif // MT_LPX_SACCADE_H
