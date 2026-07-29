# HA Energy Period Card

Eine kompakte Home-Assistant-Dashboard-Karte zur Auswahl des aktuellen Energy-Zeitraums: Heute, Woche, Monat oder Jahr.

![Vorschau der HA Energy Period Card](images/preview.svg)

## Funktionen

- Verwendet Home Assistants nativen Energy-Zeitraum
- Synchronisiert sich mit anderen Karten derselben Energy-Datensammlung
- Berücksichtigt den in Home Assistant eingestellten ersten Wochentag
- Optional ohne äußeren Kartenrahmen

## Installation über HACS

1. Öffne in HACS das Drei-Punkte-Menü und **Benutzerdefinierte Repositories**.
2. Füge `https://github.com/psym88/ha_energy-period-card` als Typ **Dashboard** hinzu.
3. Installiere **HA Energy Period Card**.
4. Lade Home Assistant beziehungsweise den Browser-Cache neu.

HACS registriert normalerweise automatisch die Ressource:

```text
/hacsfiles/ha_energy-period-card/ha_energy-period-card.js
```

Falls nötig, füge sie unter **Einstellungen → Dashboards → Ressourcen** als JavaScript-Modul hinzu.

## Konfiguration

```yaml
type: custom:simple-energy-period-card
collection_key: energy_1
title: Zeitraum
show_card: true
```

| Option | Erforderlich | Standard | Beschreibung |
| --- | --- | --- | --- |
| `collection_key` | Ja | – | Schlüssel der Energy-Datensammlung; muss mit `energy_` beginnen |
| `title` | Nein | leer | Überschrift |
| `show_card` | Nein | `true` | Bei `false` wird kein äußerer `ha-card`-Rahmen dargestellt |

Der `collection_key` muss mit dem Schlüssel der zugehörigen Energy-Date-Selection übereinstimmen. Ein typischer Wert ist `energy_1`.

## Manuelle Installation

Kopiere `dist/ha_energy-period-card.js` nach `/config/www/ha_energy-period-card.js` und registriere `/local/ha_energy-period-card.js` als JavaScript-Modul.

## Entwicklung

```bash
npm run build
npm run check
```

## Lizenz

[MIT](LICENSE)
