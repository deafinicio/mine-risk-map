(function () {
  "use strict";

  const AIR_API_URL = "https://89-168-114-2.sslip.io/api/air/tracks";
  const AIR_LOOKBACK_HOURS = 12;
  const AIR_LIMIT_THREADS = 200;
  const AIR_REFRESH_MS = 15000;

  let mode = "mine";
  let refreshTimer = null;
  let activeRequest = null;
  let lastPayload = null;

  let airLayerGroup = null;
  let airMarkerLayer = null;
  let airHistoryLayer = null;
  let airGlowLayer = null;
  let airCoreLayer = null;

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

    const labelEl = valueEl.parentElement &&
      valueEl.parentElement.querySelector("span");

    if (labelEl) labelEl.textContent = label;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);

    return date.toLocaleString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function threatLabel(track) {
    if (!track || typeof track !== "object") return "Повітряна загроза";

    const threat = track.threat;

    if (typeof threat === "string" && threat) {
      return threat;
    }

    if (threat && typeof threat === "object") {
      return threat.canonical_name ||
        threat.name ||
        threat.label ||
        threat.id ||
        "Повітряна загроза";
    }

    return track.threat_name ||
      track.threat_id ||
      track.classification ||
      "Повітряна загроза";
  }

  function ensureAirLayers() {
    if (airLayerGroup) return;

    airGlowLayer = L.layerGroup();
    airCoreLayer = L.layerGroup();
    airHistoryLayer = L.layerGroup();
    airMarkerLayer = L.layerGroup();

    airLayerGroup = L.layerGroup([
      airGlowLayer,
      airCoreLayer,
      airHistoryLayer,
      airMarkerLayer
    ]);
  }

  function clearAirLayers() {
    if (airMarkerLayer) airMarkerLayer.clearLayers();
    if (airHistoryLayer) airHistoryLayer.clearLayers();
    if (airGlowLayer) airGlowLayer.clearLayers();
    if (airCoreLayer) airCoreLayer.clearLayers();
  }

  function addAirLayerToMap() {
    ensureAirLayers();

    if (typeof map !== "undefined" && !map.hasLayer(airLayerGroup)) {
      airLayerGroup.addTo(map);
    }
  }

  function removeAirLayerFromMap() {
    if (
      airLayerGroup &&
      typeof map !== "undefined" &&
      map.hasLayer(airLayerGroup)
    ) {
      map.removeLayer(airLayerGroup);
    }
  }

  function rememberMineState() {
    if (typeof map !== "undefined") {
      mineLayerState.cluster =
        typeof clusterLayer !== "undefined" &&
        map.hasLayer(clusterLayer);

      mineLayerState.heatProxy =
        typeof heatProxy !== "undefined" &&
        map.hasLayer(heatProxy);

      mineLayerState.heatLayer =
        typeof heatLayer !== "undefined" &&
        heatLayer &&
        map.hasLayer(heatLayer);
    }

    const filters = $("filters-panel");
    const heatPanel = $("heat-settings-panel");

    if (filters) minePanelState.filtersDisplay = filters.style.display;
    if (heatPanel) minePanelState.heatSettingsDisplay = heatPanel.style.display;
  }

  function hideMineUi() {
    if (typeof map !== "undefined") {
      if (
        typeof clusterLayer !== "undefined" &&
        map.hasLayer(clusterLayer)
      ) {
        map.removeLayer(clusterLayer);
      }

      if (
        typeof heatProxy !== "undefined" &&
        map.hasLayer(heatProxy)
      ) {
        map.removeLayer(heatProxy);
      }

      if (
        typeof heatLayer !== "undefined" &&
        heatLayer &&
        map.hasLayer(heatLayer)
      ) {
        map.removeLayer(heatLayer);
      }
    }

    const filters = $("filters-panel");
    const heatPanel = $("heat-settings-panel");

    if (filters) filters.style.display = "none";
    if (heatPanel) heatPanel.style.display = "none";
  }

  function restoreMineUi() {
    if (typeof map !== "undefined") {
      if (
        mineLayerState.cluster &&
        typeof clusterLayer !== "undefined" &&
        !map.hasLayer(clusterLayer)
      ) {
        map.addLayer(clusterLayer);
      }

      if (
        mineLayerState.heatProxy &&
        typeof heatProxy !== "undefined" &&
        !map.hasLayer(heatProxy)
      ) {
        map.addLayer(heatProxy);
      }
    }

    const filters = $("filters-panel");
    const heatPanel = $("heat-settings-panel");

    if (filters) filters.style.display = minePanelState.filtersDisplay;
    if (heatPanel) heatPanel.style.display = minePanelState.heatSettingsDisplay;

    setText("#top-bar .brand", "MINE RISK // TRACK SYS");

    if (typeof updateHudStats === "function") {
      updateHudStats();
    }

    const live = $("hud-live");
    if (live) {
      live.textContent = "● LIVE FEED";
      live.style.color = "";
      live.title = "";
    }
  }

  function isTrackActive(track) {
    return track && track.active === true;
  }

  function getThreads(payload) {
    return payload && Array.isArray(payload.threads)
      ? payload.threads
      : [];
  }

  function getTracks(payload) {
    const tracks = [];

    getThreads(payload).forEach(function (thread) {
      (thread.tracks || []).forEach(function (track) {
        tracks.push({
          thread: thread,
          track: track
        });
      });
    });

    return tracks;
  }

  function geometryToLatLng(place) {
    if (!place || place.geometry_resolved !== true) return null;

    const geometry = place.geometry;
    const coords = geometry && geometry.coordinates;

    if (
      !geometry ||
      geometry.type !== "Point" ||
      !Array.isArray(coords) ||
      coords.length < 2
    ) {
      return null;
    }

    const lon = Number(coords[0]);
    const lat = Number(coords[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return [lat, lon];
  }

  function getLatestResolvedObservation(track) {
    const segments = Array.isArray(track && track.segments)
      ? track.segments
      : [];

    for (let s = segments.length - 1; s >= 0; s -= 1) {
      const events = Array.isArray(segments[s].events)
        ? segments[s].events
        : [];

      for (let e = events.length - 1; e >= 0; e -= 1) {
        const event = events[e];
        const places = Array.isArray(event.places)
          ? event.places
          : [];

        if (places.length !== 1) continue;

        const latlng = geometryToLatLng(places[0]);
        if (!latlng) continue;

        return {
          event: event,
          place: places[0],
          latlng: latlng,
          segment: segments[s]
        };
      }
    }

    return null;
  }

  function sourceText(event) {
    if (!event || typeof event !== "object") return "";

    return event.original_text ||
      event.text ||
      event.raw_text ||
      event.source_text ||
      "";
  }

  function buildPopupHtml(thread, track, event, place, kind) {
    const rootId = thread && thread.root_message_id;
    const trackId = track && track.track_id;
    const report = sourceText(event);
    const isCurrent = kind === "current";

    let html =
      "<b>" + escapeHtml(threatLabel(track)) + "</b><br>" +
      '<span style="color:' + (isCurrent ? 'var(--cyan)' : 'var(--text-dim)') + '">' +
      (isCurrent ? "CURRENT REPORTED POSITION" : "REPORTED POSITION") +
      "</span><br>" +
      "Місце: " + escapeHtml(place.canonical_name || place.id || "—") + "<br>" +
      "Час повідомлення: " + formatDate(event.telegram_date) + "<br>" +
      "Статус треку: " + escapeHtml(
        track.active === true ? "ACTIVE" : "INACTIVE"
      );

    if (trackId) html += "<br>Track: " + escapeHtml(trackId);
    if (rootId) html += "<br>Thread: " + escapeHtml(rootId);
    if (event.message_id) html += "<br>Message: " + escapeHtml(event.message_id);

    if (report) {
      html +=
        '<br><br><span style="color:var(--text-dim)">SOURCE REPORT</span><br>' +
        escapeHtml(report).replace(/\n/g, "<br>");
    }

    html += isCurrent
      ? '<br><br><span style="color:var(--text-dim)">Великий пульсуючий маркер — остання однозначно геоприв’язана reported position цього активного треку.</span>'
      : '<br><br><span style="color:var(--text-dim)">Мала точка — історична reported position. Вона не є прогнозом поточного місцеположення.</span>';

    return html;
  }

  function airDivIcon() {
    return L.divIcon({
      className: "",
      html: '<div class="hud-marker" style="width:16px;height:16px"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -10]
    });
  }

  function historyDivIcon() {
    return L.divIcon({
      className: "",
      html:
        '<div style="' +
        'width:8px;height:8px;border-radius:50%;' +
        'background:#35e6ff;border:1px solid #9ff4ff;' +
        'box-shadow:0 0 7px rgba(53,230,255,.85);' +
        'opacity:.82' +
        '"></div>',
      iconSize: [8, 8],
      iconAnchor: [4, 4],
      popupAnchor: [0, -7]
    });
  }

  function installMarkerClickReticle(marker) {
    marker.on("click", function (e) {
      if (
        typeof map !== "undefined" &&
        typeof showLockReticle === "function"
      ) {
        const point = map.latLngToContainerPoint(e.latlng);
        showLockReticle(point);
      }
    });
  }

  function endpointKey(endpoint) {
    const place = endpoint && endpoint.place || {};
    return [
      endpoint && endpoint.message_id || "",
      place.id || "",
      endpoint && endpoint.telegram_date || ""
    ].join("|");
  }

  function addHistoricalEndpoint(thread, track, endpoint, seenHistory, currentKey) {
    if (!endpoint || !endpoint.place) return false;

    const place = endpoint.place;
    const latlng = geometryToLatLng(place);
    if (!latlng) return false;

    const key = endpointKey(endpoint);
    if (!key || seenHistory.has(key) || key === currentKey) return false;
    seenHistory.add(key);

    const event = {
      message_id: endpoint.message_id,
      telegram_date: endpoint.telegram_date
    };

    const marker = L.marker(latlng, {
      icon: historyDivIcon(),
      keyboard: true,
      riseOnHover: true,
      zIndexOffset: -100
    });

    marker.bindPopup(
      buildPopupHtml(thread, track, event, place, "history"),
      { maxWidth: 340 }
    );

    installMarkerClickReticle(marker);
    marker.addTo(airHistoryLayer);
    return true;
  }

  function drawEdge(edge, seenEdges) {
    if (!edge || edge.geometry_drawable !== true) return false;
    if (edge.source_only !== true) return false;

    const fromEndpoint = edge.from || {};
    const toEndpoint = edge.to || {};
    const fromPlace = fromEndpoint.place || {};
    const toPlace = toEndpoint.place || {};

    const fromLatLng = geometryToLatLng(fromPlace);
    const toLatLng = geometryToLatLng(toPlace);

    if (!fromLatLng || !toLatLng) return false;

    const key = [
      fromEndpoint.message_id || "",
      fromPlace.id || "",
      toEndpoint.message_id || "",
      toPlace.id || ""
    ].join("|");

    if (seenEdges.has(key)) return false;
    seenEdges.add(key);

    const latlngs = [fromLatLng, toLatLng];

    L.polyline(latlngs, {
      color: "#ff4455",
      weight: 8,
      opacity: 0.16,
      interactive: false,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(airGlowLayer);

    L.polyline(latlngs, {
      color: "#ff5b5b",
      weight: 2,
      opacity: 0.88,
      interactive: false,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(airCoreLayer);

    return true;
  }

  function renderAirPayload(payload) {
    ensureAirLayers();
    clearAirLayers();
    addAirLayerToMap();

    const trackRows = getTracks(payload);
    const activeRows = trackRows.filter(function (row) {
      return isTrackActive(row.track);
    });

    const seenEdges = new Set();
    const seenHistory = new Set();
    let markerCount = 0;
    let historicalCount = 0;
    let edgeCount = 0;

    activeRows.forEach(function (row) {
      const thread = row.thread;
      const track = row.track;
      const observation = getLatestResolvedObservation(track);

      const currentKey = observation
        ? endpointKey({
            message_id: observation.event.message_id,
            telegram_date: observation.event.telegram_date,
            place: observation.place
          })
        : "";

      (track.segments || []).forEach(function (segment) {
        (segment.drawable_edges || []).forEach(function (edge) {
          if (drawEdge(edge, seenEdges)) {
            edgeCount += 1;

            if (addHistoricalEndpoint(thread, track, edge.from, seenHistory, currentKey)) {
              historicalCount += 1;
            }

            if (addHistoricalEndpoint(thread, track, edge.to, seenHistory, currentKey)) {
              historicalCount += 1;
            }
          }
        });
      });

      if (!observation) return;

      const marker = L.marker(observation.latlng, {
        icon: airDivIcon(),
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: 500
      });

      marker.bindPopup(
        buildPopupHtml(
          thread,
          track,
          observation.event || {},
          observation.place || {},
          "current"
        ),
        { maxWidth: 360 }
      );

      installMarkerClickReticle(marker);
      marker.addTo(airMarkerLayer);
      markerCount += 1;
    });

    return {
      loadedTracks: trackRows.length,
      activeTracks: activeRows.length,
      markers: markerCount,
      historicalMarkers: historicalCount,
      edges: edgeCount
    };
  }

  function renderAirHud(stats) {
    setText("#top-bar .brand", "AIR THREAT // TRACK SYS");
    setHudStat("hud-total", stats.loadedTracks, "tracks loaded");
    setHudStat("hud-shown", stats.activeTracks, "active tracks");
    setHudStat("hud-participants", stats.markers, "mapped positions");

    const live = $("hud-live");
    if (live) {
      live.textContent = "● AIR FEED";
      live.style.color = "var(--amber)";
      live.title =
        stats.edges + " source-only edges; " +
        stats.historicalMarkers + " historical reported positions";
    }
  }

  function buildAirUrl() {
    const params = new URLSearchParams({
      lookback_hours: String(AIR_LOOKBACK_HOURS),
      limit_threads: String(AIR_LIMIT_THREADS),
      map_ready_only: "true"
    });

    return AIR_API_URL + "?" + params.toString();
  }

  async function loadAirTracks() {
    if (mode !== "air") return;

    if (activeRequest) {
      activeRequest.abort();
    }

    activeRequest = new AbortController();

    const live = $("hud-live");
    if (live) {
      live.textContent = "● AIR SYNCING";
      live.style.color = "var(--amber)";
    }

    try {
      const response = await fetch(buildAirUrl(), {
        method: "GET",
        cache: "no-store",
        headers: {
          "Accept": "application/json"
        },
        signal: activeRequest.signal
      });

      if (!response.ok) {
        throw new Error("AIR API HTTP " + response.status);
      }

      const payload = await response.json();

      if (mode !== "air") return;

      lastPayload = payload;
      const stats = renderAirPayload(payload);
      renderAirHud(stats);
    } catch (error) {
      if (error && error.name === "AbortError") return;

      console.error("AIR mode load failed:", error);

      const errorLive = $("hud-live");
      if (errorLive) {
        errorLive.textContent = "● AIR FEED ERROR";
        errorLive.style.color = "var(--red)";
      }

      if (!lastPayload) {
        setHudStat("hud-total", "ERR", "tracks loaded");
        setHudStat("hud-shown", "—", "active tracks");
        setHudStat("hud-participants", "—", "mapped positions");
      }
    } finally {
      activeRequest = null;
    }
  }

  function startRefreshLoop() {
    stopRefreshLoop();

    refreshTimer = window.setInterval(function () {
      if (mode === "air") {
        loadAirTracks();
      }
    }, AIR_REFRESH_MS);
  }

  function stopRefreshLoop() {
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  async function enterAirMode() {
    if (mode === "air") return;

    rememberMineState();
    hideMineUi();

    mode = "air";
    lastPayload = null;

    addAirLayerToMap();

    const button = $("toggle-air-mode");
    if (button) {
      button.textContent = "MINE";
      button.title = "Повернутися до карти мінної небезпеки";
      button.style.background = "var(--cyan-soft)";
      button.style.color = "var(--amber)";
    }

    setText("#top-bar .brand", "AIR THREAT // TRACK SYS");
    setHudStat("hud-total", "…", "tracks loaded");
    setHudStat("hud-shown", "…", "active tracks");
    setHudStat("hud-participants", "…", "mapped positions");

    await loadAirTracks();

    if (mode === "air") {
      startRefreshLoop();
    }
  }

  function leaveAirMode() {
    if (mode !== "air") return;

    mode = "mine";
    stopRefreshLoop();

    if (activeRequest) {
      activeRequest.abort();
      activeRequest = null;
    }

    clearAirLayers();
    removeAirLayerFromMap();

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

  function suppressMineOverlayInAir(event) {
    if (mode !== "air" || !event || typeof map === "undefined") return;

    const mineOverlay =
      (typeof clusterLayer !== "undefined" && event.layer === clusterLayer) ||
      (typeof heatProxy !== "undefined" && event.layer === heatProxy);

    if (!mineOverlay) return;

    window.setTimeout(function () {
      if (mode === "air" && map.hasLayer(event.layer)) {
        map.removeLayer(event.layer);
      }
    }, 0);
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
    ensureAirLayers();
    installButton();

    if (typeof map !== "undefined") {
      map.on("overlayadd", suppressMineOverlayInAir);
    }

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
