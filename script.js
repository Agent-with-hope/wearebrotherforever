import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// ==========================================
// 🔴 用户核心配置区
// ==========================================
const GITHUB_USER = "Agent-with-hope"; 
const GITHUB_REPO = "wearebrotherforever";       

// 自动拼接 jsDelivr 加速节点路径
const CDN_PREFIX = `https://fastly.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@main/images/`;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const CONFIG = {
    particleCount: isMobile ? 6000 : 15000, 
    horseScale: 0.14, 
    photoCount: 30, 
    bloomStrength: isMobile ? 1.5 : 2.2, 
    bloomRadius: 0.6,
    bloomThreshold: 0,
    
    horseImageUrl: '',
    
    galleryImages: [
        CDN_PREFIX + "IMG_20220723_151111.jpg",
        CDN_PREFIX + "IMG_20220723_161917.jpg",
        CDN_PREFIX + "IMG_20220723_170924.jpg",
        CDN_PREFIX + "IMG_20220723_174018.jpg",
        CDN_PREFIX + "IMG_20220723_184904.jpg",
        CDN_PREFIX + "IMG_20220724_151129.jpg",
        CDN_PREFIX + "IMG_20220724_151404.jpg",
        CDN_PREFIX + "IMG_20220724_152254.jpg",
        CDN_PREFIX + "IMG_20220724_153041.jpg",
        CDN_PREFIX + "IMG_20220724_154313.jpg",
        CDN_PREFIX + "IMG_20220724_154745.jpg",
        CDN_PREFIX + "IMG_20220724_154904.jpg",
        CDN_PREFIX + "IMG_20220725_150737.jpg",
        CDN_PREFIX + "IMG_20220725_152033.jpg",
        CDN_PREFIX + "IMG_20220725_153234.jpg",
        CDN_PREFIX + "IMG_20220725_163419.jpg"
    ] 
};

// ==========================================
// 音效系统
// ==========================================
class EtherealSynth {
    constructor() { this.ctx = null; this.isMuted = true; }
    init() { 
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); 
        this.isMuted = false; 
        if(this.ctx.state === 'suspended') this.ctx.resume(); 
    }
    toggleMute() { 
        if(!this.ctx) this.init(); 
        this.isMuted = !this.isMuted; 
        return this.isMuted; 
    }
    playForm() {
        if (this.isMuted || !this.ctx) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(100, this.ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 1.5);
        gain.gain.setValueAtTime(0, this.ctx.currentTime); gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 1.0); gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);
        osc.start(); osc.stop(this.ctx.currentTime + 1.5);
    }
    playExplode() {
        if (this.isMuted || !this.ctx) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.type = 'triangle'; osc.frequency.setValueAtTime(200, this.ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        osc.start(); osc.stop(this.ctx.currentTime + 0.5);

        const osc2 = this.ctx.createOscillator(); const gain2 = this.ctx.createGain();
        osc2.connect(gain2); gain2.connect(this.ctx.destination);
        osc2.type = 'sine'; osc2.frequency.setValueAtTime(800, this.ctx.currentTime); osc2.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.2);
        gain2.gain.setValueAtTime(0.2, this.ctx.currentTime); gain2.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.0);
        osc2.start(); osc2.stop(this.ctx.currentTime + 1.0);
    }
}

// ==========================================
// 全局变量与 DOM
// ==========================================
let scene, camera, renderer, composer, controls;
let bloomPass, particles, particleMaterial, photoGroup, handLandmarker, webcam;
let targetBloomStrength = CONFIG.bloomStrength; 
let appState = 'SCATTERED'; 
let time = 0, manualMode = false, fistHoldFrames = 0, hasInteracted = false; 
const horsePoints = [], auraPoints = [], originalPositions = [], galleryPositions = [], photos = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let focusedPhoto = null, isUserInteracting = false; 

const synth = new EtherealSynth();

