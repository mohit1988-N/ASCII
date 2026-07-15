/**
 * AsciiCat Studio - Main Application Logic
 * Contains:
 * 1. Procedural Cat Animation Engine (Inverse Kinematics Quadruped)
 * 2. Real-time ASCII Converter & Monospaced Canvas Renderer
 * 3. Video Processing & Drag-and-Drop Handler
 * 4. Control Panels & Dashboard Theme Integrator
 */

// --- CONFIGURATIONS & PRESETS ---
const GAIT_PRESETS = {
  sprint: {
    frequency: 3.2,       // Run cycle speed (Hz)
    strideLength: 85,    // Horizontal leg sweep (px)
    strideHeight: 28,    // Vertical leg lift (px)
    bodyStretch: 22,      // Max spine extension/contraction (px)
    bodyHeight: 110,      // Nominal shoulder/hip height from floor (px)
    bobAmplitude: 12,     // Up/down torso bobbing (px)
    tailBaseAngle: -0.1,  // Base angle of tail (rad, horizontal = 0)
    tailWaveAmp: 0.35,    // Tail wave motion amplitude
    gaitOffsetFront: 1.1 * Math.PI, // Gallop offset between rear and front legs
    gaitOffsetRear: 0.4 * Math.PI,  // Gallop offset between left and right rear
  },
  stalk: {
    frequency: 1.2,
    strideLength: 45,
    strideHeight: 12,
    bodyStretch: 5,
    bodyHeight: 135,      // Lower to ground
    bobAmplitude: 3,
    tailBaseAngle: 0.8,   // Pointing down
    tailWaveAmp: 0.15,
    gaitOffsetFront: 0.9 * Math.PI,
    gaitOffsetRear: 1.0 * Math.PI, // Alternate gait (walk-like)
  },
  walk: {
    frequency: 1.6,
    strideLength: 55,
    strideHeight: 18,
    bodyStretch: 8,
    bodyHeight: 115,
    bobAmplitude: 5,
    tailBaseAngle: -0.6,  // Curved up
    tailWaveAmp: 0.25,
    gaitOffsetFront: 0.95 * Math.PI,
    gaitOffsetRear: 1.0 * Math.PI,
  },
  trot: {
    frequency: 2.2,
    strideLength: 60,
    strideHeight: 24,
    bodyStretch: 10,
    bodyHeight: 105,      // Bouncy, leg roots higher
    bobAmplitude: 14,     // High bounce
    tailBaseAngle: -0.8,  // High tail
    tailWaveAmp: 0.3,
    gaitOffsetFront: 1.0 * Math.PI,
    gaitOffsetRear: 1.0 * Math.PI,
  }
};

const CHAR_SETS = {
  standard: '@#S%?*+;:-. ',
  blocks: '█▓▒░ ',
  binary: '10 ',
  matrix: 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ10'
};

// --- APPLICATION STATE ---
const State = {
  // Playback
  isPlaying: true,
  time: 0,
  speedMultiplier: 1.0,
  lastFrameTime: 0,
  fps: 60,
  computeLatency: 0,
  
  // Animation Source
  sourceType: 'cat', // 'cat' or 'video'
  activePreset: 'sprint',
  gait: { ...GAIT_PRESETS.sprint },
  
  // Rendering Settings
  cols: 120,
  rows: 50,
  fontSize: 10,
  threshold: 128,
  contrast: 1.5,
  invert: true,
  charSetKey: 'standard',
  charSet: CHAR_SETS.standard,
  theme: 'high-contrast',
  crtScanlines: true,
  crtFlicker: true,
  showOriginalOverlay: false,
  
  // Dust Particles
  particles: [],
};

// --- DOM ELEMENTS ---
const DOM = {
  appHeader: document.querySelector('.app-header'),
  statusSimulation: document.getElementById('status-simulation'),
  statusRenderer: document.getElementById('status-renderer'),
  
  // Telemetry
  teleFps: document.getElementById('tele-fps'),
  teleLatency: document.getElementById('tele-latency'),
  teleGait: document.getElementById('tele-gait'),
  teleSpeed: document.getElementById('tele-speed'),
  
  // Presets
  presetBtns: document.querySelectorAll('.preset-btn'),
  
  // Input Video
  uploadDropzone: document.getElementById('upload-dropzone'),
  videoInput: document.getElementById('video-input'),
  videoPreviewContainer: document.getElementById('video-preview-container'),
  videoFilename: document.getElementById('video-filename'),
  hiddenVideo: document.getElementById('hidden-video'),
  btnRemoveVideo: document.getElementById('btn-remove-video'),
  
  // Viewports & Canvas
  asciiCanvas: document.getElementById('ascii-canvas'),
  sourceCanvas: document.getElementById('source-canvas'),
  crtScreen: document.getElementById('crt-screen'),
  originalOverlay: document.getElementById('original-overlay-container'),
  
  // Badges
  toggleScanlines: document.getElementById('toggle-crt-scanlines'),
  toggleFlicker: document.getElementById('toggle-crt-flicker'),
  toggleOverlay: document.getElementById('toggle-original-overlay'),
  
  // Playback
  btnPlay: document.getElementById('btn-play'),
  btnStep: document.getElementById('btn-step'),
  sliderSpeed: document.getElementById('slider-speed'),
  valSpeed: document.getElementById('val-speed'),
  speedPresetBtns: document.querySelectorAll('.speed-preset-btn'),
  
  // Sliders Settings
  sliderCols: document.getElementById('slider-cols'),
  sliderRows: document.getElementById('slider-rows'),
  sliderFontSize: document.getElementById('slider-font-size'),
  valCols: document.getElementById('val-cols'),
  valRows: document.getElementById('val-rows'),
  valFontSize: document.getElementById('val-font-size'),
  
  sliderThreshold: document.getElementById('slider-threshold'),
  sliderContrast: document.getElementById('slider-contrast'),
  valThreshold: document.getElementById('val-threshold'),
  valContrast: document.getElementById('val-contrast'),
  checkInvert: document.getElementById('check-invert'),
  
  // Characters & Themes
  charBtns: document.querySelectorAll('.char-btn'),
  inputCustomChars: document.getElementById('input-custom-chars'),
  themeBtns: document.querySelectorAll('.theme-btn'),
  
  // Actions
  btnExportFrame: document.getElementById('btn-export-frame'),
  btnExportLoop: document.getElementById('btn-export-loop')
};

