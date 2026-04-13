# 📚 Documentation Index

Complete guide to SmartAMS documentation. Start here to find what you need.

---

## 🎯 Get Started in 5 Minutes

**New to SmartAMS?** Start with the main [README.md](../README.md)
- Quick overview
- 5-minute quick start
- Test login credentials
- Basic troubleshooting

---

## 📖 Documentation by Topic

### 🔐 Setup & Deployment

| Document | Purpose | Time |
|----------|---------|------|
| [README.md](../README.md) | Main project overview & quick start | 5 min |
| [BACKEND_DEPLOYMENT_GUIDE.md](BACKEND_DEPLOYMENT_GUIDE.md) | Deploy backend to Cloud Run with Docker | 10 min |
| [API_REFERENCE.md](API_REFERENCE.md) | Complete API endpoint documentation | Reference |

### 👥 User Management & Enrollment

| Document | Purpose | Time |
|----------|---------|------|
| [ENROLLMENT_GUIDE.md](ENROLLMENT_GUIDE.md) | Auto-enrollment system setup & usage | 20 min |
| [API_REFERENCE.md#enrollment](API_REFERENCE.md#enrollment) | Enrollment API endpoints | Reference |

### 📋 Timetable & Scheduling

| Document | Purpose | Time |
|----------|---------|------|
| [TIMETABLE_SHIFTS_GUIDE.md](TIMETABLE_SHIFTS_GUIDE.md) | 2-shift schedule with breaks & batch labs | 30 min |
| [TIMETABLE_SHIFTS_QUICKSTART.md](TIMETABLE_SHIFTS_QUICKSTART.md) | Fast setup (15 minutes) | 15 min |
| [TIMETABLE_GENERATION_GUIDE.md](TIMETABLE_GENERATION_GUIDE.md) | Auto-generation with genetic algorithm | 30 min |

### 📸 Attendance & QR

| Document | Purpose | Time |
|----------|---------|------|
| [QR_ATTENDANCE_GUIDE.md](QR_ATTENDANCE_GUIDE.md) | QR-based attendance with face/location capture | 20 min |
| [API_REFERENCE.md#attendance](API_REFERENCE.md#attendance) | Attendance API endpoints | Reference |
| [API_REFERENCE.md#qr-attendance](API_REFERENCE.md#qr-attendance) | QR attendance endpoints | Reference |

### 📡 API & Integration

| Document | Purpose | Time |
|----------|---------|------|
| [API_REFERENCE.md](API_REFERENCE.md) | Complete REST API documentation | Reference |
| [README.md#api-documentation](../README.md#api-documentation) | Quick API overview | 5 min |

---

## 🔍 Find Information Fast

### By Use Case

**I want to...** → **Read this:**

- **Deploy to production** → [Backend Deployment Guide](BACKEND_DEPLOYMENT_GUIDE.md)
- **Setup automatic enrollment** → [Enrollment Guide](ENROLLMENT_GUIDE.md)
- **Create shift-based timetable** → [Timetable Shifts Guide](TIMETABLE_SHIFTS_GUIDE.md)
- **Generate optimal schedule** → [Timetable Generation Guide](TIMETABLE_GENERATION_GUIDE.md)
- **Setup QR attendance** → [QR Attendance Guide](QR_ATTENDANCE_GUIDE.md)
- **Integrate with my system** → [API Reference](API_REFERENCE.md)
- **Troubleshoot an issue** → [README.md#troubleshooting](../README.md#troubleshooting)

### By Role

**I am a...** → **Start here:**

- **🔧 Developer** → [README.md](../README.md) → [API_REFERENCE.md](API_REFERENCE.md)
- **👨‍💼 DevOps/Deployment** → [Backend Deployment Guide](BACKEND_DEPLOYMENT_GUIDE.md)
- **📊 Admin** → [README.md](../README.md) → [Enrollment Guide](ENROLLMENT_GUIDE.md)
- **👨‍🏫 Faculty** → [Timetable Shifts Guide](TIMETABLE_SHIFTS_GUIDE.md) → [QR Attendance Guide](QR_ATTENDANCE_GUIDE.md)
- **🎓 Student** → [README.md#key-features](../README.md#key-features)

---

## 📂 File Structure

```
SMART_AMS_PROJECT/
├── README.md                              ← START HERE
│
├── docs/
│   ├── API_REFERENCE.md                   ← Complete API docs
│   ├── ENROLLMENT_GUIDE.md                ← Auto-enrollment setup
│   ├── BACKEND_DEPLOYMENT_GUIDE.md        ← Cloud Run deployment
│   ├── QR_ATTENDANCE_GUIDE.md             ← QR scanning system
│   ├── TIMETABLE_SHIFTS_GUIDE.md          ← 2-shift schedule management
│   ├── TIMETABLE_SHIFTS_QUICKSTART.md     ← Fast timetable setup
│   ├── TIMETABLE_GENERATION_GUIDE.md      ← Auto-generation algorithm
│   └── INDEX.md                           ← You are here!
│
├── frontend/                              ← Vue/JS SPA
├── backend/                               ← Python Flask API
├── database/                              ← Schema & migrations
└── [other project files]
```

---

## 🚀 Quick Navigation

### Setup & First Run
1. [README.md Quick Start](../README.md#quick-start-5-minutes) (5 min)
2. Create test users
3. Test login persistence
4. Try QR attendance

### Full Customization
1. [Enrollment Guide](ENROLLMENT_GUIDE.md) (20 min)
2. [Timetable Shifts Guide](TIMETABLE_SHIFTS_GUIDE.md) (30 min)
3. [Timetable Generation Guide](TIMETABLE_GENERATION_GUIDE.md) (30 min)
4. [API Reference](API_REFERENCE.md) for integrations

### Production Deployment
1. [Backend Deployment Guide](BACKEND_DEPLOYMENT_GUIDE.md) (Docker setup)
2. [README.md#deployment](../README.md#deployment) (Firebase setup)
3. [API_REFERENCE.md#authentication](API_REFERENCE.md#authentication) (Secure auth)

---

## 💡 Common Questions

### "How do I set up enrollment?"
👉 [Enrollment Guide - 5 Steps](ENROLLMENT_GUIDE.md#5-step-quick-setup)

### "How do I deploy to production?"
👉 [Backend Deployment Guide](BACKEND_DEPLOYMENT_GUIDE.md) + [README.md Deployment](../README.md#deployment)

### "How do I use QR attendance?"
👉 [QR Attendance Guide](QR_ATTENDANCE_GUIDE.md)

### "How do I generate an optimal timetable?"
👉 [Timetable Generation Guide](TIMETABLE_GENERATION_GUIDE.md)

### "What are all the API endpoints?"
👉 [API Reference](API_REFERENCE.md)

### "How do I troubleshoot?"
👉 [README.md Troubleshooting](../README.md#troubleshooting)

---

## 📞 Support

- **Documentation Issues:** Check if document exists in this index
- **Code Issues:** See [README.md#troubleshooting](../README.md#troubleshooting)
- **API Issues:** See [API Reference](API_REFERENCE.md)
- **Deployment Help:** See [Backend Deployment Guide](BACKEND_DEPLOYMENT_GUIDE.md)

---

## 📊 Documentation Stats

| Category | Documents | Total Pages |
|----------|-----------|-------------|
| Getting Started | 1 | 25 |
| Deployment | 1 | 15 |
| Features | 5 | 120 |
| API Reference | 1 | 50 |
| **Total** | **8** | **~210** |

---

## ✅ What's Covered

✅ Project setup & quick start  
✅ Authentication & authorization  
✅ Enrollment system (auto, manual, tracking)  
✅ Timetable (shifts, breaks, batch labs)  
✅ Timetable generation (genetic algorithm)  
✅ QR attendance (scanning, face, location)  
✅ Complete REST API (70+ endpoints)  
✅ Deployment (frontend, backend, database)  
✅ Troubleshooting & FAQs  
✅ Role-based access (student, faculty, admin)  

---

## 🔄 Keep Documentation Updated

When adding new features:
1. Update [README.md](../README.md) with overview
2. Create/update guide in `/docs` folder
3. Update [API_REFERENCE.md](API_REFERENCE.md) with new endpoints
4. Update this INDEX.md with new sections

---

**Last Updated:** March 17, 2026  
**Status:** Complete ✅  
**Next Review:** June 17, 2026
