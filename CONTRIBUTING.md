# Contributing

## Suggest an idea

Use the [idea form](https://github.com/heyatu/awesome-agent-showcase/issues/new?template=suggest-an-idea.yml) to suggest one result that Hey Atu can make. Link to any public source, or describe your own work. You do not need a finished remake to suggest an idea.

## Provide material for an item

The cover shows the source. The remake shows the result or explains the method. The item page credits the source and says what the visitor can make. Its action opens the prompt as a draft in Hey Atu.

| Material | What to send |
| --- | --- |
| Source | Give the public link and the author's name. For your own unpublished work, attach a copy you can share and tell us how to credit you. |
| Cover | Give the start and end times of a 2–8 s highlight, or identify the source still. Say which idea it shows. |
| Remake | Link or attach a 16:9 recording (6–10 s, at most 2 MB), or a self-contained page with a still (together at most 2 MB). It must work without a network connection. Use no third-party logos or assets. |
| Prompt | Give the prompt. If you ran it in Hey Atu, name the model and describe the result. Mark a successful run `tested`. If you wrote the prompt but did not run it, mark it `proposed`. |
| Words and rights | Give the title, a short description and credit. Submit your own text and media under CC BY 4.0. Link to third-party material; do not offer it under your licence. |

Use the [material form](https://github.com/heyatu/awesome-agent-showcase/issues/new?template=provide-material.yml) if possible. You can also open a pull request for one item. Follow the [entry contract](docs/entry-contract.md) and the checks below. For a correction, missing credit or rights concern, open an issue.

A maintainer checks the material and may ask for changes. The owner checks the storyboard and the preview before we make final media. See [how an item reaches Market](docs/item-workflow.md).

## What a change needs

- Edit one item at a time. An item is the directory `entries/<id>/`. Its fields and files are in [docs/entry-contract.md](docs/entry-contract.md).
- Do not copy third-party text or media into an item without a rights record. Link to the source when you cannot show that you may reuse it. A short excerpt of the media of the source post itself may use the `quoted` basis ([THIRD-PARTY.md](THIRD-PARTY.md#quoted-excerpts)).
- Do not add a tool, model or version tag without a public URL that supports it.
- Mark a prompt `tested` only after a run in Hey Atu produces the stated result. Use `proposed` for a prompt that you wrote and did not run.
- Do not add executable files, scripts, HTML (except the reviewed self-contained `made` page), SVG, exports, logs, credentials or machine paths.
- Do not set `collection`. Maintainers add `editors-pick` to our own Aesthetic Remake entries ([Collection](docs/entry-contract.md#collection)).
- Give an item that has prompts an `action`. Give both files of a `cover` a rights record.
- Update the `revision` of an item after every content or asset change. Run `node scripts/validate.mjs --revision <id>` to see the computed value. Then run `node scripts/readme.mjs`.
- Run `node scripts/validate.mjs`, `node scripts/readme.mjs --check` and `node --test "test/*.test.mjs"` before you open a pull request.

## Review and publication

A suggestion is a request, not an item. A maintainer reviews every suggestion, and we may decline it.

A passing check is not approval. A maintainer reviews every item and every change to an item. A new revision needs a new review. Merging a pull request does not publish an item to Hey Atu Market: a separate, reviewed release does that, and nothing publishes automatically.

You cannot skip review by editing `revision`, a link or any other field. An item has no approval field.

## Licensing

By contributing original text or assets, you agree to release them under the licences in [README.md](README.md#sources-and-rights): MIT for code and CC BY 4.0 for text and assets. Third-party work keeps its own terms.