// Canvas contexts
const sourceCtx = DOM.sourceCanvas.getContext('2d');
const asciiCtx = DOM.asciiCanvas.getContext('2d');

// Offscreen source canvas for high performance ASCII pixel sampling
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

// --- GAIT SKELETON CALCULATOR ---
class QuadrupedSkeleton {
  constructor() {
    this.thighLen = 38;
    this.shinLen = 32;
    this.armLen = 35;
    this.forearmLen = 30;
    
    // Joint coordinates
    this.hips = { x: 0, y: 0 };
    this.shoulders = { x: 0, y: 0 };
    this.head = { x: 0, y: 0 };
    this.neckEnd = { x: 0, y: 0 };
    
    // Leg joints [hip/shoulder, knee/elbow, paw]
    this.legs = {
      backLeft: { knee: { x:0, y:0 }, paw: { x:0, y:0 } },
      backRight: { knee: { x:0, y:0 }, paw: { x:0, y:0 } },
      frontLeft: { elbow: { x:0, y:0 }, paw: { x:0, y:0 } },
      frontRight: { elbow: { x:0, y:0 }, paw: { x:0, y:0 } },
    };
    
    // Tail chain nodes (10 nodes)
    this.tailNodes = Array.from({ length: 10 }, () => ({ x: 0, y: 0 }));
  }

  update(time, gait, canvasWidth, canvasHeight) {
    const groundY = canvasHeight - 35;
    const centerX = canvasWidth / 2;
    const centerY = groundY - gait.bodyHeight;
    
    // 1. Spine Extension and Body Bobbing
    // Spine expands/contracts. Cosine controls horizontal extension
    const cyclePhase = time * gait.frequency * 2 * Math.PI;
    const spineStretch = Math.cos(cyclePhase) * gait.bodyStretch;
    
    // Spine Length oscillates around nominal 90px
    const spineLength = 90 + spineStretch;
    
    // Torso bobs up/down twice per gait cycle (double peak bounce)
    const bob = Math.sin(cyclePhase * 2) * gait.bobAmplitude;
    // Pitch oscillation (hips bob out of phase with shoulders)
    const pitch = Math.sin(cyclePhase) * 6;
    
    this.shoulders.x = centerX + spineLength / 2;
    this.shoulders.y = centerY + bob - pitch;
    
    this.hips.x = centerX - spineLength / 2;
    this.hips.y = centerY + bob + pitch;
    
    // 2. Head and Neck positioning
    const neckAngle = -0.4 + Math.sin(cyclePhase - 0.5) * 0.15; // neck rocking
    const neckLen = 25;
    this.neckEnd.x = this.shoulders.x + neckLen * Math.cos(neckAngle);
    this.neckEnd.y = this.shoulders.y + neckLen * Math.sin(neckAngle);
    
    this.head.x = this.neckEnd.x + 8 * Math.cos(neckAngle - 0.2);
    this.head.y = this.neckEnd.y + 8 * Math.sin(neckAngle - 0.2);
    
    // 3. Compute Leg Positions via Gait Phase Trajectory and solve IK
    // Phase parameters
    const offsets = {
      backLeft: 0,
      backRight: gait.gaitOffsetRear,
      frontLeft: gait.gaitOffsetFront,
      frontRight: gait.gaitOffsetFront + gait.gaitOffsetRear
    };
    
    // Back Left
    this.calculateLimb(
      'backLeft', cyclePhase + offsets.backLeft, 
      this.hips, groundY, gait.strideLength, gait.strideHeight, 
      this.thighLen, this.shinLen, true
    );
    
    // Back Right
    this.calculateLimb(
      'backRight', cyclePhase + offsets.backRight, 
      this.hips, groundY, gait.strideLength, gait.strideHeight, 
      this.thighLen, this.shinLen, true
    );
    
    // Front Left
    this.calculateLimb(
      'frontLeft', cyclePhase + offsets.frontLeft, 
      this.shoulders, groundY, gait.strideLength * 0.95, gait.strideHeight * 0.9, 
      this.armLen, this.forearmLen, false
    );
    
    // Front Right
    this.calculateLimb(
      'frontRight', cyclePhase + offsets.frontRight, 
      this.shoulders, groundY, gait.strideLength * 0.95, gait.strideHeight * 0.9, 
      this.armLen, this.forearmLen, false
    );
    
    // 4. Tail Physics Waving
    // Tail Node 0 anchors at Hip
    this.tailNodes[0].x = this.hips.x;
    this.tailNodes[0].y = this.hips.y + 2; // slightly below hip joint
    
    const segmentLen = 9;
    for (let i = 1; i < this.tailNodes.length; i++) {
      // Wave propagates down the tail segments
      const tailPhase = cyclePhase - i * 0.35;
      // Combine base angle + dynamic sinusoidal wave + gravity drop at tail end
      const angle = Math.PI + gait.tailBaseAngle 
        + Math.sin(tailPhase) * gait.tailWaveAmp 
        + (i * 0.05); // droop
      
      this.tailNodes[i].x = this.tailNodes[i-1].x + segmentLen * Math.cos(angle);
      this.tailNodes[i].y = this.tailNodes[i-1].y + segmentLen * Math.sin(angle);
    }
  }

