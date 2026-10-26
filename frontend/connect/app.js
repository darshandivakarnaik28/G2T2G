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
  isPlayingNormal: false,
  // Real-time ML Inference State
  mlFrameBuffer: [],
  lastMlPredictTime: 0,
  mlPredictInFlight: false,
  lastPredictedGesture: null,
  consecutiveMatchCount: 0,
  lastCommittedGesture: null,
  lastCommittedTime: 0,
  mlPredictionMode: 'auto', // 'auto' | 'static' | 'dynamic'
  // Camera Warmup & First-Time Hand Stabilization State (Waits 5s after first hand detect)
  firstHandDetectTime: 0,
  isFirstHandStabilized: false
};

// Bilingual Dictionary for 45 Trained ISL Signs (27 Static + 18 Dynamic)
const DICTIONARY = {
  "HELLO": { en: "HELLO", kn: "ನಮಸ್ಕಾರ (Namaskara)" },
  "THANK YOU": { en: "THANK YOU", kn: "ಧನ್ಯವಾದಗಳು (Dhanyavadagalu)" },
  "THANK_YOU": { en: "THANK YOU", kn: "ಧನ್ಯವಾದಗಳು (Dhanyavadagalu)" },
  "WATER": { en: "WATER", kn: "ನೀರು (Neeru)" },
  "FOOD": { en: "FOOD", kn: "ಊಟ (Oota)" },
  "MORNING": { en: "MORNING", kn: "ಶುಭೋದಯ (Shubhodaya)" },
  "GOOD MORNING": { en: "GOOD MORNING", kn: "ಶುಭೋದಯ (Shubhodaya)" },
  "MY": { en: "MY", kn: "ನನ್ನ (Nanna)" },
  "YOU": { en: "YOU", kn: "ನೀವು (Neevu)" },
  "YOUR": { en: "YOUR", kn: "ನಿಮ್ಮ (Nimma)" },
  "HER": { en: "HER", kn: "ಅವಳ (Avala)" },
  "WE": { en: "WE", kn: "ನಾವು (Naavu)" },
  "THEY": { en: "THEY", kn: "ಅವರು (Avaru)" },
  "THIS": { en: "THIS", kn: "ಇದು (Idu)" },
  "WHAT": { en: "WHAT", kn: "ಏನು (Eenu)" },
  "WHAT TIME": { en: "WHAT TIME", kn: "ಎಷ್ಟು ಸಮಯ (Eshtu Samaya)" },
  "WHAT_TIME": { en: "WHAT TIME", kn: "ಎಷ್ಟು ಸಮಯ (Eshtu Samaya)" },
  "WHEN": { en: "WHEN", kn: "ಯಾವಾಗ (Yaavaaga)" },
  "WHERE": { en: "WHERE", kn: "ಎಲ್ಲಿ (Elli)" },
  "WHO": { en: "WHO", kn: "ಯಾರು (Yaaru)" },
  "WHY": { en: "WHY", kn: "ಯಾಕೆ (Yaake)" },
  "SUPER": { en: "SUPER", kn: "ಸೂಪರ್ / ಅತ್ಯುತ್ತಮ (Super)" }
};

// Populate A-Z static alphabet signs in DICTIONARY
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
  DICTIONARY[letter] = { en: `Letter ${letter}`, kn: `ಅಕ್ಷರ ${letter}` };
});

// Dynamically sync any newly recorded gestures (sample_count > 0) from the SQLite database
async function syncDatasetGestures() {
  try {
    const res = await fetch('/api/gestures');
    if (!res.ok) return;
    const list = await res.json();
    if (!Array.isArray(list)) return;
    list.forEach(g => {
      if (g && g.sample_count > 0 && g.gesture_id) {
        const keyUpper = (g.name || g.gesture_id).trim().toUpperCase();
        const gidUpper = g.gesture_id.trim().toUpperCase();
        const entry = {
          en: keyUpper,
          kn: g.kannada_meaning || keyUpper,
          gesture_id: g.gesture_id.trim().toLowerCase()
        };
        DICTIONARY[keyUpper] = entry;
        DICTIONARY[gidUpper] = entry;
      }
    });
  } catch (e) {}
}

function cleanKannadaOnly(str) {
  if (!str) return "";
  return String(str)
    .replace(/\([^)]*\)/g, '')
    .replace(/^ಕನ್ನಡ ಅನುವಾದ:\s*/i, '')
    .split('/')[0]
    .trim();
}

