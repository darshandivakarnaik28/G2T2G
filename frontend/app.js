/**
 * ISL Dataset Collector - Main Frontend Application Coordinator
 */

import { api } from "./services/api.js";
import { MediaPipeTracker } from "./components/mediapipe_tracker.js";
import { ThreeHandViewer } from "./components/three_viewer.js?v=20260926_fix11";

class App {
  constructor() {
    this.tracker = new MediaPipeTracker();
    this.activeView = "dashboard";
    this.gestures = [];
    this.samples = [];

    // Viewers (Top Skeleton & Bottom 3D Hand Mesh)
    this.staticSkeletonViewer = null;
    this.static3DViewer = null;
    this.dynamicSkeletonViewer = null;
    this.dynamic3DViewer = null;
    this.details3DViewer = null;
    this.sampleInspectSkeletonViewer = null;
    this.sampleInspect3DViewer = null;
    this.modelsPage3DViewer = null;
    this.avatarMode = "nathan";

    // Collection state
    this.selectedGestureId = "";
    this.selectedSignerId = "S001";
    this.activeSignerId = localStorage.getItem("isl_active_signer") || "S001";
    this.collectionType = "STATIC"; // STATIC or DYNAMIC
    this.staticMethod = "webcam";   // webcam or upload
    this.dynamicMethod = "record";  // record or upload
    this.capturedStaticData = null; // last captured frame data
    this.recordedDynamicData = null;// last recorded dynamic data

    this.init();
  }

  async init() {
    this.bindNavigation();
    this.bindActionButtons();
    this.bindSignerSelection();
    this.setupNetworkListeners();
    await this.populateSignerDropdowns();
    await this.loadDashboard();
    await this.refreshGesturesList();
  }

  // ==========================================
  // NETWORK & OFFLINE RESILIENCE
  // ==========================================
  setupNetworkListeners() {
    const banner = document.getElementById("offline-alert-banner");
    window.addEventListener("online", () => {
      if (banner) banner.classList.add("hidden");
    });
    window.addEventListener("offline", () => {
      if (banner) banner.classList.remove("hidden");
      if (this.tracker._isAutoCollecting && !this.tracker._autoPaused) {
        this.pauseAutoCollection();
      }
    });
  }

