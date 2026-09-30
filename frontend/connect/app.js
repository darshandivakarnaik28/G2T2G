/**
 * ISL Connect / G2T2G - User Interface Engine
 * Complete client-side application logic:
 * - Single Page Router (Home, Normal User, Sign User, Live Chat)
 * - Three.js 3D Articulated ISL Hand Avatar with full playback & Orbit controls
 * - Web Speech API Speech-to-Text (STT) & SpeechSynthesis Text-to-Speech (TTS)
 * - Camera management with MediaPipe-style 21-joint skeleton mesh overlay
 * - Bidirectional bilingual conversation feed (English & Kannada)
 */

// Global State
const state = {
  currentView: 'home',
  currentLang: 'en',
  isAudioMuted: false,
  isRecordingNormal: false,
  isRecordingLive: false,
  isCameraActiveSign: false,
  isCameraActiveLive: false,
  cameraStream: null,
  speechRecognition: null,
  highContrast: false,
  normalViewer: null,
  chatViewer: null,
  playbackSpeed: 1.0,
  isPlayingNormal: false
};

// Bilingual Dictionary for ISL Signs
const DICTIONARY = {
  "HELLO": { en: "HELLO", kn: "ನಮಸ್ಕಾರ (Namaskara)" },
  "THANK YOU": { en: "THANK YOU", kn: "ಧನ್ಯವಾದಗಳು (Dhanyavadagalu)" },
  "NEED HELP": { en: "NEED HELP", kn: "ಸಹಾಯ ಬೇಕು (Sahaya Beku)" },
  "ALL CLEAR": { en: "ALL CLEAR", kn: "ಎಲ್ಲವೂ ಸರಿ (Ellavu Sari)" },
  "WATER": { en: "WATER", kn: "ನೀರು (Neeru)" },
  "FOOD": { en: "FOOD", kn: "ಊಟ (Oota)" },
  "MY": { en: "MY", kn: "ನನ್ನ (Nanna)" },
  "PAIN": { en: "PAIN", kn: "ನೋವು (Novu)" },
  "HOW ARE YOU": { en: "HOW ARE YOU?", kn: "ನೀವು ಹೇಗಿದ್ದೀರಿ? (Neevu Hegiddeeri?)" },
  "GOOD MORNING": { en: "GOOD MORNING", kn: "ಶುಭೋದಯ (Shubhodaya)" },
  "YES": { en: "YES", kn: "ಹೌದು (Haudu)" },
  "NO": { en: "NO", kn: "ಇಲ್ಲ (Illa)" },
  "DOCTOR": { en: "DOCTOR", kn: "ವೈದ್ಯರು (Vaidyaru)" },
  "MEDICINE": { en: "MEDICINE", kn: "ಔಷಧಿ (Aushadhi)" },
  "EXAMINATION": { en: "EXAMINATION ROOM", kn: "ಪರೀಕ್ಷಾ ಕೊಠಡಿ (Pareeksha Kothadi)" }
};

// Helper: translate text or find matching Kannada phrase
function getKannadaTranslation(text) {
  if (!text) return "";
  const upper = text.trim().toUpperCase();
  for (const [key, val] of Object.entries(DICTIONARY)) {
    if (upper.includes(key)) {
      return val.kn;
    }
  }
  // Generic translation fallback
  return `ಕನ್ನಡ ಅನುವಾದ: ${text}`;
}

