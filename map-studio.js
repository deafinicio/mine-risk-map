/* Native UI, SVG glyphs and motion. No build step or third-party animation runtime. */
window.MapStudio = (() => {
  'use strict';
  const paths = {
    filter:'<path d="M4 6h16M7 12h10M10 18h4"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/>',
    settings:'<path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/><path d="m19 16 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    points:'<circle cx="6" cy="7" r="2"/><circle cx="17" cy="5" r="2"/><circle cx="13" cy="17" r="2"/><circle cx="4" cy="18" r="1"/><circle cx="20" cy="14" r="1"/>',
    heat:'<path d="M12 3c1 5 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 1 4 2 4 1-3 1-6 1-10Z"/>',
    map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15m6-12v15"/>',
    radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 7-7M12 3v2M3 12h2m7 7v2m7-9h2"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="4"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.2 6.2a8 8 0 0 1 13 2L20 12M4 12l.8 3.8a8 8 0 0 0 13 2"/>',
    motion:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    pin:'<path d="M18 10c0 5-6 10-6 10S6 15 6 10a6 6 0 0 1 12 0Z"/><circle cx="12" cy="10" r="2"/>',
    expand:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.points}</svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const plural = new Intl.PluralRules('uk-UA');
  const sessionLabel = count => ({one:'сесія',few:'сесії',many:'сесій',other:'сесії'}[plural.select(count)]);
  const peopleLabel = count => ({one:'учасник',few:'учасники',many:'учасників',other:'учасника'}[plural.select(count)]);
  const number = value => (Number(value)||0).toLocaleString('uk-UA');
  const el = id => document.getElementById(id);
  let started=false,hasData=false,motion=true,toastTimer;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function pointIcon() {
    return L.divIcon({className:'session-point-icon',html:`<span class="session-point">${icon('pin')}</span>`,iconSize:[26,26],iconAnchor:[13,13],popupAnchor:[0,-15]});
  }
  function clusterIcon(cluster) {
    const count=cluster.getChildCount(),rgb=count>=100?'99,235,189':count>=10?'101,223,245':'163,139,255';
    const size=count>=100?68:count>=10?62:56;
    return L.divIcon({className:'session-cluster',iconSize:[size,size],html:`<span class="cluster-shell" style="--cluster-color:rgb(${rgb});--cluster-rgb:${rgb}"><svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="30" stroke="rgb(${rgb})" stroke-opacity=".15"/><g class="cluster-orbit"><circle cx="32" cy="32" r="30" stroke="rgb(${rgb})" stroke-width="1.2" stroke-dasharray="28 44 12 104"/><circle cx="32" cy="2" r="2" fill="rgb(${rgb})"/></g><circle cx="32" cy="32" r="24" stroke="rgb(${rgb})" stroke-opacity=".09"/></svg><b>${number(count)}</b><small>${sessionLabel(count).toUpperCase()}</small></span>`});
  }
  function popup(p) {
    const date = typeof parseDate==='function' ? parseDate(p.session_date) : new Date(p.session_date);
    const label=date && !Number.isNaN(date.getTime())?date.toLocaleDateString('uk-UA',{day:'numeric',month:'long',year:'numeric'}):p.session_date||'Дата не вказана';
    const instructors=[p.instructor_1,p.instructor_2].filter(Boolean).join(', ');
    return `<article class="session-popup"><span class="popup-kicker">ПРОВЕДЕНА СЕСІЯ / EORE</span><h3>${escape(p.settlement||'Населений пункт')}</h3><p class="popup-location">${escape([p.hromada,p.raion].filter(Boolean).join(' · '))}</p><span class="popup-date">${icon('calendar')}${escape(label)}</span><div class="popup-metrics"><div><b>${number(p.participants_total)}</b><span>учасників</span></div><div><b>${number(p.participants_u18)}</b><span>до 18 років</span></div><div><b>${number(p.participants_18plus)}</b><span>дорослих</span></div></div><div class="popup-instructors">Інструктори<strong>${escape(instructors||'Не вказано')}</strong></div>${p.notes?`<div class="popup-notes">${escape(p.notes)}</div>`:''}</article>`;
  }
  function effects(enabled,persist=false) {
    motion=Boolean(enabled);document.documentElement.dataset.motion=motion?'on':'off';
    if(persist){try{localStorage.setItem('eore-map-motion',motion?'on':'off');}catch{}}
    const button=el('studio-motion');if(button){button.setAttribute('aria-pressed',String(motion));button.title=motion?'Вимкнути анімації':'Увімкнути анімації';button.setAttribute('aria-label',button.title);}
    document.dispatchEvent(new CustomEvent('eore:motion',{detail:{enabled:motion}}));
  }
  function toast(message) {
    let node=el('map-toast');if(!node){node=document.createElement('div');node.id='map-toast';node.className='map-toast glass-map';node.setAttribute('role','status');document.body.appendChild(node);}
    node.textContent=message;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,2400);
  }
  function fit(animate=true) {
    const mobile=innerWidth<=760;
    const options={paddingTopLeft:L.point(mobile?25:340,mobile?65:70),paddingBottomRight:L.point(mobile?45:95,mobile?160:110),maxZoom:10,duration:.85,animate:motion&&animate};
    if(motion&&animate)map.flyToBounds(kharkivBounds,options);else map.fitBounds(kharkivBounds,options);
  }
  function layerState() {
    if(!started)return;
    const air=document.body.dataset.mapMode==='air';
    el('studio-points').setAttribute('aria-pressed',String(!air&&map.hasLayer(clusterLayer)));
    el('studio-heat').setAttribute('aria-pressed',String(!air&&map.hasLayer(heatProxy)));
    el('studio-sessions').setAttribute('aria-pressed',String(!air));el('studio-air').setAttribute('aria-pressed',String(air));
    el('toggle-filters-btn').disabled=air;
    el('toggle-filters-btn').setAttribute('aria-expanded',String(!air&&!el('filters-panel').classList.contains('filter-panel-hidden')));
    el('toggle-heat-settings').setAttribute('aria-controls',air?'air-visual-settings-panel':'heat-settings-panel');
    el('toggle-heat-settings').setAttribute('aria-expanded',String((air?el('air-visual-settings-panel'):el('heat-settings-panel'))?.style.display!=='none'));
  }
  function refresh(fromData=true) {
    if(fromData)hasData=true;
    if(!started)return;
    const filtered=typeof currentFeatures==='undefined'?[]:currentFeatures;
    const inputs=['start-date','end-date','instructor-filter','raion-filter','hromada-filter','settlement-filter'];
    const count=inputs.filter(id=>el(id)?.value).length;
    el('filter-count').textContent=count?`${count} активних`:'Увесь період';
    const place=el('settlement-filter').value||el('hromada-filter').value||el('raion-filter').value||'Харківська область';
    const dateFrom=el('start-date').value,dateTo=el('end-date').value;
    el('selection-caption').textContent=place+(dateFrom||dateTo?` · ${dateFrom||'початок'} — ${dateTo||'сьогодні'}`:' · увесь період');
    el('map-empty').hidden=!hasData||filtered.length>0;
    if(motion && fromData && Element.prototype.animate){document.querySelectorAll('.hud-stat b').forEach(node=>node.animate([{opacity:.35,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:'cubic-bezier(.2,.7,.3,1)'}));}
    layerState();
  }
  function start() {
    if(started||typeof map==='undefined')return;started=true;
    document.querySelectorAll('[data-map-icon]').forEach(node=>node.innerHTML=icon(node.dataset.mapIcon));
    const toolbar=document.querySelector('.icon-control');
    const controls={'toggle-heat-settings':['settings','Налаштування світла та теплової карти'],'export-png-btn':['download','Завантажити мапу як PNG'],'toggle-filters-btn':['filter','Показати або сховати фільтри']};
    Object.entries(controls).forEach(([id,[glyph,label]])=>{const b=el(id);b.innerHTML=icon(glyph);b.title=label;b.setAttribute('aria-label',label);b.type='button';});
    el('toggle-filters-btn').setAttribute('aria-controls','filters-panel');el('toggle-heat-settings').setAttribute('aria-controls','heat-settings-panel');
    const motionButton=document.createElement('button');motionButton.id='studio-motion';motionButton.type='button';motionButton.innerHTML=icon('motion');motionButton.addEventListener('click',()=>{effects(!motion,true);toast(motion?'Анімації увімкнено':'Спокійний режим увімкнено');});toolbar.appendChild(motionButton);
    const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.innerHTML=icon('expand');fullscreen.title='На весь екран';fullscreen.setAttribute('aria-label','На весь екран');
    if(document.fullscreenEnabled){toolbar.appendChild(fullscreen);fullscreen.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();map.invalidateSize();}catch{toast('Повноекранний режим недоступний');}});}
    let preference;try{preference=localStorage.getItem('eore-map-motion');}catch{}effects(!reduced.matches&&preference!=='off');
    reduced.addEventListener?.('change',event=>effects(!event.matches));
    el('studio-points').addEventListener('click',()=>{if(map.hasLayer(clusterLayer))map.removeLayer(clusterLayer);else map.addLayer(clusterLayer);});
    el('studio-heat').addEventListener('click',()=>{if(map.hasLayer(heatProxy))map.removeLayer(heatProxy);else map.addLayer(heatProxy);});
    el('studio-sessions').addEventListener('click',()=>{if(document.body.dataset.mapMode==='air')el('toggle-air-mode')?.click();});
    el('studio-air').addEventListener('click',()=>{if(document.body.dataset.mapMode!=='air')el('toggle-air-mode')?.click();});
    el('fit-map').addEventListener('click',()=>fit());
    [el('studio-points').parentElement,el('studio-sessions').parentElement,document.querySelector('.map-legend')].forEach(node=>{L.DomEvent.disableClickPropagation(node);L.DomEvent.disableScrollPropagation(node);});
    const mobile=matchMedia('(max-width:760px)');if(mobile.matches)el('filters-panel').classList.add('filter-panel-hidden');
    mobile.addEventListener?.('change',event=>{if(event.matches)el('filters-panel').classList.add('filter-panel-hidden');layerState();map.invalidateSize();});
    // Only the glow follows the cursor. Map gestures and geographic coordinates stay untouched.
    if(matchMedia('(pointer:fine)').matches){document.addEventListener('pointermove',event=>{const panel=event.target.closest('.control-box,.glass-map');if(!panel||!motion)return;const box=panel.getBoundingClientRect();panel.style.setProperty('--pointer-x',`${event.clientX-box.left}px`);panel.style.setProperty('--pointer-y',`${event.clientY-box.top}px`);},{passive:true});}
    new MutationObserver(()=>{layerState();if(document.body.dataset.mapMode==='mine'&&motion)document.querySelector('.scene-heading').animate?.([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:400});}).observe(document.body,{attributes:true,attributeFilter:['data-map-mode']});
    new MutationObserver(layerState).observe(el('filters-panel'),{attributes:true,attributeFilter:['class','style']});
    new MutationObserver(layerState).observe(el('heat-settings-panel'),{attributes:true,attributeFilter:['style']});
    setTimeout(()=>{const panel=el('air-visual-settings-panel');if(panel)new MutationObserver(layerState).observe(panel,{attributes:true,attributeFilter:['style']});},0);
    map.on('layeradd layerremove',layerState);
    map.on('baselayerchange',event=>{document.body.dataset.basemap=event.name.includes('Dark')?'dark':'light';});
    map.on('popupopen',event=>{const popupNode=event.popup.getElement();if(motion)popupNode.querySelector('.leaflet-popup-content-wrapper')?.animate?.([{opacity:0,transform:'translateY(8px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:280,easing:'ease-out'});});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){el('heat-settings-panel').style.display='none';if(el('air-visual-settings-panel'))el('air-visual-settings-panel').style.display='none';if(innerWidth<=760)el('filters-panel').classList.add('filter-panel-hidden');layerState();}});
    const regionPane=map.createPane('region-focus');regionPane.style.zIndex='350';regionPane.style.pointerEvents='none';
    fetch('data/kharkiv_poly.geojson').then(response=>{if(!response.ok)throw new Error('Region outline unavailable');return response.json();}).then(geo=>{
      L.geoJSON(geo,{pane:'region-focus',interactive:false,style:{color:'#65dff5',weight:1.2,opacity:.35,fillColor:'#173b52',fillOpacity:.09,dashArray:'2 7',className:'region-outline'}}).addTo(map);
    }).catch(()=>{});
    fit(false);refresh(false);
  }
  document.addEventListener('DOMContentLoaded',start,{once:true});
  return {icon,pointIcon,clusterIcon,popup,refresh,sessionLabel,peopleLabel};
})();
