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

  // =========================================================
  // AIR THREAT VISUAL SYSTEM
  // Shape = threat class
  // Color = subtype
  // =========================================================

  const THREAT_VISUALS = {
    fpv: {
      color: "#35e6ff",
      shape: "fpv"
    },

    shahed: {
      color: "#35e6ff",
      shape: "delta"
    },

    shahed_reactive: {
      color: "#d85cff",
      shape: "delta"
    },

    italmas: {
      color: "#ff77d9",
      shape: "delta"
    },

    molniya: {
      color: "#75dfff",
      shape: "delta"
    },

    kab: {
      color: "#ffc44d",
      shape: "bomb"
    },

    cruise_missile: {
      color: "#ff624d",
      shape: "missile"
    },

    banderol: {
      color: "#ff9b52",
      shape: "missile"
    },

    missile: {
      color: "#ff4747",
      shape: "missile"
    },

    iskander: {
      color: "#ff3030",
      shape: "missile"
    },

    lancet: {
      color: "#9c7cff",
      shape: "delta"
    },

    tactical_aviation: {
      color: "#ffcc66",
      shape: "aircraft"
    },

    attack_uav_unknown: {
      color: "#63e8ff",
      shape: "uav"
    },

    jet_uav_unknown: {
      color: "#c27bff",
      shape: "uav"
    },

    recon_uav_unknown: {
      color: "#62d6a7",
      shape: "uav"
    },

    uav_unknown: {
      color: "#8adfff",
      shape: "uav"
    },

    default: {
      color: "#35e6ff",
      shape: "unknown"
    }
  };


  function normalizeThreatToken(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }


  function resolveThreatVisualType(track) {
    if (!track || typeof track !== "object") {
      return "default";
    }

    const values = [];

    if (typeof track.threat === "string") {
      values.push(track.threat);
    }

    if (track.threat && typeof track.threat === "object") {
      values.push(
        track.threat.id,
        track.threat.canonical_name,
        track.threat.name,
        track.threat.label
      );
    }

    values.push(
      track.threat_id,
      track.threat_name,
      track.classification,
      track.event_type
    );

    if (Array.isArray(track.threats)) {
      track.threats.forEach(function(item) {
        if (typeof item === "string") {
          values.push(item);
        } else if (item && typeof item === "object") {
          values.push(
            item.id,
            item.canonical_name,
            item.name,
            item.label
          );
        }
      });
    }

    const joined = values
      .filter(Boolean)
      .map(normalizeThreatToken)
      .join(" ");

    if (joined.includes("shahed_reactive")) {
      return "shahed_reactive";
    }

    if (
      joined.includes("italmas") ||
      joined.includes("італмас") ||
      joined.includes("италмас")
    ) {
      return "italmas";
    }

    if (
      joined.includes("banderol") ||
      joined.includes("бандероль")
    ) {
      return "banderol";
    }

    if (
      joined.includes("cruise_missile") ||
      joined.includes("крылат") ||
      joined.includes("крилат")
    ) {
      return "cruise_missile";
    }

    if (
      joined.includes("iskander") ||
      joined.includes("іскандер") ||
      joined.includes("искандер")
    ) {
      return "iskander";
    }

    if (joined.includes("molniya")) {
      return "molniya";
    }

    if (joined.includes("lancet")) {
      return "lancet";
    }

    if (
      joined.includes("shahed") ||
      joined.includes("шахед") ||
      joined.includes("шаболд") ||
      joined.includes("шлюх")
    ) {
      return "shahed";
    }

    if (joined.includes("fpv")) {
      return "fpv";
    }

    if (
      joined.includes("kab") ||
      joined.includes("каб")
    ) {
      return "kab";
    }

    if (joined.includes("tactical_aviation")) {
      return "tactical_aviation";
    }

    if (joined.includes("jet_uav_unknown")) {
      return "jet_uav_unknown";
    }

    if (joined.includes("recon_uav_unknown")) {
      return "recon_uav_unknown";
    }

    if (joined.includes("attack_uav_unknown")) {
      return "attack_uav_unknown";
    }

    if (joined.includes("uav_unknown")) {
      return "uav_unknown";
    }

    if (
      joined.includes("missile") ||
      joined.includes("ракета")
    ) {
      return "missile";
    }

    return "default";
  }


  function threatSvg(shape) {
    switch (shape) {

      case "fpv":
        return `
          <svg viewBox="0 0 100 100">
            <g fill="currentColor">
              <path d="M44 40 L26 25 L20 31 L38 48 Z"/>
              <path d="M56 40 L74 25 L80 31 L62 48 Z"/>
              <path d="M44 60 L26 75 L20 69 L38 52 Z"/>
              <path d="M56 60 L74 75 L80 69 L62 52 Z"/>

              <rect x="39" y="36"
                    width="22" height="28"
                    rx="3"/>

              <rect x="46" y="25"
                    width="8" height="13"
                    rx="2"/>

              <ellipse cx="18" cy="23"
                       rx="16" ry="5"
                       transform="rotate(25 18 23)"/>

              <ellipse cx="82" cy="23"
                       rx="16" ry="5"
                       transform="rotate(-25 82 23)"/>

              <ellipse cx="18" cy="77"
                       rx="16" ry="5"
                       transform="rotate(-25 18 77)"/>

              <ellipse cx="82" cy="77"
                       rx="16" ry="5"
                       transform="rotate(25 82 77)"/>
            </g>
          </svg>
        `;


      case "delta":
        return `
          <svg viewBox="0 0 100 100">
            <path
              fill="currentColor"
              d="
                M50 8
                L57 22
                L85 51
                L85 67
                L59 61
                L55 88
                L45 88
                L41 61
                L15 67
                L15 51
                L43 22
                L43 8
                Z
              "
            />
          </svg>
        `;


      case "bomb":
        return `
          <svg viewBox="0 0 100 100">
            <g fill="currentColor">
              <path d="
                M43 8
                L57 8
                L57 24
                L64 34
                L67 68
                C67 82 60 91 50 94
                C40 91 33 82 33 68
                L36 34
                L43 24
                Z
              "/>

              <path d="M36 31 L21 20 L21 45 L35 52 Z"/>
              <path d="M64 31 L79 20 L79 45 L65 52 Z"/>
            </g>
          </svg>
        `;


      case "missile":
        return `
          <svg viewBox="0 0 120 70">
            <g fill="currentColor">
              <path d="
                M10 35
                L25 26
                L88 26
                C101 26 110 30 116 35
                C110 40 101 44 88 44
                L25 44
                Z
              "/>

              <path d="M46 26 L54 7 L62 7 L59 26 Z"/>
              <path d="M46 44 L54 63 L62 63 L59 44 Z"/>

              <path d="M25 26 L17 14 L9 14 L14 30 Z"/>
              <path d="M25 44 L17 56 L9 56 L14 40 Z"/>
            </g>
          </svg>
        `;


      case "aircraft":
        return `
          <svg viewBox="0 0 100 100">
            <path
              fill="currentColor"
              d="
                M47 6
                L53 6
                L57 39
                L88 53
                L88 61
                L57 56
                L55 82
                L67 89
                L67 94
                L50 91
                L33 94
                L33 89
                L45 82
                L43 56
                L12 61
                L12 53
                L43 39
                Z
              "
            />
          </svg>
        `;


      case "uav":
        return `
          <svg viewBox="0 0 100 100">
            <path
              fill="currentColor"
              d="
                M50 13
                L59 34
                L82 44
                L82 58
                L59 55
                L55 84
                L45 84
                L41 55
                L18 58
                L18 44
                L41 34
                Z
              "
            />
          </svg>
        `;


      default:
        return `
          <svg viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="21"
              fill="currentColor"
            />
          </svg>
        `;
    }
  }


  function clampThreatSize(value, minValue, maxValue) {
    return Math.max(
      minValue,
      Math.min(maxValue, value)
    );
  }


  function threatIconSize(active) {
    const zoom =
      typeof map !== "undefined"
        ? map.getZoom()
        : 8;

    const scale = Math.pow(
      1.18,
      zoom - 8
    );

    if (active) {
      return Math.round(
        clampThreatSize(
          28 * scale,
          18,
          46
        )
      );
    }

    return Math.round(
      clampThreatSize(
        15 * scale,
        9,
        24
      )
    );
  }


  function createThreatIcon(track, active) {
    const type =
      resolveThreatVisualType(track);

    const visual =
      THREAT_VISUALS[type] ||
      THREAT_VISUALS.default;

    const size =
      threatIconSize(active);

    const cssClass =
      active
        ? "air-threat-symbol-active"
        : "air-threat-symbol-history";

    return L.divIcon({
      className: "",
      html: `
        <div
          class="air-threat-symbol ${cssClass}"
          style="
            width:${size}px;
            height:${size}px;
            color:${visual.color};
          "
        >
          <div class="air-threat-symbol-glow"></div>

          <div class="air-threat-symbol-svg">
            ${threatSvg(visual.shape)}
          </div>
        </div>
      `,
      iconSize: [
        size,
        size
      ],
      iconAnchor: [
        size / 2,
        size / 2
      ],
      popupAnchor: [
        0,
        -(size / 2 + 4)
      ]
    });
  }


  function updateThreatMarkerScale() {
    if (airMarkerLayer) {
      airMarkerLayer.eachLayer(function(layer) {
        if (
          typeof layer.setIcon === "function" &&
          layer.__airThreatTrack
        ) {
          layer.setIcon(
            createThreatIcon(
              layer.__airThreatTrack,
              true
            )
          );
        }
      });
    }

    if (airHistoryLayer) {
      airHistoryLayer.eachLayer(function(layer) {
        if (
          typeof layer.setIcon === "function" &&
          layer.__airThreatTrack
        ) {
          layer.setIcon(
            createThreatIcon(
              layer.__airThreatTrack,
              false
            )
          );
        }
      });
    }
  }


  function installThreatIconStyles() {
    if (
      document.getElementById(
        "air-threat-icon-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "air-threat-icon-styles";

    style.textContent = `
      .air-threat-symbol {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;

        filter:
          drop-shadow(0 0 2px currentColor)
          drop-shadow(0 0 7px currentColor);
      }

      .air-threat-symbol-svg {
        position: relative;
        width: 100%;
        height: 100%;
        z-index: 2;
      }

      .air-threat-symbol-svg svg {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
      }

      .air-threat-symbol-glow {
        position: absolute;
        inset: 18%;
        border-radius: 50%;
        background: currentColor;
        opacity: .18;
        filter: blur(8px);
        z-index: 1;
        pointer-events: none;
      }

      .air-threat-symbol-active {
        opacity: 1;

        filter:
          drop-shadow(0 0 3px currentColor)
          drop-shadow(0 0 9px currentColor)
          drop-shadow(0 0 15px currentColor);
      }

      .air-threat-symbol-active::after {
        content: "";
        position: absolute;
        inset: -6px;
        border: 1px solid currentColor;
        border-radius: 50%;
        opacity: .65;

        animation:
          airThreatPulse
          1.9s
          ease-out
          infinite;
      }

      .air-threat-symbol-history {
        opacity: .62;

        filter:
          drop-shadow(0 0 2px currentColor)
          drop-shadow(0 0 5px currentColor);
      }

      @keyframes airThreatPulse {
        0% {
          transform: scale(.72);
          opacity: .72;
        }

        100% {
          transform: scale(1.85);
          opacity: 0;
        }
      }
    `;

    document.head.appendChild(style);
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
      icon: createThreatIcon(
        track,
        false
      ),
      keyboard: true,
      riseOnHover: true,
      zIndexOffset: -100
    });

    marker.__airThreatTrack = track;

    marker.bindPopup(
      buildPopupHtml(thread, track, event, place, "history"),
      { maxWidth: 340 }
    );

    installMarkerClickReticle(marker);
    marker.addTo(airHistoryLayer);
    return true;
  }

  function addReportedEventPlace(
    thread,
    track,
    event,
    place,
    seenHistory,
    currentKey
  ) {
    if (!event || !place) {
      return false;
    }

    const latlng =
      geometryToLatLng(place);

    if (!latlng) {
      return false;
    }

    const endpoint = {
      message_id:
        event.message_id,

      telegram_date:
        event.telegram_date,

      place:
        place
    };

    const key =
      endpointKey(endpoint);

    if (
      !key ||
      seenHistory.has(key) ||
      key === currentKey
    ) {
      return false;
    }

    seenHistory.add(key);

    const marker = L.marker(
      latlng,
      {
        icon: createThreatIcon(
          track,
          false
        ),

        keyboard: true,
        riseOnHover: true,
        zIndexOffset: -100
      }
    );

    marker.__airThreatTrack =
      track;

    marker.bindPopup(
      buildPopupHtml(
        thread,
        track,
        event,
        place,
        "history"
      ),
      {
        maxWidth: 340
      }
    );

    installMarkerClickReticle(
      marker
    );

    marker.addTo(
      airHistoryLayer
    );

    return true;
  }


  function buildSmoothCurvePoints(
    fromLatLng,
    toLatLng,
    curvature = 0.18,
    steps = 28
  ) {
    if (!fromLatLng || !toLatLng) {
      return [];
    }

    /*
     * geometryToLatLng() returns [lat, lon].
     * Normalize both arrays and Leaflet LatLng objects here.
     */
    const from = Array.isArray(fromLatLng)
      ? L.latLng(fromLatLng[0], fromLatLng[1])
      : L.latLng(fromLatLng);

    const to = Array.isArray(toLatLng)
      ? L.latLng(toLatLng[0], toLatLng[1])
      : L.latLng(toLatLng);

    const x1 = from.lng;
    const y1 = from.lat;
    const x2 = to.lng;
    const y2 = to.lat;

    const dx = x2 - x1;
    const dy = y2 - y1;

    const length = Math.sqrt(
      dx * dx + dy * dy
    );

    if (!length) {
      return [
        L.latLng(y1, x1),
        L.latLng(y2, x2)
      ];
    }

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    const nx = -dy / length;
    const ny = dx / length;

    const direction =
      x1 <= x2 ? 1 : -1;

    const offset =
      length * curvature;

    const cx =
      mx + nx * offset * direction;

    const cy =
      my + ny * offset * direction;

    const points = [];

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const oneMinusT = 1 - t;

      const x =
        oneMinusT * oneMinusT * x1 +
        2 * oneMinusT * t * cx +
        t * t * x2;

      const y =
        oneMinusT * oneMinusT * y1 +
        2 * oneMinusT * t * cy +
        t * t * y2;

      points.push(
        L.latLng(y, x)
      );
    }

    return points;
  }


  function drawSmoothTrackCurve(
    fromLatLng,
    toLatLng,
    lineKey,
    seenEdges
  ) {
    if (
      !fromLatLng ||
      !toLatLng ||
      !lineKey
    ) {
      return false;
    }

    if (seenEdges.has(lineKey)) {
      return false;
    }

    seenEdges.add(lineKey);

    const points =
      buildSmoothCurvePoints(
        fromLatLng,
        toLatLng
      );

    if (!points.length) {
      return false;
    }

    /*
     * Neon trajectory:
     *
     * wide transparent underlay = glow
     * thin bright overlay        = core
     *
     * The line remains clearly readable without visually
     * overpowering the threat icons.
     */

    const glowLine = L.polyline(
      points,
      {
        color: "#ff496b",
        weight: 7.2,
        opacity: 0.22,
        lineCap: "round",
        lineJoin: "round",
        interactive: false
      }
    );

    const coreLine = L.polyline(
      points,
      {
        color: "#ff496b",
        weight: 2.0,
        opacity: 0.94,
        lineCap: "round",
        lineJoin: "round",
        interactive: false
      }
    );

    glowLine.addTo(
      airHistoryLayer
    );

    coreLine.addTo(
      airHistoryLayer
    );

    return true;
  }


  function drawTrackSequenceCurves(
    thread,
    track,
    seenEdges
  ) {
    (track.segments || []).forEach(function (segment) {
      const sequence = [];

      (segment.events || []).forEach(function (event) {
        (event.places || []).forEach(function (place) {
          const latlng =
            geometryToLatLng(place);

          if (!latlng) {
            return;
          }

          sequence.push({
            event: event,
            place: place,
            latlng: latlng
          });
        });
      });

      for (let i = 0; i < sequence.length - 1; i += 1) {
        const current =
          sequence[i];

        const next =
          sequence[i + 1];

        if (
          !current ||
          !next ||
          !current.latlng ||
          !next.latlng
        ) {
          continue;
        }

        const lineKey = [
          "smooth-track",
          track.track_id ||
            thread.root_message_id ||
            "unknown-track",
          segment.segment_id ||
            "unknown-segment",
          current.event.message_id ||
            "m1",
          current.place.id ||
            current.place.canonical_name ||
            "p1",
          next.event.message_id ||
            "m2",
          next.place.id ||
            next.place.canonical_name ||
            "p2"
        ].join("|");

        drawSmoothTrackCurve(
          current.latlng,
          next.latlng,
          lineKey,
          seenEdges
        );
      }
    });
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

      /*
       * REPORTED POSITIONS
       *
       * Every place explicitly present in an event may be shown
       * as a historical reported position if geometry is resolved.
       *
       * IMPORTANT:
       * Showing a marker does NOT imply movement between markers.
       * Lines remain controlled exclusively by drawable_edges.
       */
      (track.segments || []).forEach(function (segment) {

        (segment.events || []).forEach(function (event) {

          (event.places || []).forEach(function (place) {

            if (
              addReportedEventPlace(
                thread,
                track,
                event,
                place,
                seenHistory,
                currentKey
              )
            ) {
              historicalCount += 1;
            }

          });

        });

      });

      /*
       * VISUAL TRACK STITCHING
       *
       * Draw smooth neon curves through all sequential
       * reported positions of the same track.
       *
       * This includes:
       * - multiple places mentioned in one message
       * - next reply updates in the same track
       */
      drawTrackSequenceCurves(
        thread,
        track,
        seenEdges
      );

      if (!observation) return;

      const marker = L.marker(observation.latlng, {
        icon: createThreatIcon(
          track,
          true
        ),
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: 500
      });

      marker.__airThreatTrack = track;

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
        stats.edges + " rendered track curves; " +
        stats.historicalMarkers + " reported historical positions";
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
    installThreatIconStyles();
    ensureAirLayers();
    installButton();

    if (typeof map !== "undefined") {
      map.on(
        "zoomend",
        updateThreatMarkerScale
      );
    }

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
