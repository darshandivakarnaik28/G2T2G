/**
 * ISL Dataset Collector - Main Application Logic
 * Comprehensive implementation for Static & Dynamic Gesture Workflows
 */

// Initial Dataset
const DEFAULT_GESTURES = [
  {
    id: "ISL-001",
    name: "Water",
    kannada: "ನೀರು",
    type: "static",
    hands: "one",
    description: "Cupped hand brought near mouth or thumb touches chin.",
    verified: true,
    modelFile: "water_pose_001.glb",
    modelStatus: "Ready",
    samplesCount: 42,
    signersCount: 4,
    signers: {
      "Signer 001": [
        { id: "smp-101", type: "Image", source: "Upload (PNG)", date: "2024-05-10 14:20", quality: "Accepted", conf: 98 },
        { id: "smp-102", type: "Pose", source: "Webcam Capture", date: "2024-05-10 14:35", quality: "Accepted", conf: 96 },
        { id: "smp-103", type: "Image", source: "Upload (JPG)", date: "2024-05-11 10:15", quality: "Accepted", conf: 95 }
      ],
      "Signer 002": [
        { id: "smp-104", type: "Pose", source: "Webcam Capture", date: "2024-05-12 11:40", quality: "Accepted", conf: 97 },
        { id: "smp-105", type: "Image", source: "Upload (WEBP)", date: "2024-05-13 16:05", quality: "Accepted", conf: 94 }
      ],
      "Signer 003": [
        { id: "smp-106", type: "Pose", source: "Webcam Capture", date: "2024-05-14 09:20", quality: "Accepted", conf: 96 }
      ],
      "Signer 004": [
        { id: "smp-107", type: "Image", source: "Upload (PNG)", date: "2024-05-15 15:30", quality: "Accepted", conf: 95 }
      ]
    },
    quality: { confidence: 96.2, completeness: 98, signerVariance: "Low" }
  },
  {
    id: "ISL-002",
    name: "Hello",
    kannada: "ನಮಸ್ಕಾರ",
    type: "dynamic",
    hands: "one",
    description: "Open palm waves side to side or hand touches forehead and sweeps outward.",
    verified: true,
    modelFile: "hello_animation_001.glb",
    modelStatus: "Ready",
    samplesCount: 38,
    signersCount: 3,
    signers: {
      "Signer 001": [
        { id: "smp-201", type: "Video", source: "Webcam (3.2s)", date: "2024-05-16 11:20", quality: "Accepted", conf: 95 },
        { id: "smp-202", type: "Video", source: "Upload (MP4)", date: "2024-05-16 12:45", quality: "Accepted", conf: 93 }
      ],
      "Signer 002": [
        { id: "smp-203", type: "Video", source: "Webcam (4.0s)", date: "2024-05-17 14:10", quality: "Accepted", conf: 96 }
      ],
      "Signer 003": [
        { id: "smp-204", type: "Video", source: "Webcam (2.8s)", date: "2024-05-18 16:30", quality: "Accepted", conf: 92 }
      ]
    },
    quality: { confidence: 94.5, completeness: 95, signerVariance: "Medium" }
  },
  {
    id: "ISL-003",
    name: "Thank You",
    kannada: "ಧನ್ಯವಾದಗಳು",
    type: "dynamic",
    hands: "one",
    description: "Flat hand fingers touching chin and moving forward and down towards the recipient.",
    verified: true,
    modelFile: "thankyou_animation_001.glb",
    modelStatus: "Ready",
    samplesCount: 29,
    signersCount: 3,
    signers: {
      "Signer 001": [
        { id: "smp-301", type: "Video", source: "Webcam (3.5s)", date: "2024-05-19 10:15", quality: "Accepted", conf: 97 }
      ],
      "Signer 008": [
        { id: "smp-302", type: "Video", source: "Webcam (3.1s)", date: "2024-05-19 14:20", quality: "Accepted", conf: 95 }
      ]
    },
    quality: { confidence: 96.0, completeness: 97, signerVariance: "Low" }
  },
  {
    id: "ISL-004",
    name: "Food",
    kannada: "ಊಟ",
    type: "static",
    hands: "one",
    description: "Fingertips brought together facing the mouth in eating gesture.",
    verified: true,
    modelFile: "food_pose_001.glb",
    modelStatus: "Ready",
    samplesCount: 35,
    signersCount: 4,
    signers: {
      "Signer 001": [
        { id: "smp-401", type: "Pose", source: "Webcam Capture", date: "2024-05-20 09:30", quality: "Accepted", conf: 97 }
      ]
    },
    quality: { confidence: 95.8, completeness: 96, signerVariance: "Low" }
  },
  {
    id: "ISL-005",
    name: "Help",
    kannada: "ಸಹಾಯ",
    type: "dynamic",
    hands: "two",
    description: "Fist with thumb upright placed onto flat open palm of other hand and raised together.",
    verified: false,
    modelFile: "help_animation_001.glb",
    modelStatus: "In Review",
    samplesCount: 18,
    signersCount: 2,
    signers: {
      "Signer 002": [
        { id: "smp-501", type: "Video", source: "Webcam (4.2s)", date: "2024-05-21 15:45", quality: "Review", conf: 89 }
      ]
    },
    quality: { confidence: 89.4, completeness: 90, signerVariance: "High" }
  },
  {
    id: "ISL-006",
    name: "Book",
    kannada: "ಪುಸ್ತಕ",
    type: "static",
    hands: "two",
    description: "Palms together side by side opening outward like opening the pages of a book.",
    verified: true,
    modelFile: "book_pose_001.glb",
    modelStatus: "Ready",
    samplesCount: 26,
    signersCount: 3,
    signers: {
      "Signer 003": [
        { id: "smp-601", type: "Pose", source: "Webcam Capture", date: "2024-05-22 13:10", quality: "Accepted", conf: 96 }
      ]
    },
    quality: { confidence: 96.5, completeness: 98, signerVariance: "Low" }
  }
];

class DatasetStore {
  constructor() {
    const saved = localStorage.getItem("isl_dataset_gestures");
    this.gestures = saved ? JSON.parse(saved) : DEFAULT_GESTURES;
  }

  save() {
    localStorage.setItem("isl_dataset_gestures", JSON.stringify(this.gestures));
  }

  getAll() {
    return this.gestures;
  }

  getById(id) {
    return this.gestures.find(g => g.id === id);
  }

  addGesture(gesture) {
    this.gestures.unshift(gesture);
    this.save();
  }

  addSample(gestureId, signerName, sample) {
    const gesture = this.getById(gestureId);
    if (!gesture) return;
    if (!gesture.signers[signerName]) {
      gesture.signers[signerName] = [];
      gesture.signersCount++;
    }
    gesture.signers[signerName].unshift(sample);
    gesture.samplesCount++;
    this.save();
  }

