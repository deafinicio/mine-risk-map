(function () {
  "use strict";

  const AIR_API_URL = "https://89-168-114-2.sslip.io/api/events?limit=50";

  let mode = "mine";
  let airEvents = [];
  let mineLayerState = {
    cluster: true,
    heatProxy: true,
    heatLayer: false
  };
  let minePanelState = {
    filtersDisplay: "",
    heatSettingsDisplay: "none"
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function setHudStat(id, value, label) {
    const valueEl = $(id);
    if (!valueEl) return;
    valueEl.textContent = value;
    const labelEl = valueEl.parentElement && valueEl.parentElement.querySelector("span");
    if (labelEl) labelEl.textContent = label;
  }

  function rememberMineState() {
    if (typeof map !== "undefined") {
      mineLayerState.cluster = typeof clusterLayer !== "undefined" && map.hasLayer(clusterLayer);
      mineLayerState.heatProxy = typeof heatProxy !== "undefined" && map.hasLayer(heatProxy);
      mineLayerState.heatLayer = typeof heatLayer !== "undefined" && heatLayer && map.hasLayer(heatLayer);
    }

    const filters = $("filters-panel");
    const heatPanel = $("heat-settings-panel");
    if (filters) minePanelState.filtersDisplay = filters.style.display;
    if (heatPanel) minePanelState.heatSettingsDisplay = heatPanel.style.display;
  }

  function hideMineUi() {
    if (typeof map !== "undefined") {
      if (typeof clusterLayer !== "undefined" && map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
      if (typeof heatProxy !== "undefined" && map.hasLayer(heatProxy)) map.removeLayer(heatProxy);
      if (typeof heatLayer !== "undefined" && heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
    }

    const filters = $("filters-panel");
    const heatPanel = $("heat-settings-panel");
    if (filters) filters.style.display = "none";
    if (heatPanel) heatPanel.style.display = "none";
  }

  function restoreMineUi() {
    if (typeof map !== "undefined") {
      if (mineLayerState.cluster && typeof clusterLayer !== "undefined" && !map.hasLayer(clusterLayer)) {
        map.addLayer(clusterLayer);
      }
      if (mineLayerState.heatProxy && typeof heatProxy !== "undefined" && !map.hasLayer(heatProxy)) {
        map.addLayer(heatProxy);
      }
    }

    const filters = $("filters-panel");
    const heatPanel = $("heat-settings-panel");
    if (filters) filters.style.display = minePanelState.filtersDisplay;
    if (heatPanel) heatPanel.style.display = minePanelState.heatSettingsDisplay;

    setText("#top-bar .brand", "MINE RISK // TRACK SYS");
    if (typeof updateHudStats === "function") updateHudStats();

    const live = $("hud-live");
    if (live) {
      live.textContent = "● LIVE FEED";
      live.style.color = "";
    }
  }

  function renderAirHud() {
    const activeCount = airEvents.filter(function (event) {
      return event && event.active === true;
    }).length;

    const withPlaces = airEvents.filter(function (event) {
      return event && Array.isArray(event.places) && event.places.length > 0;
    }).length;

    setText("#top-bar .brand", "AIR THREAT // TRACK SYS");
    setHudStat("hud-total", airEvents.length, "events loaded");
    setHudStat("hud-shown", activeCount, "active events");
    setHudStat("hud-participants", withPlaces, "with places");

    const live = $("hud-live");
    if (live) {
      live.textContent = "● AIR FEED";
      live.style.color = "var(--amber)";
    }
  }

  async function loadAirEvents() {
    const live = $("hud-live");
    if (live) {
      live.textContent = "● AIR SYNCING";
      live.style.color = "var(--amber)";
    }

    const response = await fetch(AIR_API_URL, {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      throw new Error("AIR API HTTP " + response.status);
    }

    const payload = await response.json();
    airEvents = Array.isArray(payload.events) ? payload.events : [];
    renderAirHud();
  }

  async function enterAirMode() {
    if (mode === "air") return;
    rememberMineState();
    hideMineUi();
    mode = "air";

    const button = $("toggle-air-mode");
    if (button) {
      button.textContent = "MINE";
      button.title = "Повернутися до карти мінної небезпеки";
      button.style.background = "var(--cyan-soft)";
      button.style.color = "var(--amber)";
    }

    setText("#top-bar .brand", "AIR THREAT // TRACK SYS");
    setHudStat("hud-total", "…", "events loaded");
    setHudStat("hud-shown", "…", "active events");
    setHudStat("hud-participants", "…", "with places");

    try {
      await loadAirEvents();
    } catch (error) {
      console.error("AIR mode load failed:", error);
      const live = $("hud-live");
      if (live) {
        live.textContent = "● AIR FEED ERROR";
        live.style.color = "var(--red)";
      }
      setHudStat("hud-total", "ERR", "events loaded");
      setHudStat("hud-shown", "—", "active events");
      setHudStat("hud-participants", "—", "with places");
    }
  }

  function leaveAirMode() {
    if (mode !== "air") return;
    mode = "mine";

    const button = $("toggle-air-mode");
    if (button) {
      button.textContent = "AIR";
      button.title = "Перемкнутися на спостереження за повітряними загрозами";
      button.style.background = "";
      button.style.color = "";
    }

    restoreMineUi();
  }

  function toggleMode() {
    if (mode === "mine") {
      enterAirMode();
    } else {
      leaveAirMode();
    }
  }

  function installButton() {
    const iconControl = document.querySelector(".icon-control");
    if (!iconControl || $("toggle-air-mode")) return;

    const button = document.createElement("button");
    button.id = "toggle-air-mode";
    button.type = "button";
    button.textContent = "AIR";
    button.title = "Перемкнутися на спостереження за повітряними загрозами";
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleMode();
    });

    iconControl.appendChild(button);
  }

  function init() {
    installButton();
    if (!$("toggle-air-mode")) {
      setTimeout(installButton, 250);
      setTimeout(installButton, 1000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
