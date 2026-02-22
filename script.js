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
        CDN_PREFIX + "IMG_20220723_151111.jpg", CDN_PREFIX + "IMG_20220723_161917.jpg",
        CDN_PREFIX + "IMG_20220723_170924.jpg", CDN_PREFIX + "IMG_20220723_174018.jpg",
        CDN_PREFIX + "IMG_20220723_184904.jpg", CDN_PREFIX + "IMG_20220724_151129.jpg",
        CDN_PREFIX + "IMG_20220724_151404.jpg", CDN_PREFIX + "IMG_20220724_152254.jpg",
        CDN_PREFIX + "IMG_20220724_153041.jpg", CDN_PREFIX + "IMG_20220724_154313.jpg",
        CDN_PREFIX + "IMG_20220724_154745.jpg", CDN_PREFIX + "IMG_20220724_154904.jpg",
        CDN_PREFIX + "IMG_20220725_150737.jpg", CDN_PREFIX + "IMG_20220725_152033.jpg",
        CDN_PREFIX + "IMG_20220725_153234.jpg", CDN_PREFIX + "IMG_20220725_163419.jpg"
    ] 
};

// ==========================================
// 音效系统
// ==========================================
class EtherealSynth {
    constructor() { this.ctx = null; this.isMuted = true; }
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.isMuted = false; if(this.ctx.state === 'suspended') this.ctx.resume(); }
    toggleMute() { if(!this.ctx) this.init(); this.isMuted = !this.isMuted; return this.isMuted; }
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
    }
}

// ==========================================
// 全局状态与 3D 诗词生成
// ==========================================
let scene, camera, renderer, composer, controls;
let bloomPass, particles, particleMaterial, photoGroup, handLandmarker, webcam;
let targetBloomStrength = CONFIG.bloomStrength; 

let appState = 'LOADING_TEXT_DISPERSING'; // 初始进入古诗词动态演化阶段
let time = 0, manualMode = false, fistHoldFrames = 0, hasInteracted = false; 
const horsePoints = [], auraPoints = [], originalPositions = [], galleryPositions = [], photos = [];
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();
let focusedPhoto = null, isUserInteracting = false; 

let isGlobalLoaded = false; // 全局加载完成锁

// 关于等待与希望的诗词矩阵
let textPoints = [];
const ancientQuotes = [
    "长风破浪会有时\n直挂云帆济沧海",
    "千淘万漉虽辛苦\n吹尽狂沙始到金",
    "沉舟侧畔千帆过\n病树前头万木春",
    "欲穷千里目\n更上一层楼",
    "宝剑锋从磨砺出\n梅花香自苦寒来"
];
let quoteIndex = 0;

const synth = new EtherealSynth();

// 进度条控制
let totalProgressSteps = CONFIG.photoCount + 2; 
let currentProgressStep = 0;

function updateProgress(msg) {
    currentProgressStep++;
    let pct = Math.floor((currentProgressStep / totalProgressSteps) * 100);
    if(pct > 100) pct = 100;
    const bar = document.getElementById('loading-bar');
    const pctEl = document.getElementById('loading-percent');
    const txtEl = document.getElementById('loading-text');
    if(bar) bar.style.width = pct + '%';
    if(pctEl) pctEl.innerText = pct + '%';
    if(txtEl && msg) txtEl.innerText = msg;
}

// ==========================================
// 核心加载控制 (防死锁并行架构)
// ==========================================
function init() {
    initThree();
    initPostProcessing();
    onWindowResize();
    
    // 1. 同步创建基础散落粒子，并立刻开启 3D 动画循环，彻底告别静态等待
    createParticles();
    animate();
    cycleLoadingText(); 
    
    // 2. 开启异步静默加载任务队列
    runAsyncLoaders();
}

async function runAsyncLoaders() {
    try {
        await generateHorseData();
        updateProgress("正在推演粒子矩阵...");
        
        // 并行拉取图片和 AI 模型
        await Promise.all([
            createPhotos(), 
            initMediaPipeTask()
        ]);
        
        finishLoading();
    } catch(err) {
        console.warn("加载队列中遇到波动: ", err);
        finishLoading(); // 即使部分出错，也强行放行，防止永久白屏
    }
}

// 🔴 极速放行：12秒终极防卡死！若网络极差，12秒后强行收起加载条进入 3D 页面
setTimeout(() => {
    if(!isGlobalLoaded) {
        console.warn("网络请求可能超时，触发极速防死锁机制！");
        finishLoading();
    }
}, 12000);

