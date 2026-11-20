# How an item reaches Market

An idea can come from any public source or from your own work. The entry format now supports `x-post` and `package-docs`. If an item needs another source type, maintainers add it to the format. The same steps then apply.

1. **Choose a result.** Describe one thing that a visitor can make with Hey Atu. Identify the source and the person to credit.
2. **Choose the cover and plan the shots.** Select a 2–8 second highlight from the source video, or use the source still. State the one idea worth sharing. Show the cover and the storyboard to the owner. Wait for approval.
3. **Show the preview.** Put a replayable HTML preview in the item detail layout. Let the owner check the framing, motion and timing. Wait for approval before making the final media.
4. **Make the item.** Prepare the recording or self-contained page, prompt, title, description and credits. Mark a prompt `tested` only after it produces the stated result in Hey Atu. Mark a new prompt that has not run `proposed`.
5. **Add the showcase entry.** A maintainer checks the files and rights records. For an `editors-pick` item, they also confirm that the source is our own public post ([Collection](entry-contract.md#collection)). An independent reviewer checks the exact revision. After approval, the maintainer pushes the entry to the main branch of this repository. This does not publish the item to Market.
6. **Build the site pages.** The site maintainer pins that showcase commit and item revision. They generate the Market pages, get an independent review and land the change.
7. **Check staging.** The site maintainer deploys to staging and checks the item in WebKit at 1440 and 390 pixels. The owner accepts the item on staging or asks for changes.
8. **Release to production.** Only an explicit owner request permits this step. The release maintainer publishes the site, checks the live page and records the release commit.
9. **Update the showcase links.** The showcase maintainer checks the live revisions, writes them and the site release commit to `deployments.json`, rebuilds the README and pushes the update.

See [Contributing](../CONTRIBUTING.md) to suggest an idea or provide material.
