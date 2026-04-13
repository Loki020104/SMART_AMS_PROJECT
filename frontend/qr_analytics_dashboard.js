/**
 * QR Attendance Analytics Dashboard
 * Real-time analytics visualization with charts and reports
 */

const QRAnalyticsDashboard = {
    ws: null,
    selectedDate: null,
    selectedMetric: 'daily',
    analyticsData: {},

    init(containerId) {
        this.ws = QRWebSocketClient.getInstance();
        
        // Ensure WebSocket is connected
        if (!this.ws.isConnected()) {
            this.ws.connect().then(() => {
                this._render(containerId);
                this._setupEventListeners();
            });
        } else {
            this._render(containerId);
            this._setupEventListeners();
        }
    },

    _render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        this.selectedDate = new Date().toISOString().split('T')[0];

        container.innerHTML = `
            <div class="analytics-dashboard">
                <!-- Header & Controls -->
                <div class="card-header">
                    <h2>📈 Attendance Analytics Dashboard</h2>
                    <p>Real-time attendance insights and reporting</p>
                </div>

                <!-- Filter Panel -->
                <div class="card-content" style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" id="analyticsDate" value="${this.selectedDate}">
                        </div>
                        
                        <div class="form-group">
                            <label>View By</label>
                            <select id="analyticsMetric">
                                <option value="daily">Daily Summary</option>
                                <option value="course">By Course</option>
                                <option value="section">By Section</option>
                                <option value="student">By Student</option>
                                <option value="department">By Department</option>
                                <option value="trend">7-Day Trend</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Course (Optional)</label>
                            <input type="text" id="courseFilter" placeholder="Filter by course">
                        </div>

                        <div style="display: flex; align-items: flex-end;">
                            <button type="button" onclick="QRAnalyticsDashboard.loadAnalytics()" 
                                    class="btn btn-primary" style="width: 100%;">
                                Load Analytics
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Statistics Cards -->
                <div class="stats-cards-grid" id="statsCardsGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    <!-- Will be populated by loadAnalytics -->
                </div>

                <!-- Charts Section -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <div class="card-content" style="border-radius: 8px;">
                        <h4 style="margin-top: 0;">Attendance Distribution</h4>
                        <canvas id="attendanceChart" width="400" height="250"></canvas>
                    </div>

                    <div class="card-content" style="border-radius: 8px;">
                        <h4 style="margin-top: 0;">Verification Rate</h4>
                        <canvas id="verificationChart" width="400" height="250"></canvas>
                    </div>
                </div>

                <!-- Attendance Table -->
                <div class="card-content" style="border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4 style="margin: 0;">Attendance Records</h4>
                        <div>
                            <input type="text" id="searchAttendance" placeholder="Search roll no or name" style="padding: 8px; width: 250px;">
                            <button type="button" onclick="QRAnalyticsDashboard.exportToCSV()" 
                                    class="btn btn-secondary" style="margin-left: 10px;">
                                📥 Export CSV
                            </button>
                        </div>
                    </div>

                    <div style="overflow-x: auto; max-height: 500px; overflow-y: auto;">
                        <table class="analytics-table" style="width: 100%; font-size: 0.9em;">
                            <thead>
                                <tr>
                                    <th>Roll No</th>
                                    <th>Name</th>
                                    <th>Status</th>
                                    <th>Confidence</th>
                                    <th>Location</th>
                                    <th>Method</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody id="analyticsTableBody">
                                <tr><td colspan="7" style="text-align: center; padding: 20px; color: #999;">
                                    Click "Load Analytics" to view data
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Advanced Reports -->
                <div class="card-content" style="border-radius: 8px; margin-top: 30px;">
                    <h4>Advanced Reports</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                        <button type="button" onclick="QRAnalyticsDashboard.generateStudentReport()" 
                                class="btn btn-outline">Generate Student Report</button>
                        <button type="button" onclick="QRAnalyticsDashboard.generateCourseReport()" 
                                class="btn btn-outline">Generate Course Report</button>
                        <button type="button" onclick="QRAnalyticsDashboard.generateDepartmentReport()" 
                                class="btn btn-outline">Generate Dept Report</button>
                        <button type="button" onclick="QRAnalyticsDashboard.generateAttendanceTrend()" 
                                class="btn btn-outline">7-Day Trend</button>
                    </div>
                </div>

                <!-- Live Updates Status -->
                <div style="text-align: center; margin-top: 30px; padding: 15px; background: #f0f0f0; border-radius: 8px;">
                    <p style="margin: 0;">
                        <span id="wsStatus" style="display: inline-block; width: 10px; height: 10px; background: #4CAF50; border-radius: 50%;"></span>
                        <span id="wsStatusText">Connected - Live updates enabled</span>
                    </p>
                </div>
            </div>
        `;
    },

    _setupEventListeners() {
        // WebSocket events
        this.ws.on('analytics_update', (data) => {
            console.log('[Analytics] Update received:', data);
            this._updateStatsCards(data.summary);
        });

        this.ws.on('attendance_update', (data) => {
            // Refresh analytics when attendance is marked
            this.loadAnalytics();
        });

        this.ws.on('ws_connected', () => {
            document.getElementById('wsStatus').style.background = '#4CAF50';
            document.getElementById('wsStatusText').textContent = 'Connected - Live updates enabled';
        });

        this.ws.on('ws_disconnected', () => {
            document.getElementById('wsStatus').style.background = '#F44336';
            document.getElementById('wsStatusText').textContent = 'Disconnected - Click to reconnect';
        });

        // UI events
        document.getElementById('analyticsDate').addEventListener('change', (e) => {
            this.selectedDate = e.target.value;
        });

        document.getElementById('analyticsMetric').addEventListener('change', (e) => {
            this.selectedMetric = e.target.value;
        });

        document.getElementById('searchAttendance').addEventListener('keyup', () => {
            this._filterAttendanceTable();
        });
    },

    loadAnalytics() {
        const metric = document.getElementById('analyticsMetric').value;
        const date = document.getElementById('analyticsDate').value;
        const course = document.getElementById('courseFilter').value;

        console.log('[Analytics] Loading:', metric, date, course);

        let endpoint = '';
        let params = new URLSearchParams();

        switch(metric) {
            case 'daily':
                endpoint = '/api/analytics/daily';
                params.append('date', date);
                break;
            case 'course':
                endpoint = '/api/analytics/course';
                params.append('course_id', course || 'all');
                break;
            case 'section':
                endpoint = '/api/analytics/section';
                params.append('section', course || 'A1');
                break;
            case 'student':
                endpoint = '/api/analytics/student';
                params.append('roll_no', course || '');
                break;
            case 'department':
                endpoint = '/api/analytics/department';
                params.append('department', course || 'CSE');
                break;
            case 'trend':
                endpoint = '/api/analytics/trend';
                params.append('days', 7);
                break;
        }

        fetch(`${API_BASE}${endpoint}?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    this.analyticsData = data.data;
                    this._displayAnalytics(metric, data.data);
                } else {
                    alert('Error: ' + data.error);
                }
            })
            .catch(err => console.error('[Analytics] Error:', err));
    },

    _displayAnalytics(metric, data) {
        // Update stats cards
        this._updateStatsCards(data);

        // Update charts
        this._updateCharts(metric, data);

        // Update table
        this._updateAttendanceTable(data);
    },

    _updateStatsCards(data) {
        const container = document.getElementById('statsCardsGrid');
        container.innerHTML = '';

        const stats = [
            { label: 'Total Marked', value: data.total_marked || data.total_attendance_marked || 0, icon: '📊' },
            { label: 'Present', value: data.present || data.present_count || data.verified || 0, icon: '✓' },
            { label: 'Absent', value: data.absent || data.absent_count || data.failed || 0, icon: '✗' },
            { label: 'Verification %', value: (data.verification_rate || data.avg_verification_rate || 0).toFixed(1) + '%', icon: '🔍' },
            { label: 'Avg Confidence', value: (data.average_confidence || 0).toFixed(2), icon: '📈' },
            { label: 'Location Verified', value: data.location_verified_count || 0, icon: '📍' }
        ];

        stats.forEach(stat => {
            const card = document.createElement('div');
            card.className = 'stat-card';
            card.style.cssText = 'padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
            card.innerHTML = `
                <div style="font-size: 1.5em; margin-bottom: 10px;">${stat.icon}</div>
                <div style="font-size: 2em; font-weight: bold; margin-bottom: 5px;">${stat.value}</div>
                <div style="font-size: 0.9em; color: #666;">${stat.label}</div>
            `;
            container.appendChild(card);
        });
    },

    _updateCharts(metric, data) {
        // Attendance Distribution Pie Chart
        const chartCanvas = document.getElementById('attendanceChart');
        if (chartCanvas && typeof Chart !== 'undefined') {
            const present = data.present || data.present_count || data.verified || 0;
            const absent = data.absent || data.absent_count || data.failed || 0;
            
            new Chart(chartCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Present', 'Absent'],
                    datasets: [{
                        data: [present, absent],
                        backgroundColor: ['#4CAF50', '#F44336'],
                        borderColor: ['#45a049', '#da190b'],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }

        // Verification Rate Bar Chart
        const verificationCanvas = document.getElementById('verificationChart');
        if (verificationCanvas && typeof Chart !== 'undefined') {
            const rate = data.verification_rate || data.avg_verification_rate || 0;
            
            new Chart(verificationCanvas, {
                type: 'bar',
                data: {
                    labels: ['Verification Rate'],
                    datasets: [{
                        label: 'Percentage (%)',
                        data: [rate],
                        backgroundColor: ['#2196F3'],
                        borderColor: ['#0b7dda'],
                        borderWidth: 2
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { max: 100 } }
                }
            });
        }
    },

    _updateAttendanceTable(data) {
        const tbody = document.getElementById('analyticsTableBody');
        tbody.innerHTML = '';

        let records = [];
        if (data.records) records = data.records;
        else if (Array.isArray(data)) records = data;

        if (!records || records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #999;">No records found</td></tr>';
            return;
        }

        records.forEach(record => {
            const row = document.createElement('tr');
            const statusColor = record.verified ? '#4CAF50' : '#F44336';
            const statusText = record.verified ? '✓ PRESENT' : '✗ ABSENT';
            
            row.innerHTML = `
                <td>${record.roll_no || '-'}</td>
                <td>${record.name || '-'}</td>
                <td><span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></td>
                <td>${((record.confidence || 0) * 100).toFixed(1)}%</td>
                <td>${record.in_campus ? '✓ In Campus' : '✗ Outside'}</td>
                <td>${record.method || 'qr'}</td>
                <td>${new Date(record.timestamp).toLocaleTimeString()}</td>
            `;
            tbody.appendChild(row);
        });
    },

    _filterAttendanceTable() {
        const searchTerm = document.getElementById('searchAttendance').value.toLowerCase();
        const rows = document.querySelectorAll('#analyticsTableBody tr');

        rows.forEach(row => {
            const rollNo = row.cells[0]?.textContent.toLowerCase() || '';
            const name = row.cells[1]?.textContent.toLowerCase() || '';

            if (rollNo.includes(searchTerm) || name.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    },

    exportToCSV() {
        const date = document.getElementById('analyticsDate').value;
        
        fetch(`${API_BASE}/analytics/export?format=csv&date=${date}`)
            .then(res => res.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `attendance_${date}.csv`;
                a.click();
                window.URL.revokeObjectURL(url);
            })
            .catch(err => console.error('[Analytics] Export error:', err));
    },

    generateStudentReport() {
        alert('Opening student report generator...');
        // Would open a modal or new page
    },

    generateCourseReport() {
        alert('Opening course report generator...');
    },

    generateDepartmentReport() {
        alert('Opening department report generator...');
    },

    generateAttendanceTrend() {
        this.selectedMetric = 'trend';
        this.loadAnalytics();
    }
};

// Initialize on load
window.addEventListener('load', () => {
    console.log('[QR-Analytics] Dashboard module loaded');
});
