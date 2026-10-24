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
  mlPredictionMode: 'auto' // 'auto' | 'static' | 'dynamic'
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
  "SUPER": { en: "SUPER", kn: "ಸೂಪರ್ / ಅತ್ಯುತ್ತಮ (Super)" },
  "NEED HELP": { en: "NEED HELP", kn: "ಸಹಾಯ ಬೇಕು (Sahaya Beku)" },
  "ALL CLEAR": { en: "ALL CLEAR", kn: "ಎಲ್ಲವೂ ಸರಿ (Ellavu Sari)" }
};

// Populate A-Z static alphabet signs in DICTIONARY
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
  DICTIONARY[letter] = { en: `Letter ${letter}`, kn: `ಅಕ್ಷರ ${letter}` };
});

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

  const liveLangLabel = document.getElementById('live-lang-label');
  if (liveLangLabel) {
    liveLangLabel.textContent = lang === 'en' ? 'English' : 'ಕನ್ನಡ (Kannada)';
  }

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

    // Prevent back-to-back duplicate utterance of the same word
    const now = Date.now();
    if (state.lastSpokenText === cleanSpeech && (now - (state.lastSpokenTime || 0)) < 2500) {
      return;
    }
    state.lastSpokenText = cleanSpeech;
    state.lastSpokenTime = now;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
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
      speakBtn.classList.remove('from-primary', 'to-primary-container', 'bg-primary');
      speakBtn.classList.add('bg-error', 'from-error', 'to-red-700', 'text-on-error');
    } else {
      speakBtn.classList.remove('bg-error', 'from-error', 'to-red-700', 'text-on-error');
      speakBtn.classList.add('from-primary', 'to-primary-container', 'text-on-primary');
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
        const x = pt.x !== undefined ? (pt.x - 0.5) * 14 : ((pt[0] !== undefined ? pt[0] - 0.5 : 0) * 14);
        const y = pt.y !== undefined ? (0.5 - pt.y) * 14 : ((pt[1] !== undefined ? 0.5 - pt[1] : 0) * 14);
        const z = pt.z !== undefined ? -pt.z * 14 : (-(pt[2] || 0) * 14);
        this.joints[i].position.set(x, y, z);
      }
    });
    this.updateBones();
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
          const firstLm = data.frames[0].left_hand_landmarks && data.frames[0].left_hand_landmarks.length >= 21
            ? data.frames[0].left_hand_landmarks
            : data.frames[0].right_hand_landmarks;
          if (firstLm) this.setLandmarks(firstLm);
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

    // Stream real recorded 21-landmark sequence when playing a dynamic gesture
    if (this.isPlaying && this.sequenceFrames && this.sequenceFrames.length > 1) {
      this.frameCursor = (this.frameCursor || 0) + 0.35 * (this.speed || 1.0);
      if (this.frameCursor >= this.sequenceFrames.length) {
        this.frameCursor = 0;
      }
      const idx = Math.floor(this.frameCursor) % this.sequenceFrames.length;
      const frame = this.sequenceFrames[idx];
      if (frame) {
        const lm = (frame.left_hand_landmarks && frame.left_hand_landmarks.length >= 21)
          ? frame.left_hand_landmarks
          : frame.right_hand_landmarks;
        if (lm) this.setLandmarks(lm);
      }
    }

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
    "HOW ARE YOU": "HELLO"
  };

  if (SYNONYM_MAP[upper] && DICTIONARY[SYNONYM_MAP[upper]]) {
    const k = SYNONYM_MAP[upper];
    return { cleanId: k.toLowerCase(), signKey: DICTIONARY[k].en, knMeaning: cleanKannadaOnly(DICTIONARY[k].kn) };
  }

  // 0. Check if input matches a Kannada word/phrase in DICTIONARY
  for (const [key, val] of Object.entries(DICTIONARY)) {
    const pureKn = cleanKannadaOnly(val.kn);
    if (pureKn && (cleaned === pureKn || cleaned.includes(pureKn))) {
      const cid = key.toLowerCase().replace(/\s+/g, '_');
      return { cleanId: cid, signKey: val.en || key, knMeaning: pureKn };
    }
  }

  // 1. Exact match in DICTIONARY
  if (DICTIONARY[upper]) {
    const cid = upper.toLowerCase().replace(/\s+/g, '_');
    return { cleanId: cid, signKey: upper, knMeaning: cleanKannadaOnly(DICTIONARY[upper].kn) };
  }
  if (DICTIONARY[underscored]) {
    return { cleanId: underscored.toLowerCase(), signKey: DICTIONARY[underscored].en, knMeaning: cleanKannadaOnly(DICTIONARY[underscored].kn) };
  }

  // 2. Multi-character word/phrase match (sorted longest-first so single letters A-Z don't falsely match)
  const multiCharKeys = Object.keys(DICTIONARY)
    .filter(k => k.length > 1)
    .sort((a, b) => b.length - a.length);

  const words = upper.split(/\s+/);
  for (const key of multiCharKeys) {
    if (upper.includes(key) || words.includes(key)) {
      const cid = key.toLowerCase().replace(/\s+/g, '_');
      return { cleanId: cid, signKey: key.replace(/_/g, ' '), knMeaning: cleanKannadaOnly(DICTIONARY[key].kn) };
    }
  }

  // 3. Single letter A-Z fallback if user typed a single character or "letter X"
  const letterMatch = upper.match(/^LETTER\s+([A-Z])$/) || upper.match(/^([A-Z])$/);
  if (letterMatch) {
    const ltr = letterMatch[1];
    return { cleanId: ltr.toLowerCase(), signKey: ltr, knMeaning: DICTIONARY[ltr] ? cleanKannadaOnly(DICTIONARY[ltr].kn) : ltr };
  }

  // Default fallback to HELLO
  return { cleanId: 'hello', signKey: 'HELLO', knMeaning: cleanKannadaOnly(DICTIONARY['HELLO'].kn) };
}

