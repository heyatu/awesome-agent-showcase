import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { loadCollection } from '../scripts/collection.mjs';
import { gifBytes, mp4Bytes, riffWebp, syntheticEntry, syntheticPostEntry, syntheticRoot, webpBytes, webpStill, writeEntry } from './fixture.mjs';

const SYNTHETIC = Buffer.from('SYNTHETIC TEST ASSET');

let sandbox;
beforeEach(() => { sandbox = syntheticRoot(); });
afterEach(() => sandbox.cleanup());

const errorsFor = (entry, options) => {
  sandbox.cleanup();
  sandbox = syntheticRoot();
  writeEntry(sandbox.root, entry, options);
  return loadCollection(sandbox.root).errors.join('\n');
};

describe('entry validation', () => {
  it('binds a self-contained page and original still to the revision', () => {
    const page = { kind: 'page', path: 'page.html', still: 'media/cover.png', alt: 'A dashboard', caption: 'Our sample' };
    const entry = syntheticEntry({ made: [page] });
    entry.rights.assets.push({ path: page.path, basis: 'original' });
    const files = { 'page.html': '<!doctype html><title>Sample</title>', 'media/cover.png': SYNTHETIC };
    assert.equal(errorsFor(entry, { files }), '');
    assert.match(errorsFor({ ...entry, made: [] }, { files }), /needs a made page record/);
    assert.match(errorsFor({ ...entry, made: [page, page] }, { files }), /one page.html/);
    assert.match(errorsFor({ ...entry, made: [{ ...page, still: undefined }] }, { files }), /stored still/);
    assert.match(errorsFor(entry, { files: { ...files, 'page.html': '<!doctype html><script src="external.js"></script>' } }), /no network/);
    assert.match(errorsFor(entry, { files: { ...files, 'page.html': ' '.repeat(2 ** 21) } }), /exceed 2 MB/);
    entry.rights.assets[0].basis = 'licensed';
    assert.match(errorsFor(entry, { files }), /basis original/);
  });

  it('accepts a synthetic entry', () => {
    assert.equal(errorsFor(syntheticEntry()), '');
  });

  it('accepts the editors-pick collection and rejects any other value', () => {
    assert.equal(errorsFor(syntheticEntry()), '');
    assert.equal(errorsFor(syntheticEntry({ collection: 'editors-pick' })), '');
    for (const collection of ['featured', ['editors-pick'], null]) {
      assert.match(errorsFor(syntheticEntry({ collection })), /collection must be the string "editors-pick"/);
    }
  });

  it('rejects a non-original file in an editors-pick item', () => {
    const licensed = { path: 'media/cover.png', basis: 'licensed', holder: 'Synthetic Holder', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' };
    assert.equal(errorsFor(syntheticEntry({ rights: { assets: [licensed] } })), '');
    assert.match(errorsFor(syntheticEntry({ collection: 'editors-pick', rights: { assets: [licensed] } })), /only files with rights basis original/);
    assert.match(errorsFor(syntheticEntry({ collection: 'editors-pick', rights: { assets: { some: 1 } } })), /rights.assets must be a list/);
  });

  it('rejects an ID with a bad shape or a bad length', () => {
    for (const id of ['X-1', 'x_1', `x-${'1'.repeat(31)}`]) {
      assert.match(errorsFor(syntheticEntry({ id }), { dir: 'bad-dir' }), /id must be 1 to 32/);
    }
  });

  it('requires the directory name to equal the ID', () => {
    assert.match(errorsFor(syntheticEntry(), { dir: 'x-other' }), /does not match the directory/);
  });

  it('ties an X ID to the source post and a tool ID to the tool prefix', () => {
    assert.match(errorsFor(syntheticEntry({ id: 'x-999' }), { dir: 'x-999' }), /id must be x-100000000000000001/);
    const docs = syntheticEntry({
      id: 'x-docs',
      source: { type: 'package-docs', url: 'https://example.com/docs/tool', package: 'synthetic-tool', credit: 'Synthetic tool docs', capturedAt: '2026-01-03' },
    });
    assert.match(errorsFor(docs, { dir: 'x-docs' }), /must start with tool-/);
  });

  it('accepts package documentation as provenance', () => {
    const docs = syntheticEntry({
      id: 'tool-synthetic',
      source: { type: 'package-docs', url: 'https://example.com/docs/tool', package: 'synthetic-tool', credit: 'Synthetic tool docs', capturedAt: '2026-01-03' },
    });
    assert.equal(errorsFor(docs), '');
  });

  it('accepts the video file of a post only from video.twimg.com', () => {
    const post = syntheticEntry();
    const withVideo = video => ({ ...post, source: { ...post.source, video } });
    const good = 'https://video.twimg.com/amplify_video/1/vid/avc1/1280x720/abc-DEF_1.mp4';
    assert.equal(errorsFor(withVideo(good)), '');
    assert.equal(errorsFor(withVideo(`${good}?tag=29`)), '');
    for (const bad of [
      'http://video.twimg.com/a/b.mp4',
      'https://pbs.twimg.com/a/b.mp4',
      'https://video.twimg.com.example.com/a/b.mp4',
      'https://example.com/a/b.mp4',
      'https://video.twimg.com/a/b.m3u8',
      'https://video.twimg.com/a/b.mp4?x=1',
      'https://video.twimg.com/a/b.mp4#t=1',
      `https://user${'@'}video.twimg.com/a/b.mp4`,
      'https://video.twimg.com:8443/a/b.mp4',
      'https://video.twimg.com/a/../b.mp4 ',
      '',
      null,
      7,
      ['https://video.twimg.com/a/b.mp4'],
    ]) assert.match(errorsFor(withVideo(bad)), /source\.video must be an https:\/\/video\.twimg\.com\//, bad);
    const docs = syntheticEntry({
      id: 'tool-synthetic',
      source: { type: 'package-docs', url: 'https://example.com/docs/tool', package: 'synthetic-tool', credit: 'Synthetic tool docs', capturedAt: '2026-01-03', video: good },
    });
    assert.match(errorsFor(docs), /source\.video is not allowed/);
  });

  it('rejects duplicate IDs and duplicate source keys', () => {
    const first = syntheticEntry();
    writeEntry(sandbox.root, first);
    writeEntry(sandbox.root, { ...syntheticPostEntry(2), source: first.source, id: 'x-100000000000000001' }, { dir: 'x-copy' });
    const errors = loadCollection(sandbox.root).errors.join('\n');
    assert.match(errors, /duplicate id x-100000000000000001/);
    assert.match(errors, /duplicate source x:100000000000000001/);
  });

  it('rejects unknown purposes and entries without a purpose', () => {
    assert.match(errorsFor(syntheticEntry({ purposes: ['cooking'] })), /unknown purpose "cooking"/);
    assert.match(errorsFor(syntheticEntry({ purposes: [] })), /at least one purpose/);
  });

  it('requires a public credit and a rights record', () => {
    const entry = syntheticEntry();
    delete entry.source.credit;
    assert.match(errorsFor(entry), /source.credit must be/);
  });

  it('rejects unsafe source URLs', () => {
    for (const url of ['http://x.com/a/status/1', `https://${['user:pass', 'x.com'].join('@')}/a/status/1`, 'https://x.com/a/status/1?utm=1', 'https://localhost/a', 'https://127.0.0.1/a', 'javascript:alert(1)']) {
      const entry = syntheticEntry({ source: { ...syntheticEntry().source, url } });
      assert.match(errorsFor(entry), /source.url/, url);
    }
  });

  it('rejects an asset path outside the entry', () => {
    for (const path of ['media/../body.md', '../../outside.png', '/etc/passwd.png', 'media\\cover.png', 'media/a/b.png']) {
      const entry = syntheticEntry({ media: [{ path, alt: 'Synthetic' }] });
      assert.match(errorsFor(entry), /media\[0\]\.path must be media/, path);
    }
  });

  it('rejects a symbolic link that leaves the entry', () => {
    const { base } = writeEntry(sandbox.root, syntheticEntry(), { files: {} });
    symlinkSync('/etc/hosts', join(base, 'media/cover.png'));
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /media\/cover.png is a symbolic link/);
  });

  it('rejects a missing asset and an unrecorded asset', () => {
    assert.match(errorsFor(syntheticEntry(), { files: {} }), /media\/cover.png is referenced but missing/);
    const entry = syntheticEntry({ rights: { assets: [] } });
    assert.match(errorsFor(entry), /stored without a rights record/);
  });

  it('rejects a raw export, a script and an unsupported asset', () => {
    const { base } = writeEntry(sandbox.root, syntheticEntry());
    writeFileSync(join(base, 'raw-export.json'), '{}');
    writeFileSync(join(base, 'media/run.js'), 'x');
    writeFileSync(join(base, 'media/shape.svg'), '<svg/>');
    const errors = loadCollection(sandbox.root).errors.join('\n');
    assert.match(errors, /raw-export.json is not allowed/);
    assert.match(errors, /media\/run.js is not a supported asset/);
    assert.match(errors, /media\/shape.svg is not a supported asset/);
  });

  it('rejects a third-party asset without a valid rights basis', () => {
    const rights = (asset) => syntheticEntry({ rights: { assets: [{ path: 'media/cover.png', ...asset }] } });
    assert.match(errorsFor(rights({ basis: 'scraped' })), /basis must be original, licensed, permission or quoted/);
    assert.match(errorsFor(rights({ basis: 'licensed', holder: 'Synthetic Holder' })), /licence must be/);
    assert.equal(errorsFor(rights({ basis: 'permission', holder: 'Synthetic Holder', grantedOn: '2026-01-04' })), '');
  });

  it('rejects raw HTML and unsafe link targets in the body', () => {
    const bodies = [
      'Hello <script>1</script>',
      '<img src="a.png" onerror=1>',
      '<a href="java&#x73;cript:alert(1)">open</a>',
      '[open](java&#x73;cript:alert(1))',
      '[open](javascript:alert(1))',
      '[open](http://example.com/a)',
      '[open](data:text/html;base64,AAAA)',
      '[open](./other.md)',
      '[open][ref]\n\n[ref]: java&#x73;cript:alert(1)',
      '![Demo][cover\\]name]\n\n[cover\\]name]: media/missing.png',
      '![Demo][cover\\]name]\n\n[cover\\]name]: ../../outside.png',
      '[open][a\nb]\n\n[a\nb]: java&#x73;cript:alert(1)',
      '   [ref]: https://example.com/a',
      '[open](https://example.com/a&#x26;b)',
    ];
    for (const body of bodies) assert.match(errorsFor(syntheticEntry(), { body }), /raw HTML|link target|reference-style/, body);
  });

  it('checks local images in the body against files and rights', () => {
    for (const reference of ['media/missing.png', '../../outside.png', '/etc/passwd', 'media/a/b.png']) {
      assert.match(errorsFor(syntheticEntry(), { body: `![Demo](${reference})` }), /missing\.png is referenced but missing|link target/, reference);
    }
    const unrecorded = syntheticEntry({ rights: { assets: [] }, media: [] });
    assert.match(errorsFor(unrecorded, { body: '![Demo](media/cover.png)' }), /without a rights record/);
    assert.equal(errorsFor(syntheticEntry(), { body: 'Text [source](https://example.com/a?x=1&y=2), [top](#top)\n\n![Demo](media/cover.png)\n' }), '');
  });

  it('keeps prompt choice separate from verification status', () => {
    const prompts = [
      { choice: 'paper-garden', status: 'original', text: 'Synthetic prompt' },
      { choice: 'synthwave', status: 'tested', text: 'Synthetic prompt', testedOn: '2026-01-05' },
    ];
    assert.equal(errorsFor(syntheticEntry({ prompts, action: { label: 'Try it in Atu', prompt: 'synthwave' } })), '');
    const bad = [{ choice: 'a', status: 'tested', text: 't' }, { choice: 'a', status: 'proposed', text: 't' }];
    const errors = errorsFor(syntheticEntry({ prompts: bad }));
    assert.match(errors, /testedOn must be a date/);
    assert.match(errors, /choice a is repeated/);
  });

  it('requires an action that names a prompt choice, and only for an entry with prompts', () => {
    const prompts = [{ choice: 'first', status: 'proposed', text: 'Synthetic prompt' }, { choice: 'second', status: 'proposed', text: 'Synthetic prompt two' }];
    const action = { label: 'Make a synthetic thing in Atu', prompt: 'second' };
    assert.equal(errorsFor(syntheticEntry({ prompts, action })), '');
    assert.match(errorsFor(syntheticEntry({ prompts })), /action is required when the entry has prompts/);
    assert.match(errorsFor(syntheticEntry({ prompts, action: { ...action, prompt: 'other' } })), /action.prompt must be the choice/);
    assert.match(errorsFor(syntheticEntry({ prompts, action: { ...action, label: 'x'.repeat(41) } })), /action.label must be trimmed text of 1 to 40/);
    assert.match(errorsFor(syntheticEntry({ prompts, action: { ...action, extra: 1 } })), /action.extra is not allowed/);
    assert.match(errorsFor(syntheticEntry({ action })), /action needs a prompt/);
  });

  it('accepts an optional brief of one line and rejects a badly sized or unsafe one', () => {
    const brief = 'A synthetic brief that asks an agent for a small page, with two named details.';
    assert.equal(errorsFor(syntheticEntry({ brief })), '');
    assert.equal(errorsFor(syntheticEntry()), '');
    const rejected = [
      'x'.repeat(39),
      'x'.repeat(401),
      `${brief}\nSecond line.`,
      `${brief}\rSecond line.`,
      `${brief}\u0085Second line.`,
      `${brief}\tSecond part.`,
      `${brief}\u2028Second line.`,
      `${brief}\u2029Second line.`,
      `${brief} See https://example.com/a`,
      `${brief} See ftp://example.org/a`,
      `${brief} See //example.design/x`,
      `${brief} See www.example.com`,
      `${brief} <b>bold</b>`,
      `${brief} \`code\``,
      ` ${brief}`,
    ];
    for (const text of rejected) assert.match(errorsFor(syntheticEntry({ brief: text })), /brief must/, JSON.stringify(text.slice(-30)));
    assert.match(errorsFor(syntheticEntry({ brief: 7 })), /brief must be trimmed text/);
    const accepted = [
      'x'.repeat(40),
      'x'.repeat(400),
      'Use Node.js to build a small page with a 1.5 second fade.',
      'Save the settings as user_preferences and add a reset button.',
      'Result: a small page, drawn in code. Note: keep it plain, with **bold** left alone.',
    ];
    for (const text of accepted) assert.equal(errorsFor(syntheticEntry({ brief: text })), '', text);
    assert.equal(errorsFor(syntheticEntry({ title: 'Synthetic\u2028title' })), '');
  });

  it('checks a cover: two files of the right kind, each stored, recorded and different', () => {
    const files = { 'media/cover.png': SYNTHETIC, 'media/loop.gif': SYNTHETIC, 'media/clip.mp4': SYNTHETIC };
    const rights = { assets: ['media/cover.png', 'media/loop.gif', 'media/clip.mp4'].map((path) => ({ path, basis: 'original' })) };
    const cover = (value) => syntheticEntry({ rights, cover: value });
    assert.equal(errorsFor(cover({ motion: 'media/loop.gif', still: 'media/cover.png' }), { files }), '');
    assert.equal(errorsFor(cover({ motion: 'media/clip.mp4', still: 'media/cover.png' }), { files }), '');
    assert.match(errorsFor(cover({ motion: 'media/cover.png', still: 'media/cover.png' }), { files }), /cover.motion must be media\/<name> as gif, webp or mp4/);
    assert.match(errorsFor(cover({ motion: 'media/loop.gif', still: 'media/clip.mp4' }), { files }), /cover.still must be media\/<name> as png, jpg or webp/);
    assert.match(errorsFor(cover({ motion: 'media/loop.gif' }), { files }), /cover.still must be/);
    assert.match(errorsFor(cover({ motion: 'media/loop.gif', still: 'media/cover.png', extra: 1 }), { files }), /cover.extra is not allowed/);
    assert.match(errorsFor(cover({ motion: 'media/loop.gif', still: 'media/cover.png' }), { files: { 'media/cover.png': SYNTHETIC } }), /media\/loop.gif is referenced but missing/);
    const unrecorded = syntheticEntry({ rights: { assets: [{ path: 'media/cover.png', basis: 'original' }] }, cover: { motion: 'media/loop.gif', still: 'media/cover.png' } });
    assert.match(errorsFor(unrecorded, { files }), /media\/loop.gif is referenced without a rights record|media\/loop.gif is stored without a rights record/);
    const same = { assets: [{ path: 'media/a.webp', basis: 'original' }] };
    assert.match(errorsFor(syntheticEntry({ rights: same, media: [], cover: { motion: 'media/a.webp', still: 'media/a.webp' } }), { files: { 'media/a.webp': SYNTHETIC } }), /must be different files/);
  });

  it('checks made files: original rights, a kind, a size, an alt, a caption and a count', () => {
    const files = { 'media/cover.png': SYNTHETIC, 'media/made.webp': SYNTHETIC, 'media/other.gif': SYNTHETIC };
    const records = {
      original: { basis: 'original' },
      licensed: { basis: 'licensed', holder: 'Synthetic Holder', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' },
      permission: { basis: 'permission', holder: 'Synthetic Holder', grantedOn: '2026-01-04' },
    };
    const rights = (basis) => ({ assets: [{ path: 'media/cover.png', basis: 'original' }, { path: 'media/made.webp', ...records[basis] }, { path: 'media/other.gif', basis: 'original' }] });
    const made = (value, basis = 'original') => syntheticEntry({ rights: rights(basis), made: value });
    const one = { path: 'media/made.webp', kind: 'mockup', alt: 'A synthetic made picture', caption: 'Our synthetic picture.' };
    for (const kind of ['atu', 'mockup', 'explainer']) assert.equal(errorsFor(made([{ ...one, kind }]), { files }), '', kind);
    assert.equal(errorsFor(made([one, { ...one, path: 'media/other.gif', kind: 'explainer' }]), { files }), '');
    for (const kind of [undefined, 'other', null, ['atu']]) {
      assert.match(errorsFor(made([{ ...one, kind }]), { files }), /made\[0\]\.kind must be atu, mockup, explainer, recreation or page/);
    }
    assert.match(errorsFor(made([one, { ...one, path: 'media/other.gif', kind: undefined }]), { files }), /made\[1\]\.kind/);
    for (const basis of ['licensed', 'permission']) assert.match(errorsFor(made([one], basis), { files }), /made\[0\]\.path media\/made\.webp must have rights basis original/, basis);
    assert.match(errorsFor(made([{ ...one, caption: undefined }]), { files }), /made\[0\]\.caption must be trimmed text of 1 to 160/);
    assert.match(errorsFor(made([{ ...one, caption: 'x'.repeat(161) }]), { files }), /caption must be trimmed text of 1 to 160/);
    assert.match(errorsFor(made([{ ...one, alt: '' }]), { files }), /made\[0\]\.alt must be trimmed text/);
    assert.match(errorsFor(made([{ ...one, extra: 1 }]), { files }), /made\[0\]\.extra is not allowed/);
    assert.match(errorsFor(made([{ ...one, path: 'media/cover.txt' }]), { files }), /made\[0\]\.path must be media\/<name>/);
    assert.match(errorsFor(made([one, one]), { files }), /path media\/made\.webp is repeated/);
    assert.match(errorsFor(made([one, { ...one, path: 'media/other.gif' }, { ...one, path: 'media/cover.png' }, { ...one, path: 'media/x.png' }]), { files }), /made must be a list of at most 3/);
    assert.match(errorsFor(made([{ ...one, path: 'media/gone.webp' }]), { files }), /gone\.webp is referenced but missing/);
    assert.match(errorsFor(made([one]), { files: { ...files, 'media/made.webp': Buffer.alloc(2 * 1024 * 1024 + 1) } }), /a made file is at most 2 MB/);
    assert.match(errorsFor(made('x'), { files }), /made must be a list/);
  });

  it('requires public evidence for a tool tag and rejects unknown fields', () => {
    assert.match(errorsFor(syntheticEntry({ tags: [{ kind: 'tool', name: 'Synthetic' }] })), /evidence must be/);
    assert.match(errorsFor(syntheticEntry({ approved: true })), /approved is not allowed/);
  });

  it('rejects an entries folder that is a symbolic link', () => {
    sandbox.cleanup();
    sandbox = syntheticRoot();
    symlinkSync(sandbox.root, join(sandbox.root, 'entries'));
    assert.match(loadCollection(sandbox.root).errors.join('\n'), /entries must be a directory/);
  });

  it('accepts an empty entries folder', () => {
    mkdirSync(join(sandbox.root, 'entries'));
    assert.deepEqual(loadCollection(sandbox.root).errors, []);
  });
  describe('quoted excerpts', () => {
    const SOURCE_URL = 'https://x.com/synthetic_user/status/100000000000000001';
    const quoted = (path, overrides = {}) => ({ path, basis: 'quoted', holder: 'synthetic_user', sourceUrl: SOURCE_URL, excerpt: '0:16-0:20 of the post video', ...overrides });
    const withQuoted = (files, records, overrides = {}) => [
      syntheticEntry({ rights: { assets: records }, media: [], cover: { motion: 'media/loop.gif', still: 'media/still.webp' }, ...overrides }),
      { files, body: 'Synthetic body.\n' },
    ];
    const files = { 'media/loop.gif': gifBytes([100, 100]), 'media/still.webp': webpStill() };
    const records = [quoted('media/loop.gif'), quoted('media/still.webp')];

    it('requires quoted rights and a public artwork credit link for a recreation only', () => {
      const path = 'media/remake.mp4';
      const one = { path, kind: 'recreation', caption: 'Pixel art: Synthetic Artist', alt: 'Leaves in a recreated scene', creditUrl: 'https://example.com/art' };
      const check = (item, rights) => errorsFor(...withQuoted({ ...files, [path]: mp4Bytes(8) }, [...records, rights], { made: [item] }));
      assert.equal(check(one, quoted(path)), '');
      assert.match(check(one, { path, basis: 'original' }), /must have rights basis quoted/);
      for (const creditUrl of [undefined, 'javascript:void(0)']) assert.match(check({ ...one, creditUrl }, quoted(path)), /creditUrl must be a public https URL/);
      assert.match(check({ ...one, kind: 'atu' }, quoted(path)), /creditUrl is not allowed/);
      assert.match(check({ ...one, kind: 'atu' }, quoted(path)), /must have rights basis original/);
    });

    it('accepts a short GIF, WebP and MP4 of the source post', () => {
      assert.equal(errorsFor(...withQuoted(files, records)), '');
      const clip = { 'media/loop.mp4': mp4Bytes(7.9), 'media/still.webp': webpBytes([8000]) };
      assert.equal(errorsFor(...withQuoted(clip, [quoted('media/loop.mp4'), quoted('media/still.webp')], { cover: { motion: 'media/loop.mp4', still: 'media/still.webp' } })), '');
    });

    it('is only for an x-post item', () => {
      const docs = { id: 'tool-synthetic', source: { type: 'package-docs', url: SOURCE_URL, package: 'synthetic-tool', credit: 'Synthetic tool docs', capturedAt: '2026-01-03' } };
      assert.match(errorsFor(...withQuoted(files, records, docs)), /basis quoted is only for an x-post item/);
    });

    it('needs the holder, the source URL and the excerpt, and nothing else', () => {
      for (const field of ['holder', 'sourceUrl', 'excerpt']) {
        const record = quoted('media/loop.gif');
        delete record[field];
        assert.match(errorsFor(...withQuoted(files, [record, quoted('media/still.webp')])), new RegExp(`${field} must be`), field);
      }
      assert.match(errorsFor(...withQuoted(files, [quoted('media/loop.gif', { licence: 'CC0' }), quoted('media/still.webp')])), /licence is not allowed/);
    });

    it('ties the source URL and the holder to the source post', () => {
      const other = quoted('media/loop.gif', { sourceUrl: 'https://x.com/synthetic_user/status/100000000000000002' });
      assert.match(errorsFor(...withQuoted(files, [other, quoted('media/still.webp')])), /sourceUrl must equal source.url/);
      for (const holder of ['someone_else', '@synthetic_user']) {
        assert.match(errorsFor(...withQuoted(files, [quoted('media/loop.gif', { holder }), quoted('media/still.webp')])), /holder must be the handle in source.author/, holder);
      }
    });

    it('allows only a GIF, a WebP or an MP4', () => {
      const png = { 'media/loop.gif': gifBytes([10]), 'media/still.png': Buffer.from('SYNTHETIC TEST ASSET') };
      const entry = syntheticEntry({ rights: { assets: [quoted('media/loop.gif'), quoted('media/still.png')] }, media: [], cover: { motion: 'media/loop.gif', still: 'media/still.png' } });
      assert.match(errorsFor(entry, { files: png }), /assets\[1\]\.path of a quoted file must be gif, webp or mp4/);
    });

    it('rejects a file longer than 8 seconds, in each format', () => {
      for (const long of [gifBytes([500, 301]), mp4Bytes(8.01), webpBytes([4000, 4001])]) {
        const path = long.subarray(0, 4).toString('latin1') === 'RIFF' ? 'media/loop.webp' : long.subarray(0, 3).toString('latin1') === 'GIF' ? 'media/loop.gif' : 'media/loop.mp4';
        const entry = syntheticEntry({ rights: { assets: [quoted(path)] }, media: [{ path, alt: 'Synthetic excerpt' }] });
        assert.match(errorsFor(entry, { files: { [path]: long } }), /a quoted file is at most 8 s/, path);
      }
    });

    it('rejects a file of more than 2 MB and a file whose length cannot be read', () => {
      const big = Buffer.concat([gifBytes([10]).subarray(0, -1), Buffer.alloc(2 * 1024 * 1024), Buffer.from([0x3b])]);
      const entry = (path) => syntheticEntry({ rights: { assets: [quoted(path)] }, media: [{ path, alt: 'Synthetic excerpt' }] });
      assert.match(errorsFor(entry('media/loop.gif'), { files: { 'media/loop.gif': big } }), /a quoted file is at most 2 MB/);
      assert.match(errorsFor(entry('media/loop.gif'), { files: { 'media/loop.gif': Buffer.from('SYNTHETIC TEST ASSET') } }), /length of the quoted file cannot be read/);
      assert.match(errorsFor(entry('media/loop.mp4'), { files: { 'media/loop.mp4': Buffer.from('SYNTHETIC TEST ASSET') } }), /length of the quoted file cannot be read/);
      assert.match(errorsFor(entry('media/loop.webp'), { files: { 'media/loop.webp': riffWebp() } }), /length of the quoted file cannot be read/);
    });

    it('does not change the rules of another basis', () => {
      const original = syntheticEntry({ rights: { assets: [{ path: 'media/loop.gif', basis: 'original' }] }, media: [{ path: 'media/loop.gif', alt: 'Synthetic loop' }] });
      assert.equal(errorsFor(original, { files: { 'media/loop.gif': gifBytes(Array(20).fill(100)) } }), '');
    });
  });
});
