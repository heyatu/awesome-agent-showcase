import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { groupByFirstPurpose, linkState, loadCollection } from '../scripts/collection.mjs';
import { BLOCK_START, renderBlock, replaceBlock, trackedUrl } from '../scripts/readme.mjs';
import { REPO, gifBytes, syntheticPostEntry, syntheticRoot, webpStill, writeEntry } from './fixture.mjs';

let sandbox;
beforeEach(() => { sandbox = syntheticRoot(); });
afterEach(() => sandbox.cleanup());

const record = (entry, overrides = {}) => ({
  id: entry.id,
  revision: entry.revision,
  url: `https://heyatu.com/market/${entry.id}`,
  release: 'synthetic-release-0001',
  ...overrides,
});
const inHtml = (url) => url.replaceAll('&', '&amp;');
const writeDeployments = (records) => writeFileSync(join(sandbox.root, 'deployments.json'), JSON.stringify(records));

describe('groups', () => {
  it('has no group member in the empty collection', () => {
    const { purposes, entries, errors } = loadCollection(sandbox.root);
    assert.deepEqual(errors, []);
    const { total, groups } = groupByFirstPurpose(purposes, entries);
    assert.equal(total, 0);
    assert.equal(groups.length, 7);
    assert.ok(groups.every(({ entries: members }) => members.length === 0));
  });

  it('puts an item in its first purpose only, in the order of the purpose list', () => {
    writeEntry(sandbox.root, syntheticPostEntry(1, { purposes: ['images', 'slides'] }));
    writeEntry(sandbox.root, syntheticPostEntry(2, { purposes: ['images'] }));
    const { purposes, entries } = loadCollection(sandbox.root);
    const { total, groups } = groupByFirstPurpose(purposes, entries);
    assert.equal(total, 2);
    assert.deepEqual(groups.map(({ id }) => id), purposes.map(({ id }) => id));
    assert.deepEqual(groups.find(({ id }) => id === 'slides').entries, []);
    assert.deepEqual(groups.find(({ id }) => id === 'images').entries.map(({ id }) => id), ['x-100000000000000001', 'x-100000000000000002']);
  });
});

