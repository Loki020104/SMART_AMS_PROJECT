# Dynamic Settings & System Configuration Guide

## Overview

The SmartAMS system now features **fully dynamic configuration** that allows administrators to update system-wide settings in real-time without requiring app restarts or code changes. All attendance modules and location-based features respond immediately to configuration updates.

---

## ⚙️ System Configuration Page

### Accessing Settings

1. **Login as Admin** (with administrator role)
2. Navigate to **Admin Panel** → **System Config** (⚙️ icon in sidebar)
3. The configuration form displays current settings with real-time preview

### Available Settings

#### 1. **📍 Geofence Settings (Location-Based Attendance)**

Controls the physical campus boundaries for attendance marking.

| Setting | Type | Range | Default | Impact |
|---------|------|-------|---------|--------|
| **College Latitude** | Number | -90 to 90 | 13.145615 | Campus center North-South position |
| **College Longitude** | Number | -180 to 180 | 77.574597 | Campus center East-West position |
| **Campus Radius (km)** | Number | 0.01 - 500 | 0.2 | Geofence radius in kilometers (~200 meters default) |

**How It Works:**
- Students/Faculty must be within the geofence radius to mark attendance
- System calculates distance using Haversine formula (accurate for Earth curvature)
- Real-time distance display shows "You are X.XX km away from campus center"
- Applies to: Face Recognition, QR Attendance, Manual attendance marking

**Example Configurations:**
- Small campus (building): 0.05 km (50 meters)
- Medium campus (compound): 0.2 km (200 meters)  
- Large campus (multiple buildings): 1.0 km (1000 meters)

---

#### 2. **🔍 Face Recognition Tolerance**

Controls how strict or lenient face matching is.

| Setting | Value | Behavior |
|---------|-------|----------|
| **Strict** | 0.4 | Difficult to match, only very similar faces pass |
| **Balanced** | 0.5 | Moderate matching (recommended) |
| **Lenient** | 0.6 | Easy to match, similar faces pass |

**How It Works:**
- Compares captured face against enrolled face encodings
- Higher tolerance = easier to pass (but may increase false positives)
- Lower tolerance = harder to match (but more secure)
- Applies to: Face authentication, face attendance verification, face-based access

**Recommended Values:**
- Campus with multiple students: 0.5 (balanced)
- Security-critical areas: 0.4 (strict)
- High traffic areas: 0.6 (lenient for speed)

---

#### 3. **⏱️ QR Code Expiry**

Controls how long generated QR codes remain valid.

| Setting | Description |
|---------|-------------|
| **Value (minutes)** | How many minutes before a QR code expires |
| **Default** | 5 minutes |

**How It Works:**
- Faculty generate QR codes for attendance marking
- QR codes become invalid after specified minutes
- Prevents reuse of old QR codes in later sessions
- Applies to: QR attendance marking, session-based attendance

**Recommended Values:**
- Quick sessions (lab): 5-10 minutes
- Standard class (1 hour): 5-10 minutes
- Exam (3+ hours): 15-30 minutes

---

#### 4. **🕐 Attendance Window End Time**

Controls the cutoff time after which attendance cannot be marked.

| Setting | Description |
|---------|-------------|
| **Format** | HH:MM (24-hour format) |
| **Default** | 18:00 (6:00 PM) |

**How It Works:**
- After this time, attendance marking is automatically closed
- Students attempting to mark attendance past this time are marked ABSENT
- Applies to: Face Recognition, QR attendance, Manual attendance entry
- System shows: "Attendance window closed after HH:MM"

**Recommended Values:**
- Morning shift: 12:30
- Afternoon shift: 18:00
- All-day facility: 23:59 (no cutoff)

---

## 🔄 Real-Time Application

### When Settings Are Saved

1. **Validation** - Settings are validated on the admin's device
2. **Backend Update** - Settings saved to Supabase `system_config` table
3. **Local Update** - Admin's browser cache updated immediately
4. **Module Notification** - Dependent modules notified of changes
5. **User Experience** - Currently active students see updated settings:
   - Geofence radius changes → Location check updated
   - Time window changes → Immediate cutoff applied
   - Tolerance changes → Next face match uses new tolerance

### Multi-Tab & Multi-Session Sync

Settings automatically sync across:
- **Multiple browser tabs** - Using `localStorage` events
- **Multiple user sessions** - Via backend polling
- **Multiple devices** - Through API calls

When any admin updates settings:
```
Device A (Admin Saves) → Backend Updated → All Devices Reload Config
```

---

## 📍 Location-Based Attendance Workflow

### For Students

1. **Opens Face/QR Attendance**
2. **System checks**: Is attendance window still open?
   - If NO → "Attendance Window Closed" error
   - If YES → Continue
3. **System gets location** - Requests phone GPS/geolocation
4. **System validates**: Is student within geofence?
   - If NO → Shows distance away, blocks attendance
   - If YES → Proceeds to face/QR verification

### For Faculty (Generating QR Codes)

1. Opens QR Code Generator
2. Creates attendance session
3. QR code generated with current timestamp
4. QR remains valid for `qr_expiry_minutes`
5. Students must scan within validity period

