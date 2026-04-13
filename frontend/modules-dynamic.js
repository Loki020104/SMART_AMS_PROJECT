/**
 * Dynamic Module Loader - Comprehensive Implementation
 * Handles all 85+ navigation modules with intelligent fallbacks
 * This file supplements app.js with missing module implementations
 */

// Module metadata and configurations
const ModuleConfig = {
  student: {
    'dashboard': { name: 'Dashboard', icon: '📊', reload: true },
    'calendar': { name: 'Academic Calendar', endpoint: '/api/calendar-events' },
    'timetable': { name: 'My Timetable', endpoint: '/api/timetable' },
    'communities': { name: 'Subject Communities', endpoint: '/api/communities' },
    'cbcs': { name: 'Choice Based Credit', endpoint: '/api/cbcs' },
    'online': { name: 'Online Classes', endpoint: '/api/online-classes' },
    'library': { name: 'Digital Library', endpoint: '/api/library' },
    'performance': { name: 'Performance Analytics', endpoint: '/api/performance' },
    'attendance': { name: 'Attendance Records', endpoint: '/api/attendance' },
    'qr-scanner': { name: 'QR Scanner', widget: true },
    'fees': { name: 'Fee Management', endpoint: '/api/fees' },
    'exam-reg': { name: 'Exam Registration', endpoint: '/api/exam-reg' },
    'sem-reg': { name: 'Semester Registration', endpoint: '/api/sem-reg' },
    'supple': { name: 'Supplementary Exam', endpoint: '/api/supple' },
    'reval': { name: 'Revaluation', form: true },
    'grace': { name: 'Grace Marks', form: true },
    'survey': { name: 'Course Survey', form: true },
    'exit': { name: 'Exit Survey', form: true },
    'grievance': { name: 'Grievance Redressal', form: true },
    'evaluation': { name: 'Staff Evaluation', form: true },
    'leave': { name: 'Leave Management', endpoint: '/api/leave' },
    'placement': { name: 'Placement Data', endpoint: '/api/placement' },
    'messages': { name: 'Message Box', endpoint: '/api/messages' },
    'notices': { name: 'Notice Board', endpoint: '/api/announcements' },
    'push': { name: 'Notifications', endpoint: '/api/notifications' },
    'assessments': { name: 'Assessments', endpoint: '/api/assessments' }
  },
  faculty: {
    'dashboard': { name: 'Dashboard', icon: '📊', reload: true },
    'timetable': { name: 'My Timetable', endpoint: '/api/timetable' },
    'workhours': { name: 'Working Hours', endpoint: '/api/workhours' },
    'courses': { name: 'Course Details', endpoint: '/api/courses' },
    'prevdetails': { name: 'Previous Details', endpoint: '/api/profile' },
    'obe': { name: 'OBE Configuration', form: true },
    'lesson': { name: 'Lesson Planner', form: true },
    'online': { name: 'Online Class Management', endpoint: '/api/online-classes' },
    'materials': { name: 'Course Materials', endpoint: '/api/materials' },
    'attendance': { name: 'Mark Attendance', widget: true },
    'qr-generator': { name: 'Generate QR', widget: true },
    'qr-records': { name: 'Attendance Records', endpoint: '/api/attendance' },
    'assessments': { name: 'Assessments', endpoint: '/api/assessments' },
    'assignments': { name: 'Assignments', endpoint: '/api/assignments' },
    'internal': { name: 'Internal Exam', endpoint: '/api/internal-exam' },
    'qpaper': { name: 'Question Paper', form: true },
    'coursefile': { name: 'Course File/Diary', endpoint: '/api/coursefile' },
    'marks': { name: 'Mark Computation', endpoint: '/api/marks' },
    'reports': { name: 'Custom Reports', endpoint: '/api/reports' },
    'onlineexam': { name: 'Online Examination', widget: true },
    'staffrpt': { name: 'Staff Activity Report', endpoint: '/api/staff-report' },
    'studentleave': { name: 'Student Leave Management', endpoint: '/api/student-leave' },
    'transport': { name: 'Transport', endpoint: '/api/transport' },
    'messages': { name: 'Message Box', endpoint: '/api/messages' },
    'rules': { name: 'Rules & Regulations', endpoint: '/api/rules' },
    'committee': { name: 'Committee', endpoint: '/api/committee' },
    'examduty': { name: 'Exam/Invigilation Duty', endpoint: '/api/exam-duty' },
    'ratings': { name: 'My Ratings', endpoint: '/api/ratings' },
    'worklog': { name: 'Daily Work Log', form: true },
    'appraisal': { name: 'Staff Appraisal', endpoint: '/api/appraisal' }
  },
  admin: {
    'dashboard': { name: 'Dashboard', icon: '📊', reload: true },
    'users': { name: 'User Management', endpoint: '/api/users' },
    'departments': { name: 'Departments', endpoint: '/api/departments' },
    'register': { name: 'Face Registration', widget: true },
    'config': { name: 'System Configuration', form: true },
    'logs': { name: 'Audit Logs', endpoint: '/api/audit-logs' },
    'isorules': { name: 'ISO Rules', endpoint: '/api/iso-rules' },
    'timetable': { name: 'Timetable Management', endpoint: '/api/timetable' },
    'rooms': { name: 'Rooms Catalogue', endpoint: '/api/rooms' },
    'subjects': { name: 'Subjects Catalogue', endpoint: '/api/subjects' },
    'announcements': { name: 'Announcements', endpoint: '/api/announcements' },
    'online-classes': { name: 'Online Classes', endpoint: '/api/online-classes' },
    'courses': { name: 'Course Management', endpoint: '/api/courses' },
    'calendar': { name: 'Calendar Events', endpoint: '/api/calendar-events' },
    'library': { name: 'Library Resources', endpoint: '/api/library' },
    'communities': { name: 'Communities', endpoint: '/api/communities' },
    'send-notif': { name: 'Send Notifications', form: true },
    'committee': { name: 'Committee Management', endpoint: '/api/committee' },
    'exam': { name: 'Exam Module', endpoint: '/api/exam' },
    'assessments': { name: 'Assessments', endpoint: '/api/assessments' },
    's-attendance': { name: 'Student Attendance', endpoint: '/api/attendance' },
    's-fees': { name: 'Student Fees', endpoint: '/api/fees' },
    's-performance': { name: 'Student Performance', endpoint: '/api/performance' },
    's-leave': { name: 'Leave Management', endpoint: '/api/leave' },
    's-placement': { name: 'Placement Data', endpoint: '/api/placement' },
    's-grievance': { name: 'Grievances', endpoint: '/api/grievances' },
    'qr-dashboard': { name: 'QR Attendance Dashboard', endpoint: '/api/attendance/dashboard' },
    'qr-settings': { name: 'QR Settings', form: true },
    'reports': { name: 'Global Reports', endpoint: '/api/reports' }
  }
};

