/**
 * SmartAMS Attendance Management System
 * Handles QR scanning, data capture, and role-based attendance views
 */

const AttendanceManager = {
  // Configuration
  config: {
    get apiBase() {
      return (window.AMS_CONFIG && window.AMS_CONFIG.API_URL) || "https://smartams-backend-ts3a5sewfq-uc.a.run.app";
    }
  },

  // Current scanning session state
  scanState: {
    sessionId: null,
    subject: null,
    facultyId: null,
    courseId: null,
    isScanning: false,
    scannedData: null
  },

  // ═══════════════════════════════════════════════════════════
  // QR SCANNING - STUDENT MARKS ATTENDANCE
  // ═══════════════════════════════════════════════════════════

  async startQRAttendanceScan() {
    const roll_no = AMS.user.roll_no || AMS.user.rollNo;
    const name = AMS.user.full_name || AMS.user.name;

    if (!roll_no || !name) {
      toast('Student identification missing. Please logout and login again.', 'error');
      return;
    }

    const html = `
      <div class="attendance-scan-panel">
        <div class="card" style="max-width: 600px; margin: 0 auto;">
          <div class="card-header">
            <div class="card-title">📱 Scan Attendance QR Code</div>
          </div>

          <div class="form-section">
            <div class="info-box" style="margin-bottom: 1.5rem;">
              <div><strong>Student:</strong> ${name}</div>
              <div><strong>Roll No:</strong> ${roll_no}</div>
              <div style="margin-top: 0.5rem; font-size: 0.9rem; color: #666;">
                Position the QR code from your faculty member in the camera frame
              </div>
            </div>

            <!-- QR Scanner Video -->
            <div class="video-container" style="position: relative; margin-bottom: 1.5rem;">
              <video id="qr-scan-video" 
                autoplay 
                playsinline 
                style="width: 100%; max-width: 500px; border-radius: 8px; background: #000; display: block; margin: 0 auto;">
              </video>
              <canvas id="qr-scan-canvas" style="display: none;"></canvas>
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 200px; height: 200px; border: 3px solid #00CC00; border-radius: 8px; pointer-events: none;"></div>
              <div style="text-align: center; margin-top: 0.5rem; color: #666; font-size: 0.9rem;">
                <span id="qr-scan-status">Scanning...</span>
              </div>
            </div>

            <!-- Face Capture (shown after QR scan) -->
            <div id="face-capture-section" style="display: none; margin-bottom: 1.5rem;">
              <label style="font-weight: bold; display: block; margin-bottom: 0.5rem;">📸 Face Verification Required</label>
              <video id="face-capture-video" 
                autoplay 
                playsinline 
                style="width: 100%; max-width: 500px; border-radius: 8px; background: #000; display: block; margin: 0 auto;">
              </video>
              <button class="btn btn-primary w-full" style="margin-top: 1rem;" onclick="AttendanceManager.captureStudentFace()">
                📷 Capture Face
              </button>
            </div>

            <!-- Status Messages -->
            <div id="qr-status-message"></div>

            <!-- Buttons -->
            <div class="d-flex gap-md" style="margin-top: 1.5rem;">
              <button class="btn btn-danger flex-1" onclick="AttendanceManager.cancelQRScan()">Cancel</button>
              <button class="btn btn-outline flex-1" onclick="AttendanceManager.toggleCameraMode()" id="toggle-camera-btn" style="display: none;">
                Switch Camera
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    this.scanState.isScanning = true;
    this.initQRScanner();
  },

  async initQRScanner() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      const video = document.getElementById('qr-scan-video');
      if (video) {
        video.srcObject = stream;
        this.runQRScannerLoop();
      }
    } catch (error) {
      console.error('Camera error:', error);
      this.showQRStatusMessage('error', 'Camera access denied. Please allow camera access to scan QR code.');
    }
  },

  runQRScannerLoop() {
    if (!this.scanState.isScanning) return;

    const video = document.getElementById('qr-scan-video');
    const canvas = document.getElementById('qr-scan-canvas');

    if (!video || !canvas || !video.videoWidth) {
      requestAnimationFrame(() => this.runQRScannerLoop());
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Use jsQR library if available
      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data) {
          console.log('QR Code detected:', code.data);
          if (code.data.startsWith('AMSQR:')) {
            this.processScannedQRCode(code.data);
            return;
          }
        }
      }
    } catch (error) {
      console.error('QR detection error:', error);
    }

    // Continue scanning
    requestAnimationFrame(() => this.runQRScannerLoop());
  },

  async processScannedQRCode(qrData) {
    console.log('Processing QR data:', qrData);
    this.scanState.scannedData = qrData;

    try {
      // Validate QR with backend
      const validateRes = await fetch(`${this.config.apiBase}/api/qr/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_data: qrData,
          student_id: AMS.user.id,
          roll_no: AMS.user.roll_no || AMS.user.rollNo
        })
      });

      const validation = await validateRes.json();
      console.log('QR validation result:', validation);

      if (!validation.success) {
        this.showQRStatusMessage('error', validation.error || 'Invalid QR Code');
        this.scanState.isScanning = true;
        setTimeout(() => this.runQRScannerLoop(), 2000);
        return;
      }

      // QR is valid - extract session info
      this.scanState.sessionId = validation.session_id;
      this.scanState.subject = validation.subject;

      // Check if face verification is required
      if (validation.require_face) {
        this.showQRStatusMessage('success', 'QR Code valid! Now capture your face for verification...');
        document.getElementById('qr-scan-video').style.display = 'none';
        document.getElementById('face-capture-section').style.display = 'block';
        this.scanState.isScanning = false;
        this.initFaceCapture();
      } else {
        // Mark attendance without face
        await this.markAttendanceAfterQR(null);
      }
    } catch (error) {
      console.error('QR processing error:', error);
      this.showQRStatusMessage('error', 'Failed to process QR code. Please try again.');
      this.scanState.isScanning = true;
      setTimeout(() => this.runQRScannerLoop(), 2000);
    }
  },

  async initFaceCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });

      const video = document.getElementById('face-capture-video');
      if (video) {
        video.srcObject = stream;
      }
    } catch (error) {
      console.error('Face camera error:', error);
      this.showQRStatusMessage('error', 'Could not access face camera');
    }
  },

  async captureStudentFace() {
    try {
      const video = document.getElementById('face-capture-video');
      if (!video) return;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const faceImage = canvas.toDataURL('image/jpeg');

      // Get geolocation
      const location = await this.getStudentLocation();

      // Mark attendance
      await this.markAttendanceAfterQR(faceImage, location);
    } catch (error) {
      console.error('Face capture error:', error);
      toast('Failed to capture face', 'error');
    }
  },

  async getStudentLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: null, longitude: null, accuracy: null });
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
        (error) => {
          console.warn('Geolocation error:', error);
          resolve({ latitude: null, longitude: null, accuracy: null });
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  },

  async markAttendanceAfterQR(faceImage, location) {
    try {
      const roll_no = AMS.user.roll_no || AMS.user.rollNo;
      const name = AMS.user.full_name || AMS.user.name;

      const payload = {
        session_id: this.scanState.sessionId,
        student_id: AMS.user.id,
        roll_no: roll_no,
        name: name,
        face_image: faceImage || null,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        device_fingerprint: this.getDeviceFingerprint(),
        user_agent: navigator.userAgent
      };

      console.log('Marking attendance with payload:', payload);

      const response = await fetch(`${this.config.apiBase}/api/qr/mark-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log('Attendance mark response:', result);

      if (result.success) {
        this.showAttendanceSuccessUI(result);
      } else {
        this.showQRStatusMessage('error', result.error || result.message || 'Failed to mark attendance');
      }
    } catch (error) {
      console.error('Mark attendance error:', error);
      this.showQRStatusMessage('error', 'Error submitting attendance: ' + error.message);
    }
  },

  showAttendanceSuccessUI(result) {
    const locationStatus = result.location_verified ? 
      '<span style="color: green;">✓ Inside Campus</span>' : 
      '<span style="color: orange;">✗ Outside Campus</span>';

    const faceStatus = result.face_verified ? 
      '<span style="color: green;">✓ Verified</span>' : 
      '<span style="color: orange;">✗ Partial/Not Verified</span>';

    const html = `
      <div class="attendance-success-panel">
        <div class="card" style="max-width: 500px; margin: 0 auto; text-align: center;">
          <div class="card-header" style="background: #00CC00; color: white;">
            <div class="card-title" style="font-size: 1.5rem; margin: 0;">✅ Attendance Marked!</div>
          </div>

          <div style="padding: 2rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">✓</div>
            
            <div style="background: rgba(0,200,0,0.1); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem;">
              <div style="margin: 0.5rem 0;">
                <strong>Subject:</strong> ${result.subject || 'General'}
              </div>
              <div style="margin: 0.5rem 0;">
                <strong>Face Verification:</strong> ${faceStatus}
              </div>
              <div style="margin: 0.5rem 0;">
                <strong>Location:</strong> ${locationStatus}
              </div>
              <div style="margin: 0.5rem 0; font-size: 0.9rem; color: #666;">
                <strong>Time:</strong> ${new Date(result.timestamp).toLocaleTimeString()}
              </div>
            </div>

            <div style="font-size: 0.9rem; color: #666; margin-bottom: 1.5rem;">
              Your attendance has been recorded in the system.
            </div>

            <button class="btn btn-primary w-full" onclick="location.href='#s-attendance'">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    this.scanState.isScanning = false;
    toast('✅ Attendance marked successfully!', 'success');
  },

  showQRStatusMessage(type, message) {
    const messageEl = document.getElementById('qr-status-message');
    if (!messageEl) return;

    const bgColor = type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 200, 0, 0.1)';
    const borderColor = type === 'error' ? '#EF4444' : '#00CC00';
    const icon = type === 'error' ? '❌' : '✅';

    messageEl.innerHTML = `
      <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; padding: 1rem; margin-top: 1rem;">
        <strong>${icon} ${message}</strong>
      </div>
    `;
  },

  cancelQRScan() {
    this.scanState.isScanning = false;
    const video = document.getElementById('qr-scan-video');
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
    const faceVideo = document.getElementById('face-capture-video');
    if (faceVideo && faceVideo.srcObject) {
      faceVideo.srcObject.getTracks().forEach(track => track.stop());
    }
    document.getElementById('mainContent').innerHTML = '';
    toast('QR scan cancelled', 'info');
  },

  toggleCameraMode() {
    // Implementation for switching between rear and front camera
    // Note: Limited support on different devices
    this.cancelQRScan();
    this.startQRAttendanceScan();
  },

  getDeviceFingerprint() {
    const fingerprint = {
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`
    };
    return btoa(JSON.stringify(fingerprint)).substring(0, 32);
  },

  // ═══════════════════════════════════════════════════════════
  // ROLE-BASED ATTENDANCE VIEWS
  // ═══════════════════════════════════════════════════════════

  // FACULTY VIEW - Only their subject's students
  async loadFacultySubjectAttendance() {
    try {
      const facultyId = AMS.user.id || AMS.user.faculty_id;
      if (!facultyId) throw new Error("Faculty ID not found");
      
      const res = await fetch(
        `${this.config.apiBase}/api/attendance/faculty-subject?faculty_id=${facultyId}`,
        { headers: { "Authorization": `Bearer ${sessionStorage.token}` } }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load attendance');
      }

      const data = await res.json();
      const allRecords = data.records || [];
      
      // Filter to today's records on frontend
      const today = new Date().toISOString().split('T')[0];
      const todayRecords = allRecords.filter(r => 
        (r.date || (r.timestamp && r.timestamp.split('T')[0])) === today
      );
      
      console.log(`[ATT-MGR] Faculty loaded ${allRecords.length} total, ${todayRecords.length} for today`);
      return { all: allRecords, today: todayRecords, todayOnly: todayRecords };
    } catch (error) {
      console.error('Faculty attendance load error:', error);
      toast('Failed to load attendance records', 'error');
      return { all: [], today: [], todayOnly: [] };
    }
  },

  // ADMIN VIEW - With filters
  async loadAdminAttendanceFiltered(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.date) params.set('date', filters.date);
      if (filters.section) params.set('section', filters.section);
      if (filters.department) params.set('department', filters.department);
      if (filters.batch) params.set('batch', filters.batch);
      if (filters.roll_no) params.set('roll_no', filters.roll_no);

      const res = await fetch(
        `${this.config.apiBase}/api/attendance?${params}`
      );

      if (!res.ok) {
        throw new Error('Failed to load attendance');
      }

      const data = await res.json();
      return Array.isArray(data) ? data : (data.records || data.attendance || []);
    } catch (error) {
      console.error('Admin attendance load error:', error);
      toast('Failed to load attendance', 'error');
      return [];
    }
  },

  // Download attendance as CSV
  async downloadAttendanceCSV(records, filename = 'attendance.csv') {
    if (!records || records.length === 0) {
      toast('No records to download', 'warning');
      return;
    }

    const headers = [
      'Roll No',
      'Name',
      'Subject',
      'Batch',
      'Date',
      'Time',
      'Method',
      'Status',
      'Face Verified',
      'Location Verified',
      'Remarks'
    ];

    const rows = records.map(r => [
      r.roll_no || '',
      r.name || r.student_name || '',
      r.subject_name || r.subject || '',
      r.batch || '',
      r.date || '',
      r.timestamp || '',
      r.method || '—',
      (r.status || (r.verified === 'true' || r.verified === true ? 'present' : 'absent')),
      r.face_verified ? 'Yes' : 'No',
      r.location_verified ? 'Yes' : 'No',
      r.remarks || ''
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(cell => {
          // Escape cells containing commas or quotes
          const str = String(cell || '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      )
    ].join('\n');

    // Download as file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast(`Downloaded ${records.length} records`, 'success');
  },

  // Download as Excel (using simple CSV for now, can be enhanced)
  async downloadAttendanceExcel(records, filename = 'attendance.xlsx') {
    // For now, download as CSV. Can implement proper Excel export if needed
    this.downloadAttendanceCSV(records, filename.replace('.xlsx', '.csv'));
  }
};

// Make AttendanceManager globally available
window.AttendanceManager = AttendanceManager;