// Helper: translate text or find matching Kannada phrase
function getKannadaTranslation(text) {
  if (!text) return "";
  const cleaned = text.trim();
  const upper = cleaned.toUpperCase();
  if (DICTIONARY[upper]) {
    return cleanKannadaOnly(DICTIONARY[upper].kn);
  }
  const multiCharKeys = Object.keys(DICTIONARY)
    .filter(k => k.length > 1)
    .sort((a, b) => b.length - a.length);
  for (const key of multiCharKeys) {
    if (upper.includes(key)) {
      return cleanKannadaOnly(DICTIONARY[key].kn);
    }
  }
  if (DICTIONARY[upper]) {
    return cleanKannadaOnly(DICTIONARY[upper].kn);
  }
  return cleanKannadaOnly(cleaned);
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
  if (viewName !== 'sign' && state.isCameraActiveSign) {
    toggleSignCamera();
  }
  if (viewName !== 'chat' && state.isCameraActiveLive) {
    toggleLiveCamera();
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
// Theme (Dark / Light Mode) Management
// --------------------------------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem('isl_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
  applyTheme(isDark);
}

function applyTheme(isDark) {
  state.isDarkMode = isDark;
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  // Update desktop toggle knob and icon
  const knob = document.getElementById('theme-toggle-knob');
  const knobIcon = document.getElementById('theme-knob-icon');
  const mobileIcon = document.getElementById('mobile-theme-icon');

  if (knob) {
    if (isDark) {
      knob.classList.remove('translate-x-0');
      knob.classList.add('translate-x-6');
    } else {
      knob.classList.remove('translate-x-6');
      knob.classList.add('translate-x-0');
    }
  }

  if (knobIcon) {
    knobIcon.textContent = isDark ? 'dark_mode' : 'light_mode';
    knobIcon.className = `material-symbols-outlined text-[14px] transition-colors duration-200 ${
      isDark ? 'text-primary' : 'text-amber-500'
    }`;
  }

  if (mobileIcon) {
    mobileIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
  }

  localStorage.setItem('isl_theme', isDark ? 'dark' : 'light');
}

function toggleDarkMode() {
  const currentIsDark = document.documentElement.classList.contains('dark');
  applyTheme(!currentIsDark);
}
window.toggleDarkMode = toggleDarkMode;

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

// Instant Dictionary-Based Full Page UI Translations (English <-> Kannada)
const UI_TRANSLATIONS = {
  // Navigation & Header / Footer
  "G2T2G": "G2T2G",
  "ISL Connect": "ISL ಕನೆಕ್ಟ್",
  "Home": "ಮುಖಪುಟ",
  "Normal": "ಸಾಮಾನ್ಯ",
  "Normal User": "ಸಾಮಾನ್ಯ ಬಳಕೆದಾರ",
  "Hearing User": "ಸಾಮಾನ್ಯ ಬಳಕೆದಾರ",
  "Sign": "ಸೈನ್",
  "Sign User": "ಸೈನ್ ಬಳಕೆದಾರ",
  "Live Chat": "ಲೈವ್ ಚಾಟ್",
  "Live Workspace": "ಲೈವ್ ಕಾರ್ಯಕ್ಷೇತ್ರ",
  "How it Works": "ಇದು ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ",
  "How It Works": "ಇದು ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ",
  "How ISL Connect Works": "ISL ಕನೆಕ್ಟ್ ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ",
  "Toggle dark mode": "ಡಾರ್ಕ್ ಮೋಡ್ ಬದಲಿಸಿ",
  "© 2024 ISL Connect - G2T2G Bridging Indian Sign Language. All rights reserved.": "© 2024 ISL ಕನೆಕ್ಟ್ - G2T2G ಭಾರತೀಯ ಸಂಜ್ಞಾ ಭಾಷೆ ಸೇತುವೆ. ಎಲ್ಲಾ ಹಕ್ಕುಗಳನ್ನು ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ.",

  // Home Hero & Cards
  "Next-Gen ISL Translation & Communication": "ಹೊಸ ತಲೆಮಾರಿನ ISL ಅನುವಾದ ಮತ್ತು ಸಂವಹನ",
  "Communicate Beyond Words": "ಪದಗಳನ್ನು ಮೀರಿ ಸಂವಹನ ನಡೆಸಿ",
  "Real-time Indian Sign Language communication bridging sign users and hearing individuals instantly. Empowering seamless, accessible conversations everywhere.": "ಸೈನ್ ಬಳಕೆದಾರರು ಮತ್ತು ಸಾಮಾನ್ಯ ಜನರನ್ನು ತಕ್ಷಣವೇ ಬೆಸೆಯುವ ನೈಜ-ಸಮಯದ ಭಾರತೀಯ ಸಂಜ್ಞಾ ಭಾಷೆ ಸಂವಹನ ವೇದಿಕೆ.",
  "Start Communication": "ಸಂವಹನ ಪ್ರಾರಂಭಿಸಿ",
  "Translation Accuracy": "ಅನುವಾದ ನಿಖರತೆ",
  "Real-time Latency": "ನೈಜ-ಸಮಯದ ವೇಗ",
  "Accessible Support": "ಲಭ್ಯವಿರುವ ಬೆಂಬಲ",
  "Live ISL Stream": "ಲೈವ್ ISL ಸ್ಟ್ರೀಮ್",
  "Select Your Communication Mode": "ನಿಮ್ಮ ಸಂವಹನ ವಿಧಾನವನ್ನು ಆಯ್ಕೆಮಾಡಿ",
  "Choose your preferred way to interact. Our platform dynamically adapts to bridge the gap effortlessly.": "ನಿಮ್ಮ ಆದ್ಯತೆಯ ಸಂವಹನ ವಿಧಾನವನ್ನು ಆರಿಸಿ. ನಮ್ಮ ವೇದಿಕೆಯು ಸುಲಭವಾಗಿ ಸಂವಹನ ನಡೆಸಲು ನೆರವಾಗುತ್ತದೆ.",
  "Primary Interface": "ಪ್ರಾಥಮಿಕ ಇಂಟರ್ಫೇಸ್",
  "Communicate naturally using Indian Sign Language (ISL). Camera captures your signs and translates them to voice and text in real-time.": "ಭಾರತೀಯ ಸಂಜ್ಞಾ ಭಾಷೆ (ISL) ಬಳಸಿ ಸಹಜವಾಗಿ ಸಂವಹನ ನಡೆಸಿ. ಕ್ಯಾಮೆರಾ ನಿಮ್ಮ ಸೈನ್‌ಗಳನ್ನು ಗುರುತಿಸಿ ಧ್ವನಿ ಮತ್ತು ಪಠ್ಯಕ್ಕೆ ಅನುವಾದಿಸುತ್ತದೆ.",
  "AI-powered sign recognition with 21 joints": "21 ಕೀಲುಗಳ AI ಆಧಾರಿತ ಸೈನ್ ಗುರುತಿಸುವಿಕೆ",
  "Instant voice synthesis for hearing participants": "ಕೇಳಿಸಿಕೊಳ್ಳುವವರಿಗೆ ತಕ್ಷಣದ ಧ್ವನಿ ಅನುವಾದ",
  "Start as Sign User": "ಸೈನ್ ಬಳಕೆದಾರರಾಗಿ ಪ್ರಾರಂಭಿಸಿ",
  "Hearing / Speech Interface": "ಧ್ವನಿ / ಪಠ್ಯ ಇಂಟರ್ಫೇಸ್",
  "Communicate using Text input or Voice transcription. Your messages are instantly translated into visual ISL animations and avatars.": "ಪಠ್ಯ ಅಥವಾ ಧ್ವನಿಯ ಮೂಲಕ ಸಂವಹನ ನಡೆಸಿ. ನಿಮ್ಮ ಸಂದೇಶಗಳನ್ನು ತಕ್ಷಣವೇ ದೃಶ್ಯ ISL ಸೈನ್ ಮತ್ತು 3D ಅವತಾರ್‌ಗೆ ಅನುವಾದಿಸಲಾಗುತ್ತದೆ.",
  "Speech-to-ISL instant voice transcription": "ಧ್ವನಿಯಿಂದ ISL ಗೆ ತಕ್ಷಣದ ಅನುವಾದ",
  "Interactive 3D 21-landmark hand rendering": "ಸಂವಾದಾತ್ಮಕ 3D 21-ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಕೈ ಮಾದರಿ",
  "Start as Hearing User": "ಸಾಮಾನ್ಯ ಬಳಕೆದಾರರಾಗಿ ಪ್ರಾರಂಭಿಸಿ",

  // Architecture / How It Works Section
  "End-to-End Bidirectional Pipeline": "ದ್ವಿಮುಖ ಅನುವಾದ ವ್ಯವಸ್ಥೆ",
  "Our hybrid neural architecture seamlessly translates Indian Sign Language and Spoken/Written Language in sub-second real-time with dual visual confirmation.": "ನಮ್ಮ ಹೈಬ್ರಿಡ್ ನರಮಂಡಲ ವ್ಯವಸ್ಥೆಯು ಭಾರತೀಯ ಸಂಜ್ಞಾ ಭಾಷೆ ಮತ್ತು ಧ್ವನಿ/ಪಠ್ಯ ಭಾಷೆಯನ್ನು ತಕ್ಷಣವೇ ದ್ವಿಮುಖವಾಗಿ ಅನುವಾದಿಸುತ್ತದೆ.",
  "Complete Pipeline": "ಪೂರ್ಣ ವ್ಯವಸ್ಥೆ",
  "Sign → Voice/Text": "ಸೈನ್ → ಧ್ವನಿ/ಪಠ್ಯ",
  "Voice/Text → 3D ISL": "ಧ್ವನಿ/ಪಠ್ಯ → 3D ISL",
  "Step 01": "ಹಂತ 01",
  "Step 02": "ಹಂತ 02",
  "Step 03": "ಹಂತ 03",
  "Step 04": "ಹಂತ 04",
  "AI Vision Tracking": "AI ಕ್ಯಾಮೆರಾ ಟ್ರ್ಯಾಕಿಂಗ್",
  "Real-time camera tracks": "ನೈಜ-ಸಮಯದ ಕ್ಯಾಮೆರಾ ಪ್ರತಿ ಕೈಯ",
  "21 3D hand landmarks": "21 3D ಹ್ಯಾಂಡ್ ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್‌ಗಳನ್ನು",
  "per hand at 60 FPS without gloves or specialized hardware.": "ಯಾವುದೇ ಕೈಗವಸುಗಳಿಲ್ಲದೆ 60 FPS ವೇಗದಲ್ಲಿ ಟ್ರ್ಯಾಕ್ ಮಾಡುತ್ತದೆ.",
  "21 Keypoints": "21 ಬಿಂದುಗಳು",
  "1080p @ 60fps": "1080p @ 60fps",
  "Neural Classifier": "ನ್ಯೂರಲ್ ವರ್ಗೀಕರಣ",
  "Temporal LSTM & Transformer architecture analyzes normalized 3D vectors to classify continuous gestures and fingerspelling.": "LSTM ಮತ್ತು ಟ್ರಾನ್ಸ್‌ಫಾರ್ಮರ್ ಮಾದರಿಯು 3D ವೆಕ್ಟರ್‌ಗಳನ್ನು ವಿಶ್ಲೇಷಿಸಿ ಸ್ಥಿರ ಮತ್ತು ಚಲನೆಯ ಸೈನ್‌ಗಳನ್ನು ನಿಖರವಾಗಿ ಗುರುತಿಸುತ್ತದೆ.",
  "99.2% Conf": "99.2% ನಿಖರತೆ",
  "Spatial Norm": "ಸ್ಪೇಷಿಯಲ್ ನಾರ್ಮ್",
  "Instant Voice Synthesis": "ತಕ್ಷಣದ ಧ್ವನಿ ನಿರ್ಮಾಣ",
  "Recognized gestures instantly generate crystal clear speech and multilingual text (English & ಕನ್ನಡ) for hearing participants.": "ಗುರುತಿಸಲಾದ ಸೈನ್‌ಗಳು ತಕ್ಷಣವೇ ಸ್ಪಷ್ಟವಾದ ಧ್ವನಿ ಮತ್ತು ಪಠ್ಯವನ್ನು ರಚಿಸುತ್ತವೆ.",
  "Web Speech TTS": "ವೆಬ್ ಸ್ಪೀಚ್ ಧ್ವನಿ",
  "Multilingual": "ಬಹುಭಾಷಾ ಬೆಂಬಲ",
  "Dual Frame 3D Render": "ಡ್ಯುಯಲ್ ಫ್ರೇಮ್ 3D ಪ್ರದರ್ಶನ",
  "Normal user voice/text maps to authentic master gesture frames and live Three.js 3D 21-landmark skeletal hand animations.": "ಸಾಮಾನ್ಯ ಬಳಕೆದಾರರ ಧ್ವನಿ/ಪಠ್ಯವು ಮಾಸ್ಟರ್ ಸೈನ್ ವಿಡಿಯೋ ಮತ್ತು ಲೈವ್ 3D 21-ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಕೈ ಆನಿಮೇಷನ್ ಅನ್ನು ಪ್ರದರ್ಶಿಸುತ್ತದೆ.",
  "Master Reference": "ಮಾಸ್ಟರ್ ರೆಫರೆನ್ಸ್",
  "3D 21-Landmark Hand": "3D 21-ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಕೈ",
  "<15ms Latency": "<15ms ವೇಗ",
  "Experience the Sub-Second Latency": "ತಕ್ಷಣದ ಅನುವಾದವನ್ನು ಅನುಭವಿಸಿ",
  "Test how spoken sentences, typed phrases, and gestures cross-translate immediately in our dedicated workspace.": "ಮಾತನಾಡುವ ವಾಕ್ಯಗಳು, ಟೈಪ್ ಮಾಡಿದ ಪದಗಳು ಮತ್ತು ಸೈನ್‌ಗಳು ಹೇಗೆ ತಕ್ಷಣವೇ ಅನುವಾದಗೊಳ್ಳುತ್ತವೆ ಎಂಬುದನ್ನು ಪರೀಕ್ಷಿಸಿ.",
  "Try Sign User Mode": "ಸೈನ್ ಬಳಕೆದಾರ ಮೋಡ್ ಪ್ರಯತ್ನಿಸಿ",
  "Try Hearing User Mode": "ಸಾಮಾನ್ಯ ಬಳಕೆದಾರ ಮೋಡ್ ಪ್ರಯತ್ನಿಸಿ",

  // Normal User Panel
  "Interactive Translation Studio": "ಸಂವಾದಾತ್ಮಕ ಅನುವಾದ ಸ್ಟುಡಿಯೋ",
  "Normal User Interface & 3D ISL Engine": "ಸಾಮಾನ್ಯ ಬಳಕೆದಾರ ಇಂಟರ್ಫೇಸ್ ಮತ್ತು 3D ISL ಎಂಜಿನ್",
  "Live ISL Stream Active": "ಲೈವ್ ISL ಸ್ಟ್ರೀಮ್ ಸಕ್ರಿಯವಾಗಿದೆ",
  "Compose Message": "ಸಂದೇಶ ಬರೆಯಿರಿ",
  "Type or speak to convert to 3D ISL": "3D ISL ಗೆ ಬದಲಿಸಲು ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ",
  "Speak Message": "ಸಂದೇಶ ಮಾತನಾಡಿ",
  "Stop Recording": "ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ",
  "Listening...": "ಕೇಳಿಸಿಕೊಳ್ಳುತ್ತಿದೆ...",
  "Listening... Speak now": "ಕೇಳಿಸಿಕೊಳ್ಳುತ್ತಿದೆ... ಈಗ ಮಾತನಾಡಿ",
  "Transcribing voice...": "ಧ್ವನಿಯನ್ನು ಪಠ್ಯಕ್ಕೆ ಬದಲಿಸಲಾಗುತ್ತಿದೆ...",
  "Generate ISL": "ISL ರಚಿಸಿ",
  "Quick Phrases:": "ತ್ವರಿತ ಪದಗಳು:",
  "Hello": "ನಮಸ್ಕಾರ",
  "Thank you": "ಧನ್ಯವಾದಗಳು",
  "How are you?": "ನೀವು ಹೇಗಿದ್ದೀರಿ?",
  "Need help": "ಸಹಾಯ ಬೇಕು",
  "Water": "ನೀರು",
  "Conversation Feed": "ಸಂಭಾಷಣೆ ಪಟ್ಟಿ",
  "Live transcript & ISL log": "ಲೈವ್ ಸಂಭಾಷಣೆ ಮತ್ತು ISL ದಾಖಲೆ",
  "No messages yet": "ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ",
  "Type or speak above to generate 3D ISL animation": "3D ISL ಆನಿಮೇಷನ್ ರಚಿಸಲು ಮೇಲೆ ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ",
  "Pro-Tip for Clear ISL Output": "ಸ್ಪಷ್ಟ ISL ಅನುವಾದಕ್ಕಾಗಿ ಸಲಹೆ",
  "Keep sentences concise and structured. The 3D avatar automatically translates regional sign variations and grammatical markers for optimal comprehension.": "ವಾಕ್ಯಗಳನ್ನು ಸರಳವಾಗಿ ಮತ್ತು ಸ್ಪಷ್ಟವಾಗಿ ಇರಿಸಿ. 3D ಅವತಾರ್ ಸುಲಭವಾಗಿ ಅರ್ಥವಾಗುವಂತೆ ಸೈನ್‌ಗಳನ್ನು ಪ್ರದರ್ಶಿಸುತ್ತದೆ.",
  "ISL Buddy": "ISL ಮಿತ್ರ",
  "Standby Mode": "ಸ್ಟ್ಯಾಂಡ್‌ಬೈ ಮೋಡ್",
  "Please compose a message": "ದಯವಿಟ್ಟು ಸಂದೇಶವನ್ನು ಬರೆಯಿರಿ",
  "Type or speak a message on the left to reveal the": "ಎಡಭಾಗದಲ್ಲಿ ಸಂದೇಶವನ್ನು ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ:",
  "Master Signer Gesture": "ಮಾಸ್ಟರ್ ಸೈನರ್ ಸೈನ್",
  "and": "ಮತ್ತು",
  "Try clicking \"Water\", \"Hello\", or use the microphone": "\"ನೀರು\", \"ನಮಸ್ಕಾರ\" ಕ್ಲಿಕ್ ಮಾಡಿ ಅಥವಾ ಮೈಕ್ ಬಳಸಿ",
  "Voice & 3D Hand": "ಧ್ವನಿ ಮತ್ತು 3D ಕೈ",
  "Dual Studio": "ಡ್ಯುಯಲ್ ಸ್ಟುಡಿಯೋ",
  "Upper: Master Signer Gesture": "ಮೇಲಿನ ಪರದೆ: ಮಾಸ್ಟರ್ ಸೈನರ್ ಸೈನ್",
  "Verified master signer reference recording": "ಪರಿಶೀಲಿಸಿದ ಮಾಸ್ಟರ್ ಸೈನರ್ ರೆಫರೆನ್ಸ್ ವಿಡಿಯೋ/ಚಿತ್ರ",
  "Master Reference": "ಮಾಸ್ಟರ್ ರೆಫರೆನ್ಸ್",
  "Master Reference Gesture": "ಮಾಸ್ಟರ್ ರೆಫರೆನ್ಸ್ ಸೈನ್",
  "Below: 3D 21-Landmark Hand Model": "ಕೆಳಗಿನ ಪರದೆ: 3D 21-ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಕೈ ಮಾದರಿ",
  "Awaiting Trained Model": "ತರಬೇತಿ ಪಡೆದ ಮಾದರಿ ಸಿದ್ಧವಾಗಿದೆ",
  "Trained Model Active": "ತರಬೇತಿ ಪಡೆದ ಮಾದರಿ ಸಕ್ರಿಯವಾಗಿದೆ",
  "Ready for Trained Model Landmark Stream": "21-ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ 3D ಸ್ಟ್ರೀಮ್‌ಗೆ ಸಿದ್ಧವಾಗಿದೆ",
  "Streaming from trained model pending": "3D ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಸ್ಟ್ರೀಮ್ ಸಿದ್ಧವಾಗಿದೆ",
  "Playback Speed": "ಪ್ಲೇಬ್ಯಾಕ್ ವೇಗ",
  "Gesture Not in Dataset": "ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಸೈನ್ ಲಭ್ಯವಿಲ್ಲ",
  "This gesture is not in the dataset": "ಈ ಸೈನ್ ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ",
  "Do you want to perform the gesture for this message and save it in the database?": "ಈ ಸಂದೇಶಕ್ಕಾಗಿ ನೀವು ಸೈನ್ ಮಾಡಿ ಡೇಟಾಬೇಸ್‌ನಲ್ಲಿ ಉಳಿಸಲು ಬಯಸುವಿರಾ?",
  "Yes, Perform Gesture": "ಹೌದು, ಸೈನ್ ಮಾಡಿ",
  "No": "ಇಲ್ಲ",
  "21 Landmarks": "21 ಬಿಂದುಗಳು",
  "Three.js Canvas": "3D ಕ್ಯಾನ್ವಾಸ್",
  "Guide": "ಮಾರ್ಗದರ್ಶಿ",
  "You (Hearing User)": "ನೀವು (ಸಾಮಾನ್ಯ ಬಳಕೆದಾರ)",
  "You (Normal User)": "ನೀವು (ಸಾಮಾನ್ಯ ಬಳಕೆದಾರ)",
  "Master Sign & 3D 21-Landmark Output": "ಮಾಸ್ಟರ್ ಸೈನ್ ಮತ್ತು 3D 21-ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಪ್ರದರ್ಶನ",

  // Sign User Panel
  "Live AI Vision": "ಲೈವ್ AI ಕ್ಯಾಮೆರಾ",
  "Translating Sign to Voice & Text": "ಸೈನ್‌ನಿಂದ ಧ್ವನಿ ಮತ್ತು ಪಠ್ಯಕ್ಕೆ ಅನುವಾದ",
  "Performs sign here": "ಇಲ್ಲಿ ಸೈನ್ ಮಾಡಿ",
  "Click the video icon above to open your camera and start real-time Indian Sign Language input.": "ಕ್ಯಾಮೆರಾ ತೆರೆಯಲು ಮತ್ತು ನೈಜ-ಸಮಯದ ಭಾರತೀಯ ಸಂಜ್ಞಾ ಭಾಷೆ ಇನ್‌ಪುಟ್ ಪ್ರಾರಂಭಿಸಲು ಮೇಲಿನ ವಿಡಿಯೋ ಐಕಾನ್ ಕ್ಲಿಕ್ ಮಾಡಿ.",
  "Start Camera Input": "ಕ್ಯಾಮೆರಾ ಪ್ರಾರಂಭಿಸಿ",
  "Waiting for hand...": "ಕೈಗಾಗಿ ಕಾಯುತ್ತಿದೆ...",
  "Searching for hands...": "ಕೈಗಳಿಗಾಗಿ ಹುಡುಕುತ್ತಿದೆ...",
  "Tracking Confidence:": "ಗುರುತಿಸುವಿಕೆಯ ನಿಖರತೆ:",
  "Tracking 21 3D Landmarks per Hand": "ಪ್ರತಿ ಕೈಯ 21 3D ಬಿಂದುಗಳನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಲಾಗುತ್ತಿದೆ",
  "0 Hands": "0 ಕೈಗಳು",
  "No Hands": "ಕೈಗಳಿಲ್ಲ",
  "No Hands Detected": "ಯಾವುದೇ ಕೈ ಕಂಡುಬಂದಿಲ್ಲ",
  "Quick Sign Shortcuts": "ತ್ವರಿತ ಸೈನ್ ಬಟನ್‌ಗಳು",
  "Click to simulate gesture input": "ಸೈನ್ ಇನ್‌ಪುಟ್ ಪರೀಕ್ಷಿಸಲು ಕ್ಲಿಕ್ ಮಾಡಿ",
  "HELLO": "ನಮಸ್ಕಾರ",
  "THANK YOU": "ಧನ್ಯವಾದಗಳು",
  "HELP NEEDED": "ಸಹಾಯ ಬೇಕು",
  "ALL CLEAR": "ಎಲ್ಲವೂ ಸರಿ",
  "Bidirectional": "ದ್ವಿಮುಖ ಸಂವಹನ",
  "No gestures signed yet": "ಇನ್ನೂ ಯಾವುದೇ ಸೈನ್ ಮಾಡಿಲ್ಲ",
  "Use camera or quick sign buttons to start communicating": "ಸಂವಹನ ಪ್ರಾರಂಭಿಸಲು ಕ್ಯಾಮೆರಾ ಅಥವಾ ತ್ವರಿತ ಸೈನ್ ಬಟನ್‌ಗಳನ್ನು ಬಳಸಿ",
  "Send": "ಕಳುಹಿಸಿ",
  "Auto voice output active": "ಸ್ವಯಂ ಧ್ವನಿ ಅನುವಾದ ಸಕ್ರಿಯವಾಗಿದೆ",
  "Clear Chat": "ಚಾಟ್ ಅಳಿಸಿ",
  "You (Sign User - ISL)": "ನೀವು (ಸೈನ್ ಬಳಕೆದಾರ - ISL)",

  // Live Chat Panel
  "Unified Communication Workspace": "ಏಕೀಕೃತ ಸಂವಹನ ಕಾರ್ಯಕ್ಷೇತ್ರ",
  "Live Chat & Real-Time ISL Translation": "ಲೈವ್ ಚಾಟ್ ಮತ್ತು ನೈಜ-ಸಮಯದ ISL ಅನುವಾದ",
  "Live Connection: Active": "ಲೈವ್ ಸಂಪರ್ಕ: ಸಕ್ರಿಯವಾಗಿದೆ",
  "AI Tracking Active": "AI ಟ್ರ್ಯಾಕಿಂಗ್ ಸಕ್ರಿಯವಾಗಿದೆ",
  "Upper: Sign User Live Camera (ISL Reply)": "ಮೇಲಿನ ಪರದೆ: ಸೈನ್ ಬಳಕೆದಾರರ ಲೈವ್ ಕ್ಯಾಮೆರಾ (ISL ಪ್ರತಿಕ್ರಿಯೆ)",
  "Ready to Sign": "ಸೈನ್ ಮಾಡಲು ಸಿದ್ಧ",
  "Perform Sign to Reply": "ಪ್ರತಿಕ್ರಿಯಿಸಲು ಸೈನ್ ಮಾಡಿ",
  "Waiting for gestures...": "ಸೈನ್‌ಗಳಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ...",
  "Camera active for real-time sign recognition": "ನೈಜ-ಸಮಯದ ಸೈನ್ ಗುರುತಿಸುವಿಕೆಗಾಗಿ ಕ್ಯಾಮೆರಾ ಸಿದ್ಧವಾಗಿದೆ",
  "3D ISL Avatar Output": "3D ISL ಅವತಾರ್ ಪ್ರದರ್ಶನ",
  "v2.4 Ready": "v2.4 ಸಿದ್ಧ",
  "Avatar Ready": "ಅವತಾರ್ ಸಿದ್ಧವಾಗಿದೆ",
  "Continuous Live Conversation": "ನಿರಂತರ ಲೈವ್ ಸಂಭಾಷಣೆ",
  "Synchronized ISL & Text": "ಸಿಂಕ್ರೊನೈಸ್ ಮಾಡಿದ ISL ಮತ್ತು ಪಠ್ಯ",
  "No live conversation yet": "ಇನ್ನೂ ಯಾವುದೇ ಲೈವ್ ಸಂಭಾಷಣೆ ಇಲ್ಲ",
  "Send a message or sign on camera to begin real-time translation": "ನೈಜ-ಸಮಯದ ಅನುವಾದವನ್ನು ಪ್ರಾರಂಭಿಸಲು ಸಂದೇಶ ಕಳುಹಿಸಿ ಅಥವಾ ಕ್ಯಾಮೆರಾದಲ್ಲಿ ಸೈನ್ ಮಾಡಿ",
  "Master Sign & 3D ISL Avatar Output": "ಮಾಸ್ಟರ್ ಸೈನ್ ಮತ್ತು 3D ISL ಅವತಾರ್ ಪ್ರದರ್ಶನ",
  "Sign User (ISL Reply)": "ಸೈನ್ ಬಳಕೆದಾರ (ISL ಪ್ರತಿಕ್ರಿಯೆ)"
};

function translateDynamicUIString(str, lang) {
  if (!str) return str;
  const trimmed = str.replace(/\s+/g, ' ').trim();
  if (!trimmed) return str;

  if (lang === 'kn') {
    if (UI_TRANSLATIONS[trimmed]) {
      return UI_TRANSLATIONS[trimmed];
    }
    const upper = trimmed.toUpperCase();
    if (DICTIONARY[upper]) {
      return cleanKannadaOnly(DICTIONARY[upper].kn);
    }
    if (trimmed.startsWith('Signer:')) {
      return trimmed
        .replace('Signer:', 'ಸೈನರ್:')
        .replace('(Master Reference)', '(ಮಾಸ್ಟರ್ ರೆಫರೆನ್ಸ್)')
        .replace('(Master)', '(ಮಾಸ್ಟರ್)');
    }
    if (trimmed.startsWith('Streaming 21-Landmark Trajectory:')) {
      const rest = trimmed.replace('Streaming 21-Landmark Trajectory:', '').trim();
      const { knMeaning } = resolveTrainedGesture(rest);
      return `21-ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ 3D ಚಲನೆ: ${knMeaning || rest}`;
    }
    if (trimmed.startsWith('Master Gesture:')) {
      const rest = trimmed.replace('Master Gesture:', '').trim();
      return `ಮಾಸ್ಟರ್ ಸೈನ್: ${rest}`;
    }
    if (trimmed.startsWith('ISL Camera Recognized')) {
      return trimmed.replace('ISL Camera Recognized', 'ISL ಕ್ಯಾಮೆರಾ ಗುರುತಿಸಿದೆ');
    }
    if (/^\d+\s+Hands?/.test(trimmed)) {
      return trimmed
        .replace('1 Hand', '1 ಕೈ')
        .replace('Hands', 'ಕೈಗಳು')
        .replace('Right Hand', 'ಬಲಗೈ')
        .replace('Left Hand', 'ಎಡಗೈ')
        .replace('Single Hand', 'ಒಂದು ಕೈ')
        .replace('Both Hands', 'ಎರಡೂ ಕೈಗಳು');
    }
  } else if (lang === 'en') {
    // Reverse lookup if a node was originally created while in Kannada mode
    for (const [enKey, knVal] of Object.entries(UI_TRANSLATIONS)) {
      if (trimmed === knVal) return enKey;
    }
    for (const [k, val] of Object.entries(DICTIONARY)) {
      if (trimmed === cleanKannadaOnly(val.kn)) return val.en || k;
    }
  }
  return null;
}

let isTranslatingDOM = false;

function applyFullPageTranslation(lang) {
  if (!document.body || isTranslatingDOM) return;
  isTranslatingDOM = true;

  try {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName ? parent.tagName.toLowerCase() : '';
          if (tag === 'script' || tag === 'style' || tag === 'noscript') {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.classList && parent.classList.contains('material-symbols-outlined')) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.id === 'header-lang-label') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      const rawVal = currentNode.nodeValue || '';
      const trimmed = rawVal.replace(/\s+/g, ' ').trim();

      if (trimmed.length > 1) {
        if (currentNode.__origEnText === undefined) {
          currentNode.__origEnText = rawVal;
          currentNode.__origEnTrimmed = trimmed;
        }

        const origTrimmed = currentNode.__origEnTrimmed || trimmed;
        if (lang === 'kn') {
          const knTranslated = translateDynamicUIString(origTrimmed, 'kn') || translateDynamicUIString(trimmed, 'kn');
          if (knTranslated) {
            const leading = (rawVal.match(/^\s*/) || [''])[0];
            const trailing = (rawVal.match(/\s*$/) || [''])[0];
            currentNode.nodeValue = `${leading}${knTranslated}${trailing}`;
          }
        } else {
          const enRestored = translateDynamicUIString(origTrimmed, 'en');
          if (enRestored && origTrimmed !== enRestored) {
            const leading = (rawVal.match(/^\s*/) || [''])[0];
            const trailing = (rawVal.match(/\s*$/) || [''])[0];
            currentNode.nodeValue = `${leading}${enRestored}${trailing}`;
          } else if (currentNode.__origEnText !== undefined) {
            currentNode.nodeValue = currentNode.__origEnText;
          }
        }
      }
      currentNode = walker.nextNode();
    }
  } finally {
    isTranslatingDOM = false;
  }
}
window.applyFullPageTranslation = applyFullPageTranslation;