const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const gestureIcon = document.getElementById('gesture-icon');
const detectIndicator = document.getElementById('detect-indicator');
const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');
const dimmerEl = document.getElementById('overlay-dimmer');
const closeBtn = document.getElementById('close-btn');
const manualBtn = document.getElementById('manual-btn');
const audioBtn = document.getElementById('audio-btn');
const gestureGuide = document.getElementById('gesture-guide');

const aiBtn = document.getElementById('ai-btn');
const chatModal = document.getElementById('ai-chat-modal');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatInput = document.getElementById('chat-input');
const sendMsgBtn = document.getElementById('send-msg-btn');
const chatMessages = document.getElementById('chat-messages');

// ==========================================
// 初始化与 3D 逻辑
// ==========================================
async function init() {
    initThree();
    initPostProcessing();
    await generateHorseData();
    createParticles();
    createPhotos();
    setupInteraction();
    setupAI(); 
    try {
        await initMediaPipe(); 
    } catch (e) {
        fallbackToManual("视觉模型加载受限，已切换手动");
    }
    animate();
}

function fallbackToManual(msg) {
    loadingText.innerText = msg || "请使用手动模式";
    statusText.innerText = "点击按钮开始";
    manualBtn.classList.add('active');
    manualBtn.innerText = "👆 点击此处开始";
    setTimeout(() => loadingScreen.remove(), 1000);
    hideGuide();
}

function initThree() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1a0505, 0.02); 
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 45);
    
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 2));
    
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85; 
    
    container.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05; controls.autoRotate = true; controls.autoRotateSpeed = 1.0; 
    controls.addEventListener('start', () => isUserInteracting = true);
    controls.addEventListener('end', () => isUserInteracting = false);
    window.addEventListener('resize', onWindowResize);
}

function initPostProcessing() {
    const renderScene = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = CONFIG.bloomThreshold; bloomPass.strength = CONFIG.bloomStrength; bloomPass.radius = CONFIG.bloomRadius;
    composer = new EffectComposer(renderer); composer.addPass(renderScene); composer.addPass(bloomPass);
}

function generateHorseData() {
    return new Promise((resolve) => {
        if (!CONFIG.horseImageUrl) {
            generateFallbackHorse(resolve);
            return;
        }
        const img = new Image(); img.crossOrigin = "Anonymous"; img.src = CONFIG.horseImageUrl;
        img.onload = () => { processImageToPoints(img); resolve(); };
        img.onerror = () => { generateFallbackHorse(resolve); };
    });
}

function processImageToPoints(img) {
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    const size = 400; canvas.width = size; canvas.height = size;
    const aspect = img.width / img.height; let drawWidth = size; let drawHeight = size / aspect;
    if (aspect < 1) { drawHeight = size; drawWidth = size * aspect; }
    ctx.drawImage(img, (size - drawWidth)/2, (size - drawHeight)/2, drawWidth, drawHeight);
    
    const imgData = ctx.getImageData(0, 0, size, size).data;
    const tempPoints = []; const tempAura = []; const step = isMobile ? 3 : 2; 
    
    for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
            if (imgData[(y * size + x) * 4] < 240) { 
                const px = (x - size / 2) * CONFIG.horseScale; const py = -(y - size / 2) * CONFIG.horseScale;
                const distFromCenterY = Math.abs(y - size/2) / (size/2); const thickness = Math.cos(distFromCenterY * Math.PI / 2) * 8 + 2; 
                const pz = (Math.random() - 0.5) * thickness; 
                tempPoints.push(new THREE.Vector3(px, py, pz));
                if (Math.random() > 0.90) tempAura.push(new THREE.Vector3(px, py, pz));
            }
        }
    }
    fillPoints(tempPoints, tempAura);
}

