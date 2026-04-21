/**
 * Analytics Module for Admin Dashboard
 * Displays Linways-like analytics with attendance tracking, reports, and insights
 */

class AnalyticsModule {
  constructor(db, auth) {
    this.db = db;
    this.auth = auth;
    this.analyticsData = null;
    this.selectedDepartment = null;
  }

  /**
   * Initialize analytics module and load data
   */
  async init() {
    try {
      await this.loadAnalyticsOverview();
      this.render();
    } catch (error) {
      console.error("[ANALYTICS] Init error:", error);
      toast("Failed to load analytics", "error");
    }
  }

  /**
   * Load analytics data from backend
   */
  async loadAnalyticsOverview() {
    try {
      const response = await fetch("/api/analytics/overview", {
        headers: { "Authorization": `Bearer ${await this.auth.currentUser?.getIdToken()}` }
      });
      
      if (!response.ok) throw new Error("Failed to load analytics");
      
      this.analyticsData = await response.json();
      return this.analyticsData;
    } catch (error) {
      console.error("[ANALYTICS] Load error:", error);
      throw error;
    }
  }

  /**
   * Load department-specific analytics
   */
  async loadDepartmentAnalytics(department) {
    try {
      const response = await fetch(`/api/analytics/department/${department}`, {
        headers: { "Authorization": `Bearer ${await this.auth.currentUser?.getIdToken()}` }
      });
      
      const data = await response.json();
      return data.data || {};
    } catch (error) {
      console.error("[ANALYTICS] Department load error:", error);
      return {};
    }
  }

  /**
   * Load at-risk students report
   */
  async loadAtRiskReport() {
    try {
      const response = await fetch("/api/analytics/at-risk-students", {
        headers: { "Authorization": `Bearer ${await this.auth.currentUser?.getIdToken()}` }
      });
      
      const data = await response.json();
      return data.data || {};
    } catch (error) {
      console.error("[ANALYTICS] At-risk load error:", error);
      return {};
    }
  }

  /**
   * Render the analytics module
   */
  render() {
    const container = document.getElementById("a-analytics-container");
    if (!container) return;

    const html = `
      <div class="analytics-module">
        <div class="analytics-header">
          <h1>📊 Analytics & Insights</h1>
          <div class="analytics-tabs">
            <button class="tab-btn active" onclick="analyticsUI.switchTab('overview')">Overview</button>
            <button class="tab-btn" onclick="analyticsUI.switchTab('departments')">Departments</button>
            <button class="tab-btn" onclick="analyticsUI.switchTab('at-risk')">At-Risk Students</button>
            <button class="tab-btn" onclick="analyticsUI.switchTab('system-info')">System Info</button>
          </div>
        </div>

        <!-- TAB 1: OVERVIEW -->
        <div id="tab-overview" class="analytics-tab active">
          ${this.renderOverview()}
        </div>

        <!-- TAB 2: DEPARTMENTS -->
        <div id="tab-departments" class="analytics-tab">
          ${this.renderDepartments()}
        </div>

        <!-- TAB 3: AT-RISK STUDENTS -->
        <div id="tab-at-risk" class="analytics-tab">
          ${this.renderAtRiskStudents()}
        </div>

        <!-- TAB 4: SYSTEM INFO -->
        <div id="tab-system-info" class="analytics-tab">
          ${this.renderSystemInfo()}
        </div>
      </div>

      <style>
        .analytics-module {
          background: white;
          border-radius: 10px;
          padding: 20px;
          margin: 10px 0;
        }

        .analytics-header {
          margin-bottom: 30px;
        }

        .analytics-header h1 {
          margin: 0 0 15px 0;
          font-size: 28px;
          color: #1f2937;
        }

        .analytics-tabs {
          display: flex;
          gap: 10px;
          border-bottom: 2px solid #e5e7eb;
          overflow-x: auto;
        }

        .tab-btn {
          padding: 12px 20px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          color: #6b7280;
          font-weight: 500;
          transition: all 0.3s;
        }

        .tab-btn:hover {
          color: #1f2937;
        }

        .tab-btn.active {
          color: #4f46e5;
          border-bottom-color: #4f46e5;
        }

        .analytics-tab {
          display: none;
          animation: fadeIn 0.3s ease-in;
        }

        .analytics-tab.active {
          display: block;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin: 20px 0;
        }

        .metric-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .metric-card.success {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        .metric-card.warning {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }

        .metric-card.danger {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        }

        .metric-card h3 {
          margin: 0 0 10px 0;
          font-size: 20px;
          opacity: 0.9;
        }

        .metric-card .value {
          font-size: 32px;
          font-weight: bold;
          margin-bottom: 5px;
        }

        .metric-card .label {
          font-size: 12px;
          opacity: 0.8;
        }

        .chart-container {
          background: #f9fafb;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }

        .chart-title {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 15px;
        }

        .insights-list {
          background: #f3f4f6;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }

        .insight-item {
          background: white;
          padding: 15px;
          margin-bottom: 10px;
          border-left: 4px solid #4f46e5;
          border-radius: 4px;
        }

        .insight-item.positive {
          border-left-color: #10b981;
        }

        .insight-item.warning {
          border-left-color: #f59e0b;
        }

        .insight-title {
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 5px;
        }

        .insight-desc {
          color: #6b7280;
          font-size: 14px;
        }

        .department-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }

        .department-table th {
          background: #f3f4f6;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #1f2937;
          border-bottom: 2px solid #e5e7eb;
        }

        .department-table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
        }

        .attendance-bar {
          height: 25px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .attendance-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #059669);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 12px;
          font-weight: bold;
        }

        .status-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-good {
          background: #d1fae5;
          color: #065f46;
        }

        .status-warning {
          background: #fef3c7;
          color: #92400e;
        }

        .status-critical {
          background: #fee2e2;
          color: #991b1b;
        }

        .export-btn {
          background: #4f46e5;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          margin: 20px 0;
          transition: all 0.3s;
        }

        .export-btn:hover {
          background: #4338ca;
        }

        .recommendations {
          background: #f0f9ff;
          border-left: 4px solid #4f46e5;
          padding: 20px;
          border-radius: 6px;
          margin: 20px 0;
        }

        .recommendations h4 {
          margin: 0 0 10px 0;
          color: #1f2937;
        }

        .recommendations ul {
          margin: 0;
          padding-left: 20px;
        }

        .recommendations li {
          color: #374151;
          margin-bottom: 8px;
        }
      </style>
    `;

    container.innerHTML = html;
  }