function toggleGlobalLang() {
  const nextLang = state.currentLang === 'en' ? 'kn' : 'en';
  switchLang(nextLang);
}
window.toggleGlobalLang = toggleGlobalLang;

function switchLang(lang) {
  state.currentLang = lang;
  const headerLabel = document.getElementById('header-lang-label');
  const headerBtn = document.getElementById('header-lang-btn');
  if (headerLabel) {
    headerLabel.textContent = lang === 'en' ? 'English (EN)' : 'ಕನ್ನಡ (KN)';
  }
  if (headerBtn) {
    if (lang === 'kn') {
      headerBtn.classList.remove('bg-surface-container', 'text-primary');
      headerBtn.classList.add('bg-primary', 'text-on-primary', 'shadow-sm');
    } else {
      headerBtn.classList.remove('bg-primary', 'text-on-primary', 'shadow-sm');
      headerBtn.classList.add('bg-surface-container', 'text-primary');
    }
  }

  // Instantly translate all page contents between English and Kannada
  applyFullPageTranslation(lang);

  // Update input placeholders to match active system language
  const normalInput = document.getElementById('normal-text-input');
  if (normalInput && !state.isRecordingNormal) {
    normalInput.placeholder = lang === 'kn'
      ? 'ಕನ್ನಡದಲ್ಲಿ ಸಂದೇಶವನ್ನು ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ...'
      : 'Type your message here (e.g., Hello, Water, Thank You)...';
  }
  const manualInput = document.getElementById('manual-text-input');
  if (manualInput && !state.isRecordingSign) {
    manualInput.placeholder = lang === 'kn'
      ? 'ಕನ್ನಡದಲ್ಲಿ ಸಂದೇಶ ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ...'
      : 'Type or translate sign message...';
  }
  const liveInput = document.getElementById('live-chat-input');
  if (liveInput && !state.isRecordingLive) {
    liveInput.placeholder = lang === 'kn'
      ? 'ಕನ್ನಡದಲ್ಲಿ ಸಂದೇಶ ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಕ್ಯಾಮೆರಾದಲ್ಲಿ ಸೈನ್ ಮಾಡಿ...'
      : 'Type message or sign on camera...';
  }

  // If speech recognition is currently active, switch its recognition language live
  if (state.speechRecognition) {
    state.speechRecognition.lang = lang === 'kn' ? 'kn-IN' : 'en-IN';
    try {
      state.speechRecognition.stop();
    } catch (e) {}
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

let cachedSpeechVoices = [];
function preloadSpeechVoices() {
  if (!('speechSynthesis' in window)) return;
  const load = () => {
    const v = window.speechSynthesis.getVoices();
    if (v && v.length > 0) {
      cachedSpeechVoices = v;
    }
  };
  load();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = load;
  }
}
preloadSpeechVoices();

function pickFemaleVoice(langCode) {
  if (!cachedSpeechVoices || cachedSpeechVoices.length === 0) {
    if ('speechSynthesis' in window) {
      cachedSpeechVoices = window.speechSynthesis.getVoices() || [];
    }
  }
  if (!cachedSpeechVoices || cachedSpeechVoices.length === 0) return null;

  const targetLang = (langCode || 'en-IN').toLowerCase();
  const prefix = targetLang.split('-')[0];

  // Identifiers for natural female / young female / girl voices across Windows, Chrome, Android, Mac, iOS
  const femaleVoiceKeywords = [
    'zira', 'female', 'girl', 'google us english', 'google uk english female',
    'heera', 'neerja', 'kavya', 'priya', 'sangeeta', 'swara', 'samantha',
    'victoria', 'karen', 'moira', 'tessa', 'fiona', 'veena', 'en-us-x-sfg', 'woman'
  ];
  const maleVoiceKeywords = ['david', 'male', 'mark', 'george', 'guy', 'ravi', 'stefan', 'prabhat', 'man', 'richard'];

  const langVoices = cachedSpeechVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
  const pool = langVoices.length > 0 ? langVoices : cachedSpeechVoices;

  // 1. Highest Priority: Explicit female / girl voice in matching language
  const femaleLangVoice = pool.find(v => {
    const name = (v.name || '').toLowerCase();
    return femaleVoiceKeywords.some(kw => name.includes(kw));
  });
  if (femaleLangVoice) return femaleLangVoice;

  // 2. Second Priority: Any voice in language pool that is NOT a male voice
  const nonMaleLangVoice = pool.find(v => {
    const name = (v.name || '').toLowerCase();
    return !maleVoiceKeywords.some(kw => name.includes(kw));
  });
  if (nonMaleLangVoice) return nonMaleLangVoice;

  // 3. Fallback: Any female voice anywhere in system
  const anyFemale = cachedSpeechVoices.find(v => {
    const name = (v.name || '').toLowerCase();
    return femaleVoiceKeywords.some(kw => name.includes(kw));
  });
  if (anyFemale) return anyFemale;

  return null; // Return null so browser falls back to its natural default female synthesizer
}

function speakText(text) {
  if (state.isAudioMuted || !text) return;
  if ('speechSynthesis' in window) {
    // Strip parenthetical transliterations e.g. "ನಮಸ್ಕಾರ (Namaskara)" -> "ನಮಸ್ಕಾರ"
    // and bracketed confidence tags e.g. "[DYNAMIC 98%]" so TTS speaks strictly once
    let cleanSpeech = String(text)
      .replace(/\[.*?\]/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/^ಕನ್ನಡ ಅನುವಾದ:\s*/i, '')
      .split('/')[0]
      .trim();
    if (!cleanSpeech) cleanSpeech = String(text).trim();

    // Short 300ms guard to prevent double-firing from duplicate events
    const now = Date.now();
    if (state.lastSpokenText === cleanSpeech && (now - (state.lastSpokenTime || 0)) < 300) {
      return;
    }
    state.lastSpokenText = cleanSpeech;
    state.lastSpokenTime = now;

    // Only cancel if actively speaking
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const targetLang = state.currentLang === 'kn' ? 'kn-IN' : 'en-IN';
    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.lang = targetLang;
    const femaleVoice = pickFemaleVoice(targetLang);
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }
    // Rate 1.0 and Pitch 1.15 to guarantee the clear, bright young girl voice
    utterance.rate = 1.0;
    utterance.pitch = 1.15;
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

function stopAllSpeechRecognition() {
  if (state.speechRecognition) {
    try {
      state.speechRecognition.onend = null;
      state.speechRecognition.onerror = null;
      state.speechRecognition.onresult = null;
      state.speechRecognition.stop();
    } catch (e) {}
    state.speechRecognition = null;
  }
}

function setNormalMicUI(isRecording, statusMsg) {
  const btnText = document.getElementById('speak-btn-text');
  const micStatus = document.getElementById('mic-status');
  const speakBtn = document.getElementById('speak-btn');

  if (btnText) {
    btnText.textContent = isRecording ? 'Stop Recording' : 'Speak Message';
  }
  if (speakBtn) {
    if (isRecording) {
      speakBtn.classList.remove('bg-primary', 'hover:bg-primary/95', 'text-on-primary');
      speakBtn.classList.add('bg-error', 'hover:bg-error/95', 'text-on-error');
    } else {
      speakBtn.classList.remove('bg-error', 'hover:bg-error/95', 'text-on-error');
      speakBtn.classList.add('bg-primary', 'hover:bg-primary/95', 'text-on-primary');
    }
  }
  if (micStatus) {
    if (isRecording) {
      micStatus.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-error animate-ping"></span> <span>${statusMsg || 'Listening... Speak now'}</span>`;
      micStatus.classList.remove('hidden');
      micStatus.classList.add('flex');
    } else {
      micStatus.classList.add('hidden');
      micStatus.classList.remove('flex');
    }
  }
}

function setLiveMicUI(isRecording, statusMsg) {
  const micBtn = document.getElementById('live-mic-btn');
  const liveMicStatus = document.getElementById('live-mic-status');
  const input = document.getElementById('live-chat-input');

  if (micBtn) {
    if (isRecording) {
      micBtn.classList.remove('bg-surface-container', 'text-on-surface');
      micBtn.classList.add('bg-error', 'text-on-error', 'animate-pulse');
      micBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">mic_off</span>';
      micBtn.title = 'Stop Voice Input';
    } else {
      micBtn.classList.remove('bg-error', 'text-on-error', 'animate-pulse');
      micBtn.classList.add('bg-surface-container', 'text-on-surface');
      micBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">mic</span>';
      micBtn.title = 'Voice Input (Mic)';
    }
  }
  if (input) {
    input.placeholder = isRecording
      ? (statusMsg || 'Listening... Speak now to convert voice to text...')
      : 'Type message or sign on camera...';
  }
  if (liveMicStatus) {
    if (isRecording) {
      liveMicStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-error animate-ping"></span> <span>${statusMsg || 'Listening... Speak now'}</span>`;
      liveMicStatus.classList.remove('hidden');
      liveMicStatus.classList.add('flex');
    } else {
      liveMicStatus.classList.add('hidden');
      liveMicStatus.classList.remove('flex');
    }
  }
}

function toggleVoiceRecording() {
  const textarea = document.getElementById('normal-text-input');

  // If Live Chat mic was active, stop it first
  if (state.isRecordingLive) {
    state.isRecordingLive = false;
    setLiveMicUI(false);
    stopAllSpeechRecognition();
  }

  if (!state.isRecordingNormal) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech Recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    stopAllSpeechRecognition();
    state.isRecordingNormal = true;
    setNormalMicUI(true, 'Listening... Speak now');

    const recognizer = new SpeechRec();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.lang = state.currentLang === 'kn' ? 'kn-IN' : 'en-IN';

    let finalTranscript = textarea ? textarea.value.trim() : '';

    recognizer.onstart = () => {
      setNormalMicUI(true, 'Listening... Speak now');
      if (textarea) textarea.focus();
    };

    recognizer.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript = (finalTranscript ? finalTranscript + ' ' : '') + piece.trim();
        } else {
          interimTranscript += piece;
        }
      }
      const combined = (finalTranscript + (interimTranscript ? ' ' + interimTranscript.trim() : '')).trim();
      if (textarea && combined) {
        textarea.value = combined;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        setNormalMicUI(true, 'Transcribing voice...');
        showMasterGestureAnd3D(combined);
      }
    };

    recognizer.onerror = (event) => {
      console.warn("Speech recognition notice:", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        alert("Microphone access was blocked. Please allow microphone permission in your browser address bar.");
        state.isRecordingNormal = false;
        setNormalMicUI(false);
        stopAllSpeechRecognition();
      } else if (event.error === 'audio-capture') {
        alert("No microphone was detected. Please check your microphone connection.");
        state.isRecordingNormal = false;
        setNormalMicUI(false);
        stopAllSpeechRecognition();
      }
    };

    recognizer.onend = () => {
      if (state.isRecordingNormal) {
        try {
          recognizer.start();
        } catch (e) {
          state.isRecordingNormal = false;
          setNormalMicUI(false);
        }
      } else {
        setNormalMicUI(false);
      }
    };

    state.speechRecognition = recognizer;
    try {
      recognizer.start();
    } catch (e) {
      console.error("Recognizer start error:", e);
      state.isRecordingNormal = false;
      setNormalMicUI(false);
    }
  } else {
    state.isRecordingNormal = false;
    setNormalMicUI(false);
    stopAllSpeechRecognition();
  }
}
window.toggleVoiceRecording = toggleVoiceRecording;