function finishLoading() {
    if(isGlobalLoaded) return;
    isGlobalLoaded = true;
    const pctEl = document.getElementById('loading-percent');
    const bar = document.getElementById('loading-bar');
    if(pctEl) pctEl.innerText = '100%';
    if(bar) bar.style.width = '100%';
    updateProgress("准备绽放...");
}

// ==========================================
// 古诗词 3D 转换引擎
// ==========================================
function generateTextData(quote) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sizeX = 800; const sizeY = 400;
    canvas.width = sizeX; canvas.height = sizeY;

    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, sizeX, sizeY);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px "Microsoft YaHei", "SimHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    const lines = quote.split('\n');
    const lineHeight = 75;
    const startY = sizeY / 2 - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, index) => { ctx.fillText(line, sizeX / 2, startY + index * lineHeight); });

    const imgData = ctx.getImageData(0, 0, sizeX, sizeY).data;
    const tempPoints = []; const step = isMobile ? 5 : 3;

    for (let y = 0; y < sizeY; y += step) {
        for (let x = 0; x < sizeX; x += step) {
            if (imgData[(y * sizeX + x) * 4] > 128) { 
                 const px = (x - sizeX / 2) * 0.12;
                 const py = -(y - sizeY / 2) * 0.12 - 5; // 稍微下移，让出进度条空间
                 const pz = (Math.random() - 0.5) * 4;
                 tempPoints.push(new THREE.Vector3(px, py, pz));
            }
        }
    }
    // 乱序处理，让粒子汇聚更有科幻感
    tempPoints.sort(() => Math.random() - 0.5); 
    return tempPoints;
}

// 循环推进诗词状态
function cycleLoadingText() {
    if (isGlobalLoaded) {
        // 加载完成，散开准备切换为金马交互模式
        appState = 'SCATTERED';
        const loadingUi = document.getElementById('loading-ui');
        if(loadingUi) loadingUi.style.opacity = 0;
        setTimeout(() => { if(loadingUi) loadingUi.remove(); }, 1500);
        updateStatus("scattered");
        return; 
    }

    if (appState === 'LOADING_TEXT_DISPERSING') {
        textPoints = generateTextData(ancientQuotes[quoteIndex % ancientQuotes.length]);
        quoteIndex++;
        appState = 'LOADING_TEXT_FORMING';
        setTimeout(cycleLoadingText, 3000); // 维持诗词展示时间
    } else if (appState === 'LOADING_TEXT_FORMING') {
        appState = 'LOADING_TEXT_DISPERSING';
        setTimeout(cycleLoadingText, 1500); // 散开的时间
    } else {
        setTimeout(cycleLoadingText, 1000);
    }
}

// ==========================================
// 3D 场景与核心逻辑
// ==========================================
function initThree() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1a0505, 0.02); 
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 45);
    
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85; 
    
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
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
        const fallbacks = [
            "https://npm.elemecdn.com/twemoji@14.0.2/assets/72x72/1f40e.png",
            "https://fastly.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f40e.png"
        ];
        let currentFallback = 0;
        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const size = 400; canvas.width = size; canvas.height = size;
            ctx.drawImage(img, 40, 40, 320, 320);
            
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
            fillPoints(tempPoints, tempAura); resolve();
        };

        img.onerror = () => {
            currentFallback++;
            if (currentFallback < fallbacks.length) {
                img.src = fallbacks[currentFallback];
            } else {
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                const size = 400; canvas.width = size; canvas.height = size;
                ctx.font = 'bold 280px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('馬', size / 2, size / 2 + 20);
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
                fillPoints(tempPoints, tempAura); resolve();
            }
        };
        img.src = fallbacks[0];
    });
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
    return new Promise((resolve) => {
        photoGroup = new THREE.Group(); photoGroup.visible = true; scene.add(photoGroup);
        const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous'); 
        const phi = Math.PI * (3 - Math.sqrt(5)); 
        
        let loadedCount = 0; const totalCount = CONFIG.photoCount;
        
        function checkComplete() {
            loadedCount++;
            updateProgress(`正在装载时间胶囊... (${loadedCount}/${totalCount})`);
            // 如果所有图片都完成了，安全放行
            if (loadedCount >= totalCount) resolve();
        }
        
        for (let i = 0; i < totalCount; i++) {
            const y = 1 - (i / (totalCount - 1)) * 2; const radius = Math.sqrt(1 - y * y); const theta = phi * i;
            const tx = Math.cos(theta) * radius * 25; const ty = y * 25; const tz = Math.sin(theta) * radius * 25;
            galleryPositions.push(new THREE.Vector3(tx, ty, tz));
            
            let imgUrl = `https://picsum.photos/400/600?random=${i+99}`;
            if (CONFIG.galleryImages && CONFIG.galleryImages.length > 0) {
                imgUrl = CONFIG.galleryImages[i % CONFIG.galleryImages.length];
            }

            loader.load(
                imgUrl, 
                (tex) => {
                    tex.colorSpace = THREE.SRGBColorSpace; 
                    const photoMaterial = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, color: 0xcccccc });
                    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 5), photoMaterial);
                    mesh.scale.set(0.01, 0.01, 0.01);
                    mesh.userData = { id: i, galleryPos: new THREE.Vector3(tx, ty, tz), galleryRot: new THREE.Euler(0, 0, 0), isFocused: false };
                    mesh.lookAt(0, 0, 0); mesh.userData.galleryRot = mesh.rotation.clone(); photoGroup.add(mesh); photos.push(mesh);
                    checkComplete();
                },
                undefined,
                (err) => {
                    const photoMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x444444 });
                    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 5), photoMaterial);
                    mesh.scale.set(0.01, 0.01, 0.01);
                    mesh.userData = { id: i, galleryPos: new THREE.Vector3(tx, ty, tz), galleryRot: new THREE.Euler(0, 0, 0), isFocused: false };
                    mesh.lookAt(0, 0, 0); mesh.userData.galleryRot = mesh.rotation.clone(); photoGroup.add(mesh); photos.push(mesh);
                    checkComplete();
                }
            );
        }
    });
}

