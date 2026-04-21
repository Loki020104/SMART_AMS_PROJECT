# Analytics Dashboard - Quick Reference

## 🎯 How to Access

1. **Admin Login**: Navigate to admin panel
2. **Left Sidebar**: Scroll to "Analytics & Insights" section
3. **Click Any Option**:
   - 📊 Analytics Overview
   - 🏛️ Department Analytics
   - ⚠️ At-Risk Students
   - 📥 Export Analytics

## 📊 Dashboard Tabs

### 1️⃣ Overview Tab (Default)

**What You'll See**:
- 👥 **Present**: Number of students present today
- ❌ **Absent**: Number of students absent today
- 📊 **Attendance %**: Overall attendance percentage
- ⚠️ **Total Sessions**: Sessions conducted today

**Below the Metrics**:
- 💡 **Key Insights**: Actionable recommendations
- 🎯 **Recommendations**: Specific action items
- 📥 **Export Button**: Download analytics as JSON file

**How to Use**:
- View at-a-glance attendance metrics
- Check today's performance
- Review system recommendations
- Export data for reporting

---

### 2️⃣ Department Analytics Tab

**What You'll See**:
- 8 Department Buttons (CSE, AIM, EC, ME, CE, IOT, AI, DS)

**Click a Department to View**:
- 👥 **Total Students**: Enrollment count
- 📊 **Avg Attendance**: Department average %
- ⚠️ **At-Risk**: Students with < 75% attendance

**Department Table Shows**:
| Column | Data |
|--------|------|
| Student Name | Full name from database |
| Roll No | Student identifier |
| Attendance % | Progress bar with percentage |
| Status | Color badge (Good/At-Risk/Critical) |

**How to Use**:
- Click department button to load data
- Review top performers
- Identify students needing intervention
- Check department-wide trends

---

### 3️⃣ At-Risk Students Tab

**What You'll See**:
- "Load At-Risk Report" button (red)
- Total count of at-risk students

**Click Button to View Table**:
| Column | Data |
|--------|------|
| Student Name | Full name |
| Roll No | Identifier |
| Department | Department code |
| Attendance % | Red progress bar |
| Action | "Intervention Needed" badge |

**At-Risk Definition**: 
- Students with attendance < 60%
- Flagged for parent contact/counseling
- Ranked by severity (lowest % first)

**How to Use**:
- Generate intervention list
- Contact parents of at-risk students
- Track follow-up actions
- Monitor improvement over time

---

### 4️⃣ System Info Tab

**What You'll See**:

**System Overview Table**:
- System Name: SMART AMS - Analytics Module
- Type: Linways-like Academic Analytics
- Version: 2.0 (Enhanced Bulk Import with Analytics)
- Database: Supabase PostgreSQL + Firebase
- Deployment: Google Cloud Run + Firebase Hosting

**Key Technologies** (2-column list):
- Python Flask Backend
- JavaScript Frontend
- Chart.js for Visualizations
- Firebase Authentication
- Supabase Database
- Cloud Run Deployment
- Real-time Analytics
- RESTful APIs

**Analytics Features**:
- ✅ Attendance Tracking
- ✅ Department Analytics
- ✅ At-Risk Identification
- ✅ Performance Insights
- ✅ Bulk Export
- ✅ Dashboard Views

**MVP Metrics (Status Table)**:
| Feature | SMART AMS | Status |
|---------|-----------|--------|
| Attendance Percentage | Real-time calculation | ✓ Live |
| Department Reports | Aggregate analytics | ✓ Live |
| At-Risk Detection | < 60% threshold | ✓ Live |
| Data Export | JSON format | ✓ Live |
| Dashboard Views | 4 main views | ✓ Live |

**How to Use**:
- Verify system status and version
- Check deployment environment
- Review available features
- Understand technology stack

---

## 📥 Export Analytics

**Button Location**: Bottom of Overview tab (blue button)

**What Gets Exported**:
```json
{
  "export_timestamp": "2024-01-15T10:30:00.000Z",
  "overview": { data from Overview tab },
  "at_risk_report": { data from At-Risk tab },
  "institution": "SMART_AMS"
}
```

**File Details**:
- Format: JSON
- Filename: `analytics-export-YYYY-MM-DD.json`
- Size: Typically 50-200 KB
- Auto-downloads to Downloads folder

**Use For**:
- Excel/Google Sheets analysis
- Board presentations
- Email reporting
- Compliance documentation
- Historical tracking

---

## 🎨 Color Coding System

### Status Badges

| Color | Meaning | Threshold |
|-------|---------|-----------|
| 🟩 Green (status-good) | Good attendance | ≥ 75% |
| 🟨 Yellow (status-warning) | At-risk | 60-74% |
| 🟥 Red (status-critical) | Critical | < 60% |

### Metric Card Colors

| Card Type | Color | Data Type |
|-----------|-------|-----------|
| Success | Green | Present/Good metrics |
| Warning | Orange/Yellow | Warnings/pending |
| Danger | Red | Absences/at-risk |
| Info | Purple/Blue | General info |

---

## 📊 Understanding the Charts

### Attendance Progress Bar

