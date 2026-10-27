import test from 'node:test';
import assert from 'node:assert/strict';
import {tamperedCopy, nextAction} from '../web/lab-model.mjs';
const original = {graph:{vertices:['A','B','C']},rounds:[{commitments:['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)],openings:[{vertex:0,colour:0,salt:'a'.repeat(64)},{vertex:1,colour:1,salt:'b'.repeat(64)}]}]};
for (const kind of ['colour','salt','vertex','commitment']) test(`${kind} changes only a copy`,()=>{
 const before=JSON.stringify(original);const altered=tamperedCopy(original,kind);
 assert.notDeepEqual(altered,original);assert.equal(JSON.stringify(original),before);
 assert.equal(altered.rounds[0].openings[1].salt,original.rounds[0].openings[1].salt);
});
test('phase sequence maps to actual server actions',()=>assert.deepEqual(['ready','sealed','challenged','opened'].map(p=>nextAction(p)[0]),['seal','challenge','open','next']));
test('empty record cannot be tampered',()=>assert.throws(()=>tamperedCopy({rounds:[]},'colour')));
