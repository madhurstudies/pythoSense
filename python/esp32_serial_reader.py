#!/usr/bin/env python3
"""
ESP32 Serial Reader for PythoSense
Real-time serial communication with ESP32 for plant monitoring
Supports high-speed data transmission (100ms intervals)
"""

import serial
import serial.tools.list_ports
import time
import threading
import re
import os
from collections import deque
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
app = Flask(__name__)
# file:// pages use Origin: null — allow all origins for local API polling
CORS(app, resources={r"/api/*": {"origins": "*"}})

class ESP32SerialReader:
    def __init__(self, baud_rate=115200, timeout=0.1):
        self.baud_rate = baud_rate
        self.timeout = timeout
        self._io_lock = threading.Lock()
        self._data_lock = threading.Lock()
        self._user_disconnect = False
        self._watchdog_started = False
        self.telemetry_seq = 0
        self.serial_port = None
        self.is_connected = False
        self.latest_data = {
            'timestamp': None,
            'temperature': 0.0,
            'humidity': 0.0,
            'soil_raw': 0,
            'soil_percent': 0,
            'light_raw': 0,
            'light_percent': 0,
            'light_lux': 0,
            'evaporation_index': 0.0,
            'water_requirement': 0,
            'health_score': 0,
            'status': 'disconnected',
            'telemetry_seq': 0,
        }
        self.connection_status = {
            'connected': False,
            'port': None,
            'last_update': None,
            'error': None
        }
        self.data_thread = None
        self.running = False
        self.recent_lines = deque(maxlen=120)
        
    def find_esp32_port(self):
        """Auto-detect ESP32 / USB-serial port"""
        ports = list(serial.tools.list_ports.comports())
        hints = (
            'cp210', 'ch340', 'ch9102', 'ftdi', 'usb serial', 'usb-serial',
            'silicon labs', 'esp32', 'jtag', 'uart', 'wch', 'acm',
        )
        scored = []
        for p in ports:
            desc = (p.description or '').lower()
            hw = (p.hwid or '').lower()
            score = 0
            for h in hints:
                if h in desc or h in hw:
                    score += 2
            if score:
                scored.append((score, p))
        if scored:
            scored.sort(key=lambda x: -x[0])
            return scored[0][1].device
        if len(ports) == 1:
            return ports[0].device
        return None

    def _cleanup_serial(self):
        """Release port and reader thread after error or before reconnect."""
        self.running = False
        if self.data_thread:
            self.data_thread.join(timeout=1.0)
        self.data_thread = None
        if self.serial_port:
            try:
                if self.serial_port.is_open:
                    self.serial_port.close()
            except Exception:
                pass
            self.serial_port = None
        self.is_connected = False
        self._reset_latest_data()

    def _reset_latest_data(self):
        with self._data_lock:
            self.telemetry_seq = 0
            self.latest_data = {
                'timestamp': None,
                'temperature': 0.0,
                'humidity': 0.0,
                'soil_raw': 0,
                'soil_percent': 0,
                'light_raw': 0,
                'light_percent': 0,
                'light_lux': 0,
                'evaporation_index': 0.0,
                'water_requirement': 0,
                'health_score': 0,
                'status': 'disconnected',
                'telemetry_seq': 0,
            }

    def connect(self, port=None):
        """Connect to ESP32 serial port"""
        with self._io_lock:
            self._user_disconnect = False
            try:
                if self.is_connected and self.serial_port and getattr(self.serial_port, 'is_open', False) and self.running:
                    if self.data_thread and self.data_thread.is_alive():
                        return True

                self._cleanup_serial()

                if port is None:
                    port = self.find_esp32_port()
                    if port is None:
                        self.connection_status.update({
                            'connected': False,
                            'port': None,
                            'last_update': datetime.now().isoformat(),
                            'error': 'No USB serial port found',
                        })
                        return False

                self.serial_port = serial.Serial(
                    port=port,
                    baudrate=self.baud_rate,
                    timeout=self.timeout,
                    bytesize=serial.EIGHTBITS,
                    parity=serial.PARITY_NONE,
                    stopbits=serial.STOPBITS_ONE
                )

                time.sleep(1.0)

                self.is_connected = True
                self.connection_status.update({
                    'connected': True,
                    'port': port,
                    'last_update': datetime.now().isoformat(),
                    'error': None
                })

                logger.info("Connected to ESP32 on %s at %s baud", port, self.baud_rate)
                self.start_reading()
                return True

            except Exception as e:
                logger.error("Failed to connect to ESP32: %s", e)
                self._cleanup_serial()
                self.connection_status.update({
                    'connected': False,
                    'port': None,
                    'last_update': datetime.now().isoformat(),
                    'error': str(e)
                })
                return False
    
    def disconnect(self):
        """Disconnect from ESP32 (stops auto-reconnect until connect is called again)."""
        with self._io_lock:
            self._user_disconnect = True
            self._cleanup_serial()
            self.connection_status.update({
                'connected': False,
                'port': None,
                'last_update': datetime.now().isoformat(),
                'error': None
            })
        logger.info("Disconnected from ESP32 (manual)")
    
    def parse_serial_data(self, line):
        """Parse ESP32 serial data format: T:temp,H:hum,SR:soil_raw,SP:soil_pct,LR:light_raw,LP:light_pct"""
        try:
            # Remove any whitespace and ensure clean parsing
            line = line.strip()
            
            # Pattern to match the ESP32 data format
            pattern = r'T:([0-9.+-]+),H:([0-9.+-]+),SR:(\d+),SP:(\d+),LR:(\d+),LP:(\d+)'
            match = re.match(pattern, line)
            
            if match:
                temp = float(match.group(1))
                hum = float(match.group(2))
                soil_raw = int(match.group(3))
                soil_pct = int(match.group(4))
                light_raw = int(match.group(5))
                light_pct = int(match.group(6))
                
                # Calculate derived metrics
                light_lux = int((light_raw / 4095) * 1750)
                
                # Evaporation index (simplified for soil moisture focus)
                evaporation_index = round(max(0, (0.15 * temp + 0.03 * hum)), 1)
                
                # Water requirement based on soil moisture and evaporation
                water_requirement = max(120, min(420, (100 - soil_pct) * 2.1 + evaporation_index * 7))
                
                # Health score calculation (soil moisture focused)
                health_score = min(100, max(45, int(
                    84 - (100 - soil_pct) * 0.16 - (75 - light_pct) * 0.1
                )))

                with self._data_lock:
                    self.telemetry_seq += 1
                    seq = self.telemetry_seq
                    self.latest_data.update({
                        'timestamp': datetime.now().isoformat(),
                        'temperature': temp,
                        'humidity': hum,
                        'soil_raw': soil_raw,
                        'soil_percent': soil_pct,
                        'light_raw': light_raw,
                        'light_percent': light_pct,
                        'light_lux': light_lux,
                        'evaporation_index': evaporation_index,
                        'water_requirement': int(water_requirement),
                        'health_score': health_score,
                        'status': 'connected',
                        'telemetry_seq': seq,
                    })

                return True
            else:
                logger.debug(f"Unparsed line: {line}")
                return False
                
        except Exception as e:
            logger.error(f"Error parsing serial data: {e}")
            return False
    
    def read_serial_loop(self):
        """Continuous serial reading loop"""
        buffer = ""
        
        while self.running and self.serial_port and self.serial_port.is_open:
            try:
                if self.serial_port.in_waiting > 0:
                    data = self.serial_port.read(self.serial_port.in_waiting).decode('utf-8')
                    buffer += data
                    
                    # Process complete lines
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        stripped = line.strip()
                        if stripped:
                            self.recent_lines.append(stripped)
                            self.parse_serial_data(stripped)
                
                time.sleep(0.01)  # Small delay to prevent CPU overload
                
            except serial.SerialException as e:
                logger.error("Serial read error: %s", e)
                self.is_connected = False
                self.connection_status['connected'] = False
                self.connection_status['error'] = str(e)
                self.running = False
                break
            except Exception as e:
                logger.error(f"Unexpected error in serial loop: {e}")
                break
    
    def start_reading(self):
        """Start the serial reading thread (safe if already running)."""
        if not self.is_connected:
            return False
        if self.running and self.data_thread and self.data_thread.is_alive():
            return True
        self.running = True
        self.data_thread = threading.Thread(target=self.read_serial_loop, daemon=True)
        self.data_thread.start()
        logger.info("Started serial reading thread")
        return True
    
    def get_latest_data(self):
        """Get the latest sensor data (thread-safe copy)."""
        with self._data_lock:
            return dict(self.latest_data)
    
    def get_connection_status(self):
        """Get connection status"""
        return self.connection_status

    def start_watchdog(self):
        """Background scan: when USB is plugged in, connect automatically (unless user disconnected)."""
        if self._watchdog_started:
            return
        self._watchdog_started = True
        last_notice = 0.0

        def loop():
            nonlocal last_notice
            while True:
                time.sleep(0.8)
                try:
                    with self._io_lock:
                        if self._user_disconnect:
                            continue
                        healthy = (
                            self.is_connected
                            and self.serial_port
                            and getattr(self.serial_port, 'is_open', False)
                            and self.running
                            and self.data_thread
                            and self.data_thread.is_alive()
                        )
                        if healthy:
                            continue
                        self._cleanup_serial()
                        self.connection_status.update({
                            'connected': False,
                            'port': None,
                            'last_update': datetime.now().isoformat(),
                            'error': None,
                        })

                    cand = self.find_esp32_port()
                    if not cand:
                        now = time.time()
                        if now - last_notice > 20:
                            logger.info("Auto-scan: waiting for USB serial device…")
                            last_notice = now
                        continue

                    self.connect(cand)
                except Exception as exc:
                    logger.debug("watchdog: %s", exc)

        threading.Thread(target=loop, daemon=True).start()