function toggleLiveVoiceRecording() {
  const input = document.getElementById('live-chat-input');

  // If Normal User mic was active, stop it first
  if (state.isRecordingNormal) {
    state.isRecordingNormal = false;
    setNormalMicUI(false);
    stopAllSpeechRecognition();
  }

  if (!state.isRecordingLive) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech Recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    stopAllSpeechRecognition();
    state.isRecordingLive = true;
    setLiveMicUI(true, 'Listening... Speak now');

    const recognizer = new SpeechRec();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.lang = state.currentLang === 'kn' ? 'kn-IN' : 'en-IN';

    let finalTranscript = input ? input.value.trim() : '';

    recognizer.onstart = () => {
      setLiveMicUI(true, 'Listening... Speak now');
      if (input) input.focus();
    };

    recognizer.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript = (finalTranscript ? finalTranscript + ' ' : '') + piece.trim();
        } else {
          interimTranscript += piece;
        }
      }
      const combined = (finalTranscript + (interimTranscript ? ' ' + interimTranscript.trim() : '')).trim();
      if (input && combined) {
        input.value = combined;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setLiveMicUI(true, 'Transcribing voice...');
      }
    };

    recognizer.onerror = (event) => {
      console.warn("Live Chat speech recognition notice:", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        alert("Microphone access was blocked. Please allow microphone permission in your browser address bar.");
        state.isRecordingLive = false;
        setLiveMicUI(false);
        stopAllSpeechRecognition();
      } else if (event.error === 'audio-capture') {
        alert("No microphone was detected. Please check your microphone connection.");
        state.isRecordingLive = false;
        setLiveMicUI(false);
        stopAllSpeechRecognition();
      }
    };

    recognizer.onend = () => {
      if (state.isRecordingLive) {
        try {
          recognizer.start();
        } catch (err) {
          state.isRecordingLive = false;
          setLiveMicUI(false);
        }
      } else {
        setLiveMicUI(false);
      }
    };

    state.speechRecognition = recognizer;
    try {
      recognizer.start();
    } catch (e) {
      console.error("Live recognizer start error:", e);
      state.isRecordingLive = false;
      setLiveMicUI(false);
    }
  } else {
    state.isRecordingLive = false;
    setLiveMicUI(false);
    stopAllSpeechRecognition();
  }
}
window.toggleLiveVoiceRecording = toggleLiveVoiceRecording;

function setSignMicUI(isRecording, statusMsg) {
  const micBtn = document.getElementById('sign-mic-btn');
  const signMicStatus = document.getElementById('sign-mic-status');
  const input = document.getElementById('manual-text-input');

  if (micBtn) {
    if (isRecording) {
      micBtn.classList.remove('bg-surface-container', 'text-on-surface');
      micBtn.classList.add('bg-error', 'text-on-error', 'animate-pulse');
      micBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">mic_off</span>';
      micBtn.title = 'Stop Voice Input';
    } else {
      micBtn.classList.remove('bg-error', 'text-on-error', 'animate-pulse');
      micBtn.classList.add('bg-surface-container', 'text-on-surface');
      micBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">mic</span>';
      micBtn.title = 'Voice Input (Mic)';
    }
  }
  if (input) {
    input.placeholder = isRecording
      ? (statusMsg || 'Listening... Speak now...')
      : 'Type or translate sign message...';
  }
  if (signMicStatus) {
    if (isRecording) {
      signMicStatus.innerHTML = `<span class="w-2 h-2 rounded-full bg-error animate-ping"></span> <span>${statusMsg || 'Listening... Speak now'}</span>`;
      signMicStatus.classList.remove('hidden');
      signMicStatus.classList.add('flex');
    } else {
      signMicStatus.classList.add('hidden');
      signMicStatus.classList.remove('flex');
    }
  }
}

