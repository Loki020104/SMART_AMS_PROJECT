// ═══════════════════════════════════════════════════════════════════════════════
// TIMETABLE GENERATOR UI - Enhanced with Break Management & Statistics
// Based on comprehensive admin interface for automatic timetable generation
// ═══════════════════════════════════════════════════════════════════════════════

const TimetableGeneratorUI = {
  
  state: {
    currentYear: 1,
    currentView: 'section',
    currentSection: 'A',
    timetable: [],
    subjects: {},
    generated: false,
    breaks: [],
  },

  init() {
    console.log('[TimetableGeneratorUI] Initializing enhanced generator');
    window.ttUiInit = this.initGeneratorTab.bind(this);
    window.ttConfigSave = this.saveConfiguration.bind(this);
    window.ttGenerateWithBreaks = this.generateWithBreaks.bind(this);
    window.ttSwitchView = this.switchView.bind(this);
    window.ttSwitchYear = this.switchYear.bind(this);
  },

  initGeneratorTab() {
    const container = document.getElementById('ttTabContent');
    if (!container) return;
    
    container.innerHTML = this.renderGeneratorUI();
    this.loadConfiguration();
    this.initializeBreakSchedule();
    this.loadSubjectsForYear(1);
  },

  renderGeneratorUI() {
    return `
<style>
  .timetable-generator-ui {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 0;
    min-height: calc(100vh - 100px);
    background: var(--bg-secondary);
  }

  .gen-sidebar {
    background: var(--bg-tertiary);
    border-right: 1px solid var(--border);
    padding: 20px;
    overflow-y: auto;
    max-height: calc(100vh - 100px);
  }

  .gen-section {
    margin-bottom: 24px;
  }

  .gen-section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .gen-content {
    padding: 24px;
    overflow-y: auto;
    max-height: calc(100vh - 100px);
  }

  /* Year Tabs */
  .year-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .year-tab {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .year-tab.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: #fff;
  }

  /* Subject Management */
  .subject-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
  }

  .subject-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    font-size: 12px;
  }

  .subject-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 6px;
    align-items: center;
    margin-bottom: 6px;
  }

  .subject-row:last-child {
    margin-bottom: 0;
  }

  /* Breaks Schedule */
  .break-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 8px;
    display: grid;
    grid-template-columns: 1fr 1fr 0.8fr auto;
    gap: 6px;
    align-items: center;
    font-size: 12px;
  }

  .break-item input,
  .break-item select {
    padding: 4px 6px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-tertiary);
    color: var(--text);
    font-size: 11px;
  }

  /* Statistics Bar */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }

  .stat-card {
    background: linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary));
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    text-align: center;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--primary-color);
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  /* Tabs */
  .view-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    border-bottom: 2px solid var(--border);
    padding-bottom: 0;
  }

  .view-tab {
    padding: 10px 16px;
    border: none;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .view-tab.active {
    color: var(--primary-color);
    border-bottom-color: var(--primary-color);
  }

  /* Timetable Grid */
  .tt-grid {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 12px;
  }

  .tt-grid th {
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    padding: 8px;
    font-weight: 600;
    color: var(--text-secondary);
    text-align: center;
    white-space: nowrap;
  }

  .tt-grid td {
    border: 1px solid var(--border);
    padding: 6px;
    background: var(--bg-secondary);
    vertical-align: top;
    min-height: 60px;
  }

  .day-cell {
    background: var(--bg-tertiary);
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
    text-align: center;
    width: 80px;
  }

  .slot {
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 10px;
    line-height: 1.3;
    cursor: pointer;
    margin-bottom: 3px;
  }

  .slot-theory {
    background: rgba(79, 142, 247, 0.15);
    border-left: 3px solid var(--primary-color);
    color: var(--text);
  }

  .slot-lab {
    background: rgba(34, 197, 94, 0.15);
    border-left: 3px solid #22c55e;
    color: var(--text);
  }

  .slot-empty {
    background: transparent;
    border: 1px dashed var(--border);
    color: var(--text-secondary);
    text-align: center;
    font-style: italic;
  }

  .break-row td {
    background: rgba(234, 179, 8, 0.08);
    color: var(--text-secondary);
    text-align: center;
    font-weight: 500;
  }

  .lunch-row td {
    background: rgba(249, 115, 22, 0.08);
    color: var(--text-secondary);
  }

  /* Buttons */
  .gen-btn {
    width: 100%;
    padding: 10px;
    background: linear-gradient(135deg, var(--primary-color), #0056b3);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
    margin-top: 8px;
  }

  .gen-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .gen-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    color: var(--text-secondary);
    gap: 12px;
  }

  .empty-icon {
    font-size: 48px;
    opacity: 0.4;
  }

  .legend {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px;
    background: var(--bg-tertiary);
    border-radius: 6px;
    margin-bottom: 16px;
    border: 1px solid var(--border);
    font-size: 11px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  @media (max-width: 1024px) {
    .timetable-generator-ui {
      grid-template-columns: 1fr;
    }
    .gen-sidebar {
      max-height: auto;
    }
    .stats-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
</style>

<div class="timetable-generator-ui">
  <!-- Sidebar Configuration -->
  <div class="gen-sidebar">
    <!-- Academic Settings -->
    <div class="gen-section">
      <div class="gen-section-title">📚 Academic Settings</div>
      <label>Department</label>
      <select id="cfg-dept" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);margin-bottom:10px">
        <option value="CSE">Computer Science (CSE)</option>
        <option value="ECE">Electronics (ECE)</option>
        <option value="EEE">Electrical (EEE)</option>
        <option value="AIM">AI & ML (AIM)</option>
        <option value="FSD">Full Stack (FSD)</option>
      </select>

      <label>Academic Year</label>
      <input id="cfg-acyear" value="2025-26" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);margin-bottom:10px">

      <label>Sections</label>
      <input id="cfg-sections" value="A,B,C" placeholder="A,B,C" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);margin-bottom:10px">
    </div>

    <!-- Schedule Config -->
    <div class="gen-section">
      <div class="gen-section-title">⏰ Break Schedule</div>
      <div id="break-list"></div>
      <button class="btn btn-outline" onclick="ttAddBreakRow()" style="width:100%;padding:6px;margin-top:8px">+ Add Break</button>
    </div>

    <!-- Subjects per Year -->
    <div class="gen-section">
      <div class="gen-section-title">📖 Subjects</div>
      <div class="year-tabs" id="year-tabs">
        <button class="year-tab active" onclick="ttSwitchYear(1,this)">Year 1</button>
        <button class="year-tab" onclick="ttSwitchYear(2,this)">Year 2</button>
        <button class="year-tab" onclick="ttSwitchYear(3,this)">Year 3</button>
        <button class="year-tab" onclick="ttSwitchYear(4,this)">Year 4</button>
      </div>
      <div class="subject-list" id="subject-list"></div>
    </div>

    <!-- Faculty -->
    <div class="gen-section">
      <div class="gen-section-title">👨‍🏫 Faculty</div>
      <label>Faculty Usernames</label>
      <textarea id="cfg-faculty" rows="4" placeholder="puc26cse001&#10;puc26cse002&#10;puc26cse003" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-family:monospace;font-size:11px"></textarea>
    </div>

    <!-- Rooms -->
    <div class="gen-section">
      <div class="gen-section-title">🏫 Rooms</div>
      <label>Theory Rooms</label>
      <input id="cfg-theory-rooms" value="T101,T102,T103,T104" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);margin-bottom:10px;font-size:11px">
      
      <label>Lab Rooms</label>
      <input id="cfg-lab-rooms" value="L101,L102,L103" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:11px">
    </div>

    <!-- Generate Button -->
    <button class="gen-btn" id="gen-btn" onclick="ttGenerateWithBreaks()">
      ⚡ Generate Timetable
    </button>
  </div>

  <!-- Main Content -->
  <div class="gen-content">
    <!-- Stats -->
    <div class="stats-grid" id="stats-grid" style="display:none">
      <div class="stat-card">
        <div class="stat-value" id="stat-total">0</div>
        <div class="stat-label">Total Slots</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-theory" style="color:#4f8ef7">0</div>
        <div class="stat-label">Theory</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-lab" style="color:#22c55e">0</div>
        <div class="stat-label">Lab</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-faculty" style="color:#7c5cfc">0</div>
        <div class="stat-label">Faculty</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-conflicts" style="color:#ef4444">0</div>
        <div class="stat-label">Conflicts</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="view-tabs" id="view-tabs" style="display:none">
      <button class="view-tab active" onclick="ttSwitchView('section',this)">📋 Section View</button>
      <button class="view-tab" onclick="ttSwitchView('faculty',this)">👨‍🏫 Faculty View</button>
      <button class="view-tab" onclick="ttSwitchView('conflicts',this)">⚠️ Conflicts</button>
    </div>

    <!-- Legend -->
    <div class="legend" id="legend" style="display:none">
      <div class="legend-item">
        <div class="legend-dot" style="background:#4f8ef7"></div>
        <span>Theory Class</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:#22c55e"></div>
        <span>Lab (2 hrs)</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:#eab308"></div>
        <span>☕ Tea Break</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:#f97316"></div>
        <span>🍽 Lunch</span>
      </div>
    </div>

    <!-- Output -->
    <div id="tt-output">
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <div><strong>No Timetable Generated</strong></div>
        <div style="font-size:12px;color:var(--text-secondary)">Configure settings and click Generate to create timetable</div>
      </div>
    </div>
  </div>
</div>
    `;
  },

  switchYear(year, btn) {
    this.state.currentYear = year;
    document.querySelectorAll('.year-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    this.loadSubjectsForYear(year);
  },

  loadSubjectsForYear(year) {
    const list = document.getElementById('subject-list');
    const subjects = this.state.subjects[year] || [];
    
    list.innerHTML = subjects.map((s, i) => `
      <div class="subject-item">
        <div class="subject-row">
          <input value="${s.code}" placeholder="Code" style="font-family:monospace;font-size:11px" readonly>
          <input value="${s.name}" placeholder="Name" readonly>
          <span style="font-size:10px;color:var(--text-secondary)">Th:${s.th} Lab:${s.lab}</span>
        </div>
      </div>
    `).join('');
  },

  initializeBreakSchedule() {
    const breakList = document.getElementById('break-list');
    const defaultBreaks = [
      {day: 'Monday', start: '10:30', end: '10:45', type: 'Tea'},
      {day: 'Monday', start: '13:00', end: '14:00', type: 'Lunch'},
      {day: 'Tuesday', start: '10:30', end: '10:45', type: 'Tea'},
      {day: 'Tuesday', start: '13:00', end: '14:00', type: 'Lunch'},
    ];

    this.state.breaks = defaultBreaks;
    
    breakList.innerHTML = defaultBreaks.map((b, i) => `
      <div class="break-item">
        <select value="${b.day}" style="font-size:11px">
          <option value="Monday">Monday</option>
          <option value="Tuesday">Tuesday</option>
          <option value="Wednesday">Wednesday</option>
          <option value="Thursday">Thursday</option>
          <option value="Friday">Friday</option>
        </select>
        <input type="time" value="${b.start}" style="font-size:11px">
        <input type="time" value="${b.end}" style="font-size:11px">
        <select style="font-size:11px">
          <option value="Tea" ${b.type==='Tea'?'selected':''}>Tea</option>
          <option value="Lunch" ${b.type==='Lunch'?'selected':''}>Lunch</option>
        </select>
        <button onclick="ttRemoveBreak(${i})" style="background:none;border:none;color:var(--text-secondary);cursor:pointer">🗑️</button>
      </div>
    `).join('');
  },

  switchView(view, btn) {
    this.state.currentView = view;
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    // Render based on view type
    console.log(`[TimetableGeneratorUI] Switching to ${view} view`);
  },

  saveConfiguration() {
    console.log('[TimetableGeneratorUI] Saving configuration');
  },

  generateWithBreaks() {
    console.log('[TimetableGeneratorUI] Generating timetable with breaks');
    const btn = document.getElementById('gen-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Generating...';

    setTimeout(() => {
      // Mock generation
      this.state.generated = true;
      document.getElementById('stats-grid').style.display = 'grid';
      document.getElementById('view-tabs').style.display = 'flex';
      document.getElementById('legend').style.display = 'flex';

      // Show mock data
      document.getElementById('stat-total').textContent = '120';
      document.getElementById('stat-theory').textContent = '72';
      document.getElementById('stat-lab').textContent = '36';
      document.getElementById('stat-faculty').textContent = '6';
      document.getElementById('stat-conflicts').textContent = '0';

      btn.disabled = false;
      btn.textContent = '⚡ Regenerate';
    }, 500);
  },

  loadConfiguration() {
    // Load default subjects
    this.state.subjects = {
      1: [
        {code:'CS101', name:'Programming Fundamentals', th:3, lab:1},
        {code:'CS102', name:'Mathematics I', th:3, lab:0},
        {code:'CS103', name:'Digital Logic Design', th:3, lab:1},
      ],
      2: [
        {code:'CS201', name:'Data Structures', th:3, lab:1},
        {code:'CS202', name:'Mathematics II', th:3, lab:0},
      ],
      3: [
        {code:'CS301', name:'Algorithms', th:3, lab:1},
      ],
      4: [
        {code:'CS401', name:'Machine Learning', th:3, lab:1},
      ],
    };
  }
};

// Global functions for HTML onclick handlers
function ttAddBreakRow() {
  console.log('[TimetableGeneratorUI] Adding break row');
}

function ttRemoveBreak(idx) {
  console.log('[TimetableGeneratorUI] Removing break:', idx);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  TimetableGeneratorUI.init();
});