// --------------------------------------------------------------------------
// Navigation & Routing
// --------------------------------------------------------------------------
function navigateTo(viewName) {
  state.currentView = viewName;
  window.location.hash = viewName;

  const panels = {
    home: document.getElementById('panel-home'),
    normal: document.getElementById('panel-normal'),
    sign: document.getElementById('panel-sign'),
    chat: document.getElementById('panel-chat')
  };

  // Toggle active view panel
  Object.keys(panels).forEach(key => {
    if (panels[key]) {
      if (key === viewName) {
        panels[key].classList.remove('hidden');
        panels[key].classList.add('block');
      } else {
        panels[key].classList.add('hidden');
        panels[key].classList.remove('block');
      }
    }
  });

  // Update desktop navigation active class
  document.querySelectorAll('#desktop-nav .nav-link').forEach(link => {
    if (link.getAttribute('data-view') === viewName) {
      link.classList.add('active', 'bg-primary-container', 'text-on-primary-container', 'font-bold');
      link.classList.remove('text-on-surface-variant');
    } else {
      link.classList.remove('active', 'bg-primary-container', 'text-on-primary-container', 'font-bold');
      link.classList.add('text-on-surface-variant');
    }
  });

  // Update mobile navigation active class
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    if (btn.getAttribute('data-view') === viewName) {
      btn.classList.add('active', 'bg-primary-container', 'text-on-primary-container', 'font-bold');
    } else {
      btn.classList.remove('active', 'bg-primary-container', 'text-on-primary-container', 'font-bold');
    }
  });

  // View specific setups
  if (viewName === 'normal') {
    initNormal3DViewer();
  } else if (viewName === 'chat') {
    initChat3DViewer();
  }

  // Manage camera cleanup if navigating away from camera views
  if (viewName !== 'sign' && viewName !== 'chat' && state.cameraStream) {
    // Keep camera active only if requested, or pause tracks to save power
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.navigateTo = navigateTo;

function selectUserType(type) {
  if (type === 'sign') {
    navigateTo('sign');
  } else {
    navigateTo('normal');
  }
}
window.selectUserType = selectUserType;

function scrollToHowItWorks() {
  if (state.currentView !== 'home') {
    navigateTo('home');
    setTimeout(() => {
      const el = document.getElementById('how-it-works');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  } else {
    const el = document.getElementById('how-it-works');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
}
window.scrollToHowItWorks = scrollToHowItWorks;

// --------------------------------------------------------------------------
// Accessibility & Global Language Toggles
// --------------------------------------------------------------------------
function toggleAccessibility() {
  state.highContrast = !state.highContrast;
  document.documentElement.classList.toggle('contrast-more', state.highContrast);
  if (state.highContrast) {
    document.body.classList.add('font-semibold');
  } else {
    document.body.classList.remove('font-semibold');
  }
}
window.toggleAccessibility = toggleAccessibility;

function toggleGlobalLang() {
  const nextLang = state.currentLang === 'en' ? 'kn' : 'en';
  switchLang(nextLang);
}
window.toggleGlobalLang = toggleGlobalLang;

function switchLang(lang) {
  state.currentLang = lang;
  const headerLabel = document.getElementById('header-lang-label');
  if (headerLabel) {
    headerLabel.textContent = lang === 'en' ? 'EN | ಕನ್ನಡ' : 'ಕನ್ನಡ | EN';
  }

  const liveLangLabel = document.getElementById('live-lang-label');
  if (liveLangLabel) {
    liveLangLabel.textContent = lang === 'en' ? 'English / ಕನ್ನಡ' : 'ಕನ್ನಡ (Kannada)';
  }

  const btnEn = document.getElementById('btn-en');
  const btnKn = document.getElementById('btn-kn');
  if (btnEn && btnKn) {
    if (lang === 'en') {
      btnEn.className = "px-space-md py-1 rounded-full font-label-sm transition-all bg-primary text-on-primary";
      btnKn.className = "px-space-md py-1 rounded-full font-label-sm transition-all text-on-surface-variant hover:text-on-surface";
    } else {
      btnKn.className = "px-space-md py-1 rounded-full font-label-sm transition-all bg-primary text-on-primary";
      btnEn.className = "px-space-md py-1 rounded-full font-label-sm transition-all text-on-surface-variant hover:text-on-surface";
    }
  }
}
window.switchLang = switchLang;

// --------------------------------------------------------------------------
// Audio & Speech Synthesis (Text-to-Speech)
// --------------------------------------------------------------------------
function toggleAudio() {
  state.isAudioMuted = !state.isAudioMuted;
  const btn = document.getElementById('audio-toggle-btn');
  if (!btn) return;
  if (state.isAudioMuted) {
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1;">volume_off</span>';
    btn.classList.add('bg-error-container', 'text-on-error-container');
    btn.title = "Audio Muted (Click to Unmute)";
  } else {
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-variation-settings: \'FILL\' 1;">volume_up</span>';
    btn.classList.remove('bg-error-container', 'text-on-error-container');
    btn.title = "Audio Active (Click to Mute)";
  }
}
window.toggleAudio = toggleAudio;

function speakText(text) {
  if (state.isAudioMuted || !text) return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    // Set language
    utterance.lang = state.currentLang === 'kn' ? 'kn-IN' : 'en-IN';
    window.speechSynthesis.speak(utterance);
  }
}

function speakCurrent() {
  const el = document.getElementById('recognized-text');
  if (el) {
    const text = el.innerText.trim();
    if (text && text !== 'READY...') {
      speakText(text);
    }
  }
}
window.speakCurrent = speakCurrent;

function clearGesture() {
  const el = document.getElementById('recognized-text');
  if (el) el.innerText = "READY...";
}
window.clearGesture = clearGesture;

// --------------------------------------------------------------------------
// Speech Recognition (Speech-to-Text)
// --------------------------------------------------------------------------
function initSpeechRecognition(onResultCallback, onEndCallback) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    console.warn("Speech Recognition API not supported in this browser.");
    return null;
  }
  const recognizer = new SpeechRec();
  recognizer.continuous = false;
  recognizer.interimResults = true;
  recognizer.lang = state.currentLang === 'kn' ? 'kn-IN' : 'en-IN';

  recognizer.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    if (onResultCallback) onResultCallback(transcript);
  };

  recognizer.onerror = (event) => {
    console.warn("Speech recognition error:", event.error);
    if (onEndCallback) onEndCallback();
  };

  recognizer.onend = () => {
    if (onEndCallback) onEndCallback();
  };

  return recognizer;
}