function generateFallbackHorse(resolveCallback) {
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    const size = 400; canvas.width = size; canvas.height = size;
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <text x="50%" y="55%" font-size="260" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">🐎</text>
    </svg>`;
    
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    
    img.onload = () => {
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0);
        
        const imgData = ctx.getImageData(0, 0, size, size).data;
        const tempPoints = []; const tempAura = []; const step = isMobile ? 3 : 2;
        
        for (let y = 0; y < size; y += step) {
            for (let x = 0; x < size; x += step) {
                if (imgData[(y * size + x) * 4 + 3] > 50) {
                     const px = (x - size / 2) * CONFIG.horseScale; const py = -(y - size / 2) * CONFIG.horseScale; const pz = (Math.random() - 0.5) * 6;
                     tempPoints.push(new THREE.Vector3(px, py, pz));
                     if(Math.random() > 0.90) tempAura.push(new THREE.Vector3(px, py, pz));
                }
            }
        }
        fillPoints(tempPoints, tempAura);
        if (resolveCallback) resolveCallback();
    };
    
    img.onerror = () => { if (resolveCallback) resolveCallback(); };
}

function fillPoints(tempPoints, tempAura) {
    horsePoints.length = 0; auraPoints.length = 0;
    if (tempPoints.length === 0) tempPoints.push(new THREE.Vector3(0,0,0));
    for (let i = 0; i < CONFIG.particleCount; i++) {
        if (i < CONFIG.particleCount * 0.8) {
            const base = tempPoints[i % tempPoints.length];
            horsePoints.push(base.clone().add(new THREE.Vector3((Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2)));
        } else {
            if (tempAura.length > 0) auraPoints.push(tempAura[i % tempAura.length]);
            else auraPoints.push(horsePoints[i % horsePoints.length].clone());
            horsePoints.push(new THREE.Vector3(0,0,0)); 
        }
    }
}

function createParticles() {
    const geometry = new THREE.BufferGeometry(); const positions = []; const sizes = []; const colors = [];
    const colorObj = new THREE.Color(); const bodyCount = Math.floor(CONFIG.particleCount * 0.8);
    for (let i = 0; i < CONFIG.particleCount; i++) {
        const x = (Math.random() - 0.5) * 150; const y = (Math.random() - 0.5) * 150; const z = (Math.random() - 0.5) * 150;
        positions.push(x, y, z); originalPositions.push(new THREE.Vector3(x, y, z));
        if (i < bodyCount) {
            const type = Math.random();
            if (type > 0.6) colorObj.setHex(0xFFD700); else if (type > 0.2) colorObj.setHex(0xFF2200); else colorObj.setHex(0xFF6600); 
            sizes.push(Math.random() * 0.5 + 0.1);
        } else { colorObj.setHex(0xFFD700); sizes.push(Math.random() * 0.3 + 0.05); }
        colors.push(colorObj.r, colorObj.g, colorObj.b);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    particleMaterial = new THREE.PointsMaterial({ size: 0.5, map: getSprite(), vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95 });
    particles = new THREE.Points(geometry, particleMaterial); scene.add(particles);
}

function getSprite() {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.2, 'rgba(255,200,150,0.8)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(canvas);
}

function createPhotos() {
    photoGroup = new THREE.Group(); 
    photoGroup.visible = true; 
    scene.add(photoGroup);
    
    const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous'); const phi = Math.PI * (3 - Math.sqrt(5)); 
    
    for (let i = 0; i < CONFIG.photoCount; i++) {
        const y = 1 - (i / (CONFIG.photoCount - 1)) * 2; const radius = Math.sqrt(1 - y * y); const theta = phi * i;
        const tx = Math.cos(theta) * radius * 25; const ty = y * 25; const tz = Math.sin(theta) * radius * 25;
        galleryPositions.push(new THREE.Vector3(tx, ty, tz));
        
        let imgUrl = `https://picsum.photos/400/600?random=${i+99}`;
        if (CONFIG.galleryImages && CONFIG.galleryImages.length > 0) {
            imgUrl = CONFIG.galleryImages[i % CONFIG.galleryImages.length];
        }

        loader.load(imgUrl, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace; 
            const photoMaterial = new THREE.MeshBasicMaterial({ 
                map: tex, 
                side: THREE.DoubleSide, 
                transparent: true,
                color: 0xcccccc 
            });

            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 5), photoMaterial);
            mesh.scale.set(0.0001, 0.0001, 0.0001);
            
            mesh.userData = { id: i, galleryPos: new THREE.Vector3(tx, ty, tz), galleryRot: new THREE.Euler(0, 0, 0), isFocused: false };
            mesh.lookAt(0, 0, 0); mesh.userData.galleryRot = mesh.rotation.clone(); photoGroup.add(mesh); photos.push(mesh);
        });
    }
}

