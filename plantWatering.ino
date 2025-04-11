#include <WiFiS3.h>
#include <Arduino_JSON.h>
#include <Servo.h> // Include the Servo library

// WIFI credentials
const char* ssid = "myWifi";
const char* password = "67329943";

// Server endpoints
const char* serverUrl = "http://3.25.192.50:3000/send-data"; // Server's IP address
const char* shelterStatusUrl = "http://3.25.192.50:3000/get-shelter-status"; // Endpoint to fetch shelter status
const char* pumpStatusUrl = "http://3.25.192.50:3000/get-pump-status"; // Endpoint to fetch pump status
const char* pumpCompletionUrl = "http://3.25.192.50:3000/pump-completed"; // Endpoint to notify pump completion

const int soilMoisturePin = A0; // Soil moisture sensor analog pin
const int temperaturePin = A1;  // Temperature sensor analog pin
const int relayPin = 2;         // Digital pin to control the relay
const int servoPin = 4;         // Servo motor control pin

// Soil moisture threshold
const int moistureThreshold = 430;

// Last shelter and pump statuses
int last_shelter_status = -1;
int last_pump_status = -1;

// Create a Servo object
Servo shelterServo;

// Timing v ariables
unsigned long previousPollingMillis = 0;  // For polling statuses
unsigned long previousSendMillis = 0;     // For sending sensor data
const unsigned long pollingInterval = 1000;    // 1 second for polling
const unsigned long sendInterval = 300000;      // 5 minute for sending data
WiFiClient client;
void setup() {
  //create client
  // Initialize serial communication for debugging
  Serial.begin(115200);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi!");

  // Set the relay control pin as output
  pinMode(relayPin, OUTPUT);

  // Turn off the relay initially (HIGH for high-level trigger)
  digitalWrite(relayPin, LOW);

  // Attach the servo motor to the specified pin
  shelterServo.attach(servoPin);

  // Set the servo to its initial position (0 degrees)
  shelterServo.write(0);
}

void loop() {

  // Poll shelter and pump statuses every second
  unsigned long currentMillis = millis();
  if (currentMillis - previousPollingMillis >= pollingInterval) {
    previousPollingMillis = currentMillis;
    fetchShelterStatus();
    fetchPumpStatus();
  }

  // Send sensor data to the server every minute
  if (currentMillis - previousSendMillis >= sendInterval) {
    previousSendMillis = currentMillis;
    int soilMoistureValue = analogRead(soilMoisturePin);
    int temperature_ADC = analogRead(temperaturePin);
    float temperatureC = temperature_ADC * 0.254;
    Serial.print("Soil Moisture Value: ");
    Serial.println(soilMoistureValue);
    Serial.print("Temperature C: ");
    Serial.println(temperatureC);

  // Send soil moisture and temperature data to the server
    sendSensorData(soilMoistureValue, temperatureC);
  }
}

// Function to send sensor data to the server
void sendSensorData(int soilMoisture, float temperature) {
  if (WiFi.status() == WL_CONNECTED) {

    // Connect to the server
    if (client.connect("3.25.192.50", 3000)) {
      // Create JSON payload
      String jsonPayload = "{\"soil_moisture\":" + String(soilMoisture) +
                           ",\"temperature\":" + String(temperature, 2) +
                           "}";
      Serial.print("Sending data: ");
      Serial.println(jsonPayload);

      // Send HTTP POST request
      client.println("POST /send-data HTTP/1.1");
      client.println("Host: 3.25.192.50");
      client.println("Content-Type: application/json");
      client.print("Content-Length: ");
      client.println(jsonPayload.length());
      client.println();
      client.println(jsonPayload);

      // Wait for server response
      /*while (client.connected() || client.available()) {
        if (client.available()) {
          String response = client.readString();
          Serial.println("Server response: " + response);
          break;
        }
      }*/

    } else {
      Serial.println("Connection to server failed!");
    }
  } else {
    Serial.println("WiFi not connected!");
  }
}