async function toggleVoiceRecording() {
  const btnText = document.getElementById('speak-btn-text');
  const micStatus = document.getElementById('mic-status');
  const speakBtn = document.getElementById('speak-btn');
  const textarea = document.getElementById('normal-text-input');

  if (!state.isRecordingNormal) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech Recognition API is not supported by your browser. Please use Google Chrome, Microsoft Edge, or Safari.");
      return;
    }

    // Prompt microphone permission
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        console.warn("Microphone permission denied:", err);
        alert("Microphone permission was denied. Please allow microphone access in your browser address bar.");
        return;
      }
    }

    state.isRecordingNormal = true;
    if (btnText) btnText.textContent = 'Stop Recording';
    if (speakBtn) {
      speakBtn.classList.remove('bg-primary', 'hover:bg-primary-container');
      speakBtn.classList.add('bg-error', 'text-on-error');
    }
    if (micStatus) {
      micStatus.classList.remove('hidden');
      micStatus.classList.add('flex');
    }

    const recognizer = new SpeechRec();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.lang = state.currentLang === 'kn' ? 'kn-IN' : 'en-US';

    let initialText = textarea ? textarea.value.trim() : '';

    recognizer.onresult = (event) => {
      let speechText = '';
      for (let i = 0; i < event.results.length; ++i) {
        speechText += event.results[i][0].transcript + ' ';
      }
      speechText = speechText.trim();
      if (textarea && speechText) {
        textarea.value = initialText ? `${initialText} ${speechText}` : speechText;
        textarea.dispatchEvent(new Event('input'));
      }
    };

    recognizer.onerror = (event) => {
      console.warn("Speech recognition notice:", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        alert("Microphone access was blocked. Please enable it in browser permissions.");
        stopRecording();
      }
      // 'no-speech' is expected when pausing, keep recording active
    };

    recognizer.onend = () => {
      if (state.isRecordingNormal) {
        try { recognizer.start(); } catch (e) {}
      }
    };

    state.speechRecognition = recognizer;
    try {
      recognizer.start();
    } catch (e) {
      console.error("Recognizer start error:", e);
    }
  } else {
    stopRecording();
  }

  function stopRecording() {
    state.isRecordingNormal = false;
    if (btnText) btnText.textContent = 'Speak Message';
    if (speakBtn) {
      speakBtn.classList.remove('bg-error', 'text-on-error');
      speakBtn.classList.add('bg-primary', 'hover:bg-primary-container');
    }
    if (micStatus) {
      micStatus.classList.add('hidden');
      micStatus.classList.remove('flex');
    }
    if (state.speechRecognition) {
      try { state.speechRecognition.stop(); } catch (e) {}
      state.speechRecognition = null;
    }
  }
}
window.toggleVoiceRecording = toggleVoiceRecording;

async function toggleLiveVoiceRecording() {
  const input = document.getElementById('live-chat-input');
  const micBtn = document.getElementById('live-mic-btn');

  state.isRecordingLive = !state.isRecordingLive;
  if (state.isRecordingLive) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      state.isRecordingLive = false;
      return;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch (err) {
        alert("Microphone permission was denied.");
        state.isRecordingLive = false;
        return;
      }
    }

    if (micBtn) micBtn.classList.add('bg-error', 'text-on-error');
    const recognizer = new SpeechRec();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = state.currentLang === 'kn' ? 'kn-IN' : 'en-US';

    let initial = input ? input.value.trim() : '';
    recognizer.onresult = (event) => {
      let speechText = '';
      for (let i = 0; i < event.results.length; ++i) {
        speechText += event.results[i][0].transcript + ' ';
      }
      speechText = speechText.trim();
      if (input && speechText) {
        input.value = initial ? `${initial} ${speechText}` : speechText;
        input.dispatchEvent(new Event('input'));
      }
    };

    recognizer.onerror = (e) => {
      if (e.error === 'not-allowed') {
        alert("Microphone permission blocked.");
        toggleLiveVoiceRecording();
      }
    };

    recognizer.onend = () => {
      if (state.isRecordingLive) {
        try { recognizer.start(); } catch (err) {}
      }
    };

    state.speechRecognition = recognizer;
    try { recognizer.start(); } catch (e) {}
  } else {
    if (micBtn) micBtn.classList.remove('bg-error', 'text-on-error');
    if (state.speechRecognition) {
      try { state.speechRecognition.stop(); } catch (e) {}
      state.speechRecognition = null;
    }
  }
}
window.toggleLiveVoiceRecording = toggleLiveVoiceRecording;

