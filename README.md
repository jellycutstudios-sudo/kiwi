# DineOS 🍽️

DineOS is a modern, high-performance, offline-first Point of Sale (POS) and Restaurant Management System. Built using **React + Vite**, it features real-time synchronization via **Firebase**, offline capability using modern persistence layers, multi-role routing, PWA integration, and multi-language support (English and Arabic RTL).

---

## ✨ Features

- **⚡ Lightning-Fast POS**: Smooth ordering interface with quick categories, modifiers, search, and dynamic cart operations.
- **🗺️ Interactive Table Map**: Drag-and-drop table layouts, live seating states, visual table capacities, reservations indicators, and billing actions (transfer, merge, pay).
- **📦 Inventory Manager**: Tracks stock quantities, units, and supplier associations in real time.
- **🤝 Delivery Hub Integration**: Support for Uber Eats, Zomato, Swiggy, and Deliveroo webhooks, auto-accept toggles, commission calculators, and scheduled busy hours.
- **📊 Admin Reports**: Deep-dive analytics on sales, payment methods, hourly trends, category breakdown, tax logs, and payroll.
- **👥 Staff & Payroll Manager**: Role-based access control (Waiter, Cashier, Kitchen, Admin, Super Admin), visual shifts, and automatic monthly payroll generation with CSV exports.
- **📶 Offline-First PWA**: Pre-cached shell assets and offline Firestore read/write sync using Service Workers and persistent LocalCache.
- **🖨️ Thermal Receipt Printing**: Built-in ESC/POS receipt generation and standard browser fallback.
- **📱 TV Token Display**: Live customer order queue for pick-up/status updates.
- **🌍 Internationalization (i18n)**: Out-of-the-box support for English and Arabic RTL.

---

## 🛠️ Tech Stack

- **Core**: React 19, Javascript (ES6+)
- **Build Tool**: Vite 8, Rolldown
- **Styling**: Vanilla CSS (Custom tokens, sleek variables, glassmorphism, responsive designs)
- **State Management**: Zustand
- **Database / Auth**: Firebase SDK v12, Firestore (IndexedDB persistence), Firebase Auth
- **Routing**: React Router DOM v7
- **PWA**: `vite-plugin-pwa` + Workbox
- **Testing**: Vitest + Testing Library

---

## 🚀 Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Configure Environment**:
   Duplicate `.env.example` to `.env` and enter your Firebase credentials.
3. **Run Development Server**:
   ```bash
   npm run dev
   ```
4. **Build for Production**:
   ```bash
   npm run build
   ```
5. **Run Linting**:
   ```bash
   npm run lint
   ```
6. **Run Test Suite**:
   ```bash
   npm test
   ```

For detailed setup, databases structures, super-admin account creation, and printing configurations, see the [Setup Guide](file:///d:/SALMAN-PRTFOLIO/SALMAN-PRTFOLIO/posmain/SETUP.md).

---

## 🔒 Security & Production Readiness

This project is fully production-hardened:
- **Tenant Isolation**: Firestore rules restrict read/write access to restaurant boundaries via `isUserAdmin(restaurantId)`.
- **Role Protections**: Regular admins are prohibited from setting their roles to `super_admin` or tampering with other restaurant records.
- **CI/CD Integration**: A GitHub Actions workflow automates linting, testing, and building upon pull requests or pushes to the `main` branch.
- **Secure Webhooks**: Authorization tokens and signature verifications are checked for all external delivery platform endpoints.
