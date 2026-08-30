(function () {
  "use strict";

  const AIR_API_URL = "https://89-168-114-2.sslip.io/api/monitor/tracks";
  const AIR_LOOKBACK_HOURS = 12;
  const AIR_LIMIT_THREADS = 200;
  const AIR_REFRESH_MS = 5000;

/*
 * Optional AIR debug mode.
 *
 * Example:
 *   ?airDebugTrack=147323:147333
 *
 * Without this parameter normal live behaviour is unchanged.
 */
const AIR_DEBUG_TRACK_ID = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("airDebugTrack");
    return value ? String(value).trim() : "";
  } catch (error) {
    return "";
  }
})();


function isRequestedAirDebugTrack(track) {
  if (!AIR_DEBUG_TRACK_ID || !track) {
    return false;
  }

  const candidates = [
    track.track_id,
    track.branch_id,
    track.id
  ]
    .filter(
      function(value) {
        return value !== null &&
          value !== undefined &&
          String(value).length > 0;
      }
    )
    .map(
      function(value) {
        return String(value);
      }
    );

  return candidates.includes(AIR_DEBUG_TRACK_ID);
}



  const AIR_DEBUG_API_BASE =
    "https://89-168-114-2.sslip.io/api/monitor/debug-track";


  function buildAirDebugTrackUrl() {
    if (!AIR_DEBUG_TRACK_ID) {
      return null;
    }

    const match =
      AIR_DEBUG_TRACK_ID.match(
        /^(\d+):(\d+)$/
      );

    if (!match) {
      console.warn(
        "[AIR DEBUG] invalid track id:",
        AIR_DEBUG_TRACK_ID
      );

      return null;
    }

    return (
      AIR_DEBUG_API_BASE +
      "/" +
      encodeURIComponent(match[1]) +
      "/" +
      encodeURIComponent(match[2]) +
      "?t=" +
      Date.now()
    );
  }


  const AIR_DISCLAIMER_TITLE =
    "AIR DATA // IMPORTANT NOTICE";


  const AIR_DISCLAIMER_LINES = [
    "Карта не відображає підтверджені реальні поточні координати повітряних загроз.",
    "Маркери та лінії є візуальним представленням інформації з відкритих повідомлень. Частина точок може бути приблизно розрахована між указаними географічними орієнтирами.",
    "Інформація може надходити та відображатися з невеликою затримкою, бути неповною або неточною.",
    "Карта має виключно інформаційний характер і не призначена для планування місій, маршрутів пересування, визначення безпечних зон або прийняття рішень, від яких залежить безпека людей.",
    "Під час повітряної тривоги керуйтеся офіційними повідомленнями та правилами цивільного захисту."
  ];


  const AIR_DEMO_URL =
    "./demo-air.json";

  const AIR_RING_ROAD_URL =
    "./kharkiv-ring-road.geojson";

  const AIR_DATA_MODE_STORAGE_KEY =
    "mine-risk-map-air-data-mode-v1";

  let airDataMode =
    localStorage.getItem(
      AIR_DATA_MODE_STORAGE_KEY
    ) === "demo"
      ? "demo"
      : "live";

  /*
   * LIVE operational TTL.
   *
   * A logical track may remain active in backend if TLK
   * never publishes an explicit closing status.
   *
   * On the LIVE map we therefore stop treating a track as
   * current after 30 minutes without a new source report.
   *
   * The track is NOT deleted. It remains available for
   * history/timeline analysis.
   */
  const AIR_ACTIVE_STALE_MS =
    30 * 60 * 1000;

  let mode = "mine";
  let refreshTimer = null;
  let activeRequest = null;
  let lastPayload = null;

  let airLayerGroup = null;
  let airMarkerLayer = null;
  let airTerminalLayer = null;
  let airHistoryLayer = null;
  let airGlowLayer = null;
  let airCoreLayer = null;

  let airVisualSettingsControl = null;
  let airVisualRaf = null;

  let airRingRoadGeometry = null;
  let airRingRoadLayer = null;
  let airRingRoadLoadPromise = null;

  /*
   * Track visualization modes:
   *
   * selected = history/curve only for clicked target
   * all      = history/curves for every visible track
   * off      = no history/curves
   */
  let airTrackDisplayMode =
    "all";

  let selectedAirTrackId =
    null;

  let reopenSelectedPopup =
    false;

  const AIR_VISUAL_STORAGE_KEY =
    "mine-risk-map-air-visual-v1";

  const AIR_VISUAL_DEFAULTS = {
    iconGlow: 100,
    glowRadius: 8,
    pulse: 65,
    trackGlow: 22,
    trackWidth: 2.0,
    ringRoadIntensity: 55
  };

  let airVisualSettings =
    loadAirVisualSettings();

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

  function clampAirSetting(
    value,
    minValue,
    maxValue
  ) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return minValue;
    }

    return Math.max(
      minValue,
      Math.min(maxValue, number)
    );
  }


  function loadAirVisualSettings() {
    let stored = {};

    try {
      stored = JSON.parse(
        localStorage.getItem(
          AIR_VISUAL_STORAGE_KEY
        ) || "{}"
      );
    } catch (error) {
      stored = {};
    }

    return {
      iconGlow:
        clampAirSetting(
          stored.iconGlow ??
            AIR_VISUAL_DEFAULTS.iconGlow,
          0,
          150
        ),

      glowRadius:
        clampAirSetting(
          stored.glowRadius ??
            AIR_VISUAL_DEFAULTS.glowRadius,
          0,
          20
        ),

      pulse:
        clampAirSetting(
          stored.pulse ??
            AIR_VISUAL_DEFAULTS.pulse,
          0,
          100
        ),

      trackGlow:
        clampAirSetting(
          stored.trackGlow ??
            AIR_VISUAL_DEFAULTS.trackGlow,
          0,
          100
        ),

      trackWidth:
        clampAirSetting(
          stored.trackWidth ??
            AIR_VISUAL_DEFAULTS.trackWidth,
          0.5,
          5
        ),

      ringRoadIntensity:
        clampAirSetting(
          stored.ringRoadIntensity ??
            AIR_VISUAL_DEFAULTS.ringRoadIntensity,
          0,
          100
        )
    };
  }


  function saveAirVisualSettings() {
    try {
      localStorage.setItem(
        AIR_VISUAL_STORAGE_KEY,
        JSON.stringify(
          airVisualSettings
        )
      );
    } catch (error) {
      // localStorage may be unavailable.
    }
  }


  function applyAirVisualCssVariables() {
    const root =
      document.documentElement;

    const glowScale =
      airVisualSettings.iconGlow / 100;

const radiusScale =
  airVisualSettings.glowRadius / 8;

    root.style.setProperty(
      "--air-icon-glow-opacity",
      (
        0.18 * glowScale
      ).toFixed(3)
    );

    root.style.setProperty(
      "--air-icon-glow-blur",
      airVisualSettings.glowRadius +
        "px"
    );


    root.style.setProperty(
      "--air-active-shadow-1",
      (
        3 * glowScale * radiusScale
      ).toFixed(2) + "px"
    );

    root.style.setProperty(
      "--air-active-shadow-2",
      (
        9 * glowScale * radiusScale
      ).toFixed(2) + "px"
    );

    root.style.setProperty(
      "--air-active-shadow-3",
      (
        15 * glowScale * radiusScale * radiusScale
      ).toFixed(2) + "px"
    );


    root.style.setProperty(
      "--air-history-shadow-1",
      (
        2 * glowScale * radiusScale
      ).toFixed(2) + "px"
    );

    root.style.setProperty(
      "--air-history-shadow-2",
      (
        5 * glowScale
      ).toFixed(2) + "px"
    );


    const pulseScale =
  Math.max(
    0,
    Math.min(
      1,
      airVisualSettings.pulse / 100
    )
  );

root.style.setProperty(
  "--air-pulse-opacity",
  (
    0.72 * pulseScale
  ).toFixed(3)
);

root.style.setProperty(
  "--air-pulse-start-scale",
  (
    1 - 0.28 * pulseScale
  ).toFixed(3)
);

root.style.setProperty(
  "--air-pulse-end-scale",
  (
    1 + 0.85 * pulseScale
  ).toFixed(3)
);
  }


  function updateAirTrackStyles() {
    if (!airHistoryLayer) {
      return;
    }

    airHistoryLayer.eachLayer(function(layer) {
      if (
        !layer ||
        typeof layer.setStyle !== "function" ||
        !layer.__airTrackRole
      ) {
        return;
      }

      if (layer.__airTrackRole === "glow") {
        layer.setStyle({
          weight: Math.max(
            4,
            airVisualSettings.trackWidth * 3.6
          ),
          opacity:
            airVisualSettings.trackGlow / 100
        });
      }

      if (layer.__airTrackRole === "core") {
        layer.setStyle({
          weight:
            airVisualSettings.trackWidth,
          opacity: 0.94
        });
      }
    });
  }



  function getRingRoadLineCoordinates() {
    if (!airRingRoadGeometry) return [];

    const geometry =
      airRingRoadGeometry.type === "Feature"
        ? airRingRoadGeometry.geometry
        : airRingRoadGeometry;

    if (!geometry) return [];

    if (
      geometry.type === "Polygon" &&
      Array.isArray(geometry.coordinates) &&
      Array.isArray(geometry.coordinates[0])
    ) {
      return geometry.coordinates[0];
    }

    if (
      geometry.type === "LineString" &&
      Array.isArray(geometry.coordinates)
    ) {
      return geometry.coordinates;
    }

    return [];
  }

  function updateAirRingRoadStyle() {
    if (!airRingRoadLayer) return;

    const scale =
      Math.max(
        0,
        Math.min(
          1,
          Number(
            airVisualSettings &&
            airVisualSettings.ringRoadIntensity
          ) / 100
        )
      );

    airRingRoadLayer.eachLayer(function(layerGroup) {
      if (
        layerGroup &&
        typeof layerGroup.eachLayer === "function"
      ) {
        layerGroup.eachLayer(function(layer) {
          if (
            !layer ||
            typeof layer.setStyle !== "function"
          ) return;

          const role = layer.__airRingRoadRole;

          if (role === "glow") {
            layer.setStyle({
              color: "#35e6ff",
              weight: 10,
              opacity: 0.13 * scale,
              fillOpacity: 0
            });
          } else if (role === "core") {
            layer.setStyle({
              color: "#35e6ff",
              weight: 1.6,
              opacity: 0.78 * scale,
              fillColor: "#35e6ff",
              fillOpacity: 0.025 * scale
            });
          }
        });
      }
    });

    if (
      scale <= 0 &&
      typeof map !== "undefined" &&
      map.hasLayer(airRingRoadLayer)
    ) {
      map.removeLayer(airRingRoadLayer);
    } else if (
      scale > 0 &&
      mode === "air" &&
      typeof map !== "undefined" &&
      !map.hasLayer(airRingRoadLayer)
    ) {
      airRingRoadLayer.addTo(map);
    }
  }

  async function ensureAirRingRoadLoaded() {
    if (airRingRoadGeometry && airRingRoadLayer) {
      updateAirRingRoadStyle();
      return true;
    }

    if (airRingRoadLoadPromise) {
      return airRingRoadLoadPromise;
    }

    airRingRoadLoadPromise =
      (async function() {
        try {
          const response =
            await fetch(
              AIR_RING_ROAD_URL +
              "?t=" +
              Date.now(),
              { cache: "no-store" }
            );

          if (!response.ok) {
            throw new Error(
              "Ring road GeoJSON HTTP " +
              response.status
            );
          }

          const payload =
            await response.json();

          const feature =
            payload &&
            Array.isArray(payload.features)
              ? payload.features[0]
              : payload;

          if (!feature) {
            throw new Error(
              "Ring road GeoJSON has no feature"
            );
          }

          airRingRoadGeometry = feature;

          const glow =
            L.geoJSON(
              feature,
              {
                interactive: false,
                style: {
                  color: "#35e6ff",
                  weight: 10,
                  opacity: 0.07,
                  fillOpacity: 0
                }
              }
            );

          glow.eachLayer(function(layer) {
            layer.__airRingRoadRole = "glow";
          });

          const core =
            L.geoJSON(
              feature,
              {
                interactive: false,
                style: {
                  color: "#35e6ff",
                  weight: 1.6,
                  opacity: 0.43,
                  fillColor: "#35e6ff",
                  fillOpacity: 0.014
                }
              }
            );

          core.eachLayer(function(layer) {
            layer.__airRingRoadRole = "core";
          });

          airRingRoadLayer =
            L.layerGroup([
              glow,
              core
            ]);

          updateAirRingRoadStyle();
          return true;
        } catch (error) {
          console.warn(
            "AIR ring-road geometry unavailable:",
            error
          );

          airRingRoadGeometry = null;
          airRingRoadLayer = null;
          return false;
        } finally {
          airRingRoadLoadPromise = null;
        }
      })();

    return airRingRoadLoadPromise;
  }

  function nearestPointOnRingRoad(latlng) {
    const coords =
      getRingRoadLineCoordinates();

    if (
      !latlng ||
      coords.length < 2
    ) return null;

    const lat0 = Number(latlng[0]);
    const lon0 = Number(latlng[1]);

    if (
      !Number.isFinite(lat0) ||
      !Number.isFinite(lon0)
    ) return null;

    const cosLat =
      Math.cos(
        lat0 *
        Math.PI /
        180
      );

    let best = null;

    for (
      let i = 0;
      i < coords.length - 1;
      i += 1
    ) {
      const a = coords[i];
      const b = coords[i + 1];

      if (
        !Array.isArray(a) ||
        !Array.isArray(b)
      ) continue;

      const ax =
        (Number(a[0]) - lon0) *
        cosLat;

      const ay =
        Number(a[1]) - lat0;

      const bx =
        (Number(b[0]) - lon0) *
        cosLat;

      const by =
        Number(b[1]) - lat0;

      const dx = bx - ax;
      const dy = by - ay;

      const denom =
        dx * dx +
        dy * dy;

      let t =
        denom > 0
          ? -(
              ax * dx +
              ay * dy
            ) / denom
          : 0;

      t =
        Math.max(
          0,
          Math.min(
            1,
            t
          )
        );

      const x =
        ax +
        t * dx;

      const y =
        ay +
        t * dy;

      const d2 =
        x * x +
        y * y;

      if (
        !best ||
        d2 < best.d2
      ) {
        const lon =
          Number(a[0]) +
          t * (
            Number(b[0]) -
            Number(a[0])
          );

        const lat =
          Number(a[1]) +
          t * (
            Number(b[1]) -
            Number(a[1])
          );

        best = {
          lat: lat,
          lng: lon,
          d2: d2,
          segmentIndex: i,
          segmentFraction: t
        };
      }
    }

    return best;
  }

  function isRingRoadReference(place) {
    if (!place) return false;

    const text =
      [
        place.raw_name,
        place.canonical_name,
        place.name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
      text.includes("кільцев") ||
      text.includes("кольцев")
    );
  }

  function isTrackableSourcePlace(place) {
    if (!place) return false;

    const role =
      place.location_role;

    return (
      role === "reported_position" ||
      role === "reported_area" ||
      role === "direction_target" ||
      role === "inherited_direction" ||
      role === "linear_reference_projection"
    );
  }

  function resolvedSourcePlaces(event) {
    return (
      Array.isArray(
        event &&
        event.places
      )
        ? event.places
        : []
    )
      .filter(isTrackableSourcePlace)
      .map(function(place) {
        return {
          place: place,
          latlng:
            geometryToLatLng(
              place
            )
        };
      })
      .filter(function(item) {
        return Boolean(
          item.latlng
        );
      });
  }

  function resolveMonitorLinearReferences(payload) {
    if (
      !payload ||
      !airRingRoadGeometry
    ) {
      return payload;
    }

    (payload.threads || [])
      .forEach(function(thread) {
        (thread.tracks || [])
          .forEach(function(track) {
            if (
              !track ||
              track.__monitor1654 !== true
            ) {
              return;
            }

            (track.segments || [])
              .forEach(function(segment) {
                const events =
                  Array.isArray(segment.events)
                    ? segment.events
                    : [];

                let previousLatLng = null;

                events.forEach(function(event) {
                  if (!event) return;

                  const places =
                    Array.isArray(event.places)
                      ? event.places
                      : [];

                  places.forEach(function(place) {
                    if (
                      !place ||
                      !isTrackableSourcePlace(
                        place
                      )
                    ) return;

                    let latlng =
                      geometryToLatLng(
                        place
                      );

                    if (
                      !latlng &&
                      previousLatLng &&
                      isRingRoadReference(
                        place
                      )
                    ) {
                      const snap =
                        nearestPointOnRingRoad(
                          previousLatLng
                        );

                      if (snap) {
                        place.resolved = true;
                        place.geometry_resolved = true;
                        place.lat = snap.lat;
                        place.lng = snap.lng;
                        place.geometry = {
                          type: "Point",
                          coordinates: [
                            snap.lng,
                            snap.lat
                          ]
                        };

                        place.canonical_name =
                          "Кільцева дорога (наближена прив'язка)";

                        place.place_type =
                          "linear_feature";

                        place.linear_reference_projection =
                          true;

                        place.linear_reference_id =
                          "kharkiv_ring_road";

                        place.linear_reference_segment =
                          snap.segmentIndex;

                        place.linear_reference_fraction =
                          snap.segmentFraction;

                        latlng = [
                          snap.lat,
                          snap.lng
                        ];
                      }
                    }

                    if (latlng) {
                      previousLatLng =
                        latlng;
                    }
                  });
                });
              });
          });
      });

    return payload;
  }

  function applyMonitorTerminalAnchorOverrides(payload) {
    if (!payload) return payload;

    (payload.threads || [])
      .forEach(function(thread) {
        (thread.tracks || [])
          .forEach(function(track) {
            if (
              !track ||
              track.__monitor1654 !== true ||
              !track.current_terminal
            ) {
              return;
            }

            const terminal =
              track.current_terminal;

            const status =
              String(
                terminal.status ||
                ""
              ).toLowerCase();

            if (
              status !== "lost_tracking"
            ) {
              return;
            }

            let latestPlace = null;

            (track.segments || [])
              .forEach(function(segment) {
                (segment.events || [])
                  .forEach(function(event) {
                    resolvedSourcePlaces(event)
                      .forEach(function(item) {
                        latestPlace =
                          item.place;
                      });
                  });
              });

            if (latestPlace) {
              terminal.last_place =
                latestPlace;

              terminal.__anchored_to_latest_source_reference =
                true;
            }
          });
      });

    return payload;
  }


