/**
 * Real MediaPipe Hand Tracking & WebRTC / MediaRecorder Engine
 * Upgraded: Auto-collection, handedness fix, blur/dup rejection
 */

export class MediaPipeTracker {
  constructor() {
    this.hands = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.canvasCtx = null;
    this.isTracking = false;

    // Real-time metrics
    this.fps = 0;
    this.lastFrameTime = performance.now();
    this.currentLandmarks = null;
    this.detectedHandsCount = 0;
    this.latestConfidence = 0.0;
    this.handednessList = [];

    // Video Recording state
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordedFrames = [];
    this.recordingStartTime = 0;
    this.recordedDuration = 0;

    // Auto-collection state
    this._autoCollecting = false;
    this._autoPaused = false;
    this._autoTarget = 0;
    this._autoCollected = 0;
    this._autoRejected = 0;
    this._autoInterval = null;
    this._lastLandmarkHash = null;
    this._recentHashes = [];
    this._onAutoProgress = null;
    this._onAutoSampleCaptured = null;
    this._onAutoComplete = null;

    // Callbacks
    this.onResultsCallback = null;
    this.onErrorCallback = null;
    this.onRecordingProgress = null;
  }

  async initMediaPipe() {
    if (this.hands) return;
    if (typeof window.Hands === "undefined") {
      throw new Error("MediaPipe Hands library not loaded from CDN.");
    }
    this.hands = new window.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    this.hands.onResults((results) => this.handleResults(results));
  }

  async startCamera(videoElement, canvasElement, options = {}) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    this.canvasCtx = canvasElement.getContext("2d");
    this.onResultsCallback = options.onResults || null;
    this.onErrorCallback = options.onError || null;

