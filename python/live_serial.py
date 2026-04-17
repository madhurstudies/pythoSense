import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template
from flask_socketio import SocketIO
from flask_cors import CORS
import serial
import serial.tools.list_ports
import threading
import time
import re
import math
import traceback
import json
import uuid
import paho.mqtt.client as mqtt

# --- Global Cloud MQTT Setup ---
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883
TOPIC_SENSOR = "madhur/pythosense/sensor"
TOPIC_LOG = "madhur/pythosense/log"
TOPIC_STATUS = "madhur/pythosense/status"

mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"pythosense_usb_{uuid.uuid4().hex[:6]}")
try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()
    print(f"[CLOUD] Successfully bridged to Global MQTT at {MQTT_BROKER}")
except Exception as e:
    print(f"[CLOUD ERR] Failed to connect to MQTT: {e}")

def push_mqtt(topic, data):
    try:
        if mqtt_client.is_connected():
            mqtt_client.publish(topic, json.dumps(data), qos=0)
    except:
        pass

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Variables to hold connection state
serial_port = None
ser = None
is_connected = False

# ─── Derived Metric Calculations (from simulator_engine) ─────────
def compute_evaporation_index(temperature: float, humidity: float) -> float:
    svp = 0.6108 * math.exp((17.27 * temperature) / (temperature + 237.3))
    avp = svp * (humidity / 100.0)
    vpd = svp - avp
    et0 = 0.0023 * (temperature + 17.8) * math.sqrt(max(vpd * 10, 0.01)) * 2.5
    return round(max(0, min(12, et0)), 1)

def compute_water_requirement(moisture: float, evap_index: float) -> int:
    deficit = 1.0 - (moisture / 100.0)
    water_ml = (deficit * 300) + (evap_index * 20)
    return round(max(0, min(500, water_ml)))

def compute_health_score(temperature: float, humidity: float, light: float, moisture: float) -> dict:
    def bell_score(value, low, high, falloff):
        if low <= value <= high: return 100.0
        if value < low: return max(0, 100 - ((low - value) / falloff) ** 2 * 100)
        return max(0, 100 - ((value - high) / falloff) ** 2 * 100)

    s_temp     = bell_score(temperature, 20, 30, 15)
    s_hum      = bell_score(humidity, 50, 70, 25)
    s_light    = bell_score(light, 500, 1500, 400)
    s_moisture = bell_score(moisture, 40, 70, 30)

    score = round(s_temp * 0.25 + s_hum * 0.20 + s_light * 0.30 + s_moisture * 0.25)

    if score >= 90: grade, label = "A+", "Excellent 🌟"
    elif score >= 80: grade, label = "A",  "Very Good 🌿"
    elif score >= 70: grade, label = "B+", "Good 🍀"
    elif score >= 60: grade, label = "B",  "Fair 🌱"
    elif score >= 45: grade, label = "C",  "Needs Attention ⚠️"
    else: grade, label = "D",  "Critical 🚨"

    return {"score": score, "grade": grade, "label": label}

# ─── Serial Thread ─────────────────────────────────────────────
def auto_detect_esp32():
    """Detects likely ESP32 COM port and returns the port name."""
    ports = serial.tools.list_ports.comports()
    for port in ports:
        # Common ESP32/Arduino adapter chips
        if "CH340" in port.description or "CP210" in port.description or "USB to UART" in port.description:
            return port.device
        if port.hwid and ("10C4:EA60" in port.hwid or "1A86:7523" in port.hwid):
            return port.device
    # Fallback to the first available port if we can't be sure
    if ports:
        return ports[0].device
    return None

