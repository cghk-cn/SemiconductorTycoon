# Semiconductor Tycoon - Mobile Packaging with Capacitor

## Overview
React frontend packaged as Android APK using Capacitor. Game engine runs client-side without Express backend. UI designed with cyberpunk dark tech theme (deep mode, neon blue/green/orange accents).

## Client-Side Game Engine
GameEngine.ts runs completely in browser/WebView with methods:
- advanceMonth() - Advance one month
- researchNode(nodeId) - Research technology
- buyEquipment(eqId) - Purchase equipment
- getState() - Get current state
- getAvailableEquipment() - List equipment

App.tsx calls engine directly without API calls.

## User Interface Design
Dark theme with cyberpunk neon accents:
- **Primary colors**: neon blue (#00d4ff), neon green (#00ff88), neon orange (#ff6b35)
- **Background**: dark mode (#0a0a0f / #11111a)
- **Components**: card-based layout, rounded corners, backdrop-blur effects
- **Touch-friendly**: all buttons minimum 44px height, click feedback, toast notifications

### Screens

#### Top Status Bar (StatusBar)
- Current date (e.g., "2024-08")
- Cash balance (e.g., "$1.5M")
- Reputation score
- Current stage (startup/growth/massProduction/exit)

#### Bottom Navigation (BottomNav)
5-tab horizontal navigation:
- 📊 **Dashboard** - Core values, quick actions, big "Advance Month" button
- 🏭 **Fab** - Machine health cards, equipment purchase modals
- 📝 **Contracts** - Browse and accept customer orders
- 🔬 **R&D** - Tech node research from 90nm to A16
- 💰 **Financials** - P&L, cash flow, balance sheet

### Touch & Interaction
- All buttons: min 44px height, appropriate touch target
- Click feedback: background color change on hover/press
- Loading animations: smooth transitions
- Toast notifications: success/failure messages for all actions

## Setup Instructions

### Prerequisites
| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ | Vite 6 requires Node 18+ |
| JDK | **21** | Capacitor 7 / AGP 8.13 require Java 21 (else `invalid source release: 21`) |
| Android SDK | platform 36, build-tools 36.0.0 | `compileSdkVersion = 36` |

macOS with Homebrew:
```bash
brew install openjdk@21
brew install --cask android-commandlinetools
```

SDK environment:
```bash
export JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

### One-Command Build (recommended)
```bash
cd client
./scripts/build-apk.sh          # debug   -> ~/Desktop/SemiconductorTycoon-debug.apk
./scripts/build-apk.sh release  # release -> ~/Desktop/SemiconductorTycoon-release-unsigned.apk
```
The script auto-detects/installs the JDK, downloads the Android cmdline-tools,
accepts licenses, installs the required SDK packages, writes `local.properties`,
pins `org.gradle.java.home`, then runs build -> sync -> `assembleDebug`.

### Manual Build
```bash
cd client
npm install
npm run build          # Vite -> www/
npx cap sync android  # www/ -> android/app/src/main/assets/public

cd android
./gradlew assembleDebug
```

### Install to a device
```bash
adb install -r ~/Desktop/SemiconductorTycoon-debug.apk
# live reload:
npx cap run android
```

## Project Structure
```
client/
├── package.json              # React + Capacitor deps + Tailwind
├── capacitor.config.ts       # Capacitor app config
├── vite.config.ts            # Vite with outDir: "www"
├── tsconfig.json             # Strict TS config for src/
├── index.html                # HTML template
├── README.md                 # This documentation
├── tailwind.config.js        # Custom cyberpunk theme (Tailwind v3)
├── postcss.config.js         # PostCSS config
├── scripts/
│   └── build-apk.sh          # One-command APK build script
├── src/
│   ├── main.tsx              # Entry point (HashRouter + index.css import)
│   ├── App.tsx               # Main app, routing, toast system
│   ├── types/                # TypeScript interfaces
│   │   └── index.ts
│   ├── GameEngine.ts         # Client-side game core
│   ├── components/
│   │   ├── StatusBar.tsx     # Top status header
│   │   ├── BottomNav.tsx     # 5-tab bottom navigation
│   │   ├── Dashboard.tsx     # Core values + quick actions
│   │   ├── FabPanel.tsx      # Machine health + equipment store
│   │   ├── ContractsPanel.tsx# Customer orders market
│   │   ├── ResearchPanel.tsx # Tech tree research
│   │   ├── FinancialsPanel.tsx# P&L & balance sheet
│   │   └── Toast.tsx         # Toast notification stack
│   └── index.css             # Tailwind layers + cyberpunk component classes
└── www/                      # Build output (generated)
```

## APK Export Workflow
1. `npm run build` - Vite builds www/
2. `npx cap sync android` - Syncs to Android assets/
3. `./gradlew assembleDebug` - Generates debug APK
4. Output: `client/android/app/build/outputs/apk/debug/app-debug.apk`

## Notes
- The game runs entirely inside the WebView - no backend server needed.
- Routing uses `HashRouter` because the Capacitor WebView serves assets from
  `file://`, where `BrowserRouter` deep links cannot resolve.
- `@capacitor/core` is pinned to `7.6.9` to match `@capacitor/android@7.6.9`.
- Tailwind is **v3** (not v4): v4 needs `@tailwindcss/postcss` and `@theme`
  syntax, which this project's `tailwind.config.js` does not use.
- `client/android/gradle.properties` pins `org.gradle.java.home` to JDK 21 so
  Gradle does not auto-detect a stale Homebrew cellar path (which caused
  `NoClassDefFoundError: sun.security.ssl.SSLContextImpl$TLSContext`).
- For release builds: generate a keystore and configure signing in `build.gradle`.

