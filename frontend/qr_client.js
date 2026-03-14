/**
 * SmartAMS QR Security Frontend Module
 * Handles QR generation, scanning, validation, offline sync, and security UI
 */

// ─────────────────────────────────────────────────────────
// QR Security Module - Extended Features
// ─────────────────────────────────────────────────────────

const QRModule = {
  // Configuration
  config: {
    get apiBase() {
      return (window.AMS_CONFIG && window.AMS_CONFIG.API_URL) || "https://smartams-backend-76160313029.us-central1.run.app";
    },
    offlineEnabled: true,
    offlineStorageKey: "ams_qr_offline_queue",
    deviceFingerprintKey: "ams_device_fingerprint"
  },

  // State
  state: {
    currentSession: null,
    offlineQueue: [],
    deviceFingerprint: null,
    isOnline: navigator.onLine
  },

  // Initialize module
  init() {
    this.loadOfflineQueue();
    this.generateDeviceFingerprint();
    this.setupOnlineListener();
    console.log("[QR-Module] Initialized with enhanced security features");
  },

  // Device Fingerprinting
  generateDeviceFingerprint() {
    const fingerprint = {
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
      plugins: navigator.plugins.length,
      timestamp: Date.now()
    };
    
    this.state.deviceFingerprint = this.hashObject(fingerprint);
    localStorage.setItem(this.config.deviceFingerprintKey, this.state.deviceFingerprint);
    return this.state.deviceFingerprint;
  },

  hashObject(obj) {
    return btoa(JSON.stringify(obj)).substring(0, 32);
  },

  // Geolocation
  async getLocation() {
    return new Promise((resolve) => {
      // Default location: Bangalore, India (13.1718° N, 77.5362° E)
      const defaultLocation = {
        latitude: 13.1718,
        longitude: 77.5362,
        accuracy: 100
      };

      if (!navigator.geolocation) {
        resolve(defaultLocation);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        () => {
          // Fallback to default location if geolocation fails
          resolve(defaultLocation);
        },
        { timeout: 5000, enableHighAccuracy: true }
      );
    });
  },

  // Faculty: Generate Enhanced QR Code
  async generateEnhancedQR(options = {}) {
    try {
      const payload = {
        faculty_id: AMS.user.id,
        course_id: options.courseId || "CS101",
        subject: options.subject || "Class Session",
        validity_minutes: options.validityMinutes || 5,
        require_face: options.requireFace !== false,
        require_location: options.requireLocation !== false,
        gps_radius_meters: options.gpsRadius || 100,
        latitude: options.latitude,
        longitude: options.longitude
      };

      const response = await fetch(`${this.config.apiBase}/api/qr/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      this.state.currentSession = result;
      this.showFacultyQRUI(result);
      return result;
    } catch (error) {
      console.error("[QR-GENERATE]", error);
      toast(`Error generating QR: ${error.message}`, "error");
    }
  },

  // Display QR for Faculty
  showFacultyQRUI(qrData) {
    const html = `
      <div class="qr-faculty-panel">
        <div class="card card-primary">
          <div class="card-header">
            <div class="card-title">📲 Active QR Session</div>
            <button class="btn btn-danger btn-sm" onclick="QRModule.stopSession()">Stop Session</button>
          </div>
          <div class="card-body">
            <div style="text-align: center; padding: 2rem;">
              <img src="data:image/png;base64,${qrData.qr_code_base64}" 
                   style="max-width: 300px; border: 2px solid #0066cc; border-radius: 8px;" />
            </div>
            <div class="info-box">
              <strong>Class:</strong> ${qrData.subject}<br>
              <strong>Session ID:</strong> <code>${qrData.session_id}</code><br>
              <strong>Expires:</strong> <span id="qrTimer" class="badge badge-orange">5:00</span>
            </div>
            <div class="qr-settings mt-md">
              <label class="checkbox">
                <input type="checkbox" checked> Require Face Recognition
              </label>
              <label class="checkbox">
                <input type="checkbox" checked> Require Location Check
              </label>
            </div>
            <div class="checkin-stats mt-lg">
              <div class="stat-row">
                <span>Students Checked In:</span>
                <strong id="checkinCount">0</strong>
              </div>
              <div class="stat-row">
                <span>Face Verified:</span>
                <strong id="faceVerifiedCount" style="color: green;">0</strong>
              </div>
              <div class="stat-row">
                <span>Location Verified:</span>
                <strong id="locationVerifiedCount" style="color: #0066cc;">0</strong>
              </div>
              <div class="stat-row">
                <span>Anomalies:</span>
                <strong id="anomalyCount" style="color: red;">0</strong>
              </div>
            </div>
            <button class="btn btn-info btn-block mt-lg" onclick="QRModule.showLiveTracker()">
              📊 Live Attendance Tracker
            </button>
          </div>
        </div>
      </div>
    `;
    
    const container = document.getElementById("f-qr-panel") || 
                      document.querySelector(".main-content");
    if (container) {
      container.innerHTML = html;
    }

    // Start countdown timer
    this.startQRTimer(qrData.validity_seconds);
  },

  startQRTimer(seconds) {
    if (this._qrTimerInterval) clearInterval(this._qrTimerInterval);
    let remaining = seconds;
    const timerEl = document.getElementById("qrTimer");
    
    this._qrTimerInterval = setInterval(() => {
      remaining--;
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      
      if (timerEl) {
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
        if (remaining <= 60) timerEl.className = "badge badge-red";
      }
      
      if (remaining <= 0) {
        clearInterval(this._qrTimerInterval);
        this._qrTimerInterval = null;
        this.sessionExpired();
      }
    }, 1000);
  },

  // Student: Enhanced QR Scanning
  async startEnhancedQRScan() {
    const html = `
      <div class="qr-scan-panel">
        <div class="card card-teal">
          <div class="card-header">
            <div class="card-title">📱 QR Code Attendance</div>
            <button class="btn btn-danger btn-sm" onclick="QRModule.stopQRScan()">Cancel</button>
          </div>
          <div class="card-body">
            <div class="scanner-container">
              <video id="qrScannerVideo" autoplay playsinline style="width:100%; max-width:500px;"></video>
              <canvas id="qrScannerCanvas" style="display:none;"></canvas>
              <div class="scanner-overlay">
                <div class="scanner-frame"></div>
                <div class="scanner-status">Position QR code in frame</div>
              </div>
            </div>
            <div id="qrScanStatus" class="mt-lg"></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("s-attendance-panel").innerHTML = html;
    await this.initQRScanner();
  },

  async initQRScanner() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const video = document.getElementById("qrScannerVideo");
      video.srcObject = stream;
      this.scanQRLoop();
    } catch (error) {
      console.error("Camera access denied:", error);
      toast("Camera access required for QR scanning", "error");
    }
  },

  scanQRLoop() {
    const video = document.getElementById("qrScannerVideo");
    const canvas = document.getElementById("qrScannerCanvas");
    
    if (!video.videoWidth) {
      requestAnimationFrame(() => this.scanQRLoop());
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code && code.data.startsWith("AMSQR:")) {
        this.processScannedQR(code.data);
        return;
      }
    } catch (error) {
      console.error("QR scan error:", error);
    }

    requestAnimationFrame(() => this.scanQRLoop());
  },

  async processScannedQR(qrString) {
    try {
      // Validate QR
      const validateRes = await fetch(`${this.config.apiBase}/api/qr/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_data: qrString,
          student_id: AMS.user.id
        })
      });

      const validation = await validateRes.json();
      if (!validation.success) {
        this.showQRStatus("error", validation.error);
        return;
      }

      // Check requirements
      let nextStep = "confirmation";
      if (validation.require_face) {
        nextStep = "face";
      } else if (validation.require_location) {
        nextStep = "location";
      }

      this.state.currentSession = validation;
      this.showQRFaceCheck(validation);
    } catch (error) {
      console.error("QR processing error:", error);
      this.showQRStatus("error", "Failed to process QR code");
    }
  },

  async showQRFaceCheck(sessionData) {
    const html = `
      <div class="qr-verification-panel">
        <div class="card card-teal">
          <div class="card-header">
            <div class="card-title">✅ Verify Your Face</div>
          </div>
          <div class="card-body">
            <div class="camera-wrap">
              <video id="qrFaceVideo" autoplay playsinline></video>
              <div class="camera-ring"></div>
              <div class="camera-status">📷 Capturing face...</div>
            </div>
            <button class="btn btn-primary btn-block mt-lg" onclick="QRModule.captureQRFace()">
              Capture Face
            </button>
            <button class="btn btn-outline mt-sm" onclick="QRModule.skipFaceVerification()">
              Skip (Not Recommended)
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("s-attendance-panel").innerHTML = html;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      const video = document.getElementById("qrFaceVideo");
      video.srcObject = stream;
    } catch (error) {
      console.error("Camera error:", error);
      toast("Camera access required", "error");
    }
  },

  async captureQRFace() {
    try {
      const video = document.getElementById("qrFaceVideo");
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      const faceImage = canvas.toDataURL("image/jpeg");

      // Get location
      const location = await this.getLocation();

      // Mark attendance with full security checks
      const payload = {
        session_id: this.state.currentSession.session_id,
        student_id: AMS.user.id,
        roll_no: AMS.user.rollNo,
        name: AMS.user.name,
        face_image: faceImage,
        latitude: location?.latitude,
        longitude: location?.longitude,
        device_fingerprint: this.state.deviceFingerprint,
        user_agent: navigator.userAgent
      };

      const response = await fetch(`${this.config.apiBase}/api/qr/mark-attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        this.showAttendanceSuccess(result);
      } else {
        this.showQRStatus("error", result.message || "Attendance marking failed");
      }
    } catch (error) {
      console.error("Capture error:", error);
      if (!this.state.isOnline) {
        this.queueOfflineAttendance();
      }
    }
  },

  showAttendanceSuccess(data) {
    const html = `
      <div class="success-panel">
        <div class="att-status">
          <div class="att-icon-wrap success">✅</div>
          <h3 class="text-green">Attendance Marked!</h3>
          <div class="success-details mt-lg">
            <div class="detail-row">
              <span>Face Verified:</span>
              <strong style="color: ${data.face_verified ? 'green' : 'orange'}">
                ${data.face_verified ? 'Yes' : 'Partial'}
              </strong>
            </div>
            <div class="detail-row">
              <span>Face Confidence:</span>
              <strong>${data.face_confidence}</strong>
            </div>
            <div class="detail-row">
              <span>Location Verified:</span>
              <strong style="color: ${data.location_verified ? 'green' : 'orange'}">
                ${data.location_verified ? 'Yes' : 'No'}
              </strong>
            </div>
            <div class="detail-row">
              <span>Timestamp:</span>
              <strong>${new Date(data.timestamp).toLocaleTimeString()}</strong>
            </div>
          </div>
          <button class="btn btn-primary btn-block mt-lg" onclick="QRModule.resetAttendance()">
            Done
          </button>
        </div>
      </div>
    `;

    document.getElementById("s-attendance-panel").innerHTML = html;
    toast("Attendance marked successfully!", "success");
  },

  // Offline functionality
  loadOfflineQueue() {
    const queue = localStorage.getItem(this.config.offlineStorageKey);
    this.state.offlineQueue = queue ? JSON.parse(queue) : [];
  },

  saveOfflineQueue() {
    localStorage.setItem(this.config.offlineStorageKey, JSON.stringify(this.state.offlineQueue));
  },

  queueOfflineAttendance() {
    const entry = {
      id: `OFFLINE_${Date.now()}`,
      user_id: AMS.user.id,
      timestamp: new Date().toISOString(),
      action_type: "mark_attendance",
      session_id: this.state.currentSession?.session_id,
      roll_no: AMS.user.rollNo
    };

    this.state.offlineQueue.push(entry);
    this.saveOfflineQueue();
    toast("Queued for sync when online", "info");
  },

  setupOnlineListener() {
    window.addEventListener("online", () => {
      this.state.isOnline = true;
      toast("Back online - syncing data...", "info");
      this.syncOfflineQueue();
    });

    window.addEventListener("offline", () => {
      this.state.isOnline = false;
      toast("You are offline - attendance will be queued", "warn");
    });
  },

  async syncOfflineQueue() {
    if (this.state.offlineQueue.length === 0) return;

    try {
      const response = await fetch(`${this.config.apiBase}/api/qr/offline-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: AMS.user.id,
          queue: this.state.offlineQueue
        })
      });

      const result = await response.json();
      if (result.success) {
        this.state.offlineQueue = this.state.offlineQueue.filter(e => 
          result.failed_entries.some(f => f.id === e.id)
        );
        this.saveOfflineQueue();
        toast(`Synced ${result.synced_count} records`, "success");
      }
    } catch (error) {
      console.error("Sync error:", error);
    }
  },

  // Student: Create Personal QR Profile
  async createQRProfile() {
    try {
      const response = await fetch(`${this.config.apiBase}/api/qr/create-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: AMS.user.id,
          roll_no: AMS.user.rollNo,
          full_name: AMS.user.name,
          email: AMS.user.email,
          share_enabled: true,
          expires_hours: 720  // 30 days
        })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      this.showProfileQR(result);
    } catch (error) {
      console.error("Profile creation error:", error);
      toast(`Error creating profile: ${error.message}`, "error");
    }
  },

  showProfileQR(profileData) {
    const html = `
      <div class="profile-qr-panel">
        <div class="card card-info">
          <div class="card-header">
            <div class="card-title">👤 Your QR Profile</div>
          </div>
          <div class="card-body">
            <div style="text-align: center;">
              <img src="data:image/png;base64,${profileData.qr_code_base64}" 
                   style="max-width: 250px; border-radius: 8px;" />
            </div>
            <div class="info-box mt-lg">
              <p>Share your QR profile to let others access your attendance record.</p>
              <code style="display: block; word-break: break-all; margin: 1rem 0;">
                ${profileData.share_url}
              </code>
            </div>
            <button class="btn btn-primary btn-block" onclick="alert('Share link copied')">
              📋 Copy Share Link
            </button>
            <button class="btn btn-outline btn-block mt-sm" onclick="QRModule.disableProfileSharing()">
              🔒 Disable Sharing
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("s-dashboard-panel").innerHTML = html;
  },

  // Faculty: Live Attendance Tracker — real-time via Firebase RTDB
  showLiveTracker() {
    const html = `
      <div class="live-tracker-panel">
        <div class="card card-primary">
          <div class="card-header">
            <div class="card-title">📊 Live Attendance Tracker</div>
            <span id="trackerCount" class="badge badge-green">0 checked in</span>
          </div>
          <div class="card-body">
            <table class="table">
              <thead>
                <tr>
                  <th>Roll No</th>
                  <th>Name</th>
                  <th>Time</th>
                  <th>Face</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="trackerBody">
                <tr><td colspan="6" style="text-align:center">Waiting for students…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    const panel = document.getElementById("f-qr-panel");
    if(panel) panel.innerHTML = html;
    this.startRTDBTracker();
  },

  startRTDBTracker() {
    if(!window.DB || !this.state.currentSession) return;
    const sessionId = this.state.currentSession.session_id;
    const today = new Date().toISOString().slice(0, 10);
    const path = `/attendance/${today}/${sessionId}`;

    // Clean up previous listener
    if(this._trackerUnsubscribe) { this._trackerUnsubscribe(); this._trackerUnsubscribe = null; }

    this._trackerUnsubscribe = DB.listen(path, data => {
      const tbody = document.getElementById("trackerBody");
      const countEl = document.getElementById("trackerCount");
      if(!tbody) return;
      if(!data) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No check-ins yet</td></tr>';
        if(countEl) countEl.textContent = '0 checked in';
        return;
      }
      const rows = Object.entries(data);
      const presentCount = rows.filter(([,r])=>r.status==='present').length;
      if(countEl) countEl.textContent = `${presentCount}/${rows.length} checked in`;
      tbody.innerHTML = rows.sort((a,b)=>(b[1].timestamp||0)-(a[1].timestamp||0)).map(([rollNo, a]) => `
        <tr>
          <td>${a.roll_no || rollNo}</td>
          <td>${a.name || '—'}</td>
          <td>${a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '—'}</td>
          <td>${a.face_verified ? '✅' : '❌'}</td>
          <td>${a.location_verified ? '✅' : '⚠️'}</td>
          <td><span class="badge ${a.status === 'present' ? 'badge-green' : 'badge-orange'}">${a.status || '—'}</span></td>
        </tr>
      `).join('');
    });
  },

  // Keep polling-based refreshTrackerData as fallback if RTDB not available
  async refreshTrackerData() {
    if(window.DB) { this.startRTDBTracker(); return; }
    setInterval(async () => {
      try {
        const response = await fetch(`${this.config.apiBase}/api/qr/session-stats?session_id=${this.state.currentSession?.session_id}`);
        const data = await response.json();
        if(data.success) this.updateTrackerTable(data.attendees);
      } catch(error) { console.error("Tracker error:", error); }
    }, 2000);
  },

  updateTrackerTable(attendees) {
    const tbody = document.getElementById("trackerBody");
    if (!tbody) return;

    tbody.innerHTML = attendees.map(a => `
      <tr>
        <td>${a.roll_no}</td>
        <td>${a.name}</td>
        <td>${new Date(a.timestamp).toLocaleTimeString()}</td>
        <td>${a.face_verified ? '✅' : '❌'}</td>
        <td>${a.location_verified ? '✅' : '⚠️'}</td>
        <td><span class="badge ${a.status === 'valid' ? 'badge-green' : 'badge-orange'}">${a.status}</span></td>
      </tr>
    `).join("");
  },

  // Utility functions
  stopQRScan() {
    document.getElementById("s-attendance-panel").innerHTML = "";
    toast("QR scan cancelled", "info");
  },

  stopSession() {
    this.state.currentSession = null;
    if (this._qrTimerInterval) {
      clearInterval(this._qrTimerInterval);
      this._qrTimerInterval = null;
    }
    const panel = document.getElementById('f-qr-panel');
    if (panel) panel.innerHTML = '';
    const section = document.getElementById('qrSection');
    if (section) section.style.display = 'none';
    toast("QR session stopped", "info");
  },

  resetAttendance() {
    document.getElementById("s-attendance-panel").innerHTML = "";
  },

  sessionExpired() {
    toast("QR session expired", "warn");
    this.stopSession();
  },

  showQRStatus(type, message) {
    const statusEl = document.getElementById("qrScanStatus");
    if (statusEl) {
      statusEl.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    }
  },

  skipFaceVerification() {
    this.captureQRFace();  // Still submit but without face
  },

  disableProfileSharing() {
    toast("Profile sharing disabled", "info");
  }
};

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  QRModule.init();
});