---

## 📊 Configuration Examples

### Example 1: Small College Campus

```
Latitude: 40.8067
Longitude: -73.9586
Radius: 0.1 km (100 meters)
QR Expiry: 5 minutes
Attendance End: 17:30
Face Tolerance: 0.5
```

**Scenario**: Single building, 4pm classes, strict attendance

### Example 2: Large University Campus

```
Latitude: 37.4275
Longitude: -122.1697
Radius: 2.0 km (2000 meters)
QR Expiry: 30 minutes
Attendance End: 22:00
Face Tolerance: 0.6
```

**Scenario**: Multi-building campus, evening classes, high volume attendance

### Example 3: Distributed Learning Centers

```
Latitude: 28.6139
Longitude: 77.2090
Radius: 0.5 km (500 meters)
QR Expiry: 10 minutes
Attendance End: 20:00
Face Tolerance: 0.45
```

**Scenario**: Multiple centers, varied timings, high security requirement

---

## ⚠️ Important Notes

### Location Accuracy

- **GPS Accuracy**: ±5-10 meters (depending on device/weather)
- **Network-based location**: ±30-100 meters (via WiFi/cellular)
- **Airplane mode**: Uses last known location (may be outdated)

### Recommendations for Radius Setting

| Campus Type | Recommended Radius |
|-------------|-------------------|
| Single Building | 0.05 - 0.1 km |
| Two-Building Campus | 0.15 - 0.3 km |
| Multi-Building Campus | 0.5 - 1.0 km |
| Spread Out Campus | 1.5 - 3.0 km |

### Security Considerations

- **Lower tolerance** (0.4) = More secure but stricter
- **Smaller radius** = More geofence restrictions
- **Shorter QR expiry** = Harder to reuse codes
- **Earlier end time** = Tighter attendance control

---

## 🔧 Troubleshooting

### "Not in Campus" Error During Attendance

**Causes:**
- Student is outside geofence radius
- GPS not enabled on device
- Device has poor GPS signal (indoors)

**Solutions:**
1. Check GPS settings on student's phone
2. Ask student to move to open area (outdoor)
3. If persistent, admin can increase radius temporarily
4. Check if geofence coordinates are correct

### "Attendance Window Closed" Error

**Causes:**
- Current time is after `attendance_window_end`
- System clock is incorrect
- Admin changed end time while students were marking

**Solutions:**
1. Check system clock on student device
2. Check server time accuracy
3. Contact admin to extend window if needed

### Face Recognition Not Matching

**Causes:**
- Face encoding doesn't match (different person)
- Tolerance too strict (0.4) for current lighting
- Face changed significantly (makeup, glasses, beard)

**Solutions:**
1. Ask student to re-register face in better lighting
2. Admin can temporarily increase tolerance to 0.55
3. Student can try Face Recognition again
4. Fall back to QR attendance method

---

## 📈 Monitoring & Analytics

### Check Applied Settings

```javascript
// In browser console
console.log('Current Geofence:', AMS.college);
console.log('System Config:', AMS.systemConfig);
```

### Monitor Changes

Settings change logs are stored in:
- `system_config` table in Supabase (key-value store)
- Browser `localStorage` events (AMS_CONFIG_CHANGED)

---

## 🔐 Access Control

### Who Can Modify Settings?

- **Admin users only** - Role: `admin`
- Protected by backend validation
- Changes logged in audit system

### What Happens When Admin Saves?

1. Validation check (coordinates, radius > 0)
2. Backend API validates again
3. Supabase records change
4. Broadcasting to all active users
5. Audit log entry created

---

## 📱 API Integration

### For Backend Developers

**GET** `/api/system-config`
- Returns current system configuration
- Used by frontend on startup
- Caches for 5 minutes

**POST** `/api/system-config`
- Updates configuration (admin only)
- Payload: `{college_lat, college_lng, college_radius_km, tolerance, qr_expiry_minutes, attendance_window_end}`
- Response: `{success: true/false}`

---

## ✅ Best Practices

1. **Test location settings** - Visit campus and verify geofence works
2. **Adjust tolerance gradually** - Don't change by more than 0.1 at a time
3. **Set realistic end times** - Account for late classes/makeup sessions
4. **Monitor attendance patterns** - Use dashboard to check if settings are effective
5. **Communicate changes** - Notify students of geofence/time window changes
6. **Document reasons** - Note why settings were changed for future reference
7. **Regular audits** - Review settings quarterly
8. **Backup configuration** - Take screenshots before major changes

---

## 🎯 Summary

The dynamic settings system provides:

✅ **Real-time updates** - No server restart needed
✅ **Location accuracy** - Precise geofencing for attendance
✅ **Flexible timing** - Adjustable attendance windows
✅ **Multi-factor control** - Combine location, time, and face recognition
✅ **Easy administration** - Simple UI for changes
✅ **Immediate effect** - All users see changes instantly

By effectively using these settings, administrators can:
- Prevent unauthorized attendance marking
- Ensure only on-campus students are marked present
- Control attendance time windows
- Adjust security levels based on needs
- Monitor and respond to attendance patterns

---

For technical support or questions, contact the system administrator.