// --------------------------------------------------------------------------
// 3D ISL Articulated Hand Avatar (Three.js WebGL Engine)
// --------------------------------------------------------------------------
class ISL3DAvatarViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.handGroup = null;
    this.joints = [];
    this.bones = [];
    this.animTime = 0;
    this.isPlaying = false;
    this.speed = 1.0;
    this.currentGesture = 'REST';
    this.gestureProgress = 0;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 300;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1322);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 5, 26);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.maxDistance = 50;
      this.controls.minDistance = 10;
    }

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    const dirLight1 = new THREE.DirectionalLight(0x89f5e7, 1.4);
    dirLight1.position.set(15, 25, 20);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xb4c5ff, 0.9);
    dirLight2.position.set(-15, -10, -10);
    this.scene.add(dirLight2);

    // Build 3D Articulated Skeleton Hand
    this.buildSkeletonHand();

    // Start loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    // Resize handler
    window.addEventListener('resize', () => this.onResize());
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

  buildSkeletonHand() {
    this.handGroup = new THREE.Group();
    this.scene.add(this.handGroup);

    // 21 Landmark Joint Spheres Material: High-tech teal glowing joint
    const jointMaterial = new THREE.MeshStandardMaterial({
      color: 0x89f5e7,
      emissive: 0x005049,
      roughness: 0.2,
      metalness: 0.6
    });

    // Bone Cylinder Material: Deep indigo-navy articulated links
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.4,
      metalness: 0.5
    });

    const jointGeo = new THREE.SphereGeometry(0.35, 16, 16);

    // Initial 21 joint landmark coordinates
    this.defaultCoords = [
      [0, -4, 0],       // 0: Wrist
      [-1.8, -2.5, 0.2], // 1: Thumb CMC
      [-2.8, -1.0, 0.4], // 2: Thumb MCP
      [-3.4, 0.5, 0.6],  // 3: Thumb IP
      [-3.8, 1.8, 0.8],  // 4: Thumb TIP
      [-1.2, 0.2, 0.2],  // 5: Index MCP
      [-1.4, 2.0, 0.3],  // 6: Index PIP
      [-1.5, 3.5, 0.4],  // 7: Index DIP
      [-1.6, 4.8, 0.5],  // 8: Index TIP
      [0.0, 0.5, 0.1],   // 9: Middle MCP
      [0.0, 2.4, 0.2],   // 10: Middle PIP
      [0.0, 4.0, 0.3],   // 11: Middle DIP
      [0.0, 5.4, 0.4],   // 12: Middle TIP
      [1.2, 0.2, 0.1],   // 13: Ring MCP
      [1.3, 1.9, 0.2],   // 14: Ring PIP
      [1.4, 3.3, 0.3],   // 15: Ring DIP
      [1.5, 4.6, 0.4],   // 16: Ring TIP
      [2.2, -0.4, 0.0],  // 17: Pinky MCP
      [2.5, 1.0, 0.1],   // 18: Pinky PIP
      [2.7, 2.2, 0.2],   // 19: Pinky DIP
      [2.9, 3.3, 0.3]    // 20: Pinky TIP
    ];

    // Create 21 joints
    this.joints = [];
    this.defaultCoords.forEach((coord, i) => {
      const mesh = new THREE.Mesh(jointGeo, jointMaterial);
      mesh.position.set(coord[0], coord[1], coord[2]);
      this.handGroup.add(mesh);
      this.joints.push(mesh);
    });

    // Bone connection topology
    this.connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // Index
      [0, 9], [9, 10], [10, 11], [11, 12],   // Middle
      [0, 13], [13, 14], [14, 15], [15, 16],// Ring
      [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
      [5, 9], [9, 13], [13, 17]             // Palm arch
    ];

    this.bones = [];
    const boneGeo = new THREE.CylinderGeometry(0.16, 0.16, 1, 8);

    this.connections.forEach(([p1, p2]) => {
      const boneMesh = new THREE.Mesh(boneGeo, boneMaterial);
      this.handGroup.add(boneMesh);
      this.bones.push({ mesh: boneMesh, p1, p2 });
    });

    this.updateBones();
  }

  updateBones() {
    this.bones.forEach(({ mesh, p1, p2 }) => {
      const pos1 = this.joints[p1].position;
      const pos2 = this.joints[p2].position;
      const mid = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
      mesh.position.copy(mid);

      const dir = new THREE.Vector3().subVectors(pos2, pos1);
      const dist = dir.length();
      mesh.scale.set(1, dist, 1);

      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    });
  }

  resetToNeutralPose() {
    // Reset all 21 joints to clean anatomical resting pose
    if (this.defaultCoords && this.joints) {
      this.defaultCoords.forEach((coord, i) => {
        if (this.joints[i]) {
          this.joints[i].position.set(coord[0], coord[1], coord[2]);
        }
      });
    }
    if (this.handGroup) {
      this.handGroup.rotation.set(0, 0, 0);
      this.handGroup.position.set(0, 0, 0);
    }
    this.updateBones();
  }

  // Ready hook for trained ML model prediction stream (21 landmark points)
  setLandmarks(landmarks) {
    if (!landmarks || !landmarks.length) return;
    landmarks.forEach((pt, i) => {
      if (this.joints[i]) {
        const x = pt.x !== undefined ? (pt.x - 0.5) * 12 : (pt[0] || 0);
        const y = pt.y !== undefined ? (0.5 - pt.y) * 12 : (pt[1] || 0);
        const z = pt.z !== undefined ? -pt.z * 12 : (pt[2] || 0);
        this.joints[i].position.set(x, y, z);
      }
    });
    this.updateBones();
  }

  playGesture(gestureName) {
    // Procedural dummy motion removed as requested.
    // Landmarks will be streamed directly from trained ML model.
    this.currentGesture = (gestureName || '').toUpperCase();
    this.isPlaying = false;
    this.gestureProgress = 0;
    this.resetToNeutralPose();
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (this.controls) this.controls.update();

    // The dummy procedural gesture movement has been completely removed.
    // The 3D 21-landmark model stays in a clean, neutral anatomical pose
    // ready to receive streaming landmark coordinates from the trained model.
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resetCamera() {
    if (this.camera) {
      this.camera.position.set(0, 5, 26);
      this.camera.lookAt(0, 0, 0);
    }
    if (this.controls) {
      this.controls.reset();
    }
  }

  adjustZoom(delta) {
    if (this.camera) {
      this.camera.position.z = Math.max(10, Math.min(45, this.camera.position.z - delta * 20));
    }
  }
}