async function initMediaPipeTask() {
    return new Promise(async (resolve, reject) => {
        try {
            updateProgress("正在加载神经控制网络...");
            const vision = await FilesetResolver.forVisionTasks("https://npm.elemecdn.com/@mediapipe/tasks-vision@0.10.3/wasm");
            handLandmarker = await HandLandmarker.createFromOptions(vision, { 
                baseOptions: { modelAssetPath: "./models/hand_landmarker.task", delegate: "GPU" }, 
                runningMode: "VIDEO", numHands: 1 
            });
            webcam = document.getElementById('webcam');
            if(!webcam) return resolve();
            navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } }).then((stream) => {
                webcam.srcObject = stream;
                webcam.addEventListener('loadeddata', () => { 
                    if (handLandmarker) handLandmarker.detectForVideo(webcam, performance.now());
                    updateProgress("引擎接入成功"); resolve(); 
                });
            }).catch((err) => { resolve(); });
        } catch(e) { resolve(); }
    });
}

function setupInteraction() {
    let startX = 0, startY = 0;
    window.addEventListener('pointerdown', (e) => { startX = e.clientX; startY = e.clientY; });

    window.addEventListener('pointerup', (e) => {
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist < 10) { 
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            onClick();
        }
    });

    window.addEventListener('pointermove', (e) => { 
        if(!isMobile) { mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; }
    });
    
    const closeBtnEl = document.getElementById('close-btn');
    if(closeBtnEl) closeBtnEl.addEventListener('click', (e) => { e.stopPropagation(); unfocusPhoto(); });
    
    const manualBtnEl = document.getElementById('manual-btn');
    if(manualBtnEl) manualBtnEl.addEventListener('click', (e) => { e.stopPropagation(); toggleManualState(); });
    
    const audioBtnEl = document.getElementById('audio-btn');
    if(audioBtnEl) audioBtnEl.addEventListener('click', (e) => {
        e.stopPropagation(); const isMuted = synth.toggleMute();
        if (!isMuted) { audioBtnEl.innerText = "🔊 音效已开"; audioBtnEl.classList.add('active'); if(synth.ctx && synth.ctx.state === 'suspended') synth.ctx.resume(); } 
        else { audioBtnEl.innerText = "🔇 音效已关"; audioBtnEl.classList.remove('active'); }
    });
}

function hideGuide() { 
    const gestureGuide = document.getElementById('gesture-guide');
    if (!hasInteracted) { if(gestureGuide) gestureGuide.style.opacity = 0; hasInteracted = true; setTimeout(() => { if(gestureGuide) gestureGuide.remove(); }, 1000); } 
}

