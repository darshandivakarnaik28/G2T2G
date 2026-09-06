/**
 * Three.js 3D Articulated Hand Viewer — Tube-based Realistic Hand
 * Uses CatmullRomCurve3 + TubeGeometry for smooth, continuous finger skin.
 * No separate joint spheres / cylinders — fingers are solid extruded tubes.
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

    // Hand geometry
    this.handGroup = null;
    this.jointNodes = [];       // invisible Vector3 position holders (plain Objects)
    this.fingerTubes = [];      // { tubeGroup, chains }  — rebuilt each frame
    this.palmMesh = null;
    this.wristMesh = null;
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
    const width  = this.container.clientWidth  || 600;
    const height = this.container.clientHeight || 420;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1524);
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.clock  = new THREE.Clock();
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    if (typeof THREE.OrbitControls !== "undefined") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.minDistance = 8;
      this.controls.maxDistance = 60;
    } else {
      this.setupMouseOrbit();
    }

    // Lighting for warm skin appearance
    this.scene.add(new THREE.AmbientLight(0xfff4e8, 0.7));

    const keyLight = new THREE.DirectionalLight(0xfff0d8, 2.0);
    keyLight.position.set(15, 30, 20);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width  = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd0e4ff, 0.7);
    fillLight.position.set(-20, 5, -15);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffddcc, 0.5);
    rimLight.position.set(0, -20, -10);
    this.scene.add(rimLight);

    // Floor grid
    const grid = new THREE.GridHelper(30, 20, 0x1e293b, 0x151f30);
    grid.position.y = -8;
    this.scene.add(grid);

    if (typeof THREE.GLTFLoader !== "undefined") {
      this.gltfLoader = new THREE.GLTFLoader();
    }

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
    const r   = this.zoom;
    const phi = Math.PI / 2 - this.rotation.x;
    const tht = this.rotation.y;
    this.camera.position.set(
      r * Math.sin(phi) * Math.sin(tht),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.cos(tht)
    );
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
      this.rotation.x  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.rotation.x + dy * 0.01));
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

  // ─────────────────────────────────────────────────────────────
  //  MATERIALS
  // ─────────────────────────────────────────────────────────────
  _buildMaterials() {
    this.skinMat = new THREE.MeshStandardMaterial({
      color: 0xd4956a,
      roughness: 0.55,
      metalness: 0.0,
      emissive: 0x2e1309,
      emissiveIntensity: 0.10,
    });
    this.skinMat2 = new THREE.MeshStandardMaterial({
      color: 0xc07d52,
      roughness: 0.60,
      metalness: 0.0,
      emissive: 0x1e0c04,
      emissiveIntensity: 0.08,
      side: THREE.DoubleSide,
    });
    this.tipMat = new THREE.MeshStandardMaterial({
      color: 0xe8bca2,
      roughness: 0.30,
      metalness: 0.05,
      emissive: 0x3d1b10,
      emissiveIntensity: 0.10,
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  RIG BUILD
  // ─────────────────────────────────────────────────────────────

  /**
   * Anatomical resting pose — 21 MediaPipe landmarks in world space.
   * Used only for the initial "idle" display before real landmarks arrive.
   */
  _defaultPose() {
    return [
      [0,    -5.2, 0   ],  // 0  Wrist
      [-2.4, -4.0, 0.8 ],  // 1  Thumb CMC
      [-3.9, -2.4, 1.4 ],  // 2  Thumb MCP
      [-4.6, -0.8, 1.8 ],  // 3  Thumb IP
      [-5.1,  0.8, 2.0 ],  // 4  Thumb TIP
      [-1.8, -1.2, 0.5 ],  // 5  Index MCP
      [-2.2,  1.4, 0.8 ],  // 6  Index PIP
      [-2.4,  3.4, 0.9 ],  // 7  Index DIP
      [-2.5,  5.2, 1.0 ],  // 8  Index TIP
      [-0.2, -0.9, 0.2 ],  // 9  Middle MCP
      [-0.3,  1.9, 0.4 ],  // 10 Middle PIP
      [-0.3,  4.2, 0.5 ],  // 11 Middle DIP
      [-0.3,  6.2, 0.6 ],  // 12 Middle TIP
      [ 1.4, -1.1, 0.0 ],  // 13 Ring MCP
      [ 1.7,  1.5, 0.1 ],  // 14 Ring PIP
      [ 1.9,  3.7, 0.2 ],  // 15 Ring DIP
      [ 2.0,  5.5, 0.3 ],  // 16 Ring TIP
      [ 3.0, -1.5,-0.3 ],  // 17 Pinky MCP
      [ 3.6,  0.7,-0.3 ],  // 18 Pinky PIP
      [ 4.0,  2.3,-0.2 ],  // 19 Pinky DIP
      [ 4.3,  3.9,-0.2 ]   // 20 Pinky TIP
    ];
  }

  buildArticulatedRig() {
    if (this.handGroup) this.scene.remove(this.handGroup);
    this.handGroup = new THREE.Group();
    this.scene.add(this.handGroup);

    this._buildMaterials();

    // Initialize 21 position holders as plain Vector3
    const pose = this._defaultPose();
    this.jointNodes = pose.map(c => new THREE.Vector3(c[0], c[1], c[2]));

    // Finger chains: each chain is a sequence of landmark indices
    // Tube will be extruded along a CatmullRom spline through these points.
    this.fingerChains = [
      { indices: [0, 1, 2, 3, 4],        radii: [0.80, 0.60, 0.46, 0.38, 0.28], isTip: 4 },  // Thumb
      { indices: [0, 5, 6, 7, 8],         radii: [0.80, 0.58, 0.46, 0.38, 0.28], isTip: 8 },  // Index
      { indices: [0, 9, 10, 11, 12],      radii: [0.80, 0.60, 0.48, 0.40, 0.30], isTip: 12 }, // Middle
      { indices: [0, 13, 14, 15, 16],     radii: [0.80, 0.56, 0.44, 0.36, 0.28], isTip: 16 }, // Ring
      { indices: [0, 17, 18, 19, 20],     radii: [0.80, 0.48, 0.38, 0.30, 0.24], isTip: 20 }, // Pinky
    ];

    // Build tube meshes
    this.fingerTubes = [];
    for (const chain of this.fingerChains) {
      const tubeGroup = this._buildFingerTube(chain);
      this.handGroup.add(tubeGroup);
      this.fingerTubes.push({ tubeGroup, chain });
    }

    // Palm mesh
    this._buildPalmMesh();

    // Wrist sphere (thick rounded base)
    const wristGeo = new THREE.SphereGeometry(1.10, 20, 20);
    this.wristMesh = new THREE.Mesh(wristGeo, this.skinMat);
    this.wristMesh.castShadow = true;
    this.wristMesh.receiveShadow = true;
    this.wristMesh.position.copy(this.jointNodes[0]);
    this.handGroup.add(this.wristMesh);
  }

  // ─────────────────────────────────────────────────────────────
  //  TUBE GEOMETRY PER FINGER
  // ─────────────────────────────────────────────────────────────

  /**
   * Build a Group containing per-segment tapered TubeGeometry objects
   * connected smoothly for one finger chain.
   */
  _buildFingerTube(chain) {
    const group = new THREE.Group();
    const { indices, radii } = chain;

    // One tube per segment pair (e.g. 0→1, 1→2, 2→3, 3→4)
    const segMeshes = [];
    for (let s = 0; s < indices.length - 1; s++) {
      const p0 = this.jointNodes[indices[s]].clone();
      const p1 = this.jointNodes[indices[s + 1]].clone();

      // Add a mid-point for a slightly curved spline
      const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
      // Tiny forward bias on mid for anatomical curvature
      mid.z += 0.12;

      const curve  = new THREE.CatmullRomCurve3([p0, mid, p1]);
      const rTop   = radii[s];
      const rBot   = radii[s + 1];
      // Interpolate radius along tube using a tapered CylinderGeometry instead
      // TubeGeometry can't taper — so we build a tapered cylinder aligned to the segment
      const segGeo = this._taperedTube(p0, p1, rTop, rBot);
      const mat    = (s === indices.length - 2) ? this.tipMat : this.skinMat;
      const mesh   = new THREE.Mesh(segGeo, mat);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      segMeshes.push({ mesh, segIdx: s, indices, radii });
    }
    group.userData.segMeshes = segMeshes;
    return group;
  }

  /**
   * Create a tapered cylinder (cone frustum) perfectly aligned between two 3D points.
   * Returns BufferGeometry already positioned/rotated in world space via matrix baking.
   */
  _taperedTube(p1, p2, rTop, rBot) {
    const dist = p1.distanceTo(p2);
    // Extra segments (8) so the tapered skin rounds nicely
    const geo = new THREE.CylinderGeometry(rTop, rBot, dist, 14, 3);

    // Align the cylinder (default Y-up) from p1 to p2 via a matrix transform
    const dir    = new THREE.Vector3().subVectors(p2, p1).normalize();
    const up     = new THREE.Vector3(0, 1, 0);
    const quat   = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const mid    = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

    const matrix = new THREE.Matrix4();
    matrix.compose(mid, quat, new THREE.Vector3(1, 1, 1));

    // Bake the transform into the geometry so the Mesh can stay at origin
    geo.applyMatrix4(matrix);
    return geo;
  }

  // ─────────────────────────────────────────────────────────────
  //  PALM MESH — thick slab connecting knuckles to wrist
  // ─────────────────────────────────────────────────────────────

  _buildPalmMesh() {
    if (this.palmMesh) { this.handGroup.remove(this.palmMesh); this.palmMesh = null; }

    // Palm vertices: front (+z) and back (-z) face, bridged at edges
    // Landmarks used: wrist(0), thumb_cmc(1), idx_mcp(5), mid_mcp(9), ring_mcp(13), pinky_mcp(17)
    const palmLm = [0, 1, 5, 9, 13, 17];
    const thickness = 0.55;

    const verts = [];
    const front = [];
    const back  = [];

    palmLm.forEach(idx => {
      const p = this.jointNodes[idx];
      front.push(new THREE.Vector3(p.x, p.y, p.z + thickness * 0.5));
      back.push( new THREE.Vector3(p.x, p.y, p.z - thickness * 0.5));
    });

    // 6 front + 6 back = 12 vertices
    const positions = [...front, ...back].flatMap(v => [v.x, v.y, v.z]);
    // Front face triangles (fan from wrist = index 0)
    const fIdx = [
      0,1,2,  0,2,3,  0,3,4,  0,4,5
    ];
    // Back face triangles (reversed winding)
    const bIdx = [
      6,8,7,  6,9,8,  6,10,9,  6,11,10
    ];
    // Side edges connecting front[i]→front[i+1]→back[i+1]→back[i]
    const sideIdx = [];
    for (let i = 0; i < 5; i++) {
      const f0 = i, f1 = i + 1;
      const b0 = i + 6, b1 = i + 7;
      sideIdx.push(f0, b0, f1,  f1, b0, b1);
    }
    // Close the side between back[0] and back[5] / front[0] and front[5]
    sideIdx.push(0, 5, 6,  6, 5, 11);

    const geo  = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex([...fIdx, ...bIdx, ...sideIdx]);
    geo.computeVertexNormals();

    this.palmMesh = new THREE.Mesh(geo, this.skinMat);
    this.palmMesh.castShadow    = true;
    this.palmMesh.receiveShadow = true;
    this.handGroup.add(this.palmMesh);

    // Save reference indices for live update
    this.palmLm = palmLm;
    this._palmThickness = thickness;
  }

  // ─────────────────────────────────────────────────────────────
  //  LIVE UPDATE — rebuild tubes and palm every frame
  // ─────────────────────────────────────────────────────────────

  updateBones() {
    // Rebuild each finger tube segment in place (dispose old geo, create new one)
    for (const ft of this.fingerTubes) {
      const segMeshes = ft.tubeGroup.userData.segMeshes;
      const { indices, radii } = ft.chain;
      segMeshes.forEach((sm, s) => {
        const p0 = this.jointNodes[indices[s]];
        const p1 = this.jointNodes[indices[s + 1]];
        sm.mesh.geometry.dispose();
        sm.mesh.geometry = this._taperedTube(p0, p1, radii[s], radii[s + 1]);
      });
    }

    // Update wrist sphere position
    if (this.wristMesh) {
      this.wristMesh.position.copy(this.jointNodes[0]);
    }

    // Update palm mesh vertices
    if (this.palmMesh) {
      const pAttr = this.palmMesh.geometry.attributes.position;
      const half  = this._palmThickness * 0.5;
      this.palmLm.forEach((idx, i) => {
        const p = this.jointNodes[idx];
        // front vertex (first 6)
        pAttr.setXYZ(i,     p.x, p.y, p.z + half);
        // back vertex (last 6)
        pAttr.setXYZ(i + 6, p.x, p.y, p.z - half);
      });
      pAttr.needsUpdate = true;
      this.palmMesh.geometry.computeVertexNormals();
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  APPLY MEDIAPIPE LANDMARKS
  // ─────────────────────────────────────────────────────────────

  applyLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 21) return;
    const wrist = landmarks[0];
    const scale = 15;
    landmarks.slice(0, 21).forEach((lm, i) => {
      this.jointNodes[i].set(
        (lm.x - wrist.x) * scale,
        -(lm.y - wrist.y) * scale - 1.5,
        -(lm.z || 0) * (scale * 1.3)
      );
    });
    this.updateBones();
  }

  // ─────────────────────────────────────────────────────────────
  //  GLB LOADER (unchanged)
  // ─────────────────────────────────────────────────────────────

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
        if (size > 0) { const sf = 12 / size; this.loadedModel.scale.set(sf, sf, sf); }
        this.scene.add(this.loadedModel);
        if (this.handGroup) this.handGroup.visible = false;
        resolve({ success: true, isRigged: hasBones });
      }, undefined, (err) => { console.error("GLB load failed:", err); reject(err); });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  DYNAMIC SEQUENCE PLAYBACK (unchanged API)
  // ─────────────────────────────────────────────────────────────

  loadDynamicSequence(frames, duration, fps = 30) {
    this.animationFrames = frames || [];
    if (this.animationFrames.length === 0) { this.duration = duration || 4.0; return; }
    const lastFrame = this.animationFrames[this.animationFrames.length - 1];
    if (lastFrame && typeof lastFrame.timestamp === "number" && lastFrame.timestamp > 0) {
      this.duration = lastFrame.timestamp;
    } else if (duration && duration > 0) {
      this.duration = duration;
    } else {
      this.duration = this.animationFrames.length / (fps || 30);
    }
    this.currentTime = 0;
    this.isPlaying   = true;
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
    if (typeof this.animationFrames[0].timestamp === "number") {
      let best = 0, bestDiff = Infinity;
      for (let i = 0; i < this.animationFrames.length; i++) {
        const diff = Math.abs(this.animationFrames[i].timestamp - timeSec);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      }
      frame = this.animationFrames[best];
    } else {
      const progress = Math.min(1.0, timeSec / (this.duration || 1.0));
      frame = this.animationFrames[Math.floor(progress * (this.animationFrames.length - 1))];
    }
    if (frame) {
      const lm = (frame.right_hand_landmarks && frame.right_hand_landmarks.length === 21)
        ? frame.right_hand_landmarks
        : (frame.left_hand_landmarks && frame.left_hand_landmarks.length === 21)
          ? frame.left_hand_landmarks : null;
      if (lm) this.applyLandmarks(lm);
    }
    if (this.onTimelineUpdate) this.onTimelineUpdate(timeSec, this.duration);
  }

  setView(preset) {
    if (preset === "front")      { this.rotation = { x: 0, y: 0 }; }
    else if (preset === "side")  { this.rotation = { x: 0, y: Math.PI / 2 }; }
    else if (preset === "top")   { this.rotation = { x: Math.PI / 2 - 0.05, y: 0 }; }
    else { this.rotation = { x: 0.2, y: -0.3 }; this.zoom = 28; }
    this.updateCamera();
    if (this.controls) this.controls.reset();
  }

  renderLoop() {
    this.animFrameId = requestAnimationFrame(() => this.renderLoop());
    if (this.controls) this.controls.update();
    if (this.isPlaying && this.animationFrames.length > 0) {
      const delta = this.clock.getDelta();
      this.currentTime += delta * this.playbackSpeed;
      if (this.currentTime >= this.duration) { this.currentTime = 0; this.clock.start(); }
      this.applySequenceFrameAt(this.currentTime);
    } else {
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
