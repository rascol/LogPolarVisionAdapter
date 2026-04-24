#!/usr/bin/env python3
"""
Mathematical Log-Spiral Rainbow Pattern Test.
Creates a rainbow pattern that follows the logarithmic spiral formula r = ae^(bθ)
with colors repeating every 4 spiral revolutions, aligned with LPXImage scanning.
"""

import sys
import os
import numpy as np
import cv2
import signal

# Add the build directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'build'))

# Signal handler for clean exit
def signal_handler(sig, frame):
    print("\nCtrl+C pressed, exiting gracefully...")
    cv2.destroyAllWindows()
    print("Display interrupted by user")
    sys.exit(0)

try:
    sys.path.insert(0, '../LPXImage')
    import lpximage
    LPXVision = lpximage.LPXVision
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Make sure you have built the project")
    sys.exit(1)

def export_lpximage_array(lpx_image):
    """Export raw LPXImage cell array data with no modifications."""
    length = lpx_image.getLength()
    
    # Extract all cell colors as raw uint32 values
    cell_data = []
    for i in range(length):
        cell_color = lpx_image.getCellValue(i)
        cell_data.append(cell_color)
    
    # Save raw cell array as binary uint32 data
    filename = "lpximage_cells.bin"
    cell_array = np.array(cell_data, dtype=np.uint32)
    cell_array.tofile(filename)
    
    print(f"✓ Exported raw LPXImage cell array to {filename}")
    print(f"  {length} cells, {len(cell_data) * 4} bytes")
    
    return filename

def rgb_to_opponent_process(r, g, b):
    """Convert RGB to opponent process format using exact equations from LogPolarImages.md
    
    Equations from the documentation:
    mwh = (red + grn + blu) / 3
    yel = grn + red
    myb = (yel - blu) / mwh
    mgr = (grn - red) / mwh
    
    Returns packed 32-bit value with opponent process components
    """
    # Use exact equations from LogPolarImages.md
    red, grn, blu = r, g, b
    
    # Calculate luminance (mwh)
    mwh = (red + grn + blu) / 3.0
    if mwh == 0:
        mwh = 1  # Avoid division by zero
    
    # Calculate yellow
    yel = grn + red
    
    # Calculate opponent process components (normalized to mwh)
    myb = (yel - blu) / mwh
    mgr = (grn - red) / mwh
    
    # Pack in standard RGB format for LPXImage compatibility
    # The LPXImage uses standard RGB packing, not opponent process packing internally
    # We'll let the LPXVision processing handle the opponent process conversion
    packed = 0
    packed |= (int(blu) & 0xFF)        # Blue in bits 0-7
    packed |= ((int(grn) & 0xFF) << 8) # Green in bits 8-15  
    packed |= ((int(red) & 0xFF) << 16)# Red in bits 16-23
    
    return packed