function rerenderAirVisuals() {
    if (
      mode !== "air" ||
      !lastPayload
    ) {
      return;
    }

    if (airVisualRaf !== null) {
      cancelAnimationFrame(
        airVisualRaf
      );
    }

    airVisualRaf =
      requestAnimationFrame(
        function() {
          airVisualRaf = null;

          if (
            mode !== "air" ||
            !lastPayload
          ) {
            return;
          }

          const stats =
            renderAirPayload(
              lastPayload
            );

          renderAirHud(
            stats
          );
        }
      );
  }


  function applyAirVisualSettings(
    rerender = false
  ) {
    applyAirVisualCssVariables();
    updateAirRingRoadStyle();

    saveAirVisualSettings();

    if (rerender) {
      rerenderAirVisuals();
    }
  }


  function updateAirVisualPanelValues() {
    const values = {
      "air-icon-glow-slider":
        airVisualSettings.iconGlow,

      "air-glow-radius-slider":
        airVisualSettings.glowRadius,

      "air-pulse-slider":
        airVisualSettings.pulse,

      "air-track-glow-slider":
        airVisualSettings.trackGlow,

      "air-track-width-slider":
        airVisualSettings.trackWidth,

      "air-ring-road-intensity-slider":
        airVisualSettings.ringRoadIntensity
    };

    Object.entries(values)
      .forEach(function(entry) {
        const input =
          $(entry[0]);

        if (input) {
          input.value =
            entry[1];
        }
      });


    const displays = {
      "air-icon-glow-value":
        Math.round(
          airVisualSettings.iconGlow
        ),

      "air-glow-radius-value":
        airVisualSettings.glowRadius,

      "air-pulse-value":
        Math.round(
          airVisualSettings.pulse
        ),

      "air-track-glow-value":
        Math.round(
          airVisualSettings.trackGlow
        ),

      "air-track-width-value":
        Number(
          airVisualSettings.trackWidth
        ).toFixed(1),

      "air-ring-road-intensity-value":
        Math.round(
          airVisualSettings.ringRoadIntensity
        )
    };

    Object.entries(displays)
      .forEach(function(entry) {
        const element =
          $(entry[0]);

        if (element) {
          element.textContent =
            entry[1];
        }
      });
  }


  function bindAirVisualSlider(
    id,
    valueId,
    key,
    formatter
  ) {
    const slider = $(id);

    if (!slider) {
      return;
    }

    slider.addEventListener(
      "input",
      function() {
        airVisualSettings[key] =
          Number(this.value);

        const valueElement =
          $(valueId);

        if (valueElement) {
          valueElement.textContent =
            formatter(
              airVisualSettings[key]
            );
        }

        applyAirVisualSettings(false);

    if (
      key === "trackGlow" ||
      key === "trackWidth"
    ) {
      updateAirTrackStyles();
    }
      }
    );
  }


  function ensureAirVisualSettingsPanel() {
    if (
      airVisualSettingsControl ||
      typeof L === "undefined" ||
      typeof map === "undefined"
    ) {
      return;
    }

    airVisualSettingsControl =
      L.control({
        position: "topleft"
      });


    airVisualSettingsControl.onAdd =
      function() {
        const div =
          L.DomUtil.create(
            "div",
            "control-box"
          );

        div.id =
          "air-visual-settings-panel";

        div.style.width =
          "270px";

        div.style.display =
          "none";


        div.innerHTML = `
          <div class="section-title">
            Air Visual Params
          </div>

          <label class="small-label">
            Icon glow
            <span id="air-icon-glow-value"></span>
          </label>

          <input
            type="range"
            id="air-icon-glow-slider"
            min="0"
            max="150"
            step="1"
          >


          <label class="small-label">
            Glow radius
            <span id="air-glow-radius-value"></span>
          </label>

          <input
            type="range"
            id="air-glow-radius-slider"
            min="0"
            max="20"
            step="1"
          >


          <label class="small-label">
            Pulse
            <span id="air-pulse-value"></span>
          </label>

          <input
            type="range"
            id="air-pulse-slider"
            min="0"
            max="100"
            step="1"
          >


          <label class="small-label">
            Track glow
            <span id="air-track-glow-value"></span>
          </label>

          <input
            type="range"
            id="air-track-glow-slider"
            min="0"
            max="100"
            step="1"
          >


          <label class="small-label">
            Track width
            <span id="air-track-width-value"></span>
          </label>

          <input
            type="range"
            id="air-track-width-slider"
            min="0.5"
            max="5"
            step="0.1"
          >


          <label class="small-label">
            Kharkiv boundary
            <span id="air-ring-road-intensity-value"></span>
          </label>

          <input
            type="range"
            id="air-ring-road-intensity-slider"
            min="0"
            max="100"
            step="1"
          >

          <button id="reset-air-visual-settings">
            Скинути
          </button>
        `;


        L.DomEvent.disableClickPropagation(
          div
        );

        L.DomEvent.disableScrollPropagation(
          div
        );


        div
          .querySelectorAll(
            "input, button, label"
          )
          .forEach(function(element) {

            [
              "mousedown",
              "touchstart",
              "pointerdown",
              "dblclick",
              "wheel"
            ].forEach(function(eventName) {

              L.DomEvent.on(
                element,
                eventName,
                L.DomEvent.stopPropagation
              );

            });
          });


        return div;
      };


    airVisualSettingsControl.addTo(
      map
    );


    bindAirVisualSlider(
      "air-icon-glow-slider",
      "air-icon-glow-value",
      "iconGlow",
      function(value) {
        return Math.round(value);
      }
    );

    bindAirVisualSlider(
      "air-glow-radius-slider",
      "air-glow-radius-value",
      "glowRadius",
      function(value) {
        return Math.round(value);
      }
    );

    bindAirVisualSlider(
      "air-pulse-slider",
      "air-pulse-value",
      "pulse",
      function(value) {
        return Math.round(value);
      }
    );

    bindAirVisualSlider(
      "air-track-glow-slider",
      "air-track-glow-value",
      "trackGlow",
      function(value) {
        return Math.round(value);
      }
    );

    bindAirVisualSlider(
      "air-track-width-slider",
      "air-track-width-value",
      "trackWidth",
      function(value) {
        return Number(value)
          .toFixed(1);
      }
    );

    bindAirVisualSlider(
      "air-ring-road-intensity-slider",
      "air-ring-road-intensity-value",
      "ringRoadIntensity",
      function(value) {
        updateAirRingRoadStyle();
        return Math.round(value);
      }
    );


    const reset =
      $("reset-air-visual-settings");

    if (reset) {
      reset.addEventListener(
        "click",
        function(event) {
          event.preventDefault();
          event.stopPropagation();

          airVisualSettings = {
            ...AIR_VISUAL_DEFAULTS
          };

          updateAirVisualPanelValues();

          applyAirVisualSettings(
            true
          );
        }
      );
    }


    updateAirVisualPanelValues();
  }


  function setAirVisualPanelVisible(
    visible
  ) {
    ensureAirVisualSettingsPanel();

    const panel =
      $("air-visual-settings-panel");

    if (!panel) {
      return;
    }

    panel.style.display =
      visible
        ? "block"
        : "none";
  }


  function toggleAirVisualPanel() {
    ensureAirVisualSettingsPanel();

    const panel =
      $("air-visual-settings-panel");

    if (!panel) {
      return;
    }

    setAirVisualPanelVisible(
      panel.style.display === "none"
    );
  }


  function installAirSettingsButtonHook() {
    const button =
      $("toggle-heat-settings");

    if (
      !button ||
      button.dataset.airHookInstalled ===
        "1"
    ) {
      return;
    }

    button.dataset.airHookInstalled =
      "1";


    /*
     * Capture phase is intentional.
     *
     * In MINE mode we do nothing and the original
     * index.html handler opens HEATMAP PARAMS.
     *
     * In AIR mode we stop that handler and open
     * AIR VISUAL PARAMS instead.
     */
    button.addEventListener(
      "click",
      function(event) {
        if (mode !== "air") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        toggleAirVisualPanel();
      },
      true
    );
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

    if (
      joined.includes("tactical_aviation") ||
      joined.includes("aviation")
    ) {
      return "tactical_aviation";
    }

    if (
      joined.includes("ballistic")
    ) {
      return "missile";
    }

    if (
      joined.includes("reactive_uav")
    ) {
      return "jet_uav_unknown";
    }

    if (
      joined.includes("recon_uav")
    ) {
      return "recon_uav_unknown";
    }

    if (
      joined.includes("attack_uav")
    ) {
      return "attack_uav_unknown";
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
      1.14,
      zoom - 8
    );

    if (active) {
      return Math.round(
        clampThreatSize(
          22 * scale,
          14,
          32
        )
      );
    }

    return Math.round(
      clampThreatSize(
        11 * scale,
        7,
        17
      )
    );
  }


  function normalizedReportedCount(reportedCount) {
    let count = Number(reportedCount);
    if (!Number.isFinite(count) || count < 1) count = 1;
    return Math.max(1, Math.min(50, Math.round(count)));
  }

  function threatIconBoxSize(active, reportedCount = 1) {
    const baseSize = threatIconSize(active);
    const count = normalizedReportedCount(reportedCount);
    return count > 1 ? Math.round(baseSize * 1.42) : baseSize;
  }

  function createThreatIcon(
    track,
    active,
    reportedCount = 1,
    screenOffset = null
  ) {
    const type = resolveThreatVisualType(track);
    const visual = THREAT_VISUALS[type] || THREAT_VISUALS.default;
    const baseSize = threatIconSize(active);
    const count = normalizedReportedCount(reportedCount);
    const grouped = count > 1;
    const boxSize = threatIconBoxSize(active, count);
    const itemSize = grouped ? Math.round(baseSize * 0.66) : baseSize;
    const visibleCount = count <= 4 ? count : 3;
    const layouts = {
      1: [[50, 50]],
      2: [[32, 50], [68, 50]],
      3: [[50, 28], [31, 68], [69, 68]],
      4: [[31, 31], [69, 31], [31, 69], [69, 69]]
    };
    const positions = layouts[visibleCount] || layouts[3];
    const symbols = positions.map(function(position) {
      return `
        <div class="air-threat-group-item" style="width:${itemSize}px;height:${itemSize}px;left:${position[0]}%;top:${position[1]}%;">
          ${threatSvg(visual.shape)}
        </div>`;
    }).join("");
    const badge = count > 4 ? `<div class="air-threat-count-badge">×${count}</div>` : "";
    const cssClass = active ? "air-threat-symbol-active" : "air-threat-symbol-history";
    const offsetX = screenOffset && Number.isFinite(Number(screenOffset.x)) ? Number(screenOffset.x) : 0;
    const offsetY = screenOffset && Number.isFinite(Number(screenOffset.y)) ? Number(screenOffset.y) : 0;
    const iconAnchorX = boxSize / 2 - offsetX;
    const iconAnchorY = boxSize / 2 - offsetY;
    return L.divIcon({
      className: "",
      html: `
        <div class="air-threat-symbol ${cssClass} ${grouped ? "air-threat-symbol-group" : ""}" style="width:${boxSize}px;height:${boxSize}px;color:${visual.color};">
          <div class="air-threat-symbol-glow"></div>
          ${symbols}
          ${badge}
        </div>`,
      iconSize: [boxSize, boxSize],
      iconAnchor: [iconAnchorX, iconAnchorY],
      popupAnchor: [-offsetX, -(boxSize / 2 + 4 + offsetY)]
    });
  }



  const AIR_TERMINAL_FADE_MS =
    30 * 60 * 1000;


  function terminalTypeLabel(type) {
    switch (type) {
      case "fallen_reported":
        return "SOURCE REPORTED FALL / IMPACT";

      case "intercepted_reported":
        return "SOURCE REPORTED INTERCEPTION";

      case "lost_tracking":
        return "SOURCE REPORTED LOSS OF TRACKING";

      default:
        return "SOURCE TERMINAL STATUS";
    }
  }


  function terminalAgeMs(terminal) {
    if (
      !terminal ||
      !terminal.telegram_date
    ) {
      return Infinity;
    }

    const time =
      new Date(
        terminal.telegram_date
      ).getTime();

    if (!Number.isFinite(time)) {
      return Infinity;
    }

    return Math.max(
      0,
      Date.now() - time
    );
  }


  function terminalLiveOpacity(
    terminal
  ) {
    const age =
      terminalAgeMs(
        terminal
      );

    if (
      !Number.isFinite(age) ||
      age >= AIR_TERMINAL_FADE_MS
    ) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        1,
        1 -
          age /
          AIR_TERMINAL_FADE_MS
      )
    );
  }


  function terminalStatusColor(
    type
  ) {
    switch (type) {
      case "fallen_reported":
        return "#ff8a3d";

      case "intercepted_reported":
        return "#ff4f78";

      case "lost_tracking":
        return "#ffd84d";

      default:
        return "#ffd84d";
    }
  }


  function terminalBackgroundSvg(
    type
  ) {

    /*
     * IMPORTANT:
     *
     * These graphics describe SOURCE STATUS,
     * not a physical impact/interception coordinate.
     */


    if (
      type ===
      "fallen_reported"
    ) {

      return `
        <svg viewBox="0 0 100 100">

          <g
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
          >

            <circle
              cx="50"
              cy="50"
              r="18"
              stroke-width="4"
            />

            <path
              d="
                M50 4 L50 24
                M50 76 L50 96

                M4 50 L24 50
                M76 50 L96 50

                M17 17 L31 31
                M69 69 L83 83

                M83 17 L69 31
                M31 69 L17 83
              "
              stroke-width="5"
            />

            <path
              d="
                M50 32
                L56 43
                L68 46
                L58 54
                L61 67
                L50 60
                L39 67
                L42 54
                L32 46
                L44 43
                Z
              "
              stroke-width="3"
            />

          </g>

        </svg>
      `;
    }


    if (
      type ===
      "intercepted_reported"
    ) {

      return `
        <svg viewBox="0 0 100 100">

          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-dasharray="7 6"
          />

          <circle
            cx="50"
            cy="50"
            r="23"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
          />

          <g
            fill="none"
            stroke="currentColor"
            stroke-width="5"
            stroke-linecap="round"
          >
            <path d="M21 21 L38 38"/>
            <path d="M62 62 L79 79"/>

            <path d="M79 21 L62 38"/>
            <path d="M38 62 L21 79"/>
          </g>

          <circle
            cx="50"
            cy="50"
            r="5"
            fill="currentColor"
          />

        </svg>
      `;
    }


    /*
     * LOST TRACKING
     *
     * Broken radar rings + question mark.
     */

    return `
      <svg viewBox="0 0 100 100">

        <g
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
        >

          <path
            d="
              M14 62
              A40 40 0 0 1 38 18
            "
            stroke-width="4"
          />

          <path
            d="
              M62 18
              A40 40 0 0 1 86 62
            "
            stroke-width="4"
          />

          <path
            d="
              M22 76
              A40 40 0 0 0 41 88
            "
            stroke-width="4"
          />

          <path
            d="
              M59 88
              A40 40 0 0 0 78 76
            "
            stroke-width="4"
          />


          <path
            d="
              M28 62
              A26 26 0 0 1 40 34
            "
            stroke-width="3"
            opacity=".78"
          />

          <path
            d="
              M60 34
              A26 26 0 0 1 72 62
            "
            stroke-width="3"
            opacity=".78"
          />

        </g>


        <text
          x="50"
          y="62"
          text-anchor="middle"
          font-size="35"
          font-family="monospace"
          font-weight="700"
          fill="currentColor"
        >?</text>

      </svg>
    `;
  }


  function createTerminalIcon(
    track,
    terminal
  ) {
    const type =
      resolveThreatVisualType({
        threats:
          (
            terminal &&
            Array.isArray(
              terminal.threats
            )
          )
            ? terminal.threats
            : (
                (
                  track &&
                  Array.isArray(
                    track.threats
                  )
                )
                  ? track.threats
                  : []
              )
      });


    const visual =
      THREAT_VISUALS[type] ||
      THREAT_VISUALS.default;


    const baseSize =
      threatIconSize(
        false
      );


    const boxSize =
      Math.round(
        clampThreatSize(
          baseSize * 2.45,
          24,
          44
        )
      );


    const threatSize =
      Math.round(
        boxSize * 0.46
      );


    const opacity =
      terminalLiveOpacity(
        terminal
      );


    const terminalType =
      (
        terminal &&
        terminal.type
      )
        ? terminal.type
        : "lost_tracking";


    const preliminary =
      Boolean(
        terminal &&
        terminal.confidence ===
          "preliminary"
      );


    const statusColor =
      terminalStatusColor(
        terminalType
      );


    return L.divIcon({
      className: "",

      html: `
        <div
          class="
            air-terminal-marker
            ${
              preliminary
                ? "air-terminal-preliminary"
                : ""
            }
          "
          style="
            width:${boxSize}px;
            height:${boxSize}px;
            opacity:${opacity.toFixed(3)};
          "
        >

          <div
            class="air-terminal-background"
            style="
              color:${statusColor};
            "
          >
            ${
              terminalBackgroundSvg(
                terminalType
              )
            }
          </div>


          <div
            class="air-terminal-threat"
            style="
              width:${threatSize}px;
              height:${threatSize}px;
              color:${visual.color};
            "
          >
            ${
              threatSvg(
                visual.shape
              )
            }
          </div>


          ${
            (
              terminal &&
              Number(
                terminal.count
              ) > 1
            )
              ? `
                <div
                  class="air-terminal-count-badge"
                  style="
                    color:${visual.color};
                  "
                >
                  ×${
                    normalizedReportedCount(
                      terminal.count
                    )
                  }
                </div>
              `
              : ""
          }

        </div>
      `,

      iconSize: [
        boxSize,
        boxSize
      ],

      iconAnchor: [
        boxSize / 2,
        boxSize / 2
      ],

      popupAnchor: [
        0,
        -(
          boxSize / 2 +
          5
        )
      ]
    });
  }


  function buildTerminalPopupHtml(
    thread,
    track,
    terminal
  ) {
    const place =
      (
        terminal &&
        terminal.last_place
      )
        ? terminal.last_place
        : {};


    const report =
      (
        terminal &&
        terminal.source_text
      )
        ? terminal.source_text
        : "";


    const terminalThreat =
      (
        terminal &&
        Array.isArray(
          terminal.threats
        ) &&
        terminal.threats[0]
      )
        ? terminal.threats[0]
        : null;


    const trackThreat =
      (
        track &&
        Array.isArray(
          track.threats
        ) &&
        track.threats[0]
      )
        ? track.threats[0]
        : null;


    const threatName =
      threatLabel({
        threat:
          terminalThreat ||
          trackThreat,

        threats:
          (
            terminal &&
            Array.isArray(
              terminal.threats
            )
          )
            ? terminal.threats
            : (
                (
                  track &&
                  Array.isArray(
                    track.threats
                  )
                )
                  ? track.threats
                  : []
              )
      });


    const threatSpecified =
      Boolean(
        terminalThreat ||
        trackThreat
      );


    let html =
      "<b>" +
      escapeHtml(
        threatSpecified
          ? threatName
          : "Тип цілі: не визначений джерелом"
      ) +
      "</b><br>" +

      '<span style="color:var(--amber)">' +

      escapeHtml(
        terminalTypeLabel(
          terminal &&
          terminal.type
        )
      ) +

      "</span><br>" +

      "Остання підтверджена джерелом позиція: " +

      escapeHtml(
        place.canonical_name ||
        place.id ||
        "—"
      ) +

      "<br>" +

      "Час terminal-повідомлення: " +

      formatDate(
        terminal &&
        terminal.telegram_date
      );


    if (
      terminal &&
      terminal.confidence ===
        "preliminary"
    ) {
      html +=
        '<br><span style="color:var(--text-dim)">' +
        "Статус: попереднє повідомлення джерела" +
        "</span>";
    }


    if (
      terminal &&
      Number(
        terminal.count
      ) > 1
    ) {
      html +=
        "<br>Кількість: " +
        escapeHtml(
          terminal.count
        );
    }


    if (
      track &&
      track.track_id
    ) {
      html +=
        "<br>Track: " +
        escapeHtml(
          track.track_id
        );
    }


    if (
      thread &&
      thread.root_message_id
    ) {
      html +=
        "<br>Thread: " +
        escapeHtml(
          thread.root_message_id
        );
    }


    if (
      terminal &&
      terminal.message_id
    ) {
      html +=
        "<br>Message: " +
        escapeHtml(
          terminal.message_id
        );
    }


    if (report) {
      html +=
        '<br><br><span style="color:var(--text-dim)">' +
        "SOURCE REPORT" +
        "</span><br>" +

        escapeHtml(
          report
        ).replace(
          /\n/g,
          "<br>"
        );
    }


    html +=
      '<br><br><span style="color:var(--text-dim)">' +
      "Маркер показує останню однозначну позицію, повідомлену джерелом до terminal-статусу. " +
      "Це не точна координата падіння або перехоплення." +
      "</span>";


    return html;
  }


  function addTerminalMarker(
    thread,
    track
  ) {
    const terminal =
      track &&
      track.current_terminal;


    if (
      !terminal ||
      terminal.drawable !== true ||
      terminal.superseded_by_message_id
    ) {
      return false;
    }


    const opacity =
      terminalLiveOpacity(
        terminal
      );


    if (opacity <= 0) {
      return false;
    }


    const latlng =
      geometryToLatLng(
        terminal.last_place
      );


    if (!latlng) {
      return false;
    }


    const marker =
      L.marker(
        latlng,
        {
          icon:
            createTerminalIcon(
              track,
              terminal
            ),

          keyboard: true,
          riseOnHover: true,
          zIndexOffset: 250
        }
      );


    marker.__airTerminalTrack =
      track;

    marker.__airTerminalEvent =
      terminal;


    marker.bindPopup(
      buildTerminalPopupHtml(
        thread,
        track,
        terminal
      ),
      {
        maxWidth: 390
      }
    );


    installMarkerClickReticle(
      marker
    );


    marker.addTo(
      airTerminalLayer
    );


    return true;
  }


