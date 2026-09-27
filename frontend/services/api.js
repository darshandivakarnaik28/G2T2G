/**
 * API Service for Centralized Remote ISL Dataset Collector
 */

// Dynamically determine backend URL (supports direct port 8000, VS Code Live Server 5500, Vite, React, etc.)
function getApiBaseUrl() {
  if (typeof window === "undefined" || !window.location) {
    return "http://localhost:8000";
  }
  const origin = window.location.origin || "";
  const port = window.location.port;
  const protocol = window.location.protocol;

  if (protocol === "file:" || !origin.startsWith("http")) {
    return "http://localhost:8000";
  }
  // If running from web dev servers (VS Code Live Server 5500, Vite 5173, Create-React-App 3000, etc.)
  if (["5500", "5501", "5502", "5173", "3000", "8080", "4200"].includes(port)) {
    return "http://localhost:8000";
  }
  return origin;
}

const API_BASE_URL = getApiBaseUrl();

class ApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async fetchJson(endpoint, options = {}) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...options.headers
        }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let detailMsg = "";
        if (typeof errData.detail === "string") {
          detailMsg = errData.detail;
        } else if (Array.isArray(errData.detail)) {
          detailMsg = errData.detail.map(d => d.msg || JSON.stringify(d)).join(", ");
        } else if (errData.detail) {
          detailMsg = JSON.stringify(errData.detail);
        }
        throw new Error(detailMsg || `HTTP Error ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  }

  // Gestures
  async getGestures() {
    return await this.fetchJson("/api/gestures");
  }

  async getGesture(gestureId) {
    return await this.fetchJson(`/api/gestures/${gestureId}`);
  }

  async getGestureDataset(gestureId) {
    return await this.fetchJson(`/api/gestures/${gestureId}/dataset`);
  }

  async createGesture(data) {
    return await this.fetchJson("/api/gestures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  async updateGesture(gestureId, data) {
    return await this.fetchJson(`/api/gestures/${gestureId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  async deleteGesture(gestureId) {
    return await this.fetchJson(`/api/gestures/${gestureId}`, {
      method: "DELETE"
    });
  }

  // Signers
  async getSigners() {
    return await this.fetchJson("/api/signers");
  }

  async createSigner(data) {
    return await this.fetchJson("/api/signers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  async getSigner(signerId) {
    return await this.fetchJson(`/api/signers/${signerId}`);
  }

  async getSignerDataset(signerId) {
    return await this.fetchJson(`/api/signers/${signerId}/dataset`);
  }

  async toggleSignerStatus(signerId) {
    return await this.fetchJson(`/api/signers/${signerId}/toggle-status`, {
      method: "PUT"
    });
  }

  async deleteSigner(signerId) {
    return await this.fetchJson(`/api/signers/${signerId}`, {
      method: "DELETE"
    });
  }

  async removeAllSigners() {
    return await this.fetchJson("/api/signers", {
      method: "DELETE"
    });
  }

  // Assignments
  async getAssignments(filters = {}) {
    const params = new URLSearchParams();
    if (filters.signer_id) params.append("signer_id", filters.signer_id);
    if (filters.gesture_id) params.append("gesture_id", filters.gesture_id);
    if (filters.status) params.append("status", filters.status);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return await this.fetchJson(`/api/assignments${qs}`);
  }

  async createAssignment(data) {
    return await this.fetchJson("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  async assignGesture(data) {
    return await this.fetchJson("/api/assignments/assign-gesture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  async getAssignmentProgress(assignmentId) {
    return await this.fetchJson(`/api/assignments/${assignmentId}/progress`);
  }

  async deleteAssignment(assignmentId) {
    return await this.fetchJson(`/api/assignments/${assignmentId}`, {
      method: "DELETE"
    });
  }

  // Samples
  async getSamples(filters = {}) {
    const params = new URLSearchParams();
    if (filters.gesture_id) params.append("gesture_id", filters.gesture_id);
    if (filters.signer_id) params.append("signer_id", filters.signer_id);
    if (filters.sample_type) params.append("sample_type", filters.sample_type);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return await this.fetchJson(`/api/samples${qs}`);
  }

  async getSampleLandmarks(sampleId) {
    return await this.fetchJson(`/api/samples/${sampleId}/landmarks`);
  }

  async deleteSample(sampleId) {
    return await this.fetchJson(`/api/samples/${sampleId}`, {
      method: "DELETE"
    });
  }

  async uploadWebcamImageSample(formData) {
    const res = await fetch(`${this.baseUrl}/api/samples/webcam-image`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to upload webcam image sample.");
    }
    return await res.json();
  }

  async uploadImageSample(formData) {
    const res = await fetch(`${this.baseUrl}/api/samples/image`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to upload image sample.");
    }
    return await res.json();
  }

  async uploadWebcamVideoSample(formData) {
    const res = await fetch(`${this.baseUrl}/api/samples/webcam-video`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to upload video sample.");
    }
    return await res.json();
  }

  // 3D Models
  async getModels(gestureId = null) {
    const qs = gestureId ? `?gesture_id=${gestureId}` : "";
    return await this.fetchJson(`/api/models${qs}`);
  }

  async uploadModel(formData) {
    const res = await fetch(`${this.baseUrl}/api/models`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to upload 3D model.");
    }
    return await res.json();
  }

  async deleteModel(modelId) {
    return await this.fetchJson(`/api/models/${modelId}`, {
      method: "DELETE"
    });
  }

  // Dashboard Stats
  async getDashboardStats() {
    return await this.fetchJson("/api/dashboard/stats");
  }

  // Training Readiness
  async getTrainingReadiness() {
    return await this.fetchJson("/api/training-readiness");
  }

  // Master Signer & Canonical Sign Display
  async setMasterSigner(signerId) {
    return await this.fetchJson(`/api/signers/${signerId}/set-master`, {
      method: "PUT"
    });
  }

  async getMasterSample(gestureId) {
    return await this.fetchJson(`/api/gestures/${gestureId}/master-sample`);
  }

  async setMasterReferenceSample(sampleId) {
    return await this.fetchJson(`/api/samples/${sampleId}/set-master-reference`, {
      method: "PUT"
    });
  }

  // Asset URL helper
  getAssetUrl(relativePath) {
    if (!relativePath) return "";
    if (relativePath.startsWith("http")) return relativePath;
    const clean = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
    return `${this.baseUrl}${clean}`;
  }
}

export const api = new ApiService();
