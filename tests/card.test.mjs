import assert from "node:assert/strict";
import test from "node:test";

class MockShadowRoot {
  constructor() {
    this.innerHTML = "";
    this.children = [];
  }

  appendChild(element) {
    this.children.push(element);
    return element;
  }

  querySelectorAll() {
    return [];
  }
}

class MockHTMLElement {
  constructor() {
    this.isConnected = false;
  }

  attachShadow() {
    this.shadowRoot = new MockShadowRoot();
    return this.shadowRoot;
  }
}

const registry = new Map();

globalThis.HTMLElement = MockHTMLElement;
globalThis.window = {
  customCards: [],
  setTimeout,
  clearTimeout,
};
globalThis.customElements = {
  define(name, constructor) {
    registry.set(name, constructor);
  },
  get(name) {
    return registry.get(name);
  },
  whenDefined() {
    return Promise.resolve();
  },
};
globalThis.document = {
  createElement() {
    return {
      style: {},
      setAttribute() {},
      updateComplete: Promise.resolve(),
    };
  },
};
globalThis.localStorage = {
  setItem() {},
};

await import("../ha_energy-period-card.js");

const Card = registry.get("ha_energy-period-card");

function createHass(language = "en") {
  const labels = {
    en: {
      today: "Today",
      yesterday: "Yesterday",
      tomorrow: "Tomorrow",
      this_week: "This week",
      last_week: "Last week",
      next_week: "Next week",
      this_month: "This month",
      last_month: "Last month",
      next_month: "Next month",
      this_year: "This year",
      last_year: "Last year",
    },
    custom: {
      today: "Localized today",
      this_week: "Localized week",
      this_month: "Localized month",
      this_year: "Localized year",
    },
  };
  const periodLabels = {
    en: {
      day: "Day",
      week: "Week",
      month: "Month",
      year: "Year",
    },
    custom: {
      day: "Localized day",
      week: "Localized week",
      month: "Localized month",
      year: "Localized year",
    },
  };

  return {
    language,
    locale: { language },
    localize(key) {
      const range = key.split(".").at(-1);
      if (key.includes("statistics-graph.periods")) {
        return periodLabels[language]?.[range] || "";
      }
      return labels[language]?.[range] || "";
    },
  };
}

test("registers the repository-aligned custom card type once", () => {
  assert.equal(typeof Card, "function");
  assert.equal(
    window.customCards.filter((card) => card.type === "ha_energy-period-card")
      .length,
    1
  );
});

test("provides a built-in configuration form and stub config", () => {
  const form = Card.getConfigForm();
  assert.deepEqual(
    form.schema.map((field) => field.name),
    ["collection_key", "title", "show_card"]
  );
  assert.deepEqual(Card.getStubConfig(), {
    collection_key: "energy_1",
    title: "",
    show_card: true,
  });
  assert.doesNotThrow(() =>
    form.assertConfig({ collection_key: "energy_1", show_card: true })
  );
  assert.throws(
    () => form.assertConfig({ collection_key: "invalid" }),
    /must start with energy_/
  );
});

test("escapes a configured title before rendering", () => {
  const card = new Card();
  card.setConfig({
    collection_key: "energy_1",
    title: '<img src=x onerror="alert(1)">',
  });
  assert.match(card.shadowRoot.innerHTML, /&lt;img/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<img/);
});

test("initializes when Home Assistant is assigned after configuration", () => {
  const card = new Card();
  let initializationCount = 0;
  card._initialize = () => {
    initializationCount += 1;
  };
  card.hass = createHass();
  assert.equal(initializationCount, 1);
});

test("uses Home Assistant translations with English fallbacks", () => {
  const card = new Card();
  card._hass = createHass("custom");
  assert.equal(card._localizePeriod("today"), "Localized day");
  assert.equal(card._localizePeriod("week"), "Localized week");

  card._hass = createHass("unsupported");
  assert.equal(card._localizePeriod("month"), "Month");
});