  /**
   * Render overview tab
   */
  renderOverview() {
    if (!this.analyticsData || this.analyticsData.error) {
      return `<p>Unable to load analytics data</p>`;
    }

    const summary = this.analyticsData.summary || {};
    const insights = this.analyticsData.insights || {};

    return `
      <div>
        <h2>Today's Attendance Summary</h2>
        <div class="metrics-grid">
          <div class="metric-card success">
            <h3>👥 Present</h3>
            <div class="value">${summary.today?.present || 0}</div>
            <div class="label">Students marked present today</div>
          </div>
          <div class="metric-card danger">
            <h3>❌ Absent</h3>
            <div class="value">${summary.today?.absent || 0}</div>
            <div class="label">Students marked absent today</div>
          </div>
          <div class="metric-card">
            <h3>📊 Attendance</h3>
            <div class="value">${summary.today?.percentage || 0}%</div>
            <div class="label">Overall attendance percentage</div>
          </div>
          <div class="metric-card warning">
            <h3>⚠️ Total Sessions</h3>
            <div class="value">${summary.today?.total || 0}</div>
            <div class="label">Sessions conducted today</div>
          </div>
        </div>

        <h2>Key Insights</h2>
        <div class="insights-list">
          ${(insights.insights || []).map(insight => `
            <div class="insight-item ${insight.severity}">
              <div class="insight-title">${insight.title}</div>
              <div class="insight-desc">${insight.description}</div>
            </div>
          `).join('')}
        </div>

        <h2>Recommendations</h2>
        <div class="recommendations">
          <h4>Action Items</h4>
          <ul>
            ${(insights.recommendations || []).map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>

        <button class="export-btn" onclick="analyticsUI.exportAnalytics()">📥 Export Analytics</button>
      </div>
    `;
  }

  /**
   * Render departments tab
   */
  renderDepartments() {
    return `
      <div>
        <h2>Department-wise Attendance Analytics</h2>
        <p>Select a department to view detailed analytics:</p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 20px 0;">
          ${['CSE', 'AIM', 'EC', 'ME', 'CE', 'IOT', 'AI', 'DS'].map(dept => `
            <button onclick="analyticsUI.loadDepartment('${dept}')" style="
              padding: 12px;
              background: #4f46e5;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              transition: all 0.3s;
            ">${dept}</button>
          `).join('')}
        </div>
        <div id="dept-results" style="margin-top: 20px;">
          <p style="color: #6b7280;">Click a department to view analytics</p>
        </div>
      </div>
    `;
  }

