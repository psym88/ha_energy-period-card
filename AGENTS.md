# Repository instructions

- Use English for all source code, identifiers, comments, user-facing strings, error messages, documentation, examples, release notes, and commit messages.
- Keep `README.md` entirely in English.
- Never introduce German text into code or documentation.
- Keep the card dependency-free and edit `ha_energy-period-card.js` directly; do not add a build step unless the project requirements materially change.
- Run `npm run check` before committing.

## Style

- The control is a flat row: period dropdown on the left, date in the middle, arrow buttons on the right. The row itself carries no frame of its own, and each control is styled the way Home Assistant styles it.
- Take every colour, spacing, radius and font size from Home Assistant theme variables, with a literal fallback only where Home Assistant has no variable. Hard-coded colours make the card unthemeable.
- Prefer the current design tokens and fall back to the long-standing ones, so a card still looks right on an older Home Assistant: `--ha-button-height` before `--ha-space-*`, `--ha-button-border-radius` and `--ha-border-radius-*` before a fixed radius, `--ha-color-fill-neutral-*-resting` and `-hover` before `--secondary-background-color` and `--divider-color`, `--ha-color-border-neutral-*` before `--divider-color`, `--ha-color-focus` before `--primary-color`, `--ha-animation-duration-fast` for hover timing, `--ha-font-size-*` and `--ha-font-weight-*` for type. Home Assistant's own hover changes a colour in 150ms, so let it, and drop the transition under `prefers-reduced-motion`.
- Size the controls of a row from one variable so they share a height, and let it default to Home Assistant's own control height rather than a number.
- For a dropdown inside a dashboard card, copy `ha-control-select-menu`, the control Home Assistant puts in tile features: a borderless surface tinted with `--disabled-color` at 20% opacity, a hover tint of `--ha-color-on-neutral-quiet`, `--feature-border-radius` for the radius, `--feature-height` for the height and a focus ring as `box-shadow: 0 0 0 2px` in `--feature-color`. An outlined input with a border belongs to configuration forms, not to a dashboard row, and looks wrong there.
- Expose what a themer would want to change as `--ha-energy-period-card-*` variables on `:host` and keep the README table in step with them.

## Where this card lives

- The repository is developed on `https://git.itup.ch/mme/ha_energy-period-card`. `https://github.com/psym88/ha_energy-period-card` is the published copy HACS reads.
- Publishing is a release on Forgejo: `.forgejo/workflows/sync-github.yml` then pushes the branch, every tag, the release and the card file as that release's asset to GitHub. A manual run of the same workflow without a tag only syncs branch and tags.
- GitHub gets only the file Home Assistant installs and the page a visitor reads: the branch and every new tag are published from the include list `PUBLISH_INCLUDE` in the workflow, `hacs.json README.md LICENSE images`, plus the file `hacs.json` names. A new file here is not on GitHub until it is named on that list, and `AGENTS.md`, `scripts/`, `tests/` and the package manager files are not. The branch tip on GitHub is a commit of its own with the commit here as its parent, so its sha is not the sha here, and that is the design rather than a mistake. Older tags keep whatever they were published with: they never move.
- Never commit to the GitHub repository, and never move or delete a tag or a release asset that is already on GitHub: HACS installs from them, and the download count hangs off the asset, so replacing it starts that count at zero.
- Keep the version in `package.json` and the release tag in step with each other, and keep `filename` in `hacs.json` pointing at the file that is the release asset.