function toggleSignVoiceRecording() {
  const input = document.getElementById('manual-text-input');

  if (state.isRecordingNormal) {
    state.isRecordingNormal = false;
    setNormalMicUI(false);
    stopAllSpeechRecognition();
  }
  if (state.isRecordingLive) {
    state.isRecordingLive = false;
    setLiveMicUI(false);
    stopAllSpeechRecognition();
  }

  if (!state.isRecordingSign) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech Recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    stopAllSpeechRecognition();
    state.isRecordingSign = true;
    setSignMicUI(true, 'Listening... Speak now');

    const recognizer = new SpeechRec();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.lang = state.currentLang === 'kn' ? 'kn-IN' : 'en-IN';

    let finalTranscript = input ? input.value.trim() : '';

    recognizer.onstart = () => {
      setSignMicUI(true, 'Listening... Speak now');
      if (input) input.focus();
    };

    recognizer.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript = (finalTranscript ? finalTranscript + ' ' : '') + piece.trim();
        } else {
          interimTranscript += piece;
        }
      }
      const combined = (finalTranscript + (interimTranscript ? ' ' + interimTranscript.trim() : '')).trim();
      if (input && combined) {
        input.value = combined;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setSignMicUI(true, 'Transcribing voice...');
      }
    };

    recognizer.onerror = (event) => {
      console.warn("Sign User speech recognition notice:", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        alert("Microphone access was blocked. Please allow microphone permission in your browser address bar.");
        state.isRecordingSign = false;
        setSignMicUI(false);
        stopAllSpeechRecognition();
      } else if (event.error === 'audio-capture') {
        alert("No microphone was detected. Please check your microphone connection.");
        state.isRecordingSign = false;
        setSignMicUI(false);
        stopAllSpeechRecognition();
      }
    };

    recognizer.onend = () => {
      if (state.isRecordingSign) {
        try {
          recognizer.start();
        } catch (err) {
          state.isRecordingSign = false;
          setSignMicUI(false);
        }
      } else {
        setSignMicUI(false);
      }
    };

    state.speechRecognition = recognizer;
    try {
      recognizer.start();
    } catch (e) {
      console.error("Sign recognizer start error:", e);
      state.isRecordingSign = false;
      setSignMicUI(false);
    }
  } else {
    state.isRecordingSign = false;
    setSignMicUI(false);
    stopAllSpeechRecognition();
  }
}
window.toggleSignVoiceRecording = toggleSignVoiceRecording;

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
    this.speed = state.playbackSpeed || 1.0;
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
    this.camera.position.set(0, 0, 24);

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

    // Clean neutral studio lighting so the skeleton structure is sharp and NOT washed in green
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(15, 25, 20);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x93c5fd, 0.65);
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

    // Sleek small joint materials (NO solid green; clean crisp luminous pearl & electric blue)
    const jointMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.5,
      roughness: 0.15,
      metalness: 0.8
    });

    const fingertipMaterial = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.7
    });

    const wristMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.8
    });

    // Bone Cylinder Material: High-definition articulated electric cyan/blue skeleton
    const boneMaterial = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.5
    });

    // Much smaller joint nodes so the skeleton lines are the prominent hero
    const wristGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const knuckleGeo = new THREE.SphereGeometry(0.10, 16, 16);
    const midJointGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const tipJointGeo = new THREE.SphereGeometry(0.10, 16, 16);

    // Initial 21 joint landmark coordinates
    this.defaultCoords = [
      [0, -4, 0],        // 0: Wrist
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

    const isTip = (i) => i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    const isKnuckle = (i) => i === 1 || i === 5 || i === 9 || i === 13 || i === 17;
    const isWrist = (i) => i === 0;

    // Create 21 joints
    this.joints = [];
    this.defaultCoords.forEach((coord, i) => {
      let geo = midJointGeo;
      let mat = jointMaterial;
      if (isWrist(i)) {
        geo = wristGeo;
        mat = wristMaterial;
      } else if (isTip(i)) {
        geo = tipJointGeo;
        mat = fingertipMaterial;
      } else if (isKnuckle(i)) {
        geo = knuckleGeo;
      }
      const mesh = new THREE.Mesh(geo, mat);
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
    const boneGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 12);

    this.connections.forEach(([p1, p2]) => {
      const boneMesh = new THREE.Mesh(boneGeo, boneMaterial);
      this.handGroup.add(boneMesh);
      this.bones.push({ mesh: boneMesh, p1, p2 });
    });

    // Hide second hand group permanently - focus strictly on ONE single skeleton
    this.secondHandGroup = new THREE.Group();
    this.secondHandGroup.visible = false;
    this.scene.add(this.secondHandGroup);

    this.secondJoints = [];
    this.defaultCoords.forEach((coord) => {
      const mesh = new THREE.Mesh(midJointGeo, jointMaterial);
      mesh.position.set(coord[0], coord[1], coord[2]);
      this.secondHandGroup.add(mesh);
      this.secondJoints.push(mesh);
    });

    this.secondBones = [];
    this.connections.forEach(([p1, p2]) => {
      const boneMesh = new THREE.Mesh(boneGeo, boneMaterial);
      this.secondHandGroup.add(boneMesh);
      this.secondBones.push({ mesh: boneMesh, p1, p2 });
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

      if (dist > 0.0001) {
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      }
    });

    if (this.secondHandGroup && this.secondHandGroup.visible && this.secondBones) {
      this.secondBones.forEach(({ mesh, p1, p2 }) => {
        const pos1 = this.secondJoints[p1].position;
        const pos2 = this.secondJoints[p2].position;
        const mid = new THREE.Vector3().addVectors(pos1, pos2).multiplyScalar(0.5);
        mesh.position.copy(mid);

        const dir = new THREE.Vector3().subVectors(pos2, pos1);
        const dist = dir.length();
        mesh.scale.set(1, dist, 1);

        if (dist > 0.0001) {
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        }
      });
    }
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
    if (this.secondHandGroup) {
      this.secondHandGroup.visible = false;
    }
    this.updateBones();
  }

  // Ready hook for trained ML model prediction stream - focuses on ONE single crisp skeleton
  setLandmarks(landmarks, secondLandmarks = null) {
    if (!landmarks || !landmarks.length) return;

    // Enforce strictly ONE skeleton: keep secondHandGroup hidden
    if (this.secondHandGroup) {
      this.secondHandGroup.visible = false;
    }

    const count = Math.min(landmarks.length, 21);

    // Calculate centroid of the hand landmarks so the single skeleton is centered directly in view
    let sumX = 0, sumY = 0, sumZ = 0;
    for (let i = 0; i < count; i++) {
      const pt = landmarks[i];
      sumX += (pt.x !== undefined ? pt.x : (pt[0] || 0));
      sumY += (pt.y !== undefined ? pt.y : (pt[1] || 0));
      sumZ += (pt.z !== undefined ? pt.z : (pt[2] || 0));
    }
    const cx = sumX / count;
    const cy = sumY / count;
    const cz = sumZ / count;

    // Centered scaling factor for optimal visibility and clarity
    const scale = 20.0;
    for (let i = 0; i < count; i++) {
      if (this.joints[i]) {
        const pt = landmarks[i];
        const rawX = pt.x !== undefined ? pt.x : (pt[0] || 0);
        const rawY = pt.y !== undefined ? pt.y : (pt[1] || 0);
        const rawZ = pt.z !== undefined ? pt.z : (pt[2] || 0);

        // Center hand directly at origin (0, 0, 0)
        const x = (rawX - cx) * scale;
        const y = (cy - rawY) * scale; // Inverted Y: 0 is top of video, 1 is bottom
        const z = (rawZ - cz) * scale * -0.8;
        this.joints[i].position.set(x, y, z);
      }
    }

    this.updateBones();
  }

  interpolateHandPoints(lmA, lmB, alpha) {
    const validA = lmA && lmA.length >= 21;
    const validB = lmB && lmB.length >= 21;
    if (!validA && !validB) return null;
    if (validA && !validB) return lmA;
    if (!validA && validB) return lmB;

    const out = [];
    for (let i = 0; i < 21; i++) {
      const a = lmA[i];
      const b = lmB[i];
      const ax = a.x !== undefined ? a.x : (a[0] || 0);
      const ay = a.y !== undefined ? a.y : (a[1] || 0);
      const az = a.z !== undefined ? a.z : (a[2] || 0);
      const bx = b.x !== undefined ? b.x : (b[0] || 0);
      const by = b.y !== undefined ? b.y : (b[1] || 0);
      const bz = b.z !== undefined ? b.z : (b[2] || 0);
      out.push({
        x: ax + alpha * (bx - ax),
        y: ay + alpha * (by - ay),
        z: az + alpha * (bz - az)
      });
    }
    return out;
  }

  setInterpolatedFrame(frameA, frameB, alpha = 0) {
    if (!frameA) return;
    const targetB = frameB || frameA;
    const leftInterp = this.interpolateHandPoints(frameA.left_hand_landmarks, targetB.left_hand_landmarks, alpha);
    const rightInterp = this.interpolateHandPoints(frameA.right_hand_landmarks, targetB.right_hand_landmarks, alpha);

    // Focus strictly on ONE single skeleton to prevent confusion and visual clutter
    let singleHand = null;
    if (rightInterp && rightInterp.length >= 21) {
      singleHand = rightInterp;
    } else if (leftInterp && leftInterp.length >= 21) {
      singleHand = leftInterp;
    } else if (rightInterp && rightInterp.length > 0) {
      singleHand = rightInterp;
    } else if (leftInterp && leftInterp.length > 0) {
      singleHand = leftInterp;
    }

    if (singleHand) {
      this.setLandmarks(singleHand, null);
    }
  }

  async playGesture(gestureName) {
    this.currentGesture = (gestureName || '').trim().toUpperCase();
    if (!this.currentGesture) {
      this.isPlaying = false;
      this.resetToNeutralPose();
      return;
    }

    try {
      const cleanQuery = this.currentGesture.toLowerCase().replace(/\s+/g, '_');
      const res = await fetch(`/api/ml/gesture-template/${encodeURIComponent(cleanQuery)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.frames && data.frames.length > 0) {
          this.sequenceFrames = data.frames;
          this.frameCursor = 0;
          this.isPlaying = data.frames.length > 1;
          this.setInterpolatedFrame(data.frames[0], data.frames[0], 0);
          return;
        }
      }
    } catch (e) {
      console.warn('[ISL Connect] Template fetch notice:', e);
    }
    this.isPlaying = false;
    this.resetToNeutralPose();
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (this.controls) this.controls.update();

    // Stream real recorded 21-landmark sequence with smooth sub-frame interpolation (supports 0.1x & 0.25x slow-mo)
    if (this.isPlaying && this.sequenceFrames && this.sequenceFrames.length > 1) {
      const len = this.sequenceFrames.length;
      this.frameCursor = (this.frameCursor || 0) + 0.35 * (this.speed || 1.0);
      if (this.frameCursor >= len) {
        this.frameCursor = this.frameCursor % len;
      }
      const idxA = Math.floor(this.frameCursor) % len;
      const idxB = (idxA + 1) % len;
      const alpha = this.frameCursor - Math.floor(this.frameCursor);
      this.setInterpolatedFrame(this.sequenceFrames[idxA], this.sequenceFrames[idxB], alpha);

      if (this === state.normalViewer) {
        const scrubber = document.getElementById('normal-scrubber');
        if (scrubber) {
          scrubber.value = Math.round((this.frameCursor / len) * 100);
        }
      }
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resetCamera() {
    if (this.camera) {
      this.camera.position.set(0, 0, 24);
      this.camera.lookAt(0, 0, 0);
    }
    if (this.controls) {
      this.controls.target.set(0, 0, 0);
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
  if (state.normalViewer && state.normalViewer.sequenceFrames && state.normalViewer.sequenceFrames.length > 1) {
    state.normalViewer.isPlaying = !state.normalViewer.isPlaying;
  }
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

  // Synchronize upper Master Signer video playback speed with 3D hand speed
  const clampedRate = Math.max(0.1, Math.min(2.0, speed));
  const masterVideo = document.getElementById('master-reference-video');
  if (masterVideo) {
    try { masterVideo.playbackRate = clampedRate; } catch (e) {}
  }
  const chatMasterVideo = document.getElementById('chat-master-video');
  if (chatMasterVideo) {
    try { chatMasterVideo.playbackRate = clampedRate; } catch (e) {}
  }

  document.querySelectorAll('.speed-btn').forEach(b => {
    const btnSpeed = parseFloat(b.getAttribute('data-speed'));
    if (btnSpeed === speed || b === btn) {
      b.classList.add('bg-primary', 'text-on-primary', 'shadow-sm');
      b.classList.remove('text-on-surface-variant');
    } else {
      b.classList.remove('bg-primary', 'text-on-primary', 'shadow-sm');
      b.classList.add('text-on-surface-variant');
    }
  });
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

function resolveTrainedGesture(text) {
  const cleaned = (text || '').trim().replace(/[?!.,]/g, '');
  const upper = cleaned.toUpperCase();
  const underscored = upper.replace(/\s+/g, '_');

  // Map synonyms to canonical trained gesture_ids
  const SYNONYM_MAP = {
    "GOOD MORNING": "MORNING",
    "GOOD_MORNING": "MORNING",
    "THANK YOU": "THANK_YOU",
    "THANKS": "THANK_YOU",
    "WHAT TIME": "WHAT_TIME",
    "TIME": "WHAT_TIME",
    "HOW ARE YOU": "HELLO",
    "HI": "HELLO"
  };

  if (SYNONYM_MAP[upper] && DICTIONARY[SYNONYM_MAP[upper]]) {
    const k = SYNONYM_MAP[upper];
    return { found: true, rawText: cleaned, cleanId: k.toLowerCase(), signKey: DICTIONARY[k].en, knMeaning: cleanKannadaOnly(DICTIONARY[k].kn) };
  }

  // 0. Check if input matches a Kannada word/phrase in DICTIONARY
  for (const [key, val] of Object.entries(DICTIONARY)) {
    const pureKn = cleanKannadaOnly(val.kn);
    if (pureKn && cleaned === pureKn) {
      const cid = (val.gesture_id || key).toLowerCase().replace(/\s+/g, '_');
      return { found: true, rawText: cleaned, cleanId: cid, signKey: val.en || key, knMeaning: pureKn };
    }
  }

  // 1. Exact match in DICTIONARY
  if (DICTIONARY[upper]) {
    const entry = DICTIONARY[upper];
    const cid = (entry.gesture_id || upper).toLowerCase().replace(/\s+/g, '_');
    return { found: true, rawText: cleaned, cleanId: cid, signKey: entry.en || upper, knMeaning: cleanKannadaOnly(entry.kn) };
  }
  if (DICTIONARY[underscored]) {
    const entry = DICTIONARY[underscored];
    const cid = (entry.gesture_id || underscored).toLowerCase();
    return { found: true, rawText: cleaned, cleanId: cid, signKey: entry.en || upper, knMeaning: cleanKannadaOnly(entry.kn) };
  }

  // 2. Single letter A-Z match if user typed a single character or "letter X"
  const letterMatch = upper.match(/^LETTER\s+([A-Z])$/) || upper.match(/^([A-Z])$/);
  if (letterMatch) {
    const ltr = letterMatch[1];
    return { found: true, rawText: cleaned, cleanId: ltr.toLowerCase(), signKey: ltr, knMeaning: DICTIONARY[ltr] ? cleanKannadaOnly(DICTIONARY[ltr].kn) : ltr };
  }

  // Not found in dataset — do NOT show a different gesture!
  return {
    found: false,
    rawText: cleaned,
    cleanId: underscored.toLowerCase(),
    signKey: upper,
    knMeaning: cleaned
  };
}

function showMissingGesturePrompt(gestureText) {
  const cleanName = (gestureText || '').trim();
  state.pendingMissingGesture = cleanName;

  const petIdle = document.getElementById('normal-pet-idle');
  const dualFrames = document.getElementById('normal-dual-frames');
  const missingCard = document.getElementById('normal-missing-gesture-card');
  const missingTitle = document.getElementById('missing-gesture-title');
  const missingDesc = document.getElementById('missing-gesture-desc');
  const masterVideo = document.getElementById('master-reference-video');

  if (petIdle) petIdle.classList.add('hidden');
  if (dualFrames) {
    dualFrames.classList.add('hidden');
    dualFrames.classList.remove('flex');
  }
  if (masterVideo) {
    try { masterVideo.pause(); } catch (e) {}
  }
  if (state.normalViewer) {
    state.normalViewer.isPlaying = false;
  }

  if (missingCard) {
    missingCard.classList.remove('hidden');
    missingCard.classList.add('flex');
  }
  if (missingTitle) {
    missingTitle.textContent = state.currentLang === 'kn'
      ? `"${cleanName}" ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ`
      : `"${cleanName}" is not in the dataset`;
  }
  if (missingDesc) {
    missingDesc.textContent = state.currentLang === 'kn'
      ? `ಈ ಸೈನ್ ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಇಲ್ಲ. ನೀವು "${cleanName}" ಗಾಗಿ ಸೈನ್ ಮಾಡಿ ಡೇಟಾಬೇಸ್‌ನಲ್ಲಿ ಉಳಿಸಲು ಬಯಸುವಿರಾ?`
      : `This gesture is not in the dataset. Do you want to perform the gesture for "${cleanName}" and save it in the database?`;
  }
}
window.showMissingGesturePrompt = showMissingGesturePrompt;

function confirmPerformMissingGesture(customGestureText) {
  const targetGesture = (customGestureText || state.pendingMissingGesture || '').trim();
  if (!targetGesture) return;
  window.location.href = `/?new_gesture=${encodeURIComponent(targetGesture)}&onboard=1`;
}
window.confirmPerformMissingGesture = confirmPerformMissingGesture;

function dismissMissingGesturePrompt() {
  state.pendingMissingGesture = null;
  const missingCard = document.getElementById('normal-missing-gesture-card');
  const petIdle = document.getElementById('normal-pet-idle');
  if (missingCard) {
    missingCard.classList.add('hidden');
    missingCard.classList.remove('flex');
  }
  if (petIdle) {
    petIdle.classList.remove('hidden');
  }
}
window.dismissMissingGesturePrompt = dismissMissingGesturePrompt;

async function showMasterGestureAnd3D(text) {
  if (!text) return;

  let resolved = resolveTrainedGesture(text);
  // If not found in local DICTIONARY, check once with backend in case it was just added to SQLite
  if (!resolved.found) {
    await syncDatasetGestures();
    resolved = resolveTrainedGesture(text);
  }

  if (!resolved.found) {
    showMissingGesturePrompt(resolved.rawText || text);
    return;
  }

  const { cleanId, signKey, knMeaning } = resolved;
  const activeDisplayTitle = state.currentLang === 'kn' ? knMeaning : signKey;

  // Verify the gesture actually has recorded samples in the database
  let sample = null;
  try {
    const res = await fetch(`/api/gestures/${encodeURIComponent(cleanId)}/master-sample`);
    if (res.ok) {
      sample = await res.json();
    } else if (res.status === 404) {
      // Gesture has 0 recorded samples in database
      showMissingGesturePrompt(resolved.rawText || text);
      return;
    }
  } catch (e) {}

  // Hide idle pet card and missing card, reveal dual frames (Upper Master Gesture + Below 3D Model)
  const petIdle = document.getElementById('normal-pet-idle');
  const missingCard = document.getElementById('normal-missing-gesture-card');
  const dualFrames = document.getElementById('normal-dual-frames');
  if (petIdle) petIdle.classList.add('hidden');
  if (missingCard) {
    missingCard.classList.add('hidden');
    missingCard.classList.remove('flex');
  }
  if (dualFrames) {
    dualFrames.classList.remove('hidden');
    dualFrames.classList.add('flex');
  }

  // Update upper frame master gesture details
  const masterTitle = document.getElementById('master-sign-title');
  const masterSignerId = document.getElementById('master-signer-id');
  const masterImg = document.getElementById('master-reference-img');
  const masterVideo = document.getElementById('master-reference-video');
  const masterFallback = document.getElementById('master-reference-fallback');
  const masterFallbackTitle = document.getElementById('master-fallback-title');
  const modelStatusBadge = document.getElementById('model-status-badge');
  const modelStandbyBanner = document.getElementById('model-standby-banner');

  if (masterTitle) {
    masterTitle.textContent = activeDisplayTitle;
  }

  if (sample) {
    if (masterSignerId && sample.signer_id) {
      masterSignerId.textContent = `Signer: ${sample.signer_id} (Master Reference)`;
    }
    if (sample.stored_file_path && sample.stored_file_path !== 'landmarks_only') {
      const mediaUrl = `/${sample.stored_file_path.replace(/^\/+/, '')}`;
      const isVideo = /\.(webm|mp4|mov|mkv)$/i.test(sample.stored_file_path);

      if (masterFallback) masterFallback.classList.add('hidden');

      if (isVideo && masterVideo) {
        if (masterImg) masterImg.classList.add('hidden');
        const rate = Math.max(0.1, Math.min(2.0, state.playbackSpeed || 1.0));
        masterVideo.src = mediaUrl;
        masterVideo.classList.remove('hidden');
        masterVideo.onloadedmetadata = () => {
          try { masterVideo.playbackRate = rate; } catch (e) {}
        };
        masterVideo.load();
        try { masterVideo.playbackRate = rate; } catch (e) {}
        masterVideo.play().catch(() => {});
      } else if (masterImg) {
        if (masterVideo) {
          masterVideo.pause();
          masterVideo.classList.add('hidden');
        }
        masterImg.src = mediaUrl;
        masterImg.classList.remove('hidden');
      }
    } else {
      showFallbackMaster(activeDisplayTitle);
    }
  } else {
    showFallbackMaster(activeDisplayTitle);
  }

  function showFallbackMaster(titleStr) {
    if (masterImg) masterImg.classList.add('hidden');
    if (masterVideo) {
      masterVideo.pause();
      masterVideo.classList.add('hidden');
    }
    if (masterFallback) {
      masterFallback.classList.remove('hidden');
      if (masterFallbackTitle) {
        masterFallbackTitle.textContent = `Master Gesture: ${titleStr}`;
      }
    }
  }

  if (modelStatusBadge) {
    modelStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>Trained Model Active`;
  }
  if (modelStandbyBanner) {
    modelStandbyBanner.innerHTML = `
      <span class="flex items-center gap-1.5 text-secondary-fixed font-medium">
        <span class="material-symbols-outlined text-[15px] text-emerald-400">check_circle</span>
        <span>Streaming 21-Landmark Trajectory: ${activeDisplayTitle}</span>
      </span>
      <span class="text-[10px] text-secondary-fixed font-mono bg-secondary/20 px-1.5 py-0.5 rounded">Live 3D</span>
    `;
  }

  // Below Frame: Initialize 3D 21-Landmark Hand Model and stream real recorded gesture trajectory
  initNormal3DViewer();
  if (state.normalViewer) {
    state.normalViewer.playGesture(cleanId);
  }
}
window.showMasterGestureAnd3D = showMasterGestureAnd3D;

function setInputValue(text) {
  const textarea = document.getElementById('normal-text-input');
  const resolved = resolveTrainedGesture(text);
  const activeText = resolved.found
    ? (state.currentLang === 'kn' ? resolved.knMeaning : resolved.signKey)
    : text;
  if (textarea) textarea.value = activeText;
  // Speak the selected phrase aloud immediately in the active language
  if (!state.isAudioMuted && activeText) {
    speakText(activeText);
  }
  // Activate Upper Master Gesture & Below 3D Landmarks preview (or missing gesture prompt)
  showMasterGestureAnd3D(text);
}
window.setInputValue = setInputValue;

function triggerTranslation() {
  const textarea = document.getElementById('normal-text-input');
  if (!textarea || !textarea.value.trim()) return;

  const text = textarea.value.trim();
  const resolved = resolveTrainedGesture(text);
  const activeMsg = resolved.found
    ? (state.currentLang === 'kn' ? resolved.knMeaning : text)
    : text;

  // Speak immediately FIRST for zero-latency voice output
  if (!state.isAudioMuted) {
    speakText(activeMsg);
  }

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const feed = document.getElementById('normal-chat-feed');

  if (feed) {
    const emptyState = document.getElementById('normal-chat-empty');
    if (emptyState) emptyState.remove();

    const activeUser = getStoredUserProfile();
    const senderLabel = activeUser && activeUser.name
      ? `${activeUser.name} (${activeUser.signer_id})`
      : 'You (Normal User)';
    const senderInitial = activeUser && activeUser.name
      ? activeUser.name.trim().charAt(0).toUpperCase()
      : 'U';

    const msgDiv = document.createElement('div');
    msgDiv.className = "flex flex-col gap-space-xs bg-surface/90 backdrop-blur-sm p-4 rounded-2xl border border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow animate-fade-in";

    if (resolved.found) {
      msgDiv.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-space-xs">
            <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold shadow-xs">${senderInitial}</div>
            <span class="text-label-md font-bold text-on-surface">${senderLabel}</span>
          </div>
          <span class="text-label-sm text-on-surface-variant font-medium">${timeStr}</span>
        </div>
        <p class="text-body-md text-on-surface pl-7 font-bold">${activeMsg}</p>
        <div class="pl-7 flex items-center gap-space-xs pt-space-xs">
          <span class="px-2 py-0.5 rounded-full bg-primary-fixed/80 text-on-primary-fixed text-label-sm font-semibold flex items-center gap-1 shadow-2xs">
            <span class="material-symbols-outlined text-[14px]">sign_language</span> Master Sign &amp; 3D 21-Landmark Output
          </span>
        </div>
      `;
    } else {
      const safeAttr = text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const notFoundText = state.currentLang === 'kn'
        ? 'ಈ ಸೈನ್ ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ. ಇದಕ್ಕಾಗಿ ನೀವು ಸೈನ್ ಮಾಡಲು ಬಯಸುವಿರಾ?'
        : 'This gesture is not in the dataset. Do you want to perform the gesture for this?';
      const yesBtnText = state.currentLang === 'kn' ? 'ಹೌದು, ಸೈನ್ ಮಾಡಿ' : 'Yes, Perform Gesture';
      msgDiv.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-space-xs">
            <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold shadow-xs">${senderInitial}</div>
            <span class="text-label-md font-bold text-on-surface">${senderLabel}</span>
          </div>
          <span class="text-label-sm text-on-surface-variant font-medium">${timeStr}</span>
        </div>
        <p class="text-body-md text-on-surface pl-7 font-bold">${activeMsg}</p>
        <div class="pl-7 mt-1 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span class="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">info</span>
            <span>${notFoundText}</span>
          </span>
          <button onclick="confirmPerformMissingGesture('${safeAttr}')" class="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold shadow-xs btn-bounce transition-all cursor-pointer shrink-0 flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px]">videocam</span>
            <span>${yesBtnText}</span>
          </button>
        </div>
      `;
    }
    feed.appendChild(msgDiv);
    feed.scrollTop = feed.scrollHeight;
  }

  // Display Upper Master Gesture + Below 3D 21-Landmark Hand Model (or Missing Gesture Prompt)
  showMasterGestureAnd3D(text);

  textarea.value = '';
}
window.triggerTranslation = triggerTranslation;

// --------------------------------------------------------------------------
// Sign User Experience (Camera, Tracking & Feedback)
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// Real MediaPipe Hands Detection & 21 3D Landmark Tracking Pipeline
// --------------------------------------------------------------------------
let mediaPipeHandsInstance = null;
let mediaPipeCameraInstance = null;

function initMediaPipeHands() {
  if (mediaPipeHandsInstance) return mediaPipeHandsInstance;
  if (typeof Hands === 'undefined') {
    console.warn("MediaPipe Hands library not loaded from CDN.");
    return null;
  }

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  // Fast real-time configuration: complexity 0 for instant frame tracking and rapid hand recognition
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.35,
    minTrackingConfidence: 0.35
  });

  hands.onResults(onHandTrackingResults);
  mediaPipeHandsInstance = hands;
  return hands;
}

