import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from protocol import Session
from transcript import verify_transcript


class TranscriptTests(unittest.TestCase):
    def record(self, mode='honest'):
        session = Session(mode=mode)
        session.seal(); session.challenge(0); session.open()
        return session, session.transcript()

    def test_public_record_verifies_without_live_session(self):
        session, document = self.record()
        del session
        result = verify_transcript(document)
        self.assertTrue(result['accepted'])
        self.assertEqual(len(result['rounds'][0]['openings']),2)
        self.assertTrue(all(c['passed'] for c in result['rounds'][0]['checks']))

    def test_all_tamper_types_rejected(self):
        _, document = self.record()
        for kind in ('colour','salt','vertex','commitment'):
            altered=copy.deepcopy(document)
            record=altered['rounds'][0]; opening=record['openings'][0]
            if kind=='colour': opening['colour']=(opening['colour']+1)%3
            elif kind=='salt': opening['salt']=('1' if opening['salt'][0]=='0' else '0')+opening['salt'][1:]
            elif kind=='vertex': opening['vertex']=2
            else: record['commitments'][0]='f'*64
            with self.subTest(kind=kind): self.assertFalse(verify_transcript(altered)['accepted'])
        self.assertTrue(verify_transcript(document)['accepted'])

    def test_previous_records_immutable_and_sequential(self):
        session, document = self.record()
        first=copy.deepcopy(document['rounds'][0])
        session.next_round(); session.seal(); session.challenge(1); session.open()
        self.assertEqual(session.transcript()['rounds'][0],first)
        self.assertEqual(len(session.transcript()['rounds']),2)
        self.assertTrue(verify_transcript(session.transcript())['accepted'])
        document['rounds'][0]['openings'][0]['salt']='0'*64
        self.assertEqual(session.transcript()['rounds'][0],first)

    def test_pending_messages_never_export_unopened_values(self):
        session=Session(); session.seal(); session.challenge(0)
        self.assertEqual(session.transcript()['rounds'],[])
        public=session.public()
        self.assertEqual(len(public['events']),2)
        self.assertNotIn('openings',json.dumps(public['events']))
        self.assertFalse(verify_transcript(session.transcript())['accepted'])

    def test_message_byte_counts_match_actual_payload(self):
        session,_=self.record()
        self.assertEqual([e['sender'] for e in session.events],['Prover','Verifier','Prover'])
        for event in session.events:
            self.assertEqual(event['bytes'],len(json.dumps(event['payload'],separators=(',',':')).encode()))

    def test_bad_colours_rejected_even_when_commitments_match(self):
        _,document=self.record('cheat')
        result=verify_transcript(document)
        self.assertFalse(result['accepted'])
        self.assertTrue(result['rounds'][0]['commitments_valid'])
        self.assertFalse(result['rounds'][0]['different_colours'])

    def test_reject_malformed_and_private_fields(self):
        _,document=self.record()
        malformed=[None,{}, {'format':'wrong','graph':{},'rounds':[]}]
        for field in ('witness','session','salts'):
            altered=copy.deepcopy(document);altered[field]='must not be present';malformed.append(altered)
        altered=copy.deepcopy(document);altered['graph']['witness']=[0,1,2];malformed.append(altered)
        altered=copy.deepcopy(document);altered['rounds'][0]['round']=2;malformed.append(altered)
        altered=copy.deepcopy(document);altered['graph']['edges'].append([0,0]);malformed.append(altered)
        for value in malformed: self.assertFalse(verify_transcript(value)['accepted'])

    def test_cli_accepts_original_and_returns_failure_for_tamper(self):
        _,document=self.record()
        command=[sys.executable,str(Path(__file__).resolve().parents[1]/'transcript.py')]
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'record.json';path.write_text(json.dumps(document))
            result=subprocess.run([*command,str(path)],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertTrue(json.loads(result.stdout)['accepted'])
            document['rounds'][0]['openings'][0]['colour']=9;path.write_text(json.dumps(document))
            result=subprocess.run([*command,str(path)],capture_output=True,text=True)
            self.assertEqual(result.returncode,1)


if __name__=='__main__': unittest.main()
