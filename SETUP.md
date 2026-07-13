# DineOS — Setup Guide

## 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project → Enable **Firestore**, **Authentication** (Email/Password), **Storage**
3. Copy your config values

## 2. Environment Variables
Create a `.env` file in project root (copy from `.env.example`):
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 3. Create First Admin
1. In Firebase Auth → **Add user** (email + password)
2. In Firestore, create doc: `/users/{uid}` with:
   ```json
   {
     "uid": "your_firebase_uid",
     "name": "Your Name",
     "role": "super_admin",
     "restaurantId": "your_restaurant_doc_id"
   }
   ```
3. Create `/restaurants/{id}` doc with:
   ```json
   {
     "name": "My Restaurant",
     "currency": "INR",
     "modes": ["pos", "table", "token", "online"],
     "taxConfig": { "type": "gst", "cgst": 9, "sgst": 9 }
   }
   ```

## 4. Firestore Rules
Deploy security rules:
```bash
firebase deploy --only firestore:rules
```

## 5. Run Locally
```bash
npm run dev -- --port 5175
```
Open: http://localhost:5175


## 6. Deploy to Vercel
```bash
npx vercel --prod
```
Add environment variables in Vercel Dashboard → Settings → Environment Variables

## 7. Recommended Thermal Printer
- **Epson TM-T20III** (USB, 80mm) — ~$180
- **STAR TSP100III** (USB/LAN, 80mm) — ~$200
- Works via browser print dialog — no extra driver/software needed
- Set browser default printer to thermal printer

## 8. TV Token Display
Open on any browser-connected TV:
```
https://your-app.vercel.app/display/tokens/{restaurantId}
```
Keep in fullscreen mode (F11)

## 9. Online Order Link
Share with customers:
```
https://your-app.vercel.app/order/{restaurantId}
```
Or copy from Admin → Settings → Online Order Page section

## 10. Staff PIN Login Flow
1. Admin goes to Admin → Staff → copies **Restaurant ID**
2. Creates staff with 4-digit PIN
3. Staff opens /login → selects "Staff PIN" tab → enters Restaurant ID + PIN
