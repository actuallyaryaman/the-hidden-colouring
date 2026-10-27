import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from server import Handler


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

    def post(self, data, headers=None):
        request = Request(self.url+'/api/protocol', json.dumps(data).encode(),
                          headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            with urlopen(request) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            with error:
                return error.code, json.load(error)

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

    def test_session_not_found(self):
        status, _ = self.post({'action':'seal','session':'missing'})
        self.assertEqual(status,400)


if __name__=='__main__': unittest.main()