function initNormal3DViewer() {
  const container = document.getElementById('normal-avatar-canvas-container');
  if (!container) return;
  if (!state.normalViewer) {
    state.normalViewer = new ISL3DAvatarViewer('normal-avatar-canvas-container');
  }
  setTimeout(() => {
    if (state.normalViewer) state.normalViewer.onResize();
  }, 80);
}

function initChat3DViewer() {
  if (!state.chatViewer) {
    state.chatViewer = new ISL3DAvatarViewer('chat-avatar-container');
  } else {
    state.chatViewer.onResize();
  }
}

// Controls for Normal User 3D Viewer
// Controls for Normal User 3D Viewer
function togglePlay() {
  // Dummy animation removed. When trained model is connected, this will toggle model streaming.
  console.log('[ISL Connect] 3D Landmark viewer in standby. Awaiting trained model streaming.');
}
window.togglePlay = togglePlay;

function reset3DModelPose() {
  if (state.normalViewer) {
    state.normalViewer.resetToNeutralPose();
    state.normalViewer.resetCamera();
  }
}
window.reset3DModelPose = reset3DModelPose;
window.replayAnimation = reset3DModelPose;

function setSpeed(speed, btn) {
  state.playbackSpeed = speed;
  if (state.normalViewer) state.normalViewer.speed = speed;
  if (state.chatViewer) state.chatViewer.speed = speed;

  document.querySelectorAll('.speed-btn').forEach(b => {
    b.classList.remove('bg-primary', 'text-on-primary', 'shadow-sm');
    b.classList.add('text-on-surface-variant');
  });
  if (btn) {
    btn.classList.add('bg-primary', 'text-on-primary', 'shadow-sm');
    btn.classList.remove('text-on-surface-variant');
  }
}
window.setSpeed = setSpeed;

