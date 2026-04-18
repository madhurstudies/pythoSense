#include <Arduino.h>
#include "DHT.h"

// --- Hardware Coordinates ---
#define DHTPIN 27       
#define DHTTYPE DHT11   
const int SOIL_PIN = 32; 
const int LDR_PIN  = 35; // Updated to Backup Pin D35

// --- Dynamic Calibration ---
int soilDryRaw   = 3200;  
int soilWetRaw   = 1200;  
int ldrDarkRaw   = 80;    // Adjusted for D35 baseline
int ldrBrightRaw = 2800;  

DHT dht(DHTPIN, DHTTYPE);

// Digital Signal Smoothing (Low-Pass Filter)
int readADC_Smooth(int pin) {
  uint32_t sum = 0;
  for (int i = 0; i < 25; i++) {
    sum += analogRead(pin);
    delay(2);
  }
  return sum / 25;
}

void setup() {
  Serial.begin(115200); 
  delay(1000);
  dht.begin();
  
  analogReadResolution(12); // 12-bit Resolution (0-4095)
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(LDR_PIN, ADC_11db);

  Serial.println("\n[SYSTEM] PYTHOSENSE TELEMETRY ACTIVE - BAUD 115200");
  Serial.println("[SYSTEM] DHT11 + Soil Moisture + Light Sensors - 100ms Updates");
  Serial.println("[SYSTEM] Ready for data transmission...");
}

unsigned long lastTransmission = 0;
const unsigned long transmissionInterval = 100; // 100ms intervals

void loop() {
  unsigned long currentTime = millis();
  
  // Transmit data every 100ms precisely
  if (currentTime - lastTransmission >= transmissionInterval) {
    lastTransmission = currentTime;
    
    // 1. Real Environmental Telemetry from DHT11
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    
    // Check if DHT readings are valid
    if (isnan(h) || isnan(t)) {
      Serial.println("[ERROR] Failed to read from DHT sensor!");
      return; // Skip this transmission but continue timing
    }

    // 2. Analog Data Acquisition (Real sensors)
    int sRaw = readADC_Smooth(SOIL_PIN);
    int lRaw = readADC_Smooth(LDR_PIN);

    // 3. Signal Mapping & Constraints
    int sPct = constrain(map(sRaw, soilDryRaw, soilWetRaw, 0, 100), 0, 100);
    int lPct = constrain(map(lRaw, ldrDarkRaw, ldrBrightRaw, 0, 100), 0, 100);

    // 4. Data Packet Transmission (Strict Format for Python Parser)
    // T:[Temp],H:[Hum],SR:[SoilRaw],SP:[SoilPct],LR:[LdrRaw],LP:[LdrPct]
    Serial.print("T:"); Serial.print(t, 1);
    Serial.print(",H:"); Serial.print(h, 1);
    Serial.print(",SR:"); Serial.print(sRaw);
    Serial.print(",SP:"); Serial.print(sPct);
    Serial.print(",LR:"); Serial.print(lRaw);
    Serial.print(",LP:"); Serial.println(lPct);
  }
}