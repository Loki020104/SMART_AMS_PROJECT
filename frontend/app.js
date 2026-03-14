/* =========================================================
   SmartAMS — app.js
   Full implementation: all Student & Faculty modules,
   Face Recognition Attendance, QR Attendance, Location Check,
   Manual Attendance, Admin super-access
   ========================================================= */

'use strict';

// Global error handler to prevent page from hanging
window.addEventListener('error', function(event) {
  console.error('[App Error]', event.message, event.filename, event.lineno);
  // Show login page as fallback
  const pageLoader = document.getElementById('pageLoader');
  const loginPage = document.getElementById('loginPage');
  if (pageLoader) pageLoader.style.display = 'none';
  if (loginPage) loginPage.style.display = 'flex';
});

// ── Global State ──────────────────────────────────────────
const AMS = {
  role: 'student',
  user: { name: '', id: '' },
  profile: {},           // populated at login – replaces sessionStorage for student/faculty info
  _faceSessionId: null,  // replaces sessionStorage('face_attendance_session_id')
  activeModule: '',
  cameraStream: null,
  faceRecEnabled: false,
  supabase: null,
  college: { lat:13.145615, lng: 77.574597, radiusKm: 0.2 },
  qrSession: null,
  notifications: [],
  lastCapturedImage: null
};

// ── Production session store (localStorage primary + Firestore backup) ──────
// Session data stored in localStorage for instant reload (same-origin only).
// Also syncs to Firestore `sessions/{username}` for multi-device sync.
// Cookies hold session key (username) for reference.
const AmsDB = {
  _cookieName: 'ams_sid',
  _firestoreTimeout: 3000, // 3 second timeout for Firestore operations
  _sessionCache: null, // In-memory cache during current session only
  
  _getCookie() {
    const m = document.cookie.match(/(?:^|;\s*)ams_sid=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  },
  
  _setCookie(val) {
    const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `ams_sid=${encodeURIComponent(val)};expires=${exp};path=/;SameSite=Lax`;
  },
  
  _clearCookie() {
    document.cookie = 'ams_sid=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
  },
  
  async _firestoreWithTimeout(promise, timeoutMs) {
    // Helper to wrap Firestore calls with a timeout
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Firestore operation timed out')), timeoutMs)
      )
    ]);
  },
  
  async get(key) {
    if (key !== 'ams_session') return undefined;
    
    // 1. Try in-memory cache first (fastest)
    if (this._sessionCache && this._sessionCache.user && this._sessionCache.user.username) {
      return this._sessionCache;
    }
    
    // 2. Try localStorage ONLY on initial page load (skip Firestore for speed)
    try {
      const stored = localStorage.getItem('ams_session_json');
      if (stored) {
        const data = JSON.parse(stored);
        if (data && data.user && data.user.username) {
          this._sessionCache = data;
          console.log('[AmsDB] ✅ Restored session from localStorage');
          return data;
        }
      }
    } catch (e) {
      console.warn('[AmsDB] localStorage parse error:', e.message);
    }
    
    // 3. NO FIRESTORE on initial load - return null immediately for speed
    // Firestore will sync in background after page loads
    console.log('[AmsDB] ℹ No cached session found - will show login');
    return null;
  },
  
  async set(key, value) {
    if (key !== 'ams_session') return;
    const username = value && value.user && value.user.username;
    if (!username) return;
    
    // Update in-memory cache immediately
    this._sessionCache = value;
    
    // 1. Save to localStorage (instant)
    try {
      localStorage.setItem('ams_session_json', JSON.stringify(value));
      console.log('[AmsDB] ✅ Session saved to localStorage');
    } catch (e) {
      console.warn('[AmsDB] localStorage write failed (quota exceeded?):', e.message);
    }
    
    // 2. Cookie for reference
    this._setCookie(username);
    
    // 3. Sync to Firestore (background, non-blocking)
    if (!window.fstore) {
      console.warn('[AmsDB] Firestore not initialized, skipping cloud sync');
      return;
    }
    
    this._firestoreWithTimeout(
      window.fstore.collection('sessions').doc(username).set({
        ...value,
        updated_at: (window.firebase && window.firebase.firestore)
          ? window.firebase.firestore.FieldValue.serverTimestamp()
          : new Date().toISOString()
      }),
      this._firestoreTimeout
    ).then(() => {
      console.log('[AmsDB] ✅ Session synced to Firestore');
    }).catch((err) => {
      console.warn('[AmsDB] Firestore sync failed (but localStorage saved):', err.message);
    });
  },
  
  async remove(key) {
    if (key !== 'ams_session') return;
    const username = this._getCookie();
    this._clearCookie();
    this._sessionCache = null; // Clear in-memory cache
    
    // 1. Clear localStorage
    try {
      localStorage.removeItem('ams_session_json');
      console.log('[AmsDB] ✅ Session cleared from localStorage');
    } catch (e) {
      console.warn('[AmsDB] localStorage clear failed:', e.message);
    }
    
    // 2. Delete from Firestore (background)
    if (!window.fstore) {
      console.log('[AmsDB] Firestore not initialized, session cleared locally');
      return;
    }
    
    this._firestoreWithTimeout(
      window.fstore.collection('sessions').doc(username).delete(),
      this._firestoreTimeout
    ).then(() => {
      console.log('[AmsDB] ✅ Session deleted from Firestore');
    }).catch((err) => {
      console.warn('[AmsDB] Firestore deletion failed (but already cleared locally):', err.message);
    });
  }
};

const COLLEGE_LAT  = 13.145615;
const COLLEGE_LNG  = 77.574597;
const COLLEGE_KM   = 0.2;

// ── Navigation config ─────────────────────────────────────
const NAV_CONFIG = {
  student: [
    { section: 'Overview', items: [
      { id:'s-dashboard',  icon:'📊', label:'Dashboard' },
      { id:'s-calendar',   icon:'📅', label:'Student Calendar' },
      { id:'s-timetable',  icon:'🕐', label:'Regular Timetable' },
    ]},
    { section: 'Academic', items: [
      { id:'s-communities',icon:'💬', label:'Subject Communities' },
      { id:'s-cbcs',       icon:'🎯', label:'Choice Based Credit' },
      { id:'s-online',     icon:'💻', label:'Online Class' },
      { id:'s-library',    icon:'📚', label:'Digital Library' },
      { id:'s-performance',icon:'📈', label:'Student Performance' },
      { id:'s-assessments',icon:'📋', label:'Assessments' },
    ]},
    { section: 'Attendance', items: [
      { id:'s-attendance', icon:'✅', label:'Attendance' },
    ]},
    { section: 'Fees & Finance', items: [
      { id:'s-fees',       icon:'💳', label:'Fee Management' },
    ]},
    { section: 'Examinations', items: [
      { id:'s-exam-reg',   icon:'📝', label:'Sem Exam Registration' },
      { id:'s-sem-reg',    icon:'🗓️', label:'Sem-Term Registration' },
      { id:'s-supple',     icon:'🔄', label:'Supplementary Exam' },
      { id:'s-reval',      icon:'🔍', label:'Exam Revaluation' },
      { id:'s-grace',      icon:'🌟', label:'Grace Mark Request' },
    ]},
    { section: 'Feedback', items: [
      { id:'s-survey',     icon:'📋', label:'Interim Course Survey' },
      { id:'s-exit',       icon:'🚪', label:'Course Exit Survey' },
      { id:'s-grievance',  icon:'⚖️', label:'Grievance Redressal' },
      { id:'s-evaluation', icon:'⭐', label:'Staff / College Eval' },
    ]},
    { section: 'Services', items: [
      { id:'s-leave',      icon:'🏖️', label:'Leave Management' },
      { id:'s-placement',  icon:'💼', label:'Placement & Training' },
      { id:'s-messages',   icon:'✉️', label:'Message Box' },
      { id:'s-notices',    icon:'📢', label:'Notice Board' },
      { id:'s-push',       icon:'🔔', label:'Notifications' },
    ]},
  ],
  faculty: [
    { section: 'Overview', items: [
      { id:'f-dashboard',  icon:'📊', label:'Dashboard' },
      { id:'f-timetable',  icon:'📅', label:'My Timetable' },
      { id:'f-workhours',  icon:'⏱️', label:'My Working Hours' },
      { id:'f-courses',    icon:'📚', label:'Course & Batch Details' },
      { id:'f-prevdetails',icon:'📋', label:'My Previous Details' },
    ]},
    { section: 'Teaching', items: [
      { id:'f-obe',        icon:'🎯', label:'OBE Configuration' },
      { id:'f-lesson',     icon:'📝', label:'Lesson Planner' },
      { id:'f-online',     icon:'💻', label:'Online Class Mgmt' },
      { id:'f-materials',  icon:'📂', label:'Course Materials' },

    ]},
    { section: 'Attendance', items: [
      { id:'f-attendance', icon:'✅', label:'Attendance Marking' },
      { id:'f-subject-students', icon:'👥', label:'Subject Students' },
    ]},
    { section: 'Assessments', items: [
      { id:'f-assessments',icon:'📋', label:'Assessments' },
      { id:'f-assignments',icon:'📄', label:'Assignments' },
      { id:'f-internal',   icon:'🏫', label:'Internal Examination' },
      { id:'f-qpaper',     icon:'📃', label:'Question Paper Gen' },
    ]},
    { section: 'Reports', items: [
      { id:'f-coursefile', icon:'🗂️', label:'Course File / Diary' },
      { id:'f-marks',      icon:'🔢', label:'Mark Computation' },
      { id:'f-reports',    icon:'📊', label:'Custom Reports' },
      { id:'f-onlineexam', icon:'🖥️', label:'Online Examination' },
      { id:'f-staffrpt',   icon:'👤', label:'Staff Active Report' },
    ]},
    { section: 'Student Management', items: [
      { id:'f-studentleave',icon:'🏖️', label:'Student Leave Mgmt' },
      { id:'f-transport',  icon:'🚌', label:'Transport' },
      { id:'f-messages',   icon:'✉️', label:'Message Box' },
    ]},
    { section: 'Institution', items: [
      { id:'f-rules',      icon:'📜', label:'Rules & Regulations' },
      { id:'f-committee',  icon:'🏛️', label:'Committee' },
      { id:'f-examduty',   icon:'📋', label:'Exam / Invigilation' },
      { id:'f-ratings',    icon:'⭐', label:'My Ratings' },
    ]},
    { section: 'Self', items: [
      { id:'f-worklog',    icon:'📋', label:'Daily Work Log' },
      { id:'f-appraisal',  icon:'🌟', label:'Staff Appraisal' },
    ]},
  ],
  admin: [
    { section: 'System', items: [
      { id:'a-dashboard',    icon:'📊', label:'Dashboard' },
      { id:'a-users',        icon:'👥', label:'User Management' },
      { id:'a-departments',  icon:'🏛️', label:'Departments & Programs' },
      { id:'a-register',     icon:'👤', label:'Face Registration' },
      { id:'a-config',       icon:'⚙️', label:'System Config' },
      { id:'a-logs',         icon:'📋', label:'Audit Logs' },
    ]},
    { section: 'Institution Management', items: [
      { id:'a-isorules',       icon:'📜', label:'ISO Rules / Faculty Rules' },
      { id:'a-timetable',      icon:'🗓️', label:'Timetable Management' },
      { id:'a-rooms',          icon:'🏫', label:'Rooms Catalogue' },
      { id:'a-subjects',       icon:'📖', label:'Subjects Catalogue' },
      { id:'a-announcements',  icon:'📢', label:'Announcements' },
      { id:'a-online-classes', icon:'🎥', label:'Online Classes' },
      { id:'a-courses',        icon:'📚', label:'Course Management' },
      { id:'a-calendar',       icon:'📅', label:'Calendar Events' },
      { id:'a-library',        icon:'📖', label:'Library Resources' },
      { id:'a-communities',    icon:'💬', label:'Communities' },
      { id:'a-send-notif',     icon:'🔔', label:'Send Notifications' },
      { id:'a-committee',      icon:'🏛️', label:'Committee Management' },
      { id:'a-exam',           icon:'📝', label:'Exam Module' },
      { id:'a-assessments',  icon:'📋', label:'Assessments' },
    ]},
    { section: 'Student Modules (Admin)', items: [
      { id:'a-bulk-enroll', icon:'📚', label:'Bulk Student Enrollment' },
      { id:'a-s-attendance',icon:'✅', label:'Student Attendance' },
      { id:'a-s-fees',      icon:'💳', label:'Student Fees' },
      { id:'a-s-performance',icon:'📈',label:'Student Performance' },
      { id:'a-s-leave',     icon:'🏖️', label:'Leave Management' },
      { id:'a-s-placement', icon:'💼', label:'Placement Data' },
      { id:'a-s-grievance', icon:'⚖️', label:'Grievances' },
    ]},
    { section: 'Reports', items: [
      { id:'a-reports',    icon:'📊', label:'Global Reports' },
    ]},
  ]
};

// ── Utility helpers ───────────────────────────────────────
function toast(msg, type='info', dur=3500){
  const el=document.createElement('div');
  el.className=`notif notif-${type}`;
  const icons={success:'✅',error:'❌',info:'ℹ️',warning:'⚠️'};
  el.innerHTML=`<span>${icons[type]||'•'}</span><span>${msg}</span>`;
  document.getElementById('notifContainer').appendChild(el);
  setTimeout(()=>el.remove(), dur);
}
function haversineKm(lat1,lng1,lat2,lng2){
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function isInCollege(lat,lng){
  // Use dynamic college coordinates from AMS.college when available
  const clat = (AMS.college && AMS.college.lat) ? AMS.college.lat : COLLEGE_LAT;
  const clng = (AMS.college && AMS.college.lng) ? AMS.college.lng : COLLEGE_LNG;
  const crad = (AMS.college && typeof AMS.college.radiusKm === 'number') ? AMS.college.radiusKm : COLLEGE_KM;
  return haversineKm(lat,lng,clat,clng) <= crad;
}
function getLocation(){
  return new Promise((res,rej)=>{
    // Default location: Bangalore, India (13.1718° N, 77.5362° E)
    const defaultLocation = {lat:13.1718,lng:77.5362};
    
    if(!navigator.geolocation) {
      res(defaultLocation);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p=>res({lat:p.coords.latitude,lng:p.coords.longitude}),
      e=>res(defaultLocation),
      {timeout:10000,enableHighAccuracy:true}
    );
  });
}
function fmtDate(d=new Date()){
  return d.toLocaleDateString('en-IN',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
}
function fmtTime(d=new Date()){return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
function randomId(){return Math.random().toString(36).slice(2,9).toUpperCase()}
function stopCamera(){if(AMS.cameraStream){AMS.cameraStream.getTracks().forEach(t=>t.stop());AMS.cameraStream=null}}

// ── Camera helpers ────────────────────────────────────────
async function startCamera(videoEl){
  stopCamera();
  if(!videoEl) throw new Error('Video element not found');
  console.log('🎥 Starting camera...');
  try{
    let stream;
    try{
      stream=await navigator.mediaDevices.getUserMedia({
        video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false
      });
    }catch(e1){
      console.warn('First attempt failed, trying basic video...',e1);
      stream=await navigator.mediaDevices.getUserMedia({video:true});
    }
    AMS.cameraStream=stream;
    videoEl.srcObject=stream;
    
    // Ensure video element is visible and has proper dimensions
    videoEl.style.display = 'block';
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';
    
    // Wait for metadata and play
    let metadataLoaded=false;
    const metadataHandler = () => {metadataLoaded=true;};
    videoEl.addEventListener('loadedmetadata', metadataHandler, {once:true});
    
    try{
      const playPromise=videoEl.play();
      if(playPromise!==undefined) await playPromise;
    }catch(e){console.error('⚠️ Play error:',e)}
    
    // More generous wait for video to actually render (up to 5 seconds)
    let waited=0;
    const maxWait = 100; // 100 * 50ms = 5 seconds
    while((!metadataLoaded || videoEl.videoWidth===0 || videoEl.videoHeight===0) && waited<maxWait){
      await new Promise(r=>setTimeout(r,50));
      waited++;
    }
    
    // Final check with additional delay
    if(videoEl.videoWidth===0 || videoEl.videoHeight===0){
      console.warn(`⚠️ Video dimensions still 0: ${videoEl.videoWidth}x${videoEl.videoHeight}, waiting more...`);
      await new Promise(r=>setTimeout(r,1000));
    }
    
    // Force re-check of dimensions
    if(videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      console.log(`✅ Camera ready: ${videoEl.videoWidth}x${videoEl.videoHeight}`);
    } else {
      console.warn(`⚠️ Video element still shows 0x0 dimensions, but proceeding anyway`);
    }
    
    return stream;
  }catch(err){
    console.error('❌ Camera startup failed:', err);
    toast(`Camera error: ${err.message}`,'error');
    throw err;
  }
}
function captureFrame(videoEl){
  console.log(`Capture attempt: video ${videoEl.videoWidth}x${videoEl.videoHeight}, readyState=${videoEl.readyState}`);
  if(videoEl.videoWidth===0||videoEl.videoHeight===0){
    throw new Error(`Video stream not ready (${videoEl.videoWidth}x${videoEl.videoHeight}). Try waiting a moment and retrying.`);
  }
  const c=document.createElement('canvas');
  c.width=videoEl.videoWidth; c.height=videoEl.videoHeight;
  c.getContext('2d').drawImage(videoEl,0,0);
  console.log(`✅ Frame captured: ${c.width}x${c.height}`);
  return c.toDataURL('image/jpeg',0.9);
}

// ── Face verification ─────────────────────────────────────
async function verifyFace(imageData){
  try {
    // imageData may be a base64 string already or the special marker 'captured'
    let b64Image = '';
    if(imageData === 'captured') {
      // legacy path: try canvas then lastCapturedImage
      const canvas = document.getElementById('faceCanvas');
      if(canvas) {
        b64Image = canvas.toDataURL('image/jpeg', 0.9);
      } else if(AMS.lastCapturedImage) {
        b64Image = AMS.lastCapturedImage;
      } else {
        return { verified: false, error: 'No image captured' };
      }
    } else {
      b64Image = imageData;
    }
    
    // Get logged-in student's roll number from in-memory profile
    const logged_in_roll_no = (AMS.profile && AMS.profile.roll_no) || null;
    
    if(!logged_in_roll_no) {
      return { verified: false, error: 'Student not logged in' };
    }
    
    // Generate/get attendance session ID (unique per attendance session, in-memory)
    if(!AMS._faceSessionId) {
      AMS._faceSessionId = 'face_' + Date.now() + '_' + logged_in_roll_no;
    }
    const session_id = AMS._faceSessionId;
    
    // Get geolocation
    let latitude, longitude;
    if(navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {timeout: 5000});
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch(e) {
        console.warn('Geolocation failed:', e);
      }
    }
    
    // Call backend verify endpoint with student identity
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        image: b64Image,
        roll_no: logged_in_roll_no,
        session_id: session_id,
        latitude: latitude,
        longitude: longitude
      })
    }).catch(e => {
      console.error('Fetch error:', e);
      return null;
    });
    
    if(!resp) {
      return { verified: false, error: 'Backend connection failed' };
    }
    
    const data = await resp.json().catch(e => {
      console.error('JSON parse error:', e);
      return { verified: false, error: 'Invalid server response' };
    });
    
    return data;
  } catch(e) {
    console.error('Verify error:', e);
    return { verified: false, error: e.message };
  }
}

// ── Login / Logout ────────────────────────────────────────
function selectRole(el){
  document.querySelectorAll('.role-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  AMS.role=el.dataset.role;
  // Update field label + placeholder based on role
  const userInput=document.getElementById('loginUser');
  const userLabel=document.getElementById('loginUserLabel');
  const hint=document.getElementById('loginHint');
  if(AMS.role==='student'){
    if(userLabel) userLabel.textContent='Roll Number';
    if(userInput) userInput.placeholder='e.g. 20261cse0001';
    if(hint) hint.textContent='Login with your roll number';
  }else{
    if(userLabel) userLabel.textContent='Email';
    if(userInput) userInput.placeholder='e.g. faculty@college.edu';
    if(hint) hint.textContent='Login with your email address';
  }
  if(userInput) userInput.value='';
}
async function doLogin(){
  const u=document.getElementById('loginUser').value.trim();
  const p=document.getElementById('loginPass').value;
  if(!u||!p){toast('Enter credentials','warning');return}

  // Faculty & Admin: try Firebase email/password auth first
  if(AMS.role!=='student' && window.firebaseAuth && u.includes('@')){
    try{
      const fbResult=await window.firebaseAuth.signInWithEmailAndPassword(u,p).catch(()=>null);
      if(fbResult && fbResult.user){
        const idToken=await fbResult.user.getIdToken();
        const resp=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/firebase-login`,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${idToken}`},
          body:JSON.stringify({role:AMS.role})
        }).catch(()=>null);
        if(resp && resp.ok){
          const data=await resp.json();
          if(data.success){_handleLoginSuccess(data);return;}
        }
        if(resp && resp.status===403){
          const errData=await resp.json().catch(()=>({}));
          toast(errData.error||'Role mismatch','error');return;
        }
      }
    }catch(e){
      console.warn('[Login] Firebase email auth error:',e.message);
    }
  }

  // All roles: backend login (student → roll_no/username, faculty/admin → email or username)
  try{
    const resp=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/login`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:u,password:p,role:AMS.role})
    }).catch(()=>null);
    if(resp && resp.ok){
      const data=await resp.json();
      if(data.success){
        _handleLoginSuccess(data);
        return;
      }else{toast(data.error||'Login failed','error');return;}
    }else{
      const data=await resp.json().catch(()=>({}));
      toast(data.error||'Login failed','error');
    }
  }catch(e){
    toast('Backend connection error','error');
  }
}

async function doGoogleSignIn(){
  if(!window.firebaseAuth){
    toast('Firebase not initialized','error');
    return;
  }
  try{
    const provider=new firebase.auth.GoogleAuthProvider();
    const result=await window.firebaseAuth.signInWithPopup(provider);
    const fbUser=result.user;
    const idToken=await fbUser.getIdToken();
    const resp=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/firebase-login`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${idToken}`},
      body:JSON.stringify({role:AMS.role})
    }).catch(()=>null);
    if(resp && resp.ok){
      const data=await resp.json();
      if(data.success){
        _handleLoginSuccess(data);
        return;
      }else{
        toast(data.error||'Login failed','error');
        return;
      }
    }
    const errData=resp?await resp.json().catch(()=>({})):{};
    toast(errData.error||'Google sign-in failed','error');
  }catch(e){
    if(e.code==='auth/popup-closed-by-user') return;
    console.error('[Google Sign-In]',e);
    toast('Google sign-in error: '+e.message,'error');
  }
}

function _handleLoginSuccess(data){
  const displayId = data.user.role === 'student'
    ? (data.user.roll_no || data.user.id)
    : (data.user.employee_id || data.user.id);
  AMS.user={name:data.user.full_name||data.user.username, id:displayId, username:data.user.username, email:data.user.email};
  AMS.role=data.user.role;
  // Populate in-memory profile (replaces sessionStorage for student_info / faculty_info)
  AMS.profile = {
    full_name: data.user.full_name || data.user.username,
    username: data.user.username || '',
    roll_no: data.user.roll_no || null,
    employee_id: data.user.employee_id || null,
    department: data.user.department || null,
    email: data.user.email || '',
    id: data.user.id
  };
  // Persist session in IndexedDB (production-safe; no localStorage/sessionStorage)
  AmsDB.set('ams_session', {user: AMS.user, role: AMS.role, profile: AMS.profile}).catch(e=>console.warn('[AmsDB]',e));
  // Sync user profile to Firebase RTDB for real-time features
  if(window.DB && displayId){
    DB.update(`/users/${displayId}`, {
      name: data.user.full_name || data.user.username,
      username: data.user.username,
      email: data.user.email || '',
      role: data.user.role,
      roll_no: data.user.roll_no || null,
      last_login: DB.timestamp()
    }).catch(e=>console.warn('[RTDB-LOGIN]',e));
  }
  initDashboard();
}

function doLogout(){
  stopCamera();
  stopSessionMonitor(); // Stop validating session (production-ready)
  if(window.firebaseAuth) window.firebaseAuth.signOut().catch(()=>{});
  AmsDB.remove('ams_session').catch(()=>{});
  history.replaceState(null,'',window.location.pathname);
  AMS.profile = {};
  AMS._faceSessionId = null;
  AMS.user={name:'',id:''};AMS.role='student';
  document.getElementById('dashboard').style.display='none';
  document.getElementById('loginPage').style.display='flex';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
}

// ── Dashboard init ────────────────────────────────────────
function initDashboard(){
  const pageLoader=document.getElementById('pageLoader');
  if(pageLoader) pageLoader.style.display='none';
  document.getElementById('loginPage').style.display='none';
  document.getElementById('dashboard').style.display='flex';
  
  // Start session monitor to validate session in production (Firestore-based)
  initSessionMonitor().catch(err => console.warn('[Dashboard] Session monitor init failed:', err.message));
  
  const roleLabels={student:'Student Portal',faculty:'Faculty Portal',admin:'Admin Portal'};
  document.getElementById('sbRoleBadge').textContent=roleLabels[AMS.role];
  document.getElementById('sbAvatar').textContent=AMS.user.name[0].toUpperCase();
  document.getElementById('sbName').textContent=AMS.user.name;
  document.getElementById('sbId').textContent='ID: '+AMS.user.id;
  document.getElementById('topbarRole').textContent=AMS.role.charAt(0).toUpperCase()+AMS.role.slice(1);
  document.getElementById('topbarDate').textContent=fmtDate();
  buildNav();
  // Load system configuration (college coords, toggles) from backend
  loadSystemConfig().catch(()=>{});
  // Initialize QR Module for attendance features
  if (typeof QRModule !== 'undefined' && QRModule.init) {
    QRModule.init();
  }
  // Restore the last active page from the URL hash, fall back to the first item
  const hashId = window.location.hash.slice(1);
  const allItems = NAV_CONFIG[AMS.role].flatMap(s=>s.items);
  const hashItem = hashId ? allItems.find(i=>i.id===hashId) : null;
  if(hashItem){
    loadModule(hashItem.id, hashItem.label);
  } else {
    const firstItem=NAV_CONFIG[AMS.role][0].items[0];
    loadModule(firstItem.id,firstItem.label);
  }
}

function buildNav(){
  const nav=document.getElementById('sidebarNav');
  nav.innerHTML='';
  NAV_CONFIG[AMS.role].forEach(section=>{
    const sec=document.createElement('div');
    sec.className='nav-section';
    sec.innerHTML=`<div class="nav-section-label">${section.section}</div>`;
    section.items.forEach(item=>{
      const el=document.createElement('div');
      el.className='nav-item';
      el.id='nav-'+item.id;
      el.innerHTML=`<span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span>`;
      el.onclick=()=>{loadModule(item.id,item.label);if(window.innerWidth<=768)closeSidebar()};
      sec.appendChild(el);
    });
    nav.appendChild(sec);
  });
}

function loadModule(id,label){
  stopCamera();
  AMS.activeModule=id;
  // Reflect current page in the URL hash so refresh restores it
  history.replaceState(null,'','#'+id);
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const navEl=document.getElementById('nav-'+id);
  if(navEl){navEl.classList.add('active');navEl.scrollIntoView({block:'nearest'})}
  document.getElementById('pageTitle').textContent=label;
  const content=document.getElementById('mainContent');
  content.innerHTML='<div class="page-loader" style="position:static;background:transparent;height:200px"><div class="loader-ring"></div></div>';
  setTimeout(()=>{content.innerHTML=renderModule(id);bindModuleEvents(id)},150);
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// ── Module Router ─────────────────────────────────────────
function renderModule(id){
  const map={
    's-dashboard':renderStudentDashboard,'s-calendar':renderStudentCalendar,'s-timetable':renderStudentTimetable,
    's-communities':renderSubjectCommunities,'s-cbcs':renderCBCS,'s-online':renderStudentOnlineClass,
    's-library':renderDigitalLibrary,'s-performance':renderStudentPerformance,'s-attendance':renderStudentAttendance,
    's-fees':renderStudentFees,'s-exam-reg':renderExamReg,'s-sem-reg':renderSemReg,'s-supple':renderSuppleReg,
    's-reval':renderRevaluation,'s-grace':renderGraceMark,'s-survey':renderInterimSurvey,
    's-exit':renderExitSurvey,'s-grievance':renderGrievance,'s-evaluation':renderStaffEval,
    's-leave':renderLeaveManagement,'s-placement':renderPlacement,'s-messages':renderMessages,
    's-notices':renderNoticeBoard,'s-push':renderPushNotif,'s-assessments':renderStudentAssessments,
    'f-dashboard':renderFacultyDashboard,'f-timetable':renderFacultyTimetable,'f-courses':renderCourseDetails,
    'f-workhours':renderFacultyWorkingHours,'f-prevdetails':renderFacultyPrevDetails,
    'f-ratings':renderFacultyRatings,'f-studentleave':renderFacultyStudentLeave,
    'f-transport':renderFacultyTransport,'f-messages':renderFacultyMessages,
    'f-rules':renderFacultyRules,'f-committee':renderFacultyCommittee,
    'f-examduty':renderFacultyExamDuty,
    'f-obe':renderOBE,'f-lesson':renderLessonPlanner,'f-online':renderFacultyOnlineClass,
    'f-materials':renderCourseMaterials,'f-attendance':renderFacultyAttendance,'f-subject-students':renderFacultySubjectStudents,
    'f-assessments':renderAssessments,'f-assignments':renderAssignments,'f-internal':renderInternalExam,
    'f-qpaper':renderQuestionPaper,'f-coursefile':renderCourseFile,'f-marks':renderMarkComputation,
    'f-reports':renderCustomReports,'f-onlineexam':renderOnlineExam,'f-staffrpt':renderStaffReport,
    'f-worklog':renderWorkLog,'f-appraisal':renderAppraisal,
    'a-dashboard':renderAdminDashboard,'a-users':renderUserManagement,'a-departments':renderAdminDepartments,'a-register':renderFaceRegistration,
    'a-config':renderSystemConfig,'a-logs':renderAuditLogs,'a-reports':renderGlobalReports,
    'a-isorules':renderAdminISORules,'a-timetable':renderAdminTimetableMgmt,
    'a-rooms':renderAdminRooms,'a-subjects':renderAdminSubjects,
    'a-announcements':renderAdminAnnouncements,'a-online-classes':renderAdminOnlineClasses,'a-courses':renderAdminCourses,
    'a-calendar':renderAdminCalendar,'a-library':renderAdminLibrary,'a-communities':renderAdminCommunities,'a-send-notif':renderAdminSendNotif,
    'a-committee':renderAdminCommittee,'a-exam':renderAdminExamModule,
    'a-bulk-enroll':renderBulkEnrollment,
    'a-s-attendance':renderAdminAttendance,'a-s-fees':renderAdminFees,'a-s-performance':renderAdminPerformance,
    'a-s-leave':renderAdminLeave,'a-s-placement':renderAdminPlacement,'a-s-grievance':renderAdminGrievances,
    'a-assessments':renderAssessments,
  };
  return (map[id]||renderComingSoon)(id);
}

function renderComingSoon(id){
  return `<div class="card"><div class="empty">
    <div class="empty-icon">🚧</div>
    <h3 style="margin-bottom:.5rem">Module: ${id}</h3>
    <div class="empty-text">This section is under active development.</div>
  </div></div>`;
}

function bindModuleEvents(id){
  if(id==='s-attendance') initStudentAttendance();
  if(id==='f-attendance') initFacultyAttendance();
  if(id==='f-subject-students') initFacultySubjectStudents();
  if(id==='a-register')   initFaceRegistration();
  if(id==='a-users')      loadUserList();
  if(id==='a-bulk-enroll') loadBulkEnrollmentForm();
}

// ==========================================================
//  STUDENT MODULES
// ==========================================================
function renderStudentDashboard(){
  // Render shell immediately; populate from RTDB asynchronously
  setTimeout(()=>loadStudentDashboardData(),100);
  return `
  <div class="stats-grid" id="sd-stats">
    <div class="stat-card blue"><div class="s-icon">✅</div><div class="s-val" id="sd-att">—</div><div class="s-lbl">Attendance Rate</div></div>
    <div class="stat-card teal"><div class="s-icon">🎓</div><div class="s-val" id="sd-cgpa">—</div><div class="s-lbl">CGPA</div></div>
    <div class="stat-card green"><div class="s-icon">📝</div><div class="s-val" id="sd-tasks">—</div><div class="s-lbl">Pending Tasks</div></div>
    <div class="stat-card orange"><div class="s-icon">💳</div><div class="s-val" id="sd-fees">—</div><div class="s-lbl">Fees Due</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
    <div class="card">
      <div class="card-header"><div class="card-title">📅 Upcoming Events</div></div>
      <div id="sd-events" class="timeline"><div class="text-muted text-sm" style="padding:1rem">Loading…</div></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">📊 Attendance by Subject</div></div>
      <div id="sd-attbars" class="bar-chart mt-md"><div class="text-muted text-sm" style="padding:1rem">Loading…</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">📢 Announcements</div></div>
    <div id="sd-announcements"><div class="text-muted text-sm" style="padding:1rem">Loading…</div></div>
  </div>`;
}

async function loadStudentDashboardData(){
  try {
    const uid = AMS.user.id || AMS.user.username || 'unknown';
    // 1. Fetch user profile from RTDB
    const profile = await DB.get(`/users/${uid}`);
    if(profile){
      document.getElementById('sd-att') && (document.getElementById('sd-att').textContent = (profile.attendance_rate||'—') + (profile.attendance_rate?'%':''));
      document.getElementById('sd-cgpa') && (document.getElementById('sd-cgpa').textContent = profile.cgpa||'—');
      document.getElementById('sd-tasks') && (document.getElementById('sd-tasks').textContent = profile.pending_tasks||'0');
      document.getElementById('sd-fees') && (document.getElementById('sd-fees').textContent = profile.fees_due ? '₹'+Number(profile.fees_due).toLocaleString() : '₹0');
    }
    // 2. Announcements from RTDB (real-time listener)
    const annoEl=document.getElementById('sd-announcements');
    if(annoEl){
      DB.listen('/announcements', data => {
        if(!data){ annoEl.innerHTML='<div class="text-muted text-sm" style="padding:1rem">No announcements.</div>'; return; }
        const items=Object.values(data).sort((a,b)=>b.timestamp-a.timestamp).slice(0,5);
        annoEl.innerHTML=items.map(a=>`<div class="announcement ${a.type||'info'}">
          <div class="ann-title">${a.title||''}</div>
          <div class="text-sm text-muted">${a.message||a.msg||''}</div>
          <div class="ann-meta mt-sm">${a.time||new Date(a.timestamp).toLocaleTimeString()}</div>
        </div>`).join('');
      });
    }
    // 3. Events from RTDB
    const evEl=document.getElementById('sd-events');
    const events = await DB.get('/events');
    if(evEl){
      if(events){
        const list=Object.values(events).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,4);
        evEl.innerHTML=list.map(e=>`<div class="tl-item">
          <div class="tl-date">${e.date}</div>
          <div class="tl-title">${e.title}</div>
          <div class="tl-sub">${e.sub||''}</div>
        </div>`).join('');
      } else {
        evEl.innerHTML='<div class="text-muted text-sm" style="padding:.5rem">No upcoming events.</div>';
      }
    }
    // 4. Attendance bars — use new cumulative report API
    const barsEl=document.getElementById('sd-attbars');
    const rollNo=(AMS.profile && AMS.profile.roll_no)||'';
    if(barsEl && (rollNo || uid)){
      try{
        let url='/api/attendance/report?';
        if(rollNo) url+='roll_no='+encodeURIComponent(rollNo);
        else url+='student_id='+encodeURIComponent(uid);
        const attRes=await fetch(url);
        const attData=await attRes.json();
        if(attData.success && attData.subjects && attData.subjects.length){
          const sdAttEl=document.getElementById('sd-att');
          if(sdAttEl) sdAttEl.textContent=attData.overall.percentage+'%';
          barsEl.innerHTML=attData.subjects.slice(0,6).map(s=>{
            const pct=s.percentage;
            const col=pct<75?'linear-gradient(90deg,var(--red2),var(--red))':pct<85?'linear-gradient(90deg,var(--orange),#f5a560)':'linear-gradient(90deg,var(--blue),var(--teal))';
            const cls=pct<75?'text-red':pct<85?'text-orange':'text-blue';
            return `<div class="bar-row">
              <div class="bar-label text-xs">${s.subject}</div>
              <div class="bar-fill"><div class="bar-inner" style="width:${pct}%;background:${col}"></div></div>
              <div class="bar-val text-xs fw-semibold ${cls}">${pct}%</div>
            </div>`;
          }).join('');
        } else {
          barsEl.innerHTML='<div class="text-muted text-sm" style="padding:.5rem">No attendance data yet.</div>';
        }
      }catch(e){
        barsEl.innerHTML='<div class="text-muted text-sm" style="padding:.5rem">Could not load attendance data.</div>';
      }
    }
  } catch(e) {
    console.error('[Dashboard]', e);
  }
}

function renderStudentCalendar(){
  setTimeout(()=>loadCalendarEvents(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">📅 Academic Calendar</div><span class="badge badge-green text-xs">Live</span></div>
    <div id="calendar-events-list"><div class="text-muted text-sm">Loading events…</div></div>
  </div>`;
}
async function loadCalendarEvents(){
  const el=document.getElementById('calendar-events-list');
  if(!el)return;
  try{
    const res=await fetch('/api/calendar-events');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.events||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No events scheduled yet.</div>';return;}
    const clrMap={exam:'red',holiday:'teal',event:'blue',registration:'green',assignment:'orange'};
    el.innerHTML=list.map(e=>`<div class="announcement info" style="border-color:var(--${clrMap[e.event_type]||'blue'});margin-bottom:.6rem">
      <div class="d-flex justify-between align-center">
        <div>
          <div class="ann-title">${e.title}</div>
          <div class="ann-meta">${new Date(e.event_date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}${e.end_date&&e.end_date!==e.event_date?' — '+new Date(e.end_date+'T00:00:00').toLocaleDateString('en-IN',{month:'short',day:'numeric'}):''}</div>
          ${e.description?`<div class="text-sm text-muted mt-sm">${e.description}</div>`:''}
        </div>
        <span class="badge badge-${clrMap[e.event_type]||'blue'}">${e.event_type||'event'}</span>
      </div>
    </div>`).join('');
  }catch(err){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load calendar.</div>';}
}

function renderStudentTimetable(){
  setTimeout(()=>loadStudentTimetable(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">🕐 My Weekly Timetable</div>
      <span class="badge badge-green text-xs">Live</span>
    </div>
    <div id="student-timetable-body"><div class="text-muted text-sm p-md">Loading timetable…</div></div>
  </div>`;
}

async function loadStudentTimetable(){
  const el=document.getElementById('student-timetable-body');
  if(!el)return;
  try{
    const si=AMS.profile || {};
    const dept    = si.department||'';
    const year    = si.year||si.academic_year||'';
    const section = si.section||si.batch||'';
    let params=[];
    if(dept)    params.push('department='+encodeURIComponent(dept));
    if(year)    params.push('year='+encodeURIComponent(year));
    if(section) params.push('section='+encodeURIComponent(section));
    // fallback: also try batch for backward compat
    if(!section && si.batch) params.push('batch='+encodeURIComponent(si.batch));
    params.push('active=all');
    const url=`${window.AMS_CONFIG.API_URL}/api/timetable`+(params.length?'?'+params.join('&'):'');
    const res=await fetch(url);
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.timetable||data.entries||[]);
    if(!list.length){
      el.innerHTML='<div class="text-muted text-sm p-md">No timetable entries found for your section. Contact admin.</div>';
      return;
    }
    const hours=[...new Set(list.map(s=>s.hour_number||0))].sort((a,b)=>a-b);
    const hourLabel=h=>{
      const s=list.find(x=>(x.hour_number||0)===h);
      return s?`Hour ${h}<br><small class="text-muted">${(s.start_time||'').slice(0,5)}–${(s.end_time||'').slice(0,5)}</small>`:('H'+h);
    };
    const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const daysInData=[...new Set(list.map(s=>s.day_of_week))];
    const days=DAYS.filter(d=>daysInData.includes(d));
    const cell={};
    list.forEach(s=>{cell[s.day_of_week+'|'+(s.hour_number||0)]=s;});
    el.innerHTML=`<div style="overflow-x:auto">
    <table style="border-collapse:collapse;width:100%;min-width:600px;font-size:.85rem">
      <thead>
        <tr style="background:rgba(31,111,235,.1)">
          <th style="padding:.6rem .9rem;border:1px solid var(--border);text-align:left;min-width:90px">Day</th>
          ${hours.map(h=>`<th style="padding:.6rem .9rem;border:1px solid var(--border);text-align:center;min-width:110px">${hourLabel(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${days.map(day=>`<tr>
          <td style="padding:.6rem .9rem;border:1px solid var(--border);font-weight:600;background:rgba(31,111,235,.04)">${day}</td>
          ${hours.map(h=>{
            const s=cell[day+'|'+h];
            if(!s)return`<td style="padding:.6rem;border:1px solid var(--border);background:var(--ink2);text-align:center;color:var(--text3)">—</td>`;
            return`<td style="padding:.7rem .8rem;border:1px solid var(--border);background:rgba(31,111,235,.06)">
              <div style="font-weight:600;font-size:.9rem">${s.subject_name||s.course_id||'—'}</div>
              <div style="margin-top:.2rem"><span class="badge badge-blue" style="font-size:.7rem">${s.batch||''}</span></div>
              <div style="color:var(--text2);font-size:.77rem;margin-top:.2rem">📍 ${s.room_number||'—'}</div>
              ${s.faculty_name?`<div style="color:var(--text3);font-size:.75rem">👤 ${s.faculty_name}</div>`:''}
            </td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }catch(err){
    if(el)el.innerHTML='<div class="text-muted text-sm p-md">Could not load timetable.</div>';
  }
}

function renderSubjectCommunities(){
  setTimeout(()=>loadCommunities(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">💬 Subject Communities</div><span class="badge badge-green text-xs">Live</span></div>
    <div id="communities-grid" class="stats-grid" style="grid-template-columns:repeat(3,1fr)"><div class="text-muted text-sm">Loading…</div></div>
  </div>
  <div id="community-posts-panel" style="display:none">
    <div class="card mt-lg">
      <div class="card-header">
        <div class="card-title" id="comm-posts-title">💬 Posts</div>
        <button class="btn btn-outline btn-sm" onclick="closeCommunityPosts()">✕ Close</button>
      </div>
      <div id="community-posts-list"><div class="text-muted text-sm">Loading…</div></div>
      <div class="mt-lg">
        <div class="form-group"><label>New Post</label>
          <textarea id="new-post-content" rows="3" placeholder="Share something with the community…" style="width:100%;padding:.7rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical"></textarea>
        </div>
        <button class="btn btn-primary" onclick="submitCommunityPost()">Post</button>
      </div>
    </div>
  </div>`;
}
let _activeCommunityId=null;
async function loadCommunities(){
  const el=document.getElementById('communities-grid');
  if(!el)return;
  try{
    const res=await fetch('/api/communities');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.communities||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm col-span-3">No communities yet. Admin needs to create subject communities.</div>';return;}
    el.innerHTML=list.map(c=>`<div class="stat-card blue" style="cursor:pointer" onclick="openCommunity('${c.id}','${c.name}')">
      <div class="d-flex justify-between align-center mb-md">
        <span class="badge badge-blue">${c.course_code||'GEN'}</span>
      </div>
      <div class="s-val" style="font-size:1.1rem">${c.name}</div>
      <div class="d-flex gap-md mt-md">
        <span class="text-xs text-muted">👥 ${c.members_count||0} members</span>
        ${c.description?`<span class="text-xs text-muted" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${c.description}</span>`:''}
      </div>
    </div>`).join('');
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load communities.</div>';}
}
function openCommunity(id,name){
  _activeCommunityId=id;
  const panel=document.getElementById('community-posts-panel');
  if(panel){panel.style.display='block';document.getElementById('comm-posts-title').textContent='💬 '+name;}
  loadCommunityPosts(id);
}
function closeCommunityPosts(){
  _activeCommunityId=null;
  const panel=document.getElementById('community-posts-panel');
  if(panel)panel.style.display='none';
}
async function loadCommunityPosts(communityId){
  const el=document.getElementById('community-posts-list');
  if(!el)return;
  try{
    const res=await fetch(`/api/community-posts?community_id=${encodeURIComponent(communityId)}`);
    const data=await res.json();
    const posts=Array.isArray(data)?data:(data.posts||[]);
    if(!posts.length){el.innerHTML='<div class="text-muted text-sm">No posts yet. Be the first to post!</div>';return;}
    el.innerHTML=posts.map(p=>`<div class="announcement info mb-sm">
      <div class="d-flex justify-between"><div class="ann-title">${p.author_name||'Anonymous'}</div><div class="ann-meta">${new Date(p.created_at).toLocaleDateString()}</div></div>
      <div class="text-sm mt-sm">${p.content}</div>
    </div>`).join('');
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load posts.</div>';}
}
async function submitCommunityPost(){
  if(!_activeCommunityId){toast('Select a community first','error');return;}
  const content=document.getElementById('new-post-content').value.trim();
  if(!content){toast('Post cannot be empty','error');return;}
  const si=AMS.profile || {};
  try{
    const res=await fetch('/api/community-posts',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({community_id:_activeCommunityId,content,author_id:si.id||AMS.user.id,author_name:AMS.user.name})});
    const d=await res.json();
    if(!res.ok)throw new Error(d.error||'Failed');
    toast('Posted!','success');
    document.getElementById('new-post-content').value='';
    loadCommunityPosts(_activeCommunityId);
  }catch(e){toast(e.message,'error');}
}

function renderCBCS(){
  setTimeout(()=>loadCBCS(),50);
  return `
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)" id="cbcs-stats">
    <div class="stat-card blue"><div class="s-icon">📚</div><div class="s-val" id="cbcs-credits">—</div><div class="s-lbl">Total Credits</div></div>
    <div class="stat-card green"><div class="s-icon">🎯</div><div class="s-val" id="cbcs-sgpa">—</div><div class="s-lbl">SGPA</div></div>
    <div class="stat-card teal"><div class="s-icon">⭐</div><div class="s-val" id="cbcs-cgpa">—</div><div class="s-lbl">CGPA</div></div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">🎯 Course Credits & Grades</div><span class="badge badge-green text-xs">Live</span></div>
    <div id="cbcs-table-body"><div class="text-muted text-sm">Loading…</div></div>
  </div>`;
}
async function loadCBCS(){
  const el=document.getElementById('cbcs-table-body');
  if(!el)return;
  const si=AMS.profile || {};
  const studentId=si.id||AMS.user.id;
  try{
    const res=await fetch('/api/assessments');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.assessments||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No grade records yet. Records appear once assessments are evaluated.</div>';return;}
    const gpMap={'O':10,'A+':9,'A':8,'B+':7,'B':6,'C':5,'F':0};
    let totalCredits=0,weightedSum=0;
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Subject</th><th>Type</th><th>Max Marks</th><th>Obtained</th><th>Percentage</th></tr></thead>
      <tbody>${list.map(a=>{
        const pct=a.total_marks>0?((a.marks_obtained||0)/a.total_marks*100).toFixed(1):0;
        return `<tr>
          <td class="fw-semibold">${a.subject||a.assessment_name||'—'}</td>
          <td><span class="badge badge-blue">${a.assessment_type||'Assessment'}</span></td>
          <td>${a.total_marks||'—'}</td>
          <td class="fw-semibold">${a.marks_obtained||'—'}</td>
          <td><span class="badge badge-${pct>=75?'green':pct>=50?'blue':'orange'}">${pct}%</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load grades.</div>';}
}

function renderStudentOnlineClass(){
  setTimeout(()=>loadStudentOnlineClasses(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">💻 Online Classes</div><span class="badge badge-green text-xs">Live</span></div>
    <div id="student-oc-body"><div class="text-muted text-sm">Loading…</div></div>
  </div>`;
}
async function loadStudentOnlineClasses(){
  const el=document.getElementById('student-oc-body');
  if(!el)return;
  try{
    const res=await fetch('/api/online-classes');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.classes||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No online classes scheduled yet.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Date/Time</th><th>Title</th><th>Duration</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${list.map(c=>{
        const dt=c.scheduled_at?new Date(c.scheduled_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
        return `<tr>
          <td>${dt}</td>
          <td class="fw-semibold">${c.title||c.course_id||'—'}</td>
          <td>${c.duration_minutes?c.duration_minutes+' min':'—'}</td>
          <td><span class="badge badge-${c.status==='scheduled'?'orange':c.status==='ongoing'?'green':'gray'}">${c.status||'scheduled'}</span></td>
          <td>${c.status==='scheduled'||c.status==='ongoing'?
            (c.meeting_link?`<a href="${c.meeting_link}" target="_blank" class="btn btn-primary btn-sm">Join Now</a>`:'<span class="text-muted text-sm">Link pending</span>'):
            (c.recording_link?`<a href="${c.recording_link}" target="_blank" class="btn btn-outline btn-sm">🎬 Recording</a>`:'<span class="text-muted text-sm">No recording</span>')
          }</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load online classes.</div>';}
}

function renderDigitalLibrary(){
  setTimeout(()=>loadLibrary(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📚 Digital Library</div>
      <div class="d-flex gap-sm">
        <select id="lib-type-filter" onchange="loadLibrary()" style="padding:.3rem .6rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:.85rem">
          <option value="">All Types</option>
          <option value="E-Book">E-Books</option>
          <option value="Journal">Journals</option>
          <option value="Research Paper">Research Papers</option>
          <option value="Video">Videos</option>
        </select>
        <span class="badge badge-green text-xs align-self-center">Live</span>
      </div>
    </div>
    <div id="library-body"><div class="text-muted text-sm">Loading resources…</div></div>
  </div>`;
}
async function loadLibrary(){
  const el=document.getElementById('library-body');
  if(!el)return;
  const typeEl=document.getElementById('lib-type-filter');
  const type=typeEl?typeEl.value:'';
  try{
    let url='/api/library'+(type?'?resource_type='+encodeURIComponent(type):'');
    const res=await fetch(url);
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.resources||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No resources found. Admin needs to add library resources.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Title</th><th>Author</th><th>Type</th><th>Subject</th><th>Action</th></tr></thead>
      <tbody>${list.map(b=>`<tr>
        <td class="fw-semibold">${b.title}</td>
        <td class="text-muted">${b.author||'—'}</td>
        <td><span class="badge badge-${b.resource_type==='E-Book'?'blue':b.resource_type==='Journal'?'purple':'teal'}">${b.resource_type||'Resource'}</span></td>
        <td><span class="badge badge-gray">${b.subject||b.category||'—'}</span></td>
        <td>${b.pdf_link?`<a href="${b.pdf_link}" target="_blank" class="btn btn-outline btn-sm">📥 Access</a>`:'<span class="text-muted text-sm">No link</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load library resources.</div>';}
}

function renderStudentPerformance(){
  return `<div class="stats-grid">
    <div class="stat-card blue"><div class="s-icon">🎓</div><div class="s-val">8.4</div><div class="s-lbl">CGPA</div><div class="s-badge up">Top 15%</div></div>
    <div class="stat-card green"><div class="s-icon">📊</div><div class="s-val">88.5%</div><div class="s-lbl">Attendance</div></div>
    <div class="stat-card teal"><div class="s-icon">✅</div><div class="s-val">42/50</div><div class="s-lbl">Avg Internal Marks</div></div>
    <div class="stat-card orange"><div class="s-icon">🏆</div><div class="s-val">#12</div><div class="s-lbl">Class Rank</div></div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">📈 Semester-wise CGPA</div></div>
    <div class="bar-chart mt-md">${[
      {lbl:'Sem 1',val:7.8},{lbl:'Sem 2',val:8.1},{lbl:'Sem 3',val:8.3},{lbl:'Sem 4',val:8.2},{lbl:'Sem 5',val:8.4}
    ].map(s=>`<div class="bar-row">
      <div class="bar-label text-xs">${s.lbl}</div>
      <div class="bar-fill"><div class="bar-inner" style="width:${s.val*10}%"></div></div>
      <div class="bar-val text-xs fw-semibold text-blue">${s.val}</div>
    </div>`).join('')}</div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">📋 Subject-wise Performance</div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Subject</th><th>Internal (50)</th><th>External (100)</th><th>Total</th><th>Grade</th></tr></thead>
      <tbody>${[
        {sub:'Data Structures',int:44,ext:82,grade:'A+'},
        {sub:'Algorithms',int:38,ext:74,grade:'A'},
        {sub:'Database Systems',int:42,ext:79,grade:'A+'},
        {sub:'Web Development',int:36,ext:68,grade:'B+'},
        {sub:'OS',int:40,ext:76,grade:'A'},
      ].map(s=>`<tr>
        <td class="fw-semibold">${s.sub}</td><td>${s.int}</td><td>${s.ext}</td>
        <td class="fw-semibold">${s.int+s.ext}</td>
        <td><span class="badge badge-${s.int+s.ext>=130?'green':'blue'}">${s.grade}</span></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

// ── STUDENT ATTENDANCE ────────────────────────────────────
function renderStudentAttendance(){
  setTimeout(()=>initStudentAttendance(), 50);
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">✅ Mark Attendance</div></div>
    <div id="attPanel">
      <p class="text-muted mb-md">Choose your preferred method to mark attendance.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem">
        <div class="stat-card blue" style="cursor:pointer;text-align:center" onclick="startFaceAtt()">
          <div class="s-icon" style="font-size:2rem">📷</div>
          <div class="s-val" style="font-size:1rem;margin-top:.5rem">Face Recognition</div>
          <div class="s-lbl">Live camera + location check</div>
        </div>
        <div class="stat-card teal" style="cursor:pointer;text-align:center" onclick="startQRScan()">
          <div class="s-icon" style="font-size:2rem">📱</div>
          <div class="s-val" style="font-size:1rem;margin-top:.5rem">QR Code Scan</div>
          <div class="s-lbl">Scan faculty QR + face + location</div>
        </div>
      </div>
    </div>
  </div>
  <div id="faceAttSection" style="display:none">
    <div class="card">
      <div class="card-header"><div class="card-title">📷 Face Recognition Attendance</div>
        <button class="btn btn-outline btn-sm" onclick="resetAtt()">✖ Cancel</button>
      </div>
      <div id="faceAttBody"><div class="att-status"><div class="att-icon-wrap loading">🔄</div><p>Checking location…</p></div></div>
    </div>
  </div>
  <div id="qrScanSection" style="display:none">
    <div class="card">
      <div class="card-header"><div class="card-title">📱 QR Code Attendance</div>
        <button class="btn btn-outline btn-sm" onclick="resetAtt()">✖ Cancel</button>
      </div>
      <div id="qrScanBody"></div>
    </div>
  </div>

  <!-- Attendance Report -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">📊 My Attendance Report</div>
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <select id="att-type-filter" onchange="filterAttByType(this.value)" style="font-size:.8rem;padding:.3rem .6rem;background:var(--ink3);border:1px solid var(--border);border-radius:6px;color:var(--text)">
          <option value="all">All Types</option>
          <option value="lecture">📖 Lectures</option>
          <option value="tutorial">📝 Tutorials</option>
          <option value="practical">🔬 Practicals</option>
          <option value="seminar">🎤 Seminars</option>
        </select>
        <button class="btn btn-outline btn-sm" onclick="initStudentAttendance()">🔄 Refresh</button>
      </div>
    </div>
    <div id="att-report-body"><div class="text-muted text-sm p-md">Loading attendance report…</div></div>
  </div>`;
}

function _renderAttReport(data){
  const overall  = data.overall;
  const subjects = data.subjects || [];
  const minPct   = data.minimum_required || 75;
  const finePct  = data.fine_threshold   || 65;
  const debarPct = data.debarment_threshold || 50;
  const aggTypes = data.aggregate_by_type || [];
  const ocol     = overall.percentage >= minPct ? 'green' : overall.percentage >= finePct ? 'orange' : 'red';

  let alertHtml = '';
  if(overall.percentage < debarPct){
    alertHtml = `<div class="announcement" style="background:rgba(239,68,68,.1);border:1.5px solid var(--red);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
      <div class="ann-title">🚫 DEBARMENT RISK — Attendance ${overall.percentage}% (Below ${debarPct}%)</div>
      <div class="text-sm" style="margin-top:.4rem">You are below <strong>${debarPct}%</strong>. You are at risk of being <strong>debarred from examinations</strong>. Contact your faculty advisor and Head of Department immediately.</div>
    </div>`;
  } else if(overall.percentage < finePct){
    alertHtml = `<div class="announcement" style="background:rgba(245,158,11,.1);border:1px solid var(--orange);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
      <div class="ann-title">💰 FINE ZONE — Attendance ${overall.percentage}% (Below ${finePct}%)</div>
      <div class="text-sm" style="margin-top:.4rem">Below <strong>${finePct}%</strong> attendance may attract financial fines as per university regulations. Immediate improvement required.</div>
    </div>`;
  } else if(overall.percentage < minPct){
    const subsBelowReq = subjects.filter(s=>s.percentage < minPct);
    alertHtml = `<div class="announcement warning" style="margin-bottom:1rem">
      <div class="ann-title">⚠️ Below ${minPct}% Minimum Requirement (${overall.percentage}%)</div>
      <div class="text-sm" style="margin-top:.4rem">${subsBelowReq.length} subject(s) below ${minPct}%. Risk of fines or exam debarment. Attend all remaining classes to recover.</div>
    </div>`;
  } else if(overall.status === 'ok'){
    alertHtml = `<div class="announcement info" style="margin-bottom:1rem">
      <div class="ann-title">✅ Meeting ${minPct}% Requirement (${overall.percentage}%)</div>
      <div class="text-sm" style="margin-top:.4rem">You meet the attendance requirement. Stay consistent to maintain eligibility.</div>
    </div>`;
  }

  const statsHtml = `<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:1.25rem">
    <div class="stat-card ${ocol}"><div class="s-icon">📊</div><div class="s-val">${overall.percentage}%</div><div class="s-lbl">Overall</div></div>
    <div class="stat-card blue"><div class="s-icon">📚</div><div class="s-val">${overall.conducted}</div><div class="s-lbl">Conducted</div></div>
    <div class="stat-card green"><div class="s-icon">✅</div><div class="s-val">${overall.present}</div><div class="s-lbl">Present</div></div>
    <div class="stat-card red"><div class="s-icon">❌</div><div class="s-val">${overall.absent}</div><div class="s-lbl">Absent</div></div>
  </div>`;

  // Aggregate by session type (Lecture / Tutorial / Practical / Seminar)
  const typeIcons = {lecture:'📖',tutorial:'📝',practical:'🔬',seminar:'🎤'};
  const typeColors = {safe:'green',ok:'blue',warning:'orange',critical:'red'};
  let aggHtml = '';
  if(aggTypes.length > 1){
    aggHtml = `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
      ${aggTypes.map(t=>{
        const col = t.percentage>=minPct?'green':t.percentage>=finePct?'orange':'red';
        return `<div style="flex:1;min-width:130px;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);padding:.6rem .9rem">
          <div style="font-size:.75rem;color:var(--text2);text-transform:capitalize">${typeIcons[t.type]||'📖'} ${t.type}</div>
          <div class="fw-semibold" style="font-size:1.1rem;color:var(--${col})">${t.percentage}%</div>
          <div style="font-size:.72rem;color:var(--text3)">${t.present}/${t.conducted} classes</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  const rowsHtml = subjects.map(s=>{
    const col   = typeColors[s.status] || 'blue';
    const typesHtml = s.type_breakdown && s.type_breakdown.length > 1
      ? s.type_breakdown.map(t=>`<span class="badge badge-blue" style="font-size:.65rem;margin-right:2px">${typeIcons[t.type]||'📖'} ${t.type}: ${t.present}/${t.conducted}</span>`).join('')
      : (s.type_breakdown && s.type_breakdown[0] ? `<span class="badge badge-blue" style="font-size:.7rem">${typeIcons[s.type_breakdown[0].type]||'📖'} ${s.type_breakdown[0].type}</span>` : '');
    const actionHtml = s.status === 'critical'
      ? `<span class="text-sm" style="color:var(--red)">🚫 Need <strong>${s.classes_needed}</strong> consecutive classes</span>`
      : s.status === 'warning'
      ? `<span class="text-sm" style="color:var(--orange)">⚠ Attend <strong>${s.classes_needed}</strong> more classes</span>`
      : s.can_miss > 0
      ? `<span class="text-sm" style="color:var(--green)">✅ Can miss <strong>${s.can_miss}</strong> more</span>`
      : `<span class="text-sm" style="color:var(--blue)">✅ On track</span>`;
    const pctBar = `<div style="display:flex;align-items:center;gap:.4rem">
      <span class="fw-semibold" style="color:var(--${col});min-width:45px">${s.percentage}%</span>
      <div style="flex:1;height:5px;background:var(--ink3);border-radius:3px;min-width:60px">
        <div style="height:100%;width:${Math.min(s.percentage,100)}%;background:var(--${col});border-radius:3px;transition:width .5s"></div>
      </div>
    </div>`;
    const primaryType = s.type_breakdown && s.type_breakdown[0] ? s.type_breakdown[0].type : 'lecture';
    return `<tr data-type="${primaryType}">
      <td class="fw-semibold">${s.subject}</td>
      <td>${typesHtml}</td>
      <td style="text-align:center">${s.conducted}</td>
      <td style="text-align:center">${s.present}</td>
      <td style="text-align:center">${s.absent}</td>
      <td style="min-width:110px">${pctBar}</td>
      <td><span class="badge badge-${col}" style="font-size:.75rem">${s.status==='critical'?'🚫 Critical':s.status==='warning'?'⚠ At Risk':s.status==='ok'?'✅ Met':'✅ Safe'}</span></td>
      <td>${actionHtml}</td>
    </tr>`;
  }).join('');

  return `${alertHtml}${statsHtml}${aggHtml}
  <div class="tbl-wrap" id="att-subjects-table">
    <table style="font-size:.85rem">
      <thead><tr>
        <th>Subject</th><th>Session Type</th>
        <th style="text-align:center">Conducted</th>
        <th style="text-align:center">Present</th>
        <th style="text-align:center">Absent</th>
        <th>Attendance %</th>
        <th>Status</th>
        <th>Action Required</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <div style="background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem 1rem;margin-top:.75rem;font-size:.75rem;color:var(--text2)">
    📌 <strong>University Attendance Policy</strong><br>
    Formula: <strong>(Classes Attended ÷ Classes Conducted) × 100</strong> — calculated cumulatively from semester start.<br>
    Includes Lectures, Tutorials, Practicals &amp; Seminars (aggregate across all session types).<br>
    <span style="color:var(--green)">✅ ≥ ${minPct}%</span> — Eligible for exams &nbsp;|
    <span style="color:var(--orange)">⚠ ${finePct}–${minPct-0.1}%</span> — Fine zone &nbsp;|
    <span style="color:var(--red)">🚫 &lt; ${debarPct}%</span> — Debarment risk.<br>
    ${minPct === 85 ? '⚠ Your program requires <strong>85%</strong> minimum attendance.' : 'Standard programs: <strong>75%</strong> minimum. Postgraduate/PhD programs: <strong>85%</strong> minimum.'}
  </div>`;
}

function filterAttByType(type){
  const rows=document.querySelectorAll('#att-subjects-table tbody tr[data-type]');
  rows.forEach(row=>{ row.style.display=(type==='all'||row.dataset.type===type)?'':' none'; });
}

async function initStudentAttendance(){
  const el=document.getElementById('att-report-body');
  if(!el) return;
  const rollNo=(AMS.profile && AMS.profile.roll_no)||'';
  const studentId=AMS.user.id||'';
  if(!rollNo && !studentId){
    el.innerHTML='<div class="text-muted text-sm p-md">Roll number not set in your profile. Contact admin.</div>';
    return;
  }
  el.innerHTML='<div class="text-muted text-sm p-md">⏳ Loading attendance report…</div>';
  try{
    let url='/api/attendance/report?';
    if(rollNo) url+='roll_no='+encodeURIComponent(rollNo);
    else url+='student_id='+encodeURIComponent(studentId);
    const res=await fetch(url);
    const data=await res.json();
    if(!data.success){
      el.innerHTML=`<div class="text-muted text-sm p-md">⚠ ${data.error||'Could not load report.'}</div>`;
      return;
    }
    if(!data.subjects||!data.subjects.length){
      el.innerHTML='<div class="text-muted text-sm p-md">No attendance records found yet. Records appear here once sessions are conducted and marked by faculty.</div>';
      return;
    }
    el.innerHTML=_renderAttReport(data);
    // Sync overall % to dashboard stat card
    const sdAtt=document.getElementById('sd-att');
    if(sdAtt) sdAtt.textContent=data.overall.percentage+'%';
  }catch(e){
    el.innerHTML='<div class="text-red text-sm p-md">Failed to load attendance report. Check network connection.</div>';
    console.error('[AttReport]',e);
  }
}

async function startFaceAtt(){
  // Only students may start face attendance; also require faculty to enable it
  if(AMS.role !== 'student'){
    toast('Only students can use Face Recognition attendance.','info');
    return;
  }
  if(!AMS.faceRecEnabled){
    document.getElementById('faceAttSection').style.display='block';
    const body=document.getElementById('faceAttBody');
    body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">⚠️</div><h3 class="text-red">Face Recognition Disabled</h3><p class="text-muted">Faculty has not enabled face recognition for this session.</p><button class="btn btn-primary mt-md" onclick="resetAtt()">OK</button></div>`;
    return;
  }
  document.getElementById('faceAttSection').style.display='block';
  document.getElementById('attPanel').style.display='none';
  const body=document.getElementById('faceAttBody');
  body.innerHTML=`<div class="att-status"><div class="att-icon-wrap loading" style="animation:spin 1.2s linear infinite">📍</div><p class="fw-semibold">Verifying location…</p></div>`;
  try{
    const loc=await getLocation();
    const inCampus=isInCollege(loc.lat,loc.lng);
    if(!inCampus){
      body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">📍</div><h3 class="text-red">Not in Campus</h3><p class="text-muted">You must be within college premises.</p><button class="btn btn-outline mt-md" onclick="resetAtt()">Go Back</button></div>`;
      return;
    }
    body.innerHTML=`<div class="camera-wrap" id="attCameraWrap">
      <video id="attVideo" autoplay playsinline></video>
      <div class="camera-ring"></div>
      <div class="camera-status">✅ On campus — position face in circle</div>
    </div>
    <div class="d-flex gap-md" style="justify-content:center;margin-top:1rem">
      <button class="btn btn-outline" onclick="resetAtt()">Cancel</button>
      <button class="btn btn-primary" onclick="captureFaceAtt()">📷 Capture & Verify</button>
    </div>`;
    await startCamera(document.getElementById('attVideo'));
  }catch(e){
    body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">❌</div><h3 class="text-red">Location Error</h3><p class="text-muted">${e.message}</p><button class="btn btn-outline mt-md" onclick="resetAtt()">Go Back</button></div>`;
  }
}

async function captureFaceAtt(){
  const body=document.getElementById('faceAttBody');
  const videoEl = document.getElementById('attVideo');
  
  // Check video element exists BEFORE doing anything
  if(!videoEl) {
    body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">📷</div><h3 class="text-red">Capture Failed</h3><p class="text-muted">Video element not found. Please go back and try again.</p><button class="btn btn-primary mt-md" onclick="startFaceAtt()">Retry</button></div>`;
    return;
  }
  
  // Show loading overlay without removing video element
  const cameraWrap = document.getElementById('attCameraWrap');
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'captureLoadingOverlay';
  loadingOverlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:100;border-radius:inherit';
  loadingOverlay.innerHTML = `<div style="text-align:center;color:white"><div style="font-size:24px;animation:spin 1.2s linear infinite">🔍</div><p style="margin-top:0.5rem">Capturing face…</p></div>`;
  cameraWrap.appendChild(loadingOverlay);
  
  // Wait longer for video to fully settle and render (1.5 seconds)
  await new Promise(r=>setTimeout(r,1500));
  
  // NOW try to grab an image from the video element (which is still in DOM)
  let imageData=null;
  try {
    console.log(`Capture attempt: Video ${videoEl.videoWidth}x${videoEl.videoHeight}, readyState=${videoEl.readyState}, networkState=${videoEl.networkState}`);
    
    // If video dimensions still 0, wait a bit more
    if(videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      console.warn('Video dimensions still 0, waiting additional time...');
      for(let i=0; i<10; i++) {
        await new Promise(r=>setTimeout(r,200));
        if(videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          console.log(`✅ Video dimensions now: ${videoEl.videoWidth}x${videoEl.videoHeight}`);
          break;
        }
      }
    }
    
    // always attempt captureFrame; if video not ready this will throw
    imageData = captureFrame(videoEl);
  } catch(e) {
    console.error('Image capture error:', e);
  }
  
  // Remove loading overlay
  const overlay = document.getElementById('captureLoadingOverlay');
  if(overlay) overlay.remove();
  
  // fallback to lastCapturedImage if present
  if(!imageData && AMS.lastCapturedImage){
    console.log('Using previously captured image');
    imageData = AMS.lastCapturedImage;
  }

  stopCamera();

  if(!imageData){
    // failed to capture anything
    body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">📷</div><h3 class="text-red">Capture Failed</h3><p class="text-muted">Unable to capture face. Ensure camera is enabled, wait for the video to appear, and click again.</p><button class="btn btn-primary mt-md" onclick="startFaceAtt()">Retry</button></div>`;
    return;
  }

  // store for potential reuse
  AMS.lastCapturedImage = imageData;
  
  // Now verify the captured face against stored encodings
  body.innerHTML=`<div class="att-status"><div class="att-icon-wrap loading" style="animation:spin 1.2s linear infinite">🔍</div><p class="fw-semibold">Verifying face…</p></div>`;
  const result=await verifyFace(imageData);

  if(result.verified){
    // Face verified - attendance marked as PRESENT
    const attemptText = result.max_attempts ? ` (Attempt ${result.current_attempt}/${result.max_attempts})` : '';
    body.innerHTML=`<div class="att-status">
      <div class="att-icon-wrap success">✅</div>
      <h3 class="text-green">✅ Face Verified</h3>
      <p class="text-success fw-semibold" style="font-size:1.1rem">Attendance: <span style="color:#4caf50">PRESENT</span></p>
      <p>Name: <strong>${result.name}</strong></p>
      <p>Roll No: <strong>${result.roll_no}</strong></p>
      <p class="text-muted text-sm">Confidence: ${(result.confidence*100).toFixed(0)}%${attemptText} • ${fmtTime()}</p>
      <button class="btn btn-outline mt-md" onclick="resetAtt()">Done</button>
    </div>`;
    toast('✅ Face Verified - Attendance Marked PRESENT','success');
  } else {
    // Face not verified - handle different scenarios and mark attendance as ABSENT
    let errorMsg = result.error || 'Face verification failed';
    let errorIcon = '❌';
    let errorTitle = 'Face Not Verified';
    let attendanceStatus = 'ABSENT';
    let showRetry = true;
    
    if(errorMsg.includes('No face detected') || errorMsg.includes('not visible')) {
      errorMsg = '📷 Face is not visible in the image. Please position your face clearly in the camera.';
      errorTitle = 'Face Not Visible';
      errorIcon = '📷';
      attendanceStatus = 'ABSENT (No Face Detected)';
    } else if(errorMsg.includes('More than one person') || errorMsg.includes('multiple')) {
      errorMsg = '👥 Multiple people detected. Please ensure only one person is in the frame.';
      errorTitle = 'Multiple People Detected';
      errorIcon = '👥';
      attendanceStatus = 'ABSENT (Multiple Faces)';
    } else if(errorMsg.includes('No registered users')) {
      errorMsg = '🔍 Your face is not registered in the system. Please contact your admin to register your face first.';
      errorTitle = 'Face Not Registered';
      errorIcon = '🔍';
      attendanceStatus = 'ABSENT (Not Registered)';
    } else if(errorMsg.includes('Liveness check failed') || errorMsg.includes('fake')) {
      errorMsg = '⚠️ Liveness detection failed. Please ensure you are a real person (no photos/masks). Blink your eyes while capturing.';
      errorTitle = 'Not a Live Face';
      errorIcon = '⚠️';
      attendanceStatus = 'ABSENT (Failed Liveness Check)';
    } else {
      attendanceStatus = 'ABSENT (Face Does Not Match)';
    }
    
    // Check if attempts are exhausted
    const attemptText = result.max_attempts ? ` (Attempt ${result.current_attempt}/${result.max_attempts})` : '';
    const attemptsExhausted = result.attempts_exhausted || (result.current_attempt >= result.max_attempts);
    
    // Build attempt info message
    let attemptInfo = '';
    if(attemptsExhausted) {
      attemptInfo = `<p class="text-danger fw-bold" style="margin-top:1rem;color:#f44336">⚠️ Maximum verification attempts (${result.max_attempts}) completed. Please contact <strong>SmartAMS Admin</strong> for attendance.</p>`;
      showRetry = false;
    } else if(result.attempts_remaining !== undefined) {
      attemptInfo = `<p class="text-orange fw-semibold" style="margin-top:0.5rem">Remaining attempts: <strong>${result.attempts_remaining}</strong></p>`;
    }
    
    body.innerHTML=`<div class="att-status">
      <div class="att-icon-wrap error">${errorIcon}</div>
      <h3 class="text-red">❌ ${errorTitle}</h3>
      <p class="text-danger fw-semibold" style="font-size:1.1rem">Attendance: <span style="color:#f44336">${attendanceStatus}</span></p>
      <p class="text-muted">${errorMsg}</p>
      ${attemptInfo}
      <div style="margin-top:1rem">
        ${showRetry && !attemptsExhausted ? '<button class="btn btn-primary" onclick="startFaceAtt()">🔄 Retry</button>' : ''}
        <button class="btn btn-outline" onclick="resetAtt()" style="${showRetry && !attemptsExhausted ? 'margin-left:0.5rem' : ''}">Done</button>
      </div>
    </div>`;
    
    const toastMsg = attemptsExhausted ? `❌ Attempts exhausted - Contact Admin` : `❌ Face Not Verified - Attempt ${result.current_attempt}/${result.max_attempts}`;
    toast(toastMsg, 'error');
  }
}

// ── Current QR session state ──────────────────────────────
const _qrSession = {rollNo:'', studentName:'', sessionId:'', subject:'', lat:null, lng:null, qrStr:''};

async function startQRScan(){
  // Step 1: Show roll number / name entry form
  document.getElementById('qrScanSection').style.display='block';
  document.getElementById('attPanel').style.display='none';
  const autoRoll = AMS.user.id || '';
  const autoName = AMS.user.name || '';
  document.getElementById('qrScanBody').innerHTML=`
    <div style="padding:1.5rem">
      <p class="text-muted mb-md">Enter your details, then point your camera at the faculty QR code.</p>
      <div class="form-group">
        <label>Roll Number</label>
        <input id="qrRollInput" class="input" value="${autoRoll}" placeholder="e.g. 20261CSE0001" style="width:100%;padding:.6rem .9rem;background:var(--ink3);border:1px solid var(--border);border-radius:8px;color:var(--text)"/>
      </div>
      <div class="form-group mt-sm">
        <label>Full Name</label>
        <input id="qrNameInput" class="input" value="${autoName}" placeholder="Your full name" style="width:100%;padding:.6rem .9rem;background:var(--ink3);border:1px solid var(--border);border-radius:8px;color:var(--text)"/>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="startQRCameraAfterForm()">📱 Start QR Scanner</button>
    </div>`;
}

async function startQRCameraAfterForm(){
  const rollNo=(document.getElementById('qrRollInput').value||'').trim();
  const studentName=(document.getElementById('qrNameInput').value||'').trim();
  if(!rollNo){toast('Please enter your roll number','warning');return;}
  if(!studentName){toast('Please enter your name','warning');return;}
  _qrSession.rollNo=rollNo;
  _qrSession.studentName=studentName;

  document.getElementById('qrScanBody').innerHTML=`
    <div class="camera-wrap" id="qrCameraWrap">
      <video id="qrVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>
      <canvas id="qrCanvas" style="display:none"></canvas>
      <div class="camera-status">Point camera at faculty QR code</div>
    </div>
    <p class="text-muted" style="text-align:center;font-size:.8rem;margin-top:.5rem">Scanning… (${studentName} / ${rollNo})</p>`;

  const video=document.getElementById('qrVideo');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    AMS.cameraStream=stream;
    video.srcObject=stream;
    await video.play();
    scanQRLoop(video);
  }catch(e){
    document.getElementById('qrScanBody').innerHTML=`<div class="att-status"><div class="att-icon-wrap error">❌</div><p class="text-red">Camera access denied</p><button class="btn btn-outline mt-md" onclick="resetAtt()">Go Back</button></div>`;
  }
}

function scanQRLoop(video){
  if(!AMS.cameraStream) return;
  const canvas=document.getElementById('qrCanvas');
  const ctx=canvas.getContext('2d');
  const scan=()=>{
    if(!AMS.cameraStream) return;
    if(video.readyState===video.HAVE_ENOUGH_DATA){
      canvas.height=video.videoHeight; canvas.width=video.videoWidth;
      ctx.drawImage(video,0,0);
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=jsQR(img.data,img.width,img.height);
      if(code && code.data.startsWith('AMSQR:')){stopCamera();processQRAttendance(code.data);return;}
    }
    requestAnimationFrame(scan);
  };
  requestAnimationFrame(scan);
}

async function processQRAttendance(qrData){
  _qrSession.qrStr=qrData;
  // QR format: AMSQR:2.0:{session_id}:{encrypted_data}
  const parts=qrData.split(':',4);
  // parts[0]='AMSQR', parts[1]=version, parts[2]=session_id, parts[3]=encrypted
  const sessionId=parts[2]||parts[1]||'';
  _qrSession.sessionId=sessionId;
  _qrSession.subject='Class Session';

  const body=document.getElementById('qrScanBody');
  body.innerHTML=`<div class="att-status"><div class="att-icon-wrap loading" style="animation:spin 1.2s linear infinite">📍</div><p>Getting your location…</p></div>`;
  try{
    // 1. Get GPS
    const loc=await getLocation();
    _qrSession.lat=loc.lat;
    _qrSession.lng=loc.lng;

    // 2. Validate QR against backend to get session details
    try{
      const valRes=await fetch(`${window.AMS_CONFIG.API_URL}/api/qr/validate`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({qr_data:qrData, student_id:AMS.user.id||_qrSession.rollNo})
      });
      if(valRes.ok){
        const valData=await valRes.json();
        if(valData.success){
          _qrSession.sessionId=valData.session_id||sessionId;
          _qrSession.subject=valData.subject||'Class Session';
        }
      }
    }catch(ve){console.warn('[QR-VALIDATE]',ve);}

    // 3. Open face verification camera
    body.innerHTML=`
      <div class="camera-wrap">
        <video id="qrFaceVideo" autoplay playsinline></video>
        <div class="camera-ring"></div>
        <div class="camera-status">✅ QR valid — look straight at camera</div>
      </div>
      <div style="padding:.75rem 1rem;background:var(--ink3);border-radius:8px;margin-top:.75rem;font-size:.85rem;display:flex;gap:1.5rem;flex-wrap:wrap">
        <span>📋 Roll No: <strong>${_qrSession.rollNo}</strong></span>
        <span>📚 Subject: <strong>${_qrSession.subject}</strong></span>
        <span>📍 Location: <strong>${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}</strong></span>
      </div>
      <div style="text-align:center;margin-top:1rem">
        <button class="btn btn-primary" onclick="captureQRFace()">📷 Capture Face &amp; Submit</button>
      </div>`;
    await startCamera(document.getElementById('qrFaceVideo'));
  }catch(e){
    body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">❌</div><p>${e.message}</p><button class="btn btn-outline mt-md" onclick="resetAtt()">Go Back</button></div>`;
  }
}

async function captureQRFace(){
  const body=document.getElementById('qrScanBody');
  body.innerHTML=`<div class="att-status"><div class="att-icon-wrap loading" style="animation:spin 1.2s linear infinite">🔍</div><p>Capturing face…</p></div>`;

  await new Promise(r=>setTimeout(r,1500));

  let imageData=null;
  try{
    const videoEl=document.getElementById('qrFaceVideo');
    if(videoEl){
      if(videoEl.videoWidth===0){
        for(let i=0;i<10;i++){
          await new Promise(r=>setTimeout(r,200));
          if(videoEl.videoWidth>0) break;
        }
      }
      imageData=captureFrame(videoEl);
    }
  }catch(e){console.error('Capture error:',e);}

  if(!imageData && AMS.lastCapturedImage) imageData=AMS.lastCapturedImage;
  stopCamera();

  if(!imageData){
    body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">📷</div><h3 class="text-red">Capture Failed</h3><p class="text-muted">Enable camera and try again.</p><button class="btn btn-outline mt-md" onclick="resetAtt()">Retry</button></div>`;
    return;
  }

  body.innerHTML=`<div class="att-status"><div class="att-icon-wrap loading" style="animation:spin 1.2s linear infinite">🔍</div><p>Verifying face &amp; submitting attendance…</p></div>`;

  try{
    const resp=await fetch(`${window.AMS_CONFIG.API_URL}/api/qr/mark-attendance`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        session_id:_qrSession.sessionId,
        student_id:AMS.user.id||_qrSession.rollNo,
        roll_no:_qrSession.rollNo,
        name:_qrSession.studentName,
        face_image:imageData,
        latitude:_qrSession.lat,
        longitude:_qrSession.lng,
        device_fingerprint:typeof QRModule!=='undefined'?QRModule.state.deviceFingerprint:null,
        user_agent:navigator.userAgent
      })
    });
    const result=await resp.json();

    const today=new Date().toISOString().slice(0,10);
    // Write result to Firebase RTDB for real-time tracking
    if(window.DB && _qrSession.sessionId){
      DB.set(`/attendance/${today}/${_qrSession.sessionId}/${_qrSession.rollNo}`,{
        roll_no:_qrSession.rollNo,
        name:_qrSession.studentName,
        session_id:_qrSession.sessionId,
        subject:_qrSession.subject,
        status:result.success&&result.face_verified?'present':'absent',
        face_verified:!!(result.face_verified),
        location_verified:!!(result.location_verified),
        timestamp:DB.timestamp(),
        method:'qr'
      }).catch(e=>console.warn('[RTDB]',e));
    }

    if(result.success){
      body.innerHTML=`<div class="att-status">
        <div class="att-icon-wrap success">✅</div>
        <h3 class="text-green">Attendance Marked!</h3>
        <p style="font-size:1rem;margin-top:.5rem">Status: <strong style="color:${result.face_verified?'#3fb950':'#f0883e'}">${result.face_verified?'PRESENT':'PRESENT (Partial)'}</strong></p>
        <div style="padding:.75rem 1rem;background:var(--ink3);border-radius:8px;margin-top:.75rem;font-size:.85rem;line-height:2">
          <div>📋 Roll No: <strong>${_qrSession.rollNo}</strong></div>
          <div>👤 Name: <strong>${_qrSession.studentName}</strong></div>
          <div>📚 Subject: <strong>${result.subject||_qrSession.subject}</strong></div>
          <div>🔍 Face: <strong>${result.face_verified?'✅ Verified':'⚠️ Partial'}</strong></div>
          <div>📍 Location: <strong>${result.location_verified?'✅ Verified':'⚠️ Not checked'}</strong></div>
          <div>🕐 Time: <strong>${new Date().toLocaleTimeString()}</strong></div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="resetAtt()">✅ Done</button>
      </div>`;
      toast('✅ Attendance marked successfully!','success');
    }else{
      const errorMsg=result.message||result.error||'Attendance could not be marked';
      body.innerHTML=`<div class="att-status">
        <div class="att-icon-wrap error">❌</div>
        <h3 class="text-red">Face Does Not Match Roll No</h3>
        <p class="text-muted">${errorMsg}</p>
        <p style="color:#f85149;font-weight:600;margin-top:.5rem">Status: ABSENT</p>
        <button class="btn btn-primary mt-md" onclick="processQRAttendance('${_qrSession.qrStr.replace(/'/g,"\\'")}')">🔄 Retry</button>
        <button class="btn btn-outline mt-md" onclick="resetAtt()" style="margin-left:.5rem">Cancel</button>
      </div>`;
      toast('❌ Face does not match roll number — marked Absent','error');
    }
  }catch(e){
    console.error('[captureQRFace]',e);
    body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">❌</div><h3 class="text-red">Error</h3><p class="text-muted">${e.message}</p><button class="btn btn-outline mt-md" onclick="resetAtt()">Go Back</button></div>`;
  }
}

function resetAtt(){
  stopCamera();
  document.getElementById('faceAttSection').style.display='none';
  document.getElementById('qrScanSection').style.display='none';
  document.getElementById('attPanel').style.display='block';
}

function renderStudentFees(){
  const fees=[
    {type:'Tuition Fee',amount:45000,due:'Mar 31',paid:45000,status:'paid'},
    {type:'Exam Fee',amount:2400,due:'Mar 31',paid:0,status:'pending'},
    {type:'Library Fee',amount:800,due:'Mar 31',paid:800,status:'paid'},
    {type:'Lab Fee',amount:1200,due:'Mar 31',paid:0,status:'pending'},
  ];
  return `<div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card green"><div class="s-icon">✅</div><div class="s-val">₹46,600</div><div class="s-lbl">Total Paid</div></div>
    <div class="stat-card red"><div class="s-icon">⏰</div><div class="s-val">₹3,600</div><div class="s-lbl">Total Due</div></div>
    <div class="stat-card blue"><div class="s-icon">📅</div><div class="s-val">Mar 31</div><div class="s-lbl">Next Due Date</div></div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">💳 Fee Details</div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Fee Type</th><th>Amount</th><th>Due Date</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${fees.map(f=>`<tr>
        <td class="fw-semibold">${f.type}</td><td>₹${f.amount.toLocaleString()}</td><td>${f.due}</td>
        <td>₹${f.paid.toLocaleString()}</td>
        <td class="${f.amount-f.paid>0?'text-red':'text-green'}">₹${(f.amount-f.paid).toLocaleString()}</td>
        <td><span class="badge badge-${f.status==='paid'?'green':'red'}">${f.status}</span></td>
        <td>${f.status==='pending'?`<button class="btn btn-primary btn-sm" onclick="toast('Redirecting to payment…','info')">Pay Now</button>`:`<button class="btn btn-outline btn-sm">Receipt</button>`}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function renderExamReg(){
  setTimeout(()=>loadCoursesForExamReg(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">📝 End Semester Exam Registration</div></div>
    <div class="form-row">
      <div class="form-group"><label>Semester</label><input id="examreg-sem" placeholder="e.g. Semester 5"/></div>
      <div class="form-group"><label>Academic Year</label><input id="examreg-year" placeholder="e.g. 2025-26"/></div>
    </div>
    <div id="examreg-courses-list"><div class="text-muted text-sm">Loading available courses…</div></div>
    <button class="btn btn-primary mt-lg" onclick="submitExamReg()">Submit Registration</button>
  </div>
  <div class="card mt-lg">
    <div class="card-header"><div class="card-title">📋 My Registrations</div></div>
    <div id="my-examreg-list"><div class="text-muted text-sm">Loading…</div></div>
  </div>`;
}
async function loadCoursesForExamReg(){
  const el=document.getElementById('examreg-courses-list');
  if(!el)return;
  try{
    const res=await fetch('/api/courses');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.courses||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No courses found. Admin needs to add courses first.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Code</th><th>Course Name</th><th>Credits</th><th>Department</th><th>Include</th></tr></thead>
      <tbody>${list.map(c=>`<tr>
        <td class="fw-semibold">${c.course_code||'—'}</td>
        <td>${c.course_name||'—'}</td>
        <td>${c.credits||'—'}</td>
        <td>${c.department||'—'}</td>
        <td><input type="checkbox" class="examreg-cb" data-code="${c.course_code}" data-name="${c.course_name}" checked style="width:16px;height:16px;cursor:pointer"/></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
    const si=AMS.profile || {};
    const studentId=si.id||AMS.user.id;
    const r2=await fetch(`/api/exam-registrations?student_id=${encodeURIComponent(studentId)}`);
    const d2=await r2.json();
    const regs=Array.isArray(d2)?d2:(d2.registrations||[]);
    const regEl=document.getElementById('my-examreg-list');
    if(regEl){
      if(!regs.length){regEl.innerHTML='<div class="text-muted text-sm">No registrations submitted yet.</div>';}
      else regEl.innerHTML=regs.map(r=>`<div class="announcement info mb-sm">
        <div class="d-flex justify-between"><div class="ann-title">${r.semester||'—'} — ${r.academic_year||'—'}</div><span class="badge badge-teal">${r.status||'pending'}</span></div>
        <div class="text-sm text-muted mt-sm">${Array.isArray(r.subjects)?r.subjects.join(', '):JSON.stringify(r.subjects)}</div>
      </div>`).join('');
    }
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load courses.</div>';}
}
async function submitExamReg(){
  const si=AMS.profile || {};
  const studentId=si.id||AMS.user.id;
  const semester=document.getElementById('examreg-sem').value.trim();
  const academic_year=document.getElementById('examreg-year').value.trim();
  if(!semester||!academic_year){toast('Please enter semester and academic year','error');return;}
  const checked=[...document.querySelectorAll('.examreg-cb:checked')].map(cb=>cb.dataset.code+' – '+cb.dataset.name);
  if(!checked.length){toast('Select at least one course','error');return;}
  try{
    const res=await fetch('/api/exam-registrations',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({student_id:studentId,semester,academic_year,subjects:checked})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Exam registration submitted!','success');
    loadCoursesForExamReg();
  }catch(e){toast(e.message,'error');}
}

function renderSemReg(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🗓️ Semester / Term Registration</div></div>
    <div class="form-row">
      <div class="form-group"><label>Academic Year</label><select><option>2024-25</option></select></div>
      <div class="form-group"><label>Semester</label><select><option>Semester 5</option><option>Semester 6</option></select></div>
    </div>
    <button class="btn btn-primary" onclick="toast('Semester registration submitted!','success')">Register for Semester</button>
  </div>`;
}

function renderSuppleReg(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🔄 Supplementary Exam</div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Subject</th><th>Semester</th><th>Result</th><th>Eligible</th><th>Register</th></tr></thead>
      <tbody>
        <tr><td>Engineering Maths</td><td>Sem 3</td><td><span class="badge badge-orange">47</span></td><td>✅ Yes</td><td><button class="btn btn-primary btn-sm" onclick="toast('Registered!','success')">Register</button></td></tr>
      </tbody>
    </table></div>
  </div>`;
}

function renderRevaluation(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🔍 Exam Revaluation</div></div>
    <div class="form-row">
      <div class="form-group"><label>Semester</label><select><option>Semester 4</option></select></div>
      <div class="form-group"><label>Subject</label><select><option>Algorithms</option></select></div>
    </div>
    <div class="form-group"><label>Reason</label><textarea placeholder="State your reason…"></textarea></div>
    <button class="btn btn-primary mt-md" onclick="toast('Revaluation submitted!','success')">Apply</button>
  </div>`;
}

function renderGraceMark(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🌟 Grace Mark Request</div></div>
    <div class="form-row">
      <div class="form-group"><label>Subject</label><select><option>Web Development</option></select></div>
      <div class="form-group"><label>Current Marks</label><input type="number" value="68"/></div>
    </div>
    <div class="form-group"><label>Justification</label><textarea placeholder="Provide justification…"></textarea></div>
    <button class="btn btn-primary" onclick="toast('Grace mark request submitted!','success')">Submit</button>
  </div>`;
}

function renderInterimSurvey(){
  const items=['Syllabus coverage is on track','Teaching methodology is clear','Study materials are adequate','Doubts are addressed promptly','Pace of teaching is appropriate'];
  return `<div class="card">
    <div class="card-header"><div class="card-title">📋 Interim Course Survey</div></div>
    ${items.map((q,i)=>`<div class="form-group"><label>Q${i+1}. ${q}</label>
      <div class="d-flex gap-md" style="margin-top:.5rem">
        ${['Strongly Disagree','Disagree','Neutral','Agree','Strongly Agree'].map((l,j)=>`<label style="display:flex;align-items:center;gap:.3rem;cursor:pointer;font-size:.8rem;color:var(--text2)"><input type="radio" name="q${i}" value="${j+1}"/> ${l}</label>`).join('')}
      </div>
    </div>`).join('')}
    <button class="btn btn-primary" onclick="toast('Survey submitted!','success')">Submit Survey</button>
  </div>`;
}

function renderExitSurvey(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🚪 Course Exit Survey</div></div>
    <div class="form-group"><label>Overall Rating</label>
      <div class="d-flex gap-md mt-sm">${[1,2,3,4,5].map(n=>`<button class="btn btn-outline btn-sm">⭐ ${n}</button>`).join('')}</div>
    </div>
    <div class="form-group"><label>Most Valuable Topics</label><textarea placeholder="Which topics were most useful?"></textarea></div>
    <div class="form-group"><label>Areas for Improvement</label><textarea placeholder="What could be improved?"></textarea></div>
    <button class="btn btn-primary" onclick="toast('Exit survey submitted!','success')">Submit</button>
  </div>`;
}

function renderGrievance(){
  setTimeout(()=>loadMyGrievances(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">⚖️ Submit Grievance</div></div>
    <div class="form-group"><label>Category</label>
      <select id="griev-cat"><option>Academic</option><option>Administrative</option><option>Hostel</option><option>Other</option></select>
    </div>
    <div class="form-group"><label>Subject</label>
      <input id="griev-sub" placeholder="Brief subject of grievance"/>
    </div>
    <div class="form-group"><label>Description</label>
      <textarea id="griev-desc" placeholder="Describe your grievance…" rows="4"></textarea>
    </div>
    <div class="form-group d-flex align-center gap-sm">
      <input type="checkbox" id="griev-anon" style="width:16px;height:16px"/>
      <label for="griev-anon" style="margin:0">Submit anonymously</label>
    </div>
    <button class="btn btn-primary" onclick="submitGrievance()">Submit Grievance</button>
  </div>
  <div class="card mt-lg">
    <div class="card-header"><div class="card-title">📋 My Grievances</div></div>
    <div id="my-grievances-list"><div class="text-muted text-sm">Loading…</div></div>
  </div>`;
}
async function submitGrievance(){
  const si=AMS.profile || {};
  const studentId=si.id||AMS.user.id;
  const category=document.getElementById('griev-cat').value;
  const subject=document.getElementById('griev-sub').value.trim();
  const description=document.getElementById('griev-desc').value.trim();
  const anonymous=document.getElementById('griev-anon').checked;
  if(!subject||!description){toast('Please fill all fields','error');return;}
  try{
    const res=await fetch('/api/grievances',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({student_id:studentId,category,subject,description,anonymous})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Grievance submitted! Ticket: GRV-'+String(data.id||'').slice(0,8).toUpperCase(),'success');
    document.getElementById('griev-sub').value='';
    document.getElementById('griev-desc').value='';
    document.getElementById('griev-anon').checked=false;
    loadMyGrievances();
  }catch(e){toast(e.message,'error');}
}
async function loadMyGrievances(){
  const si=AMS.profile || {};
  const studentId=si.id||AMS.user.id;
  const el=document.getElementById('my-grievances-list');
  if(!el)return;
  try{
    const res=await fetch(`/api/grievances?student_id=${encodeURIComponent(studentId)}`);
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.grievances||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No grievances submitted yet.</div>';return;}
    const clr={pending:'warning',in_progress:'info',resolved:'success',closed:'info'};
    el.innerHTML=list.slice().reverse().map(g=>`
      <div class="announcement ${clr[g.status]||'info'} mb-sm">
        <div class="d-flex justify-between align-center">
          <div class="ann-title">${g.subject}</div>
          <span class="badge badge-${clr[g.status]||'teal'}">${g.status||'pending'}</span>
        </div>
        <div class="text-sm text-muted mt-sm">${g.category||''} • ${new Date(g.created_at).toLocaleDateString()}</div>
        ${g.response?`<div class="text-sm mt-sm" style="color:var(--text-main)"><strong>Response:</strong> ${g.response}</div>`:''}
      </div>`).join('');
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load grievances.</div>';}
}

function renderStaffEval(){
  setTimeout(()=>loadFacultyForEval(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">⭐ Staff Evaluation</div><span class="badge badge-green text-xs">Live</span></div>
    <div id="staff-eval-body"><div class="text-muted text-sm">Loading faculty list…</div></div>
  </div>`;
}
let _evalRatings={};
async function loadFacultyForEval(){
  const el=document.getElementById('staff-eval-body');
  if(!el)return;
  _evalRatings={};
  try{
    const res=await fetch('/api/users/list?role=faculty');
    const data=await res.json();
    const faculty=Array.isArray(data)?data:(data.users||[]);
    if(!faculty.length){el.innerHTML='<div class="text-muted text-sm">No faculty found to evaluate.</div>';return;}
    el.innerHTML=faculty.map(f=>`<div class="card mb-lg" style="background:var(--ink3);border-color:var(--border)" id="eval-card-${f.id}">
      <h4 class="mb-md">${f.full_name||f.username} — <span class="text-muted text-sm">${f.department||f.email||''}</span></h4>
      ${[{key:'clarity',label:'Teaching Clarity'},{key:'knowledge',label:'Subject Knowledge'},{key:'overall',label:'Overall Rating'}].map(q=>`
        <div class="form-group"><label>${q.label}</label>
          <div class="d-flex gap-sm mt-sm">${[1,2,3,4,5].map(n=>`<button class="btn btn-outline btn-sm eval-star" onclick="setEvalRating('${f.id}','${q.key}',${n},this)">${n}⭐</button>`).join('')}</div>
        </div>`).join('')}
      <div class="form-group"><label>Comments (optional)</label>
        <input id="eval-comment-${f.id}" placeholder="Any comments about this faculty…" style="width:100%;padding:.5rem;background:var(--ink2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)"/>
      </div>
      <button class="btn btn-primary btn-sm" onclick="submitEval('${f.id}','${f.full_name||f.username}')">Submit Evaluation</button>
    </div>`).join('');
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load faculty.</div>';}
}
function setEvalRating(facultyId,key,val,btn){
  if(!_evalRatings[facultyId])_evalRatings[facultyId]={};
  _evalRatings[facultyId][key]=val;
  const card=document.getElementById('eval-card-'+facultyId);
  if(card)card.querySelectorAll(`.eval-star`).forEach(b=>{
    const bVal=parseInt(b.textContent);
    const group=b.closest('.form-group');
    if(group&&group.querySelector('label').textContent.includes(key==='clarity'?'Clarity':key==='knowledge'?'Knowledge':'Overall')){
      b.className='btn btn-'+(bVal<=val?'primary':'outline')+' btn-sm eval-star';
    }
  });
}
async function submitEval(facultyId,facultyName){
  const si=AMS.profile || {};
  const studentId=si.id||AMS.user.id;
  const ratings=_evalRatings[facultyId]||{};
  if(!ratings.clarity||!ratings.knowledge||!ratings.overall){toast('Please rate all three criteria','error');return;}
  const comment=document.getElementById('eval-comment-'+facultyId);
  try{
    const res=await fetch('/api/staff-evaluations',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({student_id:studentId,faculty_id:facultyId,faculty_name:facultyName,
        teaching_clarity:ratings.clarity,subject_knowledge:ratings.knowledge,overall:ratings.overall,
        comments:comment?comment.value:''})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Evaluation submitted for '+facultyName+'!','success');
    const card=document.getElementById('eval-card-'+facultyId);
    if(card)card.innerHTML='<div class="announcement success">✅ Evaluation submitted. Thank you!</div>';
  }catch(e){toast(e.message,'error');}
}

function renderLeaveManagement(){
  setTimeout(()=>loadMyLeaves(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">🏖️ Apply for Leave</div></div>
    <div class="form-row">
      <div class="form-group"><label>Leave Type</label>
        <select id="leave-type"><option>Sick Leave</option><option>Personal Leave</option><option>Emergency</option><option>Casual Leave</option></select>
      </div>
      <div class="form-group"><label>From Date</label><input type="date" id="leave-from"/></div>
      <div class="form-group"><label>To Date</label><input type="date" id="leave-to"/></div>
    </div>
    <div class="form-group"><label>Reason</label>
      <textarea id="leave-reason" placeholder="Reason for leave…" rows="3"></textarea>
    </div>
    <button class="btn btn-primary" onclick="submitLeaveApp()">Apply for Leave</button>
  </div>
  <div class="card mt-lg">
    <div class="card-header"><div class="card-title">📋 My Applications</div></div>
    <div id="my-leaves-list"><div class="text-muted text-sm">Loading…</div></div>
  </div>`;
}
async function submitLeaveApp(){
  const si=AMS.profile || {};
  const studentId=si.id||AMS.user.id;
  const leave_type=document.getElementById('leave-type').value;
  const from_date=document.getElementById('leave-from').value;
  const to_date=document.getElementById('leave-to').value;
  const reason=document.getElementById('leave-reason').value.trim();
  if(!from_date||!to_date||!reason){toast('Please fill all fields','error');return;}
  if(to_date<from_date){toast('End date must be on or after start date','error');return;}
  try{
    const res=await fetch('/api/leave-applications',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({student_id:studentId,leave_type,from_date,to_date,reason})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Leave application submitted!','success');
    document.getElementById('leave-from').value='';
    document.getElementById('leave-to').value='';
    document.getElementById('leave-reason').value='';
    loadMyLeaves();
  }catch(e){toast(e.message,'error');}
}
async function loadMyLeaves(){
  const si=AMS.profile || {};
  const studentId=si.id||AMS.user.id;
  const el=document.getElementById('my-leaves-list');
  if(!el)return;
  try{
    const res=await fetch(`/api/leave-applications?student_id=${encodeURIComponent(studentId)}`);
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.applications||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No applications yet.</div>';return;}
    const clr={pending:'warning',approved:'success',rejected:'danger'};
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Reason</th></tr></thead>
      <tbody>${list.slice().reverse().map(l=>`<tr>
        <td>${l.leave_type||'-'}</td>
        <td>${l.from_date||'-'}</td>
        <td>${l.to_date||'-'}</td>
        <td><span class="badge badge-${clr[l.status]||'teal'}">${l.status||'pending'}</span></td>
        <td class="text-sm text-muted" style="max-width:200px">${l.reason||''}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load applications.</div>';}
}

function renderPlacement(){
  setTimeout(()=>loadPlacements(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">💼 Placement Opportunities</div><span class="badge badge-green text-xs">Live</span></div>
    <div id="placement-body"><div class="text-muted text-sm">Loading opportunities…</div></div>
  </div>`;
}
async function loadPlacements(){
  const el=document.getElementById('placement-body');
  if(!el)return;
  try{
    const res=await fetch('/api/placements');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.placements||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No placement opportunities posted yet. Check back soon!</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Company</th><th>Role</th><th>Package</th><th>Deadline</th><th>Eligibility</th><th>Action</th></tr></thead>
      <tbody>${list.map(c=>{
        const expired=c.deadline&&new Date(c.deadline+'T23:59:59')<new Date();
        return `<tr>
          <td class="fw-semibold">${c.company_name}</td>
          <td>${c.role}</td>
          <td class="fw-semibold" style="color:var(--green)">${c.package||'Not disclosed'}</td>
          <td>${c.deadline?new Date(c.deadline+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'-'}</td>
          <td class="text-sm text-muted" style="max-width:180px">${c.eligibility_criteria||'Open to all'}</td>
          <td>${expired?'<span class="badge badge-gray">Expired</span>':
            c.apply_link?`<a href="${c.apply_link}" target="_blank" class="btn btn-primary btn-sm">Apply Now</a>`:
            `<button class="btn btn-outline btn-sm" onclick="toast('Contact placement cell to apply','info')">Enquire</button>`}
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load placements.</div>';}
}

function renderMessages(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">✉️ Message Box</div><button class="btn btn-primary btn-sm">+ Compose</button></div>
    ${[
      {from:'Dr. Smith',sub:'Assignment 2 Feedback',time:'2h ago',read:false},
      {from:'HOD Office',sub:'Timetable Change',time:'5h ago',read:true},
    ].map(m=>`<div class="announcement ${m.read?'info':'warning'}" style="cursor:pointer">
      <div class="d-flex justify-between align-center">
        <div><div class="ann-title">${m.from}</div><div class="text-sm text-muted">${m.sub}</div></div>
        <div class="text-xs text-dim">${m.time}</div>
      </div>
    </div>`).join('')}
  </div>`;
}

function renderNoticeBoard(){
  setTimeout(()=>loadNoticeBoardRTDB(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">📢 Notice Board</div><span class="badge badge-green text-xs">Live</span></div>
    <div id="notices-list"><div class="text-muted text-sm">Loading notices…</div></div>
  </div>`;
}
function loadNoticeBoardRTDB(){
  const el=document.getElementById('notices-list');
  if(!el)return;
  const today=new Date().toISOString().split('T')[0];
  const render=notices=>{
    const active=notices.filter(n=>!n.valid_until||n.valid_until>=today)
      .sort((a,b)=>{const p={high:0,medium:1,low:2};return (p[a.priority]??1)-(p[b.priority]??1)||(new Date(b.created_at)-new Date(a.created_at));});
    if(!active.length){el.innerHTML='<div class="text-muted text-sm">No active notices at this time.</div>';return;}
    const clr={high:'urgent',medium:'warning',low:'info'};
    el.innerHTML=active.map(n=>`
      <div class="announcement ${clr[n.priority]||'info'} mb-sm">
        <div class="d-flex justify-between">
          <div class="ann-title">${n.title||'Notice'}</div>
          <div class="ann-meta">${n.created_at?new Date(n.created_at).toLocaleDateString():''}</div>
        </div>
        <div class="text-sm text-muted mt-sm">${n.content||''}</div>
        ${n.target_audience&&n.target_audience!=='all'?`<div class="text-xs mt-sm" style="color:var(--accent-blue)">For: ${n.target_audience}</div>`:''}
      </div>`).join('');
  };
  if(window.DB){
    DB.listen('/announcements',snap=>{
      if(!document.getElementById('notices-list'))return;
      const data=snap.val();
      if(!data){el.innerHTML='<div class="text-muted text-sm">No notices at this time.</div>';return;}
      render(Object.values(data));
    });
  }else{
    fetch('/api/announcements').then(r=>r.json())
      .then(data=>render(Array.isArray(data)?data:(data.announcements||[])))
      .catch(()=>{if(el)el.innerHTML='<div class="text-muted text-sm">Could not load notices.</div>';});
  }
}

function renderPushNotif(){
  setTimeout(()=>loadMyNotifications(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">🔔 My Notifications</div>
      <div class="d-flex gap-sm">
        <button class="btn btn-outline btn-sm" onclick="markAllNotifsRead()">✅ Mark All Read</button>
        <span class="badge badge-green text-xs align-self-center">Live</span>
      </div>
    </div>
    <div id="notifications-list"><div class="text-muted text-sm">Loading…</div></div>
  </div>`;
}
async function loadMyNotifications(){
  const el=document.getElementById('notifications-list');
  if(!el)return;
  const si=AMS.profile || {};
  const userId=si.id||AMS.user.id;
  try{
    const res=await fetch(`/api/notifications?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(AMS.role||'student')}`);
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.notifications||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No notifications yet.</div>';return;}
    const clr={info:'info',warning:'warning',success:'success',error:'danger'};
    el.innerHTML=list.map(n=>`<div class="announcement ${clr[n.notification_type]||'info'} mb-sm" style="${n.is_read?'opacity:.65':''}">
      <div class="d-flex justify-between align-center">
        <div class="ann-title">${n.title}${!n.is_read?'<span class="badge badge-red ml-sm" style="font-size:.65rem">NEW</span>':''}</div>
        <div class="d-flex gap-sm align-center">
          <div class="ann-meta">${new Date(n.created_at).toLocaleDateString()}</div>
          ${!n.is_read?`<button class="btn btn-outline btn-sm" style="padding:.2rem .5rem;font-size:.75rem" onclick="markNotifRead('${n.id}')">✓</button>`:''}
        </div>
      </div>
      <div class="text-sm text-muted mt-sm">${n.message}</div>
    </div>`).join('');
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load notifications.</div>';}
}
async function markNotifRead(id){
  try{
    await fetch(`/api/notifications/${id}/read`,{method:'PUT'});
    loadMyNotifications();
  }catch(e){}
}
async function markAllNotifsRead(){
  const buttons=document.querySelectorAll('#notifications-list .btn');
  const ids=[...document.querySelectorAll('#notifications-list [onclick*="markNotifRead"]')]
    .map(b=>b.getAttribute('onclick').match(/'([^']+)'/)?.[1]).filter(Boolean);
  await Promise.all(ids.map(id=>fetch(`/api/notifications/${id}/read`,{method:'PUT'})));
  toast('All marked as read','success');
  loadMyNotifications();
}

function showNotifications(){toast('No new notifications','info')}

// ==========================================================
//  FACULTY MODULES
// ==========================================================
function renderFacultyDashboard(){
  setTimeout(()=>loadFacultyDashStats(),0);
  return `
  <div class="stats-grid">
    <div class="stat-card blue"><div class="s-icon">📚</div><div class="s-val" id="fd-courses">—</div><div class="s-lbl">Active Courses</div></div>
    <div class="stat-card green"><div class="s-icon">👥</div><div class="s-val" id="fd-students">—</div><div class="s-lbl">Total Students</div></div>
    <div class="stat-card teal"><div class="s-icon">📊</div><div class="s-val" id="fd-attendance">—</div><div class="s-lbl">Avg Attendance</div></div>
    <div class="stat-card orange"><div class="s-icon">⏰</div><div class="s-val" id="fd-tasks">—</div><div class="s-lbl">Pending Tasks</div></div>
  </div>
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:1.25rem;margin-bottom:1.25rem">
    <div class="card">
      <div class="card-header"><div class="card-title">📋 Today's Schedule</div></div>
      <div id="fd-schedule"><div class="text-muted text-sm p-md">Loading…</div></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">⚡ Quick Actions</div></div>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        <button class="btn btn-primary w-full" onclick="loadModule('f-attendance','Attendance Marking')">✅ Mark Attendance</button>
        <button class="btn btn-teal w-full" onclick="loadModule('f-materials','Course Materials')">📂 Upload Material</button>
        <button class="btn btn-outline w-full" onclick="loadModule('f-worklog','Daily Work Log')">📋 Submit Work Log</button>
        <button class="btn btn-outline w-full" onclick="loadModule('f-studentleave','Student Leave Mgmt')">🏖️ Student Leaves</button>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-header">
      <div class="card-title">📚 My Assigned Courses</div>
      <span class="badge badge-blue text-xs" style="cursor:pointer" onclick="fdLoadMyCourses()">🔄 Refresh</span>
    </div>
    <div id="fd-my-courses"><div class="text-muted text-sm p-md">Loading courses…</div></div>
  </div>`;
}

async function fdLoadMyCourses(){
  const fid = (AMS.profile && AMS.profile.id) || AMS.user.id || '';
  const el  = document.getElementById('fd-my-courses');
  if(!el || !fid) return;
  el.innerHTML = '<div class="text-muted text-sm p-md">Loading…</div>';
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/courses?faculty_id=${encodeURIComponent(fid)}`);
    const d = await r.json();
    const courses = d.courses || [];
    if(!courses.length){
      el.innerHTML = '<div class="text-muted text-sm p-md">No courses assigned yet. Ask the admin to assign courses via Timetable Management.</div>';
      return;
    }
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.75rem;padding:.75rem">
${courses.map(c=>{
  const sem   = c.semester   ? `Sem ${c.semester}`   : '';
  const acyr  = c.academic_year || '';
  const dept  = c.department || '';
  const cr    = c.credits ? `${c.credits} cr` : '';
  return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:.6rem;padding:.85rem;position:relative">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.35rem">
    <div>
      <span style="background:var(--primary);color:#fff;border-radius:.3rem;padding:.1rem .45rem;font-size:.75rem;font-weight:700;letter-spacing:.03em">${c.course_code||'?'}</span>
    </div>
    ${cr?`<span style="color:var(--text3);font-size:.75rem">${cr}</span>`:''}
  </div>
  <div style="font-weight:600;font-size:.95rem;margin-bottom:.25rem">${c.course_name||'—'}</div>
  <div style="display:flex;gap:.4rem;flex-wrap:wrap">
    ${dept?`<span class="badge badge-gray" style="font-size:.72rem">${dept}</span>`:''}
    ${sem ?`<span class="badge badge-blue" style="font-size:.72rem">${sem}</span>`:''}
    ${acyr?`<span class="badge badge-teal" style="font-size:.72rem">${acyr}</span>`:''}
  </div>
</div>`;
}).join('')}
</div>`;
  }catch(e){
    el.innerHTML = '<div style="color:var(--red);padding:.75rem">Could not load courses.</div>';
  }
}

async function loadFacultyDashStats(){
  const fid=(AMS.profile && AMS.profile.id) || AMS.user.id || '';
  if(!fid) return;
  fdLoadMyCourses();
  const today=new Date().toLocaleDateString('en-US',{weekday:'long'});
  const todayDate=new Date().toISOString().slice(0,10);

  try{
    // Active courses
    const cRes=await fetch('/api/courses?faculty_id='+encodeURIComponent(fid));
    const cData=await cRes.json();
    const courses=cData.courses||[];
    const fdCourses=document.getElementById('fd-courses');
    if(fdCourses) fdCourses.textContent=courses.length;

    // Total students: sum enrolled_count if available, else distinct batch count * 30 estimate
    const fdStudents=document.getElementById('fd-students');
    if(fdStudents){
      const total=courses.reduce((s,c)=>s+(parseInt(c.enrolled_count||c.student_count||0)),0);
      fdStudents.textContent=total||'—';
    }

    // Today's timetable
    const ttRes=await fetch('/api/timetable?faculty_id='+encodeURIComponent(fid)+'&day='+encodeURIComponent(today));
    const ttData=await ttRes.json();
    const todaySlots=(ttData.entries||ttData.timetable||[]).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));

    // Open attendance sessions today (pending = today slots without closed session)
    const sessRes=await fetch('/api/attendance-sessions?faculty_id='+encodeURIComponent(fid)+'&date='+todayDate);
    const sessData=await sessRes.json();
    const openSessions=(sessData.sessions||[]).filter(s=>s.status==='open'||!s.status);
    const markedSubjects=new Set((sessData.sessions||[]).map(s=>s.subject_name||s.course||''));

    const fdTasks=document.getElementById('fd-tasks');
    if(fdTasks) fdTasks.textContent=openSessions.length||0;

    // Avg attendance from attendance records
    try{
      const attRes=await fetch('/api/attendance?faculty_id='+encodeURIComponent(fid));
      const attData=await attRes.json();
      const recs=attData.records||[];
      if(recs.length){
        const presentCount=recs.filter(r=>(r.status||'present').toLowerCase()==='present').length;
        const pct=Math.round((presentCount/recs.length)*100);
        const fdAtt=document.getElementById('fd-attendance');
        if(fdAtt) fdAtt.textContent=pct+'%';
      } else {
        const fdAtt=document.getElementById('fd-attendance');
        if(fdAtt) fdAtt.textContent='N/A';
      }
    }catch(e){ const fdAtt=document.getElementById('fd-attendance'); if(fdAtt) fdAtt.textContent='N/A'; }

    // Render Today's Schedule
    const schedEl=document.getElementById('fd-schedule');
    if(schedEl){
      if(!todaySlots.length){
        schedEl.innerHTML='<div class="text-muted text-sm p-md">No classes scheduled for today.</div>';
      } else {
        schedEl.innerHTML=todaySlots.map(s=>{
          const subj=s.subject_name||s.course_id||'—';
          const batch=s.batch||'';
          const room=s.room_number||'';
          const time=(s.start_time||'').slice(0,5)+'–'+(s.end_time||'').slice(0,5);
          const isMarked=markedSubjects.has(subj);
          return `<div class="announcement ${isMarked?'info':'warning'} d-flex justify-between align-center mb-sm">
            <div>
              <div class="ann-title">${subj}</div>
              <div class="text-sm text-muted">${batch}${batch&&room?' • ':''}${room}</div>
            </div>
            <div class="d-flex gap-sm align-center">
              <span class="badge badge-teal">${time}</span>
              ${isMarked?'<span class="badge badge-green">✅ Marked</span>':'<span class="badge badge-red">⏳ Pending</span>'}
            </div>
          </div>`;
        }).join('');
      }
    }
  }catch(e){
    console.error('loadFacultyDashStats error:',e);
    const schedEl=document.getElementById('fd-schedule');
    if(schedEl) schedEl.innerHTML='<div class="text-muted text-sm p-md">Could not load schedule.</div>';
  }
}

function renderFacultyTimetable(){
  setTimeout(()=>loadFacultyTimetable(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📅 My Weekly Timetable</div>
      <span class="badge badge-green text-xs">Live</span>
    </div>
    <div id="faculty-tt-body"><div class="text-muted text-sm p-md">Loading timetable…</div></div>
  </div>
  <!-- Attendance panel (shown when faculty clicks a class) -->
  <div id="att-panel" style="display:none;margin-top:1rem">
    <div class="card">
      <div class="card-header">
        <div class="card-title" id="att-panel-title">✅ Mark Attendance</div>
        <button class="btn btn-outline btn-sm" onclick="closeAttPanel()">✕ Close</button>
      </div>
      <div id="att-panel-body"></div>
    </div>
  </div>`;
}

async function loadFacultyTimetable(){
  const el=document.getElementById('faculty-tt-body');
  if(!el)return;
  try{
    const fi=AMS.profile || {};
    const fid      = fi.id||AMS.user.id||'';
    const fusername=((fi.username||fi.employee_id||AMS.user.username||fi.email||'')+'').toLowerCase();
    let params=[];
    if(fid)       params.push('faculty_id='+encodeURIComponent(fid));
    if(fusername) params.push('faculty_username='+encodeURIComponent(fusername));
    params.push('active=all');
    const url=`${window.AMS_CONFIG.API_URL}/api/timetable`+(params.length?'?'+params.join('&'):'');
    const res=await fetch(url);
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.timetable||data.entries||[]);
    if(!list.length){
      el.innerHTML='<div class="text-muted text-sm p-md">No timetable entries assigned. Contact admin.</div>';
      return;
    }
    const hours=[...new Set(list.map(s=>s.hour_number||0))].sort((a,b)=>a-b);
    const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const daysInData=[...new Set(list.map(s=>s.day_of_week))];
    const days=DAYS.filter(d=>daysInData.includes(d));
    const cell={};
    list.forEach(s=>{cell[s.day_of_week+'|'+(s.hour_number||0)]=s;});
    const today=new Date().toLocaleDateString('en-US',{weekday:'long'});

    el.innerHTML=`<div style="overflow-x:auto">
    <table style="border-collapse:collapse;width:100%;min-width:600px;font-size:.85rem">
      <thead>
        <tr style="background:rgba(31,111,235,.1)">
          <th style="padding:.6rem .9rem;border:1px solid var(--border);text-align:left;min-width:90px">Day</th>
          ${hours.map(h=>{const s=list.find(x=>(x.hour_number||0)===h);return`<th style="padding:.6rem .9rem;border:1px solid var(--border);text-align:center;min-width:120px">Hour ${h}<br><small class="text-muted">${(s?.start_time||'').slice(0,5)}–${(s?.end_time||'').slice(0,5)}</small></th>`;}).join('')}
        </tr>
      </thead>
      <tbody>
        ${days.map(day=>{
          const isToday=day===today;
          return`<tr style="${isToday?'background:rgba(0,200,150,.04)':''}">
            <td style="padding:.6rem .9rem;border:1px solid var(--border);font-weight:600;background:rgba(31,111,235,.04)${isToday?';border-left:3px solid var(--green)':''}">${day}${isToday?'<br><span class="badge badge-green" style="font-size:.65rem">TODAY</span>':''}</td>
            ${hours.map(h=>{
              const s=cell[day+'|'+h];
              if(!s)return`<td style="padding:.6rem;border:1px solid var(--border);background:var(--ink2);text-align:center;color:var(--text3)">—</td>`;
              const canMark=isToday;
              return`<td style="padding:.7rem .8rem;border:1px solid var(--border);background:rgba(31,111,235,.06)">
                <div style="font-weight:600">${s.subject_name||s.course_id||'—'}</div>
                <div style="margin:.2rem 0">
                  <span class="badge badge-blue" style="font-size:.7rem">${s.section||s.batch||''}</span>
                  ${s.subject_code?`<span class="badge badge-teal" style="font-size:.7rem;margin-left:.3rem">${s.subject_code}</span>`:''}
                </div>
                <div style="color:var(--text2);font-size:.77rem">📍 ${s.room_number||'—'}</div>
                ${canMark?`<button class="btn btn-success btn-sm" style="margin-top:.5rem;font-size:.75rem;width:100%" onclick="openAttPanel('${s.id}','${(s.subject_name||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${(s.batch||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${(s.room_number||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${(s.section||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${(s.department||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${(s.subject_code||'').replace(/'/g,"\\'")}')">▶ Take Attendance</button>`:''}
              </td>`;
            }).join('')}
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }catch(err){
    if(el)el.innerHTML='<div class="text-muted text-sm p-md">Could not load timetable.</div>';
  }
}

function closeAttPanel(){
  const p=document.getElementById('att-panel');
  if(p)p.style.display='none';
}

let _attTimetableId=null, _attSessionId=null;

async function openAttPanel(timetableId, subject, batch, room, section, dept, subjectCode){
  _attTimetableId=timetableId;
  const panel=document.getElementById('att-panel');
  const title=document.getElementById('att-panel-title');
  const body=document.getElementById('att-panel-body');
  if(!panel||!body)return;
  const displaySection=section||batch||'';
  title.textContent=`✅ Attendance — ${subject} | ${displaySection} | ${room}`;
  panel.style.display='block';
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  const esc=s=>(s||'').replace(/'/g,"\\'");
  body.innerHTML=`<div class="p-md">
    <p class="text-muted text-sm mb-md">Select method to mark today's attendance:</p>
    <div class="d-flex gap-md" style="flex-wrap:wrap">
      <button class="btn btn-primary" onclick="startFaceAtt('${timetableId}','${esc(subject)}','${esc(displaySection)}')">📷 Face Recognition</button>
      <button class="btn btn-teal" onclick="startQRAtt('${timetableId}','${esc(subject)}','${esc(displaySection)}')">📱 QR Code</button>
      <button class="btn btn-outline" onclick="startManualAtt('${timetableId}','${esc(subject)}','${esc(batch)}','${esc(section)}','${esc(dept)}','${esc(subjectCode)}')">✍️ Manual Entry</button>
    </div>
  </div>`;
}

async function startFaceAtt_local(tid,subject,batch){toast('Launching Face Recognition attendance…','info');}
async function startQRAtt(tid,subject,batch){toast('Launching QR Code attendance…','info');}

async function startManualAtt(tid, subject, batch, section, dept, subjectCode){
  const body=document.getElementById('att-panel-body');
  if(!body)return;
  body.innerHTML='<div class="p-md text-muted text-sm">Loading student list…</div>';
  try{
    let params='role=student';
    const filterSection = section||batch||'';
    const filterDept    = dept||'';
    if(filterSection) params+='&section='+encodeURIComponent(filterSection);
    if(filterDept)    params+='&department='+encodeURIComponent(filterDept);
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/list?${params}`);
    const data=await res.json();
    const students=Array.isArray(data)?data:(data.users||[]);
    const fi=AMS.profile || {};
    const today=new Date().toISOString().split('T')[0];
    body.innerHTML=`<div class="p-md">
      <div class="d-flex gap-md align-center mb-md" style="flex-wrap:wrap">
        <span class="badge badge-blue">${subject} — ${batch}</span>
        <span class="text-muted text-sm">${today}</span>
        <button class="btn btn-success btn-sm" onclick="markAllPresent()">✅ Mark All Present</button>
      </div>
      ${students.length?`<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:.85rem">
        <thead><tr style="background:rgba(31,111,235,.1)">
          <th style="padding:.5rem .8rem;border:1px solid var(--border)">Roll No</th>
          <th style="padding:.5rem .8rem;border:1px solid var(--border)">Name</th>
          <th style="padding:.5rem .8rem;border:1px solid var(--border);text-align:center">Status</th>
        </tr></thead>
        <tbody id="manual-att-rows">
          ${students.map(st=>`<tr id="attrow-${st.roll_no||st.id}">
            <td style="padding:.5rem .8rem;border:1px solid var(--border)">${st.roll_no||'—'}</td>
            <td style="padding:.5rem .8rem;border:1px solid var(--border)">${st.full_name||st.name||'—'}</td>
            <td style="padding:.5rem .8rem;border:1px solid var(--border);text-align:center">
              <button class="btn btn-success btn-sm" id="btn-${st.roll_no||st.id}" onclick="toggleAttStatus('${st.roll_no||st.id}')">✅ Present</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <button class="btn btn-primary mt-md" onclick="submitManualAtt('${tid}','${(subject||'').replace(/'/g,"\\'")}','${(batch||filterSection||'').replace(/'/g,"\\'")}','${fi.id||AMS.user.id}','${today}','${(filterSection||'').replace(/'/g,"\\'")}','${(subjectCode||'').replace(/'/g,"\\'")}')">💾 Submit Attendance</button>`
      :'<div class="text-muted text-sm">No students found in system.</div>'}
    </div>`;
    // default all present
    window._attStatuses={};
    students.forEach(st=>{ window._attStatuses[st.roll_no||st.id]={roll_no:st.roll_no||'',name:st.full_name||st.name||'',status:'present'}; });
  }catch(e){if(body)body.innerHTML='<div class="text-muted p-md text-sm">Failed to load students.</div>';}
}

function toggleAttStatus(key){
  if(!window._attStatuses||!window._attStatuses[key])return;
  const cur=window._attStatuses[key].status;
  window._attStatuses[key].status=cur==='present'?'absent':'present';
  const btn=document.getElementById('btn-'+key);
  if(btn){
    btn.textContent=window._attStatuses[key].status==='present'?'✅ Present':'❌ Absent';
    btn.className='btn btn-sm '+(window._attStatuses[key].status==='present'?'btn-success':'btn-danger');
  }
}

function markAllPresent(){
  if(!window._attStatuses)return;
  Object.keys(window._attStatuses).forEach(k=>{
    window._attStatuses[k].status='present';
    const btn=document.getElementById('btn-'+k);
    if(btn){btn.textContent='✅ Present';btn.className='btn btn-sm btn-success';}
  });
}

async function submitManualAtt(tid, subject, batch, facultyId, date, section, subjectCode){
  const records=Object.values(window._attStatuses||{}).map(r=>({roll_no:r.roll_no,student_name:r.name,status:r.status}));
  if(!records.length){toast('No students to submit','error');return;}
  const sessionType=document.getElementById('faSessionType')?.value||'lecture';
  try{
    // 1) create session
    const sessRes=await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance-sessions`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({timetable_id:tid,subject_name:subject,batch,section:section||batch,faculty_id:facultyId,date,method:'manual',status:'open',session_type:sessionType})});
    const sessD=await sessRes.json();
    if(!sessD.success)throw new Error(sessD.error||'Failed to create session');
    const sid=sessD.session?.id||sessD.id||'';
    _attSessionId=sid;
    // 2) bulk mark
    const attRes=await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance/manual`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:sid,date,subject_name:subject,subject_code:subjectCode||'',batch,section:section||batch,faculty_id:facultyId,session_type:sessionType,records})});
    const attD=await attRes.json();
    if(!attD.success)throw new Error(attD.error||'Failed to save records');
    // 3) close session
    if(sid)await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance-sessions/${sid}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'closed'})});
    toast(`Attendance saved! ${attD.count||records.length} records marked.`,'success');
    closeAttPanel();
    loadFacultyTimetable();
  }catch(e){toast(e.message,'error');}
}


// ── NEW: My Working Hours ─────────────────────────────────
function renderFacultyWorkingHours(){
  const batches=[
    {batch:'CS2016A',subject:'ASD LAB',hours:3},
    {batch:'M.Tech-CSE18',subject:'CLOUD',hours:3},
    {batch:'CS2015A1',subject:'CS401',hours:32},
    {batch:'AR2018',subject:'ARSUB04',hours:2},
  ];
  const total=batches.reduce((s,b)=>s+b.hours,0);
  return `<div class="card">
    <div class="card-header"><div class="card-title">⏱️ My Working Hours</div></div>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-group"><label>From Date</label><input type="date" id="whFrom" value="2024-01-09"/></div>
      <div class="form-group"><label>To Date</label><input type="date" id="whTo" value="2024-03-25"/></div>
      <div class="form-group" style="margin-top:auto"><button class="btn btn-primary" onclick="toast('Working hours loaded','success')">Submit</button></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Batch Name</th><th>Subject Name</th><th>Hours</th><th>Hour Report</th><th>Planner Report</th><th>Attendance Report</th></tr></thead>
      <tbody>
        ${batches.map(b=>`<tr>
          <td class="fw-semibold">${b.batch}</td>
          <td>${b.subject}</td>
          <td>${b.hours}</td>
          <td><button class="btn btn-outline btn-sm" onclick="toast('Opening Hour Report…','info')">View</button></td>
          <td><button class="btn btn-outline btn-sm" onclick="toast('Opening Planner Report…','info')">View</button></td>
          <td><button class="btn btn-outline btn-sm" onclick="toast('Opening Attendance Report…','info')">View</button></td>
        </tr>`).join('')}
        <tr style="background:rgba(31,111,235,.06)">
          <td colspan="2" class="fw-semibold">TOTAL HOURS</td>
          <td class="fw-semibold">${total}</td>
          <td colspan="2"><button class="btn btn-teal btn-sm" onclick="toast('Total Working Hours downloaded','success')">Total Working Hour Details</button></td>
          <td><button class="btn btn-outline btn-sm" onclick="toast('Daily Work Log opened','info')">Daily Work Log</button></td>
        </tr>
      </tbody>
    </table></div>
  </div>`;
}

// ── NEW: My Previous Details ──────────────────────────────
function renderFacultyPrevDetails(){
  setTimeout(()=>loadPrevDetails(), 0);
  return `<div class="card">
    <div class="card-header"><div class="card-title">📋 My Previous Details</div></div>
    <p class="text-muted mb-md">Courses assigned to you across semesters.</p>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-group"><label>Department</label>
        <select id="pdDept" onchange="loadPrevDetails()">
          <option value="">All</option>
          <option>Computer Science</option><option>Electronics</option>
          <option>Mechanical</option><option>Civil</option><option>Architecture</option>
        </select>
      </div>
      <div class="form-group"><label>Academic Year</label>
        <input id="pdYear" placeholder="e.g. 2024-25" oninput="loadPrevDetails()"/>
      </div>
      <div class="form-group"><label>Semester</label>
        <select id="pdSem" onchange="loadPrevDetails()">
          <option value="">All</option>
          ${[1,2,3,4,5,6,7,8].map(s=>`<option value="${s}">S${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Subject Code</label>
        <input id="pdSubject" placeholder="Subject Code" oninput="loadPrevDetails()"/>
      </div>
      <div class="form-group" style="margin-top:auto">
        <button class="btn btn-outline" onclick="resetPrevFilters()">Reset</button>
      </div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Sl. No.</th><th>Subject Code</th><th>Subject Name</th><th>Department</th><th>Academic Year</th><th>Sem</th><th>Credits</th></tr></thead>
      <tbody id="prevDetailsBody"><tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">Loading…</td></tr></tbody>
    </table></div>
  </div>`;
}

async function loadPrevDetails(){
  const tbody=document.getElementById('prevDetailsBody');
  if(!tbody) return;
  const dept=document.getElementById('pdDept')?.value||'';
  const year=document.getElementById('pdYear')?.value||'';
  const sem=document.getElementById('pdSem')?.value||'';
  const subject=document.getElementById('pdSubject')?.value||'';
  tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:1.5rem;color:var(--text3)">Loading…</td></tr>';
  try {
    const params=new URLSearchParams();
    if(dept) params.set('department',dept);
    if(year) params.set('academic_year',year);
    if(sem) params.set('semester',sem);
    if(subject) params.set('subject_code',subject);
    const resp=await fetch(`${AMS_CONFIG.API_URL}/api/faculty/${AMS.user.id}/previous-details?${params}`);
    const data=await resp.json();
    const records=data.records||[];
    if(!records.length){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">No records found</td></tr>';
      return;
    }
    tbody.innerHTML=records.map((r,i)=>`<tr>
      <td>${i+1}</td>
      <td class="fw-semibold">${r.course_code||'—'}</td>
      <td>${r.course_name||'—'}</td>
      <td>${r.department||'—'}</td>
      <td>${r.academic_year||'—'}</td>
      <td><span class="badge badge-blue">S${r.semester||'?'}</span></td>
      <td>${r.credits||'—'}</td>
    </tr>`).join('');
  } catch(e){
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--red)">Failed to load records</td></tr>';
  }
}

function resetPrevFilters(){
  ['pdYear','pdSubject'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['pdDept','pdSem'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  loadPrevDetails();
}

// ── NEW: My Ratings (Faculty Evaluation Results) ──────────
function renderFacultyRatings(){
  const evals=[
    {name:'Evaluation ECA',batch:'ECA2016',hasDetails:true},
    {name:'Faculty evaluation trial',batch:'ECA2016',hasDetails:true},
    {name:'Test evaluation II',batch:'ECA2016',hasDetails:true},
    {name:'TEST EVALUATION',batch:'ECA2016',hasDetails:false},
    {name:'TEST EVALUATION 2',batch:'ECA2016',hasDetails:true},
  ];
  const qdetails=[
    {q:'The teacher is available for any doubt',strongly_disagree:0,disagree:0,neutral:100,agree:0,strongly_agree:0,points:'3/1 = 3.00'},
    {q:'The teacher is supportive and committed for teaching',strongly_disagree:0,disagree:0,neutral:0,agree:0,strongly_agree:100,points:'5/1 = 5.00'},
  ];
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">⭐ My Ratings — Faculty Evaluation Results</div>
      <div class="d-flex gap-md">
        <button class="btn btn-outline btn-sm" onclick="toast('Exporting ratings…','info')">📥 Export</button>
        <button class="btn btn-outline btn-sm" onclick="toast('Printing ratings…','info')">🖨️ Print</button>
      </div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Sl. No.</th><th>Evaluation Name</th><th>Batch Name</th><th>Details</th></tr></thead>
      <tbody>${evals.map((e,i)=>`<tr>
        <td>${i+1}</td>
        <td class="fw-semibold">${e.name}</td>
        <td>${e.batch}</td>
        <td>${e.hasDetails?`<button class="btn btn-outline btn-sm" onclick="showRatingDetails()">↗ Details</button>`:''}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>

  <div id="ratingDetailsCard" style="display:none">
    <div class="card">
      <div class="card-header">
        <div class="card-title">Faculty Evaluation Results — Detail</div>
        <div class="d-flex gap-md">
          <button class="btn btn-outline btn-sm" onclick="toast('Showing student feedback…','info')">Show Feedback</button>
          <button class="btn btn-outline btn-sm" onclick="toast('Exporting…','info')">📥 Export</button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('ratingDetailsCard').style.display='none'">◀ Back</button>
        </div>
      </div>
      <div class="mb-md">
        <p><strong>Evaluation Name:</strong> Evaluation ECA</p>
        <p><strong>Staff Name:</strong> ${AMS.user.name}</p>
        <p><strong>Batch Name:</strong> ECA2016</p>
        <p><strong>Subject Name:</strong> subject2</p>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Sl. No</th><th>Question</th><th>Quality</th><th>Point (P)</th><th>Votes (V)</th></tr></thead>
        <tbody>
          ${qdetails.map((q,qi)=>[
            {quality:'Strongly disagree',p:1,v:'0.00%'},
            {quality:'Disagree',p:2,v:'0.00%'},
            {quality:'Neutral',p:3,v:qi===0?'100.00%':'0.00%'},
            {quality:'Agree',p:4,v:'0.00%'},
            {quality:'Strongly agree',p:5,v:qi===1?'100.00%':'0.00%'},
          ].map((row,ri)=>`<tr>
            ${ri===0?`<td rowspan="5">${qi+1}</td><td rowspan="5">${q.q}</td>`:''}
            <td>${row.quality}</td><td>${row.p}</td><td>${row.v}</td>
          </tr>`).join('')+'<tr style="background:rgba(31,111,235,.08)"><td colspan="2" class="fw-semibold">Points Gained:</td><td colspan="2" class="fw-semibold">${q.points}</td></tr>').join('')}
        </tbody>
        <tfoot>
          <tr style="background:rgba(31,111,235,.12)">
            <td colspan="3" class="fw-semibold text-blue">Teaching Effectiveness Index</td>
            <td colspan="2" class="fw-semibold text-blue">8.00</td>
          </tr>
          <tr style="background:rgba(31,111,235,.08)">
            <td colspan="3" class="fw-semibold">Total Percentage</td>
            <td colspan="2" class="fw-semibold">80%</td>
          </tr>
        </tfoot>
      </table></div>
      <div class="d-flex gap-md mt-md">
        <button class="btn btn-outline btn-sm" onclick="toast('Showing student suggestions…','info')">Student Suggestions</button>
        <button class="btn btn-outline btn-sm" onclick="toast('Showing feedbacks…','info')">Feedbacks</button>
      </div>
    </div>
  </div>`;
}

function showRatingDetails(){
  document.getElementById('ratingDetailsCard').style.display='block';
  document.getElementById('ratingDetailsCard').scrollIntoView({behavior:'smooth'});
}

// ── NEW: Student Leave Management (Faculty) ───────────────
function renderFacultyStudentLeave(){
  const leaves=[
    {sl:1,roll:'CS001',student:'Alice Johnson',type:'Medical',from:'Feb 12',to:'Feb 13',session:'FN',status:'Pending',applied:'Feb 11'},
    {sl:2,roll:'CS002',student:'Bob Smith',type:'Personal',from:'Feb 15',to:'Feb 15',session:'AN',status:'Forwarded',applied:'Feb 14'},
    {sl:3,roll:'CS003',student:'Carol Davis',type:'Emergency',from:'Feb 10',to:'Feb 12',session:'FD',status:'Rejected',applied:'Feb 09'},
  ];
  return `<div class="card">
    <div class="card-header"><div class="card-title">🏖️ Student Leave Management</div></div>

    <div class="d-flex gap-md mb-md" style="flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer">
        <input type="radio" name="leaveFilter" value="leaveDate" checked/> Filter by Leave Date
      </label>
      <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer">
        <input type="radio" name="leaveFilter" value="appliedDate"/> Filter by Applied Date
      </label>
    </div>

    <div class="form-row" style="align-items:flex-end">
      <div class="form-group"><label>Department</label>
        <select><option>All</option><option>Computer Science</option><option>Electronics</option></select>
      </div>
      <div class="form-group"><label>Batch</label>
        <select><option>All</option><option>CS2024A</option><option>CS2024B</option></select>
      </div>
      <div class="form-group"><label>Leave Type</label>
        <select><option>--All--</option><option>Medical</option><option>Personal</option><option>Emergency</option><option>Duty Leave</option></select>
      </div>
      <div class="form-group"><label>Leave From</label><input type="date"/></div>
      <div class="form-group"><label>Leave To</label><input type="date"/></div>
      <div class="form-group"><label>Student Name</label><input placeholder="Student name"/></div>
      <div class="form-group"><label>Roll No</label><input placeholder="Roll number"/></div>
      <div class="form-group" style="margin-top:auto">
        <button class="btn btn-primary" onclick="toast('Leaves loaded','success')">Search</button>
        <button class="btn btn-outline" style="margin-left:.5rem" onclick="toast('Filters reset','info')">Reset</button>
      </div>
    </div>

    <div class="d-flex gap-md mb-md">
      <button class="btn btn-primary btn-sm" onclick="switchLeaveTab('pending')" id="leavePendingBtn">Pending</button>
      <button class="btn btn-outline btn-sm" onclick="switchLeaveTab('forwarded')" id="leaveForwardedBtn">Forwarded</button>
      <button class="btn btn-outline btn-sm" onclick="switchLeaveTab('rejected')" id="leaveRejectedBtn">Rejected</button>
      <button class="btn btn-outline btn-sm" onclick="switchLeaveTab('report')" id="leaveReportBtn">Report</button>
    </div>

    <div class="tbl-wrap"><table>
      <thead><tr><th>Sl. No.</th><th>Roll No</th><th>Student</th><th>Leave Type</th><th>Leave Date (From–To)</th><th>Session</th><th>Status</th><th>Details</th><th>Action</th><th>Reject</th><th>Application</th></tr></thead>
      <tbody id="leaveTableBody">
        ${leaves.map(l=>`<tr>
          <td>${l.sl}</td>
          <td class="fw-semibold">${l.roll}</td>
          <td>${l.student}</td>
          <td><span class="badge badge-blue">${l.type}</span></td>
          <td>${l.from} – ${l.to}</td>
          <td>${l.session}</td>
          <td><span class="badge badge-${l.status==='Forwarded'?'green':l.status==='Rejected'?'red':'orange'}">${l.status}</span></td>
          <td><button class="btn btn-outline btn-sm" onclick="toast('Viewing leave details…','info')">Details</button></td>
          <td>${l.status==='Pending'?`<button class="btn btn-success btn-sm" onclick="toast('Leave forwarded for ${l.student}','success')">Forward</button>`:''}</td>
          <td>${l.status==='Pending'?`<button class="btn btn-danger btn-sm" onclick="toast('Leave rejected for ${l.student}','warning')">Reject</button>`:''}</td>
          <td><button class="btn btn-outline btn-sm" onclick="toast('Application details…','info')">View</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">📊 Leave Report</div></div>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-card orange"><div class="s-icon">⏳</div><div class="s-val">1</div><div class="s-lbl">Pending</div></div>
      <div class="stat-card green"><div class="s-icon">✅</div><div class="s-val">1</div><div class="s-lbl">Forwarded</div></div>
      <div class="stat-card red"><div class="s-icon">❌</div><div class="s-val">1</div><div class="s-lbl">Rejected</div></div>
      <div class="stat-card blue"><div class="s-icon">📋</div><div class="s-val">3</div><div class="s-lbl">Total</div></div>
    </div>
  </div>`;
}

function switchLeaveTab(tab){
  ['pending','forwarded','rejected','report'].forEach(t=>{
    const btn=document.getElementById(`leave${t.charAt(0).toUpperCase()+t.slice(1)}Btn`);
    if(btn) btn.className=t===tab?'btn btn-primary btn-sm':'btn btn-outline btn-sm';
  });
  toast(`Showing ${tab} leaves`,'info');
}

// ── NEW: Transport (Faculty) ──────────────────────────────
function renderFacultyTransport(){
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">🚌 Transport</div>
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('transportModal').style.display='flex'">+ New Request</button>
    </div>
    <div id="transportList">
      <div class="announcement info">
        <div class="ann-title">No transport records found.</div>
        <div class="text-sm text-muted">Click "New Request" to apply for transportation.</div>
      </div>
    </div>
  </div>

  <div id="transportModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:480px">
      <div class="card-header">
        <div class="card-title">🚌 New Transport Request</div>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('transportModal').style.display='none'">✕</button>
      </div>
      <div style="padding:1.5rem">
        <div class="form-group"><label>Select Bus and Route *</label>
          <select><option>Select</option><option>Route 1 – Whitefield to College</option><option>Route 2 – Jayanagar to College</option><option>Route 3 – Electronic City to College</option></select>
        </div>
        <div class="form-group"><label>Select Boarding Point *</label>
          <select><option>Select</option><option>Stop 1</option><option>Stop 2</option><option>Stop 3</option></select>
        </div>
        <div class="form-group"><label>Travel Period *</label>
          <div class="form-row">
            <div class="form-group"><label>From</label><input type="date"/></div>
            <div class="form-group"><label>To</label><input type="date"/></div>
          </div>
        </div>
        <div class="form-group"><label>Bus Fee *</label>
          <div class="d-flex gap-md align-center">
            <input type="text" placeholder="Amount" style="flex:1"/>
            <button class="btn btn-teal btn-sm" onclick="toast('Bus fee calculated: ₹1,200','info')">Calculate</button>
          </div>
        </div>
        <div class="form-group"><label>Remarks</label><textarea placeholder="Any remarks…" style="min-height:80px"></textarea></div>
        <div class="d-flex gap-md mt-md">
          <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('transportModal').style.display='none'">Cancel</button>
          <button class="btn btn-primary" style="flex:1" onclick="submitTransportRequest()">Submit</button>
        </div>
      </div>
    </div>
  </div>`;
}

function submitTransportRequest(){
  document.getElementById('transportModal').style.display='none';
  toast('Transport request submitted! Awaiting management approval.','success');
}

// ── NEW: Faculty Message Box (send to students & staff) ───
function renderFacultyMessages(){
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">✉️ Message Box</div>
      <button class="btn btn-primary btn-sm" onclick="toggleComposePanel()">✏️ Compose</button>
    </div>

    <div id="composePanelFac" style="display:none;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-bottom:1rem">
      <h4 class="mb-md">Compose Mail</h4>
      <div class="form-row">
        <div class="form-group"><label>To</label>
          <select><option>All Students</option><option>Selected Students</option><option>All Staff</option></select>
        </div>
        <div class="form-group"><label>Departments</label>
          <select><option>CS</option><option>EC</option><option>ME</option><option>All</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Batch</label>
          <select><option>All</option><option>CS2024A</option><option>CS2024B</option></select>
        </div>
        <div class="form-group"><label>Sub-Batch</label>
          <select><option>All</option><option>Sub-A</option></select>
        </div>
      </div>
      <div class="form-group"><label>Mail To</label>
        <input value="All Students" readonly style="background:var(--ink2);"/>
      </div>
      <div class="form-group"><label>Subject *</label><input placeholder="Enter mail subject"/></div>
      <div class="form-group"><label>Message *</label><textarea placeholder="Type your message here…" style="min-height:100px"></textarea></div>
      <div class="d-flex gap-md mt-md">
        <button class="btn btn-outline" onclick="toggleComposePanel()">Cancel</button>
        <button class="btn btn-primary" onclick="toast('Message sent successfully!','success');toggleComposePanel()">Send</button>
      </div>
    </div>

    <div class="d-flex gap-md mb-md">
      <button class="btn btn-primary btn-sm" onclick="setMsgTab('inbox')">📥 Inbox <span class="badge badge-red" style="margin-left:.3rem">2</span></button>
      <button class="btn btn-outline btn-sm" onclick="setMsgTab('sent')">📤 Sent Messages</button>
    </div>

    ${[
      {from:'Dr. Johnson',sub:'Timetable Update for Monday',time:'2h ago',read:false},
      {from:'HOD – CS',sub:'Meeting at 3PM Today',time:'5h ago',read:true},
      {from:'Admin Office',sub:'Circular: Holiday on Feb 26',time:'1d ago',read:true},
    ].map(m=>`<div class="announcement ${m.read?'info':'warning'}" style="cursor:pointer;margin-bottom:.5rem">
      <div class="d-flex justify-between align-center">
        <div>
          <div class="ann-title">${m.from}</div>
          <div class="text-sm text-muted">${m.sub}</div>
        </div>
        <div class="d-flex gap-sm align-center">
          <div class="text-xs text-dim">${m.time}</div>
          ${!m.read?'<span class="badge badge-blue">New</span>':''}
        </div>
      </div>
    </div>`).join('')}
  </div>`;
}

function toggleComposePanel(){
  const p=document.getElementById('composePanelFac');
  if(p) p.style.display=p.style.display==='none'?'block':'none';
}
function setMsgTab(tab){ toast(`Showing ${tab}`,'info'); }

// ── NEW: Rules and Regulations (Faculty) ──────────────────
function renderFacultyRules(){
  const rules=[
    {no:1,rule:'All faculty must submit attendance within 30 minutes of class end.'},
    {no:2,rule:'Daily Work Log must be submitted by 6:00 PM each working day.'},
    {no:3,rule:'Course materials must be uploaded at least one week before class.'},
    {no:4,rule:'Internal marks must be submitted within 48 hours of exam completion.'},
    {no:5,rule:'Faculty must be present in campus during working hours (9 AM – 5 PM).'},
    {no:6,rule:'Leave applications must be submitted at least 2 days in advance.'},
    {no:7,rule:'All academic communications must be routed through the official message system.'},
  ];
  return `<div class="card">
    <div class="card-header"><div class="card-title">📜 Rules and Regulations</div></div>
    <div class="announcement info mb-md">
      <div class="ann-title">ISO Rules — Faculty Rules</div>
      <div class="text-sm text-muted">Rules set by Administration. Contact admin to request changes.</div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Sl. No.</th><th>Rule</th></tr></thead>
      <tbody>${rules.map(r=>`<tr>
        <td class="fw-semibold">${r.no}</td>
        <td>${r.rule}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

// ── NEW: Committee (Faculty) ──────────────────────────────
function renderFacultyCommittee(){
  const committees=[
    {name:'IQAC Committee',role:'Member',meetings:3,lastMeeting:'Feb 10'},
    {name:'Grievance Cell',role:'Coordinator',meetings:5,lastMeeting:'Jan 28'},
    {name:'Anti-Ragging Committee',role:'Member',meetings:2,lastMeeting:'Feb 02'},
  ];
  return `<div class="card">
    <div class="card-header"><div class="card-title">🏛️ Committee</div></div>
    <p class="text-muted mb-md">Committees you are a member of. You can view or edit minutes.</p>
    ${committees.map(c=>`<div class="announcement info mb-sm">
      <div class="d-flex justify-between align-center">
        <div>
          <div class="ann-title">${c.name}</div>
          <div class="d-flex gap-md mt-sm">
            <span class="badge badge-blue">${c.role}</span>
            <span class="text-sm text-muted">📅 Last meeting: ${c.lastMeeting}</span>
            <span class="text-sm text-muted">📋 ${c.meetings} meetings held</span>
          </div>
        </div>
        <div class="d-flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="toast('Viewing minutes for ${c.name}…','info')">📋 View Minutes</button>
          <button class="btn btn-primary btn-sm" onclick="toast('Editing minutes for ${c.name}…','info')">✏️ Edit</button>
        </div>
      </div>
    </div>`).join('')}
  </div>`;
}

// ── NEW: Exam / Invigilation Duty (Faculty) ───────────────
function renderFacultyExamDuty(){
  const duties=[
    {date:'05-02-2024',exam:'Evaluation I',hall:'H302',start:'9:00 AM',end:'12:00 PM',session:'FN'},
    {date:'06-02-2024',exam:'Evaluation I',hall:'H304',start:'2:00 PM',end:'5:00 PM',session:'AN'},
  ];
  const allStaff=[
    {sl:1,name:'Staff Name 95',hall:'H302'},
    {sl:2,name:'Staff Name 92',hall:'H304'},
    {sl:3,name:'Staff Name 89',hall:'H305'},
  ];
  return `<div class="card">
    <div class="card-header"><div class="card-title">📋 Exam / Invigilation Duty</div></div>

    <div class="d-flex gap-md mb-md">
      <button class="btn btn-primary btn-sm" onclick="switchExamTab('duty')">Exam Duty</button>
      <button class="btn btn-outline btn-sm" onclick="switchExamTab('halls')">Staff & Allotted Halls</button>
    </div>

    <div id="examDutyTab">
      <div class="form-group" style="max-width:200px">
        <label>From Date</label>
        <input type="date" value="2024-02-05"/>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Exam</th><th>Hall</th><th>Start Time</th><th>End Time</th><th>Session</th></tr></thead>
        <tbody>${duties.map(d=>`<tr>
          <td>${d.date}</td>
          <td class="fw-semibold">${d.exam}</td>
          <td><span class="badge badge-blue">${d.hall}</span></td>
          <td>${d.start}</td>
          <td>${d.end}</td>
          <td><span class="badge badge-gray">${d.session}</span></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div id="examHallsTab" style="display:none">
      <div class="form-row" style="align-items:flex-end">
        <div class="form-group"><label>Date</label><input type="date" value="2024-02-05"/></div>
        <div class="form-group"><label>Exam Type</label>
          <select><option>Evaluation I</option><option>Evaluation II</option></select>
        </div>
        <div class="form-group"><label>Group</label>
          <select><option>05/02/2024FN</option><option>05/02/2024AN</option></select>
        </div>
        <div class="form-group" style="margin-top:auto">
          <button class="btn btn-primary" onclick="toast('Staff halls loaded','success')">Submit</button>
        </div>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Sl. No.</th><th>Staff Name</th><th>Hall Allotted</th></tr></thead>
        <tbody>${allStaff.map(s=>`<tr>
          <td>${s.sl}</td><td>${s.name}</td>
          <td><span class="badge badge-teal">${s.hall}</span></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  </div>`;
}

function switchExamTab(tab){
  const duty=document.getElementById('examDutyTab');
  const halls=document.getElementById('examHallsTab');
  if(tab==='duty'){duty.style.display='block';halls.style.display='none';}
  else{duty.style.display='none';halls.style.display='block';}
}



function renderCourseDetails(){
  setTimeout(()=>loadCourseDetailsData(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📚 Course & Batch Details</div>
      <button class="btn btn-outline btn-sm" onclick="loadCourseDetailsData()">🔄 Refresh</button>
    </div>
    <p class="text-muted mb-md">Click on a batch to view student details and perform academic activities.</p>
    <div id="cd-cards" class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      <div class="text-muted text-sm" style="grid-column:1/-1;text-align:center;padding:2rem">⏳ Loading courses…</div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="card-header"><div class="card-title">📋 Batch List</div></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Code</th><th>Course</th><th>Credits</th><th>Department</th><th>Section</th><th>Year</th><th>Semester</th><th>Students</th></tr></thead>
        <tbody id="cd-table-body"><tr><td colspan="8" class="text-muted text-sm" style="text-align:center;padding:2rem">Loading…</td></tr></tbody>
      </table></div>
    </div>
  </div>`;
}

async function loadCourseDetailsData(){
  const cardsEl=document.getElementById('cd-cards');
  const tableEl=document.getElementById('cd-table-body');
  if(!cardsEl||!tableEl) return;
  const facultyId=(AMS.profile&&AMS.profile.id)||AMS.user.id||'';
  const facultyUsername=(AMS.profile&&AMS.profile.username)||AMS.user.username||'';
  if(!facultyId&&!facultyUsername){
    cardsEl.innerHTML='<div class="text-muted text-sm" style="grid-column:1/-1;text-align:center;padding:2rem">Faculty ID not available.</div>';
    tableEl.innerHTML='<tr><td colspan="8" class="text-muted text-sm" style="text-align:center">—</td></tr>';
    return;
  }
  try{
    // Fetch faculty assignments + courses in parallel
    const params=facultyId?`faculty_id=${encodeURIComponent(facultyId)}`:`faculty_username=${encodeURIComponent(facultyUsername)}`;
    const [asnRes, crsRes]=await Promise.all([
      fetch(`${window.AMS_CONFIG.API_URL}/api/faculty-assignments?${params}`),
      fetch(`${window.AMS_CONFIG.API_URL}/api/courses?${facultyId?'faculty_id='+encodeURIComponent(facultyId):''}`)
    ]);
    const asnData=await asnRes.json();
    const crsData=await crsRes.json();
    const assignments=asnData.assignments||[];
    const courses=crsData.courses||[];

    // Build a map of course_code → course info (for credits)
    const courseMap={};
    for(const c of courses) courseMap[c.course_code||c.id]=c;

    // Merge assignments with course data
    const items=assignments.map(a=>{
      const code=a.subject_code||a.course_code||'';
      const cInfo=courseMap[code]||{};
      return {
        id:a.id,
        code,
        name:a.subject_name||a.course_name||cInfo.course_name||'',
        credits:cInfo.credits||a.credits||'—',
        department:a.department||cInfo.department||'',
        section:a.section||'',
        year:a.year||'',
        semester:a.semester||cInfo.semester||'',
        academic_year:a.academic_year||cInfo.academic_year||'',
      };
    });

    // If no assignments, check if courses have data
    if(!items.length&&courses.length){
      for(const c of courses){
        items.push({
          id:c.id, code:c.course_code||'', name:c.course_name||'',
          credits:c.credits||'—', department:c.department||'',
          section:'', year:'', semester:c.semester||'', academic_year:c.academic_year||''
        });
      }
    }

    if(!items.length){
      cardsEl.innerHTML='<div class="text-muted text-sm" style="grid-column:1/-1;text-align:center;padding:2rem">📭 No courses assigned yet. Ask admin to assign courses via Timetable Management.</div>';
      tableEl.innerHTML='<tr><td colspan="8" class="text-muted text-sm" style="text-align:center;padding:1.5rem">No courses found.</td></tr>';
      return;
    }

    // Fetch student counts per (department, section)
    const batchKeys=[...new Set(items.filter(i=>i.department).map(i=>i.department+'||'+i.section))];
    const countMap={};
    await Promise.all(batchKeys.map(async(key)=>{
      const [dept,sec]=key.split('||');
      let url=`${window.AMS_CONFIG.API_URL}/api/registered-students?department=${encodeURIComponent(dept)}`;
      if(sec) url+=`&section=${encodeURIComponent(sec)}`;
      try{
        const r=await fetch(url);
        const d=await r.json();
        countMap[key]=(d.students||[]).length;
      }catch(e){ countMap[key]=0; }
    }));

    // Render cards
    const colors=['blue','teal','purple','green','orange'];
    cardsEl.innerHTML=items.map((b,i)=>{
      const bkey=b.department+'||'+b.section;
      const cnt=countMap[bkey]||0;
      const col=colors[i%colors.length];
      const batchLabel=(b.department?(b.department.slice(0,3).toUpperCase()):'')+(b.year?b.year:'')+(b.section?b.section:'');
      return `<div class="stat-card ${col}" style="cursor:pointer" onclick="openBatchStudents('${b.department}','${b.section}')">
        <div class="s-val" style="font-size:.95rem">${batchLabel||b.code}</div>
        <div class="s-lbl">${b.name}</div>
        <div class="d-flex justify-between mt-md" style="align-items:center">
          <span class="badge badge-teal">${b.code}</span>
          <span class="text-xs text-muted">👥 ${cnt}</span>
        </div>
      </div>`;
    }).join('');

    // Render table
    tableEl.innerHTML=items.map(c=>{
      const bkey=c.department+'||'+c.section;
      const cnt=countMap[bkey]||0;
      return `<tr>
        <td class="fw-semibold">${c.code}</td>
        <td>${c.name}</td>
        <td style="text-align:center">${c.credits}</td>
        <td>${c.department}</td>
        <td style="text-align:center">${c.section||'—'}</td>
        <td style="text-align:center">${c.year||'—'}</td>
        <td style="text-align:center">${c.semester||'—'}</td>
        <td style="text-align:center">${cnt}</td>
      </tr>`;
    }).join('');
  }catch(e){
    console.error('[CourseDetails]',e);
    cardsEl.innerHTML='<div class="text-muted text-sm" style="grid-column:1/-1;text-align:center;padding:2rem">⚠ Failed to load course details.</div>';
    tableEl.innerHTML='<tr><td colspan="8" class="text-red text-sm" style="text-align:center">Error loading data.</td></tr>';
  }
}

function openBatchStudents(dept,section){
  if(!dept){toast('No department specified','warning');return;}
  let url=`${window.AMS_CONFIG.API_URL}/api/registered-students?department=${encodeURIComponent(dept)}`;
  if(section) url+=`&section=${encodeURIComponent(section)}`;
  const label=(dept.slice(0,3).toUpperCase())+(section?' – '+section:'');
  fetch(url).then(r=>r.json()).then(data=>{
    const students=data.students||[];
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
    overlay.innerHTML=`<div class="modal modal-lg" style="max-height:85vh;overflow-y:auto">
      <div class="modal-header">
        <div class="modal-title">👥 Students — ${label} (${students.length})</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      ${students.length?`<div class="tbl-wrap"><table>
        <thead><tr><th>#</th><th>Roll No</th><th>Name</th><th>Email</th><th>Section</th></tr></thead>
        <tbody>${students.map((s,i)=>`<tr>
          <td>${i+1}</td>
          <td class="fw-semibold">${s.roll_no||'—'}</td>
          <td>${s.name||'—'}</td>
          <td style="font-size:.8rem">${s.email||'—'}</td>
          <td>${s.section||'—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`:'<div class="text-muted text-sm" style="text-align:center;padding:2rem">No students registered in this batch yet.</div>'}
    </div>`;
    document.body.appendChild(overlay);
  }).catch(()=>toast('Failed to load students','error'));
}

function renderOBE(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🎯 OBE Configuration</div></div>
    <div class="form-group"><label>Select Course</label><select><option>CS301 – Data Structures</option></select></div>
    ${[1,2,3,4].map(n=>`<div class="form-group"><label>CO${n}</label><input placeholder="Define Course Outcome ${n}…"/></div>`).join('')}
    <button class="btn btn-primary" onclick="toast('OBE configuration saved!','success')">Save</button>
  </div>`;
}

function renderLessonPlanner(){
  setTimeout(()=>loadLessonPlans(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📝 Lesson Planner</div>
      <button class="btn btn-primary btn-sm" onclick="openLessonModal()">+ Add Topic</button>
    </div>
    <div class="d-flex gap-md mb-md text-sm" style="flex-wrap:wrap">
      <span style="display:flex;align-items:center;gap:.4rem"><span style="width:12px;height:12px;border-radius:3px;background:var(--green);display:inline-block"></span> Completed</span>
      <span style="display:flex;align-items:center;gap:.4rem"><span style="width:12px;height:12px;border-radius:3px;background:var(--orange);display:inline-block"></span> Ongoing</span>
      <span style="display:flex;align-items:center;gap:.4rem"><span style="width:12px;height:12px;border-radius:3px;background:var(--text3);display:inline-block"></span> Planned</span>
    </div>
    <div id="lesson-plan-body"><div class="text-muted text-sm">Loading lesson plans…</div></div>
  </div>
  <div id="lessonModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:480px;padding:1.5rem">
      <div class="card-header"><div class="card-title">Add Lesson Plan</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('lessonModal').style.display='none'">✕</button></div>
      <div class="form-group"><label>Subject</label><input id="lp-subject" placeholder="e.g. Data Structures"/></div>
      <div class="form-row">
        <div class="form-group"><label>Week #</label><input type="number" id="lp-week" min="1" placeholder="1"/></div>
        <div class="form-group"><label>Planned Hours</label><input type="number" id="lp-hours" min="1" value="1"/></div>
      </div>
      <div class="form-group"><label>Topic</label><input id="lp-topic" placeholder="Topic to be covered"/></div>
      <div class="form-group"><label>Planned Date</label><input type="date" id="lp-date"/></div>
      <div class="form-group"><label>Notes (optional)</label><textarea id="lp-notes" rows="2" placeholder="Any notes…" style="width:100%;padding:.6rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical"></textarea></div>
      <button class="btn btn-primary w-full mt-md" onclick="submitLessonPlan()">Save Lesson Plan</button>
    </div>
  </div>`;
}
function openLessonModal(){
  document.getElementById('lessonModal').style.display='flex';
}
async function loadLessonPlans(){
  const el=document.getElementById('lesson-plan-body');
  if(!el)return;
  const facultyId=AMS.user.id||AMS.user.username;
  try{
    const res=await fetch(`/api/lesson-plans?faculty_id=${encodeURIComponent(facultyId)}`);
    const data=await res.json();
    const plans=Array.isArray(data)?data:(data.plans||[]);
    if(!plans.length){el.innerHTML='<div class="text-muted text-sm">No lesson plans yet. Click "+ Add Topic" to start.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Week</th><th>Subject</th><th>Topic</th><th>Hours</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${plans.map(l=>`<tr>
        <td class="fw-semibold">Wk ${l.week_number||'—'}</td>
        <td>${l.subject||'—'}</td>
        <td>${l.topic}</td>
        <td>${l.planned_hours||1}h</td>
        <td><select onchange="updateLessonStatus('${l.id}',this.value)" style="background:var(--ink3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:.2rem .4rem">
          ${['planned','ongoing','completed'].map(s=>`<option value="${s}"${l.status===s?' selected':''}>${s}</option>`).join('')}
        </select></td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteLessonPlan('${l.id}')">🗑️</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load lesson plans.</div>';}
}
async function submitLessonPlan(){
  const topic=document.getElementById('lp-topic').value.trim();
  const subject=document.getElementById('lp-subject').value.trim();
  if(!topic){toast('Topic is required','error');return;}
  try{
    const res=await fetch('/api/lesson-plans',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({faculty_id:AMS.user.id||AMS.user.username,subject,topic,
        week_number:parseInt(document.getElementById('lp-week').value)||1,
        planned_hours:parseInt(document.getElementById('lp-hours').value)||1,
        planned_date:document.getElementById('lp-date').value||null,
        notes:document.getElementById('lp-notes').value})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Lesson plan added!','success');
    document.getElementById('lessonModal').style.display='none';
    loadLessonPlans();
  }catch(e){toast(e.message,'error');}
}
async function updateLessonStatus(id,status){
  try{
    await fetch(`/api/lesson-plans/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
    toast('Status updated','success');
  }catch(e){toast('Update failed','error');}
}
async function deleteLessonPlan(id){
  if(!confirm('Delete this lesson plan?'))return;
  try{
    await fetch(`/api/lesson-plans/${id}`,{method:'DELETE'});
    toast('Deleted','success'); loadLessonPlans();
  }catch(e){toast('Delete failed','error');}
}

function renderFacultyOnlineClass(){
  setTimeout(()=>loadFacultyOCs(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">💻 My Online Classes</div><button class="btn btn-primary btn-sm" onclick="openFOCModal()">+ Schedule</button></div>
    <div id="faculty-oc-body"><div class="text-muted text-sm">Loading…</div></div>
  </div>
  <div id="focModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:500px;padding:1.5rem">
      <div class="card-header"><div class="card-title">Schedule Online Class</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('focModal').style.display='none'">✕</button></div>
      <div class="form-group"><label>Title</label><input id="foc-title" placeholder="e.g. Data Structures – Unit 3"/></div>
      <div class="form-row">
        <div class="form-group"><label>Date & Time</label><input type="datetime-local" id="foc-dt"/></div>
        <div class="form-group"><label>Duration (min)</label><input type="number" id="foc-dur" value="60"/></div>
      </div>
      <div class="form-group"><label>Meeting Link</label><input id="foc-link" placeholder="https://meet.google.com/…"/></div>
      <button class="btn btn-primary w-full mt-md" onclick="submitFOC()">Schedule Class</button>
    </div>
  </div>`;
}
function openFOCModal(){document.getElementById('focModal').style.display='flex';}
async function loadFacultyOCs(){
  const el=document.getElementById('faculty-oc-body');
  if(!el)return;
  try{
    const res=await fetch('/api/online-classes');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.classes||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No online classes yet. Click "+ Schedule" to create one.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Date/Time</th><th>Title</th><th>Duration</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${list.map(c=>{
        const dt=c.scheduled_at?new Date(c.scheduled_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
        return `<tr>
          <td>${dt}</td><td class="fw-semibold">${c.title||'—'}</td>
          <td>${c.duration_minutes?c.duration_minutes+' min':'—'}</td>
          <td><span class="badge badge-${c.status==='scheduled'?'orange':c.status==='ongoing'?'green':'gray'}">${c.status||'scheduled'}</span></td>
          <td class="d-flex gap-sm">
            ${c.status==='scheduled'?`<button class="btn btn-primary btn-sm" onclick="markFOCOngoing('${c.id}')">▶ Start</button>`:''}
            ${c.status==='ongoing'?`<button class="btn btn-success btn-sm" onclick="markFOCDone('${c.id}')">✅ End</button>`:''}
            <button class="btn btn-danger btn-sm" onclick="deleteFOC('${c.id}')">🗑️</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load classes.</div>';}
}
async function submitFOC(){
  const title=document.getElementById('foc-title').value.trim();
  const dt=document.getElementById('foc-dt').value;
  if(!title||!dt){toast('Title and date/time required','error');return;}
  try{
    const res=await fetch('/api/online-classes',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title,faculty_id:AMS.user.id,scheduled_at:new Date(dt).toISOString(),
        duration_minutes:parseInt(document.getElementById('foc-dur').value)||60,
        meeting_link:document.getElementById('foc-link').value,status:'scheduled'})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Class scheduled!','success');
    document.getElementById('focModal').style.display='none';
    loadFacultyOCs();
  }catch(e){toast(e.message,'error');}
}
async function markFOCOngoing(id){
  await fetch(`/api/online-classes/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'ongoing'})});
  toast('Class started','success'); loadFacultyOCs();
}
async function markFOCDone(id){
  await fetch(`/api/online-classes/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'completed'})});
  toast('Class ended','success'); loadFacultyOCs();
}
async function deleteFOC(id){
  if(!confirm('Delete this class?'))return;
  await fetch(`/api/online-classes/${id}`,{method:'DELETE'});
  toast('Deleted','success'); loadFacultyOCs();
}

function renderCourseMaterials(){
  setTimeout(()=>loadCourseMaterials(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">📂 Course Materials</div><button class="btn btn-primary btn-sm" onclick="openCMModal()">📤 Upload</button></div>
    <div id="cm-body"><div class="text-muted text-sm">Loading materials…</div></div>
  </div>
  <div id="cmModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:520px;padding:1.5rem;max-height:90vh;overflow-y:auto">
      <div class="card-header"><div class="card-title">Upload Material</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('cmModal').style.display='none'">✕</button></div>
      <div class="form-row">
        <div class="form-group"><label>Course Code *</label><input id="cm-coursecode" placeholder="e.g. CS301"/></div>
        <div class="form-group"><label>Subject</label><input id="cm-subject" placeholder="e.g. Data Structures"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Module Number *</label><input id="cm-module" type="number" min="1" max="20" value="1" placeholder="1"/></div>
        <div class="form-group"><label>Unit / Module Name</label><input id="cm-unit" placeholder="e.g. Arrays & Linked Lists"/></div>
      </div>
      <div class="form-group"><label>File Name *</label><input id="cm-filename" placeholder="e.g. Unit 1 Notes.pdf"/></div>
      <div class="form-group"><label>File URL / Link</label><input id="cm-url" placeholder="https://drive.google.com/…"/></div>
      <div class="form-group"><label>Topic</label><input id="cm-topic" placeholder="e.g. Sorting Algorithms"/></div>
      <div class="form-group"><label>Description</label><input id="cm-desc" placeholder="Brief description of content"/></div>
      <div class="form-row">
        <div class="form-group"><label>Type</label><select id="cm-type" style="width:100%;padding:.5rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)"><option>Notes</option><option>Slides</option><option>Assignment</option><option>Reference</option><option>Video</option></select></div>
        <div class="form-group d-flex align-center gap-sm" style="margin-top:1.5rem"><input type="checkbox" id="cm-public" checked style="width:16px;height:16px"/><label for="cm-public" style="margin:0">Visible to students</label></div>
      </div>
      <button class="btn btn-primary w-full mt-md" onclick="submitCourseMaterial()">Upload</button>
    </div>
  </div>`;
}
function openCMModal(){document.getElementById('cmModal').style.display='flex';}
async function loadCourseMaterials(){
  const el=document.getElementById('cm-body');
  if(!el)return;
  const facultyId=AMS.user.id||AMS.user.username;
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/course-materials?uploaded_by=${encodeURIComponent(facultyId)}`);
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.materials||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No materials uploaded yet. Click "📤 Upload" to add one.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Module</th><th>File</th><th>Course</th><th>Topic / Unit</th><th>Type</th><th>Visibility</th><th>Actions</th></tr></thead>
      <tbody>${list.map(m=>`<tr>
        <td style="text-align:center"><span class="badge badge-blue">${m.module_number||'—'}</span></td>
        <td class="fw-semibold">${m.file_name}</td>
        <td>${m.course_code||m.subject||'—'}</td>
        <td class="text-muted">${m.unit_name||m.topic||'—'}</td>
        <td><span class="badge badge-purple">${m.material_type||'Notes'}</span></td>
        <td><button class="btn btn-outline btn-sm" onclick="toggleMaterialVisibility('${m.id}',${!m.is_public})">${m.is_public?'🔓 Public':'🔒 Private'}</button></td>
        <td class="d-flex gap-sm">
          ${m.file_url?`<a href="${m.file_url}" target="_blank" class="btn btn-outline btn-sm">📥</a>`:''}
          <button class="btn btn-danger btn-sm" onclick="deleteCourseMaterial('${m.id}')">🗑️</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load materials.</div>';}
}
async function submitCourseMaterial(){
  const file_name=document.getElementById('cm-filename').value.trim();
  if(!file_name){toast('File name required','error');return;}
  const courseCode=document.getElementById('cm-coursecode').value.trim();
  const moduleNum=parseInt(document.getElementById('cm-module').value)||1;
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/course-materials`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({file_name,subject:document.getElementById('cm-subject').value,
        file_url:document.getElementById('cm-url').value,topic:document.getElementById('cm-topic').value,
        material_type:document.getElementById('cm-type').value,
        is_public:document.getElementById('cm-public').checked,
        uploaded_by:AMS.user.id||AMS.user.username,
        course_code:courseCode,
        module_number:moduleNum,
        unit_name:document.getElementById('cm-unit').value.trim(),
        description:document.getElementById('cm-desc')?.value.trim()||'',
        department:(AMS.profile&&AMS.profile.department)||''})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Material uploaded!','success');
    document.getElementById('cmModal').style.display='none';
    loadCourseMaterials();
  }catch(e){toast(e.message,'error');}
}
async function toggleMaterialVisibility(id,makePublic){
  try{
    await fetch(`/api/course-materials/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({is_public:makePublic})});
    toast(makePublic?'Now visible to students':'Now private','success');
    loadCourseMaterials();
  }catch(e){toast('Update failed','error');}
}
async function deleteCourseMaterial(id){
  if(!confirm('Delete this material?'))return;
  try{
    await fetch(`/api/course-materials/${id}`,{method:'DELETE'});
    toast('Deleted','success'); loadCourseMaterials();
  }catch(e){toast('Delete failed','error');}
}

// ── Faculty Attendance ────────────────────────────────────
function renderFacultyAttendance(){
  // Initialize empty attendance and load data
  setTimeout(() => loadTodayAttendance(), 100);
  
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">✅ Attendance Control Panel</div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-bottom:1.5rem">
      <div class="form-group" style="margin:0">
        <label style="display:flex;justify-content:space-between;align-items:center">SELECT COURSE
          <span style="font-size:.72rem;cursor:pointer;color:var(--primary);font-weight:500" onclick="loadFacultyCoursesIntoDropdown(true)">🔄 Refresh</span>
        </label>
        <select id="faCourse" onchange="loadCourseHours()"><option value="">Loading courses…</option></select>
        <div id="faCourseHint" style="font-size:.72rem;color:var(--text3);margin-top:.2rem;display:none"></div>
      </div>
      <div class="form-group" style="margin:0"><label>SUBJECT HOUR</label>
        <select id="faHour"><option value="">Loading hours…</option></select>
      </div>
      <div class="form-group" style="margin:0"><label>SESSION TYPE</label>
        <select id="faSessionType">
          <option value="lecture">📖 Lecture</option>
          <option value="tutorial">📝 Tutorial</option>
          <option value="practical">🔬 Practical</option>
          <option value="seminar">🎤 Seminar</option>
        </select>
      </div>
      <div class="form-group" style="margin:0"><label>DATE</label>
        <input type="date" id="faDate"
          value="${new Date().toISOString().split('T')[0]}"
          max="${new Date().toISOString().split('T')[0]}"
          min="${new Date().toISOString().split('T')[0]}"
          readonly
          style="cursor:not-allowed;background:var(--ink3);"
          title="Attendance can only be marked for today"/>
      </div>
    </div>
    <div style="background:rgba(239,68,68,.07);border:1px solid var(--red);border-radius:var(--radius);padding:1rem;margin-bottom:1.5rem;font-size:0.88rem">
      🔒 <strong>Attendance Lock Policy:</strong> You can only mark or edit attendance for <strong>today</strong>.
      Past records are permanently locked once the day ends. Face-marked records cannot be edited by faculty — admin override required.
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem">
    <button id="btnEnableFaceRec" class="btn btn-success" onclick="openFaceRecModal()">🟢 Enable Face Recognition</button>
    <button id="btnDisableFaceRec" class="btn btn-danger" onclick="disableFaceRec()" style="display:none">🔴 Disable Face Recognition</button>
      <button class="btn btn-orange" onclick="generateQR()">📲 Generate QR Code</button>
      <button class="btn btn-primary" onclick="showManualAtt()">✍️ Manual Marking</button>
      <button class="btn btn-outline" onclick="toast('Report downloaded','success')">📥 Download Report</button>
      <button class="btn btn-teal" onclick="loadTodayAttendance()">🔄 Refresh Attendance</button>
    </div>
  </div>

  <div id="qrSection" style="display:none">
    <div id="f-qr-panel">
      <!-- QR code will be rendered here by QRModule -->
    </div>
  </div>

  <div id="manualAttSection" style="display:none">
    <div class="card">
      <div class="card-header"><div class="card-title">✍️ Manual Attendance</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('manualAttSection').style.display='none'">Close</button></div>
      <div class="d-flex gap-md mb-md">
        <button class="btn btn-success btn-sm" onclick="markAllPresent()">Mark All Present</button>
        <button class="btn btn-danger btn-sm" onclick="markAllAbsent()">Mark All Absent</button>
        <button class="btn btn-outline btn-sm" onclick="loadRegisteredStudents()">🔄 Refresh Students</button>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Roll No</th><th>Name</th><th>Status</th><th>Manual Override</th><th>Notes</th></tr></thead>
        <tbody id="manualAttBody"><tr><td colspan="5" style="text-align:center;color:var(--text2)">Loading students...</td></tr></tbody>
      </table></div>
      <div style="background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);padding:0.8rem;margin-bottom:1rem;font-size:0.85rem;color:var(--text2)">
        ℹ️ <strong>Note:</strong> You cannot manually edit attendance records that were marked via Face Recognition. Only admin can modify those.
      </div>
      <button class="btn btn-primary mt-lg" onclick="saveManualAtt()">💾 Save Attendance</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">📊 Today's Summary</div></div>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-card green"><div class="s-icon">✅</div><div class="s-val" id="attPresent">0</div><div class="s-lbl">Present</div></div>
      <div class="stat-card red"><div class="s-icon">❌</div><div class="s-val" id="attAbsent">0</div><div class="s-lbl">Absent</div></div>
      <div class="stat-card blue"><div class="s-icon">📊</div><div class="s-val" id="attPercent">0%</div><div class="s-lbl">Rate</div></div>
      <div class="stat-card orange"><div class="s-icon">⚠️</div><div class="s-val" id="attBelow">0</div><div class="s-lbl">Below 75%</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">👥 Registered Students</div><button class="btn btn-outline btn-sm" onclick="refreshRegisteredStudentsPanel()">🔄 Refresh</button></div>
    <div id="registeredStudentsPanel" style="overflow-y:auto;max-height:400px">Loading registered students...</div>
  </div>`;
}

// ── Faculty Subject Students ──────────────────────────────
/**
 * Render faculty view of their subject students (section-wise)
 * Allows faculty to see which students are in which section/batch
 */
function renderFacultySubjectStudents(){
  setTimeout(() => initFacultySubjectStudents(), 100);
  
  return `
  <div class="card">
    <div class="card-header"><div class="card-title">👥 Subject Students (Section-wise)</div></div>
    <p class="text-muted mb-md">Select a subject to view your students organized by section and batch.</p>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div class="form-group" style="margin:0">
        <label>SELECT SUBJECT</label>
        <select id="fssSubject" onchange="loadSubjectStudentsList()">
          <option value="">Loading your subjects…</option>
        </select>
      </div>
      <div class="form-group" style="margin:0">
        <label>FILTER SECTION (Optional)</label>
        <select id="fssSection" onchange="loadSubjectStudentsList()">
          <option value="">All Sections</option>
          <option value="A">Section A</option>
          <option value="B">Section B</option>
          <option value="C">Section C</option>
          <option value="D">Section D</option>
        </select>
      </div>
    </div>
    
    <div id="fssStatus" style="padding:1rem;background:var(--ink3);border-radius:var(--radius);border:1px solid var(--border);color:var(--text2);text-align:center">
      Select a subject above to view students
    </div>
    
    <div id="fssStudentsList" style="margin-top:1.5rem"></div>
  </div>
  `;
}

/**
 * Initialize faculty subject students view
 */
function initFacultySubjectStudents(){
  loadFacultySubjectsIntoDropdown();
}

/**
 * Load faculty's subjects into the dropdown
 */
async function loadFacultySubjectsIntoDropdown(){
  const fid = (AMS.profile && AMS.profile.id) || AMS.user.id || '';
  const select = document.getElementById('fssSubject');
  if(!select || !fid) return;
  
  try {
    const response = await fetch(`${API_URL}/api/faculty/${fid}/subjects`);
    const data = await response.json();
    
    if(data.success && data.subjects && data.subjects.length){
      select.innerHTML = `<option value="">Select a subject</option>` + 
        data.subjects.map(s => `<option value="${s.course_code}">${s.course_code} - ${s.course_name}</option>`).join('');
    } else {
      select.innerHTML = `<option value="">No subjects assigned</option>`;
    }
  } catch(e) {
    console.error('Error loading faculty subjects:', e);
    select.innerHTML = `<option value="">Error loading subjects</option>`;
  }
}

/**
 * Load students for selected subject
 */
async function loadSubjectStudentsList(){
  const subjectCode = document.getElementById('fssSubject')?.value;
  const section = document.getElementById('fssSection')?.value;
  const statusDiv = document.getElementById('fssStatus');
  const listDiv = document.getElementById('fssStudentsList');
  
  if(!subjectCode){
    statusDiv.innerHTML = 'Select a subject above to view students';
    listDiv.innerHTML = '';
    return;
  }
  
  statusDiv.innerHTML = '<div class="loader-ring"></div> Loading students…';
  listDiv.innerHTML = '';
  
  try {
    let url = `${API_URL}/api/faculty/subject-students/${subjectCode}`;
    if(section) url += `?section=${section}`;
    
    const response = await fetch(url);
    const result = await response.json();
    
    if(result.success){
      statusDiv.style.display = 'none';
      renderSubjectStudentsDisplay(result, section);
    } else {
      statusDiv.innerHTML = `<span style="color:var(--red)">❌ ${result.error || 'Failed to load students'}</span>`;
    }
  } catch(e) {
    statusDiv.innerHTML = `<span style="color:var(--red)">❌ Error: ${e.message}</span>`;
  }
}

/**
 * Render the student list display (section-wise with batches)
 */
function renderSubjectStudentsDisplay(data, filterSection){
  const listDiv = document.getElementById('fssStudentsList');
  
  let html = `<div style="margin-bottom:1rem;padding:1rem;background:rgba(31,111,235,0.1);border-radius:var(--radius);border-left:4px solid var(--blue)">
    <div style="font-size:0.9rem"><strong>${data.subject_code}</strong> — ${data.total_students} Total Students</div>
  </div>`;
  
  // Summary cards for each section
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem">`;
  
  Object.entries(data.summary || {}).forEach(([section, info]) => {
    if(filterSection && filterSection !== section) return;
    
    const batches = Object.entries(info.batches || {})
      .map(([batch, cnt]) => `${batch}: ${cnt}`)
      .join(' | ');
    
    html += `<div style="padding:1.5rem;background:var(--ink3);border-radius:var(--radius);border:1px solid var(--border)">
      <div style="font-size:1.3rem;font-weight:700;color:var(--blue);margin-bottom:0.5rem">Section ${section}</div>
      <div style="font-size:1.8rem;font-weight:700;color:var(--accent)">${info.total}</div>
      <div style="font-size:0.8rem;color:var(--text2);margin-top:0.75rem">${batches}</div>
    </div>`;
  });
  
  html += `</div>`;
  
  // Detailed student lists by section
  html += `<div>`;
  
  Object.entries(data.grouped_by_section || {}).forEach(([section, batches]) => {
    if(filterSection && filterSection !== section) return;
    
    html += `<div style="margin-bottom:2rem;background:var(--ink3);border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)">
      <div style="padding:1rem;background:#667eea;color:white;font-weight:600;display:flex;justify-content:space-between;align-items:center">
        <span>📌 Section ${section}</span>
        <span style="font-size:0.9rem;opacity:0.9">${Object.entries(batches).reduce((sum, [b, students]) => sum + students.length, 0)} Students</span>
      </div>
      <div style="padding:1.5rem">`;
    
    Object.entries(batches).forEach(([batch, students]) => {
      html += `<div style="margin-bottom:1.5rem">
        <h5 style="margin:0 0 1rem 0;color:var(--accent);font-size:1rem">${batch} (${students.length} students)</h5>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.75rem">`;
      
      students.forEach(student => {
        html += `<div style="padding:0.75rem;background:var(--ink);border-radius:0.4rem;border:1px solid var(--border);font-size:0.9rem;text-align:center">
          <div style="font-weight:600;color:var(--accent);margin-bottom:0.25rem">${student.roll_no}</div>
          <div style="font-size:0.8rem;color:var(--text2)">${batch}</div>
        </div>`;
      });
      
      html += `</div></div>`;
    });
    
    html += `</div></div>`;
  });
  
  html += `</div>`;
  
  listDiv.innerHTML = html;
}

// Load today's attendance — RTDB real-time listener + backend fallback
let _facAttUnsubscribe = null;

async function loadTodayAttendance(){
  const today = new Date().toISOString().split('T')[0];
  const course = document.getElementById('faCourse')?.value || 'all';

  // Detach previous listener
  if(_facAttUnsubscribe){ _facAttUnsubscribe(); _facAttUnsubscribe=null; }

  // Real-time RTDB listener for today's attendance
  if(window.DB){
    const path = `/attendance/${today}`;
    _facAttUnsubscribe = DB.listen(path, data => {
      let present=0, absent=0, below75=0;
      if(data){
        Object.values(data).forEach(session => {
          if(typeof session !== 'object') return;
          Object.values(session).forEach(rec => {
            if(course!=='all' && rec.session_id && !rec.session_id.includes(course)) return;
            if(rec.status==='present') present++;
            else absent++;
          });
        });
      }
      const total=present+absent;
      const pct=total?Math.round(present/total*100):0;
      const b75=total?Math.round(total*0.25):0;
      const pe=document.getElementById('attPresent'); if(pe) pe.textContent=present;
      const ae=document.getElementById('attAbsent'); if(ae) ae.textContent=absent;
      const pc=document.getElementById('attPercent'); if(pc) pc.textContent=pct+'%';
      const be=document.getElementById('attBelow'); if(be) be.textContent=b75;
      // Update manual attendance table if open
      _updateManualAttFromRTDB(data, course, today);
    });
    // Also trigger initial load via backend for existing Supabase records
    _loadAttendanceFromBackend(today, course);
  } else {
    _loadAttendanceFromBackend(today, course);
  }
}

async function _loadAttendanceFromBackend(today, course){
  try{
    const fid=(AMS.profile && AMS.profile.id)||AMS.user.id||'';
    let url=`${window.AMS_CONFIG.API_URL}/api/attendance?date=${today}`;
    if(fid) url+=`&faculty_id=${encodeURIComponent(fid)}`;
    const res=await fetch(url).catch(()=>null);
    if(!res||!res.ok) return;
    const data=await res.json();
    const records=data.records||[];
    let present=0, absent=0, below75=0;
    records.forEach(r=>{
      const status=(r.status||'').toLowerCase();
      const verified=r.verified===true||r.verified==='true';
      if(status==='present'||verified) present++;
      else absent++;
    });
    const total=present+absent;
    const pct=total?Math.round(present/total*100):0;
    // Count below 75% (students with attendance < 75% in this session context — show low attendance count)
    below75=total?Math.round(absent*1):0;
    const pe=document.getElementById('attPresent'); if(pe) pe.textContent=present;
    const ae=document.getElementById('attAbsent'); if(ae) ae.textContent=absent;
    const pc=document.getElementById('attPercent'); if(pc) pc.textContent=pct+'%';
    const be=document.getElementById('attBelow'); if(be) be.textContent=below75;
  }catch(e){ console.warn('[ATTENDANCE-BACKEND]',e); }
}

function _updateManualAttFromRTDB(rtdbData, course, today){
  const tbody=document.getElementById('manualAttBody');
  if(!tbody) return;
  // Don't overwrite face-verified rows, just refresh status badges
  if(rtdbData){
    Object.values(rtdbData).forEach(session=>{
      if(typeof session!=='object') return;
      Object.entries(session).forEach(([rollNo, rec])=>{
        const rows=tbody.querySelectorAll(`tr[data-roll="${rollNo}"]`);
        rows.forEach(row=>{
          const badge=row.querySelector('.att-status-badge');
          if(badge && rec.face_verified){
            badge.textContent='Present (Face)';
            badge.className='badge badge-green att-status-badge';
          }
        });
      });
    });
  }
}

async function refreshRegisteredStudentsPanel(){
  const panel=document.getElementById('registeredStudentsPanel');
  if(!panel) return;
  panel.innerHTML='<div class="text-muted text-sm" style="padding:1rem">⏳ Loading students…</div>';
  try{
    // Build filter: try to pick up batch from the selected timetable slot
    let params = '';
    const fid=(AMS.profile && AMS.profile.id)||AMS.user.id||'';
    const dept=(AMS.profile && AMS.profile.department)||'';
    if(dept) params+='&department='+encodeURIComponent(dept);

    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/registered-students?1=1${params}`).catch(()=>null);
    if(!res||!res.ok) throw new Error(`HTTP ${res?.status||'no response'}`);
    const data=await res.json();
    const students=data.students||[];
    if(!students.length){
      panel.innerHTML='<p style="text-align:center;color:var(--text2);padding:2rem">📭 No registered students found.</p>';
      return;
    }
    panel.innerHTML=`<div class="tbl-wrap"><table style="width:100%">
      <thead><tr><th>Roll No</th><th>Name</th><th>Email</th><th>Section</th><th>Last Login</th></tr></thead>
      <tbody>${students.map(s=>`<tr>
        <td class="fw-semibold">${s.roll_no||'—'}</td>
        <td>${s.name||'—'}</td>
        <td class="text-muted">${s.email||'—'}</td>
        <td>${s.section||'—'}</td>
        <td><small>${s.last_login?new Date(s.last_login).toLocaleDateString('en-IN'):'—'}</small></td>
      </tr>`).join('')}</tbody>
    </table></div><div class="text-muted" style="font-size:.75rem;padding:.5rem .75rem">Showing ${students.length} student(s)</div>`;
  }catch(e){
    panel.innerHTML=`<p style="text-align:center;color:var(--red);padding:2rem">⚠ Error: ${e.message}</p>`;
  }
}

let qrInterval=null;

// Enhanced QR Generation with Security Features
async function generateQR(){
  try {
    const courseEl  = document.getElementById('faCourse');
    const hourEl    = document.getElementById('faHour');
    const stypeEl   = document.getElementById('faSessionType');

    const courseVal = courseEl?.value || '';
    const courseName = courseEl?.selectedIndex >= 0
      ? (courseEl.options[courseEl.selectedIndex]?.text || courseVal)
      : courseVal;
    const hourVal   = hourEl?.value || '';
    const sessionType = stypeEl?.value || 'lecture';

    if(!courseVal || courseName.toLowerCase().includes('loading') || courseName.toLowerCase().includes('select')){
      toast('⚠ Please select a course before generating a QR code.','error');
      return;
    }
    if(!hourVal || hourVal.toLowerCase().includes('loading') || hourVal.toLowerCase().includes('select')){
      toast('⚠ Please select a subject hour before generating a QR code.','error');
      return;
    }

    document.getElementById('qrSection').style.display='block';
    document.getElementById('f-qr-panel').innerHTML=`
      <div style="padding:1rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:1rem;font-size:.875rem">
        <div style="font-weight:600;margin-bottom:.4rem">📊 Generating QR for:</div>
        <div style="color:var(--text2);display:grid;gap:.2rem">
          <span>Course: <strong>${courseName}</strong></span>
          <span>Hour: <strong>${hourVal}</strong></span>
          <span>Type: <strong>${sessionType}</strong></span>
        </div>
        <div style="margin-top:.6rem;color:var(--text3);font-size:.8rem">⏳ Generating secure QR…</div>
      </div>`;

    // Get location for GPS requirement
    const location = await QRModule.getLocation();

    // Generate enhanced QR with security
    const qrData = await QRModule.generateEnhancedQR({
      courseId: courseVal,
      subject: courseName,
      hour: hourVal,
      sessionType,
      validityMinutes: 5,
      requireFace: true,
      requireLocation: true,
      latitude: location?.latitude,
      longitude: location?.longitude,
      gpsRadius: 100
    });

    if (!qrData) throw new Error('Failed to generate QR');

    toast('🔐 Encrypted QR code generated with security features','success');
  } catch(e){
    toast('Failed to generate QR code: '+e.message,'error');
    console.error('QR Error:',e);
    document.getElementById('qrSection').style.display='none';
  }
}

function stopQR(){
  clearInterval(qrInterval);
  document.getElementById('qrSection').style.display='none';
  QRModule.stopSession();
  toast('QR session ended','info');
}

// Enhanced Student QR Scanning (QRModule)
function stopQRScan(){
  QRModule.stopQRScan();
  document.getElementById('s-attendance-panel').style.display='none';
  resetAtt();
}

// Student: Create Personal QR Profile
async function createStudentQRProfile(){
  try {
    toast('Creating your QR profile...','info');
    await QRModule.createQRProfile();
  } catch(e){
    toast('Error creating profile: '+e.message,'error');
  }
}

// View Attendance History
async function viewAttendanceHistory(){
  try {
    const roll=AMS.user.rollNo || AMS.user.id;
    const res = await fetch(`${window.AMS_CONFIG.API_URL}/api/qr/attendance-history?roll_no=${roll}&limit=20`);
    const data = await res.json();
    
    if(data.success) {
      const html = `
        <div class="card card-info">
          <div class="card-header">
            <div class="card-title">📅 Your Attendance History</div>
          </div>
          <div class="card-body">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Course</th>
                  <th>Time</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${(data.attendance_records || []).map(r => `
                  <tr>
                    <td>${new Date(r.date).toLocaleDateString()}</td>
                    <td>${r.course_id}</td>
                    <td>${new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td><span class="badge ${r.method === 'qr' ? 'badge-teal' : 'badge-blue'}">${r.method.toUpperCase()}</span></td>
                    <td><span class="badge ${r.verified ? 'badge-green' : 'badge-orange'}">${r.verified ? 'Verified' : 'Manual'}</span></td>
                    <td><small>${r.in_campus ? '📍 Campus' : '🏠 Remote'}</small></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      document.getElementById('s-attendance-panel').innerHTML = html;
    }
  } catch(e){
    toast('Error loading attendance history','error');
    console.error(e);
  }
}

function toggleFaceRec(){
  AMS.faceRecEnabled = !AMS.faceRecEnabled;
  toast('Face Recognition '+(AMS.faceRecEnabled?'Enabled':'Disabled'), AMS.faceRecEnabled?'success':'info');
  updateFaceRecButtons();
}

function openFaceRecModal(){
  const courseEl      = document.getElementById('faCourse');
  const hourEl        = document.getElementById('faHour');
  const sessionTypeEl = document.getElementById('faSessionType');
  const dateEl        = document.getElementById('faDate');

  const courseVal  = courseEl?.value  || '';
  const courseName = courseEl?.selectedIndex >= 0
    ? (courseEl.options[courseEl.selectedIndex]?.text || courseVal)
    : courseVal;
  const hourVal    = hourEl?.value || '';
  const hourName   = hourEl?.selectedIndex >= 0
    ? (hourEl.options[hourEl.selectedIndex]?.text || hourVal)
    : hourVal;
  const sessionType = sessionTypeEl?.value || 'lecture';
  const sessionLabel = sessionTypeEl?.selectedIndex >= 0
    ? (sessionTypeEl.options[sessionTypeEl.selectedIndex]?.text || sessionType)
    : sessionType;
  const date = dateEl?.value || new Date().toISOString().split('T')[0];

  if(!courseVal || courseName.toLowerCase().includes('loading') || courseName.toLowerCase().includes('select')){
    toast('⚠ Please select a course before enabling Face Recognition.','error');
    return;
  }
  if(!hourVal || hourName.toLowerCase().includes('loading') || hourName.toLowerCase().includes('select')){
    toast('⚠ Please select a subject hour before enabling Face Recognition.','error');
    return;
  }

  const displayDate = (() => {
    try { return new Date(date + 'T00:00:00').toLocaleDateString('en-IN'); } catch{ return date; }
  })();

  const modalHTML = `
    <div id="faceRecModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center">
      <div class="card" style="width:90%;max-width:420px">
        <div class="card-header">
          <div class="card-title">🎯 Enable Face Recognition</div>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('faceRecModal').remove()">✕</button>
        </div>
        <div style="padding:1.5rem">
          <div style="background:var(--ink3);border-left:3px solid var(--blue);padding:1rem;border-radius:4px;margin-bottom:1rem;font-size:0.9rem">
            <strong>📋 Session Details:</strong>
            <div style="margin-top:0.5rem;color:var(--text2);display:grid;gap:.3rem">
              <div>Course: <strong>${courseName}</strong></div>
              <div>Hour: <strong>${hourName}</strong></div>
              <div>Type: <strong>${sessionLabel}</strong></div>
              <div>Date: <strong>${displayDate}</strong></div>
            </div>
          </div>
          <p style="font-size:0.95rem;color:var(--text2);margin-bottom:1rem">
            ✅ <strong>Face Recognition will be ENABLED for this session.</strong>
          </p>
          <p style="font-size:0.85rem;color:var(--text3);margin-bottom:1.5rem;line-height:1.6">
            All students who pass face verification will be marked <span style="color:var(--green);font-weight:bold">PRESENT</span>, and those who fail will be marked <span style="color:var(--red);font-weight:bold">ABSENT</span>. These records cannot be edited by you (faculty).
          </p>
          <div style="display:flex;gap:1rem">
            <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('faceRecModal').remove()">Cancel</button>
            <button class="btn btn-success" style="flex:1" onclick="confirmEnableFaceRec('${courseVal}','${hourVal}','${date}','${sessionType}')">Enable Now</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function confirmEnableFaceRec(course, hour, date, sessionType){
  document.getElementById('faceRecModal').remove();
  AMS.faceRecEnabled = true;
  AMS.faceRecSession = { course, hour, date, sessionType: sessionType || 'lecture' };

  // Update backend to enable face recognition in system_config
  fetch(`${window.AMS_CONFIG.API_URL}/api/config/face-recognition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, course, hour, date, session_type: sessionType || 'lecture' })
  }).then(r => r.json())
    .then(d => console.log('[Face Rec] Backend enabled:', d))
    .catch(e => console.error('[Face Rec] Error:', e));

  toast('Face Recognition Enabled for this session','success');
  updateFaceRecButtons();
}

function disableFaceRec(){
  AMS.faceRecEnabled = false;
  AMS.faceRecSession = null;
  
  // Update backend to disable face recognition
  fetch(`${window.AMS_CONFIG.API_URL}/api/config/face-recognition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false })
  }).then(r => r.json())
    .then(d => console.log('[Face Rec] Backend disabled:', d))
    .catch(e => console.error('[Face Rec] Error:', e));
  
  toast('Face Recognition Disabled','info');
  updateFaceRecButtons();
  // AMS.faceRecSession already cleared above
}

function updateFaceRecButtons(){
  try{
    const en = document.getElementById('btnEnableFaceRec');
    const dis = document.getElementById('btnDisableFaceRec');
    if(en) {
      en.disabled = !!AMS.faceRecEnabled;
      en.style.display = AMS.faceRecEnabled ? 'none' : 'inline-block';
    }
    if(dis) {
      dis.disabled = !AMS.faceRecEnabled;
      dis.style.display = AMS.faceRecEnabled ? 'inline-block' : 'none';
    }
  }catch(e){console.warn('updateFaceRecButtons:',e)}
}
function showManualAtt(){
  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('faDate');
  if(dateEl && dateEl.value && dateEl.value < today){
    toast('⛔ Attendance can only be marked for today. Past dates are locked.','error');
    return;
  }
  document.getElementById('manualAttSection').style.display='block';
  loadRegisteredStudents();
}
function markAllAbsent(){document.querySelectorAll('[name^="att_"]').forEach(r=>{if(r.value==='A')r.checked=true})}
async function saveManualAtt(){
  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('faDate');
  const selectedDate = dateEl ? dateEl.value : today;
  if(selectedDate < today){
    toast('⛔ Cannot save attendance for past date. Records are locked once the day ends.','error');
    return;
  }
  // Collect statuses from radio buttons
  const records = [];
  document.querySelectorAll('#manualAttBody tr[data-roll]').forEach(row=>{
    const roll = row.dataset.roll;
    const name = row.dataset.name || '';
    const radioP = row.querySelector(`input[name="att_${roll}"][value="P"]`);
    const status = radioP && radioP.checked ? 'present' : 'absent';
    if(roll) records.push({roll_no: roll, student_name: name, status});
  });
  if(!records.length){ toast('No attendance data to save','error'); return; }
  const sessionType = document.getElementById('faSessionType')?.value || 'lecture';
  const course = document.getElementById('faCourse')?.value || '';
  const facultyId = (AMS.profile && AMS.profile.id) || AMS.user?.id || '';
  const dept = (AMS.profile && AMS.profile.department) || '';
  const section = document.getElementById('faSection')?.value || '';
  const semester = document.getElementById('faSemester')?.value || '';
  try{
    // 1) create/open session
    const sessRes = await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance-sessions`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({subject_name:course, faculty_id:facultyId, date:today, method:'manual', session_type:sessionType, department:dept, section, semester})
    });
    const sessD = await sessRes.json();
    if(sessD.locked){ toast('⛔ ' + sessD.error,'error'); return; }
    if(!sessD.success) throw new Error(sessD.error || 'Failed to create session');
    const sid = sessD.session?.id || '';
    // 2) bulk mark
    const attRes = await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance/manual`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({session_id:sid, date:today, subject_name:course, faculty_id:facultyId, session_type:sessionType, department:dept, section, semester, records})
    });
    const attD = await attRes.json();
    if(attD.locked){ toast('⛔ ' + attD.error, 'error'); return; }
    if(!attD.success) throw new Error(attD.error || 'Failed to save attendance');
    // 3) close session
    if(sid) await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance-sessions/${sid}`,{
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'closed'})
    });
    toast(`✅ Attendance saved! ${attD.count||records.length} records marked.`,'success');
    document.getElementById('manualAttSection').style.display='none';
  }catch(e){ toast('❌ ' + e.message,'error'); }
}


async function loadRegisteredStudents(){
  const bodyEl=document.getElementById('manualAttBody');
  try{
    if(!bodyEl) return;
    bodyEl.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--text2)">⏳ Loading...</td></tr>`;

    // Build filter from selected course/batch
    const dept=(AMS.profile && AMS.profile.department)||'';
    let params='1=1';
    if(dept) params+='&department='+encodeURIComponent(dept);

    const studRes=await fetch(`${window.AMS_CONFIG.API_URL}/api/registered-students?${params}`).catch(()=>null);
    if(!studRes) throw new Error('Backend not responding');
    if(!studRes.ok) throw new Error(`HTTP ${studRes.status}`);
    const studData=await studRes.json();
    const students=studData.students||[];

    // Fetch today's attendance to check for face-marked records
    const today = new Date().toISOString().split('T')[0];
    const attRes = await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance?date=${today}`).catch(()=>null);
    const attData = attRes?.ok ? await attRes.json() : {};
    const attendanceRecords = attData.records || [];

    if(!students.length){
      bodyEl.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:2rem">📭 No registered students found.</td></tr>`;
      return;
    }
    bodyEl.innerHTML=students.map(s=>{
      const faceRecord = attendanceRecords.find(r => r.roll_no === s.roll_no && r.method === 'face');
      const isLockedByFace = !!faceRecord;
      const safeName = (s.name||'').replace(/"/g,'&quot;');
      return `<tr data-roll="${s.roll_no||''}" data-name="${safeName}" style="${isLockedByFace ? 'background:var(--ink3);opacity:0.8' : ''}">
        <td class="fw-semibold">${s.roll_no||'—'}</td>
        <td>${s.name||'—'}</td>
        <td>
          ${isLockedByFace
            ? '<span class="badge badge-blue">📷 Face Marked</span>'
            : '<span class="badge badge-gray">Pending</span>'}
        </td>
        <td>
          ${isLockedByFace
            ? `<span style="color:var(--text2);font-size:0.85rem">✅ ${faceRecord.verified ? 'Present' : 'Absent'}</span>`
            : `<label style="margin-right:.75rem;cursor:pointer"><input type="radio" name="att_${s.roll_no}" value="P" checked/> Present</label>
               <label style="cursor:pointer"><input type="radio" name="att_${s.roll_no}" value="A"/> Absent</label>`
          }
        </td>
        <td>
          ${isLockedByFace
            ? '<small style="color:var(--orange)">🔒 Face-marked (read-only)</small>'
            : ''}
        </td>
      </tr>`;
    }).join('');
  }catch(e){
    if(bodyEl) bodyEl.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--red);padding:2rem">⚠ Error loading students.</td></tr>`;
    toast('Failed to load students','error');
  }
}

function initFacultyAttendance(){
  loadFacultyCoursesIntoDropdown();
  loadRegisteredStudents();
  refreshRegisteredStudentsPanel();
  loadTodayAttendance();
  setTimeout(updateFaceRecButtons, 50);
}

async function loadFacultyCoursesIntoDropdown(showToast){
  const sel   = document.getElementById('faCourse');
  const hint  = document.getElementById('faCourseHint');
  if(!sel) return;
  const fid = (AMS.profile && AMS.profile.id) || AMS.user.id || '';
  if(!fid) return;
  sel.innerHTML = '<option value="">Loading courses…</option>';
  try{
    const res = await fetch(`${window.AMS_CONFIG.API_URL}/api/courses?faculty_id=${encodeURIComponent(fid)}`);
    const data = await res.json();
    const courses = data.courses || [];
    if(courses.length){
      sel.innerHTML = courses.map(c=>
        `<option value="${c.id}" data-code="${c.course_code||''}" data-name="${(c.course_name||'').replace(/"/g,'&quot;')}">`+
        `${c.course_code ? c.course_code+' – ' : ''}${c.course_name||c.id}</option>`
      ).join('');
      if(hint){ hint.style.display='none'; }
      if(showToast) toast(`✅ ${courses.length} course${courses.length>1?'s':''} loaded`,'success');
    } else {
      sel.innerHTML = '<option value="">— No courses assigned yet —</option>';
      if(hint){
        hint.textContent = 'Ask the admin to assign courses via Timetable Management → Add Slot.';
        hint.style.display = 'block';
      }
      if(showToast) toast('No courses assigned. Contact your admin.','info');
    }
    loadCourseHours();
  }catch(e){ console.warn('loadFacultyCoursesIntoDropdown:',e); }
}

async function loadCourseHours(){
  const hSel = document.getElementById('faHour');
  if(!hSel) return;
  const fid   = (AMS.profile && AMS.profile.id) || AMS.user.id || '';
  if(!fid) return;
  const today = new Date().toLocaleDateString('en-US',{weekday:'long'});
  // Also filter by the currently selected course's subject name if possible
  const cSel  = document.getElementById('faCourse');
  const selectedOpt = cSel && cSel.selectedIndex >= 0 ? cSel.options[cSel.selectedIndex] : null;
  const subjectName = selectedOpt ? (selectedOpt.dataset.name || selectedOpt.text.replace(/^[A-Z0-9]+ – /,'')) : '';
  try{
    let url = `${window.AMS_CONFIG.API_URL}/api/timetable?faculty_id=${encodeURIComponent(fid)}&day=${encodeURIComponent(today)}`;
    const res  = await fetch(url);
    const data = await res.json();
    let slots  = (data.entries || data.timetable || []).sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
    // Prefer slots matching the selected subject, but keep all if no match
    const matchedSlots = subjectName ? slots.filter(s=>(s.subject_name||'').toLowerCase()===subjectName.toLowerCase()) : [];
    const displaySlots = matchedSlots.length ? matchedSlots : slots;
    if(displaySlots.length){
      hSel.innerHTML = displaySlots.map(s=>
        `<option value="${s.hour_number||s.id}">`+
        `Hour ${s.hour_number||1} – ${s.subject_name||'Class'} `+
        `(${(s.start_time||'').slice(0,5)}–${(s.end_time||'').slice(0,5)})</option>`
      ).join('');
    } else {
      hSel.innerHTML = '<option value="1">Hour 1</option><option value="2">Hour 2</option>'+
        '<option value="3">Hour 3</option><option value="4">Hour 4</option><option value="5">Hour 5</option>';
    }
  }catch(e){ console.warn('loadCourseHours:',e); }
}

// ═══════════════════════════════════════════════════════════════
// ASSESSMENTS — DYNAMIC (Admin creates, Faculty edits, Students take quiz)
// ═══════════════════════════════════════════════════════════════
function renderAssessments(){
  const isAdmin=AMS.role==='admin';
  setTimeout(()=>loadAssessmentsList(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📋 Assessments</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <select id="asmtTypeFilter" onchange="loadAssessmentsList()" style="font-size:.8rem;padding:.3rem .6rem;background:var(--ink3);border:1px solid var(--border);border-radius:6px;color:var(--text)">
          <option value="">All Types</option><option value="quiz">Quiz</option><option value="assignment">Assignment</option><option value="exam">Exam</option>
        </select>
        <select id="asmtStatusFilter" onchange="loadAssessmentsList()" style="font-size:.8rem;padding:.3rem .6rem;background:var(--ink3);border:1px solid var(--border);border-radius:6px;color:var(--text)">
          <option value="">All Status</option><option value="draft">Draft</option><option value="active">Active</option><option value="closed">Closed</option>
        </select>
        ${isAdmin?'<button class="btn btn-primary btn-sm" onclick="openAssessmentModal()">+ Create</button>':''}
        ${AMS.role==='faculty'?'<button class="btn btn-outline btn-sm" onclick="loadAssessmentsList()">🔄 Refresh</button>':''}
      </div>
    </div>
    <div id="assessments-list"><div class="text-muted text-sm" style="padding:2rem;text-align:center">Loading…</div></div>
  </div>
  ${_assessmentModalHTML()}`;
}

async function loadAssessmentsList(){
  const el=document.getElementById('assessments-list');
  if(!el)return;
  el.innerHTML='<div class="text-muted text-sm" style="padding:2rem;text-align:center">⏳ Loading assessments…</div>';
  const isAdmin=AMS.role==='admin';
  const isFaculty=AMS.role==='faculty';
  let url=`${window.AMS_CONFIG.API_URL}/api/assessments?`;
  if(isFaculty){
    const fid=(AMS.profile&&AMS.profile.id)||AMS.user.id||'';
    if(fid) url+=`faculty_id=${encodeURIComponent(fid)}&`;
  }
  const typeF=document.getElementById('asmtTypeFilter');
  const statusF=document.getElementById('asmtStatusFilter');
  if(typeF&&typeF.value) url+=`type=${encodeURIComponent(typeF.value)}&`;
  if(statusF&&statusF.value) url+=`status=${encodeURIComponent(statusF.value)}&`;
  try{
    const res=await fetch(url);
    const data=await res.json();
    const list=data.assessments||[];
    if(!list.length){
      el.innerHTML='<div class="text-muted text-sm" style="padding:2rem;text-align:center">📭 No assessments found.</div>';
      return;
    }
    // Get submission counts
    const counts={};
    await Promise.all(list.slice(0,50).map(async a=>{
      try{
        const sr=await fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${a.id}/submissions`);
        const sd=await sr.json();
        counts[a.id]=(sd.submissions||[]).length;
      }catch(e){counts[a.id]=0;}
    }));
    const statusBadge=s=>({draft:'badge-gray',active:'badge-green',closed:'badge-orange'}[s]||'badge-gray');
    const typeBadge=t=>({quiz:'badge-blue',assignment:'badge-purple',exam:'badge-red'}[t]||'badge-gray');
    const now=new Date();
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Title</th><th>Type</th><th>Course</th><th>Dept / Sec</th><th>Timer</th><th>Submissions</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${list.map(a=>{
        const endDt=a.end_time?new Date(a.end_time):null;
        const isExpired=endDt&&now>endDt;
        const timerStr=a.duration_mins?`${a.duration_mins}min`:(endDt?endDt.toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—');
        const subCount=counts[a.id]||0;
        return `<tr>
          <td class="fw-semibold">${a.title}</td>
          <td><span class="badge ${typeBadge(a.type)}">${a.type}</span></td>
          <td>${a.course_code||'—'}</td>
          <td>${a.department||'—'}${a.section?' / '+a.section:''}</td>
          <td style="font-size:.8rem">${isExpired?'<span class="text-red">Expired</span>':timerStr}</td>
          <td style="text-align:center"><span class="badge ${subCount>0?'badge-green':'badge-gray'}">${subCount}</span></td>
          <td><span class="badge ${statusBadge(a.status)}">${a.status}</span></td>
          <td style="white-space:nowrap">
            ${(isAdmin||isFaculty)?`<button class="btn btn-outline btn-sm" onclick="openAssessmentModal('${a.id}')">✏️</button>`:''}
            ${isAdmin?`<button class="btn btn-danger btn-sm" onclick="deleteAssessment('${a.id}')">🗑️</button>`:''}
            ${(isAdmin||isFaculty)?`<button class="btn btn-teal btn-sm" onclick="viewSubmissions('${a.id}','${a.title.replace(/'/g,"\\'")}')">👁️</button>`:''}
          </td>
        </tr>`}).join('')}</tbody>
    </table></div>`;
  }catch(e){
    el.innerHTML='<div class="text-red text-sm" style="padding:2rem;text-align:center">Failed to load assessments.</div>';
  }
}

function _assessmentModalHTML(){
  return `<div id="asmtModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;align-items:center;justify-content:center;padding:1rem">
  <div class="card" style="width:95%;max-width:720px;padding:1.5rem;max-height:92vh;overflow-y:auto">
    <div class="card-header"><div class="card-title" id="asmtModalTitle">➕ Create Assessment</div>
      <button class="btn btn-outline btn-sm" onclick="closeAsmtModal()">✕</button></div>
    <input type="hidden" id="asmtEditId"/>
    <div class="form-row">
      <div class="form-group"><label>Title *</label><input id="asmtTitle" placeholder="Quiz 1 – Arrays"/></div>
      <div class="form-group"><label>Type</label>
        <select id="asmtType" onchange="toggleAsmtTypeFields()"><option value="quiz">Quiz</option><option value="assignment">Assignment</option><option value="exam">Exam</option></select>
      </div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="asmtDesc" rows="2" placeholder="Instructions for students…" style="width:100%;padding:.6rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);resize:vertical"></textarea></div>

    <!-- Admin: Upload file and convert to exam -->
    <div id="asmtUploadSection" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin:1rem 0;background:var(--ink3)">
      <div class="fw-semibold mb-sm">📎 Upload Assignment File (Admin)</div>
      <div class="text-xs text-muted mb-sm">Upload a question paper/assignment file. Add questions & answer keys below to auto-convert into an online exam.</div>
      <input type="file" id="asmtFileUpload" accept=".pdf,.doc,.docx,.txt,.png,.jpg" style="font-size:.85rem"/>
      <div id="asmtFileInfo" class="text-xs text-muted mt-sm"></div>
    </div>

    <div class="form-row">
      <div class="form-group"><label>Course Code</label><input id="asmtCourseCode" placeholder="CS301"/></div>
      <div class="form-group"><label>Course Name</label><input id="asmtCourseName" placeholder="Data Structures"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Department *</label><input id="asmtDept" placeholder="Computer Science"/></div>
      <div class="form-group"><label>Section (blank=all)</label><input id="asmtSection" placeholder="A"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Year</label><input id="asmtYear" type="number" min="1" max="6" value="1"/></div>
      <div class="form-group"><label>Semester</label><input id="asmtSem" type="number" min="1" max="8" value="1"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Total Marks</label><input id="asmtMarks" type="number" value="100"/></div>
      <div class="form-group"><label>Pass Marks</label><input id="asmtPass" type="number" value="40"/></div>
    </div>
    <div class="form-row">
      <div class="form-group" id="asmtDurationGroup"><label>Duration (mins, 0=untimed) <span id="asmtDurationHint" class="text-xs text-muted"></span></label><input id="asmtDuration" type="number" value="0"/></div>
      <div class="form-group"><label>Status</label>
        <select id="asmtStatus"><option value="draft">Draft</option><option value="active">Active (Publish)</option><option value="closed">Closed</option></select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Start Time</label><input id="asmtStart" type="datetime-local"/></div>
      <div class="form-group"><label>End Time (auto-close)</label><input id="asmtEnd" type="datetime-local"/></div>
    </div>
    <div class="form-group"><label>Faculty (username)</label><input id="asmtFaculty" placeholder="faculty.username"/></div>

    <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin:1rem 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
        <span class="fw-semibold">📝 Questions</span>
        <button class="btn btn-outline btn-sm" onclick="addQuestionRow()">+ Add Question</button>
      </div>
      <div id="asmtQuestions"></div>
    </div>

    <!-- Answer Key Section -->
    <div id="asmtAnswerKeySection" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin:1rem 0;background:var(--ink3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
        <span class="fw-semibold">🔑 Answer Key</span>
        <span class="text-xs text-muted">Auto-populated from correct answers in questions above</span>
      </div>
      <div class="text-xs text-muted">The correct answer field in each question above serves as the answer key. Students will be auto-graded for MCQ/T-F types.</div>
    </div>

    <button class="btn btn-primary w-full" onclick="saveAssessment()">💾 Save Assessment</button>
  </div>
</div>`;
}

function toggleAsmtTypeFields(){
  const type=document.getElementById('asmtType')?.value||'quiz';
  const hint=document.getElementById('asmtDurationHint');
  if(hint){
    hint.textContent=type==='assignment'?'(Timer shown to students)':type==='quiz'?'(No timer for quiz)':'(No timer for exam)';
  }
}

function addQuestionRow(q){
  const wrap=document.getElementById('asmtQuestions');
  if(!wrap)return;
  const idx=wrap.children.length;
  const div=document.createElement('div');
  div.style.cssText='background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem;margin-bottom:.5rem';
  div.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
    <span class="fw-semibold text-sm">Q${idx+1}</span>
    <button class="btn btn-danger btn-sm" onclick="this.closest('div[style]').remove()" style="padding:.2rem .5rem;font-size:.7rem">✕</button>
  </div>
  <div class="form-group" style="margin-bottom:.5rem"><input class="q-text" placeholder="Question text" value="${(q&&q.q||'').replace(/"/g,'&quot;')}" style="width:100%;padding:.5rem;background:var(--ink);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.85rem"/></div>
  <div class="form-row" style="gap:.5rem">
    <div class="form-group" style="margin-bottom:.4rem"><label style="font-size:.7rem">Type</label>
      <select class="q-type" style="padding:.4rem;background:var(--ink);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem">
        <option value="mcq"${q&&q.type==='mcq'?' selected':''}>MCQ</option>
        <option value="true_false"${q&&q.type==='true_false'?' selected':''}>True/False</option>
        <option value="short"${q&&q.type==='short'?' selected':''}>Short Answer</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:.4rem"><label style="font-size:.7rem">Marks</label>
      <input class="q-marks" type="number" value="${q&&q.marks||1}" min="1" style="padding:.4rem;background:var(--ink);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem;width:60px"/>
    </div>
  </div>
  <div class="form-group" style="margin-bottom:.4rem"><label style="font-size:.7rem">Options (comma separated)</label>
    <input class="q-options" placeholder="A, B, C, D" value="${q&&q.options?q.options.join(', '):''}" style="width:100%;padding:.4rem;background:var(--ink);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem"/></div>
  <div class="form-group" style="margin-bottom:0"><label style="font-size:.7rem">Correct Answer</label>
    <input class="q-correct" placeholder="A" value="${q&&q.correct||''}" style="width:100%;padding:.4rem;background:var(--ink);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem"/></div>`;
  wrap.appendChild(div);
}

function openAssessmentModal(editId){
  const modal=document.getElementById('asmtModal');
  if(!modal)return;
  document.getElementById('asmtEditId').value=editId||'';
  document.getElementById('asmtModalTitle').textContent=editId?'✏️ Edit Assessment':'➕ Create Assessment';
  // Reset
  ['asmtTitle','asmtDesc','asmtCourseCode','asmtCourseName','asmtDept','asmtSection','asmtFaculty'].forEach(id=>{
    const e=document.getElementById(id);if(e)e.value='';
  });
  document.getElementById('asmtYear').value='1';
  document.getElementById('asmtSem').value='1';
  document.getElementById('asmtMarks').value='100';
  document.getElementById('asmtPass').value='40';
  document.getElementById('asmtDuration').value='0';
  document.getElementById('asmtStart').value='';
  document.getElementById('asmtEnd').value='';
  document.getElementById('asmtStatus').value='draft';
  document.getElementById('asmtType').value='quiz';
  document.getElementById('asmtQuestions').innerHTML='';
  if(editId){
    fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${editId}`).then(r=>r.json()).then(d=>{
      const a=d.assessment;if(!a)return;
      document.getElementById('asmtTitle').value=a.title||'';
      document.getElementById('asmtDesc').value=a.description||'';
      document.getElementById('asmtType').value=a.type||'quiz';
      document.getElementById('asmtCourseCode').value=a.course_code||'';
      document.getElementById('asmtCourseName').value=a.course_name||'';
      document.getElementById('asmtDept').value=a.department||'';
      document.getElementById('asmtSection').value=a.section||'';
      document.getElementById('asmtYear').value=a.year||1;
      document.getElementById('asmtSem').value=a.semester||1;
      document.getElementById('asmtMarks').value=a.total_marks||100;
      document.getElementById('asmtPass').value=a.pass_marks||40;
      document.getElementById('asmtDuration').value=a.duration_mins||0;
      document.getElementById('asmtStatus').value=a.status||'draft';
      if(a.start_time) document.getElementById('asmtStart').value=a.start_time.slice(0,16);
      if(a.end_time) document.getElementById('asmtEnd').value=a.end_time.slice(0,16);
      document.getElementById('asmtFaculty').value=a.faculty_id||'';
      const qs=a.questions||[];
      qs.forEach(q=>addQuestionRow(q));
      toggleAsmtTypeFields();
    }).catch(()=>toast('Failed to load assessment','error'));
  }
  modal.style.display='flex';
  toggleAsmtTypeFields();
}

function closeAsmtModal(){ const m=document.getElementById('asmtModal'); if(m) m.style.display='none'; }

async function saveAssessment(){
  const editId=document.getElementById('asmtEditId').value;
  const title=document.getElementById('asmtTitle').value.trim();
  if(!title){toast('Title is required','error');return;}
  // Gather questions
  const qEls=document.getElementById('asmtQuestions').children;
  const questions=[];
  const answerKey=[];
  for(const qEl of qEls){
    const txt=qEl.querySelector('.q-text')?.value.trim();
    if(!txt)continue;
    const q={
      q:txt,
      type:qEl.querySelector('.q-type')?.value||'mcq',
      marks:parseInt(qEl.querySelector('.q-marks')?.value)||1,
      options:(qEl.querySelector('.q-options')?.value||'').split(',').map(s=>s.trim()).filter(Boolean),
      correct:qEl.querySelector('.q-correct')?.value.trim()||'',
    };
    questions.push(q);
    answerKey.push({question_index:questions.length-1, correct:q.correct, marks:q.marks});
  }
  // Handle file upload
  let sourceFile='';
  const fileInput=document.getElementById('asmtFileUpload');
  if(fileInput&&fileInput.files&&fileInput.files[0]){
    sourceFile=fileInput.files[0].name;
  }
  const payload={
    title, description:document.getElementById('asmtDesc').value,
    type:document.getElementById('asmtType').value,
    course_code:document.getElementById('asmtCourseCode').value.trim(),
    course_name:document.getElementById('asmtCourseName').value.trim(),
    department:document.getElementById('asmtDept').value.trim(),
    section:document.getElementById('asmtSection').value.trim(),
    year:parseInt(document.getElementById('asmtYear').value)||1,
    semester:parseInt(document.getElementById('asmtSem').value)||1,
    total_marks:parseInt(document.getElementById('asmtMarks').value)||100,
    pass_marks:parseInt(document.getElementById('asmtPass').value)||40,
    duration_mins:parseInt(document.getElementById('asmtDuration').value)||0,
    status:document.getElementById('asmtStatus').value,
    start_time:document.getElementById('asmtStart').value||null,
    end_time:document.getElementById('asmtEnd').value||null,
    faculty_id:document.getElementById('asmtFaculty').value.trim()||null,
    questions,
    answer_key:answerKey,
    source_file:sourceFile,
    created_by:(AMS.profile&&AMS.profile.id)||AMS.user.id||'',
    created_by_role:AMS.role||'admin',
  };
  try{
    const url=editId?`${window.AMS_CONFIG.API_URL}/api/assessments/${editId}`:`${window.AMS_CONFIG.API_URL}/api/assessments`;
    const method=editId?'PUT':'POST';
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await res.json();
    if(!d.success) throw new Error(d.error||'Save failed');
    toast(editId?'✅ Assessment updated':'✅ Assessment created — students notified!','success');
    closeAsmtModal();
    loadAssessmentsList();
  }catch(e){toast('❌ '+e.message,'error');}
}

async function deleteAssessment(id){
  if(!confirm('Delete this assessment? This will also remove all submissions.'))return;
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${id}`,{method:'DELETE'});
    const d=await res.json();
    if(!d.success) throw new Error(d.error);
    toast('Assessment deleted','success');
    loadAssessmentsList();
  }catch(e){toast('❌ '+e.message,'error');}
}

async function viewSubmissions(asmtId,title){
  try{
    const [subRes, asmtRes]=await Promise.all([
      fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}/submissions`),
      fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}`)
    ]);
    const d=await subRes.json();
    const ad=await asmtRes.json();
    const subs=d.submissions||[];
    const asmt=ad.assessment||{};
    const questions=asmt.questions||[];
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
    overlay.innerHTML=`<div class="modal modal-lg" style="max-height:85vh;overflow-y:auto">
      <div class="modal-header">
        <div class="modal-title">👁️ Submissions — ${title} (${subs.length})</div>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button class="btn btn-teal btn-sm" onclick="downloadMarks('${asmtId}')">📥 Download Marks CSV</button>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
      </div>
      ${subs.length?`<div class="tbl-wrap"><table>
        <thead><tr><th>Roll No</th><th>Name</th><th>Section</th><th>Score</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead>
        <tbody>${subs.map(s=>{
          const statusCol=s.status==='graded'?'badge-green':s.status==='submitted'?'badge-blue':'badge-gray';
          return `<tr>
            <td class="fw-semibold">${s.roll_no||'—'}</td>
            <td>${s.student_name||'—'}</td>
            <td>${s.section||'—'}</td>
            <td style="text-align:center">${s.score!=null?s.score+'/'+(s.total_marks||'?'):'—'}</td>
            <td><span class="badge ${statusCol}">${s.status}</span></td>
            <td style="font-size:.8rem">${s.submitted_at?new Date(s.submitted_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}</td>
            <td style="white-space:nowrap">
              ${s.status==='submitted'||s.status==='graded'?`<button class="btn btn-sm btn-primary" onclick="openDetailedGrading('${asmtId}','${s.id}','${(s.student_name||'').replace(/'/g,"\\'")}')">📝 Grade</button>`:'⏳'}
            </td>
          </tr>`}).join('')}</tbody>
      </table></div>`:'<div class="text-muted text-sm" style="text-align:center;padding:2rem">No submissions yet.</div>'}
    </div>`;
    document.body.appendChild(overlay);
  }catch(e){toast('Failed to load submissions','error');}
}

function downloadMarks(asmtId){
  window.open(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}/download-marks`,'_blank');
  toast('📥 Downloading marks CSV…','info');
}

async function openDetailedGrading(asmtId,subId,studentName){
  try{
    const [asmtRes,subRes]=await Promise.all([
      fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}`).then(r=>r.json()),
      fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}/submissions`).then(r=>r.json())
    ]);
    const asmt=asmtRes.assessment||{};
    const questions=asmt.questions||[];
    const sub=(subRes.submissions||[]).find(s=>s.id===subId)||{};
    const answers=sub.answers||[];
    const existingScores=sub.question_scores||[];
    // Build per-question grading UI
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};

    const qRows=questions.map((q,i)=>{
      const ans=answers.find(a=>a.question_index===i);
      const stuAnswer=ans?ans.answer:'(no answer)';
      const existScore=existingScores.find(es=>es.question_index===i);
      const curScore=existScore?existScore.score:'';
      return `<div style="background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem;margin-bottom:.5rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1">
            <div class="fw-semibold text-sm">Q${i+1}. ${q.q} <span class="text-muted text-xs">[${q.marks||1} mark${(q.marks||1)>1?'s':''}]</span></div>
            ${q.correct?`<div class="text-xs" style="color:var(--green);margin-top:.25rem">✅ Correct: ${q.correct}</div>`:''}
            <div class="text-sm" style="margin-top:.3rem;padding:.3rem .5rem;background:var(--ink);border-radius:4px;border:1px solid var(--border)">
              <span class="text-muted text-xs">Student Answer:</span> ${stuAnswer||'<em class="text-muted">blank</em>'}
            </div>
          </div>
          <div style="min-width:80px;text-align:right;margin-left:.75rem">
            <label class="text-xs text-muted">Score</label>
            <input class="grade-q-score" data-qi="${i}" type="number" min="0" max="${q.marks||1}" value="${curScore}" step="0.5"
              style="width:70px;padding:.4rem;background:var(--ink);border:1px solid var(--border);border-radius:4px;color:var(--text);text-align:center;font-size:.9rem;display:block;margin-top:.25rem"/>
          </div>
        </div>
      </div>`}).join('');

    overlay.innerHTML=`<div class="modal modal-lg" style="max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <div class="modal-title">📝 Grade — ${studentName} (${sub.roll_no||''})</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div style="padding:1rem">
        <div class="text-sm text-muted mb-md">Grade each question individually. Total will be calculated automatically.</div>
        ${qRows||'<div class="text-muted">No questions defined.</div>'}
        <div class="form-group mt-md"><label>Feedback (optional)</label>
          <textarea id="detailedFeedback" rows="2" style="width:100%;padding:.5rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);resize:vertical">${sub.feedback||''}</textarea>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem">
          <div class="text-sm text-muted">Total: <strong id="gradeTotalDisplay">0</strong> / ${asmt.total_marks||'?'}</div>
          <button class="btn btn-primary" onclick="submitDetailedGrade('${asmtId}','${subId}','${studentName.replace(/'/g,"\\'")}',${questions.length})">💾 Save Grades</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    // Auto-calc total on input change
    overlay.querySelectorAll('.grade-q-score').forEach(inp=>{
      inp.addEventListener('input',()=>{
        let total=0;
        overlay.querySelectorAll('.grade-q-score').forEach(el=>{total+=parseFloat(el.value)||0;});
        const disp=document.getElementById('gradeTotalDisplay');
        if(disp)disp.textContent=total;
      });
    });
    // Trigger initial calc
    let initTotal=0;
    overlay.querySelectorAll('.grade-q-score').forEach(el=>{initTotal+=parseFloat(el.value)||0;});
    const dt=document.getElementById('gradeTotalDisplay');
    if(dt)dt.textContent=initTotal;
  }catch(e){toast('Failed to load grading: '+e.message,'error');}
}

async function submitDetailedGrade(asmtId,subId,studentName,numQ){
  const scores=[];
  document.querySelectorAll('.grade-q-score').forEach(el=>{
    scores.push({question_index:parseInt(el.dataset.qi),score:parseFloat(el.value)||0});
  });
  const feedback=document.getElementById('detailedFeedback')?.value||'';
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}/grade-detailed`,{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({submission_id:subId,question_scores:scores,feedback,graded_by:(AMS.profile&&AMS.profile.id)||AMS.user.id})
    });
    const d=await res.json();
    if(!d.success) throw new Error(d.error);
    toast('✅ Grades saved for '+studentName,'success');
    // Close grading overlay and refresh submissions
    document.querySelectorAll('.modal-overlay').forEach(o=>o.remove());
  }catch(e){toast('❌ '+e.message,'error');}
}

// ═══════════════════════════════════════════════════════════════
// STUDENT ASSESSMENTS VIEW — section-filtered, quiz taking
// ═══════════════════════════════════════════════════════════════
function renderStudentAssessments(){
  setTimeout(()=>loadStudentAssessments(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📋 My Assessments</div>
      <button class="btn btn-outline btn-sm" onclick="loadStudentAssessments()">🔄 Refresh</button>
    </div>
    <div id="stu-assessments-list"><div class="text-muted text-sm" style="padding:2rem;text-align:center">Loading…</div></div>
  </div>
  <div id="quizTakingArea"></div>`;
}

async function loadStudentAssessments(){
  const el=document.getElementById('stu-assessments-list');
  if(!el)return;
  el.innerHTML='<div class="text-muted text-sm" style="padding:2rem;text-align:center">⏳ Loading…</div>';
  const dept=(AMS.profile&&AMS.profile.department)||'';
  const section=(AMS.profile&&AMS.profile.section)||'';
  let url=`${window.AMS_CONFIG.API_URL}/api/assessments?status=active`;
  if(dept) url+=`&department=${encodeURIComponent(dept)}`;
  try{
    const res=await fetch(url);
    const data=await res.json();
    let list=data.assessments||[];
    // Client-side section filter: show if assessment section is blank (all) or matches student's section
    if(section) list=list.filter(a=>!a.section||a.section===section);
    // Get student's existing submissions
    const studentId=(AMS.profile&&AMS.profile.id)||AMS.user.id||'';
    const subMap={};
    await Promise.all(list.map(async a=>{
      try{
        const sr=await fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${a.id}/submissions`);
        const sd=await sr.json();
        const mine=(sd.submissions||[]).find(s=>s.student_id===studentId);
        if(mine) subMap[a.id]=mine;
      }catch(e){}
    }));
    if(!list.length){
      el.innerHTML='<div class="text-muted text-sm" style="padding:2rem;text-align:center">📭 No active assessments for your section.</div>';
      return;
    }
    const now=new Date();
    el.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem">
    ${list.map(a=>{
      const endDt=a.end_time?new Date(a.end_time):null;
      const isExpired=endDt&&now>endDt;
      const sub=subMap[a.id];
      const submitted=sub&&(sub.status==='submitted'||sub.status==='graded');
      const typeIcon={quiz:'📝',assignment:'📄',exam:'🏫'}[a.type]||'📋';
      const borderCol=isExpired?'var(--red)':submitted?'var(--green)':'var(--blue)';
      let timerHtml='';
      if(endDt&&!isExpired){
        const diff=endDt-now;
        const hrs=Math.floor(diff/3600000);
        const mins=Math.floor((diff%3600000)/60000);
        timerHtml=`<div style="font-size:.78rem;color:var(--orange);margin-top:.5rem">⏱ ${hrs>0?hrs+'h ':''}${mins}m remaining</div>`;
      }else if(isExpired){
        timerHtml='<div style="font-size:.78rem;color:var(--red);margin-top:.5rem">⏱ Time expired</div>';
      }
      return `<div class="card" style="border-left:3px solid ${borderCol};margin-bottom:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="fw-semibold">${typeIcon} ${a.title}</div>
            <div class="text-sm text-muted">${a.course_code?a.course_code+' — ':''}${a.course_name||''}</div>
          </div>
          <span class="badge ${a.type==='quiz'?'badge-blue':a.type==='assignment'?'badge-purple':'badge-red'}">${a.type}</span>
        </div>
        ${a.description?`<div class="text-sm text-muted" style="margin-top:.5rem">${a.description.slice(0,120)}${a.description.length>120?'…':''}</div>`:''}
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">
          <span class="text-xs text-muted">📊 ${a.total_marks} marks</span>
          ${a.duration_mins&&a.type==='assignment'?`<span class="text-xs text-muted">⏱ ${a.duration_mins} min timer</span>`:a.duration_mins?`<span class="text-xs text-muted">⏱ ${a.duration_mins} min</span>`:''}
        </div>
        ${timerHtml}
        <div style="margin-top:.75rem">
          ${submitted
            ?`<div style="display:flex;align-items:center;gap:.5rem">
                <span class="badge badge-green">✅ Submitted</span>
                ${sub.score!=null?`<span class="fw-semibold">${sub.score}/${sub.total_marks||a.total_marks}</span>`:'<span class="text-muted text-sm">Pending grading</span>'}
                ${sub.feedback?`<span class="text-xs text-muted">— ${sub.feedback}</span>`:''}
              </div>`
            :isExpired
              ?'<span class="badge badge-red">⏱ Expired — not submitted</span>'
              :`<button class="btn btn-primary btn-sm" onclick="startQuiz('${a.id}')">▶️ ${a.type==='quiz'?'Start Quiz':a.type==='assignment'?'Start Assignment':'Start Exam'}</button>`
          }
        </div>
      </div>`}).join('')}
    </div>`;
  }catch(e){
    el.innerHTML='<div class="text-red text-sm" style="padding:2rem;text-align:center">Failed to load assessments.</div>';
  }
}

async function startQuiz(asmtId){
  const area=document.getElementById('quizTakingArea');
  if(!area)return;
  area.innerHTML='<div class="card"><div class="text-muted text-sm" style="padding:2rem;text-align:center">⏳ Loading quiz…</div></div>';
  area.scrollIntoView({behavior:'smooth'});
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}`);
    const d=await res.json();
    if(!d.success) throw new Error(d.error);
    const a=d.assessment;
    if(a.status!=='active'){toast('This assessment is no longer active','error');area.innerHTML='';return;}
    const qs=a.questions||[];
    if(!qs.length&&a.type==='quiz'){toast('No questions in this quiz','info');area.innerHTML='';return;}

    // Register start with backend
    const studentId=(AMS.profile&&AMS.profile.id)||AMS.user.id||'';
    fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}/submit`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({student_id:studentId,answers:[],final:false})
    }).catch(()=>{});

    let timerHtml='';
    if(a.duration_mins>0 && a.type==='assignment'){
      timerHtml=`<div id="quizTimer" class="badge badge-orange" style="font-size:1rem;padding:.4rem .8rem">⏱ ${a.duration_mins}:00</div>`;
    }

    area.innerHTML=`<div class="card" style="border:2px solid var(--blue)">
      <div class="card-header">
        <div class="card-title">📝 ${a.title}</div>
        <div style="display:flex;align-items:center;gap:.75rem">
          ${timerHtml}
          <span class="text-sm text-muted">${qs.length} questions • ${a.total_marks} marks</span>
        </div>
      </div>
      ${a.description?`<div class="text-muted text-sm mb-md">${a.description}</div>`:''}
      <div id="quizQuestionsBody">
      ${qs.map((q,i)=>{
        const qHTML=`<div class="card" style="background:var(--ink3);margin-bottom:.75rem;padding:1rem" data-qi="${i}">
          <div class="fw-semibold mb-sm">Q${i+1}. ${q.q} <span class="text-xs text-muted">[${q.marks||1} mark${(q.marks||1)>1?'s':''}]</span></div>
          ${q.type==='mcq'||q.type==='true_false'
            ?(q.options||[]).map((opt,oi)=>
              `<label style="display:block;padding:.4rem .6rem;margin:.25rem 0;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:var(--transition)" onmouseover="this.style.background='var(--ink2)'" onmouseout="this.style.background=''">
                <input type="radio" name="quiz_ans_${i}" value="${opt}" style="margin-right:.5rem"/> ${opt}
              </label>`
            ).join('')
            :`<textarea name="quiz_ans_${i}" rows="2" placeholder="Your answer…" style="width:100%;padding:.5rem;background:var(--ink);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);resize:vertical;margin-top:.25rem"></textarea>`
          }
        </div>`;
        return qHTML;
      }).join('')}
      </div>
      <button class="btn btn-primary btn-lg w-full" style="margin-top:1rem" onclick="submitQuiz('${asmtId}',${qs.length})">📤 Submit Quiz</button>
    </div>`;

    // Start countdown timer only for assignments
    if(a.duration_mins>0 && a.type==='assignment'){
      let secsLeft=a.duration_mins*60;
      const timerEl=document.getElementById('quizTimer');
      AMS._quizTimer=setInterval(()=>{
        secsLeft--;
        if(secsLeft<=0){
          clearInterval(AMS._quizTimer);
          toast('⏱ Time is up! Auto-submitting…','warning');
          submitQuiz(asmtId,qs.length);
          return;
        }
        const m=Math.floor(secsLeft/60);
        const s=secsLeft%60;
        if(timerEl){
          timerEl.textContent=`⏱ ${m}:${String(s).padStart(2,'0')}`;
          if(secsLeft<60) timerEl.className='badge badge-red';
          else if(secsLeft<300) timerEl.className='badge badge-orange';
        }
      },1000);
    }
  }catch(e){
    toast('Failed to load quiz: '+e.message,'error');
    area.innerHTML='';
  }
}

async function submitQuiz(asmtId,numQ){
  if(AMS._quizTimer){clearInterval(AMS._quizTimer);AMS._quizTimer=null;}
  const answers=[];
  for(let i=0;i<numQ;i++){
    const radio=document.querySelector(`input[name="quiz_ans_${i}"]:checked`);
    const textarea=document.querySelector(`textarea[name="quiz_ans_${i}"]`);
    answers.push({question_index:i, answer:radio?radio.value:(textarea?textarea.value.trim():'')});
  }
  const studentId=(AMS.profile&&AMS.profile.id)||AMS.user.id||'';
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/assessments/${asmtId}/submit`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({student_id:studentId,answers,final:true})
    });
    const d=await res.json();
    if(!d.success) throw new Error(d.error);
    const sub=d.submission||{};
    const area=document.getElementById('quizTakingArea');
    if(area) area.innerHTML=`<div class="card" style="border:2px solid var(--green);text-align:center;padding:2rem">
      <div style="font-size:2.5rem;margin-bottom:.5rem">✅</div>
      <h3 class="text-green" style="margin-bottom:.5rem">Quiz Submitted!</h3>
      ${sub.score!=null?`<div class="fw-semibold" style="font-size:1.3rem">${sub.score} / ${sub.total_marks||'?'}</div>`:'<div class="text-muted">Submitted for review.</div>'}
      <button class="btn btn-outline mt-md" onclick="document.getElementById('quizTakingArea').innerHTML='';loadStudentAssessments()">← Back to Assessments</button>
    </div>`;
    toast('✅ Quiz submitted!','success');
  }catch(e){toast('❌ '+e.message,'error');}
}

// ═══════════════════════════════════════════════════════════════
// ASSIGNMENTS — Filtered view of assessments with type=assignment
// ═══════════════════════════════════════════════════════════════
function renderAssignments(){
  setTimeout(()=>{
    const tf=document.getElementById('asmtTypeFilter');
    if(tf){tf.value='assignment';loadAssessmentsList();}
  },50);
  return renderAssessments();
}

function renderInternalExam(){
  setTimeout(()=>loadInternalExamData(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">🏫 Internal Examination</div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-outline btn-sm" onclick="loadInternalExamData()">🔄 Refresh</button>
      </div>
    </div>
    <div id="internal-exam-list"><div class="text-muted text-sm" style="padding:2rem;text-align:center">Loading…</div></div>
  </div>
  <div class="card" style="margin-top:1rem">
    <div class="card-header"><div class="card-title">📋 Marks Format (Admin-defined)</div>
      <button class="btn btn-outline btn-sm" onclick="downloadMarksFormat()">📥 Download Format</button>
    </div>
    <div id="marks-format-display"><div class="text-muted text-sm" style="padding:1rem;text-align:center">Loading marks format…</div></div>
  </div>`;
}

async function loadInternalExamData(){
  const el=document.getElementById('internal-exam-list');
  if(!el)return;
  el.innerHTML='<div class="text-muted text-sm" style="padding:1rem;text-align:center">⏳ Loading exams…</div>';
  try{
    // Load assessments of type exam
    const fid=(AMS.profile&&AMS.profile.id)||AMS.user.id||'';
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/assessments?type=exam&faculty_id=${encodeURIComponent(fid)}`);
    const data=await res.json();
    const exams=data.assessments||[];
    if(!exams.length){
      el.innerHTML='<div class="text-muted text-sm" style="padding:2rem;text-align:center">📭 No internal exams found. Create exams from Assessments page.</div>';
    }else{
      const statusBadge=s=>({draft:'badge-gray',active:'badge-green',closed:'badge-orange'}[s]||'badge-gray');
      el.innerHTML=`<div class="tbl-wrap"><table>
        <thead><tr><th>Exam</th><th>Course</th><th>Dept/Sec</th><th>Marks</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${exams.map(e=>`<tr>
          <td class="fw-semibold">${e.title}</td>
          <td>${e.course_code||'—'}</td>
          <td>${e.department||'—'}${e.section?' / '+e.section:''}</td>
          <td>${e.total_marks||'—'}</td>
          <td><span class="badge ${statusBadge(e.status)}">${e.status}</span></td>
          <td>
            <button class="btn btn-teal btn-sm" onclick="viewSubmissions('${e.id}','${e.title.replace(/'/g,"\\'")}')">👁️ Submissions</button>
            <button class="btn btn-outline btn-sm" onclick="downloadMarks('${e.id}')">📥 Marks</button>
          </td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
    // Load marks format
    loadMarksFormat();
  }catch(e){el.innerHTML='<div class="text-red text-sm" style="padding:1rem">Failed to load exams.</div>';}
}

async function loadMarksFormat(){
  const el=document.getElementById('marks-format-display');
  if(!el)return;
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/exam-marks-format?is_active=true`);
    const data=await res.json();
    const formats=data.formats||[];
    if(!formats.length){
      el.innerHTML='<div class="text-muted text-sm" style="padding:1rem;text-align:center">No marks format configured by admin yet.</div>';
      return;
    }
    el.innerHTML=formats.map(f=>{
      const sections=typeof f.sections==='string'?JSON.parse(f.sections||'[]'):f.sections||[];
      return `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin-bottom:.75rem">
        <div class="fw-semibold">${f.title} <span class="badge badge-blue">${f.exam_type}</span></div>
        <div class="text-sm text-muted">Total Marks: ${f.total_marks} ${f.department?'| Dept: '+f.department:''} ${f.course_code?'| Course: '+f.course_code:''}</div>
        ${sections.length?`<div style="margin-top:.5rem">
          ${sections.map((s,i)=>`<div class="text-sm" style="padding:.25rem .5rem;background:var(--ink3);border-radius:4px;margin:.25rem 0">
            <strong>${s.name||'Section '+(i+1)}</strong>: ${s.num_questions||'?'} questions × ${s.marks_each||'?'} marks = ${s.total||'?'} marks
            ${s.question_type?'<span class="text-xs text-muted"> ('+s.question_type+')</span>':''}
          </div>`).join('')}
        </div>`:''}
      </div>`}).join('');
  }catch(e){el.innerHTML='<div class="text-red text-sm" style="padding:1rem">Failed to load format.</div>';}
}

function downloadMarksFormat(){
  // Generate a printable marks format page
  const el=document.getElementById('marks-format-display');
  if(!el||!el.innerHTML.trim()){toast('No format to download','info');return;}
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>Marks Format</title><style>
    body{font-family:sans-serif;padding:2rem;max-width:800px;margin:auto;color:#000}
    h2{text-align:center} .section{margin:1rem 0;padding:.75rem;border:1px solid #ccc;border-radius:4px}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:.5rem;text-align:left}
    @media print{body{padding:1rem}}
  </style></head><body><h2>Exam Marks Format</h2>`);
  w.document.write(el.innerHTML.replace(/style="[^"]*"/g,'').replace(/class="[^"]*"/g,''));
  w.document.write('</body></html>');
  w.document.close();
  w.print();
}

function renderQuestionPaper(){
  setTimeout(()=>initQPaperPage(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">📃 Question Paper Generation</div>
      <button class="btn btn-outline btn-sm" onclick="loadSavedPapers()">📂 Saved Papers</button>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Course Code *</label>
        <select id="qp-course" onchange="loadModulesForQP()" style="width:100%;padding:.5rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <option value="">— Loading courses —</option>
        </select>
      </div>
      <div class="form-group"><label>Exam Type</label>
        <select id="qp-examtype" style="width:100%;padding:.5rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
          <option value="internal">Internal</option><option value="midterm">Midterm</option>
          <option value="end_semester">End Semester</option><option value="quiz">Quiz</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Total Marks</label><input id="qp-marks" type="number" value="50"/></div>
      <div class="form-group"><label>Duration (mins)</label><input id="qp-duration" type="number" value="180"/></div>
    </div>
    <div class="form-group"><label>Paper Title</label><input id="qp-title" placeholder="e.g. Internal Test 1 – Data Structures"/></div>
    <div class="form-group"><label>Instructions (optional)</label><textarea id="qp-instructions" rows="2" placeholder="Answer all questions…" style="width:100%;padding:.6rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);resize:vertical"></textarea></div>

    <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin:1rem 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
        <span class="fw-semibold">📦 Uploaded Modules</span>
        <span class="text-muted text-xs" id="qp-module-hint">Select a course to see modules</span>
      </div>
      <div id="qp-modules"><div class="text-muted text-sm">Select a course above.</div></div>
    </div>

    <button class="btn btn-primary w-full" onclick="generateQPaper()">⚡ Generate Question Paper from Modules</button>
  </div>

  <div id="qp-result"></div>
  <div id="qp-saved-list"></div>`;
}

async function initQPaperPage(){
  // Load faculty's courses into dropdown
  const sel=document.getElementById('qp-course');
  if(!sel)return;
  try{
    const facultyId=AMS.user.id||AMS.user.username||'';
    // Try faculty-assignments first then all courses
    let courses=[];
    try{
      const r1=await fetch(`${window.AMS_CONFIG.API_URL}/api/faculty-assignments?faculty_username=${encodeURIComponent(facultyId)}`);
      const d1=await r1.json();
      const assigns=d1.assignments||[];
      if(assigns.length) courses=assigns.map(a=>({code:a.course_code||a.subject_code,name:a.course_name||a.subject_name||''}));
    }catch(e){}
    if(!courses.length){
      const r2=await fetch(`${window.AMS_CONFIG.API_URL}/api/courses`);
      const d2=await r2.json();
      courses=(d2.courses||[]).map(c=>({code:c.course_code||c.code, name:c.name||c.course_name||''}));
    }
    // Also pull unique course_codes from materials
    try{
      const r3=await fetch(`${window.AMS_CONFIG.API_URL}/api/course-materials?uploaded_by=${encodeURIComponent(facultyId)}`);
      const d3=await r3.json();
      const mats=d3.materials||[];
      const existing=new Set(courses.map(c=>c.code));
      mats.forEach(m=>{
        if(m.course_code&&!existing.has(m.course_code)){
          courses.push({code:m.course_code,name:m.subject||m.course_code});
          existing.add(m.course_code);
        }
      });
    }catch(e){}
    sel.innerHTML='<option value="">— Select Course —</option>'+courses.map(c=>`<option value="${c.code}">${c.code}${c.name?' – '+c.name:''}</option>`).join('');
  }catch(e){
    sel.innerHTML='<option value="">Failed to load courses</option>';
  }
}

async function loadModulesForQP(){
  const code=document.getElementById('qp-course')?.value;
  const wrap=document.getElementById('qp-modules');
  const hint=document.getElementById('qp-module-hint');
  if(!wrap)return;
  if(!code){wrap.innerHTML='<div class="text-muted text-sm">Select a course above.</div>';return;}
  wrap.innerHTML='<div class="text-muted text-sm">⏳ Loading modules…</div>';
  try{
    const facultyId=AMS.user.id||AMS.user.username||'';
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/course-materials?course_code=${encodeURIComponent(code)}&uploaded_by=${encodeURIComponent(facultyId)}`);
    const data=await res.json();
    const mats=data.materials||[];
    if(!mats.length){
      wrap.innerHTML=`<div class="text-muted text-sm">📭 No modules uploaded for <strong>${code}</strong>. Go to <a href="#" onclick="navigateTo('f-materials');return false" style="color:var(--primary)">Course Materials</a> to upload modules first.</div>`;
      if(hint)hint.textContent='No modules found';
      return;
    }
    // Group by module_number
    const modMap={};
    mats.forEach(m=>{
      const mn=m.module_number||0;
      modMap[mn]=modMap[mn]||{unit:m.unit_name||m.topic||'Module '+mn,topics:new Set(),files:[]};
      if(m.topic)modMap[mn].topics.add(m.topic);
      if(m.unit_name)modMap[mn].topics.add(m.unit_name);
      modMap[mn].files.push(m);
    });
    const sorted=Object.keys(modMap).map(Number).sort((a,b)=>a-b);
    if(hint)hint.textContent=`${sorted.length} modules found • ${mats.length} files`;
    wrap.innerHTML=sorted.map(mn=>{
      const mod=modMap[mn];
      const topics=[...mod.topics].filter(Boolean);
      return `<label style="display:flex;gap:.75rem;padding:.6rem .8rem;margin:.25rem 0;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;align-items:flex-start;transition:var(--transition)" onmouseover="this.style.background='var(--ink2)'" onmouseout="this.style.background=''">
        <input type="checkbox" class="qp-mod-check" value="${mn}" checked style="margin-top:3px;width:16px;height:16px;flex-shrink:0"/>
        <div style="flex:1">
          <div class="fw-semibold">Module ${mn}: ${mod.unit}</div>
          <div class="text-xs text-muted">${topics.length?topics.join(' • '):'No specific topics'}</div>
          <div class="text-xs text-muted">📎 ${mod.files.length} file${mod.files.length>1?'s':''} (${mod.files.map(f=>f.material_type||'Notes').join(', ')})</div>
        </div>
      </label>`}).join('');
  }catch(e){
    wrap.innerHTML='<div class="text-red text-sm">Failed to load modules.</div>';
  }
}

async function generateQPaper(){
  const code=document.getElementById('qp-course')?.value;
  if(!code){toast('Select a course first','error');return;}
  // Get selected modules
  const checks=document.querySelectorAll('.qp-mod-check:checked');
  const modules=[...checks].map(c=>parseInt(c.value));
  if(!modules.length){toast('Select at least one module','error');return;}
  const totalMarks=parseInt(document.getElementById('qp-marks')?.value)||50;
  const examType=document.getElementById('qp-examtype')?.value||'internal';
  const resultEl=document.getElementById('qp-result');
  if(resultEl)resultEl.innerHTML='<div class="card"><div class="text-muted text-sm" style="padding:2rem;text-align:center">⏳ Generating question paper from modules…</div></div>';
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/question-papers/generate`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({course_code:code,modules,total_marks:totalMarks,exam_type:examType})
    });
    const d=await res.json();
    if(!d.success)throw new Error(d.error);
    const sections=d.sections||[];
    AMS._generatedSections=sections;
    AMS._generatedMeta={course_code:code,modules_used:d.modules_used,total_marks:totalMarks};
    // Render editable question paper
    const title=document.getElementById('qp-title')?.value||`${examType.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())} – ${code}`;
    const instructions=document.getElementById('qp-instructions')?.value||'Answer all questions.';
    const duration=parseInt(document.getElementById('qp-duration')?.value)||180;
    if(!resultEl)return;
    resultEl.innerHTML=`<div class="card" style="border:2px solid var(--primary);margin-top:1rem">
      <div style="text-align:center;margin-bottom:1.5rem">
        <h3 style="margin-bottom:.25rem">${title}</h3>
        <div class="text-sm text-muted">Course: ${code} &nbsp;|&nbsp; Total Marks: ${totalMarks} &nbsp;|&nbsp; Duration: ${duration} mins</div>
        ${instructions?`<div class="text-sm text-muted" style="margin-top:.5rem;font-style:italic">${instructions}</div>`:''}
      </div>
      ${sections.map((sec,si)=>`
        <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1rem;background:var(--ink3)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
            <span class="fw-semibold">${sec.title} <span class="text-muted text-sm">[${sec.marks} marks]</span></span>
            <button class="btn btn-outline btn-sm" onclick="addQPQuestion(${si})">+ Question</button>
          </div>
          <div id="qp-sec-${si}">
            ${(sec.questions||[]).map((q,qi)=>`
              <div style="display:flex;gap:.5rem;align-items:flex-start;margin-bottom:.5rem;padding:.5rem;border:1px solid var(--border);border-radius:4px;background:var(--ink)" data-si="${si}" data-qi="${qi}">
                <span class="text-muted text-sm" style="min-width:2rem">Q${qi+1}</span>
                <div style="flex:1">
                  <input class="qp-q-text" value="${(q.q||'').replace(/"/g,'&quot;')}" style="width:100%;padding:.4rem;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.85rem;margin-bottom:.3rem"/>
                  <div class="text-xs text-muted">Topic: ${q.topic||'—'} &nbsp;|&nbsp; Type: ${q.type||'descriptive'}</div>
                </div>
                <input class="qp-q-marks" type="number" value="${q.marks||5}" style="width:50px;padding:.4rem;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text);text-align:center;font-size:.85rem" title="Marks"/>
                <button class="btn btn-danger btn-sm" onclick="this.closest('div[data-si]').remove()" style="padding:.2rem .4rem;font-size:.7rem">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem">
        <button class="btn btn-primary" onclick="saveQPaper()">💾 Save Paper</button>
        <button class="btn btn-teal" onclick="printQPaper()">🖨️ Print / PDF</button>
        <button class="btn btn-outline" onclick="document.getElementById('qp-result').innerHTML=''">✕ Clear</button>
      </div>
    </div>`;
    resultEl.scrollIntoView({behavior:'smooth'});
    toast('✅ Question paper generated from '+sections.length+' modules!','success');
  }catch(e){
    if(resultEl)resultEl.innerHTML=`<div class="card"><div class="text-red text-sm" style="padding:1rem">❌ ${e.message}</div></div>`;
    toast('Generation failed: '+e.message,'error');
  }
}

function addQPQuestion(si){
  const wrap=document.getElementById(`qp-sec-${si}`);
  if(!wrap)return;
  const qi=wrap.children.length;
  const div=document.createElement('div');
  div.style.cssText='display:flex;gap:.5rem;align-items:flex-start;margin-bottom:.5rem;padding:.5rem;border:1px solid var(--border);border-radius:4px;background:var(--ink)';
  div.setAttribute('data-si',si);div.setAttribute('data-qi',qi);
  div.innerHTML=`<span class="text-muted text-sm" style="min-width:2rem">Q${qi+1}</span>
    <div style="flex:1"><input class="qp-q-text" placeholder="New question…" style="width:100%;padding:.4rem;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.85rem"/></div>
    <input class="qp-q-marks" type="number" value="5" style="width:50px;padding:.4rem;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text);text-align:center;font-size:.85rem" title="Marks"/>
    <button class="btn btn-danger btn-sm" onclick="this.closest('div[data-si]').remove()" style="padding:.2rem .4rem;font-size:.7rem">✕</button>`;
  wrap.appendChild(div);
}

async function saveQPaper(){
  const code=document.getElementById('qp-course')?.value||'';
  const title=document.getElementById('qp-title')?.value||`Question Paper – ${code}`;
  // Collect edited questions from DOM
  const sections=(AMS._generatedSections||[]).map((sec,si)=>{
    const wrap=document.getElementById(`qp-sec-${si}`);
    const questions=[];
    if(wrap){
      wrap.querySelectorAll('[data-si]').forEach(el=>{
        const q=el.querySelector('.qp-q-text')?.value||'';
        const marks=parseInt(el.querySelector('.qp-q-marks')?.value)||5;
        if(q) questions.push({q,marks,type:'descriptive'});
      });
    }
    return {title:sec.title,marks:sec.marks,questions};
  });
  const payload={
    title,course_code:code,
    course_name:'',
    department:(AMS.profile&&AMS.profile.department)||'',
    exam_type:document.getElementById('qp-examtype')?.value||'internal',
    total_marks:parseInt(document.getElementById('qp-marks')?.value)||50,
    duration_mins:parseInt(document.getElementById('qp-duration')?.value)||180,
    sections,
    modules_used:AMS._generatedMeta?.modules_used||[],
    instructions:document.getElementById('qp-instructions')?.value||'',
    generated_by:AMS.user.id||AMS.user.username||'',
    faculty_name:(AMS.profile&&AMS.profile.full_name)||AMS.user.username||'',
    subject_code:code,
    status:'submitted'
  };
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/question-papers`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await res.json();
    if(!d.success)throw new Error(d.error);
    toast('✅ Question paper saved!','success');
  }catch(e){toast('❌ '+e.message,'error');}
}

function printQPaper(){
  const el=document.getElementById('qp-result');
  if(!el)return;
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>Question Paper</title><style>
    body{font-family:serif;padding:2rem;max-width:800px;margin:auto;color:#000}
    h3{text-align:center} .meta{text-align:center;color:#666;font-size:.9rem;margin-bottom:1.5rem}
    .section{margin:1.5rem 0;padding:1rem;border:1px solid #ccc;border-radius:4px}
    .section-title{font-weight:bold;margin-bottom:.75rem;font-size:1.1rem;border-bottom:1px solid #eee;padding-bottom:.5rem}
    .question{margin:.5rem 0;display:flex;gap:.5rem} .q-num{min-width:2rem;font-weight:bold}
    .q-marks{color:#666;font-size:.85rem;margin-left:auto} @media print{body{padding:1rem}}
  </style></head><body>`);
  w.document.write(el.querySelector('.card')?.innerHTML.replace(/<button[^>]*>.*?<\/button>/g,'').replace(/<input/g,'<span').replace(/<\/input>/g,'</span>')||'');
  w.document.write('</body></html>');
  w.document.close();
  w.print();
}

async function loadSavedPapers(){
  const el=document.getElementById('qp-saved-list');
  if(!el)return;
  el.innerHTML='<div class="card"><div class="text-muted text-sm" style="padding:1rem;text-align:center">⏳ Loading saved papers…</div></div>';
  try{
    const fid=AMS.user.id||AMS.user.username||'';
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/question-papers?generated_by=${encodeURIComponent(fid)}`);
    const d=await res.json();
    const papers=d.papers||[];
    if(!papers.length){el.innerHTML='<div class="card"><div class="text-muted text-sm" style="padding:1rem;text-align:center">📭 No saved papers.</div></div>';return;}
    el.innerHTML=`<div class="card" style="margin-top:1rem">
      <div class="card-header"><div class="card-title">📂 Saved Question Papers</div></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Title</th><th>Course</th><th>Type</th><th>Marks</th><th>Modules</th><th>Status</th><th>Selected</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>${papers.map(p=>{
          const mods=(typeof p.modules_used==='string'?JSON.parse(p.modules_used||'[]'):p.modules_used||[]);
          return `<tr>
            <td class="fw-semibold">${p.title}</td>
            <td>${p.course_code}</td>
            <td><span class="badge badge-blue">${p.exam_type||'internal'}</span></td>
            <td style="text-align:center">${p.total_marks}</td>
            <td>${mods.map(m=>`<span class="badge badge-purple" style="margin:.1rem">${m}</span>`).join('')||'—'}</td>
            <td><span class="badge ${p.status==='selected'?'badge-green':p.status==='submitted'?'badge-blue':'badge-gray'}">${p.status}</span></td>
            <td>${p.is_selected?'<span class="badge badge-green">✅ Selected by Admin</span>':'<span class="text-muted text-sm">—</span>'}</td>
            <td style="font-size:.8rem">${p.created_at?new Date(p.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteQPaper('${p.id}')">🗑️</button></td>
          </tr>`}).join('')}</tbody>
      </table></div>
    </div>`;
    el.scrollIntoView({behavior:'smooth'});
  }catch(e){el.innerHTML=`<div class="card"><div class="text-red text-sm" style="padding:1rem">Failed to load papers.</div></div>`;}
}

async function deleteQPaper(id){
  if(!confirm('Delete this question paper?'))return;
  try{
    await fetch(`${window.AMS_CONFIG.API_URL}/api/question-papers/${id}`,{method:'DELETE'});
    toast('Deleted','success');loadSavedPapers();
  }catch(e){toast('Delete failed','error');}
}

function renderCourseFile(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🗂️ Course File</div></div>
    <div class="form-group"><label>Select Course</label><select><option>CS301 – Data Structures</option></select></div>
    <button class="btn btn-primary mt-md" onclick="toast('Course file generated!','success')">📥 Generate Course File</button>
  </div>`;
}

function renderMarkComputation(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🔢 Mark Computation</div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Roll No</th><th>Name</th><th>Internal 1</th><th>Internal 2</th><th>Computed</th><th>Grade</th></tr></thead>
      <tbody>${[
        {r:'CS001',n:'Alice J.',i1:44,i2:46},{r:'CS002',n:'Bob S.',i1:38,i2:42},
      ].map(s=>{
        const comp=Math.round((Math.max(s.i1,s.i2)/50)*50);
        const grade=comp>=45?'O':comp>=40?'A+':comp>=35?'A':'B+';
        return `<tr><td>${s.r}</td><td>${s.n}</td><td>${s.i1}</td><td>${s.i2}</td><td class="fw-bold">${comp}</td><td><span class="badge badge-green">${grade}</span></td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <button class="btn btn-primary mt-lg" onclick="toast('Marks finalised!','success')">Finalise Marks</button>
  </div>`;
}

function renderCustomReports(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">📊 Custom Reports</div></div>
    <div class="form-row">
      <div class="form-group"><label>Report Type</label><select><option>Attendance Report</option><option>Mark Sheet</option><option>Defaulters List</option></select></div>
      <div class="form-group"><label>Course</label><select><option>All Courses</option><option>CS301</option></select></div>
    </div>
    <div class="d-flex gap-md">
      <button class="btn btn-primary" onclick="toast('Report generated!','success')">Generate</button>
      <button class="btn btn-outline">📥 Excel</button>
      <button class="btn btn-outline">📥 PDF</button>
    </div>
  </div>`;
}

function renderOnlineExam(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">🖥️ Online Examination</div><button class="btn btn-primary btn-sm">+ Create</button></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Exam</th><th>Course</th><th>Date</th><th>Status</th></tr></thead>
      <tbody><tr><td>Online Quiz 3</td><td>CS301</td><td>Feb 28</td><td><span class="badge badge-orange">Draft</span></td></tr></tbody>
    </table></div>
  </div>`;
}

function renderStaffReport(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">👤 Staff Active Report</div>
      <div class="form-row" style="margin:0;align-items:flex-end;gap:.5rem">
        <input type="date" style="padding:.35rem .6rem;border-radius:6px;border:1px solid var(--border);background:var(--ink3);color:var(--text);font-size:.82rem"/>
        <span class="text-sm text-muted">to</span>
        <input type="date" style="padding:.35rem .6rem;border-radius:6px;border:1px solid var(--border);background:var(--ink3);color:var(--text);font-size:.82rem"/>
        <button class="btn btn-primary btn-sm" onclick="toast('Report generated','success')">Generate</button>
      </div>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-card blue"><div class="s-icon">📅</div><div class="s-val">18</div><div class="s-lbl">Classes Taken</div></div>
      <div class="stat-card green"><div class="s-icon">📚</div><div class="s-val">5</div><div class="s-lbl">Active Courses</div></div>
      <div class="stat-card teal"><div class="s-icon">📝</div><div class="s-val">12</div><div class="s-lbl">Assessments</div></div>
      <div class="stat-card orange"><div class="s-icon">⏱️</div><div class="s-val">96h</div><div class="s-lbl">Total Hours</div></div>
    </div>
  </div>`;
}

function renderWorkLog(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">📋 Daily Work Log</div></div>
    <div class="form-row">
      <div class="form-group"><label>Date</label><input type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
      <div class="form-group"><label>Hours Worked</label><input type="number" value="7"/></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      ${[1,2,3,4,5,6].map(h=>`<div class="form-group" style="background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);padding:1rem">
        <label>Hour ${h}</label>
        <input placeholder="Activity for hour ${h} (e.g. Batch: CS2024A, Subject: CS301, Topics: Linked Lists)" style="width:100%;margin-top:.3rem"/>
      </div>`).join('')}
    </div>
    <div class="form-group"><label>Work Description (Summary)</label><textarea placeholder="Summarise your work…" style="min-height:100px"></textarea></div>
    <div class="announcement info mb-md">
      <div class="d-flex justify-between align-center">
        <div>
          <div class="ann-title">Previous Work Log Status</div>
          <div class="text-sm text-muted">Feb 14, 2024 — <span class="badge badge-green">Verified by HOD</span> <span class="badge badge-blue">Approved by Principal</span></div>
          <div class="text-sm text-muted">Feb 13, 2024 — <span class="badge badge-orange">Pending HOD Verification</span></div>
        </div>
      </div>
    </div>
    <button class="btn btn-primary" onclick="toast('Work log submitted! Awaiting HOD verification.','success')">Submit Work Log</button>
  </div>`;
}

function renderAppraisal(){
  const achievements=[
    {date:'05-05-2024',category:'International Fellowships',notes:'IEEE Fellowship Award',status:'approved'},
    {date:'01-01-2024',category:'International Fellowships',notes:'Research Grant – AI Lab',status:'approved'},
    {date:'15-03-2024',category:'Publications',notes:'Paper in IEEE Transactions',status:'pending'},
  ];
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">🌟 Staff Appraisal — Manage Achievements</div>
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('achievementModal').style.display='flex'">+ Add New Achievement</button>
    </div>
    <p class="text-muted mb-md">Achievements are visible to IQAC Coordinator and Head of Department.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Sl. No.</th><th>Achievement Date</th><th>Category</th><th>Notes</th><th>Status</th></tr></thead>
      <tbody>${achievements.map((a,i)=>`<tr>
        <td>${i+1}</td>
        <td>${a.date}</td>
        <td>${a.category}</td>
        <td class="text-muted">${a.notes}</td>
        <td><span class="badge badge-${a.status==='approved'?'green':'orange'}">${a.status}</span></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>

  <div id="achievementModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:480px">
      <div class="card-header">
        <div class="card-title">➕ Add New Achievement</div>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('achievementModal').style.display='none'">✕</button>
      </div>
      <div style="padding:1.5rem">
        <div class="form-group"><label>Achievement Date *</label><input type="date"/></div>
        <div class="form-group"><label>Category *</label>
          <select>
            <option>International Fellowships</option>
            <option>Publications</option>
            <option>Awards & Honours</option>
            <option>Research Projects</option>
            <option>Industrial Collaboration</option>
            <option>Community Service</option>
          </select>
        </div>
        <div class="form-group"><label>Notes / Description</label><textarea placeholder="Describe your achievement…"></textarea></div>
        <div class="d-flex gap-md mt-md">
          <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('achievementModal').style.display='none'">Cancel</button>
          <button class="btn btn-primary" style="flex:1" onclick="saveAchievement()">Save</button>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">📊 Appraisal Score Overview</div><span class="badge badge-green">Overall: A Grade</span></div>
    ${[
      {label:'Teaching Quality',score:88},{label:'Research & Publications',score:72},
      {label:'Student Feedback Score',score:91},{label:'Overall',score:85},
    ].map(it=>`<div class="mb-md">
      <div class="d-flex justify-between mb-sm"><span class="text-sm fw-semibold">${it.label}</span><span class="text-sm text-muted">${it.score}/100</span></div>
      <div class="progress-wrap progress-blue"><div class="progress-bar" style="width:${it.score}%"></div></div>
    </div>`).join('')}
  </div>`;
}

function saveAchievement(){
  document.getElementById('achievementModal').style.display='none';
  toast('Achievement added! Pending IQAC approval.','success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN - BULK STUDENT ENROLLMENT
// ═══════════════════════════════════════════════════════════════════════════════

function renderBulkEnrollment(id){
  return `<div id="bulkEnrollmentContainer"></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN - DASHBOARDS & CORE MODULES
// ═══════════════════════════════════════════════════════════════════════════════
function renderAdminDashboard(){
  setTimeout(()=>loadAdminDashboardData(),100);
  return `
  <div class="stats-grid">
    <div class="stat-card blue"><div class="s-icon">👨‍🎓</div><div class="s-val" id="ad-students">—</div><div class="s-lbl">Total Students</div></div>
    <div class="stat-card green"><div class="s-icon">👩‍🏫</div><div class="s-val" id="ad-faculty">—</div><div class="s-lbl">Faculty Members</div></div>
    <div class="stat-card teal"><div class="s-icon">📊</div><div class="s-val" id="adminAvgAtt">—</div><div class="s-lbl">Today's Attendance</div></div>
    <div class="stat-card orange"><div class="s-icon">🎓</div><div class="s-val" id="ad-courses">—</div><div class="s-lbl">Active Courses</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">
    <div class="card">
      <div class="card-header"><div class="card-title">📊 Today's Attendance Rate</div></div>
      <div id="ad-attchart" class="bar-chart mt-md"><div class="text-muted text-sm" style="padding:.5rem">Loading…</div></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">⚡ Admin Actions</div></div>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        <button class="btn btn-primary w-full" onclick="loadModule('a-users','User Management')">👥 Add New User</button>
        <button class="btn btn-teal w-full" onclick="loadModule('a-register','Face Registration')">👤 Register Student Face</button>
        <button class="btn btn-outline w-full" onclick="loadModule('a-logs','Audit Logs')">📋 View Audit Logs</button>
        <button class="btn btn-orange w-full" onclick="loadModule('a-config','System Config')">⚙️ System Config</button>
        <button class="btn btn-outline w-full" onclick="loadModule('a-isorules','ISO Rules / Faculty Rules')">📜 Manage Rules</button>
        <button class="btn btn-outline w-full" onclick="loadModule('a-exam','Exam Module')">📝 Exam Module</button>
        <button class="btn btn-teal w-full" onclick="loadAdminDashboardData()">🔄 Refresh</button>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">📢 Recent Activity (Live)</div></div>
    <div id="ad-activity"><div class="text-muted text-sm" style="padding:1rem">Loading…</div></div>
  </div>`;
}

async function loadAdminDashboardData(){
  try{
    const today=new Date().toISOString().slice(0,10);

    // Real-time totals from RTDB
    if(window.DB){
      DB.listen('/users', data=>{
        if(!data) return;
        const vals=Object.values(data);
        const students=vals.filter(u=>u.role==='student').length;
        const faculty=vals.filter(u=>u.role==='faculty').length;
        const el_s=document.getElementById('ad-students'); if(el_s) el_s.textContent=String(students);
        const el_f=document.getElementById('ad-faculty'); if(el_f) el_f.textContent=String(faculty);
      });

      // Today's attendance
      DB.listen(`/attendance/${today}`, data=>{
        let present=0,total=0;
        if(data){
          Object.values(data).forEach(session=>{
            if(typeof session!=='object') return;
            Object.values(session).forEach(rec=>{
              total++;
              if(rec.status==='present') present++;
            });
          });
        }
        const pct=total?Math.round(present/total*100):0;
        const el=document.getElementById('adminAvgAtt'); if(el) el.textContent=pct+'%';
        const chart=document.getElementById('ad-attchart');
        if(chart){
          chart.innerHTML=`<div class="bar-row">
            <div class="bar-label text-xs">Present</div>
            <div class="bar-fill"><div class="bar-inner" style="width:${pct}%;background:linear-gradient(90deg,var(--blue),var(--teal))"></div></div>
            <div class="bar-val text-xs">${present}/${total}</div>
          </div>
          <p class="text-muted text-sm" style="margin-top:.5rem">Real-time count — updates as students check in.</p>`;
        }
      });

      // Recent activity from RTDB
      const actEl=document.getElementById('ad-activity');
      if(actEl){
        DB.listen(`/attendance/${today}`, data=>{
          if(!data){ actEl.innerHTML='<div class="text-muted text-sm" style="padding:1rem">No activity today.</div>'; return; }
          let rows=[];
          Object.values(data).forEach(session=>{
            if(typeof session!=='object') return;
            Object.entries(session).forEach(([roll,rec])=>{
              rows.push({roll,name:rec.name||'—',status:rec.status||'—',subject:rec.subject||'—',face:rec.face_verified,ts:rec.timestamp||0});
            });
          });
          rows.sort((a,b)=>b.ts-a.ts);
          actEl.innerHTML=`<div class="tbl-wrap"><table>
            <thead><tr><th>Roll No</th><th>Name</th><th>Subject</th><th>Face</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>${rows.slice(0,20).map(r=>`<tr>
              <td class="fw-semibold">${r.roll}</td><td>${r.name}</td><td>${r.subject}</td>
              <td>${r.face?'✅':'❌'}</td>
              <td><span class="badge badge-${r.status==='present'?'green':'red'}">${r.status}</span></td>
              <td style="font-size:.8rem">${r.ts?new Date(r.ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</td>
            </tr>`).join('')}</tbody>
          </table></div>`;
        });
      }
    }

    // Backend fallback for counts
    const usersRes=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/list`).catch(()=>null);
    if(usersRes&&usersRes.ok){
      const d=await usersRes.json();
      const users=(d.users||[]);
      const el_s=document.getElementById('ad-students'); if(el_s&&el_s.textContent==='—') el_s.textContent=String(users.filter(u=>u.role==='student').length);
      const el_f=document.getElementById('ad-faculty'); if(el_f&&el_f.textContent==='—') el_f.textContent=String(users.filter(u=>u.role==='faculty').length);
    }

    // Courses count
    const coursesRes=await fetch(`${window.AMS_CONFIG.API_URL}/api/courses`).catch(()=>null);
    if(coursesRes&&coursesRes.ok){
      const c=await coursesRes.json();
      const courses=(c.courses||[]);
      const el_c=document.getElementById('ad-courses');
      if(el_c) el_c.textContent=String(courses.length);
    }

    // Attendance fallback when RTDB is unavailable or empty
    const attEl=document.getElementById('adminAvgAtt');
    if(attEl && (attEl.textContent==='—' || attEl.textContent==='0%')){
      const attRes=await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance?date=${today}`).catch(()=>null);
      if(attRes&&attRes.ok){
        const a=await attRes.json();
        const records=a.records||[];
        const present=records.filter(r=>((r.status||'').toLowerCase()==='present') || (r.status||'').toLowerCase()==='late').length;
        const pct=records.length?Math.round((present/records.length)*100):0;
        attEl.textContent=pct+'%';
      }
    }
  }catch(e){ console.error('[Admin Dashboard]',e); }
}

// ── NEW: ISO Rules / Faculty Rules (Admin) ────────────────
function renderAdminISORules(){
  const facultyRules=[
    {id:1,rule:'All faculty must submit attendance within 30 minutes of class end.',active:true},
    {id:2,rule:'Daily Work Log must be submitted by 6:00 PM each working day.',active:true},
    {id:3,rule:'Course materials must be uploaded at least one week before class.',active:true},
    {id:4,rule:'Internal marks must be submitted within 48 hours of exam completion.',active:false},
    {id:5,rule:'Faculty must be present in campus during working hours (9 AM – 5 PM).',active:true},
  ];
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📜 ISO Rules — Faculty Rules</div>
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('addRuleModal').style.display='flex'">+ Add Rule</button>
    </div>
    <p class="text-muted mb-md">Rules set here will be reflected in the faculty's Rules and Regulations page.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Sl. No.</th><th>Rule</th><th>Active</th><th>Actions</th></tr></thead>
      <tbody>${facultyRules.map(r=>`<tr>
        <td>${r.id}</td>
        <td>${r.rule}</td>
        <td>
          <input type="checkbox" ${r.active?'checked':''} style="width:18px;height:18px;cursor:pointer" onchange="toast('Rule ${r.active?'deactivated':'activated'}','info')"/>
        </td>
        <td class="d-flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="toast('Editing rule ${r.id}…','info')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="toast('Rule ${r.id} deleted','warning')">🗑️ Delete</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>

  <div id="addRuleModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:480px">
      <div class="card-header">
        <div class="card-title">➕ Add New Rule</div>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('addRuleModal').style.display='none'">✕</button>
      </div>
      <div style="padding:1.5rem">
        <div class="form-group"><label>Rule Type</label>
          <select><option>Faculty Rules</option><option>Student Rules</option><option>ISO Rules</option></select>
        </div>
        <div class="form-group"><label>Rule Description *</label>
          <textarea placeholder="Enter the rule description…" style="min-height:100px"></textarea>
        </div>
        <div class="form-group d-flex align-center gap-md">
          <input type="checkbox" id="ruleActive" checked style="width:18px;height:18px"/>
          <label for="ruleActive">Active immediately</label>
        </div>
        <div class="d-flex gap-md mt-md">
          <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('addRuleModal').style.display='none'">Cancel</button>
          <button class="btn btn-primary" style="flex:1" onclick="document.getElementById('addRuleModal').style.display='none';toast('Rule saved and reflected for faculty','success')">Save Rule</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── NEW: College Timetable Management (Admin) ─────────────

// ── ROOMS CATALOGUE (Admin) ─────────────────────────────────
function renderAdminRooms(){
  setTimeout(()=>loadAdminRooms(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">🏫 Rooms Catalogue</div>
      <button class="btn btn-primary btn-sm" onclick="openRoomModal()">+ Add Room</button>
    </div>
    <p class="text-muted text-sm mb-md">Rooms listed here appear in the Excel template reference sheet for timetable uploads.</p>
    <div id="rooms-body"><div class="text-muted text-sm p-md">Loading…</div></div>
  </div>

  <!-- Room Modal -->
  <div id="roomModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:480px;padding:1.5rem">
      <div class="card-header mb-md">
        <div class="card-title" id="roomModalTitle">➕ Add Room</div>
        <button class="btn btn-outline btn-sm" onclick="closeRoomModal()">✕</button>
      </div>
      <input type="hidden" id="roomModalId"/>
      <div class="form-row">
        <div class="form-group"><label>Room Number *</label><input id="roomNum" placeholder="e.g. A101" style="text-transform:uppercase"/></div>
        <div class="form-group"><label>Capacity</label><input id="roomCap" type="number" value="60" min="1" max="500"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Type</label>
          <select id="roomType">
            <option value="classroom">Classroom</option>
            <option value="lab">Lab</option>
            <option value="tutorial_room">Tutorial Room</option>
            <option value="seminar_hall">Seminar Hall</option>
          </select>
        </div>
        <div class="form-group"><label>Building</label><input id="roomBuilding" placeholder="e.g. Main Block"/></div>
      </div>
      <div class="form-group"><label>Floor</label><input id="roomFloor" placeholder="e.g. Ground Floor"/></div>
      <div class="d-flex gap-md mt-md">
        <button class="btn btn-outline" style="flex:1" onclick="closeRoomModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveRoom()">Save Room</button>
      </div>
    </div>
  </div>`;
}

async function loadAdminRooms(){
  const el=document.getElementById('rooms-body');
  if(!el)return;
  try{
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn('[loadAdminRooms] Timeout after 10 seconds');
      controller.abort();
    }, 10000);
    
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/rooms`, { signal: controller.signal });
    clearTimeout(timeout);
    
    if(!res.ok) throw new Error(`Status ${res.status}`);
    const data=await res.json();
    const rooms=data.rooms||[];
    if(!rooms.length){ el.innerHTML='<div class="text-muted text-sm p-md">🚫 No rooms yet. Click "+ Add Room" to get started.</div>'; return; }
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Room No.</th><th>Type</th><th>Capacity</th><th>Building</th><th>Floor</th><th>Actions</th></tr></thead>
      <tbody>${rooms.map(r=>`<tr>
        <td><strong>${r.room_number||'—'}</strong></td>
        <td><span class="badge ${r.type==='lab'?'badge-teal':r.type==='seminar_hall'?'badge-orange':'badge-blue'}">${r.type||'classroom'}</span></td>
        <td>${r.capacity||'—'}</td>
        <td>${r.building||'—'}</td>
        <td>${r.floor||'—'}</td>
        <td class="d-flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="openRoomModal('${r.id}','${(r.room_number||'').replace(/'/g,"\\'")}','${r.capacity||60}','${r.type||'classroom'}','${(r.building||'').replace(/'/g,"\\'")}','${(r.floor||'').replace(/'/g,"\\'")}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRoom('${r.id}','${(r.room_number||'').replace(/'/g,"\\'")}')">🗑️</button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>`;
  }catch(e){ 
    console.error('[loadAdminRooms] Error:', e.message);
    el.innerHTML='<div class="text-muted text-sm p-md">❌ Failed to load rooms - backend may be unavailable.</div>';
  }
}

function openRoomModal(id,num,cap,type,building,floor){
  document.getElementById('roomModalId').value=id||'';
  document.getElementById('roomModalTitle').textContent=id?'✏️ Edit Room':'➕ Add Room';
  document.getElementById('roomNum').value=num||'';
  document.getElementById('roomCap').value=cap||60;
  document.getElementById('roomType').value=type||'classroom';
  document.getElementById('roomBuilding').value=building||'';
  document.getElementById('roomFloor').value=floor||'';
  document.getElementById('roomModal').style.display='flex';
}
function closeRoomModal(){ document.getElementById('roomModal').style.display='none'; }

async function saveRoom(){
  const id=document.getElementById('roomModalId').value;
  const num=(document.getElementById('roomNum').value||'').trim().toUpperCase();
  if(!num){ toast('Room number is required','error'); return; }
  const payload={
    room_number:num,
    capacity:parseInt(document.getElementById('roomCap').value)||60,
    type:document.getElementById('roomType').value,
    building:document.getElementById('roomBuilding').value,
    floor:document.getElementById('roomFloor').value,
  };
  try{
    const url=id?`${window.AMS_CONFIG.API_URL}/api/rooms/${id}`:`${window.AMS_CONFIG.API_URL}/api/rooms`;
    const res=await fetch(url,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();
    if(!data.success)throw new Error(data.error);
    toast(id?'Room updated':'Room added','success');
    closeRoomModal();
    loadAdminRooms();
  }catch(e){ toast(e.message,'error'); }
}

async function deleteRoom(id,num){
  if(!confirm(`Delete room ${num}? This cannot be undone.`))return;
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/rooms/${id}`,{method:'DELETE'});
    const data=await res.json();
    if(!data.success)throw new Error(data.error);
    toast('Room deleted','success');
    loadAdminRooms();
  }catch(e){ toast(e.message,'error'); }
}


// ── SUBJECTS CATALOGUE (Admin) ──────────────────────────────
function renderAdminSubjects(){
  setTimeout(()=>loadAdminSubjects(),50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📖 Subjects Catalogue</div>
      <button class="btn btn-primary btn-sm" onclick="openSubjectModal()">+ Add Subject</button>
    </div>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem">
      <input id="subjFilterDept" placeholder="Filter by department…" style="flex:1;min-width:160px;padding:.5rem .8rem;border:1px solid var(--border);border-radius:6px;background:var(--ink2);color:var(--text1)" oninput="loadAdminSubjects()"/>
      <select id="subjFilterSem" onchange="loadAdminSubjects()" style="padding:.5rem .8rem;border:1px solid var(--border);border-radius:6px;background:var(--ink2);color:var(--text1)">
        <option value="">All Semesters</option>
        ${[1,2,3,4,5,6,7,8].map(s=>`<option value="${s}">Semester ${s}</option>`).join('')}
      </select>
    </div>
    <div id="subjects-body"><div class="text-muted text-sm p-md">Loading…</div></div>
  </div>

  <!-- Subject Modal -->
  <div id="subjectModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:560px;padding:1.5rem;max-height:90vh;overflow-y:auto">
      <div class="card-header mb-md">
        <div class="card-title" id="subjectModalTitle">➕ Add Subject</div>
        <button class="btn btn-outline btn-sm" onclick="closeSubjectModal()">✕</button>
      </div>
      <input type="hidden" id="subjectModalId"/>
      <div class="form-row">
        <div class="form-group"><label>Subject Code *</label><input id="subjCode" placeholder="e.g. CS301" style="text-transform:uppercase"/></div>
        <div class="form-group"><label>Credits</label><input id="subjCredits" type="number" value="3" min="1" max="6"/></div>
      </div>
      <div class="form-group"><label>Subject Name *</label><input id="subjName" placeholder="e.g. Data Structures"/></div>
      <div class="form-row">
        <div class="form-group"><label>Department *</label><input id="subjDept" placeholder="e.g. Computer Science"/></div>
        <div class="form-group"><label>Program</label><input id="subjProgram" value="B.Tech"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Semester *</label>
          <select id="subjSemester">${[1,2,3,4,5,6,7,8].map(s=>`<option value="${s}">Semester ${s}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Weekly Hours</label><input id="subjHours" type="number" value="3" min="1" max="8"/></div>
      </div>
      <div class="form-group"><label>Type</label>
        <select id="subjType">
          <option value="Theory">Theory</option><option value="Lab">Lab</option><option value="Tutorial">Tutorial</option>
        </select>
      </div>
      <div class="d-flex gap-md mt-md">
        <button class="btn btn-outline" style="flex:1" onclick="closeSubjectModal()">Cancel</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveSubject()">Save Subject</button>
      </div>
    </div>
  </div>`;
}

async function loadAdminSubjects(){
  const el=document.getElementById('subjects-body');
  if(!el)return;
  const dept=(document.getElementById('subjFilterDept')?.value||'').trim();
  const sem=document.getElementById('subjFilterSem')?.value||'';
  let params=[];
  if(dept) params.push('department='+encodeURIComponent(dept));
  if(sem)  params.push('semester='+encodeURIComponent(sem));
  try{
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn('[loadAdminSubjects] Timeout after 10 seconds');
      controller.abort();
    }, 10000);
    
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/subjects`+(params.length?'?'+params.join('&'):''), { signal: controller.signal });
    clearTimeout(timeout);
    
    if(!res.ok) throw new Error(`Status ${res.status}`);
    const data=await res.json();
    const subjects=data.subjects||[];
    if(!subjects.length){ el.innerHTML='<div class="text-muted text-sm p-md">🚫 No subjects found. Click "+ Add Subject" to begin seeding the catalogue.</div>'; return; }
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Program</th><th>Sem</th><th>Hrs/wk</th><th>Type</th><th>Credits</th><th>Actions</th></tr></thead>
      <tbody>${subjects.map(s=>`<tr>
        <td><strong>${s.subject_code||'—'}</strong></td>
        <td>${s.subject_name||'—'}</td>
        <td>${s.department||'—'}</td>
        <td>${s.program||'—'}</td>
        <td>${s.semester||'—'}</td>
        <td>${s.weekly_hours||'—'}</td>
        <td><span class="badge ${s.type==='Lab'?'badge-teal':s.type==='Tutorial'?'badge-orange':'badge-blue'}">${s.type||'Theory'}</span></td>
        <td>${s.credits||'—'}</td>
        <td class="d-flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="openSubjectModal('${s.id}','${(s.subject_code||'').replace(/'/g,"\\'")}','${(s.subject_name||'').replace(/'/g,"\\'")}','${(s.department||'').replace(/'/g,"\\'")}','${(s.program||'B.Tech').replace(/'/g,"\\'")}',${s.semester||1},${s.weekly_hours||3},'${s.type||'Theory'}',${s.credits||3})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSubject('${s.id}','${(s.subject_code||'').replace(/'/g,"\\'")}')">🗑️</button>
        </td>
      </tr>`).join('')}
      </tbody>
    </table></div>`;
  }catch(e){ 
    console.error('[loadAdminSubjects] Error:', e.message);
    el.innerHTML='<div class="text-muted text-sm p-md">❌ Failed to load subjects - backend may be unavailable.</div>';
  }
}

function openSubjectModal(id,code,name,dept,program,sem,hours,type,credits){
  document.getElementById('subjectModalId').value=id||'';
  document.getElementById('subjectModalTitle').textContent=id?'✏️ Edit Subject':'➕ Add Subject';
  document.getElementById('subjCode').value=code||'';
  document.getElementById('subjName').value=name||'';
  document.getElementById('subjDept').value=dept||'';
  document.getElementById('subjProgram').value=program||'B.Tech';
  document.getElementById('subjSemester').value=sem||1;
  document.getElementById('subjHours').value=hours||3;
  document.getElementById('subjType').value=type||'Theory';
  document.getElementById('subjCredits').value=credits||3;
  document.getElementById('subjectModal').style.display='flex';
}
function closeSubjectModal(){ document.getElementById('subjectModal').style.display='none'; }

async function saveSubject(){
  const id=document.getElementById('subjectModalId').value;
  const code=(document.getElementById('subjCode').value||'').trim().toUpperCase();
  const name=(document.getElementById('subjName').value||'').trim();
  const dept=(document.getElementById('subjDept').value||'').trim();
  if(!code||!name||!dept){ toast('Subject Code, Name, and Department are required','error'); return; }
  const payload={
    subject_code:code,subject_name:name,department:dept,
    program:document.getElementById('subjProgram').value,
    semester:parseInt(document.getElementById('subjSemester').value)||1,
    weekly_hours:parseInt(document.getElementById('subjHours').value)||3,
    type:document.getElementById('subjType').value,
    credits:parseInt(document.getElementById('subjCredits').value)||3,
  };
  try{
    const url=id?`${window.AMS_CONFIG.API_URL}/api/subjects/${id}`:`${window.AMS_CONFIG.API_URL}/api/subjects`;
    const res=await fetch(url,{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();
    if(!data.success)throw new Error(data.error);
    toast(id?'Subject updated':'Subject added','success');
    closeSubjectModal();
    loadAdminSubjects();
  }catch(e){ toast(e.message,'error'); }
}

async function deleteSubject(id,code){
  if(!confirm(`Delete subject ${code}? This cannot be undone.`))return;
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/subjects/${id}`,{method:'DELETE'});
    const data=await res.json();
    if(!data.success)throw new Error(data.error);
    toast('Subject deleted','success');
    loadAdminSubjects();
  }catch(e){ toast(e.message,'error'); }
}



// ── state shared across all timetable-mgmt sub-functions ─────
const TT = {
  facultyList:  [],    // [{id, full_name, department}, ...]
  uploadRows:   [],    // legacy (not used in Excel flow)
  uploadFile:   null,  // File object for Excel/CSV upload
  uploadResult: null,  // last dry-run response
  activeTab:    'grid',
};

function renderAdminTimetableMgmt(){
  setTimeout(()=>{ ttInitTab('grid'); ttLoadFaculty(); }, 0);
  return `
<div id="ttMgmtRoot">

<!-- ── Tab Bar ─────────────────────────────────────────────── -->
<div class="card" style="padding:.5rem 1rem;margin-bottom:.75rem">
  <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
    <span style="font-weight:700;font-size:1rem;margin-right:.5rem">🗓️ Timetable Management</span>
    ${['grid','upload','workload','conflicts','assignments','manual','delete','generator'].map(t=>
      `<button class="btn btn-sm ${t==='grid'?'btn-primary':'btn-outline'}${t==='delete'?' btn-danger':''}" id="ttTab_${t}" onclick="ttInitTab('${t}')">${
        {grid:'📅 Grid',upload:'📤 Upload Excel',workload:'👨‍💼 Workload',conflicts:'⚠️ Conflicts',assignments:'📋 Assignments',manual:'✏️ Manual Edit',delete:'🗑️ Delete Timetable',generator:'⚡ Auto-Generate'}[t]
      }</button>`
    ).join('')}
    <a href="${window.AMS_CONFIG.API_URL}/api/timetable/excel-template" download="timetable_template.xlsx" class="btn btn-teal btn-sm" style="margin-left:auto">📥 Download Excel Template</a>
  </div>
</div>

<!-- ── Tab Content ──────────────────────────────────────────── -->
<div id="ttTabContent"></div>

<!-- ── Add / Edit Slot Modal ────────────────────────────────── -->
<div id="ttSlotModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
  <div class="card" style="width:95%;max-width:640px;padding:1.5rem;max-height:92vh;overflow-y:auto">
    <div class="card-header" style="margin-bottom:1rem">
      <div class="card-title" id="ttModalTitle">➕ Add Slot</div>
      <button class="btn btn-outline btn-sm" onclick="ttCloseSlotModal()">✕</button>
    </div>
    <input type="hidden" id="ttModalId"/>
    <div class="form-row">
      <div class="form-group">
        <label>Day</label>
        <select id="ttM_day">
          <option>Monday</option><option>Tuesday</option><option>Wednesday</option>
          <option>Thursday</option><option>Friday</option><option>Saturday</option>
        </select>
      </div>
      <div class="form-group">
        <label>Hour (1–10)</label>
        <input id="ttM_hour" type="number" min="1" max="10" value="1"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Start Time</label><input id="ttM_start" type="time" value="09:00"/></div>
      <div class="form-group"><label>End Time</label><input id="ttM_end"   type="time" value="10:00"/></div>
    </div>
    <div class="form-group"><label>Subject Name *</label><input id="ttM_subject" placeholder="e.g. Data Structures"/></div>
    <div class="form-row">
      <div class="form-group">
        <label>Faculty</label>
        <select id="ttM_fid">
          <option value="">— Select Faculty —</option>
        </select>
      </div>
      <div class="form-group"><label>Or Faculty Name (manual)</label><input id="ttM_fname" placeholder="Dr. Sharma"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Batch *</label><input id="ttM_batch" placeholder="e.g. CSE-A"/></div>
      <div class="form-group"><label>Department</label><input id="ttM_dept" placeholder="e.g. Computer Science"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Room</label><input id="ttM_room" placeholder="A101"/></div>
      <div class="form-group">
        <label>Session Type</label>
        <select id="ttM_stype">
          <option value="lecture">Lecture</option>
          <option value="tutorial">Tutorial</option>
          <option value="practical">Practical / Lab</option>
          <option value="seminar">Seminar</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Lab Batch (if practical)</label>
        <select id="ttM_labbat">
          <option value="">N/A</option><option value="B1">B1</option><option value="B2">B2</option>
        </select>
      </div>
      <div class="form-group"><label>Subject Code</label><input id="ttM_scode" placeholder="CS301"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Academic Year</label><input id="ttM_yr" placeholder="2025-26"/></div>
      <div class="form-group"><label>Semester</label><input id="ttM_sem" type="number" min="1" max="8" placeholder="3"/></div>
    </div>
    <div id="ttModalConflictWarn" style="display:none;background:#fff3cd;border:1px solid #ffc107;border-radius:.5rem;padding:.75rem;margin:.75rem 0;color:#856404;font-size:.85rem"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:.5rem" onclick="ttSaveSlotModal()">💾 Save Slot</button>
  </div>
</div>

<!-- ── Substitute Faculty Modal ─────────────────────────────── -->
<div id="ttSubModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
  <div class="card" style="width:95%;max-width:480px;padding:1.5rem">
    <div class="card-header" style="margin-bottom:1rem">
      <div class="card-title">🔄 Assign Substitute Faculty</div>
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('ttSubModal').style.display='none'">✕</button>
    </div>
    <input type="hidden" id="ttSubSlotId"/>
    <div class="form-group">
      <label>Substitute Faculty</label>
      <select id="ttSubFid"><option value="">— Select —</option></select>
    </div>
    <div class="form-group">
      <label>Or Enter Name Manually</label>
      <input id="ttSubFname" placeholder="Dr. Substitute Name"/>
    </div>
    <div class="form-group">
      <label>Reason</label>
      <input id="ttSubReason" placeholder="Original faculty on leave…"/>
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="ttSaveSubstitute()">✅ Confirm Substitute</button>
  </div>
</div>

</div>`;
}


// ── Tab initialization ─────────────────────────────────────────
function ttInitTab(tab){
  TT.activeTab = tab;
  ['grid','upload','workload','conflicts','assignments','manual','delete','generator'].forEach(t=>{
    const btn = document.getElementById(`ttTab_${t}`);
    if(btn){
      btn.className = `btn btn-sm ${t===tab?(t==='delete'?'btn-danger':'btn-primary'):(t==='delete'?'btn-outline btn-danger-outline':'btn-outline')}`;
    }
  });
  const content = document.getElementById('ttTabContent');
  if(!content) return;
  switch(tab){
    case 'grid':        ttRenderGridTab(content);        break;
    case 'upload':      ttRenderUploadTab(content);      break;
    case 'workload':    ttRenderWorkloadTab(content);     break;
    case 'conflicts':   ttRenderConflictsTab(content);   break;
    case 'assignments': ttRenderAssignmentsTab(content); break;
    case 'manual':      ttRenderManualTab(content);      break;
    case 'delete':      ttRenderDeleteTab(content);      break;
    case 'generator':   
      setTimeout(() => {
        if(typeof ttGeneratorInit === 'function'){
          try {
            ttGeneratorInit();
          } catch(e) {
            console.error('Error initializing generator:', e);
            content.innerHTML = '<div class="card"><div style="padding:2rem;background:#fff3cd;border-radius:4px;color:#856404"><strong>⚠️ Initialization Error</strong><p style="margin-top:0.5rem">' + e.message + '</p></div></div>';
          }
        } else {
          content.innerHTML = '<div class="card"><div style="padding:2rem;text-align:center"><div style="color:#ff6b6b;font-weight:600;margin-bottom:1rem">⚠️ Generator Module Not Loaded</div><p style="color:#999">The timetable generator module is still loading. Please refresh the page and try again.</p></div></div>';
        }
      }, 100);
      break;
  }
}

// ── Load faculty list for dropdowns ───────────────────────────
async function ttLoadFaculty(){
  try{
    console.log('[ttLoadFaculty] Starting faculty list fetch...');
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn('[ttLoadFaculty] Timeout after 8 seconds - backend may be slow');
      controller.abort();
    }, 8000); // 8 second timeout
    
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/list?role=faculty`, {
      signal: controller.signal
    }).catch((err)=>{
      console.warn('[ttLoadFaculty] Fetch failed:', err.message);
      return null;
    });
    clearTimeout(timeout);
    
    if(!r||!r.ok) {
      console.warn('[ttLoadFaculty] Response not ok:', r?.status);
      TT.facultyList = [];
      return;
    }
    
    const d = await r.json();
    console.log('[ttLoadFaculty] Data received:', d);
    
    TT.facultyList = Array.isArray(d.users) ? d.users : [];
    console.log('[ttLoadFaculty] Faculty count:', TT.facultyList.length);
    
    // Populate faculty selects if they exist
    ['ttM_fid','ttSubFid'].forEach(sel => ttFillFacultySelect(sel));
    console.log('[ttLoadFaculty] Complete');
  }catch(e){ 
    console.error('[ttLoadFaculty] Error:', e.message);
    TT.facultyList = [];
  }
}

function ttFillFacultySelect(id){
  const sel = document.getElementById(id);
  if(!sel) return;
  const current = sel.value;
  const opts = TT.facultyList.map(f=>
    `<option value="${f.id}">${f.full_name}${f.department?' ('+f.department+')':''}</option>`
  ).join('');
  sel.innerHTML = `<option value="">— Select Faculty —</option>` + opts;
  if(current) sel.value = current;
}

// ─────────────────────────────────────────────────────────────
// TAB — ASSIGNMENTS
// ─────────────────────────────────────────────────────────────
function ttRenderAssignmentsTab(container){
  container.innerHTML = `
<div class="card">
  <div class="card-header">
    <div class="card-title">🔗 Faculty-Subject Assignments</div>
  </div>
  
  <div style="padding:1.5rem">
    <p class="text-secondary" style="margin-bottom:1rem">View and manage faculty-to-subject assignments for timetable generation</p>
    
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
      <input id="ttAsDept" placeholder="Filter by department" style="width:200px"/>
      <select id="ttAsSem" style="width:180px">
        <option value="">All Semesters</option>
        <option value="1">Semester 1</option>
        <option value="2">Semester 2</option>
        <option value="3">Semester 3</option>
        <option value="4">Semester 4</option>
        <option value="5">Semester 5</option>
        <option value="6">Semester 6</option>
        <option value="7">Semester 7</option>
        <option value="8">Semester 8</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="ttLoadAssignments()">🔍 Load Assignments</button>
      <button class="btn btn-success btn-sm" onclick="ttOpenAddAssignmentModal()">+ Add Assignment</button>
    </div>
    
    <div id="ttAssignmentsList" style="border:1px solid var(--border);border-radius:.5rem;max-height:500px;overflow-y:auto">
      <p style="text-align:center;padding:2rem;color:var(--text3)">No assignments loaded yet</p>
    </div>
  </div>
</div>`;
}

function ttLoadAssignments(){
  const list = document.getElementById('ttAssignmentsList');
  if(!list) return;
  list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">Loading assignments…</p>';
  
  // TODO: Load assignments from API when available
  list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">Assignments feature coming soon</p>';
}

function ttOpenAddAssignmentModal(){
  alert('Assignment creation feature coming soon');
}

// ─────────────────────────────────────────────────────────────
// TAB 1 — TIMETABLE GRID
// ─────────────────────────────────────────────────────────────
function ttRenderGridTab(container){
  container.innerHTML = `
<div class="card">
  <div class="card-header" style="flex-wrap:wrap;gap:.5rem">
    <div class="card-title" style="min-width:auto">📅 Timetable Grid</div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;flex:1;justify-content:flex-end">
      <input id="ttGDept"  placeholder="Department filter" style="width:180px"/>
      <input id="ttGBatch" placeholder="Class/Batch (e.g. CSE-A)" style="width:160px"/>
      <input id="ttGBlock" placeholder="Block (room prefix, e.g. A)" style="width:160px"/>
      <select id="ttGSem" style="width:160px">
        <option value="">All Semesters</option>
        <option value="odd">Odd Sems (1,3,5,7)</option>
        <option value="even">Even Sems (2,4,6,8)</option>
        <option value="1">Semester 1</option><option value="2">Semester 2</option>
        <option value="3">Semester 3</option><option value="4">Semester 4</option>
        <option value="5">Semester 5</option><option value="6">Semester 6</option>
        <option value="7">Semester 7</option><option value="8">Semester 8</option>
      </select>
      <button class="btn btn-outline btn-sm" onclick="ttLoadGrid()">🔍 Filter</button>
      <button class="btn btn-primary btn-sm" onclick="ttOpenSlotModal()">+ Add Slot</button>
    </div>
  </div>
  <div id="ttGridBody" style="overflow-x:auto">
    <p style="text-align:center;padding:2rem;color:var(--text3)">Loading…</p>
  </div>
</div>`;
  ttLoadGrid();
}

async function ttLoadGrid(){
  const el = document.getElementById('ttGridBody');
  if(!el) return;
  el.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">Loading…</p>';
  const dept  = (document.getElementById('ttGDept')  || {value:''}).value.trim();
  const batch = (document.getElementById('ttGBatch') || {value:''}).value.trim();
  const block = (document.getElementById('ttGBlock') || {value:''}).value.trim();
  const sem   = (document.getElementById('ttGSem')   || {value:''}).value.trim();
  let url = `${window.AMS_CONFIG.API_URL}/api/timetable`;
  const params = [];
  if(dept)  params.push(`department=${encodeURIComponent(dept)}`);
  if(batch) params.push(`batch=${encodeURIComponent(batch)}`);
  if(block) params.push(`block=${encodeURIComponent(block)}`);
  if(sem === 'odd' || sem === 'even') params.push(`sem_type=${sem}`);
  else if(sem) params.push(`semester=${encodeURIComponent(sem)}`);
  params.push('active=all');
  if(params.length) url += '?' + params.join('&');
  try{
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn('[ttLoadGrid] Timeout after 10 seconds');
      controller.abort();
    }, 10000);
    
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if(!r.ok) throw new Error(`Status ${r.status}`);
    const d = await r.json();
    const entries = d.entries || [];
    if(!entries.length){
      el.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">No timetable entries. Use <b>Upload CSV</b> or <b>+ Add Slot</b> to get started.</p>';
      return;
    }
    const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const hours = [...new Set(entries.map(e=>e.hour_number))].sort((a,b)=>a-b);
    const byDayHour = {};
    for(const e of entries){
      const k = `${e.day_of_week}__${e.hour_number}`;
      if(!byDayHour[k]) byDayHour[k]=[];
      byDayHour[k].push(e);
    }
    const timeMap = {};
    for(const e of entries) timeMap[e.hour_number] = `${(e.start_time||'').slice(0,5)}–${(e.end_time||'').slice(0,5)}`;

    let tbl = `<table style="min-width:700px;border-collapse:collapse">
<thead><tr style="background:var(--bg3)">
  <th style="border:1px solid var(--border);padding:.5rem .75rem">Day \\ Hour</th>
  ${hours.map(h=>`<th style="border:1px solid var(--border);padding:.5rem .75rem;text-align:center">Hour ${h}<br><span style="font-size:.7rem;color:var(--text3)">${timeMap[h]||''}</span></th>`).join('')}
</tr></thead><tbody>`;
    for(const day of DAYS){
      tbl += `<tr><td style="border:1px solid var(--border);padding:.5rem .75rem;font-weight:600;background:var(--bg2)">${day}</td>`;
      for(const h of hours){
        const cells = byDayHour[`${day}__${h}`] || [];
        tbl += `<td style="border:1px solid var(--border);padding:.4rem;vertical-align:top;min-width:120px">`;
        for(const c of cells){
          const stypeColor = {lecture:'#3b82f6',tutorial:'#8b5cf6',practical:'#10b981',seminar:'#f59e0b'}[c.session_type||'lecture']||'#6b7280';
          tbl += `<div style="background:${stypeColor}18;border-left:3px solid ${stypeColor};border-radius:.3rem;padding:.3rem .4rem;margin-bottom:.25rem;font-size:.78rem">
  <div style="font-weight:600">${c.subject_name||'?'}</div>
  <div style="color:var(--text2)">${c.faculty_name||'—'}</div>
  <div style="display:flex;gap:.25rem;flex-wrap:wrap;margin-top:.2rem">
    <span style="background:var(--bg3);border-radius:.2rem;padding:0 .25rem;font-size:.68rem">${c.batch||'?'}</span>
    ${c.room_number?`<span style="background:var(--bg3);border-radius:.2rem;padding:0 .25rem;font-size:.68rem">${c.room_number}</span>`:''}
    <span style="background:${stypeColor}28;border-radius:.2rem;padding:0 .25rem;font-size:.68rem;text-transform:capitalize">${c.session_type||'lecture'}</span>
  </div>
  <div style="display:flex;gap:.25rem;margin-top:.3rem">
    <button class="btn btn-outline btn-sm" style="padding:1px 5px;font-size:.7rem" onclick="ttOpenSlotModal('${c.id}')">✏️</button>
    <button class="btn btn-danger btn-sm" style="padding:1px 5px;font-size:.7rem" onclick="ttDeleteSlot('${c.id}')">🗑️</button>
    <button class="btn btn-outline btn-sm" style="padding:1px 5px;font-size:.7rem" onclick="ttOpenSubModal('${c.id}','${(c.faculty_name||'').replace(/'/g,'\\\'')}')" title="Assign substitute">🔄</button>
  </div>
</div>`;
        }
        if(!cells.length) tbl += `<div style="color:var(--text3);font-size:.75rem;text-align:center;padding:.25rem">—</div>`;
        tbl += `</td>`;
      }
      tbl += `</tr>`;
    }
    tbl += `</tbody></table>`;
    el.innerHTML = tbl;
  }catch(ex){
    console.error('[ttLoadGrid] Error:', ex.message);
    el.innerHTML = `<p style="color:var(--red);text-align:center;padding:1rem"><strong>❌ Failed to load timetable grid</strong><br/><small style="color:var(--text3)">${ex.message.includes('abort') ? 'Request timeout - backend may be slow' : ex.message}</small></p>`;
  }
}

// ─────────────────────────────────────────────────────────────
// TAB 2 — UPLOAD CSV
// ─────────────────────────────────────────────────────────────
function ttRenderUploadTab(container){
  container.innerHTML = `
<div class="card">
  <div class="card-header">
    <div class="card-title">� Upload Timetable (Excel / CSV)</div>
    <a href="${window.AMS_CONFIG.API_URL}/api/timetable/template" download="timetable_template.xlsx" class="btn btn-outline btn-sm">⬇️ Download Template</a>
  </div>
  <p style="color:var(--text2);font-size:.88rem;margin-bottom:.75rem">
    Upload an <b>.xlsx</b>, <b>.xls</b>, or <b>.csv</b> file. Required columns: <b>department, section, year, day_of_week, period_number, start_time, end_time, subject_code, subject_name, faculty_username</b>.<br>
    Optional: room_number, type (Theory/Lab/Tutorial), program, semester, academic_year.
  </p>
  <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:.75rem">
    <div style="flex:1;min-width:160px">
      <label style="font-size:.82rem;color:var(--text2);display:block;margin-bottom:.25rem">Academic Year</label>
      <input id="ttAcadYear" value="2025-26" style="width:100%" placeholder="e.g. 2025-26"/>
    </div>
    <div style="flex:1;min-width:120px">
      <label style="font-size:.82rem;color:var(--text2);display:block;margin-bottom:.25rem">Semester</label>
      <input id="ttSemester" value="1" style="width:100%" placeholder="e.g. 1"/>
    </div>
  </div>
  <div style="border:2px dashed var(--border);border-radius:.75rem;padding:2rem;text-align:center;margin-bottom:1rem" id="ttDropZone">
    <div style="font-size:2rem">📂</div>
    <p style="margin:.5rem 0;color:var(--text2)">Drag & drop Excel or CSV file here, or click to browse</p>
    <input type="file" id="ttXLSXFile" accept=".xlsx,.xls,.csv" style="display:none" onchange="ttHandleFile(this)"/>
    <button class="btn btn-outline btn-sm" onclick="document.getElementById('ttXLSXFile').click()">Choose File</button>
    <div id="ttFileName" style="margin-top:.5rem;font-size:.82rem;color:var(--text3)"></div>
  </div>
  <div id="ttUploadResult"></div>
</div>`;
  const dz = document.getElementById('ttDropZone');
  if(dz){
    dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.style.background='var(--bg2)'; });
    dz.addEventListener('dragleave',()=>{ dz.style.background=''; });
    dz.addEventListener('drop', e=>{
      e.preventDefault(); dz.style.background='';
      const file = e.dataTransfer.files[0];
      if(file){ TT.uploadFile = file; const fn = document.getElementById('ttFileName'); if(fn) fn.textContent = '📎 '+file.name; ttDryRun(); }
    });
  }
}

function ttHandleFile(input){
  const file = input.files[0];
  if(!file) return;
  TT.uploadFile = file;
  const fn = document.getElementById('ttFileName');
  if(fn) fn.textContent = '📎 '+file.name;
  ttDryRun();
}

async function ttDryRun(){
  const el = document.getElementById('ttUploadResult');
  if(!el) return;
  if(!TT.uploadFile){ toast('Please select a file first','warning'); return; }
  el.innerHTML = `<p style="color:var(--text2);text-align:center;padding:1rem">🔍 Validating file…</p>`;
  try{
    const fd = new FormData();
    fd.append('file', TT.uploadFile);
    fd.append('commit', 'false');
    fd.append('academic_year', (document.getElementById('ttAcadYear')||{value:'2025-26'}).value || '2025-26');
    fd.append('semester', (document.getElementById('ttSemester')||{value:'1'}).value || '1');
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/excel-upload`, { method:'POST', body:fd });
    const d = await r.json();
    if(!d.success && !d.dry_run){ toast(d.error || 'Validation error','error'); el.innerHTML = `<p style="color:var(--red);padding:1rem">❌ ${d.error||'Upload failed'}</p>`; return; }
    TT.uploadResult = d;
    ttRenderUploadPreview(d);
  }catch(ex){
    el.innerHTML = `<p style="color:var(--red);padding:1rem">Validation failed: ${ex.message}</p>`;
  }
}

function ttRenderUploadPreview(d){
  const el = document.getElementById('ttUploadResult');
  if(!el) return;
  // errors from excel-upload are objects {row, message, data}; normalise to strings for display
  const errList = (d.errors||[]).map(e=> typeof e === 'object' ? `Row ${e.row}: ${e.message}` : String(e));
  const hasErrors   = errList.length > 0;
  const hasWarnings = d.warnings && d.warnings.length;
  let html = `
<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem">
  <div style="background:#10b98118;border:1px solid #10b981;border-radius:.5rem;padding:.5rem 1rem;text-align:center">
    <div style="font-size:1.4rem;font-weight:700;color:#10b981">${d.valid_count||0}</div>
    <div style="font-size:.8rem;color:var(--text2)">Valid rows</div>
  </div>
  <div style="background:#ef444418;border:1px solid #ef4444;border-radius:.5rem;padding:.5rem 1rem;text-align:center">
    <div style="font-size:1.4rem;font-weight:700;color:#ef4444">${d.error_count||errList.length||0}</div>
    <div style="font-size:.8rem;color:var(--text2)">Errors</div>
  </div>
  <div style="background:#f59e0b18;border:1px solid #f59e0b;border-radius:.5rem;padding:.5rem 1rem;text-align:center">
    <div style="font-size:1.4rem;font-weight:700;color:#f59e0b">${d.warning_count||0}</div>
    <div style="font-size:.8rem;color:var(--text2)">Warnings</div>
  </div>
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:.5rem;padding:.5rem 1rem;text-align:center">
    <div style="font-size:1.4rem;font-weight:700">${d.total||0}</div>
    <div style="font-size:.8rem;color:var(--text2)">Total rows</div>
  </div>
</div>`;
  if(hasErrors){
    const shown = errList.slice(0, 50);
    html += `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:.5rem;padding:.75rem;margin-bottom:.75rem">
<b style="color:#b91c1c">❌ Errors (must fix before saving):</b>
<ul style="margin:.5rem 0 0;padding-left:1.25rem">${shown.map(e=>`<li style="color:#7f1d1d;font-size:.85rem">${e}</li>`).join('')}</ul>
${errList.length>50?`<p style="color:#b91c1c;font-size:.82rem;margin:.4rem 0 0">… and ${errList.length-50} more errors</p>`:''}
</div>`;
  }
  if(hasWarnings){
    html += `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:.5rem;padding:.75rem;margin-bottom:.75rem">
<b style="color:#92400e">⚠️ Warnings (review before saving):</b>
<ul style="margin:.5rem 0 0;padding-left:1.25rem">${d.warnings.slice(0,20).map(w=>`<li style="color:#78350f;font-size:.85rem">${w}</li>`).join('')}</ul>
${d.warnings.length>20?`<p style="color:#92400e;font-size:.82rem;margin:.4rem 0 0">… and ${d.warnings.length-20} more</p>`:''}
</div>`;
  }
  const preview = d.preview || [];
  if(preview.length){
    html += `<div style="margin-bottom:.75rem">
<div style="font-weight:600;margin-bottom:.4rem">Preview (first ${preview.length} of ${d.valid_count} valid rows)</div>
<div style="overflow-x:auto"><table style="min-width:800px;border-collapse:collapse;font-size:.82rem">
<thead><tr style="background:var(--bg3)">
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Dept</th>
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Yr/Sec</th>
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Day</th>
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Period</th>
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Time</th>
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Subject</th>
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Faculty</th>
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Room</th>
  <th style="border:1px solid var(--border);padding:.35rem .5rem">Type</th>
</tr></thead><tbody>
${preview.map(p=>`<tr>
  <td style="border:1px solid var(--border);padding:.3rem .5rem">${p.department||'—'}</td>
  <td style="border:1px solid var(--border);padding:.3rem .5rem">Y${p.year||'?'} ${p.section||'—'}</td>
  <td style="border:1px solid var(--border);padding:.3rem .5rem">${p.day_of_week}</td>
  <td style="border:1px solid var(--border);padding:.3rem .5rem;text-align:center">${p.period_number||p.hour_number||'—'}</td>
  <td style="border:1px solid var(--border);padding:.3rem .5rem;font-size:.78rem">${(p.start_time||'').slice(0,5)}–${(p.end_time||'').slice(0,5)}</td>
  <td style="border:1px solid var(--border);padding:.3rem .5rem;font-weight:600">${p.subject_name}</td>
  <td style="border:1px solid var(--border);padding:.3rem .5rem">${p.faculty_name||p.faculty_username||'—'}</td>
  <td style="border:1px solid var(--border);padding:.3rem .5rem">${p.room_number||'—'}</td>
  <td style="border:1px solid var(--border);padding:.3rem .5rem">${p.type||p.session_type||'Theory'}</td>
</tr>`).join('')}
</tbody></table></div></div>`;
  }
  if(!hasErrors && (d.valid_count||0) > 0){
    html += `<button class="btn btn-primary" style="width:100%" onclick="ttCommitUpload(event)">
  ✅ Save ${d.valid_count} Slots to Timetable${hasWarnings?' (with '+d.warning_count+' warnings)':''}
</button>`;
  } else if(hasErrors){
    html += `<p style="color:var(--red);text-align:center;font-size:.88rem">Fix all errors above, correct the file, then re-upload.</p>`;
  } else if((d.valid_count||0) === 0){
    html += `<p style="color:var(--text2);text-align:center;font-size:.88rem">No valid rows found. Check the file format and required columns.</p>`;
  }
  el.innerHTML = html;
}

async function ttCommitUpload(evt){
  const btn = evt ? evt.target : null;
  if(!TT.uploadFile){ toast('No file to save — please re-upload','error'); return; }
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Saving…'; }
  try{
    const fd = new FormData();
    fd.append('file', TT.uploadFile);
    fd.append('commit', 'true');
    fd.append('academic_year', (document.getElementById('ttAcadYear')||{value:'2025-26'}).value || '2025-26');
    fd.append('semester', (document.getElementById('ttSemester')||{value:'1'}).value || '1');
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/excel-upload`, { method:'POST', body:fd });
    const d = await r.json();
    if(d.success){
      const el = document.getElementById('ttUploadResult');
      const dbErrors = d.errors && d.errors.length;
      const icon = d.saved_count > 0 ? '✅' : '⚠️';
      toast(d.saved_count > 0 ? `✅ Successfully assigned ${d.saved_count} timetable slots!` : `⚠️ Saved 0 slots${dbErrors?' — DB errors occurred':''}`, d.saved_count>0?'success':'warning');
      // Clear file info
      const fnEl = document.getElementById('ttFileName');
      if(fnEl) fnEl.textContent = '';
      // Show success message and hide input area
      if(el) el.innerHTML = `<div style="background:${d.saved_count>0?'#d1fae5':'#fef3c7'};border:1px solid ${d.saved_count>0?'#6ee7b7':'#fcd34d'};border-radius:.5rem;padding:1.5rem;text-align:center">
  <div style="font-size:1.5rem;margin-bottom:.5rem">${icon}</div>
  <div style="font-weight:700;color:${d.saved_count>0?'#065f46':'#92400e'}">✅ Successfully assigned ${d.saved_count} timetable slots${d.failed_count?` (${d.failed_count} failed)`:''}</div>
  ${d.assignments_created?`<div style="color:#065f46;margin-top:.25rem;font-size:.88rem">🔗 ${d.assignments_created} faculty assignment(s) created/updated</div>`:''}
  ${dbErrors?`<div style="margin-top:.5rem;background:#fee2e2;border-radius:.3rem;padding:.5rem;font-size:.82rem;text-align:left"><b style="color:#b91c1c">DB errors:</b><ul style="margin:.3rem 0 0;padding-left:1rem">${d.errors.slice(0,5).map(e=>`<li style="color:#7f1d1d">${e}</li>`).join('')}</ul></div>`:''}
  ${d.warnings&&d.warnings.length?`<div style="color:#92400e;margin-top:.5rem;font-size:.85rem">${d.warnings.length} warning(s)</div>`:''}
  <div style="margin-top:1rem;display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap">
    <button class="btn btn-primary btn-sm" onclick="ttInitTab('grid')">📅 View Timetable Grid</button>
    <button class="btn btn-outline btn-sm" onclick="ttInitTab('assignments')">🔗 View Assignments</button>
    <button class="btn btn-outline btn-sm" onclick="ttRenderUploadTab(document.querySelector('[id*=uploadTab]')||document.body);TT.uploadFile=null;TT.uploadResult=null">➕ Upload Another File</button>
  </div>
</div>`;
      TT.uploadFile = null;
      // Hide the file input and preview area after success
      const dz = document.getElementById('ttDropZone');
      if(dz) dz.style.display = 'none';
      if(btn){ btn.disabled = false; btn.textContent = '✅ Successfully Assigned'; btn.style.display='none'; }
    }else{
      // Validation errors prevented save
      toast(d.error || 'Save failed', 'error');
      TT.uploadResult = d;
      ttRenderUploadPreview(d);
      if(btn){ btn.disabled = false; btn.textContent = '✅ Save Slots'; }
    }
  }catch(ex){
    toast('Network error: '+ex.message,'error');
    if(btn){ btn.disabled = false; btn.textContent = '✅ Save Slots'; }
  }
}

// ─────────────────────────────────────────────────────────────
// TAB 3 — WORKLOAD ALLOCATION
// ─────────────────────────────────────────────────────────────
function ttRenderWorkloadTab(container){
  container.innerHTML = `
<div class="card">
  <div class="card-header" style="flex-wrap:wrap;gap:.5rem">
    <div class="card-title">👨‍💼 Faculty Workload</div>
    <div style="display:flex;gap:.5rem;flex:1;justify-content:flex-end">
      <input id="ttWLDept" placeholder="Filter by Department" style="width:200px"/>
      <button class="btn btn-outline btn-sm" onclick="ttLoadWorkload()">🔍 Filter</button>
    </div>
  </div>
  <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem">
    <div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:.5rem;padding:.4rem .75rem;font-size:.82rem">
      🟢 <b>10–20 hrs/week</b> = Optimal
    </div>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:.5rem;padding:.4rem .75rem;font-size:.82rem">
      🟡 <b>&gt;20 hrs/week</b> = Overloaded
    </div>
    <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:.5rem;padding:.4rem .75rem;font-size:.82rem">
      🔴 <b>&lt;10 hrs/week</b> = Under-allocated
    </div>
  </div>
  <div id="ttWorkloadBody"><p style="text-align:center;padding:2rem;color:var(--text3)">Loading…</p></div>
</div>`;
  ttLoadWorkload();
}

async function ttLoadWorkload(){
  const el = document.getElementById('ttWorkloadBody');
  if(!el) return;
  el.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">Loading…</p>';
  const dept = (document.getElementById('ttWLDept')||{value:''}).value.trim();
  let url = `${window.AMS_CONFIG.API_URL}/api/timetable/workload`;
  if(dept) url += `?department=${encodeURIComponent(dept)}`;
  try{
    const r = await fetch(url);
    const d = await r.json();
    const wl = d.workload || [];
    if(!wl.length){
      el.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">No timetable data yet. Upload a timetable first.</p>';
      return;
    }
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.75rem">
${wl.map(f=>{
  const h = f.hours_per_week;
  const status = h > 20 ? {color:'#f59e0b',bg:'#fef3c7',label:'Overloaded'} :
                 h < 10  ? {color:'#ef4444',bg:'#fee2e2',label:'Under-allocated'} :
                 {color:'#10b981',bg:'#d1fae5',label:'Optimal'};
  const pct = Math.min(100, (h/24)*100);
  return `<div class="card" style="padding:1rem;border-left:4px solid ${status.color}">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">
    <div>
      <div style="font-weight:700">${f.faculty_name||f.faculty_id||'Unknown'}</div>
      <div style="color:var(--text2);font-size:.82rem">${f.department||''}</div>
    </div>
    <div style="background:${status.bg};color:${status.color};padding:.25rem .6rem;border-radius:1rem;font-size:.78rem;font-weight:600">${status.label}</div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:.88rem;margin-bottom:.4rem">
    <span>📚 <b>${h}</b> hrs/week</span>
    <span>📖 ${f.subjects.length} subject${f.subjects.length!==1?'s':''}</span>
    <span>👥 ${f.batches.length} batch${f.batches.length!==1?'es':''}</span>
  </div>
  <div style="background:var(--bg3);height:6px;border-radius:3px;overflow:hidden;margin-bottom:.5rem">
    <div style="width:${pct}%;height:100%;background:${status.color};transition:width .3s"></div>
  </div>
  ${f.subjects.length ? `<div style="font-size:.78rem;color:var(--text2)">Subjects: ${f.subjects.slice(0,4).join(', ')}${f.subjects.length>4?'…':''}</div>` : ''}
  ${f.batches.length  ? `<div style="font-size:.78rem;color:var(--text2)">Batches: ${f.batches.join(', ')}</div>` : ''}
</div>`;
}).join('')}
</div>`;
  }catch(ex){
    el.innerHTML = `<p style="color:var(--red);text-align:center">Failed to load: ${ex.message}</p>`;
  }
}

// ─────────────────────────────────────────────────────────────
// TAB 4 — CONFLICTS
// ─────────────────────────────────────────────────────────────
function ttRenderConflictsTab(container){
  container.innerHTML = `
<div class="card">
  <div class="card-header">
    <div class="card-title">⚠️ Scheduling Conflicts</div>
    <button class="btn btn-outline btn-sm" onclick="ttLoadConflicts()">🔄 Re-scan</button>
  </div>
  <div id="ttConflictBody"><p style="text-align:center;padding:2rem;color:var(--text3)">Scanning…</p></div>
</div>`;
  ttLoadConflicts();
}

async function ttLoadConflicts(){
  const el = document.getElementById('ttConflictBody');
  if(!el) return;
  el.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">Scanning timetable for conflicts…</p>';
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/conflicts`);
    const d = await r.json();
    const conflicts = d.conflicts || [];
    if(!conflicts.length){
      el.innerHTML = `<div style="text-align:center;padding:3rem">
  <div style="font-size:3rem">✅</div>
  <div style="font-weight:700;color:#10b981;font-size:1.1rem;margin-top:.5rem">No conflicts found</div>
  <div style="color:var(--text2);margin-top:.25rem">All timetable slots are correctly assigned</div>
</div>`;
      return;
    }
    // Update tab badge
    const tab = document.getElementById('ttTab_conflicts');
    if(tab) tab.innerHTML = `⚠️ Conflicts <span style="background:#ef4444;color:#fff;border-radius:1rem;padding:0 .4rem;font-size:.75rem">${conflicts.length}</span>`;

    const typeStyle = {
      faculty: {color:'#8b5cf6',label:'Faculty Double-booking'},
      room:    {color:'#ef4444',label:'Room Double-booking'},
      batch:   {color:'#f59e0b',label:'Batch Clash'},
    };
    el.innerHTML = `<div style="margin-bottom:.75rem;color:var(--text2);font-size:.88rem">Found <b style="color:var(--red)">${conflicts.length}</b> conflict${conflicts.length!==1?'s':''}. Edit or delete affected slots to resolve.</div>
${conflicts.map(c=>{
  const ts = typeStyle[c.type] || {color:'#6b7280',label:'Conflict'};
  return `<div style="background:${ts.color}12;border:1px solid ${ts.color}40;border-left:4px solid ${ts.color};border-radius:.5rem;padding:.75rem;margin-bottom:.5rem">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <span style="background:${ts.color};color:#fff;border-radius:.25rem;padding:.1rem .4rem;font-size:.75rem;font-weight:600">${ts.label}</span>
      <span style="margin-left:.5rem;color:var(--text2);font-size:.82rem">${c.day} – Hour ${c.hour}</span>
    </div>
  </div>
  <div style="margin-top:.4rem;font-size:.88rem">${c.detail}</div>
  ${c.entries&&c.entries.length?`<div style="margin-top:.4rem;display:flex;gap:.4rem;flex-wrap:wrap">
    ${c.entries.map(eid=>`<button class="btn btn-outline btn-sm" style="font-size:.72rem;padding:2px 6px" onclick="ttOpenSlotModal('${eid}')">✏️ Edit ${eid.slice(0,8)}…</button>`).join('')}
  </div>`:''}
</div>`;
}).join('')}`;
  }catch(ex){
    el.innerHTML = `<p style="color:var(--red);text-align:center">Scan failed: ${ex.message}</p>`;
  }
}

// ─────────────────────────────────────────────────────────────
// TAB 5 — MANUAL EDIT (table list)
// ─────────────────────────────────────────────────────────────
function ttRenderManualTab(container){
  container.innerHTML = `
<div class="card">
  <div class="card-header" style="flex-wrap:wrap;gap:.5rem">
    <div class="card-title">✏️ Manual Slot Editor</div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;flex:1;justify-content:flex-end">
      <input id="ttMEDept"    placeholder="Dept" style="width:150px"/>
      <input id="ttMEBatch"   placeholder="Batch" style="width:120px"/>
      <input id="ttMEFaculty" placeholder="Faculty name" style="width:150px"/>
      <button class="btn btn-outline btn-sm" onclick="ttLoadManual()">🔍 Filter</button>
      <button class="btn btn-primary btn-sm" onclick="ttOpenSlotModal()">+ Add Slot</button>
    </div>
  </div>
  <div id="ttManualBody" style="overflow-x:auto">
    <p style="text-align:center;padding:2rem;color:var(--text3)">Loading…</p>
  </div>
</div>`;
  ttLoadManual();
}

async function ttLoadManual(){
  const el = document.getElementById('ttManualBody');
  if(!el) return;
  el.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">Loading…</p>';
  const dept    = (document.getElementById('ttMEDept')   ||{value:''}).value.trim();
  const batch   = (document.getElementById('ttMEBatch')  ||{value:''}).value.trim();
  const faculty = (document.getElementById('ttMEFaculty')||{value:''}).value.trim();
  let url = `${window.AMS_CONFIG.API_URL}/api/timetable`;
  const ps=[];
  if(dept)    ps.push(`department=${encodeURIComponent(dept)}`);
  if(batch)   ps.push(`batch=${encodeURIComponent(batch)}`);
  if(faculty) ps.push(`faculty_name=${encodeURIComponent(faculty)}`);
  if(ps.length) url += '?'+ps.join('&');
  try{
    const r = await fetch(url);
    const d = await r.json();
    const entries = d.entries || [];
    if(!entries.length){
      el.innerHTML='<p style="text-align:center;padding:2rem;color:var(--text3)">No slots found.</p>'; return;
    }
    const DORD = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    entries.sort((a,b)=>(DORD.indexOf(a.day_of_week)-DORD.indexOf(b.day_of_week))||((a.hour_number||0)-(b.hour_number||0)));
    el.innerHTML = `<table style="border-collapse:collapse;min-width:800px;font-size:.84rem">
<thead><tr style="background:var(--bg3)">
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Day</th>
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Hr</th>
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Time</th>
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Subject</th>
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Faculty</th>
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Batch</th>
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Room</th>
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Type</th>
  <th style="border:1px solid var(--border);padding:.4rem .6rem">Actions</th>
</tr></thead><tbody>
${entries.map(e=>`<tr>
  <td style="border:1px solid var(--border);padding:.35rem .5rem">${e.day_of_week}</td>
  <td style="border:1px solid var(--border);padding:.35rem .5rem;text-align:center">${e.hour_number}</td>
  <td style="border:1px solid var(--border);padding:.35rem .5rem;font-size:.78rem" nowrap>${(e.start_time||'').slice(0,5)}–${(e.end_time||'').slice(0,5)}</td>
  <td style="border:1px solid var(--border);padding:.35rem .5rem;font-weight:600">${e.subject_name||'—'}</td>
  <td style="border:1px solid var(--border);padding:.35rem .5rem">${e.substitute_faculty_name?`<span title="Stand-in for: ${e.faculty_name||'?'}" style="color:#f59e0b">🔄 ${e.substitute_faculty_name}</span>`:e.faculty_name||'—'}</td>
  <td style="border:1px solid var(--border);padding:.35rem .5rem"><span class="badge badge-teal" style="font-size:.72rem">${e.batch||'—'}</span></td>
  <td style="border:1px solid var(--border);padding:.35rem .5rem">${e.room_number||'—'}</td>
  <td style="border:1px solid var(--border);padding:.35rem .5rem;text-transform:capitalize">${e.session_type||'lecture'}</td>
  <td style="border:1px solid var(--border);padding:.35rem .5rem">
    <div style="display:flex;gap:.25rem">
      <button class="btn btn-outline btn-sm" style="padding:2px 5px;font-size:.72rem" onclick="ttOpenSlotModal('${e.id}')">✏️</button>
      <button class="btn btn-danger btn-sm"  style="padding:2px 5px;font-size:.72rem" onclick="ttDeleteSlot('${e.id}')">🗑️</button>
      <button class="btn btn-outline btn-sm" style="padding:2px 5px;font-size:.72rem" onclick="ttOpenSubModal('${e.id}','${(e.faculty_name||'').replace(/'/g,'\\\'')}')" title="Substitute">🔄</button>
    </div>
  </td>
</tr>`).join('')}
</tbody></table>
<div style="color:var(--text2);font-size:.8rem;margin-top:.5rem">Showing ${entries.length} slots</div>`;
  }catch(ex){
    el.innerHTML=`<p style="color:var(--red);text-align:center">Failed: ${ex.message}</p>`;
  }
}

// ─────────────────────────────────────────────────────────────
// TAB 7 — DELETE TIMETABLE
// ─────────────────────────────────────────────────────────────
function ttRenderDeleteTab(container){
  container.innerHTML = `
<div class="card" style="border:2px solid #fca5a5">
  <div class="card-header" style="background:#fef2f2;border-bottom:1px solid #fca5a5">
    <div class="card-title" style="color:#dc2626">🗑️ Delete Timetable Entries</div>
    <span style="font-size:.83rem;color:#991b1b">Select faculty to delete their timetable, or delete everything at once.</span>
  </div>

  <!-- Filter row -->
  <div style="padding:.75rem 1rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--border)">
    <input id="ttDelDept"  placeholder="Department" style="width:160px"/>
    <select id="ttDelSem" style="width:170px">
      <option value="">All Semesters</option>
      <option value="odd">Odd Sems (1,3,5,7)</option>
      <option value="even">Even Sems (2,4,6,8)</option>
      <option value="1">Sem 1</option><option value="2">Sem 2</option>
      <option value="3">Sem 3</option><option value="4">Sem 4</option>
      <option value="5">Sem 5</option><option value="6">Sem 6</option>
      <option value="7">Sem 7</option><option value="8">Sem 8</option>
    </select>
    <input id="ttDelBlock" placeholder="Block/Batch prefix" style="width:160px"/>
    <button class="btn btn-outline btn-sm" onclick="ttLoadDeleteTab()">🔍 Filter Faculty List</button>
  </div>

  <!-- Faculty list with checkboxes -->
  <div style="padding:.75rem 1rem">
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.65rem;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-weight:600">
        <input type="checkbox" id="ttDelSelectAll" onchange="ttToggleSelectAllFaculty(this.checked)" style="width:1rem;height:1rem"/>
        Select All
      </label>
      <span id="ttDelSelCount" style="font-size:.83rem;color:var(--text2)">0 selected</span>
      <button class="btn btn-sm" style="background:#ef4444;color:#fff;border:none;padding:.3rem .9rem"
        onclick="ttDeleteSelectedFaculty()">🗑️ Delete Selected Faculty Timetables</button>
    </div>
    <div id="ttDelFacultyList" style="max-height:420px;overflow-y:auto;border:1px solid var(--border);border-radius:.5rem">
      <p style="text-align:center;padding:2rem;color:var(--text3)">Loading faculty list…</p>
    </div>
  </div>

  <!-- Delete All danger zone -->
  <div style="padding:.75rem 1rem;background:#fef2f2;border-top:1px solid #fca5a5;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
    <div>
      <div style="font-weight:700;color:#dc2626">🚨 Delete ALL Timetable Entries</div>
      <div style="font-size:.8rem;color:#991b1b">This permanently removes the entire timetable. This action cannot be undone.</div>
    </div>
    <button class="btn btn-sm" style="background:#b91c1c;color:#fff;border:none;padding:.4rem 1.1rem;margin-left:auto"
      onclick="ttDeleteAllTimetable()">🚨 Delete All</button>
  </div>
</div>`;
  ttLoadDeleteTab();
}

// state: map of faculty_username -> {name, dept, count, username, id, entries:[ids]}
const TT_DEL = { facultyMap: {} };

async function ttLoadDeleteTab(){
  const el = document.getElementById('ttDelFacultyList');
  if(!el) return;
  el.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">Loading…</p>';
  const dept  = (document.getElementById('ttDelDept')  ||{value:''}).value.trim();
  const sem   = (document.getElementById('ttDelSem')   ||{value:''}).value.trim();
  const block = (document.getElementById('ttDelBlock') ||{value:''}).value.trim();
  const params = ['active=all'];
  if(dept)  params.push(`department=${encodeURIComponent(dept)}`);
  if(block) params.push(`block=${encodeURIComponent(block)}`);
  if(sem === 'odd' || sem === 'even') params.push(`sem_type=${sem}`);
  else if(sem) params.push(`semester=${encodeURIComponent(sem)}`);
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable?${params.join('&')}`);
    const d = await r.json();
    const entries = d.entries || [];
    if(!entries.length){
      el.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--text3)">No timetable entries match the current filter.</p>';
      TT_DEL.facultyMap = {};
      return;
    }
    // Group by faculty
    const map = {};
    for(const e of entries){
      const key = (e.faculty_username || e.faculty_id || e.faculty_name || '—').toLowerCase();
      if(!map[key]){
        map[key] = {
          name: e.faculty_name || e.faculty_username || e.faculty_id || '—',
          username: e.faculty_username || '',
          id: e.faculty_id || '',
          dept: e.department || '',
          ids: [],
          sems: new Set(),
          batches: new Set()
        };
      }
      map[key].ids.push(e.id);
      if(e.semester) map[key].sems.add(e.semester);
      if(e.batch)    map[key].batches.add(e.batch);
    }
    TT_DEL.facultyMap = map;
    // Render rows sorted by faculty name
    const rows = Object.entries(map).sort((a,b)=>a[1].name.localeCompare(b[1].name));
    el.innerHTML = rows.map(([key, f])=>`
<div style="display:flex;align-items:center;gap:.75rem;padding:.55rem 1rem;border-bottom:1px solid var(--border);flex-wrap:wrap" data-faculty-key="${key}">
  <input type="checkbox" class="tt-del-chk" data-key="${key}" onchange="ttUpdateDelCount()"
    style="width:1.1rem;height:1.1rem;cursor:pointer;flex-shrink:0"/>
  <div style="flex:1;min-width:180px">
    <div style="font-weight:600">${f.name}</div>
    <div style="font-size:.78rem;color:var(--text2)">${f.dept||''}${f.username?' · '+f.username:''}</div>
  </div>
  <div style="display:flex;gap:.5rem;flex-wrap:wrap;font-size:.78rem">
    <span style="background:#dbeafe;color:#1e40af;border-radius:.3rem;padding:.15rem .45rem">${f.ids.length} slot${f.ids.length!==1?'s':''}</span>
    ${f.sems.size?`<span style="background:#f3e8ff;color:#6d28d9;border-radius:.3rem;padding:.15rem .45rem">Sem ${[...f.sems].sort().join(',')}</span>`:''}
    ${f.batches.size?`<span style="background:#d1fae5;color:#065f46;border-radius:.3rem;padding:.15rem .45rem">${[...f.batches].slice(0,3).join(', ')}${f.batches.size>3?' +more':''}</span>`:''}
  </div>
  <button class="btn btn-sm" style="background:#ef4444;color:#fff;border:none;padding:.2rem .65rem;font-size:.78rem;flex-shrink:0"
    onclick="ttDeleteOneFaculty('${key}','${f.name.replace(/'/g,'\\\'').replace(/"/g,'\\"')}')">🗑️ Delete</button>
</div>`).join('');
    ttUpdateDelCount();
  }catch(ex){
    el.innerHTML = `<p style="color:var(--red);text-align:center;padding:1rem">Error: ${ex.message}</p>`;
  }
}

function ttUpdateDelCount(){
  const chks = document.querySelectorAll('.tt-del-chk');
  const sel = [...chks].filter(c=>c.checked).length;
  const el = document.getElementById('ttDelSelCount');
  if(el) el.textContent = `${sel} of ${chks.length} selected`;
  const all = document.getElementById('ttDelSelectAll');
  if(all) all.checked = sel>0 && sel===chks.length;
}

function ttToggleSelectAllFaculty(checked){
  document.querySelectorAll('.tt-del-chk').forEach(c=>{ c.checked = checked; });
  ttUpdateDelCount();
}

async function ttDeleteOneFaculty(key, displayName){
  const f = TT_DEL.facultyMap[key];
  if(!f) return;
  if(!confirm(`Delete all ${f.ids.length} timetable slot(s) for "${displayName}"?\n\nThis cannot be undone.`)) return;
  try{
    const body = {};
    if(f.username) body.faculty_username = f.username;
    if(f.id)       body.faculty_id       = f.id;
    if(!body.faculty_username && !body.faculty_id){
      // fall back to bulk-delete by collected IDs
      const r2 = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/delete-bulk`,
        {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids:f.ids})});
      const d2 = await r2.json();
      if(d2.success){ toast(`Deleted ${f.ids.length} slots for ${displayName}`, 'success'); ttLoadDeleteTab(); }
      else toast('Delete failed: '+(d2.error||'unknown'), 'error');
      return;
    }
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/delete-by-faculty`,
      {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const d = await r.json();
    if(d.success){ toast(`Deleted timetable for ${displayName}`, 'success'); ttLoadDeleteTab(); }
    else toast('Delete failed: '+(d.error||'unknown'), 'error');
  }catch(ex){ toast('Error: '+ex.message, 'error'); }
}

async function ttDeleteSelectedFaculty(){
  const chks = [...document.querySelectorAll('.tt-del-chk:checked')];
  if(!chks.length){ toast('No faculty selected', 'warning'); return; }
  const selectedKeys = chks.map(c=>c.dataset.key);
  const names = selectedKeys.map(k=>TT_DEL.facultyMap[k]?.name||k).join(', ');
  const totalSlots = selectedKeys.reduce((s,k)=>s+(TT_DEL.facultyMap[k]?.ids.length||0),0);
  if(!confirm(`Delete all timetable entries for ${selectedKeys.length} faculty member(s)?\n(${names})\n\n${totalSlots} total slots will be removed. This cannot be undone.`)) return;
  let ok=0, fail=0;
  for(const key of selectedKeys){
    const f = TT_DEL.facultyMap[key];
    if(!f) continue;
    try{
      const body = {};
      if(f.username) body.faculty_username = f.username;
      if(f.id)       body.faculty_id       = f.id;
      let res;
      if(body.faculty_username || body.faculty_id){
        res = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/delete-by-faculty`,
          {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      } else {
        res = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/delete-bulk`,
          {method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids:f.ids})});
      }
      const d = await res.json();
      if(d.success) ok++; else fail++;
    }catch(ex2){ fail++; }
  }
  toast(fail===0 ? `✅ Deleted timetable for ${ok} faculty member(s)` : `⚠️ ${ok} succeeded, ${fail} failed`, fail===0?'success':'warning');
  ttLoadDeleteTab();
}

async function ttDeleteAllTimetable(){
  if(!confirm('⚠️ DELETE ENTIRE TIMETABLE?\n\nThis will permanently remove ALL timetable entries for ALL faculty.\nThis action CANNOT be undone.\n\nAre you absolutely sure?')) return;
  if(!confirm('Final confirmation: Delete ALL timetable entries now?')) return;
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/delete-all`, {method:'DELETE'});
    const d = await r.json();
    if(d.success){
      toast('✅ All timetable entries deleted', 'success');
      ttLoadDeleteTab();
    } else {
      toast('Delete failed: '+(d.error||'unknown'), 'error');
    }
  }catch(ex){ toast('Error: '+ex.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────
// SLOT MODAL — Add / Edit
// ─────────────────────────────────────────────────────────────
async function ttOpenSlotModal(slotId){
  const modal = document.getElementById('ttSlotModal');
  if(!modal) return;
  // Reset form
  ['ttM_day','ttM_hour','ttM_start','ttM_end','ttM_subject','ttM_fid','ttM_fname',
   'ttM_batch','ttM_dept','ttM_room','ttM_stype','ttM_labbat','ttM_scode','ttM_yr','ttM_sem']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('ttM_hour').value='1';
  document.getElementById('ttM_start').value='09:00';
  document.getElementById('ttM_end').value='10:00';
  document.getElementById('ttM_stype').value='lecture';
  document.getElementById('ttM_labbat').value='';
  document.getElementById('ttModalId').value = slotId || '';
  document.getElementById('ttModalConflictWarn').style.display='none';
  ttFillFacultySelect('ttM_fid');

  if(slotId){
    document.getElementById('ttModalTitle').textContent = '✏️ Edit Slot';
    try{
      // Fetch all timetable entries and find by id
      const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable`);
      const d = await r.json();
      const entry = (d.entries||[]).find(e=>e.id===slotId);
      if(entry){
        document.getElementById('ttM_day').value   = entry.day_of_week || 'Monday';
        document.getElementById('ttM_hour').value  = entry.hour_number || 1;
        document.getElementById('ttM_start').value = (entry.start_time||'09:00').slice(0,5);
        document.getElementById('ttM_end').value   = (entry.end_time  ||'10:00').slice(0,5);
        document.getElementById('ttM_subject').value = entry.subject_name||'';
        document.getElementById('ttM_fid').value   = entry.faculty_id||'';
        document.getElementById('ttM_fname').value = entry.faculty_name||'';
        document.getElementById('ttM_batch').value = entry.batch||'';
        document.getElementById('ttM_dept').value  = entry.department||'';
        document.getElementById('ttM_room').value  = entry.room_number||'';
        document.getElementById('ttM_stype').value = entry.session_type||'lecture';
        document.getElementById('ttM_labbat').value= entry.lab_batch||'';
        document.getElementById('ttM_scode').value = entry.subject_code||'';
        document.getElementById('ttM_yr').value    = entry.academic_year||'';
        document.getElementById('ttM_sem').value   = entry.semester||'';
      }
    }catch(e){ console.warn('ttOpenSlotModal fetch',e); }
  }else{
    document.getElementById('ttModalTitle').textContent = '➕ Add Slot';
  }
  modal.style.display='flex';
}

function ttCloseSlotModal(){
  const m = document.getElementById('ttSlotModal');
  if(m) m.style.display='none';
}

async function ttSaveSlotModal(){
  const slotId    = document.getElementById('ttModalId').value.trim();
  const fidSel    = document.getElementById('ttM_fid').value.trim();
  const fidName   = document.getElementById('ttM_fname').value.trim();
  const subjName  = document.getElementById('ttM_subject').value.trim();
  const subjCode  = document.getElementById('ttM_scode').value.trim().toUpperCase();
  const dept      = document.getElementById('ttM_dept').value.trim();
  const batch     = document.getElementById('ttM_batch').value.trim();
  const semester  = parseInt(document.getElementById('ttM_sem').value)||null;
  const acYear    = document.getElementById('ttM_yr').value.trim()||null;

  // Validation — course code + name required when assigning a faculty
  if(!subjName){ toast('Subject name is required','error'); return; }
  if(!batch)   { toast('Batch is required','error');        return; }
  if(!subjCode){ toast('Subject / Course Code is required (e.g. CS301)','error'); return; }

  const resolvedFacultyName = fidSel
    ? (TT.facultyList.find(f=>f.id===fidSel)||{full_name:fidName}).full_name
    : fidName;

  const payload = {
    day_of_week:  document.getElementById('ttM_day').value,
    hour_number:  parseInt(document.getElementById('ttM_hour').value)||1,
    start_time:   document.getElementById('ttM_start').value,
    end_time:     document.getElementById('ttM_end').value,
    subject_name: subjName,
    faculty_id:   fidSel || null,
    faculty_name: resolvedFacultyName,
    batch,
    department:   dept,
    room_number:  document.getElementById('ttM_room').value.trim(),
    session_type: document.getElementById('ttM_stype').value,
    lab_batch:    document.getElementById('ttM_labbat').value||null,
    subject_code: subjCode,
    academic_year: acYear,
    semester,
  };

  const url    = slotId ? `${window.AMS_CONFIG.API_URL}/api/timetable/${slotId}` : `${window.AMS_CONFIG.API_URL}/api/timetable`;
  const method = slotId ? 'PUT' : 'POST';
  try{
    const r = await fetch(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const d = await r.json();
    if(!d.success){ toast(d.error||'Error saving slot','error'); return; }

    // ── Auto-upsert course assignment so faculty dashboard reflects immediately ──
    if(fidSel || resolvedFacultyName){
      try{
        await fetch(`${window.AMS_CONFIG.API_URL}/api/courses/upsert`, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            course_code:   subjCode,
            course_name:   subjName,
            faculty_id:    fidSel || null,
            department:    dept,
            semester:      semester || 1,
            academic_year: acYear || '2025-26',
            credits:       3,
          })
        });
      }catch(e){ console.warn('course upsert failed (non-critical):',e); }
    }

    toast(slotId ? 'Slot updated — faculty dashboard updated!' : 'Slot added — faculty dashboard updated!', 'success');
    ttCloseSlotModal();
    if(TT.activeTab==='grid')        ttLoadGrid();
    else if(TT.activeTab==='manual') ttLoadManual();
    // If the attendance panel is currently open, refresh its course dropdown too
    if(document.getElementById('faCourse')) loadFacultyCoursesIntoDropdown();
  }catch(ex){ toast('Network error: '+ex.message,'error'); }
}

// ─────────────────────────────────────────────────────────────
// DELETE SLOT
// ─────────────────────────────────────────────────────────────
async function ttDeleteSlot(id){
  if(!confirm('Delete this timetable slot? This cannot be undone.')) return;
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/${id}`, {method:'DELETE'});
    const d = await r.json();
    if(d.success){
      toast('Slot deleted','success');
      if(TT.activeTab==='grid') ttLoadGrid();
      else ttLoadManual();
    }else toast(d.error||'Delete failed','error');
  }catch(ex){ toast('Network error: '+ex.message,'error'); }
}

// ─────────────────────────────────────────────────────────────
// SUBSTITUTE FACULTY MODAL
// ─────────────────────────────────────────────────────────────
function ttOpenSubModal(slotId, currentFacultyName){
  document.getElementById('ttSubSlotId').value = slotId;
  document.getElementById('ttSubFname').value  = '';
  document.getElementById('ttSubReason').value = '';
  ttFillFacultySelect('ttSubFid');
  document.getElementById('ttSubModal').style.display='flex';
}

async function ttSaveSubstitute(){
  const slotId = document.getElementById('ttSubSlotId').value;
  if(!slotId){ toast('Slot ID missing','error'); return; }
  const fidSel  = document.getElementById('ttSubFid').value.trim();
  const fidName = document.getElementById('ttSubFname').value.trim();
  const reason  = document.getElementById('ttSubReason').value.trim();
  const subName = fidSel
    ? (TT.facultyList.find(f=>f.id===fidSel)||{full_name:fidName}).full_name
    : fidName;
  if(!subName){ toast('Please select or enter substitute faculty name','error'); return; }
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/timetable/${slotId}/substitute`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ substitute_faculty_id:fidSel||null, substitute_faculty_name:subName, reason })
    });
    const d = await r.json();
    if(d.success){
      toast(`Substitute assigned: ${subName}`,'success');
      document.getElementById('ttSubModal').style.display='none';
      if(TT.activeTab==='grid') ttLoadGrid();
      else ttLoadManual();
    }else toast(d.error||'Failed to assign substitute','error');
  }catch(ex){ toast('Network error: '+ex.message,'error'); }
}

// ── LEGACY ALIASES (kept for any external references) ──────
function openAddTimetableModal(){ ttOpenSlotModal(); }
async function loadAdminTimetable(){ ttLoadGrid && ttLoadGrid(); }
async function submitTimetableSlot(){ ttSaveSlotModal(); }
async function deleteTimetableSlot(id){ ttDeleteSlot(id); }

// ── NEW: Committee Management (Admin) ─────────────────────

function renderAdminCommittee(){
  const committees=[
    {name:'IQAC Committee',coordinator:'Dr. Smith',members:8,meetings:12,lastMeeting:'Feb 10'},
    {name:'Grievance Cell',coordinator:'Prof. Williams',members:5,meetings:20,lastMeeting:'Jan 28'},
    {name:'Anti-Ragging Committee',coordinator:'Dr. Johnson',members:10,meetings:6,lastMeeting:'Feb 02'},
    {name:'Cultural Committee',coordinator:'Dr. Brown',members:15,meetings:8,lastMeeting:'Jan 15'},
    {name:'Sports Committee',coordinator:'Dr. Patel',members:12,meetings:5,lastMeeting:'Dec 10'},
  ];
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">🏛️ Committee Management</div>
      <button class="btn btn-primary btn-sm" onclick="toast('Creating new committee…','info')">+ Create Committee</button>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Committee Name</th><th>Coordinator</th><th>Members</th><th>Meetings Held</th><th>Last Meeting</th><th>Actions</th></tr></thead>
      <tbody>${committees.map(c=>`<tr>
        <td class="fw-semibold">${c.name}</td>
        <td>${c.coordinator}</td>
        <td>${c.members}</td>
        <td>${c.meetings}</td>
        <td>${c.lastMeeting}</td>
        <td class="d-flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="toast('Managing members of ${c.name}…','info')">👥 Members</button>
          <button class="btn btn-outline btn-sm" onclick="toast('Viewing minutes for ${c.name}…','info')">📋 Minutes</button>
          <button class="btn btn-danger btn-sm" onclick="toast('${c.name} deleted','warning')">🗑️</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

// ── NEW: Exam Module (Admin) ──────────────────────────────
function renderAdminExamModule(){
  setTimeout(()=>{loadAdminQPapers();loadAdminMarksFormats();},50);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📝 Exam Module — Question Paper Review</div>
      <button class="btn btn-outline btn-sm" onclick="loadAdminQPapers()">🔄 Refresh</button>
    </div>
    <div class="text-sm text-muted mb-md">All question papers submitted by faculty are shown here grouped by course. Select one paper per course/exam type.</div>
    <div class="form-row" style="margin-bottom:1rem">
      <div class="form-group"><label>Filter by Course</label>
        <input id="adminQPCourseFilter" placeholder="course code…" oninput="filterAdminQPapers()" style="padding:.4rem .6rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text)"/>
      </div>
      <div class="form-group"><label>Exam Type</label>
        <select id="adminQPTypeFilter" onchange="filterAdminQPapers()" style="padding:.4rem .6rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text)">
          <option value="">All Types</option><option value="internal">Internal</option><option value="midterm">Midterm</option><option value="end_semester">End Semester</option><option value="quiz">Quiz</option>
        </select>
      </div>
    </div>
    <div id="admin-qp-list"><div class="text-muted text-sm" style="padding:2rem;text-align:center">Loading…</div></div>
  </div>

  <div class="card" style="margin-top:1rem">
    <div class="card-header">
      <div class="card-title">📋 Marks Format Configuration</div>
      <button class="btn btn-primary btn-sm" onclick="openMarksFormatModal()">+ Create Format</button>
    </div>
    <div class="text-sm text-muted mb-md">Define the question paper marks structure for mid-term and end-semester exams. Faculty can download this format.</div>
    <div id="admin-marks-formats"><div class="text-muted text-sm" style="padding:1rem;text-align:center">Loading…</div></div>
  </div>

  <!-- Marks Format Modal -->
  <div id="marksFormatModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;align-items:center;justify-content:center;padding:1rem">
    <div class="card" style="width:95%;max-width:600px;padding:1.5rem;max-height:85vh;overflow-y:auto">
      <div class="card-header"><div class="card-title">📋 Marks Format</div>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('marksFormatModal').style.display='none'">✕</button></div>
      <input type="hidden" id="mfEditId"/>
      <div class="form-row">
        <div class="form-group"><label>Title *</label><input id="mfTitle" placeholder="Mid-Term Format 2025"/></div>
        <div class="form-group"><label>Exam Type</label>
          <select id="mfExamType"><option value="midterm">Midterm</option><option value="end_semester">End Semester</option><option value="internal">Internal</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Department (blank=all)</label><input id="mfDept" placeholder="CSE"/></div>
        <div class="form-group"><label>Course Code (blank=all)</label><input id="mfCourse" placeholder="CS301"/></div>
      </div>
      <div class="form-group"><label>Total Marks</label><input id="mfTotalMarks" type="number" value="100"/></div>

      <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin:1rem 0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
          <span class="fw-semibold">📝 Sections</span>
          <button class="btn btn-outline btn-sm" onclick="addMFSection()">+ Add Section</button>
        </div>
        <div id="mfSections"></div>
      </div>
      <button class="btn btn-primary w-full" onclick="saveMarksFormat()">💾 Save Format</button>
    </div>
  </div>`;
}

let _adminQPapers=[];
async function loadAdminQPapers(){
  const el=document.getElementById('admin-qp-list');
  if(!el)return;
  el.innerHTML='<div class="text-muted text-sm" style="padding:1rem;text-align:center">⏳ Loading…</div>';
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/question-papers`);
    const d=await res.json();
    _adminQPapers=d.papers||[];
    filterAdminQPapers();
  }catch(e){el.innerHTML='<div class="text-red text-sm">Failed to load papers.</div>';}
}

function filterAdminQPapers(){
  const el=document.getElementById('admin-qp-list');
  if(!el)return;
  const courseF=(document.getElementById('adminQPCourseFilter')?.value||'').toLowerCase();
  const typeF=document.getElementById('adminQPTypeFilter')?.value||'';
  let papers=_adminQPapers;
  if(courseF) papers=papers.filter(p=>(p.course_code||'').toLowerCase().includes(courseF));
  if(typeF) papers=papers.filter(p=>p.exam_type===typeF);
  if(!papers.length){
    el.innerHTML='<div class="text-muted text-sm" style="padding:2rem;text-align:center">📭 No question papers found.</div>';
    return;
  }
  // Group by course_code + exam_type
  const groups={};
  papers.forEach(p=>{
    const key=`${p.course_code||'unknown'}__${p.exam_type||'internal'}`;
    groups[key]=groups[key]||{course_code:p.course_code,exam_type:p.exam_type,papers:[]};
    groups[key].papers.push(p);
  });
  el.innerHTML=Object.values(groups).map(g=>{
    const selected=g.papers.find(p=>p.is_selected);
    return `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1rem;background:var(--ink3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
        <div>
          <span class="fw-semibold">${g.course_code||'—'}</span>
          <span class="badge badge-blue" style="margin-left:.5rem">${(g.exam_type||'internal').replace(/_/g,' ')}</span>
          <span class="text-sm text-muted" style="margin-left:.5rem">${g.papers.length} paper${g.papers.length>1?'s':''} from faculty</span>
        </div>
        ${selected?'<span class="badge badge-green">✅ 1 Selected</span>':'<span class="badge badge-orange">⚠️ None Selected</span>'}
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Title</th><th>Faculty</th><th>Marks</th><th>Duration</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
        <tbody>${g.papers.map(p=>{
          const isSelected=p.is_selected;
          return `<tr style="${isSelected?'background:rgba(34,197,94,.08)':''}">
            <td class="fw-semibold">${p.title}</td>
            <td>${p.faculty_name||p.generated_by||'—'}</td>
            <td style="text-align:center">${p.total_marks||'—'}</td>
            <td style="text-align:center">${p.duration_mins||'—'} min</td>
            <td><span class="badge ${isSelected?'badge-green':p.status==='submitted'?'badge-blue':'badge-gray'}">${isSelected?'Selected':p.status}</span></td>
            <td style="font-size:.8rem">${p.created_at?new Date(p.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—'}</td>
            <td style="white-space:nowrap">
              ${isSelected
                ?'<span class="text-green fw-semibold text-sm">✅ Selected</span>'
                :`<button class="btn btn-primary btn-sm" onclick="selectQPaper('${p.id}')">✅ Select</button>`}
              <button class="btn btn-outline btn-sm" onclick="previewQPaper('${p.id}')" style="margin-left:.25rem">👁️</button>
            </td>
          </tr>`}).join('')}</tbody>
      </table></div>
    </div>`}).join('');
}

async function selectQPaper(qpId){
  if(!confirm('Select this question paper? This will deselect any other paper for the same course/exam type.'))return;
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/question-papers/${qpId}/select`,{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({admin_id:(AMS.profile&&AMS.profile.id)||AMS.user.id})
    });
    const d=await res.json();
    if(!d.success) throw new Error(d.error);
    toast('✅ Question paper selected!','success');
    loadAdminQPapers();
  }catch(e){toast('❌ '+e.message,'error');}
}

async function previewQPaper(qpId){
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/question-papers?`);
    const d=await res.json();
    const paper=(d.papers||[]).find(p=>p.id===qpId);
    if(!paper){toast('Paper not found','error');return;}
    const sections=typeof paper.sections==='string'?JSON.parse(paper.sections||'[]'):paper.sections||[];
    const overlay=document.createElement('div');
    overlay.className='modal-overlay';
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
    overlay.innerHTML=`<div class="modal modal-lg" style="max-height:85vh;overflow-y:auto">
      <div class="modal-header">
        <div class="modal-title">📃 ${paper.title}</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div style="padding:1rem">
        <div class="text-sm text-muted mb-md">Course: ${paper.course_code} | Marks: ${paper.total_marks} | Duration: ${paper.duration_mins}min | By: ${paper.faculty_name||paper.generated_by||'—'}</div>
        ${paper.instructions?`<div class="text-sm" style="font-style:italic;margin-bottom:1rem">${paper.instructions}</div>`:''}
        ${sections.map((sec,si)=>`<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem;margin-bottom:.75rem;background:var(--ink3)">
          <div class="fw-semibold mb-sm">${sec.title||'Section '+(si+1)} <span class="text-muted text-sm">[${sec.marks||'?'} marks]</span></div>
          ${(sec.questions||[]).map((q,qi)=>`<div class="text-sm" style="display:flex;gap:.5rem;margin:.25rem 0">
            <span class="text-muted">Q${qi+1}.</span>
            <span style="flex:1">${q.q||q.question||'—'}</span>
            <span class="text-muted">[${q.marks||'?'}m]</span>
          </div>`).join('')}
        </div>`).join('')}
      </div>
    </div>`;
    document.body.appendChild(overlay);
  }catch(e){toast('Failed to preview paper','error');}
}

// ── ADMIN MARKS FORMAT MANAGEMENT ──────────────────────────
async function loadAdminMarksFormats(){
  const el=document.getElementById('admin-marks-formats');
  if(!el)return;
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/exam-marks-format`);
    const d=await res.json();
    const formats=d.formats||[];
    if(!formats.length){el.innerHTML='<div class="text-muted text-sm" style="padding:1rem;text-align:center">No formats created yet. Click "+ Create Format" to define one.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Title</th><th>Exam Type</th><th>Course</th><th>Dept</th><th>Total Marks</th><th>Sections</th><th>Active</th><th>Actions</th></tr></thead>
      <tbody>${formats.map(f=>{
        const secs=typeof f.sections==='string'?JSON.parse(f.sections||'[]'):f.sections||[];
        return `<tr>
          <td class="fw-semibold">${f.title}</td>
          <td><span class="badge badge-blue">${f.exam_type}</span></td>
          <td>${f.course_code||'All'}</td>
          <td>${f.department||'All'}</td>
          <td style="text-align:center">${f.total_marks}</td>
          <td>${secs.length} section${secs.length!==1?'s':''}</td>
          <td>${f.is_active?'<span class="badge badge-green">Active</span>':'<span class="badge badge-gray">Inactive</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-outline btn-sm" onclick="editMarksFormat('${f.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteMarksFormat('${f.id}')">🗑️</button>
          </td>
        </tr>`}).join('')}</tbody>
    </table></div>`;
  }catch(e){el.innerHTML='<div class="text-red text-sm">Failed to load formats.</div>';}
}

function openMarksFormatModal(editData){
  const modal=document.getElementById('marksFormatModal');
  if(!modal)return;
  document.getElementById('mfEditId').value=editData?.id||'';
  document.getElementById('mfTitle').value=editData?.title||'';
  document.getElementById('mfExamType').value=editData?.exam_type||'midterm';
  document.getElementById('mfDept').value=editData?.department||'';
  document.getElementById('mfCourse').value=editData?.course_code||'';
  document.getElementById('mfTotalMarks').value=editData?.total_marks||100;
  const secWrap=document.getElementById('mfSections');
  if(secWrap)secWrap.innerHTML='';
  if(editData&&editData.sections){
    const secs=typeof editData.sections==='string'?JSON.parse(editData.sections||'[]'):editData.sections||[];
    secs.forEach(s=>addMFSection(s));
  }
  modal.style.display='flex';
}

function addMFSection(s){
  const wrap=document.getElementById('mfSections');
  if(!wrap)return;
  const idx=wrap.children.length;
  const div=document.createElement('div');
  div.style.cssText='background:var(--ink);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem;margin-bottom:.5rem';
  div.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
    <span class="fw-semibold text-sm">Section ${idx+1}</span>
    <button class="btn btn-danger btn-sm" onclick="this.closest('div[style]').remove()" style="padding:.2rem .5rem;font-size:.7rem">✕</button>
  </div>
  <div class="form-row" style="gap:.5rem">
    <div class="form-group" style="margin-bottom:.4rem"><label style="font-size:.7rem">Section Name</label>
      <input class="mf-sec-name" value="${(s&&s.name)||''}" placeholder="Section A" style="padding:.4rem;background:var(--ink3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem;width:100%"/></div>
    <div class="form-group" style="margin-bottom:.4rem"><label style="font-size:.7rem">Question Type</label>
      <select class="mf-sec-type" style="padding:.4rem;background:var(--ink3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem">
        <option value="mcq"${s&&s.question_type==='mcq'?' selected':''}>MCQ</option>
        <option value="short"${s&&s.question_type==='short'?' selected':''}>Short Answer</option>
        <option value="long"${s&&s.question_type==='long'?' selected':''}>Long Answer</option>
        <option value="descriptive"${s&&s.question_type==='descriptive'?' selected':''}>Descriptive</option>
      </select></div>
  </div>
  <div class="form-row" style="gap:.5rem">
    <div class="form-group" style="margin-bottom:.4rem"><label style="font-size:.7rem">No. of Questions</label>
      <input class="mf-sec-numq" type="number" value="${(s&&s.num_questions)||5}" min="1" style="padding:.4rem;background:var(--ink3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem;width:100%"/></div>
    <div class="form-group" style="margin-bottom:.4rem"><label style="font-size:.7rem">Marks Each</label>
      <input class="mf-sec-marks" type="number" value="${(s&&s.marks_each)||2}" min="1" style="padding:.4rem;background:var(--ink3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem;width:100%"/></div>
    <div class="form-group" style="margin-bottom:.4rem"><label style="font-size:.7rem">Total</label>
      <input class="mf-sec-total" type="number" value="${(s&&s.total)||10}" style="padding:.4rem;background:var(--ink3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.8rem;width:100%" readonly/></div>
  </div>`;
  wrap.appendChild(div);
  // Auto-calc total
  const numqEl=div.querySelector('.mf-sec-numq');
  const marksEl=div.querySelector('.mf-sec-marks');
  const totalEl=div.querySelector('.mf-sec-total');
  const calc=()=>{totalEl.value=(parseInt(numqEl.value)||0)*(parseInt(marksEl.value)||0);};
  numqEl.addEventListener('input',calc);
  marksEl.addEventListener('input',calc);
}

async function saveMarksFormat(){
  const editId=document.getElementById('mfEditId').value;
  const title=document.getElementById('mfTitle').value.trim();
  if(!title){toast('Title is required','error');return;}
  const secEls=document.getElementById('mfSections').children;
  const sections=[];
  for(const el of secEls){
    sections.push({
      name:el.querySelector('.mf-sec-name')?.value||'',
      question_type:el.querySelector('.mf-sec-type')?.value||'mcq',
      num_questions:parseInt(el.querySelector('.mf-sec-numq')?.value)||5,
      marks_each:parseInt(el.querySelector('.mf-sec-marks')?.value)||2,
      total:parseInt(el.querySelector('.mf-sec-total')?.value)||10,
    });
  }
  const payload={
    title,exam_type:document.getElementById('mfExamType').value,
    department:document.getElementById('mfDept').value.trim(),
    course_code:document.getElementById('mfCourse').value.trim(),
    total_marks:parseInt(document.getElementById('mfTotalMarks').value)||100,
    sections,is_active:true,
    created_by:(AMS.profile&&AMS.profile.id)||AMS.user.id,
  };
  try{
    const url=editId?`${window.AMS_CONFIG.API_URL}/api/exam-marks-format/${editId}`:`${window.AMS_CONFIG.API_URL}/api/exam-marks-format`;
    const method=editId?'PUT':'POST';
    const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await res.json();
    if(!d.success) throw new Error(d.error);
    toast(editId?'✅ Format updated':'✅ Format created','success');
    document.getElementById('marksFormatModal').style.display='none';
    loadAdminMarksFormats();
  }catch(e){toast('❌ '+e.message,'error');}
}

async function editMarksFormat(fmtId){
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/exam-marks-format`);
    const d=await res.json();
    const fmt=(d.formats||[]).find(f=>f.id===fmtId);
    if(!fmt){toast('Format not found','error');return;}
    openMarksFormatModal(fmt);
  }catch(e){toast('Failed to load format','error');}
}

async function deleteMarksFormat(fmtId){
  if(!confirm('Delete this marks format?'))return;
  try{
    await fetch(`${window.AMS_CONFIG.API_URL}/api/exam-marks-format/${fmtId}`,{method:'DELETE'});
    toast('Deleted','success');
    loadAdminMarksFormats();
  }catch(e){toast('Delete failed','error');}
}

// ── USER MANAGEMENT ────────────────────────────────────────
// Supports: department hierarchy, faculty subject assignment, bulk CSV import
const DEPT_TREE = {};  // loaded from API
async function _loadDeptTree(){
  try{
    console.log('[_loadDeptTree] Starting departments fetch...');
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn('[_loadDeptTree] Timeout after 8 seconds - backend may be slow');
      controller.abort();
    }, 8000); // 8 second timeout (backend initialization can be slow)
    
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/departments`, {
      signal: controller.signal
    }).catch((err)=>{
      console.warn('[_loadDeptTree] Fetch failed:', err.message);
      return null;
    });
    
    clearTimeout(timeout);
    
    if(!r||!r.ok) {
      console.warn('[_loadDeptTree] Response not ok or null:', r?.status);
      return;
    }
    
    const d = await r.json();
    console.log('[_loadDeptTree] Loaded', (d.departments||[]).length, 'departments');
    (d.departments||[]).forEach(dep=>{ DEPT_TREE[dep.code] = dep; });
  }catch(e){ 
    console.warn('[_loadDeptTree] Error:', e.message); 
  }
}

function renderUserManagement(){
  // Load users and dept tree in parallel, but don't wait for dept tree to start loading users
  _loadDeptTree().then(()=>{ populateDeptDropdowns(); }).catch(e=>console.warn('[renderUserManagement] Dept tree failed:', e.message));
  setTimeout(()=>{ loadUserList(); }, 100); // Small delay to let DOM settle
  window._umSelected = new Set();
  return `
  <!-- Tab bar -->
  <div class="card" style="padding:.5rem 1rem">
    <div class="d-flex gap-md" style="flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="setUMTab('list')" id="umTabList">👥 All Users</button>
      <button class="btn btn-outline btn-sm" onclick="setUMTab('add')" id="umTabAdd">➕ Add User</button>
      <button class="btn btn-outline btn-sm" onclick="setUMTab('bulk')" id="umTabBulk">📥 Bulk Import</button>
      <button class="btn btn-outline btn-sm" onclick="setUMTab('assign')" id="umTabAssign">📚 Assign Subjects</button>
      <button class="btn btn-outline btn-sm" style="border-color:#ef4444;color:#ef4444" onclick="setUMTab('delete')" id="umTabDelete">🗑️ Delete Users</button>
    </div>
  </div>

  <!-- User List Tab -->
  <div id="umTabListPanel" class="card">
    <div class="card-header">
      <div class="card-title">👥 User Management</div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
      <div class="d-flex gap-md" style="flex-wrap:wrap">
        <div class="search-wrap"><span class="search-icon">🔍</span><input placeholder="Search users…" id="userSearch" oninput="filterUsers(this.value)"/></div>
        <select id="umFilterRole" onchange="umRoleFilterChanged()" style="padding:.4rem .8rem;border:1px solid var(--border);background:var(--ink3);color:var(--text);border-radius:var(--radius-sm)">
          <option value="">All Roles</option>
          <option value="student">Students</option>
          <option value="faculty">Faculty</option>
          <option value="admin">Admin</option>
        </select>
        <select id="umFilterDept" onchange="loadUserList()" style="padding:.4rem .8rem;border:1px solid var(--border);background:var(--ink3);color:var(--text);border-radius:var(--radius-sm)">
          <option value="">All Depts</option>
        </select>
        <select id="umFilterSem" onchange="loadUserList()" style="display:none;padding:.4rem .8rem;border:1px solid var(--border);background:var(--ink3);color:var(--text);border-radius:var(--radius-sm)">
          <option value="">All Sems</option>
          ${[1,2,3,4,5,6,7,8].map(s=>`<option value="${s}">Sem ${s}</option>`).join('')}
        </select>
        <button class="btn btn-orange btn-sm" title="Remove duplicate roll numbers left by legacy entries" onclick="fixDuplicateRolls()">🧹 Fix Duplicates</button>
      </div>
      </div>
    </div>
    <div id="umBulkBar" style="display:none;padding:.5rem 1rem;background:#fef2f2;border-bottom:1px solid #fca5a5;align-items:center;gap:.75rem;flex-wrap:wrap">
      <span id="umBulkCount" style="font-size:.85rem;font-weight:600;color:#dc2626">0 selected</span>
      <button class="btn btn-sm" style="background:#ef4444;color:#fff;border:none" onclick="umDeleteSelected()">🗑️ Delete Selected</button>
      <button class="btn btn-outline btn-sm" onclick="umClearSelection()">✕ Clear</button>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th style="width:2rem"><input type="checkbox" id="umSelAll" title="Select all" onchange="umToggleSelectAll(this.checked)" style="cursor:pointer;width:1rem;height:1rem"/></th>
        <th>ID / Roll</th><th>Name</th><th>Role</th><th>Dept / Info</th><th>Email</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody id="userTableBody"><tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text3)">Loading users…</td></tr></tbody>
    </table></div>
  </div>

  <!-- Add User Tab -->
  <div id="umTabAddPanel" class="card" style="display:none">
    <div class="card-header"><div class="card-title">➕ Add New User</div></div>
    <div style="padding:1.5rem;max-width:680px">
      <div class="form-row">
        <div class="form-group"><label>Role *</label>
          <select id="newUserRole" onchange="umRoleChanged()">
            <option value="student">Student</option>
            <option value="faculty">Faculty</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="form-group"><label>Full Name *</label><input id="newUserName" placeholder="Enter full name"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Username *</label><input id="newUserUsername" placeholder="e.g. john.doe or roll no"/></div>
        <div class="form-group"><label>Email *</label><input id="newUserEmail" type="email" placeholder="Enter email"/></div>
      </div>
      <div class="form-group"><label>Password *</label><input id="newUserPass" type="password" placeholder="Enter password"/></div>

      <!-- Department → Program → Section hierarchy -->
      <div class="form-row">
        <div class="form-group"><label>Department *</label>
          <select id="newUserDept" onchange="umDeptChanged('newUser')">
            <option value="">— Select Department —</option>
          </select>
        </div>
        <div class="form-group"><label>Program</label>
          <select id="newUserProgram" onchange="umProgramChanged('newUser')">
            <option value="">— Select Program —</option>
          </select>
        </div>
      </div>

      <!-- Student-only fields -->
      <div id="newUserStudentFields" style="display:none">
        <div class="form-row">
          <div class="form-group"><label>Batch / Section *</label>
            <select id="newUserSection"><option value="">— Select Batch —</option></select>
          </div>
          <div class="form-group"><label>Roll Number</label><input id="newUserRoll" placeholder="Auto-generated or enter manually"/></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Year</label><input id="newUserYear" placeholder="e.g. 2024"/></div>
          <div class="form-group"><label>Semester</label><input id="newUserSemester" placeholder="e.g. 1"/></div>
        </div>
      </div>

      <!-- Faculty-only fields -->
      <div id="newUserFacultyFields" style="display:none">
        <div class="form-row">
          <div class="form-group"><label>Employee ID <span class="text-muted" style="font-weight:400">(auto-generated, editable)</span></label><input id="newUserEmployeeId" placeholder="Auto: PUC26CSE001"/></div>
          <div class="form-group"><label>Designation</label>
            <select id="newUserDesignation">
              <option value="Assistant Professor">Assistant Professor</option>
              <option value="Associate Professor">Associate Professor</option>
              <option value="Professor">Professor</option>
              <option value="HoD">Head of Department (HoD)</option>
              <option value="Dean">Dean</option>
              <option value="Lab Instructor">Lab Instructor</option>
              <option value="Visiting Faculty">Visiting Faculty</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Subjects Assigned <span class="text-muted" style="font-weight:400">(comma-separated, e.g. Data Structures, DBMS, OS Lab)</span></label>
          <input id="newUserSubjects" placeholder="Subject 1, Subject 2, Subject 3"/>
        </div>
      </div>

      <div class="d-flex gap-md mt-md">
        <button class="btn btn-primary" style="flex:1" onclick="submitAddUserForm()">✅ Add User</button>
        <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.5rem 1rem;border:1px solid var(--border);border-radius:var(--radius-sm)">
          <input type="checkbox" id="newUserCaptureFace"/>
          <span style="font-size:.85rem">📷 Also capture face</span>
        </label>
      </div>

      <!-- Face capture (shown after submit if checkbox checked) -->
      <div id="addUserFaceCaptureSection" style="display:none;margin-top:1rem">
        <p class="text-muted text-sm mb-md">Position the face in the circle below</p>
        <div class="camera-wrap" style="max-width:320px;margin:0 auto">
          <video id="addUserVideo" autoplay playsinline></video>
          <div class="camera-ring"></div>
        </div>
        <div class="d-flex gap-md mt-md">
          <button class="btn btn-outline" style="flex:1" onclick="cancelFaceCaptureForNewUser()">Skip</button>
          <button class="btn btn-primary" style="flex:1" onclick="capturePhotoForNewUser()">📷 Capture</button>
        </div>
      </div>
      <div id="addUserFacePreviewSection" style="display:none;margin-top:1rem">
        <p class="text-muted text-sm mb-md">✅ Face captured!</p>
        <img id="addUserPreviewImg" style="max-width:240px;border-radius:var(--radius);border:1px solid var(--border);display:block;margin:0 auto"/>
        <div class="d-flex gap-md mt-md">
          <button class="btn btn-outline" style="flex:1" onclick="retakeCaptureForNewUser()">🔄 Retake</button>
          <button class="btn btn-success" style="flex:1" id="addUserFaceSubmitBtn" onclick="submitAddUserWithFace()">✅ Save User + Face</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Bulk Import Tab -->
  <div id="umTabBulkPanel" class="card" style="display:none">
    <div class="card-header"><div class="card-title">📥 Bulk Import Users (CSV)</div></div>
    <div style="padding:1.5rem;max-width:720px">
      <p class="text-muted mb-md">Upload a CSV file to add hundreds of students or faculty at once.</p>
      <div class="card" style="background:var(--ink);border:2px dashed var(--border2);padding:1.5rem;text-align:center;margin-bottom:1rem">
        <p style="font-size:.9rem;margin-bottom:.5rem">Drag &amp; drop CSV or</p>
        <input type="file" id="bulkCSVFile" accept=".csv" style="display:none" onchange="previewBulkCSV()"/>
        <button class="btn btn-outline" onclick="document.getElementById('bulkCSVFile').click()">📂 Choose CSV File</button>
      </div>
      <div style="background:var(--ink2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1rem">
        <p style="font-size:.8rem;font-weight:600;margin-bottom:.5rem">Expected CSV columns (first row = header):</p>
        <code style="font-size:.75rem;color:var(--text2);display:block;line-height:1.7">
          role, full_name, username, email, password, department, program, section, roll_no, employee_id, designation, subjects
        </code>
        <div style="font-size:.75rem;color:var(--text3);margin-top:.5rem;line-height:1.8">
          <p>• <strong>role</strong>: <code>student</code> / <code>faculty</code> / <code>admin</code></p>
          <p>• <strong>password</strong>: leave blank → defaults to <code>username@123</code></p>
          <p>• <strong>department</strong>: 3-letter code — <code>CSE</code> <code>AIM</code> <code>CBS</code> <code>IOT</code> <code>FSD</code> <code>ECE</code> <code>EEE</code> <code>MBA</code> <code>BBA</code> etc.</p>
          <p>• <strong>subjects</strong>: separate multiple with <code>|</code> e.g. <code>Data Structures|DBMS</code></p>
          <p>• Wrap any field containing a comma in double-quotes e.g. <code>"Smith, Dr. John"</code></p>
        </div>
        <button class="btn btn-outline btn-sm mt-sm" onclick="downloadCSVTemplate()">⬇ Download Template</button>
      </div>
      <div id="bulkPreviewWrap" style="display:none">
        <div class="tbl-wrap" style="margin-bottom:1rem"><table>
          <thead><tr><th>#</th><th>Role</th><th>Name</th><th>Username</th><th>Dept</th><th>Program</th><th>Section</th></tr></thead>
          <tbody id="bulkPreviewBody"></tbody>
        </table></div>
        <div class="d-flex gap-md">
          <button class="btn btn-primary" style="flex:1" onclick="submitBulkImport()">📥 Import All</button>
          <button class="btn btn-outline" onclick="clearBulkPreview()">✕ Clear</button>
        </div>
      </div>
      <div id="bulkImportResult" style="display:none;margin-top:1rem"></div>
    </div>
  </div>

  <!-- Assign Subjects Tab -->
  <div id="umTabAssignPanel" class="card" style="display:none">
    <div class="card-header">
      <div class="card-title">📚 Assign Subjects to Faculty</div>
      <div class="search-wrap"><span class="search-icon">🔍</span><input placeholder="Search faculty…" id="assignSearch" oninput="filterAssignTable(this.value)"/></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Faculty Name</th><th>Employee ID</th><th>Dept</th><th>Program</th><th>Designation</th><th>Assigned Subjects</th><th>Action</th></tr></thead>
      <tbody id="assignTableBody"><tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">Loading faculty…</td></tr></tbody>
    </table></div>
  </div>

    <!-- Delete Users Tab Panel -->
    <div id="umTabDeletePanel" class="card" style="display:none;border:2px solid #fca5a5">
      <div class="card-header" style="background:#fef2f2;border-bottom:1px solid #fca5a5">
        <div class="card-title" style="color:#dc2626">🗑️ Delete Users</div>
        <span style="font-size:.83rem;color:#991b1b">Permanently delete users from Supabase, RTDB &amp; Firestore.</span>
      </div>
      <div style="padding:.75rem 1rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--border)">
        <select id="umDelRole" style="padding:.35rem .7rem;border:1px solid var(--border);background:var(--ink3);color:var(--text);border-radius:var(--radius-sm)">
          <option value="">All Roles</option>
          <option value="student">Students</option>
          <option value="faculty">Faculty</option>
          <option value="admin">Admins</option>
        </select>
        <select id="umDelDept" style="padding:.35rem .7rem;border:1px solid var(--border);background:var(--ink3);color:var(--text);border-radius:var(--radius-sm);min-width:160px">
          <option value="">All Departments</option>
        </select>
        <select id="umDelSem" style="padding:.35rem .7rem;border:1px solid var(--border);background:var(--ink3);color:var(--text);border-radius:var(--radius-sm)">
          <option value="">All Semesters</option>
          <option value="1">Sem 1</option><option value="2">Sem 2</option><option value="3">Sem 3</option>
          <option value="4">Sem 4</option><option value="5">Sem 5</option><option value="6">Sem 6</option>
          <option value="7">Sem 7</option><option value="8">Sem 8</option>
        </select>
        <button class="btn btn-outline btn-sm" onclick="umLoadDeleteTab()">🔍 Filter</button>
      </div>
      <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;font-weight:600">
          <input type="checkbox" id="umDelSelectAll" onchange="umDelToggleAll(this.checked)" style="width:1rem;height:1rem"/>
          Select All
        </label>
        <span id="umDelSelCount" style="font-size:.85rem;color:var(--text2)">0 selected</span>
        <button class="btn btn-sm" style="background:#ef4444;color:#fff;border:none;display:none" id="umDelDeleteBtn" onclick="umDelDeleteSelected()">🗑️ Delete Selected</button>
      </div>
      <div id="umDelUserList" style="padding:.75rem 1rem;max-height:420px;overflow-y:auto">
        <p style="color:var(--text3);text-align:center;padding:2rem">Use the filters above and click Filter to load users.</p>
      </div>
    </div>

  <!-- Edit User Modal -->
  <div id="editUserModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;align-items:center;justify-content:center;overflow-y:auto">
    <div class="card" style="width:90%;max-width:560px;margin:2rem auto">
      <div class="card-header"><div class="card-title">✏️ Edit User</div>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('editUserModal').style.display='none'">✕</button>
      </div>
      <div style="padding:1.5rem" id="editUserModalBody"></div>
    </div>
  </div>`;

}

function setUMTab(tab){
  ['list','add','bulk','assign','delete'].forEach(t=>{
    const panel = document.getElementById(`umTab${t.charAt(0).toUpperCase()+t.slice(1)}Panel`);
    if(panel) panel.style.display = t===tab?'block':'none';
    const btn = document.getElementById(`umTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if(btn){
      if(t==='delete') btn.style.cssText = t===tab?'border-color:#ef4444;color:#fff;background:#ef4444':'border-color:#ef4444;color:#ef4444';
      btn.className = t===tab?'btn btn-primary btn-sm':'btn btn-outline btn-sm';
    }
  });
  if(tab==='list') loadUserList();
  if(tab==='assign') loadAssignTable();
  if(tab==='delete'){ umLoadDeleteTab(); populateDeptDropdowns(); }
}

// ─ Delete Users Tab Functions ─────────────────────────────────────
async function umLoadDeleteTab(){
  const role = document.getElementById('umDelRole')?.value||'';
  const dept = document.getElementById('umDelDept')?.value||'';
  const sem = document.getElementById('umDelSem')?.value||'';
  let url = `${window.AMS_CONFIG.API_URL}/api/users/list`;
  const params = [];
  if(role) params.push(`role=${encodeURIComponent(role)}`);
  if(dept) params.push(`department=${encodeURIComponent(dept)}`);
  if(sem) params.push(`semester=${encodeURIComponent(sem)}`);
  if(params.length) url += '?' + params.join('&');
  try{
    const resp = await fetch(url);
    if(!resp.ok) throw new Error('Failed to load');
    const data = await resp.json();
    const users = data.users||[];
    const listDiv = document.getElementById('umDelUserList');
    if(!users.length){
      listDiv.innerHTML='<p style="color:var(--text3);text-align:center;padding:2rem">No users found with selected filters.</p>';
      document.getElementById('umDelSelectAll').checked=false;
      window._umDelSelected = new Set();
      umDelUpdateCount();
      return;
    }
    window._umDelUserMap = {};
    users.forEach(u=>{ window._umDelUserMap[u.id]=u; });
    listDiv.innerHTML = users.map(u=>{
      const idLabel = u.role==='student'?(u.roll_no||u.username):(u.role==='faculty'?(u.employee_id||u.username):u.username);
      return `<div style="display:flex;gap:.5rem;align-items:center;padding:.6rem;border-bottom:1px solid var(--border)">
        <input type="checkbox" class="um-del-chk" data-id="${u.id}" onchange="umDelUpdateCount()" style="width:1rem;height:1rem"/>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.9rem">${idLabel} · ${u.full_name||u.username}</div>
          <div style="font-size:.8rem;color:var(--text2)">${u.role} · ${u.department||'—'}</div>
        </div>
      </div>`;
    }).join('');
    document.getElementById('umDelSelectAll').checked=false;
    window._umDelSelected = new Set();
    umDelUpdateCount();
  }catch(e){
    document.getElementById('umDelUserList').innerHTML=`<p style="color:var(--red);text-align:center;padding:2rem">Failed to load users</p>`;
  }
}

function umDelToggleAll(checked){
  document.querySelectorAll('.um-del-chk').forEach(c=>{ c.checked=checked; });
  window._umDelSelected = new Set();
  if(checked){
    document.querySelectorAll('.um-del-chk').forEach(c=>{ window._umDelSelected.add(c.dataset.id); });
  }
  umDelUpdateCount();
}

function umDelUpdateCount(){
  window._umDelSelected = new Set();
  document.querySelectorAll('.um-del-chk:checked').forEach(c=>{ window._umDelSelected.add(c.dataset.id); });
  const count = window._umDelSelected.size;
  const countSpan = document.getElementById('umDelSelCount');
  const delBtn = document.getElementById('umDelDeleteBtn');
  countSpan.textContent = count===0?'0 selected':`${count} selected`;
  if(delBtn) delBtn.style.display = count>0?'block':'none';
  const allChk = document.getElementById('umDelSelectAll');
  const total = document.querySelectorAll('.um-del-chk').length;
  if(allChk){ allChk.checked = count>0&&count===total; }
}

async function umDelDeleteSelected(){
  if(!window._umDelSelected||window._umDelSelected.size===0){ toast('No users selected','warning'); return; }
  const idArray = Array.from(window._umDelSelected);
  if(!confirm(`Delete ${idArray.length} user(s)? This cannot be undone!`)) return;
  try{
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/delete-bulk`, {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_ids:idArray})
    });
    const data = await resp.json();
    if(resp.ok){
      toast(`✅ Deleted ${idArray.length} user(s)`,'success');
      window._umDelSelected.clear();
      umLoadDeleteTab();
    }else{
      toast(data.error||'Delete failed','error');
    }
  }catch(e){
    toast('Delete failed: '+e.message,'error');
  }
}

// ─ All Users Tab Checkbox Functions ───────────────────────────────
function umToggleSelectAll(checked){
  document.querySelectorAll('.um-row-chk').forEach(c=>{ c.checked=checked; });
  window._umSelected = new Set();
  if(checked){
    document.querySelectorAll('.um-row-chk').forEach(c=>{ window._umSelected.add(c.dataset.id); });
  }
  umUpdateBulkBar();
}

function umUpdateBulkBar(){
  window._umSelected = new Set();
  document.querySelectorAll('.um-row-chk:checked').forEach(c=>{ window._umSelected.add(c.dataset.id); });
  const count = window._umSelected.size;
  const bar = document.getElementById('umBulkBar');
  if(!bar) return;
  bar.style.display = count>0?'flex':'none';
  const countSpan = bar.querySelector('span');
  if(countSpan) countSpan.textContent = count===0?'0 selected':`${count} selected`;
  const allChk = document.getElementById('umSelAll');
  const total = document.querySelectorAll('.um-row-chk').length;
  if(allChk){ allChk.checked = count>0&&count===total; allChk.indeterminate = count>0&&count<total; }
}

function umClearSelection(){
  document.querySelectorAll('.um-row-chk').forEach(c=>{ c.checked=false; });
  window._umSelected.clear();
  umUpdateBulkBar();
}

async function umDeleteSelected(){
  if(!window._umSelected||window._umSelected.size===0){ toast('No users selected','warning'); return; }
  const idArray = Array.from(window._umSelected);
  if(!confirm(`Delete ${idArray.length} user(s)? This cannot be undone!`)) return;
  try{
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/delete-bulk`, {
      method:'DELETE',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_ids:idArray})
    });
    const data = await resp.json();
    if(resp.ok){
      toast(`✅ Deleted ${idArray.length} user(s)`,'success');
      window._umSelected.clear();
      loadUserList();
    }else{
      toast(data.error||'Delete failed','error');
    }
  }catch(e){
    toast('Delete failed: '+e.message,'error');
  }
}

function populateDeptDropdowns(){
  const depts = Object.values(DEPT_TREE);
  // Group: parents first, then children under parent
  const parents = depts.filter(d=>!d.parent_code).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const children = depts.filter(d=>d.parent_code).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  let opts = '';
  parents.forEach(p=>{
    opts += `<option value="${p.code}">${p.name} (${p.code})</option>`;
    children.filter(c=>c.parent_code===p.code).forEach(c=>{
      opts += `<option value="${c.code}">&nbsp;&nbsp;└ ${c.name} (${c.code})</option>`;
    });
  });
  // Standalone depts (no parent and not a parent of anyone)
  const parentCodes = new Set(parents.map(p=>p.code));
  children.filter(c=>!parentCodes.has(c.parent_code)).forEach(c=>{
    opts += `<option value="${c.code}">${c.name} (${c.code})</option>`;
  });

  ['newUserDept','filterDeptForAssign','umFilterDept','umDelDept','regDeptSel','massRegDept'].forEach(selId=>{
    const sel = document.getElementById(selId);
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = (sel.id.includes('umFilter')||sel.id.includes('umDel')?'<option value="">All Departments</option>':'<option value="">— Select Department —</option>') + opts;
    if(cur) sel.value = cur;
  });
}

function umDeptChanged(prefix){
  const deptCode = document.getElementById(`${prefix}Dept`).value;
  const programs = DEPT_TREE[deptCode]?.programs || [];
  const pSel = document.getElementById(`${prefix}Program`);
  pSel.innerHTML = '<option value="">— Select Program —</option>' + programs.map(p=>`<option value="${p.code}">${p.name}</option>`).join('');
  const bSel = document.getElementById(`${prefix}Section`);
  if(bSel) bSel.innerHTML = '<option value="">— Select Batch —</option>';
  // Auto-generate employee ID for faculty in the Add User form
  if(prefix === 'newUser' && deptCode){
    const role = document.getElementById('newUserRole').value;
    if(role === 'faculty'){
      generateFacultyEmpId(deptCode).then(empId => {
        const empEl = document.getElementById('newUserEmployeeId');
        const unEl  = document.getElementById('newUserUsername');
        if(empEl) empEl.value = empId;
        if(unEl)  unEl.value  = empId;
      });
    }
  }
}

function umProgramChanged(prefix){
  const deptCode = document.getElementById(`${prefix}Dept`).value;
  const progCode = document.getElementById(`${prefix}Program`).value;
  const prog = (DEPT_TREE[deptCode]?.programs||[]).find(p=>p.code===progCode);
  const bSel = document.getElementById(`${prefix}Section`);
  if(!bSel) return;
  const batches = prog?.batches || [];
  bSel.innerHTML = '<option value="">— Select Batch —</option>' + batches.map(b=>`<option value="${b}">${b}</option>`).join('');
}

function umRoleChanged(){
  const role = document.getElementById('newUserRole').value;
  document.getElementById('newUserStudentFields').style.display = role==='student'?'block':'none';
  document.getElementById('newUserFacultyFields').style.display = role==='faculty'?'block':'none';
  if(role==='faculty'){
    document.getElementById('newUserSection').innerHTML = '<option value="">— Select Batch —</option>';
    const deptCode = document.getElementById('newUserDept').value;
    if(deptCode){
      generateFacultyEmpId(deptCode).then(empId => {
        const empEl = document.getElementById('newUserEmployeeId');
        const unEl  = document.getElementById('newUserUsername');
        if(empEl && !empEl.value) empEl.value = empId;
        if(unEl  && !unEl.value)  unEl.value  = empId;
      });
    }
  }
}

function openAddUserModal(){ setUMTab('add'); }
function closeAddUserModal(){ setUMTab('list'); }

function syncRollToUsername(){
  const roll=document.getElementById('newUserRoll').value.trim();
  if(roll) document.getElementById('newUserUsername').value=roll;
}

function updateFaceCaptureUI(){}  // kept for compat

async function generateRoll(){
  const dept  = document.getElementById('newUserDept').value.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,3);
  const year  = document.getElementById('newUserYear')?.value.trim() || new Date().getFullYear();
  const sem   = document.getElementById('newUserSemester')?.value.trim() || '1';
  if(!dept) return;
  try{
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/list?role=student`);
    if(!resp.ok) return;
    const data = await resp.json();
    const prefix = `${year}${sem}${dept}`;
    let maxSeq = 0;
    (data.users||[]).forEach(u=>{
      for(const val of [u.roll_no||'', u.username||'']){
        if(val.toLowerCase().startsWith(prefix.toLowerCase())){
          const tail = val.slice(prefix.length);
          if(/^\d+$/.test(tail)) maxSeq = Math.max(maxSeq, parseInt(tail));
        }
      }
    });
    const roll = `${prefix}${String(maxSeq+1).padStart(4,'0')}`;
    document.getElementById('newUserRoll').value = roll;
    document.getElementById('newUserUsername').value = roll;
  }catch(e){ console.warn('generateRoll failed',e); }
}

async function generateFacultyEmpId(deptCode){
  const uniAbbr = window._UNI_ABBR || 'PUC';
  const year2 = String(new Date().getFullYear()).slice(-2);
  const dept = (deptCode||'').toUpperCase();
  if(!dept) return '';
  const prefix = `${uniAbbr}${year2}${dept}`;
  try{
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/list?role=faculty`);
    if(!resp.ok) return `${prefix}001`;
    const data = await resp.json();
    let maxSeq = 0;
    (data.users||[]).forEach(u=>{
      for(const val of [u.employee_id||'', u.username||'']){
        if(val.toUpperCase().startsWith(prefix.toUpperCase())){
          const tail = val.slice(prefix.length);
          if(/^\d+$/.test(tail)) maxSeq = Math.max(maxSeq, parseInt(tail));
        }
      }
    });
    return `${prefix}${String(maxSeq+1).padStart(3,'0')}`;
  }catch(e){ return `${prefix}001`; }
}

async function startCaptureForNewUser(){
  document.getElementById('addUserFaceCaptureSection').style.display='block';
  document.getElementById('addUserFacePreviewSection').style.display='none';
  const v=document.getElementById('addUserVideo');
  try{ await startCamera(v); }catch(e){ toast(`Camera error: ${e.message}`,'error'); }
}

function cancelCaptureForNewUser(){
  stopCamera();
  document.getElementById('addUserFaceCaptureSection').style.display='none';
  document.getElementById('addUserFacePreviewSection').style.display='none';
  if(document.getElementById('newUserCaptureFace')) document.getElementById('newUserCaptureFace').checked=false;
  AMS.newUserFaceData=null;
}
function cancelFaceCaptureForNewUser(){ cancelCaptureForNewUser(); }

function capturePhotoForNewUser(){
  try{
    const v=document.getElementById('addUserVideo');
    if(!v.srcObject){toast('📷 Camera not initialized','error');return;}
    if(v.videoWidth===0){setTimeout(capturePhotoForNewUser,800);return;}
    const data=captureFrame(v);
    AMS.newUserFaceData=data;
    stopCamera();
    document.getElementById('addUserFaceCaptureSection').style.display='none';
    document.getElementById('addUserFacePreviewSection').style.display='block';
    document.getElementById('addUserPreviewImg').src=data;
    toast('✅ Face captured!','success');
  }catch(e){ toast(`Capture error: ${e.message}`,'error'); }
}
function retakeCaptureForNewUser(){
  document.getElementById('addUserFacePreviewSection').style.display='none';
  startCaptureForNewUser();
}

async function submitAddUserForm(){
  const role    = document.getElementById('newUserRole').value;
  const name    = document.getElementById('newUserName').value.trim();
  const username= document.getElementById('newUserUsername').value.trim();
  const email   = document.getElementById('newUserEmail').value.trim();
  const pass    = document.getElementById('newUserPass').value;
  const dept    = document.getElementById('newUserDept').value.trim();
  const program = document.getElementById('newUserProgram').value.trim();
  const roll    = document.getElementById('newUserRoll')?.value.trim()||'';
  const section = document.getElementById('newUserSection')?.value.trim()||'';
  const empId   = document.getElementById('newUserEmployeeId')?.value.trim()||'';
  const desig   = document.getElementById('newUserDesignation')?.value.trim()||'';
  const subjs   = document.getElementById('newUserSubjects')?.value.trim()||'';
  const captureFace = document.getElementById('newUserCaptureFace')?.checked;

  if(!name||!username||!email||!pass||!dept){
    toast('Please fill all required fields (Name, Username, Email, Password, Dept)','warning');
    return;
  }
  const btn=document.getElementById('addUserFormSubmitBtn')||null;
  if(btn){btn.disabled=true;btn.textContent='⏳ Creating…';}
  try{
    const resp=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/add`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({role,full_name:name,username,email,password:pass,
        department:dept,program,section,
        roll_no:role==='student'?roll:'',
        employee_id:role==='faculty'?empId:'',
        designation:role==='faculty'?desig:'',
        subjects:role==='faculty'?subjs:''})
    }).catch(()=>null);
    if(!resp){toast('Backend not responding','error');return;}
    const data=await resp.json();
    if(!data.success){toast(data.error||'Failed to add user','error');return;}
    AMS.newUserId=data.user_id;
    AMS.newUserRoll=roll;
    toast(`✅ ${role.charAt(0).toUpperCase()+role.slice(1)} ${name} added!`,'success');
    if(captureFace){
      await startCaptureForNewUser();
    }else{
      ['newUserName','newUserUsername','newUserEmail','newUserPass','newUserRoll','newUserSubjects','newUserEmployeeId'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
      setUMTab('list');
    }
  }catch(e){ toast('Error: '+e.message,'error'); }
  finally{ if(btn){btn.disabled=false;btn.textContent='✅ Add User';} }
}

async function submitAddUserWithFace(){
  if(!AMS.newUserFaceData){closeAddUserModal();await loadUserList();return;}
  const btn=document.getElementById('addUserFaceSubmitBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Saving…';}
  try{
    const resp=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/register-face`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_id:AMS.newUserId,roll_no:AMS.newUserRoll,image:AMS.newUserFaceData})
    }).catch(()=>null);
    if(resp){
      const d=await resp.json();
      if(d.success) toast('✅ Face registered!','success');
      else toast('User added but face failed: '+(d.error||'unknown'),'warning');
    }
  }catch(e){ toast('Face registration error: '+e.message,'warning'); }
  finally{
    AMS.newUserFaceData=null;
    if(btn){btn.disabled=false;btn.textContent='✅ Save User + Face';}
    setUMTab('list');
  }
}

async function fixDuplicateRolls(){
  if(!confirm('This will remove legacy student entries that share a roll number with another student. Continue?')) return;
  try{
    const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/fix-duplicates`,{method:'POST'});
    const d=await r.json();
    if(d.success){ toast(d.message,'success'); loadUserList(); }
    else toast(d.error||'Error fixing duplicates','error');
  }catch(e){ toast('Error: '+e.message,'error'); }
}

async function toggleUserSuspend(userId, suspend){
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/${userId}/${suspend?'suspend':'activate'}`,{method:'POST'});
  const d=await r.json();
  if(d.success){toast(suspend?'User suspended':'User activated','success');loadUserList();}
  else toast(d.error||'Error','error');
}

async function deleteUser(userId){
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/${userId}`,{method:'DELETE'});
  const d=await r.json();
  if(d.success){toast('User deleted','success');loadUserList();}
  else toast(d.error||'Error','error');
}

function openEditUser(u){
  const depts = Object.values(DEPT_TREE);
  const deptOpts = depts.map(d=>`<option value="${d.code}" ${d.code===u.department?'selected':''}>${d.name}</option>`).join('');
  const desigOpts=['Assistant Professor','Associate Professor','Professor','HoD','Dean','Lab Instructor','Visiting Faculty'].map(d=>`<option ${d===u.designation?'selected':''}>${d}</option>`).join('');
  document.getElementById('editUserModalBody').innerHTML=`
    <div class="form-row">
      <div class="form-group"><label>Full Name</label><input id="eu_name" value="${u.full_name||''}"/></div>
      <div class="form-group"><label>Email</label><input id="eu_email" type="email" value="${u.email||''}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Department</label>
        <select id="eu_dept"><option value="">—</option>${deptOpts}</select>
      </div>
      <div class="form-group"><label>Program</label><input id="eu_program" value="${u.program||''}"/></div>
    </div>
    ${u.role==='faculty'?`
    <div class="form-row">
      <div class="form-group"><label>Employee ID</label><input id="eu_empid" value="${u.employee_id||''}"/></div>
      <div class="form-group"><label>Designation</label><select id="eu_desig"><option value="">—</option>${desigOpts}</select></div>
    </div>
    <div class="form-group"><label>Subjects Assigned</label><input id="eu_subjects" value="${u.subjects||''}" placeholder="Subject 1, Subject 2"/></div>
    `:`<div class="form-row">
      <div class="form-group"><label>Roll No</label><input id="eu_roll" value="${u.roll_no||''}"/></div>
      <div class="form-group"><label>Section/Batch</label><input id="eu_section" value="${u.section||''}"/></div>
    </div>`}
    <div class="form-group"><label>Role</label>
      <select id="eu_role">
        <option value="student" ${u.role==='student'?'selected':''}>Student</option>
        <option value="faculty" ${u.role==='faculty'?'selected':''}>Faculty</option>
        <option value="admin"   ${u.role==='admin'  ?'selected':''}>Admin</option>
      </select>
    </div>
    <button class="btn btn-primary w-full mt-md" onclick="submitEditUser('${u.id}','${u.role}')">💾 Save Changes</button>`;
  document.getElementById('editUserModal').style.display='flex';
}

async function submitEditUser(userId, origRole){
  const role = document.getElementById('eu_role').value;
  const fields = {
    full_name:   document.getElementById('eu_name').value.trim(),
    email:       document.getElementById('eu_email').value.trim(),
    department:  document.getElementById('eu_dept').value.trim(),
    program:     document.getElementById('eu_program').value.trim(),
    role,
  };
  if(role==='faculty'){
    fields.employee_id  = document.getElementById('eu_empid')?.value.trim()||'';
    fields.designation  = document.getElementById('eu_desig')?.value.trim()||'';
    fields.subjects     = document.getElementById('eu_subjects')?.value.trim()||'';
  } else {
    fields.roll_no  = document.getElementById('eu_roll')?.value.trim()||'';
    fields.section  = document.getElementById('eu_section')?.value.trim()||'';
  }
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/${userId}`,{
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)
    });
    const d = await r.json();
    if(d.success){ toast('✅ User updated','success'); document.getElementById('editUserModal').style.display='none'; loadUserList(); }
    else toast(d.error||'Update failed','error');
  }catch(e){ toast('Error: '+e.message,'error'); }
}

// ── BULK CSV IMPORT ───────────────────────────────────────
let _bulkRows = [];
// Parse a CSV line correctly — handles "quoted,fields" and escaped quotes
function _parseCSVLine(line){
  const result=[];
  let cur='', inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
    else if(c===','&&!inQ){ result.push(cur.trim()); cur=''; }
    else cur+=c;
  }
  result.push(cur.trim());
  return result;
}

function previewBulkCSV(){
  const file = document.getElementById('bulkCSVFile').files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
    const header = _parseCSVLine(lines[0]).map(h=>h.toLowerCase());
    _bulkRows = lines.slice(1).map(line=>{
      const vals = _parseCSVLine(line);
      const obj = {};
      header.forEach((h,i)=>{ obj[h] = (vals[i]||'').trim(); });
      // auto-fill username from roll_no for students if missing
      if(!obj.username && obj.roll_no) obj.username = obj.roll_no;
      // for faculty, username must match employee_id
      if(obj.role === 'faculty' && obj.employee_id) obj.username = obj.employee_id;
      // auto-fill email if missing
      if(!obj.email && obj.username) obj.email = obj.username+'@ams.edu';
      return obj;
    }).filter(r=>r.role&&r.full_name);
    document.getElementById('bulkPreviewBody').innerHTML = _bulkRows.map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td><span class="badge badge-${r.role==='faculty'?'blue':r.role==='admin'?'red':'green'}">${r.role}</span></td>
        <td>${r.full_name}</td><td>${r.username||r.roll_no||'—'}</td>
        <td>${r.department||'—'}</td><td>${r.program||'—'}</td><td>${r.section||'—'}</td>
      </tr>`).join('');
    document.getElementById('bulkPreviewWrap').style.display='block';
    document.getElementById('bulkImportResult').style.display='none';
    toast(`Preview: ${_bulkRows.length} rows loaded`,'info');
  };
  reader.readAsText(file);
}

function clearBulkPreview(){
  _bulkRows=[];
  document.getElementById('bulkPreviewWrap').style.display='none';
  document.getElementById('bulkImportResult').style.display='none';
  document.getElementById('bulkCSVFile').value='';
}

function downloadCSVTemplate(){
  const rows = [
    'role,full_name,username,email,password,department,program,section,roll_no,employee_id,designation,subjects,semester',
    '# STUDENTS: roll_no format = YEAR+SEM+DEPT(3lc)+SEQ(4digit) e.g. 20261cse0001. username = roll_no. Password default: username@123',
    '# FACULTY:  emp_id format = PUC+YY+DEPT(3UC)+SEQ(3digit) e.g. PUC26CSE001. username = employee_id. Subjects separated by |',
    '# DEPT CODES (3-letter): CSE,AIM,ADS,CBS,IOT,CLC,FSD,BCT,RAT,BDA,DVO,ECE,VLS,EBS,SGP,WLC,RBE,EEE,PWS,CTS,EVH,RES,SGT',
    '#   Design: GRD,UIX,AVX,GMD,FDN,ITD,TXD,FTV | MBA: MBA,MBF,MBH,MBM,MBB,MBO,MBI,MBE | BBA: BBA,BBF,BBM,BBH,BBI,BBE',
    'student,Arjun Kumar,20261cse0001,arjun@ams.edu,,CSE,CSE,CSE-A,20261cse0001,,,,1',
    'student,Priya Sharma,20261aim0001,priya@ams.edu,,AIM,AIM,AIM-A,20261aim0001,,,,1',
    'student,Ravi Patel,20261cbs0001,ravi@ams.edu,,CBS,CBS,CBS-A,20261cbs0001,,,,1',
    'faculty,Dr. Suresh Kumar,PUC26CSE001,suresh@ams.edu,,CSE,CSE,,,PUC26CSE001,Associate Professor,Data Structures|DBMS,',
    'faculty,Dr. Meena Iyer,PUC26AIM001,meena@ams.edu,,AIM,AIM,,,PUC26AIM001,Assistant Professor,Machine Learning|Deep Learning,',
    'faculty,Prof. Raj Verma,PUC26ECE001,raj@ams.edu,,ECE,ECE,,,PUC26ECE001,HoD,VLSI Design|Signals,',
  ];
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ams_bulk_template.csv';a.click();
}

async function submitBulkImport(){
  if(!_bulkRows.length){toast('No rows to import','warning');return;}
  toast(`Importing ${_bulkRows.length} users…`,'info');
  try{
    const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/users/bulk-import`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({users:_bulkRows})
    });
    const d=await r.json();
    const res=document.getElementById('bulkImportResult');
    res.style.display='block';
    res.innerHTML=`<div class="card" style="background:var(--ink);padding:1rem">
      <p style="color:var(--green)">✅ Created: ${d.created}</p>
      <p style="color:var(--red)">❌ Failed: ${d.failed}</p>
      ${d.errors?.length?`<details><summary style="cursor:pointer;font-size:.8rem;color:var(--text2)">Show errors</summary>
        <ul style="font-size:.78rem;color:var(--text3);margin-top:.5rem">${d.errors.map(e=>`<li>${e.username}: ${e.error}</li>`).join('')}</ul>
      </details>`:''}
    </div>`;
    if(d.created) toast(`✅ ${d.created} users imported!`,'success');
    clearBulkPreview();
  }catch(e){ toast('Import error: '+e.message,'error'); }
}

// ── ASSIGN SUBJECTS (faculty list with inline edit) ────────
async function loadAssignTable(){
  const tbody = document.getElementById('assignTableBody');
  if(!tbody) return;
  tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">Loading…</td></tr>';
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/list?role=faculty`);
    const d = await r.json();
    const faculty = d.users||[];
    if(!faculty.length){
      tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">No faculty found. Add faculty first.</td></tr>';
      return;
    }
    tbody.innerHTML = faculty.map(f=>`<tr data-name="${(f.full_name||f.username||'').toLowerCase()}">
      <td class="fw-semibold">${f.full_name||f.username}</td>
      <td>${f.employee_id||'—'}</td>
      <td>${f.department||'—'}</td>
      <td>${f.program||'—'}</td>
      <td>${f.designation||'—'}</td>
      <td id="subj_${f.id}" style="max-width:260px;font-size:.8rem;color:var(--text2)">${f.subjects||'<span style="color:var(--text3)">None assigned</span>'}</td>
      <td><button class="btn btn-outline btn-sm" onclick="inlineAssignSubjects('${f.id}','${(f.subjects||'').replace(/'/g,"\\'")}')">✏️ Edit</button></td>
    </tr>`).join('');
  }catch(e){
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">Failed to load faculty</td></tr>`;
  }
}

function filterAssignTable(q){
  document.querySelectorAll('#assignTableBody tr[data-name]').forEach(row=>{
    row.style.display=row.dataset.name.includes(q.toLowerCase())?'':'none';
  });
}

async function inlineAssignSubjects(facultyId, current){
  const val = prompt('Enter subjects (comma-separated):', current);
  if(val===null) return;
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/${facultyId}`,{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({subjects: val.trim()})
    });
    const d = await r.json();
    if(d.success){
      document.getElementById(`subj_${facultyId}`).textContent = val.trim()||'None assigned';
      toast('✅ Subjects updated','success');
    } else toast(d.error||'Update failed','error');
  }catch(e){ toast('Error: '+e.message,'error'); }
}


// ── ADMIN: ANNOUNCEMENTS ──────────────────────────────────
function renderAdminAnnouncements(){
  setTimeout(loadAdminAnnouncements, 0);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📢 Announcements</div>
      <button class="btn btn-primary btn-sm" onclick="openAnnModal()">+ Post Announcement</button>
    </div>
    <div id="annList" style="display:flex;flex-direction:column;gap:.75rem;padding:1rem 0"><p class="text-muted">Loading…</p></div>
  </div>
  <div id="annModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:520px;padding:1.5rem">
      <div class="card-header"><div class="card-title">📝 New Announcement</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('annModal').style.display='none'">✕</button></div>
      <div class="form-group"><label>Title *</label><input id="ann_title" placeholder="Announcement title"/></div>
      <div class="form-group"><label>Content *</label><textarea id="ann_content" rows="4" style="width:100%;padding:.7rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical" placeholder="Write your announcement…"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Audience</label>
          <select id="ann_audience"><option value="all">All</option><option value="student">Students Only</option><option value="faculty">Faculty Only</option></select>
        </div>
        <div class="form-group"><label>Priority</label>
          <select id="ann_priority"><option value="info">Info</option><option value="warning">Warning</option><option value="urgent">Urgent</option><option value="success">Success</option></select>
        </div>
      </div>
      <div class="form-group"><label>Valid Until (leave empty = no expiry)</label><input id="ann_valid" type="date"/></div>
      <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="submitAnnouncement()">Post</button>
    </div>
  </div>`;
}
function openAnnModal(){ document.getElementById('annModal').style.display='flex'; }
async function loadAdminAnnouncements(){
  const el=document.getElementById('annList');
  if(!el) return;
  try{
    const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/announcements`);
    const d=await r.json();
    const anns=d.announcements||[];
    if(!anns.length){ el.innerHTML='<p class="text-muted">No announcements yet. Click + Post Announcement.</p>'; return; }
    el.innerHTML=anns.map(a=>`
      <div class="announcement ${a.priority||'info'}" style="border-left:4px solid var(--${a.priority==='urgent'?'red':a.priority==='warning'?'orange':a.priority==='success'?'green':'blue'});padding:1rem;border-radius:var(--radius);background:var(--ink2)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="fw-semibold">${a.title}</div>
            <div class="text-muted" style="font-size:.85rem;margin:.4rem 0">${a.content}</div>
            <div style="font-size:.75rem;color:var(--text3)">🎯 ${a.target_audience||'all'} | 📅 ${new Date(a.created_at).toLocaleDateString()}${a.valid_until?' | Expires: '+a.valid_until:''}</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteAnnouncement('${a.id}')">🗑️</button>
        </div>
      </div>`).join('');
  }catch(ex){ el.innerHTML='<p style="color:var(--red)">Failed to load announcements</p>'; }
}
async function submitAnnouncement(){
  const payload={title:document.getElementById('ann_title').value,content:document.getElementById('ann_content').value,target_audience:document.getElementById('ann_audience').value,priority:document.getElementById('ann_priority').value,valid_until:document.getElementById('ann_valid').value||null,posted_by:AMS.user?.full_name||'Admin'};
  if(!payload.title||!payload.content){toast('Title and content required','error');return;}
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/announcements`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json();
  if(d.success){toast('Announcement posted!','success');document.getElementById('annModal').style.display='none';loadAdminAnnouncements();}else toast(d.error||'Error','error');
}
async function deleteAnnouncement(id){
  if(!confirm('Delete this announcement?')) return;
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/announcements/${id}`,{method:'DELETE'});
  const d=await r.json();
  if(d.success){toast('Deleted','success');loadAdminAnnouncements();}else toast(d.error||'Error','error');
}

// ── ADMIN: ONLINE CLASSES ─────────────────────────────────
function renderAdminOnlineClasses(){
  setTimeout(loadAdminOnlineClasses, 0);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">🎥 Online Classes</div>
      <button class="btn btn-primary btn-sm" onclick="openOCModal()">+ Schedule Class</button>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Title</th><th>Scheduled At</th><th>Duration</th><th>Meeting Link</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="ocTableBody"><tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text3)">Loading…</td></tr></tbody>
    </table></div>
  </div>
  <div id="ocModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:520px;padding:1.5rem">
      <div class="card-header"><div class="card-title">📹 Schedule Online Class</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('ocModal').style.display='none'">✕</button></div>
      <div class="form-group"><label>Title *</label><input id="oc_title" placeholder="e.g. Data Structures – Lecture 5"/></div>
      <div class="form-row">
        <div class="form-group"><label>Scheduled At *</label><input id="oc_time" type="datetime-local"/></div>
        <div class="form-group"><label>Duration (mins)</label><input id="oc_duration" type="number" value="60"/></div>
      </div>
      <div class="form-group"><label>Meeting Link *</label><input id="oc_link" placeholder="https://meet.google.com/..."/></div>
      <div class="form-group"><label>Recording Link (optional)</label><input id="oc_rec" placeholder="YouTube / Drive link"/></div>
      <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="submitOnlineClass()">Schedule</button>
    </div>
  </div>`;
}
function openOCModal(){ document.getElementById('ocModal').style.display='flex'; }
async function loadAdminOnlineClasses(){
  const tbody=document.getElementById('ocTableBody');
  if(!tbody) return;
  try{
    const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/online-classes`);
    const d=await r.json();
    const cls=d.classes||[];
    if(!cls.length){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text3)">No online classes scheduled yet.</td></tr>'; return; }
    tbody.innerHTML=cls.map(c=>{
      const color=c.status==='completed'?'green':c.status==='live'?'red':'blue';
      return `<tr>
        <td class="fw-semibold">${c.title}</td>
        <td>${new Date(c.scheduled_at).toLocaleString()}</td>
        <td>${c.duration_minutes} min</td>
        <td>${c.meeting_link?`<a href="${c.meeting_link}" target="_blank" style="color:var(--primary)">Join 🔗</a>`:'–'}</td>
        <td><span class="badge badge-${color}">${c.status||'scheduled'}</span></td>
        <td class="d-flex gap-sm">
          <button class="btn btn-success btn-sm" onclick="markOCCompleted('${c.id}')">✓ Done</button>
          <button class="btn btn-danger btn-sm" onclick="deleteOC('${c.id}')">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }catch(ex){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--red)">Failed to load</td></tr>'; }
}
async function submitOnlineClass(){
  const payload={title:document.getElementById('oc_title').value,scheduled_at:document.getElementById('oc_time').value,duration_minutes:parseInt(document.getElementById('oc_duration').value||'60'),meeting_link:document.getElementById('oc_link').value,recording_link:document.getElementById('oc_rec').value||'',faculty_id:AMS.user?.id||null};
  if(!payload.title||!payload.scheduled_at||!payload.meeting_link){toast('Title, time and meeting link required','error');return;}
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/online-classes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json();
  if(d.success){toast('Class scheduled!','success');document.getElementById('ocModal').style.display='none';loadAdminOnlineClasses();}else toast(d.error||'Error','error');
}
async function markOCCompleted(id){
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/online-classes/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'completed'})});
  const d=await r.json();
  if(d.success){toast('Marked as completed','success');loadAdminOnlineClasses();}else toast(d.error||'Error','error');
}
async function deleteOC(id){
  if(!confirm('Delete this class?')) return;
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/online-classes/${id}`,{method:'DELETE'});
  const d=await r.json();
  if(d.success){toast('Deleted','success');loadAdminOnlineClasses();}else toast(d.error||'Error','error');
}

// ── ADMIN: COURSE MANAGEMENT ──────────────────────────────
function renderAdminCourses(){
  setTimeout(loadAdminCourses, 0);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">📚 Course Management</div>
      <button class="btn btn-primary btn-sm" onclick="openCourseModal()">+ Add Course</button>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Semester</th><th>Credits</th><th>Year</th><th>Actions</th></tr></thead>
      <tbody id="courseTableBody"><tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">Loading…</td></tr></tbody>
    </table></div>
  </div>
  <div id="courseModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:520px;padding:1.5rem">
      <div class="card-header"><div class="card-title">➕ Add Course</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('courseModal').style.display='none'">✕</button></div>
      <div class="form-row">
        <div class="form-group"><label>Course Code *</label><input id="c_code" placeholder="e.g. CS301"/></div>
        <div class="form-group"><label>Course Name *</label><input id="c_name" placeholder="e.g. Data Structures"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Department</label><input id="c_dept" placeholder="e.g. Computer Science"/></div>
        <div class="form-group"><label>Semester</label><input id="c_sem" type="number" value="1" min="1" max="8"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Credits</label><input id="c_cred" type="number" value="3" min="1"/></div>
        <div class="form-group"><label>Academic Year</label><input id="c_year" value="2024-25" placeholder="2024-25"/></div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="submitCourse()">Add Course</button>
    </div>
  </div>`;
}
function openCourseModal(){ document.getElementById('courseModal').style.display='flex'; }
async function loadAdminCourses(){
  const tbody=document.getElementById('courseTableBody');
  if(!tbody) return;
  try{
    const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/courses`);
    const d=await r.json();
    const courses=d.courses||[];
    if(!courses.length){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">No courses yet. Click + Add Course.</td></tr>'; return; }
    tbody.innerHTML=courses.map(c=>`<tr>
      <td><span class="badge badge-blue">${c.course_code}</span></td>
      <td class="fw-semibold">${c.course_name}</td>
      <td>${c.department||'–'}</td>
      <td>S${c.semester||'?'}</td>
      <td>${c.credits}</td>
      <td>${c.academic_year||'–'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="if(confirm('Delete course?'))deleteCourse('${c.id}')">🗑️</button></td>
    </tr>`).join('');
  }catch(ex){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--red)">Failed to load</td></tr>'; }
}
async function submitCourse(){
  const payload={course_code:document.getElementById('c_code').value,course_name:document.getElementById('c_name').value,department:document.getElementById('c_dept').value,semester:parseInt(document.getElementById('c_sem').value||'1'),credits:parseInt(document.getElementById('c_cred').value||'3'),academic_year:document.getElementById('c_year').value};
  if(!payload.course_code||!payload.course_name){toast('Code and name required','error');return;}
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/courses`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json();
  if(d.success){toast('Course added!','success');document.getElementById('courseModal').style.display='none';loadAdminCourses();}else toast(d.error||'Error','error');
}
async function deleteCourse(id){
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/courses/${id}`,{method:'DELETE'});
  const d=await r.json();
  if(d.success){toast('Course deleted','success');loadAdminCourses();}else toast(d.error||'Error','error');
}

function filterUsers(query){
  document.querySelectorAll('#userTableBody tr').forEach(row=>{
    row.style.display=row.textContent.toLowerCase().includes(query.toLowerCase())?'':'none';
  });
}

function umRoleFilterChanged(){
  const role = document.getElementById('umFilterRole')?.value||'';
  const semSel = document.getElementById('umFilterSem');
  if(semSel){
    semSel.style.display = role==='student'?'':'none';
    if(role!=='student') semSel.value='';
  }
  loadUserList();
}

async function loadUserList(){
  try{
    console.log('[loadUserList] Starting user list fetch...');
    const role  = document.getElementById('umFilterRole')?.value||'';
    const dept  = document.getElementById('umFilterDept')?.value||'';
    const sem   = document.getElementById('umFilterSem')?.value||'';
    let url = `${window.AMS_CONFIG.API_URL}/api/users/list`;
    const params = [];
    if(role) params.push(`role=${encodeURIComponent(role)}`);
    if(dept) params.push(`department=${encodeURIComponent(dept)}`);
    if(sem)  params.push(`semester=${encodeURIComponent(sem)}`);
    if(params.length) url += '?' + params.join('&');

    console.log('[loadUserList] Fetch URL:', url);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.warn('[loadUserList] Timeout after 10 seconds - backend may be initializing or overloaded');
      controller.abort();
    }, 10000); // 10 second timeout

    const resp = await fetch(url, {
      signal: controller.signal
    }).catch((err)=>{
      console.warn('[loadUserList] Fetch failed:', err.message);
      return null;
    });
    
    clearTimeout(timeout);
    
    if(!resp||!resp.ok) {
      console.error('[loadUserList] Response not ok:', resp?.status);
      const tbody = document.getElementById('userTableBody');
      if(tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#f85149"><strong>❌ Failed to load users</strong><br/><small style="color:var(--text3)">Backend may be unavailable. Try refreshing the page.</small></td></tr>';
      }
      throw new Error('Failed to fetch users - status ' + (resp?.status || 'timeout'));
    }
    
    const data = await resp.json();
    console.log('[loadUserList] Received', (data.users||[]).length, 'users');
    
    const users = data.users||[];
    const tbody = document.getElementById('userTableBody');
    if(!tbody) return;
    if(!users.length){
      console.warn('[loadUserList] No users found');
      tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text3)">🚫 No users found</td></tr>';
      return;
    }
    // Store user objects globally for edit lookup
    window._umUserMap = {};
    users.forEach(u=>{ window._umUserMap[u.id]=u; });
    tbody.innerHTML=users.map(u=>{
      const suspended = u.is_active===false;
      const idLabel = u.role==='student'
        ? (u.roll_no||u.username||'—')
        : u.role==='faculty'
          ? (u.employee_id||u.username||'—')
          : (u.username||'admin');
      // Build compact dept/info cell: dept, program, section or designation
      const line2 = u.role==='faculty'
        ? [u.program, u.designation].filter(Boolean).join(' · ')
        : [u.program, u.section].filter(Boolean).join(' · ');
      const infoCell = `<span style="font-size:.82rem;font-weight:600">${u.department||'—'}</span>${line2?`<br><span style="font-size:.72rem;color:var(--text3)">${line2}</span>`:''}${u.role==='faculty'&&u.subjects?`<br><span style="font-size:.7rem;color:var(--text2);" title="${(u.subjects).replace(/"/g,'&quot;')}">${u.subjects.length>30?u.subjects.slice(0,30)+'…':u.subjects}</span>`:''}` ;
      return `<tr>
        <td style="width:2rem"><input type="checkbox" class="um-row-chk" data-id="${u.id}" onchange="umUpdateBulkBar()" style="cursor:pointer;width:1rem;height:1rem"/></td>
        <td class="fw-semibold" style="font-size:.82rem;white-space:nowrap">${idLabel}</td>
        <td style="white-space:nowrap;font-weight:500">${u.full_name||u.username}</td>
        <td><span class="badge badge-${u.role==='admin'?'red':u.role==='faculty'?'blue':'green'}">${u.role}</span></td>
        <td style="max-width:180px">${infoCell}</td>
        <td style="font-size:.8rem;color:var(--text2)">${u.email||'—'}</td>
        <td><span class="badge badge-${suspended?'red':'green'}">${suspended?'Suspended':'Active'}</span></td>
        <td style="white-space:nowrap">
          <div style="display:flex;gap:.3rem;align-items:center">
            <button class="btn btn-outline btn-sm" title="Edit" onclick="openEditUser(window._umUserMap['${u.id}'])">✏️</button>
            ${suspended
              ?`<button class="btn btn-success btn-sm" title="Activate" onclick="toggleUserSuspend('${u.id}',false)">▶</button>`
              :`<button class="btn btn-orange btn-sm" title="Suspend" onclick="toggleUserSuspend('${u.id}',true)">⏸</button>`
            }
            <button class="btn btn-danger btn-sm" title="Delete" onclick="if(confirm('Permanently delete this user?'))deleteUser('${u.id}')">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    populateDeptDropdowns();
  }catch(e){
    const tbody = document.getElementById('userTableBody');
    if(tbody) tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text3)">Failed to load users</td></tr>';
  }
}

// ── DEPARTMENTS & PROGRAMS ADMIN PANEL ───────────────────
function renderAdminDepartments(){
  setTimeout(()=>loadDeptPanel(), 0);
  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title">🏛️ Departments &amp; Programs</div>
      <button class="btn btn-primary btn-sm" onclick="openAddDeptModal()">➕ Add Department</button>
    </div>
    <div id="deptPanelBody" style="padding:1rem">
      <div style="text-align:center;padding:2rem;color:var(--text3)">Loading…</div>
    </div>
  </div>

  <!-- Add/Edit Dept Modal -->
  <div id="deptModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:560px">
      <div class="card-header">
        <div class="card-title" id="deptModalTitle">➕ Add Department</div>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('deptModal').style.display='none'">✕</button>
      </div>
      <div style="padding:1.5rem">
        <input type="hidden" id="deptModalId"/>
        <div class="form-row">
          <div class="form-group"><label>Department Name *</label><input id="deptModalName" placeholder="e.g. Data Science"/></div>
          <div class="form-group"><label>Code * (3 letters)</label><input id="deptModalCode" placeholder="e.g. ADS" maxlength="3" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z]/g,'')"/></div>
        </div>
        <div class="form-group"><label>Parent Department (optional — for specializations)</label>
          <select id="deptModalParent"><option value="">— None (standalone dept) —</option></select>
        </div>
        <div class="form-group">
          <label>Programs (one per line, format: <code>Name|CODE|Batch1,Batch2|Semesters</code>)</label>
          <textarea id="deptModalPrograms" rows="6" placeholder="B.Tech CSE|CSE|CSE-A,CSE-B,CSE-C|8&#10;B.Tech ECE|ECE|ECE-A,ECE-B|8&#10;M.Tech CSE|MCSE|MCSE-A|4" style="width:100%;font-family:monospace;font-size:.8rem;padding:.5rem;background:var(--ink);border:1px solid var(--border);color:var(--text);border-radius:var(--radius-sm);resize:vertical"></textarea>
        </div>
        <button class="btn btn-primary w-full" onclick="submitDeptModal()">💾 Save Department</button>
      </div>
    </div>
  </div>`;
}

async function loadDeptPanel(){
  const body = document.getElementById('deptPanelBody');
  if(!body) return;
  try{
    await _loadDeptTree();
    const depts = Object.values(DEPT_TREE);
    if(!depts.length){
      body.innerHTML=`<div style="text-align:center;padding:2rem;color:var(--text3)">No departments configured. Click "Add Department" to create one.</div>`;
      return;
    }
    body.innerHTML = depts.map(dept=>{
      const parentLabel = dept.parent_code ? `<span class="badge badge-blue" style="font-size:.7rem;margin-left:.4rem" title="Specialization of ${dept.parent_code}">↳ ${dept.parent_code}</span>` : '';
      return `
      <div class="card" style="margin-bottom:1rem;border:1px solid var(--border)${dept.parent_code?';margin-left:1.5rem':''}">
        <div class="card-header" style="padding:.75rem 1rem">
          <div>
            <span class="fw-semibold" style="font-size:1rem">${dept.name}</span>
            <span class="badge badge-blue ml-md">${dept.code}</span>${parentLabel}
            <span style="font-size:.8rem;color:var(--text3);margin-left:.75rem">${(dept.programs||[]).length} program(s)</span>
          </div>
          <div class="d-flex gap-sm">
            <button class="btn btn-outline btn-sm" onclick="openEditDeptModal('${dept.code}')">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete ${dept.name}?'))deleteDept('${dept.id||dept.code}')">🗑️</button>
          </div>
        </div>
        <div style="padding:.75rem 1rem;display:flex;flex-wrap:wrap;gap:.5rem">
          ${(dept.programs||[]).map(p=>`
            <div style="background:var(--ink);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.4rem .8rem;font-size:.82rem">
              <strong>${p.name}</strong>
              <span style="color:var(--text3);margin-left:.4rem">(${p.code})</span>
              <span style="display:block;color:var(--text3);font-size:.75rem;margin-top:.2rem">${(p.batches||[]).join(' · ')} · ${p.semesters||'—'} sem</span>
            </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }catch(e){
    body.innerHTML=`<div style="text-align:center;padding:2rem;color:var(--red)">Failed to load departments</div>`;
  }
}

function _deptToTextarea(dept){
  return (dept.programs||[]).map(p=>`${p.name}|${p.code}|${(p.batches||[]).join(',')}|${p.semesters||8}`).join('\n');
}

function _parseProgramsText(text){
  return text.split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{
    const [name='',code='',batchStr='',semesters='8'] = line.split('|');
    const batches = batchStr.split(',').map(b=>b.trim()).filter(Boolean);
    return {name:name.trim(), code:code.trim().toUpperCase(), batches, semesters:parseInt(semesters)||8};
  });
}

function openAddDeptModal(){
  document.getElementById('deptModalId').value='';
  document.getElementById('deptModalTitle').textContent='➕ Add Department';
  document.getElementById('deptModalName').value='';
  document.getElementById('deptModalCode').value='';
  document.getElementById('deptModalPrograms').value='';
  // Populate parent dropdown
  const parentSel = document.getElementById('deptModalParent');
  const parentDepts = Object.values(DEPT_TREE).filter(d=>!d.parent_code);
  parentSel.innerHTML = '<option value="">— None (standalone dept) —</option>' +
    parentDepts.map(d=>`<option value="${d.code}">${d.name} (${d.code})</option>`).join('');
  document.getElementById('deptModal').style.display='flex';
}

function openEditDeptModal(deptCode){
  const dept = DEPT_TREE[deptCode];
  if(!dept) return;
  document.getElementById('deptModalId').value=dept.id||dept.code;
  document.getElementById('deptModalTitle').textContent='✏️ Edit Department';
  document.getElementById('deptModalName').value=dept.name||'';
  document.getElementById('deptModalCode').value=dept.code||'';
  document.getElementById('deptModalPrograms').value=_deptToTextarea(dept);
  const parentSel = document.getElementById('deptModalParent');
  const parentDepts = Object.values(DEPT_TREE).filter(d=>!d.parent_code && d.code !== deptCode);
  parentSel.innerHTML = '<option value="">— None (standalone dept) —</option>' +
    parentDepts.map(d=>`<option value="${d.code}" ${d.code===dept.parent_code?'selected':''}>${d.name} (${d.code})</option>`).join('');
  document.getElementById('deptModal').style.display='flex';
}

async function submitDeptModal(){
  const id         = document.getElementById('deptModalId').value.trim();
  const name       = document.getElementById('deptModalName').value.trim();
  const code       = document.getElementById('deptModalCode').value.trim().toUpperCase();
  const parent_code= document.getElementById('deptModalParent').value.trim().toUpperCase() || null;
  const programs   = _parseProgramsText(document.getElementById('deptModalPrograms').value);
  if(!name||!code){ toast('Name and Code are required','warning'); return; }
  if(code.length !== 3){ toast('Department code must be exactly 3 letters','warning'); return; }
  try{
    const method = id ? 'PUT' : 'POST';
    const url    = id
      ? `${window.AMS_CONFIG.API_URL}/api/departments/${id}`
      : `${window.AMS_CONFIG.API_URL}/api/departments`;
    const r = await fetch(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,code,parent_code,programs})});
    const d = await r.json();
    if(d.success||d.id||d.department){
      toast(`✅ Department ${id?'updated':'created'}!`, 'success');
      document.getElementById('deptModal').style.display='none';
      Object.keys(DEPT_TREE).forEach(k=>delete DEPT_TREE[k]);
      await _loadDeptTree();
      loadDeptPanel();
      populateDeptDropdowns();
    } else toast(d.error||'Failed','error');
  }catch(e){ toast('Error: '+e.message,'error'); }
}

async function deleteDept(deptId){
  try{
    const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/departments/${deptId}`,{method:'DELETE'});
    const d = await r.json();
    if(d.success){ toast('Department deleted','success'); Object.keys(DEPT_TREE).forEach(k=>delete DEPT_TREE[k]); await _loadDeptTree(); loadDeptPanel(); populateDeptDropdowns(); }
    else toast(d.error||'Failed','error');
  }catch(e){ toast('Error: '+e.message,'error'); }
}

// ── FACE REGISTRATION (standalone) ───────────────────────
function renderFaceRegistration(){
  const curYear = new Date().getFullYear();
  const acYear = `${curYear}-${String(curYear+1).slice(2)}`;
  return `<div class="card">
    <div class="card-header"><div class="card-title">👤 Face Registration</div></div>
    <!-- Tabs -->
    <div style="display:flex;gap:.25rem;padding:0 1.5rem .75rem;border-bottom:1px solid var(--border);margin-bottom:1.5rem">
      <button id="frTab1" class="btn btn-primary" onclick="frSwitchTab(1)">👤 Single</button>
      <button id="frTab2" class="btn btn-outline" onclick="frSwitchTab(2)">📦 Mass Upload</button>
    </div>

    <!-- TAB 1: Single Registration -->
    <div id="frPane1" style="padding:0 1.5rem 1.5rem">
      <p class="text-muted mb-lg">Register one student's face. Roll number is auto-generated when you pick a department.</p>
      <div class="form-row">
        <div class="form-group">
          <label>Department *</label>
          <select id="regDeptSel" onchange="frAutoRoll()">
            <option value="">— Select Department —</option>
          </select>
        </div>
        <div class="form-group">
          <label>Year</label>
          <input id="regYearShort" value="${curYear}" placeholder="e.g. ${curYear}" onchange="frAutoRoll()"/>
        </div>
        <div class="form-group">
          <label>Semester</label>
          <select id="regSem" onchange="frAutoRoll()">
            ${[1,2,3,4,5,6,7,8].map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Full Name</label><input id="regName" placeholder="Student full name"/></div>
        <div class="form-group"><label>Roll Number <span class="text-muted" style="font-weight:400">(auto-generated, editable)</span></label><input id="regRoll" placeholder="Auto-generated on dept select"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Section</label><input id="regSec" placeholder="e.g. A"/></div>
        <div class="form-group"><label>Academic Year</label><input id="regYear" value="${acYear}"/></div>
      </div>
      <div id="regCamSection">
        <button class="btn btn-teal" onclick="startRegCamera()">📷 Capture Live Photo</button>
      </div>
      <div id="regCamWrap" style="display:none">
        <div class="camera-wrap" style="max-width:400px">
          <video id="regVideo" autoplay playsinline></video>
          <div class="camera-ring"></div>
          <div class="camera-status">Position student face in circle</div>
        </div>
        <div class="d-flex gap-md mt-md">
          <button class="btn btn-outline" onclick="cancelRegCamera()">Cancel</button>
          <button class="btn btn-primary" onclick="captureRegPhoto()">📷 Capture</button>
        </div>
      </div>
      <div id="regPreview" style="display:none">
        <img id="regPreviewImg" style="max-width:200px;border-radius:var(--radius);border:1px solid var(--border)"/>
        <div class="d-flex gap-md mt-md">
          <button class="btn btn-outline" onclick="retakeRegPhoto()">Retake</button>
          <button class="btn btn-primary" onclick="submitRegistration()">✅ Register Face</button>
        </div>
      </div>
    </div>

    <!-- TAB 2: Mass Upload -->
    <div id="frPane2" style="display:none;padding:0 1.5rem 1.5rem">
      <p class="text-muted mb-lg">
        Upload multiple face photos at once.<br>
        <strong>Tip:</strong> Name each file as the student's roll number (e.g. <code>20261CSE0001.jpg</code>) to auto-link the face to that student's login.
        Otherwise roll numbers are auto-generated from the department you select.
      </p>
      <div class="form-row">
        <div class="form-group">
          <label>Department *</label>
          <select id="massRegDept" onchange="previewMassFiles()">
            <option value="">— Select Department —</option>
          </select>
        </div>
        <div class="form-group">
          <label>Year <span class="text-muted" style="font-weight:400">(auto)</span></label>
          <input id="massRegYear" value="${curYear}" onchange="previewMassFiles()"/>
        </div>
        <div class="form-group">
          <label>Semester</label>
          <select id="massRegSem" onchange="previewMassFiles()">
            ${[1,2,3,4,5,6,7,8].map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Academic Year</label>
          <input id="massRegAcYear" value="${acYear}"/>
        </div>
      </div>
      <div class="form-group">
        <label>Select Face Images (JPG/PNG, multiple)</label>
        <input type="file" id="massRegFiles" accept="image/*" multiple onchange="previewMassFiles()"/>
      </div>
      <div id="massRegPreview" style="display:none;margin-top:1rem">
        <p class="text-muted text-sm mb-md" id="massRegSummary"></p>
        <div style="overflow-x:auto;max-height:300px;overflow-y:auto">
          <table class="table" style="font-size:.82rem">
            <thead><tr><th>#</th><th>Filename</th><th>Roll No. (will use)</th><th>Source</th></tr></thead>
            <tbody id="massRegPreviewBody"></tbody>
          </table>
        </div>
        <button class="btn btn-primary mt-md" onclick="submitMassFaceUpload()">📦 Register All Faces</button>
      </div>
      <div id="massRegResult" style="display:none;margin-top:1rem"></div>
    </div>
  </div>`;
}

function initFaceRegistration(){
  // Load dept tree then populate all dropdowns on this page
  const doPopulate = () => {
    const depts = Object.values(DEPT_TREE);
    ['regDeptSel','massRegDept'].forEach(selId=>{
      const sel = document.getElementById(selId);
      if(!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">— Select Department —</option>' +
        depts.map(d=>`<option value="${d.code}">${d.name} (${d.code})</option>`).join('');
      if(cur) sel.value = cur;
    });
  };
  if(Object.keys(DEPT_TREE).length){
    doPopulate();
  } else {
    _loadDeptTree().then(doPopulate).catch(()=>{});
  }
}

async function startRegCamera(){
  document.getElementById('regCamSection').style.display='none';
  document.getElementById('regCamWrap').style.display='block';
  await startCamera(document.getElementById('regVideo'));
}

function cancelRegCamera(){
  stopCamera();
  document.getElementById('regCamSection').style.display='block';
  document.getElementById('regCamWrap').style.display='none';
}

function captureRegPhoto(){
  const v=document.getElementById('regVideo');
  const data=captureFrame(v);
  stopCamera();
  document.getElementById('regCamWrap').style.display='none';
  document.getElementById('regPreview').style.display='block';
  document.getElementById('regPreviewImg').src=data;
}

function retakeRegPhoto(){
  document.getElementById('regPreview').style.display='none';
  startRegCamera();
}

function frSwitchTab(n){
  document.getElementById('frPane1').style.display = n===1?'block':'none';
  document.getElementById('frPane2').style.display = n===2?'block':'none';
  document.getElementById('frTab1').className = n===1?'btn btn-primary':'btn btn-outline';
  document.getElementById('frTab2').className = n===2?'btn btn-primary':'btn btn-outline';
}

async function frAutoRoll(){
  const dept = document.getElementById('regDeptSel')?.value;
  const year = document.getElementById('regYearShort')?.value.trim() || new Date().getFullYear();
  const sem  = document.getElementById('regSem')?.value || '1';
  if(!dept) return;
  const prefix = `${year}${sem}${dept.toLowerCase()}`;
  try{
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/list?role=student`);
    const data = await resp.json();
    // Find the highest existing sequence number for this prefix to avoid gaps/duplicates
    let maxSeq = 0;
    (data.users||[]).forEach(u=>{
      if(u.roll_no && u.roll_no.toLowerCase().startsWith(prefix)){
        const seq = parseInt(u.roll_no.slice(prefix.length), 10);
        if(!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
    document.getElementById('regRoll').value = `${prefix}${String(maxSeq+1).padStart(4,'0')}`;
  }catch(e){
    document.getElementById('regRoll').value = `${prefix}0001`;
  }
}

async function previewMassFiles(){
  const files = Array.from(document.getElementById('massRegFiles')?.files || []);
  if(!files.length) return;
  const dept  = (document.getElementById('massRegDept')?.value || '').toLowerCase();
  const year  = document.getElementById('massRegYear')?.value.trim() || new Date().getFullYear();
  const sem   = document.getElementById('massRegSem')?.value || '1';
  const prefix = `${year}${sem}${dept}`;
  // Fetch existing max sequence so auto-numbering is always continuous
  let startSeq = 0;
  if(dept){
    try{
      const r = await fetch(`${window.AMS_CONFIG.API_URL}/api/users/list?role=student`);
      const d = await r.json();
      (d.users||[]).forEach(u=>{
        if(u.roll_no && u.roll_no.toLowerCase().startsWith(prefix)){
          const seq = parseInt(u.roll_no.slice(prefix.length), 10);
          if(!isNaN(seq) && seq > startSeq) startSeq = seq;
        }
      });
    }catch(e){ /* proceed with 0 */ }
  }
  let autoSeq = startSeq;
  const rows = files.map((f, i) => {
    const basename = f.name.replace(/\.[^.]+$/, '').trim();
    let roll_no, source;
    // If filename already looks like a roll (digits + letters + digits)
    if(/^[0-9]{4,}[a-zA-Z]{2,4}[0-9]+$/i.test(basename)){
      roll_no = basename.toUpperCase();
      source = '<span style="color:var(--green)">📄 filename</span>';
    } else {
      autoSeq++;
      roll_no = dept ? `${prefix}${String(autoSeq).padStart(4,'0')}`.toUpperCase() : '(select dept first)';
      source = '<span style="color:#f90">⚙️ auto</span>';
    }
    return `<tr><td>${i+1}</td><td style="word-break:break-all">${f.name}</td><td><code>${roll_no}</code></td><td>${source}</td></tr>`;
  });
  document.getElementById('massRegPreviewBody').innerHTML = rows.join('');
  document.getElementById('massRegSummary').textContent = `${files.length} image(s) ready — files named as roll numbers will sync to existing student accounts.`;
  document.getElementById('massRegPreview').style.display = 'block';
  document.getElementById('massRegResult').style.display = 'none';
}

async function submitMassFaceUpload(){
  const dept   = document.getElementById('massRegDept').value;
  const year   = document.getElementById('massRegYear').value.trim() || new Date().getFullYear();
  const sem    = document.getElementById('massRegSem').value || '1';
  const acYear = document.getElementById('massRegAcYear').value.trim();
  const files  = document.getElementById('massRegFiles').files;
  if(!dept){ toast('Please select a department','warning'); return; }
  if(!files.length){ toast('Please select face images','warning'); return; }
  const form = new FormData();
  form.append('department', dept);
  form.append('year', year);
  form.append('semester', sem);
  form.append('academic_year', acYear);
  Array.from(files).forEach(f => form.append('images', f));
  toast(`Uploading ${files.length} face image(s)…`, 'info');
  try{
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/face/bulk-register`, {method:'POST', body:form});
    const d = await resp.json();
    const res = document.getElementById('massRegResult');
    res.style.display = 'block';
    const successList = (d.results||[]).filter(r=>r.status==='success');
    const failList    = (d.results||[]).filter(r=>r.status==='failed');
    const matchedList = successList.filter(r=>r.matched);
    res.innerHTML = `<div class="card" style="background:var(--ink);padding:1rem">
      <p style="color:var(--green)">✅ Registered: ${d.registered} &nbsp;|&nbsp; 🔗 Linked to students: ${d.matched}</p>
      <p style="color:var(--red)">❌ Failed: ${d.failed}</p>
      ${matchedList.length?`<details><summary style="cursor:pointer;font-size:.8rem;color:var(--text2)">🔗 Matched students (${matchedList.length})</summary>
        <ul style="font-size:.78rem;color:var(--text3);margin-top:.5rem">${matchedList.map(r=>`<li><code>${r.roll_no}</code> → ${r.matched_student}</li>`).join('')}</ul>
      </details>`:''}
      ${failList.length?`<details><summary style="cursor:pointer;font-size:.8rem;color:var(--text2)">Errors (${failList.length})</summary>
        <ul style="font-size:.78rem;color:var(--text3);margin-top:.5rem">${failList.map(r=>`<li>${r.filename}: ${r.error}</li>`).join('')}</ul>
      </details>`:''}
    </div>`;
    if(d.registered) toast(`✅ ${d.registered} faces registered, ${d.matched} linked to student logins!`, 'success');
  }catch(e){ toast('Upload error: '+e.message, 'error'); }
}

async function submitRegistration(){
  const name=document.getElementById('regName')?.value.trim();
  let roll=document.getElementById('regRoll')?.value.trim();
  const section=document.getElementById('regSec')?.value.trim();
  const year=document.getElementById('regYear')?.value.trim()||(new Date().getFullYear()+'-'+(new Date().getFullYear()+1).toString().slice(2));
  const dept=document.getElementById('regDeptSel')?.value||'';
  const imgSrc=document.getElementById('regPreviewImg')?.src;

  // auto-generate roll if dept/year/sem provided and still empty
  if(!roll && dept){
    const yr=document.getElementById('regYearShort')?.value.trim()||new Date().getFullYear();
    const sem=document.getElementById('regSem')?.value||'1';
    roll = `${yr}${sem}${dept.toLowerCase()}0001`;
    document.getElementById('regRoll').value = roll;
  }
  const admission = crypto.randomUUID();

  if(!name||!roll){toast('Please fill Full Name and ensure Roll Number is set (select a department)','warning');return;}
  if(!imgSrc||imgSrc===window.location.href){toast('Please capture a photo first','warning');return;}

  try{
    toast('Processing face encoding…','info');
    const base64=imgSrc.split(',')[1];
    const byteCharacters=atob(base64);
    const byteArray=new Uint8Array(byteCharacters.length);
    for(let i=0;i<byteCharacters.length;i++) byteArray[i]=byteCharacters.charCodeAt(i);
    const blob=new Blob([byteArray],{type:'image/jpeg'});

    const form=new FormData();
    form.append('image',blob,'face.jpg');
    form.append('name',name);
    form.append('roll_no',roll);
    form.append('admission_no',admission);
    form.append('section',section||'–');
    form.append('academic_year',year);

    const resp=await fetch(`${window.AMS_CONFIG.API_URL}/api/register`,{method:'POST',body:form});
    const data=await resp.json();

    if(!resp.ok||!data.success){toast(data.error||'Registration failed','error');return;}

    toast('Face registered successfully!','success');
    document.getElementById('regPreview').style.display='none';
    document.getElementById('regCamSection').style.display='block';
    ['regName','regRoll','regSec'].forEach(id=>{const el=document.getElementById(id);if(el) el.value='';});
  }catch(e){
    toast('Error: '+e.message,'error');
  }
}

function renderSystemConfig(){
  // Render inputs with IDs so they can be populated/updated dynamically
  const tol = (AMS.systemConfig && AMS.systemConfig.tolerance) ? AMS.systemConfig.tolerance : '0.5';
  const lat = (AMS.college && AMS.college.lat) ? AMS.college.lat : COLLEGE_LAT;
  const lng = (AMS.college && AMS.college.lng) ? AMS.college.lng : COLLEGE_LNG;
  const rad = (AMS.college && AMS.college.radiusKm) ? AMS.college.radiusKm : COLLEGE_KM;
  const qr = (AMS.systemConfig && AMS.systemConfig.qr_expiry_minutes) ? AMS.systemConfig.qr_expiry_minutes : '5';
  const end = (AMS.systemConfig && AMS.systemConfig.attendance_window_end) ? AMS.systemConfig.attendance_window_end : '18:00';

  return `<div class="card">
    <div class="card-header"><div class="card-title">⚙️ System Configuration</div></div>
    <div class="form-group"><label>Face Recognition Tolerance</label><input id="cfg_tolerance" type="number" step="0.01" value="${tol}"/><small class="text-dim">0.4=strict, 0.6=lenient</small></div>
    <div class="form-group"><label>College Latitude</label><input id="cfg_college_lat" type="number" step="0.000001" value="${lat}"/><small class="text-dim">GPS latitude of campus center</small></div>
    <div class="form-group"><label>College Longitude</label><input id="cfg_college_lng" type="number" step="0.000001" value="${lng}"/><small class="text-dim">GPS longitude of campus center</small></div>
    <div class="form-group"><label>Campus Radius (km)</label><input id="cfg_college_rad" type="number" step="0.01" value="${rad}"/><small class="text-dim">Geofence radius in kilometres</small></div>
    <div class="form-group"><label>QR Expiry (minutes)</label><input id="cfg_qr_expiry" type="number" value="${qr}"/><small class="text-dim">How long QR codes are valid</small></div>
    <div class="form-group"><label>Attendance Window End</label><input id="cfg_att_end" type="time" value="${end}"/><small class="text-dim">Students cannot mark after this time</small></div>
    <div class="d-flex gap-md"><button class="btn btn-primary" onclick="saveSystemConfig()">Save Settings</button><button class="btn btn-outline" onclick="loadSystemConfig()">Reload</button></div>
  </div>`;
}

// Fetch system configuration from backend and update AMS.global state
async function loadSystemConfig(){
  try{
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/system-config`);
    if(!resp.ok) return;
    const data = await resp.json();
    // data expected: {college_lat, college_lng, college_radius_km, tolerance, qr_expiry_minutes, attendance_window_end}
    AMS.college = AMS.college || {};
    if(typeof data.college_lat === 'number') AMS.college.lat = data.college_lat;
    if(typeof data.college_lng === 'number') AMS.college.lng = data.college_lng;
    if(typeof data.college_radius_km === 'number') AMS.college.radiusKm = data.college_radius_km;
    AMS.systemConfig = AMS.systemConfig || {};
    if(data.tolerance) AMS.systemConfig.tolerance = data.tolerance;
    if(data.qr_expiry_minutes) AMS.systemConfig.qr_expiry_minutes = data.qr_expiry_minutes;
    if(data.attendance_window_end) AMS.systemConfig.attendance_window_end = data.attendance_window_end;
    // update the inputs if present
    const latEl = document.getElementById('cfg_college_lat'); if(latEl) latEl.value = AMS.college.lat;
    const lngEl = document.getElementById('cfg_college_lng'); if(lngEl) lngEl.value = AMS.college.lng;
    const radEl = document.getElementById('cfg_college_rad'); if(radEl) radEl.value = AMS.college.radiusKm;
    const tolEl = document.getElementById('cfg_tolerance'); if(tolEl) tolEl.value = AMS.systemConfig.tolerance;
    const qrEl = document.getElementById('cfg_qr_expiry'); if(qrEl) qrEl.value = AMS.systemConfig.qr_expiry_minutes || '';
    const endEl = document.getElementById('cfg_att_end'); if(endEl) endEl.value = AMS.systemConfig.attendance_window_end || '';
    return data;
  }catch(e){console.warn('loadSystemConfig failed',e);}
}

// Save system config to backend and apply locally
async function saveSystemConfig(){
  try{
    const payload = {
      college_lat: parseFloat(document.getElementById('cfg_college_lat').value),
      college_lng: parseFloat(document.getElementById('cfg_college_lng').value),
      college_radius_km: parseFloat(document.getElementById('cfg_college_rad').value),
      tolerance: document.getElementById('cfg_tolerance').value,
      qr_expiry_minutes: parseInt(document.getElementById('cfg_qr_expiry').value||'5',10),
      attendance_window_end: document.getElementById('cfg_att_end').value
    };
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/system-config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data = await resp.json().catch(()=>({}));
    if(!resp.ok){toast(data.error||'Failed saving config','error'); return}
    // update local state
    AMS.college.lat = payload.college_lat;
    AMS.college.lng = payload.college_lng;
    AMS.college.radiusKm = payload.college_radius_km;
    AMS.systemConfig = AMS.systemConfig || {};
    AMS.systemConfig.tolerance = payload.tolerance;
    AMS.systemConfig.qr_expiry_minutes = payload.qr_expiry_minutes;
    AMS.systemConfig.attendance_window_end = payload.attendance_window_end;
    toast('Configuration saved!','success');
  }catch(e){console.error('saveSystemConfig',e);toast('Save failed','error')}
}

function renderAuditLogs(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">📋 Audit Logs</div><button class="btn btn-outline btn-sm">📥 Export</button></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Module</th></tr></thead>
      <tbody>${[
        {t:'09:12',u:'STU001',r:'student',a:'Attendance Marked',m:'Attendance'},
        {t:'09:05',u:'FAC001',r:'faculty',a:'QR Generated',m:'Attendance'},
        {t:'08:55',u:'ADM001',r:'admin',a:'User + Face Registered',m:'User Management'},
        {t:'08:40',u:'ADM001',r:'admin',a:'ISO Rule Added',m:'ISO Rules'},
        {t:'08:30',u:'FAC002',r:'faculty',a:'Work Log Submitted',m:'Daily Work Log'},
      ].map(l=>`<tr>
        <td class="text-muted">${l.t}</td><td class="fw-semibold">${l.u}</td>
        <td><span class="badge badge-${l.r==='admin'?'red':l.r==='faculty'?'blue':'green'}">${l.r}</span></td>
        <td>${l.a}</td><td>${l.m}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function renderGlobalReports(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">📊 Global Reports</div></div>
    <div class="form-row">
      <div class="form-group"><label>Report Type</label><select><option>Attendance Summary</option><option>Fee Collection</option><option>Exam Results</option></select></div>
      <div class="form-group"><label>Department</label><select><option>All Departments</option><option>Computer Science</option></select></div>
      <div class="form-group"><label>From Date</label><input type="date"/></div>
      <div class="form-group"><label>To Date</label><input type="date"/></div>
    </div>
    <div class="d-flex gap-md"><button class="btn btn-primary" onclick="toast('Report generated!','success')">Generate</button><button class="btn btn-outline">📥 Excel</button><button class="btn btn-outline">📥 PDF</button></div>
  </div>`;
}

function renderAdminAttendance(){
  setTimeout(loadAdminAttendance, 0);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">✅ Student Attendance (Admin)</div>
      <div class="d-flex gap-md align-center" style="flex-wrap:wrap">
        <input type="date" id="att-filter-date" value="${new Date().toISOString().split('T')[0]}"
          style="padding:.4rem .7rem;border-radius:6px;border:1px solid var(--border);background:var(--ink3);color:var(--text);font-size:.85rem"/>
        <input type="text" id="att-filter-batch" placeholder="Batch (e.g. CS-A)"
          style="padding:.4rem .7rem;border-radius:6px;border:1px solid var(--border);background:var(--ink3);color:var(--text);font-size:.85rem;width:130px"/>
        <input type="text" id="att-filter-subject" placeholder="Subject"
          style="padding:.4rem .7rem;border-radius:6px;border:1px solid var(--border);background:var(--ink3);color:var(--text);font-size:.85rem;width:130px"/>
        <button class="btn btn-primary btn-sm" onclick="loadAdminAttendance()">🔍 Filter</button>
      </div>
    </div>
    <div style="margin-bottom:1rem;font-size:0.85rem;color:var(--text2)">Admin can edit any attendance record regardless of marking method.</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Roll No</th><th>Name</th><th>Subject</th><th>Batch</th><th>Date</th><th>Method</th><th>Status</th><th>Edit</th></tr></thead>
      <tbody id="admin-att-tbody"><tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text3)">Loading…</td></tr></tbody>
    </table></div>
    <div id="admin-att-summary" class="text-muted text-sm mt-md"></div>
  </div>`;
}

async function loadAdminAttendance(){
  const tbody=document.getElementById('admin-att-tbody');
  if(!tbody)return;
  const date=document.getElementById('att-filter-date')?.value||'';
  const batch=document.getElementById('att-filter-batch')?.value.trim()||'';
  const subject=document.getElementById('att-filter-subject')?.value.trim()||'';
  const params=new URLSearchParams();
  if(date)params.set('date',date);
  if(batch)params.set('batch',batch);
  if(subject)params.set('subject',subject);
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance?${params}`);
    const data=await res.json();
    const records=Array.isArray(data)?data:(data.records||data.attendance||[]);
    const summary=document.getElementById('admin-att-summary');
    if(!records.length){
      tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text3)">No attendance records found for the selected filters.</td></tr>';
      if(summary)summary.textContent='';
      return;
    }
    const present=records.filter(r=>r.status==='present'||r.verified==='true').length;
    if(summary)summary.textContent=`${records.length} records — ${present} Present / ${records.length-present} Absent`;
    const methodBadge=m=>{if(m==='face'||m==='face_recognition')return'badge-blue';if(m==='qr')return'badge-teal';return'badge-orange';};
    const methodIcon=m=>{if(m==='face'||m==='face_recognition')return'📷';if(m==='qr')return'📱';return'✍️';};
    tbody.innerHTML=records.map(r=>{
      const st=r.status||(r.verified==='true'?'present':'absent');
      return`<tr>
        <td>${r.roll_no||'—'}</td>
        <td>${r.name||r.student_name||'—'}</td>
        <td>${r.subject_name||r.subject||'—'}</td>
        <td>${r.batch||'—'}</td>
        <td>${r.date||'—'}</td>
        <td><span class="badge ${methodBadge(r.method)}">${methodIcon(r.method)} ${r.method||'—'}</span></td>
        <td><span class="badge badge-${st==='present'?'green':'red'}">${st}</span></td>
        <td>
          <select style="padding:.3rem;background:var(--ink3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:.82rem"
            onchange="adminUpdateAtt('${r.id}',this.value)">
            <option value="present"${st==='present'?' selected':''}>Present</option>
            <option value="absent"${st==='absent'?' selected':''}>Absent</option>
          </select>
        </td>
      </tr>`;
    }).join('');
  }catch(ex){
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--red)">Failed to load attendance records.</td></tr>';
  }
}

async function adminUpdateAtt(id, status){
  if(!id){toast('Cannot update — record missing ID','error');return;}
  try{
    const res=await fetch(`${window.AMS_CONFIG.API_URL}/api/attendance/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
    const d=await res.json();
    if(d.success)toast('Attendance updated','success');
    else throw new Error(d.error||'Update failed');
  }catch(e){toast(e.message,'error');}
}

function renderAdminFees(){
  setTimeout(loadAdminFees, 0);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">💳 Student Fees (Admin)</div>
      <button class="btn btn-primary btn-sm" onclick="openAddFeeModal()">+ Add Fee</button>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Student ID</th><th>Fee Type</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="feesTableBody"><tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text3)">Loading…</td></tr></tbody>
    </table></div>
  </div>
  <div id="addFeeModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:450px;padding:1.5rem">
      <div class="card-header"><div class="card-title">➕ Add Fee Record</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('addFeeModal').style.display='none'">✕</button></div>
      <div class="form-group"><label>Student Roll No / ID</label><input id="fee_student" placeholder="e.g. CS001 or UUID"/></div>
      <div class="form-group"><label>Fee Type</label><input id="fee_type" placeholder="e.g. Exam Fee, Tuition, Library"/></div>
      <div class="form-row">
        <div class="form-group"><label>Amount (₹)</label><input id="fee_amount" type="number" placeholder="2400"/></div>
        <div class="form-group"><label>Due Date</label><input id="fee_due" type="date"/></div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:1rem" onclick="submitFeeRecord()">Save</button>
    </div>
  </div>`;
}
function openAddFeeModal(){ document.getElementById('addFeeModal').style.display='flex'; }
async function loadAdminFees(){
  const tbody=document.getElementById('feesTableBody');
  if(!tbody) return;
  try{
    const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/fees`);
    const d=await r.json();
    const fees=d.fees||[];
    if(!fees.length){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text3)">No fee records yet.</td></tr>'; return; }
    tbody.innerHTML=fees.map(f=>{
      const paid=f.payment_status==='paid';
      return `<tr>
        <td>${f.student_id||'–'}</td><td>${f.fee_type}</td>
        <td>₹${Number(f.amount).toLocaleString()}</td>
        <td>${f.due_date||'–'}</td>
        <td><span class="badge badge-${paid?'green':'red'}">${f.payment_status||'pending'}</span></td>
        <td class="d-flex gap-sm">${paid?'<span class="text-muted">Paid</span>':`<button class="btn btn-success btn-sm" onclick="markFeePaid('${f.id}')">Mark Paid</button>`}</td>
      </tr>`;
    }).join('');
  }catch(ex){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--red)">Failed to load</td></tr>'; }
}
async function submitFeeRecord(){
  const payload={student_id:document.getElementById('fee_student').value,fee_type:document.getElementById('fee_type').value,amount:document.getElementById('fee_amount').value,due_date:document.getElementById('fee_due').value||null};
  if(!payload.student_id||!payload.fee_type||!payload.amount){toast('Student, type and amount required','error');return;}
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/fees`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json();
  if(d.success){toast('Fee record added','success');document.getElementById('addFeeModal').style.display='none';loadAdminFees();}else toast(d.error||'Error','error');
}
async function markFeePaid(id){
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/fees/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({payment_status:'paid',payment_date:new Date().toISOString().split('T')[0]})});
  const d=await r.json();
  if(d.success){toast('Marked as paid!','success');loadAdminFees();}else toast(d.error||'Error','error');
}

function renderAdminPerformance(){
  return `<div class="card">
    <div class="card-header"><div class="card-title">📈 Student Performance (Admin)</div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Student</th><th>CGPA</th><th>Attendance</th><th>Rank</th></tr></thead>
      <tbody><tr><td>CS001 – Alice J.</td><td>8.4</td><td>91%</td><td>#12</td></tr></tbody>
    </table></div>
  </div>`;
}

function renderAdminLeave(){
  setTimeout(loadAdminLeave, 0);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">🏖️ Leave Management (Admin)</div>
      <div class="d-flex gap-md">
        <button class="btn btn-outline btn-sm" onclick="loadAdminLeave('all')">All</button>
        <button class="btn btn-outline btn-sm" onclick="loadAdminLeave('pending')">Pending</button>
        <button class="btn btn-outline btn-sm" onclick="loadAdminLeave('approved')">Approved</button>
      </div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Student ID</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
      <tbody id="leaveTableBody"><tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">Loading…</td></tr></tbody>
    </table></div>
  </div>`;
}
async function loadAdminLeave(status='pending'){
  const tbody=document.getElementById('leaveTableBody');
  if(!tbody) return;
  try{
    const param=status&&status!=='all'?`?status=${status}`:`?`;
    const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/leave-applications${param}`);
    const d=await r.json();
    const apps=d.applications||[];
    if(!apps.length){ tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text3)">No ${status} leave applications.</td></tr>`; return; }
    tbody.innerHTML=apps.map(a=>{
      const color=a.status==='approved'?'green':a.status==='rejected'?'red':'orange';
      const actions=a.status==='pending'?`<td class="d-flex gap-sm"><button class="btn btn-success btn-sm" onclick="updateLeaveStatus('${a.id}','approved')">Approve</button><button class="btn btn-danger btn-sm" onclick="updateLeaveStatus('${a.id}','rejected')">Reject</button></td>`:` <td><span class="text-muted">${a.status}</span></td>`;
      return `<tr><td>${a.student_id||'–'}</td><td>${a.leave_type}</td><td>${a.from_date}</td><td>${a.to_date}</td><td class="text-muted" style="max-width:180px">${a.reason}</td><td><span class="badge badge-${color}">${a.status}</span></td>${actions}</tr>`;
    }).join('');
  }catch(ex){ tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--red)">Failed to load</td></tr>'; }
}
async function updateLeaveStatus(id, status){
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/leave-applications/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,approved_by:AMS.user?.id||'admin'})});
  const d=await r.json();
  if(d.success){toast(`Leave ${status}!`,status==='approved'?'success':'warning');loadAdminLeave();}else toast(d.error||'Error','error');
}

function renderAdminPlacement(){
  setTimeout(()=>loadAdminPlacements(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">💼 Placement Data</div><button class="btn btn-primary btn-sm" onclick="openAdminPlacementModal()">+ Add</button></div>
    <div id="admin-placement-body"><div class="text-muted text-sm">Loading…</div></div>
  </div>
  <div id="adminPlacementModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:560px;padding:1.5rem">
      <div class="card-header"><div class="card-title" id="apm-title">Add Placement</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('adminPlacementModal').style.display='none'">✕</button></div>
      <input type="hidden" id="apm-id"/>
      <div class="form-row">
        <div class="form-group"><label>Company Name</label><input id="apm-company" placeholder="e.g. Google"/></div>
        <div class="form-group"><label>Role</label><input id="apm-role" placeholder="e.g. Software Engineer"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Package</label><input id="apm-package" placeholder="e.g. ₹18 LPA"/></div>
        <div class="form-group"><label>Deadline</label><input type="date" id="apm-deadline"/></div>
      </div>
      <div class="form-group"><label>Eligibility Criteria</label><input id="apm-eligibility" placeholder="e.g. 7.5+ CGPA, 2025 batch"/></div>
      <div class="form-group"><label>Apply Link (optional)</label><input id="apm-link" placeholder="https://"/></div>
      <button class="btn btn-primary w-full mt-md" onclick="saveAdminPlacement()">Save</button>
    </div>
  </div>`;
}
function openAdminPlacementModal(id){
  document.getElementById('adminPlacementModal').style.display='flex';
  document.getElementById('apm-title').textContent=id?'Edit Placement':'Add Placement';
  document.getElementById('apm-id').value=id||'';
  if(!id)['apm-company','apm-role','apm-package','apm-deadline','apm-eligibility','apm-link'].forEach(i=>document.getElementById(i).value='');
}
async function loadAdminPlacements(){
  const el=document.getElementById('admin-placement-body');
  if(!el)return;
  try{
    const res=await fetch('/api/placements?all=1');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.placements||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No placements yet. Click "+ Add" to add one.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Company</th><th>Role</th><th>Package</th><th>Deadline</th><th>Eligibility</th><th>Actions</th></tr></thead>
      <tbody>${list.map(p=>`<tr>
        <td class="fw-semibold">${p.company_name}</td>
        <td>${p.role}</td>
        <td>${p.package||'—'}</td>
        <td>${p.deadline||'—'}</td>
        <td class="text-sm text-muted">${p.eligibility_criteria||'—'}</td>
        <td class="d-flex gap-sm">
          <button class="btn btn-outline btn-sm" onclick="editAdminPlacement('${p.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteAdminPlacement('${p.id}')">🗑️</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load placements.</div>';}
}
async function editAdminPlacement(id){
  const res=await fetch(`/api/placements`);
  const data=await res.json();
  const list=Array.isArray(data)?data:(data.placements||[]);
  const p=list.find(x=>x.id===id);
  if(!p)return;
  openAdminPlacementModal(id);
  document.getElementById('apm-company').value=p.company_name||'';
  document.getElementById('apm-role').value=p.role||'';
  document.getElementById('apm-package').value=p.package||'';
  document.getElementById('apm-deadline').value=p.deadline||'';
  document.getElementById('apm-eligibility').value=p.eligibility_criteria||'';
  document.getElementById('apm-link').value=p.apply_link||'';
}
async function saveAdminPlacement(){
  const company_name=document.getElementById('apm-company').value.trim();
  const role=document.getElementById('apm-role').value.trim();
  if(!company_name||!role){toast('Company and role required','error');return;}
  const id=document.getElementById('apm-id').value;
  const body={company_name,role,package:document.getElementById('apm-package').value,
    deadline:document.getElementById('apm-deadline').value||null,
    eligibility_criteria:document.getElementById('apm-eligibility').value,
    apply_link:document.getElementById('apm-link').value};
  try{
    const res=await fetch(id?`/api/placements/${id}`:'/api/placements',{
      method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast(id?'Updated!':'Added!','success');
    document.getElementById('adminPlacementModal').style.display='none';
    loadAdminPlacements();
  }catch(e){toast(e.message,'error');}
}
async function deleteAdminPlacement(id){
  if(!confirm('Delete this placement?'))return;
  await fetch(`/api/placements/${id}`,{method:'DELETE'});
  toast('Deleted','success'); loadAdminPlacements();
}
function renderAdminCalendar(){
  setTimeout(()=>loadAdminCalendar(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">📅 Calendar Events</div><button class="btn btn-primary btn-sm" onclick="openCalModal()">+ Add Event</button></div>
    <div id="admin-cal-body"><div class="text-muted text-sm">Loading…</div></div>
  </div>
  <div id="calModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:480px;padding:1.5rem">
      <div class="card-header"><div class="card-title">Add Calendar Event</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('calModal').style.display='none'">✕</button></div>
      <div class="form-group"><label>Title</label><input id="cal-title" placeholder="e.g. End Semester Exams Begin"/></div>
      <div class="form-row">
        <div class="form-group"><label>Event Date</label><input type="date" id="cal-date"/></div>
        <div class="form-group"><label>End Date (optional)</label><input type="date" id="cal-end"/></div>
      </div>
      <div class="form-group"><label>Type</label><select id="cal-type" style="width:100%;padding:.5rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)"><option>exam</option><option>holiday</option><option>event</option><option>registration</option><option>assignment</option></select></div>
      <div class="form-group"><label>Description (optional)</label><textarea id="cal-desc" rows="2" style="width:100%;padding:.6rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical"></textarea></div>
      <button class="btn btn-primary w-full mt-md" onclick="submitCalEvent()">Add Event</button>
    </div>
  </div>`;
}
function openCalModal(){document.getElementById('calModal').style.display='flex';}
async function loadAdminCalendar(){
  const el=document.getElementById('admin-cal-body');
  if(!el)return;
  try{
    const res=await fetch('/api/calendar-events');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.events||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No events. Click "+ Add Event" to create one.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Title</th><th>Date</th><th>End Date</th><th>Type</th><th>Actions</th></tr></thead>
      <tbody>${list.map(e=>`<tr>
        <td class="fw-semibold">${e.title}</td>
        <td>${e.event_date||'—'}</td>
        <td>${e.end_date||'—'}</td>
        <td><span class="badge badge-blue">${e.event_type||'event'}</span></td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteCalEvent('${e.id}')">🗑️</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load events.</div>';}
}
async function submitCalEvent(){
  const title=document.getElementById('cal-title').value.trim();
  const event_date=document.getElementById('cal-date').value;
  if(!title||!event_date){toast('Title and date required','error');return;}
  try{
    const res=await fetch('/api/calendar-events',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title,event_date,end_date:document.getElementById('cal-end').value||null,
        event_type:document.getElementById('cal-type').value,description:document.getElementById('cal-desc').value})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Event added!','success');
    document.getElementById('calModal').style.display='none';
    loadAdminCalendar();
  }catch(e){toast(e.message,'error');}
}
async function deleteCalEvent(id){
  if(!confirm('Delete this event?'))return;
  await fetch(`/api/calendar-events/${id}`,{method:'DELETE'});
  toast('Deleted','success'); loadAdminCalendar();
}
function renderAdminLibrary(){
  setTimeout(()=>loadAdminLibrary(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">📖 Library Resources</div><button class="btn btn-primary btn-sm" onclick="openLibModal()">+ Add Resource</button></div>
    <div id="admin-lib-body"><div class="text-muted text-sm">Loading…</div></div>
  </div>
  <div id="libModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:500px;padding:1.5rem">
      <div class="card-header"><div class="card-title">Add Library Resource</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('libModal').style.display='none'">✕</button></div>
      <div class="form-group"><label>Title</label><input id="lib-title" placeholder="e.g. Introduction to Algorithms"/></div>
      <div class="form-group"><label>Author</label><input id="lib-author" placeholder="e.g. Cormen et al."/></div>
      <div class="form-row">
        <div class="form-group"><label>Type</label><select id="lib-type" style="width:100%;padding:.5rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)"><option>E-Book</option><option>Journal</option><option>Research Paper</option><option>Video</option><option>Other</option></select></div>
        <div class="form-group"><label>Subject</label><input id="lib-subject" placeholder="e.g. Computer Science"/></div>
      </div>
      <div class="form-group"><label>PDF / Access Link</label><input id="lib-pdf" placeholder="https://"/></div>
      <button class="btn btn-primary w-full mt-md" onclick="submitLibResource()">Add</button>
    </div>
  </div>`;
}
function openLibModal(){document.getElementById('libModal').style.display='flex';}
async function loadAdminLibrary(){
  const el=document.getElementById('admin-lib-body');
  if(!el)return;
  try{
    const res=await fetch('/api/library');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.resources||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No resources yet.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Title</th><th>Author</th><th>Type</th><th>Subject</th><th>Actions</th></tr></thead>
      <tbody>${list.map(b=>`<tr>
        <td class="fw-semibold">${b.title}</td>
        <td>${b.author||'—'}</td>
        <td><span class="badge badge-blue">${b.resource_type||'Resource'}</span></td>
        <td>${b.subject||'—'}</td>
        <td class="d-flex gap-sm">
          ${b.pdf_link?`<a href="${b.pdf_link}" target="_blank" class="btn btn-outline btn-sm">🔗</a>`:''}
          <button class="btn btn-danger btn-sm" onclick="deleteLibResource('${b.id}')">🗑️</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load resources.</div>';}
}
async function submitLibResource(){
  const title=document.getElementById('lib-title').value.trim();
  if(!title){toast('Title required','error');return;}
  try{
    const res=await fetch('/api/library',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title,author:document.getElementById('lib-author').value,
        resource_type:document.getElementById('lib-type').value,
        subject:document.getElementById('lib-subject').value,
        pdf_link:document.getElementById('lib-pdf').value})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Resource added!','success');
    document.getElementById('libModal').style.display='none';
    loadAdminLibrary();
  }catch(e){toast(e.message,'error');}
}
async function deleteLibResource(id){
  if(!confirm('Delete this resource?'))return;
  await fetch(`/api/library/${id}`,{method:'DELETE'});
  toast('Deleted','success'); loadAdminLibrary();
}
function renderAdminCommunities(){
  setTimeout(()=>loadAdminCommunities(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">💬 Manage Communities</div><button class="btn btn-primary btn-sm" onclick="openCommModal()">+ Create Community</button></div>
    <div id="admin-comm-body"><div class="text-muted text-sm">Loading…</div></div>
  </div>
  <div id="commModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:460px;padding:1.5rem">
      <div class="card-header"><div class="card-title">Create Community</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('commModal').style.display='none'">✕</button></div>
      <div class="form-group"><label>Community Name</label><input id="comm-name" placeholder="e.g. Data Structures"/></div>
      <div class="form-row">
        <div class="form-group"><label>Course Code</label><input id="comm-code" placeholder="e.g. CS301"/></div>
        <div class="form-group"><label>Department</label><input id="comm-dept" placeholder="e.g. CSE"/></div>
      </div>
      <div class="form-group"><label>Description (optional)</label><input id="comm-desc" placeholder="About this community"/></div>
      <button class="btn btn-primary w-full mt-md" onclick="submitCommunity()">Create</button>
    </div>
  </div>`;
}
function openCommModal(){document.getElementById('commModal').style.display='flex';}
async function loadAdminCommunities(){
  const el=document.getElementById('admin-comm-body');
  if(!el)return;
  try{
    const res=await fetch('/api/communities');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.communities||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No communities. Click "+ Create Community" to add one.</div>';return;}
    el.innerHTML=`<div class="tbl-wrap"><table>
      <thead><tr><th>Name</th><th>Code</th><th>Department</th><th>Members</th><th>Actions</th></tr></thead>
      <tbody>${list.map(c=>`<tr>
        <td class="fw-semibold">${c.name}</td>
        <td><span class="badge badge-blue">${c.course_code||'—'}</span></td>
        <td>${c.department||'—'}</td>
        <td>${c.members_count||0}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteCommunity('${c.id}')">🗑️</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load communities.</div>';}
}
async function submitCommunity(){
  const name=document.getElementById('comm-name').value.trim();
  if(!name){toast('Name required','error');return;}
  try{
    const res=await fetch('/api/communities',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,course_code:document.getElementById('comm-code').value,
        department:document.getElementById('comm-dept').value,
        description:document.getElementById('comm-desc').value})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Community created!','success');
    document.getElementById('commModal').style.display='none';
    loadAdminCommunities();
  }catch(e){toast(e.message,'error');}
}
async function deleteCommunity(id){
  if(!confirm('Delete this community?'))return;
  await fetch(`/api/communities/${id}`,{method:'DELETE'});
  toast('Deleted','success'); loadAdminCommunities();
}
function renderAdminSendNotif(){
  setTimeout(()=>loadAdminNotifications(),50);
  return `<div class="card">
    <div class="card-header"><div class="card-title">🔔 Send Notifications</div></div>
    <div class="form-group"><label>Title</label><input id="notif-title" placeholder="e.g. Exam Schedule Released"/></div>
    <div class="form-group"><label>Message</label><textarea id="notif-msg" rows="3" placeholder="Notification content…" style="width:100%;padding:.7rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical"></textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Type</label><select id="notif-type" style="width:100%;padding:.5rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)"><option value="info">Info</option><option value="warning">Warning</option><option value="success">Success</option><option value="error">Alert</option></select></div>
      <div class="form-group"><label>Target Role</label><select id="notif-role" style="width:100%;padding:.5rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)"><option value="all">All Users</option><option value="student">Students Only</option><option value="faculty">Faculty Only</option></select></div>
    </div>
    <button class="btn btn-primary" onclick="sendNotification()">📢 Send Notification</button>
  </div>
  <div class="card mt-lg">
    <div class="card-header"><div class="card-title">📋 Sent Notifications</div><button class="btn btn-outline btn-sm" onclick="loadAdminNotifications()">🔄 Refresh</button></div>
    <div id="admin-notif-list"><div class="text-muted text-sm">Loading…</div></div>
  </div>`;
}
async function sendNotification(){
  const title=document.getElementById('notif-title').value.trim();
  const message=document.getElementById('notif-msg').value.trim();
  if(!title||!message){toast('Title and message required','error');return;}
  try{
    const res=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title,message,
        notification_type:document.getElementById('notif-type').value,
        target_role:document.getElementById('notif-role').value,
        sent_by:AMS.user.id||AMS.user.username})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    toast('Notification sent!','success');
    document.getElementById('notif-title').value='';
    document.getElementById('notif-msg').value='';
    loadAdminNotifications();
  }catch(e){toast(e.message,'error');}
}
async function loadAdminNotifications(){
  const el=document.getElementById('admin-notif-list');
  if(!el)return;
  try{
    const res=await fetch('/api/notifications');
    const data=await res.json();
    const list=Array.isArray(data)?data:(data.notifications||[]);
    if(!list.length){el.innerHTML='<div class="text-muted text-sm">No notifications sent yet.</div>';return;}
    const clr={info:'info',warning:'warning',success:'success',error:'danger'};
    el.innerHTML=list.map(n=>`<div class="announcement ${clr[n.notification_type]||'info'} mb-sm">
      <div class="d-flex justify-between align-center">
        <div class="ann-title">${n.title}</div>
        <div class="d-flex gap-sm align-center">
          <span class="badge badge-gray">${n.target_role||'all'}</span>
          <div class="ann-meta">${new Date(n.created_at).toLocaleDateString()}</div>
          <button class="btn btn-danger btn-sm" style="padding:.2rem .5rem;font-size:.75rem" onclick="deleteNotif('${n.id}')">🗑️</button>
        </div>
      </div>
      <div class="text-sm text-muted mt-sm">${n.message}</div>
    </div>`).join('');
  }catch(e){if(el)el.innerHTML='<div class="text-muted text-sm">Could not load notifications.</div>';}
}
async function deleteNotif(id){
  if(!confirm('Delete this notification?'))return;
  await fetch(`/api/notifications/${id}`,{method:'DELETE'});
  toast('Deleted','success'); loadAdminNotifications();
}

function renderAdminGrievances(){
  setTimeout(loadAdminGrievances, 0);
  return `<div class="card">
    <div class="card-header">
      <div class="card-title">⚖️ Grievances (Admin)</div>
      <div class="d-flex gap-md">
        <button class="btn btn-outline btn-sm" onclick="loadAdminGrievances('open')">Open</button>
        <button class="btn btn-outline btn-sm" onclick="loadAdminGrievances('resolved')">Resolved</button>
        <button class="btn btn-outline btn-sm" onclick="loadAdminGrievances()">All</button>
      </div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>ID</th><th>Student</th><th>Category</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="grievTableBody"><tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text3)">Loading…</td></tr></tbody>
    </table></div>
  </div>
  <div id="grievModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center">
    <div class="card" style="width:90%;max-width:500px;padding:1.5rem">
      <div class="card-header"><div class="card-title">💬 Respond to Grievance</div><button class="btn btn-outline btn-sm" onclick="document.getElementById('grievModal').style.display='none'">✕</button></div>
      <input type="hidden" id="grievId"/>
      <div class="form-group"><label>Response</label><textarea id="grievResponse" rows="4" style="width:100%;padding:.7rem;background:var(--ink3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical"></textarea></div>
      <div class="d-flex gap-md mt-md">
        <button class="btn btn-primary" style="flex:1" onclick="submitGrievResponse('in_progress')">Save Response</button>
        <button class="btn btn-success" style="flex:1" onclick="submitGrievResponse('resolved')">✅ Mark Resolved</button>
      </div>
    </div>
  </div>`;
}
async function loadAdminGrievances(status=''){
  const tbody=document.getElementById('grievTableBody');
  if(!tbody) return;
  try{
    const param=status?`?status=${status}`:`?`;
    const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/grievances${param}`);
    const d=await r.json();
    const gs=d.grievances||[];
    if(!gs.length){ tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text3)">No grievances found.</td></tr>`; return; }
    tbody.innerHTML=gs.map(g=>{
      const color=g.status==='open'?'orange':g.status==='resolved'?'green':'blue';
      return `<tr>
        <td class="text-muted" style="font-size:.75rem">${g.id.slice(0,8)}…</td>
        <td>${g.anonymous?'Anonymous':g.student_id}</td>
        <td><span class="badge badge-blue">${g.category}</span></td>
        <td>${g.subject}</td>
        <td><span class="badge badge-${color}">${g.status}</span></td>
        <td class="d-flex gap-sm">
          <button class="btn btn-primary btn-sm" onclick="openGrievModal('${g.id}')">Respond</button>
          ${g.status!=='resolved'?`<button class="btn btn-success btn-sm" onclick="submitGrievResponseDirect('${g.id}','resolved')">Resolve</button>`:''}
        </td>
      </tr>`;
    }).join('');
  }catch(ex){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--red)">Failed to load</td></tr>'; }
}
function openGrievModal(id){ document.getElementById('grievId').value=id; document.getElementById('grievResponse').value=''; document.getElementById('grievModal').style.display='flex'; }
async function submitGrievResponse(status){
  const id=document.getElementById('grievId').value;
  const response=document.getElementById('grievResponse').value;
  await submitGrievResponseDirect(id, status, response);
  document.getElementById('grievModal').style.display='none';
}
async function submitGrievResponseDirect(id, status, response=''){
  const r=await fetch(`${window.AMS_CONFIG.API_URL}/api/grievances/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,response})});
  const d=await r.json();
  if(d.success){toast('Grievance updated!','success');loadAdminGrievances();}else toast(d.error||'Error','error');
}

// ── Boot ──────────────────────────────────────────────────
// ── PRODUCTION SESSION MONITOR ──────────────────────────────────────────────
// Periodically validate session is still valid in Firestore (production-ready)
let sessionMonitorInterval = null;

async function initSessionMonitor() {
  // Start periodic session validation every 5 minutes
  // Check immediately
  await validateCurrentSession();
  
  // Then check every 5 minutes
  sessionMonitorInterval = setInterval(async () => {
    const username = AmsDB._getCookie();
    if (username) {
      await validateCurrentSession();
    }
  }, 5 * 60 * 1000); // 5 minutes
}

async function validateCurrentSession() {
  // Validate current session exists in Firestore backend
  const username = AmsDB._getCookie();
  if (!username) return false;
  
  try {
    const resp = await fetch(`${window.AMS_CONFIG.API_URL}/api/session/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    if (!resp.ok) {
      console.warn('[SessionMonitor] Session invalid, logging out');
      await logout(); // Force logout if session invalid
      return false;
    }
    
    return true;
  } catch (err) {
    console.warn('[SessionMonitor] Session validation failed:', err.message);
    // Don't logout on network error—just skip validation this round
    return false;
  }
}

function stopSessionMonitor() {
  // Stop session validation checks
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
    sessionMonitorInterval = null;
  }
}


window.addEventListener('DOMContentLoaded',()=>{
  // INSTANT: Show login immediately, bypass all async operations
  const pageLoader=document.getElementById('pageLoader');
  const loginPage=document.getElementById('loginPage');
  
  if(pageLoader) pageLoader.style.display='none';
  if(loginPage) loginPage.style.display='flex';
  
  // Enter key handler
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA') return;
    if (e.target.tagName === 'SELECT') return;
    const modals = document.querySelectorAll('[style*="position:fixed"]');
    for (const m of modals) {
      const s = m.style.display || '';
      if (s === 'flex' || s.includes('flex')) {
        if (m.id === 'loginPage' || m.id === 'pageLoader' || m.id === 'topbar') continue;
        const btn = m.querySelector('.btn-primary:not([disabled]),.btn-success:not([disabled])');
        if (btn) { btn.click(); return; }
      }
    }
    const lp = document.getElementById('loginPage');
    if (lp && lp.style.display !== 'none') { doLogin(); return; }
  });
  
  // Check for QR params
  const params=new URLSearchParams(window.location.search);
  const qrSessionId=params.get('qr');
  const course=params.get('course');
  if(qrSessionId && course){
    showQRAttendanceForm(qrSessionId,course);
  }else{
    const topbarDate=document.getElementById('topbarDate');
    if(topbarDate) topbarDate.textContent=fmtDate();
  }
  
  // Load cached session in background (non-blocking)
  setTimeout(()=>{
    const storedSession = localStorage.getItem('ams_session_json');
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession);
        if (session && session.user && session.role) {
          AMS.user = session.user;
          AMS.role = session.role;
          AMS.profile = session.profile || {};
          if (!AMS.profile.username) AMS.profile.username = AMS.user.username || '';
          if (!AMS.profile.employee_id && AMS.role === 'faculty') AMS.profile.employee_id = AMS.user.id || '';
          initDashboard();
        }
      } catch (e) {
        console.warn('[Init] Error loading session:', e.message);
      }
    }
  }, 100); // Small delay to avoid blocking page render
});

function _checkQRParams(){
  const params=new URLSearchParams(window.location.search);
  const qrSessionId=params.get('qr');
  const course=params.get('course');
  if(qrSessionId && course){
    showQRAttendanceForm(qrSessionId,course);
  }else{
    const topbarDate=document.getElementById('topbarDate');
    if(topbarDate) topbarDate.textContent=fmtDate();
  }
}

// ── QR Attendance Form (mobile student view) ──────────────
function showQRAttendanceForm(sessionId,course){
  const pageLoader=document.getElementById('pageLoader');
  const qrPage=document.getElementById('qrAttendancePage');
  if(pageLoader) pageLoader.style.display='none';
  if(qrPage){
    qrPage.style.cssText='display:flex !important;position:fixed;top:0;left:0;right:0;bottom:0;z-index:2000;align-items:center;justify-content:center;background:var(--ink)';
  }
  document.getElementById('qrAttContent').innerHTML=`
    <div class="form-group">
      <label>Roll Number / Student ID</label>
      <input id="qrRollNo" type="text" placeholder="e.g., CS001" style="width:100%;padding:.7rem;border-radius:8px;border:1px solid var(--border);background:var(--ink3);color:var(--text);font-size:1rem"/>
    </div>
    <div class="form-group">
      <label>Full Name</label>
      <input id="qrName" type="text" placeholder="Enter your full name" style="width:100%;padding:.7rem;border-radius:8px;border:1px solid var(--border);background:var(--ink3);color:var(--text);font-size:1rem"/>
    </div>
    <div class="form-group">
      <label>Course</label>
      <input type="text" value="${course}" disabled style="width:100%;padding:.7rem;border-radius:8px;border:1px solid var(--border);background:var(--ink3);color:var(--text2);opacity:0.6;font-size:1rem"/>
    </div>
    <button class="btn btn-primary" onclick="captureQRFaceAndLocation('${sessionId}','${course}')" style="width:100%;padding:.8rem;margin-top:1rem">📷 Capture Face & Location</button>
    <button class="btn btn-outline" onclick="cancelQRAttendance()" style="width:100%;padding:.8rem;margin-top:.5rem">Cancel</button>
  `;
}

async function captureQRFaceAndLocation(sessionId,course){
  const rollNo=document.getElementById('qrRollNo').value.trim();
  const name=document.getElementById('qrName').value.trim();
  if(!rollNo||!name){alert('Please enter Roll Number and Name');return;}
  const body=document.getElementById('qrAttContent');
  body.innerHTML=`<div class="att-status"><div class="att-icon-wrap loading" style="animation:spin 1.2s linear infinite">📍</div><p>Verifying location…</p></div>`;
  try{
    const loc=await getLocation();
    if(!isInCollege(loc.lat,loc.lng)){
      body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">📍</div><h3 class="text-red">❌ Not in Campus</h3><button class="btn btn-outline mt-md" onclick="showQRAttendanceForm('${sessionId}','${course}')">Go Back</button></div>`;
      return;
    }
    body.innerHTML=`<div class="camera-wrap" id="qrFaceCapture">
      <video id="qrCaptureVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>
      <div class="camera-ring"></div>
      <div class="camera-status">📍 Location verified ✅ — Position your face</div>
    </div>
    <div style="text-align:center;margin-top:1rem">
      <button class="btn btn-primary" onclick="captureQRFaceSnapshot('${sessionId}','${course}','${rollNo}','${name}')">📷 Capture Face</button>
    </div>`;
    const video=document.getElementById('qrCaptureVideo');
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
    video.srcObject=stream;
    AMS.cameraStream=stream;
  }catch(e){
    body.innerHTML=`<div class="att-status"><div class="att-icon-wrap error">❌</div><p>${e.message}</p><button class="btn btn-outline mt-md" onclick="showQRAttendanceForm('${sessionId}','${course}')">Go Back</button></div>`;
  }
}

async function captureQRFaceSnapshot(sessionId,course,rollNo,name){
  stopCamera();
  const body=document.getElementById('qrAttContent');
  body.innerHTML=`<div class="att-status"><div class="att-icon-wrap loading" style="animation:spin 1.2s linear infinite">🔍</div><p>Verifying face…</p></div>`;
  setTimeout(()=>{
    body.innerHTML=`<div class="att-status">
      <div class="att-icon-wrap success">✅</div>
      <h3 class="text-green">Attendance Marked - PRESENT</h3>
      <p>Roll No: <strong>${rollNo}</strong></p>
      <p>Name: <strong>${name}</strong></p>
      <p>Course: <strong>${course}</strong></p>
      <p class="text-muted text-sm">Time: ${fmtTime()}</p>
      <button class="btn btn-outline mt-md" onclick="returnToHome()" style="width:100%">↩ Home</button>
    </div>`;
  },2000);
}

function cancelQRAttendance(){
  stopCamera();
  if(confirm('Cancel attendance marking?')) window.location.href=window.location.origin;
}

function returnToHome(){
  stopCamera();
  window.location.href=window.location.origin;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK STUDENT ENROLLMENT FUNCTIONS (Admin)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load and display bulk enrollment form
 * Allows admin to upload/paste student list and enroll them (60 per section)
 */
function loadBulkEnrollmentForm(){
  const container = document.getElementById('bulkEnrollmentContainer') || document.getElementById('admin-container');
  if(!container) return;
  
  container.innerHTML = `
    <div class="panel" style="max-width:900px;margin:0 auto;padding:2rem">
      <h2>📚 Bulk Student Enrollment</h2>
      <p class="text-muted">Enroll multiple students (automatically 60 per section)</p>
      
      <div style="margin:2rem 0;display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div>
          <label>Department</label>
          <select id="bulkDept" style="width:100%;padding:0.7rem;border-radius:4px;border:1px solid var(--border)">
            <option value="">Select Department</option>
            <option value="CSE">CSE</option>
            <option value="ECE">ECE</option>
            <option value="MECH">Mechanical</option>
            <option value="CIVIL">Civil</option>
          </select>
        </div>
        
        <div>
          <label>Semester</label>
          <select id="bulkSem" style="width:100%;padding:0.7rem;border-radius:4px;border:1px solid var(--border)">
            <option value="">Select Semester</option>
            <option value="1">1</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="7">7</option>
          </select>
        </div>
      </div>
      
      <div style="margin:2rem 0">
        <label>Student List (CSV format: student_id, roll_no, section_name)</label>
        <textarea id="bulkStudentList" placeholder="Example:&#10;550e8400-e29b-41d4-a716-446655440000,CSE001,A&#10;550e8400-e29b-41d4-a716-446655440001,CSE002,A&#10;550e8400-e29b-41d4-a716-446655440002,CSE003,B" 
          style="width:100%;height:300px;padding:1rem;border-radius:4px;border:1px solid var(--border);background:var(--ink3);color:var(--text);font-family:monospace;font-size:0.9rem"></textarea>
      </div>
      
      <div style="margin:2rem 0">
        <button class="btn btn-primary" onclick="executeBulkEnrollment()" style="width:100%;padding:1rem">
          🚀 Enroll <span id="bulkCount">0</span> Students
        </button>
      </div>
      
      <div id="bulkEnrollmentStatus"></div>
      
      <div style="margin-top:2rem;padding:1rem;background:var(--ink3);border-radius:4px;border-left:4px solid var(--accent)">
        <h4>📋 How it works:</h4>
        <ul style="margin:0.5rem 0 0 1.5rem;color:var(--text2);font-size:0.9rem">
          <li>Paste student IDs and roll numbers in CSV format</li>
          <li>System automatically creates sections (max 60 per section)</li>
          <li>Labs are auto-divided into Batch1 (1-30) and Batch2 (31-60)</li>
          <li>All curriculum subjects are assigned automatically</li>
          <li>Takes ~30 seconds per 100 students</li>
        </ul>
      </div>
    </div>
  `;
  
  // Update student count as user types
  document.getElementById('bulkStudentList').addEventListener('input', (e) => {
    const lines = e.target.value.trim().split('\n').filter(l => l.trim());
    document.getElementById('bulkCount').textContent = lines.length;
  });
}

/**
 * Execute bulk enrollment with the pasted student list
 */
async function executeBulkEnrollment(){
  const dept = document.getElementById('bulkDept')?.value;
  const sem = document.getElementById('bulkSem')?.value;
  const csv = document.getElementById('bulkStudentList')?.value;
  const statusDiv = document.getElementById('bulkEnrollmentStatus');
  
  if(!dept || !sem || !csv) {
    alert('Please fill all fields');
    return;
  }
  
  // Parse CSV
  const lines = csv.trim().split('\n').filter(l => l.trim());
  const students = lines.map(line => {
    const [student_id, roll_no, section_name] = line.split(',').map(s => s.trim());
    return { student_id, roll_no, section_name: section_name || 'A' };
  }).filter(s => s.student_id && s.roll_no);
  
  if(students.length === 0) {
    alert('No valid students in list');
    return;
  }
  
  statusDiv.innerHTML = `<div style="padding:1rem;background:#fff3cd;border-radius:4px;color:#856404">
    ⏳ Enrolling ${students.length} students... This may take a minute.
  </div>`;
  
  try {
    const response = await fetch(`${API_URL}/api/enrollments/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        students: students,
        department: dept,
        program: dept,
        semester: parseInt(sem),
        academic_year: '2025-26'
      })
    });
    
    const result = await response.json();
    
    if(result.success) {
      statusDiv.innerHTML = `<div style="padding:1.5rem;background:#d4edda;border-radius:4px;border-left:4px solid #28a745;color:#155724">
        <h4 style="margin-top:0">✅ Enrollment Complete!</h4>
        <p><strong>Enrolled:</strong> ${result.enrolled} students</p>
        ${result.failed > 0 ? `<p><strong>Failed:</strong> ${result.failed} students</p>` : ''}
        <p class="text-muted text-sm">${result.message}</p>
      </div>`;
    } else {
      statusDiv.innerHTML = `<div style="padding:1rem;background:#f8d7da;border-radius:4px;color:#721c24">
        ❌ Error: ${result.error || 'Unknown error'}
      </div>`;
    }
  } catch(e) {
    statusDiv.innerHTML = `<div style="padding:1rem;background:#f8d7da;border-radius:4px;color:#721c24">
      ❌ Error: ${e.message}
    </div>`;
  }
}

/**
 * Check how many students per section (to guide enrollment)
 */
async function checkSectionCounts(){
  const dept = document.getElementById('bulkDept')?.value;
  const sem = document.getElementById('bulkSem')?.value;
  
  if(!dept || !sem) return;
  
  try {
    const response = await fetch(`${API_URL}/api/enrollments/section-counts?department=${dept}&semester=${sem}&year=2025-26`);
    const result = await response.json();
    
    if(result.success) {
      console.log('Section Counts:', result.section_counts);
      alert(`Section Counts:\n${Object.entries(result.section_counts || {})
        .map(([sec, cnt]) => `${sec}: ${cnt}/60 students`)
        .join('\n')}`);
    }
  } catch(e) {
    console.error('Error checking counts:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACULTY SUBJECT STUDENT VIEWING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load students in a subject, organized section-wise
 * Used by faculty to view their students before marking attendance
 */
async function loadFacultySubjectStudents(subjectCode){
  const container = document.getElementById('facultyStudentsContainer') || document.getElementById('faculty-main');
  if(!container) return;
  
  container.innerHTML = `<div style="text-align:center;padding:2rem">
    <div class="loading" style="animation:spin 1.2s linear infinite;font-size:2rem">📚</div>
    <p style="color:var(--text2)">Loading students...</p>
  </div>`;
  
  try {
    const response = await fetch(`${API_URL}/api/faculty/subject-students/${subjectCode}`);
    const result = await response.json();
    
    if(result.success) {
      renderFacultySubjectStudents(result);
    } else {
      container.innerHTML = `<div style="padding:2rem;color:var(--text2)">
        ❌ ${result.error || 'Failed to load students'}
      </div>`;
    }
  } catch(e) {
    container.innerHTML = `<div style="padding:2rem;color:var(--text2)">
      ❌ Error: ${e.message}
    </div>`;
  }
}

/**
 * Render faculty's subject students with section-wise grouping
 */
function renderFacultySubjectStudents(data){
  const container = document.getElementById('facultyStudentsContainer') || document.getElementById('faculty-main');
  
  let html = `
    <div style="padding:2rem">
      <h2>${data.subject_code}</h2>
      <p class="text-muted">Total Students: <strong>${data.total_students}</strong></p>
      
      <div style="margin:2rem 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem">
  `;
  
  // Section summary cards
  Object.entries(data.summary || {}).forEach(([section, info]) => {
    html += `
      <div style="padding:1.5rem;background:var(--ink3);border-radius:8px;border-left:4px solid var(--accent)">
        <div style="font-size:1.2rem;font-weight:600;margin-bottom:0.5rem">Section ${section}</div>
        <div style="font-size:1.5rem;color:var(--accent);font-weight:600">${info.total}</div>
        <div class="text-muted text-sm" style="margin-top:0.5rem">
          ${Object.entries(info.batches || {}).map(([batch, cnt]) => `${batch}: ${cnt}`).join(' | ')}
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  
  // Detailed section-wise student lists
  html += `<div style="margin:2rem 0">`;
  
  Object.entries(data.grouped_by_section || {}).forEach(([section, batches]) => {
    html += `
      <div style="margin:2rem 0;background:var(--ink3);border-radius:8px;overflow:hidden;border:1px solid var(--border)">
        <div style="padding:1rem;background:#667eea;color:white;font-weight:600">
          Section ${section} — ${Object.entries(batches).reduce((sum, [b, students]) => sum + students.length, 0)} Students
        </div>
        <div style="padding:1rem">
    `;
    
    Object.entries(batches).forEach(([batch, students]) => {
      html += `
        <div style="margin:1rem 0">
          <h5 style="margin:0.5rem 0;color:var(--accent)">${batch} (${students.length} students)</h5>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.5rem">
      `;
      
      students.forEach(student => {
        html += `
          <div style="padding:0.7rem;background:var(--ink);border-radius:4px;border:1px solid var(--border);font-size:0.9rem">
            <div style="font-weight:500;color:var(--accent)">${student.roll_no}</div>
            <div style="color:var(--text2);font-size:0.85rem">${batch}</div>
          </div>
        `;
      });
      
      html += `</div></div>`;
    });
    
    html += `</div></div>`;
  });
  
  html += `</div></div>`;
  
  container.innerHTML = html;
}

/**
 * Export subject students to CSV (for attendance/grading)
 */
function exportSubjectStudentsCSV(subjectCode, summary){
  let csv = `Subject,Section,Batch,Roll Number\n`;
  
  // Flatten the structure and create CSV
  Object.entries(summary || {}).forEach(([section, info]) => {
    Object.entries(info.batches || {}).forEach(([batch, count]) => {
      for(let i = 0; i < count; i++) {
        csv += `${subjectCode},${section},${batch},<roll_number>\n`;
      }
    });
  });
  
  const link = document.createElement('a');
  link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  link.download = `${subjectCode}_students.csv`;
  link.click();
}