  // Calculate leg targets and solve 2D joint IK
  calculateLimb(key, phase, root, groundY, strideLen, strideHeight, len1, len2, isRear) {
    const wrappedPhase = phase % (2 * Math.PI);
    
    let targetX, targetY;
    
    // Stance phase (0 to PI): Paw moving backward on ground
    if (wrappedPhase < Math.PI) {
      const u = wrappedPhase / Math.PI; // 0 to 1
      targetX = root.x + strideLen * (0.42 - u * 0.84);
      targetY = groundY;
      
      // Spawn dust particle at foot takeoff (stance ending)
      if (u > 0.85 && Math.random() < 0.18 && State.isPlaying && State.sourceType === 'cat') {
        spawnDust(targetX, targetY);
      }
    } 
    // Swing phase (PI to 2*PI): Paw lifting and sweeping forward
    else {
      const u = (wrappedPhase - Math.PI) / Math.PI; // 0 to 1
      targetX = root.x + strideLen * (-0.42 + u * 0.84);
      // Sinusoidal arc for foot lift height
      targetY = groundY - strideHeight * Math.sin(u * Math.PI);
    }
    
    // Solve IK
    // rear leg knees bend forward (towards cat's head, right)
    // front leg elbows bend backward (towards cat's tail, left)
    const flip = isRear; 
    const ik = solveIK(root.x, root.y, targetX, targetY, len1, len2, flip);
    
    if (isRear) {
      this.legs[key].knee = ik.joint;
      this.legs[key].paw = ik.paw;
    } else {
      this.legs[key].elbow = ik.joint;
      this.legs[key].paw = ik.paw;
    }
  }
}

// 2D Analytical IK solver
function solveIK(rootX, rootY, targetX, targetY, len1, len2, flip) {
  const dx = targetX - rootX;
  const dy = targetY - rootY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  let d = Math.min(len1 + len2 - 0.1, Math.max(5, dist));
  
  const angleToTarget = Math.atan2(dy, dx);
  
  // Law of Cosines
  const cosA = (len1 * len1 + d * d - len2 * len2) / (2 * len1 * d);
  const angleA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  
  const cosB = (len1 * len1 + len2 * len2 - d * d) / (2 * len1 * len2);
  const angleB = Math.acos(Math.max(-1, Math.min(1, cosB)));
  
  const jointAngle = angleToTarget + (flip ? -angleA : angleA);
  
  const jointX = rootX + len1 * Math.cos(jointAngle);
  const jointY = rootY + len1 * Math.sin(jointAngle);
  
  const pawAngle = jointAngle + (flip ? Math.PI - angleB : -Math.PI + angleB);
  const pawX = jointX + len2 * Math.cos(pawAngle);
  const pawY = jointY + len2 * Math.sin(pawAngle);
  
  return {
    joint: { x: jointX, y: jointY },
    paw: { x: pawX, y: pawY }
  };
}

// --- DUST PARTICLES ENGINE ---
function spawnDust(x, y) {
  const count = 2 + Math.floor(Math.random() * 2);
  const currentSpeed = State.gait.frequency * State.speedMultiplier;
  
  for (let i = 0; i < count; i++) {
    State.particles.push({
      x: x,
      y: y - 1 - Math.random() * 2,
      vx: -1.8 * currentSpeed - Math.random() * 2.2, // Shoot backward
      vy: -0.6 - Math.random() * 1.5,                 // Upward kick
      size: 1.5 + Math.random() * 3,
      alpha: 0.6 + Math.random() * 0.4,
      life: 1.0,
      decay: 0.04 + Math.random() * 0.05
    });
  }
}

function updateParticles() {
  for (let i = State.particles.length - 1; i >= 0; i--) {
    const p = State.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95; // air drag
    p.vy += 0.04; // slight gravity
    p.life -= p.decay;
    p.alpha = Math.max(0, p.life);
    
    if (p.life <= 0) {
      State.particles.splice(i, 1);
    }
  }
}

const catSkeleton = new QuadrupedSkeleton();

