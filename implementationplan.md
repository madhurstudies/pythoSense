# Integration Plan: Arduino Live Hardware Bridge

This plan outlines the steps to connect your Arduino sensors directly to the PythoSense web dashboard using a Python "bridge" server (Flask).

## User Review Required

> [!IMPORTANT]
> To use the Serial communication, you will need to install the following Python libraries:
> `pip install flask flask-cors pyserial`

> [!WARNING]
> This will transition your project from a static folder of HTML files into a **Flask Web Application**. You will run the dashboard by executing `python app.py` and visiting `http://localhost:5000`.

## Proposed Changes

### [Backend] Data Bridge & Server

#### [NEW] [app.py](file:///d:/GITHUB%20repos%20%28no%20t.o.p%29/pythoSense/app.py)
A Flask server that performs two tasks:
1. **Serial Listener:** Runs in a background thread to read data from the Arduino COM port.
2. **Web API:** Provides an `/api/data` endpoint that the dashboard calls every few seconds to get live readings.

### [Arduino] Firmware Template

#### [NEW] [pytho_sense.ino](file:///d:/GITHUB%20repos%20%28no%20t.o.p%29/pythoSense/pytho_sense.ino)
A standard Arduino sketch provided as a reference. It will read sensors (DHT22, LDR, Soil Moisture) and print them to the Serial port in a simple comma-separated format: `temp,hum,light,moisture`.

### [Frontend] Dashboard Integration

#### [MODIFY] [index.html](file:///d:/GITHUB%20repos%20%28no%20t.o.p%29/pythoSense/index.html)
- Relocate to `templates/index.html` (standard Flask convention).
- Replace mock data generation logic (`randomDelta`) with a real `fetch('/api/data')` call.
- Update the Health Score and Chart logic to use the real incoming hardware stream.

## Open Questions

1. **COM Port:** Which COM port is your Arduino usually connected to (e.g., COM3, COM5)? I will set a default, but you'll need to know this.
2. **Sensor Pins:** Do you have specific pins you are using for your Sensors? I can update the `.ino` sketch to match your mounting.

## Verification Plan

### Automated/Local Tests
- **Mock Mode:** I will build `app.py` with a "SIMULATE_HARDWARE" flag so you can verify the dashboard-to-python connection immediately without hardware.
- **Serial Debugging:** Instructions on how to use the Serial Monitor to verify the Arduino is talking to the Python script.

### Manual Verification
- Confirm that the dials, charts, and Health Score in the browser update in sync with actual physical changes to the sensors (e.g., blowing on the DHT sensor).
