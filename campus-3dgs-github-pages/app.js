import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { buildRoute, sampleRoute, validateRoute } from './tour.js';
import { CanvasPreviewRenderer } from './canvas-preview.js';
import { createCanvasRecording } from './video.js';

const $ = id => document.getElementById(id);
const toast = message => { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('visible'), 3800); };
const safeStore = { get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('浏览器存储不可用，请导出路线以保存。'); } } };
const state = { id: 'campus-demo-v1', name: '校园示意', demo: true, frames: [], duration: 60, progress: 0, playing: false, mode: 'orbit', pathVisible: true, loaded: null, busy: false, tween: null, radius: 85, modelMeta: null, epoch: 0 };
let exportSession = null, videoDownloadUrl = null;
let renderer;
const probeCanvas=document.createElement('canvas');
const probeContext=probeCanvas.getContext('webgl2');
const webglAvailable=!!probeContext;
if(probeContext)probeContext.getExtension('WEBGL_lose_context')?.loseContext();
try { renderer = webglAvailable ? new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }) : new CanvasPreviewRenderer(); } catch { renderer=new CanvasPreviewRenderer(); }
if(renderer.isCompatibilityPreview){$('renderStatus').innerHTML='<i></i> 示意场景兼容预览';$('fps').textContent='CPU';document.querySelector('.footer>span:last-child').textContent='COMPATIBILITY PREVIEW';}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
$('viewport').appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); if(exportSession){exportSession.reason='图形上下文中断，录制已取消。';exportSession.capture?.cancel();}else pause(); toast('图形上下文已中断，请刷新页面；大模型可先降采样后加载。'); });
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9eee4');
scene.fog = new THREE.Fog('#e9eee4', 170, 350);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 1500);
camera.position.set(120, 100, 145);
camera.setViewOffset(innerWidth,innerHeight,innerWidth>760?-135:0,0,innerWidth,innerHeight);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(1, 0, -5);
controls.enableDamping = true; controls.dampingFactor = .065; controls.minDistance = 3; controls.maxDistance = 230;
controls.maxPolarAngle = Math.PI * .49;
controls.update();
scene.add(new THREE.HemisphereLight('#fff9e8', '#929e76', 2.4));
const sun = new THREE.DirectionalLight('#fff1d1', 3.4);
sun.position.set(-65, 90, 45); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, far: 250 });
sun.shadow.bias = -.0007; sun.shadow.normalBias = .12;
scene.add(sun);
const demo = new THREE.Group();demo.userData.isDemo=true; scene.add(demo);
const pathGroup = new THREE.Group();pathGroup.userData.isPath=true; scene.add(pathGroup);
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra });
const mats = { earth: mat('#a9b494'), lawn: mat('#a1b68b'), pavement: mat('#ddd7bf'), cream: mat('#ddd4ba'), wall: mat('#d8c7a5'), roof: mat('#ac8169'), glass: mat('#779b91', { metalness: .35, roughness: .35 }), wood: mat('#8c8165'), stone: mat('#b6b39a'), water: mat('#88b1aa', { metalness: .25, roughness: .3 }), white: mat('#eae5d1') };
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function box(x, y, z, w, h, d, material, parent = demo) { const mesh = new THREE.Mesh(boxGeo, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }
function cylinder(x, y, z, r, h, material, parent = demo, segments = 14) { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }
const ground = box(0, -1.25, 0, 157, 2.3, 130, mats.earth);
box(0, -.01, 0, 152, .25, 125, mats.lawn);
box(0, .12, 14, 145, .18, 12, mats.pavement);
box(6, .13, -5, 13, .2, 108, mats.pavement);
box(-39, .12, -4, 8, .18, 106, mats.pavement);
box(14, .14, -35, 113, .2, 7, mats.pavement);
box(14, .14, 49, 113, .2, 5, mats.pavement);

function building(x, z, w, d, floors, roofType = 'flat') {
  const h = floors * 3.8, g = new THREE.Group(); demo.add(g);
  box(x, .35, z, w + 2, .6, d + 2, mats.stone, g);
  box(x, h / 2 + .6, z, w, h, d, mats.cream, g);
  box(x, h + .9, z, w + 1, .55, d + 1, mats.white, g);
  for (let f = 0; f < floors; f++) {
    const y = 2.8 + f * 3.8;
    for (let a = -w / 2 + 1.8; a < w / 2 - 1; a += 3) {
      box(x + a, y, z + d / 2 + .03, 1.4, 2.1, .12, mats.glass, g);
      box(x + a, y, z - d / 2 - .03, 1.4, 2.1, .12, mats.glass, g);
    }
    for (let a = -d / 2 + 1.8; a < d / 2 - 1; a += 3) box(x + w / 2 + .03, y, z + a, .12, 2.1, 1.4, mats.glass, g);
    box(x, y + 1.65, z + d / 2 + .13, w, .2, .3, mats.wall, g);
  }
  if (roofType === 'gable') {
    const geo = new THREE.BufferGeometry(); const a = w / 2 + .7, b = d / 2 + .7;
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-a,0,-b, a,0,-b, 0,3.6,-b, -a,0,b,0,3.6,b,a,0,b, -a,0,-b,0,3.6,-b,-a,0,b, -a,0,b,0,3.6,-b,0,3.6,b, a,0,-b,a,0,b,0,3.6,-b, a,0,b,0,3.6,b,0,3.6,-b],3)); geo.computeVertexNormals();
    const roof = new THREE.Mesh(geo, mats.roof); roof.position.set(x,h+1,z); roof.castShadow=true; g.add(roof);
  }
  return g;
}
// Architectural maquette, deliberately labelled as illustrative rather than scanned campus data.
building(25, -20, 38, 23, 3);
box(25, 6.9, -7.9, 35, 11.8, .3, mats.glass);
for (let i = 8; i < 44; i += 2.5) box(i, 6.9, -7.45, .34, 12.3, .9, mats.wood);
box(25, 13.6, -19, 42, .7, 27, mats.white);
box(25, 14.15, -19, 33, .35, 19, mats.lawn);
box(25, .5, -3.8, 29, .6, 6, mats.cream);
box(25, .28, -.7, 33, .3, 3, mats.cream);
building(-17, -25, 22, 16, 3, 'gable');
building(-57, -25, 20, 17, 2, 'gable');
building(56, -35, 18, 27, 3);
building(-15, 39, 21, 17, 2, 'gable');
building(56, 36, 20, 19, 2);
// Entrance colonnade and plaza.
box(6, .28, 35, 26, .35, 26, mats.cream);
for (const x of [-5,17]) { box(x,4.3,54,1.2,8,1.5,mats.wall); box(x,8.7,54,2,.5,2,mats.white); }
box(6,8.5,54,25,1.2,2.2,mats.wall);
box(6,9.3,54,27,.4,3,mats.white);
cylinder(6,.8,32,4.8,1.1,mats.stone);
cylinder(6,1.4,32,3.5,.3,mats.water);
const sculpture = new THREE.Mesh(new THREE.TorusGeometry(1.5,.26,8,32), mat('#9a8b60',{metalness:.5,roughness:.5})); sculpture.position.set(6,3.3,32); sculpture.rotation.y=.5; sculpture.castShadow=true; demo.add(sculpture);
// Curved lake and boardwalk.
const lakeShape = new THREE.Shape(); lakeShape.absellipse(0,0,23,15,0,Math.PI*2,false,0);
const lake = new THREE.Mesh(new THREE.ShapeGeometry(lakeShape,60),mats.water); lake.rotation.x=-Math.PI/2; lake.position.set(-48,.2,32); lake.rotation.z=.2; lake.receiveShadow=true; demo.add(lake);
const lakeRim = new THREE.Mesh(new THREE.RingGeometry(1,1.045,80),mats.pavement); lakeRim.rotation.x=-Math.PI/2; lakeRim.scale.set(23,15,1); lakeRim.position.set(-48,.19,32); demo.add(lakeRim);
box(-29,.65,33,4,.4,24,mats.wood);
for (let z=22;z<45;z+=1.3) box(-29,.9,z,4,.06,.09,mats.cream);

