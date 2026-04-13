/**
 * SmartAMS — QR Attendance Integration Module
 * Adds QR attendance navigation and page handling to main app.js
 */

// Add this to the moduleConfig in app.js to enable QR attendance modules
const QRAttendanceIntegration = {
  
  // Get navigation items for QR attendance based on user role
  getQRNavItems(role) {
    const navItems = [];
    
    if (role === 'student') {
      navItems.push({
        icon: '📱',
        label: 'Scan QR (Attendance)',
        module: 'qr-scanner',
        description: 'Scan QR code to mark attendance'
      });
    }
    
    if (role === 'faculty') {
      navItems.push({
        icon: '📊',
        label: 'Generate QR',
        module: 'qr-generator',
        description: 'Generate QR code for your class'
      });
      navItems.push({
        icon: '✓',
        label: 'Attendance Records',
        module: 'attendance-records',
        description: 'View your class attendance'
      });
    }
    
    if (role === 'admin') {
      navItems.push({
        icon: '📋',
        label: 'Attendance Dashboard',
        module: 'admin-dashboard',
        description: 'Manage all attendance records'
      });
      navItems.push({
        icon: '⚙️',
        label: 'QR Settings',
        module: 'qr-settings',
        description: 'Configure QR system'
      });
    }
    
    return navItems;
  },
  
  // Initialize QR modules
  async initQRModule(module) {
    console.log('[QR-Integration] Initializing module:', module);
    
    switch (module) {
      case 'qr-scanner':
        return await this.initQRScanner();
      case 'qr-generator':
        return await this.initQRGenerator();
      case 'admin-dashboard':
        return await this.initAdminDashboard();
      case 'attendance-records':
        return await this.initAttendanceRecords();
      case 'qr-settings':
        return await this.initQRSettings();
      default:
        console.warn('[QR-Integration] Unknown module:', module);
        return false;
    }
  },
  
  async initQRScanner() {
    const container = document.getElementById('qrScannerContainer');
    if (!container) {
      console.error('[QR-Integration] QR Scanner container not found');
      return false;
    }
    
    try {
      return await QRAttendance.studentScanner.init('qrScannerContainer');
    } catch (error) {
      console.error('[QR-Integration] Error initializing QR Scanner:', error);
      return false;
    }
  },
  
  async initQRGenerator() {
    const container = document.getElementById('qrGeneratorContainer');
    if (!container) {
      console.error('[QR-Integration] QR Generator container not found');
      return false;
    }
    
    try {
      return await QRAttendance.teacherGenerator.init('qrGeneratorContainer');
    } catch (error) {
      console.error('[QR-Integration] Error initializing QR Generator:', error);
      return false;
    }
  },
  
  async initAdminDashboard() {
    const container = document.getElementById('adminDashboardContainer');
    if (!container) {
      console.error('[QR-Integration] Admin Dashboard container not found');
      return false;
    }
    
    try {
      return await QRAttendance.adminDashboard.init('adminDashboardContainer');
    } catch (error) {
      console.error('[QR-Integration] Error initializing Admin Dashboard:', error);
      return false;
    }
  },
  
  async initAttendanceRecords() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) {
      console.error('[QR-Integration] Main content container not found');
      return false;
    }
    
    // Show attendance for teacher's classes
    mainContent.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">📊 My Attendance Records</div>
        </div>
        <div style="padding: 1.25rem;">
          <div class="form-row" style="margin-bottom: 1.5rem;">
            <div class="form-group">
              <label>Date</label>
              <input type="date" id="att-filter-date" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label>Course/Subject</label>
              <input type="text" id="att-filter-course" placeholder="Filter by course...">
            </div>
            <div style="align-self: flex-end;">
              <button class="btn btn-primary" onclick="loadTeacherAttendance()">🔍 Load Records</button>
            </div>
          </div>
          <div id="attendance-records-table" class="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Roll No</th>
                  <th>Name</th>
                  <th>Time In</th>
                  <th>Status</th>
                  <th>Verified</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody id="attendance-tbody">
                <tr><td colspan="6" style="text-align: center; padding: 2rem;">Click "Load Records" to view attendance</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    return true;
  },
  
  async initQRSettings() {
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) {
      console.error('[QR-Integration] Main content container not found');
      return false;
    }
    
    // Admin QR settings
    mainContent.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">⚙️ QR Attendance Settings</div>
        </div>
        <div style="padding: 1.25rem;">
          <div class="form-row">
            <div class="form-group">
              <label>College Latitude</label>
              <input type="number" id="col-lat" step="0.0001" placeholder="13.145615" value="13.145615">
            </div>
            <div class="form-group">
              <label>College Longitude</label>
              <input type="number" id="col-lng" step="0.0001" placeholder="77.574597" value="77.574597">
            </div>
            <div class="form-group">
              <label>Campus Radius (km)</label>
              <input type="number" id="col-radius" step="0.01" placeholder="0.2" value="0.2">
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>Default QR Validity (minutes)</label>
              <input type="number" id="qr-validity" min="1" max="120" value="5">
            </div>
            <div class="form-group">
              <label>Face Recognition Tolerance</label>
              <input type="number" id="face-tolerance" step="0.01" min="0.3" max="0.7" value="0.45">
            </div>
            <div class="form-group">
              <label>Max Verification Attempts</label>
              <input type="number" id="max-attempts" min="1" max="5" value="2">
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group" style="grid-column: 1 / -1;">
              <label>
                <input type="checkbox" id="enable-face-rec" checked> Enable Face Recognition
              </label>
            </div>
          </div>
          
          <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
            <button class="btn btn-primary" onclick="saveQRSettings()">💾 Save Settings</button>
            <button class="btn btn-outline" onclick="resetQRSettings()">↺ Reset to Defaults</button>
          </div>
        </div>
      </div>
    `;
    
    return true;
  },
  
  // Helper to show QR page
  showQRPage(pageId) {
    // Hide all pages
    const loginPageEl = document.getElementById('loginPage');
    if (loginPageEl) loginPageEl.style.display = 'none';
    
    const dashboardEl = document.getElementById('dashboard');
    if (dashboardEl) dashboardEl.style.display = 'none';
    
    const qrScannerEl = document.getElementById('qrScannerPage');
    if (qrScannerEl) qrScannerEl.style.display = 'none';
    
    const qrGeneratorEl = document.getElementById('qrGeneratorPage');
    if (qrGeneratorEl) qrGeneratorEl.style.display = 'none';
    
    const adminDashboardEl = document.getElementById('adminDashboardPage');
    if (adminDashboardEl) adminDashboardEl.style.display = 'none';
    
    // Show selected page
    const page = document.getElementById(pageId);
    if (page) {
      page.style.display = 'flex';
    }
  },
  
  // Helper to show dashboard
  showDashboard() {
    const loginPageEl = document.getElementById('loginPage');
    if (loginPageEl) loginPageEl.style.display = 'none';
    
    const qrScannerEl = document.getElementById('qrScannerPage');
    if (qrScannerEl) qrScannerEl.style.display = 'none';
    
    const qrGeneratorEl = document.getElementById('qrGeneratorPage');
    if (qrGeneratorEl) qrGeneratorEl.style.display = 'none';
    
    const adminDashboardEl = document.getElementById('adminDashboardPage');
    if (adminDashboardEl) adminDashboardEl.style.display = 'none';
    
    const dashboardEl = document.getElementById('dashboard');
    if (dashboardEl) dashboardEl.style.display = 'flex';
  }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QRAttendanceIntegration;
}