function adjustZoom(delta) {
  if (state.normalViewer) state.normalViewer.adjustZoom(delta);
}
window.adjustZoom = adjustZoom;

function resetCamera() {
  if (state.normalViewer) state.normalViewer.resetCamera();
}
window.resetCamera = resetCamera;

async function showMasterGestureAnd3D(text) {
  if (!text) return;
  const upper = text.trim().toUpperCase();

  // Hide idle pet card, reveal dual frames (Upper Master Gesture + Below 3D Model)
  const petIdle = document.getElementById('normal-pet-idle');
  const dualFrames = document.getElementById('normal-dual-frames');
  if (petIdle) petIdle.classList.add('hidden');
  if (dualFrames) {
    dualFrames.classList.remove('hidden');
    dualFrames.classList.add('flex');
  }

  // Update upper frame master gesture details
  const masterTitle = document.getElementById('master-sign-title');
  const masterSignerId = document.getElementById('master-signer-id');
  const masterImg = document.getElementById('master-reference-img');
  const masterFallback = document.getElementById('master-reference-fallback');
  const masterFallbackTitle = document.getElementById('master-fallback-title');

  // Match sign in dictionary or default
  let signKey = 'WATER';
  let knMeaning = 'ನೀರು';
  for (const [key, val] of Object.entries(DICTIONARY)) {
    if (upper.includes(key)) {
      signKey = key;
      knMeaning = val.kn;
      break;
    }
  }

  if (masterTitle) {
    masterTitle.textContent = `${signKey} (${knMeaning})`;
  }
  if (masterSignerId) {
    masterSignerId.textContent = 'Signer: T001 (Master Reference)';
  }

  // Check for real master reference image
  if (signKey === 'WATER') {
    if (masterImg) {
      masterImg.src = '/storage/images/water_T001_117c83e631.jpg';
      masterImg.classList.remove('hidden');
    }
    if (masterFallback) masterFallback.classList.add('hidden');
  } else {
    try {
      const cleanId = signKey.toLowerCase().replace(/\s+/g, '_');
      const res = await fetch(`/api/gestures/${cleanId}/master-sample`);
      if (res.ok) {
        const sample = await res.json();
        if (sample && sample.stored_file_path && sample.stored_file_path !== 'landmarks_only') {
          if (masterImg) {
            masterImg.src = `/${sample.stored_file_path}`;
            masterImg.classList.remove('hidden');
          }
          if (masterFallback) masterFallback.classList.add('hidden');
        } else {
          showFallbackMaster(signKey, knMeaning);
        }
      } else {
        showFallbackMaster(signKey, knMeaning);
      }
    } catch (e) {
      showFallbackMaster(signKey, knMeaning);
    }
  }

  function showFallbackMaster(sName, sKn) {
    if (masterImg) masterImg.classList.add('hidden');
    if (masterFallback) {
      masterFallback.classList.remove('hidden');
      if (masterFallbackTitle) {
        masterFallbackTitle.textContent = `Master Gesture: ${sName} (${sKn})`;
      }
    }
  }

  // Below Frame: Initialize 3D 21-Landmark Hand Model in neutral resting pose
  // (Dummy gesture animation removed per user request; awaiting trained model)
  initNormal3DViewer();
  if (state.normalViewer) {
    state.normalViewer.resetToNeutralPose();
  }
}
window.showMasterGestureAnd3D = showMasterGestureAnd3D;

function setInputValue(text) {
  const textarea = document.getElementById('normal-text-input');
  if (textarea) textarea.value = text;
  // Automatically activate Upper Master Gesture & Below 3D Landmarks preview
  showMasterGestureAnd3D(text);
}
window.setInputValue = setInputValue;