// --- VECTOR CAT RENDERER ---
function drawSourceFrame() {
  const w = DOM.sourceCanvas.width;
  const h = DOM.sourceCanvas.height;
  
  // Clear source canvas with clean white (matching prompt requirement)
  sourceCtx.fillStyle = '#ffffff';
  sourceCtx.fillRect(0, 0, w, h);
  
  const groundY = h - 35;
  
  // Draw ground floor line
  sourceCtx.strokeStyle = '#000000';
  sourceCtx.lineWidth = 2.5;
  sourceCtx.beginPath();
  sourceCtx.moveTo(0, groundY);
  sourceCtx.lineTo(w, groundY);
  sourceCtx.stroke();
  
  // Draw floor reference dashes scrolling backward
  const scrollOffset = (State.time * State.gait.frequency * 85) % 60;
  sourceCtx.strokeStyle = '#e2e8f0';
  sourceCtx.lineWidth = 1;
  for (let x = w - scrollOffset; x > 0; x -= 60) {
    sourceCtx.beginPath();
    sourceCtx.moveTo(x, groundY + 1);
    sourceCtx.lineTo(x - 12, groundY + 8);
    sourceCtx.stroke();
  }
  
  // Draw dust particles
  State.particles.forEach(p => {
    sourceCtx.fillStyle = `rgba(0, 0, 0, ${p.alpha})`;
    sourceCtx.beginPath();
    sourceCtx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
    sourceCtx.fill();
  });
  
  // Drawing Cat Parts (Silhouette with thin white overlaps)
  sourceCtx.fillStyle = '#000000';
  sourceCtx.strokeStyle = '#ffffff';
  
  const legs = catSkeleton.legs;
  
  // Function to draw a limb (thick thigh, medium shin, small foot)
  const drawLimb = (root, joint, paw, isRear) => {
    // Outer outline
    sourceCtx.lineWidth = 7.5;
    sourceCtx.strokeStyle = '#ffffff';
    sourceCtx.lineCap = 'round';
    sourceCtx.lineJoin = 'round';
    
    sourceCtx.beginPath();
    sourceCtx.moveTo(root.x, root.y);
    sourceCtx.lineTo(joint.x, joint.y);
    sourceCtx.lineTo(paw.x, paw.y);
    sourceCtx.stroke();
    
    // Core black bone
    sourceCtx.lineWidth = 5.0;
    sourceCtx.strokeStyle = '#000000';
    sourceCtx.beginPath();
    sourceCtx.moveTo(root.x, root.y);
    sourceCtx.lineTo(joint.x, joint.y);
    sourceCtx.lineTo(paw.x, paw.y);
    sourceCtx.stroke();
    
    // Paw pad circle
    sourceCtx.fillStyle = '#000000';
    sourceCtx.beginPath();
    sourceCtx.arc(paw.x, paw.y, 4, 0, 2 * Math.PI);
    sourceCtx.fill();
  };
  
  // 1. Draw Far Legs (Left Side)
  drawLimb(catSkeleton.hips, legs.backLeft.knee, legs.backLeft.paw, true);
  drawLimb(catSkeleton.shoulders, legs.frontLeft.elbow, legs.frontLeft.paw, false);
  
  // 2. Draw Tail (Tapering chain of overlapping circles)
  for (let i = catSkeleton.tailNodes.length - 1; i >= 0; i--) {
    const node = catSkeleton.tailNodes[i];
    const r = 5.5 - i * 0.35; // taper
    // White border outline
    sourceCtx.fillStyle = '#ffffff';
    sourceCtx.beginPath();
    sourceCtx.arc(node.x, node.y, r + 1.2, 0, 2 * Math.PI);
    sourceCtx.fill();
    // Inner black
    sourceCtx.fillStyle = '#000000';
    sourceCtx.beginPath();
    sourceCtx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    sourceCtx.fill();
  }
  
  // 3. Draw Torso / Abdomen (Chest, Belly, Hip)
  // Abdomen muscle mass outline
  sourceCtx.fillStyle = '#000000';
  sourceCtx.beginPath();
  // Shoulder circle
  sourceCtx.arc(catSkeleton.shoulders.x, catSkeleton.shoulders.y, 16.5, 0, 2*Math.PI);
  // Hip circle
  sourceCtx.arc(catSkeleton.hips.x, catSkeleton.hips.y, 14.5, 0, 2*Math.PI);
  sourceCtx.fill();
  
  // Muscle bridge connecting shoulder and hips
  sourceCtx.beginPath();
  sourceCtx.moveTo(catSkeleton.shoulders.x, catSkeleton.shoulders.y - 16.5);
  sourceCtx.lineTo(catSkeleton.hips.x, catSkeleton.hips.y - 14.5);
  sourceCtx.lineTo(catSkeleton.hips.x, catSkeleton.hips.y + 14.5);
  sourceCtx.lineTo(catSkeleton.shoulders.x, catSkeleton.shoulders.y + 16.5);
  sourceCtx.closePath();
  sourceCtx.fill();
  
  // 4. Draw Neck & Head
  // Neck
  sourceCtx.lineWidth = 11.0;
  sourceCtx.strokeStyle = '#ffffff';
  sourceCtx.beginPath();
  sourceCtx.moveTo(catSkeleton.shoulders.x, catSkeleton.shoulders.y - 5);
  sourceCtx.lineTo(catSkeleton.neckEnd.x, catSkeleton.neckEnd.y);
  sourceCtx.stroke();
  
  sourceCtx.lineWidth = 8.5;
  sourceCtx.strokeStyle = '#000000';
  sourceCtx.beginPath();
  sourceCtx.moveTo(catSkeleton.shoulders.x, catSkeleton.shoulders.y - 5);
  sourceCtx.lineTo(catSkeleton.neckEnd.x, catSkeleton.neckEnd.y);
  sourceCtx.stroke();
  
  // Head circle
  sourceCtx.fillStyle = '#000000';
  sourceCtx.beginPath();
  sourceCtx.arc(catSkeleton.head.x, catSkeleton.head.y, 10.5, 0, 2 * Math.PI);
  sourceCtx.fill();
  
  // Muzzle protrusion
  const dirX = catSkeleton.head.x - catSkeleton.neckEnd.x;
  const dirY = catSkeleton.head.y - catSkeleton.neckEnd.y;
  const dirLen = Math.sqrt(dirX*dirX + dirY*dirY);
  const ndx = dirX / dirLen;
  const ndy = dirY / dirLen;
  
  sourceCtx.beginPath();
  sourceCtx.arc(catSkeleton.head.x + ndx * 5, catSkeleton.head.y + ndy * 2, 6, 0, 2 * Math.PI);
  sourceCtx.fill();
  
  // Ears (triangles)
  const drawEar = (offsetAngle) => {
    const headAngle = Math.atan2(dirY, dirX);
    const earBaseX = catSkeleton.head.x + 8 * Math.cos(headAngle + offsetAngle);
    const earBaseY = catSkeleton.head.y + 8 * Math.sin(headAngle + offsetAngle);
    
    // Ear tip pointing upwards/forward
    const tipX = earBaseX + 11 * Math.cos(headAngle - 0.7);
    const tipY = earBaseY + 11 * Math.sin(headAngle - 0.7);
    
    const sideX = earBaseX + 6 * Math.cos(headAngle - 1.8);
    const sideY = earBaseY + 6 * Math.sin(headAngle - 1.8);
    
    // Outline ear
    sourceCtx.fillStyle = '#ffffff';
    sourceCtx.beginPath();
    sourceCtx.moveTo(earBaseX, earBaseY);
    sourceCtx.lineTo(tipX, tipY);
    sourceCtx.lineTo(sideX, sideY);
    sourceCtx.closePath();
    sourceCtx.fill();
    
    sourceCtx.fillStyle = '#000000';
    sourceCtx.beginPath();
    sourceCtx.moveTo(earBaseX + ndx, earBaseY + ndy);
    sourceCtx.lineTo(tipX - ndx, tipY - ndy);
    sourceCtx.lineTo(sideX + ndx, sideY + ndy);
    sourceCtx.closePath();
    sourceCtx.fill();
  };
  drawEar(-1.4); // Back ear
  drawEar(-0.9); // Front ear
  
  // 5. Draw Near Legs (Right Side)
  drawLimb(catSkeleton.hips, legs.backRight.knee, legs.backRight.paw, true);
  drawLimb(catSkeleton.shoulders, legs.frontRight.elbow, legs.frontRight.paw, false);
  
  // 6. Glowing Eye (yellow glowing pixel)
  sourceCtx.fillStyle = '#ffd700';
  sourceCtx.beginPath();
  sourceCtx.arc(catSkeleton.head.x + ndx * 5 - ndy * 3, catSkeleton.head.y + ndy * 5 + ndx * 3 - 3, 2, 0, 2 * Math.PI);
  sourceCtx.fill();
}

