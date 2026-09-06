/**
 * Three.js 3D Articulated Hand Viewer — Upgraded
 * Fixes: dynamic playback timing, realistic skin-tone visuals, palm mesh, accurate timestamp-based frame seek
 */

export class ThreeHandViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.gltfLoader = null;
    this.clock = null;

    // Hand meshes
    this.handGroup = null;
    this.jointNodes = [];
    this.boneMeshes = [];
    this.palmMesh = null;
    this.loadedModel = null;
    this.isRiggedModel = false;

    // Dynamic animation state
    this.animationFrames = [];
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 4.0;
    this.playbackSpeed = 1.0;
    this.animFrameId = null;
    this.onTimelineUpdate = null;

    // Camera orbit state (fallback)
    this.zoom = 28;
    this.rotation = { x: 0.2, y: -0.3 };
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };

    this.init();
  }

  init() {
    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 420;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1524);
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.clock = new THREE.Clock();
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls (preferred) or internal orbit math
    if (typeof THREE.OrbitControls !== "undefined") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.minDistance = 8;
      this.controls.maxDistance = 60;
    } else {
      this.setupMouseOrbit();
    }

    // Lighting for realistic skin appearance
    const ambientLight = new THREE.AmbientLight(0xfff4e8, 0.6);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff0d8, 1.8);
    keyLight.position.set(15, 30, 20);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd0e4ff, 0.6);
    fillLight.position.set(-20, 5, -15);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffddcc, 0.4);
    rimLight.position.set(0, -20, -10);
    this.scene.add(rimLight);

    // Floor grid
    const grid = new THREE.GridHelper(30, 20, 0x1e293b, 0x151f30);
    grid.position.y = -8;
    this.scene.add(grid);

    if (typeof THREE.GLTFLoader !== "undefined") {
      this.gltfLoader = new THREE.GLTFLoader();
    }

    // Build the default realistic articulated rig
    this.buildArticulatedRig();
    this.renderLoop();
    window.addEventListener("resize", () => this.onResize());
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w && h) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }
  }

  updateCamera() {
    const r = this.zoom;
    const phi = Math.PI / 2 - this.rotation.x;
    const theta = this.rotation.y;
    this.camera.position.x = r * Math.sin(phi) * Math.sin(theta);
    this.camera.position.y = r * Math.cos(phi);
    this.camera.position.z = r * Math.sin(phi) * Math.cos(theta);
    this.camera.lookAt(0, 0, 0);
  }

  setupMouseOrbit() {
    const dom = this.renderer.domElement;
    dom.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x, dy = e.clientY - this.prevMouse.y;
      this.rotation.y += dx * 0.01;
      this.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.rotation.x + dy * 0.01));
      this.prevMouse = { x: e.clientX, y: e.clientY };
      this.updateCamera();
    });
    window.addEventListener("mouseup", () => { this.isDragging = false; });
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.max(10, Math.min(60, this.zoom + e.deltaY * 0.04));
      this.updateCamera();
    }, { passive: false });
  }

  /** Build realistic skin-tone articulated hand rig */
  buildArticulatedRig() {
    if (this.handGroup) this.scene.remove(this.handGroup);
    this.handGroup = new THREE.Group();
    this.scene.add(this.handGroup);

    // MediaPipe 21-landmark template (resting hand pose)
    const baseCoords = [
      [0, -5, 0],        // 0 Wrist
      [-2.4, -3.8, 0.8], // 1 Thumb CMC
      [-3.8, -2.2, 1.4], // 2 Thumb MCP
      [-4.5, -0.6, 1.8], // 3 Thumb IP
      [-5.0,  1.0, 2.0], // 4 Thumb TIP
      [-1.8, -1.2, 0.5], // 5 Index MCP
      [-2.2,  1.4, 0.8], // 6 Index PIP
      [-2.4,  3.4, 0.9], // 7 Index DIP
      [-2.5,  5.2, 1.0], // 8 Index TIP
      [-0.2, -0.9, 0.2], // 9 Middle MCP
      [-0.3,  1.9, 0.4], // 10 Middle PIP
      [-0.3,  4.2, 0.5], // 11 Middle DIP
      [-0.3,  6.2, 0.6], // 12 Middle TIP
      [ 1.4, -1.1, 0.0], // 13 Ring MCP
      [ 1.7,  1.5, 0.1], // 14 Ring PIP
      [ 1.9,  3.7, 0.2], // 15 Ring DIP
      [ 2.0,  5.5, 0.3], // 16 Ring TIP
      [ 3.0, -1.5,-0.3], // 17 Pinky MCP
      [ 3.6,  0.7,-0.3], // 18 Pinky PIP
      [ 4.0,  2.3,-0.2], // 19 Pinky DIP
      [ 4.3,  3.9,-0.2]  // 20 Pinky TIP
    ];

    this.landmarkBase = baseCoords.map(c => new THREE.Vector3(...c));
    this.jointNodes = [];

    // Skin-tone materials
    const skinColor = 0xd4956a;
    const skinDark  = 0xb87850;

    // Joint spheres — tapered sizes (wrist larger, tips smaller)
    const jointSizes = [
      0.55, 0.38, 0.34, 0.30, 0.24, // wrist, thumb
      0.38, 0.32, 0.28, 0.22,       // index
      0.38, 0.32, 0.28, 0.22,       // middle
      0.36, 0.30, 0.26, 0.20,       // ring
      0.32, 0.26, 0.22, 0.18        // pinky
    ];

    const jointMat = new THREE.MeshPhongMaterial({
      color: skinColor,
      specular: 0xffcca0,
      shininess: 35,
      emissive: 0x2a1008,
      emissiveIntensity: 0.08
    });

    for (let i = 0; i < 21; i++) {
      const geo = new THREE.SphereGeometry(jointSizes[i] || 0.30, 14, 14);
      const mesh = new THREE.Mesh(geo, jointMat);
      mesh.position.copy(this.landmarkBase[i]);
      mesh.castShadow = true;
      this.handGroup.add(mesh);
      this.jointNodes.push(mesh);
    }

    // Bone cylinders — realistic tapered finger segments
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    // Radii for each segment (proximal, distal) — tapered
    const boneRadii = {
      "0,1": [0.30, 0.26], "1,2": [0.26, 0.22], "2,3": [0.22, 0.18], "3,4": [0.18, 0.14],
      "0,5": [0.28, 0.26], "5,6": [0.26, 0.22], "6,7": [0.22, 0.18], "7,8": [0.18, 0.14],
      "0,9": [0.30, 0.28], "9,10": [0.28, 0.24], "10,11": [0.24, 0.20], "11,12": [0.20, 0.15],
      "0,13": [0.26, 0.24], "13,14": [0.24, 0.20], "14,15": [0.20, 0.16], "15,16": [0.16, 0.12],
      "0,17": [0.22, 0.20], "17,18": [0.20, 0.16], "18,19": [0.16, 0.13], "19,20": [0.13, 0.10],
      "5,9": [0.22, 0.22], "9,13": [0.22, 0.22], "13,17": [0.20, 0.20]
    };

    const boneMat = new THREE.MeshPhongMaterial({
      color: skinColor,
      specular: 0xffcca0,
      shininess: 30,
      emissive: 0x1e0c04,
      emissiveIntensity: 0.06
    });

    this.boneMeshes = [];
    connections.forEach(([fromIdx, toIdx]) => {
      const p1 = this.landmarkBase[fromIdx], p2 = this.landmarkBase[toIdx];
      const dist = p1.distanceTo(p2);
      const key = `${fromIdx},${toIdx}`;
      const [rTop, rBot] = boneRadii[key] || [0.20, 0.16];
      const boneGeo = new THREE.CylinderGeometry(rTop, rBot, dist, 10, 1);
      const boneMesh = new THREE.Mesh(boneGeo, boneMat);
      boneMesh.castShadow = true;
      this.handGroup.add(boneMesh);
      this.boneMeshes.push({ mesh: boneMesh, from: fromIdx, to: toIdx });
    });

    // Palm skin patch (convex polygon between base knuckles 0,5,9,13,17)
    this._buildPalmMesh(skinDark);

    this.updateBones();
  }

  _buildPalmMesh(color) {
    if (this.palmMesh) this.handGroup.remove(this.palmMesh);
    // Simple flat polygon for palm area — wrist + knuckle landmarks
    const palmIndices = [0, 17, 13, 9, 5, 1];
    const geo = new THREE.BufferGeometry();
    const positions = [];
    palmIndices.forEach(idx => {
      const p = this.landmarkBase[idx];
      positions.push(p.x, p.y, p.z - 0.1);
    });
    // Fan triangulation from wrist (index 0)
    const indices = [];
    for (let i = 1; i < palmIndices.length - 1; i++) {
      indices.push(0, i, i + 1);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({
      color: 0xc97f50,
      specular: 0xffcca0,
      shininess: 20,
      side: THREE.DoubleSide,
      emissive: 0x1a0a00,
      emissiveIntensity: 0.05
    });
    this.palmMesh = new THREE.Mesh(geo, mat);
    this.palmMesh.castShadow = true;
    this.handGroup.add(this.palmMesh);
  }

  updateBones() {
    this.boneMeshes.forEach(b => {
      const p1 = this.jointNodes[b.from].position;
      const p2 = this.jointNodes[b.to].position;
      const distance = p1.distanceTo(p2);
      b.mesh.scale.set(1, Math.max(0.01, distance / (b.mesh.geometry.parameters.height || 1)), 1);
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      b.mesh.position.copy(mid);
      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
      const axis = new THREE.Vector3(0, 1, 0);
      b.mesh.quaternion.setFromUnitVectors(axis, dir);
    });

    // Update palm mesh vertices to follow joints
    if (this.palmMesh) {
      const palmIndices = [0, 17, 13, 9, 5, 1];
      const posAttr = this.palmMesh.geometry.attributes.position;
      palmIndices.forEach((idx, i) => {
        const p = this.jointNodes[idx].position;
        posAttr.setXYZ(i, p.x, p.y, p.z - 0.1);
      });
      posAttr.needsUpdate = true;
      this.palmMesh.geometry.computeVertexNormals();
    }
  }

  /** Map real MediaPipe 21 landmarks to the 3D hand rig */
  applyLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 21) return;
    const wrist = landmarks[0];
    const scale = 14;
    landmarks.slice(0, 21).forEach((lm, i) => {
      if (this.jointNodes[i]) {
        this.jointNodes[i].position.set(
          (lm.x - wrist.x) * scale,
          -(lm.y - wrist.y) * scale - 2,
          -(lm.z || 0) * (scale * 1.2)
        );
      }
    });
    this.updateBones();
  }

  /** Load a .glb / .gltf file from backend storage */
  async loadGLBModel(url) {
    if (!this.gltfLoader) { console.warn("GLTFLoader not available."); return; }
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, (gltf) => {
        if (this.loadedModel) this.scene.remove(this.loadedModel);
        this.loadedModel = gltf.scene;

        let hasBones = false;
        this.loadedModel.traverse(child => {
          if (child.isSkinnedMesh || child.isBone) hasBones = true;
        });
        this.isRiggedModel = hasBones;

        const box = new THREE.Box3().setFromObject(this.loadedModel);
        const size = box.getSize(new THREE.Vector3()).length();
        const center = box.getCenter(new THREE.Vector3());
        this.loadedModel.position.sub(center);
        if (size > 0) {
          const sf = 12 / size;
          this.loadedModel.scale.set(sf, sf, sf);
        }

        this.scene.add(this.loadedModel);
        if (this.handGroup) this.handGroup.visible = false;
        resolve({ success: true, isRigged: hasBones });
      }, undefined, (err) => { console.error("GLB load failed:", err); reject(err); });
    });
  }

  // ============================================================
  //  DYNAMIC SEQUENCE PLAYBACK
  // ============================================================

  /**
   * Load an array of landmark frames for animated playback.
   * Each frame: { frame_index, timestamp, right_hand_landmarks, left_hand_landmarks, ... }
   */
  loadDynamicSequence(frames, duration, fps = 30) {
    this.animationFrames = frames || [];
    if (this.animationFrames.length === 0) { this.duration = duration || 4.0; return; }

    // Compute duration from last frame's actual timestamp if available
    const lastFrame = this.animationFrames[this.animationFrames.length - 1];
    if (lastFrame && typeof lastFrame.timestamp === "number" && lastFrame.timestamp > 0) {
      this.duration = lastFrame.timestamp;
    } else if (duration && duration > 0) {
      this.duration = duration;
    } else {
      this.duration = this.animationFrames.length / (fps || 30);
    }

    this.currentTime = 0;
    this.isPlaying = true;
    this.clock.start();
  }

  play()  { this.isPlaying = true; this.clock.start(); }
  pause() { this.isPlaying = false; }
  reset() { this.currentTime = 0; this.applySequenceFrameAt(0); }

  seek(timeInSec) {
    this.currentTime = Math.max(0, Math.min(this.duration, timeInSec));
    this.applySequenceFrameAt(this.currentTime);
  }

  setSpeed(s) { this.playbackSpeed = s; }

  applySequenceFrameAt(timeSec) {
    if (!this.animationFrames || this.animationFrames.length === 0) return;

    let frame = null;

    // Find frame by timestamp if timestamps are present
    if (typeof this.animationFrames[0].timestamp === "number") {
      // Binary-search or linear scan for nearest frame
      let best = 0, bestDiff = Infinity;
      for (let i = 0; i < this.animationFrames.length; i++) {
        const diff = Math.abs(this.animationFrames[i].timestamp - timeSec);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      }
      frame = this.animationFrames[best];
    } else {
      // Fallback: progress-based index
      const progress = Math.min(1.0, timeSec / (this.duration || 1.0));
      const idx = Math.floor(progress * (this.animationFrames.length - 1));
      frame = this.animationFrames[idx];
    }

    if (frame) {
      const lm = (frame.right_hand_landmarks && frame.right_hand_landmarks.length === 21)
        ? frame.right_hand_landmarks
        : (frame.left_hand_landmarks && frame.left_hand_landmarks.length === 21)
          ? frame.left_hand_landmarks
          : null;
      if (lm) this.applyLandmarks(lm);
    }

    if (this.onTimelineUpdate) this.onTimelineUpdate(timeSec, this.duration);
  }

  setView(preset) {
    if (preset === "front")  { this.rotation = { x: 0, y: 0 }; }
    else if (preset === "side") { this.rotation = { x: 0, y: Math.PI / 2 }; }
    else if (preset === "top")  { this.rotation = { x: Math.PI / 2 - 0.05, y: 0 }; }
    else { this.rotation = { x: 0.2, y: -0.3 }; this.zoom = 28; }
    this.updateCamera();
    if (this.controls) this.controls.reset();
  }

  renderLoop() {
    this.animFrameId = requestAnimationFrame(() => this.renderLoop());
    if (this.controls) this.controls.update();

    // Advance animation time using accurate THREE.Clock delta
    if (this.isPlaying && this.animationFrames.length > 0) {
      const delta = this.clock.getDelta();
      this.currentTime += delta * this.playbackSpeed;
      if (this.currentTime >= this.duration) {
        this.currentTime = 0; // Loop
        this.clock.start();
      }
      this.applySequenceFrameAt(this.currentTime);
    } else {
      // Keep clock ticking so getDelta() is accurate when playback restarts
      this.clock.getDelta();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.controls) this.controls.dispose();
    if (this.renderer && this.renderer.domElement && this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
