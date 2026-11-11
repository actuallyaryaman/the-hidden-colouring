import copy
import itertools
import unittest
from protocol import GRAPHS, Session, bad_edges, commit, simulate_honest_verifier, verify


class ProtocolTests(unittest.TestCase):
    def test_honest_every_edge(self):
        for index in range(9):
            with self.subTest(edge=index):
                s = Session(); s.seal(); s.challenge(index); s.open()
                self.assertTrue(s.verdict['accepted'])

    def test_bad_strategy_exact_edges(self):
        results = []
        for index in range(9):
            s = Session(mode='cheat'); s.seal(); s.challenge(index); s.open()
            results.append(s.verdict['accepted'])
        self.assertEqual(results.count(False), 2)

    def test_impossible_graph_exhaustive(self):
        graph = GRAPHS['impossible']
        for colours in itertools.product(range(3), repeat=4):
            self.assertTrue(bad_edges(graph, colours))

    def test_impossible_strategy_one_bad_edge(self):
        accepted = []
        for edge in range(6):
            s = Session('impossible', 'cheat'); s.seal(); s.challenge(edge); s.open()
            accepted.append(s.verdict['accepted'])
        self.assertEqual(accepted.count(False), 1)

    def test_fresh_round_hides_previous_openings(self):
        s = Session(); s.seal(); old = list(s.commitments); s.challenge(); s.open()
        s.next_round(); self.assertEqual(s.public()['visible'], {})
        self.assertEqual(s.public()['commitments'], [])
        s.seal(); self.assertNotEqual(s.commitments, old)

    def test_reuse_exposes_all_vertices(self):
        s = Session(mode='reuse'); s.seal(); hashes = list(s.commitments)
        for edge in (0, 2, 4):
            if s.phase == 'opened': s.next_round(); s.seal()
            s.challenge(edge); s.open()
            self.assertEqual(s.commitments, hashes)
        self.assertEqual(len(s.public()['visible']), 6)

    def test_phase_order(self):
        s = Session()
        for action in (s.challenge, s.open, s.next_round):
            with self.assertRaises(ValueError): action()
        s.seal()
        with self.assertRaises(ValueError): s.seal()
        s.challenge(0)
        with self.assertRaises(ValueError): s.challenge(1)
        s.open()
        with self.assertRaises(ValueError): s.open()

    def test_public_state_does_not_expose_unopened_values(self):
        s = Session(); s.seal(); p = s.public()
        self.assertNotIn('colours', p); self.assertNotIn('salts', p)
        self.assertEqual(p['openings'], []); self.assertEqual(p['visible'], {})
        s.challenge(0); s.open(); p = s.public()
        self.assertEqual(len(p['openings']), 2)
        self.assertEqual(set(p['visible']), {'0', '1'})

    def test_tampered_openings_rejected(self):
        s = Session(); s.seal(); s.challenge(0); s.open()
        for field, value in [('colour', 7), ('salt', '0' * 64), ('vertex', 5)]:
            openings = copy.deepcopy(s.openings); openings[0][field] = value
            self.assertFalse(verify(s.graph, s.commitments, 0, openings)['accepted'])

    def test_tampered_commitment_rejected(self):
        s = Session(); s.seal(); s.challenge(0); s.open()
        hashes = list(s.commitments); hashes[0] = 'f' * 64
        self.assertFalse(verify(s.graph, hashes, 0, s.openings)['accepted'])

    def test_wrong_opening_order_and_duplicates_rejected(self):
        s = Session(); s.seal(); s.challenge(0); s.open()
        for openings in [s.openings[::-1], [s.openings[0]] * 2, s.openings[:1]]:
            self.assertFalse(verify(s.graph, s.commitments, 0, openings)['accepted'])

    def test_salts_change_hash_and_vertex_is_bound(self):
        self.assertNotEqual(commit(0, 1, 'a'*64), commit(0, 1, 'b'*64))
        self.assertNotEqual(commit(0, 1, 'a'*64), commit(1, 1, 'a'*64))

    def test_invalid_edge(self):
        s = Session(); s.seal()
        for edge in (-1, 9, True, '0'):
            with self.assertRaises(ValueError): s.challenge(edge)
        self.assertEqual(s.phase, 'sealed')

    def test_impossible_honest_prover_rejected(self):
        with self.assertRaises(ValueError): Session('impossible', 'honest')

    def test_simulator_without_witness(self):
        for graph in GRAPHS.values():
            for _ in range(20):
                t = simulate_honest_verifier(graph)
                self.assertTrue(t['verdict']['accepted'])
                self.assertTrue(verify(graph, t['commitments'], t['edge'], t['openings'])['accepted'])


if __name__ == '__main__':
    unittest.main()