function preloadMediaPipeHands() {
  if (typeof Hands !== 'undefined') {
    try {
      const h = initMediaPipeHands();
      if (h && typeof h.initialize === 'function') {
        h.initialize().catch(() => {});
      }
    } catch (e) {}
  }
}

function onHandTrackingResults(results) {
  const isLiveChat = Boolean(state.isCameraActiveLive);
  const isSignPanel = Boolean(state.isCameraActiveSign);
  if (!isLiveChat && !isSignPanel) return;

  const canvas = document.getElementById(isLiveChat ? 'chat-mesh-canvas' : 'sign-mesh-canvas');
  const badgeLeft = document.getElementById(isLiveChat ? 'chat-live-hand-status' : 'sign-detected-hand');
  const badgeRight = document.getElementById(isLiveChat ? 'chat-live-pred-badge' : 'sign-confidence-score');
  const statusDock = document.getElementById('sign-live-status-dock');
  const handsCountBadge = document.getElementById('sign-hands-count-badge');
  const handednessBadge = document.getElementById('sign-handedness-badge');

  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;

  if (numHands === 0) {
    state.lastPredictedGesture = null;
    state.consecutiveMatchCount = 0;
    state.lastCommittedGesture = null;
    if (!state.isFirstHandStabilized) {
      state.firstHandDetectTime = 0;
    }
    if (badgeLeft) {
      badgeLeft.textContent = state.currentLang === 'kn' ? "ಕೈಗಳಿಗಾಗಿ ಹುಡುಕುತ್ತಿದೆ..." : "Searching for hands...";
    }
    if (badgeRight) badgeRight.textContent = isLiveChat ? (state.currentLang === 'kn' ? "ಸೈನ್ ಮಾಡಿ" : "Perform Sign to Reply") : "--";
    if (!isLiveChat) {
      if (handsCountBadge) handsCountBadge.textContent = "0 Hands";
      if (handednessBadge) handednessBadge.textContent = "No Hands Detected";
    }
    return;
  }

  // Determine Handedness & Scores
  const labels = [];
  let totalScore = 0;
  let scoreCount = 0;

  if (results.multiHandedness && results.multiHandedness.length > 0) {
    results.multiHandedness.forEach(h => {
      const label = h.label || (h.displayName || 'Hand');
      labels.push(label);
      if (h.score != null) {
        totalScore += h.score;
        scoreCount++;
      }
    });
  }

  const avgConfidence = scoreCount > 0 ? (totalScore / scoreCount * 100).toFixed(1) + "%" : "96.5%";
  const handCountStr = numHands === 1 ? "1 Hand" : `${numHands} Hands`;
  const handednessStr = labels.length > 0 ? labels.join(" + ") + " Hand" : (numHands === 1 ? "Single Hand" : "Both Hands");

  if (badgeLeft) badgeLeft.textContent = `${handCountStr} (${handednessStr})`;
  if (!isLiveChat) {
    if (badgeRight) badgeRight.textContent = avgConfidence;
    if (handsCountBadge) handsCountBadge.textContent = handCountStr;
    if (handednessBadge) handednessBadge.textContent = handednessStr;
    if (statusDock) {
      statusDock.classList.remove('hidden');
      statusDock.classList.add('flex');
    }
  }

  // Draw 21 Landmarks & Skeletal Connections for each detected hand
  const connections = [
    [0,1],[1,2],[2,3],[3,4],        // Thumb
    [0,5],[5,6],[6,7],[7,8],        // Index
    [0,9],[9,10],[10,11],[11,12],   // Middle
    [0,13],[13,14],[14,15],[15,16], // Ring
    [0,17],[17,18],[18,19],[19,20], // Pinky
    [5,9],[9,13],[13,17]            // Palm Base
  ];

  results.multiHandLandmarks.forEach((landmarks, handIdx) => {
    const isRight = (labels[handIdx] || '').toLowerCase().includes('right') || handIdx === 0;
    const strokeColor = isRight ? "rgba(137, 245, 231, 0.9)" : "rgba(180, 197, 255, 0.9)";
    const nodeColor = isRight ? "#89f5e7" : "#b4c5ff";

    // 1. Draw Bones
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = strokeColor;
    ctx.lineCap = "round";
    connections.forEach(([i1, i2]) => {
      const p1 = landmarks[i1];
      const p2 = landmarks[i2];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
        ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        ctx.stroke();
      }
    });

    // 2. Draw 21 Joint Nodes
    landmarks.forEach((lm, idx) => {
      const px = lm.x * canvas.width;
      const py = lm.y * canvas.height;

      ctx.beginPath();
      ctx.arc(px, py, (idx === 0 || idx % 4 === 0) ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? "#2563eb" : (idx % 4 === 0 ? nodeColor : "#ffffff");
      ctx.fill();

      // Outer glow for fingertips
      if (idx % 4 === 0 && idx !== 0) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Real-Time ML Model Gesture Prediction (Static A-Z/Super + Dynamic Words)
  // --------------------------------------------------------------------------
  let leftLandmarks = [];
  let rightLandmarks = [];

  results.multiHandLandmarks.forEach((landmarks, handIdx) => {
    const cleanPts = landmarks.map(p => ({
      x: Math.round(p.x * 10000) / 10000,
      y: Math.round(p.y * 10000) / 10000,
      z: Math.round(p.z * 10000) / 10000
    }));
    const hLabel = (labels[handIdx] || '').toLowerCase();
    if (hLabel.includes('left')) {
      leftLandmarks = cleanPts;
    } else if (hLabel.includes('right')) {
      rightLandmarks = cleanPts;
    } else if (leftLandmarks.length === 0) {
      leftLandmarks = cleanPts;
    } else {
      rightLandmarks = cleanPts;
    }
  });

  // In Live Chat camera mode, also mirror live 21 hand landmarks onto the 3D Avatar below
  if (isLiveChat) {
    initChat3DViewer();
    const activeLm = leftLandmarks.length >= 21 ? leftLandmarks : rightLandmarks;
    if (state.chatViewer && activeLm && activeLm.length >= 21) {
      state.chatViewer.isPlaying = false;
      state.chatViewer.setLandmarks(activeLm);
    }
  }

  // --------------------------------------------------------------------------
  // First-Time 5-Second Stabilization Guard
  // (Prevents sudden false 'HELLO' prediction as hand is raised into frame)
  // --------------------------------------------------------------------------
  if (!state.isFirstHandStabilized) {
    if (!state.firstHandDetectTime) {
      state.firstHandDetectTime = Date.now();
    }
    const elapsed = Date.now() - state.firstHandDetectTime;
    if (elapsed < 5000) {
      const remainingSec = Math.max(1, Math.ceil((5000 - elapsed) / 1000));
      const stabMsgEn = `Stabilizing Hand... Ready in ${remainingSec}s`;
      const stabMsgKn = `ಕೈಯನ್ನು ಸಿದ್ಧಗೊಳಿಸಲಾಗುತ್ತಿದೆ... ${remainingSec}ಸೆ`;

      if (badgeRight) {
        badgeRight.textContent = state.currentLang === 'kn' ? `ಸಿದ್ಧತೆ: ${remainingSec}s` : `Ready in ${remainingSec}s`;
      }
      if (!isLiveChat) {
        const recognizedEl = document.getElementById('recognized-text');
        if (recognizedEl) {
          recognizedEl.innerText = state.currentLang === 'kn' ? stabMsgKn : stabMsgEn;
        }
      } else {
        const recOverlayText = document.querySelector('#chat-live-rec-overlay span.text-xs');
        if (recOverlayText) {
          recOverlayText.textContent = `REC - Ready in ${remainingSec}s`;
        }
      }

      // Discard buffer frames during stabilization warmup to avoid false predictions
      state.mlFrameBuffer = [];
      state.lastPredictedGesture = null;
      state.consecutiveMatchCount = 0;
      state.lastCommittedGesture = null;
      return;
    } else {
      // 5-second stabilization period completed!
      state.isFirstHandStabilized = true;
      state.mlFrameBuffer = [];
      state.lastPredictedGesture = null;
      state.consecutiveMatchCount = 0;
      state.lastCommittedGesture = null;

      if (!isLiveChat) {
        const recognizedEl = document.getElementById('recognized-text');
        if (recognizedEl) {
          recognizedEl.innerText = state.currentLang === 'kn' ? "ಸಿದ್ಧವಾಗಿದೆ! ಸೈನ್ ಮಾಡಿ" : "Ready! Perform your sign";
        }
      } else {
        const recOverlayText = document.querySelector('#chat-live-rec-overlay span.text-xs');
        if (recOverlayText) {
          recOverlayText.textContent = "REC - Live Hand Tracking";
        }
      }
    }
  }

  state.mlFrameBuffer.push({
    left_hand_landmarks: leftLandmarks,
    right_hand_landmarks: rightLandmarks,
    timestamp: Date.now()
  });
  if (state.mlFrameBuffer.length > 30) {
    state.mlFrameBuffer.shift();
  }

  // Fast inference: poll every 200ms instead of 420ms for instant hand sign recognition
  const now = Date.now();
  if (!state.mlPredictInFlight && (now - state.lastMlPredictTime >= 200) && state.mlFrameBuffer.length >= 2) {
    state.mlPredictInFlight = true;
    state.lastMlPredictTime = now;
    const framesSnapshot = state.mlFrameBuffer.slice();

    fetch('/api/ml/predict-auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        frames: framesSnapshot,
        mode: state.mlPredictionMode || 'auto'
      })
    })
      .then(r => (r.ok ? r.json() : null))
      .then(pred => {
        if (!pred || !pred.gesture_id) return;
        const confPct = (pred.confidence * 100).toFixed(1) + '%';
        const displayName = (pred.name || pred.gesture_id).toUpperCase();
        const knText = cleanKannadaOnly(pred.kannada_meaning || getKannadaTranslation(displayName));
        const activeLabel = state.currentLang === 'kn' ? knText : displayName;
        const typeTag = pred.gesture_type === 'DYNAMIC' ? 'DYNAMIC' : 'STATIC';

        if (badgeRight) {
          badgeRight.textContent = `${activeLabel} (${confPct})`;
        }

        if (!isLiveChat) {
          const recognizedEl = document.getElementById('recognized-text');
          if (recognizedEl && pred.confidence >= 0.40) {
            recognizedEl.innerText = `${activeLabel} [${typeTag} ${confPct}]`;
          }
        }

        // Fast auto-commit: Instant on confidence >= 0.75, 2 matches for >= 0.60
        if (pred.confidence >= 0.60) {
          if (state.lastPredictedGesture === pred.gesture_id) {
            state.consecutiveMatchCount += 1;
          } else {
            state.lastPredictedGesture = pred.gesture_id;
            state.consecutiveMatchCount = 1;
          }

          const requiredMatches = pred.confidence >= 0.75 ? 1 : 2;
          if (
            state.consecutiveMatchCount >= requiredMatches &&
            state.lastCommittedGesture !== pred.gesture_id
          ) {
            state.lastCommittedGesture = pred.gesture_id;
            state.lastCommittedTime = Date.now();
            if (isLiveChat) {
              sendSignUserLiveReply(displayName, knText, confPct);
            } else {
              simulateGesture(displayName, knText);
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        state.mlPredictInFlight = false;
      });
  }
}

async function toggleSignCamera() {
  const video = document.getElementById('sign-webcam-video');
  const icon = document.getElementById('sign-cam-icon');
  const btn = document.getElementById('sign-cam-toggle-btn');
  const canvas = document.getElementById('sign-mesh-canvas');
  const standby = document.getElementById('sign-camera-standby');
  const badgeLeft = document.getElementById('sign-live-badge-left');
  const badgeRight = document.getElementById('sign-live-badge-right');
  const statusDock = document.getElementById('sign-live-status-dock');

  state.isCameraActiveSign = !state.isCameraActiveSign;

  if (state.isCameraActiveSign) {
    try {
      state.firstHandDetectTime = 0;
      state.isFirstHandStabilized = false;
      state.mlFrameBuffer = [];
      state.lastPredictedGesture = null;
      state.consecutiveMatchCount = 0;
      state.lastCommittedGesture = null;

      // 640x480 resolution for lightning-fast 60fps tracking with zero latency
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      state.cameraStream = stream;
      if (video) {
        video.srcObject = stream;
        video.classList.remove('hidden');
        await video.play();
      }
      if (standby) standby.classList.add('hidden');
      if (badgeLeft) {
        badgeLeft.classList.remove('hidden');
        badgeLeft.classList.add('flex');
        badgeLeft.textContent = state.currentLang === 'kn' ? 'ಕೈಗಳಿಗಾಗಿ ಹುಡುಕುತ್ತಿದೆ...' : 'Searching for hands...';
      }
      if (badgeRight) {
        badgeRight.classList.remove('hidden');
        badgeRight.classList.add('flex');
      }
      if (statusDock) {
        statusDock.classList.remove('hidden');
        statusDock.classList.add('flex');
      }
      if (icon) icon.textContent = 'videocam_off';
      if (btn) btn.classList.add('bg-secondary-container', 'text-on-secondary-container');

      // Initialize real MediaPipe Hands detection
      const hands = initMediaPipeHands();
      if (hands && typeof Camera !== 'undefined' && video) {
        if (mediaPipeCameraInstance) {
          try { mediaPipeCameraInstance.stop(); } catch(e) {}
        }
        mediaPipeCameraInstance = new Camera(video, {
          onFrame: async () => {
            if (state.isCameraActiveSign && video.readyState >= 2) {
              await hands.send({ image: video });
            }
          },
          width: 640,
          height: 480
        });
        await mediaPipeCameraInstance.start();
      } else {
        // Fallback to manual frame loop if Camera utils not loaded
        startVideoProcessingLoop(video, hands);
      }
    } catch (err) {
      console.warn("Webcam access error:", err);
      state.isCameraActiveSign = false;
      alert("Unable to access camera: " + (err.message || err.name));
      if (icon) icon.textContent = 'videocam';
      if (btn) btn.classList.remove('bg-secondary-container', 'text-on-secondary-container');
      if (standby) standby.classList.remove('hidden');
    }
  } else {
    // Teardown camera & hands
    state.firstHandDetectTime = 0;
    state.isFirstHandStabilized = false;
    state.mlFrameBuffer = [];
    state.lastPredictedGesture = null;
    state.consecutiveMatchCount = 0;
    state.lastCommittedGesture = null;

    if (mediaPipeCameraInstance) {
      try { mediaPipeCameraInstance.stop(); } catch(e) {}
      mediaPipeCameraInstance = null;
    }
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(t => t.stop());
      state.cameraStream = null;
    }
    if (video) {
      video.classList.add('hidden');
      video.srcObject = null;
    }
    if (standby) standby.classList.remove('hidden');
    if (badgeLeft) {
      badgeLeft.classList.add('hidden');
      badgeLeft.classList.remove('flex');
    }
    if (badgeRight) {
      badgeRight.classList.add('hidden');
      badgeRight.classList.remove('flex');
    }
    if (statusDock) {
      statusDock.classList.add('hidden');
      statusDock.classList.remove('flex');
    }
    if (icon) icon.textContent = 'videocam';
    if (btn) btn.classList.remove('bg-secondary-container', 'text-on-secondary-container');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}
window.toggleSignCamera = toggleSignCamera;

function startVideoProcessingLoop(video, hands) {
  let isRunning = true;
  async function step() {
    if (!state.isCameraActiveSign) {
      isRunning = false;
      return;
    }
    if (video && video.readyState >= 2 && hands) {
      try {
        await hands.send({ image: video });
      } catch(e) {}
    }
    if (isRunning) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function simulateGesture(textEn, textKn) {
  const cleanKn = cleanKannadaOnly(textKn || getKannadaTranslation(textEn));
  const activeMsg = state.currentLang === 'kn' ? cleanKn : textEn;

  const recognizedEl = document.getElementById('recognized-text');
  if (recognizedEl) recognizedEl.innerText = activeMsg;

  // Speak aloud strictly in the active system language
  if (!state.isAudioMuted) {
    speakText(activeMsg);
  }

  // Append to conversation feed in the active language only
  const feed = document.getElementById('chat-feed');
  if (feed) {
    const emptyState = document.getElementById('sign-chat-empty');
    if (emptyState) emptyState.remove();

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = "flex flex-col items-end gap-xs max-w-[85%] self-end animate-fade-in";
    msgDiv.innerHTML = `
      <div class="flex items-center gap-space-xs">
        <span class="text-[10px] text-outline font-medium">${timeStr}</span>
        <span class="text-label-sm text-on-surface-variant font-medium">You (Sign User - ISL)</span>
        <div class="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center text-[10px] font-bold shadow-xs">IS</div>
      </div>
      <div class="bg-gradient-to-br from-primary to-primary-container text-on-primary p-4 rounded-2xl rounded-tr-sm text-body-md shadow-md border border-primary-fixed/20 flex flex-col gap-space-xs hover:shadow-lg transition-shadow">
        <span class="font-bold tracking-wide">${activeMsg}</span>
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
  const { signKey, knMeaning } = resolveTrainedGesture(val);
  const enMsg = signKey || val.toUpperCase();
  const knMsg = knMeaning || cleanKannadaOnly(val);
  simulateGesture(state.currentLang === 'kn' ? enMsg : val.toUpperCase(), state.currentLang === 'kn' ? knMsg : knMeaning);
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
// Live Chat View (Bidirectional Normal User <-> Sign User ISL Camera Reply)
// --------------------------------------------------------------------------
async function toggleLiveCamera() {
  const video = document.getElementById('chat-webcam-video');
  const canvas = document.getElementById('chat-mesh-canvas');
  const recOverlay = document.getElementById('chat-live-rec-overlay');
  const standby = document.getElementById('chat-camera-standby');
  const btn = document.getElementById('live-cam-toggle-btn');
  const upperLabel = document.getElementById('chat-upper-frame-label');
  const chatMasterImg = document.getElementById('chat-master-img');
  const chatMasterVideo = document.getElementById('chat-master-video');
  const chatMasterCaption = document.getElementById('chat-master-caption');

  // If Sign User tab camera was active, stop it cleanly first
  if (state.isCameraActiveSign) {
    await toggleSignCamera();
  }

  state.isCameraActiveLive = !state.isCameraActiveLive;

  if (state.isCameraActiveLive) {
    try {
      // Hide Master Signer reference so Sign User sees live webcam & 21-landmark skeleton
      if (chatMasterImg) chatMasterImg.classList.add('hidden');
      if (chatMasterVideo) {
        chatMasterVideo.pause();
        chatMasterVideo.classList.add('hidden');
      }
      if (chatMasterCaption) {
        chatMasterCaption.classList.add('hidden');
        chatMasterCaption.classList.remove('flex');
      }
      const chatMissingOverlay = document.getElementById('chat-missing-gesture-overlay');
      if (chatMissingOverlay) {
        chatMissingOverlay.classList.add('hidden');
        chatMissingOverlay.classList.remove('flex');
      }
      if (standby) standby.classList.add('hidden');
      if (upperLabel) upperLabel.textContent = 'Upper: Sign User Live Camera (ISL Reply)';

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      state.cameraStream = stream;

      if (video) {
        video.srcObject = stream;
        video.classList.remove('hidden');
        await video.play();
      }
      if (canvas) {
        canvas.classList.remove('hidden');
      }
      if (recOverlay) {
        recOverlay.classList.remove('hidden');
        recOverlay.classList.add('flex');
      }
      if (btn) {
        btn.classList.remove('bg-surface-container', 'text-on-surface');
        btn.classList.add('bg-secondary', 'text-on-secondary', 'shadow-md');
        btn.innerHTML = '<span id="live-cam-icon" class="material-symbols-outlined text-[20px]">videocam_off</span>';
        btn.title = 'Stop Sign User Camera';
      }

      state.firstHandDetectTime = 0;
      state.isFirstHandStabilized = false;
      state.mlFrameBuffer = [];
      state.lastPredictedGesture = null;
      state.consecutiveMatchCount = 0;
      state.lastCommittedGesture = null;

      const hands = initMediaPipeHands();
      if (hands && typeof Camera !== 'undefined' && video) {
        if (mediaPipeCameraInstance) {
          try { mediaPipeCameraInstance.stop(); } catch (e) {}
        }
        mediaPipeCameraInstance = new Camera(video, {
          onFrame: async () => {
            if (state.isCameraActiveLive && video.readyState >= 2) {
              await hands.send({ image: video });
            }
          },
          width: 640,
          height: 480
        });
        await mediaPipeCameraInstance.start();
      } else {
        startLiveVideoProcessingLoop(video, hands);
      }
    } catch (err) {
      console.warn('Live Chat webcam access error:', err);
      state.isCameraActiveLive = false;
      alert('Unable to access camera: ' + (err.message || err.name));
      if (btn) {
        btn.classList.remove('bg-secondary', 'text-on-secondary', 'shadow-md');
        btn.classList.add('bg-surface-container', 'text-on-surface');
        btn.innerHTML = '<span id="live-cam-icon" class="material-symbols-outlined text-[20px]">videocam</span>';
      }
      if (standby) standby.classList.remove('hidden');
      if (upperLabel) upperLabel.textContent = 'Upper: Master Signer Gesture';
    }
  } else {
    // Teardown Live Chat camera
    state.firstHandDetectTime = 0;
    state.isFirstHandStabilized = false;
    state.mlFrameBuffer = [];
    state.lastPredictedGesture = null;
    state.consecutiveMatchCount = 0;
    state.lastCommittedGesture = null;

    if (mediaPipeCameraInstance) {
      try { mediaPipeCameraInstance.stop(); } catch (e) {}
      mediaPipeCameraInstance = null;
    }
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(t => t.stop());
      state.cameraStream = null;
    }
    if (video) {
      video.classList.add('hidden');
      video.srcObject = null;
    }
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.add('hidden');
    }
    if (recOverlay) {
      recOverlay.classList.add('hidden');
      recOverlay.classList.remove('flex');
    }
    if (standby) standby.classList.remove('hidden');
    if (upperLabel) upperLabel.textContent = 'Upper: Master Signer Gesture';
    if (btn) {
      btn.classList.remove('bg-secondary', 'text-on-secondary', 'shadow-md');
      btn.classList.add('bg-surface-container', 'text-on-surface');
      btn.innerHTML = '<span id="live-cam-icon" class="material-symbols-outlined text-[20px]">videocam</span>';
      btn.title = 'Sign User Camera Reply (Click to toggle camera)';
    }
  }
}
window.toggleLiveCamera = toggleLiveCamera;

function startLiveVideoProcessingLoop(video, hands) {
  let isRunning = true;
  async function step() {
    if (!state.isCameraActiveLive) {
      isRunning = false;
      return;
    }
    if (video && video.readyState >= 2 && hands) {
      try {
        await hands.send({ image: video });
      } catch (e) {}
    }
    if (isRunning) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function sendSignUserLiveReply(textEn, textKn, confPct) {
  if (!textEn) return;
  const kn = cleanKannadaOnly(textKn || getKannadaTranslation(textEn));
  const activeMsg = state.currentLang === 'kn' ? kn : textEn;
  const feed = document.getElementById('live-chat-feed');
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Speak reply aloud strictly in the active system language
  if (!state.isAudioMuted) {
    speakText(activeMsg);
  }

  if (feed) {
    const emptyState = document.getElementById('live-chat-empty');
    if (emptyState) emptyState.remove();

    const msg = document.createElement('div');
    msg.className = "flex flex-col gap-space-xs bg-secondary-container/30 backdrop-blur-sm p-4 rounded-2xl border border-secondary/40 shadow-sm hover:shadow-md transition-shadow animate-fade-in self-end w-full sm:w-[88%]";
    msg.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-space-xs">
          <div class="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-on-secondary text-[11px] font-bold shadow-xs">IS</div>
          <span class="text-label-md font-bold text-on-surface">Sign User (ISL Reply)</span>
        </div>
        <span class="text-label-sm text-on-surface-variant font-medium">${timeStr}</span>
      </div>
      <p class="text-body-md text-on-surface pl-7 font-bold tracking-wide">${activeMsg}</p>
      <div class="pl-7 flex items-center gap-space-xs pt-space-xs">
        <span class="px-2 py-0.5 rounded-full bg-secondary/20 text-secondary font-semibold text-label-sm flex items-center gap-1 border border-secondary/30">
          <span class="material-symbols-outlined text-[14px]">videocam</span> ISL Camera Recognized ${confPct ? `(${confPct})` : ''}
        </span>
      </div>
    `;
    feed.appendChild(msg);
    feed.scrollTop = feed.scrollHeight;
  }

  const input = document.getElementById('live-chat-input');
  if (input && input.value.trim().toUpperCase() === textEn.trim().toUpperCase()) {
    input.value = '';
  }
}
window.sendSignUserLiveReply = sendSignUserLiveReply;

function showChatMissingGesturePrompt(gestureText) {
  const cleanGesture = (gestureText || '').trim();
  state.pendingMissingGesture = cleanGesture;

  const standby = document.getElementById('chat-camera-standby');
  const upperLabel = document.getElementById('chat-upper-frame-label');
  const chatMasterImg = document.getElementById('chat-master-img');
  const chatMasterVideo = document.getElementById('chat-master-video');
  const chatMasterCaption = document.getElementById('chat-master-caption');
  const chatMissingOverlay = document.getElementById('chat-missing-gesture-overlay');
  const titleEl = document.getElementById('chat-missing-gesture-title');
  const descEl = document.getElementById('chat-missing-gesture-desc');
  const badgeEl = document.getElementById('chat-missing-gesture-badge');
  const yesLabelEl = document.getElementById('chat-missing-yes-label');
  const noLabelEl = document.getElementById('chat-missing-no-label');

  if (standby) standby.classList.add('hidden');
  if (upperLabel) {
    upperLabel.textContent = state.currentLang === 'kn' ? 'ಈ ಸೈನ್ ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ' : 'Gesture Not in Dataset';
  }
  if (chatMasterImg) chatMasterImg.classList.add('hidden');
  if (chatMasterVideo) {
    chatMasterVideo.pause();
    chatMasterVideo.classList.add('hidden');
  }
  if (chatMasterCaption) {
    chatMasterCaption.classList.add('hidden');
    chatMasterCaption.classList.remove('flex');
  }
  if (state.chatViewer) {
    state.chatViewer.pause();
  }

  if (state.currentLang === 'kn') {
    if (badgeEl) badgeEl.textContent = 'ಈ ಸೈನ್ ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ';
    if (titleEl) titleEl.textContent = `"${cleanGesture}" ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ`;
    if (descEl) descEl.textContent = 'ಇದಕ್ಕಾಗಿ ನೀವು ಸೈನ್ ಮಾಡಿ ಡೇಟಾಬೇಸ್‌ನಲ್ಲಿ ಉಳಿಸಲು ಬಯಸುವಿರಾ?';
    if (yesLabelEl) yesLabelEl.textContent = 'ಹೌದು, ಸೈನ್ ಮಾಡಿ';
    if (noLabelEl) noLabelEl.textContent = 'ಇಲ್ಲ';
  } else {
    if (badgeEl) badgeEl.textContent = 'Gesture Not in Dataset';
    if (titleEl) titleEl.textContent = `"${cleanGesture}" is not in the dataset`;
    if (descEl) descEl.textContent = 'Do you want to perform the gesture for this and save it in the database?';
    if (yesLabelEl) yesLabelEl.textContent = 'Yes, Perform Gesture';
    if (noLabelEl) noLabelEl.textContent = 'No';
  }

  if (chatMissingOverlay) {
    chatMissingOverlay.classList.remove('hidden');
    chatMissingOverlay.classList.add('flex');
  }
}
window.showChatMissingGesturePrompt = showChatMissingGesturePrompt;

function dismissChatMissingGesturePrompt() {
  state.pendingMissingGesture = null;
  const chatMissingOverlay = document.getElementById('chat-missing-gesture-overlay');
  const standby = document.getElementById('chat-camera-standby');
  const upperLabel = document.getElementById('chat-upper-frame-label');
  if (chatMissingOverlay) {
    chatMissingOverlay.classList.add('hidden');
    chatMissingOverlay.classList.remove('flex');
  }
  if (standby) standby.classList.remove('hidden');
  if (upperLabel) upperLabel.textContent = 'Upper: Master Signer Gesture';
}
window.dismissChatMissingGesturePrompt = dismissChatMissingGesturePrompt;

async function showChatMasterGestureAnd3D(text) {
  if (!text) return;

  // If Live Camera was active, stop it first so the Master Signer gesture is visible in the upper frame
  if (state.isCameraActiveLive) {
    await toggleLiveCamera();
  }

  let resolved = resolveTrainedGesture(text);
  if (!resolved.found) {
    await syncDatasetGestures();
    resolved = resolveTrainedGesture(text);
  }

  if (!resolved.found) {
    showChatMissingGesturePrompt(resolved.rawText || text);
    return;
  }

  const { cleanId, signKey, knMeaning } = resolved;
  const activeTitle = state.currentLang === 'kn' ? knMeaning : signKey;

  let sample = null;
  try {
    const res = await fetch(`/api/gestures/${encodeURIComponent(cleanId)}/master-sample`);
    if (res.ok) {
      sample = await res.json();
    } else if (res.status === 404) {
      showChatMissingGesturePrompt(resolved.rawText || text);
      return;
    }
  } catch (e) {
    console.warn('[Live Chat] Master sample fetch notice:', e);
  }

  const standby = document.getElementById('chat-camera-standby');
  const upperLabel = document.getElementById('chat-upper-frame-label');
  const chatMasterImg = document.getElementById('chat-master-img');
  const chatMasterVideo = document.getElementById('chat-master-video');
  const chatMasterCaption = document.getElementById('chat-master-caption');
  const chatMasterTitle = document.getElementById('chat-master-title');
  const chatMasterSigner = document.getElementById('chat-master-signer');
  const chatMissingOverlay = document.getElementById('chat-missing-gesture-overlay');

  if (chatMissingOverlay) {
    chatMissingOverlay.classList.add('hidden');
    chatMissingOverlay.classList.remove('flex');
  }
  if (standby) standby.classList.add('hidden');
  if (upperLabel) upperLabel.textContent = 'Upper: Master Signer Gesture';
  if (chatMasterTitle) {
    chatMasterTitle.textContent = activeTitle;
  }

  if (sample) {
    if (chatMasterSigner && sample.signer_id) {
      chatMasterSigner.textContent = `Signer: ${sample.signer_id} (Master)`;
    }
    if (sample.stored_file_path && sample.stored_file_path !== 'landmarks_only') {
      const mediaUrl = `/${sample.stored_file_path.replace(/^\/+/, '')}`;
      const isVideo = /\.(webm|mp4|mov|mkv)$/i.test(sample.stored_file_path);

      if (chatMasterCaption) {
        chatMasterCaption.classList.remove('hidden');
        chatMasterCaption.classList.add('flex');
      }

      if (isVideo && chatMasterVideo) {
        if (chatMasterImg) chatMasterImg.classList.add('hidden');
        const rate = Math.max(0.1, Math.min(2.0, state.playbackSpeed || 1.0));
        chatMasterVideo.src = mediaUrl;
        chatMasterVideo.classList.remove('hidden');
        chatMasterVideo.onloadedmetadata = () => {
          try { chatMasterVideo.playbackRate = rate; } catch (e) {}
        };
        chatMasterVideo.load();
        try { chatMasterVideo.playbackRate = rate; } catch (e) {}
        chatMasterVideo.play().catch(() => {});
      } else if (chatMasterImg) {
        if (chatMasterVideo) {
          chatMasterVideo.pause();
          chatMasterVideo.classList.add('hidden');
        }
        chatMasterImg.src = mediaUrl;
        chatMasterImg.classList.remove('hidden');
      }
    }
  }

  initChat3DViewer();
  if (state.chatViewer) {
    state.chatViewer.playGesture(cleanId);
  }
}
window.showChatMasterGestureAnd3D = showChatMasterGestureAnd3D;

function sendLiveMessage() {
  const input = document.getElementById('live-chat-input');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  const resolved = resolveTrainedGesture(text);
  const activeMsg = resolved.found
    ? (state.currentLang === 'kn' ? resolved.knMeaning : text)
    : text;

  // Generate voice output (TTS) immediately for zero-latency audio
  if (!state.isAudioMuted) {
    speakText(activeMsg);
  }

  const feed = document.getElementById('live-chat-feed');
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (feed) {
    const emptyState = document.getElementById('live-chat-empty');
    if (emptyState) emptyState.remove();

    const activeUser = getStoredUserProfile();
    const senderLabel = activeUser && activeUser.name
      ? `${activeUser.name} (${activeUser.signer_id})`
      : 'Normal User';
    const senderInitial = activeUser && activeUser.name
      ? activeUser.name.trim().charAt(0).toUpperCase()
      : 'U';

    const msg = document.createElement('div');
    msg.className = "flex flex-col gap-space-xs bg-surface/90 backdrop-blur-sm p-4 rounded-2xl border border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow animate-fade-in";

    if (resolved.found) {
      msg.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-space-xs">
            <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold shadow-xs">${senderInitial}</div>
            <span class="text-label-md font-bold text-on-surface">${senderLabel}</span>
          </div>
          <span class="text-label-sm text-on-surface-variant font-medium">${timeStr}</span>
        </div>
        <p class="text-body-md text-on-surface pl-7 font-bold">${activeMsg}</p>
        <div class="pl-7 flex items-center gap-space-xs pt-space-xs">
          <span class="px-2 py-0.5 rounded-full bg-primary-fixed/80 text-on-primary-fixed text-label-sm font-semibold flex items-center gap-1 shadow-2xs">
            <span class="material-symbols-outlined text-[14px]">sign_language</span> Master Sign &amp; 3D ISL Avatar Output
          </span>
        </div>
      `;
    } else {
      const safeAttr = text.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const notFoundText = state.currentLang === 'kn'
        ? 'ಈ ಸೈನ್ ಡೇಟಾಸೆಟ್‌ನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ. ಇದಕ್ಕಾಗಿ ನೀವು ಸೈನ್ ಮಾಡಲು ಬಯಸುವಿರಾ?'
        : 'This gesture is not in the dataset. Do you want to perform the gesture for this?';
      const yesBtnText = state.currentLang === 'kn' ? 'ಹೌದು, ಸೈನ್ ಮಾಡಿ' : 'Yes, Perform Gesture';
      msg.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-space-xs">
            <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold shadow-xs">${senderInitial}</div>
            <span class="text-label-md font-bold text-on-surface">${senderLabel}</span>
          </div>
          <span class="text-label-sm text-on-surface-variant font-medium">${timeStr}</span>
        </div>
        <p class="text-body-md text-on-surface pl-7 font-bold">${activeMsg}</p>
        <div class="pl-7 mt-1 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span class="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">info</span>
            <span>${notFoundText}</span>
          </span>
          <button onclick="confirmPerformMissingGesture('${safeAttr}')" class="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold shadow-xs btn-bounce transition-all cursor-pointer shrink-0 flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px]">videocam</span>
            <span>${yesBtnText}</span>
          </button>
        </div>
      `;
    }
    feed.appendChild(msg);
    feed.scrollTop = feed.scrollHeight;
  }

  // Show Upper Master Signer Gesture + Below 3D ISL Avatar (or Missing Gesture Prompt if not in dataset)
  showChatMasterGestureAnd3D(text);

  input.value = '';
}
window.sendLiveMessage = sendLiveMessage;

// --------------------------------------------------------------------------
// Interactive "How It Works" Architecture Pipeline Switcher
// --------------------------------------------------------------------------
function switchHiwMode(mode) {
  const tabs = {
    'both': document.getElementById('hiw-tab-both'),
    'sign': document.getElementById('hiw-tab-sign'),
    'voice': document.getElementById('hiw-tab-voice'),
  };

  Object.entries(tabs).forEach(([k, btn]) => {
    if (!btn) return;
    if (k === mode) {
      btn.className = "px-4 py-2 rounded-xl text-label-md font-bold transition-all bg-primary text-on-primary shadow-sm cursor-pointer";
    } else {
      btn.className = "px-4 py-2 rounded-xl text-label-md font-medium text-on-surface-variant hover:text-on-surface transition-all cursor-pointer";
    }
  });

  const steps = document.querySelectorAll('.hiw-step');
  steps.forEach(step => {
    const pipelines = (step.getAttribute('data-pipeline') || '').split(',');
    if (mode === 'both' || pipelines.includes(mode)) {
      step.classList.remove('opacity-30', 'grayscale', 'scale-95');
      step.classList.add('opacity-100', 'scale-100');
    } else {
      step.classList.add('opacity-30', 'grayscale', 'scale-95');
      step.classList.remove('opacity-100', 'scale-100');
    }
  });
}
window.switchHiwMode = switchHiwMode;

// --------------------------------------------------------------------------
// Initialization on DOM Ready
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Theme preference (Dark / Light Mode)
  initTheme();
  preloadSpeechVoices();
  preloadMediaPipeHands();
  syncDatasetGestures();

  // Automatically turn off camera whenever the user switches to another tab or minimizes browser
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.isCameraActiveSign) {
        toggleSignCamera();
      }
      if (state.isCameraActiveLive) {
        toggleLiveCamera();
      }
      state.firstHandDetectTime = 0;
      state.isFirstHandStabilized = false;
      state.mlFrameBuffer = [];
      state.lastPredictedGesture = null;
      state.consecutiveMatchCount = 0;
      state.lastCommittedGesture = null;
    }
  });

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

  // Enter key shortcut on Normal User text input to trigger Generate ISL
  const normalInput = document.getElementById('normal-text-input');
  if (normalInput) {
    normalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        triggerTranslation();
      }
    });
  }

  // Enter key shortcut on Sign User manual text input to trigger Send
  const manualInput = document.getElementById('manual-text-input');
  if (manualInput) {
    manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendManualMessage();
      }
    });
  }

  // Automatically translate any newly inserted DOM elements when Kannada mode is active
  if (typeof MutationObserver !== 'undefined' && document.body) {
    const langObserver = new MutationObserver(() => {
      if (state.currentLang === 'kn' && !isTranslatingDOM) {
        applyFullPageTranslation('kn');
      }
    });
    langObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Initialize User Profile Badge in Header
  updateHeaderProfileBadge();

  console.log("ISL Connect User Application Initialized successfully.");
});

