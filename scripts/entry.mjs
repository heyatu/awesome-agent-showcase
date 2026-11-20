import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUOTED_EXTENSIONS, QUOTED_MAX_BYTES, QUOTED_MAX_MS, durationMs } from './media.mjs';
import { revisionOf } from './revision.mjs';

export const ID_PATTERN = /^[a-z0-9-]{1,32}$/;
export const REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const MARKET_ORIGIN = 'https://heyatu.com';
export const marketUrl = (id) => `${MARKET_ORIGIN}/market/${id}`;

const ASSET_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'];
const ASSET_PATH = new RegExp(`^media/[a-z0-9][a-z0-9._-]{0,63}\\.(${ASSET_EXTENSIONS.join('|')})$`);
const CHOICE_PATTERN = /^[a-z0-9-]{1,32}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const X_POST_PATH = /^\/[A-Za-z0-9_]{1,15}\/status\/(\d{1,19})$/;
const RAW_HTML = /<[A-Za-z/!?]/;
const INLINE_TARGET = /\]\(\s*([^\s)]*)/g;
const ANCHOR = /^#[A-Za-z0-9_-]+$/;
const ESCAPED_TEXT = /&[#\w]+;|\\/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const PRIVATE_HOST = /^(localhost|.*\.(local|localhost|internal|lan))$|^[\d.]+$|:/;

const MOTION_PATH = /\.(gif|webp|mp4)$/;
const MADE_PATH = /\.(png|jpe?g|webp|gif|mp4)$/;
const PAGE_PATH = 'page.html';
const MADE_KINDS = ['atu', 'mockup', 'explainer', 'recreation', 'page'];
const MADE_MAX_ITEMS = 3;
const MADE_MAX_BYTES = 2 * 1024 * 1024;
const STILL_PATH = /\.(png|jpg|jpeg|webp)$/;
const BRIEF_MIN = 40;
const BRIEF_MAX = 400;
const BRIEF_FORBIDDEN = /[<`\p{Cc}\u2028\u2029]|:\/\/|\/\/|www\./iu;

const TOP_LEVEL = ['id', 'title', 'summary', 'brief', 'purposes', 'source', 'rights', 'media', 'prompts', 'action', 'cover', 'made', 'collection', 'requirements', 'tags', 'revision'];
const REQUIRED = ['id', 'title', 'summary', 'purposes', 'source', 'rights', 'media', 'requirements', 'revision'];
const SOURCE_FIELDS = {
  'x-post': ['type', 'url', 'author', 'credit', 'publishedAt', 'capturedAt'],
  'package-docs': ['type', 'url', 'package', 'credit', 'capturedAt'],
};
const OPTIONAL_SOURCE_FIELDS = { 'x-post': ['video'] };
const X_VIDEO_HOST = 'video.twimg.com';
const X_VIDEO_PATH = /^\/[A-Za-z0-9_\-/.]{1,200}\.mp4$/;
const X_VIDEO_QUERY = /^(?:\?tag=\d{1,4})?$/;
const RIGHTS_FIELDS = {
  original: ['path', 'basis'],
  licensed: ['path', 'basis', 'holder', 'licence', 'licenceUrl'],
  permission: ['path', 'basis', 'holder', 'grantedOn'],
  quoted: ['path', 'basis', 'holder', 'sourceUrl', 'excerpt'],
};
export const COLLECTIONS = ['editors-pick'];
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

export const quotedRights = (entry, path) => entry.rights?.assets?.find((asset) => asset.path === path && asset.basis === 'quoted') ?? null;

export function parseHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 300 || /\s/.test(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const safe = url.protocol === 'https:' && !url.username && !url.password && !url.port
    && url.hostname.includes('.') && !PRIVATE_HOST.test(url.hostname);
  return safe ? url : null;
}

export function xPostId(source) {
  const url = parseHttpsUrl(source?.url);
  const onX = url && ['x.com', 'twitter.com'].includes(url.hostname) && !url.search && !url.hash;
  return onX ? X_POST_PATH.exec(url.pathname)?.[1] ?? null : null;
}

export function xVideoUrl(value) {
  const url = parseHttpsUrl(value);
  const ok = url && url.hostname === X_VIDEO_HOST && !url.hash && X_VIDEO_PATH.test(url.pathname) && X_VIDEO_QUERY.test(url.search);
  return ok ? url.href : null;
}

export function sourceKey(source) {
  if (source?.type === 'x-post') {
    const postId = xPostId(source);
    return postId && `x:${postId}`;
  }
  const url = parseHttpsUrl(source?.url);
  return url && `docs:${url.hostname}${url.pathname.replace(/\/+$/, '')}`;
}

function isDate(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

function checkObject(value, allowed, where, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${where} must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${where}.${key} is not allowed`);
  return true;
}

