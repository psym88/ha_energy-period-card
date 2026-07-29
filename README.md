# HA Energy Period Card

A compact Home Assistant dashboard card for selecting the current Energy period: Today, Week, Month, or Year.

![HA Energy Period Card preview](images/preview.svg)

## Features

- Uses Home Assistant's native Energy period
- Synchronizes with other cards using the same Energy data collection
- Honors the first weekday configured in Home Assistant
- Can be displayed without an outer card frame

## HACS installation

1. Open HACS and select **Custom repositories** from the three-dot menu.
2. Add `https://github.com/psym88/ha_energy-period-card` with the **Dashboard** category.
3. Install **HA Energy Period Card**.
4. Reload Home Assistant and clear the browser cache if necessary.

HACS normally registers this resource automatically:

```text
/hacsfiles/ha_energy-period-card/ha_energy-period-card.js
```

If it is missing, add it as a JavaScript module under **Settings → Dashboards → Resources**.

## Configuration

```yaml
type: custom:simple-energy-period-card
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

## Manual installation

Copy `dist/ha_energy-period-card.js` to `/config/www/ha_energy-period-card.js`, then register `/local/ha_energy-period-card.js` as a JavaScript module.

## Development

```bash
npm run build
npm run check
```

Edit `src/ha_energy-period-card.js`, then run the build command to regenerate the HACS bundle in `dist/`.

## Language policy

Repository code, comments, user-facing strings, documentation, examples, release notes, and commit messages must be written in English. See [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
