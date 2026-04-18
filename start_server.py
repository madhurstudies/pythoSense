#!/usr/bin/env python3
"""
PythoSense Server Startup Script
Run this script to start the ESP32 serial communication server
"""

import sys
import os

# Add the python directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'python'))

try:
    from esp32_serial_reader import app, esp32_reader
    
    print("=" * 60)
    print("PythoSense ESP32 Serial Server Starting...")
    print("=" * 60)
    print("Server will be available at: http://localhost:5000")
    print("Make sure your ESP32 is connected and configured!")
    print("=" * 60)
    
    # Start the Flask server
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
    
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Please install required dependencies:")
    print("pip install -r requirements.txt")
    sys.exit(1)
except Exception as e:
    print(f"Error starting server: {e}")
    sys.exit(1)