// --------------------------------------------------------------------------
// User Profile & Registration System (Auto-Generated Unique ID + Validation)
// --------------------------------------------------------------------------
function generateUniqueUserId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `USR-${suffix}`;
}
window.generateUniqueUserId = generateUniqueUserId;

function getStoredUserProfile() {
  try {
    const raw = localStorage.getItem('g2t2g_user_profile');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.signer_id && parsed.name) {
      return parsed;
    }
  } catch (e) {}
  return null;
}
window.getStoredUserProfile = getStoredUserProfile;

function updateHeaderProfileBadge() {
  const profile = getStoredUserProfile();
  const labelEl = document.getElementById('header-profile-label');
  const iconEl = document.getElementById('header-profile-icon');
  const btnEl = document.getElementById('header-profile-btn');
  if (!labelEl || !btnEl) return;

  if (profile && profile.name) {
    const firstName = profile.name.trim().split(/\s+/)[0];
    labelEl.textContent = `${firstName} (${profile.signer_id})`;
    if (iconEl) iconEl.textContent = 'verified_user';
    btnEl.title = `Signed in as ${profile.name} (${profile.signer_id}) — Click to view/edit`;
  } else {
    labelEl.textContent = state.currentLang === 'kn' ? 'ಲಾಗಿನ್' : 'Sign In';
    if (iconEl) iconEl.textContent = 'person';
    btnEl.title = 'User Profile & Registration';
  }
}
window.updateHeaderProfileBadge = updateHeaderProfileBadge;