// ==========================================
// 交互、动画与手势
// ==========================================
function setupInteraction() {
    window.addEventListener('pointermove', (e) => { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; });
    window.addEventListener('click', onClick);
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); unfocusPhoto(); });
    manualBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleManualState(); });
    audioBtn.addEventListener('click', (e) => {
        e.stopPropagation(); const isMuted = synth.toggleMute();
        if (!isMuted) { audioBtn.innerText = "🔊 音效已开"; audioBtn.classList.add('active'); if(synth.ctx && synth.ctx.state === 'suspended') synth.ctx.resume(); } 
        else { audioBtn.innerText = "🔇 音效已关"; audioBtn.classList.remove('active'); }
    });
}

function hideGuide() { if (!hasInteracted) { gestureGuide.style.opacity = 0; hasInteracted = true; setTimeout(() => gestureGuide.remove(), 1000); } }

function toggleManualState() {
    manualMode = true; manualBtn.classList.add('active'); detectIndicator.style.backgroundColor = '#00aaff'; hideGuide(); 
    if (appState === 'SCATTERED' || appState === 'EXPLODING' || appState === 'GALLERY') {
        appState = 'FORMING'; synth.playForm(); updateStatus('fist'); if (focusedPhoto) unfocusPhoto(); manualBtn.innerText = "🖐️ 点击展开回忆";
    } else {
        appState = 'EXPLODING'; synth.playExplode(); updateStatus('palm'); manualBtn.innerText = "✊ 点击凝聚金马";
        setTimeout(() => { if (appState === 'EXPLODING') { appState = 'GALLERY'; updateStatus('viewing'); } }, 1500);
    }
}

function onClick() {
    if(synth.ctx && synth.ctx.state === 'suspended') synth.ctx.resume();
    if (appState !== 'GALLERY') return;
    raycaster.setFromCamera(mouse, camera); const intersects = raycaster.intersectObjects(photos);
    if (intersects.length > 0) { const object = intersects[0].object; if (focusedPhoto !== object) focusPhoto(object); } 
    else { if (focusedPhoto) unfocusPhoto(); }
}

function focusPhoto(mesh) {
    if (focusedPhoto && focusedPhoto !== mesh) focusedPhoto.userData.isFocused = false;
    focusedPhoto = mesh; mesh.userData.isFocused = true; dimmerEl.style.background = 'rgba(0,0,0,0.8)'; updateStatus("viewing"); closeBtn.classList.add('visible'); targetBloomStrength = 0.1; 
}
function unfocusPhoto() {
    if (focusedPhoto) { focusedPhoto.userData.isFocused = false; focusedPhoto = null; }
    dimmerEl.style.background = 'rgba(0,0,0,0)'; updateStatus("palm"); closeBtn.classList.remove('visible'); targetBloomStrength = CONFIG.bloomStrength;
}

// 🚀 核心提速优化：本地化加载模型
async function initMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks("https://fastly.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
    
    handLandmarker = await HandLandmarker.createFromOptions(vision, { 
        baseOptions: { 
            // 🔴 完美修复：直接读取你刚刚上传到 GitHub 里的相对路径本地文件
            modelAssetPath: "./models/hand_landmarker.task",
            delegate: "GPU" 
        }, 
        runningMode: "VIDEO", 
        numHands: 1 
    });
    await startWebcam();
}