// --- VIDEO INPUT PROCESSOR ---
function drawVideoFrame() {
  const w = DOM.sourceCanvas.width;
  const h = DOM.sourceCanvas.height;
  
  if (DOM.hiddenVideo.paused || DOM.hiddenVideo.ended) return;
  
  // Draw video scaled to canvas size
  sourceCtx.drawImage(DOM.hiddenVideo, 0, 0, w, h);
}

// --- REAL-TIME ASCII RENDERER ---
function renderAscii() {
  const startCompute = performance.now();
  
  // 1. Resize hidden offscreen canvas to target columns/rows (downsampling)
  const cols = State.cols;
  const rows = State.rows;
  
  offscreenCanvas.width = cols;
  offscreenCanvas.height = rows;
  
  // Draw scaled down frame
  offscreenCtx.drawImage(DOM.sourceCanvas, 0, 0, cols, rows);
  
  // Extract pixels
  const imgData = offscreenCtx.getImageData(0, 0, cols, rows);
  const pixels = imgData.data;
  
  // 2. Clear ASCII renderer canvas
  const canvasW = DOM.asciiCanvas.width;
  const canvasH = DOM.asciiCanvas.height;
  
  // Retrieve CSS themed variables
  const monitorBg = getComputedStyle(document.body).getPropertyValue('--monitor-bg').trim();
  const monitorFg = getComputedStyle(document.body).getPropertyValue('--monitor-fg').trim();
  
  asciiCtx.fillStyle = monitorBg;
  asciiCtx.fillRect(0, 0, canvasW, canvasH);
  
  // Font parameters
  const cellW = canvasW / cols;
  const cellH = canvasH / rows;
  
  // Match font size exactly
  asciiCtx.font = `bold ${State.fontSize}px "JetBrains Mono", var(--font-mono)`;
  asciiCtx.textAlign = 'center';
  asciiCtx.textBaseline = 'middle';
  
  // ASCII loop mapping
  const chars = State.charSet;
  const charLength = chars.length;
  const contrast = State.contrast;
  const threshold = State.threshold;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4;
      const red = pixels[idx];
      const green = pixels[idx + 1];
      const blue = pixels[idx + 2];
      
      // Calculate luminance (Luma Rec. 709)
      let luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      
      // Apply contrast curve
      luma = ((luma - 128) * contrast) + 128;
      
      // Binarize near the threshold for extra crisp silhouettes if requested
      if (Math.abs(luma - threshold) < 30) {
        luma = luma > threshold ? 255 : 0;
      } else {
        luma = Math.max(0, Math.min(255, luma));
      }
      
      // Map to character indices
      let charIdx = Math.floor((luma / 255) * (charLength - 1));
      
      // Handle color schemes inversion
      if (State.invert) {
        charIdx = charLength - 1 - charIdx;
      }
      
      const character = chars[charIdx];
      
      // Determine pixel color for canvas draw
      // In high-contrast (B&W) or standard monochrome, use monitor themes
      asciiCtx.fillStyle = monitorFg;
      
      // Draw character
      const px = c * cellW + cellW / 2;
      const py = r * cellH + cellH / 2;
      
      if (character !== ' ') {
        asciiCtx.fillText(character, px, py);
      }
    }
  }
  
  // Calculate computation latency
  const endCompute = performance.now();
  State.computeLatency = (endCompute - startCompute).toFixed(1);
}

// --- ANIMATION / MAIN CYCLE ---
function tick(timestamp) {
  if (!State.lastFrameTime) State.lastFrameTime = timestamp;
  let elapsed = (timestamp - State.lastFrameTime) / 1000;
  State.lastFrameTime = timestamp;
  
  // Handle frame-rate stats
  State.fps = Math.round(1 / elapsed);
  if (isNaN(State.fps) || !isFinite(State.fps)) State.fps = 60;
  
  if (State.isPlaying) {
    // Tick time with speed multiplier (slow-mo dynamic time warping)
    State.time += elapsed * State.speedMultiplier;
    
    // Update vector physics / skeletal positions
    if (State.sourceType === 'cat') {
      catSkeleton.update(State.time, State.gait, DOM.sourceCanvas.width, DOM.sourceCanvas.height);
      updateParticles();
      drawSourceFrame();
    } else if (State.sourceType === 'video') {
      drawVideoFrame();
    }
    
    // Convert to monospaced ASCII canvas
    renderAscii();
    updateTelemetry();
  }
  
  requestAnimationFrame(tick);
}