function updateThreatMarkerScale() {
    reflowCurrentMarkerLayer();

    if (airMarkerLayer) {
      airMarkerLayer.eachLayer(function(layer) {
        if (
          typeof layer.setIcon === "function" &&
          layer.__airThreatTrack
        ) {
          layer.setIcon(
            createThreatIcon(
              layer.__airThreatTrack,
              true,
              layer.__airThreatCount || 1,
              layer.__airThreatOffset || null
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
              false,
              layer.__airThreatCount || 1,
              layer.__airThreatOffset || null
            )
          );
        }
      });
    }

    if (airTerminalLayer) {
      airTerminalLayer.eachLayer(function(layer) {
        if (
          typeof layer.setIcon === "function" &&
          layer.__airTerminalTrack &&
          layer.__airTerminalEvent
        ) {
          layer.setIcon(
            createTerminalIcon(
              layer.__airTerminalTrack,
              layer.__airTerminalEvent
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

      .air-threat-symbol-group {
    overflow: visible;
  }

  .air-threat-group-item {
    position: absolute;
    transform: translate(-50%, -50%);
    z-index: 2;
    pointer-events: none;
  }

  .air-threat-group-item svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }

  .air-threat-count-badge {
    position: absolute;

    right: -4px;
    bottom: -4px;

    z-index: 4;

    min-width: 20px;
    height: 18px;

    padding: 1px 4px;

    display: flex;
    align-items: center;
    justify-content: center;

    border:
      1px solid currentColor;

    border-radius: 5px;

    background:
      rgba(3, 10, 16, .94);

    color:
      currentColor;

    font-family:
      var(--font-mono, monospace);

    font-size: 11px;
    font-weight: 700;
    line-height: 1;

    box-shadow:
      0 0 5px currentColor;

    pointer-events: none;
  }

  .air-threat-symbol-glow {
        position: absolute;
        inset: 18%;
        border-radius: 50%;
        background: currentColor;
        opacity:
          var(--air-icon-glow-opacity, .18);

        filter:
          blur(
            var(--air-icon-glow-blur, 8px)
          );
        z-index: 1;
        pointer-events: none;
      }

      .air-threat-symbol-active {
        opacity: 1;

        filter:
          drop-shadow(
            0 0
            var(--air-active-shadow-1, 3px)
            currentColor
          )
          drop-shadow(
            0 0
            var(--air-active-shadow-2, 9px)
            currentColor
          )
          drop-shadow(
            0 0
            var(--air-active-shadow-3, 15px)
            currentColor
          );
      }

      .air-threat-symbol-active::after {
        content: "";
        position: absolute;
        inset: -6px;
        border: 1px solid currentColor;
        border-radius: 50%;
        opacity:
          var(--air-pulse-opacity, .65);

        animation:
          airThreatPulse
          1.9s
          ease-out
          infinite;
      }

      .air-threat-symbol-history {
        opacity: .62;

        filter:
          drop-shadow(
            0 0
            var(--air-history-shadow-1, 2px)
            currentColor
          )
          drop-shadow(
            0 0
            var(--air-history-shadow-2, 5px)
            currentColor
          );
      }

      @keyframes airThreatPulse {
    0% {
      transform: scale(
        var(--air-pulse-start-scale, .72)
      );

      opacity:
        var(--air-pulse-opacity, .72);
    }

    100% {
      transform: scale(
        var(--air-pulse-end-scale, 1.85)
      );

      opacity: 0;
    }
  }


      .air-terminal-marker {
        position: relative;

        display: flex;
        align-items: center;
        justify-content: center;

        pointer-events: auto;
      }


      .air-terminal-background {
        position: absolute;

        inset: -6%;

        z-index: 1;

        opacity: .92;

        filter:
          drop-shadow(
            0 0 3px currentColor
          )
          drop-shadow(
            0 0 8px currentColor
          )
          drop-shadow(
            0 0 13px currentColor
          );

        pointer-events: none;
      }


      .air-terminal-background svg {
        width: 100%;
        height: 100%;

        display: block;

        overflow: visible;
      }


      .air-terminal-threat {
        position: relative;

        z-index: 3;

        display: flex;
        align-items: center;
        justify-content: center;

        filter:
          drop-shadow(
            0 0 2px currentColor
          )
          drop-shadow(
            0 0 5px currentColor
          );
      }


      .air-terminal-threat svg {
        width: 100%;
        height: 100%;

        display: block;

        overflow: visible;
      }


      .air-terminal-preliminary
      .air-terminal-background {
        opacity: .44;
      }


      .air-terminal-count-badge {
        position: absolute;

        right: -3px;
        bottom: -3px;

        z-index: 4;

        min-width: 19px;
        height: 17px;

        padding: 1px 4px;

        display: flex;
        align-items: center;
        justify-content: center;

        border:
          1px solid currentColor;

        border-radius: 5px;

        background:
          rgba(3, 10, 16, .94);

        color:
          currentColor;

        font-family:
          var(--font-mono, monospace);

        font-size: 10px;
        font-weight: 700;
        line-height: 1;

        box-shadow:
          0 0 5px currentColor;

        pointer-events: none;
      }


      .air-terminal-preliminary {
        filter:
          saturate(.72);
      }
    `;

    document.head.appendChild(style);
  }


  // =========================================================
  // AIR THREAT LEGEND
  // =========================================================

  const AIR_LEGEND_ITEMS = [
    {
      type: "fpv",
      label: "FPV"
    },
    {
      type: "shahed",
      label: "SHAHED"
    },
    {
      type: "shahed_reactive",
      label: "REACTIVE SHAHED"
    },
    {
      type: "molniya",
      label: "MOLNIYA"
    },
    {
      type: "kab",
      label: "KAB"
    },
    {
      type: "missile",
      label: "MISSILE"
    },
    {
      type: "recon_uav_unknown",
      label: "RECON UAV"
    },
    {
      type: "tactical_aviation",
      label: "TACTICAL AVIATION"
    }
  ];


  function legendThreatSvg(type) {
    const visual =
      THREAT_VISUALS[type] ||
      THREAT_VISUALS.default;

    return `
      <div
        class="air-legend-symbol"
        style="color:${visual.color}"
      >
        ${threatSvg(visual.shape)}
      </div>
    `;
  }


  function installAirLegendStyles() {
    if (
      document.getElementById(
        "air-legend-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "air-legend-styles";

    style.textContent = `
      #air-threat-legend {
        position: absolute;
        right: 18px;
        bottom: 28px;
        z-index: 1050;

        width: 218px;

        background:
          rgba(2, 16, 22, .92);

        border:
          1px solid rgba(53, 230, 255, .28);

        box-shadow:
          0 0 18px rgba(0, 220, 255, .08),
          inset 0 0 14px rgba(0, 220, 255, .025);

        backdrop-filter:
          blur(7px);

        color:
          #bcebf2;

        font-family:
          inherit;

        display: none;

        user-select: none;
      }


      #air-threat-legend.air-legend-collapsed {
        width: 155px;
      }


      .air-legend-header {
        height: 34px;

        display: flex;
        align-items: center;
        justify-content: space-between;

        padding:
          0 9px 0 11px;

        border-bottom:
          1px solid rgba(53, 230, 255, .17);

        color:
          #35e6ff;

        font-size:
          10px;

        letter-spacing:
          .12em;

        font-weight:
          700;
      }


      .air-legend-toggle {
        width: 24px;
        height: 24px;

        border:
          1px solid rgba(53, 230, 255, .22);

        background:
          rgba(53, 230, 255, .04);

        color:
          #35e6ff;

        cursor: pointer;

        font-family:
          inherit;

        line-height:
          20px;

        padding: 0;
      }


      .air-legend-toggle:hover {
        background:
          rgba(53, 230, 255, .12);
      }


      .air-legend-body {
        padding:
          8px 10px 9px;
      }


      .air-legend-collapsed
      .air-legend-body {
        display: none;
      }


      .air-legend-row {
        height: 27px;

        display: grid;

        grid-template-columns:
          28px 1fr;

        align-items: center;

        column-gap: 7px;
      }


      .air-legend-symbol {
        width: 22px;
        height: 22px;

        display: flex;
        align-items: center;
        justify-content: center;

        filter:
          drop-shadow(
            0 0 3px currentColor
          )
          drop-shadow(
            0 0 6px currentColor
          );
      }


      .air-legend-symbol svg {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
      }


      .air-legend-label {
        font-size:
          9px;

        letter-spacing:
          .08em;

        color:
          #9fcbd2;

        white-space:
          nowrap;
      }


      .air-legend-separator {
        height: 1px;

        margin:
          7px 0 7px;

        background:
          rgba(53, 230, 255, .12);
      }


      .air-legend-status-row {
        display: grid;

        grid-template-columns:
          28px 1fr;

        align-items: center;

        min-height:
          24px;

        column-gap:
          7px;

        color:
          #789da4;

        font-size:
          8px;

        letter-spacing:
          .06em;
      }


      .air-legend-current {
        width: 12px;
        height: 12px;

        margin-left: 5px;

        border-radius: 50%;

        border:
          1px solid #35e6ff;

        box-shadow:
          0 0 7px #35e6ff;

        position: relative;
      }


      .air-legend-current::after {
        content: "";

        position: absolute;

        inset: -5px;

        border:
          1px solid rgba(53, 230, 255, .42);

        border-radius: 50%;
      }


      .air-legend-history {
        width: 7px;
        height: 7px;

        margin-left: 7px;

        border-radius: 50%;

        background:
          #35e6ff;

        box-shadow:
          0 0 5px #35e6ff;

        opacity: .62;
      }


      .air-legend-track {
        width: 23px;
        height: 2px;

        margin-left: 1px;

        border-radius: 3px;

        background:
          #ff496b;

        box-shadow:
          0 0 5px rgba(255, 73, 107, .7);
      }


      .air-legend-terminal {
        width: 20px;
        height: 20px;

        margin-left: 2px;

        display: flex;
        align-items: center;
        justify-content: center;

        font-family:
          var(--font-mono, monospace);

        font-weight: 700;

        line-height: 1;

        border-radius: 50%;
      }


      .air-legend-terminal-lost {
        color: #ffd84d;

        border:
          2px dashed currentColor;

        font-size: 12px;

        box-shadow:
          0 0 6px currentColor;
      }


      .air-legend-terminal-intercepted {
        color: #ff4f78;

        border:
          1px dashed currentColor;

        font-size: 14px;

        box-shadow:
          0 0 6px currentColor;
      }


      .air-legend-terminal-fallen {
        color: #ff8a3d;

        font-size: 17px;

        text-shadow:
          0 0 5px currentColor;
      }


      @media (
        max-width: 700px
      ) {
        #air-threat-legend {
          right: 8px;
          bottom: 18px;

          transform:
            scale(.9);

          transform-origin:
            bottom right;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }


  function buildAirLegend() {
    if (
      document.getElementById(
        "air-threat-legend"
      )
    ) {
      return;
    }

    installAirLegendStyles();

    const legend =
      document.createElement("div");

    legend.id =
      "air-threat-legend";

    const threatRows =
      AIR_LEGEND_ITEMS
        .map(function(item) {
          return `
            <div class="air-legend-row">
              ${legendThreatSvg(item.type)}

              <div class="air-legend-label">
                ${escapeHtml(item.label)}
              </div>
            </div>
          `;
        })
        .join("");

    legend.innerHTML = `
      <div class="air-legend-header">
        <span>AIR THREATS</span>

        <button
          type="button"
          class="air-legend-toggle"
          title="Згорнути легенду"
        >
          −
        </button>
      </div>

      <div class="air-legend-body">
        ${threatRows}

        <div class="air-legend-separator"></div>

        <div class="air-legend-status-row">
          <div class="air-legend-current"></div>
          <span>CURRENT POSITION</span>
        </div>

        <div class="air-legend-status-row">
          <div class="air-legend-history"></div>
          <span>HISTORICAL POSITION</span>
        </div>

        <div class="air-legend-status-row">
          <div class="air-legend-track"></div>
          <span>REPORTED TRACK</span>
        </div>


        <div class="air-legend-separator"></div>


        <div class="air-legend-status-row">
          <div
            class="
              air-legend-terminal
              air-legend-terminal-lost
            "
          >?</div>

          <span>LOST TRACKING</span>
        </div>


        <div class="air-legend-status-row">
          <div
            class="
              air-legend-terminal
              air-legend-terminal-intercepted
            "
          >×</div>

          <span>INTERCEPTED</span>
        </div>


        <div class="air-legend-status-row">
          <div
            class="
              air-legend-terminal
              air-legend-terminal-fallen
            "
          >✦</div>

          <span>FALLEN / IMPACT</span>
        </div>

      </div>
    `;

    const toggle =
      legend.querySelector(
        ".air-legend-toggle"
      );

    toggle.addEventListener(
      "click",
      function(event) {
        event.preventDefault();
        event.stopPropagation();

        const collapsed =
          legend.classList.toggle(
            "air-legend-collapsed"
          );

        toggle.textContent =
          collapsed ? "+" : "−";

        toggle.title =
          collapsed
            ? "Розгорнути легенду"
            : "Згорнути легенду";
      }
    );

    document.body.appendChild(
      legend
    );
  }


  function showAirLegend() {
    buildAirLegend();

    const legend =
      document.getElementById(
        "air-threat-legend"
      );

    if (legend) {
      legend.style.display =
        "block";
    }
  }


  function hideAirLegend() {
    const legend =
      document.getElementById(
        "air-threat-legend"
      );

    if (legend) {
      legend.style.display =
        "none";
    }
  }


  function ensureAirLayers() {
    if (airLayerGroup) return;

    airGlowLayer = L.layerGroup();
    airCoreLayer = L.layerGroup();
    airHistoryLayer = L.layerGroup();
    airTerminalLayer = L.layerGroup();
    airMarkerLayer = L.layerGroup();

    airLayerGroup = L.layerGroup([
      airGlowLayer,
      airCoreLayer,
      airHistoryLayer,
      airTerminalLayer,
      airMarkerLayer
    ]);
  }

  function clearAirLayers() {
    if (airMarkerLayer) airMarkerLayer.clearLayers();
    if (airTerminalLayer) airTerminalLayer.clearLayers();
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
    return Boolean(
      track &&
      (
        track.active === true ||
        track.is_active === true
      )
    );
  }


  function eventTimestampMs(event) {
    if (
      !event ||
      !event.telegram_date
    ) {
      return null;
    }

    const value =
      new Date(
        event.telegram_date
      ).getTime();

    return Number.isFinite(value)
      ? value
      : null;
  }


  function isMeaningfulAirObservation(
    event
  ) {
    if (
      !event ||
      typeof event !== "object"
    ) {
      return false;
    }


    if (
      event.__monitor1654 ===
        true
    ) {
      /*
       * Monitor1654 often reports a fresh threat as a
       * source-reported direction/reference rather than a
       * confirmed reported_position.
       *
       * These events must refresh the logical threat lifetime,
       * otherwise valid current summaries become stale
       * immediately.
       *
       * This affects freshness only. A direction_target is
       * still NOT treated as a confirmed physical position.
       */
      return (
        Array.isArray(
          event.places
        ) &&
        event.places.some(
          function(place) {
            return (
              place &&
              typeof isTrackableSourcePlace ===
                "function" &&
              isTrackableSourcePlace(
                place
              )
            );
          }
        )
      );
    }


    /*
     * Closing/terminal messages must not artificially
     * extend the LIVE lifetime of an object.
     */
    if (
      event.status === "ended" ||
      event.status === "not_observed" ||
      event.status === "no_threat" ||
      event.status === "clear"
    ) {
      return false;
    }


    if (
      Array.isArray(
        event.places
      ) &&
      event.places.length > 0
    ) {
      return true;
    }


    if (
      Array.isArray(
        event.explicit_threats
      ) &&
      event.explicit_threats.length > 0
    ) {
      return true;
    }


    if (
      event.is_continuation ===
        true
    ) {
      return true;
    }


    if (
      event.status ===
        "observed_again"
    ) {
      return true;
    }


    return false;
  }


  function getTrackLastActivityMs(
    track
  ) {
    if (
      !track ||
      !Array.isArray(
        track.segments
      )
    ) {
      return null;
    }


    let latest = null;


    track.segments.forEach(
      function(segment) {

        (
          segment.events || []
        ).forEach(
          function(event) {

            if (
              !isMeaningfulAirObservation(
                event
              )
            ) {
              return;
            }


            const timestamp =
              eventTimestampMs(
                event
              );


            if (
              timestamp !== null &&
              (
                latest === null ||
                timestamp > latest
              )
            ) {
              latest =
                timestamp;
            }

          }
        );

      }
    );


    return latest;
  }


  function trackAgeMs(track) {
    const lastActivity =
      getTrackLastActivityMs(
        track
      );

    if (lastActivity === null) {
      return Infinity;
    }

    return Math.max(
      0,
      Date.now() -
        lastActivity
    );
  }


  function isTrackFreshActive(
    track
  ) {
    return Boolean(
      isTrackActive(track) &&
      trackAgeMs(track) <=
        AIR_ACTIVE_STALE_MS
    );
  }


  function airTrackKey(track) {
    if (!track) {
      return "";
    }

    return String(
      track.track_id ||
      ""
    );
  }


  function updateAirTrackModeButton() {
    const button =
      $("toggle-air-tracks");

    if (!button) {
      return;
    }

    const labels = {
      selected: "SEL",
      all: "ALL",
      off: "OFF"
    };

    const label =
      labels[
        airTrackDisplayMode
      ] || "SEL";

    button.textContent =
      label;

    button.title =
      "Треки: " +
      label +
      (
        airTrackDisplayMode ===
          "selected"
          ? " — клікни по цілі"
          : ""
      );

    button.dataset.trackMode =
      airTrackDisplayMode;

    if (
      airTrackDisplayMode ===
      "all"
    ) {
      button.style.color =
        "#ff496b";

      button.style.background =
        "rgba(255,73,107,.10)";
    }

    else if (
      airTrackDisplayMode ===
      "selected"
    ) {
      button.style.color =
        "var(--cyan)";

      button.style.background =
        "rgba(53,230,255,.08)";
    }

    else {
      button.style.color =
        "var(--text-dim)";

      button.style.background =
        "";
    }
  }


  function cycleAirTrackDisplayMode() {
    if (
      airTrackDisplayMode ===
      "selected"
    ) {
      airTrackDisplayMode =
        "all";
    }

    else if (
      airTrackDisplayMode ===
      "all"
    ) {
      airTrackDisplayMode =
        "off";
    }

    else {
      airTrackDisplayMode =
        "selected";
    }

    updateAirTrackModeButton();

    rerenderAirVisuals();
  }


  function selectAirTrack(
    track
  ) {
    const id =
      airTrackKey(
        track
      );

    if (!id) {
      return;
    }

    selectedAirTrackId =
      id;

    airTrackDisplayMode =
      "selected";

    reopenSelectedPopup =
      true;

    updateAirTrackModeButton();

    rerenderAirVisuals();
  }


  function clearSelectedAirTrack() {
    if (
      !selectedAirTrackId
    ) {
      return;
    }

    selectedAirTrackId =
      null;

    reopenSelectedPopup =
      false;

    if (
      airTrackDisplayMode ===
      "selected"
    ) {
      rerenderAirVisuals();
    }
  }

  // =========================================================
  // MONITOR1654 API ADAPTER
  // =========================================================

  function monitorPlaceToAirPlace(place) {
    if (!place || typeof place !== "object") return place;

    const result = { ...place };

    if (!result.id && result.place_id) {
      result.id = result.place_id;
    }

    if (!result.canonical_name && result.name) {
      result.canonical_name = result.name;
    }

    const lat = Number(result.lat);
    const lng = Number(result.lng);

    if (
      result.geometry_resolved === true &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      result.geometry = {
        type: "Point",
        coordinates: [lng, lat]
      };
    }

    return result;
  }



  /*
   * MONITOR1654 VISUAL EVENT ANCHOR
   *
   * Single-object report:
   *   1 resolved place  -> original point
   *   2 resolved places -> derived midpoint
   *   3+ resolved places -> derived centroid
   *
   * Multi-object reports remain unchanged.
   */
  function monitorResolvedVisualPlaces(places) {
    return (
      Array.isArray(places)
        ? places.filter(function(place) {
            if (
              !place ||
              place.geometry_resolved !== true
            ) {
              return false;
            }

            const lat = Number(place.lat);
            const lng = Number(place.lng);

            return (
              Number.isFinite(lat) &&
              Number.isFinite(lng)
            );
          })
        : []
    );
  }


  function buildMonitorDerivedAnchor(
    event,
    resolvedPlaces
  ) {
    if (
      !Array.isArray(resolvedPlaces) ||
      resolvedPlaces.length < 2
    ) {
      return null;
    }

    let latSum = 0;
    let lngSum = 0;

    resolvedPlaces.forEach(function(place) {
      latSum += Number(place.lat);
      lngSum += Number(place.lng);
    });

    const lat =
      latSum / resolvedPlaces.length;

    const lng =
      lngSum / resolvedPlaces.length;

    const sourceNames =
      resolvedPlaces
        .map(function(place) {
          return (
            place.canonical_name ||
            place.raw_name ||
            place.id ||
            ""
          );
        })
        .filter(Boolean);

    const roles =
      resolvedPlaces
        .map(function(place) {
          return place.location_role || "";
        })
        .filter(Boolean);

    let locationRole =
      roles[0] || "reported_position";

    if (
      roles.length > 0 &&
      roles.every(function(role) {
        return (
          role === "direction_target" ||
          role === "inherited_direction"
        );
      })
    ) {
      locationRole = "direction_target";
    }

    const kind =
      resolvedPlaces.length === 2
        ? "midpoint"
        : "centroid";

    const messageId =
      event && event.message_id
        ? event.message_id
        : "event";

    return {
      id:
        "derived:" +
        messageId,

      place_id:
        "derived:" +
        messageId,

      canonical_name:
        sourceNames.join(" / "),

      raw_name:
        sourceNames.join(" / "),

      location_role:
        locationRole,

      geometry_resolved:
        true,

      lat:
        lat,

      lng:
        lng,

      geometry: {
        type: "Point",
        coordinates: [
          lng,
          lat
        ]
      },

      type:
        kind === "midpoint"
          ? "derived_midpoint"
          : "derived_centroid",

      place_type:
        kind === "midpoint"
          ? "derived_midpoint"
          : "derived_centroid",

      __monitor1654:
        true,

      __monitor_anchor_kind:
        kind,

      __monitor_source_places:
        resolvedPlaces.map(function(place) {
          return {
            id:
              place.id ||
              place.place_id ||
              null,

            raw_name:
              place.raw_name ||
              null,

            canonical_name:
              place.canonical_name ||
              null,

            lat:
              Number(place.lat),

            lng:
              Number(place.lng),

            location_role:
              place.location_role ||
              null
          };
        })
    };
  }


  function deriveMonitorVisualPlaces(
    event,
    sourcePlaces
  ) {
    const places =
      Array.isArray(sourcePlaces)
        ? sourcePlaces
        : [];

    const objectCount =
      Math.max(
        1,
        Number(
          (
            event &&
            (
              event.object_count ||
              event.reported_object_count
            )
          ) ||
          1
        ) || 1
      );

    /*
     * Do not collapse aggregate/group reports.
     */
    if (objectCount > 1) {
      return places;
    }

    const resolved =
      monitorResolvedVisualPlaces(
        places
      );

    /*
     * Zero/one resolved point stays unchanged.
     * This also preserves unresolved linear references
     * so the existing KML ring-road resolver can handle them.
     */
    if (resolved.length < 2) {
      return places;
    }

    const anchor =
      buildMonitorDerivedAnchor(
        event,
        resolved
      );

    return anchor
      ? [anchor]
      : places;
  }


  function monitorPointToAirPlace(point, locationRole) {
    if (!point || typeof point !== "object") {
      return null;
    }

    const lat = Number(point.lat);
    const lng = Number(point.lng);

    const resolved =
      Number.isFinite(lat) &&
      Number.isFinite(lng);

    const place = {
      id: point.place_id || null,
      place_id: point.place_id || null,
      canonical_name: point.name || null,
      name: point.name || null,
      location_role: locationRole || null,
      geometry_resolved: resolved,
      lat: resolved ? lat : null,
      lng: resolved ? lng : null
    };

    if (resolved) {
      place.geometry = {
        type: "Point",
        coordinates: [lng, lat]
      };
    }

    return place;
  }


  function monitorTerminalFromTrack(sourceTrack) {
    if (!sourceTrack || typeof sourceTrack !== "object") {
      return null;
    }

    const typeMap = {
      fallen: "fallen_reported",
      intercepted: "intercepted_reported",
      lost_tracking: "lost_tracking"
    };

    const terminalType =
      typeMap[sourceTrack.status];

    if (!terminalType) {
      return null;
    }

    const events =
      Array.isArray(sourceTrack.events)
        ? sourceTrack.events
        : [];

    const lastEvent =
      events.length
        ? events[events.length - 1]
        : null;

    const place =
      monitorPointToAirPlace(
        sourceTrack.last_reported_position,
        "reported_position"
      );

    return {
      type: terminalType,
      message_id:
        lastEvent && lastEvent.message_id,
      telegram_date:
        (lastEvent && lastEvent.telegram_date) ||
        sourceTrack.updated_at,
      source_text:
        (lastEvent && lastEvent.text) || "",
      threats:
        sourceTrack.threat
          ? [{
              id: sourceTrack.threat,
              canonical_name: sourceTrack.threat
            }]
          : [],
      count: sourceTrack.object_count || 1,
      confidence: "source_reported",
      last_place: place,
      drawable: Boolean(
        place &&
        place.geometry_resolved
      ),
      position_ambiguous: false,
      superseded_by_message_id: null
    };
  }


  function normalizeMonitorPayload(payload) {
    if (
      !payload ||
      payload.source !== "monitor1654" ||
      !Array.isArray(payload.tracks)
    ) {
      return payload;
    }

    const threads =
      payload.tracks.map(
        function(sourceTrack) {

          const events =
            (
              Array.isArray(sourceTrack.events)
                ? sourceTrack.events
                : []
            ).map(
              function(sourceEvent) {

                const rawPlaces =
                  (
                    Array.isArray(sourceEvent.places)
                      ? sourceEvent.places
                      : []
                  ).map(monitorPlaceToAirPlace);


                const places =
                  deriveMonitorVisualPlaces(
                    sourceEvent,
                    rawPlaces
                  );

                const explicitThreats =
                  sourceEvent.explicit_threat
                    ? [{
                        id: sourceEvent.explicit_threat,
                        canonical_name:
                          sourceEvent.explicit_threat
                      }]
                    : [];

                return {
                  ...sourceEvent,
                  __monitor1654: true,
                  raw_places: rawPlaces,
                  places: places,
                  original_text:
                    sourceEvent.text || "",
                  reported_object_count:
                    sourceEvent.object_count || 1,
                  explicit_threats:
                    explicitThreats,
                  inherited_threats:
                    (
                      sourceEvent.threat_inherited &&
                      sourceEvent.threat
                    )
                      ? [{
                          id: sourceEvent.threat,
                          canonical_name:
                            sourceEvent.threat
                        }]
                      : []
                };
              }
            );

          const threatList =
            sourceTrack.threat
              ? [{
                  id: sourceTrack.threat,
                  canonical_name:
                    sourceTrack.threat
                }]
              : [];

          const normalizedTrack = {
            ...sourceTrack,
            __monitor1654: true,
            track_id:
              sourceTrack.branch_id,
            active:
              sourceTrack.is_active === true &&
              sourceTrack.status !== "lost_tracking",
            threats:
              threatList,
            segments: [{
              segment_id:
                sourceTrack.branch_id,
              events:
                events,
              places: [],
              drawable_edges: []
            }],
            current_terminal:
              monitorTerminalFromTrack(
                sourceTrack
              )
          };

          return {
            root_message_id:
              sourceTrack.root_message_id,
            branch_id:
              sourceTrack.branch_id,
            active:
              normalizedTrack.active,
            latest_status:
              sourceTrack.status,
            first_seen:
              sourceTrack.started_at,
            last_seen:
              sourceTrack.updated_at,
            last_message_id:
              sourceTrack.last_message_id,
            event_count:
              events.length,
            track_count: 1,
            tracks: [
              normalizedTrack
            ]
          };
        }
      );

    return {
      ...payload,
      threads: threads,
      thread_count: threads.length,
      track_count: threads.length
    };
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

  function getLatestResolvedObservations(track) {
    const segments =
      Array.isArray(
        track &&
        track.segments
      )
        ? track.segments
        : [];


    /*
     * Find the newest event that contains at least one
     * source-reported place with resolved geometry.
     *
     * IMPORTANT:
     *
     * If one Telegram report says:
     *
     *   "Молния на Прудянку/Слатино"
     *
     * we return BOTH places.
     *
     * We do not choose one of them as the exact physical
     * position of the object.
     */
    for (
      let segmentIndex =
        segments.length - 1;

      segmentIndex >= 0;

      segmentIndex -= 1
    ) {

      const segment =
        segments[
          segmentIndex
        ];

      const events =
        Array.isArray(
          segment.events
        )
          ? segment.events
          : [];


      for (
        let eventIndex =
          events.length - 1;

        eventIndex >= 0;

        eventIndex -= 1
      ) {

        const event =
          events[
            eventIndex
          ];

        let places =
          Array.isArray(
            event.places
          )
            ? event.places
            : [];


        if (
          event.__monitor1654 ===
            true
        ) {
          places =
            places.filter(
              function(place) {
                return (
                  place &&
                  isTrackableSourcePlace(
                    place
                  )
                );
              }
            );
        }


        const observations =
          places
            .map(
              function(place) {

                const latlng =
                  geometryToLatLng(
                    place
                  );

                if (!latlng) {
                  return null;
                }

                return {
                  event:
                    event,

                  place:
                    place,

                  latlng:
                    latlng,

                  segment:
                    segment
                };
              }
            )
            .filter(Boolean);


        if (
          observations.length > 0
        ) {
          return observations;
        }
      }
    }


    return [];
  }


  function getLatestResolvedObservation(track) {
    /*
     * Compatibility helper for code that only needs
     * one representative observation.
     *
     * LIVE rendering itself uses
     * getLatestResolvedObservations().
     */
    const observations =
      getLatestResolvedObservations(
        track
      );

    return (
      observations[0] ||
      null
    );
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
    const rootId =
      thread && thread.root_message_id;

    const trackId =
      track && (track.track_id || track.branch_id);

    const report =
      sourceText(event);

    const isCurrent =
      kind === "current";

    const locationRole =
      String(
        place && place.location_role || ""
      );

    const isDirectionTarget =
      locationRole === "direction_target" ||
      locationRole === "inherited_direction" ||
      locationRole === "linear_reference_projection";

    const sourceGroupCount =
      Number(
        place && place.segment_object_count
      );

    const monitorAnchorKind =
      place &&
      place.__monitor_anchor_kind;


    const monitorSourcePlaces =
      Array.isArray(
        place &&
        place.__monitor_source_places
      )
        ? place.__monitor_source_places
        : [];


    const semanticLabel =
      isDirectionTarget
        ? "SOURCE-REPORTED DIRECTION TARGET"
        : (
            isCurrent
              ? "CURRENT REPORTED POSITION"
              : "REPORTED POSITION"
          );

    const semanticColor =
      isDirectionTarget
        ? "var(--amber)"
        : (
            isCurrent
              ? "var(--cyan)"
              : "var(--text-dim)"
          );

    let html =
      "<b>" +
      escapeHtml(threatLabel(track)) +
      "</b><br>" +
      '<span style="color:' +
      semanticColor +
      '">' +
      semanticLabel +
      "</span><br>" +
      "Місце: " +
      escapeHtml(
        place.canonical_name ||
        place.raw_name ||
        place.id ||
        "—"
      ) +
      "<br>";

    if (
      Number.isFinite(sourceGroupCount) &&
      sourceGroupCount > 0
    ) {
      html +=
        "Об'єктів у цій групі: " +
        escapeHtml(sourceGroupCount) +
        "<br>";
    }

    if (
      monitorAnchorKind === "midpoint" ||
      monitorAnchorKind === "centroid"
    ) {
      const anchorNames =
        monitorSourcePlaces
          .map(function(sourcePlace) {
            return (
              sourcePlace.canonical_name ||
              sourcePlace.raw_name ||
              "—"
            );
          })
          .join(" / ");

      html +=
        '<span style="color:var(--amber)">' +
        'DERIVED SOURCE REFERENCE' +
        '</span><br>' +

        "Орієнтири джерела: " +
        escapeHtml(anchorNames) +
        "<br>" +

        (
          monitorAnchorKind === "midpoint"
            ? "Візуальна точка розміщена посередині між двома вказаними географічними орієнтирами."
            : "Візуальна точка розміщена в центроїді вказаних географічних орієнтирів."
        ) +
        "<br><br>";
    }


    html +=
      "Час повідомлення: " +
      formatDate(event.telegram_date) +
      "<br>" +
      "Статус треку: " +
      escapeHtml(
        track.active === true
          ? "ACTIVE"
          : "INACTIVE"
      );

    if (trackId) {
      html +=
        "<br>Track: " +
        escapeHtml(trackId);
    }

    if (rootId) {
      html +=
        "<br>Thread: " +
        escapeHtml(rootId);
    }

    if (event.message_id) {
      html +=
        "<br>Message: " +
        escapeHtml(event.message_id);
    }

    if (report) {
      html +=
        '<br><br><span style="color:var(--text-dim)">SOURCE REPORT</span><br>' +
        escapeHtml(report).replace(/\n/g, "<br>");
    }

    if (isDirectionTarget) {
      html +=
        '<br><br><span style="color:var(--text-dim)">' +
        'Це напрямок або географічний орієнтир, прямо вказаний джерелом. ' +
        'Маркер не означає підтверджену поточну координату об\'єкта.' +
        '</span>';
    } else if (isCurrent) {
      html +=
        '<br><br><span style="color:var(--text-dim)">' +
        'Великий пульсуючий маркер — остання однозначно геоприв\'язана reported position цього активного треку.' +
        '</span>';
    } else {
      html +=
        '<br><br><span style="color:var(--text-dim)">' +
        'Мала точка — історична reported position. Вона не є прогнозом поточного місцеположення.' +
        '</span>';
    }

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

  function currentEndpointIsHiddenFromHistory(
    currentKeys,
    key
  ) {
    if (!key) {
      return false;
    }

    if (
      currentKeys instanceof Set
    ) {
      return currentKeys.has(
        key
      );
    }

    return (
      key === currentKeys
    );
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
    if (
      !key ||
      seenHistory.has(key) ||
      currentEndpointIsHiddenFromHistory(
        currentKey,
        key
      )
    ) {
      return false;
    }
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

    if (
      event.__monitor1654 === true &&
      typeof isTrackableSourcePlace === "function" &&
      !isTrackableSourcePlace(place)
    ) {
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
      currentEndpointIsHiddenFromHistory(
        currentKey,
        key
      )
    ) {
      return false;
    }

    seenHistory.add(key);

    const sourceGroupCount =
      Math.max(
        1,
        Number(
          place.segment_object_count ||
          event.reported_object_count ||
          event.object_count ||
          1
        ) || 1
      );

    const marker =
      L.marker(
        latlng,
        {
          icon:
            createThreatIcon(
              track,
              false,
              sourceGroupCount
            ),

          keyboard:
            true,

          riseOnHover:
            true,

          zIndexOffset:
            -100,

          bubblingMouseEvents:
            false
        }
      );

    marker.__airThreatTrack =
      track;

    marker.__airThreatCount =
      sourceGroupCount;

    marker.bindPopup(
      buildPopupHtml(
        thread,
        track,
        event,
        place,
        "history"
      ),
      {
        maxWidth:
          360
      }
    );

    marker.on(
      "click",
      function() {
        const trackId =
          typeof airTrackKey === "function"
            ? airTrackKey(track)
            : null;

        if (
          trackId &&
          typeof selectAirTrack === "function" &&
          (
            airTrackDisplayMode === "selected" &&
            selectedAirTrackId !== trackId
          )
        ) {
          selectAirTrack(track);
        }
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
        weight:
          Math.max(
            4,
            airVisualSettings.trackWidth * 3.6
          ),

        opacity:
          airVisualSettings.trackGlow / 100,
        lineCap: "round",
        lineJoin: "round",
        interactive: false
      }
    );

    const coreLine = L.polyline(
      points,
      {
        color: "#ff496b",
        weight:
          airVisualSettings.trackWidth,

        opacity: 0.94,
        lineCap: "round",
        lineJoin: "round",
        interactive: false
      }
    );

    glowLine.__airTrackRole = "glow";
coreLine.__airTrackRole = "core";

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
    /*
     * HYBRID TRACK LINKING
     *
     * Rule 1:
     * Places inside ONE Telegram report are connected
     * in their source order.
     *
     * Example:
     *
     *   "Близнюки/Краснопавлівка"
     *
     *   Близнюки ---- Краснопавлівка
     *
     *
     * Rule 2:
     * Different Telegram reports are connected ONLY
     * when the newer report explicitly replies to
     * the previous report via reply_to_message_id.
     *
     *
     * Rule 3:
     * Reports that merely happen to belong to the
     * same track/segment but have no Telegram reply
     * relationship are NEVER connected.
     */


    (track.segments || []).forEach(function(segment) {

      const events =
        Array.isArray(segment.events)
          ? segment.events
          : [];


      const isMonitorTrack =
        track &&
        track.__monitor1654 ===
          true;


      if (
        isMonitorTrack &&
        events.some(
          function(event) {
            return (
              Number(
                event &&
                event.object_count
              ) > 1
            );
          }
        )
      ) {
        return;
      }


      // -----------------------------------------------------
      // Prepare resolved places for every event
      // -----------------------------------------------------

      const eventInfoById =
        new Map();


      events.forEach(function(event) {

        if (
          !event ||
          event.message_id == null
        ) {
          return;
        }


        const resolvedPlaces =
          (event.places || [])
            .filter(function(place) {
              return (
                !isMonitorTrack ||
                isTrackableSourcePlace(
                  place
                )
              );
            })
            .map(function(place) {

              return {
                place: place,

                latlng:
                  geometryToLatLng(
                    place
                  )
              };

            })
            .filter(function(item) {

              return Boolean(
                item.latlng
              );

            });


        eventInfoById.set(
          Number(event.message_id),
          {
            event: event,
            places: resolvedPlaces
          }
        );


        // ---------------------------------------------------
        // A. CONNECT PLACES INSIDE THE SAME MESSAGE
        // ---------------------------------------------------

        for (
          let i = 0;
          !isMonitorTrack &&
          i < resolvedPlaces.length - 1;
          i += 1
        ) {

          const from =
            resolvedPlaces[i];

          const to =
            resolvedPlaces[i + 1];


          const lineKey = [
            "same-message",

            track.track_id ||
              thread.root_message_id ||
              "unknown-track",

            segment.segment_id ||
              "unknown-segment",

            event.message_id,

            from.place.id ||
              from.place.canonical_name ||
              "from",

            to.place.id ||
              to.place.canonical_name ||
              "to"
          ].join("|");


          drawSmoothTrackCurve(
            from.latlng,
            to.latlng,
            lineKey,
            seenEdges
          );

        }

      });


      // -----------------------------------------------------
      // B. CONNECT EXPLICIT TELEGRAM REPLIES
      // -----------------------------------------------------

      events.forEach(function(childEvent) {

        if (!childEvent) {
          return;
        }


        /*
         * IMPORTANT:
         *
         * Use ONLY the actual Telegram reply field.
         *
         * We deliberately do NOT use chronological order
         * and do NOT use an inferred track relationship.
         */
        const replyTo =
          Number(
            childEvent.reply_to_message_id
          );


        if (!Number.isFinite(replyTo)) {
          return;
        }


        const parentInfo =
          eventInfoById.get(
            replyTo
          );


        const childInfo =
          eventInfoById.get(
            Number(
              childEvent.message_id
            )
          );


        if (
          !parentInfo ||
          !childInfo
        ) {
          return;
        }


        if (
          parentInfo.places.length === 0 ||
          childInfo.places.length === 0
        ) {
          return;
        }


        /*
         * MONITOR1654 SINGLE-OBJECT REPLY BRANCH
         *
         * A source report may contain several geographic
         * alternatives:
         *
         *   ?????/?????
         *        ? reply
         *   ????????/??????????
         *
         * We must NOT arbitrarily select one place as the
         * exact physical route.
         *
         * Instead every resolved parent alternative is linked
         * to every resolved child alternative. The resulting
         * fan represents the explicit Telegram reply relation,
         * not a predicted or exact physical trajectory.
         *
         * Multi-object Monitor reports are excluded earlier
         * in this function.
         */
        if (isMonitorTrack) {

          parentInfo.places.forEach(
            function(from) {

              childInfo.places.forEach(
                function(to) {

                  const lineKey = [
                    "monitor-reply-alternative",

                    track.track_id ||
                      thread.root_message_id ||
                      "unknown-track",

                    segment.segment_id ||
                      "unknown-segment",

                    parentInfo.event.message_id,

                    from.place.id ||
                      from.place.place_id ||
                      from.place.canonical_name ||
                      from.place.raw_name ||
                      "parent-place",

                    childInfo.event.message_id,

                    to.place.id ||
                      to.place.place_id ||
                      to.place.canonical_name ||
                      to.place.raw_name ||
                      "reply-place"
                  ].join("|");


                  drawSmoothTrackCurve(
                    from.latlng,
                    to.latlng,
                    lineKey,
                    seenEdges
                  );

                }
              );

            }
          );


          return;
        }


        /*
         * Legacy/non-Monitor behavior.
         */
        const from =
          parentInfo.places[
            parentInfo.places.length - 1
          ];

        const to =
          childInfo.places[0];


        const lineKey = [
          "telegram-reply",

          track.track_id ||
            thread.root_message_id ||
            "unknown-track",

          segment.segment_id ||
            "unknown-segment",

          parentInfo.event.message_id,

          from.place.id ||
            from.place.canonical_name ||
            "parent-place",

          childInfo.event.message_id,

          to.place.id ||
            to.place.canonical_name ||
            "reply-place"
        ].join("|");


        drawSmoothTrackCurve(
          from.latlng,
          to.latlng,
          lineKey,
          seenEdges
        );

      });

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

  function currentObservationLatLng(
    observation
  ) {
    if (
      !observation ||
      !observation.latlng
    ) {
      return null;
    }

    try {
      return Array.isArray(
        observation.latlng
      )
        ? L.latLng(
            observation.latlng[0],
            observation.latlng[1]
          )
        : L.latLng(
            observation.latlng
          );
    } catch (error) {
      return null;
    }
  }


  function currentMarkerLayoutOffsets(
    count,
    spacing
  ) {
    if (count <= 1) {
      return [
        {
          x: 0,
          y: 0
        }
      ];
    }

    if (count === 2) {
      return [
        {
          x: -spacing / 2,
          y: 0
        },
        {
          x: spacing / 2,
          y: 0
        }
      ];
    }

    if (count === 3) {
      const radius =
        spacing * 0.56;

      return [
        {
          x: 0,
          y: -radius
        },
        {
          x: -radius * 0.87,
          y: radius * 0.5
        },
        {
          x: radius * 0.87,
          y: radius * 0.5
        }
      ];
    }

    if (count === 4) {
      const half =
        spacing * 0.42;

      return [
        {
          x: -half,
          y: -half
        },
        {
          x: half,
          y: -half
        },
        {
          x: -half,
          y: half
        },
        {
          x: half,
          y: half
        }
      ];
    }

    const radius =
      Math.max(
        spacing * 0.78,
        (
          count * spacing
        ) /
        (
          2 * Math.PI
        )
      );

    return Array.from(
      {
        length: count
      },
      function(_, index) {
        const angle =
          -Math.PI / 2 +
          (
            2 *
            Math.PI *
            index
          ) /
          count;

        return {
          x:
            Math.cos(angle) *
            radius,

          y:
            Math.sin(angle) *
            radius
        };
      }
    );
  }


  function assignCurrentMarkerOffsets(
    items
  ) {
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      typeof map === "undefined"
    ) {
      return;
    }

    const groups =
      new Map();

    items.forEach(function(item) {
      const latlng =
        item.latlng ||
        currentObservationLatLng(
          item.observation
        );

      if (!latlng) {
        item.currentScreenOffset = {
          x: 0,
          y: 0
        };

        return;
      }

      /*
       * Group ONLY threats resolved to the same
       * geographic point.
       *
       * Zoom level must never create a group.
       */
      const key =
        Number(latlng.lat).toFixed(6) +
        "|" +
        Number(latlng.lng).toFixed(6);

      if (!groups.has(key)) {
        groups.set(
          key,
          []
        );
      }

      groups
        .get(key)
        .push(item);
    });


    groups.forEach(function(group) {
      if (group.length === 1) {
        group[0].currentScreenOffset = {
          x: 0,
          y: 0
        };

        return;
      }


      /*
       * Stable ordering prevents the icons
       * from changing places after refresh.
       */
      group.sort(function(a, b) {
        const typeA =
          resolveThreatVisualType(
            a.track ||
            a.__airThreatTrack
          );

        const typeB =
          resolveThreatVisualType(
            b.track ||
            b.__airThreatTrack
          );

        if (typeA !== typeB) {
          return typeA.localeCompare(
            typeB
          );
        }

        const trackA =
          (
            a.track ||
            a.__airThreatTrack ||
            {}
          ).track_id || "";

        const trackB =
          (
            b.track ||
            b.__airThreatTrack ||
            {}
          ).track_id || "";

        return String(trackA)
          .localeCompare(
            String(trackB)
          );
      });


      const largestBox =
        group.reduce(
          function(maxValue, item) {
            const source =
              item.observation
                ? (
                    item.observation.event ||
                    {}
                  )
                : {};

            const reportedCount =
              item.__airThreatCount ||
              source.reported_object_count ||
              1;

            return Math.max(
              maxValue,
              threatIconBoxSize(
                true,
                reportedCount
              )
            );
          },
          0
        );


      /*
       * Compact separation between different
       * threats at the same point.
       */
      const spacing =
        Math.max(
          28,
          largestBox + 8
        );


      const offsets =
        currentMarkerLayoutOffsets(
          group.length,
          spacing
        );


      group.forEach(
        function(item, index) {
          item.currentScreenOffset =
            offsets[index] || {
              x: 0,
              y: 0
            };
        }
      );
    });
  }


  function buildCurrentMarkerOffsets(
    preparedRows
  ) {
    assignCurrentMarkerOffsets(
      preparedRows
    );
  }


  function reflowCurrentMarkerLayer() {
    if (
      !airMarkerLayer ||
      typeof map === "undefined"
    ) {
      return;
    }

    const items = [];

    airMarkerLayer.eachLayer(
      function(marker) {
        if (
          !marker ||
          typeof marker.getLatLng !==
            "function" ||
          !marker.__airThreatTrack
        ) {
          return;
        }

        items.push({
          marker: marker,
          latlng:
            marker.getLatLng(),

          track:
            marker.__airThreatTrack,

          __airThreatTrack:
            marker.__airThreatTrack,

          __airThreatCount:
            marker.__airThreatCount ||
            1,

          currentScreenOffset: {
            x: 0,
            y: 0
          }
        });
      }
    );

    assignCurrentMarkerOffsets(
      items
    );

    items.forEach(function(item) {
      const marker =
        item.marker;

      marker.__airThreatOffset = {
        x:
          Number(
            item.currentScreenOffset.x
          ) || 0,

        y:
          Number(
            item.currentScreenOffset.y
          ) || 0
      };
    });
  }


  function renderAirPayload(payload) {
    ensureAirLayers();
    clearAirLayers();
    addAirLayerToMap();


    const trackRows =
      getTracks(
        payload
      );


    const backendActiveRows =
      trackRows.filter(
        function(row) {
          return isTrackActive(
            row.track
          );
        }
      );


    /*
     * Operational LIVE state:
     *
     * backend active
     * AND
     * meaningful source observation <= 30 minutes old.
     */
    const activeRows =
      backendActiveRows.filter(
        function(row) {
          return isTrackFreshActive(
            row.track
          );
        }
      );


    const staleActiveRows =
      backendActiveRows.filter(
        function(row) {
          return !isTrackFreshActive(
            row.track
          );
        }
      );


    const terminalRows =
      trackRows.filter(
        function(row) {

          const terminal =
            row.track &&
            row.track.current_terminal;


          return Boolean(
            terminal &&
            terminal.drawable === true &&
            !terminal.superseded_by_message_id &&
            terminalLiveOpacity(
              terminal
            ) > 0
          );
        }
      );


    if (selectedAirTrackId) {

      const selectedStillExists =
        trackRows.some(
          function(row) {

            return (
              airTrackKey(
                row.track
              ) ===
              selectedAirTrackId
            );

          }
        );


      if (!selectedStillExists) {
        selectedAirTrackId =
          null;
      }
    }


    /*
     * Which tracks get detailed history and curves?
     */
    let detailRows = [];

    if (
      airTrackDisplayMode ===
      "all"
    ) {

      const detailKeys =
        new Set();


      activeRows
        .concat(
          terminalRows
        )
        .forEach(
          function(row) {

            const key =
              airTrackKey(
                row.track
              );


            if (
              !key ||
              detailKeys.has(
                key
              )
            ) {
              return;
            }


            detailKeys.add(
              key
            );

            detailRows.push(
              row
            );

          }
        );
    }


    else if (
      airTrackDisplayMode ===
        "selected" &&
      selectedAirTrackId
    ) {

      detailRows =
        trackRows.filter(
          function(row) {

            return (
              airTrackKey(
                row.track
              ) ===
              selectedAirTrackId
            );

          }
        );
    }


    /*
     * Historical debug tracks are deliberately appended
     * AFTER normal ALL / SELECTED filtering.
     *
     * They remain inactive and therefore never become
     * CURRENT POSITION markers or increase ACTIVE TRACKS.
     */
    if (AIR_DEBUG_TRACK_ID) {

      const historicalDebugRows =
        trackRows.filter(
          function(row) {
            return Boolean(
              row &&
              row.track &&
              row.track.__airDebugHistorical ===
                true
            );
          }
        );


      historicalDebugRows.forEach(
        function(row) {

          const key =
            airTrackKey(
              row.track
            );


          const alreadyIncluded =
            detailRows.some(
              function(existingRow) {
                return (
                  airTrackKey(
                    existingRow.track
                  ) === key
                );
              }
            );


          if (!alreadyIncluded) {
            detailRows.push(
              row
            );
          }

        }
      );


      console.info(
        "[AIR DEBUG] historical tracks rendered:",
        historicalDebugRows.length
      );
    }


    /*
     * One logical track may have several source-reported
     * current places in its newest report.
     *
     * Flatten them into individual map markers while keeping
     * the same thread/track identity.
     */
    const preparedRows = [];


    activeRows.forEach(
      function(row) {

        const observations =
          getLatestResolvedObservations(
            row.track
          );


        observations.forEach(
          function(
            observation,
            observationIndex
          ) {

            preparedRows.push({
              thread:
                row.thread,

              track:
                row.track,

              observation:
                observation,

              observationIndex:
                observationIndex,

              observationCount:
                observations.length,

              currentScreenOffset: {
                x: 0,
                y: 0
              }
            });

          }
        );

      }
    );


    buildCurrentMarkerOffsets(
      preparedRows
    );


    const seenEdges =
      new Set();

    const seenHistory =
      new Set();


    let markerCount = 0;

    let mappedTrackCount = 0;

    let terminalMarkerCount = 0;

    let historicalCount = 0;

    let edgeCount = 0;


    /*
     * Number of fresh logical threats that have at least one
     * resolved current source-reported place.
     */
    activeRows.forEach(
      function(row) {

        if (
          getLatestResolvedObservations(
            row.track
          ).length > 0
        ) {
          mappedTrackCount += 1;
        }

      }
    );


    /*
     * Detailed history / source-reported curves.
     */
    detailRows.forEach(
      function(row) {

        const thread =
          row.thread;

        const track =
          row.track;


        const currentObservations =
          isTrackFreshActive(
            track
          )
            ? getLatestResolvedObservations(
                track
              )
            : [];


        const currentKeys =
          new Set();


        currentObservations.forEach(
          function(observation) {

            currentKeys.add(
              endpointKey({
                message_id:
                  observation.event.message_id,

                telegram_date:
                  observation.event.telegram_date,

                place:
                  observation.place
              })
            );

          }
        );


        (
          track.segments || []
        ).forEach(
          function(segment) {

            (
              segment.events || []
            ).forEach(
              function(event) {

                (
                  event.places || []
                ).forEach(
                  function(place) {

                    if (
                      addReportedEventPlace(
                        thread,
                        track,
                        event,
                        place,
                        seenHistory,
                        currentKeys
                      )
                    ) {
                      historicalCount += 1;
                    }

                  }
                );

              }
            );

          }
        );


        drawTrackSequenceCurves(
          thread,
          track,
          seenEdges
        );

      }
    );


    /*
     * Terminal status markers remain independent
     * from SEL / ALL / OFF.
     */
    terminalRows.forEach(
      function(row) {

        if (
          addTerminalMarker(
            row.thread,
            row.track
          )
        ) {
          terminalMarkerCount += 1;
        }

      }
    );


    /*
     * Fresh current source-reported positions.
     */
    preparedRows.forEach(
      function(row) {

        const thread =
          row.thread;

        const track =
          row.track;

        const observation =
          row.observation;

        const currentScreenOffset =
          row.currentScreenOffset ||
          {
            x: 0,
            y: 0
          };


        if (!observation) {
          return;
        }


        const event =
          observation.event ||
          {};


        const marker =
          L.marker(
            observation.latlng,
            {
              icon:
                createThreatIcon(
                  track,
                  true,
                  event.reported_object_count ||
                    1,
                  currentScreenOffset
                ),

              keyboard:
                true,

              riseOnHover:
                true,

              zIndexOffset:
                500,

              bubblingMouseEvents:
                false
            }
          );


        marker.__airThreatTrack =
          track;


        marker.__airThreatCount =
          event.reported_object_count ||
          1;


        marker.__airThreatOffset = {
          x:
            Number(
              currentScreenOffset.x
            ) || 0,

          y:
            Number(
              currentScreenOffset.y
            ) || 0
        };


        marker.bindPopup(
          buildPopupHtml(
            thread,
            track,
            event,
            observation.place ||
              {},
            "current"
          ),
          {
            maxWidth:
              360
          }
        );


        marker.on(
          "click",
          function() {

            const trackId =
              airTrackKey(
                track
              );


            /*
             * Clicking a threat must NOT change the
             * user-selected track display mode.
             *
             * ALL  -> stays ALL
             * OFF  -> stays OFF
             * SEL  -> stays SEL and changes only
             *         which track is selected.
             */
            if (
              airTrackDisplayMode ===
                "selected" &&
              selectedAirTrackId !==
                trackId
            ) {
              selectAirTrack(
                track
              );
            }

          }
        );


        installMarkerClickReticle(
          marker
        );


        marker.addTo(
          airMarkerLayer
        );


        if (
          reopenSelectedPopup &&
          selectedAirTrackId ===
            airTrackKey(track)
        ) {

          /*
           * For a multi-place current report we reopen only
           * the marker that triggered the rerender first.
           */
          window.setTimeout(
            function() {

              if (
                mode === "air" &&
                map &&
                map.hasLayer(
                  marker
                )
              ) {
                marker.openPopup();
              }

            },
            0
          );


          reopenSelectedPopup =
            false;
        }


        markerCount += 1;

      }
    );


    return {
      loadedTracks:
        trackRows.length,

      backendActiveTracks:
        backendActiveRows.length,

      activeTracks:
        activeRows.length,

      staleActiveTracks:
        staleActiveRows.length,

      mappedTracks:
        mappedTrackCount,

      markers:
        markerCount,

      terminalMarkers:
        terminalMarkerCount,

      historicalMarkers:
        historicalCount,

      edges:
        edgeCount
    };
  }



  function installAirDisclaimerStyles() {
    if (
      document.getElementById(
        "air-disclaimer-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement("style");

    style.id =
      "air-disclaimer-styles";

    style.textContent = `
      .air-disclaimer-overlay {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        box-sizing: border-box;
        background:
          radial-gradient(
            circle at center,
            rgba(0, 24, 32, 0.40),
            rgba(0, 3, 7, 0.90)
          );
        backdrop-filter: blur(5px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition:
          opacity 150ms linear,
          visibility 150ms linear;
      }

      .air-disclaimer-overlay.is-visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .air-disclaimer-panel {
        position: relative;
        width: min(760px, 94vw);
        max-height: 86vh;
        overflow: auto;
        padding: 28px 30px 24px;
        box-sizing: border-box;
        background:
          linear-gradient(
            180deg,
            rgba(1, 21, 29, 0.985),
            rgba(0, 10, 16, 0.985)
          );
        border:
          1px solid
          rgba(0, 220, 255, 0.52);
        box-shadow:
          0 0 0 1px
            rgba(0, 180, 220, 0.10)
            inset,
          0 0 22px
            rgba(0, 210, 255, 0.18),
          0 0 100px
            rgba(0, 130, 180, 0.12);
        color: #d3faff;
      }

      .air-disclaimer-panel::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          repeating-linear-gradient(
            180deg,
            rgba(0, 235, 255, 0.026) 0,
            rgba(0, 235, 255, 0.026) 1px,
            transparent 2px,
            transparent 4px
          );
      }

      .air-disclaimer-panel::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 2px;
        pointer-events: none;
        background:
          linear-gradient(
            90deg,
            transparent,
            rgba(0, 235, 255, 0.88),
            transparent
          );
        box-shadow:
          0 0 12px
          rgba(0, 235, 255, 0.48);
        animation:
          airDisclaimerScan
          2.6s
          linear
          infinite;
      }

      .air-disclaimer-kicker {
        position: relative;
        z-index: 2;
        color:
          var(--amber, #ffd15c);
        font-size: 10px;
        letter-spacing: 0.24em;
        margin-bottom: 9px;
      }

      .air-disclaimer-title {
        position: relative;
        z-index: 2;
        margin: 0 0 20px;
        color:
          var(--cyan, #43e9ff);
        font-size:
          clamp(19px, 3vw, 27px);
        line-height: 1.1;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-shadow:
          0 0 13px
          rgba(67, 233, 255, 0.38);
      }

      .air-disclaimer-body {
        position: relative;
        z-index: 2;
        font-size: 14px;
        line-height: 1.62;
        color: #c9eef3;
      }

      .air-disclaimer-body p {
        margin: 0 0 13px;
      }

      .air-disclaimer-actions {
        position: relative;
        z-index: 2;
        display: flex;
        justify-content: flex-end;
        margin-top: 21px;
        padding-top: 17px;
        border-top:
          1px solid
          rgba(0, 215, 245, 0.17);
      }

      .air-disclaimer-ok {
        min-width: 116px;
        padding: 10px 20px;
        border:
          1px solid
          rgba(255, 195, 62, 0.68);
        background:
          linear-gradient(
            180deg,
            rgba(22, 25, 12, 0.95),
            rgba(10, 15, 8, 0.95)
          );
        color:
          var(--amber, #ffd15c);
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.17em;
        cursor: pointer;
        box-shadow:
          0 0 12px
          rgba(255, 195, 62, 0.16);
        transition:
          transform 100ms linear,
          border-color 100ms linear,
          box-shadow 100ms linear;
      }

      .air-disclaimer-ok:hover,
      .air-disclaimer-ok:focus-visible {
        outline: none;
        transform:
          translateY(-1px);
        border-color:
          #ffe097;
        box-shadow:
          0 0 18px
          rgba(255, 195, 62, 0.30);
      }

      .air-disclaimer-glitch-in {
        animation:
          airDisclaimerGlitchIn
          260ms
          steps(2, end);
      }

      .air-disclaimer-glitch-out {
        animation:
          airDisclaimerGlitchOut
          210ms
          steps(2, end)
          forwards;
      }

      @keyframes airDisclaimerGlitchIn {
        0% {
          opacity: 0;
          transform:
            translateX(-12px)
            skewX(-1.5deg)
            scale(0.985);
          filter: blur(4px);
        }
        20% {
          opacity: 0.85;
          transform:
            translateX(9px)
            skewX(1deg);
        }
        42% {
          transform:
            translateX(-5px);
        }
        67% {
          transform:
            translateX(4px);
        }
        82% {
          transform:
            translateX(-2px);
        }
        100% {
          opacity: 1;
          transform: none;
          filter: none;
        }
      }

      @keyframes airDisclaimerGlitchOut {
        0% {
          opacity: 1;
          transform: none;
        }
        28% {
          transform:
            translateX(6px)
            skewX(-1deg);
        }
        53% {
          transform:
            translateX(-9px)
            skewX(1deg);
        }
        74% {
          opacity: 0.48;
          transform:
            translateX(5px)
            scaleY(0.985);
        }
        100% {
          opacity: 0;
          transform:
            translateY(6px)
            scale(0.985);
          filter: blur(3px);
        }
      }

      @keyframes airDisclaimerScan {
        0% {
          top: 0%;
          opacity: 0;
        }
        10% {
          opacity: 0.8;
        }
        90% {
          opacity: 0.35;
        }
        100% {
          top: 100%;
          opacity: 0;
        }
      }

      @media (
        prefers-reduced-motion:
        reduce
      ) {
        .air-disclaimer-panel,
        .air-disclaimer-panel::after {
          animation: none !important;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }


  function ensureAirDisclaimerModal() {
    let overlay =
      document.getElementById(
        "air-disclaimer-overlay"
      );

    if (overlay) {
      return overlay;
    }

    overlay =
      document.createElement(
        "div"
      );

    overlay.id =
      "air-disclaimer-overlay";

    overlay.className =
      "air-disclaimer-overlay";

    overlay.setAttribute(
      "role",
      "dialog"
    );

    overlay.setAttribute(
      "aria-modal",
      "true"
    );

    overlay.setAttribute(
      "aria-labelledby",
      "air-disclaimer-title"
    );

    const panel =
      document.createElement(
        "div"
      );

    panel.className =
      "air-disclaimer-panel";

    const kicker =
      document.createElement(
        "div"
      );

    kicker.className =
      "air-disclaimer-kicker";

    kicker.textContent =
      "AIR THREAT // INFORMATION SYSTEM";

    const title =
      document.createElement(
        "h2"
      );

    title.id =
      "air-disclaimer-title";

    title.className =
      "air-disclaimer-title";

    title.textContent =
      AIR_DISCLAIMER_TITLE;

    const body =
      document.createElement(
        "div"
      );

    body.className =
      "air-disclaimer-body";

    AIR_DISCLAIMER_LINES.forEach(
      function(line) {
        const paragraph =
          document.createElement(
            "p"
          );

        paragraph.textContent =
          line;

        body.appendChild(
          paragraph
        );
      }
    );

    const actions =
      document.createElement(
        "div"
      );

    actions.className =
      "air-disclaimer-actions";

    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "air-disclaimer-ok";

    button.textContent =
      "OK";

    button.addEventListener(
      "click",
      hideAirDisclaimer
    );

    actions.appendChild(
      button
    );

    panel.appendChild(
      kicker
    );

    panel.appendChild(
      title
    );

    panel.appendChild(
      body
    );

    panel.appendChild(
      actions
    );

    overlay.appendChild(
      panel
    );

    document.body.appendChild(
      overlay
    );

    return overlay;
  }


  function showAirDisclaimer() {
    installAirDisclaimerStyles();

    const overlay =
      ensureAirDisclaimerModal();

    const panel =
      overlay.querySelector(
        ".air-disclaimer-panel"
      );

    if (!panel) {
      return;
    }

    panel.classList.remove(
      "air-disclaimer-glitch-out"
    );

    panel.classList.remove(
      "air-disclaimer-glitch-in"
    );

    void panel.offsetWidth;

    overlay.classList.add(
      "is-visible"
    );

    panel.classList.add(
      "air-disclaimer-glitch-in"
    );

    window.setTimeout(
      function() {
        panel.classList.remove(
          "air-disclaimer-glitch-in"
        );
      },
      280
    );

    const button =
      panel.querySelector(
        ".air-disclaimer-ok"
      );

    if (button) {
      window.setTimeout(
        function() {
          button.focus();
        },
        50
      );
    }
  }


  function hideAirDisclaimer() {
    const overlay =
      document.getElementById(
        "air-disclaimer-overlay"
      );

    if (!overlay) {
      return;
    }

    const panel =
      overlay.querySelector(
        ".air-disclaimer-panel"
      );

    if (!panel) {
      return;
    }

    panel.classList.remove(
      "air-disclaimer-glitch-in"
    );

    void panel.offsetWidth;

    panel.classList.add(
      "air-disclaimer-glitch-out"
    );

    window.setTimeout(
      function() {
        overlay.classList.remove(
          "is-visible"
        );

        panel.classList.remove(
          "air-disclaimer-glitch-out"
        );
      },
      230
    );
  }


  function renderAirHud(stats) {
    setText("#top-bar .brand", "AIR THREAT // TRACK SYS");
    setHudStat("hud-total", stats.loadedTracks, "tracks loaded");
    setHudStat("hud-shown", stats.activeTracks, "active tracks");
    setHudStat(
      "hud-participants",
      stats.markers,
      "mapped positions"
    );

    const live = $("hud-live");
    if (live) {
      live.textContent =
        airDataMode === "demo"
          ? "● DEMO FEED"
          : "● AIR FEED";
      live.style.color = "var(--amber)";
      live.title =
        stats.historicalMarkers +
        " reported historical positions; " +

        stats.terminalMarkers +
        " recent terminal markers; " +

        stats.staleActiveTracks +
        " backend-active tracks hidden by 30 min LIVE TTL; " +

        "TRK mode: " +
        airTrackDisplayMode.toUpperCase();
    }
  }

  function buildAirUrl() {

    /*
     * DEMO mode deliberately bypasses the Oracle API.
     *
     * Timestamp prevents the browser from serving
     * an old cached demo JSON.
     */
    if (
      airDataMode === "demo"
    ) {
      return (
        AIR_DEMO_URL +
        "?t=" +
        Date.now()
      );
    }


    const params =
      new URLSearchParams({
        lookback_hours:
          String(
            AIR_LOOKBACK_HOURS
          ),

        limit:
          String(
            AIR_LIMIT_THREADS
          ),

        active_only:
          "false",

        geometry_only:
          "false"
      });


    return (
      AIR_API_URL +
      "?" +
      params.toString()
    );
  }



  function collectDemoDates(
    payload
  ) {
    const dates = [];


    const addDate =
      function(value) {

        if (!value) {
          return;
        }

        const ms =
          new Date(
            value
          ).getTime();

        if (
          Number.isFinite(ms)
        ) {
          dates.push(ms);
        }
      };


    (
      payload &&
      payload.threads ||
      []
    ).forEach(
      function(thread) {

        (
          thread.tracks || []
        ).forEach(
          function(track) {

            (
              track.segments || []
            ).forEach(
              function(segment) {

                (
                  segment.events || []
                ).forEach(
                  function(event) {

                    addDate(
                      event.telegram_date
                    );

                  }
                );

              }
            );


            const terminal =
              track.current_terminal;

            if (terminal) {
              addDate(
                terminal.telegram_date
              );
            }

          }
        );

      }
    );


    return dates;
  }


  function shiftDemoDate(
    value,
    deltaMs
  ) {
    if (!value) {
      return value;
    }

    const oldMs =
      new Date(
        value
      ).getTime();

    if (
      !Number.isFinite(
        oldMs
      )
    ) {
      return value;
    }

    return new Date(
      oldMs +
      deltaMs
    ).toISOString();
  }


  function normalizeDemoPayloadTime(
    payload
  ) {

    if (
      airDataMode !== "demo" ||
      !payload
    ) {
      return payload;
    }


    const dates =
      collectDemoDates(
        payload
      );


    if (
      dates.length === 0
    ) {
      return payload;
    }


    /*
     * Make the newest DEMO event look like it arrived
     * approximately two minutes ago.
     *
     * Every other timestamp is shifted by exactly the
     * same amount, preserving the original chronology.
     */
    const newestDemoMs =
      Math.max(
        ...dates
      );


    const targetNewestMs =
      Date.now() -
      (2 * 60 * 1000);


    const deltaMs =
      targetNewestMs -
      newestDemoMs;


    (
      payload.threads || []
    ).forEach(
      function(thread) {

        (
          thread.tracks || []
        ).forEach(
          function(track) {

            (
              track.segments || []
            ).forEach(
              function(segment) {

                (
                  segment.events || []
                ).forEach(
                  function(event) {

                    event.telegram_date =
                      shiftDemoDate(
                        event.telegram_date,
                        deltaMs
                      );

                  }
                );

              }
            );


            const terminal =
              track.current_terminal;

            if (terminal) {

              terminal.telegram_date =
                shiftDemoDate(
                  terminal.telegram_date,
                  deltaMs
                );

            }

          }
        );

      }
    );


    return payload;
  }


  async function loadAirTracks() {
    if (mode !== "air") return;

    if (activeRequest) {
      activeRequest.abort();
    }

    activeRequest = new AbortController();

    const live = $("hud-live");
    if (live) {
      live.textContent =
        airDataMode === "demo"
          ? "● DEMO LOADING"
          : "● AIR SYNCING";
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

      let payload = await response.json();

      if (
        airDataMode === "live"
      ) {
        payload =
          normalizeMonitorPayload(
            payload
          );

        resolveMonitorLinearReferences(
          payload
        );

        applyMonitorTerminalAnchorOverrides(
          payload
        );


        /*
         * Optional historical debug branch.
         *
         * This is fetched independently of the normal
         * /api/monitor/tracks limit and TTL.
         *
         * The backend debug endpoint returns is_active=false,
         * therefore this branch can only appear as historical
         * detail and can never become a LIVE/current threat.
         */
        const debugUrl =
          buildAirDebugTrackUrl();

        if (debugUrl) {

          try {

            const debugResponse =
              await fetch(
                debugUrl,
                {
                  method: "GET",
                  cache: "no-store",
                  headers: {
                    "Accept":
                      "application/json"
                  },
                  signal:
                    activeRequest.signal
                }
              );


            if (!debugResponse.ok) {
              throw new Error(
                "AIR DEBUG API HTTP " +
                debugResponse.status
              );
            }


            let debugPayload =
              await debugResponse.json();


            debugPayload =
              normalizeMonitorPayload(
                debugPayload
              );


            resolveMonitorLinearReferences(
              debugPayload
            );


            applyMonitorTerminalAnchorOverrides(
              debugPayload
            );


            const debugThreads =
              Array.isArray(
                debugPayload &&
                debugPayload.threads
              )
                ? debugPayload.threads
                : [];


            /*
             * Explicitly mark tracks coming from the
             * historical debug endpoint.
             *
             * Rendering can then identify them without
             * depending on normal API list lookup.
             */
            debugThreads.forEach(
              function(thread) {

                (
                  Array.isArray(thread.tracks)
                    ? thread.tracks
                    : []
                ).forEach(
                  function(track) {
                    track.__airDebugHistorical =
                      true;
                  }
                );

              }
            );


            if (debugThreads.length > 0) {

              const existingThreads =
                Array.isArray(
                  payload.threads
                )
                  ? payload.threads
                  : [];


              const debugKeys =
                new Set(
                  debugThreads.map(
                    function(thread) {
                      return String(
                        thread.branch_id ||
                        ""
                      );
                    }
                  )
                );


              payload.threads =
                existingThreads.filter(
                  function(thread) {
                    return !debugKeys.has(
                      String(
                        thread.branch_id ||
                        ""
                      )
                    );
                  }
                ).concat(
                  debugThreads
                );


              payload.thread_count =
                payload.threads.length;


              payload.track_count =
                payload.threads.reduce(
                  function(total, thread) {
                    return (
                      total +
                      (
                        Array.isArray(
                          thread.tracks
                        )
                          ? thread.tracks.length
                          : 0
                      )
                    );
                  },
                  0
                );


              console.info(
                "[AIR DEBUG] historical branch loaded:",
                AIR_DEBUG_TRACK_ID
              );
            }

          } catch (debugError) {

            if (
              debugError &&
              debugError.name ===
                "AbortError"
            ) {
              throw debugError;
            }


            console.error(
              "[AIR DEBUG] historical branch load failed:",
              debugError
            );
          }
        }
      }

      normalizeDemoPayloadTime(
        payload
      );

      if (mode !== "air") return;

      lastPayload = payload;
      const stats = renderAirPayload(payload);
      renderAirHud(stats);
    } catch (error) {
      if (error && error.name === "AbortError") return;

      console.error("AIR mode load failed:", error);

      const errorLive = $("hud-live");
      if (errorLive) {
        errorLive.textContent =
          airDataMode === "demo"
            ? "● DEMO FILE ERROR"
            : "● AIR FEED ERROR";
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
    showAirDisclaimer();
    if (mode === "air") return;

    rememberMineState();
    hideMineUi();

    mode = "air";
    lastPayload = null;

    installAirTrackModeButton();
    installAirDataModeButton();

    const dataModeButton =
      $("toggle-air-data-mode");

    if (dataModeButton) {
      dataModeButton.style.display =
        "";

      updateAirDataModeButton();
    }


    const trackModeButton =
      $("toggle-air-tracks");

    if (trackModeButton) {
      trackModeButton.style.display =
        "";

      updateAirTrackModeButton();
    }

    addAirLayerToMap();
    showAirLegend();

    await ensureAirRingRoadLoaded();

    ensureAirVisualSettingsPanel();
    setAirVisualPanelVisible(false);

    applyAirVisualSettings(false);

    const settingsButton =
      $("toggle-heat-settings");

    if (settingsButton) {
      settingsButton.title =
        "Налаштування AIR-візуалізації";
    }

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

    selectedAirTrackId =
      null;

    reopenSelectedPopup =
      false;

    const trackModeButton =
      $("toggle-air-tracks");

    if (trackModeButton) {
      trackModeButton.style.display =
        "none";
    }


    const dataModeButton =
      $("toggle-air-data-mode");

    if (dataModeButton) {
      dataModeButton.style.display =
        "none";
    }

    if (activeRequest) {
      activeRequest.abort();
      activeRequest = null;
    }

    clearAirLayers();
    removeAirLayerFromMap();

    if (
      airRingRoadLayer &&
      typeof map !== "undefined" &&
      map.hasLayer(
        airRingRoadLayer
      )
    ) {
      map.removeLayer(
        airRingRoadLayer
      );
    }

    hideAirLegend();

    setAirVisualPanelVisible(false);

    const settingsButton =
      $("toggle-heat-settings");

    if (settingsButton) {
      settingsButton.title =
        "Налаштування heatmap";
    }

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

  function installAirTrackModeButton() {
    const iconControl =
      document.querySelector(
        ".icon-control"
      );

    if (
      !iconControl ||
      $("toggle-air-tracks")
    ) {
      return;
    }

    const button =
      document.createElement(
        "button"
      );

    button.id =
      "toggle-air-tracks";

    button.type =
      "button";

    button.textContent =
      "SEL";

    button.title =
      "Треки: SEL — клікни по цілі";

    button.style.display =
      mode === "air"
        ? ""
        : "none";

    button.addEventListener(
      "click",
      function(event) {
        event.preventDefault();
        event.stopPropagation();

        if (mode !== "air") {
          return;
        }

        cycleAirTrackDisplayMode();
      }
    );

    iconControl.appendChild(
      button
    );

    updateAirTrackModeButton();
  }


  function updateAirDataModeButton() {

    const button =
      $("toggle-air-data-mode");

    if (!button) {
      return;
    }


    if (
      airDataMode === "demo"
    ) {
      button.textContent =
        "DEMO";

      button.title =
        "Демо-дані активні. Натисни, щоб перейти на LIVE.";

      button.style.color =
        "#ffd84d";

      button.style.background =
        "rgba(255,216,77,.12)";

      button.style.borderColor =
        "rgba(255,216,77,.65)";
    }

    else {
      button.textContent =
        "LIVE";

      button.title =
        "Живі дані з сервера. Натисни, щоб перейти на DEMO.";

      button.style.color =
        "#57f287";

      button.style.background =
        "rgba(87,242,135,.09)";

      button.style.borderColor =
        "rgba(87,242,135,.55)";
    }
  }


  function setAirDataMode(
    nextMode
  ) {

    airDataMode =
      nextMode === "demo"
        ? "demo"
        : "live";


    try {
      localStorage.setItem(
        AIR_DATA_MODE_STORAGE_KEY,
        airDataMode
      );
    } catch (error) {
      // localStorage can be unavailable.
    }


    lastPayload =
      null;


    if (
      activeRequest
    ) {
      activeRequest.abort();
      activeRequest = null;
    }


    updateAirDataModeButton();


    if (
      mode === "air"
    ) {
      loadAirTracks();
    }
  }


  function toggleAirDataMode() {

    setAirDataMode(
      airDataMode === "live"
        ? "demo"
        : "live"
    );
  }


  function installAirDataModeButton() {

    const iconControl =
      document.querySelector(
        ".icon-control"
      );


    if (
      !iconControl ||
      $("toggle-air-data-mode")
    ) {
      return;
    }


    const button =
      document.createElement(
        "button"
      );


    button.id =
      "toggle-air-data-mode";

    button.type =
      "button";

    button.style.display =
      mode === "air"
        ? ""
        : "none";


    button.addEventListener(
      "click",
      function(event) {

        event.preventDefault();
        event.stopPropagation();

        toggleAirDataMode();
      }
    );


    iconControl.appendChild(
      button
    );


    updateAirDataModeButton();
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
    installAirLegendStyles();
    buildAirLegend();

    ensureAirLayers();
    installButton();
    installAirTrackModeButton();
    installAirDataModeButton();

    ensureAirVisualSettingsPanel();
    installAirSettingsButtonHook();
    applyAirVisualSettings(false);

    window.setTimeout(
      installAirSettingsButtonHook,
      250
    );

    window.setTimeout(
      installAirSettingsButtonHook,
      1000
    );

    if (typeof map !== "undefined") {
      map.on(
        "zoomend",
        updateThreatMarkerScale
      );
    }

    if (typeof map !== "undefined") {
      map.on(
        "overlayadd",
        suppressMineOverlayInAir
      );

      /*
       * In SEL mode a click on empty map clears the selected
       * track and returns to a clean operational view.
       */
      map.on(
        "click",
        function() {
          if (
            mode === "air" &&
            airTrackDisplayMode ===
              "selected"
          ) {
            clearSelectedAirTrack();
          }
        }
      );
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
