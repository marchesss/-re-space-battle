// game.js — (RE)SPACE
// Works with index.html + style.css + images/re_1.png ... re_5.png

const CONFIG = {
  internalW: 540,
  internalH: 960,
  playerSize: 88,
  meteorMin: 28,
  meteorMax: 110,
  spawnIntervalBase: 700,
  initialLives: 3,
  skins: [
    'images/re_1.png',
    'images/re_2.png',
    'images/re_3.png',
    'images/re_4.png',
    'images/re_5.png'
  ]
};

// Canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let DPR = Math.max(1, window.devicePixelRatio || 1);
function resizeCanvas(){
  const parent = canvas.parentElement;
  const pw = parent.clientWidth, ph = parent.clientHeight;
  const aspect = CONFIG.internalW / CONFIG.internalH;
  let drawW = pw, drawH = Math.round(drawW / aspect);
  if(drawH > ph){ drawH = ph; drawW = Math.round(drawH * aspect); }
  canvas.style.width = drawW + 'px'; canvas.style.height = drawH + 'px';
  DPR = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(CONFIG.internalW * DPR);
  canvas.height = Math.round(CONFIG.internalH * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// State & UI refs
const state = {
  running: false,
  preStart: true,
  time: 0,
  lastSpawn: 0,
  meteors: [],
  particles: [],
  player: null,
  score: 0,
  best: Number(localStorage.getItem('sd_best') || 0),
  lives: CONFIG.initialLives,
  spawnInterval: CONFIG.spawnIntervalBase
};

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const livesEl = document.getElementById('lives');
const speedEl = document.getElementById('speed');
const playBtn = document.getElementById('playBtn');
const startScreen = document.getElementById('startScreen');
const loadingProgress = document.getElementById('loadingProgress');
const loadingText = document.getElementById('loadingText');
const skinSelect = document.getElementById('skinSelect');
const skinPreview = document.getElementById('skinPreview');

// Input
const input = { left:false, right:false, up:false, down:false };
window.addEventListener('keydown', e=>{
  if(e.key==='ArrowLeft'|| e.key==='a') input.left=true;
  if(e.key==='ArrowRight'|| e.key==='d') input.right=true;
  if(e.key==='ArrowUp'|| e.key==='w') input.up=true;
  if(e.key==='ArrowDown'|| e.key==='s') input.down=true;
  if(e.key===' '){ toggleRunning(); }
});
window.addEventListener('keyup', e=>{
  if(e.key==='ArrowLeft'|| e.key==='a') input.left=false;
  if(e.key==='ArrowRight'|| e.key==='d') input.right=false;
  if(e.key==='ArrowUp'|| e.key==='w') input.up=false;
  if(e.key==='ArrowDown'|| e.key==='s') input.down=false;
});

// Touch controls
['btnLeft','btnRight','btnUp','btnDown'].forEach(id=>{
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('touchstart', e=>{ e.preventDefault(); if(id==='btnLeft') input.left=true; if(id==='btnRight') input.right=true; if(id==='btnUp') input.up=true; if(id==='btnDown') input.down=true; }, {passive:false});
  el.addEventListener('touchend', e=>{ e.preventDefault(); if(id==='btnLeft') input.left=false; if(id==='btnRight') input.right=false; if(id==='btnUp') input.up=false; if(id==='btnDown') input.down=false; }, {passive:false});
});

// Drag-to-move
let dragging=false;
canvas.addEventListener('mousedown', ()=>dragging=true);
window.addEventListener('mouseup', ()=>dragging=false);
canvas.addEventListener('mousemove', e=>{
  if(!dragging) return;
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left)/r.width;
  const sy = (e.clientY - r.top)/r.height;
  if(state.player){ state.player.x = sx * CONFIG.internalW; state.player.y = sy * CONFIG.internalH; }
});

// util
const rand = (a,b)=>Math.random()*(b-a)+a;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

// preload skins
const skinImages = [];
let assetsLoaded = 0;
function preloadSkins(){
  return new Promise((res)=>{
    CONFIG.skins.forEach((src,i)=>{
      const img = new Image();
      img.onload = ()=>{
        skinImages[i] = img;
        assetsLoaded++; updateLoading();
        if(assetsLoaded === CONFIG.skins.length) res();
      };
      img.onerror = ()=>{
        // fallback small blank image
        const c = document.createElement('canvas'); c.width=128; c.height=128;
        const g = c.getContext('2d'); g.fillStyle='#7cffc5'; g.fillRect(0,0,128,128);
        const im = new Image(); im.src = c.toDataURL();
        skinImages[i] = im;
        assetsLoaded++; updateLoading();
        if(assetsLoaded === CONFIG.skins.length) res();
      };
      img.src = src;
    });
  });
}
function updateLoading(){
  const pct = Math.round((assetsLoaded / CONFIG.skins.length) * 100);
  loadingProgress.style.width = pct + '%';
  loadingText.textContent = 'Загрузка скинов... ' + pct + '%';
}

// UI: skin select
function populateSkins(){
  skinSelect.innerHTML = '';
  CONFIG.skins.forEach((s,i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = `Skin ${i+1}`;
    skinSelect.appendChild(opt);
  });
  skinSelect.addEventListener('change', ()=>{ const idx = Number(skinSelect.value); setPlayerSkin(idx); });
  setPlayerSkin(0);
}
function setPlayerSkin(idx){
  if(!skinImages[idx]) return;
  if(state.player) state.player.skin = skinImages[idx];
  const img = document.createElement('img'); img.src = skinImages[idx].src; img.style.maxHeight='88px';
  skinPreview.innerHTML = ''; skinPreview.appendChild(img);
  skinSelect.value = idx;
}

// create player
function createPlayer(){
  state.player = {
    x: CONFIG.internalW/2,
    y: CONFIG.internalH * 0.75,
    w: CONFIG.playerSize,
    h: CONFIG.playerSize,
    skin: skinImages[0] || null,
    invuln: 0
  };
  setPlayerSkin(0);
}

// meteors
function spawnMeteor(pre=false){
  const size = rand(CONFIG.meteorMin, CONFIG.meteorMax);
  const x = rand(size/2, CONFIG.internalW - size/2);
  const y = pre ? rand(-CONFIG.internalH, -40) : -size;
  state.meteors.push({ x, y, size, speed: rand(1.2, 5.2), ang: rand(0, Math.PI*2), rot: rand(-0.02, 0.02) });
}

// particles
function emitParticles(x,y, color='#ffb86b', count=12){
  for(let i=0;i<count;i++) state.particles.push({ x, y, vx: rand(-3,3), vy: rand(-5,1), life: rand(400,1000), age:0, col:color });
}

// collisions
function circRectColl(px,py,pr, cx,cy,cr){
  const dx = Math.abs(cx-px); const dy = Math.abs(cy-py);
  if(dx > pr + cr) return false; if(dy > pr + cr) return false;
  return Math.hypot(dx,dy) < (pr + cr) * 0.95;
}

// beeps
const audioCtx = (window.AudioContext||window.webkitAudioContext) ? new (window.AudioContext||window.webkitAudioContext)() : null;
function beep(freq=260, dur=0.06){
  if(!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination); o.type='sine'; o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.04,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.start(t); o.stop(t+dur+0.02);
}

// game flow
function resetGame(){
  state.meteors = []; state.particles = []; state.score = 0; state.lives = CONFIG.initialLives;
  state.spawnInterval = CONFIG.spawnIntervalBase; state.running = true; state.preStart = false; state.lastSpawn = 0;
  scoreEl.textContent = state.score; livesEl.textContent = state.lives; bestEl.textContent = state.best;
}
function endGame(){
  state.running = false; state.preStart = true; emitParticles(CONFIG.internalW/2, CONFIG.internalH/2, '#ffd166', 40);
  if(state.score > state.best){ state.best = state.score; localStorage.setItem('sd_best', state.best); bestEl.textContent = state.best; }
  setTimeout(()=> startScreen.style.display = 'flex', 300);
}

// loop
let lastTime = performance.now();
function loop(now){
  const dt = now - lastTime; lastTime = now; state.time += dt;
  update(dt); render();
  requestAnimationFrame(loop);
}

function update(dt){
  state.lastSpawn += dt;
  const interval = Math.max(160, state.spawnInterval - Math.floor(state.score * 2));
  if(state.lastSpawn > interval){ spawnMeteor(state.preStart); state.lastSpawn = 0; }

  // player move
  const p = state.player;
  if(p){
    const speed = 8;
    if(input.left) p.x -= speed*(dt/16);
    if(input.right) p.x += speed*(dt/16);
    if(input.up) p.y -= speed*(dt/16);
    if(input.down) p.y += speed*(dt/16);
    p.x = clamp(p.x, p.w/2 + 8, CONFIG.internalW - p.w/2 - 8);
    p.y = clamp(p.y, p.h/2 + 24, CONFIG.internalH - p.h/2 - 8);
    if(p.invuln>0) p.invuln = Math.max(0, p.invuln - dt);
  }

  // meteors
  for(let i=state.meteors.length-1;i>=0;i--){
    const m = state.meteors[i];
    m.y += m.speed * (dt/16) * (1 + state.score * 0.002);
    m.ang += m.rot * (dt/16);
    if(m.y - m.size > CONFIG.internalH + 200){ state.meteors.splice(i,1); if(!state.preStart){ state.score += 1; scoreEl.textContent = state.score; } continue; }
    if(!state.preStart && p && p.invuln <= 0){
      if(circRectColl(p.x, p.y, Math.max(p.w,p.h)/2, m.x, m.y, m.size/2)){
        state.lives -= 1; livesEl.textContent = state.lives; p.invuln = 1200; emitParticles(p.x, p.y, '#ff6b6b', 20);
        if(audioCtx) beep(180, 0.04);
        if(state.lives <= 0){ endGame(); return; }
      }
    }
  }

  // particles
  for(let i=state.particles.length-1;i>=0;i--){
    const pr = state.particles[i]; pr.age += dt;
    if(pr.age > pr.life){ state.particles.splice(i,1); continue; }
    pr.x += pr.vx * (dt/16); pr.y += pr.vy * (dt/16); pr.vy += 0.06 * (dt/16);
  }

  state.spawnInterval = Math.max(160, CONFIG.spawnIntervalBase - Math.floor(state.score * 2));
}

function render(){
  ctx.clearRect(0,0,CONFIG.internalW, CONFIG.internalH);
  renderStars();

  // meteors
  for(const m of state.meteors){
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.ang);
    const g = ctx.createRadialGradient(0,0,m.size*0.1, 0,0,m.size*0.9);
    g.addColorStop(0, 'rgba(255,200,120,0.12)'); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,m.size*0.9,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#7b6f62'; ctx.beginPath();
    ctx.moveTo(-m.size*0.5, -m.size*0.2); ctx.lineTo(-m.size*0.2, -m.size*0.6);
    ctx.lineTo(m.size*0.6, -m.size*0.1); ctx.lineTo(m.size*0.3, m.size*0.5);
    ctx.lineTo(-m.size*0.4, m.size*0.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // particles
  for(const pr of state.particles){
    ctx.globalAlpha = clamp(1 - pr.age/pr.life,0,1);
    ctx.fillStyle = pr.col; ctx.beginPath(); ctx.arc(pr.x, pr.y, 3, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // player
  const p = state.player;
  if(p){
    ctx.save(); ctx.translate(p.x, p.y);
    if(p.invuln>0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 80);
    ctx.beginPath(); ctx.ellipse(0, p.h*0.42, p.w*0.5, p.h*0.18, 0, 0, Math.PI*2); ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.fill();
    if(p.skin){ const iw=p.skin.width, ih=p.skin.height, scale = Math.min(p.w/iw, p.h/ih); ctx.drawImage(p.skin, -iw*scale/2, -ih*scale/2, iw*scale, ih*scale); }
    else { ctx.fillStyle = '#7cffc5'; ctx.beginPath(); ctx.arc(0,0,p.w/2,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }
}

function renderStars(){
  const count = 80;
  ctx.save();
  for(let i=0;i<count;i++){
    const x = (i*47*1.2 + (state.time*0.02*(i%3))) % CONFIG.internalW;
    const y = ((i*97) % CONFIG.internalH) * 1.02;
    const r = (i%7===0)?1.6:(i%5===0?1.0:0.6);
    ctx.fillStyle = 'rgba(160,220,255,0.06)'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

// bootstrap
(async function init(){
  // show start screen
  startScreen.style.display = 'flex';
  // preload skins
  await preloadSkins();
  populateSkins();
  // create player
  createPlayer();
  // create background meteors for preStart animation
  for(let i=0;i<10;i++) spawnMeteor(true);

  // handlers
  playBtn.addEventListener('click', ()=>{
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    startScreen.style.display = 'none';
    resetGame();
  });

  document.getElementById('startBtn').addEventListener('click', ()=>{ startScreen.style.display='none'; resetGame(); });
  document.getElementById('pauseBtn').addEventListener('click', ()=>{ state.running = !state.running; if(state.running) lastTime = performance.now(); });
  document.getElementById('shuffleBtn').addEventListener('click', ()=>{ state.meteors.forEach(m=> m.x = rand(0, CONFIG.internalW)); });

  // mobile touch mapping (also handled above)
  const map = {'btnLeft':'btnLeft','btnRight':'btnRight','btnUp':'btnUp','btnDown':'btnDown'};
  Object.keys(map).forEach(k=>{ const el = document.getElementById(map[k]); if(!el) return; el.addEventListener('touchstart', ()=>{}); });

  bestEl.textContent = state.best;
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();