// Update DOM Telemetry Panel
function updateTelemetry() {
  DOM.teleFps.textContent = `${State.fps.toFixed(1)} fps`;
  DOM.teleLatency.textContent = `${State.computeLatency} ms`;
  
  if (State.sourceType === 'cat') {
    DOM.teleGait.textContent = `${State.gait.frequency.toFixed(1)} Hz`;
    const speed = (State.gait.frequency * State.gait.strideLength * State.speedMultiplier).toFixed(1);
    DOM.teleSpeed.textContent = `${speed} px/s`;
  } else {
    DOM.teleGait.textContent = 'N/A';
    DOM.teleSpeed.textContent = 'VIDEO';
  }
}

// Single step forward frame
function stepForward() {
  if (State.isPlaying) {
    togglePlayState(false);
  }
  // Step slightly ahead
  State.time += 0.033; // ~1 frame at 30fps
  if (State.sourceType === 'cat') {
    catSkeleton.update(State.time, State.gait, DOM.sourceCanvas.width, DOM.sourceCanvas.height);
    updateParticles();
    drawSourceFrame();
  } else if (State.sourceType === 'video') {
    // If video is loaded, step video
    if (DOM.hiddenVideo.readyState >= 2) {
      DOM.hiddenVideo.currentTime = (DOM.hiddenVideo.currentTime + 0.033) % DOM.hiddenVideo.duration;
      drawVideoFrame();
    }
  }
  renderAscii();
  updateTelemetry();
}

function togglePlayState(play) {
  State.isPlaying = play !== undefined ? play : !State.isPlaying;
  
  if (State.isPlaying) {
    DOM.btnPlay.classList.add('playing');
    DOM.btnPlay.querySelector('.play-icon').classList.add('hidden');
    DOM.btnPlay.querySelector('.pause-icon').classList.remove('hidden');
    DOM.statusSimulation.textContent = 'ACTIVE';
    DOM.statusSimulation.className = 'value success';
    
    if (State.sourceType === 'video') {
      DOM.hiddenVideo.play();
    }
  } else {
    DOM.btnPlay.classList.remove('playing');
    DOM.btnPlay.querySelector('.play-icon').classList.remove('hidden');
    DOM.btnPlay.querySelector('.pause-icon').classList.add('hidden');
    DOM.statusSimulation.textContent = 'PAUSED';
    DOM.statusSimulation.className = 'value error';
    
    if (State.sourceType === 'video') {
      DOM.hiddenVideo.pause();
    }
  }
}