// Function to fetch the shelter status from the server
void fetchShelterStatus() {
  if (WiFi.status() == WL_CONNECTED) {

    // Connect to the server
    if (client.connect("3.25.192.50", 3000)) {
      // Send HTTP GET request to fetch shelter status
      client.println("GET /get-shelter-status HTTP/1.1");
      client.println("Host: 3.25.192.50");
      client.println("Connection: close");
      client.println();

      // Wait for server response
      String response = "";
      while (client.connected() || client.available()) {
        if (client.available()) {
          response += client.readString();
        }
      }

      // Extract the JSON part of the response
      int jsonStart = response.indexOf("{");
      int jsonEnd = response.lastIndexOf("}");
      if (jsonStart != -1 && jsonEnd != -1) {
        String jsonResponse = response.substring(jsonStart, jsonEnd + 1);
        Serial.println("Extracted JSON: " + jsonResponse);

        // Parse the JSON response
        JSONVar parsedJson = JSON.parse(jsonResponse);
        if (JSON.typeof(parsedJson) == "undefined") {
          Serial.println("Failed to parse JSON!");
        } else {
          int current_shelter_status = (int)parsedJson["shelter"];

          // Check if the shelter status has changed
          if (current_shelter_status != last_shelter_status) {
            if (current_shelter_status == 1) {
              activateShelter();
            } else {
              deactivateShelter();
            }
            last_shelter_status = current_shelter_status;
          }
        }
      }
    }
  }
}

// Function to fetch the pump status from the server
void fetchPumpStatus() {
  if (WiFi.status() == WL_CONNECTED) {

    // Connect to the server
    if (client.connect("3.25.192.50", 3000)) {
      // Send HTTP GET request to fetch pump status
      client.println("GET /get-pump-status HTTP/1.1");
      client.println("Host: 3.25.192.50");
      client.println("Connection: close");
      client.println();

      // Wait for server response
      String response = "";
      while (client.connected() || client.available()) {
        if (client.available()) {
          response += client.readString();
        }
      }

      // Extract the JSON part of the response
      int jsonStart = response.indexOf("{");
      int jsonEnd = response.lastIndexOf("}");
      if (jsonStart != -1 && jsonEnd != -1) {
        String jsonResponse = response.substring(jsonStart, jsonEnd + 1);
        Serial.println("Extracted JSON: " + jsonResponse);

        // Parse the JSON response
        JSONVar parsedJson = JSON.parse(jsonResponse);
        if (JSON.typeof(parsedJson) == "undefined") {
          Serial.println("Failed to parse JSON!");
        } else {
          int current_pump_status = (int)parsedJson["pump"];

          // Check if the pump status has changed
          if (current_pump_status != last_pump_status) {
            if (current_pump_status == 1) {
              pumpWater();
            }
            last_pump_status = current_pump_status;
          }
        }
      }
    }
  }
}

// Function to activate the shelter using the servo motor
void activateShelter() {
  Serial.println("Activating shelter...");
  shelterServo.write(90);
  delay(2000);
  Serial.println("Shelter activated.");
}

// Function to deactivate the shelter using the servo motor
void deactivateShelter() {
  Serial.println("Deactivating shelter...");
  shelterServo.write(0);
  delay(2000);
  Serial.println("Shelter deactivated.");
}
// Function to notify the backend when the pump operation is completed
void notifyPumpCompletion() {
  if (WiFi.status() == WL_CONNECTED) {

    // Connect to the server
    if (client.connect("3.25.192.50", 3000)) {
      // Create JSON payload
      String jsonPayload = "{\"pump\":1}"; // Set pump flag to 0

      // Send HTTP POST request
      client.println("POST /pump-completed HTTP/1.1");
      client.println("Host: 3.25.192.50");
      client.println("Content-Type: application/json");
      client.print("Content-Length: ");
      client.println(jsonPayload.length());
      client.println();
      client.println(jsonPayload);

      Serial.println("Pump completion notification sent.");
    } else {
      Serial.println("Failed to notify pump completion.");
    }
  } else {
    Serial.println("WiFi not connected!");
  }
}
// Function to pump water using the relay module
void pumpWater() {
  Serial.println("Pumping water...");
  digitalWrite(relayPin, HIGH);
  delay(500); // Pump water for 0.5 seconds
  digitalWrite(relayPin, LOW);
  Serial.println("Water pumping completed.");
  notifyPumpCompletion();
}