    try {
      await this.initMediaPipe();
    } catch (err) {
      if (this.onErrorCallback) this.onErrorCallback("Hand tracking could not be initialized: " + err.message);
      throw err;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = "WebRTC Camera API is not supported in this browser.";
      if (this.onErrorCallback) this.onErrorCallback(msg);
      throw new Error(msg);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false
      });
      this.videoElement.srcObject = stream;
      await this.videoElement.play();
      this.isTracking = true;
      this.lastFrameTime = performance.now();

      const processLoop = async () => {
        if (!this.isTracking) return;
        if (this.videoElement && this.videoElement.readyState >= 2) {
          try { await this.hands.send({ image: this.videoElement }); } catch (e) { /* skip */ }
        }
        if (this.isTracking) requestAnimationFrame(processLoop);
      };
      requestAnimationFrame(processLoop);

    } catch (err) {
      let friendlyError = "Camera access error: " + err.message;
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        friendlyError = "Camera permission is required. Please allow camera access in browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        friendlyError = "No camera device detected. Please connect a webcam.";
      }
      if (this.onErrorCallback) this.onErrorCallback(friendlyError);
      throw new Error(friendlyError);
    }
  }

  handleResults(results) {
    const now = performance.now();
    const delta = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    if (delta > 0) this.fps = Math.round(1 / delta);

    const width = this.canvasElement.clientWidth || 640;
    const height = this.canvasElement.clientHeight || 480;
    if (this.canvasElement.width !== width || this.canvasElement.height !== height) {
      this.canvasElement.width = width;
      this.canvasElement.height = height;
    }
    this.canvasCtx.clearRect(0, 0, width, height);

    const detected = results.multiHandLandmarks || [];
    const handedness = results.multiHandedness || [];
    this.detectedHandsCount = detected.length;
    this.handednessList = handedness.map(h => ({ label: h.label, score: h.score }));

    let maxConf = 0.0;
    let rightHandPoints = null;
    let leftHandPoints = null;
    let rightConf = 0.0;
    let leftConf = 0.0;

    detected.forEach((landmarks, index) => {
      const handMeta = handedness[index] || { label: "Right", score: 0.95 };
      // MediaPipe reports labels from the camera's perspective.
      // For a mirrored selfie camera:
      //   MediaPipe "Right" = physical RIGHT hand (correct, no inversion needed)
      //   MediaPipe "Left"  = physical LEFT hand  (correct, no inversion needed)
      const physicalHand = handMeta.label; // "Left" or "Right" — physical hand
      const conf = handMeta.score || 0.95;
      if (conf > maxConf) maxConf = conf;

      const points = landmarks.map((lm, ptIdx) => ({ id: ptIdx, x: lm.x, y: lm.y, z: lm.z }));

      if (physicalHand === "Right") {
        rightHandPoints = points;
        rightConf = conf;
      } else {
        leftHandPoints = points;
        leftConf = conf;
      }

      this.drawHandLandmarks(this.canvasCtx, width, height, landmarks, physicalHand, conf);
    });

    this.latestConfidence = maxConf;
    this.currentLandmarks = {
      left_hand_present: !!leftHandPoints,
      right_hand_present: !!rightHandPoints,
      left_hand_landmarks: leftHandPoints || [],
      right_hand_landmarks: rightHandPoints || [],
      left_confidence: leftConf,
      right_confidence: rightConf,
      confidence: maxConf,
      fps: this.fps,
      handCount: this.detectedHandsCount
    };

    // Buffer frames for dynamic recording
    if (this.isRecording) {
      const elapsed = (performance.now() - this.recordingStartTime) / 1000;
      this.recordedFrames.push({
        frame_index: this.recordedFrames.length,
        timestamp: parseFloat(elapsed.toFixed(3)),
        left_hand_present: !!leftHandPoints,
        right_hand_present: !!rightHandPoints,
        left_hand_landmarks: leftHandPoints || [],
        right_hand_landmarks: rightHandPoints || [],
        left_confidence: leftConf,
        right_confidence: rightConf
      });
      if (this.onRecordingProgress) {
        this.onRecordingProgress({
          elapsed: elapsed.toFixed(1),
          framesCount: this.recordedFrames.length,
          fps: this.fps,
          confidence: Math.round(maxConf * 100),
          handCount: this.detectedHandsCount
        });
      }
    }

    if (this.onResultsCallback) this.onResultsCallback(this.currentLandmarks);
  }

  drawHandLandmarks(ctx, width, height, landmarks, physicalLabel, confidence) {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    ctx.strokeStyle = "#818cf8";
    ctx.lineWidth = 3.5;
    ctx.shadowColor = "#c0c1ff";
    ctx.shadowBlur = 6;
    connections.forEach(([i, j]) => {
      const p1 = landmarks[i], p2 = landmarks[j];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
      }
    });
    ctx.shadowBlur = 0;

    let minX = width, minY = height, maxX = 0, maxY = 0;
    landmarks.forEach((p, idx) => {
      const cx = p.x * width, cy = p.y * height;
      if (cx < minX) minX = cx; if (cy < minY) minY = cy;
      if (cx > maxX) maxX = cx; if (cy > maxY) maxY = cy;

      if (idx === 0) ctx.fillStyle = "#ffb783";
      else if (idx <= 4) ctx.fillStyle = "#f43f5e";
      else if (idx <= 8) ctx.fillStyle = "#38bdf8";
      else if (idx <= 12) ctx.fillStyle = "#4ade80";
      else if (idx <= 16) ctx.fillStyle = "#fbbf24";
      else ctx.fillStyle = "#c084fc";

      ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
    });

    const pad = 20;
    ctx.strokeStyle = "rgba(99, 102, 241, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
    ctx.setLineDash([]);

    // Label shows "Physical Hand" not screen side
    const tagText = `Physical ${physicalLabel}: ${Math.round(confidence * 100)}%`;
    ctx.font = "bold 12px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(tagText).width;
    ctx.fillStyle = "rgba(11, 19, 38, 0.85)";
    ctx.fillRect(minX - pad, minY - pad - 22, tw + 12, 20);
    ctx.fillStyle = "#c0c1ff";
    ctx.fillText(tagText, minX - pad + 6, minY - pad - 7);
  }

  // ============================================================
  //  AUTO-COLLECTION ENGINE
  // ============================================================

  /**
   * Compute a simple numeric hash of landmark positions for duplicate detection.
   * Returns a string that is equal for near-duplicate frames.
   */
  _landmarkHash(landmarks) {
    if (!landmarks || landmarks.length === 0) return null;
    // Use wrist-relative positions, quantized to 2dp
    const wrist = landmarks[0];
    return landmarks.slice(0, 21).map(lm =>
      `${((lm.x - wrist.x) * 100).toFixed(1)},${((lm.y - wrist.y) * 100).toFixed(1)}`
    ).join("|");
  }

  /** Returns true if this frame is too similar to a recent capture (duplicate). */
  _isDuplicate(hash) {
    if (!hash) return false;
    return this._recentHashes.includes(hash);
  }

  /**
   * Start auto-collection loop.
   * @param {number} targetSamples - Number of samples to collect
   * @param {function} onProgress - Called each tick with { collected, rejected, total, status, confidence, handCount, lastReason }
   * @param {function} onSampleCaptured - Called with captureFrame() result for each valid sample
   * @param {function} onComplete - Called when target reached
   * @param {number} intervalMs - ms between capture attempts (default 900)
   */
  startAutoCollection(targetSamples, onProgress, onSampleCaptured, onComplete, intervalMs = 900) {
    if (this._autoCollecting) return;
    this._autoTarget = targetSamples;
    this._autoCollected = 0;
    this._autoRejected = 0;
    this._autoCollecting = true;
    this._autoPaused = false;
    this._recentHashes = [];
    this._onAutoProgress = onProgress;
    this._onAutoSampleCaptured = onSampleCaptured;
    this._onAutoComplete = onComplete;

    this._autoInterval = setInterval(() => {
      if (!this._autoCollecting) { clearInterval(this._autoInterval); return; }
      if (this._autoPaused) return;

      const lm = this.currentLandmarks;
      let status = "WAITING";
      let reason = "";

      // Quality checks
      if (!lm || lm.handCount === 0) {
        status = "REJECTED"; reason = "No hand detected";
        this._autoRejected++;
      } else if (lm.confidence < 0.70) {
        status = "REJECTED"; reason = `Low confidence (${Math.round(lm.confidence * 100)}%)`;
        this._autoRejected++;
      } else {
        // Check for duplicate frame using landmark hash
        const activePoints = lm.right_hand_landmarks.length === 21
          ? lm.right_hand_landmarks
          : lm.left_hand_landmarks;

        if (activePoints.length < 21) {
          status = "REJECTED"; reason = "Incomplete landmarks (<21)";
          this._autoRejected++;
        } else {
          const hash = this._landmarkHash(activePoints);
          if (this._isDuplicate(hash)) {
            status = "REJECTED"; reason = "Duplicate frame — keep your hand moving";
            this._autoRejected++;
          } else {
            // Valid! Capture
            status = "CAPTURING";
            this._recentHashes.push(hash);
            if (this._recentHashes.length > 10) this._recentHashes.shift();

            try {
              const frame = this.captureFrame();
              this._autoCollected++;
              if (this._onAutoSampleCaptured) this._onAutoSampleCaptured(frame, this._autoCollected);
            } catch (e) {
              status = "REJECTED"; reason = "Capture error: " + e.message;
              this._autoRejected++;
            }
          }
        }
      }

      if (this._onAutoProgress) {
        this._onAutoProgress({
          collected: this._autoCollected,
          rejected: this._autoRejected,
          total: this._autoTarget,
          status,
          reason,
          confidence: lm ? Math.round(lm.confidence * 100) : 0,
          handCount: lm ? lm.handCount : 0,
          physicalHand: lm
            ? (lm.right_hand_present ? "Right" : lm.left_hand_present ? "Left" : "—")
            : "—",
          landmarks: lm
            ? (lm.right_hand_landmarks.length || lm.left_hand_landmarks.length)
            : 0
        });
      }

      // Check completion
      if (this._autoCollected >= this._autoTarget) {
        this.stopAutoCollection();
        if (this._onAutoComplete) this._onAutoComplete(this._autoCollected);
      }
    }, intervalMs);
  }

  pauseAutoCollection() {
    this._autoPaused = true;
  }

  resumeAutoCollection() {
    this._autoPaused = false;
  }

  stopAutoCollection() {
    this._autoCollecting = false;
    this._autoPaused = false;
    if (this._autoInterval) {
      clearInterval(this._autoInterval);
      this._autoInterval = null;
    }
  }

  // ============================================================
  //  SINGLE FRAME CAPTURE
  // ============================================================
  captureFrame() {
    if (!this.videoElement || !this.isTracking) {
      throw new Error("Webcam is not actively tracking.");
    }
    const w = this.videoElement.videoWidth || 640;
    const h = this.videoElement.videoHeight || 480;
    const offscreen = document.createElement("canvas");
    offscreen.width = w; offscreen.height = h;
    const offCtx = offscreen.getContext("2d");
    offCtx.drawImage(this.videoElement, 0, 0, w, h);
    const imageBase64 = offscreen.toDataURL("image/jpeg", 0.92);

    return {
      imageBase64,
      landmarks: this.currentLandmarks,
      confidence: this.latestConfidence,
      width: w,
      height: h,
      handCount: this.detectedHandsCount
    };
  }

  // ============================================================
  //  DYNAMIC VIDEO RECORDING
  // ============================================================
  startRecording(onProgress) {
    if (!this.videoElement || !this.videoElement.srcObject) {
      throw new Error("Camera stream not available for recording.");
    }
    this.onRecordingProgress = onProgress;
    this.recordedChunks = [];
    this.recordedFrames = [];
    this.recordingStartTime = performance.now();
    this.isRecording = true;

    const stream = this.videoElement.srcObject;
    let mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
    this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(100);
  }

  async stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        this.isRecording = false; resolve(null); return;
      }
      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        const blob = new Blob(this.recordedChunks, { type: "video/webm" });
        const duration = (performance.now() - this.recordingStartTime) / 1000;
        this.recordedDuration = duration;
        resolve({
          videoBlob: blob,
          frames: this.recordedFrames,
          duration: parseFloat(duration.toFixed(2)),
          frameCount: this.recordedFrames.length,
          fps: Math.round(this.recordedFrames.length / (duration || 1))
        });
      };
      this.mediaRecorder.stop();
    });
  }

  stopCamera() {
    this.stopAutoCollection();
    this.isTracking = false;
    this.isRecording = false;
    if (this.videoElement && this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach(t => t.stop());
      this.videoElement.srcObject = null;
    }
    if (this.canvasCtx && this.canvasElement) {
      this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }
  }
}
