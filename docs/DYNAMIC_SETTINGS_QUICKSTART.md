# Dynamic Settings Quick Reference

## At a Glance

**What Can You Change?**
- 📍 Campus Location (Latitude/Longitude)
- 📏 Geofence Radius
- 🔍 Face Recognition Tolerance
- ⏱️ QR Code Validity Time
- 🕐 Attendance Cutoff Time

**When Does It Apply?**
- ✅ Immediately after saving
- ✅ Affects all active users
- ✅ No server restart needed
- ✅ Multi-tab/device synchronized

---

## Step-by-Step: Update Settings

### 1. Navigate to System Config
```
Login as Admin
→ Dashboard → Sidebar → System Config (⚙️)
```

### 2. Modify Settings

| Setting | Change How | When to Use |
|---------|-----------|------------|
| **Latitude** | Type new number (e.g., 13.1456) | Moving campus location |
| **Longitude** | Type new number (e.g., 77.5746) | Moving campus location |
| **Campus Radius (km)** | Change number (0.1 to 5.0) | Expanding/shrinking geofence |
| **Face Tolerance** | 0.4 (strict) → 0.6 (lenient) | Adjust security level |
| **QR Expiry** | 5 (default) → 30 (max validity) | For longer classes |
| **Attendance End Time** | Change HH:MM (24-hour) | Change class end time |

### 3. Save Settings
```
Click "Save & Apply to All Users"
→ See ✅ green confirmation
→ Settings now active system-wide
```

### 4. Verify Changes
```
Students/Faculty will see new settings
on their next attendance attempt
```

---

## Common Scenarios

### 📍 First-Time Setup
**Action:** Enter correct campus coordinates
```
1. Open Google Maps
2. Find your campus center point
3. Note Latitude and Longitude
4. Enter in System Config
5. Test with mobile GPS
```

### 📏 Expand Geofence (Students Complaining "Not in Campus")
**Before:** `Radius: 0.2 km`
**Action:** Increase radius
```
Change to: 0.3 or 0.5 km
Save & Apply
Students can now mark attendance from further away
```

### 📏 Shrink Geofence (Security - Only On-Campus)
**Before:** `Radius: 0.5 km`
**Action:** Decrease radius
```
Change to: 0.2 or 0.1 km
Save & Apply
Students must be closer to campus center
```

### 🔍 Tighten Face Recognition (High Security)
**Before:** `Tolerance: 0.6 (lenient)`
**Action:** Reduce tolerance
```
Change to: 0.4 or 0.45
Save & Apply
Face matching becomes stricter
```

### 🕐 Extended Classes (Beyond 6 PM)
**Before:** `Attendance End: 18:00` (6 PM)
**Action:** Extend end time
```
Change to: 20:00 (8 PM) or 22:00 (10 PM)
Save & Apply
Students can mark attendance later
```

### 🕐 Early Cutoff (Ensure Punctuality)
**Before:** `Attendance End: 18:00` (6 PM)
**Action:** Move cutoff earlier
```
Change to: 13:30 or 14:00 (for afternoon classes)
Save & Apply
Attendance window closes earlier
```

### ⏱️ Longer QR Validity (3-Hour Exam)
**Before:** `QR Expiry: 5 minutes`
**Action:** Increase validity
```
Change to: 30 or 60 minutes
Save & Apply
QR codes remain valid longer
Faculty doesn't need to regenerate QR as often
```

---

## Timing Examples

### Morning Classes
```
⏰ Attendance Window: 06:00 - 12:30
→ Set attendance_window_end = "12:30"
→ Classes end, attendance closes, no late marks
```

### Afternoon Classes
```
⏰ Attendance Window: 13:00 - 18:00
→ Set attendance_window_end = "18:00"
→ Standard workday attendance period
```

### Evening/Night Classes
```
⏰ Attendance Window: 18:00 - 22:00
→ Set attendance_window_end = "22:00"
→ Professional/working student classes
```

### 24/7 (No Cutoff)
```
⏰ Attendance Window: No restriction
→ Set attendance_window_end = "23:59"
→ Allows any-time attendance (e.g., lab facility)
```

---

## Location Examples

### Small Single Building
```
📍 Radius: 0.05 - 0.1 km (50-100 meters)
✓ Only ground floor accessible
✓ Very strict geofence
✓ Perfect for: Building-wise attendance
```

### Multi-Floor Building
```
📍 Radius: 0.1 - 0.2 km (100-200 meters)
✓ Whole building covered
✓ Moderate geofence
✓ Perfect for: Campus attendance
```

### Large Campus (2-5 buildings)
```
📍 Radius: 0.3 - 0.5 km (300-500 meters)
✓ Multiple buildings covered
✓ Generous geofence
✓ Perfect for: Multi-building campus
```

### University/Spread-Out Campus
```
📍 Radius: 1.0 - 2.0 km (1000-2000 meters)  
✓ Large area covered
✓ Very generous geofence
✓ Perfect for: Large university/distributed campus
```

---

## Face Tolerance Quick Settings

| Level | Value | Use Case |
|-------|-------|----------|
| 🔒 **Strict Security** | 0.40 | Exams, restricted access, high security |
| ⚖️ **Balanced** | 0.50 | General daily attendance (RECOMMENDED) |
| ⚡ **Fast Processing** | 0.60 | High-volume traffic, less strict |

---

## ⚠️ Do's and Don'ts

### ✅ DO
- ✓ Test settings with actual users after changing
- ✓ Document why you changed settings
- ✓ Change settings gradually (0.1 increments for radius)
- ✓ Communicate major changes to students
- ✓ Monitor attendance patterns after changes
- ✓ Take screenshot before major changes

### ❌ DON'T
- ✗ Make extreme changes (0.1 → 2.0 km all at once)
- ✗ Forget to validate coordinates on map
- ✗ Set attendance end time before actual classes end
- ✗ Change face tolerance during exam without notice
- ✗ Leave conflicting settings (end time before start time)

---

## Real-Time Impact

When you save changes:

```
T0:     Admin clicks "Save Settings"
T0+1s:  Settings saved to database
T0+2s:  QR modules reload with new geofence
T0+3s:  Settings broadcast to all tabs/devices
T0+5s:  First student sees new geofence applied
T0+∞:   All students using new settings
```

---

## Verification Checklist

After making changes:

- [ ] ✅ Saw green "Configuration saved" message
- [ ] 📱 Tested on mobile device (GPS required for location)
- [ ] 👨‍🎓 Had a student test the new settings
- [ ] 📊 Checked attendance dashboard for issues
- [ ] 📝 Documented the change and reason
- [ ] 📢 Notified users if major change

---

## Troubleshooting One-Liners

| Problem | Quick Fix |
|---------|-----------|
| "Invalid coordinates" | Check lat/lng are numbers, not text |
| "Radius must be > 0" | Ensure radius > 0.01 km |
| "Time required" | Set attendance end time (HH:MM format) |
| Settings not saving | Check internet connection |
| Settings not applying | Refresh browser (Force: Ctrl+Shift+R) |

---

## Support & Help

**Questions about:**
- Location settings? → Check DYNAMIC_SETTINGS_GUIDE.md
- Technical details? → Check DYNAMIC_SETTINGS_ARCHITECTURE.md
- Specific scenario? → Check docs/API_REFERENCE.md

---

**Last Updated:** April 4, 2026 | **System:** SmartAMS v2.0+
