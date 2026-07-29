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
      this_week: "This week",
      this_month: "This month",
      this_year: "This year",
    },
    custom: {
      today: "Localized today",
      this_week: "Localized week",
      this_month: "Localized month",
      this_year: "Localized year",
    },
  };

  return {
    language,
    locale: { language },
    localize(key) {
      const range = key.split(".").at(-1);
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

test("uses Home Assistant translations and falls back to English", () => {
  const card = new Card();
  card._hass = createHass("custom");
  assert.equal(card._localizePeriod("today"), "Localized today");
  assert.equal(card._localizePeriod("week"), "Localized week");

  card._hass = createHass("unsupported");
  assert.equal(card._localizePeriod("month"), "Month");
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

test("renders accessible controls and theme extension points", () => {
  const card = new Card();
  card._hass = createHass();
  card.setConfig({ collection_key: "energy_1" });

  assert.match(card.shadowRoot.innerHTML, /role="group"/);
  assert.match(card.shadowRoot.innerHTML, /aria-pressed="false"/);
  assert.match(card.shadowRoot.innerHTML, /button:focus-visible/);
  assert.match(
    card.shadowRoot.innerHTML,
    /--ha-energy-period-card-active-background/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /var\(--primary-color, var\(--ha-color-primary-40\)\)/
  );
  assert.match(
    card.shadowRoot.innerHTML,
    /var\(--secondary-background-color, var\(--ha-color-surface-low\)\)/
  );
  assert.match(card.shadowRoot.innerHTML, /@container \(max-width: 360px\)/);
});

test("detects Home Assistant-provided preset ranges", async () => {
  const card = new Card();
  card._hass = createHass();
  const ranges = {
    today: {
      start: new Date(2026, 6, 29, 0, 0, 0, 0),
      end: new Date(2026, 6, 29, 23, 59, 59, 999),
    },
    week: {
      start: new Date(2026, 6, 27, 0, 0, 0, 0),
      end: new Date(2026, 7, 2, 23, 59, 59, 999),
    },
  };
  card._adapter = {
    getPresetRange: async (period) => ranges[period],
  };

  assert.equal(
    await card._detectPeriod(ranges.week.start, ranges.week.end),
    "week"
  );
  assert.equal(
    await card._detectPeriod(
      new Date(2026, 6, 1),
      new Date(2026, 6, 12)
    ),
    undefined
  );
});

test("honors Home Assistant-provided week boundaries", async () => {
  const card = new Card();
  card._hass = createHass();
  const sundayFirstWeek = {
    start: new Date(2026, 6, 26, 0, 0, 0, 0),
    end: new Date(2026, 7, 1, 23, 59, 59, 999),
  };
  card._adapter = {
    getPresetRange: async (period) =>
      period === "week" ? sundayFirstWeek : undefined,
  };

  assert.equal(
    await card._detectPeriod(
      sundayFirstWeek.start,
      sundayFirstWeek.end
    ),
    "week"
  );
});

test("clears the active state for a custom date range", async () => {
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
    getPresetRange: async () => undefined,
  };

  await card._syncFromNative();
  assert.equal(card._active, undefined);
});

test("rejects an incompatible Home Assistant selector", () => {
  const card = new Card();
  assert.throws(
    () => card._adapter._assertCompatible({}),
    /incompatible Energy period selector/
  );
});
