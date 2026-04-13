# Dynamic Settings Architecture & Flow

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     SmartAMS Dynamic Settings                │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           ADMIN SYSTEM CONFIG PAGE                  │   │
│  │  • Set Geofence (lat, lng, radius)                  │   │
│  │  • Set Face Tolerance                               │   │
│  │  • Set QR Expiry Time                               │   │
│  │  • Set Attendance Window End                         │   │
│  └──────────────────────┬────────────────────────────┘   │
│                         │                                  │
│                         ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │       SAVE SETTINGS (saveSystemConfig)             │   │
│  │  • Validate inputs (lat/lng/radius/times)          │   │
│  │  • Send to backend API POST /api/system-config    │   │
│  │  • Update local AMS.college & AMS.systemConfig    │   │
│  │  • Broadcast changes via broadcastSettingsChange() │   │
│  └──────────────────────┬────────────────────────────┘   │
│                         │                                  │
│              ┌──────────┼──────────┐                       │
│              │                     │                       │
│              ▼                     ▼                       │
│  ┌──────────────────┐  ┌──────────────────────────┐       │
│  │ Reload QR Modules│  │ localStorage Event       │       │
│  │ • QR Scanner    │  │ (Multi-tab sync)        │       │
│  │ • QR Generator  │  │ AMS_CONFIG_CHANGED      │       │
│  │ • QR Dashboard  │  │                          │       │
│  └──────────────────┘  └──────────────────────────┘       │
│              │                     │                       │
│              └──────────────────┬──────────────────┘       │
│                                 │                          │
│                    ┌────────────▼────────────┐             │
│                    │  ALL MODULES UPDATED   │             │
│                    │  • Face Recognition    │             │
│                    │  • QR Attendance       │             │
│                    │  • Manual Marking      │             │
│                    └────────────────────────┘             │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## Student Attendance Flow (With Dynamic Settings)

```
┌──────────────────────────────────────────────────────┐
│        STUDENT STARTS ATTENDANCE MARKING             │
└────────────┬─────────────────────────────────────────┘
             │
             ▼
    ┌─────────────────────┐
    │ Check Time Window   │
    │ isWithinAttendance  │
    │    Window()         │
    └────────┬────────────┘
             │
       ┌─────┴──────┐
       │            │
      YES           NO
       │            │
       ▼            ▼
   ┌────┐   ┌──────────────────┐
   │Get │   │ Show Error Dialog │
   │Loc │   │ "Window Closed    │
   │GPS │   │  after HH:MM"     │
   └────┘   │ Mark ABSENT       │
       │    └──────────────────┘
       ▼
    ┌────────────────────────┐
    │ Check Geofence         │
    │ isInCollege()          │
    │ using dynamic:         │
    │ AMS.college.lat        │
    │ AMS.college.lng        │
    │ AMS.college.radiusKm   │
    └────────┬───────────────┘
             │
       ┌─────┴──────┐
       │            │
      YES           NO
       │            │
       ▼            ▼
   ┌──────┐  ┌──────────────────┐
   │Show  │  │ Show Error Dialog │
   │Camera│  │ "Not in Campus    │
   │Face  │  │ Distance: X km"   │
   │UI    │  │ Mark ABSENT       │
   └──┬───┘  └──────────────────┘
      │
      ▼
   ┌──────────────────────┐
   │ Capture Face Image   │
   │ Verify with Backend  │
   │ using dynamic        │
   │ AMS.systemConfig     │
   │ .tolerance           │
   └──────┬───────────────┘
          │
      ┌───┴──┐
      │      │
    MATCH  NO MATCH
      │      │
      ▼      ▼
    PRESENT  ABSENT
```

---

## Data Flow: Settings Update to Application

### Front-End (Browser)

```
AMS Object (JavaScript)
├── AMS.college
│   ├── lat: 13.145615       ← Geofence center latitude
│   ├── lng: 77.574597       ← Geofence center longitude
│   └── radiusKm: 0.2        ← Radius in kilometers
│
└── AMS.systemConfig
    ├── tolerance: "0.5"     ← Face matching tolerance
    ├── qr_expiry_minutes: 5 ← QR code validity
    └── attendance_window_end: "18:00"
```