function checkText(value, where, errors, { max, multiline = false } = {}) {
  const ok = typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max
    && !CONTROL_CHARACTERS.test(value) && (multiline || !/[\r\n]/.test(value));
  if (!ok) errors.push(`${where} must be trimmed text of 1 to ${max} characters${multiline ? '' : ' on one line'}`);
  return ok;
}

function checkUrl(value, where, errors) {
  if (!parseHttpsUrl(value)) errors.push(`${where} must be a public https URL without credentials`);
}

function checkDate(value, where, errors) {
  if (!isDate(value)) errors.push(`${where} must be a date as YYYY-MM-DD`);
}

function checkList(value, where, errors, max) {
  if (!Array.isArray(value) || value.length > max) {
    errors.push(`${where} must be a list of at most ${max}`);
    return [];
  }
  return value;
}

function checkSource(entry, errors) {
  const { source, id } = entry;
  const fields = SOURCE_FIELDS[source?.type];
  if (!fields) {
    errors.push('source.type must be x-post or package-docs');
    return;
  }
  if (!checkObject(source, [...fields, ...(OPTIONAL_SOURCE_FIELDS[source.type] ?? [])], 'source', errors)) return;
  if (source.video !== undefined && (typeof source.video !== 'string' || xVideoUrl(source.video) !== source.video)) {
    errors.push(`source.video must be an https://${X_VIDEO_HOST}/....mp4 URL, with at most a ?tag=<number> query`);
  }
  for (const field of fields.filter((name) => name !== 'type')) {
    if (field.endsWith('At')) checkDate(source[field], `source.${field}`, errors);
    else if (field === 'url') checkUrl(source.url, 'source.url', errors);
    else checkText(source[field], `source.${field}`, errors, { max: 200 });
  }
  if (source.type === 'x-post') {
    const postId = xPostId(source);
    if (!postId) errors.push('source.url must be https://x.com/<handle>/status/<id> without query');
    else if (id !== `x-${postId}`) errors.push(`id must be x-${postId} for this source`);
  } else if (!/^tool-[a-z0-9-]+$/.test(id ?? '')) {
    errors.push('id of a package-docs item must start with tool-');
  }
}

function checkQuoted(entry, asset, bytes, where, errors) {
  const { source } = entry;
  if (source?.type !== 'x-post') errors.push(`${where}.basis quoted is only for an x-post item`);
  else {
    if (asset.sourceUrl !== source.url) errors.push(`${where}.sourceUrl must equal source.url`);
    if (asset.holder !== source.author || !HANDLE_PATTERN.test(asset.holder ?? '')) errors.push(`${where}.holder must be the handle in source.author`);
  }
  if (!QUOTED_EXTENSIONS.includes(String(asset.path).split('.').pop())) {
    errors.push(`${where}.path of a quoted file must be gif, webp or mp4`);
    return;
  }
  if (!bytes) return;
  if (bytes.length > QUOTED_MAX_BYTES) errors.push(`${where}: a quoted file is at most ${QUOTED_MAX_BYTES / (1024 * 1024)} MB`);
  const length = durationMs(asset.path, bytes);
  if (length === null) errors.push(`${where}: the length of the quoted file cannot be read`);
  else if (length > QUOTED_MAX_MS) errors.push(`${where}: a quoted file is at most ${QUOTED_MAX_MS / 1000} s`);
}

function checkRights(entry, files, errors) {
  const assets = checkList(entry.rights?.assets, 'rights.assets', errors, 100);
  checkObject(entry.rights, ['assets'], 'rights', errors);
  const seen = new Set();
  for (const [index, asset] of assets.entries()) {
    const where = `rights.assets[${index}]`;
    const fields = RIGHTS_FIELDS[asset?.basis];
    if (!fields) errors.push(`${where}.basis must be original, licensed, permission or quoted`);
    else if (checkObject(asset, fields, where, errors)) {
      if (asset.basis === 'quoted') checkQuoted(entry, asset, files.get(asset.path), where, errors);
      for (const field of fields.filter((name) => name !== 'path' && name !== 'basis')) {
        if (field === 'licenceUrl' || field === 'sourceUrl') checkUrl(asset[field], `${where}.${field}`, errors);
        else if (field === 'grantedOn') checkDate(asset[field], `${where}.${field}`, errors);
        else checkText(asset[field], `${where}.${field}`, errors, { max: 200 });
      }
    }
    if (asset?.path !== PAGE_PATH && !ASSET_PATH.test(asset?.path ?? '')) errors.push(`${where}.path must be media/<name> with a supported extension`);
    else if (seen.has(asset.path)) errors.push(`${where}.path ${asset.path} is repeated`);
    else seen.add(asset.path);
  }
  if (entry.collection === 'editors-pick' && assets.some((asset) => asset?.basis !== 'original')) errors.push('an editors-pick item stores only files with rights basis original');
  return seen;
}

