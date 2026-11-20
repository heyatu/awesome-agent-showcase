# Entry contract

One item is one directory. Hey Atu Market and this repository both read the same files.

```text
entries/<id>/
├── entry.json    fields below
├── body.md       item-specific body, Markdown, rules below
├── page.html     optional interactive remake
└── media/        stored assets, one level: media/<name>.<ext>
```

Nothing else is allowed in the directory. Symbolic links are rejected. Allowed extensions: `png`, `jpg`, `jpeg`, `webp`, `gif`, `mp4`, `webm`. Do not store other HTML, scripts or SVG files.

## Body

`body.md` is Markdown for this item. It has no fixed layout. These rules keep it free of executable content:

- No raw HTML. Any `<` that starts a tag, comment or declaration fails. Use `[text](https://...)` for links.
- Only inline links and images are allowed: `[text](target)` and `![alt](target)`. A reference-style definition (a line with `]:`) fails.
- A link or image target is one of: a public `https` URL, an `#anchor`, or `media/<name>`. Anything else fails, for example `http:`, `data:`, `javascript:` and relative paths.
- A target has no character reference (such as `&#x73;`) and no backslash.
- A `media/<name>` target must be a stored file with a rights record.

## ID and link

- The ID has 1 to 32 lowercase letters, digits and hyphens. It matches the directory name.
- An `x-post` item uses `x-<post id>`. A `package-docs` item uses `tool-<stable name>`. The ID never comes from a title.
- The public link is `https://heyatu.com/market/<id>`, with no trailing slash.
- GitHub campaign labels: `utm_source=github`, `utm_medium=readme`, `utm_campaign=market-hero|market-grid|market-category`. The item is in the route.

## Fields of `entry.json`

| Field | Rule |
| --- | --- |
| `id` | As above |
| `title` | Text, at most 120 characters |
| `summary` | Text, at most 280 characters |
| `brief` | Optional. One line of 40 to 400 characters. See below |
| `purposes` | One or more ids from `tags/purposes.json` |
| `source` | See below |
| `rights` | `{ "assets": [...] }`, one record for each stored file |
| `media` | `[{ "path", "alt" }]`, files used by the item |
| `prompts` | Optional, `[{ "choice", "status", "text", "label"?, "testedOn"? }]` |
| `action` | `{ "label", "prompt" }`. Required when `prompts` is not empty; not allowed without prompts. See below |
| `cover` | Optional, `{ "motion", "still" }`. See below |
| `collection` | Optional. `editors-pick` for our own featured items. See below |
| `made` | Optional, up to 3 of `[{ "path", "kind", "alt", "caption", "creditUrl"?, "still"? }]`: result media for the item. See below |
| `requirements` | List of text, may be empty |
| `tags` | Optional, `[{ "kind": "tool" or "model", "name", "version"?, "evidence" }]`. Evidence is a public https URL |
| `revision` | `sha256:<64 hex characters>` |

No other field is allowed. An approval or sign-off field does not exist. A field in `entry.json` is never proof that an item may be published: review and sign-off records stay private.

### Source

The format supports `x-post` and `package-docs`. If an item needs another source type, maintainers add it to the format before publication.

- `x-post`: `type`, `url` (`https://x.com/<handle>/status/<id>`), `author`, `credit`, `publishedAt`, `capturedAt`. Optional `video`: the MP4 file of the post video, `https://video.twimg.com/<path>.mp4` with at most a `?tag=<number>` query. The page plays it from X when the reader presses play, so choose a variant of at most 720p. No other host is allowed.
- `package-docs`: `type`, `url`, `package`, `credit`, `capturedAt`.

Dates are `YYYY-MM-DD`. The credit is shown publicly. Two items cannot share a source: an `x-post` source key is `x:<post id>`, a `package-docs` key is `docs:<host><path>`.

### Rights

One record for each stored file. A stored file without a record fails. A record without a file fails.

| `basis` | Other fields |
| --- | --- |
| `original` | none; covered by `LICENSE-CONTENT` |
| `licensed` | `holder`, `licence`, `licenceUrl` |
| `permission` | `holder`, `grantedOn` |
| `quoted` | `holder`, `sourceUrl`, `excerpt` |

A `quoted` record identifies a short excerpt from the item's source post or its author’s artwork shown in a recreation, shown with credit and a link. These rules apply, and each failure rejects the entry:

- Only an `x-post` item may use it.
- `holder` is the handle in `source.author`, without `@`.
- `sourceUrl` equals `source.url`.
- `excerpt` is text of at most 200 characters that says which part is quoted, for example `0:16-0:20 of the post video`.
- The file is a `gif`, `webp` or `mp4`, at most 8 seconds and at most 2 MB. The validator reads the length from the file: the frame delays of a GIF or an animated WebP, and the movie header of an MP4. A file whose length cannot be read fails. A still image has no length and passes.
- A cover that uses a quoted file shows "via @handle" (the README block, Market cards and wall tiles). A quoted file stays the author's work: [THIRD-PARTY.md](../THIRD-PARTY.md#quoted-excerpts) says how to ask for its removal.

### Brief

`brief` is a short request that a visitor can paste into any coding agent. The README shows it for each item. It is one line of text. The README shows it only inside a fenced code block, so Markdown in it does not render. The validator rejects any control character, U+2028 or U+2029, `<`, a backtick, `//` and `www.`. A maintainer reviews the rest.