### Back-End (Supabase)

```
system_config Table
┌─────────────────────────────────┐
│ id  │ key                    │ value │
├─────┼────────────────────────┼───────┤
│ 1   │ college_lat            │ 13.145615 │
│ 2   │ college_lng            │ 77.574597 │
│ 3   │ college_radius_km      │ 0.2   │
│ 4   │ tolerance              │ 0.5   │
│ 5   │ qr_expiry_minutes      │ 5     │
│ 6   │ attendance_window_end  │ 18:00 │
└─────┴────────────────────────┴───────┘
```

---

## Key Function Interactions

### 1. Main Settings Update Flow

```javascript
// Admin clicks "Save Settings"
saveSystemConfig()
  ├─ Validate inputs
  ├─ POST /api/system-config (backend saves)
  ├─ Update AMS.college & AMS.systemConfig
  ├─ broadcastSettingsChange({location:true, ...})
  │   ├─ Set AMS.configLastUpdated
  │   ├─ localStorage.setItem('AMS_CONFIG_CHANGED')
  │   └─ Reload affected modules
  └─ toast('✅ Configuration saved!')
```

### 2. Multi-Tab Sync

```javascript
// Listening on localStorage changes
window.addEventListener('storage', (e) => {
  if(e.key === 'AMS_CONFIG_CHANGED') {
    loadSystemConfig()  // Fetch from backend
    toast('⚙️ Settings updated from another session')
  }
})
```

### 3. Attendance Checking Functions

```javascript
// Before marking attendance
isWithinAttendanceWindow()
  └─ Compares current time with
     AMS.systemConfig.attendance_window_end

// Before face/QR processing
isInCollege(lat, lng)
  └─ haversineKm(lat, lng, 
       AMS.college.lat,
       AMS.college.lng) <= AMS.college.radiusKm

// Get formatted settings
getGeofenceSettings()
  └─ Returns {lat, lng, radiusKm, tolerance, qr_expiry_minutes}
```

### 4. Face Recognition Using Dynamic Tolerance

```javascript
// Backend face verification
verifyFace(imageData)
  └─ Sent to backend with:
     {
       tolerance: AMS.systemConfig.tolerance,
       face_image: imageData,
       // ... other data
     }
```

---

## Dynamic Settings in Each Module

### Face Attendance Module

```
startFaceAtt()
  ├─ Check: isWithinAttendanceWindow()
  │          ↓ Uses: AMS.systemConfig.attendance_window_end
  │
  ├─ Check: isInCollege(loc.lat, loc.lng)
  │          ↓ Uses: AMS.college.{lat,lng,radiusKm}
  │
  └─ Show: Distance from campus
           ↓ Calculated from dynamic geofence center
```

### QR Attendance Module

```
processQRAttendance(qrData)
  ├─ Check: isWithinAttendanceWindow()
  │          ↓ Uses: AMS.systemConfig.attendance_window_end
  │
  ├─ Get location (GPS)
  │
  ├─ Check: isInCollege(lat, lng)
  │          ↓ Uses: AMS.college.{lat,lng,radiusKm}
  │
  └─ Validate QR expiry
             ↓ Uses: AMS.systemConfig.qr_expiry_minutes
```

### Backend Face Recognition

```
verifyFace API
  ├─ Fetch from DB: tolerance
  │
  ├─ Compare face encodings
  │  with tolerance threshold
  │
  └─ Return: {verified, confidence, ...}
```

---

## Settings Change Propagation Timeline

```
T0: Admin modifies settings in UI
    └─ College Lat/Lng/Radius changed

T0+100ms: saveSystemConfig() called
    └─ Validation passes

T0+200ms: POST /api/system-config sent
    └─ Backend receives and saves

T0+300ms: Response received
    └─ AMS.college updated locally
    └─ AMS.configLastUpdated set
    └─ broadcastSettingsChange() called

T0+400ms: QR modules reload
    └─ New geofence loaded
    └─ Students see new radius

T0+500ms: localStorage event emitted
    └─ Other tabs notified

T1: Student attempts face attendance
    └─ isInCollege() uses NEW geofence radius
```