```
Good (90%)        [████████████████░] 90%  (green)
At-Risk (65%)     [█████████░░░░░░░░] 65%  (yellow)
Critical (45%)    [██████░░░░░░░░░░░] 45%  (red)
```

### Metric Cards

Each card shows:
```
┌─────────────────────┐
│ 👥 Present          │ ← Icon + Label
│ 142                 │ ← Metric Value (large)
│ Students present    │ ← Description
│ today               │
└─────────────────────┘
```

---

## ⚙️ Configuration Options

### Time Period
- Currently: Last 30 days
- Can be modified in backend settings
- Alternative: Customize in code

### At-Risk Threshold
- Current: < 60% attendance
- Configurable in analytics_linways.py
- Recommended thresholds: 60% or 75%

### Departments
- Current: 8 departments (CSE, AIM, EC, ME, CE, IOT, AI, DS)
- Add more in Department Analytics tab buttons
- Map to database department codes

---

## 🔄 Data Refresh

**Auto-Refresh**: 
- None (manual refresh required)

**To Refresh Data**:
1. Click same dashboard option again
2. Or click different tab then back
3. Or press F5 to reload entire page

**Real-Time Updates**:
- Dashboard fetches latest data from server
- No caching of results
- Always displays current database state

---

## ⚡ Performance Tips

### For Large Institutions (5000+ students):
1. Use Department Analytics instead of Overview
2. Export data during off-hours
3. Filter by semester/year if possible
4. Avoid loading entire institution at once

### For Slow Networks:
1. Wait for "Loading..." message to complete
2. Check browser console for errors
3. Verify network connection is stable
4. Retry if data doesn't load

### For Export Large Files:
1. Use Chrome or Firefox for best compatibility
2. Ensure popup blocker is disabled
3. Check Downloads folder if file not visible
4. Try exporting from Overview tab only

---

## 🐛 Troubleshooting

### Problem: Dashboard shows "Unable to load analytics data"

**Solution**:
1. Check internet connection
2. Verify you're logged in with admin credentials
3. Refresh page (F5)
4. Check browser console for errors (F12)
5. Try in private/incognito window

### Problem: Endpoint returns 404 error

**Solution**:
1. Verify backend is running (Cloud Run deployed)
2. Check backend logs for registration success
3. Verify API URL is correct
4. Wait 2-3 minutes if backend just deployed

### Problem: Data looks incorrect or old

**Solution**:
1. Ensure attendance records are in database
2. Check if data was imported correctly
3. Verify database connection in backend
4. Run analytics health check query

### Problem: Export button doesn't work

**Solution**:
1. Check if popup blocker is enabled
2. Try different browser
3. Verify sufficient disk space
4. Check if fetch endpoint returns data (F12 Network tab)

---

## 📱 Mobile Responsiveness

**Supported Devices**:
- ✅ Desktop/Laptop (optimal)
- ✅ Tablet (landscape mode)
- ⚠️ Mobile (limited - tables may scroll)

**Tips for Mobile**:
- Landscape orientation works better
- Use Department Analytics for smaller datasets
- Export and view in separate app if needed
- Consider using desktop for detailed analysis

---

## 🔐 Permission Level

**Required Role**: Administrator

**Access Control**:
- Only admins can view analytics
- Faculty cannot access (by default)
- Students cannot access (by design)
- Modify in backend.py if needed

---

## 📞 Getting Help

**Common Questions**:

**Q: Why is my department not showing?**
A: Add department code to button list in analytics_module.js lines 123-127

**Q: Can I customize thresholds?**
A: Yes, edit analytics_linways.py line 82 (change 60 threshold)

**Q: How often is data updated?**
A: Real-time - fetched fresh on each page load

**Q: Can I add more departments?**
A: Yes, modify both analytics_module.js and database

**Q: How long does export take?**
A: Usually < 5 seconds (depends on file size)

---

## 📅 Recommended Usage Schedule

| Time | Action |
|------|--------|
| **Morning** | Check Overview dashboard |
| **Mid-day** | Review at-risk students |
| **End of day** | Check department analytics |
| **Weekly** | Generate full export |
| **Monthly** | Review trends and insights |
| **Semester end** | Final analytics report |

---

## ✅ Verification Checklist

Before using analytics in production:

- ✅ Backend deployed to Cloud Run
- ✅ Frontend deployed to Firebase Hosting
- ✅ Attendance records exist in database
- ✅ All 5 endpoints responding correctly
- ✅ Dashboard loads without errors
- ✅ Sample export file downloads
- ✅ Department selection works
- ✅ At-risk report generates data
- ✅ Status badges display correctly
- ✅ No console security warnings

---

## 🎓 Training Tips

**For First-Time Users**:

1. **Start with Overview Tab**
   - See today's attendance snapshot
   - Understand Overall metrics
   
2. **Explore Department Tab**
   - Try each department
   - Notice attendance variations
   
3. **Check At-Risk Students**
   - Understand intervention needed
   - Note total count
   
4. **Review System Info**
   - Verify version
   - Check feature status
   
5. **Generate Export**
   - Download sample file
   - Open in Excel
   - Explore exported data

**Advanced Usage**:
- Combine analytics with bulk import
- Use exports for trend analysis
- Track student progress weekly
- Generate management reports

---

**Version**: 1.0 | **Last Updated**: 2024