// --- EVENT HANDLERS & LISTENERS ---
function initEvents() {
  // Playback handlers
  DOM.btnPlay.addEventListener('click', () => togglePlayState());
  DOM.btnStep.addEventListener('click', stepForward);
  
  // Speed slider
  DOM.sliderSpeed.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    State.speedMultiplier = val;
    DOM.valSpeed.textContent = `${val.toFixed(2)}x`;
    
    // Deactivate speed preset buttons
    DOM.speedPresetBtns.forEach(btn => btn.classList.remove('active'));
    // Reactivate if it matches exactly
    const match = Array.from(DOM.speedPresetBtns).find(btn => parseFloat(btn.dataset.speed) === val);
    if (match) match.classList.add('active');
  });
  
  // Speed Presets
  DOM.speedPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.speedPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = parseFloat(btn.dataset.speed);
      State.speedMultiplier = val;
      DOM.sliderSpeed.value = val;
      DOM.valSpeed.textContent = `${val.toFixed(2)}x`;
    });
  });
  
  // Resolution sliders
  DOM.sliderCols.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    State.cols = val;
    DOM.valCols.textContent = val;
    renderAscii();
  });
  
  DOM.sliderRows.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    State.rows = val;
    DOM.valRows.textContent = val;
    renderAscii();
  });
  
  DOM.sliderFontSize.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    State.fontSize = val;
    DOM.valFontSize.textContent = `${val}px`;
    renderAscii();
  });
  
  // Luminance & Contrast
  DOM.sliderThreshold.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    State.threshold = val;
    DOM.valThreshold.textContent = val;
    renderAscii();
  });
  
  DOM.sliderContrast.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    State.contrast = val;
    DOM.valContrast.textContent = val.toFixed(1);
    renderAscii();
  });
  
  DOM.checkInvert.addEventListener('change', (e) => {
    State.invert = e.target.checked;
    renderAscii();
  });
  
  // Badges toggles
  DOM.toggleScanlines.addEventListener('click', () => {
    DOM.toggleScanlines.classList.toggle('active');
    DOM.crtScreen.querySelector('.crt-scanlines').classList.toggle('hidden');
  });
  
  DOM.toggleFlicker.addEventListener('click', () => {
    DOM.toggleFlicker.classList.toggle('active');
    DOM.crtScreen.classList.toggle('flicker');
  });
  
  DOM.toggleOverlay.addEventListener('click', () => {
    DOM.toggleOverlay.classList.toggle('active');
    DOM.originalOverlay.classList.toggle('hidden');
    State.showOriginalOverlay = !DOM.originalOverlay.classList.contains('hidden');
  });
  
  // Preset Gait selection
  DOM.presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const presetKey = btn.dataset.preset;
      State.activePreset = presetKey;
      State.gait = { ...GAIT_PRESETS[presetKey] };
      State.sourceType = 'cat';
      
      // Stop video if running
      DOM.hiddenVideo.pause();
      DOM.videoPreviewContainer.classList.add('hidden');
      DOM.uploadDropzone.classList.remove('hidden');
      
      DOM.statusSimulation.textContent = 'ACTIVE';
      DOM.statusSimulation.className = 'value success';
      
      // Restore layout visual indicators
      DOM.statusRenderer.textContent = 'MONOSPACED_CANVAS';
      
      // Resume play loop
      togglePlayState(true);
    });
  });
  
  // Character Sets
  DOM.charBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.charBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const charKey = btn.dataset.set;
      State.charSetKey = charKey;
      State.charSet = CHAR_SETS[charKey];
      DOM.inputCustomChars.value = State.charSet;
      renderAscii();
    });
  });
  
  DOM.inputCustomChars.addEventListener('input', (e) => {
    DOM.charBtns.forEach(b => b.classList.remove('active'));
    State.charSetKey = 'custom';
    State.charSet = e.target.value || ' ';
    renderAscii();
  });
  
  // Theme styling buttons
  DOM.themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const selectedTheme = btn.dataset.theme;
      State.theme = selectedTheme;
      document.body.setAttribute('data-theme', selectedTheme);
      
      // Invert toggle sync based on theme style
      // Monochrome B&W requires high-contrast threshold inversion
      if (selectedTheme === 'high-contrast') {
        DOM.checkInvert.checked = true;
        State.invert = true;
      } else {
        DOM.checkInvert.checked = false;
        State.invert = false;
      }
      renderAscii();
    });
  });
  
  // Clipboard Copy Frame export
  DOM.btnExportFrame.addEventListener('click', copyFrameToClipboard);
  DOM.btnExportLoop.addEventListener('click', downloadAsciiLoop);
  
  // Video Drag and Drop upload
  DOM.uploadDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.uploadDropzone.classList.add('dragover');
  });
  
  DOM.uploadDropzone.addEventListener('dragleave', () => {
    DOM.uploadDropzone.classList.remove('dragover');
  });
  
  DOM.uploadDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.uploadDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadUploadedVideo(e.dataTransfer.files[0]);
    }
  });
  
  DOM.videoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      loadUploadedVideo(e.target.files[0]);
    }
  });
  
  DOM.btnRemoveVideo.addEventListener('click', () => {
    DOM.hiddenVideo.pause();
    DOM.hiddenVideo.src = '';
    DOM.videoPreviewContainer.classList.add('hidden');
    DOM.uploadDropzone.classList.remove('hidden');
    
    // Fallback back to cat presets
    document.getElementById('preset-sprint').click();
  });
}

// Load external video source file
function loadUploadedVideo(file) {
  const url = URL.createObjectURL(file);
  DOM.hiddenVideo.src = url;
  DOM.videoFilename.textContent = file.name;
  
  DOM.uploadDropzone.classList.add('hidden');
  DOM.videoPreviewContainer.classList.remove('hidden');
  
  DOM.presetBtns.forEach(b => b.classList.remove('active'));
  State.sourceType = 'video';
  DOM.statusRenderer.textContent = 'VIDEO_TRANSCODER';
  
  // Once loaded, play
  DOM.hiddenVideo.addEventListener('loadeddata', () => {
    togglePlayState(true);
  }, { once: true });
}

// Copy ASCII Frame to Clipboard as raw text
function copyFrameToClipboard() {
  // Run a quick capture of the character grid from offscreen canvas
  offscreenCanvas.width = State.cols;
  offscreenCanvas.height = State.rows;
  offscreenCtx.drawImage(DOM.sourceCanvas, 0, 0, State.cols, State.rows);
  
  const imgData = offscreenCtx.getImageData(0, 0, State.cols, State.rows);
  const pixels = imgData.data;
  
  let asciiText = '';
  const chars = State.charSet;
  const charLength = chars.length;
  
  for (let r = 0; r < State.rows; r++) {
    for (let c = 0; c < State.cols; c++) {
      const idx = (r * State.cols + c) * 4;
      const red = pixels[idx];
      const green = pixels[idx+1];
      const blue = pixels[idx+2];
      
      let luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      luma = ((luma - 128) * State.contrast) + 128;
      
      if (Math.abs(luma - State.threshold) < 30) {
        luma = luma > State.threshold ? 255 : 0;
      } else {
        luma = Math.max(0, Math.min(255, luma));
      }
      
      let charIdx = Math.floor((luma / 255) * (charLength - 1));
      if (State.invert) {
        charIdx = charLength - 1 - charIdx;
      }
      asciiText += chars[charIdx];
    }
    asciiText += '\n';
  }
  
  navigator.clipboard.writeText(asciiText)
    .then(() => {
      // Temporary button state change feedback
      const originalText = DOM.btnExportFrame.textContent;
      DOM.btnExportFrame.textContent = 'COPIED TO CLIPBOARD!';
      DOM.btnExportFrame.style.color = 'var(--color-success)';
      DOM.btnExportFrame.style.borderColor = 'var(--color-success)';
      
      setTimeout(() => {
        DOM.btnExportFrame.textContent = originalText;
        DOM.btnExportFrame.style.color = '';
        DOM.btnExportFrame.style.borderColor = '';
      }, 1800);
    })
    .catch(err => {
      console.error('Failed to copy frame', err);
    });
}