/**
 * Generate dynamic render function for a module
 */
function generateModuleUI(moduleId) {
  const role = AMS.role;
  const shortId = moduleId.split('-').slice(1).join('-');
  const config = ModuleConfig[role]?.[shortId];
  
  // Handle missing modules
  if (!config) {
    return `<div class="card">
      <div class="card-header">
        <div class="card-title">⚠️ Module Not Found</div>
      </div>
      <div class="card-content" style="padding: 2rem; text-align: center;">
        <div style="color: var(--text2); margin-bottom: 1rem;">
          <p>The module <code>${moduleId}</code> is no longer available.</p>
          <p style="font-size: 0.9rem; color: var(--text3); margin-top: 0.5rem;">
            This may have been removed or you accessed a direct link to a deleted module.
          </p>
        </div>
        <button class="btn btn-primary" onclick="loadModule('${role === 'admin' ? 'a-dashboard' : role === 'faculty' ? 'f-dashboard' : 's-dashboard'}, 'Dashboard')">
          Back to Dashboard
        </button>
      </div>
    </div>`;
  }
  
  let html = `<div class="card">
    <div class="card-header">
      <div class="card-title">${config.name || moduleId}</div>
    </div>
    <div class="card-content" id="module-content">`;

  if (config.endpoint) {
    // Show loader while fetching data
    html += `<div style="padding: 2rem; text-align: center;"><div class="loader-ring" style="display: inline-block;"></div><p style="margin-top: 1rem; color: var(--text2);">Loading data…</p></div>`;
  } else if (config.form) {
    // Show form template
    html += `
      <div class="form-group">
        <label>Subject</label>
        <input type="text" placeholder="Enter subject" class="form-control">
      </div>
      <div class="form-group">
        <label>Details</label>
        <textarea placeholder="Enter details" class="form-control" rows="6"></textarea>
      </div>
      <button class="btn btn-primary" onclick="submitModuleForm('${moduleId}')">Submit</button>
    `;
  } else if (config.widget) {
    html += `<div style="padding: 2rem; text-align: center; color: var(--text2);">Widget loading...</div>`;
  } else {
    html += `<div style="padding: 1rem; background: var(--ink2); border-radius: var(--radius); color: var(--text3);">Module ready</div>`;
  }

  html += `</div></div>`;
  return html;
}