---

## Validation & Error Handling

### On Admin Side (Frontend Validation)

```javascript
if(isNaN(latVal) || isNaN(lngVal) || isNaN(radVal))
  → ❌ "Invalid location coordinates"

if(radVal <= 0)
  → ❌ "Campus radius must be > 0"

if(!endTimeVal)
  → ❌ "Please set attendance window end time"
```

### On Backend Side (API Validation)

```
POST /api/system-config
├─ Check: Admin authentication ✓
├─ Check: Required fields present ✓
├─ Check: Data type validation ✓
└─ Upsert into system_config table
```

### On Student Side (Runtime Check)

```
Face Attendance Start:
├─ If NOT within window → ABORT (show error)
├─ If NOT in geofence → ABORT (show distance)
└─ If both OK → Proceed to face capture
```

---

## Broadcasting Mechanism

### Method 1: Direct Module Reload

```javascript
if(changes.location){
  const currentModule = document.querySelector('[data-current-module]')
              .getAttribute('data-current-module');
  if(['s-qr-scanner','f-qr-generator','a-qr-dashboard']
     .includes(currentModule)){
    setTimeout(() => renderModule(currentModule), 500);
  }
}
```

### Method 2: localStorage Broadcasting

```javascript
// Admin tab writes
localStorage.setItem('AMS_CONFIG_CHANGED',
  JSON.stringify({timestamp, changes}))

// Other tabs listen
window.addEventListener('storage', (e) => {
  if(e.key === 'AMS_CONFIG_CHANGED'){
    loadSystemConfig();  // Sync from backend
  }
})
```

---

## Performance Optimization

### Caching Strategy

```
Client Side:
  ├─ AMS.college → Loaded once on init
  ├─ AMS.systemConfig → Loaded once on init
  └─ AMS.configLastUpdated → Track updates

Server Side:
  └─ system_config table → Written on admin save
                        → Read on /api/system-config
```

### Update Frequency

- **Initial Load**: Once per session (page load)
- **Admin Changes**: Immediate broadcast
- **Periodic Sync**: Via localStorage events
- **Cross-Tab**: Real-time via storage listener

---

## Testing the System

### Test 1: Geofence Change

```
1. Admin goes to System Config
2. Change radius from 0.2 to 0.5 km
3. Click "Save & Apply to All Users"
4. Student opens Face Attendance
5. Expected: New radius applies (shows 500m geofence)
```

### Test 2: Time Window Change

```
1. Admin changes end time from 18:00 to 17:00
2. Current time is 17:30
3. Student tries Face Attendance
4. Expected: "Attendance Window Closed" error
```

### Test 3: Multi-Tab Sync

```
1. Open admin page in Tab A (logged in as admin)
2. Open student page in Tab B (logged in as student)
3. In Tab A, change settings and save
4. In Tab B, check console: AMS.college should update
5. Expected: Settings synced automatically
```

### Test 4: Tolerance Change

```
1. Admin changes tolerance from 0.5 to 0.6
2. Student enrolls face in Face Registration
3. Student uses Face Attendance
4. Expected: More lenient face matching with 0.6 tolerance
```

---

## Troubleshooting Guide

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| Settings not saving | Backend error | Check API logs |
| Settings not applying | Module caching | Hard refresh browser |
| Students outside geofence | Wrong coordinates | Update lat/lng |
| Face not matching | Tolerance too strict | Increase tolerance |
| Permission denied error | Not admin role | Verify admin status |

---

## Summary

Dynamic settings provide a **real-time configuration system** that:

1. **Centralizes** all attendance rules
2. **Propagates** changes instantly to all users
3. **Validates** inputs on client and server
4. **Syncs** across multiple sessions and devices
5. **Responds** to changes in student workflows immediately

This ensures consistent attendance enforcement across the entire institution without any downtime or code changes.