function toggleManualState() {
    manualMode = true; 
    const manualBtnEl = document.getElementById('manual-btn');
    if(manualBtnEl) manualBtnEl.classList.add('active'); 
    const detectIndicator = document.getElementById('detect-indicator');
    if(detectIndicator) detectIndicator.style.backgroundColor = '#00aaff'; 
    hideGuide(); 
    
    if (appState === 'SCATTERED' || appState === 'FORMING' || appState === 'FORMED') {
        appState = 'EXPLODING'; synth.playExplode(); updateStatus('palm'); 
        if(manualBtnEl) manualBtnEl.innerHTML = "✊ 凝聚骏马";
        setTimeout(() => { if (appState === 'EXPLODING') { appState = 'GALLERY'; updateStatus('viewing'); } }, 1500);
    } else {
        appState = 'FORMING'; synth.playForm(); updateStatus('fist'); if (focusedPhoto) unfocusPhoto(); 
        if(manualBtnEl) manualBtnEl.innerHTML = "🖐️ 展开相册";
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
    focusedPhoto = mesh; mesh.userData.isFocused = true; 
    const dimmerEl = document.getElementById('overlay-dimmer');
    if(dimmerEl) dimmerEl.style.background = 'rgba(0,0,0,0.8)'; 
    updateStatus("viewing"); 
    const closeBtnEl = document.getElementById('close-btn');
    if(closeBtnEl) closeBtnEl.classList.add('visible'); 
    targetBloomStrength = 0.1; 
}

function unfocusPhoto() {
    if (focusedPhoto) { focusedPhoto.userData.isFocused = false; focusedPhoto = null; }
    const dimmerEl = document.getElementById('overlay-dimmer');
    if(dimmerEl) dimmerEl.style.background = 'rgba(0,0,0,0)'; 
    updateStatus("palm"); 
    const closeBtnEl = document.getElementById('close-btn');
    if(closeBtnEl) closeBtnEl.classList.remove('visible'); 
    targetBloomStrength = CONFIG.bloomStrength;
}

function updateStatus(state) {
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const gestureIcon = document.getElementById('gesture-icon');
    if (!statusPill) return;
    statusPill.classList.remove('active');
    if (state === 'scattered') { if(statusText) statusText.innerText = "握拳 ✊ 召唤金马"; if(gestureIcon) gestureIcon.innerText = "✊"; statusPill.style.borderColor = "rgba(255, 69, 0, 0.3)"; } 
    else if (state === 'fist') { if(statusText) statusText.innerText = "金马奔腾 • 蓄势待发"; if(gestureIcon) gestureIcon.innerText = "🐎"; statusPill.classList.add('active'); } 
    else if (state === 'palm') { if(statusText) statusText.innerText = "繁花似锦 • 岁岁平安"; if(gestureIcon) gestureIcon.innerText = "🌸"; statusPill.classList.add('active'); statusPill.style.borderColor = "#ff4400"; } 
    else if (state === 'viewing') { if(statusText) statusText.innerText = "正在浏览 • 点击关闭"; if(gestureIcon) gestureIcon.innerText = "🖼️"; statusPill.classList.remove('active'); }
}

function onWindowResize() { 
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight; 
        camera.updateProjectionMatrix(); 
        renderer.setSize(window.innerWidth, window.innerHeight); 
    }
    if (composer) composer.setSize(window.innerWidth, window.innerHeight); 
}

function animate() {
    requestAnimationFrame(animate); time += 0.01;
    if (bloomPass) bloomPass.strength += (targetBloomStrength - bloomPass.strength) * 0.05;
    if (!manualMode && handLandmarker && webcam && webcam.readyState === 4) handleGesture(handLandmarker.detectForVideo(webcam, performance.now()));
    updateParticles(); updatePhotos();
    if (controls) controls.autoRotate = !focusedPhoto; 
    if (controls) controls.update(); 
    if (composer) composer.render();
}

function handleGesture(results) {
    if (manualMode || appState === 'EXPLODING') return;
    const detectIndicator = document.getElementById('detect-indicator');
    if (results.landmarks && results.landmarks.length > 0) {
        if(detectIndicator) detectIndicator.classList.add('detected');
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
    } else { if(detectIndicator) detectIndicator.classList.remove('detected'); fistHoldFrames = 0; }
}

