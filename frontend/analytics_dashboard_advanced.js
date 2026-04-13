/**
 * Advanced Analytics Dashboard
 * Features: Real-time streaming, predictive analytics, anomaly detection,
 * teacher performance, student risk scoring, advanced visualizations
 */

const AnalyticsDashboardAdvanced = {
    
    // ========================================
    // INITIALIZATION
    // ========================================
    
    init: function(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        this.charts = {};
        this.metrics = {};
        this.filters = {
            date_range: 'week',  // week, month, semester
            department: null,
            section: null,
            metric_type: 'daily'
        };
        
        // Initialize WebSocket for streaming
        this.setupWebSocket();
        this.renderUI();
        this.loadInitialData();
        
        console.log('[ANALYTICS-ADVANCED] Initialized');
    },
    
    setupWebSocket: function() {
        // Use existing WebSocket client or create
        this.ws = QRWebSocketClient.getInstance();
        
        // Listen for real-time analytics updates
        this.ws.on('analytics_update', (data) => {
            this.handleStreamingUpdate(data);
        });
        
        this.ws.on('analytics_event', (data) => {
            this.recordAnalyticsEvent(data);
        });
        
        console.log('[WS] Analytics streaming listeners attached');
    },
    
    // ========================================
    // RENDER UI LAYOUT
    // ========================================
    
    renderUI: function() {
        const html = `
            <div class="advanced-analytics-dashboard">
                <!-- Filter Bar -->
                <div class="filter-bar">
                    <div class="filter-group">
                        <label>Date Range:</label>
                        <select id="date-range-select" class="filter-select">
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="semester">This Semester</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>Department:</label>
                        <select id="department-select" class="filter-select">
                            <option value="">All Departments</option>
                            <option value="CSE">CSE</option>
                            <option value="ECE">ECE</option>
                            <option value="MECH">MECH</option>
                            <option value="CIVIL">CIVIL</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label>Section:</label>
                        <select id="section-select" class="filter-select">
                            <option value="">All Sections</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                        </select>
                    </div>
                    
                    <button id="refresh-btn" class="btn btn-primary">🔄 Refresh</button>
                    <span id="ws-status" class="ws-indicator">● Connecting...</span>
                </div>
                
                <!-- Key Metrics Row -->
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-icon">📊</div>
                        <div class="metric-value" id="total-attended">-</div>
                        <div class="metric-label">Total Attended</div>
                        <div class="metric-change" id="total-change">-</div>
                    </div>
                    
                    <div class="metric-card">
                        <div class="metric-icon">✓</div>
                        <div class="metric-value" id="verification-rate">-</div>
                        <div class="metric-label">Face Verification %</div>
                        <div class="metric-change" id="verification-change">-</div>
                    </div>
                    
                    <div class="metric-card">
                        <div class="metric-icon">⚠️</div>
                        <div class="metric-value" id="at-risk-count">-</div>
                        <div class="metric-label">Students At Risk</div>
                        <div class="metric-change" id="risk-change">-</div>
                    </div>
                    
                    <div class="metric-card">
                        <div class="metric-icon">🎯</div>
                        <div class="metric-value" id="avg-confidence">-</div>
                        <div class="metric-label">Avg Confidence</div>
                        <div class="metric-change" id="confidence-change">-</div>
                    </div>
                </div>
                
                <!-- Advanced Charts -->
                <div class="charts-section">
                    <!-- Chart 1: Attendance Trend (Line Chart) -->
                    <div class="chart-container">
                        <h3>📈 Attendance Trend</h3>
                        <canvas id="attendance-trend-chart"></canvas>
                    </div>
                    
                    <!-- Chart 2: Verification Rate Heatmap -->
                    <div class="chart-container">
                        <h3>🔥 Verification Rate Heatmap (by Day & Hour)</h3>
                        <div id="verification-heatmap" class="heatmap"></div>
                    </div>
                    
                    <!-- Chart 3: Department Comparison -->
                    <div class="chart-container">
                        <h3>🏢 Department Comparison</h3>
                        <canvas id="dept-comparison-chart"></canvas>
                    </div>
                    
                    <!-- Chart 4: Risk Distribution -->
                    <div class="chart-container">
                        <h3>📊 Student Risk Distribution</h3>
                        <canvas id="risk-distribution-chart"></canvas>
                    </div>
                </div>
                
                <!-- Teacher Performance Section -->
                <div class="section-panel">
                    <h2>👨‍🏫 Teacher Performance Metrics</h2>
                    <table id="teacher-performance-table" class="data-table">
                        <thead>
                            <tr>
                                <th>Teacher Name</th>
                                <th>Sessions</th>
                                <th>Verification Rate %</th>
                                <th>Avg Session Duration (min)</th>
                                <th>Unique Students</th>
                                <th>Session Efficiency %</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                
                <!-- At-Risk Students Section -->
                <div class="section-panel">
                    <h2>⚠️ Students At Risk</h2>
                    <div class="risk-filters">
                        <select id="risk-level-filter" class="filter-select">
                            <option value="">All Risk Levels</option>
                            <option value="CRITICAL">CRITICAL</option>
                            <option value="HIGH">HIGH</option>
                            <option value="MEDIUM">MEDIUM</option>
                        </select>
                    </div>
                    <table id="at-risk-students-table" class="data-table">
                        <thead>
                            <tr>
                                <th>Roll No</th>
                                <th>Name</th>
                                <th>Attendance %</th>
                                <th>Risk Score</th>
                                <th>Risk Level</th>
                                <th>Risk Factors</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                
                <!-- Anomalies Section -->
                <div class="section-panel">
                    <h2>🚨 Detected Anomalies</h2>
                    <table id="anomalies-table" class="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Student/Session</th>
                                <th>Anomaly Type</th>
                                <th>Anomaly Score</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                
                <!-- Predictions Section -->
                <div class="section-panel">
                    <h2>🔮 Predictions & Forecasts</h2>
                    <div class="prediction-cards">
                        <div class="prediction-card">
                            <h4>Next 7-Day Attendance Forecast</h4>
                            <canvas id="forecast-chart"></canvas>
                        </div>
                        <div class="prediction-card">
                            <h4>Student At-Risk Probability Trend</h4>
                            <canvas id="risk-probability-chart"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Export & Actions -->
                <div class="actions-bar">
                    <button id="export-json-btn" class="btn btn-secondary">📥 Export JSON</button>
                    <button id="export-csv-btn" class="btn btn-secondary">📊 Export CSV</button>
                    <button id="export-pdf-btn" class="btn btn-secondary">📄 Export PDF</button>
                    <button id="send-alerts-btn" class="btn btn-warning">🔔 Send Risk Alerts</button>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        this.attachEventListeners();
    },
    
    attachEventListeners: function() {
        // Filters
        document.getElementById('date-range-select').addEventListener('change', (e) => {
            this.filters.date_range = e.target.value;
            this.loadInitialData();
        });
        
        document.getElementById('department-select').addEventListener('change', (e) => {
            this.filters.department = e.target.value || null;
            this.loadInitialData();
        });
        
        document.getElementById('section-select').addEventListener('change', (e) => {
            this.filters.section = e.target.value || null;
            this.loadInitialData();
        });
        
        // Buttons
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadInitialData();
        });
        
        document.getElementById('export-json-btn').addEventListener('click', () => {
            this.exportData('json');
        });
        
        document.getElementById('export-csv-btn').addEventListener('click', () => {
            this.exportData('csv');
        });
        
        document.getElementById('export-pdf-btn').addEventListener('click', () => {
            this.exportData('pdf');
        });
        
        document.getElementById('send-alerts-btn').addEventListener('click', () => {
            this.sendRiskAlerts();
        });
    },
    
    // ========================================
    // DATA LOADING
    // ========================================
    
    loadInitialData: function() {
        // Build query params
        const params = new URLSearchParams();
        params.append('range', this.filters.date_range);
        if (this.filters.department) params.append('department', this.filters.department);
        if (this.filters.section) params.append('section', this.filters.section);
        
        // Fetch comprehensive analytics
        Promise.all([
            fetch(`/api/analytics/daily?${params}`).then(r => r.json()),
            fetch(`/api/analytics/trend?days=30&${params}`).then(r => r.json()),
            fetch(`/api/analytics/department?${params}`).then(r => r.json()),
            fetch(`/api/analytics-advanced/teacher-performance`).then(r => r.json()),
            fetch(`/api/analytics-advanced/at-risk-students`).then(r => r.json()),
            fetch(`/api/analytics-advanced/anomalies`).then(r => r.json()),
            fetch(`/api/analytics-advanced/predictions`).then(r => r.json())
        ])
        .then(([daily, trend, dept, teachers, risks, anomalies, predictions]) => {
            this.updateMetrics(daily);
            this.updateTrendChart(trend);
            this.updateHeatmap(daily);
            this.updateDepartmentChart(dept);
            this.updateRiskDistributionChart(risks);
            this.updateTeacherPerformance(teachers);
            this.updateAtRiskStudents(risks);
            this.updateAnomalies(anomalies);
            this.updatePredictions(predictions);
            this.updateWSStatus('connected');
        })
        .catch(err => {
            console.error('[ANALYTICS] Load error:', err);
            this.updateWSStatus('error');
        });
    },
    
    // ========================================
    // METRIC UPDATES
    // ========================================
    
    updateMetrics: function(data) {
        const attended = data.present || 0;
        const total = data.total_marked || 1;
        const verificationRate = data.verification_rate || 0;
        const avgConfidence = data.avg_confidence || 0;
        
        this.setMetric('total-attended', attended);
        this.setMetric('verification-rate', verificationRate.toFixed(1) + '%');
        this.setMetric('avg-confidence', avgConfidence.toFixed(3));
        
        // Calculate changes (compare with previous period)
        const changePercent = ((attended - this.previousAttended) / (this.previousAttended || 1) * 100);
        this.setMetricChange('total-change', changePercent);
        this.setMetricChange('verification-change', 0);
        
        this.previousAttended = attended;
    },
    
    setMetric: function(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = value;
    },
    
    setMetricChange: function(elementId, changePercent) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = (changePercent >= 0 ? '📈' : '📉') + ' ' + changePercent.toFixed(1) + '%';
            el.style.color = changePercent >= 0 ? '#4CAF50' : '#FF5252';
        }
    },
    
    // ========================================
    // CHART UPDATES
    // ========================================
    
    updateTrendChart: function(trendData) {
        const ctx = document.getElementById('attendance-trend-chart');
        if (!ctx) return;
        
        // Destroy existing chart
        if (this.charts.trendChart) {
            this.charts.trendChart.destroy();
        }
        
        const labels = (trendData.trend || []).map(d => d.date);
        const presentData = (trendData.trend || []).map(d => d.present);
        const percentData = (trendData.trend || []).map(d => (d.percentage || 0).toFixed(1));
        
        this.charts.trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Students Present',
                        data: presentData,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: '#4CAF50'
                    },
                    {
                        label: 'Attendance %',
                        data: percentData,
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1',
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: 'Attendance Trend (30 days)' }
                },
                scales: {
                    y: { type: 'linear', display: true, title: { display: true, text: 'Count' } },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Percentage %' } }
                }
            }
        });
    },
    
    updateHeatmap: function(data) {
        const container = document.getElementById('verification-heatmap');
        if (!container) return;
        
        // Create heatmap grid (7 days x 24 hours)
        let html = '<table class="heatmap-table"><tr><th>Hour</th>';
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        days.forEach(d => html += `<th>${d}</th>`);
        html += '</tr>';
        
        // Dummy heatmap data - in production, calculate from actual hourly verification rates
        for (let hour = 0; hour < 24; hour++) {
            html += `<tr><td>${hour}:00</td>`;
            for (let day = 0; day < 7; day++) {
                // Random verification rate (0-100)
                const rate = Math.random() * 100;
                const intensity = (rate / 100);
                const color = `rgba(76, 175, 80, ${intensity})`;
                html += `<td style="background-color: ${color}; text-align: center;">${rate.toFixed(0)}</td>`;
            }
            html += '</tr>';
        }
        
        html += '</table>';
        container.innerHTML = html;
    },
    
    updateDepartmentChart: function(deptData) {
        const ctx = document.getElementById('dept-comparison-chart');
        if (!ctx) return;
        
        if (this.charts.deptChart) this.charts.deptChart.destroy();
        
        const departments = (deptData.by_department || []).map(d => d.department);
        const attendance = (deptData.by_department || []).map(d => d.attendance_percentage || 0);
        const verification = (deptData.by_department || []).map(d => d.verification_rate || 0);
        
        this.charts.deptChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: departments,
                datasets: [
                    {
                        label: 'Attendance %',
                        data: attendance,
                        backgroundColor: '#4CAF50'
                    },
                    {
                        label: 'Verification %',
                        data: verification,
                        backgroundColor: '#2196F3'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    },
    
    updateRiskDistributionChart: function(riskData) {
        const ctx = document.getElementById('risk-distribution-chart');
        if (!ctx) return;
        
        if (this.charts.riskChart) this.charts.riskChart.destroy();
        
        const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        const counts = riskLevels.map(level => 
            (riskData || []).filter(r => r.risk_level === level).length
        );
        const colors = ['#4CAF50', '#FFC107', '#FF9800', '#F44336'];
        
        this.charts.riskChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: riskLevels,
                datasets: [{
                    data: counts,
                    backgroundColor: colors,
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: { callbacks: { label: (ctx) => ctx.parsed + ' students' } }
                }
            }
        });
    },
    
    // ========================================
    // DATA TABLE UPDATES
    // ========================================
    
    updateTeacherPerformance: function(teachers) {
        const tbody = document.querySelector('#teacher-performance-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        (teachers.data || []).forEach(t => {
            const row = `
                <tr>
                    <td>${t.teacher_name || t.teacher_id}</td>
                    <td>${t.total_sessions || 0}</td>
                    <td>${(t.avg_verification_rate || 0).toFixed(1)}%</td>
                    <td>${(t.avg_session_duration_mins || 0).toFixed(0)}</td>
                    <td>${t.unique_students_verified || 0}</td>
                    <td>${(t.session_efficiency || 0).toFixed(1)}%</td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    },
    
    updateAtRiskStudents: function(risks) {
        const tbody = document.querySelector('#at-risk-students-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        (risks || []).slice(0, 50).forEach(r => {
            const riskColor = {
                'CRITICAL': '#F44336',
                'HIGH': '#FF9800',
                'MEDIUM': '#FFC107',
                'LOW': '#4CAF50'
            }[r.risk_level] || '#999';
            
            const row = `
                <tr>
                    <td>${r.roll_no}</td>
                    <td>${r.name}</td>
                    <td>${(r.attendance_percentage || 0).toFixed(1)}%</td>
                    <td>${(r.risk_score || 0).toFixed(0)}</td>
                    <td><span style="color: ${riskColor}; font-weight: bold;">${r.risk_level}</span></td>
                    <td>${(r.risk_factors || []).slice(0, 2).join('; ')}</td>
                    <td><button class="btn btn-sm btn-info" onclick="alert('Send intervention for ${r.roll_no}')">📧</button></td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    },
    
    updateAnomalies: function(anomalies) {
        const tbody = document.querySelector('#anomalies-table tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        (anomalies || []).slice(0, 20).forEach(a => {
            const row = `
                <tr>
                    <td>${a.date}</td>
                    <td>${a.student_roll || a.session_id}</td>
                    <td>${a.anomaly_type}</td>
                    <td>${(a.anomaly_score || 0).toFixed(3)}</td>
                    <td>${a.description || 'Unusual pattern detected'}</td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    },
    
    updatePredictions: function(predictions) {
        if (!predictions) return;
        
        // Forecast chart
        const forecastCtx = document.getElementById('forecast-chart');
        if (forecastCtx && this.charts.forecastChart) {
            this.charts.forecastChart.destroy();
        }
        
        if (forecastCtx) {
            const forecast = predictions.forecast_7day || [];
            this.charts.forecastChart = new Chart(forecastCtx, {
                type: 'line',
                data: {
                    labels: forecast.map(f => f.date),
                    datasets: [{
                        label: 'Predicted Attendance %',
                        data: forecast.map(f => f.predicted_percentage),
                        borderColor: '#9C27B0',
                        backgroundColor: 'rgba(156, 39, 176, 0.1)',
                        tension: 0.4,
                        borderDash: [5, 5]  // Dashed line for prediction
                    }]
                },
                options: { responsive: true, plugins: { legend: { position: 'top' } } }
            });
        }
    },
    
    // ========================================
    // REAL-TIME STREAMING
    // ========================================
    
    handleStreamingUpdate: function(data) {
        console.log('[ANALYTICS-ADVANCED] Streaming update:', data);
        // Update relevant metrics/charts with new data
        if (data.daily_summary) {
            this.updateMetrics(data.daily_summary);
        }
    },
    
    recordAnalyticsEvent: function(data) {
        // Record individual attendance event
        console.log('[ANALYTICS-ADVANCED] New event:', data);
    },
    
    // ========================================
    // DATA EXPORT
    // ========================================
    
    exportData: function(format) {
        const data = {
            metrics: this.metrics,
            filters: this.filters,
            timestamp: new Date().toISOString()
        };
        
        if (format === 'json') {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            this.downloadFile(blob, `analytics_${new Date().toISOString().split('T')[0]}.json`);
        } else if (format === 'csv') {
            // Convert to CSV
            const csv = 'Topic,Value\nAttendance,' + (this.metrics.total || 0);
            const blob = new Blob([csv], { type: 'text/csv' });
            this.downloadFile(blob, `analytics_${new Date().toISOString().split('T')[0]}.csv`);
        } else if (format === 'pdf') {
            alert('PDF export requires additional library. Use JSON or CSV for now.');
        }
    },
    
    downloadFile: function(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },
    
    // ========================================
    // ACTIONS
    // ========================================
    
    sendRiskAlerts: function() {
        const riskyStudents = [];  // Get from at-risk-students-table
        
        if (riskyStudents.length === 0) {
            alert('No at-risk students to alert');
            return;
        }
        
        // Send SMS/Email alerts
        fetch('/api/sms/send-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                students: riskyStudents,
                message_type: 'attendance_warning'
            })
        })
        .then(r => r.json())
        .then(data => alert(`Alerts sent to ${data.sent} students`))
        .catch(err => alert('Error sending alerts: ' + err));
    },
    
    updateWSStatus: function(status) {
        const el = document.getElementById('ws-status');
        if (!el) return;
        
        if (status === 'connected') {
            el.textContent = '● Connected';
            el.style.color = '#4CAF50';
        } else if (status === 'error') {
            el.textContent = '● Error';
            el.style.color = '#F44336';
        }
    }
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    AnalyticsDashboardAdvanced.init('analytics-container-advanced');
});
