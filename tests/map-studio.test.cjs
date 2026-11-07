'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=require('node:path').join(__dirname,'..');
const read=name=>fs.readFileSync(require('node:path').join(root,name),'utf8');
const html=read('index.html');
const inline=html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
new vm.Script(inline);

// Verify participant weights survive GPU projection and coincident-point aggregation.
let heatMethods;
const heatContext=vm.createContext({L:{Layer:{extend(methods){heatMethods=methods;return function(){};}}},window:{},Float32Array,Map,Math});
vm.runInContext(read('map-heat.js'),heatContext);
let upload,drawCount;
const noop=()=>{};
const gl={ARRAY_BUFFER:1,DYNAMIC_DRAW:2,FRAMEBUFFER:3,COLOR_BUFFER_BIT:4,BLEND:5,ONE:6,POINTS:7,ALIASED_POINT_SIZE_RANGE:8,
  bindFramebuffer:noop,viewport:noop,clearColor:noop,clear:noop,useProgram:noop,bindVertexArray:noop,bindBuffer:noop,
  bufferData(_target,points){upload=Array.from(points);},uniform2f:noop,uniform1f:noop,getUniformLocation:(_p,name)=>name,
  enable:noop,disable:noop,blendFunc:noop,getParameter:()=>[1,512],drawArrays(_mode,_first,count){drawCount=count;}};
const layer={_gl:gl,_map:{getZoom:()=>12,latLngToContainerPoint:r=>({x:r[1],y:r[0]})},_size:{x:200,y:100},_ratio:1,
  _canvas:{width:200,height:100},options:{maxZoom:12,radius:40,blur:20,minOpacity:.3},
  _latlngs:[[50,60,.4],[50,60,.6],[80,90,.5],[500,500,1]]};
heatMethods._updateField.call(layer);
assert.deepEqual(upload,[60,50,1,90,80,.5]);assert.equal(drawCount,2);
layer._latlngs=[];heatMethods._updateField.call(layer);assert.deepEqual(upload,[]);assert.equal(drawCount,0);
console.log('PASS: GPU aggregation, offscreen culling, empty filter');

// Text from session records must be escaped while real participant values remain intact.
const context=vm.createContext({window:{},document:{addEventListener:noop},matchMedia:()=>({matches:false}),L:{divIcon:value=>value},parseDate:value=>new Date(value)});
vm.runInContext(read('map-studio.js'),context);
const popup=context.window.MapStudio.popup({settlement:'<script>bad()</script>',hromada:'Test',participants_total:17,participants_u18:8,participants_18plus:9,instructor_1:'<img src=x>',notes:'<iframe>unsafe</iframe>',session_date:'2026-01-15'});
assert(popup.includes('&lt;script&gt;'));assert(popup.includes('&lt;img src=x&gt;'));assert(popup.includes('&lt;iframe&gt;'));assert(!popup.includes('<script>'));assert(popup.includes('<b>17</b>'));
const cluster=context.window.MapStudio.clusterIcon({getChildCount:()=>212});assert(cluster.html.includes('<b>212</b>'));assert.equal(cluster.className,'session-cluster');
console.log('PASS: safe popup content, participant values, cluster count');

// Shared HUD ownership: AIR responses and session responses cannot cross modes.
const labels={},nodes={};for(const id of ['hud-total','hud-shown','hud-participants']){labels[id]={textContent:'tracks loaded'};nodes[id]={textContent:'ERR',parentElement:{querySelector:()=>labels[id]}};}
nodes['hud-live']={textContent:'AIR FEED ERROR',style:{},title:'air'};const brand={textContent:'AIR THREAT'};
const document={body:{dataset:{mapMode:'mine'}},getElementById:id=>nodes[id],querySelector:()=>brand};
const hud=vm.createContext({document,safeNumber:n=>Number(n)||0,allSessions:[{},{},{}],currentFeatures:[{properties:{participants_total:12}},{properties:{participants_total:8}}]});
vm.runInContext(inline.slice(inline.indexOf('var sessionsFeedState'),inline.indexOf('// ===== MAP =====')),hud);
vm.runInContext('setSessionsFeedState("● ДАНІ СЕСІЙ", "", "sessions")',hud);
assert.equal(nodes['hud-total'].textContent,'3');assert.equal(nodes['hud-shown'].textContent,'2');assert.equal(nodes['hud-participants'].textContent,'20');assert.equal(labels['hud-total'].textContent,'усього сесій');assert.equal(brand.textContent,'Мапа сесій');
document.body.dataset.mapMode='air';nodes['hud-total'].textContent='AIR';vm.runInContext('setSessionsFeedState("● ПОМИЛКА ДАНИХ", "red")',hud);assert.equal(nodes['hud-total'].textContent,'AIR');document.body.dataset.mapMode='mine';vm.runInContext('updateHudStats()',hud);assert.equal(nodes['hud-live'].textContent,'● ПОМИЛКА ДАНИХ');
const air=read('air-mode.js');const airctx=vm.createContext({mode:'mine',setText:()=>{throw Error('AIR overwrote session HUD')},setHudStat:()=>{throw Error('AIR overwrote session HUD')}});
vm.runInContext(air.slice(air.indexOf('  function renderAirHud(stats)'),air.indexOf('  function buildAirUrl()')),airctx);vm.runInContext('renderAirHud({loadedTracks:99})',airctx);
console.log('PASS: session totals, restored labels, late response isolation');