function updateParticles() {
    if (!particles || !particles.geometry) return;
    const positions = particles.geometry.attributes.position.array; const bodyCount = Math.floor(CONFIG.particleCount * 0.8);
    for (let i = 0; i < CONFIG.particleCount; i++) {
        const ix = i * 3; let tx, ty, tz; let speed = 0.08;
        
        // 🔴 诗词状态的粒子逻辑
        if (appState === 'LOADING_TEXT_FORMING') {
            if (textPoints.length > 0) {
                const target = textPoints[i % textPoints.length];
                // 增加呼吸抖动感
                tx = target.x + Math.sin(time * 2 + i) * 0.2; 
                ty = target.y + Math.cos(time * 3 + i) * 0.2; 
                tz = target.z + Math.sin(time * 4 + i) * 0.2;
            } else {
                tx = originalPositions[i].x; ty = originalPositions[i].y; tz = originalPositions[i].z;
            }
            speed = 0.05; // 古诗词汇聚速度略缓，凸显优雅
        } 
        else if (appState === 'LOADING_TEXT_DISPERSING' || appState === 'SCATTERED') {
            tx = originalPositions[i].x + Math.sin(time * 0.5 + i) * 8; 
            ty = originalPositions[i].y + Math.cos(time * 0.3 + i) * 8; 
            tz = originalPositions[i].z;
            speed = 0.03;
        } 
        else if (appState === 'FORMING' || appState === 'FORMED') {
            if (i < bodyCount) {
                const hp = horsePoints[i % horsePoints.length]; const breath = 1 + Math.sin(time * 2) * 0.01;
                tx = hp.x * breath + Math.sin(time * 3 + i) * 0.05; ty = hp.y * breath + Math.cos(time * 2 + i) * 0.05; tz = hp.z * breath + Math.sin(time * 4 + i) * 0.05;
            } else {
                const ap = auraPoints[(i - bodyCount) % auraPoints.length];
                tx = ap.x - 2.0 + Math.sin(time * 5 + i) * 0.5; ty = ap.y + Math.sin(time * 3 + i) * 0.2; tz = ap.z + Math.cos(time * 4 + i) * 0.2;
            }
        } 
        else if (appState === 'EXPLODING') {
            const cx = positions[ix]; const cy = positions[ix+1]; const cz = positions[ix+2];
            const rate = i < bodyCount ? 1.08 : 1.15; tx = cx * rate; ty = cy * rate; tz = cz * rate;
            speed = 0.1;
        }
        
        positions[ix] += (tx - positions[ix]) * speed; positions[ix+1] += (ty - positions[ix+1]) * speed; positions[ix+2] += (tz - positions[ix+2]) * speed;
    }
    particles.geometry.attributes.position.needsUpdate = true;
}

function updatePhotos() {
    if (!photoGroup) return;
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
        let allHidden = true;
        photos.forEach(mesh => { 
            mesh.position.lerp(new THREE.Vector3(0,0,0), 0.1); 
            const newScale = THREE.MathUtils.lerp(mesh.scale.x, 0.01, 0.1); 
            mesh.scale.set(newScale, newScale, newScale); 
            if (newScale > 0.015) allHidden = false;
        });
        if (allHidden) photoGroup.visible = false;
    }
}

function setupAI() {
    const aiBtn = document.getElementById('ai-btn');
    const chatModal = document.getElementById('ai-chat-modal');
    const closeChatBtn = document.getElementById('close-chat-btn');
    const sendMsgBtn = document.getElementById('send-msg-btn');
    const chatInput = document.getElementById('chat-input');
    
    if(aiBtn) aiBtn.addEventListener('click', (e) => { e.stopPropagation(); if(chatModal) chatModal.classList.toggle('hidden'); });
    if(closeChatBtn) closeChatBtn.addEventListener('click', () => { if(chatModal) chatModal.classList.add('hidden'); });
    if(sendMsgBtn) sendMsgBtn.addEventListener('click', sendAIMessage);
    if(chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAIMessage(); });
}

async function callZhipuAI(prompt) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const json = await response.json();
        if (json.error) throw new Error(json.error);
        return json.reply;
    } catch (error) {
        return "抱歉，财神爷的信号不太好（安全代理请求失败），请稍后再试！";
    }
}

async function sendAIMessage() {
    const chatInput = document.getElementById('chat-input');
    if(!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;

    addMessageToChat(text, 'user-msg');
    chatInput.value = '';

    const loadingId = 'loading-' + Date.now();
    addMessageToChat('财神爷正在掐指一算...', 'ai-msg', loadingId);

    const reply = await callZhipuAI(text);

    const loaderEl = document.getElementById(loadingId);
    if(loaderEl) loaderEl.remove();
    
    const formattedReply = typeof marked !== 'undefined' ? marked.parse(reply) : reply;
    addMessageToChat(formattedReply, 'ai-msg', null, true);
}

function addMessageToChat(content, className, id = null, isHTML = false) {
    const chatMessages = document.getElementById('chat-messages');
    if(!chatMessages) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${className}`;
    if (id) msgDiv.id = id;
    
    if (isHTML) msgDiv.innerHTML = content;
    else msgDiv.textContent = content;

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 启动入口
init();