describe("editor's picks", () => {
  const section = (block, heading) => {
    const start = block.indexOf(`### ${heading}`);
    assert.notEqual(start, -1, `missing section ${heading}`);
    const next = block.indexOf('\n### ', start + 1);
    return block.slice(start, next === -1 ? undefined : next);
  };
  const cards = (text) => text.split('<td').slice(1).filter((cell) => /SYNTHETIC ITEM \d/.test(cell))
    .map((cell) => ({ id: `x-10000000000000000${/SYNTHETIC ITEM (\d)/.exec(cell)[1]}`, cell }));
  const ids = (text) => cards(text).map(({ id }) => id);
  const cardOf = (text, id) => cards(text).find((card) => card.id === id).cell;
  const P = (n) => `x-10000000000000000${n}`;
  const item = (n, overrides) => syntheticPostEntry(n, { title: `SYNTHETIC ITEM ${n}`, ...overrides });

  it('lists picks in their own section first, sorted by id, and marks them in their purpose group', () => {
    const quotedCover = (n) => ({
      cover: { motion: 'media/cover.gif', still: 'media/cover.webp' },
      rights: { assets: [
        { path: 'media/cover.gif', basis: 'quoted', holder: 'synthetic_user', sourceUrl: `https://x.com/synthetic_user/status/10000000000000000${n}`, excerpt: '0:00-0:01 of the post video' },
        { path: 'media/cover.webp', basis: 'quoted', holder: 'synthetic_user', sourceUrl: `https://x.com/synthetic_user/status/10000000000000000${n}`, excerpt: 'A still of the post video' },
      ] },
      media: [],
    });
    const files = { 'media/cover.gif': gifBytes([100]), 'media/cover.webp': webpStill() };
    const originalCover = (n) => {
      const quoted = quotedCover(n);
      return { ...quoted, rights: { assets: quoted.rights.assets.map(({ path }) => ({ path, basis: 'original' })) } };
    };
    writeEntry(sandbox.root, item(1, { purposes: ['images'], ...quotedCover(1) }), { files });
    writeEntry(sandbox.root, item(2, { purposes: ['images'], collection: 'editors-pick', ...originalCover(2) }), { files });
    writeEntry(sandbox.root, item(3, { purposes: ['images'], collection: 'editors-pick', ...originalCover(3) }), { files });
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    const block = renderBlock({ ...collection, entries: [...collection.entries].reverse() });
    const picks = section(block, "★ Editor's Picks (2)");
    const images = section(block, 'Images (3)');
    assert.ok(block.indexOf(picks) < block.indexOf(images));
    assert.deepEqual(ids(picks), [P(2), P(3)]);
    assert.deepEqual(ids(images), [P(1), P(2), P(3)]);
    for (const text of [picks, images]) for (const id of [P(2), P(3)]) assert.match(cardOf(text, id), /★ Editor's Pick/);
    assert.doesNotMatch(cardOf(images, P(1)), /Editor's Pick/);
    assert.match(cardOf(images, P(1)), /via <a href/);
  });

  it('keeps the released link of a stale pick and gives an undeployed pick none, in both sections', () => {
    const { entry: stale } = writeEntry(sandbox.root, item(1, { collection: 'editors-pick' }));
    writeEntry(sandbox.root, item(2, { collection: 'editors-pick' }));
    writeDeployments([record(stale, { revision: `sha256:${'0'.repeat(64)}` })]);
    const block = renderBlock(loadCollection(sandbox.root));
    const label = loadCollection(sandbox.root).purposes.find(({ id }) => id === 'slides').label;
    for (const text of [section(block, "★ Editor's Picks (2)"), section(block, `${label} (2)`)]) {
      assert.deepEqual(ids(text), [P(1), P(2)]);
      assert.ok(cardOf(text, P(1)).includes(inHtml(trackedUrl(P(1), 'market-grid'))));
      assert.doesNotMatch(cardOf(text, P(2)), /heyatu\.com/);
    }
  });

  it('has no picks section without a pick', () => {
    writeEntry(sandbox.root, syntheticPostEntry(1));
    assert.doesNotMatch(renderBlock(loadCollection(sandbox.root)), /Editor's Pick/);
  });
});

describe('deployment records and links', () => {
  it('has no link without a record', () => {
    const { entry } = writeEntry(sandbox.root, syntheticPostEntry(1));
    const collection = loadCollection(sandbox.root);
    assert.equal(linkState(entry, collection.deployments), 'none');
    assert.doesNotMatch(renderBlock(collection), /heyatu\.com/);
  });

  it('links an item with a matching record', () => {
    const { entry } = writeEntry(sandbox.root, syntheticPostEntry(1));
    writeDeployments([record(entry)]);
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    assert.equal(linkState(entry, collection.deployments), 'live');
    const block = renderBlock(collection);
    assert.ok(block.includes(`href="${inHtml(trackedUrl(entry.id, 'market-grid'))}"`));
    assert.ok(block.includes(`href="${inHtml(trackedUrl(entry.id, 'market-category'))}"`));
    assert.match(trackedUrl(entry.id, 'market-hero'), /^https:\/\/heyatu\.com\/market\/x-\d+\?utm_source=github&utm_medium=readme&utm_campaign=market-hero$/);
  });

  it('keeps the link of the released revision when the draft is newer', () => {
    const { entry } = writeEntry(sandbox.root, syntheticPostEntry(1));
    writeDeployments([record(entry, { revision: `sha256:${'0'.repeat(64)}` })]);
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    assert.equal(linkState(entry, collection.deployments), 'stale');
    assert.ok(renderBlock(collection).includes(inHtml(trackedUrl(entry.id, 'market-grid'))));
  });

  it('rejects an unsupported record', () => {
    const { entry } = writeEntry(sandbox.root, syntheticPostEntry(1));
    const cases = [
      [record(entry, { id: 'x-404' }), /is not an item/],
      [record(entry, { url: 'https://heyatu.com/market/x-100000000000000001/' }), /url must be/],
      [record(entry, { url: 'https://example.com/market/x-100000000000000001' }), /url must be/],
      [record(entry, { revision: 'abc' }), /full revision/],
      [record(entry, { release: '/Volumes/synthetic/path' }), /release must be/],
      [{ id: entry.id, revision: entry.revision, url: record(entry).url }, /exactly id, revision, url and release/],
    ];
    for (const [bad, pattern] of cases) {
      writeDeployments([bad]);
      assert.match(loadCollection(sandbox.root).errors.join('\n'), pattern);
    }
    writeDeployments([record(entry), record(entry)]);
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /repeats the record/);
  });
});

describe('generated README block', () => {
  const sample = `before\n${BLOCK_START}\nold\n<!-- collection:end -->\nafter\n`;
  const withCover = (n, overrides = {}) => {
    const rights = { assets: ['media/cover.png', 'media/loop.gif', 'media/clip.mp4'].map((path) => ({ path, basis: 'original' })) };
    const files = { 'media/cover.png': Buffer.from('a'), 'media/loop.gif': Buffer.from('b'), 'media/clip.mp4': Buffer.from('c') };
    return writeEntry(sandbox.root, syntheticPostEntry(n, { rights, ...overrides }), { files });
  };

  it('is deterministic, sorted by ID and unchanged on a second run', () => {
    writeEntry(sandbox.root, syntheticPostEntry(2, { purposes: ['coding'], title: 'SYNTHETIC SECOND' }));
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'SYNTHETIC FIRST' }));
    const collection = loadCollection(sandbox.root);
    const first = replaceBlock(sample, renderBlock(collection));
    assert.equal(replaceBlock(first, renderBlock(collection)), first);
    assert.ok(first.startsWith('before\n') && first.endsWith('after\n'));
    assert.ok(first.indexOf('SYNTHETIC FIRST') < first.indexOf('SYNTHETIC SECOND'));
  });

  it('shows one section for each purpose that has items, once for each item, with its count', () => {
    writeEntry(sandbox.root, syntheticPostEntry(1, { purposes: ['coding', 'slides'], title: 'MULTI' }));
    writeEntry(sandbox.root, syntheticPostEntry(2, { purposes: ['slides'], title: 'SLIDES ONE' }));
    writeEntry(sandbox.root, syntheticPostEntry(3, { purposes: ['slides'], title: 'SLIDES TWO' }));
    const block = renderBlock(loadCollection(sandbox.root));
    assert.deepEqual([...block.matchAll(/^### (.+)$/gm)].map(([, heading]) => heading), ['Slides (2)', 'Coding (1)']);
    assert.equal(block.match(/MULTI/g).length, 1);
    assert.ok(block.indexOf('### Slides (2)') < block.indexOf('SLIDES ONE') && block.indexOf('SLIDES TWO') < block.indexOf('### Coding (1)'));
  });

  it('puts the cards in a two-column table and pads the last row', () => {
    for (const n of [1, 2, 3]) writeEntry(sandbox.root, syntheticPostEntry(n, { title: `CARD ${n}` }));
    const block = renderBlock(loadCollection(sandbox.root));
    assert.equal(block.match(/<table>/g).length, 1);
    assert.equal(block.match(/<tr>/g).length, 2);
    assert.equal(block.match(/<td /g).length, 4);
    assert.match(block, /<td width="50%" valign="top">\n\n<\/td>\n<\/tr>\n<\/table>/);
  });

  it('escapes HTML in item text and keeps Markdown in it literal', () => {
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'A [link](x) <b> & "q"', summary: '# <script>x</script> Synthetic' }));
    const block = renderBlock(loadCollection(sandbox.root));
    assert.ok(block.includes('<p><strong>A [link](x) &lt;b&gt; &amp; &quot;q&quot;</strong><br># &lt;script&gt;x&lt;/script&gt; Synthetic</p>'));
    assert.doesNotMatch(block, /<script|<b>/);
  });

  it('shows the brief in a text code block and never the prompt text', () => {
    const prompts = [{ choice: 'main', status: 'tested', testedOn: '2026-01-05', text: 'SYNTHETIC SECRET PROMPT' }];
    const brief = 'A synthetic brief that asks an agent for a small page, with two named details.';
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'WITH BRIEF', brief, prompts, action: { label: 'Make it in Atu', prompt: 'main' } }));
    writeEntry(sandbox.root, syntheticPostEntry(2, { title: 'WITHOUT BRIEF' }));
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    const block = renderBlock(collection);
    assert.equal(block.match(/<summary>Brief<\/summary>/g).length, 1);
    assert.ok(block.includes(`<details>\n<summary>Brief</summary>\n\n\`\`\`text\n${brief}\n\`\`\`\n\n</details>`));
    assert.doesNotMatch(block, /SYNTHETIC SECRET PROMPT|Make it in Atu/);
  });

  it('keeps a purpose label literal in its heading', () => {
    writeEntry(sandbox.root, syntheticPostEntry(1));
    const collection = loadCollection(sandbox.root);
    const purposes = collection.purposes.map((purpose) => (purpose.id === 'slides' ? { ...purpose, label: '# [Slides](x) <b> *' } : purpose));
    assert.match(renderBlock({ ...collection, purposes }), /^### \\# \\\[Slides\\\]\\\(x\\\) \\<b\\> \\\* \(1\)$/m);
  });

  it('rejects a purpose label of more than one line', () => {
    for (const label of ['A\nB', 'A\u2028B', 'A\u0085B']) {
      writeFileSync(join(sandbox.root, 'tags/purposes.json'), JSON.stringify([{ id: 'slides', label }]));
      assert.match(loadCollection(sandbox.root).errors.join('\n'), /one-line label/);
    }
  });

  it('shows a motion cover with the still for reduced motion, else the still alone', () => {
    withCover(1, { title: 'GIF ITEM', cover: { motion: 'media/loop.gif', still: 'media/cover.png' } });
    withCover(2, { title: 'MP4 ITEM', cover: { motion: 'media/clip.mp4', still: 'media/cover.png' } });
    writeEntry(sandbox.root, syntheticPostEntry(3, { title: 'PLAIN ITEM' }));
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    const block = renderBlock(collection);
    assert.ok(block.includes('<picture><source media="(prefers-reduced-motion: reduce)" srcset="entries/x-100000000000000001/media/cover.png"><img src="entries/x-100000000000000001/media/loop.gif" alt="GIF ITEM" width="100%"></picture>'));
    assert.ok(block.includes('<img src="entries/x-100000000000000002/media/cover.png" alt="MP4 ITEM" width="100%">'));
    assert.doesNotMatch(block, /clip\.mp4/);
    assert.equal(block.match(/<img /g).length, 2);
  });

  it('shows "via @handle" for a quoted cover file only', () => {
    const post = 'https://x.com/synthetic_user/status/100000000000000001';
    const quoted = (path) => ({ path, basis: 'quoted', holder: 'synthetic_user', sourceUrl: post, excerpt: '0:16-0:20 of the post video' });
    const original = (path) => ({ path, basis: 'original' });
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'QUOTED ITEM', rights: { assets: [quoted('media/loop.gif'), quoted('media/still.webp')] }, media: [], cover: { motion: 'media/loop.gif', still: 'media/still.webp' } }),
      { files: { 'media/loop.gif': gifBytes([100, 100]), 'media/still.webp': webpStill() } });
    writeEntry(sandbox.root, syntheticPostEntry(2, { title: 'OWN ITEM', rights: { assets: [original('media/loop.gif'), original('media/cover.png')] }, media: [], cover: { motion: 'media/loop.gif', still: 'media/cover.png' } }),
      { files: { 'media/loop.gif': Buffer.from('a'), 'media/cover.png': Buffer.from('b') } });
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    const block = renderBlock(collection);
    assert.equal(block.match(/via /g).length, 1);
    assert.ok(block.includes(`<p>via <a href="${post}">@synthetic_user</a></p>`));
  });

  it('shows the tested label and the tags that the item has, and no others', () => {
    const tags = [{ kind: 'tool', name: 'Synthetic Tool', version: '2', evidence: 'https://example.com/tool' }, { kind: 'model', name: 'Synthetic Model', evidence: 'https://example.com/model' }];
    const prompt = (status) => [{ choice: 'main', status, text: 'Synthetic prompt', ...(status === 'tested' ? { testedOn: '2026-01-05' } : {}) }];
    const action = { label: 'Make it in Atu', prompt: 'main' };
    writeEntry(sandbox.root, syntheticPostEntry(1, { title: 'TESTED', tags, prompts: prompt('tested'), action }));
    writeEntry(sandbox.root, syntheticPostEntry(2, { title: 'PROPOSED', prompts: prompt('proposed'), action }));
    const block = renderBlock(loadCollection(sandbox.root));
    assert.ok(block.includes('<p>Tested in Hey Atu · Synthetic Tool 2 · Synthetic Model</p>'));
    assert.equal(block.match(/Tested in Hey Atu/g).length, 1);
    assert.doesNotMatch(block, /<p><\/p>/);
  });

  it('links the title, the cover and the run line with their own placements, and only when a record exists', () => {
    const prompts = [{ choice: 'main', status: 'tested', testedOn: '2026-01-05', text: 'Synthetic prompt' }];
    const { entry } = withCover(1, { title: 'LINKED', cover: { motion: 'media/loop.gif', still: 'media/cover.png' }, prompts, action: { label: 'Make it in Atu', prompt: 'main' } });
    withCover(2, { title: 'UNLINKED', cover: { motion: 'media/loop.gif', still: 'media/cover.png' } });
    writeDeployments([record(entry)]);
    const collection = loadCollection(sandbox.root);
    assert.deepEqual(collection.errors, []);
    const block = renderBlock(collection);
    const grid = inHtml(trackedUrl(entry.id, 'market-grid'));
    const category = inHtml(trackedUrl(entry.id, 'market-category'));
    assert.equal(block.split(`href="${grid}"`).length - 1, 2);
    assert.ok(block.includes(`<a href="${category}">Run the tested version in Hey Atu →</a>`));
    assert.equal(block.match(/heyatu\.com/g).length, 3);
    assert.ok(block.includes('<strong>UNLINKED</strong>'));
  });

  it('words the run line for an item without a tested prompt', () => {
    const prompts = [{ choice: 'main', status: 'proposed', text: 'Synthetic prompt' }];
    const { entry: proposed } = writeEntry(sandbox.root, syntheticPostEntry(1, { prompts, action: { label: 'Make it in Atu', prompt: 'main' } }));
    const { entry: plain } = writeEntry(sandbox.root, syntheticPostEntry(2));
    writeDeployments([record(proposed), record(plain)]);
    const block = renderBlock(loadCollection(sandbox.root));
    assert.match(block, />Try it in Hey Atu →</);
    assert.match(block, />View on Hey Atu Market →</);
    assert.doesNotMatch(block, /Run the tested version/);
  });

  it('lists the empty collection honestly', () => {
    const block = renderBlock(loadCollection(sandbox.root));
    assert.match(block, /No items are listed yet\./);
    assert.doesNotMatch(block, /<table>|###/);
  });

  it('fails check mode when the block is stale and passes after a rebuild', () => {
    cpSync(join(REPO, 'scripts'), join(sandbox.root, 'scripts'), { recursive: true });
    cpSync(join(REPO, 'README.md'), join(sandbox.root, 'README.md'));
    const run = (...args) => spawnSync(process.execPath, ['scripts/readme.mjs', ...args], { cwd: sandbox.root, encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(run('--check').status, 0);
    writeEntry(sandbox.root, syntheticPostEntry(1));
    const stale = run('--check');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /collection block is stale/);
    assert.equal(run().status, 0);
    const rebuilt = readFileSync(join(sandbox.root, 'README.md'), 'utf8');
    assert.match(rebuilt, /SYNTHETIC TEST ENTRY/);
    assert.equal(run('--check').status, 0);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(join(sandbox.root, 'README.md'), 'utf8'), rebuilt);
  });

  it('rejects a README without block markers', () => {
    assert.throws(() => replaceBlock('no markers', 'x'), /no collection block markers/);
  });
});