  // ==========================================
  // SIGNER ROSTER & SELECTION SYNC
  // ==========================================
  async populateSignerDropdowns() {
    try {
      const signers = await api.getSigners();
      const globalSelect = document.getElementById("global-active-signer-select");
      const assignSignerSelect = document.getElementById("input-assign-signer");

      if (globalSelect) {
        globalSelect.innerHTML = "";
        if (signers.length === 0) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "No signers registered";
          globalSelect.appendChild(opt);
        } else {
          // If activeSignerId is not among existing signers, pick the first one
          const exists = signers.some(s => s.signer_id.toLowerCase() === (this.activeSignerId || "").toLowerCase());
          if (!exists && signers.length > 0) {
            this.activeSignerId = signers[0].signer_id;
            localStorage.setItem("isl_active_signer", this.activeSignerId);
          }

          signers.forEach((s) => {
            const opt = document.createElement("option");
            opt.value = s.signer_id;
            opt.textContent = `${s.signer_id} (${s.display_name})`;
            if (s.signer_id.toLowerCase() === (this.activeSignerId || "").toLowerCase()) opt.selected = true;
            globalSelect.appendChild(opt);
          });
        }
      }

      if (assignSignerSelect) {
        assignSignerSelect.innerHTML = "";
        signers.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.signer_id;
          opt.textContent = `${s.signer_id} (${s.display_name})`;
          assignSignerSelect.appendChild(opt);
        });
      }

      const collectSignerInput = document.getElementById("collect-signer-input");
      if (collectSignerInput) {
        collectSignerInput.value = this.activeSignerId || "";
      }
      const mySignerBadge = document.getElementById("my-collection-signer-badge");
      if (mySignerBadge) {
        mySignerBadge.textContent = this.activeSignerId || "None";
      }
    } catch (err) {
      console.warn("Failed to populate signers dropdown:", err);
    }
  }

  bindSignerSelection() {
    const globalSelect = document.getElementById("global-active-signer-select");
    globalSelect?.addEventListener("change", (e) => {
      this.setActiveSigner(e.target.value);
    });

    const collectSignerInput = document.getElementById("collect-signer-input");
    collectSignerInput?.addEventListener("change", (e) => {
      this.setActiveSigner(e.target.value.trim().toUpperCase());
    });
  }

  setActiveSigner(signerId) {
    if (!signerId) return;
    this.activeSignerId = signerId;
    localStorage.setItem("isl_active_signer", signerId);

    const globalSelect = document.getElementById("global-active-signer-select");
    if (globalSelect && globalSelect.value !== signerId) {
      globalSelect.value = signerId;
    }
    const collectSignerInput = document.getElementById("collect-signer-input");
    if (collectSignerInput && collectSignerInput.value !== signerId) {
      collectSignerInput.value = signerId;
    }
    const mySignerBadge = document.getElementById("my-collection-signer-badge");
    if (mySignerBadge) {
      mySignerBadge.textContent = signerId;
    }
    if (this.activeView === "my-collection") {
      this.loadMyCollectionPage();
    }
  }

  // ==========================================
  // NAVIGATION & VIEW SWITCHING
  // ==========================================
  bindNavigation() {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const targetView = link.getAttribute("data-nav");
        this.navigateTo(targetView);
      });
    });
  }

  navigateTo(viewName) {
    // If leaving collection page, release camera
    if (this.activeView === "collection" && viewName !== "collection") {
      this.tracker.stopCamera();
    }

    this.activeView = viewName;
    const views = [
      "dashboard",
      "gestures",
      "my-collection",
      "team",
      "collection",
      "samples",
      "models",
      "readiness",
      "settings"
    ];
    views.forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        if (v === viewName) {
          el.classList.remove("hidden");
        } else {
          el.classList.add("hidden");
        }
      }
    });

    // Sidebar active styling
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const isTarget = link.getAttribute("data-nav") === viewName;
      if (isTarget) {
        link.classList.add("text-primary", "border-l-4", "border-inverse-primary", "bg-secondary-container/20");
        link.classList.remove("text-on-surface-variant");
      } else {
        link.classList.remove("text-primary", "border-l-4", "border-inverse-primary", "bg-secondary-container/20");
        link.classList.add("text-on-surface-variant");
      }
    });

    // Trigger view-specific data loading
    if (viewName === "dashboard") this.loadDashboard();
    else if (viewName === "gestures") this.loadGesturesPage();
    else if (viewName === "my-collection") this.loadMyCollectionPage();
    else if (viewName === "team") this.loadTeamPage();
    else if (viewName === "collection") this.setupCollectionPage();
    else if (viewName === "samples") this.loadSamplesPage();
    else if (viewName === "models") this.loadModelsPage();
    else if (viewName === "readiness") this.loadReadinessPage();
  }

  // ==========================================
  // 1. DASHBOARD VIEW (Real SQLite Stats)
  // ==========================================
  async loadDashboard() {
    try {
      const stats = await api.getDashboardStats();
      document.getElementById("stat-total-gestures").textContent = stats.total_gestures;
      document.getElementById("stat-verified").textContent = stats.verified_gestures;
      document.getElementById("stat-samples").textContent = stats.total_samples;
      document.getElementById("stat-signers").textContent = stats.total_signers;
      document.getElementById("stat-static").textContent = stats.static_gestures;
      document.getElementById("stat-dynamic").textContent = stats.dynamic_gestures;

      const completedEl = document.getElementById("stat-completed-assignments");
      const pendingEl = document.getElementById("stat-pending-assignments");
      if (completedEl) completedEl.textContent = stats.completed_assignments ?? 0;
      if (pendingEl) pendingEl.textContent = stats.pending_assignments ?? 0;

      // Load recent samples table
      const samples = await api.getSamples();
      const tbody = document.getElementById("recent-samples-tbody");
      tbody.innerHTML = "";

      if (samples.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-outline text-sm">No dataset samples collected yet. Go to 'Collect Dataset' to record your first sample!</td></tr>`;
        return;
      }

      samples.slice(0, 5).forEach((s) => {
        const tr = document.createElement("tr");
        tr.className = "data-table-row hover:bg-surface-variant/30 transition-colors cursor-pointer";
        tr.onclick = () => this.inspectSample(s.sample_id);

        const icon = s.sample_type.includes("VIDEO") ? "videocam" : "photo_camera";
        const typeBadge = s.gesture_type === "STATIC"
          ? `<span class="px-2 py-0.5 text-[11px] rounded font-medium bg-blue-950/60 text-blue-300 border border-blue-800/40">Static</span>`
          : `<span class="px-2 py-0.5 text-[11px] rounded font-medium bg-amber-950/60 text-amber-300 border border-amber-800/40">Dynamic</span>`;

        tr.innerHTML = `
          <td class="py-4 px-6 font-medium text-on-background flex items-center gap-3">
            <div class="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary border border-outline-variant/30">
              <span class="material-symbols-outlined text-[18px]">${icon}</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-semibold">${s.gesture_name || s.gesture_id}</span>
                <span class="text-xs text-primary">${s.gesture_kannada ? `(${s.gesture_kannada})` : ""}</span>
              </div>
              <div class="text-[11px] text-outline mt-0.5">${typeBadge}</div>
            </div>
          </td>
          <td class="py-4 px-6 text-on-surface-variant">${s.sample_type}</td>
          <td class="py-4 px-6 text-on-surface-variant font-medium">${s.signer_id}</td>
          <td class="py-4 px-6 text-outline text-sm">${new Date(s.created_at).toLocaleString()}</td>
          <td class="py-4 px-6 text-right">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full font-label-sm text-label-sm ${
              s.detection_confidence >= 0.7 ? "status-badge-success" : "status-badge-review"
            }">
              ${Math.round(s.detection_confidence * 100)}% Conf
            </span>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error("Failed to load dashboard stats:", err);
    }
  }

  // ==========================================
  // 2. GESTURES CATALOG & DETAILS
  // ==========================================
  async refreshGesturesList() {
    try {
      this.gestures = await api.getGestures();
    } catch (e) {
      console.warn("Could not fetch gestures:", e);
    }
  }

  async loadGesturesPage() {
    await this.refreshGesturesList();
    const container = document.getElementById("gestures-catalog-grid");
    container.innerHTML = "";

    this.gestures.forEach((g) => {
      const card = document.createElement("div");
      card.className = "stat-card flex flex-col justify-between hover:border-primary/60 transition-all cursor-pointer group min-w-0 overflow-hidden";
      card.onclick = () => this.openGestureDetails(g.gesture_id);

      const isStatic = g.gesture_type === "STATIC";
      const typeBadge = isStatic
        ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-900/30 text-blue-300 border border-blue-700/50 flex-shrink-0">
            <span class="material-symbols-outlined text-[14px]">photo_camera</span> Static Pose
           </span>`
        : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-900/30 text-purple-300 border border-purple-700/50 flex-shrink-0">
            <span class="material-symbols-outlined text-[14px]">videocam</span> Dynamic Motion
           </span>`;

      card.innerHTML = `
        <div class="min-w-0">
          <div class="flex justify-between items-start mb-3 gap-2 flex-wrap">
            ${typeBadge}
            <span class="px-2 py-0.5 rounded text-[11px] font-label-sm flex-shrink-0 ${
              g.verification_status === "VERIFIED"
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                : "bg-amber-950 text-amber-400 border border-amber-800/60"
            }">
              ${g.verification_status}
            </span>
          </div>
          <div class="flex items-baseline gap-2 mb-1 flex-wrap min-w-0">
            <h3 class="text-base sm:text-lg font-bold text-on-background group-hover:text-primary transition-colors truncate max-w-full">${g.name}</h3>
            <span class="text-sm text-tertiary font-medium truncate">${g.kannada_meaning || ""}</span>
          </div>
          <p class="text-xs sm:text-sm text-on-surface-variant line-clamp-2 mb-4 break-words">${g.description || "No description provided."}</p>
        </div>

        <div class="pt-3 border-t border-[#334155] mt-2 min-w-0">
          <div class="grid grid-cols-2 gap-2 text-xs text-outline mb-3 min-w-0">
            <div class="truncate">Hands: <span class="text-on-background font-medium">${g.hand_count}</span></div>
            <div class="truncate">Signers: <span class="text-on-background font-medium">${g.signer_count}</span></div>
            <div class="truncate">Samples: <span class="text-on-background font-medium">${g.sample_count}</span></div>
            <div class="truncate">Status: <span class="text-primary font-medium">${g.sample_count > 0 ? "Active" : "Empty"}</span></div>
          </div>
          <button class="w-full py-2 px-3 rounded bg-surface-container-high hover:bg-secondary-container/30 text-primary border border-outline-variant/40 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
            <span class="material-symbols-outlined text-[16px]">visibility</span> View Details & Samples
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  async openGestureDetails(gestureId) {
    try {
      const g = await api.getGesture(gestureId);
      const samples = await api.getSamples({ gesture_id: gestureId });

      document.getElementById("details-name").textContent = g.name;
      document.getElementById("details-kannada").textContent = g.kannada_meaning || "";
      document.getElementById("details-type-badge").textContent = g.gesture_type;
      document.getElementById("details-hands-badge").textContent = g.hand_count;
      document.getElementById("details-verified-badge").textContent = g.verification_status;
      document.getElementById("details-desc").textContent = g.description || "No description provided.";
      document.getElementById("details-stat-samples").textContent = g.sample_count;
      document.getElementById("details-stat-signers").textContent = g.signer_count;
      document.getElementById("details-model-ref").textContent = g.model_filename || "No custom model";
      document.getElementById("details-model-status").textContent = g.has_3d_model ? "Custom Model Loaded" : "Standard 21-Rig Active";

      // Render samples tree grouped by signer
      const signersMap = {};
      samples.forEach((s) => {
        if (!signersMap[s.signer_id]) signersMap[s.signer_id] = [];
        signersMap[s.signer_id].push(s);
      });

      const treeContainer = document.getElementById("details-signers-tree");
      treeContainer.innerHTML = "";

      if (Object.keys(signersMap).length === 0) {
        treeContainer.innerHTML = `<p class="text-outline text-xs p-4">No samples collected for this gesture yet.</p>`;
      } else {
        Object.entries(signersMap).forEach(([signerId, smpList]) => {
          const div = document.createElement("div");
          div.className = "p-4 rounded-lg bg-surface-container border border-outline-variant/30";
          const rows = smpList.map(s => `
            <div class="flex items-center justify-between py-2 border-b border-[#334155]/50 last:border-none text-xs">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-primary text-[16px]">${s.sample_type.includes('VIDEO') ? 'videocam' : 'photo_camera'}</span>
                <span class="font-mono text-on-background">${s.sample_id}</span>
                <span class="text-outline">(${s.sample_type})</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-outline text-[11px]">${new Date(s.created_at).toLocaleDateString()}</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-medium status-badge-success">${Math.round(s.detection_confidence * 100)}% Conf</span>
              </div>
            </div>
          `).join("");

          div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
              <span class="font-semibold text-sm text-on-background">Signer: ${signerId} (${smpList.length} samples)</span>
              <button class="text-xs text-primary hover:underline" onclick="app.quickCollectForSigner('${g.gesture_id}', '${signerId}')">+ Collect Sample</button>
            </div>
            <div class="bg-surface-container-lowest/70 p-2.5 rounded border border-outline-variant/20 space-y-1">
              ${rows}
            </div>
          `;
          treeContainer.appendChild(div);
        });
      }

      // Populate Signer Contribution Breakdown (# Strict 50/signer)
      let breakdown = null;
      try {
        breakdown = await api.getGestureDataset(g.gesture_id);
      } catch (err) {
        console.warn("Could not load gesture dataset breakdown:", err);
      }

      const signersTbody = document.getElementById("details-gesture-signers-tbody");
      if (signersTbody) {
        signersTbody.innerHTML = "";
        if (!breakdown || !breakdown.signers || breakdown.signers.length === 0) {
          signersTbody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-outline">No signer contributions or assignments yet.</td></tr>`;
        } else {
          breakdown.signers.forEach((s) => {
            const sTarget = s.target_samples || 50;
            const sCollected = s.valid_samples !== undefined ? s.valid_samples : (s.collected_samples || 0);
            const sPct = Math.min(100, Math.round((sCollected / (sTarget || 1)) * 100));
            const sDone = sCollected >= sTarget || s.status === "COMPLETED";

            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td class="p-2 font-mono font-bold text-primary">
                ${s.signer_id} <span class="text-xs text-outline">(${s.display_name})</span>
              </td>
              <td class="p-2 font-mono font-semibold">${sCollected}</td>
              <td class="p-2 font-mono text-outline">${sTarget}</td>
              <td class="p-2">
                <div class="flex items-center gap-2">
                  <div class="w-20 h-2 rounded-full bg-surface-container overflow-hidden">
                    <div class="h-full ${sDone ? 'bg-emerald-400' : 'bg-primary'}" style="width: ${sPct}%"></div>
                  </div>
                  <span class="text-[10px] text-outline">${sPct}%</span>
                </div>
              </td>
              <td class="p-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono ${
                  sDone ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : (sCollected > 0 ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-surface-container-high text-outline')
                }">${sDone ? 'COMPLETED' : (sCollected > 0 ? 'IN PROGRESS' : 'NOT STARTED')}</span>
              </td>
            `;
            signersTbody.appendChild(tr);
          });
        }
      }

      // Calculate Dataset Quality Metrics
      this.detailsActiveGestureId = g.gesture_id;
      const targetSamples = (breakdown && breakdown.total_target_samples > 0)
        ? breakdown.total_target_samples
        : 50;
      const validSamples = (breakdown && breakdown.valid_samples !== undefined)
        ? breakdown.valid_samples
        : samples.filter(s => s.detection_confidence >= 0.70).length;
      const lowConfSamples = samples.filter(s => s.detection_confidence < 0.70).length;
      const pct = Math.min(100, Math.round((validSamples / (targetSamples || 1)) * 100));

      const qTarget = document.getElementById("details-quality-target");
      const qValid = document.getElementById("details-quality-valid");
      const qRejected = document.getElementById("details-quality-rejected");
      const qPct = document.getElementById("details-quality-pct");
      const qBar = document.getElementById("details-quality-bar");
      const qBadge = document.getElementById("details-quality-badge");

      if (qTarget) qTarget.textContent = targetSamples;
      if (qValid) qValid.textContent = validSamples;
      if (qRejected) qRejected.textContent = lowConfSamples;
      if (qPct) qPct.textContent = `${pct}%`;
      if (qBar) qBar.style.width = `${pct}%`;
      if (qBadge) {
        if (validSamples >= targetSamples) {
          qBadge.textContent = "READY FOR TRAINING";
          qBadge.className = "px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800";
        } else {
          qBadge.textContent = `INCOMPLETE (${validSamples}/${targetSamples})`;
          qBadge.className = "px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950 text-amber-300 border border-amber-800";
        }
      }

      // Initialize Details 3D Viewer
      this.switchDetailsTab("overview");
      document.getElementById("gesture-details-modal").classList.remove("hidden");
    } catch (e) {
      alert("Error opening gesture: " + e.message);
    }
  }

  closeGestureDetails() {
    if (this.details3DViewer) {
      this.details3DViewer.destroy();
      this.details3DViewer = null;
    }
    document.getElementById("gesture-details-modal").classList.add("hidden");
  }

  switchDetailsTab(tab) {
    const tabs = ["overview", "dataset", "3d", "quality"];
    tabs.forEach((t) => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const content = document.getElementById(`tab-content-${t}`);
      if (btn && content) {
        if (t === tab) {
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

    if (tab === "3d") {
      setTimeout(() => {
        if (this.details3DViewer) this.details3DViewer.destroy();
        this.details3DViewer = new ThreeHandViewer("details-3d-viewport");
      }, 100);
    }
  }

  quickCollectForSigner(gestureId, signerId) {
    this.closeGestureDetails();
    this.navigateTo("collection");
    setTimeout(() => {
      document.getElementById("collect-gesture-select").value = gestureId;
      document.getElementById("collect-signer-input").value = signerId;
      this.handleCollectionGestureChange();
    }, 200);
  }

  // ==========================================
  // 2B. MY COLLECTION ASSIGNMENTS (Strict 50/signer)
  // ==========================================
  async loadMyCollectionPage() {
    try {
      await this.refreshGesturesList();
      const mySignerBadge = document.getElementById("my-collection-signer-badge");
      if (mySignerBadge) mySignerBadge.textContent = this.activeSignerId;

      const [assignments, signerData] = await Promise.all([
        api.getAssignments({ signer_id: this.activeSignerId }).catch(() => []),
        api.getSignerDataset(this.activeSignerId).catch(() => null)
      ]);

      // Update summary metrics
      const totalAssigned = assignments.length;
      const completedAssignments = assignments.filter(a => a.status === "COMPLETED" || a.collected_samples >= a.target_samples).length;
      const totalCollected = assignments.reduce((acc, a) => acc + (a.collected_samples || 0), 0);
      const totalTarget = assignments.reduce((acc, a) => acc + (a.target_samples || 50), 0);

      const statAssigned = document.getElementById("my-stat-assigned");
      const statCompleted = document.getElementById("my-stat-completed");
      const statSamples = document.getElementById("my-stat-samples");

      if (statAssigned) statAssigned.textContent = totalAssigned;
      if (statCompleted) statCompleted.textContent = completedAssignments;
      if (statSamples) statSamples.textContent = `${totalCollected} / ${totalTarget || 50}`;

      const container = document.getElementById("my-assignments-grid");
      if (!container) return;
      container.innerHTML = "";

      if (assignments.length === 0) {
        container.innerHTML = `
          <div class="col-span-full stat-card text-center py-12 space-y-3">
            <span class="material-symbols-outlined text-[48px] text-outline">assignment_late</span>
            <h4 class="text-base font-bold text-on-background">No Collection Tasks Assigned to ${this.activeSignerId}</h4>
            <p class="text-xs text-outline max-w-md mx-auto">
              You currently have no gesture targets assigned. Ask your team lead to assign gestures or create an assignment in Team / Signers.
            </p>
            <button onclick="app.openAssignGestureModal(null, '${this.activeSignerId}')" class="btn-primary px-4 py-2 rounded text-xs font-medium inline-flex items-center gap-1.5 mt-2 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">add</span> Assign Gesture to Myself
            </button>
          </div>
        `;
        return;
      }

      assignments.forEach((assignment) => {
        const g = this.gestures.find(item => item.gesture_id === assignment.gesture_id) || {
          name: assignment.gesture_id,
          kannada_meaning: "",
          gesture_type: "STATIC"
        };

        const target = assignment.target_samples || 50;
        const collected = assignment.collected_samples || 0;
        const remaining = Math.max(0, target - collected);
        const isCompleted = collected >= target || assignment.status === "COMPLETED";
        const pct = Math.min(100, Math.round((collected / (target || 1)) * 100));

        const card = document.createElement("div");
        card.className = `stat-card flex flex-col justify-between border transition-all ${
          isCompleted ? "border-emerald-500/40 bg-emerald-950/10" : "hover:border-primary/60"
        }`;

        const statusBadge = isCompleted
          ? `<span class="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">COMPLETED (${target}/${target})</span>`
          : (collected > 0
            ? `<span class="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950 text-amber-300 border border-amber-800">IN PROGRESS</span>`
            : `<span class="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container-high text-outline">NOT STARTED</span>`);

        const actionBtn = isCompleted
          ? `<div class="flex items-center gap-2">
              <button class="flex-1 py-2 rounded bg-emerald-900/40 text-emerald-300 text-xs font-medium flex items-center justify-center gap-1 cursor-default">
                <span class="material-symbols-outlined text-[16px]">check_circle</span> Goal Reached (50/50)
              </button>
              <button onclick="app.startAssignmentCollection('${assignment.gesture_id}', '${assignment.signer_id}', ${target})" class="px-3 py-2 rounded bg-surface-container-high text-primary hover:bg-surface-variant text-xs font-medium cursor-pointer">
                Collect More
              </button>
            </div>`
          : `<button onclick="app.startAssignmentCollection('${assignment.gesture_id}', '${assignment.signer_id}', ${target})" class="w-full btn-primary py-2.5 rounded font-medium text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">${collected > 0 ? "play_arrow" : "video_call"}</span>
              <span>${collected > 0 ? `Continue Collection (${collected}/${target})` : `Start Collection (${target})`}</span>
            </button>`;

        card.innerHTML = `
          <div>
            <div class="flex justify-between items-start mb-3">
              <span class="text-xs px-2 py-0.5 rounded font-mono ${
                g.gesture_type === 'STATIC' ? 'bg-blue-950 text-blue-300' : 'bg-purple-950 text-purple-300'
              }">${g.gesture_type}</span>
              ${statusBadge}
            </div>

            <div class="mb-4">
              <div class="flex items-baseline gap-2">
                <h3 class="font-bold text-lg text-on-background">${g.name}</h3>
                <span class="text-tertiary font-medium text-sm">${g.kannada_meaning || ""}</span>
              </div>
              <p class="text-xs font-mono text-outline mt-0.5">Key: ${assignment.gesture_id}</p>
            </div>

            <div class="space-y-2 mb-6">
              <div class="flex justify-between text-xs font-mono">
                <span class="text-outline">Progress</span>
                <span class="font-bold ${isCompleted ? 'text-emerald-400' : 'text-primary'}">${collected} / ${target} samples (${pct}%)</span>
              </div>
              <div class="w-full h-2.5 rounded-full bg-surface-container-lowest overflow-hidden border border-outline-variant/30">
                <div class="h-full bg-gradient-to-r ${
                  isCompleted ? 'from-emerald-500 to-emerald-400' : 'from-indigo-500 to-emerald-400'
                }" style="width: ${pct}%"></div>
              </div>
              <div class="flex justify-between text-[11px] font-mono text-outline">
                <span>Remaining: <strong class="${remaining === 0 ? 'text-emerald-400' : 'text-amber-300'}">${remaining}</strong></span>
                <span>Signer: <strong>${assignment.signer_id}</strong></span>
              </div>
            </div>
          </div>

          <div>
            ${actionBtn}
          </div>
        `;

        container.appendChild(card);
      });

    } catch (err) {
      console.error("Failed to load my collection page:", err);
    }
  }

  startAssignmentCollection(gestureId, signerId, targetSamples = 50) {
    this.setActiveSigner(signerId);
    this.navigateTo("collection");
    setTimeout(() => {
      const gestureSelect = document.getElementById("collect-gesture-select");
      const signerInput = document.getElementById("collect-signer-input");
      const targetInput = document.getElementById("collect-target-samples-input");

      if (gestureSelect) {
        gestureSelect.value = gestureId;
        this.handleCollectionGestureChange();
      }
      if (signerInput) signerInput.value = signerId;
      if (targetInput) targetInput.value = targetSamples;
    }, 250);
  }

  // ==========================================
  // 2C. TEAM & SIGNERS ROSTER
  // ==========================================
  async loadTeamPage() {
    try {
      const [signers, assignments] = await Promise.all([
        api.getSigners().catch(() => []),
        api.getAssignments().catch(() => [])
      ]);

      const tbodySigners = document.getElementById("team-signers-tbody");
      if (tbodySigners) {
        tbodySigners.innerHTML = "";
        if (signers.length === 0) {
          tbodySigners.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-outline">No signers registered yet. Click "Add Signer" to add team members.</td></tr>`;
        } else {
          signers.forEach((s) => {
            const signerAssignments = assignments.filter(a => a.signer_id === s.signer_id);
            const assignedCount = signerAssignments.length;
            const completedCount = signerAssignments.filter(a => a.status === "COMPLETED" || a.collected_samples >= a.target_samples).length;
            const isSelected = s.signer_id === this.activeSignerId;
            const isActive = Boolean(s.enabled);
            const isMaster = Boolean(s.is_master);

            const tr = document.createElement("tr");
            tr.className = "hover:bg-surface-container-high/40 transition-colors";
            tr.innerHTML = `
              <td class="p-3 font-bold text-primary flex items-center gap-1.5">
                ${isSelected ? '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Currently selected signer in this browser"></span>' : ''}
                <span class="font-mono">${s.signer_id}</span>
              </td>
              <td class="p-3 font-medium text-on-background">${s.display_name}</td>
              <td class="p-3">
                ${isMaster 
                  ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-950/90 text-amber-300 border border-amber-600 font-bold flex items-center gap-1 w-fit"><span class="text-amber-400">★</span> MASTER SIGNER</span>' 
                  : '<span class="text-[11px] text-outline font-mono">Contributor</span>'}
              </td>
              <td class="p-3">
                <span class="text-emerald-400 font-bold">${s.valid_samples ?? s.sample_count ?? 0}</span>
                <span class="text-outline">/ ${s.total_samples ?? s.sample_count ?? 0}</span>
              </td>
              <td class="p-3">${assignedCount}</td>
              <td class="p-3 text-emerald-400 font-semibold">${completedCount}</td>
              <td class="p-3">
                <button onclick="app.toggleSignerStatus('${s.signer_id}')" class="px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                  isActive ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/60' : 'bg-surface-container-high text-outline hover:text-on-background'
                }" title="Click to toggle Active / Inactive status">
                  ${isActive ? '● ACTIVE' : '○ INACTIVE'}
                </button>
              </td>
              <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  ${!isMaster ? `<button onclick="app.setMasterSigner('${s.signer_id}')" class="px-2 py-1 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60 text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-colors" title="Set as Master Signer for Text-to-Gesture dictionary">★ Set Master</button>` : '<span class="text-[11px] font-mono text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-700/50">★ Primary</span>'}
                  ${!isSelected ? `<button onclick="app.setActiveSigner('${s.signer_id}')" class="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-variant text-[11px] text-primary cursor-pointer">Select</button>` : '<span class="text-[11px] text-emerald-400 font-medium">Selected</span>'}
                  <button onclick="app.toggleSignerStatus('${s.signer_id}')" class="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-variant text-[11px] text-outline hover:text-on-background cursor-pointer">
                    ${isActive ? 'Set Inactive' : 'Set Active'}
                  </button>
                  <button onclick="app.deleteSigner('${s.signer_id}')" class="text-outline hover:text-rose-400 p-1 transition-colors cursor-pointer" title="Delete signer ${s.signer_id}">
                    <span class="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </td>
            `;
            tbodySigners.appendChild(tr);
          });
        }
      }

      // Populate Grouped Gesture Assignment Status Display
      const gestureContainer = document.getElementById("team-gesture-assignments-container");
      if (gestureContainer) {
        gestureContainer.innerHTML = "";
        
        // Group assignments by gesture_id
        const gestureGroups = {};
        assignments.forEach((a) => {
          if (!gestureGroups[a.gesture_id]) {
            gestureGroups[a.gesture_id] = [];
          }
          gestureGroups[a.gesture_id].push(a);
        });

        const gestureKeys = Object.keys(gestureGroups);
        if (gestureKeys.length === 0) {
          gestureContainer.innerHTML = `
            <div class="text-center py-8 text-outline text-xs space-y-2">
              <span class="material-symbols-outlined text-[36px]">assignment</span>
              <p>No gestures currently assigned to teammates. Click "Assign Gesture" above to assign an existing gesture.</p>
            </div>
          `;
        } else {
          gestureKeys.forEach((gid) => {
            const memberAssignments = gestureGroups[gid];
            const firstA = memberAssignments[0];
            const gestureObj = this.gestures.find(g => g.gesture_id === gid) || {
              name: firstA.gesture_name || gid,
              kannada_meaning: firstA.gesture_kannada || "",
              gesture_type: firstA.gesture_type || "STATIC"
            };

            const card = document.createElement("div");
            card.className = "p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/30 space-y-3 min-w-0 max-w-full overflow-hidden";

            // Status badge helper
            const getStatusBadge = (statusStr, collected, target) => {
              const upper = (statusStr || "").toUpperCase();
              if (upper === "COMPLETED" || collected >= target) {
                return `<span class="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold shrink-0">Completed</span>`;
              }
              if (upper === "IN_PROGRESS" || upper === "STARTED" || collected > 0) {
                return `<span class="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950 text-amber-300 border border-amber-800 font-bold shrink-0">In Progress</span>`;
              }
              return `<span class="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container-high text-outline shrink-0">Not Started</span>`;
            };

            let membersHtml = memberAssignments.map((a) => {
              const signerObj = signers.find(s => s.signer_id === a.signer_id);
              const signerName = signerObj ? signerObj.display_name : (a.signer_name || a.signer_id);
              const isActive = signerObj ? Boolean(signerObj.enabled) : Boolean(a.signer_enabled ?? true);
              const target = a.target_samples || 50;
              const collected = a.collected_samples || 0;
              const statusBadge = getStatusBadge(a.status, collected, target);

              return `
                <li class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded bg-surface-container/60 border border-outline-variant/20 hover:border-outline-variant/50 transition-colors min-w-0">
                  <div class="flex flex-wrap items-center gap-2 min-w-0">
                    <span class="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20 shrink-0">${a.signer_id}</span>
                    <span class="text-sm font-semibold text-on-background truncate">${signerName}</span>
                    <span class="text-xs text-outline font-mono shrink-0">(${collected}/${target} samples)</span>
                  </div>
                  <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                    ${statusBadge}
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                      isActive ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80' : 'bg-surface-container-high text-outline'
                    }">
                      ${isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button onclick="app.startAssignmentCollection('${a.gesture_id}', '${a.signer_id}', ${target})" class="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 text-xs font-medium text-primary cursor-pointer transition-colors shrink-0" title="Collect for this assignment">
                      Collect
                    </button>
                    <button onclick="app.deleteAssignment(${a.id})" class="text-outline hover:text-rose-400 p-1 transition-colors cursor-pointer shrink-0" title="Delete assignment">
                      <span class="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </li>
              `;
            }).join("");

            card.innerHTML = `
              <div class="flex flex-wrap items-start justify-between gap-2 min-w-0">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2 min-w-0">
                    <h4 class="text-base font-bold text-on-background truncate">${gestureObj.name}</h4>
                    <span class="text-tertiary text-xs font-medium truncate">${gestureObj.kannada_meaning || ""}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded font-mono shrink-0 ${
                      gestureObj.gesture_type === 'STATIC' ? 'bg-blue-950 text-blue-300' : 'bg-purple-950 text-purple-300'
                    }">${gestureObj.gesture_type}</span>
                  </div>
                  <p class="text-xs font-mono text-outline mt-0.5 truncate">Gesture ID: <span class="text-on-surface-variant font-bold">${gid}</span></p>
                </div>
                <span class="text-xs font-mono text-outline bg-surface-container px-2 py-1 rounded border border-outline-variant/30 shrink-0">
                  ${memberAssignments.length} Assigned Member${memberAssignments.length === 1 ? '' : 's'}
                </span>
              </div>
              <div class="min-w-0">
                <p class="text-[11px] font-mono uppercase text-outline mb-2">Assigned Members:</p>
                <ul class="space-y-2 min-w-0">
                  ${membersHtml}
                </ul>
              </div>
            `;
            gestureContainer.appendChild(card);
          });
        }
      }

      // Detailed assignments table
      const tbodyAssignments = document.getElementById("team-assignments-tbody");
      if (tbodyAssignments) {
        tbodyAssignments.innerHTML = "";
        if (assignments.length === 0) {
          tbodyAssignments.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-outline">No assignments created yet.</td></tr>`;
        } else {
          assignments.forEach((a) => {
            const target = a.target_samples || 50;
            const collected = a.collected_samples || 0;
            const isDone = collected >= target || a.status === "COMPLETED";
            const pct = Math.min(100, Math.round((collected / (target || 1)) * 100));
            const signerObj = signers.find(s => s.signer_id === a.signer_id);
            const signerName = signerObj ? signerObj.display_name : (a.signer_name || a.signer_id);

            const tr = document.createElement("tr");
            tr.className = "hover:bg-surface-container-high/40 transition-colors";
            tr.innerHTML = `
              <td class="p-3 font-bold text-primary font-mono">${a.signer_id} <span class="text-outline font-normal">(${signerName})</span></td>
              <td class="p-3 font-medium text-on-background">${a.gesture_name || a.gesture_id}</td>
              <td class="p-3 font-mono">${target}</td>
              <td class="p-3 font-mono font-bold ${isDone ? 'text-emerald-400' : 'text-on-background'}">${collected}</td>
              <td class="p-3">
                <div class="flex items-center gap-2">
                  <div class="w-24 h-2 rounded-full bg-surface-container overflow-hidden">
                    <div class="h-full bg-gradient-to-r ${isDone ? 'from-emerald-500 to-emerald-400' : 'from-indigo-500 to-emerald-400'}" style="width: ${pct}%"></div>
                  </div>
                  <span class="text-[10px] font-mono text-outline">${pct}%</span>
                </div>
              </td>
              <td class="p-3">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono ${
                  isDone ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : (collected > 0 ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-surface-container-high text-outline')
                }">${isDone ? 'COMPLETED' : (collected > 0 ? 'IN PROGRESS' : 'NOT STARTED')}</span>
              </td>
              <td class="p-3 text-right">
                <button onclick="app.deleteAssignment(${a.id})" class="text-outline hover:text-rose-400 p-1 transition-colors cursor-pointer" title="Delete Assignment">
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </td>
            `;
            tbodyAssignments.appendChild(tr);
          });
        }
      }

    } catch (err) {
      console.error("Failed to load team page:", err);
    }
  }

  async deleteAssignment(assignmentId) {
    if (!confirm("Are you sure you want to delete this collection assignment?")) return;
    try {
      await api.deleteAssignment(assignmentId);
      await this.loadTeamPage();
    } catch (err) {
      alert("Failed to delete assignment: " + err.message);
    }
  }

  async toggleSignerStatus(signerId) {
    try {
      await api.toggleSignerStatus(signerId);
      if (this.activeView === "team") await this.loadTeamPage();
      await this.populateSignerDropdowns();
    } catch (err) {
      alert("Failed to toggle signer status: " + err.message);
    }
  }

  async setMasterSigner(signerId) {
    try {
      await api.setMasterSigner(signerId);
      if (this.activeView === "team") await this.loadTeamPage();
      await this.populateSignerDropdowns();
      alert(`Signer "${signerId}" is now designated as the Master Signer for Text-to-Gesture dictionary playback.`);
    } catch (err) {
      alert("Failed to set master signer: " + err.message);
    }
  }

  async deleteSigner(signerId) {
    if (!confirm(`Are you sure you want to delete signer "${signerId}" and their assignments?`)) return;
    try {
      await api.deleteSigner(signerId);
      if (this.activeSignerId === signerId) {
        this.activeSignerId = "signer_001";
        localStorage.removeItem("isl_active_signer");
      }
      await this.populateSignerDropdowns();
      if (this.activeView === "team") await this.loadTeamPage();
      if (this.activeView === "my-collection") await this.loadMyCollectionPage();
      alert(`Signer "${signerId}" removed successfully.`);
    } catch (err) {
      alert("Failed to delete signer: " + err.message);
    }
  }

  async removeAllSigners() {
    if (!confirm("Are you sure you want to remove ALL registered signers and their assignments?")) return;
    try {
      await api.removeAllSigners();
      this.activeSignerId = "signer_001";
      localStorage.removeItem("isl_active_signer");
      await this.populateSignerDropdowns();
      if (this.activeView === "team") await this.loadTeamPage();
      if (this.activeView === "my-collection") await this.loadMyCollectionPage();
      alert("All signers and assignments have been removed. You can now add fresh signers.");
    } catch (err) {
      alert("Failed to remove all signers: " + err.message);
    }
  }

  // ==========================================
  // SIGNER & ASSIGNMENT MODALS
  // ==========================================
  openAddSignerModal() {
    const modal = document.getElementById("add-signer-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.style.display = "flex";
    }
    const idInput = document.getElementById("input-signer-id");
    const nameInput = document.getElementById("input-signer-name");
    if (idInput) {
      idInput.value = "";
      setTimeout(() => idInput.focus(), 50);
    }
    if (nameInput) nameInput.value = "";
  }

  closeAddSignerModal() {
    const modal = document.getElementById("add-signer-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.style.display = "none";
    }
  }

  async submitAddSignerForm(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (this._isSubmittingSigner) return;

    const signerId = document.getElementById("input-signer-id")?.value.trim();
    const displayName = document.getElementById("input-signer-name")?.value.trim();

    if (!signerId || !displayName) {
      alert("Please enter both Signer ID and Signer Name.");
      return;
    }

    this._isSubmittingSigner = true;
    try {
      await api.createSigner({ signer_id: signerId, display_name: displayName, enabled: true });
      this.closeAddSignerModal();
      await this.populateSignerDropdowns();
      if (this.activeView === "team") await this.loadTeamPage();
      await this.loadDashboard();
      alert(`Signer "${signerId}" (${displayName}) registered successfully!`);
    } catch (err) {
      alert("Failed to create signer: " + err.message);
    } finally {
      this._isSubmittingSigner = false;
    }
  }

  async openAssignGestureModal(prefillGestureId = null) {
    // 1. Immediately show modal so the user gets instant visual response
    const modal = document.getElementById("assign-gesture-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.style.display = "flex";
    }

    const gestureSelect = document.getElementById("input-assign-gesture");
    const targetInput = document.getElementById("input-assign-target");
    const infoContainer = document.getElementById("assign-signers-info");
    const submitBtn = document.getElementById("btn-submit-assign-gesture");

    if (targetInput) targetInput.value = "50";

    const populateGesturesDropdown = (list) => {
      if (!gestureSelect) return;
      gestureSelect.innerHTML = "";
      if (!list || list.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No gestures found";
        gestureSelect.appendChild(opt);
        return;
      }
      list.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.gesture_id;
        opt.textContent = `${g.name} (${g.kannada_meaning || ""}) [${g.gesture_type}]`;
        if (prefillGestureId && g.gesture_id.toLowerCase() === prefillGestureId.toLowerCase()) {
          opt.selected = true;
        }
        gestureSelect.appendChild(opt);
      });
    };

    // Pre-populate immediately with existing cached gestures
    if (this.gestures && this.gestures.length > 0) {
      populateGesturesDropdown(this.gestures);
    } else {
      populateGesturesDropdown([]);
    }

    // Check active signers to inform the admin
    if (infoContainer) {
      infoContainer.className = "p-2.5 rounded bg-surface-container-lowest border border-outline-variant/30 text-xs font-mono text-outline";
      infoContainer.innerHTML = `Checking registered signers...`;
    }

    try {
      const [freshGestures, signers] = await Promise.all([
        api.getGestures().catch(() => this.gestures || []),
        api.getSigners().catch(() => [])
      ]);

      if (freshGestures && freshGestures.length > 0) {
        this.gestures = freshGestures;
        populateGesturesDropdown(freshGestures);
      }

      if (infoContainer) {
        if (!signers || signers.length === 0) {
          infoContainer.className = "p-2.5 rounded bg-amber-950/40 border border-amber-800 text-amber-300 text-xs font-mono flex items-center justify-between";
          infoContainer.innerHTML = `
            <span>⚠️ No team signers registered yet.</span>
            <button type="button" onclick="closeAssignGestureModal(); openAddSignerModal();" class="text-primary hover:underline font-bold ml-2">Add Signer First</button>
          `;
          if (submitBtn) submitBtn.disabled = true;
        } else {
          const activeSigners = signers.filter(s => s.enabled);
          const count = activeSigners.length || signers.length;
          const names = (activeSigners.length ? activeSigners : signers).map(s => `${s.signer_id} (${s.display_name})`).join(", ");
          infoContainer.className = "p-2.5 rounded bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 text-xs font-mono";
          infoContainer.innerHTML = `Will assign to <strong>${count} signer${count === 1 ? '' : 's'}</strong>: ${names}`;
          if (submitBtn) submitBtn.disabled = false;
        }
      }
    } catch (err) {
      console.warn("Error refreshing assign modal data:", err);
    }
  }

  closeAssignGestureModal() {
    const modal = document.getElementById("assign-gesture-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.style.display = "none";
    }
  }

  async submitAssignGestureForm(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (this._isSubmittingAssignment) return;

    const gestureId = document.getElementById("input-assign-gesture")?.value;
    const targetSamples = parseInt(document.getElementById("input-assign-target")?.value, 10) || 50;
    const submitBtn = document.getElementById("btn-submit-assign-gesture");

    if (!gestureId) {
      alert("Please select an existing gesture to assign.");
      return;
    }

    this._isSubmittingAssignment = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Assigning...";
    }

    try {
      const res = await api.assignGesture({
        gesture_id: gestureId,
        target_samples: targetSamples
      });
      this.closeAssignGestureModal();
      if (this.activeView === "team") await this.loadTeamPage();
      if (this.activeView === "my-collection") await this.loadMyCollectionPage();
      await this.loadDashboard();
      const count = Array.isArray(res) ? res.length : 1;
      alert(`Gesture '${gestureId}' successfully assigned to ${count} team signer(s) (Target: ${targetSamples} samples each)!`);
    } catch (err) {
      alert("Failed to assign gesture: " + err.message);
    } finally {
      this._isSubmittingAssignment = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Assign Gesture";
      }
    }
  }

  // ==========================================
  // 3. REAL DATASET COLLECTION (STATIC & DYNAMIC)
  // ==========================================
  async setupCollectionPage() {
    await this.refreshGesturesList();
    const select = document.getElementById("collect-gesture-select");
    select.innerHTML = "";

    this.gestures.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.gesture_id;
      opt.textContent = `${g.name} (${g.kannada_meaning || ""}) — [${g.gesture_type}]`;
      select.appendChild(opt);
    });

    if (this.gestures.length > 0) {
      select.value = this.gestures[0].gesture_id;
      this.handleCollectionGestureChange();
    }
  }

  handleCollectionGestureChange() {
    const select = document.getElementById("collect-gesture-select");
    this.selectedGestureId = select.value;
    const g = this.gestures.find(item => item.gesture_id === this.selectedGestureId);
    if (!g) return;

    this.collectionType = g.gesture_type; // STATIC or DYNAMIC
    document.getElementById("collect-selected-name").textContent = g.name;
    document.getElementById("collect-selected-kannada").textContent = g.kannada_meaning || "";
    document.getElementById("collect-selected-type-badge").textContent = `${g.gesture_type} • ${g.hand_count}`;

    // Diverge UI based on Static vs Dynamic
    const staticUI = document.getElementById("collect-static-section");
    const dynamicUI = document.getElementById("collect-dynamic-section");

    if (g.gesture_type === "STATIC") {
      staticUI.classList.remove("hidden");
      dynamicUI.classList.add("hidden");
      this.switchStaticCollectionTab("webcam");
    } else {
      dynamicUI.classList.remove("hidden");
      staticUI.classList.add("hidden");
      this.switchDynamicCollectionTab("record");
    }
  }

  // Static Collection Tabs
  switchStaticCollectionTab(method) {
    this.staticMethod = method;
    const btnWebcam = document.getElementById("static-tab-webcam");
    const btnUpload = document.getElementById("static-tab-upload");
    const areaWebcam = document.getElementById("static-camera-area");
    const areaUpload = document.getElementById("static-upload-area");

    if (method === "webcam") {
      btnWebcam.classList.add("border-b-2", "border-primary", "text-primary");
      btnWebcam.classList.remove("text-on-surface-variant");
      btnUpload.classList.remove("border-b-2", "border-primary", "text-primary");
      btnUpload.classList.add("text-on-surface-variant");

      areaWebcam.classList.remove("hidden");
      areaUpload.classList.add("hidden");

      this.startStaticCamera();
    } else {
      btnUpload.classList.add("border-b-2", "border-primary", "text-primary");
      btnUpload.classList.remove("text-on-surface-variant");
      btnWebcam.classList.remove("border-b-2", "border-primary", "text-primary");
      btnWebcam.classList.add("text-on-surface-variant");

      areaUpload.classList.remove("hidden");
      areaWebcam.classList.add("hidden");
      this.tracker.stopCamera();
    }
  }

  async startStaticCamera() {
    const video = document.getElementById("static-live-video");
    const canvas = document.getElementById("static-landmark-canvas");

    try {
      await this.tracker.startCamera(video, canvas, {
        onResults: (landmarksData) => {
          const fpsEl = document.getElementById("static-hud-fps");
          const handsEl = document.getElementById("static-hud-hands");
          const confHudEl = document.getElementById("static-hud-conf");
          const handEl = document.getElementById("static-hud-physical-hand");

          if (fpsEl) fpsEl.textContent = landmarksData.fps;
          if (handsEl) handsEl.textContent = landmarksData.handCount;
          if (confHudEl) confHudEl.textContent = `${Math.round(landmarksData.confidence * 100)}%`;

          const physicalHand = landmarksData.right_hand_present && landmarksData.left_hand_present
            ? "Both Hands"
            : (landmarksData.right_hand_present ? "Right Hand" : (landmarksData.left_hand_present ? "Left Hand" : "—"));
          if (handEl) handEl.textContent = physicalHand;

          // Live quality checklist update
          const hasHand = landmarksData.handCount > 0;
          const confValid = landmarksData.confidence >= 0.70;

          const checkHand = document.getElementById("check-hand-detected");
          const checkLm = document.getElementById("check-landmarks");
          const checkConf = document.getElementById("check-confidence");

          if (checkHand) {
            checkHand.innerHTML = hasHand
              ? `<span class="text-emerald-400 font-semibold">✓ Hand detected (${landmarksData.handCount})</span>`
              : `<span class="text-amber-400">○ Hand detection waiting...</span>`;
          }
          if (checkLm) {
            checkLm.innerHTML = hasHand
              ? `<span class="text-emerald-400 font-semibold">✓ 21/21 landmarks tracked</span>`
              : `<span class="text-outline">○ 21 landmarks waiting</span>`;
          }
          if (checkConf) {
            checkConf.innerHTML = hasHand
              ? (confValid
                  ? `<span class="text-emerald-400 font-semibold">✓ Confidence: ${Math.round(landmarksData.confidence * 100)}%</span>`
                  : `<span class="text-amber-400">⚠ Confidence: ${Math.round(landmarksData.confidence * 100)}% (min 70%)</span>`)
              : `<span class="text-outline">○ Confidence threshold (≥70%)</span>`;
          }
        },
        onError: (errMsg) => {
          console.error("[Camera] Error:", errMsg);
          const checkHand = document.getElementById("check-hand-detected");
          if (checkHand) {
            checkHand.innerHTML = `<span class="text-rose-400 font-medium">✗ ${errMsg}</span>`;
          }
          alert(errMsg);
        }
      });
    } catch (e) {
      console.error("[Camera] startStaticCamera exception:", e);
    }
  }

  // Capture static sample from live camera
  async captureStaticWebcamSample() {
    try {
      if (this.tracker.detectedHandsCount === 0) {
        alert("No hand detected! Please position your hand inside the camera frame.");
        return;
      }

      this.capturedStaticData = this.tracker.captureFrame();
      const signerId = document.getElementById("collect-signer-input").value.trim() || "S001";

      // Show captured snapshot preview & 21-landmark skeleton pose
      document.getElementById("static-preview-snapshot").src = this.capturedStaticData.imageBase64;
      document.getElementById("static-captured-panel").classList.remove("hidden");

      // Initialize 21-landmark skeleton viewer
      if (!this.staticSkeletonViewer) {
        this.staticSkeletonViewer = new ThreeHandViewer("static-skeleton-viewport", { mode: "skeleton" });
      }
      if (this.static3DViewer) {
        this.static3DViewer.destroy();
        this.static3DViewer = null;
      }
      const staticLm = {
        right_hand_landmarks: this.capturedStaticData.landmarks.right_hand_landmarks,
        left_hand_landmarks: this.capturedStaticData.landmarks.left_hand_landmarks
      };
      if (this.staticSkeletonViewer) this.staticSkeletonViewer.applyLandmarks(staticLm);

    } catch (e) {
      alert("Capture error: " + e.message);
    }
  }

  // Save captured static sample to SQLite & backend filesystem
  async saveStaticSampleToBackend() {
    if (!this.capturedStaticData) return;

    const signerId = document.getElementById("collect-signer-input").value.trim() || "S001";
    const saveBtn = document.getElementById("btn-save-static-sample");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving to SQLite...";

    try {
      const formData = new FormData();
      formData.append("gesture_id", this.selectedGestureId);
      formData.append("signer_id", signerId);
      formData.append("handedness", this.capturedStaticData.handedness || "RIGHT");
      formData.append("landmarks_json", JSON.stringify(this.capturedStaticData.landmarks));
      formData.append("image_base64", this.capturedStaticData.imageBase64);
      formData.append("confidence", this.capturedStaticData.confidence);
      formData.append("width", this.capturedStaticData.width);
      formData.append("height", this.capturedStaticData.height);

      const saved = await api.uploadWebcamImageSample(formData);

      // Show success notification
      const statusEl = document.getElementById("static-save-status");
      statusEl.innerHTML = `
        <div class="p-3 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px]">check_circle</span>
          <span>Sample <strong>${saved.sample_id}</strong> saved to database! Stored at: <code>${saved.stored_file_path}</code></span>
        </div>
      `;

      saveBtn.textContent = "✓ Saved";
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Sample to Dataset";
        document.getElementById("static-captured-panel").classList.add("hidden");
      }, 2000);

    } catch (e) {
      alert("Failed to save sample: " + e.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Sample to Dataset";
    }
  }

  // ==========================================
  // AUTO 100-SAMPLE COLLECTION ENGINE
  // ==========================================
  async startAutoCollection() {
    const targetInput = document.getElementById("collect-target-samples-input");
    const target = parseInt(targetInput?.value, 10) || 50;
    const signerId = document.getElementById("collect-signer-input").value.trim() || "S001";
    const gestureId = this.selectedGestureId;

    if (!gestureId) {
      alert("Please select a gesture from the dropdown first.");
      return;
    }

    if (!this.tracker.isTracking) {
      alert("Webcam is not active. Please ensure camera is connected and allowed.");
      return;
    }

    const banner = document.getElementById("auto-collection-banner");
    const progCount = document.getElementById("auto-prog-count");
    const progPct = document.getElementById("auto-prog-pct");
    const progFill = document.getElementById("auto-progress-fill");
    const validEl = document.getElementById("auto-valid-count");
    const rejectedEl = document.getElementById("auto-rejected-count");
    const handEl = document.getElementById("auto-hand-type");
    const confEl = document.getElementById("auto-confidence");
    const reasonEl = document.getElementById("auto-last-reason");
    const statusBadge = document.getElementById("auto-status-badge");
    const pauseBtnText = document.getElementById("btn-auto-pause-text");

    if (banner) banner.classList.remove("hidden");
    if (pauseBtnText) pauseBtnText.textContent = "Pause";
    if (statusBadge) {
      statusBadge.textContent = "COLLECTING";
      statusBadge.className = "px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 animate-pulse";
    }

    this.tracker.startAutoCollection(
      target,
      // onProgress callback
      (stats) => {
        if (progCount) progCount.textContent = `${stats.collected} / ${stats.total}`;
        const pct = Math.min(100, Math.round((stats.collected / (stats.total || 1)) * 100));
        if (progPct) progPct.textContent = `${pct}%`;
        if (progFill) progFill.style.width = `${pct}%`;
        if (validEl) validEl.textContent = stats.collected;
        if (rejectedEl) rejectedEl.textContent = stats.rejected;
        if (handEl) handEl.textContent = stats.physicalHand;
        if (confEl) confEl.textContent = `${stats.confidence}%`;
        if (reasonEl) reasonEl.textContent = stats.reason || (stats.status === "CAPTURING" ? "✓ Valid pose captured" : "Positioning...");

        if (statusBadge && stats.status !== "COLLECTING") {
          statusBadge.textContent = stats.status;
          statusBadge.className = stats.status === "CAPTURING"
            ? "px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800"
            : (stats.status === "REJECTED"
              ? "px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950 text-amber-300 border border-amber-800"
              : "px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container-high text-outline");
        }
      },
      // onSampleCaptured callback: persistent SQLite upload directly per valid frame
      async (frame, collectedIndex) => {
        try {
          const formData = new FormData();
          formData.append("gesture_id", gestureId);
          formData.append("signer_id", signerId);
          formData.append("handedness", frame.handedness || "RIGHT");
          formData.append("landmarks_json", JSON.stringify(frame.landmarks));
          formData.append("image_base64", frame.imageBase64);
          formData.append("confidence", frame.confidence);
          formData.append("width", frame.width);
          formData.append("height", frame.height);

          await api.uploadWebcamImageSample(formData);
        } catch (err) {
          console.warn(`Error auto-saving frame #${collectedIndex}:`, err);
        }
      },
      // onComplete callback
      async (totalCollected) => {
        if (statusBadge) {
          statusBadge.textContent = "COMPLETED";
          statusBadge.className = "px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800";
        }
        if (reasonEl) reasonEl.textContent = `All ${totalCollected} samples successfully collected and stored in database!`;
        await this.loadDashboard();
        await this.refreshGesturesList();
      },
      800 // 800ms debounce for natural pose variation
    );
  }

  pauseAutoCollection() {
    const pauseBtnText = document.getElementById("btn-auto-pause-text");
    const statusBadge = document.getElementById("auto-status-badge");
    if (this.tracker._autoPaused) {
      this.tracker.resumeAutoCollection();
      if (pauseBtnText) pauseBtnText.textContent = "Pause";
      if (statusBadge) {
        statusBadge.textContent = "COLLECTING";
        statusBadge.className = "px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 animate-pulse";
      }
    } else {
      this.tracker.pauseAutoCollection();
      if (pauseBtnText) pauseBtnText.textContent = "Resume";
      if (statusBadge) {
        statusBadge.textContent = "PAUSED";
        statusBadge.className = "px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950 text-amber-300 border border-amber-800";
      }
    }
  }

  stopAutoCollection() {
    this.tracker.stopAutoCollection();
    const statusBadge = document.getElementById("auto-status-badge");
    const reasonEl = document.getElementById("auto-last-reason");
    if (statusBadge) {
      statusBadge.textContent = "STOPPED";
      statusBadge.className = "px-2 py-0.5 rounded text-[11px] font-mono bg-surface-container-high text-outline";
    }
    if (reasonEl) reasonEl.textContent = "Auto-collection stopped by user.";
    this.loadDashboard();
  }

  retakeStaticSample() {
    this.capturedStaticData = null;
    const panel = document.getElementById("static-captured-panel");
    if (panel) panel.classList.add("hidden");
    const statusEl = document.getElementById("static-save-status");
    if (statusEl) statusEl.innerHTML = "";
  }

  retakeDynamicSample() {
    this.recordedDynamicData = null;
    const panel = document.getElementById("dynamic-recorded-panel");
    if (panel) panel.classList.add("hidden");
    const timerDisplay = document.getElementById("dyn-recording-timer");
    const framesDisplay = document.getElementById("dyn-frames-count");
    if (timerDisplay) timerDisplay.textContent = "0.0s";
    if (framesDisplay) framesDisplay.textContent = "0 frames";
  }

  // Dynamic Collection Tabs
  switchDynamicCollectionTab(method) {
    this.dynamicMethod = method;
    const btnRecord = document.getElementById("dynamic-tab-record");
    const btnUpload = document.getElementById("dynamic-tab-upload");
    const areaRecord = document.getElementById("dynamic-record-area");
    const areaUpload = document.getElementById("dynamic-upload-area");

    if (method === "record") {
      btnRecord.classList.add("border-b-2", "border-primary", "text-primary");
      btnRecord.classList.remove("text-on-surface-variant");
      btnUpload.classList.remove("border-b-2", "border-primary", "text-primary");
      btnUpload.classList.add("text-on-surface-variant");

      areaRecord.classList.remove("hidden");
      areaUpload.classList.add("hidden");
      this.startDynamicCamera();
    } else {
      btnUpload.classList.add("border-b-2", "border-primary", "text-primary");
      btnUpload.classList.remove("text-on-surface-variant");
      btnRecord.classList.remove("border-b-2", "border-primary", "text-primary");
      btnRecord.classList.add("text-on-surface-variant");

      areaUpload.classList.remove("hidden");
      areaRecord.classList.add("hidden");
      this.tracker.stopCamera();
    }
  }

  async startDynamicCamera() {
    const video = document.getElementById("dynamic-live-video");
    const canvas = document.getElementById("dynamic-landmark-canvas");

    try {
      await this.tracker.startCamera(video, canvas, {
        onResults: (landmarksData) => {
          document.getElementById("dyn-hud-fps").textContent = landmarksData.fps;
          document.getElementById("dyn-hud-conf").textContent = `${Math.round(landmarksData.confidence * 100)}%`;
        },
        onError: (errMsg) => alert(errMsg)
      });
    } catch (e) {
      console.error(e);
    }
  }

  toggleDynamicRecording() {
    const btn = document.getElementById("btn-toggle-recording");
    const timerDisplay = document.getElementById("dyn-recording-timer");
    const framesDisplay = document.getElementById("dyn-frames-count");

    if (!this.tracker.isRecording) {
      // Start recording
      this.tracker.startRecording((progress) => {
        timerDisplay.textContent = `${progress.elapsed}s`;
        framesDisplay.textContent = `${progress.framesCount} frames`;
      });
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">stop</span> Stop Recording`;
      btn.className = "px-6 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm flex items-center gap-2 shadow-lg";
    } else {
      // Stop recording
      btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">videocam</span> Processing...`;
      btn.disabled = true;

      this.tracker.stopRecording().then((result) => {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">fiber_manual_record</span> Start Recording`;
        btn.className = "px-6 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm flex items-center gap-2 shadow-lg";

        if (result) {
          this.recordedDynamicData = result;
          this.showDynamicRecordedPreview(result);
        }
      });
    }
  }

  showDynamicRecordedPreview(result) {
    document.getElementById("dynamic-recorded-panel").classList.remove("hidden");
    document.getElementById("dyn-summary-frames").textContent = result.frameCount;
    document.getElementById("dyn-summary-duration").textContent = `${result.duration}s`;
    document.getElementById("dyn-summary-fps").textContent = result.fps;

    // 1. Attach Real Signer Video Player
    const videoEl = document.getElementById("dynamic-preview-video");
    if (videoEl && result.videoBlob) {
      if (this.currentDynamicVideoUrl) {
        URL.revokeObjectURL(this.currentDynamicVideoUrl);
      }
      this.currentDynamicVideoUrl = URL.createObjectURL(result.videoBlob);
      videoEl.src = this.currentDynamicVideoUrl;
      videoEl.load();
    }

    // 2. Initialize 21-Landmark Skeleton Viewer
    if (!this.dynamicSkeletonViewer) {
      this.dynamicSkeletonViewer = new ThreeHandViewer("dynamic-skeleton-viewport", { mode: "skeleton" });
    }
    if (this.dynamic3DViewer) {
      this.dynamic3DViewer.destroy();
      this.dynamic3DViewer = null;
    }
    if (this.dynamicSkeletonViewer) {
      this.dynamicSkeletonViewer.loadDynamicSequence(result.frames, result.duration, result.fps);
    }

    // 3. Synchronized Timeline Scrubber & Video Controls
    const scrubber = document.getElementById("dyn-timeline-scrubber");
    const timeDisplay = document.getElementById("dyn-timeline-time");
    const playPauseIcon = document.getElementById("icon-dyn-play-pause");

    if (this.dynamicSkeletonViewer) {
      this.dynamicSkeletonViewer.onTimelineUpdate = (t, dur) => {
        if (!videoEl || videoEl.paused) {
          if (scrubber) scrubber.value = (t / (dur || 1)) * 100;
          if (timeDisplay) timeDisplay.textContent = `${t.toFixed(1)}s / ${dur.toFixed(1)}s`;
        }
      };
    }

    if (videoEl) {
      videoEl.onplay = () => {
        if (this.dynamicSkeletonViewer && !this.dynamicSkeletonViewer.isPlaying) {
          this.dynamicSkeletonViewer.play();
        }
        if (playPauseIcon) playPauseIcon.textContent = "pause";
      };
      videoEl.onpause = () => {
        if (this.dynamicSkeletonViewer && this.dynamicSkeletonViewer.isPlaying) {
          this.dynamicSkeletonViewer.pause();
        }
        if (playPauseIcon) playPauseIcon.textContent = "play_arrow";
      };
      videoEl.ontimeupdate = () => {
        const cur = videoEl.currentTime;
        const dur = videoEl.duration || result.duration || 1;
        if (scrubber) scrubber.value = (cur / dur) * 100;
        if (timeDisplay) timeDisplay.textContent = `${cur.toFixed(1)}s / ${dur.toFixed(1)}s`;
        if (this.dynamicSkeletonViewer) {
          this.dynamicSkeletonViewer.seek(cur);
        }
      };
      videoEl.onended = () => {
        if (this.dynamicSkeletonViewer) this.dynamicSkeletonViewer.pause();
        if (playPauseIcon) playPauseIcon.textContent = "play_arrow";
      };
    }

    if (scrubber) {
      scrubber.oninput = (e) => {
        const dur = (videoEl && videoEl.duration) || result.duration || 1;
        const t = (e.target.value / 100) * dur;
        if (videoEl) videoEl.currentTime = t;
        if (this.dynamicSkeletonViewer) this.dynamicSkeletonViewer.seek(t);
        if (timeDisplay) timeDisplay.textContent = `${t.toFixed(1)}s / ${dur.toFixed(1)}s`;
      };
    }
  }

  async saveDynamicSampleToBackend() {
    if (!this.recordedDynamicData) return;

    const signerId = document.getElementById("collect-signer-input").value.trim() || "S001";
    const saveBtn = document.getElementById("btn-save-dynamic-sample");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving Video & Sequence...";

    try {
      const formData = new FormData();
      formData.append("gesture_id", this.selectedGestureId);
      formData.append("signer_id", signerId);
      formData.append("handedness", this.recordedDynamicData.handedness || "RIGHT");
      formData.append("video", this.recordedDynamicData.videoBlob, `recording_${Date.now()}.webm`);
      formData.append("landmarks_sequence_json", JSON.stringify(this.recordedDynamicData.frames));
      formData.append("fps", this.recordedDynamicData.fps);
      formData.append("duration", this.recordedDynamicData.duration);
      formData.append("frame_count", this.recordedDynamicData.frameCount);
      formData.append("confidence", 0.94);

      const saved = await api.uploadWebcamVideoSample(formData);

      alert(`Dynamic sample saved successfully! Sample ID: ${saved.sample_id}`);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Dynamic Sample to Dataset";
      document.getElementById("dynamic-recorded-panel").classList.add("hidden");

    } catch (e) {
      alert("Failed to save dynamic sample: " + e.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Dynamic Sample to Dataset";
    }
  }

  // ==========================================
  // 4. DATASET SAMPLES EXPLORER
  // ==========================================
  async loadSamplesPage() {
    try {
      this.samples = await api.getSamples();
      const tbody = document.getElementById("all-samples-tbody");
      tbody.innerHTML = "";

      if (this.samples.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-outline text-sm">No dataset samples available.</td></tr>`;
        return;
      }

      this.samples.forEach((s) => {
        const tr = document.createElement("tr");
        tr.className = "data-table-row hover:bg-surface-variant/30 text-sm cursor-pointer";
        tr.onclick = () => this.inspectSample(s.sample_id);

        tr.innerHTML = `
          <td class="py-3 px-4 font-medium text-on-background">${s.gesture_name || s.gesture_id} <span class="text-xs text-primary">${s.gesture_kannada ? `(${s.gesture_kannada})` : ""}</span></td>
          <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-xs ${s.sample_type.includes("VIDEO") ? "bg-purple-950 text-purple-300" : "bg-blue-950 text-blue-300"}">${s.sample_type}</span></td>
          <td class="py-3 px-4 text-on-surface-variant">${s.signer_id}</td>
          <td class="py-3 px-4 font-mono text-xs text-outline">${s.frame_count} frames</td>
          <td class="py-3 px-4 font-mono text-xs text-primary">${Math.round(s.detection_confidence * 100)}%</td>
          <td class="py-3 px-4 text-outline text-xs">${new Date(s.created_at).toLocaleString()}</td>
          <td class="py-3 px-4 text-right">
            <div class="flex items-center justify-end gap-2">
              <button class="px-2.5 py-1 rounded bg-surface-container hover:bg-primary/20 text-primary text-xs" onclick="event.stopPropagation(); app.inspectSample('${s.sample_id}')">Inspect</button>
              <button class="px-2 py-1 rounded bg-surface-container hover:bg-rose-950/60 text-rose-400 border border-rose-900/40 text-xs flex items-center gap-1 transition-colors" onclick="event.stopPropagation(); app.deleteSample('${s.sample_id}')" title="Delete sample &amp; files">
                <span class="material-symbols-outlined text-[14px]">delete</span>
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
    }
  }

  async inspectSample(sampleId) {
    try {
      const sample = this.samples.find(s => s.sample_id === sampleId) || (await api.getSamples({ sample_id: sampleId }))[0];
      if (!sample) return;

      const landmarksData = await api.getSampleLandmarks(sampleId);

      document.getElementById("inspect-sample-id").textContent = sample.sample_id;
      document.getElementById("inspect-gesture").textContent = `${sample.gesture_name || sample.gesture_id} (${sample.gesture_kannada || ""})`;
      document.getElementById("inspect-signer").textContent = sample.signer_id;
      document.getElementById("inspect-conf").textContent = `${Math.round(sample.detection_confidence * 100)}%`;
      document.getElementById("inspect-frames").textContent = sample.frame_count;

      // Media container (image or video)
      const mediaContainer = document.getElementById("inspect-media-container");
      mediaContainer.innerHTML = "";
      const fileUrl = api.getAssetUrl(sample.stored_file_path);

      if (sample.sample_type.includes("VIDEO")) {
        const vid = document.createElement("video");
        vid.src = fileUrl;
        vid.controls = true;
        vid.autoplay = true;
        vid.loop = true;
        vid.className = "w-full h-full object-contain";
        vid.onplay = () => {
          if (this.sampleInspectSkeletonViewer && !this.sampleInspectSkeletonViewer.isPlaying) {
            this.sampleInspectSkeletonViewer.play();
          }
        };
        vid.onpause = () => {
          if (this.sampleInspectSkeletonViewer && this.sampleInspectSkeletonViewer.isPlaying) {
            this.sampleInspectSkeletonViewer.pause();
          }
        };
        vid.ontimeupdate = () => {
          if (this.sampleInspectSkeletonViewer) {
            this.sampleInspectSkeletonViewer.seek(vid.currentTime);
          }
        };
        mediaContainer.appendChild(vid);
      } else {
        const img = document.createElement("img");
        img.src = fileUrl;
        img.className = "w-full h-full object-contain";
        mediaContainer.appendChild(img);
      }

      // JSON raw data
      document.getElementById("inspect-raw-json").textContent = JSON.stringify(landmarksData, null, 2);

      // 21-Landmark Skeleton Viewer for sample
      if (!this.sampleInspectSkeletonViewer) {
        this.sampleInspectSkeletonViewer = new ThreeHandViewer("inspect-skeleton-viewport", { mode: "skeleton" });
      }
      if (this.sampleInspect3DViewer) {
        this.sampleInspect3DViewer.destroy();
        this.sampleInspect3DViewer = null;
      }

      if (landmarksData.frames && landmarksData.frames.length > 1) {
        this.sampleInspectSkeletonViewer.loadDynamicSequence(landmarksData.frames, sample.duration, sample.fps || 30);
      } else if (landmarksData.frames && landmarksData.frames.length === 1) {
        const firstFrame = landmarksData.frames[0];
        const data = {
          right_hand_landmarks: firstFrame.right_hand_landmarks,
          left_hand_landmarks: firstFrame.left_hand_landmarks
        };
        this.sampleInspectSkeletonViewer.applyLandmarks(data);
      } else if (landmarksData.right_hand_landmarks || landmarksData.left_hand_landmarks) {
        const data = {
          right_hand_landmarks: landmarksData.right_hand_landmarks,
          left_hand_landmarks: landmarksData.left_hand_landmarks
        };
        this.sampleInspectSkeletonViewer.applyLandmarks(data);
      } else if (Array.isArray(landmarksData) && landmarksData.length === 21) {
        this.sampleInspectSkeletonViewer.applyLandmarks(landmarksData);
      }

      this.currentInspectedSample = sample;
      const masterBtn = document.getElementById("btn-inspect-master-ref");
      const masterBtnText = document.getElementById("inspect-master-ref-text");
      const isMasterRef = Boolean(sample.is_master_reference);
      if (masterBtn && masterBtnText) {
        if (isMasterRef) {
          masterBtn.className = "px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer font-bold";
          masterBtnText.textContent = "★ Master Reference Sign (Active)";
        } else {
          masterBtn.className = "px-2.5 py-1 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/60 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer";
          masterBtnText.textContent = "Set as Master Reference Sign";
        }
      }

      document.getElementById("sample-inspector-modal").classList.remove("hidden");
    } catch (e) {
      alert("Error inspecting sample: " + e.message);
    }
  }

  async setMasterReferenceFromInspector() {
    if (!this.currentInspectedSample) return;
    try {
      await api.setMasterReferenceSample(this.currentInspectedSample.sample_id);
      this.currentInspectedSample.is_master_reference = true;
      const masterBtn = document.getElementById("btn-inspect-master-ref");
      const masterBtnText = document.getElementById("inspect-master-ref-text");
      if (masterBtn && masterBtnText) {
        masterBtn.className = "px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer font-bold";
        masterBtnText.textContent = "★ Master Reference Sign (Active)";
      }
      alert(`Sample "${this.currentInspectedSample.sample_id}" is now locked as the Master Reference sign for gesture "${this.currentInspectedSample.gesture_id}".`);
    } catch (err) {
      alert("Failed to set master reference: " + err.message);
    }
  }

  closeSampleInspector() {
    if (this.sampleInspectSkeletonViewer) {
      this.sampleInspectSkeletonViewer.destroy();
      this.sampleInspectSkeletonViewer = null;
    }
    if (this.sampleInspect3DViewer) {
      this.sampleInspect3DViewer.destroy();
      this.sampleInspect3DViewer = null;
    }
    this.currentInspectedSample = null;
    document.getElementById("sample-inspector-modal").classList.add("hidden");
  }

  // ==========================================
  // 5. 3D MODELS PAGE
  // ==========================================
  async loadModelsPage() {
    try {
      const models = await api.getModels();
      const grid = document.getElementById("models-catalog-grid");
      grid.innerHTML = "";

      models.forEach((m) => {
        const card = document.createElement("div");
        card.className = "stat-card flex flex-col justify-between min-w-0 max-w-full overflow-hidden";
        card.innerHTML = `
          <div class="min-w-0">
            <div class="flex justify-between items-center gap-2 mb-2 min-w-0">
              <span class="font-mono text-xs text-outline truncate" title="${m.filename}">${m.filename}</span>
              <span class="text-xs px-2 py-0.5 rounded bg-surface-container text-primary uppercase font-mono shrink-0">${m.format}</span>
            </div>
            <div class="h-32 rounded bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center relative overflow-hidden mb-3">
              <span class="material-symbols-outlined text-outline text-[48px] opacity-40">view_in_ar</span>
              <span class="absolute bottom-2 left-2 text-[10px] font-mono text-primary bg-background/80 px-2 py-0.5 rounded truncate max-w-[85%]">
                ${m.rigged ? "Rigged Skeletal Mesh" : "Static 3D Mesh"}
              </span>
            </div>
            <div class="text-xs text-outline truncate">Gesture: <strong class="text-on-background">${m.gesture_id || "Unassigned"}</strong></div>
            <div class="text-xs text-outline mt-1 truncate">Est. Vertices: <span class="font-mono text-on-surface-variant">${m.vertex_count}</span></div>
          </div>
          <div class="mt-4 pt-3 border-t border-[#334155] flex flex-wrap justify-between items-center gap-2">
            <button class="px-3 py-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium cursor-pointer transition-colors" onclick="app.previewModelIn3D('${m.file_path}')">
              Load in 3D Viewport
            </button>
            <button class="text-red-400 hover:text-red-300 text-xs cursor-pointer p-1" onclick="app.delete3DModel(${m.id})">Delete</button>
          </div>
        `;
        grid.appendChild(card);
      });
    } catch (e) {
      console.error(e);
    }
  }

  async previewModelIn3D(filePath) {
    if (!this.modelsPage3DViewer) {
      this.modelsPage3DViewer = new ThreeHandViewer("models-3d-viewport");
    }
    const fullUrl = api.getAssetUrl(filePath);
    try {
      const res = await this.modelsPage3DViewer.loadGLBModel(fullUrl);
      const statusEl = document.getElementById("models-viewport-status");
      statusEl.textContent = res.isRigged
        ? "✓ Model loaded with skeletal rigging."
        : "Model loaded, but skeletal animation is unavailable.";
    } catch (err) {
      alert("Failed to load GLB model: " + err.message);
    }
  }

  setAvatarMode(mode) {
    this.avatarMode = mode;
    const viewers = [
      this.static3DViewer,
      this.dynamic3DViewer,
      this.details3DViewer,
      this.sampleInspect3DViewer
    ];
    viewers.forEach(v => {
      if (v && typeof v.toggleAvatar === "function") {
        v.toggleAvatar(mode);
      }
    });
    document.querySelectorAll("[data-avatar-mode]").forEach(btn => {
      if (btn.getAttribute("data-avatar-mode") === mode) {
        btn.classList.add("text-primary", "bg-primary/20", "font-semibold");
        btn.classList.remove("text-outline");
      } else {
        btn.classList.remove("text-primary", "bg-primary/20", "font-semibold");
        btn.classList.add("text-outline");
      }
    });
  }

  async delete3DModel(modelId) {
    if (!confirm("Are you sure you want to delete this 3D model?")) return;
    try {
      await api.deleteModel(modelId);
      this.loadModelsPage();
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
  }

  // ==========================================
  // 6. TRAINING READINESS AUDIT (Real DB data)
  // ==========================================
  async loadReadinessPage() {
    try {
      const readiness = await api.getTrainingReadiness();
      document.getElementById("readiness-total-gestures").textContent = readiness.total_gestures;
      document.getElementById("readiness-ready-count").textContent = readiness.ready_gestures;
      document.getElementById("readiness-total-samples").textContent = readiness.overall_samples;
      document.getElementById("readiness-valid-samples").textContent = readiness.overall_valid_samples;

      const tbody = document.getElementById("readiness-table-tbody");
      tbody.innerHTML = "";

      readiness.gestures.forEach((g) => {
        const tr = document.createElement("tr");
        tr.className = "data-table-row hover:bg-surface-variant/30 text-sm";
        const readyBadge = g.is_ready
          ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">READY (YES)</span>`
          : `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">NEEDS DATA (${g.sample_count}/3)</span>`;

        tr.innerHTML = `
          <td class="py-3 px-4 font-semibold text-on-background">${g.name} <span class="text-xs text-primary">${g.kannada_meaning ? `(${g.kannada_meaning})` : ""}</span></td>
          <td class="py-3 px-4 font-mono text-xs">${g.gesture_type}</td>
          <td class="py-3 px-4 font-mono text-xs">${g.sample_count}</td>
          <td class="py-3 px-4 font-mono text-xs">${g.signer_count}</td>
          <td class="py-3 px-4 font-mono text-xs text-emerald-400">${g.valid_samples}</td>
          <td class="py-3 px-4 font-mono text-xs text-amber-400">${g.low_confidence_samples}</td>
          <td class="py-3 px-4 text-xs">${g.has_3d_model ? "✓ Available" : "None"}</td>
          <td class="py-3 px-4 text-right">${readyBadge}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
    }
  }

  // ==========================================
  // DELETION METHODS (#6)
  // ==========================================
  async deleteSample(sampleId) {
    if (!confirm(`Are you sure you want to delete sample "${sampleId}"?\n\nThis will permanently delete the database record and associated images, videos, and landmark files from disk.`)) {
      return;
    }
    try {
      await api.deleteSample(sampleId);
      await this.loadSamplesPage();
      await this.loadDashboard();
    } catch (err) {
      alert("Failed to delete sample: " + err.message);
    }
  }

  async deleteGesture(gestureId) {
    const targetId = gestureId || this.detailsActiveGestureId;
    if (!targetId) return;

    if (!confirm(`WARNING: Deleting gesture "${targetId}" will permanently remove all associated dataset samples, camera images, videos, and landmark files from disk.\n\nAre you sure you want to proceed?`)) {
      return;
    }

    try {
      await api.deleteGesture(targetId);
      this.closeGestureDetails();
      await this.loadGesturesPage();
      await this.loadDashboard();
      alert(`Gesture "${targetId}" and all associated samples were deleted successfully.`);
    } catch (err) {
      alert("Failed to delete gesture: " + err.message);
    }
  }

  // ==========================================
  // KANNADA AUTO-TRANSLATION (#15)
  // ==========================================
  async autoTranslateKannada() {
    const nameInput = document.getElementById("input-gesture-name");
    const kannadaInput = document.getElementById("input-gesture-kannada");
    const statusEl = document.getElementById("translate-status");

    if (!nameInput || !kannadaInput) return;
    const text = nameInput.value.trim();
    if (!text) return;

    // Curated high-accuracy dictionary for common sign language terminology
    const KANNADA_DICT = {
      "hello": "ನಮಸ್ಕಾರ",
      "hi": "ಹಲೋ",
      "water": "ನೀರು",
      "food": "ಆಹಾರ",
      "eat": "ತಿನ್ನು",
      "drink": "ಕುಡಿ",
      "thank you": "ಧನ್ಯವಾದಗಳು",
      "thanks": "ಧನ್ಯವಾದಗಳು",
      "welcome": "ಸ್ವಾಗತ",
      "please": "ದಯವಿಟ್ಟು",
      "yes": "ಹೌದು",
      "no": "ಇಲ್ಲ",
      "help": "ಸಹಾಯ",
      "mother": "ತಾಯಿ",
      "father": "ತಂದೆ",
      "brother": "ಸಹೋದರ",
      "sister": "ಸಹೋದರಿ",
      "friend": "ಸ್ನೇಹಿತ",
      "good": "ಒಳ್ಳೆಯದು",
      "bad": "ಕೆಟ್ಟದ್ದು",
      "stop": "ನಿಲ್ಲಿಸಿ",
      "go": "ಹೋಗು",
      "come": "ಬನ್ನಿ",
      "home": "ಮನೆ",
      "school": "ಶಾಲೆ",
      "book": "ಪುಸ್ತಕ",
      "pen": "ಲೇಖನಿ",
      "love": "ಪ್ರೀತಿ",
      "happy": "ಸಂತೋಷ",
      "sad": "ದುಃಖ",
      "bye": "ವಿದಾಯ",
      "goodbye": "ವಿದಾಯ",
      "good morning": "ಶುಭೋದಯ",
      "good night": "ಶುಭರಾತ್ರಿ",
      "name": "ಹೆಸರು",
      "what": "ಏನು",
      "where": "ಎಲ್ಲಿ",
      "how": "ಹೇಗೆ",
      "why": "ಯಾಕೆ",
      "who": "ಯಾರು",
      "me": "ನಾನು",
      "you": "ನೀವು",
      "we": "ನಾವು",
      "time": "ಸಮಯ",
      "money": "ಹಣ",
      "doctor": "ವೈದ್ಯರು",
      "hospital": "ಆಸ್ಪತ್ರೆ",
      "police": "ಪೊಲೀಸ್",
      "emergency": "ತುರ್ತು"
    };

    const lower = text.toLowerCase().trim();
    if (KANNADA_DICT[lower]) {
      kannadaInput.value = KANNADA_DICT[lower];
      if (statusEl) {
        statusEl.textContent = "✓ Translated";
        statusEl.classList.remove("hidden", "text-primary", "text-amber-400");
        statusEl.classList.add("text-emerald-400");
        setTimeout(() => statusEl.classList.add("hidden"), 3000);
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = "Translating...";
      statusEl.classList.remove("hidden", "text-emerald-400", "text-amber-400");
      statusEl.classList.add("text-primary");
    }

    try {
      // Primary: Google Translate API (fast, clean, and accurate)
      const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=kn&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(gUrl);
      if (!res.ok) throw new Error("Google translation request failed");
      const data = await res.json();
      
      let translated = "";
      if (Array.isArray(data) && Array.isArray(data[0])) {
        translated = data[0].map(part => part[0]).filter(Boolean).join(" ").trim();
      }

      if (translated) {
        kannadaInput.value = translated;
        if (statusEl) {
          statusEl.textContent = "✓ Translated";
          statusEl.classList.remove("text-primary");
          statusEl.classList.add("text-emerald-400");
          setTimeout(() => statusEl.classList.add("hidden"), 3000);
        }
      } else {
        throw new Error("Empty translation returned");
      }
    } catch (err) {
      console.warn("Translation API notice:", err);
      if (statusEl) {
        statusEl.textContent = "Kannada translation unavailable. Please enter manually.";
        statusEl.classList.remove("text-primary");
        statusEl.classList.add("text-amber-400");
        setTimeout(() => statusEl.classList.add("hidden"), 4000);
      }
    }
  }

  // ==========================================
  // DYNAMIC SYNCHRONIZED PLAYBACK CONTROLS
  // ==========================================
  setupDynamicPlaybackControls() {
    const playPauseBtn = document.getElementById("btn-dyn-play-pause");
    const playPauseIcon = document.getElementById("icon-dyn-play-pause");
    const resetBtn = document.getElementById("btn-dyn-reset");

    playPauseBtn?.addEventListener("click", () => {
      const videoEl = document.getElementById("dynamic-preview-video");
      if (videoEl && videoEl.src) {
        if (videoEl.paused) {
          videoEl.play();
        } else {
          videoEl.pause();
        }
      } else if (this.dynamicSkeletonViewer) {
        if (this.dynamicSkeletonViewer.isPlaying) {
          this.dynamicSkeletonViewer.pause();
          if (playPauseIcon) playPauseIcon.textContent = "play_arrow";
        } else {
          this.dynamicSkeletonViewer.play();
          if (playPauseIcon) playPauseIcon.textContent = "pause";
        }
      }
    });

    resetBtn?.addEventListener("click", () => {
      const videoEl = document.getElementById("dynamic-preview-video");
      if (videoEl && videoEl.src) {
        videoEl.currentTime = 0;
        videoEl.pause();
      }
      if (this.dynamicSkeletonViewer) {
        this.dynamicSkeletonViewer.reset();
      }
      const scrubber = document.getElementById("dyn-timeline-scrubber");
      if (scrubber) scrubber.value = 0;
      if (playPauseIcon) playPauseIcon.textContent = "play_arrow";
    });

    document.querySelectorAll(".dyn-speed-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const speed = parseFloat(btn.getAttribute("data-speed")) || 1.0;
        const videoEl = document.getElementById("dynamic-preview-video");
        if (videoEl) videoEl.playbackRate = speed;
        if (this.dynamicSkeletonViewer) this.dynamicSkeletonViewer.setSpeed(speed);
        document.querySelectorAll(".dyn-speed-btn").forEach(b => {
          b.classList.remove("bg-primary/20", "text-primary", "font-bold");
          b.classList.add("text-outline");
        });
        btn.classList.add("bg-primary/20", "text-primary", "font-bold");
        btn.classList.remove("text-outline");
      });
    });
  }

  // ==========================================
  // ACTION BINDINGS
  // ==========================================
  bindActionButtons() {
    // Add Gesture modal
    document.getElementById("btn-add-gesture-modal")?.addEventListener("click", () => {
      document.getElementById("add-gesture-modal").classList.remove("hidden");
    });
    document.getElementById("btn-add-gesture-modal-2")?.addEventListener("click", () => {
      document.getElementById("add-gesture-modal").classList.remove("hidden");
    });
    document.getElementById("btn-close-add-gesture")?.addEventListener("click", () => {
      document.getElementById("add-gesture-modal").classList.add("hidden");
    });

    // Gesture Details 'Assign to Signer' trigger
    document.getElementById("btn-details-assign-signer")?.addEventListener("click", () => {
      this.openAssignGestureModal(this.detailsActiveGestureId);
    });

    // Kannada Auto-Translation triggers (#15)
    document.getElementById("btn-manual-translate")?.addEventListener("click", () => {
      this.autoTranslateKannada();
    });
    document.getElementById("input-gesture-name")?.addEventListener("blur", () => {
      const kannadaInput = document.getElementById("input-gesture-kannada");
      if (kannadaInput && !kannadaInput.value.trim()) {
        this.autoTranslateKannada();
      }
    });

    // Auto-Collection Buttons (#1, #2)
    document.getElementById("btn-start-auto-collect")?.addEventListener("click", () => {
      this.startAutoCollection();
    });
    document.getElementById("btn-auto-pause")?.addEventListener("click", () => {
      this.pauseAutoCollection();
    });
    document.getElementById("btn-auto-stop")?.addEventListener("click", () => {
      this.stopAutoCollection();
    });

    // Retake Buttons (#7)
    document.getElementById("btn-retake-static")?.addEventListener("click", () => {
      this.retakeStaticSample();
    });
    document.getElementById("btn-retake-dynamic")?.addEventListener("click", () => {
      this.retakeDynamicSample();
    });

    // Delete Gesture Button in Modal (#6)
    document.getElementById("btn-delete-gesture-modal")?.addEventListener("click", () => {
      this.deleteGesture();
    });

    // Setup Dynamic 3D Controls
    this.setupDynamicPlaybackControls();

    // Create Gesture Form Submission
    document.getElementById("form-create-gesture")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("input-gesture-name").value.trim();
      const gestureId = document.getElementById("input-gesture-id").value.trim().toLowerCase().replace(/\s+/g, "_");
      const kannada = document.getElementById("input-gesture-kannada").value.trim();
      const type = document.getElementById("input-gesture-type").value;
      const hands = document.getElementById("input-gesture-hands").value;
      const desc = document.getElementById("input-gesture-desc").value.trim();

      try {
        await api.createGesture({
          gesture_id: gestureId,
          name: name,
          english_meaning: name,
          kannada_meaning: kannada,
          gesture_type: type,
          hand_count: hands,
          description: desc,
          enabled: true,
          verification_status: "VERIFIED"
        });

        document.getElementById("add-gesture-modal").classList.add("hidden");
        await this.loadDashboard();
        await this.loadGesturesPage();
        alert(`Gesture '${name}' created and stored in SQLite database.`);
      } catch (err) {
        alert("Failed to create gesture: " + err.message);
      }
    });

    // Static collection actions
    document.getElementById("btn-capture-static")?.addEventListener("click", () => {
      this.captureStaticWebcamSample();
    });
    document.getElementById("btn-save-static-sample")?.addEventListener("click", () => {
      this.saveStaticSampleToBackend();
    });

    // Dynamic collection actions
    document.getElementById("btn-toggle-recording")?.addEventListener("click", () => {
      this.toggleDynamicRecording();
    });
    document.getElementById("btn-save-dynamic-sample")?.addEventListener("click", () => {
      this.saveDynamicSampleToBackend();
    });

    // Upload 3D Model Form Submission
    document.getElementById("form-upload-model")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById("input-model-file");
      const gestureId = document.getElementById("input-model-gesture").value.trim();
      const isRigged = document.getElementById("input-model-rigged").checked;

      if (!fileInput.files[0]) {
        alert("Please choose a .glb or .gltf file.");
        return;
      }

      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      if (gestureId) formData.append("gesture_id", gestureId);
      formData.append("is_rigged", isRigged);

      try {
        await api.uploadModel(formData);
        alert("3D model uploaded and indexed in database!");
        fileInput.value = "";
        this.loadModelsPage();
      } catch (err) {
        alert("Failed to upload model: " + err.message);
      }
    });

    // Export dataset button
    document.getElementById("btn-export-dataset")?.addEventListener("click", () => {
      window.location.href = api.getExportUrl();
    });
  }
}

// Global App instantiation & window bridge
function initISLApp() {
  try {
    if (!window.app) {
      const appInstance = new App();
      window.app = appInstance;
      console.log("[ISL] App initialized successfully, window.app =", window.app);
    }
  } catch (err) {
    console.error("[ISL] CRITICAL: App constructor failed:", err);
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initISLApp);
} else {
  initISLApp();
}

// Global helpers so inline HTML onclick handlers always resolve reliably
window.openAssignGestureModal = (gid) => {
  console.log("[ISL] openAssignGestureModal called, app=", !!window.app);
  if (window.app) window.app.openAssignGestureModal(gid);
  else console.error("[ISL] window.app is not initialized!");
};
window.closeAssignGestureModal = () => window.app?.closeAssignGestureModal();
window.submitAssignGestureForm = (e) => window.app?.submitAssignGestureForm(e);
window.openAddSignerModal = () => {
  console.log("[ISL] openAddSignerModal called, app=", !!window.app);
  if (window.app) window.app.openAddSignerModal();
  else console.error("[ISL] window.app is not initialized!");
};
window.closeAddSignerModal = () => window.app?.closeAddSignerModal();
window.submitAddSignerForm = (e) => window.app?.submitAddSignerForm(e);
window.removeAllSigners = () => window.app?.removeAllSigners();
