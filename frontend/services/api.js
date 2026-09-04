/**
 * API Service for communicating with Python FastAPI backend
 */

// Dynamically determine backend URL (uses same host or fallback to :8000)
const API_BASE_URL = window.location.origin.includes(":8000") || window.location.origin.includes(":5173")
  ? (window.location.origin.includes(":5173") ? "http://localhost:8000" : window.location.origin)
  : "http://localhost:8000";

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
        throw new Error(errData.detail || `HTTP Error ${res.status}: ${res.statusText}`);
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

  // Export
  getExportUrl() {
    return `${this.baseUrl}/api/dataset/export`;
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
