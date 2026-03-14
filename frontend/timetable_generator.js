// ============================================================================
// TIMETABLE GENERATOR UI - Admin Interface for Automatic Timetable Generation
// ============================================================================
// This file contains all UI logic for:
// - Timetable configuration
// - Faculty constraint management  
// - Department constraint management
// - Room capacity management
// - Timetable generation & optimization
// - Conflict validation and reporting

const TimetableGeneratorUI = {
  
  init() {
    // Initialize generator tab event handlers
    window.ttGeneratorInit = this.initGeneratorTab.bind(this);
    window.ttConfigSave = this.saveConfiguration.bind(this);
    window.ttFacultySave = this.saveFacultyConstraint.bind(this);
    window.ttDeptSave = this.saveDepartmentConstraint.bind(this);
    window.ttRoomSave = this.saveRooms.bind(this);
    window.ttGeneratorStart = this.startGeneration.bind(this);
    window.ttValidateTimetable = this.validateTimetable.bind(this);    window.ttBreakSave = this.saveBreakSchedule.bind(this);
    window.ttAddBreak = this.addBreakRow.bind(this);  },

  // ────────────────────────────────────────────────────────────────────
  // Generator Tab Initialization
  // ────────────────────────────────────────────────────────────────────
  
  initGeneratorTab() {
    const container = document.getElementById('ttTabContent');
    if (!container) return;
    
    container.innerHTML = this.renderGeneratorUI();
    this.loadConfiguration();
    this.loadRoomList();
    this.loadFacultyList();
    this.initializeDefaultBreaks();
  },
  
  initializeDefaultBreaks() {
    // Add default break periods
    const breaks = [
      { day: 'Monday', start: '10:30', end: '10:45', type: 'break' },
      { day: 'Monday', start: '13:00', end: '14:00', type: 'lunch' },
      { day: 'Tuesday', start: '10:30', end: '10:45', type: 'break' },
      { day: 'Tuesday', start: '13:00', end: '14:00', type: 'lunch' },
      { day: 'Wednesday', start: '10:30', end: '10:45', type: 'break' },
      { day: 'Wednesday', start: '13:00', end: '14:00', type: 'lunch' },
      { day: 'Thursday', start: '10:30', end: '10:45', type: 'break' },
      { day: 'Thursday', start: '13:00', end: '14:00', type: 'lunch' },
      { day: 'Friday', start: '10:30', end: '10:45', type: 'break' },
      { day: 'Friday', start: '13:00', end: '14:00', type: 'lunch' },
      { day: 'Saturday', start: '10:30', end: '10:45', type: 'break' },
      { day: 'Saturday', start: '13:00', end: '14:00', type: 'lunch' }
    ];
    
    setTimeout(() => {
      const container = document.getElementById('tg_break_list');
      if (container) {
        container.innerHTML = '';
        breaks.forEach(() => this.addBreakRow());
        
        // Set values
        const rows = document.querySelectorAll('.break-row');
        rows.forEach((row, idx) => {
          if (idx < breaks.length) {
            const br = breaks[idx];
            row.querySelector('.break-day').value = br.day;
            row.querySelector('.break-start').value = br.start;
            row.querySelector('.break-end').value = br.end;
            row.querySelector('.break-type').value = br.type;
          }
        });
      }
    }, 100);
  },
  
  async loadFacultyList() {
    try {
      console.log('[TimetableGenerator] Loading faculty list...');
      const url = `${window.AMS_CONFIG.API_URL}/api/users/list?role=faculty`;
      console.log('[TimetableGenerator] Fetch URL:', url);
      
      const response = await fetch(url);
      console.log('[TimetableGenerator] Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[TimetableGenerator] Faculty data received:', data);
      
      const facultySelect = document.getElementById('tg_faculty_select');
      
      if (facultySelect) {
        if (Array.isArray(data.users) && data.users.length > 0) {
          console.log('[TimetableGenerator] Populating', data.users.length, 'faculty members');
          facultySelect.innerHTML = '<option value="">— Select Faculty —</option>' + 
            data.users.map(f => `<option value="${f.username}">${f.full_name || f.username}${f.department ? ' (' + f.department + ')' : ''}</option>`).join('');
        } else {
          console.warn('[TimetableGenerator] No active users found');
          facultySelect.innerHTML = '<option value="" disabled>🚫 0 active users</option>';
        }
      }
    } catch (e) {
      console.error('[TimetableGenerator] Error loading faculty list:', e.message, e);
      const facultySelect = document.getElementById('tg_faculty_select');
      if (facultySelect) {
        facultySelect.innerHTML = '<option value="" disabled>⚠️ Unable to load users</option>';
      }
    }
  },

  renderGeneratorUI() {
    return `
<div class="card">
  <div class="card-header">
    <div class="card-title">⚙️ Timetable Generation Configuration</div>
  </div>
  
  <!-- Config Section -->
  <div class="form-section" style="margin-bottom:2rem">
    <h4 style="margin-bottom:1rem;font-weight:600">📋 Generation Settings</h4>
    <div class="form-row">
      <div class="form-group">
        <label>Academic Year</label>
        <input id="tg_academic_year" type="text" value="2025-26" placeholder="2025-26"/>
      </div>
      <div class="form-group">
        <label>Semester</label>
        <select id="tg_semester">
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
          <option value="3">Semester 3</option>
          <option value="4">Semester 4</option>
          <option value="5">Semester 5</option>
          <option value="6">Semester 6</option>
          <option value="7">Semester 7</option>
          <option value="8">Semester 8</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Algorithm</label>
        <select id="tg_algorithm">
          <option value="simulated_annealing">Simulated Annealing (Recommended)</option>
          <option value="genetic">Genetic Algorithm</option>
        </select>
      </div>
      <div class="form-group">
        <label>Algorithm Iterations</label>
        <input id="tg_iterations" type="number" value="10000" min="1000" step="1000"/>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Max Classes per Faculty per Week</label>
        <input id="tg_max_classes" type="number" value="5" min="1" max="20"/>
      </div>
      <div class="form-group">
        <label>Total Teaching Days per Week</label>
        <input id="tg_days_per_week" type="number" value="6" min="5" max="7"/>
      </div>
    </div>

    <button class="btn btn-primary" onclick="ttConfigSave()">💾 Save Configuration</button>
    <div id="tg_config_msg" class="mt-sm" style="display:none;padding:0.5rem;border-radius:4px"></div>
  </div>

</div>

<!-- Rooms Management Section -->
<div class="card" style="margin-top:1.5rem">
  <div class="card-header">
    <div class="card-title">🏫 Room Capacity Management</div>
  </div>
  
  <div style="margin-bottom:1rem">
    <div style="display:flex;gap:1rem;margin-bottom:1rem">
      <div style="flex:1">
        <label>Room Number</label>
        <input id="tg_room_number" placeholder="e.g., A101" style="width:100%"/>
      </div>
      <div style="flex:1">
        <label>Capacity</label>
        <input id="tg_room_capacity" type="number" value="60" min="10" style="width:100%"/>
      </div>
      <div style="flex:1">
        <label>Type</label>
        <select id="tg_room_type" style="width:100%">
          <option value="classroom">Classroom</option>
          <option value="lab">Lab</option>
          <option value="seminar">Seminar</option>
        </select>
      </div>
      <div style="flex:1">
        <label>&nbsp;</label>
        <button class="btn btn-sm btn-success" onclick="ttAddRoomInput()">➕ Add Room</button>
      </div>
    </div>

    <div id="tg_rooms_list" style="max-height:300px;overflow-y:auto;border:1px solid var(--border-color);border-radius:4px;padding:1rem">
      <div class="text-muted" style="text-align:center;padding:2rem">Loading rooms...</div>
    </div>

    <button class="btn btn-primary mt-md" onclick="ttRoomSave()">💾 Save Rooms</button>
    <div id="tg_room_msg" class="mt-sm" style="display:none;padding:0.5rem;border-radius:4px"></div>
  </div>
</div>

<!-- Faculty Constraints Section -->
<div class="card" style="margin-top:1.5rem">
  <div class="card-header">
    <div class="card-title">👨‍💼 Faculty Constraints</div>
  </div>
  
  <div style="margin-bottom:1rem">
    <h4 style="margin-bottom:1rem;font-weight:600">Set free hours for individual faculty</h4>
    
    <div class="form-row">
      <div class="form-group" style="flex:2">
        <label>Faculty Name</label>
        <select id="tg_faculty_select" style="width:100%">
          <option value="">— Loading faculty... —</option>
        </select>
      </div>
      <div class="form-group">
        <label>Max Classes/Week</label>
        <input id="tg_fac_max_classes" type="number" value="5" min="1" max="20"/>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label>Free Day</label>
        <select id="tg_fac_free_day">
          <option value="">None</option>
          <option value="Monday">Monday</option>
          <option value="Tuesday">Tuesday</option>
          <option value="Wednesday">Wednesday</option>
          <option value="Thursday">Thursday</option>
          <option value="Friday">Friday</option>
          <option value="Saturday">Saturday</option>
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <label>Free Periods (JSON)</label>
        <input id="tg_fac_free_periods" placeholder='{"Monday": [9,10], "Friday": [9,10]}' style="width:100%;font-family:monospace;font-size:0.85rem"/>
      </div>
    </div>

    <div class="form-check">
      <input type="checkbox" id="tg_fac_no_first" />
      <label for="tg_fac_no_first">No classes in first period</label>
    </div>

    <button class="btn btn-primary mt-md" onclick="ttFacultySave()">💾 Save Faculty Constraint</button>
    <div id="tg_fac_msg" class="mt-sm" style="display:none;padding:0.5rem;border-radius:4px"></div>
  </div>
</div>

<!-- Department Constraints Section -->
<div class="card" style="margin-top:1.5rem">
  <div class="card-header">
    <div class="card-title">🏛️ Department Free Hours</div>
  </div>
  
  <div style="margin-bottom:1rem">
    <h4 style="margin-bottom:1rem;font-weight:600">Set mandatory free periods for entire departments</h4>
    
    <div class="form-row">
      <div class="form-group">
        <label>Department</label>
        <select id="tg_dept_name">
          <option value="CSE">Computer Science (CSE)</option>
          <option value="ECE">Electronics (ECE)</option>
          <option value="EEE">Electrical (EEE)</option>
          <option value="MECH">Mechanical (Mech)</option>
          <option value="CIVIL">Civil</option>
          <option value="BBA">Business Administration (BBA)</option>
          <option value="IT">Information Technology (IT)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Free Day</label>
        <select id="tg_dept_free_day">
          <option value="Monday">Monday</option>
          <option value="Tuesday">Tuesday</option>
          <option value="Wednesday">Wednesday</option>
          <option value="Thursday">Thursday</option>
          <option value="Friday">Friday</option>
          <option value="Saturday">Saturday</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>Free Periods (comma-separated numbers, e.g., 9,10)</label>
      <input id="tg_dept_periods" placeholder="9,10" style="width:100%"/>
    </div>

    <div class="form-check">
      <input type="checkbox" id="tg_dept_mandatory" checked/>
      <label for="tg_dept_mandatory">Mandatory (cannot be violated)</label>
    </div>

    <button class="btn btn-primary mt-md" onclick="ttDeptSave()">💾 Save Department Constraint</button>
    <div id="tg_dept_msg" class="mt-sm" style="display:none;padding:0.5rem;border-radius:4px"></div>
  </div>
</div>

<!-- Break & Lunch Schedule Section -->
<div class="card" style="margin-top:1.5rem">
  <div class="card-header">
    <div class="card-title">⏰ Break & Lunch Schedule</div>
  </div>
  
  <div style="margin-bottom:1rem">
    <p style="color:var(--text-secondary);margin-bottom:1rem">Define breaks and lunch periods that classes cannot be scheduled during</p>
    
    <div id="tg_break_list" style="margin-bottom:1rem">
      <!-- Break entries will be added here -->
    </div>
    
    <button class="btn btn-outline" onclick="ttAddBreak()">➕ Add Break Period</button>
    <button class="btn btn-primary mt-md" onclick="ttBreakSave()">💾 Save Break Schedule</button>
    <div id="tg_break_msg" class="mt-sm" style="display:none;padding:0.5rem;border-radius:4px"></div>
  </div>
  
  <div style="padding:1rem;background:#f9f9f9;border-radius:4px;font-size:0.9rem">
    <strong>📌 Default Break Schedule:</strong><br>
    <div style="margin-top:0.5rem">
      • <strong>Morning Break</strong>: 10:30 - 10:45 (All days)<br>
      • <strong>Lunch Break</strong>: 13:00 - 14:00 (All days)
    </div>
  </div>
</div>

<!-- Generation Section -->
<div class="card" style="margin-top:1.5rem;border:2px solid var(--primary-color)")>
  <div class="card-header" style="background:linear-gradient(135deg,var(--primary-color),#0056b3);color:white;border-radius:4px 4px 0 0">
    <div class="card-title" style="color:white">🚀 Generate Timetable</div>
  </div>
  
  <div style="margin:1.5rem">
    <p style="margin-bottom:1rem;color:var(--text-secondary)">
      The system will automatically generate an optimized timetable respecting:
      <br/>✓ Faculty workload assignments
      <br/>✓ Room availability and capacity
      <br/>✓ Department and faculty constraints
      <br/>✓ Break schedules (defined above)
      <br/>✓ Class distribution (3 theory + 2 lab per subject per week)
    </p>

    <div id="tg_readiness_checks" style="margin-bottom:1.5rem;padding:1rem;background:#f5f5f5;border-radius:4px;border-left:4px solid var(--warning-color)">
      <div style="font-weight:600;margin-bottom:0.5rem">📋 Pre-Generation Checks</div>
      <div id="tg_checks_list" style="font-size:0.9rem;line-height:1.6">
        <div class="text-muted">Verifying data...</div>
      </div>
    </div>

    <button class="btn btn-success btn-lg" id="tg_gen_btn" onclick="ttGeneratorStart()" style="width:100%;padding:1rem">
      ⚡ START GENERATION
    </button>

    <div id="tg_gen_progress" style="display:none;margin-top:1rem">
      <div style="font-weight:600;margin-bottom:0.5rem">Generation Progress</div>
      <div class="progress-bar" style="height:30px;background:#f0f0f0;border-radius:4px;overflow:hidden">
        <div id="tg_gen_progress_fill" style="height:100%;background:linear-gradient(90deg,#4CAF50,#8BC34A);width:0%;transition:width 0.3s;display:flex;align-items:center;justify-content:center;color:white;font-weight:600"></div>
      </div>
    </div>

    <div id="tg_gen_msg" class="mt-md" style="display:none;padding:1rem;border-radius:4px;font-weight:500"></div>

    <div id="tg_gen_results" style="display:none;margin-top:1.5rem;padding:1rem;background:#f0f8ff;border:1px solid #0066cc;border-radius:4px">
      <h4 style="margin-bottom:0.5rem;color:#0066cc">✅ Generation Complete</h4>
      <div id="tg_gen_summary" style="font-size:0.9rem;line-height:1.8">
        <!-- Results will be shown here -->
      </div>
      <button class="btn btn-success mt-md" onclick="ttFinalizeTimetable()">✓ Accept & Finalize Timetable</button>
      <button class="btn btn-outline mt-md" onclick="ttValidateTimetable()">🔍 Validate & Check Conflicts</button>
      <button class="btn btn-outline mt-md" onclick="ttRejectTimetable()">✗ Reject & Retry</button>
    </div>
  </div>
</div>

<!-- Validation Section -->
<div class="card" style="margin-top:1.5rem">
  <div class="card-header">
    <div class="card-title">🔍 Validate Current Timetable</div>
  </div>
  
  <div style="margin:1.5rem">
    <p class="text-secondary" style="margin-bottom:1rem">Analyze the current timetable for conflicts and constraint violations</p>
    
    <button class="btn btn-info" onclick="ttValidateTimetable()">🔍 Run Validation</button>
    
    <div id="tg_validation_results" style="display:none;margin-top:1rem">
      <h4 style="margin-bottom:0.5rem">Validation Results</h4>
      <div id="tg_validation_content"></div>
    </div>
  </div>
</div>
    `;
  },

  // ────────────────────────────────────────────────────────────────────
  // Configuration Management
  // ────────────────────────────────────────────────────────────────────

  async loadConfiguration() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      const sem = document.getElementById('tg_semester')?.value || '1';
      
      console.log('[TimetableGenerator] Loading configuration for', year, 'semester', sem);
      const url = `${window.AMS_CONFIG.API_URL}/api/timetable/config?academic_year=${year}&semester=${sem}`;
      
      const response = await fetch(url);
      console.log('[TimetableGenerator] Config response status:', response.status);
      
      if (!response.ok) {
        console.warn('[TimetableGenerator] Config not found (', response.status, '), using defaults');
        return; // Silently use defaults
      }
      
      const data = await response.json();
      console.log('[TimetableGenerator] Configuration loaded:', data);
      
      if (data.success && data.config) {
        const cfg = data.config;
        if (document.getElementById('tg_algorithm')) document.getElementById('tg_algorithm').value = cfg.generation_algorithm || 'simulated_annealing';
        if (document.getElementById('tg_iterations')) document.getElementById('tg_iterations').value = cfg.algorithm_iterations || 10000;
        if (document.getElementById('tg_max_classes')) document.getElementById('tg_max_classes').value = cfg.max_hours_per_faculty || 5;
        if (document.getElementById('tg_days_per_week')) document.getElementById('tg_days_per_week').value = cfg.total_days_per_week || 6;
      }
    } catch (e) {
      console.warn('[TimetableGenerator] Configuration load failed, using defaults:', e.message);
      // Silently fall back to defaults - user sees the default values in the form
    }
  },

  async saveConfiguration() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      const sem = parseInt(document.getElementById('tg_semester')?.value || '1');
      const algorithm = document.getElementById('tg_algorithm')?.value || 'simulated_annealing';
      const iterations = parseInt(document.getElementById('tg_iterations')?.value || 10000);
      const maxClasses = parseInt(document.getElementById('tg_max_classes')?.value || 5);
      const daysPerWeek = parseInt(document.getElementById('tg_days_per_week')?.value || 6);
      
      const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year: year,
          semester: sem,
          generation_algorithm: algorithm,
          algorithm_iterations: iterations,
          max_hours_per_faculty: maxClasses,
          total_days_per_week: daysPerWeek
        })
      });
      
      const data = await response.json();
      const msgEl = document.getElementById('tg_config_msg');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.background = data.success ? '#d4edda' : '#f8d7da';
        msgEl.style.color = data.success ? '#155724' : '#721c24';
        msgEl.textContent = data.success ? '✅ Configuration saved successfully' : '❌ ' + (data.error || 'Failed to save');
      }
    } catch (e) {
      const msgEl = document.getElementById('tg_config_msg');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.background = '#f8d7da';
        msgEl.style.color = '#721c24';
        msgEl.textContent = '❌ Error: ' + e.message;
      }
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Room Management
  // ────────────────────────────────────────────────────────────────────

  async loadRoomList() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      console.log('[TimetableGenerator] Loading rooms for year', year);
      const url = `${window.AMS_CONFIG.API_URL}/api/timetable/rooms?academic_year=${year}`;
      
      const response = await fetch(url);
      console.log('[TimetableGenerator] Rooms response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[TimetableGenerator] Rooms data received:', data);
      
      const listEl = document.getElementById('tg_rooms_list');
      if (listEl) {
        if (!data.success || !data.rooms || data.rooms.length === 0) {
          console.warn('[TimetableGenerator] No rooms found');
          listEl.innerHTML = '<div style="text-align:center;padding:1.5rem;color:#6c757d;background:#f8f9fa;border-radius:4px;border:1px solid #e0e0e0">🚫 <strong>No timetable rooms found</strong><br/><small>Add rooms using "Add Room" button below</small></div>';
          return;
        }
        
        console.log('[TimetableGenerator] Populating', data.rooms.length, 'rooms');
        listEl.innerHTML = data.rooms.map(r => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border-bottom:1px solid var(--border-color);font-size:0.9rem">
            <div>
              <strong>${r.room_number}</strong> (${r.room_type}) - Capacity: ${r.capacity}
            </div>
            <div>${r.is_available ? '✅ Available' : '❌ Unavailable'}</div>
          </div>
        `).join('');
      }
    } catch (e) {
      console.error('[TimetableGenerator] Error loading rooms:', e.message, e);
      const listEl = document.getElementById('tg_rooms_list');
      if (listEl) {
        listEl.innerHTML = `<div style="padding:1rem;background:#fff3cd;color:#856404;border-radius:4px;text-align:center">
          ⚠️ <strong>Unable to load rooms</strong> - try adding rooms manually below
        </div>`;
      }
    }
  },

  async saveRooms() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      // For now, just add one room - in full implementation would collect all added rooms
      const roomNumber = document.getElementById('tg_room_number')?.value;
      const capacity = parseInt(document.getElementById('tg_room_capacity')?.value || 60);
      const roomType = document.getElementById('tg_room_type')?.value || 'classroom';
      
      if (!roomNumber || roomNumber.trim() === '') {
        alert('Please enter a room number');
        return;
      }
      
      const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year: year,
          rooms: [{
            room_number: roomNumber,
            capacity: capacity,
            room_type: roomType,
            is_available: true
          }]
        })
      });
      
      const data = await response.json();
      const msgEl = document.getElementById('tg_room_msg');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.background = data.success ? '#d4edda' : '#f8d7da';
        msgEl.style.color = data.success ? '#155724' : '#721c24';
        msgEl.textContent = data.success ? '✅ Room saved' : '❌ ' + (data.error || 'Failed');
      }
      
      if (data.success) {
        document.getElementById('tg_room_number').value = '';
        document.getElementById('tg_room_capacity').value = '60';
        this.loadRoomList();
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Faculty Constraints
  // ────────────────────────────────────────────────────────────────────

  async saveFacultyConstraint() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      const sem = parseInt(document.getElementById('tg_semester')?.value || '1');
      const faculty = document.getElementById('tg_faculty_select')?.value;
      
      if (!faculty) {
        alert('Please select a faculty member');
        return;
      }
      
      const maxClasses = parseInt(document.getElementById('tg_fac_max_classes')?.value || 5);
      const freePeriodsJson = document.getElementById('tg_fac_free_periods')?.value || '{}';
      const noFirst = document.getElementById('tg_fac_no_first')?.checked || false;
      
      let freePeriods = {};
      try {
        freePeriods = JSON.parse(freePeriodsJson);
      } catch (e) {
        alert('Invalid JSON in free periods field');
        return;
      }
      
      const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/constraints/faculty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year: year,
          semester: sem,
          faculty_username: faculty,
          max_classes_per_week: maxClasses,
          free_periods: freePeriods,
          no_first_period: noFirst
        })
      });
      
      const data = await response.json();
      const msgEl = document.getElementById('tg_fac_msg');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.background = data.success ? '#d4edda' : '#f8d7da';
        msgEl.style.color = data.success ? '#155724' : '#721c24';
        msgEl.textContent = data.success ? '✅ Constraint saved' : '❌ ' + (data.error || 'Failed');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Department Constraints
  // ────────────────────────────────────────────────────────────────────

  async saveDepartmentConstraint() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      const sem = parseInt(document.getElementById('tg_semester')?.value || '1');
      const dept = document.getElementById('tg_dept_name')?.value;
      const freeDay = document.getElementById('tg_dept_free_day')?.value;
      const periodsStr = document.getElementById('tg_dept_periods')?.value || '';
      const mandatory = document.getElementById('tg_dept_mandatory')?.checked || false;
      
      if (!dept || !freeDay || !periodsStr.trim()) {
        alert('Please fill all required fields');
        return;
      }
      
      const periods = periodsStr.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
      if (periods.length === 0) {
        alert('Please enter valid period numbers (comma-separated)');
        return;
      }
      
      const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/constraints/department`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year: year,
          semester: sem,
          department: dept,
          free_day: freeDay,
          free_periods: periods,
          is_mandatory: mandatory
        })
      });
      
      const data = await response.json();
      const msgEl = document.getElementById('tg_dept_msg');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.background = data.success ? '#d4edda' : '#f8d7da';
        msgEl.style.color = data.success ? '#155724' : '#721c24';
        msgEl.textContent = data.success ? '✅ Constraint saved' : '❌ ' + (data.error || 'Failed');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Break & Lunch Schedule Management
  // ────────────────────────────────────────────────────────────────────

  addBreakRow() {
    const container = document.getElementById('tg_break_list');
    if (!container) return;
    
    const row = document.createElement('div');
    row.className = 'break-row';
    row.style.cssText = 'margin-bottom:1rem;padding:1rem;background:#fff;border:1px solid #ddd;border-radius:4px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:0.5rem;align-items:end';
    
    row.innerHTML = `
      <div>
        <label style="font-size:0.85rem">Day</label>
        <select class="break-day" style="width:100%">
          <option value="Monday">Monday</option>
          <option value="Tuesday">Tuesday</option>
          <option value="Wednesday">Wednesday</option>
          <option value="Thursday">Thursday</option>
          <option value="Friday">Friday</option>
          <option value="Saturday">Saturday</option>
        </select>
      </div>
      <div>
        <label style="font-size:0.85rem">Start Time</label>
        <input type="time" class="break-start" style="width:100%"/>
      </div>
      <div>
        <label style="font-size:0.85rem">End Time</label>
        <input type="time" class="break-end" style="width:100%"/>
      </div>
      <div>
        <label style="font-size:0.85rem">Type</label>
        <select class="break-type" style="width:100%">
          <option value="break">Break (10:30-10:45)</option>
          <option value="lunch">Lunch (13:00-14:00)</option>
        </select>
      </div>
      <button class="btn btn-sm btn-outline" type="button" onclick="this.closest('.break-row').remove()">🗑️</button>
    `;
    
    container.appendChild(row);
  },

  async saveBreakSchedule() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      const sem = parseInt(document.getElementById('tg_semester')?.value || '1');
      
      const breakRows = document.querySelectorAll('.break-row');
      if (breakRows.length === 0) {
        alert('Please add at least one break period');
        return;
      }
      
      const breaks = [];
      breakRows.forEach(row => {
        const day = row.querySelector('.break-day')?.value;
        const start = row.querySelector('.break-start')?.value;
        const end = row.querySelector('.break-end')?.value;
        const type = row.querySelector('.break-type')?.value;
        
        if (day && start && end) {
          breaks.push({
            day_of_week: day,
            start_time: start,
            end_time: end,
            break_type: type
          });
        }
      });
      
      if (breaks.length === 0) {
        alert('Please fill all break fields');
        return;
      }
      
      const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/breaks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year: year,
          semester: sem,
          breaks: breaks
        })
      });
      
      const data = await response.json();
      const msgEl = document.getElementById('tg_break_msg');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.background = data.success ? '#d4edda' : '#f8d7da';
        msgEl.style.color = data.success ? '#155724' : '#721c24';
        msgEl.textContent = data.success ? '✅ ' + breaks.length + ' breaks saved' : '❌ ' + (data.error || 'Failed');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Timetable Generation
  // ────────────────────────────────────────────────────────────────────

  async startGeneration() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      const sem = parseInt(document.getElementById('tg_semester')?.value || '1');
      const algorithm = document.getElementById('tg_algorithm')?.value || 'simulated_annealing';
      
      const genBtn = document.getElementById('tg_gen_btn');
      if (genBtn) genBtn.disabled = true;
      
      // Use enhanced endpoint that considers breaks and class distribution
      const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/generate-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year: year,
          semester: sem,
          algorithm: algorithm
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        const msgEl = document.getElementById('tg_gen_msg');
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.style.background = '#f8d7da';
          msgEl.style.color = '#721c24';
          msgEl.textContent = '❌ ' + (data.error || 'Generation failed');
        }
        if (genBtn) genBtn.disabled = false;
        return;
      }
      
      // Show generation results
      const resultsEl = document.getElementById('tg_gen_results');
      if (resultsEl) {
        resultsEl.style.display = 'block';
        const summaryEl = document.getElementById('tg_gen_summary');
        if (summaryEl) {
          summaryEl.innerHTML = `
            <div>✅ Generation started successfully</div>
            <div>📊 Assignments loaded: ${data.assignments_count}</div>
            <div>🏫 Rooms available: ${data.rooms_count}</div>
            <div>📚 Subjects: ${data.subjects_count}</div>
            <div style="margin-top:1rem;padding:1rem;background:#fff;border-radius:4px;border-left:4px solid #7c3aed">
              <strong>Algorithm:</strong> ${algorithm === 'genetic' ? 'Genetic Algorithm' : 'Simulated Annealing'}<br>
              <strong>Expected duration:</strong> 2-5 minutes<br>
              <strong>Note:</strong> Click "Accept & Finalize" to save the generated timetable to the database.
            </div>
          `;
        }
      }
      
      if (genBtn) genBtn.disabled = false;
    } catch (e) {
      const msgEl = document.getElementById('tg_gen_msg');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.style.background = '#f8d7da';
        msgEl.style.color = '#721c24';
        msgEl.textContent = '❌ Error: ' + e.message;
      }
      const genBtn = document.getElementById('tg_gen_btn');
      if (genBtn) genBtn.disabled = false;
    }
  },

  // ────────────────────────────────────────────────────────────────────
  // Validation
  // ────────────────────────────────────────────────────────────────────

  async validateTimetable() {
    try {
      const year = document.getElementById('tg_academic_year')?.value || '2025-26';
      const sem = parseInt(document.getElementById('tg_semester')?.value || '1');
      
      const response = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academic_year: year,
          semester: sem
        })
      });
      
      const data = await response.json();
      const resultsEl = document.getElementById('tg_validation_results');
      if (resultsEl) {
        resultsEl.style.display = 'block';
        const content = document.getElementById('tg_validation_content');
        if (content) {
          if (!data.success) {
            content.innerHTML = `<div class="alert alert-danger">Error: ${data.error}</div>`;
            return;
          }
          
          content.innerHTML = `
            <div style="padding:1rem;background:#f5f5f5;border-radius:4px;margin-bottom:1rem">
              <strong>Summary:</strong><br>
              Total Slots: ${data.total_slots}<br>
              Conflicts Found: <strong style="color:#d32f2f">${data.conflict_count}</strong><br>
              Warnings: <strong style="color:#f57c00">${data.warning_count}</strong>
            </div>
            
            ${data.conflict_count > 0 ? `
              <div style="background:#ffebee;border:1px solid #f44336;border-radius:4px;padding:1rem;margin-bottom:1rem">
                <div style="color:#d32f2f;font-weight:600;margin-bottom:0.5rem">⚠️ Hard Conflicts (${data.conflicts.length})</div>
                <div style="font-size:0.9rem;max-height:200px;overflow-y:auto">
                  ${data.conflicts.map(c => `
                    <div style="padding:0.5rem;background:#fff;border-left:3px solid #f44336;margin-bottom:0.25rem">
                      <strong>${c.type}</strong>: ${JSON.stringify(c).substring(0,100)}...
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            
            ${data.warning_count > 0 ? `
              <div style="background:#fff3e0;border:1px solid #ff9800;border-radius:4px;padding:1rem">
                <div style="color:#d37000;font-weight:600;margin-bottom:0.5rem">⚠️ Soft Constraint Violations (${data.warnings.length})</div>
                <div style="font-size:0.9rem;max-height:200px;overflow-y:auto">
                  ${data.warnings.map(w => `
                    <div style="padding:0.5rem;background:#fff;border-left:3px solid #ff9800;margin-bottom:0.25rem">
                      <strong>${w.type}</strong>: ${JSON.stringify(w).substring(0,100)}...
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : `
              <div style="background:#e8f5e9;border:1px solid #4caf50;border-radius:4px;padding:1rem;color:#2e7d32">
                ✅ No soft constraint violations found!
              </div>
            `}
          `;
        }
      }
    } catch (e) {
      alert('Validation error: ' + e.message);
    }
  }
};

// Helper functions (not part of TimetableGeneratorUI object)
window.ttAddRoomInput = function() {
  const num = document.getElementById('tg_room_number')?.value;
  const cap = document.getElementById('tg_room_capacity')?.value || '60';
  const type = document.getElementById('tg_room_type')?.value || 'classroom';
  
  if (num && num.trim()) {
    const listEl = document.getElementById('tg_rooms_list');
    if (listEl) {
      const html = listEl.innerHTML;
      const newRoom = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;border-bottom:1px solid var(--border-color);font-size:0.9rem">
          <div>
            <strong>${num}</strong> (${type}) - Capacity: ${cap}
          </div>
          <div>✓ Ready to save</div>
        </div>
      `;
      listEl.innerHTML = (html.includes('No rooms') ? newRoom : html + newRoom);
    }
  }
};

// Auto-initialize when included
TimetableGeneratorUI.init();
