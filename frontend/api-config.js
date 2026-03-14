// SmartAMS API Configuration
// This file configures the backend API endpoint

window.AMS_CONFIG = {
  // Development: use localhost:6001
  // Production: use Cloud Run URL
  API_URL: window.location.hostname === 'localhost' 
    ? 'http://localhost:6001'
    : 'https://smartams-backend-76160313029.us-central1.run.app',
  
  // Enable debug logging
  DEBUG: window.location.hostname === 'localhost',

  // Supabase configuration (used by backend; stored here for reference)
  SUPABASE_URL: 'https://qovojskhkmppktwaozpa.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvdm9qc2toa21wcGt0d2FvenBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjA1OTgsImV4cCI6MjA4NjgzNjU5OH0.Vx99lBfzbnbcSOe4IeBOCudVM_r6Cxtgk4L15fB5XAI'
};

// ── Firebase Init (Auth + Realtime Database) ─────────────
(function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.warn('[Firebase] SDK not loaded');
      window.firebaseAuth = null;
      window.rtdb = null;
      window.fstore = null;
      return;
    }
    const firebaseConfig = {
      apiKey: "AIzaSyASv7EkWvy2dwtile1AbqyAsTKsVe1eUF0",
      authDomain: "smart-ams-project-faa5f.firebaseapp.com",
      databaseURL: "https://smart-ams-project-faa5f-default-rtdb.firebaseio.com",
      projectId: "smart-ams-project-faa5f",
      storageBucket: "smart-ams-project-faa5f.firebasestorage.app",
      messagingSenderId: "76160313029",
      appId: "1:76160313029:web:a5a35540a5a89117f3f2ac",
      measurementId: "G-WVE5RLV3WW"
    };
    
    try {
      firebase.initializeApp(firebaseConfig);
      window.firebaseAuth = firebase.auth();
      window.rtdb = firebase.database();
    } catch (e) {
      console.warn('[Firebase] initializeApp failed:', e.message);
      window.firebaseAuth = null;
      window.rtdb = null;
      window.fstore = null;
      return;
    }
    
    // Initialize Firestore - keep it simple, no persistence features
    if (typeof firebase.firestore === 'function') {
      try {
        window.fstore = firebase.firestore();
        console.log('✅ Firestore initialized (basic mode)');
      } catch (err) {
        console.warn('[Firestore] Init failed:', err.message);
        window.fstore = null;
      }
    } else {
      window.fstore = null;
      console.log('✅ Firebase (Firestore SDK not loaded)');
    }
    
    console.log('✅ Firebase initialization complete');
  } catch (err) {
    console.error('[Firebase] Fatal error:', err.message);
    window.firebaseAuth = null;
    window.rtdb = null;
    window.fstore = null;
  }
})();

// ── RTDB Helpers ─────────────────────────────────────────
window.DB = {
  /** Read a path once, returns value or null */
  async get(path) {
    const snap = await window.rtdb.ref(path).once('value');
    return snap.val();
  },
  /** Write/overwrite a path */
  async set(path, value) {
    return window.rtdb.ref(path).set(value);
  },
  /** Update specific fields at a path */
  async update(path, value) {
    return window.rtdb.ref(path).update(value);
  },
  /** Push a new child under a path, returns the new key */
  async push(path, value) {
    const ref = await window.rtdb.ref(path).push(value);
    return ref.key;
  },
  /** Listen for realtime changes; returns unsubscribe function */
  listen(path, callback) {
    const ref = window.rtdb.ref(path);
    ref.on('value', snap => callback(snap.val()));
    return () => ref.off('value');
  },
  /** Listen for child_added events (new items); returns unsubscribe */
  listenNew(path, callback) {
    const ref = window.rtdb.ref(path);
    ref.on('child_added', snap => callback(snap.key, snap.val()));
    return () => ref.off('child_added');
  },
  /** Remove a path */
  async remove(path) {
    return window.rtdb.ref(path).remove();
  },
  /** Get current server timestamp value for writes */
  timestamp() {
    return firebase.database.ServerValue.TIMESTAMP;
  }
};

/**
 * Sign in with Firebase Email/Password.
 * Returns the Firebase User object (has getIdToken()).
 */
window.firebaseSignIn = async function(email, password) {
  const result = await window.firebaseAuth.signInWithEmailAndPassword(email, password);
  return result.user;
};

/**
 * Create a new Firebase Auth account (Email/Password).
 * Returns the Firebase User object.
 */
window.firebaseSignUp = async function(email, password) {
  const result = await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
  return result.user;
};

/**
 * Get the current user's Firebase ID token (JWT).
 * Returns null if not signed in.
 */
window.getFirebaseToken = async function() {
  const user = window.firebaseAuth && window.firebaseAuth.currentUser;
  if (!user) return null;
  return user.getIdToken(/* forceRefresh */ false);
};

// Global helper function for API calls (with optional Firebase token)
window.API_CALL = async (endpoint, options = {}) => {
  const url = `${window.AMS_CONFIG.API_URL}${endpoint}`;
  
  if (window.AMS_CONFIG.DEBUG) {
    console.log(`[API] ${options.method || 'GET'} ${url}`);
  }

  // Auto-attach Firebase token if user is signed in
  try {
    const token = await window.getFirebaseToken();
    if (token) {
      options.headers = options.headers || {};
      options.headers['Authorization'] = `Bearer ${token}`;
    }
  } catch(e) {
    if (window.AMS_CONFIG.DEBUG) console.warn('[API] Could not get Firebase token', e);
  }
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok && window.AMS_CONFIG.DEBUG) {
      console.error(`[API Error] ${response.status}:`, data);
    }
    
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    console.error(`[API Connection Error]`, error.message);
    return { success: false, status: 0, error: error.message };
  }
};