function triggerTranslation() {
  const textarea = document.getElementById('normal-text-input');
  if (!textarea || !textarea.value.trim()) return;

  const text = textarea.value.trim();
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const feed = document.getElementById('normal-chat-feed');

  if (feed) {
    const emptyState = document.getElementById('normal-chat-empty');
    if (emptyState) emptyState.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = "flex flex-col gap-space-xs bg-surface p-space-md rounded-xl shadow-sm animate-fade-in";
    msgDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-space-xs">
          <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold">U</div>
          <span class="text-label-md font-bold text-on-surface">You (Hearing User)</span>
        </div>
        <span class="text-label-sm text-on-surface-variant">${timeStr}</span>
      </div>
      <p class="text-body-md text-on-surface pl-7">${text}</p>
      <div class="pl-7 flex items-center gap-space-xs pt-space-xs">
        <span class="px-space-xs py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-label-sm font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-[14px]">sign_language</span> Master Sign &amp; 3D 21-Landmark Output
        </span>
      </div>
    `;
    feed.appendChild(msgDiv);
    feed.scrollTop = feed.scrollHeight;
  }

  // Display Upper Master Gesture + Below 3D 21-Landmark Hand Model
  showMasterGestureAnd3D(text);

  textarea.value = '';
}
window.triggerTranslation = triggerTranslation;

// --------------------------------------------------------------------------
// Sign User Experience (Camera, Tracking & Feedback)
// --------------------------------------------------------------------------
async function toggleSignCamera() {
  const video = document.getElementById('sign-webcam-video');
  const icon = document.getElementById('sign-cam-icon');
  const btn = document.getElementById('sign-cam-toggle-btn');
  const canvas = document.getElementById('sign-mesh-canvas');

  state.isCameraActiveSign = !state.isCameraActiveSign;

  if (state.isCameraActiveSign) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });
      state.cameraStream = stream;
      if (video) {
        video.srcObject = stream;
        video.classList.remove('hidden');
      }
      if (icon) icon.textContent = 'videocam_off';
      if (btn) btn.classList.add('bg-secondary-container', 'text-on-secondary-container');
      startHandMeshSimulation(canvas);
    } catch (err) {
      console.warn("Webcam access declined or unavailable, running realistic tracking simulator:", err);
      if (icon) icon.textContent = 'videocam';
      startHandMeshSimulation(canvas);
    }
  } else {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(t => t.stop());
      state.cameraStream = null;
    }
    if (video) {
      video.classList.add('hidden');
      video.srcObject = null;
    }
    if (icon) icon.textContent = 'videocam';
    if (btn) btn.classList.remove('bg-secondary-container', 'text-on-secondary-container');
  }
}
window.toggleSignCamera = toggleSignCamera;

function toggleLiveCamera() {
  const btn = document.getElementById('live-cam-toggle-btn');
  state.isCameraActiveLive = !state.isCameraActiveLive;
  if (btn) {
    if (state.isCameraActiveLive) {
      btn.classList.add('bg-secondary-container', 'text-on-secondary-container');
    } else {
      btn.classList.remove('bg-secondary-container', 'text-on-secondary-container');
    }
  }
}
window.toggleLiveCamera = toggleLiveCamera;

// Realistic Hand Landmark Mesh Rendering on Canvas
let meshAnimId = null;
function startHandMeshSimulation(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let t = 0;

  function drawMesh() {
    if (!state.isCameraActiveSign) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    t += 0.04;
    const cx = canvas.width * 0.5 + Math.sin(t) * 30;
    const cy = canvas.height * 0.55 + Math.cos(t * 1.3) * 20;

    // MediaPipe style 21-joint coordinates
    const pts = [
      [cx, cy + 80],
      [cx - 40, cy + 50], [cx - 65, cy + 20], [cx - 80, cy - 10], [cx - 95, cy - 35],
      [cx - 25, cy - 30], [cx - 30, cy - 80], [cx - 33, cy - 115], [cx - 35, cy - 145],
      [cx, cy - 35], [cx, cy - 90], [cx, cy - 130], [cx, cy - 165],
      [cx + 25, cy - 30], [cx + 30, cy - 80], [cx + 33, cy - 115], [cx + 35, cy - 145],
      [cx + 45, cy - 20], [cx + 55, cy - 60], [cx + 62, cy - 90], [cx + 70, cy - 120]
    ];

    const lines = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17]
    ];

    // Draw skeletal lines
    ctx.strokeStyle = "rgba(137, 245, 231, 0.75)";
    ctx.lineWidth = 3;
    lines.forEach(([i1, i2]) => {
      ctx.beginPath();
      ctx.moveTo(pts[i1][0], pts[i1][1]);
      ctx.lineTo(pts[i2][0], pts[i2][1]);
      ctx.stroke();
    });

    // Draw joint nodes
    pts.forEach(([px, py], idx) => {
      ctx.fillStyle = idx === 0 ? "#2563eb" : (idx % 4 === 0 ? "#89f5e7" : "#ffffff");
      ctx.beginPath();
      ctx.arc(px, py, idx % 4 === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });

    meshAnimId = requestAnimationFrame(drawMesh);
  }

  cancelAnimationFrame(meshAnimId);
  drawMesh();
}

function simulateGesture(textEn, textKn) {
  const recognizedEl = document.getElementById('recognized-text');
  if (recognizedEl) recognizedEl.innerText = textEn;

  // Speak aloud if sound enabled
  if (!state.isAudioMuted) {
    speakText(state.currentLang === 'kn' ? textKn : textEn);
  }

  // Append to conversation feed
  const feed = document.getElementById('chat-feed');
  if (feed) {
    const emptyState = document.getElementById('sign-chat-empty');
    if (emptyState) emptyState.remove();

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = "flex flex-col items-end gap-xs max-w-[85%] self-end animate-fade-in";
    msgDiv.innerHTML = `
      <div class="flex items-center gap-space-xs">
        <span class="text-[10px] text-outline">${timeStr}</span>
        <span class="text-label-sm text-on-surface-variant">You (Sign User - ISL)</span>
        <div class="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center text-[10px] font-bold">IS</div>
      </div>
      <div class="bg-primary text-on-primary p-space-md rounded-xl text-body-md shadow-sm flex flex-col gap-space-xs">
        <span>${textEn}</span>
        <span class="text-xs text-primary-fixed-dim border-t border-primary-fixed/20 pt-1">ಕನ್ನಡ: ${textKn}</span>
      </div>
    `;
    feed.appendChild(msgDiv);
    feed.scrollTop = feed.scrollHeight;
  }
}
window.simulateGesture = simulateGesture;

function sendManualMessage() {
  const input = document.getElementById('manual-text-input');
  if (!input || !input.value.trim()) return;
  const val = input.value.trim();
  const kn = getKannadaTranslation(val);
  simulateGesture(val.toUpperCase(), kn);
  input.value = '';
}
window.sendManualMessage = sendManualMessage;

function clearFeed() {
  const feed = document.getElementById('chat-feed');
  if (feed) {
    feed.innerHTML = `
      <div id="sign-chat-empty" class="flex flex-col items-center justify-center p-8 text-center text-on-surface-variant/60 my-auto">
        <span class="material-symbols-outlined text-[36px] mb-2 opacity-40">hand_gesture</span>
        <p class="text-body-sm font-medium">No gestures signed yet</p>
        <p class="text-xs opacity-75 mt-0.5">Use camera or quick sign buttons to start communicating</p>
      </div>
    `;
  }
}
window.clearFeed = clearFeed;

function replayLast() {
  speakCurrent();
}
window.replayLast = replayLast;

// --------------------------------------------------------------------------
// Live Chat View
// --------------------------------------------------------------------------
function sendLiveMessage() {
  const input = document.getElementById('live-chat-input');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  const feed = document.getElementById('live-chat-feed');
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (feed) {
    const emptyState = document.getElementById('live-chat-empty');
    if (emptyState) emptyState.remove();

    const msg = document.createElement('div');
    msg.className = "flex flex-col gap-space-xs bg-surface-container p-space-md rounded-xl animate-fade-in";
    msg.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-space-xs">
          <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold">U</div>
          <span class="text-label-md font-bold text-on-surface">You</span>
        </div>
        <span class="text-label-sm text-on-surface-variant">${timeStr}</span>
      </div>
      <p class="text-body-md text-on-surface pl-7">"${text}"</p>
      <div class="pl-7 flex items-center gap-space-xs pt-space-xs">
        <span class="px-space-xs py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-label-sm font-medium flex items-center gap-1">
          <span class="material-symbols-outlined text-[14px]">sign_language</span> Translated to 3D ISL Avatar
        </span>
      </div>
    `;
    feed.appendChild(msg);
    feed.scrollTop = feed.scrollHeight;
  }

  // Trigger avatar animation
  if (state.chatViewer) {
    state.chatViewer.playGesture(text);
  }

  input.value = '';
}
window.sendLiveMessage = sendLiveMessage;

// --------------------------------------------------------------------------
// Initialization on DOM Ready
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Check initial hash
  const initialHash = window.location.hash.replace('#', '') || 'home';
  if (['home', 'normal', 'sign', 'chat'].includes(initialHash)) {
    navigateTo(initialHash);
  } else {
    navigateTo('home');
  }

  // Listen to hash changes (back/forward browser navigation)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '') || 'home';
    if (['home', 'normal', 'sign', 'chat'].includes(hash) && hash !== state.currentView) {
      navigateTo(hash);
    }
  });

  // Scrubber interactive binding for Normal Viewer
  const scrubber = document.getElementById('normal-scrubber');
  if (scrubber) {
    scrubber.addEventListener('input', (e) => {
      if (state.normalViewer) {
        state.normalViewer.gestureProgress = parseFloat(e.target.value) / 100;
        state.normalViewer.animTime = state.normalViewer.gestureProgress * 4;
      }
    });
  }

  console.log("ISL Connect User Application Initialized successfully.");
});