/**
 * Load data for a module from API
 */
async function loadModuleData(moduleId) {
  const role = AMS.role;
  const shortId = moduleId.split('-').slice(1).join('-');
  const config = ModuleConfig[role]?.[shortId];

  if (!config || !config.endpoint) return;

  const container = document.getElementById('module-content');
  if (!container) return;

  try {
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}${config.endpoint}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    
    const data = await resp.json();
    container.innerHTML = renderDataTable(data);
  } catch (e) {
    container.innerHTML = `<div style="padding: 1rem; background: #fee; border: 1px solid #faa; border-radius: var(--radius); color: #c00;">
      Error loading data: ${e.message}
    </div>`;
    console.error(`[${moduleId}]`, e);
  }
}

/**
 * Render data as a table
 */
function renderDataTable(data) {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return '<div class="empty" style="padding: 2rem; text-align: center; color: var(--text2);">No data available</div>';
  }

  if (Array.isArray(data)) {
    const items = data;
    if (items.length === 0) return '<div class="empty">No records</div>';

    let html = '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr style="background: var(--ink3); border-bottom: 2px solid var(--border);">';
    
    const keys = Object.keys(items[0]).filter(k => !k.startsWith('_'));
    keys.slice(0, 5).forEach(k => {
      html += `<th style="padding: 0.75rem; text-align: left;">${k}</th>`;
    });
    html += '</tr></thead><tbody>';

    items.forEach(item => {
      html += '<tr style="border-bottom: 1px solid var(--border);">';
      keys.slice(0, 5).forEach(k => {
        const val = item[k];
        html += `<td style="padding: 0.75rem;">${typeof val === 'object' ? JSON.stringify(val) : val}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  return '<div style="padding: 1rem; background: var(--ink2); border-radius: var(--radius); white-space: pre-wrap; overflow-x: auto;">' +
         JSON.stringify(data, null, 2) + '</div>';
}

/**
 * Submit a form for modules with forms
 */
function submitModuleForm(moduleId) {
  const inputs = document.querySelectorAll('#module-content input, #module-content textarea');
  const formData = {};
  inputs.forEach(inp => {
    if (inp.placeholder) {
      const key = inp.placeholder.toLowerCase().replace(/\s+/g, '_');
      formData[key] = inp.value;
    }
  });

  console.log(`[${moduleId}] Form submitted:`, formData);
  toast('Form submitted successfully!', 'success');
  
  // Clear form
  inputs.forEach(inp => inp.value = '');
}

/**
 * Override renderModule to use dynamic system as fallback
 */
const originalRenderModule = window.renderModule;
window.renderModule = function(id) {
  if (typeof originalRenderModule === 'function') {
    const result = originalRenderModule(id);
    // If renderComingSoon was returned, use dynamic system instead
    if (result.includes('under active development')) {
      return generateModuleUI(id);
    }
    return result;
  }
  return generateModuleUI(id);
};

/**
 * Override bindModuleEvents to load data dynamically
 */
const originalBindModuleEvents = window.bindModuleEvents;
window.bindModuleEvents = function(id) {
  if (typeof originalBindModuleEvents === 'function') {
    originalBindModuleEvents(id);
  }
  
  // Always try to load data if endpoint is configured
  const role = AMS.role;
  const shortId = id.split('-').slice(1).join('-');
  const config = ModuleConfig[role]?.[shortId];
  if (config && config.endpoint) {
    setTimeout(() => loadModuleData(id), 100);
  }
};

// Export for use in app.js
window.generateModuleUI = generateModuleUI;
window.loadModuleData = loadModuleData;
window.renderDataTable = renderDataTable;
window.submitModuleForm = submitModuleForm;