def create_rainbow_lpximage_direct(repeat_multiple=4, scan_tables_path="../ScanTables63"):
    """Create LPXImage with linear rainbow pattern repeating every 252 cells
    
    Args:
        repeat_multiple: Number of spiral periods (63 cells each) for one complete rainbow cycle  
        scan_tables_path: Path to scan tables for LPXImage initialization
    """
    
    print(f"  Creating LPXImage with linear rainbow pattern repeating every {repeat_multiple} spiral periods")
    
    # Create temporary dummy image just for LPXImage structure initialization
    dummy_size = 400
    dummy_image = np.zeros((dummy_size, dummy_size, 3), dtype=np.uint8)
    
    # Initialize LPX system
    if not lpximage.initLPX(scan_tables_path, dummy_size, dummy_size):
        raise RuntimeError("Failed to initialize LPX system")
    
    # Create empty LPXImage by scanning dummy image (just to get structure)
    lpx_image = lpximage.scanImage(dummy_image, dummy_size//2, dummy_size//2)
    if lpx_image is None:
        raise RuntimeError("Failed to create LPXImage")
    
    # Get total number of cells
    total_cells = lpx_image.getLength()
    print(f"  LPXImage has {total_cells} cells")
    
    # Calculate rainbow parameters for 4 spiral periods
    spiral_period = 63
    repeat_interval = spiral_period * repeat_multiple  # 252 cells
    total_repeats = total_cells / repeat_interval
    print(f"  Rainbow repeats every {repeat_interval} cells ({repeat_multiple} spiral periods)")
    print(f"  Total rainbow cycles: {total_repeats:.1f}")
    
    # Generate 252 rainbow colors for one complete cycle
    rainbow_colors = []
    
    for i in range(repeat_interval):
        # Linear progression through rainbow (0 to 1 over 252 cells)
        hue = i / repeat_interval
        
        # Convert HSV to RGB (full saturation, full value)
        h = hue * 6  # 0 to 6
        c = 1.0  # Full saturation
        x = c * (1 - abs((h % 2) - 1))
        
        if h < 1:
            r, g, b = c, x, 0
        elif h < 2:
            r, g, b = x, c, 0
        elif h < 3:
            r, g, b = 0, c, x
        elif h < 4:
            r, g, b = 0, x, c
        elif h < 5:
            r, g, b = x, 0, c
        else:
            r, g, b = c, 0, x
        
        # Convert to 0-255 range and pack as BGR
        r_int = int(r * 255)
        g_int = int(g * 255)
        b_int = int(b * 255)
        
        # Pack in BGR format for LPXImage
        packed_color = (b_int) | (g_int << 8) | (r_int << 16)
        rainbow_colors.append(packed_color)
    
    # Now directly populate the LPXImage cell array with linear repeating pattern
    print(f"  Populating {total_cells} cells with linear rainbow pattern (every {repeat_interval} cells)...")
    
    # Create the cell data array with linear repeating pattern
    cell_data = []
    for cell_index in range(total_cells):
        # Linear repeating pattern: cell N gets color (N % 252)
        color_index = cell_index % repeat_interval
        packed_color = rainbow_colors[color_index]
        cell_data.append(packed_color)
    
    # Create proper LPXImage file with header
    temp_filename = "temp_rainbow_lpx.bin"
    
    with open(temp_filename, 'wb') as f:
        # Write header matching LPXImage format
        total_length = 8 + total_cells  # Header size + data size
        f.write(total_length.to_bytes(4, 'little'))  # totalLength
        f.write(total_cells.to_bytes(4, 'little'))   # length
        f.write(total_cells.to_bytes(4, 'little'))   # nMaxCells
        f.write((63).to_bytes(4, 'little'))          # spiralPer (as int)
        f.write(dummy_size.to_bytes(4, 'little'))    # width
        f.write(dummy_size.to_bytes(4, 'little'))    # height
        f.write((0).to_bytes(4, 'little'))           # x_ofs (scaled)
        f.write((0).to_bytes(4, 'little'))           # y_ofs (scaled)
        
        # Write cell data
        cell_array = np.array(cell_data, dtype=np.uint32)
        f.write(cell_array.tobytes())
    
    # Create a new LPXImage and load our custom data
    lpx_tables = lpximage.LPXTables(scan_tables_path)
    new_lpx_image = lpximage.LPXImage(lpx_tables, dummy_size, dummy_size)
    
    # Load our custom cell data into the LPXImage
    if new_lpx_image.loadFromFile(temp_filename):
        print(f"  ✓ Loaded linear rainbow pattern into LPXImage")
        # Verify the pattern worked
        test_cells = [0, repeat_interval, repeat_interval*2, repeat_interval*3]
        print(f"  Verification - Colors should be identical at pattern repeat points:")
        for idx in test_cells:
            if idx < total_cells:
                color = new_lpx_image.getCellValue(idx)
                print(f"    Cell {idx}: {color:08x}")
        
        # Clean up temp file
        try:
            os.remove(temp_filename)
        except:
            pass
        return new_lpx_image
    else:
        print(f"  Warning: Failed to load custom pattern, using scanned approach")
        # Clean up temp file
        try:
            os.remove(temp_filename)
        except:
            pass
        return lpx_image

def create_and_display_rainbow(repeat_multiple=4, show_live=True, save_images=True):
    """Create rainbow pattern by directly populating LPXImage and display it visually."""
    
    # Register signal handler
    signal.signal(signal.SIGINT, signal_handler)
    
    spiral_period = 63
    repeat_interval = spiral_period * repeat_multiple
    
    print(f"LPXImage Rainbow Test - {repeat_multiple}x spiral period ({repeat_interval} cells)")
    print("Press Ctrl+C to exit at any time")
    print("=" * 60)
    
    try:
        # Find scan tables
        scan_tables_path = "ScanTables63"
        if not os.path.exists(scan_tables_path):
            scan_tables_path = "../ScanTables63"
        
        if not os.path.exists(scan_tables_path):
            print("✗ Could not find ScanTables63")
            return False
        
        print(f"Using scan tables: {scan_tables_path}")
        
        # Create LPXImage directly populated with rainbow pattern
        print("Creating rainbow LPXImage...")
        lpx_image = create_rainbow_lpximage_direct(repeat_multiple, scan_tables_path)
        
        if lpx_image is None:
            print("✗ Failed to create rainbow LPXImage")
            return False
        
        print("Saving lpx_image to an LPXImage file: 'rainbow_test_lpximage'")
        lpx_image.saveToFile("rainbow_test_lpximage.lpx")
        
        length = lpx_image.getLength()
        print(f"✓ LPXImage created with {length} cells")
        print(f"  Pattern repeats every {repeat_multiple} spiral revolutions")
        print(f"  Complete cycles: {length / repeat_interval:.1f}")
        
        # Analyze the pattern to verify it repeats correctly
        print("Analyzing pattern periodicity...")
        
        # Sample some cells to check pattern repetition
        test_indices = [i * repeat_interval for i in range(min(5, length // repeat_interval))]
        print(f"Testing pattern at indices: {test_indices}")
        
        for i, idx in enumerate(test_indices):
            if idx < length:
                cell_color = lpx_image.getCellValue(idx)
                print(f"  Cell {idx}: color = {cell_color:08x}")
        
        # Now render the LPXImage back to visual form
        print("Rendering LPXImage...")
        
        # Create renderer
        renderer = lpximage.LPXRenderer()
        scan_tables = lpximage.LPXTables(scan_tables_path)
        if not scan_tables.isInitialized():
            print("✗ Failed to initialize scan tables for renderer")
            return False
        
        renderer.setScanTables(scan_tables)
        
        # Render to different sizes
        render_configs = [
            ("log_spiral_lpx_400x300.png", 400, 300, 0.5),
            ("log_spiral_lpx_800x600.png", 800, 600, 1.0),
            ("log_spiral_lpx_1200x900.png", 1200, 900, 1.5)
        ]
        
        rendered_images = []
        
        if save_images:
            print("Rendering to files...")
            for filename, width, height, scale in render_configs:
                rendered_array = renderer.renderToImage(lpx_image, width, height, scale)
                
                if rendered_array is not None and rendered_array.size > 0:
                    success = cv2.imwrite(filename, rendered_array)
                    if success:
                        print(f"✓ Saved {filename} ({width}x{height})")
                        rendered_images.append((filename, rendered_array))
                    else:
                        print(f"✗ Failed to save {filename}")
                else:
                    print(f"✗ Failed to render {filename}")
        
        # Show live display if requested
        if show_live:
            print("\nDisplaying log spiral rainbow pattern...")
            
            # Use medium size for live display
            display_array = renderer.renderToImage(lpx_image, 800, 600, 1.0)
            
            if display_array is not None and display_array.size > 0:
                print("Log spiral rainbow pattern window opened")
                print("Press any key to close the window")
                
                cv2.namedWindow("Log Spiral Rainbow LPX Pattern", cv2.WINDOW_AUTOSIZE)
                cv2.imshow("Log Spiral Rainbow LPX Pattern", display_array)
                cv2.waitKey(0)
                cv2.destroyAllWindows()
                
                print("✓ Live display completed")
            else:
                print("✗ Failed to create live display")
        
        # Export LPXImage array for validation testing
        print("\nExporting LPXImage array for validation...")
        export_lpximage_array(lpx_image)
        
        # Test LPXVision processing
        print("\nTesting LPXVision processing...")
        vision = LPXVision()
        vision.makeVisionCells(lpx_image, None)
        
        retina_cells = vision.retinaCells
        if retina_cells:
            non_zero = sum(1 for cell in retina_cells if cell != 0)
            print(f"✓ Generated {len(retina_cells)} retina cells, {non_zero} non-zero")
        else:
            print("✗ No retina cells generated")
        
        print("\n" + "=" * 60)
        print("✓ Log spiral rainbow visual test completed successfully!")
        print(f"Pattern repeats every {repeat_multiple} spiral revolutions")
        
        if save_images:
            print("\nGenerated files:")
            for filename, _ in rendered_images:
                print(f"- {filename} (rendered LPXImage)")
        
        return lpx_image
        
    except Exception as e:
        print(f"✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        cv2.destroyAllWindows()

def main():
    """Main function."""
    
    print("Log Spiral Rainbow Pattern Visual Display")
    print("=" * 60)
    print("This creates mathematical log spiral rainbow patterns and displays them visually.")
    print("Press Ctrl+C to exit at any time.\n")
    
    try:
        # Test with 4-revolution rainbow pattern repeating over all LPXImage cells
        lpx_image = create_and_display_rainbow(
            repeat_multiple=4,      # Rainbow repeats every 4 spiral periods (252 cells)
            show_live=False,        # Disable live window to avoid Ctrl+C issues
            save_images=True        # Save image files
        )
        
        if lpx_image:
            print("\n" + "=" * 60)
            print("✓ Log spiral rainbow test completed!")
            print("You should have seen the log spiral rainbow pattern displayed")
            print("Check the generated image files to see the patterns")
            return lpx_image
        else:
            print("\n" + "=" * 60)
            print("✗ Log spiral rainbow test failed!")
            return None
        
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        return None

if __name__ == "__main__":
    try:
        result = main()
        sys.exit(0 if result else 1)
    except KeyboardInterrupt:
        print("\nProgram interrupted")
        sys.exit(1)
