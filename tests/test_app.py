import time
import unittest
from unittest.mock import Mock, patch
import requests
from Flight_Tracker_New.main import FlightTrackerApp


class FlightTests(unittest.TestCase):
    def setUp(self):
        self.tracker = FlightTrackerApp()
        self.client = self.tracker.app.test_client()

    def response(self, status=200, states=None):
        response = Mock(status_code=status)
        response.json.return_value = {'states': states}
        return response

    @patch('Flight_Tracker_New.main.requests.get')
    def test_live_zero_coordinates_missing_measurements_and_cache(self, get):
        state = ['abc123', 'TEST01 ', 'Latvia', time.time(), time.time(), 0, 0, None, False, None, 0]
        get.return_value = self.response(states=[state])
        data = self.client.get('/api/flights').get_json()
        self.assertFalse(data['demo_mode'])
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['flights'][0]['latitude'], 0)
        self.assertIsNone(data['flights'][0]['altitude'])
        self.assertEqual(data['flights'][0]['flight_type'], 'unknown')
        self.assertEqual(self.client.get('/api/flight/abc123').status_code, 200)
        self.assertEqual(self.client.get('/api/flight/missing').status_code, 404)
        self.client.get('/api/flights')
        get.assert_called_once()

    @patch('Flight_Tracker_New.main.requests.get')
    def test_rate_limit_fallback_is_labelled_and_stable(self, get):
        get.return_value = self.response(429)
        data = self.client.get('/api/flights').get_json()
        self.assertTrue(data['demo_mode'])
        self.assertIn('Synthetic', data['source'])
        self.assertEqual(data['count'], 25)
        self.assertEqual(data, self.client.get('/api/flights').get_json())

    @patch('Flight_Tracker_New.main.requests.get')
    def test_timeout_has_usable_fallback(self, get):
        get.side_effect = requests.exceptions.Timeout()
        data = self.client.get('/api/flights').get_json()
        self.assertTrue(data['demo_mode'])
        self.assertEqual(len(data['flights']), 25)

    @patch('Flight_Tracker_New.main.requests.get')
    def test_invalid_empty_and_stale_data_use_fallback(self, get):
        stale = ['abc', '', 'Latvia', 1, 1, 24, 57, 1000, False, 100, 0]
        for states in (None, [], [stale], [['short']]):
            with self.subTest(states=states):
                self.tracker.refreshed_at = 0
                self.tracker.data_updater.last_api_call = 0
                get.return_value = self.response(states=states)
                self.assertTrue(self.client.get('/api/flights').get_json()['demo_mode'])

    def test_page_assets_and_status(self):
        page = self.client.get('/')
        self.assertEqual(page.status_code, 200)
        self.assertIn(b'About this project', page.data)
        self.assertIn(b'Sample flights are invented', page.data)
        for path in ('/static/script.js', '/static/style.css', '/api/status'):
            with self.client.get(path) as response:
                self.assertEqual(response.status_code, 200)


if __name__ == '__main__':
    unittest.main()
