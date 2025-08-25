
// 1) MAP CORE
const supportsTD = typeof L.TimeDimension !== 'undefined';
const map = L.map('map', supportsTD ? {
  zoomControl: true,
  timeDimension: true,
  timeDimensionControl: true,
  timeDimensionOptions: { timeInterval: "2022-06-01/2026-12-31", period: "P1M" }
} : { zoomControl:true }).setView([49.9935, 36.2304], 8);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);
const baseLayers = { 'OpenStreetMap': osm };

// 2) CHOROPLETH
function color(v){
  return v > 5000 ? '#800026' :
         v > 1000 ? '#BD0026' :
         v > 500  ? '#E31A1C' :
         v > 100  ? '#FC4E2A' :
         v > 50   ? '#FD8D3C' :
         v > 10   ? '#FEB24C' : '#FFEDA0';
}
const choroplethLayer = L.layerGroup().addTo(map);
fetch('data/admin_agg.geojson').then(r=>r.json()).then(geo=>{
  const layer = L.geoJSON(geo, {
    style: f => ({ weight:1, color:'#999', fillOpacity:.7, fillColor: color((f.properties?.sum_participants)||0) }),
    onEachFeature: (f,l)=>{
      const p=f.properties||{};
      l.bindPopup(`<b>${p.hromada||'Громада'}</b><br>Осіб за період: ${p.sum_participants??0}`);
      l.on('mouseover', ()=>l.setStyle({weight:2,color:'#555'}));
      l.on('mouseout', ()=>l.setStyle({weight:1,color:'#999'}));
    }
  });
  choroplethLayer.addLayer(layer);
}).catch(console.error);

// 3) POINTS: cluster + time + heat
const clusterLayer = L.markerClusterGroup();
const timePointsGroup = L.layerGroup();
let heatLayer = null;
let allSessions = [];

function buildLayers(features) {
  // Clear old
  clusterLayer.clearLayers();
  timePointsGroup.clearLayers();
  if (heatLayer) {
    heatLayer.setLatLngs([]);
  }
  const geo = { type:'FeatureCollection', features: features };
  // markers for cluster
  const markers = L.geoJSON(geo, {
    pointToLayer: (f,latlng) => L.marker(latlng),
    onEachFeature: (f, layer) => {
      const p=f.properties||{};
      layer.bindPopup(
        `<b>${p.datetime||'—'}</b><br>${p.hromada||''}${p.rayon?', '+p.rayon:''}<br>`+
        `Аудиторія: ${p.audience||'—'}<br>Інструктор: ${p.instructor||'—'}<br>Осіб: ${p.participants??'—'}`
      );
    }
  });
  clusterLayer.addLayer(markers);
  // time
  if (supportsTD) {
    const featuresWithTime = features.map(f => {
      const copy = JSON.parse(JSON.stringify(f));
      if (copy.properties) copy.properties.time = copy.properties.datetime;
      return copy;
    });
    const timeGeo = L.geoJSON({type:'FeatureCollection', features: featuresWithTime}, { pointToLayer: (f,latlng) => L.circleMarker(latlng,{radius:6,color:'#0a84ff',fillColor:'#0a84ff',fillOpacity:.8}) });
    const td = L.timeDimension.layer.geoJson(timeGeo, { updateTimeDimension:true, addlastPoint:false, duration:'P15D', waitForReady:true });
    timePointsGroup.addLayer(td);
  }
  // heat
  if (typeof L.heatLayer !== 'undefined') {
    const heatData = features.map(f => {
      const c=f.geometry?.coordinates, p=f.properties||{};
      if(!c) return null;
      const intensity = Math.min(1, (p.participants||1)/100);
      return [c[1], c[0], intensity];
    }).filter(Boolean);
    if (!heatLayer) {
      heatLayer = L.heatLayer(heatData, { radius:25, blur:15, maxZoom:12 });
    } else {
      heatLayer.setLatLngs(heatData);
    }
  }
}

function loadSessions(url) {
  return fetch(url).then(r=>r.json()).then(geo => {
    allSessions = geo.features;
    buildLayers(allSessions);
  }).catch(console.error);
}

function applyFilters() {
  const searchText = document.getElementById('search-input').value.trim().toLowerCase();
  const startValue = document.getElementById('start-date').value;
  const endValue = document.getElementById('end-date').value;
  const startDate = startValue ? new Date(startValue) : null;
  const endDate = endValue ? new Date(endValue) : null;
  const filtered = allSessions.filter(f => {
    const p = f.properties || {};
    const matchSearch = !searchText || (p.hromada && p.hromada.toLowerCase().includes(searchText)) || (p.rayon && p.rayon.toLowerCase().includes(searchText)) || (p.audience && p.audience.toLowerCase().includes(searchText));
    const date = new Date(p.datetime);
    const matchStart = !startDate || date >= startDate;
    const matchEnd = !endDate || date <= endDate;
    return matchSearch && matchStart && matchEnd;
  });
  buildLayers(filtered);
}

// Search control UI
const searchControl = L.control({ position:'topright' });
searchControl.onAdd = function(){
  const div = L.DomUtil.create('div','search-control');
  div.innerHTML = `
    <input type="text" id="search-input" placeholder="Пошук..." title="Пошук по назві громади, району або аудиторії" />
    <label>Від: <input type="date" id="start-date" /></label>
    <label>До: <input type="date" id="end-date" /></label>
    <button id="filter-btn" style="cursor:pointer;">Фільтрувати</button>
    <button id="refresh-btn" style="cursor:pointer;">Оновити дані</button>
  `;
  L.DomEvent.disableClickPropagation(div);
  return div;
};
searchControl.addTo(map);

// Event listeners
setTimeout(() => {
  document.getElementById('filter-btn').addEventListener('click', applyFilters);
  document.getElementById('refresh-btn').addEventListener('click', () => {
    loadSessions('data/sessions.geojson?nocache=' + Date.now()).then(applyFilters);
  });
}, 0);

// 4) LAYERS CONTROL
const overlays = { 'Кластер точок': clusterLayer, 'Хороплет громад': choroplethLayer };
if (supportsTD) overlays['Точки у часі (Time slider)'] = timePointsGroup;
if (typeof L.heatLayer !== 'undefined') {
  const proxy = L.layerGroup();
  proxy.on('add', ()=>{ heatLayer && heatLayer.addTo(map); });
  proxy.on('remove', ()=>{ heatLayer && map.removeLayer(heatLayer); });
  overlays['Heatmap (щільність)'] = proxy;
}
L.control.layers(baseLayers, overlays, {collapsed:false}).addTo(map);

// default layers
map.addLayer(clusterLayer);
map.addLayer(choroplethLayer);
if (supportsTD) map.addLayer(timePointsGroup);

// 5) LEGEND
const legend = L.control({position:'bottomright'});
legend.onAdd = function(){
  const div = L.DomUtil.create('div','legend');
  const grades=[0,10,50,100,500,1000,5000];
  div.innerHTML+='<b>Осіб за період</b><br>';
  for(let i=0;i<grades.length;i++){
    const from=grades[i], to=grades[i+1], c=color(from+0.1);
    div.innerHTML += `<i style="background:${c}"></i> ${from}${to?'&ndash;'+to:'+'}<br>`;
  }
  return div;
};
legend.addTo(map);

// Initial load
loadSessions('data/sessions.geojson?nocache=' + Date.now());
