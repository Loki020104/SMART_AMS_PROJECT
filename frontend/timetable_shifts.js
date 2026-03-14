/**
 * Shift-Based Timetable Display with Break Management
 * Frontend component for displaying timetable with breaks, lunch, and shift info
 */

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD AND RENDER SHIFT-BASED TIMETABLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load student timetable with breaks from API
 */
async function loadStudentTimetableWithBreaks() {
  const roll_no = AMS.profile?.roll_no;
  
  if (!roll_no) {
    console.error("Roll number not found");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/timetable/student/${roll_no}`);
    const data = await response.json();

    if (data.success) {
      AMS.timetableData = data;
      renderTimetableWithBreaks(data);
      displayBreaksInfo(data.breaks_summary);
      displayShiftInfo(data.shift_info);
    } else {
      console.error("Failed to load timetable:", data.error);
      document.getElementById("timetable-container").innerHTML = 
        `<div class="alert alert-warning">No timetable available</div>`;
    }
  } catch (error) {
    console.error("Timetable API error:", error);
  }
}

/**
 * Render timetable with visual breaks and lunch periods
 */
function renderTimetableWithBreaks(timetableData) {
  const container = document.getElementById("timetable-container");
  
  if (!container) {
    console.warn("Timetable container not found");
    return;
  }

  const timetable = timetableData.timetable;
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  // Create main timetable HTML
  let html = `
    <div class="timetable-wrapper">
      <div class="timetable-header">
        <h3>📅 My Timetable</h3>
        <p class="text-muted">Batch: <strong>${timetableData.batch || "All"}</strong> | Total Classes: <strong>${timetableData.total_classes}</strong></p>
      </div>
      
      <ul class="nav nav-tabs timetable-tabs" role="tablist">
  `;

  // Create tabs for each day
  days.forEach((day, index) => {
    const activeClass = index === 0 ? "active" : "";
    html += `
      <li class="nav-item">
        <a class="nav-link ${activeClass}" data-toggle="tab" href="#${day.toLowerCase()}-tab" role="tab">
          ${day.substring(0, 3)}
        </a>
      </li>
    `;
  });

  html += `
      </ul>

      <div class="tab-content timetable-content">
  `;

  // Create tab content for each day
  days.forEach((day, index) => {
    const activeClass = index === 0 ? "active" : "";
    const dayData = timetable[day];

    html += `
      <div class="tab-pane fade ${activeClass}" id="${day.toLowerCase()}-tab" role="tabpanel">
        <div class="day-timetable">
    `;

    // Check if there are any classes
    const hasClasses = dayData.shift_1.classes.length > 0 || dayData.shift_2.classes.length > 0;

    if (!hasClasses) {
      html += `<div class="alert alert-info">No classes scheduled on ${day}</div>`;
    } else {
      // Render both shifts
      [1, 2].forEach(shiftNum => {
        const shiftKey = `shift_${shiftNum}`;
        const shiftData = dayData[shiftKey];

        if (shiftData.classes.length === 0 && shiftData.breaks.length === 0) {
          return; // Skip if no classes or breaks
        }

        html += `<div class="shift-block">`;
        html += `<div class="shift-header">${shiftData.shift_name || `Shift ${shiftNum}`}</div>`;
        html += `<div class="shift-time">${shiftData.time_range}</div>`;
        html += `<div class="schedule-block">`;

        // Combine classes and breaks, sort by time
        const items = [];

        // Add classes
        shiftData.classes.forEach(cls => {
          items.push({
            type: "class",
            startTime: cls.time_start,
            data: cls
          });
        });

        // Add breaks
        shiftData.breaks.forEach(brk => {
          items.push({
            type: "break",
            startTime: brk.time_start,
            data: brk
          });
        });

        // Sort by time
        items.sort((a, b) => {
          const timeA = timeStringToMinutes(a.startTime);
          const timeB = timeStringToMinutes(b.startTime);
          return timeA - timeB;
        });

        // Render each item
        items.forEach(item => {
          if (item.type === "class") {
            html += renderClassSlot(item.data);
          } else {
            html += renderBreakSlot(item.data);
          }
        });

        html += `</div>`;
        html += `</div>`;
      });
    }

    html += `
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
  
  // Initialize Bootstrap tabs if available
  if (typeof jQuery !== "undefined") {
    jQuery('[data-toggle="tab"]').on("click", function() {
      jQuery(this).tab("show");
    });
  }
}

/**
 * Render a class slot with subject, time, room, faculty
 */
function renderClassSlot(classData) {
  const subjectType = classData.type || "core";
  const typeColor = {
    core: "#007bff",
    lab: "#28a745",
    elective: "#ffc107",
    tutorial: "#17a2b8"
  }[subjectType] || "#6c757d";

  const batchInfo = classData.batch ? ` (${classData.batch})` : "";

  return `
    <div class="class-slot" style="border-left: 4px solid ${typeColor}">
      <div class="class-header">
        <span class="class-code">${classData.subject_code}${batchInfo}</span>
        <span class="class-time">
          <i class="far fa-clock"></i> ${classData.time_start} - ${classData.time_end}
        </span>
      </div>
      <div class="class-name">${classData.subject_name}</div>
      <div class="class-details">
        ${classData.room ? `<span class="detail-item"><i class="fas fa-door-open"></i> ${classData.room}</span>` : ""}
        ${classData.faculty ? `<span class="detail-item"><i class="fas fa-chalkboard-user"></i> ${classData.faculty}</span>` : ""}
      </div>
    </div>
  `;
}

/**
 * Render a break/lunch slot with special styling
 */
function renderBreakSlot(breakData) {
  const breakTypeIcon = {
    lunch: "🍽️",
    break: "☕",
    assembly: "📣",
    special: "⭐"
  }[breakData.break_type] || "⏸️";

  const breakTypeClass = breakData.break_type === "lunch" ? "lunch-break" : "tea-break";

  return `
    <div class="break-slot ${breakTypeClass}">
      <div class="break-content">
        <span class="break-icon">${breakTypeIcon}</span>
        <span class="break-name">${breakData.break_name}</span>
        <span class="break-time">
          ${breakData.time_start} - ${breakData.time_end} (${breakData.duration_minutes} min)
        </span>
      </div>
    </div>
  `;
}

/**
 * Display break and lunch timing summary
 */
function displayBreaksInfo(breaksSummary) {
  const container = document.getElementById("breaks-info-container");
  
  if (!container) return;

  let html = `<div class="breaks-summary">`;
  html += `<h5>⏰ Break & Lunch Timings</h5>`;
  html += `<div class="breaks-grid">`;

  if (breaksSummary.tea_break) {
    const br = breaksSummary.tea_break;
    html += `
      <div class="break-info-card tea">
        <div class="break-title">☕ ${br.name}</div>
        <div class="break-detail">${br.duration} minutes</div>
        <div class="break-shifts">
          ${br.shift_1 ? '<span class="badge badge-info">Shift 1</span>' : ''}
          ${br.shift_2 ? '<span class="badge badge-info">Shift 2</span>' : ''}
        </div>
      </div>
    `;
  }

  if (breaksSummary.lunch_break) {
    const br = breaksSummary.lunch_break;
    html += `
      <div class="break-info-card lunch">
        <div class="break-title">🍽️ ${br.name}</div>
        <div class="break-detail">${br.duration} minutes</div>
        <div class="break-shifts">
          ${br.shift_1 ? '<span class="badge badge-warning">Shift 1</span>' : ''}
          ${br.shift_2 ? '<span class="badge badge-warning">Shift 2</span>' : ''}
        </div>
      </div>
    `;
  }

  breaksSummary.other_breaks.forEach(br => {
    html += `
      <div class="break-info-card other">
        <div class="break-title">${br.name}</div>
        <div class="break-detail">${br.duration} minutes</div>
      </div>
    `;
  });

  html += `</div></div>`;
  container.innerHTML = html;
}

/**
 * Display shift configuration info
 */
function displayShiftInfo(shiftInfo) {
  const container = document.getElementById("shift-info-container");
  
  if (!container) return;

  let html = `<div class="shift-summary">`;
  html += `<h5>🕐 Shift Timings</h5>`;
  html += `<div class="shifts-grid">`;

  Object.keys(shiftInfo).forEach(shiftKey => {
    const shift = shiftInfo[shiftKey];
    const shiftNum = shiftKey.replace("shift_", "");
    const icon = shiftNum === "1" ? "🌅" : "🌆";

    html += `
      <div class="shift-config-card">
        <div class="shift-label">${icon} ${shift.name}</div>
        <div class="shift-time">
          <strong>${shift.starts}</strong> to <strong>${shift.ends}</strong>
        </div>
      </div>
    `;
  });

  html += `</div></div>`;
  container.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert time string (HH:MM) to total minutes
 */
function timeStringToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Load faculty timetable with breaks
 */
async function loadFacultyTimetableWithBreaks(facultyId) {
  try {
    const response = await fetch(`${API_URL}/api/timetable/faculty/${facultyId}`);
    const data = await response.json();

    if (data.success) {
      AMS.facultyTimetable = data;
      renderTimetableWithBreaks(data);
      displayBreaksInfo(data.breaks_summary);
      displayShiftInfo(data.shift_info);
    }
  } catch (error) {
    console.error("Faculty timetable error:", error);
  }
}

/**
 * Load break timings for a specific shift
 */
async function loadBreakTimings(shiftNumber = null) {
  try {
    const params = new URLSearchParams();
    if (shiftNumber) params.append("shift", shiftNumber);

    const response = await fetch(`${API_URL}/api/break-timings?${params}`);
    const data = await response.json();

    if (data.success) {
      AMS.breakTimings = data.breaks;
      return data.breaks;
    }
  } catch (error) {
    console.error("Break timings error:", error);
  }
}

/**
 * Load shift configuration
 */
async function loadShiftConfiguration() {
  try {
    const response = await fetch(`${API_URL}/api/shift-config`);
    const data = await response.json();

    if (data.success) {
      AMS.shiftConfig = data.shifts;
      return data.shifts;
    }
  } catch (error) {
    console.error("Shift config error:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS STYLES (add to your main CSS file)
// ═══════════════════════════════════════════════════════════════════════════════

/*

.timetable-wrapper {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
}

.timetable-header {
  margin-bottom: 15px;
  border-bottom: 2px solid #dee2e6;
  padding-bottom: 10px;
}

.timetable-header h3 {
  margin: 0 0 5px 0;
  color: #2c3e50;
}

.timetable-tabs {
  margin-bottom: 0;
  border-bottom: 1px solid #dee2e6;
  background: white;
  border-radius: 4px 4px 0 0;
}

.nav-tabs .nav-link {
  color: #495057;
  border: none;
  border-bottom: 3px solid transparent;
  margin-bottom: 0;
  padding: 10px 20px;
}

.nav-tabs .nav-link:hover {
  border-bottom-color: #007bff;
  color: #007bff;
}

.nav-tabs .nav-link.active {
  border-bottom-color: #007bff;
  color: #007bff;
  background: transparent;
}

.timetable-content {
  background: white;
  padding: 20px;
  border-radius: 0 4px 4px 4px;
  min-height: 400px;
}

.day-timetable {
  display: grid;
  gap: 25px;
}

.shift-block {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.shift-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 15px;
  font-weight: 600;
  font-size: 14px;
}

.shift-time {
  background: #f0f4ff;
  padding: 8px 15px;
  font-size: 13px;
  color: #667eea;
  border-bottom: 1px solid #dee2e6;
}

.schedule-block {
  padding: 15px;
  display: grid;
  gap: 12px;
}

/* Class Slot Styling */

.class-slot {
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 12px;
  transition: all 0.3s ease;
  cursor: pointer;
}

.class-slot:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.class-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.class-code {
  font-weight: 700;
  color: #2c3e50;
  font-size: 14px;
}

.class-time {
  font-size: 12px;
  color: #6c757d;
  display: flex;
  align-items: center;
  gap: 4px;
}

.class-name {
  color: #495057;
  font-size: 13px;
  margin-bottom: 8px;
}

.class-details {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: #6c757d;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Break Slot Styling */

.break-slot {
  background: #f0f4ff;
  border: 2px dashed #adb5bd;
  border-radius: 6px;
  padding: 12px;
  text-align: center;
  font-weight: 500;
  color: #6c757d;
}

.break-slot.lunch-break {
  background: #fff3cd;
  border-color: #ffc107;
  color: #856404;
}

.break-slot.tea-break {
  background: #d1ecf1;
  border-color: #17a2b8;
  color: #0c5460;
}

.break-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.break-icon {
  font-size: 20px;
}

.break-name {
  font-weight: 600;
  font-size: 14px;
}

.break-time {
  font-size: 12px;
  opacity: 0.8;
}

/* Break Info Cards */

.breaks-summary,
.shift-summary {
  background: white;
  border-radius: 8px;
  padding: 15px;
  margin: 15px 0;
  border-left: 4px solid #667eea;
}

.breaks-summary h5,
.shift-summary h5 {
  margin: 0 0 12px 0;
  color: #2c3e50;
}

.breaks-grid,
.shifts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.break-info-card {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 12px;
  border-left: 4px solid #6c757d;
  text-align: center;
}

.break-info-card.tea {
  border-left-color: #17a2b8;
  background: #d1ecf1;
}

.break-info-card.lunch {
  border-left-color: #ffc107;
  background: #fff3cd;
}

.break-title {
  font-weight: 600;
  font-size: 13px;
  color: #2c3e50;
  margin-bottom: 6px;
}

.break-detail {
  font-size: 12px;
  color: #6c757d;
  margin-bottom: 6px;
}

.break-shifts {
  display: flex;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.shift-config-card {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 12px;
  border: 1px solid #dee2e6;
  text-align: center;
}

.shift-label {
  font-weight: 600;
  font-size: 13px;
  color: #2c3e50;
  margin-bottom: 6px;
}

.shift-time {
  font-size: 12px;
  color: #6c757d;
}

*/
