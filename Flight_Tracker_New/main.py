from flask import Flask, render_template, jsonify
import requests
from datetime import datetime, timezone
import threading
import time
import random
import os

# New Flight class
class Flight:
    def __init__(self, data):
        self.icao24 = data.get('icao24', 'N/A')
        self.callsign = data.get('callsign', 'N/A').strip()
        self.origin_country = data.get('origin_country', 'Unknown')
        self.destination_country = data.get('destination_country', 'N/A')
        self.longitude = data.get('longitude', 0.0)
        self.latitude = data.get('latitude', 0.0)
        self.altitude = data.get('altitude', 0)
        self.velocity = data.get('velocity', 0)
        self.heading = data.get('heading', 0)
        self.last_contact = data.get('last_contact', 'N/A')
        self.is_european = data.get('is_european', False)
        self.flight_type = data.get('flight_type', 'private')

    def to_dict(self):
        """Convert Flight object to dictionary for JSON serialization"""
        return {
            'icao24': self.icao24,
            'callsign': self.callsign,
            'origin_country': self.origin_country,
            'destination_country': self.destination_country,
            'longitude': self.longitude,
            'latitude': self.latitude,
            'altitude': self.altitude,
            'velocity': self.velocity,
            'heading': self.heading,
            'last_contact': self.last_contact,
            'is_european': self.is_european,
            'flight_type': self.flight_type
        }

class FlightDataManager:
    def __init__(self):
        self.flight_data = []  # List of Flight objects
        self.demo_mode = False
        self.last_updated = datetime.now(timezone.utc).strftime('%H:%M:%S UTC')

    def update_data(self, new_data, is_demo=False):
        """Update flight data with list of Flight objects"""
        self.flight_data = new_data  # Expect new_data to be list of Flight objects
        self.demo_mode = is_demo
        self.last_updated = datetime.now(timezone.utc).strftime('%H:%M:%S UTC')

    def get_flights(self):
        """Return list of flight dictionaries"""
        return [flight.to_dict() for flight in self.flight_data]

    def get_flight_by_icao(self, icao24):
        """Find a flight by ICAO24 code"""
        for flight in self.flight_data:
            if flight.icao24 == icao24:
                return flight.to_dict()
        return None

    def get_status(self):
        """Return data status"""
        return {
            'flight_count': len(self.flight_data),
            'demo_mode': self.demo_mode,
            'last_updated': self.last_updated
        }

