import json
import os
from unittest.mock import patch
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from server import Handler, SESSIONS, parse_arguments


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def post(self, data, headers=None, path="/api/protocol"):
        request = Request(self.url+path, json.dumps(data).encode(),
                          headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            with urlopen(request) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            with error:
                return error.code, json.load(error)

    def test_health_endpoint(self):
        with urlopen(self.url + "/healthz") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.load(response), {"status": "ok"})

    def test_directory_listing_disabled(self):
        with self.assertRaises(HTTPError) as caught:
            urlopen(self.url + "/fonts/")
        self.assertEqual(caught.exception.code, 404)

    def test_full_http_round(self):
        _, state = self.post({'action':'create'})
        token = state['session']
        for action in ['seal','challenge','open']:
            status, state = self.post({'action':action,'session':token})
            self.assertEqual(status, 200)
        self.assertTrue(state['verdict']['accepted'])
        self.assertEqual(len(state['openings']), 2)

    def test_no_private_values_in_sealed_response(self):
        _, state = self.post({'action':'create'})
        _, state = self.post({'action':'seal','session':state['session']})
        self.assertEqual(state['openings'], [])
        self.assertEqual(state['visible'], {})
        self.assertNotIn('salts',state)
        self.assertNotIn('colours',state)

    def test_invalid_phase_is_400(self):
        _, state = self.post({'action':'create'})
        status, result = self.post({'action':'open','session':state['session']})
        self.assertEqual(status,400)
        self.assertIn('error',result)

    def test_foreign_site_rejected(self):
        status, _ = self.post({'action':'create'},{'Sec-Fetch-Site':'cross-site'})
        self.assertEqual(status,403)

    def test_static_page_and_csp(self):
        with urlopen(self.url) as response:
            self.assertEqual(response.status,200)
            self.assertIn("default-src 'self'",response.headers['Content-Security-Policy'])
            self.assertIn(b'The Hidden Colouring',response.read())

    def test_replacement_does_not_exhaust_sessions(self):
        _, state = self.post({'action': 'create'})
        initial_count = len(SESSIONS)
        for _ in range(140):
            old = state['session']
            status, state = self.post({'action': 'create', 'session': old})
            self.assertEqual(status, 200)
            self.assertNotIn(old, SESSIONS)
        self.assertEqual(len(SESSIONS), initial_count)

    def test_independent_export_and_verifier_endpoints(self):
        _, state = self.post({'action':'create'})
        token = state['session']
        for action in ('seal','challenge','open'):
            _, state = self.post({'action':action, 'session':token})
        status, record = self.post({'session':token}, path='/api/transcript')
        self.assertEqual(status, 200)
        self.assertNotIn('session', record)
        self.assertEqual(len(record['rounds']), 1)
        status, result = self.post({'document':record}, path='/api/verify')
        self.assertEqual(status, 200)
        self.assertTrue(result['accepted'])
        record['rounds'][0]['openings'][0]['colour'] = 8
        _, result = self.post({'document':record}, path='/api/verify')
        self.assertFalse(result['accepted'])

    def test_source_endpoint_contains_actual_functions_not_session_values(self):
        with urlopen(self.url+'/api/source') as response:
            source = json.load(response)
        self.assertIn('def seal(self)', source['Session.seal']['source'])
        self.assertIn('verify', source)
        self.assertNotIn('session', source)

    def test_protocol_lab_and_modules_are_served(self):
        with urlopen(self.url+'/lab.html') as response:
            page = response.read().decode()
            self.assertIn('id="advance"', page)
            self.assertIn('type="module" src="lab.js"', page)
        with urlopen(self.url+'/lab-model.mjs') as response:
            self.assertIn('javascript', response.headers['Content-Type'])
            self.assertIn(b'tamperedCopy', response.read())

    def test_session_not_found(self):
        status, _ = self.post({'action':'seal','session':'missing'})
        self.assertEqual(status,400)


if __name__=='__main__': unittest.main()


class StartupTests(unittest.TestCase):
    def test_local_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            args = parse_arguments([])
        self.assertEqual((args.host, args.port), ("127.0.0.1", 8767))

    def test_render_port_and_explicit_override(self):
        with patch.dict(os.environ, {"PORT": "10000"}):
            args = parse_arguments(["--host", "0.0.0.0"])
            self.assertEqual((args.host, args.port), ("0.0.0.0", 10000))
            self.assertEqual(parse_arguments(["--port", "8768"]).port, 8768)