A brief is our original text. It is not one of `prompts`, has no `status` and never claims to be tested. It says the result and the two or three details that make it work, in fewer words than the tested prompt. It does not copy the tested prompt or the words of the source post.

### Prompts

`choice` is a stable ID such as `paper-garden`. It is unique in the item. `status` is separate: `original` (the source's own text), `proposed` (written by us, not run) or `tested` (run, needs `testedOn`). The prompt that `action.prompt` names is the one that Hey Atu puts in a new chat. A prompt that makes files says where: it names a new folder inside the current project folder, for example "Build it in a new folder inside the current project folder". Without that, Atu may pick a folder such as `~/Documents` (owner decision 2026-11-17).

### Action

`action` is the main button of the item page: `label` is text of at most 40 characters (for example `Make a sticker in Atu`). `prompt` is the `choice` of one entry of `prompts`. Hey Atu opens a new chat with that prompt as a draft; it never sends it. The README shows `brief`. The README and the item page never show `prompts` text.

### Made

`made` lists result media for the item. Market opens the interactive page if present, else the first recording, from the **In Atu** panel. If the list is absent or empty, the panel does not appear. Each file must have a `kind`:

| `kind` | What the file shows | Panel label |
| --- | --- | --- |
| `atu` | A recording of the result that Hey Atu built from the tested prompt | Made with Hey Atu |
| `recreation` | A recording of a Hey Atu recreation that shows the source author’s artwork | Recreated with Hey Atu |
| `mockup` | Our own drawing of a result in a product that Hey Atu does not run | Mockup |
| `explainer` | A short animation that explains a method. It does not show a run | Explainer |

| `page` | An original interactive remake | Interactive preview |

A page has `path: "page.html"` and a `still` (a static `media/<name>` PNG, JPEG or WebP of the remake). Give **both** files an `original` rights record. Together they must be at most 2 MiB. Keep at most one page per entry. Put all CSS, script and drawing data in this one HTML document. No network, external files, navigation, forms, nested frames, storage, third-party art, logos or copy. Review all code and embedded assets before publication; a static check cannot prove these properties. The host must enforce a no-network CSP and a sandbox with scripts only, even for direct visits.

For a recording, `path` is `media/<name>` as `png`, `jpg`, `jpeg`, `webp`, `gif` or `mp4`, at most 2 MB. A `recreation` needs a `quoted` record. Its caption credits the artwork and links to the original through `creditUrl` (public HTTPS). The quoted limits apply. All other kinds need an `original` record and do not take `creditUrl`. `alt` is at most 300 characters. `caption` is at most 160 characters and says what the file shows.

For a new remake, use a 16:9 animated WebP or MP4 with a 6–10 s loop and the Hey Atu logo in the frame. Do not show the prompt or copy the logos, screens or text of another product. Use pixel art only for a post that uses pixel art.

### Collection

`collection` marks an item that the Hey Atu team made and features. The only value is `editors-pick`, for the Aesthetic Remake series: a short episode of ours that rebuilds a project we liked with one prompt.

Only maintainers add `collection: "editors-pick"`, and only to an Aesthetic Remake entry. Before adding it, confirm that the source is our own public post. The validator checks the value and that every stored file has rights basis `original`; it does not check who owns the post.

An `editors-pick` item follows every other rule of this contract. The README lists it in an **Editor's Picks** section above the purpose groups and marks its card "★ Editor's Pick" there and in its purpose group.

### Cover

`cover` is the picture that a card or a wall tile shows: `motion` is `media/<name>` as `gif`, `webp` or `mp4`; `still` is `media/<name>` as `png`, `jpg`, `jpeg` or `webp`. A reader who asks for less motion sees the still. The two files are different. Each file needs a rights record, a stored file and the same checks as other media. The README block shows `motion` when it is a `gif` or `webp`, with `still` for a reader who asks for less motion. For an `mp4`, it shows `still`.

## Revision

The revision binds the public content and the asset bytes. It is the only revision identity: a short display label is not a second approval.

1. Take `entry.json` without its `revision` field. Write it as canonical JSON: object keys sorted by UTF-16 code unit, no white space, `JSON.stringify` for strings and numbers.
2. For `entry.json` (this canonical text), `body.md`, `page.html` if present, and every file in `media/`, make the line `<sha256 hex of the bytes>  <name>\n`.
3. Sort the lines by name. Join them. The revision is `sha256:` and the SHA-256 hex of that text.

`node scripts/validate.mjs --revision <id>` prints the computed value. Validation fails when `revision` differs from it.

## Deployment record

`deployments.json` holds records of released items. It does not exist until the first release. A record has exactly:

```json
{ "id": "...", "revision": "sha256:...", "url": "https://heyatu.com/market/<id>", "release": "<verified release reference>" }
```

- `release` is a reference such as a commit SHA. It is not a path.
- A record names an existing item. There is one record for each item.
- A README link exists only for an item with a record. The link stays when a new draft revision differs from the released one, until a new record replaces it.
- Nothing in this repository publishes or verifies a release. A person writes the record after the release check.

## Checks

`node scripts/validate.mjs` runs the rules above, checks deployment records and scans the tree for credentials, machine paths, session data and private exports. `--history` scans all commits. `node scripts/readme.mjs --check` fails when the generated README block is stale.