let seed=742; function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const leafMats=['#778e5e','#8eaa72','#9fb882','#7b9d6c'].map(c=>mat(c));
const leafGeo=new THREE.IcosahedronGeometry(1,renderer.isCompatibilityPreview?0:1), trunkGeo=new THREE.CylinderGeometry(.19,.3,3.4,7);
const leaves=[]; const trunks=[];
function tree(x,z,s=1){trunks.push({p:[x,1.7*s,z],s:[s,s,s]});for(let i=0;i<3;i++)leaves.push({p:[x+(rand()-.5)*1.7*s,(3.8+rand()*2.1)*s,z+(rand()-.5)*1.7*s],s:[(1.8+rand()*.6)*s,(1.9+rand()*.8)*s,(1.8+rand()*.5)*s],m:Math.floor(rand()*4)});}
for(let x=-66;x<72;x+=9){tree(x,5, .85+rand()*.3);tree(x,23,.8+rand()*.35);}
for(let z=-51;z<54;z+=9){tree(-72,z,.8+rand()*.3);tree(72,z,.85+rand()*.3);}
for(let x=-61;x<60;x+=11)tree(x,-53,.9+rand()*.3);
for(const p of [[-55,53],[-43,53],[-64,11],[-27,-46],[0,-47],[43,4],[43,46],[35,46],[-20,24],[-16,55]])tree(...p,1);
const dummy=new THREE.Object3D();
const trunkMesh=new THREE.InstancedMesh(trunkGeo,mats.wood,trunks.length);trunks.forEach((v,i)=>{dummy.position.set(...v.p);dummy.scale.set(...v.s);dummy.updateMatrix();trunkMesh.setMatrixAt(i,dummy.matrix);});trunkMesh.castShadow=true;demo.add(trunkMesh);
leafMats.forEach((m,mi)=>{const data=leaves.filter(v=>v.m===mi);const mesh=new THREE.InstancedMesh(leafGeo,m,data.length);data.forEach((v,i)=>{dummy.position.set(...v.p);dummy.scale.set(...v.s);dummy.rotation.set(rand(),rand(),rand());dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.castShadow=true;mesh.receiveShadow=true;demo.add(mesh);});
for(let x=-60;x<65;x+=18){cylinder(x,2.2,20,.09,4.4,mats.wood,demo,6);box(x,4.4,20,1,.18,.7,mats.white);box(x, .65,25,3,.3,1.1,mats.wood);box(x-1,.32,25,.2,.6,1,mats.stone);box(x+1,.32,25,.2,.6,1,mats.stone);}
// Repeated paving joints add a quiet, tactile architectural scale.
for(let x=-70;x<=70;x+=4)box(x,.235,14,.035,.012,11.8,mats.stone);
for(let z=-54;z<=48;z+=4)box(6,.245,z,12.8,.012,.035,mats.stone);

const places = [
  { name:'全景总览',en:'CAMPUS OVERVIEW',thumb:'overview',position:[120,100,145],target:[1,0,-5],title:'把校园，装进每一次抵达。',text:'从一段漫游开始，重新认识这片风景。' },
  { name:'图书馆',en:'THE LIBRARY',thumb:'library',position:[58,24,23],target:[23,6,-18],title:'光与知识，在这里相遇。',text:'沿着建筑的轮廓，发现日常里的细节。' },
  { name:'湖畔步道',en:'LAKESIDE WALK',thumb:'lake',position:[-12,17,61],target:[-46,1,30],title:'把脚步，留给湖边的风。',text:'在水岸与树影之间，让视线慢下来。' },
  { name:'中心广场',en:'CENTRAL PLAZA',thumb:'plaza',position:[32,18,65],target:[6,2,32],title:'每一条路，都通向相逢。',text:'从广场出发，寻找属于你的校园记忆。' }
];
function pose(position,target,fov=42,name='镜头'){ const c=new THREE.PerspectiveCamera(fov,1,.1,1000);c.position.fromArray(position);c.lookAt(new THREE.Vector3(...target));return {name,position:[...position],quaternion:c.quaternion.toArray(),fov}; }
const defaultFrames = [pose([77,48,83],[4,1,-3],42,'初见 · 校园全景'),pose([55,20,26],[24,5,-20],48,'停驻 · 图书馆'),pose([-8,16,38],[-44,1,29],48,'漫步 · 湖畔'),pose([27,14,62],[6,2,29],48,'抵达 · 中心广场')];
let route=null, initialFrames=structuredClone(defaultFrames), initialDuration=60;
const labelData = [{text:'图书馆',p:new THREE.Vector3(25,16,-20)},{text:'湖畔步道',p:new THREE.Vector3(-48,2,30)},{text:'中心广场',p:new THREE.Vector3(6,3,35)}];
labelData.forEach(l=>{l.el=document.createElement('div');l.el.className='scene-label';const s=document.createElement('span');s.textContent=l.text;l.el.append(s);$('labels').append(l.el);});

function renderPlaces(){ $('places').replaceChildren(); const data=state.demo?places:[{name:state.name,en:'GAUSSIAN SPLATTING',thumb:'overview'}];$('poiCount').textContent=`${String(data.length).padStart(2,'0')} / PLACES`;data.forEach((p,i)=>{const b=document.createElement('button');b.className='place'+(i===0?' selected':'');b.innerHTML=`<span class="place-number">${String(i+1).padStart(2,'0')}</span><span class="place-thumb thumb-${p.thumb}"></span><span class="place-copy"><strong></strong><small></small></span><span class="place-arrow">↗</span>`;b.querySelector('strong').textContent=p.name;b.querySelector('small').textContent=p.en;b.onclick=()=>{if(state.demo)goPlace(i);else fitModel();};$('places').append(b);}); }
function goPlace(i){pause();setMode('orbit');const p=places[i];state.tween={time:0,from:camera.position.clone(),to:new THREE.Vector3(...p.position),targetFrom:controls.target.clone(),targetTo:new THREE.Vector3(...p.target),fovFrom:camera.fov};document.querySelectorAll('.place').forEach((b,j)=>b.classList.toggle('selected',i===j));$('sceneName').textContent=`CAMPUS / ${p.name}`;$('captionTitle').textContent=p.title;$('captionText').textContent=p.text;$('captionTag').textContent=p.en;}
function storageKey(){return 'campus-atlas-route:'+state.id;}
function saveRoute(){safeStore.set(storageKey(),{version:1,sceneId:state.id,duration:state.duration,keyframes:state.frames});}
function loadStoredRoute(){const saved=safeStore.get(storageKey());if(saved){try{const v=validateRoute(saved,state.id,{allowPartial:true});state.frames=v.keyframes;state.duration=v.duration;}catch{}}}
function rebuildRoute(save=true){pause();state.progress=0;route=buildRoute(state.frames);pathGroup.children.slice().forEach(o=>{o.geometry?.dispose();o.material?.dispose();pathGroup.remove(o);});if(route){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.curve.getPoints(400)),new THREE.LineDashedMaterial({color:'#637c4a',dashSize:1.2,gapSize:.65,transparent:true,opacity:.8,depthTest:true}));line.computeLineDistances();pathGroup.add(line);state.frames.forEach(k=>{const dot=new THREE.Mesh(new THREE.SphereGeometry(state.demo?.45:state.radius*.004,12,8),new THREE.MeshBasicMaterial({color:'#f3f6c1'}));dot.position.fromArray(k.position);pathGroup.add(dot);});}pathGroup.visible=state.pathVisible;renderRouteUI();if(save)saveRoute();}
function renderRouteUI(){const n=state.frames.length;$('keyframeCount').textContent=n;$('routeLength').textContent=route?Math.round(route.total):'—';$('tourTitle').textContent=state.demo?'校园印象 · 精选导览':`${state.name} · 自定义导览`;$('tourSubtitle').textContent=`${n} 个镜头 · ${state.duration} 秒探索`;$('duration').value=state.duration;$('durationValue').textContent=`${state.duration} 秒`;$('timeTotal').textContent=formatTime(state.duration);$('playTour').disabled=n<2;$('restartTour').disabled=n<2;$('progress').disabled=n<2;$('exportRoute').disabled=n<2;$('exportVideo').disabled=n<2;$('keyframeList').replaceChildren();
  if(!n){const p=document.createElement('p');p.className='field-note';p.textContent='还没有镜头。关闭面板，调整场景视角，再记录至少两个关键帧。';$('keyframeList').append(p);}
  state.frames.forEach((k,i)=>{const row=document.createElement('div');row.className='keyframe';const num=document.createElement('span');num.textContent=String(i+1).padStart(2,'0');const name=document.createElement('button');name.className='keyframe-name';name.textContent=k.name;name.title='查看此镜头';name.onclick=()=>viewFrame(k);row.append(num,name);for(const [text,title,fn,disabled] of [['↑','向前移动',()=>{[state.frames[i-1],state.frames[i]]=[state.frames[i],state.frames[i-1]];rebuildRoute();},i===0],['↓','向后移动',()=>{[state.frames[i+1],state.frames[i]]=[state.frames[i],state.frames[i+1]];rebuildRoute();},i===n-1],['×','删除镜头',()=>{state.frames.splice(i,1);rebuildRoute();},false]]){const b=document.createElement('button');b.textContent=text;b.title=title;b.setAttribute('aria-label',`${title} ${i+1}`);b.disabled=disabled;b.onclick=fn;row.append(b);}$('keyframeList').append(row);});
  $('timelineMarkers').replaceChildren();(route?.fractions||[]).forEach(f=>{const dot=document.createElement('i');dot.style.left=`${f*100}%`;$('timelineMarkers').append(dot);});updateTimeline(); }