// Download 10-second loop as HTML animated document
function downloadAsciiLoop() {
  const originalText = DOM.btnExportLoop.textContent;
  DOM.btnExportLoop.textContent = 'GENERATING LOOP...';
  DOM.btnExportLoop.disabled = true;

  // Let's generate a list of ASCII frames for the 10-second loop
  // Sprint has ~3.2 Hz frequency, so 1 cycle is 1 / 3.2 = 0.3125 seconds.
  // A 10-second loop is perfect. We can sample at 30 fps (300 frames).
  const totalFrames = 300;
  const fps = 30;
  const stepTime = 1 / fps;
  const frames = [];

  const oldTime = State.time;
  const oldPlaying = State.isPlaying;
  
  // Pause simulation loop temporarily to do sync frame render captures
  State.isPlaying = false;
  
  // Generate frames
  for (let f = 0; f < totalFrames; f++) {
    const renderTime = f * stepTime;
    
    // Simulate cat
    if (State.sourceType === 'cat') {
      catSkeleton.update(renderTime, State.gait, DOM.sourceCanvas.width, DOM.sourceCanvas.height);
      // Spawn/update particles deterministically
      State.particles = State.particles.filter(p => p.life > 0.05);
      State.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy += 0.04;
        p.life -= p.decay;
        p.alpha = Math.max(0, p.life);
      });
      // Foot hit particles trigger points
      const cyclePhase = renderTime * State.gait.frequency * 2 * Math.PI;
      const basePhase = cyclePhase % (2 * Math.PI);
      if (Math.abs(basePhase - Math.PI) < 0.2 && Math.random() < 0.25) {
        // Spawn dust at takeoff
        const leg = catSkeleton.legs.backLeft;
        spawnDust(leg.paw.x, leg.paw.y);
      }
      drawSourceFrame();
    } else {
      // For video, draw current video frame if possible, else empty frames
      drawVideoFrame();
    }
    
    // Render to offscreen canvas
    offscreenCanvas.width = State.cols;
    offscreenCanvas.height = State.rows;
    offscreenCtx.drawImage(DOM.sourceCanvas, 0, 0, State.cols, State.rows);
    const imgData = offscreenCtx.getImageData(0, 0, State.cols, State.rows);
    const pixels = imgData.data;
    
    let frameText = '';
    const chars = State.charSet;
    const charLength = chars.length;
    
    for (let r = 0; r < State.rows; r++) {
      for (let c = 0; c < State.cols; c++) {
        const idx = (r * State.cols + c) * 4;
        const red = pixels[idx];
        const green = pixels[idx+1];
        const blue = pixels[idx+2];
        
        let luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        luma = ((luma - 128) * State.contrast) + 128;
        
        if (Math.abs(luma - State.threshold) < 30) {
          luma = luma > State.threshold ? 255 : 0;
        } else {
          luma = Math.max(0, Math.min(255, luma));
        }
        
        let charIdx = Math.floor((luma / 255) * (charLength - 1));
        if (State.invert) {
          charIdx = charLength - 1 - charIdx;
        }
        frameText += chars[charIdx];
      }
      frameText += '\n';
    }
    frames.push(frameText);
  }
  
  // Restore simulation
  State.time = oldTime;
  togglePlayState(oldPlaying);
  
  // Package as a beautiful single self-contained HTML document that plays the loop!
  const monitorBg = getComputedStyle(document.body).getPropertyValue('--monitor-bg').trim();
  const monitorFg = getComputedStyle(document.body).getPropertyValue('--monitor-fg').trim();
  
  const htmlOutput = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AsciiCat Animation Loop</title>
  <style>
    body {
      background-color: ${monitorBg === '#ffffff' ? '#111' : monitorBg};
      color: ${monitorFg};
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 11px;
      line-height: 1.15;
      font-weight: bold;
      overflow: hidden;
    }
    .screen-container {
      background-color: ${monitorBg};
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
      border: 6px solid #222;
      position: relative;
    }
    pre {
      margin: 0;
      color: ${monitorFg};
    }
    .watermark {
      position: absolute;
      bottom: 6px;
      right: 15px;
      font-size: 8px;
      color: #94a3b8;
      text-transform: uppercase;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="screen-container">
    <pre id="display"></pre>
    <div class="watermark">AsciiCat Studio Output</div>
  </div>
  <script>
    const frames = ${JSON.stringify(frames)};
    let currentFrame = 0;
    const display = document.getElementById('display');
    
    function animate() {
      display.textContent = frames[currentFrame];
      currentFrame = (currentFrame + 1) % frames.length;
    }
    
    setInterval(animate, 1000 / ${fps});
  <\/script>
</body>
</html>`;

  // Trigger download
  const blob = new Blob([htmlOutput], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `asciicat_sprint_loop_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  DOM.btnExportLoop.textContent = originalText;
  DOM.btnExportLoop.disabled = false;
}

// --- VIEWPORT DYNAMIC SCALING & INITIALIZATION ---
function resizeCanvases() {
  // Source vector canvas high-res layout (for sharp rendering detail before scaling)
  DOM.sourceCanvas.width = 640;
  DOM.sourceCanvas.height = 360;
  
  // ASCII renderer canvas size (monospaced grid output matches container dimensions)
  const rect = DOM.crtScreen.getBoundingClientRect();
  DOM.asciiCanvas.width = rect.width;
  DOM.asciiCanvas.height = rect.height;
  
  renderAscii();
}

function init() {
  initEvents();
  
  // Set default body theme attribute
  document.body.setAttribute('data-theme', State.theme);
  
  // Handle layout resizing
  window.addEventListener('resize', resizeCanvases);
  setTimeout(resizeCanvases, 100);
  
  // Start drawing and simulator clocks
  DOM.crtScreen.classList.add('flicker'); // start flickering crt effect
  togglePlayState(true);
  requestAnimationFrame(tick);
}

// Bootstrap
window.addEventListener('DOMContentLoaded', init);