function checkMedia(entry, errors) {
  const seen = new Set();
  for (const [index, item] of checkList(entry.media, 'media', errors, 100).entries()) {
    const where = `media[${index}]`;
    if (!checkObject(item, ['path', 'alt'], where, errors)) continue;
    checkText(item.alt, `${where}.alt`, errors, { max: 300 });
    if (!ASSET_PATH.test(item.path ?? '')) errors.push(`${where}.path must be media/<name> with a supported extension`);
    else if (seen.has(item.path)) errors.push(`${where}.path ${item.path} is repeated`);
    else seen.add(item.path);
  }
  return seen;
}

function checkPrompts(entry, errors) {
  const choices = new Set();
  for (const [index, prompt] of checkList(entry.prompts ?? [], 'prompts', errors, 20).entries()) {
    const where = `prompts[${index}]`;
    if (!checkObject(prompt, ['choice', 'status', 'text', 'label', 'testedOn'], where, errors)) continue;
    if (!CHOICE_PATTERN.test(prompt.choice ?? '')) errors.push(`${where}.choice must be lowercase letters, digits and hyphens`);
    else if (choices.has(prompt.choice)) errors.push(`${where}.choice ${prompt.choice} is repeated`);
    else choices.add(prompt.choice);
    if (!['original', 'proposed', 'tested'].includes(prompt.status)) errors.push(`${where}.status must be original, proposed or tested`);
    checkText(prompt.text, `${where}.text`, errors, { max: 4000, multiline: true });
    if (prompt.label !== undefined) checkText(prompt.label, `${where}.label`, errors, { max: 80 });
    if (prompt.status === 'tested') checkDate(prompt.testedOn, `${where}.testedOn`, errors);
    else if (prompt.testedOn !== undefined) errors.push(`${where}.testedOn is only for tested prompts`);
  }
}

function checkBrief(entry, errors) {
  if (entry.brief === undefined) return;
  if (!checkText(entry.brief, 'brief', errors, { max: BRIEF_MAX })) return;
  if (entry.brief.length < BRIEF_MIN) errors.push(`brief must be at least ${BRIEF_MIN} characters`);
  if (BRIEF_FORBIDDEN.test(entry.brief)) errors.push('brief must not contain a control character, a line break, <, a backtick, // or www.');
}

function checkAction(entry, errors) {
  const choices = new Set(Array.isArray(entry.prompts) ? entry.prompts.map((prompt) => prompt?.choice) : []);
  if (entry.action === undefined) {
    if (choices.size > 0) errors.push('action is required when the entry has prompts');
    return;
  }
  if (choices.size === 0) errors.push('action needs a prompt: the entry has none');
  if (!checkObject(entry.action, ['label', 'prompt'], 'action', errors)) return;
  checkText(entry.action.label, 'action.label', errors, { max: 40 });
  if (!choices.has(entry.action.prompt)) errors.push('action.prompt must be the choice of one of the prompts');
}

function checkCover(entry, errors) {
  const paths = [];
  if (entry.cover === undefined) return paths;
  if (!checkObject(entry.cover, ['motion', 'still'], 'cover', errors)) return paths;
  for (const [field, kind] of [['motion', MOTION_PATH], ['still', STILL_PATH]]) {
    const path = entry.cover[field];
    if (!ASSET_PATH.test(path ?? '') || !kind.test(path)) errors.push(`cover.${field} must be media/<name> as ${field === 'motion' ? 'gif, webp or mp4' : 'png, jpg or webp'}`);
    else paths.push(path);
  }
  if (paths.length === 2 && paths[0] === paths[1]) errors.push('cover.motion and cover.still must be different files');
  return paths;
}

