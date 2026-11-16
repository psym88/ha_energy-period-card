// HA Energy Period Card

const CARD_VERSION = "1.2.0-rc.5";
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
const PERIOD_LABEL_KEYS = Object.freeze({
  today: "day",
  week: "week",
  month: "month",
  year: "year",
});
const PERIOD_LABELS = Object.freeze({
  today: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
});
const RELATIVE_PERIOD_KEYS = Object.freeze({
  today: Object.freeze({
    "-1": "ui.components.selectors.period.periods.yesterday",
    0: "ui.components.selectors.period.periods.today",
    1: "ui.components.selectors.period.periods.tomorrow",
  }),
  week: Object.freeze({
    "-1": "ui.components.selectors.period.periods.last_week",
    0: "ui.components.selectors.period.periods.this_week",
    1: "ui.components.selectors.period.periods.next_week",
  }),
  month: Object.freeze({
    "-1": "ui.components.selectors.period.periods.last_month",
    0: "ui.components.selectors.period.periods.this_month",
    1: "ui.components.selectors.period.periods.next_month",
  }),
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
      typeof selector._pickPrevious !== "function" ||
      typeof selector._pickNext !== "function" ||
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

  async shift(forward) {
    this._assertCompatible();
    if (forward) {
      this._selector._pickNext();
    } else {
      this._selector._pickPrevious();
    }
    await this.updateComplete();
    return this.getCurrentRange();
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
    this._offset = 0;
    this._rangeStart = undefined;
    this._rangeEnd = undefined;
    this._initialPeriodApplied = false;
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
    if (collectionChanged) {
      this._active = undefined;
      this._offset = 0;
      this._initialPeriodApplied = false;
    }
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
    this._releaseMenu();
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
      if (!this._initialPeriodApplied) {
        const range = await this._adapter.setPeriod(
          "today",
          this._hass,
          this._config.collection_key
        );
        if (initializationId !== this._initializationId) return;
        this._active = "today";
        this._offset = 0;
        this._rangeStart = new Date(range.start);
        this._rangeEnd = new Date(range.end);
        this._initialPeriodApplied = true;
        this._updateControl();
      } else {
        await this._syncFromNative();
      }
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

      this._rangeStart = new Date(start);
      this._rangeEnd = new Date(end);
      this._updateControl();
    } catch (error) {
      this._setError(error);
    }
  }

  async _setPeriod(period) {
    if (!PERIODS.includes(period) || this._busy) return;
    const previousPeriod = this._active;
    const previousOffset = this._offset;
    this._active = period;
    this._offset = 0;
    this._justClickedUntil = Date.now() + CLICK_GUARD_MS;
    this._setBusy(true);

    try {
      await this._adapter.ensure(this._hass, this._config.collection_key);
      const range = await this._adapter.setPeriod(
        period,
        this._hass,
        this._config.collection_key
      );
      this._clearError();
      this._rangeStart = new Date(range.start);
      this._rangeEnd = new Date(range.end);
      this._updateControl();
    } catch (error) {
      this._active = previousPeriod;
      this._offset = previousOffset;
      this._setError(error);
    } finally {
      this._setBusy(false);
      this._scheduleSync();
    }
  }

  async _shiftPeriod(forward) {
    if (!this._active || this._busy) return;
    this._justClickedUntil = Date.now() + CLICK_GUARD_MS;
    this._setBusy(true);

    try {
      await this._adapter.ensure(this._hass, this._config.collection_key);
      const range = await this._adapter.shift(forward);
      this._clearError();
      this._rangeStart = new Date(range.start);
      this._rangeEnd = new Date(range.end);
      this._offset += forward ? 1 : -1;
      this._updateControl();
    } catch (error) {
      this._setError(error);
    } finally {
      this._setBusy(false);
      this._scheduleSync();
    }
  }

  _resetToCurrentPeriod() {
    return this._setPeriod(this._active || "today");
  }

  _localizePeriod(period) {
    const labelKey = PERIOD_LABEL_KEYS[period];
    return (
      this._hass?.localize?.(
        `ui.panel.lovelace.editor.card.statistics-graph.periods.${labelKey}`
      ) ||
      PERIOD_LABELS[period] ||
      period
    );
  }

  _getLocale() {
    return this._hass?.locale?.language || this._hass?.language || "en";
  }

  _formatExactDateRange() {
    if (!this._rangeStart || !this._rangeEnd) return "";
    if (this._active === "year") {
      return new Intl.DateTimeFormat(this._getLocale(), {
        year: "numeric",
        timeZone: this._hass?.config?.time_zone,
      }).format(this._rangeStart);
    }
    const formatter = new Intl.DateTimeFormat(this._getLocale(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: this._hass?.config?.time_zone,
    });
    if (this._active === "today") {
      return formatter.format(this._rangeStart);
    }
    return `${formatter.format(this._rangeStart)}\n${formatter.format(
      this._rangeEnd
    )}`;
  }

  _formatDateRange() {
    if (this._active === "year") return this._formatExactDateRange();
    const key = RELATIVE_PERIOD_KEYS[this._active]?.[this._offset];
    const localized = key ? this._hass?.localize?.(key) : "";
    return localized || this._formatExactDateRange();
  }

  _setBusy(busy) {
    if (busy === this._busy) return;
    this._busy = busy;
    this._updateControl();
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

  _updateControl() {
    if (!this._rendered) return;
    const disabled = this._busy || !this._hass;
    const periodSelect = this.shadowRoot.querySelector?.(".period-select");
    if (periodSelect) {
      periodSelect.dataset.disabled = disabled ? "true" : "false";
    }
    const trigger = this.shadowRoot.querySelector?.(".period-trigger");
    if (trigger) {
      const labels = Object.fromEntries(
        PERIODS.map((period) => [period, this._localizePeriod(period)])
      );
      trigger.dataset.value = this._active || "";
      const value = trigger.querySelector?.(".period-value");
      if (value) {
        value.textContent = labels[this._active] || labels[PERIODS[0]];
      }
      trigger.disabled = disabled;
      if (disabled) this._closeMenu(false);
    }
    this.shadowRoot
      .querySelectorAll(".period-option")
      .forEach((option) => {
        if (option.dataset.period === this._active) {
          option.dataset.selected = "true";
        } else {
          delete option.dataset.selected;
        }
      });
    const dateRange = this.shadowRoot.querySelector?.(".date-range");
    if (dateRange) {
      dateRange.textContent = this._formatDateRange();
      dateRange.title = this._formatExactDateRange();
      dateRange.disabled = disabled;
    }
    this.shadowRoot
      .querySelectorAll("button[data-shift]")
      .forEach((button) => (button.disabled = disabled || !this._active));
  }

  _menuElements() {
    const trigger = this.shadowRoot.querySelector?.(".period-trigger");
    const menu = this.shadowRoot.querySelector?.(".period-menu");
    if (!trigger || !menu) return undefined;
    return {
      trigger,
      menu,
      options: Array.from(this.shadowRoot.querySelectorAll(".period-option")),
    };
  }

  _positionMenu(menu, trigger) {
    const box = trigger.getBoundingClientRect?.();
    if (!box) return;
    const gap = 4;
    const edge = 10;
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.minWidth = `${Math.round(box.width)}px`;
    // A Lovelace card is often the ancestor a transform anchors to, which
    // makes fixed mean fixed to the card rather than to the viewport. The
    // panel sitting at 0,0 reports that anchor, so the trigger is measured
    // against it instead of against the viewport.
    const anchor = menu.getBoundingClientRect?.();
    const offsetX = anchor?.left || 0;
    const offsetY = anchor?.top || 0;
    const width = menu.offsetWidth || box.width;
    const height = menu.offsetHeight || 0;
    const left = Math.max(
      edge,
      Math.min(box.left, window.innerWidth - edge - width)
    );
    const opensUpwards =
      box.bottom + gap + height > window.innerHeight - edge &&
      box.top - gap - height > edge;
    menu.style.left = `${Math.round(left - offsetX)}px`;
    menu.style.top = `${Math.round(
      (opensUpwards ? box.top - gap - height : box.bottom + gap) - offsetY
    )}px`;
  }

  _releaseMenu() {
    if (!this._menuListeners) return;
    this._menuListeners.forEach(([target, type, handler]) =>
      target.removeEventListener(type, handler, true)
    );
    this._menuListeners = undefined;
  }

  _listenMenu(target, type, handler) {
    target.addEventListener(type, handler, true);
    this._menuListeners = this._menuListeners || [];
    this._menuListeners.push([target, type, handler]);
  }

  _openMenu() {
    const elements = this._menuElements();
    if (!elements || elements.trigger.disabled) return;
    const { trigger, menu, options } = elements;
    menu.dataset.open = "true";
    trigger.setAttribute("aria-expanded", "true");
    this._positionMenu(menu, trigger);
    const selected =
      options.find((option) => option.dataset.selected === "true") ||
      options[0];
    selected?.focus?.();
    if (!this._menuListeners) {
      const outside = (event) => {
        const path = event.composedPath?.() || [];
        if (path.includes(menu) || path.includes(trigger)) return;
        this._closeMenu(false);
      };
      const reposition = () => this._positionMenu(menu, trigger);
      this._listenMenu(document, "pointerdown", outside);
      this._listenMenu(window, "scroll", reposition);
      this._listenMenu(window, "resize", reposition);
    }
  }

  _closeMenu(restoreFocus) {
    const elements = this._menuElements();
    if (!elements) return;
    const { trigger, menu } = elements;
    if (menu.dataset.open !== "true") return;
    menu.dataset.open = "false";
    trigger.setAttribute("aria-expanded", "false");
    this._releaseMenu();
    if (restoreFocus) trigger.focus?.();
  }

  _focusOption(options, index) {
    if (!options.length) return;
    const bounded = ((index % options.length) + options.length) % options.length;
    options[bounded]?.focus?.();
  }

  _focusedOptionIndex(options) {
    const active = this.shadowRoot.activeElement ?? document.activeElement;
    return options.indexOf(active);
  }

  _handleMenuKeydown(event) {
    const elements = this._menuElements();
    if (!elements || elements.menu.dataset.open !== "true") return;
    const options = elements.options;
    const index = this._focusedOptionIndex(options);

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        this._closeMenu(true);
        return;
      case "Tab":
        this._closeMenu(false);
        return;
      case "ArrowDown":
        event.preventDefault();
        this._focusOption(options, index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        this._focusOption(options, index - 1);
        return;
      case "Home":
        event.preventDefault();
        this._focusOption(options, 0);
        return;
      case "End":
        event.preventDefault();
        this._focusOption(options, options.length - 1);
        return;
      default:
        if (event.key.length !== 1) return;
        this._focusTypedOption(options, index, event.key.toLowerCase());
    }
  }

  _focusTypedOption(options, index, typed) {
    for (let step = 1; step <= options.length; step += 1) {
      const option = options[(index + step + options.length) % options.length];
      if (option?.textContent.trim().toLowerCase().startsWith(typed)) {
        this._focusOption(options, (index + step + options.length) % options.length);
        return;
      }
    }
  }

  _render() {
    this._releaseMenu();
    const tag = this._config.show_card ? "ha-card" : "div";
    const labels = Object.fromEntries(
      PERIODS.map((period) => [period, this._localizePeriod(period)])
    );
    const previousLabel =
      this._hass?.localize?.(
        "ui.panel.lovelace.components.energy_period_selector.previous"
      ) || "Previous period";
    const nextLabel =
      this._hass?.localize?.(
        "ui.panel.lovelace.components.energy_period_selector.next"
      ) || "Next period";
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --ha-energy-period-card-control-height:
            var(--feature-height, var(--ha-button-height, 40px));
          --ha-energy-period-card-select-color: var(--primary-text-color);
          --ha-energy-period-card-field-background:
            color-mix(
              in srgb,
              var(--disabled-color, var(--secondary-text-color)) 20%,
              transparent
            );
          --ha-energy-period-card-field-hover-background:
            color-mix(
              in srgb,
              var(--ha-color-on-neutral-quiet, var(--secondary-text-color)) 20%,
              transparent
            );
          --ha-energy-period-card-field-focus-color:
            var(--feature-color, var(--primary-color, var(--ha-color-focus)));
          --ha-energy-period-card-field-radius:
            var(--feature-border-radius, var(--ha-border-radius-lg, 12px));
          --ha-energy-period-card-menu-background: var(--card-background-color);
          --ha-energy-period-card-menu-border-color:
            var(--ha-color-border-neutral-quiet, var(--divider-color));
          --ha-energy-period-card-menu-radius: var(--ha-border-radius-md, 8px);
          --ha-energy-period-card-menu-padding: var(--ha-space-1, 4px);
          --ha-energy-period-card-menu-shadow:
            var(--ha-box-shadow-m, 0 3px 6px 0 color-mix(
                  in srgb,
                  var(--disabled-color, #000) 30%,
                  transparent
                ));
          --ha-energy-period-card-option-hover-background:
            var(--ha-color-fill-neutral-normal-resting, var(--divider-color));
          --ha-energy-period-card-option-selected-background:
            var(--ha-color-fill-primary-quiet-resting, color-mix(
                  in srgb,
                  var(--primary-color, var(--accent-color)) 12%,
                  transparent
                ));
          --ha-energy-period-card-option-selected-hover-background:
            var(--ha-color-fill-primary-quiet-hover, color-mix(
                  in srgb,
                  var(--primary-color, var(--accent-color)) 18%,
                  transparent
                ));
          --ha-energy-period-card-nav-background:
            var(--ha-color-fill-neutral-normal-resting,
              var(--secondary-background-color));
          --ha-energy-period-card-nav-color:
            var(--ha-color-on-neutral-normal, var(--secondary-text-color));
          --ha-energy-period-card-nav-hover-background:
            var(--ha-color-fill-neutral-normal-hover, var(--divider-color));
          --ha-energy-period-card-nav-hover-color: var(--primary-text-color);
          --ha-energy-period-card-nav-radius:
            var(--feature-border-radius, var(--ha-border-radius-lg, 12px));
          --ha-energy-period-card-transition:
            var(--ha-animation-duration-fast, 180ms) ease-in-out;
        }
        ha-card,
        .wrapper {
          box-sizing: border-box;
          padding: var(--ha-space-3, 12px);
        }
        div.wrapper {
          padding: 0;
        }
        .title {
          margin-bottom: var(--ha-space-2, 8px);
          color: var(--primary-text-color);
          font-size: var(--ha-font-size-l, 16px);
          font-weight: var(--ha-font-weight-medium, 500);
          line-height: var(--ha-line-height-condensed, 1.3);
        }
        .date-navigation {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2, 8px);
          min-height: var(--ha-energy-period-card-control-height, 40px);
        }
        .period-select {
          position: relative;
          display: inline-flex;
          align-items: center;
          flex: none;
          min-width: 0;
          height: var(--ha-energy-period-card-control-height, 40px);
          color: var(--ha-energy-period-card-select-color);
          line-height: var(--ha-line-height-condensed, 1.2);
        }
        .period-select[data-disabled="true"] {
          opacity: var(--disabled-opacity, 0.55);
        }
        .period-trigger {
          appearance: none;
          -webkit-appearance: none;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          gap: var(--ha-space-2, 8px);
          min-width: 0;
          max-width: 100%;
          height: 100%;
          border: 0;
          border-radius: var(--ha-energy-period-card-field-radius);
          padding:
            0 var(--ha-space-2, 8px) 0 var(--ha-space-3, 12px);
          color: inherit;
          background-color: var(--ha-energy-period-card-field-background);
          background-image: none;
          font: inherit;
          font-size: var(--ha-font-size-m, 14px);
          font-weight: var(--ha-font-weight-normal, 400);
          letter-spacing: 0.25px;
          text-align: left;
          cursor: pointer;
          transition: background-color var(--ha-energy-period-card-transition);
        }
        .period-value {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .period-caret {
          flex: none;
          width: var(--ha-energy-period-card-caret-size, 10px);
          height: var(--ha-energy-period-card-caret-size, 10px);
          border-right: 2px solid var(--secondary-text-color);
          border-bottom: 2px solid var(--secondary-text-color);
          transform: translateY(-25%) rotate(45deg);
        }
        .period-trigger:hover:not(:disabled) {
          background-color: var(--ha-energy-period-card-field-hover-background);
        }
        .period-trigger:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--ha-energy-period-card-field-focus-color);
        }
        .period-trigger:disabled {
          cursor: wait;
        }
        .period-menu {
          position: fixed;
          z-index: 3;
          box-sizing: border-box;
          max-height: var(--ha-energy-period-card-menu-height, 15em);
          overflow-y: auto;
          padding: var(--ha-energy-period-card-menu-padding, 4px);
          border: var(--ha-border-width-sm, 1px) solid
            var(--ha-energy-period-card-menu-border-color);
          border-radius: var(--ha-energy-period-card-menu-radius);
          color: var(--primary-text-color);
          background: var(--ha-energy-period-card-menu-background);
          box-shadow: var(--ha-energy-period-card-menu-shadow);
          font-size: var(--ha-dropdown-font-size, var(--ha-font-size-m, 14px));
          line-height: var(--ha-line-height-condensed, 1.2);
          transform-origin: top left;
        }
        .period-menu[data-open="false"] {
          display: none;
        }
        .period-menu[data-open="true"] {
          display: block;
          animation: period-menu-open
            var(--ha-animation-duration-instant, 75ms) ease;
        }
        @keyframes period-menu-open {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .period-option {
          display: flex;
          align-items: center;
          gap: 0.75em;
          width: 100%;
          box-sizing: border-box;
          min-height: var(--ha-space-10, 40px);
          padding: 0.5em var(--ha-space-4, 16px);
          border: 0;
          border-radius: var(--ha-border-radius-sm, 4px);
          color: var(--primary-text-color);
          background: transparent;
          font: inherit;
          font-weight: var(--ha-font-weight-normal, 400);
          text-align: left;
          cursor: pointer;
          transition: background-color var(--ha-energy-period-card-transition);
        }
        .period-option:hover,
        .period-option:focus-visible {
          color: var(--primary-text-color);
          background-color: var(--ha-energy-period-card-option-hover-background);
        }
        .period-option:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--ha-color-focus, var(--primary-color));
        }
        .period-option[data-selected="true"] {
          color: var(--primary-color);
          background-color: var(
            --ha-energy-period-card-option-selected-background
          );
          font-weight: var(--ha-font-weight-medium, 500);
        }
        .period-option[data-selected="true"]:hover,
        .period-option[data-selected="true"]:focus-visible {
          color: var(--primary-color);
          background-color: var(
            --ha-energy-period-card-option-selected-hover-background
          );
        }
        .date-range {
          flex: 1;
          min-width: 0;
          height: var(--ha-energy-period-card-control-height, 40px);
          border: 0;
          padding: 0 var(--ha-space-2, 8px);
          border-radius: var(--ha-energy-period-card-nav-radius);
          color: var(--primary-text-color);
          background: transparent;
          font: inherit;
          font-size: var(--ha-font-size-m, 14px);
          font-weight: var(--ha-font-weight-medium, 500);
          line-height: var(--ha-line-height-condensed, 1.2);
          text-align: center;
          white-space: pre-line;
          cursor: pointer;
          transition: background-color var(--ha-energy-period-card-transition);
        }
        .date-range:hover:not(:disabled) {
          background: var(
            --ha-color-fill-neutral-quiet-hover,
            var(--divider-color)
          );
        }
        .date-range:focus-visible {
          outline: 2px solid var(--ha-color-focus, var(--primary-color));
          outline-offset: 2px;
        }
        .date-range:disabled {
          cursor: default;
          opacity: var(--disabled-opacity, 0.55);
        }
        .date-nav {
          display: inline-flex;
          align-items: center;
          flex: none;
          gap: var(--ha-space-1, 4px);
        }
        .date-nav button[data-shift] {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: none;
          box-sizing: border-box;
          width: var(--ha-energy-period-card-control-height, 40px);
          height: var(--ha-energy-period-card-control-height, 40px);
          border: 0;
          border-radius: var(--ha-energy-period-card-nav-radius);
          color: var(--ha-energy-period-card-nav-color);
          background: var(--ha-energy-period-card-nav-background);
          font: inherit;
          font-size: var(--ha-font-size-xl, 22px);
          line-height: 1;
          cursor: pointer;
          transition:
            background-color var(--ha-energy-period-card-transition),
            color var(--ha-energy-period-card-transition);
        }
        .date-nav button[data-shift]:hover:not(:disabled) {
          color: var(--ha-energy-period-card-nav-hover-color);
          background: var(--ha-energy-period-card-nav-hover-background);
        }
        .date-nav button[data-shift]:focus-visible {
          outline: 2px solid var(--ha-color-focus, var(--primary-color));
          outline-offset: 2px;
        }
        .date-nav button[data-shift]:disabled {
          cursor: default;
          opacity: var(--disabled-opacity, 0.55);
        }
        @media (prefers-reduced-motion: reduce) {
          .period-trigger,
          .period-option,
          .date-range,
          .date-nav button[data-shift] {
            transition: none;
          }
          .period-menu[data-open="true"] {
            animation: none;
          }
        }
        .error {
          margin-top: var(--ha-space-2, 8px);
          color: var(--error-color);
          font-size: var(--ha-font-size-s, 12px);
          line-height: var(--ha-line-height-normal, 1.4);
        }
      </style>
      <${tag} class="wrapper">
        ${
          this._config.title
            ? `<div class="title">${escapeHtml(this._config.title)}</div>`
            : ""
        }
        <div class="date-navigation">
          <div
            class="period-select"
            data-disabled="${this._busy || !this._hass ? "true" : "false"}"
          >
            <button
              type="button"
              class="period-trigger"
              data-period-trigger
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label="Energy period"
              ${this._busy || !this._hass ? "disabled" : ""}
            >
              <span class="period-value"
                >${escapeHtml(labels[this._active] || labels[PERIODS[0]])}</span
              >
              <span class="period-caret" aria-hidden="true"></span>
            </button>
            <div
              class="period-menu"
              role="menu"
              aria-label="Energy period"
              data-open="false"
            >
              ${PERIODS.map(
                (period, index) => `
              <button
                type="button"
                class="period-option"
                role="menuitem"
                data-period="${period}"
                aria-posinset="${index + 1}"
                aria-setsize="${PERIODS.length}"
                tabindex="-1"
                ${period === this._active ? 'data-selected="true"' : ""}
              >${escapeHtml(labels[period])}</button>`
              ).join("")}
            </div>
          </div>
          <button
            type="button"
            class="date-range"
            data-today
            aria-live="polite"
            title="${escapeHtml(this._formatExactDateRange())}"
            ${this._busy || !this._hass ? "disabled" : ""}
          >${escapeHtml(this._formatDateRange())}</button>
          <div class="date-nav">
            <button
              type="button"
              data-shift="previous"
              aria-label="${escapeHtml(previousLabel)}"
              title="${escapeHtml(previousLabel)}"
              ${this._busy || !this._hass || !this._active ? "disabled" : ""}
            >‹</button>
            <button
              type="button"
              data-shift="next"
              aria-label="${escapeHtml(nextLabel)}"
              title="${escapeHtml(nextLabel)}"
              ${this._busy || !this._hass || !this._active ? "disabled" : ""}
            >›</button>
          </div>
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

    const trigger = this.shadowRoot.querySelector?.(".period-trigger");
    trigger?.addEventListener("click", () => {
      const menu = this.shadowRoot.querySelector?.(".period-menu");
      if (menu?.dataset.open === "true") this._closeMenu(true);
      else this._openMenu();
    });
    trigger?.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this._openMenu();
      }
    });
    const menu = this.shadowRoot.querySelector?.(".period-menu");
    menu?.addEventListener("keydown", (event) => this._handleMenuKeydown(event));
    this.shadowRoot
      .querySelectorAll(".period-option")
      .forEach((option) =>
        option.addEventListener("click", () => {
          this._closeMenu(true);
          this._setPeriod(option.dataset.period);
        })
      );
    this.shadowRoot
      .querySelectorAll("button[data-shift]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this._shiftPeriod(button.dataset.shift === "next")
        )
      );
    this.shadowRoot
      .querySelector?.("button[data-today]")
      ?.addEventListener("click", () => this._resetToCurrentPeriod());
    this._rendered = true;
    this._updateControl();
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
      "Localized dropdown for selecting the current Home Assistant Energy period.",
  });
}

console.info(
  `%c HA_ENERGY-PERIOD-CARD %c v${CARD_VERSION} `,
  "color: white; background: #03a9f4; font-weight: 600; padding: 2px 6px; border-radius: 3px 0 0 3px;",
  "color: #03a9f4; background: white; font-weight: 600; padding: 2px 6px; border-radius: 0 3px 3px 0; border: 1px solid #03a9f4;"
);