function viewFrame(k){pause();state.tween=null;camera.position.fromArray(k.position);camera.quaternion.fromArray(k.quaternion);camera.fov=k.fov;camera.updateProjectionMatrix();syncTarget();}
function formatTime(t){return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
function syncTarget(){const direction=new THREE.Vector3();camera.getWorldDirection(direction);controls.target.copy(camera.position).addScaledVector(direction,state.modelMeta?.focusDistance||Math.max(3,state.radius*.3));controls.update();}
function applyProgress(){if(!route)return;const p=sampleRoute(route,state.progress);camera.position.copy(p.position);camera.quaternion.copy(p.quaternion);camera.fov=p.fov;camera.updateProjectionMatrix();}
function updateTimeline(){$('progress').value=Math.round(state.progress*1000);$('progress').style.setProperty('--progress',`${state.progress*100}%`);$('timeCurrent').textContent=formatTime(state.progress*state.duration);$('tourState').textContent=state.playing?'正在探索':state.progress>=1?'已抵达终点':state.progress>0?'已暂停':'准备出发';}
function pause(){const was=state.playing;state.playing=false;$('playTour').innerHTML='<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7z"/></svg>';$('playTour').setAttribute('aria-label','播放自动导览');if(was)syncTarget();updateTimeline();}
function play(){if(!route){toast('至少记录两个相机关键帧后再播放。');return;}state.tween=null;if(state.progress>=1)state.progress=0;state.playing=true;controls.enabled=!exportSession&&state.mode==='orbit';$('playTour').innerHTML='<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg>';$('playTour').setAttribute('aria-label','暂停自动导览');applyProgress();updateTimeline();}
function setMode(mode){pause();state.tween=null;state.mode=mode;controls.enabled=mode==='orbit';$('orbitMode').classList.toggle('selected',mode==='orbit');$('flyMode').classList.toggle('selected',mode==='fly');$('movePad').hidden=mode!=='fly';$('controlHint').textContent=mode==='fly'?'拖动转向 / WASD 移动 / Q E 升降 · 无碰撞':'左键旋转 / 右键平移 / 滚轮缩放';if(mode==='orbit')syncTarget();}
controls.addEventListener('start',()=>{pause();state.tween=null;});
const keys=new Set();let drag=null;const flyEuler=new THREE.Euler(0,0,0,'YXZ');
addEventListener('keydown',e=>{if(exportSession||$('settingsDialog').open||$('helpDialog').open||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(e.code)&&state.mode==='fly'){e.preventDefault();pause();keys.add(e.code);}if(e.code==='Space'){e.preventDefault();state.playing?pause():play();}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();drag=null;if(!exportSession)pause();});
renderer.domElement.addEventListener('pointerdown',e=>{if(state.mode==='fly'){pause();state.tween=null;controls.enabled=false;flyEuler.setFromQuaternion(camera.quaternion);drag={id:e.pointerId,x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);}else{pause();state.tween=null;controls.enabled=true;}});
renderer.domElement.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id||state.mode!=='fly')return;flyEuler.y-=(e.clientX-drag.x)*.004;flyEuler.x=THREE.MathUtils.clamp(flyEuler.x-(e.clientY-drag.y)*.004,-1.5,1.5);camera.quaternion.setFromEuler(flyEuler);drag.x=e.clientX;drag.y=e.clientY;});
const endDrag=()=>{drag=null;};renderer.domElement.addEventListener('pointerup',endDrag);renderer.domElement.addEventListener('pointercancel',endDrag);
renderer.domElement.addEventListener('wheel',()=>{if(state.playing){pause();controls.enabled=state.mode==='orbit';}},{passive:true});
document.querySelectorAll('[data-move]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();pause();keys.add(b.dataset.move);b.setPointerCapture(e.pointerId);};b.onpointerup=b.onpointercancel=()=>keys.delete(b.dataset.move);});
$('playTour').onclick=()=>state.playing?pause():play();$('restartTour').onclick=()=>{state.progress=0;play();};$('progress').oninput=()=>{pause();state.tween=null;state.progress=Number($('progress').value)/1000;applyProgress();syncTarget();updateTimeline();};$('orbitMode').onclick=()=>setMode('orbit');$('flyMode').onclick=()=>setMode('fly');
$('togglePath').onclick=()=>{state.pathVisible=!state.pathVisible;pathGroup.visible=state.pathVisible;$('togglePath').classList.toggle('active',state.pathVisible);$('togglePath').setAttribute('aria-pressed',state.pathVisible);};
$('resetView').onclick=()=>state.demo?goPlace(0):fitModel();
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前浏览器不支持此全屏方式。');}};
function openSettings(tab){pause();keys.clear();selectTab(tab);$('settingsDialog').showModal();}
function selectTab(tab){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));$('modelPanel').hidden=tab!=='model';$('routePanel').hidden=tab!=='route';}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));$('openModel').onclick=()=>openSettings('model');$('openRoute').onclick=$('tourRouteButton').onclick=()=>openSettings('route');$('helpButton').onclick=()=>{pause();$('helpDialog').showModal();};$('startExplore').onclick=()=>$('helpDialog').close();
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog:not(#recordingDialog)').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('addKeyframe').onclick=()=>{if(state.frames.length>=500){toast('最多支持 500 个关键帧。');return;}state.frames.push({name:`自定义镜头 ${state.frames.length+1}`,position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov});rebuildRoute();toast('当前视角已记录。关闭面板，可移动到下一个位置。');};
$('duration').oninput=()=>{state.duration=Number($('duration').value);$('durationValue').textContent=`${state.duration} 秒`;$('tourSubtitle').textContent=`${state.frames.length} 个镜头 · ${state.duration} 秒探索`;$('timeTotal').textContent=formatTime(state.duration);updateTimeline();saveRoute();};
$('resetRoute').onclick=()=>{state.frames=structuredClone(initialFrames);state.duration=initialDuration;rebuildRoute();toast('已恢复初始路线。');};
function downloadJson(data, filename){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('exportRoute').onclick=()=>downloadJson({version:1,sceneId:state.id,coordinateSystem:'threejs-world-y-up',duration:state.duration,model:state.modelMeta,keyframes:state.frames},'campus-tour.json');
async function exportTourVideo(){
  if(!route||exportSession||state.busy){toast('请先准备至少两个镜头，并等待模型加载完成。');return;}
  pause();keys.clear();drag=null;state.tween=null;
  const saved={progress:state.progress,position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,target:controls.target.clone(),pathVisible:pathGroup.visible,speed:$('speed').value,loop:$('loopTour').checked};
  const session={saved,startedAt:null,capture:null,finishing:false,reason:null};exportSession=session;
  $('settingsDialog').close();$('recordingDialog').showModal();$('cancelRecording').focus();document.body.classList.add('recording');
  $('recordingProgress').value=0;$('recordingTime').textContent=`00:00 / ${formatTime(state.duration)}`;$('videoDownload').hidden=true;
  $('videoPreview').pause();$('videoPreview').removeAttribute('src');$('videoPreview').load();$('videoPreview').hidden=true;
  if(videoDownloadUrl){URL.revokeObjectURL(videoDownloadUrl);videoDownloadUrl=null;}
  controls.enabled=false;pathGroup.visible=false;$('speed').value='1';$('loopTour').checked=false;state.progress=0;camera.clearViewOffset();applyProgress();renderer.render(scene,camera);
  let result=null,error=null;
  try{
    session.capture=createCanvasRecording(renderer.domElement);
    $('recordingFormat').textContent=`${renderer.domElement.width} × ${renderer.domElement.height} · ${session.capture.mimeType.includes('mp4')?'MP4':'WEBM'}`;
    await session.capture.started;
    if(document.hidden){session.reason='页面已切到后台，录制已取消，请保持页面在前台重试。';session.capture.cancel();}
    else{session.startedAt=performance.now();last=session.startedAt;play();}
    result=await session.capture.finished;
  }catch(e){error=e;}
  finally{
    state.playing=false;exportSession=null;pause();controls.enabled=state.mode==='orbit';state.progress=saved.progress;pathGroup.visible=saved.pathVisible;$('speed').value=saved.speed;$('loopTour').checked=saved.loop;
    camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);camera.fov=saved.fov;camera.aspect=innerWidth/innerHeight;camera.setViewOffset(innerWidth,innerHeight,innerWidth>760?-135:0,0,innerWidth,innerHeight);camera.updateProjectionMatrix();controls.target.copy(saved.target);if(state.mode==='orbit')controls.update();
    document.body.classList.remove('recording');$('recordingDialog').close();last=performance.now();updateTimeline();openSettings('route');
  }
  if(error){$('videoExportStatus').textContent=error.message||'视频生成失败，请重试。';toast('视频生成失败，视角与交互已恢复。');return;}
  if(result?.cancelled){$('videoExportStatus').textContent=session.reason||'已取消本次视频生成，未保存视频。';return;}
  if(result?.blob){videoDownloadUrl=URL.createObjectURL(result.blob);const a=$('videoDownload');a.href=videoDownloadUrl;a.download=`campus-tour.${result.extension}`;a.textContent=`下载视频（${result.extension.toUpperCase()}）↓`;a.hidden=false;$('videoPreview').src=videoDownloadUrl;$('videoPreview').hidden=false;$('videoExportStatus').textContent=`视频已生成 · ${(result.blob.size/1048576).toFixed(1)} MB · ${state.duration} 秒 · 无音轨。刷新页面前请下载保存。`;toast('视频已生成，点击“下载视频”保存。');}
}
$('exportVideo').onclick=exportTourVideo;
$('cancelRecording').onclick=()=>exportSession?.capture?.cancel();
$('recordingDialog').addEventListener('cancel',e=>{e.preventDefault();exportSession?.capture?.cancel();});
$('routeFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2e6)throw new Error('路线 JSON 超过 2MB，请检查文件。');const data=validateRoute(JSON.parse(await file.text()),state.id);state.frames=data.keyframes;state.duration=data.duration;rebuildRoute();toast('路线已导入，可以开始导览。');}catch(error){toast(error.message||'路线文件读取失败。');}finally{e.target.value='';}};
let spark=null;
function loadStatus(message,error=false){$('loadStatus').textContent=message;$('loadStatus').classList.toggle('error',error);}
function setBusy(busy){state.busy=busy;$('loadUrl').disabled=busy;$('modelFile').disabled=busy;$('restoreDemo').disabled=busy;$('modelUp').disabled=busy;}
function applyModelUp(){if(!state.loaded)return;state.loaded.rotation.set(0,0,0);const axis=$('modelUp').value;if(axis==='z')state.loaded.rotation.x=-Math.PI/2;if(axis==='negative-y')state.loaded.rotation.x=Math.PI;state.loaded.updateMatrixWorld(true);}
function modelBounds(){return state.loaded.getBoundingBox().clone().applyMatrix4(state.loaded.matrixWorld);}
function fitModel(){if(!state.loaded)return;pause();state.tween=null;setMode('orbit');const bounds=modelBounds(),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());const radius=Math.max(size.length()/2,.1);state.radius=radius;camera.near=Math.max(.001,radius/10000);camera.far=Math.max(1500,radius*100,state.modelMeta?.cameraFar||0);camera.fov=48;const distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.2;camera.position.copy(center).add(new THREE.Vector3(.7,.4,1).normalize().multiplyScalar(distance));controls.target.copy(center);controls.minDistance=radius*.002;controls.maxDistance=Math.max(500,radius*12,state.modelMeta?.orbitMaxDistance||0);controls.maxPolarAngle=Math.PI;camera.lookAt(center);camera.updateProjectionMatrix();controls.update();}
async function loadModel({url,file,config}){if(state.busy)return;if(renderer.isCompatibilityPreview){
  loadStatus('当前浏览器未提供 WebGL2，真实模型镜头编辑需要启用硬件加速。可返回场景页面观看预渲染视频。',true);
  if(config?.id){
    document.body.classList.add('real-scene-unavailable');
    demo.visible=false;pathGroup.visible=false;renderer.lastView=null;$('renderStatus').textContent='真实模型未启动';$('assetBadge').textContent='需要 WebGL2';
    const notice=$('fatalError');notice.querySelector('h2').textContent='镜头编辑需要 WebGL2';notice.querySelector('p').textContent='此浏览器未能启动真实高斯渲染。请启用硬件加速，或返回场景页面观看实际模型渲染的视频。';
    let link=notice.querySelector('a');if(!link){link=document.createElement('a');link.className='green-button';notice.append(link);}link.href=new URLSearchParams(location.search).get('scene')==='school'?'./campus.html':'./lab.html';link.textContent='返回实景导览';notice.hidden=false;
  }
  return;
}pause();state.tween=null;setBusy(true);loadStatus('正在准备高斯渲染器…');let next=null;try{const module=await import('@sparkjsdev/spark');if(!spark){spark=new module.SparkRenderer({renderer});scene.add(spark);}const options=file?{fileBytes:new Uint8Array(await file.arrayBuffer()),fileName:file.name}:{url};next=new module.SplatMesh({...options,onProgress:e=>{loadStatus(e.lengthComputable?`正在读取模型 ${Math.round(e.loaded/e.total*100)}%…`:'正在读取与解析高斯模型…');}});await next.initialized;if(!next.numSplats)throw new Error('文件未包含可渲染的高斯数据。请使用训练后的高斯模型。');const box=next.getBoundingBox();if(box.isEmpty()||![...box.min,...box.max].every(Number.isFinite))throw new Error('模型范围无效，请检查导出文件。');
    if(state.loaded){scene.remove(state.loaded);state.loaded.dispose();}state.loaded=next;scene.add(next);demo.visible=false;scene.fog=null;scene.background.set('#dce3dc');state.demo=false;state.id=config?.id||((file?`local:${file.name}:${file.size}:${file.lastModified}`:`url:${url}`)+'|axis:'+$('modelUp').value);state.name=config?.name||(file?file.name.replace(/\.[^.]+$/,''):'校园实景');state.modelMeta={url:url||null,fileName:file?.name||null,upAxis:$('modelUp').value,metersPerUnit:config?.metersPerUnit??null,cameraFar:config?.cameraFar,orbitMaxDistance:config?.orbitMaxDistance,moveSpeed:config?.moveSpeed,focusDistance:config?.focusDistance};applyModelUp();if(config?.modelQuaternion){next.quaternion.fromArray(config.modelQuaternion);next.updateMatrixWorld(true);}state.frames=[];state.duration=60;initialFrames=[];initialDuration=60;loadStoredRoute();
    if(config?.route||config?.routeUrl){try{let data=config.route;if(!data){const res=await fetch(config.routeUrl);if(!res.ok)throw new Error('路线地址读取失败');data=await res.json();}const v=validateRoute(data,state.id);state.frames=v.keyframes;state.duration=v.duration;initialFrames=structuredClone(v.keyframes);initialDuration=v.duration;}catch(error){toast(`模型已加载，但路线未载入：${error.message}`);}}
    rebuildRoute(false);fitModel();if(state.frames.length)viewFrame(state.frames[0]);renderPlaces();$('assetBadge').textContent='已接入 3DGS 模型';$('sceneName').textContent=`3DGS / ${state.name}`;$('captionTag').textContent='YOUR CAMPUS, RECONSTRUCTED';$('captionTitle').textContent=`走进你采集的${state.name}。`;$('captionText').textContent='自由探索，或记录镜头，编排你的专属导览。';$('mapCaption').textContent='相机轨迹 · 局部坐标';loadStatus(`已加载 ${state.name} · ${next.numSplats.toLocaleString()} 个高斯。当前文件${file?'仅在本浏览器可用':'通过链接读取'}。`);toast('模型已加载。可在“导览路线”中记录镜头。');
  }catch(error){if(next&&next!==state.loaded)next.dispose();console.error('Model loading failed:',error);loadStatus(`加载失败：${error.message||'请检查模型格式、资源地址与跨域设置。'}`,true);toast('模型加载失败，原场景已保留。');}finally{setBusy(false);}}
$('modelFile').onchange=e=>{const file=e.target.files[0];if(file)loadModel({file});e.target.value='';};
$('loadUrl').onclick=()=>{try{const url=new URL($('modelUrl').value);if(!['https:','http:'].includes(url.protocol))throw new Error();loadModel({url:url.href});}catch{loadStatus('请输入有效的 HTTP / HTTPS 模型资源地址。',true);}};
$('modelUp').onchange=()=>{if(!state.loaded)return;applyModelUp();state.modelMeta.upAxis=$('modelUp').value;state.frames=[];initialFrames=[];state.id=state.id.replace(/\|axis:.*$/,'')+'|axis:'+$('modelUp').value;loadStoredRoute();rebuildRoute(false);fitModel();toast('坐标方向已更新，请使用该方向对应的路线。');};
$('restoreDemo').onclick=()=>{pause();if(state.loaded){scene.remove(state.loaded);state.loaded.dispose();state.loaded=null;}demo.visible=true;scene.background.set('#e9eee4');scene.fog=new THREE.Fog('#e9eee4',170,350);state.demo=true;state.id='campus-demo-v1';state.name='校园示意';state.modelMeta=null;state.radius=85;state.frames=structuredClone(defaultFrames);state.duration=60;initialFrames=structuredClone(defaultFrames);initialDuration=60;loadStoredRoute();rebuildRoute(false);camera.near=.05;camera.far=1500;controls.minDistance=3;controls.maxDistance=230;controls.maxPolarAngle=Math.PI*.49;renderPlaces();goPlace(0);$('assetBadge').textContent='示意校园 · 非实采模型';$('mapCaption').textContent='示意校园 · 导览轨迹';loadStatus('当前为程序生成的校园示意场景，尚未接入实采模型。');};

const mapCanvas=$('minimap'),ctx=mapCanvas.getContext('2d');
function drawMap(){const W=440,H=280;ctx.clearRect(0,0,W,H);ctx.fillStyle='#e7eddc';ctx.fillRect(0,0,W,H);let center=new THREE.Vector3(0,0,0),extent=165;if(!state.demo){center=controls.target.clone();extent=state.radius*2.3;}
  const project=v=>[(v.x-center.x)/extent*W+W*.5,(v.z-center.z)/extent*W+H*.5];
  if(state.demo){ctx.fillStyle='#c9d3b7';for(const [x,z,w,d] of [[25,-20,38,23],[-17,-25,22,16],[-57,-25,20,17],[56,-35,18,27],[-15,39,21,17],[56,36,20,19]]){const [px,py]=project(new THREE.Vector3(x,0,z));ctx.fillRect(px-w/extent*W/2,py-d/extent*W/2,w/extent*W,d/extent*W);}ctx.fillStyle='#b6cec4';const [x,y]=project(new THREE.Vector3(-48,0,32));ctx.beginPath();ctx.ellipse(x,y,23/extent*W,15/extent*W,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f6f4e8';ctx.lineWidth=10;ctx.beginPath();let p=project(new THREE.Vector3(-74,0,14));ctx.moveTo(...p);p=project(new THREE.Vector3(74,0,14));ctx.lineTo(...p);ctx.stroke();ctx.lineWidth=9;ctx.beginPath();p=project(new THREE.Vector3(6,0,-54));ctx.moveTo(...p);p=project(new THREE.Vector3(6,0,58));ctx.lineTo(...p);ctx.stroke();}
  if(route){ctx.strokeStyle='#78916b';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();route.curve.getPoints(100).forEach((v,i)=>{const p=project(v);i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.stroke();ctx.setLineDash([]);state.frames.forEach(k=>{const p=project(new THREE.Vector3(...k.position));ctx.fillStyle='#fffefa';ctx.beginPath();ctx.arc(...p,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#78916b';ctx.stroke();});}
  const [x,y]=project(camera.position);const dir=new THREE.Vector3();camera.getWorldDirection(dir);const angle=Math.atan2(dir.x,dir.z);ctx.save();ctx.translate(THREE.MathUtils.clamp(x,10,W-10),THREE.MathUtils.clamp(y,10,H-10));ctx.rotate(-angle);ctx.fillStyle='#3e6c54';ctx.beginPath();ctx.moveTo(0,10);ctx.lineTo(-6,-7);ctx.lineTo(0,-3);ctx.lineTo(6,-7);ctx.closePath();ctx.fill();ctx.restore();}
function updateLabels(){const stage=$('labels').getBoundingClientRect();labelData.forEach(l=>{if(!state.demo){l.el.hidden=true;return;}const p=l.p.clone().project(camera);const x=(p.x*.5+.5)*innerWidth-stage.left,y=(-p.y*.5+.5)*innerHeight-stage.top;l.el.hidden=p.z>1||p.z<-1||x<0||x>stage.width||y<70||y>stage.height-80;l.el.style.transform=`translate(${x}px,${y}px)`;});}
let last=performance.now(),fpsStart=last,fpsFrames=0,frame=0;
renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.25);last=now;frame++;fpsFrames++;
  if(exportSession&&exportSession.startedAt!==null&&state.playing){state.progress=Math.min(1,(now-exportSession.startedAt)/1000/state.duration);applyProgress();updateTimeline();$('recordingProgress').value=state.progress;$('recordingTime').textContent=`${formatTime(state.progress*state.duration)} / ${formatTime(state.duration)}`;}
  else if(state.playing){state.progress+=dt*Number($('speed').value)/state.duration;if(state.progress>=1){if($('loopTour').checked)state.progress%=1;else state.progress=1;}applyProgress();updateTimeline();if(state.progress>=1)pause();}
  else if(state.tween){const tw=state.tween;tw.time+=dt;const t=Math.min(1,tw.time/1.7),ease=t*t*(3-2*t);camera.position.lerpVectors(tw.from,tw.to,ease);controls.target.lerpVectors(tw.targetFrom,tw.targetTo,ease);camera.fov=THREE.MathUtils.lerp(tw.fovFrom,42,ease);camera.updateProjectionMatrix();controls.update();if(t===1)state.tween=null;}
  else if(state.mode==='orbit'&&!exportSession){controls.enabled=true;controls.update();}
  else if(keys.size&&!$('settingsDialog').open&&!$('helpDialog').open){const v=new THREE.Vector3(),forward=new THREE.Vector3();camera.getWorldDirection(forward);const right=new THREE.Vector3().crossVectors(forward,camera.up).normalize();if(keys.has('KeyW'))v.add(forward);if(keys.has('KeyS'))v.sub(forward);if(keys.has('KeyD'))v.add(right);if(keys.has('KeyA'))v.sub(right);if(keys.has('KeyQ'))v.y-=1;if(keys.has('KeyE'))v.y+=1;if(v.lengthSq())camera.position.addScaledVector(v.normalize(),dt*(state.modelMeta?.moveSpeed||Math.max(.3,state.radius*.13))*(keys.has('ShiftLeft')||keys.has('ShiftRight')?3:1));}
  renderer.render(scene,camera);if(exportSession?.startedAt!==null&&exportSession&&state.progress>=1&&!exportSession.finishing){const session=exportSession;session.finishing=true;setTimeout(()=>session.capture.stop(),100);}if(frame%3===0){drawMap();updateLabels();}if(now-fpsStart>1000){$('fps').textContent=`${Math.round(fpsFrames*1000/(now-fpsStart))} FPS`;fpsFrames=0;fpsStart=now;}});
addEventListener('resize',()=>{if(exportSession){exportSession.reason='视窗尺寸改变，本次录制已取消，请固定窗口大小后重试。';exportSession.capture?.cancel();}camera.aspect=innerWidth/innerHeight;camera.setViewOffset(innerWidth,innerHeight,innerWidth>760?-135:0,0,innerWidth,innerHeight);camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
document.addEventListener('visibilitychange',()=>{last=performance.now();if(document.hidden){if(exportSession){exportSession.reason='页面已切到后台，录制已取消，请保持页面在前台重试。';exportSession.capture?.cancel();}else pause();keys.clear();}});
state.frames=structuredClone(defaultFrames);loadStoredRoute();rebuildRoute(false);renderPlaces();
async function loadConfiguredScene(){
  const params=new URLSearchParams(location.search),school=params.get('scene')==='school',requested=params.get('route');
  if(school){
    const response=await fetch('./assets/school/routes.json');if(!response.ok)throw new Error('校园路线文件读取失败');const bundle=await response.json();
    const selected=bundle.routes.find(r=>r.id===requested)||bundle.routes.find(r=>r.id===bundle.defaultRoute)||bundle.routes[0];if(!selected)throw new Error('校园尚未配置导览路线');
    const v=validateRoute({version:1,sceneId:bundle.sceneId,duration:selected.duration,keyframes:selected.keyframes},bundle.sceneId);
    const config={id:bundle.sceneId,name:bundle.name||'校园',modelUrl:bundle.modelUrl,modelQuaternion:bundle.modelQuaternion,upAxis:'y',route:v,cameraFar:bundle.cameraFar||1500,orbitMaxDistance:bundle.orbitMaxDistance||500,moveSpeed:bundle.moveSpeed||5,focusDistance:bundle.focusDistance||15};
    $('modelUp').value='y';document.title='校园镜头编辑 · Spatial Atlas';
    return loadModel({url:new URL(config.modelUrl,location.href).href,config});
  }
  const response=await fetch('./scene-config.json');if(!response.ok)throw new Error('场景配置读取失败');const config=await response.json();
  if(config?.modelUrl){if(['overview','equipment','workstations'].includes(requested))config.routeUrl=`./assets/laboratory-${requested}-route.json`;$('modelUp').value=config.upAxis||'y';document.title='实验室镜头编辑 · Spatial Atlas';await loadModel({url:new URL(config.modelUrl,location.href).href,config});}
}
loadConfiguredScene().catch(error=>{loadStatus(error.message,true);toast(error.message);});