test("renders an accessible dropdown, date range, and theme extension points", () => {
  const card = new Card();
  card._hass = createHass();
  card._rangeStart = new Date(2026, 6, 1, 0, 0, 0);
  card._rangeEnd = new Date(2026, 6, 31, 23, 59, 59);
  card.setConfig({ collection_key: "energy_1" });

  assert.match(card.shadowRoot.innerHTML, /class="period-trigger"/);
  assert.match(card.shadowRoot.innerHTML, /aria-label="Energy period"/);
  assert.match(card.shadowRoot.innerHTML, /aria-haspopup="menu"/);
  assert.match(card.shadowRoot.innerHTML, /aria-expanded="false"/);
  assert.match(card.shadowRoot.innerHTML, /role="menu"/);
  assert.match(card.shadowRoot.innerHTML, /data-period="today"/);
  assert.match(card.shadowRoot.innerHTML, /data-period="week"/);
  assert.match(card.shadowRoot.innerHTML, /data-period="month"/);
  assert.match(card.shadowRoot.innerHTML, /data-period="year"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /Select period/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<select/);
  assert.match(card.shadowRoot.innerHTML, /role="menuitem"/);
  assert.match(card.shadowRoot.innerHTML, /aria-posinset="1"/);
  assert.match(card.shadowRoot.innerHTML, /aria-setsize="4"/);
  assert.match(card.shadowRoot.innerHTML, /aria-expanded="false"/);
  assert.match(card.shadowRoot.innerHTML, />Day<\/button>/);
  assert.match(card.shadowRoot.innerHTML, />Week<\/button>/);
  assert.match(card.shadowRoot.innerHTML, />Month<\/button>/);
  assert.match(card.shadowRoot.innerHTML, />Year<\/button>/);
  assert.match(
    card.shadowRoot.innerHTML,
    /<button[\s\S]*?class="date-range"[\s\S]*?data-today/
  );
  assert.match(card.shadowRoot.innerHTML, /07\/01\/2026\s+07\/31\/2026/);
  assert.match(card.shadowRoot.innerHTML, /data-shift="previous"/);
  assert.match(card.shadowRoot.innerHTML, /data-shift="next"/);
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-navigation \{[^}]*display: flex;[^}]*align-items: center;/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-select \{[^}]*height: var\(--ha-energy-period-card-control-height, 40px\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger \{[^}]*appearance: none;[^}]*background-image: none;/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger \{[^}]*border: 0;[^}]*border-radius: var\(--ha-energy-period-card-field-radius\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger \{[^}]*background-color: var\(--ha-energy-period-card-field-background\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger \{[^}]*color: inherit;[^}]*font-size: var\(\s*--ha-energy-period-card-font-size,\s*var\(--ha-font-size-l, 16px\)\s*\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger:hover:not\(:disabled\) \{[^}]*background-color: var\(--ha-energy-period-card-field-hover-background\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger:focus-visible \{[^}]*outline: none;[^}]*box-shadow: 0 0 0 2px var\(--ha-energy-period-card-field-focus-color\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger \{[^}]*display: flex;[^}]*gap: var\(--ha-space-2, 8px\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-value \{[^}]*flex: 1;[^}]*text-overflow: ellipsis;/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-caret \{[^}]*width: var\(--ha-energy-period-card-caret-size, 0\.7em\);[^}]*border-right: 2px solid var\(--secondary-text-color\);[^}]*rotate\(45deg\)/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /class="period-value"[\s\S]*?<span class="period-caret" aria-hidden="true">/
  );
  assert.doesNotMatch(card.shadowRoot.innerHTML, /\.period-select::after/);
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-nav button\[data-shift\] \{[^}]*width: var\(--ha-energy-period-card-control-height, 40px\);[^}]*height: var\(--ha-energy-period-card-control-height, 40px\);[^}]*border-radius: var\(--ha-energy-period-card-nav-radius\);[^}]*background: var\(--ha-energy-period-card-nav-background\)/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /<div class="date-navigation">[\s\S]*?<div[\s\S]*?class="period-select"[\s\S]*?<button[\s\S]*?data-period-trigger[\s\S]*?class="date-range"[\s\S]*?<div class="date-nav">[\s\S]*?data-shift="previous"[\s\S]*?data-shift="next"/
  );
  assert.match(card.shadowRoot.innerHTML, /text-align: center/);
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-range \{[^}]*flex: 1;[^}]*background: transparent;/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-range \{[^}]*height: var\(--ha-energy-period-card-control-height, 40px\);/
  );
  assert.match(card.shadowRoot.innerHTML, /\.period-trigger:focus-visible/);
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-nav-background:[\s\S]*?--ha-color-fill-neutral-normal-resting/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-nav-hover-background:[\s\S]*?--ha-color-fill-neutral-normal-hover/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-nav button\[data-shift\]:hover:not\(:disabled\) \{[^}]*color: var\(--ha-energy-period-card-nav-hover-color\);[^}]*background: var\(--ha-energy-period-card-nav-hover-background\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-nav button\[data-shift\] \{[^}]*transition:\s+background-color var\(--ha-energy-period-card-transition\),\s+color var\(--ha-energy-period-card-transition\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-field-background:[\s\S]*?color-mix\(\s*in srgb,\s*var\(--disabled-color, var\(--secondary-text-color\)\) 20%,/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-field-hover-background:[\s\S]*?--ha-color-on-neutral-quiet/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-field-focus-color:[\s\S]*?var\(--feature-color, var\(--primary-color, var\(--ha-color-focus\)\)\)/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-field-radius:[\s\S]*?var\(--feature-border-radius, var\(--ha-border-radius-lg, 12px\)\)/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-nav-radius:[\s\S]*?var\(--feature-border-radius, var\(--ha-border-radius-lg, 12px\)\)/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-menu-background: var\(--card-background-color\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-menu-border-color:[\s\S]*?--ha-color-border-neutral-quiet/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-menu-radius: var\(--ha-border-radius-md, 8px\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-menu-padding: var\(--ha-space-1, 4px\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-option-hover-background:[\s\S]*?--ha-color-fill-neutral-normal-resting/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-option-selected-background:[\s\S]*?--ha-color-fill-primary-quiet-resting/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-menu \{[^}]*position: fixed;[^}]*background: var\(--ha-energy-period-card-menu-background\);[^}]*box-shadow: var\(--ha-energy-period-card-menu-shadow\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-menu\[data-open="false"\] \{\s*display: none;/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-menu\[data-open="true"\] \{[^}]*animation: period-menu-open\s+var\(--ha-animation-duration-instant, 75ms\) ease;/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /@keyframes period-menu-open \{\s*from \{\s*opacity: 0;\s*transform: scale\(0\.9\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-option \{[^}]*min-height: var\(--ha-space-10, 40px\);[^}]*border-radius: var\(--ha-border-radius-sm, 4px\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-option:hover,\s*\.period-option:focus-visible \{[^}]*background-color: var\(--ha-energy-period-card-option-hover-background\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-option\[data-selected="true"\] \{[^}]*color: var\(--primary-color\);[^}]*background-color: var\(\s*--ha-energy-period-card-option-selected-background\s*\);[^}]*font-weight: var\(--ha-font-weight-medium, 500\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?transition: none;[\s\S]*?animation: none;/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /div\.wrapper \{\s*padding: 0;\s*\}/
  );

  const rowStyles = card.shadowRoot.innerHTML.match(
    /\.date-navigation \{[^}]*\}/
  )?.[0];
  assert.ok(rowStyles, "the selector row has its own style rule");
  assert.doesNotMatch(rowStyles, /border|background|border-radius/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /border-right: 1px solid/);
});

test("gives every control in the row the same height", () => {
  const card = new Card();
  card._hass = createHass();
  card.setConfig({ collection_key: "energy_1" });

  const heights = [
    /\.date-navigation \{[^}]*\}/,
    /\.period-select \{[^}]*\}/,
    /\.date-range \{[^}]*\}/,
    /\.date-nav button\[data-shift\] \{[^}]*\}/,
  ].map((rule) => card.shadowRoot.innerHTML.match(rule)?.[0]);

  for (const styles of heights) {
    assert.ok(styles, "every control has its own style rule");
    assert.match(
      styles,
      /var\(--ha-energy-period-card-control-height, 40px\)/,
      "controls share one height variable"
    );
  }
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-control-height:\s*calc\(\s*var\(--feature-height, var\(--ha-button-height, 40px\)\) \+\s*var\(--ha-space-2, 8px\)\s*\);/,
    "the row is one spacing step above Home Assistant's own control height"
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-font-size: var\(--ha-font-size-l, 16px\);/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-caret-size: 0\.7em;/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger \{[^}]*font-size: var\(\s*--ha-energy-period-card-font-size/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-range \{[^}]*font-size: var\(\s*--ha-energy-period-card-font-size/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-nav button\[data-shift\] \{[^}]*font-size: var\(\s*--ha-energy-period-card-nav-size/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-menu \{[^}]*font-size: var\(\s*--ha-dropdown-font-size,\s*var\(--ha-energy-period-card-font-size/
  );
});

test("keeps the period dropdown dimmed while the card is busy", () => {
  const card = new Card();
  card.setConfig({ collection_key: "energy_1" });

  assert.match(
    card.shadowRoot.innerHTML,
    /class="period-select"[\s\S]*?data-disabled="true"/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-select\[data-disabled="true"\] \{[^}]*opacity: var\(--disabled-opacity/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.period-trigger:hover:not\(:disabled\)/
  );
});

test("renders the frameless mode without a card wrapper", () => {
  const card = new Card();
  card._hass = createHass();
  card.setConfig({ collection_key: "energy_1", show_card: false });

  assert.match(card.shadowRoot.innerHTML, /<div class="wrapper">/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /<ha-card class="wrapper">/);
});

test("uses only relative labels supplied by Home Assistant", () => {
  const card = new Card();
  card._hass = createHass();
  const requestedKeys = [];
  const localize = card._hass.localize.bind(card._hass);
  card._hass.localize = (key) => {
    requestedKeys.push(key);
    return localize(key);
  };
  card._rangeStart = new Date(2026, 6, 29);
  card._rangeEnd = new Date(2026, 6, 29, 23, 59, 59);
  card._active = "today";

  card._offset = 0;
  assert.equal(card._formatDateRange(), "Today");
  card._offset = -1;
  assert.equal(card._formatDateRange(), "Yesterday");

  card._active = "week";
  assert.equal(card._formatDateRange(), "Last week");
  assert.ok(
    requestedKeys.includes("ui.components.selectors.period.periods.last_week")
  );

  card._offset = -2;
  assert.equal(card._formatDateRange(), "07/29/2026\n07/29/2026");
});

test("formats a day fallback as one date instead of a date range", () => {
  const card = new Card();
  card._hass = createHass();
  card._hass.localize = () => "";
  card._active = "today";
  card._offset = -2;
  card._rangeStart = new Date(2026, 6, 27);
  card._rangeEnd = new Date(2026, 6, 27, 23, 59, 59);

  assert.equal(card._formatDateRange(), "07/27/2026");
});

test("formats a German date range on two lines", () => {
  const card = new Card();
  card._hass = createHass("de-CH");
  card._active = "week";
  card._offset = -2;
  card._rangeStart = new Date(2026, 6, 6);
  card._rangeEnd = new Date(2026, 6, 12, 23, 59, 59);

  assert.equal(card._formatDateRange(), "06.07.2026\n12.07.2026");
});

test("formats a year period as the concrete year", () => {
  const card = new Card();
  card._hass = createHass();
  card._hass.localize = () => {
    throw new Error("Year formatting must not request a relative label");
  };
  card._active = "year";
  card._offset = -1;
  card._rangeStart = new Date(2025, 0, 1);
  card._rangeEnd = new Date(2025, 11, 31, 23, 59, 59);

  assert.equal(card._formatDateRange(), "2025");
});

test("resets the date while preserving the selected period unit", async () => {
  const card = new Card();
  card._active = "week";
  const periods = [];
  card._setPeriod = async (period) => periods.push(period);

  await card._resetToCurrentPeriod();

  assert.deepEqual(periods, ["week"]);
});

test("shifts the selected period backward and forward", async () => {
  const card = new Card();
  card._hass = createHass();
  card._config = { collection_key: "energy_1" };
  card._active = "week";
  const directions = [];
  card._adapter = {
    ensure: async () => {},
    shift: async (forward) => {
      directions.push(forward);
      return {
        start: new Date(2026, 6, forward ? 6 : 20),
        end: new Date(2026, 6, forward ? 12 : 26),
      };
    },
  };

  await card._shiftPeriod(false);
  await card._shiftPeriod(true);

  assert.deepEqual(directions, [false, true]);
  assert.equal(card._active, "week");
  assert.equal(card._offset, 0);
  assert.equal(card._rangeStart.getDate(), 6);
  assert.equal(card._rangeEnd.getDate(), 12);
});

test("starts a new card instance on Today", async () => {
  const card = new Card();
  card._hass = createHass();
  card._config = { collection_key: "energy_1" };
  card.isConnected = true;
  const selectedPeriods = [];
  card._adapter = {
    ensure: async () => {},
    setPeriod: async (period) => {
      selectedPeriods.push(period);
      return {
        start: new Date(2026, 6, 29, 0, 0, 0, 0),
        end: new Date(2026, 6, 29, 23, 59, 59, 999),
      };
    },
  };

  await card._initialize();

  assert.deepEqual(selectedPeriods, ["today"]);
  assert.equal(card._active, "today");
  assert.equal(card._offset, 0);
  assert.equal(card._initialPeriodApplied, true);
});

test("synchronizes external dates without changing the selected unit", async () => {
  const card = new Card();
  card._hass = createHass();
  card._active = "month";
  card._adapter = {
    selector: {},
    updateComplete: async () => {},
    getCurrentRange: () => ({
      start: new Date(2026, 6, 1),
      end: new Date(2026, 6, 12),
    }),
  };

  await card._syncFromNative();
  assert.equal(card._active, "month");
  assert.equal(card._rangeStart.getDate(), 1);
  assert.equal(card._rangeEnd.getDate(), 12);
});

test("rejects an incompatible Home Assistant selector", () => {
  const card = new Card();
  assert.throws(
    () => card._adapter._assertCompatible({}),
    /incompatible Energy period selector/
  );
});
