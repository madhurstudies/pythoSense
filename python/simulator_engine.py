"""
╔══════════════════════════════════════════════════════════════════╗
║  PythoSense — Arduino Sensor Simulator Engine (Python Backend)  ║
║  -----------------------------------------------------------    ║
║  This script simulates an Arduino board sending live sensor     ║
║  data to the PythoSense dashboard. It uses Flask to expose a    ║
║  REST API that the frontend simulator page polls for computed   ║
║  sensor metrics.                                                ║
║                                                                  ║
║  Run:  python simulator_engine.py                               ║
║  API:  GET http://localhost:5050/api/simulate                    ║
╚══════════════════════════════════════════════════════════════════╝
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import math
import random
import time

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the HTML page

# ─── Physical Constants & Ranges ────────────────────────────────
SENSOR_RANGES = {
    "temperature": {"min": 0, "max": 50, "unit": "°C"},
    "humidity":    {"min": 0, "max": 100, "unit": "%"},
    "light":       {"min": 0, "max": 1750, "unit": "lx"},
    "moisture":    {"min": 0, "max": 100, "unit": "%"},
}

# ─── Derived Metric Calculations ────────────────────────────────
def compute_evaporation_index(temperature: float, humidity: float) -> float:
    """
    Simplified Penman–Monteith reference evapotranspiration (ET₀).
    Uses a reduced form: ET₀ ≈ (0.0023 × (T + 17.8) × √(Tmax − Tmin) × Ra) 
    We simplify further for simulation purposes.

    Returns evaporation index in mm/day (0–12 scale).
    """
    # Saturation vapour pressure (simplified Tetens formula)
    svp = 0.6108 * math.exp((17.27 * temperature) / (temperature + 237.3))
    # Actual vapour pressure
    avp = svp * (humidity / 100.0)
    # Vapour pressure deficit
    vpd = svp - avp

    # Simplified ET₀ approximation
    et0 = 0.0023 * (temperature + 17.8) * math.sqrt(max(vpd * 10, 0.01)) * 2.5
    return round(max(0, min(12, et0)), 1)


def compute_water_requirement(moisture: float, evap_index: float) -> int:
    """
    Estimates daily water requirement in mL.
    Lower soil moisture + higher evaporation = more water needed.
    Range: 0–500 mL/day
    """
    # Moisture deficit factor (0 = saturated, 1 = bone dry)
    deficit = 1.0 - (moisture / 100.0)
    water_ml = (deficit * 300) + (evap_index * 20) + random.uniform(-5, 5)
    return round(max(0, min(500, water_ml)))


def compute_health_score(temperature: float, humidity: float, 
                         light: float, moisture: float) -> dict:
    """
    Computes a plant health score (0–100) using weighted sub-scores.

    Weights:
      Temperature → 25%   (optimal: 20–30 °C)
      Humidity    → 20%   (optimal: 50–70 %)
      Light       → 30%   (optimal: 500–1500 lx)
      Moisture    → 25%   (optimal: 40–70 %)

    Each sub-score is a bell-curve penalty centred on the optimal range.
    """
    def bell_score(value, low, high, falloff):
        if low <= value <= high:
            return 100.0
        if value < low:
            return max(0, 100 - ((low - value) / falloff) ** 2 * 100)
        return max(0, 100 - ((value - high) / falloff) ** 2 * 100)

    s_temp     = bell_score(temperature, 20, 30, 15)
    s_hum      = bell_score(humidity, 50, 70, 25)
    s_light    = bell_score(light, 500, 1500, 400)
    s_moisture = bell_score(moisture, 40, 70, 30)

    score = round(s_temp * 0.25 + s_hum * 0.20 + s_light * 0.30 + s_moisture * 0.25)

    # Grade assignment
    if score >= 90:
        grade, label = "A+", "Excellent 🌟"
    elif score >= 80:
        grade, label = "A",  "Very Good 🌿"
    elif score >= 70:
        grade, label = "B+", "Good 🍀"
    elif score >= 60:
        grade, label = "B",  "Fair 🌱"
    elif score >= 45:
        grade, label = "C",  "Needs Attention ⚠️"
    else:
        grade, label = "D",  "Critical 🚨"

    return {
        "score": score,
        "grade": grade,
        "label": label,
        "breakdown": {
            "temperature": round(s_temp, 1),
            "humidity":    round(s_hum, 1),
            "light":       round(s_light, 1),
            "moisture":    round(s_moisture, 1),
        }
    }


def add_sensor_noise(value: float, noise_range: float = 0.5) -> float:
    """Adds realistic Gaussian sensor noise."""
    return value + random.gauss(0, noise_range)


# ─── API Endpoint ───────────────────────────────────────────────
@app.route("/api/simulate", methods=["GET"])
def simulate():
    """
    Accepts raw slider values via query params and returns
    computed/derived metrics as JSON — just like a real Arduino
    would stream processed data to the dashboard.

    Query params: temperature, humidity, light, moisture
    """
    try:
        temperature = float(request.args.get("temperature", 28.4))
        humidity    = float(request.args.get("humidity", 63))
        light       = float(request.args.get("light", 742))
        moisture    = float(request.args.get("moisture", 58))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid parameter values"}), 400

    # Add subtle sensor noise (simulates ADC jitter from Arduino)
    noisy_temp     = round(add_sensor_noise(temperature, 0.2), 1)
    noisy_humidity = round(max(0, min(100, add_sensor_noise(humidity, 0.5))))
    noisy_light    = round(max(0, add_sensor_noise(light, 5)))
    noisy_moisture = round(max(0, min(100, add_sensor_noise(moisture, 0.4))))

    # Compute derived metrics
    evap_index   = compute_evaporation_index(noisy_temp, noisy_humidity)
    water_req    = compute_water_requirement(noisy_moisture, evap_index)
    health       = compute_health_score(noisy_temp, noisy_humidity, 
                                        noisy_light, noisy_moisture)

    return jsonify({
        "timestamp": time.strftime("%H:%M:%S"),
        "sensors": {
            "temperature": noisy_temp,
            "humidity":    noisy_humidity,
            "light":       noisy_light,
            "moisture":    noisy_moisture,
        },
        "derived": {
            "evaporation_index": evap_index,
            "water_requirement": water_req,
        },
        "health": health,
    })


# ─── Entry Point ────────────────────────────────────────────────
if __name__ == "__main__":
    print("═" * 60)
    print("  🌿 PythoSense Simulator Engine — Python Backend")
    print("  📡 API running at http://localhost:5050/api/simulate")
    print("  🔧 Press Ctrl+C to stop")
    print("═" * 60)
    app.run(host="0.0.0.0", port=5050, debug=True)
