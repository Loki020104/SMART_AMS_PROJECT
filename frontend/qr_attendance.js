/**
 * SmartAMS QR Attendance System
 * Dynamic QR generation, scanning, validation, and real-time attendance tracking
 */

const QRAttendance = {
  // ─────────────────────────────────────────────────────────
  // STUDENT QR SCANNER MODULE
  // ─────────────────────────────────────────────────────────
  
  studentScanner: {
    videoElement: null,
    canvasElement: null,
    context: null,
    scanning: false,
    currentQRData: null,
    
    async init(containerId) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error(`[QR-Scanner] Container not found: ${containerId}`);
        return false;
      }
      
      // Create HTML structure
      container.innerHTML = `
        <div class="qr-scanner-wrapper">
          <div class="qr-scanner-header">
            <h2>📱 Scan QR Code</h2>
            <p>Point your camera at the QR code provided by your teacher</p>
          </div>
          
          <div class="qr-scanner-container">
            <video id="qr-video" autoplay playsinline></video>
            <canvas id="qr-canvas" style="display:none;"></canvas>
            <div id="qr-scanner-overlay" class="scanner-overlay">
              <div class="scanner-box"></div>
            </div>
          </div>
          
          <div class="qr-scanner-info">
            <div id="qr-status" class="status-badge status-waiting">
              <span class="status-icon">⏳</span>
              <span class="status-text">Waiting for QR code...</span>
            </div>
          </div>
          
          <div class="qr-attendance-form" style="display:none;" id="qr-attendance-form">
            <h3>Verification Required</h3>
            
            <div class="form-section">
              <label>📝 Full Name *</label>
              <input type="text" id="student-name" placeholder="Your full name" readonly>
            </div>
            
            <div class="form-section">
              <label>🆔 Roll Number *</label>
              <input type="text" id="student-roll" placeholder="Your roll number" readonly>
            </div>
            
            <div class="form-section">
              <label>📍 Location Verification</label>
              <button type="button" id="get-location-btn" class="btn-secondary">
                📍 Get Location
              </button>
              <div id="location-status" class="location-status"></div>
            </div>
            
            <div class="form-section">
              <label>📸 Face Recognition</label>
              <button type="button" id="capture-face-btn" class="btn-secondary">
                📷 Capture Face
              </button>
              <canvas id="face-canvas" style="display:none;"></canvas>
              <img id="face-preview" style="display:none; max-width:100%; border-radius: 8px;">
              <div id="face-status" class="face-status"></div>
            </div>
            
            <div class="form-actions">
              <button type="button" id="submit-attendance-btn" class="btn-primary" disabled>
                ✅ Mark Attendance
              </button>
              <button type="button" id="cancel-attendance-btn" class="btn-secondary">
                ❌ Cancel
              </button>
            </div>
            
            <div id="attendance-result" class="attendance-result" style="display:none;"></div>
          </div>
        </div>
      `;
      
      this.videoElement = document.getElementById('qr-video');
      this.canvasElement = document.getElementById('qr-canvas');
      this.context = this.canvasElement?.getContext('2d');
      
      // Request camera access
      if (!await this.requestCameraAccess()) {
        this.showStatus('❌ Camera access denied', 'error');
        return false;
      }
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Start scanning
      this.startScanning();
      
      return true;
    },
    
    async requestCameraAccess() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        this.videoElement.srcObject = stream;
        return new Promise((resolve) => {
          this.videoElement.onloadedmetadata = () => {
            resolve(true);
          };
        });
      } catch (error) {
        console.error('[QR-Scanner] Camera error:', error);
        return false;
      }
    },
    
    setupEventListeners() {
      document.getElementById('get-location-btn')?.addEventListener('click', () => this.verifyLocation());
      document.getElementById('capture-face-btn')?.addEventListener('click', () => this.captureFace());
      document.getElementById('submit-attendance-btn')?.addEventListener('click', () => this.submitAttendance());
      document.getElementById('cancel-attendance-btn')?.addEventListener('click', () => this.resetForm());
    },
    
    startScanning() {
      this.scanning = true;
      this.scanFrame();
    },
    
    scanFrame() {
      if (!this.scanning) return;
      
      if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
        this.context.drawImage(this.videoElement, 0, 0);
        
        const imageData = this.context.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code && code.data !== this.currentQRData) {
          this.currentQRData = code.data;
          this.handleQRScan(code.data);
        }
      }
      
      requestAnimationFrame(() => this.scanFrame());
    },
    
    async handleQRScan(qrData) {
      try {
        console.log('[QR-Scanner] QR Code detected:', qrData);
        this.showStatus('✅ QR Code scanned successfully!', 'success');
        
        // Parse QR data (should contain session_id or teacher_id+course info)
        const sessionData = JSON.parse(qrData);
        
        if (!sessionData.session_id && !sessionData.teacher_id) {
          this.showStatus('❌ Invalid QR code format', 'error');
          return;
        }
        
        // Stop scanning while showing form
        this.scanning = false;
        
        // Store session data
        this.sessionData = sessionData;
        
        // Show attendance form  
        this.showAttendanceForm(sessionData);
        
      } catch (error) {
        console.error('[QR-Scanner] Error handling QR data:', error);
        this.showStatus('❌ Invalid QR code data', 'error');
      }
    },
    
    showAttendanceForm(sessionData) {
      const form = document.getElementById('qr-attendance-form');
      if (!form) return;
      
      // Pre-fill known data
      const student = AMS.user;
      document.getElementById('student-name').value = student.name || '';
      document.getElementById('student-roll').value = student.roll_no || AMS.profile.roll_no || '';
      
      // Store session info
      this.sessionData = sessionData;
      
      // Reset form fields
      document.getElementById('location-status').innerHTML = '';
      document.getElementById('face-status').innerHTML = '';
      document.getElementById('face-preview').style.display = 'none';
      document.getElementById('attendance-result').style.display = 'none';
      document.getElementById('submit-attendance-btn').disabled = true;
      
      // Hide scanner, show form
      document.querySelector('.qr-scanner-container').style.display = 'none';
      form.style.display = 'block';
    },
    
    async verifyLocation() {
      const statusDiv = document.getElementById('location-status');
      statusDiv.innerHTML = '⏳ Getting location...';
      
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            enableHighAccuracy: true
          });
        });
        
        const { latitude, longitude, accuracy } = position.coords;
        this.locationData = { latitude, longitude, accuracy };
        
        // Check if within campus (hardcoded for now, should be configurable)
        const collegeCoords = AMS.college || { lat: 13.145615, lng: 77.574597, radiusKm: 0.2 };
        const distance = this.calculateDistance(collegeCoords.lat, collegeCoords.lng, latitude, longitude);
        const inCampus = distance <= collegeCoords.radiusKm;
        
        const statusClass = inCampus ? 'success' : 'warning';
        const message = inCampus 
          ? `✅ Location verified (${distance.toFixed(3)} km from campus)`
          : `⚠️ Outside campus (${distance.toFixed(3)} km away)`;
        
        statusDiv.innerHTML = `<span class="status-${statusClass}">${message}</span>`;
        statusDiv.classList.add(`status-${statusClass}`);
        
        this.checkAllVerifications();
        
      } catch (error) {
        console.error('[QR-Scanner] Location error:', error);
        statusDiv.innerHTML = '<span class="status-error">❌ Location access denied</span>';
        statusDiv.classList.add('status-error');
      }
    },
    
    calculateDistance(lat1, lng1, lat2, lng2) {
      // Haversine formula in kilometers
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },
    
    async captureFace() {
      const statusDiv = document.getElementById('face-status');
      statusDiv.innerHTML = '⏳ Starting camera...';
      
      try {
        const canvas = document.getElementById('face-canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.videoElement, 0, 0);
        
        this.faceImageData = canvas.toDataURL('image/jpeg', 0.9);
        
        // Show preview
        const preview = document.getElementById('face-preview');
        preview.src = this.faceImageData;
        preview.style.display = 'block';
        
        statusDiv.innerHTML = '✅ Face captured successfully';
        statusDiv.classList.add('status-success');
        
        this.checkAllVerifications();
        
      } catch (error) {
        console.error('[QR-Scanner] Face capture error:', error);
        statusDiv.innerHTML = '❌ Failed to capture face';
        statusDiv.classList.add('status-error');
      }
    },
    
    checkAllVerifications() {
      const locationStatus = document.getElementById('location-status').innerHTML;
      const facepreview = document.getElementById('face-preview').style.display;
      
      const hasLocation = locationStatus.includes('✅') || locationStatus.includes('⚠️');
      const hasFace = facepreview !== 'none';
      
      // Enable submit if at least location or face is done
      document.getElementById('submit-attendance-btn').disabled = !(hasLocation || hasFace);
    },
    
    async submitAttendance() {
      const resultDiv = document.getElementById('attendance-result');
      const submitBtn = document.getElementById('submit-attendance-btn');
      
      submitBtn.disabled = true;
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = '⏳ Processing attendance...';
      
      try {
        const payload = {
          roll_no: document.getElementById('student-roll').value,
          name: document.getElementById('student-name').value,
          session_id: this.sessionData?.session_id,
          teacher_id: this.sessionData?.teacher_id,
          course_id: this.sessionData?.course_id,
          subject: this.sessionData?.subject,
          latitude: this.locationData?.latitude,
          longitude: this.locationData?.longitude,
          face_image: this.faceImageData,
          timestamp: new Date().toISOString()
        };
        
        const response = await fetch('/api/qr/mark-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.verified || result.success) {
          resultDiv.innerHTML = `
            <div class="result-success">
              <h3>✅ Attendance Marked!</h3>
              <p><strong>Name:</strong> ${result.name || payload.name}</p>
              <p><strong>Roll No:</strong> ${payload.roll_no}</p>
              <p><strong>Status:</strong> ${result.verified ? 'Present (Face Verified)' : 'Present (QR Verified)'}</p>
              ${result.confidence ? `<p><strong>Confidence:</strong> ${(result.confidence * 100).toFixed(0)}%</p>` : ''}
              <p class="success-message">You are marked present. Thank you!</p>
            </div>
          `;
          resultDiv.classList.add('success');
          
          // Auto-close after 3 seconds
          setTimeout(() => this.resetForm(), 3000);
        } else {
          resultDiv.innerHTML = `
            <div class="result-error">
              <h3>❌ Attendance Not Marked</h3>
              <p>${result.error || 'Unable to verify attendance'}</p>
              <p class="error-message">${result.message || 'Please contact your faculty if this is a mistake.'}</p>
            </div>
          `;
          resultDiv.classList.add('error');
          submitBtn.disabled = false;
        }
        
      } catch (error) {
        console.error('[QR-Attendance] Submit error:', error);
        resultDiv.innerHTML = `
          <div class="result-error">
            <h3>❌ Error</h3>
            <p>Failed to submit attendance: ${error.message}</p>
          </div>
        `;
        resultDiv.classList.add('error');
        submitBtn.disabled = false;
      }
    },
    
    resetForm() {
      this.currentQRData = null;
      this.faceImageData = null;
      this.locationData = null;
      this.sessionData = null;
      
      document.querySelector('.qr-scanner-container').style.display = 'block';
      document.getElementById('qr-attendance-form').style.display = 'none';
      
      this.showStatus('Waiting for QR code...', 'waiting');
      this.scanning = true;
      this.scanFrame();
    },
    
    showStatus(message, type) {
      const statusEl = document.getElementById('qr-status');
      if (!statusEl) return;
      
      const icons = {
        waiting: '⏳',
        success: '✅',
        error: '❌',
        warning: '⚠️'
      };
      
      statusEl.className = `status-badge status-${type}`;
      statusEl.innerHTML = `
        <span class="status-icon">${icons[type] || '•'}</span>
        <span class="status-text">${message}</span>
      `;
    }
  },
  
  // ─────────────────────────────────────────────────────────
  // TEACHER QR GENERATION MODULE
  // ─────────────────────────────────────────────────────────
  
  teacherGenerator: {
    activeSession: null,
    qrTimer: null,
    
    async init(containerId) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error(`[QR-Generator] Container not found: ${containerId}`);
        return false;
      }
      
      container.innerHTML = `
        <div class="qr-generator-wrapper">
          <div class="qr-generator-header">
            <h2>📊 Generate QR Code for Attendance</h2>
            <p>Create a dynamic QR code for your class session</p>
          </div>
          
          <div class="qr-config-section">
            <h3>Session Configuration</h3>
            
            <div class="form-grid">
              <div class="form-section">
                <label>👥 Course/Subject *</label>
                <input type="text" id="course-name" placeholder="e.g., Data Structures" required>
              </div>
              
              <div class="form-section">
                <label>🏫 Section *</label>
                <select id="course-section" required>
                  <option value="">Select Section</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>
              
              <div class="form-section">
                <label>⏱️ QR Validity (minutes) *</label>
                <input type="number" id="validity-minutes" min="1" max="120" value="5" required>
              </div>
              
              <div class="form-section">
                <label>📝 Session Notes</label>
                <input type="text" id="session-notes" placeholder="Optional notes (e.g., Topic name)">
              </div>
            </div>
            
            <div class="form-actions">
              <button type="button" id="generate-qr-btn" class="btn-primary">
                🔧 Generate QR Code
              </button>
            </div>
          </div>
          
          <div class="qr-display-section" style="display:none;" id="qr-display-section">
            <h3>Active Session QR Code</h3>
            
            <div class="qr-display">
              <div id="qr-code-container" style="text-align: center; padding: 2rem;"></div>
              <p id="qr-session-info" style="text-align: center; margin-top: 1rem; color: var(--text2);"></p>
            </div>
            
            <div class="qr-stats">
              <h4>Session Statistics</h4>
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-value" id="scans-count">0</div>
                  <div class="stat-label">QR Scans</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value" id="verified-count">0</div>
                  <div class="stat-label">Verified</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value" id="time-remaining">--:--</div>
                  <div class="stat-label">Time Left</div>
                </div>
              </div>
            </div>
            
            <div class="form-actions">
              <button type="button" id="end-session-btn" class="btn-danger">
                🛑 End Session
              </button>
              <button type="button" id="refresh-qr-btn" class="btn-secondary">
                🔄 Refresh QR
              </button>
            </div>
            
            <div id="attendance-live-list" class="attendance-live-list">
              <h4>Live Attendance</h4>
              <div id="attendees" class="attendees-list"></div>
            </div>
          </div>
        </div>
      `;
      
      this.setupEventListeners();
      this.loadTeacherData();
      
      return true;
    },
    
    setupEventListeners() {
      document.getElementById('generate-qr-btn')?.addEventListener('click', () => this.generateQR());
      document.getElementById('end-session-btn')?.addEventListener('click', () => this.endSession());
      document.getElementById('refresh-qr-btn')?.addEventListener('click', () => this.generateQR());
    },
    
    async loadTeacherData() {
      const teacher = AMS.user;
      console.log('[QR-Generator] Teacher data:', teacher);
    },
    
    async generateQR() {
      const courseName = document.getElementById('course-name').value;
      const section = document.getElementById('course-section').value;
      const validity = parseInt(document.getElementById('validity-minutes').value);
      const notes = document.getElementById('session-notes').value;
      
      if (!courseName || !section) {
        alert('Please fill in required fields');
        return;
      }
      
      try {
        // Generate session ID
        const sessionId = `QR_${AMS.user.id}_${Date.now()}`;
        const expiryTime = Date.now() + validity * 60 * 1000;
        
        const sessionData = {
          session_id: sessionId,
          teacher_id: AMS.user.id,
          teacher_name: AMS.user.name,
          course_name: courseName,
          section: section,
          notes: notes,
          validity_minutes: validity,
          created_at: new Date().toISOString(),
          expires_at: new Date(expiryTime).toISOString(),
          require_face: true,
          require_location: true
        };
        
        // Generate QR code
        const qrDataString = JSON.stringify(sessionData);
        
        // Save to backend and get confirmation
        const response = await fetch('/api/qr/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionData)
        });
        
        const result = await response.json();
        
        if (!result.success && !result.session_id) {
          alert('Failed to generate QR: ' + (result.error || 'Unknown error'));
          return;
        }
        
        // Update session ID if from backend
        if (result.session_id) {
          sessionData.session_id = result.session_id;
        }
        
        this.activeSession = sessionData;
        this.displayQR(qrDataString, sessionData, validity);
        
      } catch (error) {
        console.error('[QR-Generator] Error:', error);
        alert('Error generating QR code: ' + error.message);
      }
    },
    
    displayQR(qrData, sessionData, validityMinutes) {
      // Hide config, show QR display
      document.querySelector('.qr-config-section').style.display = 'none';
      document.getElementById('qr-display-section').style.display = 'block';
      
      // Generate QR code using library
      const container = document.getElementById('qr-code-container');
      container.innerHTML = '';
      
      new QRCode(container, {
        text: qrData,
        width: 300,
        height: 300,
        colorDark: '#0d1117',
        colorLight: '#ffffff'
      });
      
      // Update session info
      document.getElementById('qr-session-info').textContent = 
        `${sessionData.course_name} - ${sessionData.section} | Valid for ${validityMinutes} minutes`;
      
      // Start countdown timer
      this.startCountdown(validityMinutes);
      
      // Start polling for attendance updates
      this.pollAttendanceUpdates(sessionData.session_id);
    },
    
    startCountdown(minutes) {
      let timeLeft = minutes * 60; // in seconds
      
      const updateTimer = () => {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        document.getElementById('time-remaining').textContent = 
          `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
          this.endSession(true);
          return;
        }
        
        timeLeft--;
        this.qrTimer = setTimeout(updateTimer, 1000);
      };
      
      updateTimer();
    },
    
    async pollAttendanceUpdates(sessionId) {
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/attendance?session_id=${sessionId}`);
          const data = await response.json();
          
          if (data.records && Array.isArray(data.records)) {
            this.updateAttendanceList(data.records);
            
            // Update counts
            const verified = data.records.filter(r => r.verified).length;
            const total = data.records.length;
            
            document.getElementById('scans-count').textContent = total;
            document.getElementById('verified-count').textContent = verified;
          }
        } catch (error) {
          console.error('[QR-Generator] Poll error:', error);
        }
      }, 2000); // Poll every 2 seconds
      
      // Store interval ID for cleanup
      this.pollInterval = pollInterval;
    },
    
    updateAttendanceList(records) {
      const attendeesList = document.getElementById('attendees');
      if (!attendeesList) return;
      
      const html = records.map(record => `
        <div class="attendee-item ${record.verified ? 'verified' : 'unverified'}">
          <div class="attendee-name">${record.name}</div>
          <div class="attendee-roll">${record.roll_no}</div>
          <div class="attendee-status">
            ${record.verified ? '✅ Face Verified' : '⏳ Pending'}
          </div>
          <div class="attendee-time">${new Date(record.timestamp).toLocaleTimeString()}</div>
        </div>
      `).join('');
      
      attendeesList.innerHTML = html;
    },
    
    async endSession(autoEnd = false) {
      if (this.qrTimer) clearTimeout(this.qrTimer);
      if (this.pollInterval) clearInterval(this.pollInterval);
      
      // Save final report
      if (this.activeSession) {
        try {
          // Optional: Save session summary
          console.log('[QR-Generator] Session ended:', this.activeSession.session_id);
        } catch (error) {
          console.error('[QR-Generator] Error ending session:', error);
        }
      }
      
      this.activeSession = null;
      document.querySelector('.qr-config-section').style.display = 'block';
      document.getElementById('qr-display-section').style.display = 'none';
      
      if (autoEnd) {
        alert('QR code validity expired. Session ended automatically.');
      }
    }
  },
  
  // ─────────────────────────────────────────────────────────
  // ADMIN ATTENDANCE MANAGEMENT MODULE
  // ─────────────────────────────────────────────────────────
  
  adminDashboard: {
    async init(containerId) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error(`[QR-Admin] Container not found: ${containerId}`);
        return false;
      }
      
      container.innerHTML = `
        <div class="qr-admin-wrapper">
          <div class="admin-header">
            <h2>📊 Attendance Management Dashboard</h2>
            <p>View, edit, and manage attendance records</p>
          </div>
          
          <div class="admin-filters">
            <h3>Filter Records</h3>
            <div class="filter-grid">
              <div class="filter-section">
                <label>📅 Date</label>
                <input type="date" id="filter-date" value="${new Date().toISOString().split('T')[0]}">
              </div>
              
              <div class="filter-section">
                <label>👥 Department</label>
                <select id="filter-department">
                  <option value="">All Departments</option>
                  <option value="CSE">Computer Science</option>
                  <option value="ECE">Electronics</option>
                  <option value="MECH">Mechanical</option>
                  <option value="CIVIL">Civil</option>
                </select>
              </div>
              
              <div class="filter-section">
                <label>🏫 Section</label>
                <select id="filter-section">
                  <option value="">All Sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>
              
              <div class="filter-section">
                <label>👤 Name/Roll No</label>
                <input type="text" id="filter-search" placeholder="Search...">
              </div>
            </div>
            
            <div class="filter-actions">
              <button type="button" id="apply-filters-btn" class="btn-primary">
                🔍 Apply Filters
              </button>
              <button type="button" id="reset-filters-btn" class="btn-secondary">
                🔄 Reset
              </button>
            </div>
          </div>
          
          <div class="admin-stats">
            <h3>Statistics</h3>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value" id="total-students">0</div>
                <div class="stat-label">Total Students</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="present-count">0</div>
                <div class="stat-label">Present</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="absent-count">0</div>
                <div class="stat-label">Absent</div>
              </div>
              <div class="stat-card">
                <div class="stat-value" id="attendance-percent">0%</div>
                <div class="stat-label">Attendance %</div>
              </div>
            </div>
          </div>
          
          <div class="admin-records">
            <h3>Attendance Records</h3>
            <div class="table-wrapper">
              <table class="attendance-table">
                <thead>
                  <tr>
                    <th>Roll No</th>
                    <th>Name</th>
                    <th>Section</th>
                    <th>Time In</th>
                    <th>Status</th>
                    <th>Verified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="attendance-tbody">
                  <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem;">
                      Click "Apply Filters" to load attendance data
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div class="admin-bulk-actions">
            <h3>Bulk Actions</h3>
            <div class="bulk-actions">
              <button type="button" id="mark-all-absent-btn" class="btn-secondary">
                Mark Missing as Absent
              </button>
              <button type="button" id="export-csv-btn" class="btn-secondary">
                📥 Export to CSV
              </button>
              <button type="button" id="send-report-btn" class="btn-secondary">
                📧 Send Report
              </button>
            </div>
          </div>
        </div>
      `;
      
      this.setupEventListeners();
      this.loadInitialData();
      
      return true;
    },
    
    setupEventListeners() {
      document.getElementById('apply-filters-btn')?.addEventListener('click', () => this.applyFilters());
      document.getElementById('reset-filters-btn')?.addEventListener('click', () => this.resetFilters());
      document.getElementById('mark-all-absent-btn')?.addEventListener('click', () => this.markAllAbsent());
      document.getElementById('export-csv-btn')?.addEventListener('click', () => this.exportCSV());
    },
    
    async loadInitialData() {
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('filter-date').value = today;
    },
    
    async applyFilters() {
      const date = document.getElementById('filter-date').value;
      const department = document.getElementById('filter-department').value;
      const section = document.getElementById('filter-section').value;
      const search = document.getElementById('filter-search').value;
      
      try {
        let url = `/api/attendance?date=${date}`;
        if (department) url += `&department=${department}`;
        if (section) url += `&section=${section}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        let records = data.records || [];
        
        // Apply client-side search filter
        if (search) {
          records = records.filter(r =>
            (r.name && r.name.toLowerCase().includes(search.toLowerCase())) ||
            (r.roll_no && r.roll_no.toLowerCase().includes(search.toLowerCase()))
          );
        }
        
        // Get all students for this section to identify absentees
        const studentsUrl = `/api/registered-students?section=${section || ''}`;
        const studentsResp = await fetch(studentsUrl);
        const studentsData = await studentsResp.json();
        const allStudents = studentsData.students || [];
        
        // Calculate statistics
        const presentCount = records.filter(r => r.name).length;
        const absentCount = Math.max(0, allStudents.length - presentCount);
        const total = allStudents.length;
        const percentage = total > 0 ? ((presentCount / total) * 100).toFixed(1) : 0;
        
        // Update stats
        document.getElementById('total-students').textContent = total;
        document.getElementById('present-count').textContent = presentCount;
        document.getElementById('absent-count').textContent = absentCount;
        document.getElementById('attendance-percent').textContent = percentage + '%';
        
        // Display records
        this.displayAttendanceRecords(records, allStudents);
        
      } catch (error) {
        console.error('[QR-Admin] Filter error:', error);
        alert('Error loading attendance data: ' + error.message);
      }
    },
    
    displayAttendanceRecords(presentRecords, allStudents) {
      const tbody = document.getElementById('attendance-tbody');
      if (!tbody) return;
      
      // Create a map of present records for quick lookup
      const presentMap = {};
      presentRecords.forEach(r => {
        presentMap[r.roll_no] = r;
      });
      
      // Generate rows for all students
      const rows = allStudents.map(student => {
        const record = presentMap[student.roll_no];
        const status = record ? 'Present' : 'Absent';
        const verified = record?.verified ? '✅ Yes' : record ? '⏳ Pending' : '—';
        const timeIn = record?.timestamp ? new Date(record.timestamp).toLocaleTimeString() : '—';
        
        return `
          <tr class="attendance-row ${status.toLowerCase()}">
            <td>${student.roll_no}</td>
            <td>${student.name}</td>
            <td>${student.section}</td>
            <td>${timeIn}</td>
            <td>
              <select class="status-select" data-roll="${student.roll_no}" data-record-id="${record?.id || ''}">
                <option value="present" ${status === 'Present' ? 'selected' : ''}>✅ Present</option>
                <option value="absent" ${status === 'Absent' ? 'selected' : ''}>❌ Absent</option>
                <option value="leave">🏥 Leave</option>
              </select>
            </td>
            <td>${verified}</td>
            <td>
              <button class="btn-edit-small" data-roll="${student.roll_no}">Edit</button>
            </td>
          </tr>
        `;
      }).join('');
      
      tbody.innerHTML = rows;
      
      // Attach event listeners to status selects
      tbody.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', (e) => this.updateAttendanceRecord(e.target));
      });
      
      tbody.querySelectorAll('.btn-edit-small').forEach(btn => {
        btn.addEventListener('click', (e) => this.editRecord(e.target.dataset.roll));
      });
    },
    
    async updateAttendanceRecord(selectElement) {
      const roll = selectElement.dataset.roll;
      const status = selectElement.value;
      const recordId = selectElement.dataset.recordId;
      
      try {
        // Save to backend
        const response = await fetch(`/api/attendance/${recordId || roll}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, roll_no: roll })
        });
        
        if (response.ok) {
          console.log('[QR-Admin] Record updated:', roll, status);
        }
      } catch (error) {
        console.error('[QR-Admin] Update error:', error);
        alert('Failed to update record');
      }
    },
    
    editRecord(rollNo) {
      // Future: Open modal to edit individual record details
      console.log('[QR-Admin] Edit record:', rollNo);
    },
    
    async markAllAbsent() {
      if (!confirm('Mark all missing students as absent?')) return;
      
      const tbody = document.getElementById('attendance-tbody');
      const rows = tbody.querySelectorAll('tr.attendance-row.absent');
      
      let updated = 0;
      for (const row of rows) {
        const select = row.querySelector('.status-select');
        if (select && select.value !== 'present') {
          select.value = 'absent';
          await this.updateAttendanceRecord(select);
          updated++;
        }
      }
      
      alert(`${updated} students marked as absent`);
    },
    
    exportCSV() {
      const table = document.querySelector('.attendance-table');
      let csv = [];
      
      // Get headers
      const headers = [];
      table.querySelectorAll('thead th').forEach(th => {
        headers.push(th.textContent);
      });
      csv.push(headers.join(','));
      
      // Get rows
      table.querySelectorAll('tbody tr').forEach(row => {
        const cells = [];
        row.querySelectorAll('td').forEach((td, idx) => {
          // Skip action column
          if (idx < 6) {
            cells.push('"' + td.textContent.trim() + '"');
          }
        });
        csv.push(cells.join(','));
      });
      
      // Create download
      const csvContent = csv.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    },
    
    resetFilters() {
      document.getElementById('filter-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('filter-department').value = '';
      document.getElementById('filter-section').value = '';
      document.getElementById('filter-search').value = '';
      document.getElementById('attendance-tbody').innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Click "Apply Filters" to load attendance data</td></tr>';
    }
  }
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QRAttendance;
}