function startWebcam() {
    return new Promise((resolve, reject) => {
        webcam = document.getElementById('webcam');
        navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } }).then((stream) => {
            webcam.srcObject = stream;
            
            webcam.addEventListener('loadeddata', () => { 
                if (handLandmarker) {
                    handLandmarker.detectForVideo(webcam, performance.now());
                }
                
                loadingScreen.style.opacity = 0; 
                setTimeout(() => loadingScreen.remove(), 1000); 
                updateStatus("scattered"); 
                resolve(); 
            });
            
        }).catch((err) => { reject(err); });
    });
}

function updateStatus(state) {
    statusPill.classList.remove('active');
    if (state === 'scattered') { statusText.innerText = "握拳 ✊ 召唤金马"; gestureIcon.innerText = "✊"; statusPill.style.borderColor = "rgba(255, 69, 0, 0.3)"; } 
    else if (state === 'fist') { statusText.innerText = "金马奔腾 • 蓄势待发"; gestureIcon.innerText = "🐎"; statusPill.classList.add('active'); } 
    else if (state === 'palm') { statusText.innerText = "繁花似锦 • 岁岁平安"; gestureIcon.innerText = "🌸"; statusPill.classList.add('active'); statusPill.style.borderColor = "#ff4400"; } 
    else if (state === 'viewing') { statusText.innerText = "正在浏览 • 点击关闭"; gestureIcon.innerText = "🖼️"; statusPill.classList.remove('active'); }
}

function animate() {
    requestAnimationFrame(animate); time += 0.01;
    if (bloomPass) bloomPass.strength += (targetBloomStrength - bloomPass.strength) * 0.05;
    if (!manualMode && handLandmarker && webcam && webcam.readyState === 4) handleGesture(handLandmarker.detectForVideo(webcam, performance.now()));
    updateParticles(); updatePhotos();
    controls.autoRotate = !focusedPhoto; controls.update(); composer.render();
}

function handleGesture(results) {
    if (manualMode || appState === 'EXPLODING') return;
    if (results.landmarks && results.landmarks.length > 0) {
        detectIndicator.classList.add('detected');
        const lm = results.landmarks[0]; const wrist = lm[0];
        let distSum = 0; [8, 12, 16, 20].forEach(i => { const dx = lm[i].x - wrist.x; const dy = lm[i].y - wrist.y; distSum += Math.sqrt(dx*dx + dy*dy); });
        const avgDist = distSum / 4;
        
        if (avgDist < 0.28) { 
            fistHoldFrames++;
            if (fistHoldFrames > 15 && appState !== 'FORMING' && appState !== 'FORMED') {
                appState = 'FORMING'; synth.playForm(); hideGuide(); updateStatus("fist"); if (focusedPhoto) unfocusPhoto();
            }
        } else {
            fistHoldFrames = 0;
            if (avgDist > 0.40 && (appState === 'FORMED' || appState === 'FORMING')) {
                appState = 'EXPLODING'; synth.playExplode(); hideGuide(); updateStatus("palm"); 
                setTimeout(() => { if (appState === 'EXPLODING') { appState = 'GALLERY'; updateStatus("viewing"); } }, 1500);
            }
        }
    } else { detectIndicator.classList.remove('detected'); fistHoldFrames = 0; }
}