function checkMade(entry, files, errors) {
  const paths = [];
  if (entry.made === undefined) return paths;
  for (const [index, item] of checkList(entry.made, 'made', errors, MADE_MAX_ITEMS).entries()) {
    const where = `made[${index}]`;
    const recreation = item?.kind === 'recreation';
    const fields = ['path', 'kind', 'alt', 'caption'];
    if (recreation) fields.push('creditUrl');
    if (item?.kind === 'page') fields.push('still');
    if (!checkObject(item, fields, where, errors)) continue;
    if (!MADE_KINDS.includes(item.kind)) errors.push(`${where}.kind must be atu, mockup, explainer, recreation or page`);
    if (recreation) checkUrl(item.creditUrl, `${where}.creditUrl`, errors);
    checkText(item.alt, `${where}.alt`, errors, { max: 300 });
    checkText(item.caption, `${where}.caption`, errors, { max: 160 });
    if (item.kind === 'page') {
      if (paths.includes(PAGE_PATH) || item.path !== PAGE_PATH) errors.push(`${where}.path must name one page.html`);
      if (!ASSET_PATH.test(item.still ?? '') || !STILL_PATH.test(item.still)) errors.push(`${where}.still must name a stored still image`);
      for (const path of [item.path, item.still]) {
        paths.push(path);
        if (entry.rights?.assets?.find(asset => asset?.path === path)?.basis !== 'original') errors.push(`${where}: page and still must have rights basis original`);
      }
      if ((files.get(PAGE_PATH)?.length ?? 0) + (files.get(item.still)?.length ?? 0) > MADE_MAX_BYTES) errors.push(`${where}: page and still exceed 2 MB`);
      if (/.webp$/.test(item.still) && files.has(item.still) && durationMs(item.still, files.get(item.still)) !== 0) errors.push(`${where}.still must be a still image`);
    } else if (!ASSET_PATH.test(item.path ?? '') || !MADE_PATH.test(item.path)) errors.push(`${where}.path must be media/<name> as png, jpg, webp, gif or mp4`);
    else if (paths.includes(item.path)) errors.push(`${where}.path ${item.path} is repeated`);
    else {
      paths.push(item.path);
      const record = entry.rights?.assets?.find((asset) => asset?.path === item.path);
      const basis = recreation ? 'quoted' : 'original';
      if (record && record.basis !== basis) errors.push(`${where}.path ${item.path} must have rights basis ${basis}`);
      if ((files.get(item.path)?.length ?? 0) > MADE_MAX_BYTES) errors.push(`${where}: a made file is at most ${MADE_MAX_BYTES / (1024 * 1024)} MB`);
    }
  }
  return paths;
}

function checkTags(entry, errors) {
  for (const [index, tag] of checkList(entry.tags ?? [], 'tags', errors, 20).entries()) {
    const where = `tags[${index}]`;
    if (!checkObject(tag, ['kind', 'name', 'version', 'evidence'], where, errors)) continue;
    if (!['tool', 'model'].includes(tag.kind)) errors.push(`${where}.kind must be tool or model`);
    checkText(tag.name, `${where}.name`, errors, { max: 80 });
    if (tag.version !== undefined) checkText(tag.version, `${where}.version`, errors, { max: 40 });
    checkUrl(tag.evidence, `${where}.evidence`, errors);
  }
}

function checkBody(body, errors) {
  const mediaPaths = new Set();
  if (body.trim() === '') errors.push('body.md must not be empty');
  if (RAW_HTML.test(body)) errors.push('body.md must not contain raw HTML');
  if (body.includes(']:')) errors.push('body.md must not contain reference-style link definitions');
  for (const [, target] of body.matchAll(INLINE_TARGET)) {
    if (ASSET_PATH.test(target)) mediaPaths.add(target);
    else if (!ANCHOR.test(target) && (ESCAPED_TEXT.test(target) || !parseHttpsUrl(target))) {
      errors.push(`body.md link target ${JSON.stringify(target.slice(0, 60))} must be a public https URL, an anchor or a media file`);
    }
  }
  return mediaPaths;
}

