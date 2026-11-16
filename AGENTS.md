# Repository instructions

- Use English for all source code, identifiers, comments, user-facing strings, error messages, documentation, examples, release notes, and commit messages.
- Keep `README.md` entirely in English.
- Never introduce German text into code or documentation.
- Keep the card dependency-free and edit `ha_energy-period-card.js` directly; do not add a build step unless the project requirements materially change.
- Run `npm run check` before committing.

## Where this card lives

- The repository is developed on `https://git.itup.ch/mme/ha_energy-period-card`. `https://github.com/psym88/ha_energy-period-card` is the published copy HACS reads.
- Publishing is a release on Forgejo: `.forgejo/workflows/sync-github.yml` then pushes the branch, every tag, the release and the card file as that release's asset to GitHub. A manual run of the same workflow without a tag only syncs branch and tags.
- Never commit to the GitHub repository, and never move or delete a tag or a release asset that is already on GitHub: HACS installs from them, and the download count hangs off the asset, so replacing it starts that count at zero.
- Keep the version in `package.json` and the release tag in step with each other, and keep `filename` in `hacs.json` pointing at the file that is the release asset.