function updateParticles() {
    const positions = particles.geometry.attributes.position.array; const bodyCount = Math.floor(CONFIG.particleCount * 0.8);
    for (let i = 0; i < CONFIG.particleCount; i++) {
        const ix = i * 3; let tx, ty, tz;
        if (appState === 'FORMING' || appState === 'FORMED') {
            if (i < bodyCount) {
                const hp = horsePoints[i % horsePoints.length]; const breath = 1 + Math.sin(time * 2) * 0.01;
                tx = hp.x * breath + Math.sin(time * 3 + i) * 0.05; ty = hp.y * breath + Math.cos(time * 2 + i) * 0.05; tz = hp.z * breath + Math.sin(time * 4 + i) * 0.05;
            } else {
                const ap = auraPoints[(i - bodyCount) % auraPoints.length];
                tx = ap.x - 2.0 + Math.sin(time * 5 + i) * 0.5; ty = ap.y + Math.sin(time * 3 + i) * 0.2; tz = ap.z + Math.cos(time * 4 + i) * 0.2;
            }
        } else if (appState === 'EXPLODING') {
            const cx = positions[ix]; const cy = positions[ix+1]; const cz = positions[ix+2];
            const rate = i < bodyCount ? 1.08 : 1.15; tx = cx * rate; ty = cy * rate; tz = cz * rate;
        } else {
            tx = originalPositions[i].x + Math.sin(time * 0.5 + i) * 5; ty = originalPositions[i].y + Math.cos(time * 0.3 + i) * 5; tz = originalPositions[i].z;
        }
        const speed = (appState === 'EXPLODING') ? 0.1 : 0.08;
        positions[ix] += (tx - positions[ix]) * speed; positions[ix+1] += (ty - positions[ix+1]) * speed; positions[ix+2] += (tz - positions[ix+2]) * speed;
    }
    particles.geometry.attributes.position.needsUpdate = true;
}

function updatePhotos() {
    if (appState === 'EXPLODING' || appState === 'GALLERY') {
        photoGroup.visible = true;
        photos.forEach((mesh, i) => {
            const ud = mesh.userData; let targetPos, targetRot, targetScale;
            if (ud.isFocused) {
                const cameraDir = new THREE.Vector3(); camera.getWorldDirection(cameraDir);
                targetPos = new THREE.Vector3().copy(camera.position).add(cameraDir.multiplyScalar(15));
                mesh.lookAt(camera.position); targetRot = mesh.quaternion; targetScale = 3.5; 
            } else {
                targetPos = ud.galleryPos.clone(); targetPos.y += Math.sin(time + i) * 0.8;
                const dummy = new THREE.Object3D(); dummy.position.copy(targetPos); dummy.lookAt(0,0,0); targetRot = dummy.quaternion; targetScale = 1.0;
            }
            mesh.position.lerp(targetPos, 0.08); mesh.quaternion.slerp(targetRot, ud.isFocused ? 0.1 : 0.05);
            const newScale = THREE.MathUtils.lerp(mesh.scale.x, targetScale, 0.1); mesh.scale.set(newScale, newScale, newScale);
        });
    } else {
        photos.forEach(mesh => { 
            mesh.position.lerp(new THREE.Vector3(0,0,0), 0.1); 
            const newScale = THREE.MathUtils.lerp(mesh.scale.x, 0.0001, 0.1); 
            mesh.scale.set(newScale, newScale, newScale); 
        });
    }
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); }

// ==========================================
// AI 金融顾问功能 (接入后端安全代理)
// ==========================================
function setupAI() {
    aiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chatModal.classList.toggle('hidden');
    });

    closeChatBtn.addEventListener('click', () => {
        chatModal.classList.add('hidden');
    });

    sendMsgBtn.addEventListener('click', sendAIMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAIMessage();
    });
}

async function callZhipuAI(prompt) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: prompt })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const json = await response.json();
        
        if (json.error) {
            throw new Error(json.error);
        }

        return json.reply;

    } catch (error) {
        console.error("Local API Error:", error);
        return "抱歉，财神爷的信号不太好（安全代理请求失败），请稍后再试！";
    }
}

async function sendAIMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    addMessageToChat(text, 'user-msg');
    chatInput.value = '';

    const loadingId = 'loading-' + Date.now();
    addMessageToChat('财神爷正在掐指一算...', 'ai-msg', loadingId);

    const reply = await callZhipuAI(text);

    document.getElementById(loadingId).remove();
    const formattedReply = typeof marked !== 'undefined' ? marked.parse(reply) : reply;
    addMessageToChat(formattedReply, 'ai-msg', null, true);
}

function addMessageToChat(content, className, id = null, isHTML = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${className}`;
    if (id) msgDiv.id = id;
    
    if (isHTML) {
        msgDiv.innerHTML = content;
    } else {
        msgDiv.textContent = content;
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

init();
