// SmartAMS API Configuration
// This file configures the backend API endpoint
// 🔐 SECURITY NOTE: Backend secrets (Supabase, JWT, etc) are NOT exposed here
// All sensitive operations must go through the authenticated backend API

window.AMS_CONFIG = {
  // Always use deployed backend
  API_URL: 'https://smartams-backend-76160313029.us-central1.run.app',
  
  // Enable debug logging (disabled in production)
  DEBUG: false,

  // 🔒 IMPORTANT: Do not expose backend secrets here
  // Supabase key is kept on backend only and accessed via authenticated API calls
  // All database operations must go through the backend REST API
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
      // Enable Firebase RTDB for real-time features
      window.rtdb = firebase.database();
      console.log('✅ Firebase RTDB initialized');
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
    if (!window.rtdb) {
      console.warn('[DB] RTDB not available for get:', path);
      return null;
    }
    try {
      const snap = await window.rtdb.ref(path).once('value');
      return snap.val();
    } catch (err) {
      console.error('[DB] Error getting', path, err);
      return null;
    }
  },
  /** Write/overwrite a path */
  async set(path, value) {
    if (!window.rtdb) {
      console.warn('[DB] RTDB not available for set:', path);
      return null;
    }
    try {
      return window.rtdb.ref(path).set(value);
    } catch (err) {
      console.error('[DB] Error setting', path, err);
      return null;
    }
  },
  /** Update specific fields at a path */
  async update(path, value) {
    if (!window.rtdb) {
      console.warn('[DB] RTDB not available for update:', path);
      return null;
    }
    try {
      return window.rtdb.ref(path).update(value);
    } catch (err) {
      console.error('[DB] Error updating', path, err);
      return null;
    }
  },
  /** Push a new child under a path, returns the new key */
  async push(path, value) {
    if (!window.rtdb) {
      console.warn('[DB] RTDB not available for push:', path);
      return null;
    }
    try {
      const ref = await window.rtdb.ref(path).push(value);
      return ref.key;
    } catch (err) {
      console.error('[DB] Error pushing', path, err);
      return null;
    }
  },
  /** Listen for realtime changes; returns unsubscribe function */
  listen(path, callback) {
    if (!window.rtdb) {
      console.warn('[DB] RTDB not available for listen:', path);
      return () => {};
    }
    try {
      const ref = window.rtdb.ref(path);
      ref.on('value', snap => {
        try {
          callback(snap.val());
        } catch (err) {
          console.error('[DB] Error in listener callback for', path, err);
        }
      }, (err) => {
        // Handle RTDB errors (permission denied, connection issues, etc)
        if (err.code === 'PERMISSION_DENIED') {
          console.warn('[DB] RTDB Permission Denied for path:', path, '- using backend API instead');
        } else {
          console.error('[DB] RTDB Error on path', path, err);
        }
      });
      return () => ref.off('value');
    } catch (err) {
      console.error('[DB] Error listening to', path, err);
      return () => {};
    }
  },
  /** Listen for child_added events (new items); returns unsubscribe */
  listenNew(path, callback) {
    if (!window.rtdb) {
      console.warn('[DB] RTDB not available for listenNew:', path);
      return () => {};
    }
    try {
      const ref = window.rtdb.ref(path);
      ref.on('child_added', snap => {
        try {
          callback(snap.key, snap.val());
        } catch (err) {
          console.error('[DB] Error in listener callback for', path, err);
        }
      });
      return () => ref.off('child_added');
    } catch (err) {
      console.error('[DB] Error listening to', path, err);
      return () => {};
    }
  },
  /** Remove a path */
  async remove(path) {
    if (!window.rtdb) {
      console.warn('[DB] RTDB not available for remove:', path);
      return null;
    }
    try {
      return window.rtdb.ref(path).remove();
    } catch (err) {
      console.error('[DB] Error removing', path, err);
      return null;
    }
  },
  /** Get current server timestamp value for writes */
  timestamp() {
    if (!window.rtdb) {
      return new Date().getTime();
    }
    try {
      return firebase.database.ServerValue.TIMESTAMP;
    } catch (err) {
      return new Date().getTime();
    }
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
