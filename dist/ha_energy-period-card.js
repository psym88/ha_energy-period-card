/**
 * HA Energy Period Card
 * https://github.com/psym88/ha_energy-period-card
 * Generated from src/ha_energy-period-card.js. Do not edit directly.
 */

// HA Energy Period Card
class HaEnergyPeriodCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._periodSelector = undefined;
    this._active = undefined;
    this._syncTimer = undefined;
    this._justClickedUntil = 0;
    this._rendered = false;
  }

  setConfig(config) {
    if (!config.collection_key?.startsWith("energy_")) {
      throw new Error("collection_key is required and must start with energy_");
    }
    this._config = { title: "", show_card: true, ...config };
    this._render();
    this._ensureNativeSelector();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._periodSelector) {
      this._periodSelector.hass = hass;
      this._periodSelector.collectionKey = this._config.collection_key;
      this._schedulSync();
    }
  }

  connectedCallback() { this._schedulSync(); }

  disconnectedCallback() {
    clearTimeout(this._syncTimer);
    this._syncTimer = undefined;
  }

  getCardSize() { return 1; }

  // --- Native selector ---

  async _ensureNativeSelector() {
    if (this._periodSelector) return;

    if (window.loadCardHelpers) {
      const helpers = await window.loadCardHelpers();
      helpers.createCardElement({
        type: "energy-date-selection",
        collection_key: this._config.collection_key,
      });
    }

    await customElements.whenDefined("hui-energy-period-selector");

    const el = document.createElement("hui-energy-period-selector");
    el.collectionKey = this._config.collection_key;
    el.style.display = "none";
    if (this._hass) el.hass = this._hass;

    this._periodSelector = el;
    this.shadowRoot.appendChild(el);
    this._schedulSync();
  }

  // --- Synchronization ---

  _schedulSync() {
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => this._syncFromNative(), 80);
  }

  async _syncFromNative() {
    if (!this._periodSelector || Date.now() < this._justClickedUntil) return;
    await this._periodSelector.updateComplete;

    const { _startDate: start, _endDate: end } = this._periodSelector;
    if (!start || !end) return;

    const detected = this._detectPeriod(start, end);
    if (detected && detected !== this._active) {
      this._active = detected;
      this._updateActiveButton();
    }
  }

  // --- Set period ---

  async _setPeriod(period) {
    this._justClickedUntil = Date.now() + 1000;
    await this._ensureNativeSelector();

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let start, end;

    switch (period) {
      case "today":
        start = this._startOfDay(now);
        end = this._endOfDay(now);
        break;
      case "week":
        start = this._startOfWeek(now);
        end = this._startOfWeek(now);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case "month":
        start = new Date(y, m, 1);
        end = new Date(y, m + 1, 0, 23, 59, 59, 999);
        break;
      case "year":
        start = new Date(y, 0, 1);
        end = new Date(y, 11, 31, 23, 59, 59, 999);
        break;
    }

    this._active = period;
    this._updateActiveButton();

    const key = { today: "today", week: "this_week", month: "this_month", year: "this_year" }[period];
    localStorage.setItem(`energy-default-period-_${this._config.collection_key}`, key);

    this._periodSelector._startDate = start;
    this._periodSelector._endDate = end;
    this._periodSelector._updateCollectionPeriod();
  }

  // --- Detect period ---

  _detectPeriod(start, end) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const eq = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    const ranges = {
      today: [this._startOfDay(now), this._endOfDay(now)],
      week:  [this._startOfWeek(now), (() => { const d = this._startOfWeek(now); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d; })()],
      month: [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59, 999)],
      year:  [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59, 999)],
    };

    for (const [key, [s, e]] of Object.entries(ranges)) {
      if (eq(start, s) && eq(end, e)) return key;
    }
    return undefined;
  }

  // --- Date helpers ---

  _startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  _endOfDay(d)   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

  _firstWeekday() {
    const fw = this._hass?.locale?.first_weekday;
    if (typeof fw === "number") return fw;
    return { sunday: 0, monday: 1, saturday: 6 }[fw] ?? 1;
  }

  _startOfWeek(date) {
    const d = this._startOfDay(date);
    d.setDate(d.getDate() - ((d.getDay() - this._firstWeekday() + 7) % 7));
    return d;
  }

  // --- Rendering ---

  _updateActiveButton() {
    if (!this._rendered) return;
    this.shadowRoot.querySelectorAll("button[data-period]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.period === this._active);
    });
  }

  _render() {
    const tag = this._config.show_card ? "ha-card" : "div";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block }
        ha-card, .wrapper { padding: 12px; box-sizing: border-box }
        .title { font-size: 16px; font-weight: 500; margin-bottom: 10px; color: var(--primary-text-color) }
        .buttons { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px }
        button {
          border: 0; border-radius: 999px; padding: 10px 12px; cursor: pointer; font: inherit;
          background: var(--secondary-background-color); color: var(--primary-text-color);
          transition: background .15s, color .15s, transform .05s;
        }
        button:hover { background: var(--divider-color) }
        button:active { transform: scale(.97) }
        button.active { background: var(--primary-color); color: var(--text-primary-color, #fff) }
      </style>
      <${tag} class="wrapper">
        ${this._config.title ? `<div class="title">${this._config.title}</div>` : ""}
        <div class="buttons">
          <button data-period="today">Today</button>
          <button data-period="week">Week</button>
          <button data-period="month">Month</button>
          <button data-period="year">Year</button>
        </div>
      </${tag}>`;

    this.shadowRoot.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => this._setPeriod(btn.dataset.period));
    });

    this._rendered = true;
    this._updateActiveButton();
  }
}

if (!customElements.get("ha_energy-period-card")) {
  customElements.define("ha_energy-period-card", HaEnergyPeriodCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha_energy-period-card",
  name: "Simple Energy Period Card",
  description: "Buttons for Today, Week, Month, and Year for an Energy collection_key",
});

console.info(
  "%c HA_ENERGY-PERIOD-CARD %c v1.0.4 ",
  "color: white; background: #03a9f4; font-weight: 600; padding: 2px 6px; border-radius: 3px 0 0 3px;",
  "color: #03a9f4; background: white; font-weight: 600; padding: 2px 6px; border-radius: 0 3px 3px 0; border: 1px solid #03a9f4;"
);