class FlightDataUpdater:
    def __init__(self, data_manager):
        self.api_url = "https://opensky-network.org/api/states/all"
        self.data_manager = data_manager
        self.api_call_interval = 120
        self.last_api_call = 0

    def get_demo_flights(self):
        """Generate demo flight data as Flight objects"""
        rng = random.Random(535)
        demo_flights = []
        cities = [
            {"name": "New York", "lat": 40.7128, "lon": -74.0060, "country": "United States"},
            {"name": "London", "lat": 51.5074, "lon": -0.1278, "country": "United Kingdom"},
            {"name": "Tokyo", "lat": 35.6762, "lon": 139.6503, "country": "Japan"},
            {"name": "Paris", "lat": 48.8566, "lon": 2.3522, "country": "France"},
            {"name": "Sydney", "lat": -33.8688, "lon": 151.2093, "country": "Australia"},
            {"name": "Dubai", "lat": 25.2048, "lon": 55.2708, "country": "UAE"},
            {"name": "Singapore", "lat": 1.3521, "lon": 103.8198, "country": "Singapore"},
            {"name": "Los Angeles", "lat": 34.0522, "lon": -118.2437, "country": "United States"},
            {"name": "Frankfurt", "lat": 50.1109, "lon": 8.6821, "country": "Germany"},
            {"name": "Hong Kong", "lat": 22.3193, "lon": 114.1694, "country": "China"}
        ]
        military_prefixes = ["AF", "NAVY", "ARMY", "MARINE", "CG", "PAT"]
        private_prefixes = ["N", "G", "D", "F", "HB", "VP", "C"]

        for i in range(25):
            origin = rng.choice(cities)
            destination = rng.choice([c for c in cities if c != origin])
            prefix_type = rng.choice(["military", "private"])
            prefix = rng.choice(military_prefixes if prefix_type == "military" else private_prefixes)

            flight_data = {
                'icao24': f'demo{i:03d}',
                'callsign': f"{prefix}{rng.randint(10, 999)}",
                'origin_country': origin['country'],
                'destination_country': destination['country'],
                'longitude': origin['lon'] + rng.uniform(-2, 2),
                'latitude': origin['lat'] + rng.uniform(-2, 2),
                'altitude': rng.randint(8000, 12000),
                'velocity': rng.randint(200, 300),
                'heading': rng.randint(0, 359),
                'last_contact': datetime.now(timezone.utc).strftime('%H:%M:%S'),
                'is_european': origin['country'] in ['United Kingdom', 'France', 'Germany', 'Italy', 'Spain'],
                'flight_type': prefix_type
            }
            demo_flights.append(Flight(flight_data))
        return demo_flights

    def fetch_flight_data(self):
        """Fetch live flight data from OpenSky Network API as Flight objects"""
        current_time = time.time()
        if current_time - self.last_api_call < self.api_call_interval:
            print(f"Rate limiting: {self.api_call_interval - (current_time - self.last_api_call):.0f}s remaining")
            return self.get_demo_flights(), True

        try:
            print("Fetching live flight data...")
            headers = {'User-Agent': 'FlightTracker/1.0 (Educational Purpose)'}
            client_id = os.getenv('OPENSKY_CLIENT_ID')
            client_secret = os.getenv('OPENSKY_CLIENT_SECRET')
            if client_id and client_secret:
                token_response = requests.post(
                    'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
                    data={'grant_type': 'client_credentials', 'client_id': client_id, 'client_secret': client_secret},
                    timeout=5)
                token_response.raise_for_status()
                headers['Authorization'] = 'Bearer ' + token_response.json()['access_token']
            response = requests.get(self.api_url, headers=headers, timeout=12)
            self.last_api_call = current_time

            if response.status_code == 200:
                data = response.json()
                if not isinstance(data, dict) or not isinstance(data.get("states"), list):
                    return self.get_demo_flights(), True
                flights = []
                if data and 'states' in data and data['states']:
                    for state in data['states']:
                        if (len(state) >= 11 and isinstance(state[5], (int, float)) and isinstance(state[6], (int, float))
                                and -180 <= state[5] <= 180 and -90 <= state[6] <= 90 and not state[8]
                                and isinstance(state[4], (int, float)) and 0 <= current_time - state[4] <= 300):  # Check lat/lon
                            callsign = state[1].strip() if state[1] else 'N/A'
                            flight = Flight({
                                'icao24': state[0],
                                'callsign': callsign,
                                'origin_country': state[2] or 'Unknown',
                                'destination_country': 'N/A',
                                'longitude': state[5],
                                'latitude': state[6],
                                'altitude': state[7],
                                'velocity': state[9],
                                'heading': state[10],
                                'last_contact': datetime.fromtimestamp(state[4], timezone.utc).strftime('%H:%M:%S') if state[4] else 'N/A',
                                'is_european': state[2] in ['United Kingdom', 'France', 'Germany', 'Italy', 'Spain'],
                                'flight_type': 'unknown'
                            })
                            flights.append(flight)
                            if len(flights) >= 500:
                                break
                print(f"Successfully fetched {len(flights)} aircraft observations")
                return (flights, False) if flights else (self.get_demo_flights(), True)

            elif response.status_code == 429:
                print("API Rate Limited (429) - Switching to demo mode")
                return self.get_demo_flights(), True
            else:
                return self.get_demo_flights(), True

        except requests.exceptions.Timeout:
            print("API request timed out - using demo data")
            return self.get_demo_flights(), True
        except Exception as e:
            print(f"Flight feed unavailable: {type(e).__name__}")
            return self.get_demo_flights(), True

class FlightTrackerApp:
    def __init__(self):
        self.app = Flask(__name__)
        self.data_manager = FlightDataManager()
        self.data_updater = FlightDataUpdater(self.data_manager)
        self.setup_routes()
        # Refresh inside requests; never depend on a serverless background thread.
        self.refresh_lock = threading.Lock()
        self.refreshed_at = 0

    def refresh_data(self):
        with self.refresh_lock:
            if time.time() - self.refreshed_at >= 120:
                flights, demo = self.data_updater.fetch_flight_data()
                self.data_manager.update_data(flights, demo)
                self.refreshed_at = time.time()

    def setup_routes(self):
        """Define Flask routes"""
        @self.app.route('/')
        def index():
            return render_template('index.html')

        @self.app.route('/api/flights')
        def get_flights():
            self.refresh_data()
            flights = self.data_manager.get_flights()
            status = self.data_manager.get_status()
            return jsonify({
                'flights': flights,
                'count': status['flight_count'],
                'last_updated': status['last_updated'],
                'demo_mode': status['demo_mode'],
                'status': 'demo' if status['demo_mode'] else 'live',
                'source': 'Synthetic sample' if status['demo_mode'] else 'OpenSky Network',
                'notice': 'Synthetic flights, not real aircraft positions.' if status['demo_mode'] else 'Latest available OpenSky observations; coverage and delays vary.'
            })

        @self.app.route('/api/flight/<icao24>')
        def get_flight_details(icao24):
            self.refresh_data()
            flight = self.data_manager.get_flight_by_icao(icao24)
            if flight:
                return jsonify(flight)
            return jsonify({'error': 'Flight not found'}), 404

        @self.app.route('/api/status')
        def get_status():
            status = self.data_manager.get_status()
            next_update = max(0, 120 - (time.time() - self.refreshed_at))
            return jsonify({
                'demo_mode': status['demo_mode'],
                'next_update_in': int(next_update),
                'flight_count': status['flight_count'],
                'api_interval': 120,
                'initialized': bool(self.refreshed_at)
            })

tracker = FlightTrackerApp()
app = tracker.app

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.getenv('PORT', '5000')))
