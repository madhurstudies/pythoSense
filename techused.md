# Technology Stack and Architecture

This document provides an overview of the technologies used to build the PythoSense Smart Plant Monitor, with a special focus on the frontend implementation. The system is fully integrated, reading real data from connected hardware sensors and displaying it on a live dashboard.

## 1. Frontend Technology Stack

The frontend is the user-facing part of the dashboard that displays all the real-time sensor readings and analytics. It is built to be fast, responsive, and visually engaging without relying on large, heavy frameworks.

### HTML (HyperText Markup Language)
HTML provides the core structure of the dashboard. It organizes the page into logical sections such as the navigation menu, live sensor reading cards, computed metrics, trend charts, and the plant health score gauge. Semantic tags are used to ensure the layout is clean and accessible.

### Vanilla CSS (Cascading Style Sheets)
All styling is done using standard, Vanilla CSS to maintain fine-grained control over the look and feel. 
- **Layout:** The layout relies heavily on CSS Flexbox and CSS Grid to align cards and charts neatly across different screen sizes.
- **Animations:** CSS is also responsible for all visual effects, such as the smooth fade-in animations when the page loads, the floating background particles, and the gradient colors used on the gauges.
- **Variables:** CSS custom properties (variables) are utilized to manage the color palette and ensure consistent theming throughout the application.

### JavaScript
JavaScript powers the interactivity and data processing of the frontend.
- **Data Fetching and Updating:** JavaScript acts as the brain on the client side. It runs continuous background processes (using intervals) to fetch the latest sensor readings from the hardware bridge. Once new data arrives, JavaScript dynamically updates the numbers, gauges, and statuses on the screen without requiring a page reload.
- **Calculations:** It handles the logic required to update the dynamic fill levels of the progress bars and the animated health score gauge based on incoming sensor values.

### Chart.js
For data visualization, the dashboard uses Chart.js, a lightweight and open-source JavaScript library.
- **Trend Chart:** It draws the continuous line charts displaying temperature and humidity variations over the last 24 hours.
- **Bar Chart:** It creates the bar representations for light intensity limits. Chart.js takes the raw numerical data received by the JavaScript logic and renders it onto HTML canvas elements.

### Fonts
The frontend utilizes Google Fonts to enhance typography. Specifically, it uses "Outfit" for clean, modern headings and general text, and "JetBrains Mono" for monospace number displays to make sensor readings easy to read.

## 2. Backend Bridge (Data Communication)

To connect the web frontend to the physical hardware, a Python-based backend is used. 
- **Flask Framework:** Python via the Flask micro-framework serves as the bridge. It receives the real-time data packets transmitted by the microcontroller over the local network or serial connection.
- **API Endpoints:** The Flask server exposes data endpoints (APIs). The frontend's JavaScript makes regular requests to these endpoints to retrieve the latest temperature, humidity, light, and soil moisture statistics to display on the dashboard.

## 3. Hardware Layer

The physical data collection is performed by an embedded electronics setup:
- **Microcontroller:** An ESP32 DevKit acts as the main processing unit for the hardware side. It reads analog and digital signals from the connected components.
- **Sensors:** 
  - A DHT22 sensor is used to capture accurate ambient/soil temperature and humidity.
  - A Photoresistor (LDR) measures the light intensity in lux.
  - A capacitive soil moisture sensor detects the water content of the soil.
- The ESP32 processes these physical signals into digital values and transmits them to the Python backend bridge, which then routes the data to the live frontend dashboard.