def serial_worker():
    global is_connected, serial_port, ser
    while True:
        try:
            if not is_connected:
                serial_port = auto_detect_esp32()
                if serial_port:
                    msg = f"Found device at {serial_port}, connecting..."
                    print(f"[SERIAL] {msg}")
                    socketio.emit('backend_log', {'log': msg})
                    ser = serial.Serial(serial_port, 115200, timeout=1)
                    is_connected = True
                    socketio.emit('connection_status', {'status': 'connected', 'port': serial_port})
                    push_mqtt(TOPIC_STATUS, {'status': 'connected', 'port': serial_port})
                    
                    msg_conn = f"Successfully connected to {serial_port}!"
                    print(f"[SERIAL] {msg_conn}")
                    socketio.emit('backend_log', {'log': msg_conn})
                    push_mqtt(TOPIC_LOG, {'log': msg_conn})
                else:
                    socketio.emit('connection_status', {'status': 'disconnected'})
                    push_mqtt(TOPIC_STATUS, {'status': 'disconnected'})
                    socketio.emit('backend_log', {'log': 'Scanning for ESP32...'})
                    push_mqtt(TOPIC_LOG, {'log': 'Scanning for ESP32...'})
                    time.sleep(2)
                    continue
            
            # Read line
            if ser and ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    if line.startswith("T:"):
                        # Parse T:28.4,H:63.0,SR:3200,SP:58,LR:80,LP:42
                        try:
                            parts = {kv.split(':')[0]: float(kv.split(':')[1]) for kv in line.split(',') if ':' in kv}
                            temp = parts.get('T', 0)
                            hum = parts.get('H', 0)
                            spct = parts.get('SP', 0)
                            sraw = parts.get('SR', 0)
                            lpct = parts.get('LP', 0)
                            lraw = parts.get('LR', 0)

                            # Scale up Light percentage to simulate Lux range (0-1750 typical) or just use raw if it makes sense.
                            # For simplicity, let's map lraw to lux or just use lpct * 17.5. Assuming 0-1750 lux.
                            flux = lpct * 17.5
                            if lpct == 0 and 'LR' in parts:
                                # if lraw has useful variation without being mapped nicely
                                flux = min(max(parts.get('LR', 0) / 2, 0), 1750) # Just a fallback logic

                            evap = compute_evaporation_index(temp, hum)
                            water = compute_water_requirement(spct, evap)
                            health = compute_health_score(temp, hum, flux, spct)

                            data_payload = {
                                'raw_line': line,
                                'temperature': temp,
                                'humidity': hum,
                                'soil_pct': spct,
                                'soil_raw': sraw,
                                'light_lux': round(flux),
                                'evap': evap,
                                'water': water,
                                'health': health
                            }
                            socketio.emit('sensor_data', data_payload)
                            push_mqtt(TOPIC_SENSOR, data_payload)
                        except Exception as e:
                            print(f"[SERIAL PARSE ERR] {e} on line: {line}")
                    else:
                        # Emitting generic serial output
                        socketio.emit('serial_log', {'log': line})
                        push_mqtt(TOPIC_LOG, {'log': f"[RAW] {line}"})

            time.sleep(0.01) # Small delay to not peg CPU
            
        except serial.SerialException as e:
            err_msg = str(e)
            print(f"[SERIAL] Failed/Disconnected: {err_msg}")
            
            # Send friendly message if it's the specific Windows Permission Error
            if "Access is denied" in err_msg:
                socketio.emit('backend_log', {'log': f"❌ ERROR: Access is denied on {serial_port}."})
                push_mqtt(TOPIC_LOG, {'log': f"❌ ERROR: Access is denied on {serial_port}."})
                socketio.emit('backend_log', {'log': f"⚠️ PLEASE CLOSE ARDUINO IDE SERIAL MONITOR!"})
            else:
                socketio.emit('backend_log', {'log': f"❌ Connection Error: {err_msg}"})
                push_mqtt(TOPIC_LOG, {'log': f"❌ Connection Error: {err_msg}"})
                
            is_connected = False
            ser = None
            socketio.emit('connection_status', {'status': 'disconnected'})
            push_mqtt(TOPIC_STATUS, {'status': 'disconnected'})
            time.sleep(2)
        except Exception as e:
            print(f"[SERIAL ERROR] {e}")
            socketio.emit('backend_log', {'log': f"❌ Unexpected Error: {str(e)}"})
            traceback.print_exc()
            time.sleep(2)

@socketio.on('force_reconnect')
def handle_force_reconnect():
    socketio.emit('backend_log', {'log': "🔄 Manual reconnect triggered from Dashboard."})
    # The background loop will automatically pick it up, 
    # but we can acknowledge the request.

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    status = 'connected' if is_connected else 'disconnected'
    socketio.emit('connection_status', {'status': status, 'port': serial_port})

if __name__ == '__main__':
    print("=" * 60)
    print("  PythoSense Live Serial Backend (Socket.IO)")
    print("  WebSocket API running at http://localhost:5051")
    print("=" * 60)
    
    # Start serial worker in background
    serial_thread = threading.Thread(target=serial_worker, daemon=True)
    serial_thread.start()
    
    socketio.run(app, host='0.0.0.0', port=5051, debug=False)