  /**
   * Render at-risk students tab
   */
  renderAtRiskStudents() {
    return `
      <div>
        <h2>At-Risk Students (< 60% Attendance)</h2>
        <p>Students identified requiring intervention:</p>
        <button onclick="analyticsUI.loadAtRiskData()" style="
          padding: 10px 20px;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          margin-bottom: 20px;
        ">Load At-Risk Report</button>
        <div id="at-risk-results" style="margin-top: 20px;">
          <p style="color: #6b7280;">Click "Load At-Risk Report" to view data</p>
        </div>
      </div>
    `;
  }

  /**
   * Render system info tab (Linways-like info)
   */
  renderSystemInfo() {
    return `
      <div>
        <h2>Analytics System Information</h2>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>📋 System Overview</h3>
          <table style="width: 100%; max-width: 600px;">
            <tr>
              <td style="padding: 10px; font-weight: 600;">System Name</td>
              <td style="padding: 10px;">SMART AMS - Analytics Module</td>
            </tr>
            <tr style="background: white;">
              <td style="padding: 10px; font-weight: 600;">Type</td>
              <td style="padding: 10px;">Linways-like Academic Analytics System</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: 600;">Version</td>
              <td style="padding: 10px;">2.0 (Enhanced Bulk Import with Analytics)</td>
            </tr>
            <tr style="background: white;">
              <td style="padding: 10px; font-weight: 600;">Database</td>
              <td style="padding: 10px;">Supabase PostgreSQL + Firebase</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: 600;">Deployment</td>
              <td style="padding: 10px;">Google Cloud Run + Firebase Hosting</td>
            </tr>
          </table>
        </div>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>🔧 Key Technologies</h3>
          <ul style="columns: 2; gap: 20px;">
            <li>Python Flask Backend</li>
            <li>JavaScript Frontend</li>
            <li>Chart.js for Visualizations</li>
            <li>Firebase Authentication</li>
            <li>Supabase Database</li>
            <li>Cloud Run Deployment</li>
            <li>Real-time Analytics</li>
            <li>RESTful APIs</li>
          </ul>
        </div>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>📊 Analytics Features</h3>
          <ul>
            <li><strong>Attendance Tracking:</strong> Real-time monitoring of student attendance with percentage calculation</li>
            <li><strong>Department Analytics:</strong> Aggregate data by department for institutional reporting</li>
            <li><strong>At-Risk Identification:</strong> Automatic detection of students with < 60% attendance</li>
            <li><strong>Performance Insights:</strong> Actionable recommendations for intervention</li>
            <li><strong>Bulk Export:</strong> Export analytics data in JSON format</li>
            <li><strong>Dashboard Views:</strong> Multiple perspective dashboards (Overview, Department, At-Risk, System)</li>
          </ul>
        </div>

        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>🎯 MVP Metrics (Linways Comparison)</h3>
          <table style="width: 100%;">
            <tr style="background: white;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb;">Metric</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb;">SMART AMS</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb;">Status</th>
            </tr>
            <tr>
              <td style="padding: 10px;">Attendance Percentage</td>
              <td style="padding: 10px;">Real-time calculation</td>
              <td style="padding: 10px;"><span class="status-badge status-good">✓ Live</span></td>
            </tr>
            <tr style="background: white;">
              <td style="padding: 10px;">Department Reports</td>
              <td style="padding: 10px;">Aggregate analytics</td>
              <td style="padding: 10px;"><span class="status-badge status-good">✓ Live</span></td>
            </tr>
            <tr>
              <td style="padding: 10px;">At-Risk Detection</td>
              <td style="padding: 10px;">< 60% threshold</td>
              <td style="padding: 10px;"><span class="status-badge status-good">✓ Live</span></td>
            </tr>
            <tr style="background: white;">
              <td style="padding: 10px;">Data Export</td>
              <td style="padding: 10px;">JSON format</td>
              <td style="padding: 10px;"><span class="status-badge status-good">✓ Live</span></td>
            </tr>
            <tr>
              <td style="padding: 10px;">Dashboard Views</td>
              <td style="padding: 10px;">4 main views</td>
              <td style="padding: 10px;"><span class="status-badge status-good">✓ Live</span></td>
            </tr>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Switch between tabs
   */
  static switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.analytics-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Show selected tab
    const tab = document.getElementById(`tab-${tabName}`);
    if (tab) tab.classList.add('active');

    // Activate button
    event.target.classList.add('active');
  }

  /**
   * Load department analytics
   */
  static async loadDepartment(department) {
    if (!window.analyticsModule) return;

    const deptAnalytics = await window.analyticsModule.loadDepartmentAnalytics(department);
    const resultsDiv = document.getElementById('dept-results');

    if (deptAnalytics.error) {
      resultsDiv.innerHTML = `<p style="color: #dc2626;">Error loading department data</p>`;
      return;
    }

    const html = `
      <h3>${department} Department - Analytics</h3>
      <div class="metrics-grid">
        <div class="metric-card">
          <h3>👥 Students</h3>
          <div class="value">${deptAnalytics.total_students || 0}</div>
          <div class="label">Total enrolled students</div>
        </div>
        <div class="metric-card success">
          <h3>📊 Avg Attendance</h3>
          <div class="value">${deptAnalytics.average_attendance || 0}%</div>
          <div class="label">Department average</div>
        </div>
        <div class="metric-card warning">
          <h3>⚠️ At-Risk</h3>
          <div class="value">${deptAnalytics.at_risk_students || 0}</div>
          <div class="label">Students below 75%</div>
        </div>
      </div>

      ${deptAnalytics.students && deptAnalytics.students.length > 0 ? `
        <h4>Top Students by Attendance</h4>
        <table class="department-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Roll No</th>
              <th>Attendance %</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${deptAnalytics.students.map(s => `
              <tr>
                <td>${s.student_name}</td>
                <td>${s.student_roll}</td>
                <td>
                  <div class="attendance-bar">
                    <div class="attendance-bar-fill" style="width: ${s.attendance_percentage}%;">
                      ${s.attendance_percentage}%
                    </div>
                  </div>
                </td>
                <td><span class="status-badge ${s.status === 'Good' ? 'status-good' : s.status === 'At-Risk' ? 'status-warning' : 'status-critical'}">${s.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}
    `;

    resultsDiv.innerHTML = html;
  }

  /**
   * Load at-risk students report
   */
  static async loadAtRiskData() {
    if (!window.analyticsModule) return;

    const report = await window.analyticsModule.loadAtRiskReport();
    const resultsDiv = document.getElementById('at-risk-results');

    if (report.error) {
      resultsDiv.innerHTML = `<p style="color: #dc2626;">Error loading report</p>`;
      return;
    }

    const html = `
      <h3>At-Risk Students Report</h3>
      <p style="color: #6b7280; margin-bottom: 20px;">
        Total: <strong>${report.total_at_risk || 0}</strong> students with attendance < 60%
      </p>

      ${report.students && report.students.length > 0 ? `
        <table class="department-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Roll No</th>
              <th>Department</th>
              <th>Attendance %</th>
              <th>Action Required</th>
            </tr>
          </thead>
          <tbody>
            ${report.students.map(s => `
              <tr>
                <td>${s.name}</td>
                <td>${s.roll_no}</td>
                <td>${s.department}</td>
                <td>
                  <div class="attendance-bar">
                    <div class="attendance-bar-fill" style="background: linear-gradient(90deg, #ef4444, #dc2626); width: ${s.attendance}%;">
                      ${s.attendance}%
                    </div>
                  </div>
                </td>
                <td><span class="status-badge status-critical">Intervention Needed</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<p>No at-risk students found</p>`}
    `;

    resultsDiv.innerHTML = html;
  }

  /**
   * Export analytics data
   */
  static async exportAnalytics() {
    try {
      const response = await fetch("/api/analytics/export", {
        headers: { "Authorization": `Bearer ${await firebase.auth().currentUser?.getIdToken()}` }
      });

      const data = await response.json();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics-export-${new Date().toISOString().split('T')[0]}.json`;
      link.click();

      toast("Analytics exported successfully", "success");
    } catch (error) {
      console.error("Export error:", error);
      toast("Failed to export analytics", "error");
    }
  }
}

// Global UI helper
const analyticsUI = {
  switchTab: AnalyticsModule.switchTab,
  loadDepartment: AnalyticsModule.loadDepartment,
  loadAtRiskData: AnalyticsModule.loadAtRiskData,
  exportAnalytics: AnalyticsModule.exportAnalytics
};
