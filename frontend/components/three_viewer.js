/**
 * Three.js 3D Articulated Hand Viewer — Upgraded
 * Fixes: dynamic playback timing, realistic skin-tone visuals, palm mesh, accurate timestamp-based frame seek
 */

export class ThreeHandViewer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.options = options || {};
    // Auto-detect mode if container id contains "skeleton", otherwise use options.mode or default to "hand"
    this.mode = this.options.mode || (containerId && containerId.includes("skeleton") ? "skeleton" : "hand");

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
    this.zoom = this.mode === "both" ? 32 : 24;
    this.rotation = { x: 0.15, y: -0.2 };
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
      this.controls.maxDistance = 75;
    } else {
      this.setupMouseOrbit();
    }

    // Lighting for dual-tier skeleton and stylized 3D hand
    const ambientLight = new THREE.AmbientLight(0xfff8f2, 0.7);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff0d8, 1.8);
    keyLight.position.set(15, 30, 25);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd0e4ff, 0.7);
    fillLight.position.set(-20, 5, -15);
    this.scene.add(fillLight);

    const bottomRimLight = new THREE.DirectionalLight(0xffe8dc, 0.5);
    bottomRimLight.position.set(0, -20, 15);
    this.scene.add(bottomRimLight);

    // Floor grid
    const gridY = this.mode === "both" ? -15 : -8;
    const grid = new THREE.GridHelper(30, 20, 0x1e293b, 0x151f30);
    grid.position.y = gridY;
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

  /** Build realistic dual-tier articulated dual-hand rig (Top Skeleton + Bottom 3D Hand) */
  buildArticulatedRig() {
    if (this.rightHand) this.scene.remove(this.rightHand.group);
    if (this.leftHand) this.scene.remove(this.leftHand.group);

    this.rightHand = this._createRig("right");
    this.leftHand = this._createRig("left");

    // Compatibility aliases for legacy single-hand references
    this.handGroup = this.rightHand.group;
    this.jointNodes = this.rightHand.jointNodes;
    this.boneMeshes = this.rightHand.boneMeshes;
    this.palmMesh = this.rightHand.palmMesh;
  }

  _createRig(side = "right") {
    const isLeft = side.toLowerCase() === "left";
    const group = new THREE.Group();
    this.scene.add(group);

    // Two tiers inside this hand's group:
    // Top Half: Exact 21 MediaPipe landmark skeleton
    // Bottom Half: Stylized volumetric 3D hand model with colored palm pads
    const skeletonGroup = new THREE.Group();
    const handMeshGroup = new THREE.Group();
    group.add(skeletonGroup);
    group.add(handMeshGroup);

    let Y_TOP = 0.0;
    let Y_BOTTOM = 0.0;
    if (this.mode === "both") {
      Y_TOP = 6.0;
      Y_BOTTOM = -6.5;
      skeletonGroup.visible = true;
      handMeshGroup.visible = true;
    } else if (this.mode === "skeleton") {
      Y_TOP = 0.0;
      skeletonGroup.visible = true;
      handMeshGroup.visible = false;
    } else {
      // "hand" mode: volumetric 3D hand centered
      Y_BOTTOM = 0.0;
      skeletonGroup.visible = false;
      handMeshGroup.visible = true;
    }

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

    // For left hand, mirror X axis in default resting pose
    const landmarkBase = baseCoords.map(c => new THREE.Vector3(isLeft ? -c[0] : c[0], c[1], c[2]));

    const jointSizes = [
      0.55, 0.38, 0.34, 0.30, 0.24, // wrist, thumb
      0.38, 0.32, 0.28, 0.22,       // index
      0.38, 0.32, 0.28, 0.22,       // middle
      0.36, 0.30, 0.26, 0.20,       // ring
      0.32, 0.26, 0.22, 0.18        // pinky
    ];

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    // ==========================================
    // 1. TOP HALF: 21 LANDMARK SKELETON
    // ==========================================
    const skelJointNodes = [];
    const skelJointMat = new THREE.MeshPhongMaterial({
      color: 0x9ec7eb,       // Powder cyan / sky blue tracking sphere
      specular: 0xffffff,
      shininess: 50,
      emissive: 0x1b354d,
      emissiveIntensity: 0.12
    });

    for (let i = 0; i < 21; i++) {
      const geo = new THREE.SphereGeometry(jointSizes[i] || 0.30, 14, 14);
      const mesh = new THREE.Mesh(geo, skelJointMat);
      mesh.position.copy(landmarkBase[i]).add(new THREE.Vector3(0, Y_TOP, 0));
      mesh.castShadow = true;
      skeletonGroup.add(mesh);
      skelJointNodes.push(mesh);
    }

    const skelBoneMat = new THREE.MeshPhongMaterial({
      color: 0xc89664,       // Bronze / copper linkage rod
      specular: 0xffd8b4,
      shininess: 35,
      emissive: 0x2b1708,
      emissiveIntensity: 0.08
    });

    const skelBoneMeshes = [];
    connections.forEach(([fromIdx, toIdx]) => {
      const p1 = skelJointNodes[fromIdx].position;
      const p2 = skelJointNodes[toIdx].position;
      const dist = p1.distanceTo(p2);
      const boneGeo = new THREE.CylinderGeometry(0.16, 0.13, Math.max(0.1, dist), 10, 1);
      const boneMesh = new THREE.Mesh(boneGeo, skelBoneMat);
      boneMesh.castShadow = true;
      skeletonGroup.add(boneMesh);
      skelBoneMeshes.push({ mesh: boneMesh, from: fromIdx, to: toIdx });
    });

    // ==========================================
    // 2. BOTTOM HALF: VOLUMETRIC 3D HAND MESH
    // ==========================================
    const handJointNodes = [];
    const handJointMat = new THREE.MeshPhongMaterial({
      color: 0x9ec7eb,       // Matching soft cyan joint caps
      specular: 0xffffff,
      shininess: 55,
      emissive: 0x1b354d,
      emissiveIntensity: 0.15
    });

    for (let i = 0; i < 21; i++) {
      const r = (jointSizes[i] || 0.30) * 1.15;
      const geo = new THREE.SphereGeometry(r, 14, 14);
      const mesh = new THREE.Mesh(geo, handJointMat);
      mesh.position.copy(landmarkBase[i]).add(new THREE.Vector3(0, Y_BOTTOM, 0));
      mesh.castShadow = true;
      handMeshGroup.add(mesh);
      handJointNodes.push(mesh);
    }

    // Outer robotic shell material (satin white/cream)
    const shellMat = new THREE.MeshPhongMaterial({
      color: 0xf5f7fa,
      specular: 0xdde4ec,
      shininess: 38,
      emissive: 0x181c22,
      emissiveIntensity: 0.06
    });

    // Finger phalanx segments
    const fingerSegments = [
      // Thumb
      { from: 1, to: 2, rTop: 0.44, rBot: 0.42 },
      { from: 2, to: 3, rTop: 0.42, rBot: 0.36 },
      { from: 3, to: 4, rTop: 0.36, rBot: 0.28 },
      // Index
      { from: 5, to: 6, rTop: 0.43, rBot: 0.38 },
      { from: 6, to: 7, rTop: 0.38, rBot: 0.32 },
      { from: 7, to: 8, rTop: 0.32, rBot: 0.25 },
      // Middle
      { from: 9, to: 10, rTop: 0.45, rBot: 0.40 },
      { from: 10, to: 11, rTop: 0.40, rBot: 0.34 },
      { from: 11, to: 12, rTop: 0.34, rBot: 0.26 },
      // Ring
      { from: 13, to: 14, rTop: 0.42, rBot: 0.37 },
      { from: 14, to: 15, rTop: 0.37, rBot: 0.31 },
      { from: 15, to: 16, rTop: 0.31, rBot: 0.24 },
      // Pinky
      { from: 17, to: 18, rTop: 0.38, rBot: 0.33 },
      { from: 18, to: 19, rTop: 0.33, rBot: 0.27 },
      { from: 19, to: 20, rTop: 0.27, rBot: 0.21 }
    ];

    const fingerMeshes = [];
    fingerSegments.forEach(seg => {
      const p1 = handJointNodes[seg.from].position;
      const p2 = handJointNodes[seg.to].position;
      const dist = p1.distanceTo(p2);
      const geo = new THREE.CylinderGeometry(seg.rTop, seg.rBot, Math.max(0.1, dist), 14, 1);
      const mesh = new THREE.Mesh(geo, shellMat);
      mesh.castShadow = true;
      handMeshGroup.add(mesh);
      fingerMeshes.push({ mesh, from: seg.from, to: seg.to });
    });

    // Fingertip rounded domes
    const tipIndices = [4, 8, 12, 16, 20];
    const tipMeshes = [];
    tipIndices.forEach(idx => {
      const geo = new THREE.SphereGeometry(0.26, 12, 12);
      const mesh = new THREE.Mesh(geo, shellMat);
      mesh.castShadow = true;
      handMeshGroup.add(mesh);
      tipMeshes.push({ mesh, idx });
    });

    // ---------------------------------------------------
    // PALM ANATOMY: Red (Thenar) & Blue (Hypothenar) Pads
    // ---------------------------------------------------
    // Thumb muscle pad (Thenar Eminence) - Coral Red
    const thenarMat = new THREE.MeshPhongMaterial({
      color: 0xc9524e,
      specular: 0xffb2ac,
      shininess: 25,
      side: THREE.DoubleSide,
      emissive: 0x361311,
      emissiveIntensity: 0.1
    });

    // Pinky muscle pad (Hypothenar Eminence) - Royal/Periwinkle Blue
    const hypothenarMat = new THREE.MeshPhongMaterial({
      color: 0x5872d4,
      specular: 0xbbcdff,
      shininess: 25,
      side: THREE.DoubleSide,
      emissive: 0x121b44,
      emissiveIntensity: 0.1
    });

    // Dorsal / backplate palm chassis - Clean Matte White
    const dorsalMat = new THREE.MeshPhongMaterial({
      color: 0xf0f3f7,
      specular: 0xdbe2eb,
      shininess: 32,
      side: THREE.DoubleSide,
      emissive: 0x161a22,
      emissiveIntensity: 0.05
    });

    // Thenar Pad (Red) connects [Wrist:0, Thumb:1, ThumbMCP:2, IndexMCP:5, Center:4]
    const thenarGeo = new THREE.BufferGeometry();
    const thenarPositions = new Float32Array(5 * 3);
    const thenarIndices = [
      0, 1, 4,
      1, 2, 4,
      2, 3, 4,
      0, 4, 3
    ];
    thenarGeo.setAttribute("position", new THREE.BufferAttribute(thenarPositions, 3));
    thenarGeo.setIndex(thenarIndices);
    const thenarMesh = new THREE.Mesh(thenarGeo, thenarMat);
    thenarMesh.castShadow = true;
    handMeshGroup.add(thenarMesh);

    // Hypothenar Pad (Blue) connects [Wrist:0, PinkyMCP:17, RingMCP:13, MiddleMCP:9, Center:4]
    const hypothenarGeo = new THREE.BufferGeometry();
    const hypothenarPositions = new Float32Array(5 * 3);
    const hypothenarIndices = [
      0, 1, 4,
      1, 2, 4,
      2, 3, 4,
      0, 4, 3
    ];
    hypothenarGeo.setAttribute("position", new THREE.BufferAttribute(hypothenarPositions, 3));
    hypothenarGeo.setIndex(hypothenarIndices);
    const hypothenarMesh = new THREE.Mesh(hypothenarGeo, hypothenarMat);
    hypothenarMesh.castShadow = true;
    handMeshGroup.add(hypothenarMesh);

    // Dorsal / Backplate connects [Wrist:0, 1, 5, 9, 13, 17]
    const dorsalGeo = new THREE.BufferGeometry();
    const dorsalPositions = new Float32Array(6 * 3);
    const dorsalIndices = [
      0, 1, 2,
      0, 2, 3,
      0, 3, 4,
      0, 4, 5
    ];
    dorsalGeo.setAttribute("position", new THREE.BufferAttribute(dorsalPositions, 3));
    dorsalGeo.setIndex(dorsalIndices);
    const dorsalMesh = new THREE.Mesh(dorsalGeo, dorsalMat);
    dorsalMesh.castShadow = true;
    handMeshGroup.add(dorsalMesh);

    // Initial offset in scene so both hands sit side-by-side at rest
    group.position.set(isLeft ? -5.5 : 5.5, 0, 0);

    const updateBonesAndMeshes = () => {
      // 1. Update top skeleton bone cylinders
      skelBoneMeshes.forEach(b => {
        const p1 = skelJointNodes[b.from].position;
        const p2 = skelJointNodes[b.to].position;
        const distance = p1.distanceTo(p2);
        b.mesh.scale.set(1, Math.max(0.01, distance / (b.mesh.geometry.parameters.height || 1)), 1);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        b.mesh.position.copy(mid);
        const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
        const axis = new THREE.Vector3(0, 1, 0);
        b.mesh.quaternion.setFromUnitVectors(axis, dir);
      });

      // 2. Update bottom finger segment casings
      fingerMeshes.forEach(f => {
        const p1 = handJointNodes[f.from].position;
        const p2 = handJointNodes[f.to].position;
        const distance = p1.distanceTo(p2);
        f.mesh.scale.set(1, Math.max(0.01, distance / (f.mesh.geometry.parameters.height || 1)), 1);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        f.mesh.position.copy(mid);
        const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
        const axis = new THREE.Vector3(0, 1, 0);
        f.mesh.quaternion.setFromUnitVectors(axis, dir);
      });

      // 3. Update fingertips
      tipMeshes.forEach(t => {
        t.mesh.position.copy(handJointNodes[t.idx].position);
      });

      // 4. Update palm cushions
      const p0 = handJointNodes[0].position;
      const p1 = handJointNodes[1].position;
      const p2 = handJointNodes[2].position;
      const p5 = handJointNodes[5].position;
      const p9 = handJointNodes[9].position;
      const p13 = handJointNodes[13].position;
      const p17 = handJointNodes[17].position;

      // Center of palm
      const pCenter = new THREE.Vector3()
        .addVectors(p0, p9).multiplyScalar(0.5)
        .add(new THREE.Vector3(0, 0, 0.45));

      // Thenar pad (Red)
      const tPos = thenarMesh.geometry.attributes.position;
      const setVertex = (posAttr, idx, vec, zOffset = 0) => {
        posAttr.setXYZ(idx, vec.x, vec.y, vec.z + zOffset);
      };

      setVertex(tPos, 0, p0, 0.35);
      setVertex(tPos, 1, p1, 0.40);
      setVertex(tPos, 2, p2, 0.30);
      setVertex(tPos, 3, p5, 0.25);
      setVertex(tPos, 4, pCenter, 0.40);
      tPos.needsUpdate = true;
      thenarMesh.geometry.computeVertexNormals();

      // Hypothenar pad (Blue)
      const hPos = hypothenarMesh.geometry.attributes.position;
      setVertex(hPos, 0, p0, 0.35);
      setVertex(hPos, 1, p17, 0.30);
      setVertex(hPos, 2, p13, 0.25);
      setVertex(hPos, 3, p9, 0.25);
      setVertex(hPos, 4, pCenter, 0.35);
      hPos.needsUpdate = true;
      hypothenarMesh.geometry.computeVertexNormals();

      // Dorsal backplate (White)
      const dPos = dorsalMesh.geometry.attributes.position;
      setVertex(dPos, 0, p0, -0.25);
      setVertex(dPos, 1, p1, -0.25);
      setVertex(dPos, 2, p5, -0.25);
      setVertex(dPos, 3, p9, -0.25);
      setVertex(dPos, 4, p13, -0.25);
      setVertex(dPos, 5, p17, -0.25);
      dPos.needsUpdate = true;
      dorsalMesh.geometry.computeVertexNormals();
    };

    updateBonesAndMeshes();

    const update = (landmarks) => {
      if (!landmarks || landmarks.length < 21) {
        group.visible = false;
        return;
      }
      group.visible = true;
      const wrist = landmarks[0];
      const scale = 14;

      // 1. Global hand translation in 3D camera space
      if (typeof wrist.x === "number" && typeof wrist.y === "number") {
        const transScale = 16.0;
        group.position.set(
          (wrist.x - 0.5) * transScale,
          -(wrist.y - 0.5) * transScale,
          -(wrist.z || 0) * (transScale * 0.8)
        );
      }

      // 2. Articulate finger joints relative to the wrist for both Top Skeleton and Bottom 3D Hand
      landmarks.slice(0, 21).forEach((lm, i) => {
        const dx = (lm.x - wrist.x) * scale;
        const dy = -(lm.y - wrist.y) * scale - 2;
        const dz = -(lm.z || 0) * (scale * 1.2);

        if (skelJointNodes[i]) {
          skelJointNodes[i].position.set(dx, dy + Y_TOP, dz);
        }
        if (handJointNodes[i]) {
          handJointNodes[i].position.set(dx, dy + Y_BOTTOM, dz);
        }
      });

      updateBonesAndMeshes();
    };

    const hide = () => {
      group.visible = false;
    };

    return {
      group,
      skeletonGroup,
      handMeshGroup,
      jointNodes: skelJointNodes,
      boneMeshes: skelBoneMeshes,
      palmMesh: thenarMesh,
      update,
      hide
    };
  }

  /** Map real MediaPipe 21 landmarks to 3D hand rigs (supports single hand array or dual-hand object) */
  applyLandmarks(data) {
    if (!data) return;

    // Single hand array of 21 points
    if (Array.isArray(data)) {
      if (data.length >= 21) {
        if (this.rightHand) this.rightHand.update(data);
        if (this.leftHand) this.leftHand.hide();
      }
      return;
    }

    // Dual-hand object: { right_hand_landmarks, left_hand_landmarks } or { right, left }
    const rightLm = data.right_hand_landmarks || data.right || null;
    const leftLm  = data.left_hand_landmarks  || data.left  || null;

    const hasRight = rightLm && Array.isArray(rightLm) && rightLm.length >= 21;
    const hasLeft  = leftLm  && Array.isArray(leftLm)  && leftLm.length >= 21;

    if (hasRight) {
      if (this.rightHand) this.rightHand.update(rightLm);
    } else {
      if (this.rightHand) this.rightHand.hide();
    }

    if (hasLeft) {
      if (this.leftHand) this.leftHand.update(leftLm);
    } else {
      if (this.leftHand) this.leftHand.hide();
    }
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
      const rightLm = (frame.right_hand_landmarks && frame.right_hand_landmarks.length === 21)
        ? frame.right_hand_landmarks : null;
      const leftLm = (frame.left_hand_landmarks && frame.left_hand_landmarks.length === 21)
        ? frame.left_hand_landmarks : null;

      this.applyLandmarks({
        right_hand_landmarks: rightLm,
        left_hand_landmarks: leftLm
      });
    }

    if (this.onTimelineUpdate) this.onTimelineUpdate(timeSec, this.duration);
  }

  setView(preset) {
    if (preset === "front")  { this.rotation = { x: 0, y: 0 }; }
    else if (preset === "side") { this.rotation = { x: 0, y: Math.PI / 2 }; }
    else if (preset === "top")  { this.rotation = { x: Math.PI / 2 - 0.05, y: 0 }; }
    else { this.rotation = { x: 0.15, y: -0.2 }; this.zoom = this.mode === "both" ? 32 : 24; }
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
    if (this.rightHand && this.scene) this.scene.remove(this.rightHand.group);
    if (this.leftHand && this.scene) this.scene.remove(this.leftHand.group);
    if (this.renderer && this.renderer.domElement && this.container && this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