# Initialize the serial reader
esp32_reader = ESP32SerialReader()
esp32_reader.start_watchdog()

@app.route('/')
def index():
    """Serve the main dashboard (same UI as static site, with live API on same origin)."""
    return send_from_directory(PROJECT_ROOT, 'index.html')


@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(PROJECT_ROOT, 'css'), filename)


@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(PROJECT_ROOT, 'js'), filename)


@app.route('/pages/<path:filename>')
def serve_pages(filename):
    return send_from_directory(os.path.join(PROJECT_ROOT, 'pages'), filename)


@app.route('/simulator.html')
def serve_simulator():
    return send_from_directory(PROJECT_ROOT, 'simulator.html')


@app.route('/api/live')
def api_live():
    """Single poll for dashboard: status, parsed telemetry, and recent serial lines."""
    return jsonify({
        'status': esp32_reader.get_connection_status(),
        'data': esp32_reader.get_latest_data(),
        'serial_lines': list(esp32_reader.recent_lines),
    })

@app.route('/api/data')
def get_data():
    """API endpoint for latest sensor data"""
    return jsonify(esp32_reader.get_latest_data())

@app.route('/api/status')
def get_status():
    """API endpoint for connection status"""
    return jsonify(esp32_reader.get_connection_status())

@app.route('/api/connect', methods=['POST'])
def connect_esp32():
    """API endpoint to connect to ESP32"""
    data = request.get_json(silent=True) or {}
    port = data.get('port')

    success = esp32_reader.connect(port)

    return jsonify({
        'success': success,
        'status': esp32_reader.get_connection_status()
    })

@app.route('/api/disconnect', methods=['POST'])
def disconnect_esp32():
    """API endpoint to disconnect from ESP32"""
    esp32_reader.disconnect()
    return jsonify({
        'success': True,
        'status': esp32_reader.get_connection_status()
    })

@app.route('/api/ports')
def list_ports():
    """List available serial ports"""
    ports = serial.tools.list_ports.comports()
    port_list = []
    for port in ports:
        port_list.append({
            'device': port.device,
            'description': port.description,
            'hwid': port.hwid
        })
    return jsonify({'ports': port_list})

if __name__ == '__main__':
    logger.info("Starting PythoSense Serial Server (USB auto-scan enabled)…")
    # Start the Flask server
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