function checkFields(entry, purposeIds, errors) {
  if (!checkObject(entry, TOP_LEVEL, 'entry', errors)) return false;
  for (const field of REQUIRED) if (!(field in entry)) errors.push(`${field} is required`);
  if (!ID_PATTERN.test(entry.id ?? '')) errors.push('id must be 1 to 32 lowercase letters, digits and hyphens');
  checkText(entry.title, 'title', errors, { max: 120 });
  checkText(entry.summary, 'summary', errors, { max: 280 });
  const purposes = checkList(entry.purposes, 'purposes', errors, purposeIds.length);
  if (purposes.length === 0) errors.push('purposes needs at least one purpose');
  if (new Set(purposes).size !== purposes.length) errors.push('purposes must not repeat');
  for (const purpose of purposes) if (!purposeIds.includes(purpose)) errors.push(`purposes: unknown purpose ${JSON.stringify(purpose)}`);
  for (const [index, line] of checkList(entry.requirements, 'requirements', errors, 20).entries()) checkText(line, `requirements[${index}]`, errors, { max: 200 });
  checkSource(entry, errors);
  checkBrief(entry, errors);
  checkPrompts(entry, errors);
  checkAction(entry, errors);
  checkTags(entry, errors);
  if (entry.collection !== undefined && !COLLECTIONS.includes(entry.collection)) errors.push('collection must be the string "editors-pick"');
  return true;
}

function readEntryFiles(dir, errors) {
  const files = new Map();
  const names = readdirSync(dir);
  for (const name of names) {
    const info = lstatSync(join(dir, name));
    if (info.isSymbolicLink()) errors.push(`${name} is a symbolic link`);
    else if (name === 'media' && info.isDirectory()) continue;
    else if ((name === 'body.md' || name === PAGE_PATH) && info.isFile()) files.set(name, readFileSync(join(dir, name)));
    else if (name !== 'entry.json' || !info.isFile()) errors.push(`${name} is not allowed in an entry`);
  }
  if (!files.has('body.md') && !names.includes('body.md')) errors.push('body.md is required');
  if (!names.includes('media') || lstatSync(join(dir, 'media')).isSymbolicLink()) return files;
  for (const name of readdirSync(join(dir, 'media'))) {
    const path = `media/${name}`;
    const info = lstatSync(join(dir, path));
    if (info.isSymbolicLink()) errors.push(`${path} is a symbolic link`);
    else if (!info.isFile() || !ASSET_PATH.test(path)) errors.push(`${path} is not a supported asset`);
    else files.set(path, readFileSync(join(dir, path)));
  }
  return files;
}

export function loadEntry(dir, purposeIds) {
  const errors = [];
  let entry;
  try {
    entry = JSON.parse(readFileSync(join(dir, 'entry.json'), 'utf8'));
  } catch (error) {
    return { entry: null, errors: [`entry.json cannot be read: ${error.code ?? error.message}`] };
  }
  const files = readEntryFiles(dir, errors);
  if (!checkFields(entry, purposeIds, errors)) return { entry, errors };

  const bodyMedia = checkBody(files.get('body.md')?.toString('utf8') ?? '', errors);
  const stored = new Set([...files.keys()].filter((name) => name !== 'body.md'));
  const licensed = checkRights(entry, files, errors);
  const referenced = new Set([...checkMedia(entry, errors), ...bodyMedia, ...checkCover(entry, errors), ...checkMade(entry, files, errors)]);
  if (stored.has(PAGE_PATH)) {
    if (!entry.made?.some?.(item => item?.kind === 'page' && item.path === PAGE_PATH)) errors.push('page.html needs a made page record');
    const html = files.get(PAGE_PATH).toString('utf8');
    if (!/^<!doctype html>/i.test(html.trimStart()) || html.includes('\0')) errors.push('page.html must be an HTML document');
    if (/<(?:base|iframe|frame|object|embed|form|link)\b|http-equiv\s*=|@import\b|\b(?:fetch|WebSocket|XMLHttpRequest|EventSource|sendBeacon)\s*\(/i.test(html)
      || /\b(?:src|href|srcset|action|poster)\s*=\s*["']?(?!["']|#|data:image\/(?:png|jpeg|webp);base64,)[^\s>]/i.test(html)
      || /url\(\s*["']?(?!["']|#|data:image\/(?:png|jpeg|webp);base64,)[^\s)]/i.test(html)) errors.push('page.html must be self-contained and use no network');
  }
  for (const path of stored) if (!licensed.has(path)) errors.push(`${path} is stored without a rights record`);
  for (const path of licensed) if (!stored.has(path)) errors.push(`${path} has a rights record but no file`);
  for (const path of referenced) {
    if (!stored.has(path)) errors.push(`${path} is referenced but missing`);
    if (!licensed.has(path)) errors.push(`${path} is referenced without a rights record`);
  }

  const revision = revisionOf(entry, files);
  if (!REVISION_PATTERN.test(entry.revision ?? '')) errors.push('revision must be sha256:<64 hex characters>');
  else if (entry.revision !== revision) errors.push(`revision is stale; computed ${revision}`);
  return { entry, errors, revision };
}