function openUserProfileModal() {
  const modal = document.getElementById('user-profile-modal');
  if (!modal) return;

  const existing = getStoredUserProfile();
  const uniqueId = (existing && existing.signer_id) ? existing.signer_id : generateUniqueUserId();

  const idInput = document.getElementById('profile-unique-id');
  const idDisplay = document.getElementById('profile-unique-id-display');
  const nameInput = document.getElementById('profile-name');
  const ageInput = document.getElementById('profile-age');
  const genderInput = document.getElementById('profile-gender');
  const roleInput = document.getElementById('profile-role');
  const contactInput = document.getElementById('profile-contact');
  const emailInput = document.getElementById('profile-email');
  const logoutBtn = document.getElementById('profile-logout-btn');
  const errBox = document.getElementById('profile-form-error');

  if (idInput) idInput.value = uniqueId;
  if (idDisplay) idDisplay.textContent = uniqueId;
  if (nameInput) nameInput.value = existing?.name || '';
  if (ageInput) ageInput.value = existing?.age || '';
  if (genderInput) genderInput.value = existing?.gender || '';
  if (roleInput) roleInput.value = existing?.role || 'Normal / Hearing User';
  if (contactInput) contactInput.value = existing?.contact_number || '';
  if (emailInput) emailInput.value = existing?.email || '';
  if (errBox) {
    errBox.classList.add('hidden');
    errBox.classList.remove('flex');
  }
  if (logoutBtn) {
    if (existing) logoutBtn.classList.remove('hidden');
    else logoutBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => nameInput?.focus(), 60);
}
window.openUserProfileModal = openUserProfileModal;

function closeUserProfileModal() {
  const modal = document.getElementById('user-profile-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}
window.closeUserProfileModal = closeUserProfileModal;

function showProfileFormError(msg) {
  const errBox = document.getElementById('profile-form-error');
  const errText = document.getElementById('profile-form-error-text');
  if (errText) errText.textContent = msg;
  if (errBox) {
    errBox.classList.remove('hidden');
    errBox.classList.add('flex');
  }
}

async function saveUserProfileForm(e) {
  if (e) e.preventDefault();

  const uniqueId = (document.getElementById('profile-unique-id')?.value || '').trim() || generateUniqueUserId();
  const name = (document.getElementById('profile-name')?.value || '').trim();
  const ageVal = parseInt(document.getElementById('profile-age')?.value || '', 10);
  const gender = (document.getElementById('profile-gender')?.value || '').trim();
  const role = (document.getElementById('profile-role')?.value || 'Normal / Hearing User').trim();
  const contact = (document.getElementById('profile-contact')?.value || '').replace(/\s+/g, '').trim();
  const email = (document.getElementById('profile-email')?.value || '').trim();

  if (!name || name.length < 2) {
    showProfileFormError('Please enter your full name (minimum 2 characters).');
    return;
  }
  if (isNaN(ageVal) || ageVal < 5 || ageVal > 100) {
    showProfileFormError('Please enter a valid age between 5 and 100.');
    return;
  }
  if (!gender) {
    showProfileFormError('Please select your gender.');
    return;
  }
  if (!/^[6-9]\d{9}$/.test(contact)) {
    showProfileFormError('Please enter a valid 10-digit mobile contact number (starting with 6–9).');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    showProfileFormError('Please enter a valid email address (e.g., name@example.com).');
    return;
  }

  const profileData = {
    signer_id: uniqueId,
    name: name,
    age: ageVal,
    gender: gender,
    role: role,
    contact_number: contact,
    email: email
  };

  // Save in localStorage so both /connect and Dataset Collector share the exact Unique ID & Name
  localStorage.setItem('g2t2g_user_profile', JSON.stringify(profileData));
  localStorage.setItem('isl_active_signer', uniqueId);

  // Also persist in SQLite database via /api/signers
  try {
    await fetch('/api/signers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signer_id: uniqueId,
        display_name: name,
        age: ageVal,
        gender: gender,
        role: role,
        contact_number: contact,
        email: email,
        enabled: true
      })
    });
  } catch (err) {
    console.warn('Could not sync user profile to backend:', err);
  }

  updateHeaderProfileBadge();
  closeUserProfileModal();
}
window.saveUserProfileForm = saveUserProfileForm;

function clearUserProfile() {
  localStorage.removeItem('g2t2g_user_profile');
  updateHeaderProfileBadge();
  closeUserProfileModal();
}
window.clearUserProfile = clearUserProfile;
