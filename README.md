# HA Energy Period Card

A compact Home Assistant dashboard card with a dropdown for selecting the Energy period unit: Day, Week, Month, or Year.

![HA Energy Period Card preview](images/preview.svg)

## Features

- Uses Home Assistant's native Energy period
- Synchronizes with other cards using the same Energy data collection
- Uses Home Assistant's locale, time zone, daylight-saving rules, and first weekday
- Uses Home Assistant's neutral localized labels for Day, Week, Month, and Year
- Starts on Today whenever a new card instance initializes
- Uses Home Assistant's existing relative labels for the current, previous, or next period when available
- Falls back to an exact date or date range when Home Assistant has no matching relative label
- Navigates backward or forward by one selected period with date arrows
- Includes a built-in visual configuration form
- Supports keyboard navigation, screen readers, and reduced-motion preferences
- Detects incompatible Home Assistant Energy selector changes and shows an error
- Can be displayed without an outer card frame

## HACS installation

[![Open your Home Assistant instance and open this repository in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=psym88&repository=ha_energy-period-card&category=plugin)

1. Open HACS and select **Custom repositories** from the three-dot menu.
2. Add `https://github.com/psym88/ha_energy-period-card` with the **Dashboard** category.
3. Install **HA Energy Period Card**.
4. Reload Home Assistant and clear the browser cache if necessary.

HACS normally registers this resource automatically:

```text
/hacsfiles/ha_energy-period-card/ha_energy-period-card.js?hacstag=…
```

The HACS-generated `hacstag` value identifies the installed revision and changes after an update to invalidate browser caches. Keep the JavaScript filename stable; HACS manages the version parameter.

If the resource is missing, add `/hacsfiles/ha_energy-period-card/ha_energy-period-card.js` as a JavaScript module under **Settings → Dashboards → Resources**.

## Configuration

> **Breaking change in v1.0.4:** Replace `custom:simple-energy-period-card` with `custom:ha_energy-period-card` in existing dashboards.
>
> **Breaking change in v2.0.0:** The four localized buttons were replaced with one localized dropdown.
>
> **Breaking change in v3.0.0:** A new card instance always sets its shared Energy collection to Today. The dropdown shows neutral period units, and a separate Today button resets the selection.

The card supports Home Assistant's visual card editor. YAML configuration remains available:

```yaml
type: custom:ha_energy-period-card
collection_key: energy_1
title: Period
show_card: true
```

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `collection_key` | Yes | – | Energy data collection key; it must start with `energy_` |
| `title` | No | Empty | Card heading |
| `show_card` | No | `true` | Set to `false` to omit the outer `ha-card` frame |

The `collection_key` must match the associated Energy date selection. A typical value is `energy_1`.

## Theme variables

The card prioritizes Home Assistant's user-configurable theme colors and uses semantic color variables as fallbacks. It also follows Home Assistant's typography, spacing, and radius variables. Themes can override these card-specific variables:

| Variable | Purpose |
| --- | --- |
| `--ha-energy-period-card-select-background` | Dropdown background |
| `--ha-energy-period-card-select-color` | Dropdown text |
| `--ha-energy-period-card-select-radius` | Dropdown corner radius |

Example:

```yaml
card_mod:
  style: |
    ha-card {
      --ha-energy-period-card-select-background: var(--secondary-background-color);
      --ha-energy-period-card-select-radius: 12px;
    }
```

## Compatibility

Home Assistant does not expose a public API for changing the Energy dashboard period. The card therefore uses the internal Energy period selector through a compatibility adapter. The adapter validates the required properties and methods and displays an error when a Home Assistant update introduces an incompatible change.

## Manual installation

Copy `ha_energy-period-card.js` to `/config/www/ha_energy-period-card.js`, then register `/local/ha_energy-period-card.js` as a JavaScript module.

## Development

```bash
npm run check
npm test
```

Edit `ha_energy-period-card.js` directly. The card is intentionally kept as a single dependency-free file and requires no build step.

## Language policy

Repository code, comments, user-facing strings, documentation, examples, release notes, and commit messages must be written in English. See [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