async function showMasterGestureAnd3D(text) {
  if (!text) return;

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
  const masterVideo = document.getElementById('master-reference-video');
  const masterFallback = document.getElementById('master-reference-fallback');
  const masterFallbackTitle = document.getElementById('master-fallback-title');
  const modelStatusBadge = document.getElementById('model-status-badge');
  const modelStandbyBanner = document.getElementById('model-standby-banner');

  const { cleanId, signKey, knMeaning } = resolveTrainedGesture(text);
  const activeDisplayTitle = state.currentLang === 'kn' ? knMeaning : signKey;

  if (masterTitle) {
    masterTitle.textContent = activeDisplayTitle;
  }

  try {
    const res = await fetch(`/api/gestures/${encodeURIComponent(cleanId)}/master-sample`);
    if (res.ok) {
      const sample = await res.json();
      if (masterSignerId && sample.signer_id) {
        masterSignerId.textContent = `Signer: ${sample.signer_id} (Master Reference)`;
      }
      if (sample && sample.stored_file_path && sample.stored_file_path !== 'landmarks_only') {
        const mediaUrl = `/${sample.stored_file_path.replace(/^\/+/, '')}`;
        const isVideo = /\.(webm|mp4|mov|mkv)$/i.test(sample.stored_file_path);

        if (masterFallback) masterFallback.classList.add('hidden');

        if (isVideo && masterVideo) {
          if (masterImg) masterImg.classList.add('hidden');
          masterVideo.src = mediaUrl;
          masterVideo.classList.remove('hidden');
          masterVideo.load();
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
  } catch (e) {
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
  const { signKey, knMeaning } = resolveTrainedGesture(text);
  const activeText = state.currentLang === 'kn' ? knMeaning : signKey;
  if (textarea) textarea.value = activeText;
  // Speak the selected phrase aloud in the active language only
  if (!state.isAudioMuted && activeText) {
    speakText(activeText);
  }
  // Automatically activate Upper Master Gesture & Below 3D Landmarks preview
  showMasterGestureAnd3D(text);
}
window.setInputValue = setInputValue;

function triggerTranslation() {
  const textarea = document.getElementById('normal-text-input');
  if (!textarea || !textarea.value.trim()) return;

  const text = textarea.value.trim();
  const { signKey, knMeaning } = resolveTrainedGesture(text);
  const activeMsg = state.currentLang === 'kn' ? knMeaning : text;
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const feed = document.getElementById('normal-chat-feed');

  // Generate voice output (TTS) strictly in the active language
  if (!state.isAudioMuted) {
    speakText(activeMsg);
  }

  if (feed) {
    const emptyState = document.getElementById('normal-chat-empty');
    if (emptyState) emptyState.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = "flex flex-col gap-space-xs bg-surface/90 backdrop-blur-sm p-4 rounded-2xl border border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow animate-fade-in";
    msgDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-space-xs">
          <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold shadow-xs">U</div>
          <span class="text-label-md font-bold text-on-surface">You (Normal User)</span>
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

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  hands.onResults(onHandTrackingResults);
  mediaPipeHandsInstance = hands;
  return hands;
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
    if (badgeLeft) badgeLeft.textContent = "Searching for hands...";
    if (badgeRight) badgeRight.textContent = isLiveChat ? "Perform Sign to Reply" : "--";
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

  state.mlFrameBuffer.push({
    left_hand_landmarks: leftLandmarks,
    right_hand_landmarks: rightLandmarks,
    timestamp: Date.now()
  });
  if (state.mlFrameBuffer.length > 30) {
    state.mlFrameBuffer.shift();
  }

  const now = Date.now();
  if (!state.mlPredictInFlight && (now - state.lastMlPredictTime >= 420) && state.mlFrameBuffer.length >= 2) {
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
          if (recognizedEl && pred.confidence >= 0.45) {
            recognizedEl.innerText = `${activeLabel} [${typeTag} ${confPct}]`;
          }
        }

        // Auto-commit high-confidence stabilized predictions to conversation feed
        if (pred.confidence >= 0.70) {
          if (state.lastPredictedGesture === pred.gesture_id) {
            state.consecutiveMatchCount += 1;
          } else {
            state.lastPredictedGesture = pred.gesture_id;
            state.consecutiveMatchCount = 1;
          }

          if (
            state.consecutiveMatchCount >= 2 &&
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
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
        mediaPipeCameraInstance = new Camera(video, {
          onFrame: async () => {
            if (state.isCameraActiveSign && video.readyState >= 2) {
              await hands.send({ image: video });
            }
          },
          width: 1280,
          height: 720
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
      if (standby) standby.classList.add('hidden');
      if (upperLabel) upperLabel.textContent = 'Upper: Sign User Live Camera (ISL Reply)';

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
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

      state.mlFrameBuffer = [];
      state.lastPredictedGesture = null;
      state.consecutiveMatchCount = 0;

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
          width: 1280,
          height: 720
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

async function showChatMasterGestureAnd3D(text) {
  if (!text) return;

  // If Live Camera was active, stop it first so the Master Signer gesture is visible in the upper frame
  if (state.isCameraActiveLive) {
    await toggleLiveCamera();
  }

  const { cleanId, signKey, knMeaning } = resolveTrainedGesture(text);
  const activeTitle = state.currentLang === 'kn' ? knMeaning : signKey;

  const standby = document.getElementById('chat-camera-standby');
  const upperLabel = document.getElementById('chat-upper-frame-label');
  const chatMasterImg = document.getElementById('chat-master-img');
  const chatMasterVideo = document.getElementById('chat-master-video');
  const chatMasterCaption = document.getElementById('chat-master-caption');
  const chatMasterTitle = document.getElementById('chat-master-title');
  const chatMasterSigner = document.getElementById('chat-master-signer');

  if (standby) standby.classList.add('hidden');
  if (upperLabel) upperLabel.textContent = 'Upper: Master Signer Gesture';
  if (chatMasterTitle) {
    chatMasterTitle.textContent = activeTitle;
  }

  try {
    const res = await fetch(`/api/gestures/${encodeURIComponent(cleanId)}/master-sample`);
    if (res.ok) {
      const sample = await res.json();
      if (chatMasterSigner && sample.signer_id) {
        chatMasterSigner.textContent = `Signer: ${sample.signer_id} (Master)`;
      }
      if (sample && sample.stored_file_path && sample.stored_file_path !== 'landmarks_only') {
        const mediaUrl = `/${sample.stored_file_path.replace(/^\/+/, '')}`;
        const isVideo = /\.(webm|mp4|mov|mkv)$/i.test(sample.stored_file_path);

        if (chatMasterCaption) {
          chatMasterCaption.classList.remove('hidden');
          chatMasterCaption.classList.add('flex');
        }

        if (isVideo && chatMasterVideo) {
          if (chatMasterImg) chatMasterImg.classList.add('hidden');
          chatMasterVideo.src = mediaUrl;
          chatMasterVideo.classList.remove('hidden');
          chatMasterVideo.load();
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
  } catch (e) {
    console.warn('[Live Chat] Master sample fetch notice:', e);
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
  const { knMeaning } = resolveTrainedGesture(text);
  const activeMsg = state.currentLang === 'kn' ? knMeaning : text;

  // Generate voice output (TTS) strictly in the active system language
  if (!state.isAudioMuted) {
    speakText(activeMsg);
  }

  const feed = document.getElementById('live-chat-feed');
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (feed) {
    const emptyState = document.getElementById('live-chat-empty');
    if (emptyState) emptyState.remove();

    const msg = document.createElement('div');
    msg.className = "flex flex-col gap-space-xs bg-surface/90 backdrop-blur-sm p-4 rounded-2xl border border-outline-variant/30 shadow-sm hover:shadow-md transition-shadow animate-fade-in";
    msg.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-space-xs">
          <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary text-[12px] font-bold shadow-xs">U</div>
          <span class="text-label-md font-bold text-on-surface">Normal User</span>
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
    feed.appendChild(msg);
    feed.scrollTop = feed.scrollHeight;
  }

  // Always show Upper Master Signer Gesture in the camera display + Below 3D ISL Avatar
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

  console.log("ISL Connect User Application Initialized successfully.");
});
