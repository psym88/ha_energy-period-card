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

  assert.match(card.shadowRoot.innerHTML, /<select/);
  assert.match(card.shadowRoot.innerHTML, /aria-label="Energy period"/);
  assert.match(card.shadowRoot.innerHTML, /<option value="today"/);
  assert.match(card.shadowRoot.innerHTML, /<option value="week"/);
  assert.match(card.shadowRoot.innerHTML, /<option value="month"/);
  assert.match(card.shadowRoot.innerHTML, /<option value="year"/);
  assert.match(
    card.shadowRoot.innerHTML,
    /<option value="" hidden>Select period<\/option>/
  );
  assert.match(card.shadowRoot.innerHTML, />Day<\/option>/);
  assert.match(card.shadowRoot.innerHTML, />Week<\/option>/);
  assert.match(card.shadowRoot.innerHTML, />Month<\/option>/);
  assert.match(card.shadowRoot.innerHTML, />Year<\/option>/);
  assert.match(card.shadowRoot.innerHTML, /class="date-range"/);
  assert.match(card.shadowRoot.innerHTML, /07\/01\/2026 – 07\/31\/2026/);
  assert.match(card.shadowRoot.innerHTML, /data-shift="previous"/);
  assert.match(card.shadowRoot.innerHTML, /data-shift="next"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /data-today/);
  assert.match(card.shadowRoot.innerHTML, /text-align: center/);
  assert.match(
    card.shadowRoot.innerHTML,
    /font-size: var\(--ha-font-size-l, 16px\)/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /\.date-range \{[\s\S]*?font-size: var\(--ha-font-size-m, 14px\)/
  );
  assert.match(card.shadowRoot.innerHTML, /select:focus-visible/);
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-select-background/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /var\(--secondary-background-color, var\(--ha-color-surface-low\)\)/
  );
});

test("uses only relative labels supplied by Home Assistant", () => {
  const card = new Card();
  card._hass = createHass();
  card._rangeStart = new Date(2026, 6, 29);
  card._rangeEnd = new Date(2026, 6, 29, 23, 59, 59);
  card._active = "today";

  card._offset = 0;
  assert.equal(card._formatDateRange(), "Today");
  card._offset = -1;
  assert.equal(card._formatDateRange(), "Yesterday");

  card._active = "week";
  assert.equal(card._formatDateRange(), "Last week");

  card._offset = -2;
  assert.equal(card._formatDateRange(), "07/29/2026 – 07/29/2026");
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
