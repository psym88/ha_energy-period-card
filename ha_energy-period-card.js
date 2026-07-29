// HA Energy Period Card

const CARD_VERSION = "1.1.2";
const NATIVE_SELECTOR_TAG = "hui-energy-period-selector";
const NATIVE_SELECTOR_TIMEOUT_MS = 10000;
const SYNC_DELAY_MS = 80;
const SYNC_INTERVAL_MS = 1000;
const CLICK_GUARD_MS = 1000;

const PERIODS = Object.freeze(["today", "week", "month", "year"]);
const PERIOD_PRESET_KEYS = Object.freeze({
  today: "today",
  week: "this_week",
  month: "this_month",
  year: "this_year",
});
const PERIOD_FALLBACK_LABELS = Object.freeze({
  today: "Today",
  week: "Week",
  month: "Month",
  year: "Year",
});

function assertConfig(config) {
  if (
    !config ||
    typeof config.collection_key !== "string" ||
    !config.collection_key.startsWith("energy_")
  ) {
    throw new Error("collection_key is required and must start with energy_");
  }
  if (config.title !== undefined && typeof config.title !== "string") {
    throw new Error("title must be a string");
  }
  if (config.show_card !== undefined && typeof config.show_card !== "boolean") {
    throw new Error("show_card must be a boolean");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sameCalendarDay(first, second) {
  return (
    first instanceof Date &&
    second instanceof Date &&
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

class EnergyPeriodAdapter {
  constructor(host) {
    this._host = host;
    this._selector = undefined;
    this._initializationPromise = undefined;
  }

  get selector() {
    return this._selector;
  }

  async ensure(hass, collectionKey) {
    if (this._selector) {
      this.sync(hass, collectionKey);
      return this._selector;
    }
    if (!this._initializationPromise) {
      this._initializationPromise = this._create(hass, collectionKey).catch(
        (error) => {
          this._initializationPromise = undefined;
          throw error;
        }
      );
    }
    return this._initializationPromise;
  }

  async _create(hass, collectionKey) {
    if (typeof window.loadCardHelpers !== "function") {
      throw new Error("Home Assistant card helpers are unavailable");
    }

    const helpers = await window.loadCardHelpers();
    helpers.createCardElement({
      type: "energy-date-selection",
      collection_key: collectionKey,
    });

    await withTimeout(
      customElements.whenDefined(NATIVE_SELECTOR_TAG),
      NATIVE_SELECTOR_TIMEOUT_MS,
      "The Home Assistant Energy period selector did not load"
    );

    const selector = document.createElement(NATIVE_SELECTOR_TAG);
    selector.style.display = "none";
    selector.setAttribute("aria-hidden", "true");
    selector.hass = hass;
    selector.collectionKey = collectionKey;
    this._host.shadowRoot.appendChild(selector);

    try {
      await selector.updateComplete;
      this._assertCompatible(selector);
    } catch (error) {
      selector.remove();
      throw error;
    }
    this._selector = selector;
    return selector;
  }

  _assertCompatible(selector = this._selector) {
    if (
      !selector ||
      typeof selector._updateCollectionPeriod !== "function" ||
      !("_startDate" in selector) ||
      !("_endDate" in selector)
    ) {
      throw new Error(
        "This Home Assistant version exposes an incompatible Energy period selector"
      );
    }
  }

  sync(hass, collectionKey) {
    if (!this._selector) return;
    this._selector.hass = hass;
    this._selector.collectionKey = collectionKey;
  }

  async updateComplete() {
    if (this._selector?.updateComplete) {
      await this._selector.updateComplete;
    }
  }

  getCurrentRange() {
    this._assertCompatible();
    return {
      start: this._selector._startDate,
      end: this._selector._endDate,
    };
  }

  async getPresetRange(period, hass) {
    const presetKey = PERIOD_PRESET_KEYS[period];
    if (!presetKey) return undefined;

    await this.updateComplete();
    const label = hass.localize(
      `ui.components.date-range-picker.ranges.${presetKey}`
    );
    const range = label ? this._selector?._ranges?.[label] : undefined;

    if (
      !Array.isArray(range) ||
      !(range[0] instanceof Date) ||
      !(range[1] instanceof Date)
    ) {
      return undefined;
    }
    return { start: new Date(range[0]), end: new Date(range[1]) };
  }

  async setPeriod(period, hass, collectionKey) {
    this._assertCompatible();
    const range = await this.getPresetRange(period, hass);
    if (!range) {
      throw new Error(`Home Assistant did not provide the ${period} range`);
    }

    try {
      localStorage.setItem(
        `energy-default-period-_${collectionKey}`,
        PERIOD_PRESET_KEYS[period]
      );
    } catch (error) {
      console.warn(
        "[ha_energy-period-card] Could not save the default period",
        error
      );
    }

    this._selector._startDate = range.start;
    this._selector._endDate = range.end;
    this._selector._updateCollectionPeriod();
    return range;
  }
}

class HaEnergyPeriodCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._adapter = new EnergyPeriodAdapter(this);
    this._active = undefined;
    this._syncTimer = undefined;
    this._syncInterval = undefined;
    this._justClickedUntil = 0;
    this._rendered = false;
    this._busy = false;
    this._error = undefined;
    this._language = undefined;
    this._initializationId = 0;
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: "collection_key",
          required: true,
          selector: { text: {} },
        },
        {
          name: "title",
          selector: { text: {} },
        },
        {
          name: "show_card",
          selector: { boolean: {} },
        },
      ],
      computeLabel: (schema, localize) => {
        if (schema.name === "title") {
          return (
            localize("ui.panel.lovelace.editor.card.generic.title") || "Title"
          );
        }
        if (schema.name === "show_card") return "Show card background";
        if (schema.name === "collection_key") return "Energy collection key";
        return undefined;
      },
      computeHelper: (schema) =>
        schema.name === "collection_key"
          ? "Use the same energy_* key as the related Energy cards."
          : undefined,
      assertConfig,
    };
  }

  static getStubConfig() {
    return {
      collection_key: "energy_1",
      title: "",
      show_card: true,
    };
  }

  setConfig(config) {
    assertConfig(config);
    const collectionChanged =
      this._config.collection_key !== config.collection_key;
    this._config = { title: "", show_card: true, ...config };
    this._error = undefined;
    if (collectionChanged) this._active = undefined;
    this._render();
    this._initialize();
  }

  set hass(hass) {
    const language = hass?.locale?.language || hass?.language || "en";
    const languageChanged = language !== this._language;
    this._hass = hass;
    this._language = language;
    this._adapter.sync(hass, this._config.collection_key);
    if (languageChanged && this._rendered) this._render();
    if (!this._adapter.selector) this._initialize();
    this._scheduleSync();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._initialize();
    this._scheduleSync();
    if (!this._syncInterval) {
      this._syncInterval = window.setInterval(() => {
        if (!document.hidden) this._syncFromNative();
      }, SYNC_INTERVAL_MS);
    }
  }

  disconnectedCallback() {
    window.clearTimeout(this._syncTimer);
    this._syncTimer = undefined;
    window.clearInterval(this._syncInterval);
    this._syncInterval = undefined;
    this._initializationId += 1;
  }

  getCardSize() {
    return this._config.title ? 2 : 1;
  }

  getGridOptions() {
    return {
      columns: 12,
      min_columns: 4,
      rows: "auto",
    };
  }

  async _initialize() {
    if (!this.isConnected || !this._hass || !this._config.collection_key) return;
    const initializationId = ++this._initializationId;
    this._setBusy(true);

    try {
      await this._adapter.ensure(this._hass, this._config.collection_key);
      if (initializationId !== this._initializationId) return;
      this._clearError();
      await this._syncFromNative();
    } catch (error) {
      if (initializationId !== this._initializationId) return;
      this._setError(error);
    } finally {
      if (initializationId === this._initializationId) this._setBusy(false);
    }
  }

  _scheduleSync() {
    window.clearTimeout(this._syncTimer);
    this._syncTimer = window.setTimeout(
      () => this._syncFromNative(),
      SYNC_DELAY_MS
    );
  }

  async _syncFromNative() {
    if (!this._adapter.selector || Date.now() < this._justClickedUntil) return;

    try {
      await this._adapter.updateComplete();
      const { start, end } = this._adapter.getCurrentRange();
      if (!start || !end) return;

      const detected = await this._detectPeriod(start, end);
      if (detected !== this._active) {
        this._active = detected;
        this._updateButtons();
      }
    } catch (error) {
      this._setError(error);
    }
  }

  async _setPeriod(period) {
    if (!PERIODS.includes(period) || this._busy) return;
    this._justClickedUntil = Date.now() + CLICK_GUARD_MS;
    this._setBusy(true);

    try {
      await this._adapter.ensure(this._hass, this._config.collection_key);
      await this._adapter.setPeriod(
        period,
        this._hass,
        this._config.collection_key
      );
      this._clearError();
      this._active = period;
      this._updateButtons();
    } catch (error) {
      this._setError(error);
    } finally {
      this._setBusy(false);
      this._scheduleSync();
    }
  }

  async _detectPeriod(start, end) {
    for (const period of PERIODS) {
      const range = await this._adapter.getPresetRange(period, this._hass);
      if (
        range &&
        sameCalendarDay(start, range.start) &&
        sameCalendarDay(end, range.end)
      ) {
        return period;
      }
    }
    return undefined;
  }

  _localizePeriod(period) {
    const presetKey = PERIOD_PRESET_KEYS[period];
    const translated = this._hass?.localize?.(
      `ui.components.date-range-picker.ranges.${presetKey}`
    );
    return translated || PERIOD_FALLBACK_LABELS[period] || period;
  }

  _setBusy(busy) {
    if (busy === this._busy) return;
    this._busy = busy;
    this._updateButtons();
  }

  _setError(error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ha_energy-period-card]", error);
    this._error = message;
    this._render();
  }

  _clearError() {
    if (!this._error) return;
    this._error = undefined;
    this._render();
  }

  _updateButtons() {
    if (!this._rendered) return;
    this.shadowRoot.querySelectorAll("button[data-period]").forEach((button) => {
      const active = button.dataset.period === this._active;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = this._busy || !this._hass;
    });
  }

  _render() {
    const tag = this._config.show_card ? "ha-card" : "div";
    const labels = Object.fromEntries(
      PERIODS.map((period) => [period, this._localizePeriod(period)])
    );

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          container-type: inline-size;
          --ha-energy-period-card-active-background:
            var(--primary-color, var(--ha-color-primary-40));
          --ha-energy-period-card-active-color:
            var(--text-primary-color, var(--ha-color-on-primary-loud, #fff));
          --ha-energy-period-card-button-background:
            var(--secondary-background-color, var(--ha-color-surface-low));
          --ha-energy-period-card-button-background-hover:
            var(--divider-color, var(--ha-color-surface-lower, var(--ha-color-primary-95)));
          --ha-energy-period-card-button-color: var(--primary-text-color);
          --ha-energy-period-card-button-radius:
            var(--ha-button-border-radius, 999px);
        }
        ha-card,
        .wrapper {
          box-sizing: border-box;
          padding: var(--ha-space-3, 12px);
        }
        .title {
          margin-bottom: var(--ha-space-2, 8px);
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-l, 16px);
          font-weight: var(--ha-font-weight-medium, 500);
          line-height: var(--ha-line-height-condensed, 1.3);
        }
        .buttons {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--ha-space-2, 8px);
        }
        button {
          appearance: none;
          min-width: 0;
          border: 0;
          border-radius: var(--ha-energy-period-card-button-radius);
          padding: var(--ha-space-2, 8px) var(--ha-space-3, 12px);
          overflow: hidden;
          color: var(--ha-energy-period-card-button-color);
          background: var(--ha-energy-period-card-button-background);
          font: inherit;
          font-size: var(--ha-font-size-m, 14px);
          line-height: var(--ha-line-height-normal, 1.4);
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: pointer;
          transition:
            background var(--ha-animation-duration-fast, 150ms) ease,
            color var(--ha-animation-duration-fast, 150ms) ease,
            transform var(--ha-animation-duration-fast, 150ms) ease;
        }
        button:hover:not(:disabled) {
          background: var(--ha-energy-period-card-button-background-hover);
        }
        button:active:not(:disabled) {
          transform: scale(.97);
        }
        button:focus-visible {
          outline: 2px solid var(--primary-color, var(--ha-color-primary-50));
          outline-offset: 2px;
        }
        button.active {
          color: var(--ha-energy-period-card-active-color);
          background: var(--ha-energy-period-card-active-background);
        }
        button:disabled {
          cursor: wait;
          opacity: var(--disabled-opacity, .55);
        }
        .error {
          margin-top: var(--ha-space-2, 8px);
          color: var(--error-color);
          font-size: var(--ha-font-size-s, 12px);
          line-height: var(--ha-line-height-normal, 1.4);
        }
        @container (max-width: 360px) {
          .buttons {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @container (max-width: 190px) {
          .buttons {
            grid-template-columns: 1fr;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          button {
            transition: none;
          }
        }
      </style>
      <${tag} class="wrapper">
        ${
          this._config.title
            ? `<div class="title">${escapeHtml(this._config.title)}</div>`
            : ""
        }
        <div
          class="buttons"
          role="group"
          aria-label="${escapeHtml(
            PERIODS.map((period) => labels[period]).join(", ")
          )}"
        >
          ${PERIODS.map(
            (period) => `
              <button
                type="button"
                data-period="${period}"
                aria-pressed="${String(period === this._active)}"
                title="${escapeHtml(labels[period])}"
                ${this._busy || !this._hass ? "disabled" : ""}
              >${escapeHtml(labels[period])}</button>`
          ).join("")}
        </div>
        ${
          this._error
            ? `<div class="error" role="alert">${escapeHtml(this._error)}</div>`
            : ""
        }
      </${tag}>`;

    if (this._adapter.selector) {
      this.shadowRoot.appendChild(this._adapter.selector);
    }

    this.shadowRoot.querySelectorAll("button[data-period]").forEach((button) => {
      button.addEventListener("click", () =>
        this._setPeriod(button.dataset.period)
      );
    });

    this._rendered = true;
    this._updateButtons();
  }
}

if (!customElements.get("ha_energy-period-card")) {
  customElements.define("ha_energy-period-card", HaEnergyPeriodCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "ha_energy-period-card")) {
  window.customCards.push({
    type: "ha_energy-period-card",
    name: "HA Energy Period Card",
    description:
      "Localized buttons for selecting the current Home Assistant Energy period.",
  });
}

console.info(
  `%c HA_ENERGY-PERIOD-CARD %c v${CARD_VERSION} `,
  "color: white; background: #03a9f4; font-weight: 600; padding: 2px 6px; border-radius: 3px 0 0 3px;",
  "color: #03a9f4; background: white; font-weight: 600; padding: 2px 6px; border-radius: 0 3px 3px 0; border: 1px solid #03a9f4;"
);
