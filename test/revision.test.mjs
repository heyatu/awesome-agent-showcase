import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { loadCollection } from '../scripts/collection.mjs';
import { canonicalJson, revisionOf } from '../scripts/revision.mjs';
import { syntheticEntry, syntheticRoot, writeEntry } from './fixture.mjs';

describe('canonical revision', () => {
  const files = new Map([['body.md', Buffer.from('body')], ['media/a.png', Buffer.from('a')]]);
  const entry = syntheticEntry();

  it('sorts keys and ignores the revision field itself', () => {
    assert.equal(canonicalJson({ b: [2, { d: 1, c: 'x' }], a: null }), '{"a":null,"b":[2,{"c":"x","d":1}]}');
    assert.equal(revisionOf({ ...entry, revision: 'sha256:aaa' }, files), revisionOf({ ...entry, revision: 'other' }, files));
  });

  it('does not depend on key order or file order', () => {
    const reordered = Object.fromEntries(Object.entries(entry).reverse());
    assert.equal(revisionOf(reordered, new Map([...files].reverse())), revisionOf(entry, files));
  });

  it('changes when the entry, the body or an asset changes', () => {
    const base = revisionOf(entry, files);
    assert.match(base, /^sha256:[0-9a-f]{64}$/);
    const changed = [
      revisionOf({ ...entry, title: 'SYNTHETIC OTHER' }, files),
      revisionOf(entry, new Map([...files, ['body.md', Buffer.from('body 2')]])),
      revisionOf(entry, new Map([...files, ['media/a.png', Buffer.from('b')]])),
      revisionOf(entry, new Map([...files, ['media/b.png', Buffer.from('a')]])),
    ];
    assert.equal(new Set([base, ...changed]).size, 5);
  });
});

describe('revision in a stored entry', () => {
  let sandbox;
  beforeEach(() => { sandbox = syntheticRoot(); });
  afterEach(() => sandbox.cleanup());

  it('goes stale when body or asset bytes change after sealing', () => {
    const { base } = writeEntry(sandbox.root, syntheticEntry());
    assert.deepEqual(loadCollection(sandbox.root).errors, []);
    writeFileSync(join(base, 'body.md'), 'Edited synthetic body.\n');
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /revision is stale/);
    writeEntry(sandbox.root, syntheticEntry());
    writeFileSync(join(base, 'media/cover.png'), 'edited synthetic asset');
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /revision is stale/);
  });

  it('goes stale when only the collection changes after sealing', () => {
    const { base, entry } = writeEntry(sandbox.root, syntheticEntry());
    writeFileSync(join(base, 'entry.json'), JSON.stringify({ ...entry, collection: 'editors-pick' }));
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /revision is stale/);
  });

  it('rejects a malformed revision', () => {
    writeEntry(sandbox.root, syntheticEntry({ revision: 'abc123' }), { seal: false });
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /revision must be sha256/);
  });
});