  getStats() {
    const totalGestures = this.gestures.length;
    const verified = this.gestures.filter(g => g.verified).length;
    const staticCount = this.gestures.filter(g => g.type === "static").length;
    const dynamicCount = this.gestures.filter(g => g.type === "dynamic").length;
    let totalSamples = 0;
    const signersSet = new Set();
    this.gestures.forEach(g => {
      totalSamples += g.samplesCount || 0;
      Object.keys(g.signers || {}).forEach(s => signersSet.add(s));
    });
    return {
      totalGestures,
      verified,
      totalSamples,
      signers: signersSet.size || 8,
      staticCount,
      dynamicCount
    };
  }

  getRecentSamples(limit = 6) {
    const list = [];
    this.gestures.forEach(g => {
      Object.entries(g.signers || {}).forEach(([signer, samples]) => {
        samples.forEach(s => {
          list.push({
            gestureId: g.id,
            gestureName: g.name,
            gestureKannada: g.kannada,
            gestureType: g.type,
            hands: g.hands,
            signer,
            source: s.source,
            type: s.type,
            date: s.date,
            quality: s.quality,
            conf: s.conf
          });
        });
      });
    });
    return list.slice(0, limit);
  }
}

const store = new DatasetStore();

// ==========================================
// 3D Articulated Hand Engine (Three.js)
// ==========================================
class ThreeHandViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.handGroup = null;
    this.joints = [];
    this.bones = [];
    this.isDynamic = false;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 4.0;
    this.playbackSpeed = 1.0;
    this.animFrameId = null;

    // Orbit drag state
    this.isDragging = false;
    this.prevMousePos = { x: 0, y: 0 };
    this.rotation = { x: 0.2, y: -0.3 };
    this.zoom = 28;

    this.initScene();
  }

  initScene() {
    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 420;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xc0c1ff, 1.2);
    dirLight1.position.set(20, 40, 30);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x6366f1, 0.8);
    dirLight2.position.set(-20, -20, -20);
    this.scene.add(dirLight2);

    // Floor grid
    const grid = new THREE.GridHelper(30, 20, 0x334155, 0x1e293b);
    grid.position.y = -8;
    this.scene.add(grid);

    this.buildHandRig();
    this.setupInteractions();
    this.animate();

    window.addEventListener("resize", () => this.onResize());
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width && height) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }

  updateCameraPosition() {
    const r = this.zoom;
    const phi = Math.PI / 2 - this.rotation.x;
    const theta = this.rotation.y;
    this.camera.position.x = r * Math.sin(phi) * Math.sin(theta);
    this.camera.position.y = r * Math.cos(phi);
    this.camera.position.z = r * Math.sin(phi) * Math.cos(theta);
    this.camera.lookAt(0, 0, 0);
  }

  setupInteractions() {
    const dom = this.renderer.domElement;

    dom.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.prevMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMousePos.x;
      const dy = e.clientY - this.prevMousePos.y;
      this.rotation.y += dx * 0.01;
      this.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.rotation.x + dy * 0.01));
      this.prevMousePos = { x: e.clientX, y: e.clientY };
      this.updateCameraPosition();
    });

    window.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.max(12, Math.min(60, this.zoom + e.deltaY * 0.04));
      this.updateCameraPosition();
    }, { passive: false });

    // Touch support for mobile/tablets
    let touchStart = { x: 0, y: 0 };
    dom.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });
    dom.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStart.x;
        const dy = e.touches[0].clientY - touchStart.y;
        this.rotation.y += dx * 0.01;
        this.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.rotation.x + dy * 0.01));
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.updateCameraPosition();
      }
    });
  }

  buildHandRig() {
    this.handGroup = new THREE.Group();
    this.scene.add(this.handGroup);

    this.jointNodes = [];
    const jointGeo = new THREE.SphereGeometry(0.42, 16, 16);
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0xc0c1ff,
      emissive: 0x2f3aa3,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.5
    });

    // Base landmark template positions (MediaPipe 21 Hand Landmarks format)
    const baseCoords = [
      [0, -5, 0],        // 0: Wrist
      // Thumb
      [-2.4, -3.8, 0.8], // 1: CMC
      [-3.8, -2.2, 1.4], // 2: MCP
      [-4.5, -0.6, 1.8], // 3: IP
      [-5.0, 1.0, 2.0],  // 4: TIP
      // Index
      [-1.8, -1.2, 0.5], // 5: MCP
      [-2.2, 1.4, 0.8],  // 6: PIP
      [-2.4, 3.4, 0.9],  // 7: DIP
      [-2.5, 5.2, 1.0],  // 8: TIP
      // Middle
      [-0.2, -0.9, 0.2], // 9: MCP
      [-0.3, 1.9, 0.4],  // 10: PIP
      [-0.3, 4.2, 0.5],  // 11: DIP
      [-0.3, 6.2, 0.6],  // 12: TIP
      // Ring
      [1.4, -1.1, 0.0],  // 13: MCP
      [1.7, 1.5, 0.1],   // 14: PIP
      [1.9, 3.7, 0.2],   // 15: DIP
      [2.0, 5.5, 0.3],   // 16: TIP
      // Pinky
      [3.0, -1.5, -0.3], // 17: MCP
      [3.6, 0.7, -0.3],  // 18: PIP
      [4.0, 2.3, -0.2],  // 19: DIP
      [4.3, 3.9, -0.2]   // 20: TIP
    ];

    this.landmarkBase = baseCoords.map(c => new THREE.Vector3(...c));

    for (let i = 0; i < 21; i++) {
      const mesh = new THREE.Mesh(jointGeo, jointMat);
      mesh.position.copy(this.landmarkBase[i]);
      this.handGroup.add(mesh);
      this.jointNodes.push(mesh);
    }

    // Connective bones (cylinder links)
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17] // Palm bridge
    ];

    this.boneMeshes = [];
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.3,
      metalness: 0.7,
      transparent: true,
      opacity: 0.85
    });

    connections.forEach(([fromIdx, toIdx]) => {
      const p1 = this.landmarkBase[fromIdx];
      const p2 = this.landmarkBase[toIdx];
      const distance = p1.distanceTo(p2);
      const boneGeo = new THREE.CylinderGeometry(0.22, 0.22, distance, 12);
      const boneMesh = new THREE.Mesh(boneGeo, boneMat);
      this.handGroup.add(boneMesh);
      this.boneMeshes.push({ mesh: boneMesh, from: fromIdx, to: toIdx });
    });

    this.updateBonePositions();
  }

  updateBonePositions() {
    this.boneMeshes.forEach(b => {
      const p1 = this.jointNodes[b.from].position;
      const p2 = this.jointNodes[b.to].position;
      const distance = p1.distanceTo(p2);

      b.mesh.scale.set(1, Math.max(0.01, distance / b.mesh.geometry.parameters.height), 1);

      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      b.mesh.position.copy(mid);

      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
      const axis = new THREE.Vector3(0, 1, 0);
      b.mesh.quaternion.setFromUnitVectors(axis, dir);
    });
  }

  setPose(poseName = "static") {
    if (poseName === "water") {
      // Cupped static hand: fingers curved inward, thumb bent
      for (let i = 5; i <= 8; i++) this.jointNodes[i].position.z = 2.4 - (i - 5) * 0.4;
      for (let i = 9; i <= 12; i++) this.jointNodes[i].position.z = 2.8 - (i - 9) * 0.5;
      for (let i = 13; i <= 16; i++) this.jointNodes[i].position.z = 2.3 - (i - 13) * 0.4;
      for (let i = 17; i <= 20; i++) this.jointNodes[i].position.z = 1.9 - (i - 17) * 0.3;
      this.jointNodes[4].position.x = -3.4;
      this.jointNodes[4].position.z = 2.6;
    } else if (poseName === "flat") {
      for (let i = 0; i < 21; i++) {
        this.jointNodes[i].position.copy(this.landmarkBase[i]);
      }
    } else {
      for (let i = 0; i < 21; i++) {
        const base = this.landmarkBase[i];
        this.jointNodes[i].position.set(base.x, base.y, base.z * 0.8 + 0.3);
      }
    }
    this.updateBonePositions();
  }

  // Camera presets
  setView(preset) {
    if (preset === "front") {
      this.rotation = { x: 0, y: 0 };
    } else if (preset === "side") {
      this.rotation = { x: 0, y: Math.PI / 2 };
    } else if (preset === "top") {
      this.rotation = { x: Math.PI / 2 - 0.05, y: 0 };
    } else {
      // Reset isometric
      this.rotation = { x: 0.2, y: -0.3 };
      this.zoom = 28;
    }
    this.updateCameraPosition();
  }

  zoomIn() {
    this.zoom = Math.max(12, this.zoom - 4);
    this.updateCameraPosition();
  }

  zoomOut() {
    this.zoom = Math.min(60, this.zoom + 4);
    this.updateCameraPosition();
  }

  // Dynamic animation playback
  play() {
    this.isPlaying = true;
  }

  pause() {
    this.isPlaying = false;
  }

  seek(timeInSec) {
    this.currentTime = Math.max(0, Math.min(this.duration, timeInSec));
    this.applyAnimationTime(this.currentTime);
  }

  setSpeed(speed) {
    this.playbackSpeed = speed;
  }

  applyAnimationTime(t) {
    if (!this.handGroup) return;
    const wave = Math.sin(t * 3.5) * 0.45;

    this.handGroup.rotation.z = wave;
    this.handGroup.position.x = Math.sin(t * 3.5) * 1.5;
    this.handGroup.position.y = Math.cos(t * 1.5) * 0.8;

    for (let i = 5; i <= 8; i++) {
      this.jointNodes[i].position.z = (this.landmarkBase[i].z) + Math.sin(t * 4 + i) * 0.8;
    }
    this.updateBonePositions();

    if (this.onTimeUpdate) {
      this.onTimeUpdate(t, this.duration);
    }
  }

  animate() {
    this.animFrameId = requestAnimationFrame(() => this.animate());

    if (this.isDynamic && this.isPlaying) {
      this.currentTime += (0.016 * this.playbackSpeed);
      if (this.currentTime >= this.duration) {
        this.currentTime = 0;
      }
      this.applyAnimationTime(this.currentTime);
    }

    if (!this.isDynamic && !this.isDragging && this.handGroup) {
      this.handGroup.rotation.y = Math.sin(Date.now() * 0.0008) * 0.08;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.renderer && this.renderer.domElement && this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}

// ==========================================
// 2D Landmark Overlay Engine
// ==========================================
class LandmarkVisualizer {
  static drawLandmarks(canvas, ctx, landmarks, options = {}) {
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (!landmarks || landmarks.length === 0) return;

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    ctx.strokeStyle = options.lineColor || "#6366F1";
    ctx.lineWidth = options.lineWidth || 3;
    ctx.shadowColor = "#c0c1ff";
    ctx.shadowBlur = 8;

    connections.forEach(([i, j]) => {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
      }
    });

    ctx.shadowBlur = 0;

    landmarks.forEach((p, idx) => {
      const cx = p.x * width;
      const cy = p.y * height;

      ctx.fillStyle = idx === 0 ? "#ffb783" : (idx % 4 === 0 ? "#10b981" : "#c0c1ff");
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    if (options.showBox) {
      let minX = width, minY = height, maxX = 0, maxY = 0;
      landmarks.forEach(p => {
        const px = p.x * width;
        const py = p.y * height;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      });

      const pad = 24;
      ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
      ctx.setLineDash([]);

      ctx.fillStyle = "#c0c1ff";
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillText(`Hand 1: ${(options.confidence || 96)}%`, minX - pad, minY - pad - 6);
    }
  }

  static generateSampleLandmarks(gestureType = "static", jitter = 0) {
    const base = [
      { x: 0.50, y: 0.82 },
      { x: 0.40, y: 0.72 }, { x: 0.34, y: 0.62 }, { x: 0.30, y: 0.54 }, { x: 0.28, y: 0.46 },
      { x: 0.44, y: 0.54 }, { x: 0.43, y: 0.42 }, { x: 0.42, y: 0.32 }, { x: 0.42, y: 0.22 },
      { x: 0.50, y: 0.53 }, { x: 0.50, y: 0.40 }, { x: 0.50, y: 0.29 }, { x: 0.50, y: 0.18 },
      { x: 0.56, y: 0.55 }, { x: 0.57, y: 0.43 }, { x: 0.58, y: 0.33 }, { x: 0.58, y: 0.24 },
      { x: 0.62, y: 0.60 }, { x: 0.64, y: 0.50 }, { x: 0.65, y: 0.42 }, { x: 0.66, y: 0.34 }
    ];

    return base.map((pt, i) => {
      const jx = (Math.random() - 0.5) * jitter;
      const jy = (Math.random() - 0.5) * jitter;
      return {
        id: i,
        x: Math.max(0.05, Math.min(0.95, pt.x + jx)),
        y: Math.max(0.05, Math.min(0.95, pt.y + jy))
      };
    });
  }
}

// ==========================================
// Application Controller
// ==========================================
class ISLDatasetApp {
  constructor() {
    this.currentView = "dashboard";
    this.staticViewer = null;
    this.dynamicViewer = null;
    this.detailsViewer = null;

    this.wizardData = {
      id: "ISL-" + Math.floor(100 + Math.random() * 900),
      name: "",
      kannada: "",
      type: "static",
      hands: "one",
      description: "",
      verified: true,
      capturedLandmarks: null,
      capturedImage: null
    };

    this.cameraStream = null;
    this.cameraAnimId = null;
    this.isRecording = false;
    this.recordDuration = 0;
    this.recordTimer = null;

    this.init();
  }

  init() {
    this.renderDashboardStats();
    this.renderRecentTable();
    this.renderGesturesCatalog();
    this.renderSamplesView();
    this.renderModelsView();
    this.bindEvents();
    this.bindNavigation();
  }

  bindNavigation() {
    const navLinks = document.querySelectorAll("[data-nav]");
    navLinks.forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const targetView = link.getAttribute("data-nav");
        this.switchView(targetView);
      });
    });
  }

  switchView(viewName) {
    this.currentView = viewName;
    const views = ["dashboard", "gestures", "collection", "samples", "models", "settings"];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        if (v === viewName) {
          el.classList.remove("hidden");
        } else {
          el.classList.add("hidden");
        }
      }
    });

    document.querySelectorAll("[data-nav]").forEach(link => {
      const isTarget = link.getAttribute("data-nav") === viewName;
      if (isTarget) {
        link.classList.add("text-primary", "border-l-4", "border-inverse-primary", "bg-secondary-container/20");
        link.classList.remove("text-on-surface-variant");
      } else {
        link.classList.remove("text-primary", "border-l-4", "border-inverse-primary", "bg-secondary-container/20");
        link.classList.add("text-on-surface-variant");
      }
    });

    if (viewName === "collection") {
      this.openAddGestureModal();
    }
  }

  renderDashboardStats() {
    const stats = store.getStats();
    const elTot = document.getElementById("stat-total-gestures");
    if (elTot) elTot.textContent = stats.totalGestures;
    const elVer = document.getElementById("stat-verified");
    if (elVer) elVer.textContent = stats.verified;
    const elSmp = document.getElementById("stat-samples");
    if (elSmp) elSmp.textContent = stats.totalSamples;
    const elSig = document.getElementById("stat-signers");
    if (elSig) elSig.textContent = stats.signers;
    const elSta = document.getElementById("stat-static");
    if (elSta) elSta.textContent = stats.staticCount;
    const elDyn = document.getElementById("stat-dynamic");
    if (elDyn) elDyn.textContent = stats.dynamicCount;
  }

  renderRecentTable() {
    const recent = store.getRecentSamples(5);
    const tbody = document.getElementById("recent-samples-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    recent.forEach(item => {
      const tr = document.createElement("tr");
      tr.className = "data-table-row hover:bg-surface-variant/30 transition-colors cursor-pointer";
      tr.onclick = () => this.openGestureDetails(item.gestureId);

      const icon = item.type === "Video" ? "videocam" : (item.source.includes("Webcam") ? "photo_camera" : "image");
      const typeBadge = item.gestureType === "static" 
        ? `<span class="px-2 py-0.5 text-[11px] rounded font-medium bg-blue-950/60 text-blue-300 border border-blue-800/40">Static</span>`
        : `<span class="px-2 py-0.5 text-[11px] rounded font-medium bg-amber-950/60 text-amber-300 border border-amber-800/40">Dynamic</span>`;

      tr.innerHTML = `
        <td class="py-4 px-6 font-medium text-on-background flex items-center gap-3">
          <div class="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary border border-outline-variant/30">
            <span class="material-symbols-outlined text-[18px]">${icon}</span>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-semibold">${item.gestureName}</span>
              <span class="text-xs text-primary font-body-sm font-normal">(${item.gestureKannada})</span>
            </div>
            <div class="text-[11px] text-outline mt-0.5">${typeBadge}</div>
          </div>
        </td>
        <td class="py-4 px-6 text-on-surface-variant">${item.source}</td>
        <td class="py-4 px-6 text-on-surface-variant font-medium">${item.signer}</td>
        <td class="py-4 px-6 text-outline text-sm">${item.date}</td>
        <td class="py-4 px-6 text-right">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full font-label-sm text-label-sm ${
            item.quality === 'Accepted' ? 'status-badge-success' : 'status-badge-review'
          }">
            ${item.quality}
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderGesturesCatalog() {
    const container = document.getElementById("gestures-catalog-grid");
    if (!container) return;

    const gestures = store.getAll();
    container.innerHTML = "";

    gestures.forEach(g => {
      const card = document.createElement("div");
      card.className = "stat-card flex flex-col justify-between hover:border-primary/60 transition-all cursor-pointer group";
      card.onclick = () => this.openGestureDetails(g.id);

      const isStatic = g.type === "static";
      const typeBadge = isStatic
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-900/30 text-blue-300 border border-blue-700/50">
            <span class="material-symbols-outlined text-[14px]">photo_camera</span> Static Pose
           </span>`
        : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-900/30 text-purple-300 border border-purple-700/50">
            <span class="material-symbols-outlined text-[14px]">videocam</span> Dynamic Motion
           </span>`;

      card.innerHTML = `
        <div>
          <div class="flex justify-between items-start mb-3">
            ${typeBadge}
            <span class="px-2 py-0.5 rounded text-[11px] font-label-sm ${g.verified ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-amber-950 text-amber-400 border border-amber-800/60'}">
              ${g.verified ? '✓ VERIFIED' : '● REVIEW'}
            </span>
          </div>
          <div class="flex items-baseline gap-2 mb-1">
            <h3 class="font-headline-md text-headline-sm font-bold text-on-background group-hover:text-primary transition-colors">${g.name}</h3>
            <span class="text-lg text-tertiary font-medium">${g.kannada}</span>
          </div>
          <p class="text-sm text-on-surface-variant line-clamp-2 mb-4">${g.description}</p>
        </div>

        <div class="pt-4 border-t border-[#334155] mt-2">
          <div class="grid grid-cols-2 gap-2 text-xs text-outline mb-4">
            <div>Hands: <span class="text-on-background font-medium capitalize">${g.hands} Hand</span></div>
            <div>Signers: <span class="text-on-background font-medium">${g.signersCount}</span></div>
            <div>Samples: <span class="text-on-background font-medium">${g.samplesCount}</span></div>
            <div>3D Asset: <span class="text-primary font-medium">${g.modelStatus}</span></div>
          </div>
          <button class="w-full py-2 px-3 rounded bg-surface-container-high hover:bg-secondary-container/30 text-primary border border-outline-variant/40 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
            <span class="material-symbols-outlined text-[16px]">visibility</span> View Details & Samples
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  renderSamplesView() {
    const tbody = document.getElementById("all-samples-tbody");
    if (!tbody) return;

    const samples = store.getRecentSamples(50);
    tbody.innerHTML = "";

    samples.forEach(s => {
      const tr = document.createElement("tr");
      tr.className = "data-table-row hover:bg-surface-variant/30 text-sm";
      tr.innerHTML = `
        <td class="py-3 px-4 font-medium text-on-background">${s.gestureName} <span class="text-xs text-primary">(${s.gestureKannada})</span></td>
        <td class="py-3 px-4 capitalize"><span class="px-2 py-0.5 rounded text-xs ${s.gestureType === 'static' ? 'bg-blue-950 text-blue-300' : 'bg-purple-950 text-purple-300'}">${s.gestureType}</span></td>
        <td class="py-3 px-4 text-on-surface-variant">${s.signer}</td>
        <td class="py-3 px-4">${s.source}</td>
        <td class="py-3 px-4 font-mono text-xs text-primary">${s.conf}%</td>
        <td class="py-3 px-4 text-outline text-xs">${s.date}</td>
        <td class="py-3 px-4 text-right">
          <span class="px-2 py-0.5 rounded-full text-xs font-label-sm ${s.quality === 'Accepted' ? 'status-badge-success' : 'status-badge-review'}">
            ${s.quality}
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderModelsView() {
    const grid = document.getElementById("models-catalog-grid");
    if (!grid) return;

    const gestures = store.getAll();
    grid.innerHTML = "";

    gestures.forEach(g => {
      const card = document.createElement("div");
      card.className = "stat-card flex flex-col justify-between hover:border-primary transition-all";
      const isStatic = g.type === "static";

      card.innerHTML = `
        <div>
          <div class="flex justify-between items-center mb-3">
            <span class="font-mono text-xs text-outline">${g.modelFile}</span>
            <span class="text-xs px-2 py-0.5 rounded bg-surface-container font-mono text-primary">${isStatic ? 'Static Pose .GLB' : 'Dynamic Anim .GLB'}</span>
          </div>
          <div class="h-32 rounded bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center relative overflow-hidden mb-3">
            <span class="material-symbols-outlined text-outline text-[54px] opacity-40">3d_rotation</span>
            <div class="absolute bottom-2 left-2 text-[10px] font-mono text-primary bg-background/80 px-2 py-0.5 rounded">
              21 Joint Rig
            </div>
          </div>
          <div class="flex items-baseline gap-2">
            <h4 class="font-bold text-on-background">${g.name}</h4>
            <span class="text-xs text-tertiary">${g.kannada}</span>
          </div>
          <p class="text-xs text-on-surface-variant mt-1">${isStatic ? 'Single frame 3D coordinate hand pose state' : 'Temporal frame-by-frame 3D skeletal movement'}</p>
        </div>
        <div class="mt-4 pt-3 border-t border-[#334155] flex justify-between items-center">
          <span class="text-xs text-emerald-400 flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px]">check_circle</span> ${g.modelStatus}
          </span>
          <button class="px-3 py-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-medium" onclick="app.openGestureDetails('${g.id}', '3d')">
            Inspect in 3D
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // ==========================================
  // Gesture Creation & Collection Wizard
  // ==========================================
  openAddGestureModal(prefillType = "static") {
    this.wizardData = {
      id: "ISL-" + Math.floor(100 + Math.random() * 900),
      name: "",
      kannada: "",
      type: prefillType,
      hands: "one",
      description: "",
      verified: true,
      capturedLandmarks: null,
      capturedImage: null
    };

    document.getElementById("wizard-step-info").classList.remove("hidden");
    document.getElementById("wizard-step-static-collection").classList.add("hidden");
    document.getElementById("wizard-step-dynamic-collection").classList.add("hidden");

    document.getElementById("wiz-gesture-id").value = this.wizardData.id;
    document.getElementById("wiz-gesture-name").value = "";
    document.getElementById("wiz-kannada-meaning").value = "";
    document.getElementById("wiz-hand-count").value = "one";
    document.getElementById("wiz-description").value = "";

    this.selectWizardType(prefillType);
    document.getElementById("add-gesture-modal").classList.remove("hidden");
  }

  closeAddGestureModal() {
    this.stopCameraFeed();
    if (this.staticViewer) this.staticViewer.destroy();
    if (this.dynamicViewer) this.dynamicViewer.destroy();
    document.getElementById("add-gesture-modal").classList.add("hidden");
  }

  selectWizardType(type) {
    this.wizardData.type = type;
    const staticCard = document.getElementById("wiz-type-card-static");
    const dynamicCard = document.getElementById("wiz-type-card-dynamic");

    if (type === "static") {
      staticCard.classList.add("border-primary", "bg-secondary-container/20", "ring-1", "ring-primary");
      staticCard.classList.remove("border-[#334155]", "bg-surface-container");
      dynamicCard.classList.remove("border-primary", "bg-secondary-container/20", "ring-1", "ring-primary");
      dynamicCard.classList.add("border-[#334155]", "bg-surface-container");
    } else {
      dynamicCard.classList.add("border-primary", "bg-secondary-container/20", "ring-1", "ring-primary");
      dynamicCard.classList.remove("border-[#334155]", "bg-surface-container");
      staticCard.classList.remove("border-primary", "bg-secondary-container/20", "ring-1", "ring-primary");
      staticCard.classList.add("border-[#334155]", "bg-surface-container");
    }
  }

  goToCollectionStep() {
    const name = document.getElementById("wiz-gesture-name").value.trim();
    if (!name) {
      alert("Please enter a gesture name (e.g. Water).");
      return;
    }

    this.wizardData.name = name;
    this.wizardData.kannada = document.getElementById("wiz-kannada-meaning").value.trim() || name;
    this.wizardData.hands = document.getElementById("wiz-hand-count").value;
    this.wizardData.description = document.getElementById("wiz-description").value.trim();

    document.getElementById("wizard-step-info").classList.add("hidden");

    if (this.wizardData.type === "static") {
      this.initStaticWorkflow();
    } else {
      this.initDynamicWorkflow();
    }
  }

  // ==========================================
  // STATIC WORKFLOW IMPLEMENTATION
  // ==========================================
  initStaticWorkflow() {
    const staticContainer = document.getElementById("wizard-step-static-collection");
    staticContainer.classList.remove("hidden");

    document.getElementById("static-wiz-name").textContent = this.wizardData.name;
    document.getElementById("static-wiz-kannada").textContent = this.wizardData.kannada;
    document.getElementById("static-wiz-badge").textContent = `Static • ${this.wizardData.hands === 'one' ? 'One Hand' : 'Two Hands'}`;

    document.getElementById("static-source-options").classList.remove("hidden");
    document.getElementById("static-landmark-check").classList.add("hidden");
    document.getElementById("static-3d-generation-stepper").classList.add("hidden");
    document.getElementById("static-3d-preview-card").classList.add("hidden");
    document.getElementById("static-multi-sample-prompt").classList.add("hidden");

    this.switchStaticCollectionTab("webcam");
  }

  switchStaticCollectionTab(tab) {
    const uploadTabBtn = document.getElementById("static-tab-upload-btn");
    const webcamTabBtn = document.getElementById("static-tab-webcam-btn");
    const uploadArea = document.getElementById("static-upload-area");
    const webcamArea = document.getElementById("static-webcam-area");

    if (tab === "upload") {
      uploadTabBtn.classList.add("border-b-2", "border-primary", "text-primary");
      uploadTabBtn.classList.remove("text-on-surface-variant");
      webcamTabBtn.classList.remove("border-b-2", "border-primary", "text-primary");
      webcamTabBtn.classList.add("text-on-surface-variant");

      uploadArea.classList.remove("hidden");
      webcamArea.classList.add("hidden");
      this.stopCameraFeed();
    } else {
      webcamTabBtn.classList.add("border-b-2", "border-primary", "text-primary");
      webcamTabBtn.classList.remove("text-on-surface-variant");
      uploadTabBtn.classList.remove("border-b-2", "border-primary", "text-primary");
      uploadTabBtn.classList.add("text-on-surface-variant");

      webcamArea.classList.remove("hidden");
      uploadArea.classList.add("hidden");
      this.startLiveWebcamFeed("static-webcam-video", "static-webcam-canvas");
    }
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.wizardData.capturedImage = e.target.result;
      this.processCapturedStaticSource("Image Upload");
    };
    reader.readAsDataURL(file);
  }

  captureStaticPoseFromCamera() {
    const video = document.getElementById("static-webcam-video");
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = 640;
    tempCanvas.height = 480;
    const ctx = tempCanvas.getContext("2d");
    if (video && video.videoWidth) {
      ctx.drawImage(video, 0, 0, 640, 480);
    } else {
      ctx.fillStyle = "#171f33";
      ctx.fillRect(0, 0, 640, 480);
      // Hand silhouette
      ctx.fillStyle = "#222a3d";
      ctx.beginPath();
      ctx.arc(320, 260, 90, 0, Math.PI * 2);
      ctx.fill();
    }
    this.wizardData.capturedImage = tempCanvas.toDataURL("image/png");
    this.stopCameraFeed();
    this.processCapturedStaticSource("Webcam Capture");
  }

  processCapturedStaticSource(sourceType) {
    this.wizardData.capturedLandmarks = LandmarkVisualizer.generateSampleLandmarks("static", 0.02);

    document.getElementById("static-source-options").classList.add("hidden");
    const checkCard = document.getElementById("static-landmark-check");
    checkCard.classList.remove("hidden");

    const canvas = document.getElementById("static-landmark-overlay-canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      LandmarkVisualizer.drawLandmarks(canvas, ctx, this.wizardData.capturedLandmarks, {
        showBox: true,
        confidence: 96
      });
    };
    img.src = this.wizardData.capturedImage;

    document.getElementById("static-detection-conf").textContent = "96%";
    document.getElementById("static-detection-source").textContent = sourceType;
  }

  retryStaticCapture() {
    document.getElementById("static-landmark-check").classList.add("hidden");
    document.getElementById("static-source-options").classList.remove("hidden");
    this.switchStaticCollectionTab("webcam");
  }

  generateStatic3DHand() {
    document.getElementById("static-landmark-check").classList.add("hidden");
    const stepperCard = document.getElementById("static-3d-generation-stepper");
    stepperCard.classList.remove("hidden");

    const steps = [
      "static-step-detect",
      "static-step-extract",
      "static-step-joint",
      "static-step-map",
      "static-step-prep"
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep > 0) {
        const prevEl = document.getElementById(steps[currentStep - 1]);
        if (prevEl) {
          prevEl.innerHTML = `<span class="text-emerald-400 font-bold">✓</span> ` + prevEl.getAttribute("data-label");
        }
      }

      if (currentStep < steps.length) {
        const currEl = document.getElementById(steps[currentStep]);
        if (currEl) {
          currEl.innerHTML = `<span class="text-primary animate-pulse font-bold">●</span> ` + currEl.getAttribute("data-label");
        }
        currentStep++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          stepperCard.classList.add("hidden");
          this.showStatic3DPreview();
        }, 500);
      }
    }, 450);
  }

  showStatic3DPreview() {
    const previewCard = document.getElementById("static-3d-preview-card");
    previewCard.classList.remove("hidden");

    document.getElementById("static-preview-meta-gesture").textContent = this.wizardData.name;
    document.getElementById("static-preview-meta-model").textContent = `${this.wizardData.name.toLowerCase()}_pose_001.glb`;

    if (this.staticViewer) this.staticViewer.destroy();
    this.staticViewer = new ThreeHandViewer("static-3d-viewport");
    this.staticViewer.isDynamic = false;
    this.staticViewer.setPose("water");
  }

  acceptStatic3DPose() {
    const newGesture = {
      id: this.wizardData.id,
      name: this.wizardData.name,
      kannada: this.wizardData.kannada,
      type: "static",
      hands: this.wizardData.hands,
      description: this.wizardData.description || "Static ISL hand pose.",
      verified: true,
      modelFile: `${this.wizardData.name.toLowerCase()}_pose_001.glb`,
      modelStatus: "Ready",
      samplesCount: 1,
      signersCount: 1,
      signers: {
        "Signer 001": [
          {
            id: "smp-" + Math.floor(1000 + Math.random() * 9000),
            type: "Pose",
            source: "Webcam Capture",
            date: "Just now",
            quality: "Accepted",
            conf: 96
          }
        ]
      },
      quality: { confidence: 96.0, completeness: 98, signerVariance: "Low" }
    };

    store.addGesture(newGesture);
    this.renderDashboardStats();
    this.renderRecentTable();
    this.renderGesturesCatalog();
    this.renderSamplesView();
    this.renderModelsView();

    document.getElementById("static-3d-preview-card").classList.add("hidden");
    const multiPrompt = document.getElementById("static-multi-sample-prompt");
    multiPrompt.classList.remove("hidden");

    document.getElementById("multi-prompt-gesture-title").textContent = `${this.wizardData.name} (${this.wizardData.kannada})`;
  }

  addAnotherStaticSample(sourceMethod) {
    document.getElementById("static-multi-sample-prompt").classList.add("hidden");
    document.getElementById("static-source-options").classList.remove("hidden");
    this.switchStaticCollectionTab(sourceMethod === "upload" ? "upload" : "webcam");
  }

  finishStaticWizard() {
    this.closeAddGestureModal();
    this.openGestureDetails(this.wizardData.id, "dataset");
  }

  // ==========================================
  // DYNAMIC WORKFLOW IMPLEMENTATION
  // ==========================================
  initDynamicWorkflow() {
    const dynamicContainer = document.getElementById("wizard-step-dynamic-collection");
    dynamicContainer.classList.remove("hidden");

    document.getElementById("dynamic-wiz-name").textContent = this.wizardData.name;
    document.getElementById("dynamic-wiz-kannada").textContent = this.wizardData.kannada;
    document.getElementById("dynamic-wiz-badge").textContent = `Dynamic • Hand movement over time`;

    document.getElementById("dynamic-source-options").classList.remove("hidden");
    document.getElementById("dynamic-processing-stepper").classList.add("hidden");
    document.getElementById("dynamic-3d-preview-card").classList.add("hidden");

    this.switchDynamicCollectionTab("record");
  }

  switchDynamicCollectionTab(tab) {
    const recordTabBtn = document.getElementById("dynamic-tab-record-btn");
    const uploadTabBtn = document.getElementById("dynamic-tab-upload-btn");
    const recordArea = document.getElementById("dynamic-record-area");
    const uploadArea = document.getElementById("dynamic-upload-area");

    if (tab === "upload") {
      uploadTabBtn.classList.add("border-b-2", "border-primary", "text-primary");
      uploadTabBtn.classList.remove("text-on-surface-variant");
      recordTabBtn.classList.remove("border-b-2", "border-primary", "text-primary");
      recordTabBtn.classList.add("text-on-surface-variant");

      uploadArea.classList.remove("hidden");
      recordArea.classList.add("hidden");
      this.stopCameraFeed();
    } else {
      recordTabBtn.classList.add("border-b-2", "border-primary", "text-primary");
      recordTabBtn.classList.remove("text-on-surface-variant");
      uploadTabBtn.classList.remove("border-b-2", "border-primary", "text-primary");
      uploadTabBtn.classList.add("text-on-surface-variant");

      recordArea.classList.remove("hidden");
      uploadArea.classList.add("hidden");
      this.startLiveWebcamFeed("dynamic-webcam-video", "dynamic-webcam-canvas");
    }
  }

  toggleDynamicRecording() {
    const btn = document.getElementById("dynamic-record-toggle-btn");
    const statusText = document.getElementById("dynamic-record-status");
    const timerDisplay = document.getElementById("dynamic-record-timer");

    if (!this.isRecording) {
      this.isRecording = true;
      this.recordDuration = 0;
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">stop</span> Stop Recording`;
      btn.classList.remove("bg-rose-600", "hover:bg-rose-700");
      btn.classList.add("bg-amber-600", "hover:bg-amber-700");
      statusText.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping inline-block mr-1"></span> Recording movement...`;

      this.recordTimer = setInterval(() => {
        this.recordDuration += 0.1;
        timerDisplay.textContent = `00:0${Math.floor(this.recordDuration)}.${Math.floor((this.recordDuration % 1) * 10)}s`;
        if (this.recordDuration >= 4.0) {
          this.toggleDynamicRecording();
        }
      }, 100);
    } else {
      this.isRecording = false;
      clearInterval(this.recordTimer);
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">videocam</span> Re-record`;
      btn.classList.remove("bg-amber-600", "hover:bg-amber-700");
      btn.classList.add("bg-rose-600", "hover:bg-rose-700");
      statusText.innerHTML = `✓ Video captured (${timerDisplay.textContent})`;

      document.getElementById("dynamic-process-btn").classList.remove("hidden");
    }
  }

  handleDynamicVideoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById("dynamic-upload-file-status").textContent = `Selected: ${file.name} (${(file.size / (1024*1024)).toFixed(1)} MB)`;
    document.getElementById("dynamic-upload-process-btn").classList.remove("hidden");
  }

  processDynamicVideo() {
    this.stopCameraFeed();
    document.getElementById("dynamic-source-options").classList.add("hidden");
    const stepper = document.getElementById("dynamic-processing-stepper");
    stepper.classList.remove("hidden");

    const steps = [
      "dyn-step-load",
      "dyn-step-frames",
      "dyn-step-detect",
      "dyn-step-landmark",
      "dyn-step-temporal",
      "dyn-step-anim"
    ];

    let current = 0;
    const interval = setInterval(() => {
      if (current > 0) {
        const prev = document.getElementById(steps[current - 1]);
        if (prev) {
          prev.innerHTML = `<span class="text-emerald-400 font-bold">✓</span> ` + prev.getAttribute("data-label");
        }
      }

      if (current < steps.length) {
        const curr = document.getElementById(steps[current]);
        if (curr) {
          curr.innerHTML = `<span class="text-primary animate-pulse font-bold">●</span> ` + curr.getAttribute("data-label");
        }
        current++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          stepper.classList.add("hidden");
          this.showDynamic3DAnimationPreview();
        }, 500);
      }
    }, 400);
  }

  showDynamic3DAnimationPreview() {
    const card = document.getElementById("dynamic-3d-preview-card");
    card.classList.remove("hidden");

    document.getElementById("dyn-preview-meta-gesture").textContent = this.wizardData.name;
    document.getElementById("dyn-preview-meta-model").textContent = `${this.wizardData.name.toLowerCase()}_animation_001.glb`;

    if (this.dynamicViewer) this.dynamicViewer.destroy();
    this.dynamicViewer = new ThreeHandViewer("dynamic-3d-viewport");
    this.dynamicViewer.isDynamic = true;
    this.dynamicViewer.duration = 4.0;
    this.dynamicViewer.play();

    const scrubber = document.getElementById("dyn-timeline-scrubber");
    const timeDisplay = document.getElementById("dyn-timeline-time");
    const playBtn = document.getElementById("dyn-timeline-play-btn");

    this.dynamicViewer.onTimeUpdate = (currentTime, duration) => {
      const progress = (currentTime / duration) * 100;
      scrubber.value = progress;
      timeDisplay.textContent = `${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s`;
    };

    scrubber.oninput = (e) => {
      const t = (e.target.value / 100) * 4.0;
      this.dynamicViewer.seek(t);
    };

    playBtn.onclick = () => {
      if (this.dynamicViewer.isPlaying) {
        this.dynamicViewer.pause();
        playBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">play_arrow</span>`;
      } else {
        this.dynamicViewer.play();
        playBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">pause</span>`;
      }
    };
  }

  setDynamicPlaybackSpeed(speed, btn) {
    if (this.dynamicViewer) this.dynamicViewer.setSpeed(speed);
    document.querySelectorAll(".dyn-speed-btn").forEach(b => {
      b.classList.remove("bg-primary", "text-black");
      b.classList.add("bg-surface-container", "text-on-surface-variant");
    });
    btn.classList.add("bg-primary", "text-black");
    btn.classList.remove("bg-surface-container", "text-on-surface-variant");
  }

  acceptDynamic3DAnimation() {
    const newGesture = {
      id: this.wizardData.id,
      name: this.wizardData.name,
      kannada: this.wizardData.kannada,
      type: "dynamic",
      hands: this.wizardData.hands,
      description: this.wizardData.description || "Dynamic ISL gesture movement.",
      verified: true,
      modelFile: `${this.wizardData.name.toLowerCase()}_animation_001.glb`,
      modelStatus: "Ready",
      samplesCount: 1,
      signersCount: 1,
      signers: {
        "Signer 001": [
          {
            id: "smp-" + Math.floor(1000 + Math.random() * 9000),
            type: "Video",
            source: "Webcam (3.5s)",
            date: "Just now",
            quality: "Accepted",
            conf: 95
          }
        ]
      },
      quality: { confidence: 95.2, completeness: 96, signerVariance: "Medium" }
    };

    store.addGesture(newGesture);
    this.renderDashboardStats();
    this.renderRecentTable();
    this.renderGesturesCatalog();
    this.renderSamplesView();
    this.renderModelsView();

    this.closeAddGestureModal();
    this.openGestureDetails(newGesture.id, "3d");
  }

  // ==========================================
  // Camera Engine
  // ==========================================
  startLiveWebcamFeed(videoId, canvasId) {
    const video = document.getElementById(videoId);
    const canvas = document.getElementById(canvasId);
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then(stream => {
          this.cameraStream = stream;
          video.srcObject = stream;
          video.play();
        })
        .catch(() => {
          console.log("Webcam unavailable. Running synthetic tracking overlay simulator.");
        });
    }

    const loop = () => {
      this.cameraAnimId = requestAnimationFrame(loop);
      canvas.width = canvas.clientWidth || 640;
      canvas.height = canvas.clientHeight || 480;

      if (!video.srcObject) {
        ctx.fillStyle = "#0c1426";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "rgba(45, 52, 73, 0.4)";
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
      }

      const liveLandmarks = LandmarkVisualizer.generateSampleLandmarks("live", 0.008);
      LandmarkVisualizer.drawLandmarks(canvas, ctx, liveLandmarks, {
        showBox: true,
        confidence: 96
      });
    };
    loop();
  }

  stopCameraFeed() {
    if (this.cameraAnimId) {
      cancelAnimationFrame(this.cameraAnimId);
      this.cameraAnimId = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
    if (this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }
    this.isRecording = false;
  }

  // ==========================================
  // Gesture Details Modal (4 Tabs)
  // ==========================================
  openGestureDetails(id, activeTab = "overview") {
    const gesture = store.getById(id);
    if (!gesture) return;

    this.activeGestureDetails = gesture;

    document.getElementById("details-name").textContent = gesture.name;
    document.getElementById("details-kannada").textContent = gesture.kannada;
    document.getElementById("details-type-badge").textContent = `${gesture.type.toUpperCase()}`;
    document.getElementById("details-type-badge").className = `px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
      gesture.type === 'static' ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50' : 'bg-purple-900/40 text-purple-300 border border-purple-700/50'
    }`;
    document.getElementById("details-hands-badge").textContent = `${gesture.hands.toUpperCase()} HAND`;
    document.getElementById("details-verified-badge").textContent = gesture.verified ? "VERIFIED" : "PENDING REVIEW";
    document.getElementById("details-verified-badge").className = `px-2.5 py-1 rounded-full text-xs font-semibold ${
      gesture.verified ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
    }`;

    document.getElementById("details-desc").textContent = gesture.description;
    document.getElementById("details-model-ref").textContent = gesture.modelFile;
    document.getElementById("details-model-status").textContent = gesture.modelStatus;
    document.getElementById("details-stat-samples").textContent = gesture.samplesCount;
    document.getElementById("details-stat-signers").textContent = gesture.signersCount;

    this.renderDetailsSignerTree(gesture);
    this.switchDetailsTab(activeTab);

    document.getElementById("gesture-details-modal").classList.remove("hidden");
  }

  closeGestureDetails() {
    if (this.detailsViewer) {
      this.detailsViewer.destroy();
      this.detailsViewer = null;
    }
    document.getElementById("gesture-details-modal").classList.add("hidden");
  }

  switchDetailsTab(tabName) {
    const tabs = ["overview", "dataset", "3d", "quality"];
    tabs.forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const content = document.getElementById(`tab-content-${t}`);
      if (btn && content) {
        if (t === tabName) {
          btn.classList.add("border-b-2", "border-primary", "text-primary");
          btn.classList.remove("text-on-surface-variant");
          content.classList.remove("hidden");
        } else {
          btn.classList.remove("border-b-2", "border-primary", "text-primary");
          btn.classList.add("text-on-surface-variant");
          content.classList.add("hidden");
        }
      }
    });

    if (tabName === "3d") {
      setTimeout(() => {
        if (this.detailsViewer) this.detailsViewer.destroy();
        this.detailsViewer = new ThreeHandViewer("details-3d-viewport");
        if (this.activeGestureDetails.type === "dynamic") {
          this.detailsViewer.isDynamic = true;
          this.detailsViewer.play();
        } else {
          this.detailsViewer.isDynamic = false;
          this.detailsViewer.setPose("water");
        }
      }, 100);
    }
  }

  renderDetailsSignerTree(gesture) {
    const container = document.getElementById("details-signers-tree");
    if (!container) return;

    container.innerHTML = "";
    Object.entries(gesture.signers || {}).forEach(([signerName, samples]) => {
      const signerBox = document.createElement("div");
      signerBox.className = "p-4 rounded-lg bg-surface-container border border-outline-variant/30";

      const samplesListHtml = samples.map(s => `
        <div class="flex items-center justify-between py-2 border-b border-[#334155]/50 last:border-none text-xs">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-primary">
              ${s.type === 'Video' ? 'videocam' : (s.source.includes('Webcam') ? 'photo_camera' : 'image')}
            </span>
            <span class="font-mono text-on-background">${s.id}</span>
            <span class="text-outline">(${s.source})</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-outline text-[11px]">${s.date}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-medium ${s.quality === 'Accepted' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'}">${s.quality}</span>
          </div>
        </div>
      `).join("");

      signerBox.innerHTML = `
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[20px]">person</span>
            <h4 class="font-semibold text-on-background text-sm">${signerName}</h4>
            <span class="text-xs text-outline">(${samples.length} samples)</span>
          </div>
          <button class="text-xs text-primary hover:underline flex items-center gap-1" onclick="app.quickAddSampleForSigner('${gesture.id}', '${signerName}')">
            + Add Sample
          </button>
        </div>
        <div class="space-y-1 bg-surface-container-lowest/70 p-2.5 rounded border border-outline-variant/20">
          ${samplesListHtml}
        </div>
      `;
      container.appendChild(signerBox);
    });
  }

  quickAddSampleForSigner(gestureId, signerName) {
    this.closeGestureDetails();
    this.openAddGestureModal(this.activeGestureDetails.type);
    document.getElementById("wiz-gesture-name").value = this.activeGestureDetails.name;
    document.getElementById("wiz-kannada-meaning").value = this.activeGestureDetails.kannada;
  }

  bindEvents() {
    const addBtn = document.getElementById("btn-add-new-gesture");
    if (addBtn) addBtn.onclick = () => this.openAddGestureModal();

    const addBtn2 = document.getElementById("btn-add-new-gesture-2");
    if (addBtn2) addBtn2.onclick = () => this.openAddGestureModal();
  }
}

// Global instance
let app;
window.addEventListener("DOMContentLoaded", () => {
  app = new ISLDatasetApp();
});
