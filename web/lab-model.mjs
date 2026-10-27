
export const strategies = {
  honest: {graph:'puzzle', mode:'honest'},
  cheat: {graph:'puzzle', mode:'cheat'},
  impossible: {graph:'impossible', mode:'cheat'},
  reuse: {graph:'puzzle', mode:'reuse'}
};

export function tamperedCopy(document, kind) {
  const copy = JSON.parse(JSON.stringify(document));
  const round = copy.rounds.at(-1);
  if (!round?.openings?.length) throw new Error('Complete a round first.');
  const opening = round.openings[0];
  if (kind === 'colour') opening.colour = (opening.colour + 1) % 3;
  else if (kind === 'salt') opening.salt = (opening.salt[0] === '0' ? '1' : '0') + opening.salt.slice(1);
  else if (kind === 'vertex') opening.vertex = (opening.vertex + 1) % copy.graph.vertices.length;
  else if (kind === 'commitment') {
    const hash = round.commitments[opening.vertex];
    round.commitments[opening.vertex] = (hash[0] === '0' ? '1' : '0') + hash.slice(1);
  } else throw new Error('Unknown change.');
  return copy;
}

export function nextAction(phase) {
  return {ready:['seal','Seal answers'], sealed:['challenge','Choose a challenge'],
          challenged:['open','Open & verify'], opened:['next','Prepare fresh round']}[phase];
}
