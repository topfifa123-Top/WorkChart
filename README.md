# GateFlow

Requirement approval & task tracker (Sales requests → Technical Leader approves), with Kanban board, task list, calendar, dashboard, and an optional real Google Sheets backend.

## รันดูในเครื่องตัวเองก่อน (ไม่บังคับ)

```bash
npm install
npm run dev
```

เปิด http://localhost:5173

## Deploy ขึ้น GitHub Pages

Repo: https://github.com/topfifa123-Top/WorkChart

1. ในโฟลเดอร์นี้ รัน:
   ```bash
   git init
   git add .
   git commit -m "Initial GateFlow deploy setup"
   git branch -M main
   git remote add origin https://github.com/topfifa123-Top/WorkChart.git
   git push -u origin main
   ```
2. ไปที่ repo บน GitHub → Settings → Pages → Source เลือก **GitHub Actions**
3. รอ workflow รันจบ (ดูใน tab Actions) จะได้เว็บที่:
   ```
   https://topfifa123-top.github.io/WorkChart/
   ```

**ถ้าเปลี่ยนชื่อ repo** ต้องแก้ `base: '/ชื่อ repo/'` ใน `vite.config.js` ให้ตรงกันด้วย ไม่งั้นเว็บจะขึ้นหน้าขาว

## บัญชีทดลองใช้

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Admin |
| sales | sales123 | Sales |
| lead | lead123 | Technical Leader |

**⚠️ ควรเปลี่ยนรหัสผ่านเริ่มต้นเหล่านี้ก่อนใช้งานจริง** (แก้ได้ในหน้า Settings หลังล็อกอิน หรือแก้ค่า `DEFAULT_USERS` ใน `src/App.jsx`)

## เชื่อม Google Sheets เป็นฐานข้อมูล (ไม่บังคับ)

ไม่เชื่อมก็ใช้งานได้ปกติ — ข้อมูลจะเก็บใน localStorage ของเบราว์เซอร์แต่ละคน (ไม่ sync ข้ามเครื่อง)

ถ้าอยากให้ทั้งทีมเห็นข้อมูลชุดเดียวกัน ให้ทำตามคู่มือ `sheets-bridge.gs` ที่แนบมาด้วย แล้วเอา Web App URL ไปใส่ในหน้า Settings ของแอป
