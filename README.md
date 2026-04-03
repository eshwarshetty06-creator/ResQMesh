# ResQMesh 🌐🆘

> *"When the towers fall, the mesh rises."*

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Mesh-ff6600)
![Offline First](https://img.shields.io/badge/Offline-First-green)

**ResQMesh** is a decentralized, offline-first emergency communication application tailored for disaster-response, Search and Rescue (SAR) operations, and critical tactical environments. It transforms any browser or Android device into a powerful Peer-to-Peer (P2P) mesh node. **No internet connection, cellular towers, or central servers are required in the field.**

In the aftermath of events like earthquakes, hurricanes, or systemic grid failures, connectivity is often the first casualty. ResQMesh overcomes this by leveraging local networks and Direct WebRTC mode to ensure responders and survivors can communicate and coordinate.

---

## 🚀 Key Features

- 📡 **True Mesh Networking** — Robust P2P connections utilizing WebRTC and local PeerJS signaling. Creates an ad-hoc local network that spans across connected devices.
- 🗺️ **Live Tactical Map** — Real-time GPS plotting of node positions with offline tracking. Integrated Leaflet mapping with cached dark tiles for low-light legibility.
- 🎙️ **Push-to-Talk (PTT) Radio** — Send encrypted, lightweight voice bursts natively across the mesh network without any external servers.
- ❤️ **Biometric Sync** — Innovative PPG heart-rate scanning via the device's rear camera flash to gauge the vitals of responders and victims.
- 🆘 **Triage / SOS Broadcasting** — One-tap emergency MAYDAY broadcast propagating your exact GPS coordinates and distress signal to all connected peers instantly.
- 📦 **Store-Carry-Forward** — Resilient offline queue. Messages and data payloads are held securely and relayed automatically when peers reconnect.
- 💀 **Dead Man's Switch** — Configurable fail-safe that triggers an auto-MAYDAY warning if a responder node goes silent for a predefined period.
- 🔊 **Text-to-Speech (TTS)** — Hands-free audio readout of incoming emergency text messages for busy or visually impaired responders.
- ⚡ **Direct WebRTC Mode** — Complete server-free and local-network-free P2P via QR-code SDP (Session Description Protocol) exchange.
- 📱 **Firebase OTP Login** — Robust real-world phone number-based authentication via Firebase when online connectivity is temporarily available before dispatch.

---

## 🏛️ System Architecture

ResQMesh is built for environments where normal infrastructure is destroyed. The system adapts automatically to your environment based on three different scenarios, ensuring you are always connected.

```mermaid
graph TD

    %% SCENARIO 1
    subgraph 1. Local Network Available (No Internet required)
        Router[📶 Local WiFi Router / Hotspot]
        
        Client1[📱 Responder 1]
        Client2[💻 Command Post]
        Client3[📱 Responder 2]
        
        %% Connections to router
        Client1 -. "1. Connect for Discovery" .-> Router
        Client2 -. "1. Connect for Discovery" .-> Router
        Client3 -. "1. Connect for Discovery" .-> Router
        
        %% Real P2P traffic
        Client1 === "2. Direct WebRTC Traffic (Voice, Map, Text)" === Client2
        Client2 === "2. Direct WebRTC Traffic (Voice, Map, Text)" === Client3
        Client1 === "2. Direct WebRTC Traffic (Voice, Map, Text)" === Client3
    end

    %% SCENARIO 2
    subgraph  2. Zero Infrastructure (Direct Mode)
        NodeX[📱 Isolated Responder]
        NodeY[📱 Isolated Civilian]
        
        NodeX -. "1. Scan QR Code" .-> NodeY
        NodeX === "2. Direct P2P Device Connection" === NodeY
    end
    
    %% SCENARIO 3
    subgraph 3. Pre-Deployment (Internet Available)
        Cloud[☁️ Firebase Cloud Auth]
        NodeZ[📱 Responder Phone]
        
        Cloud -. "Authenticate via OTP SMS prior to dispatch" .-> NodeZ
    end

    %% Styles for a clean look
    classDef device fill:#2b2b2b,stroke:#4CAF50,stroke-width:2px,color:#fff;
    classDef router fill:#1e1e1e,stroke:#FF9800,stroke-width:2px,stroke-dasharray: 5 5,color:#fff;
    classDef cloud fill:#0d233a,stroke:#2196F3,stroke-width:2px,color:#fff;

    class Client1,Client2,Client3,NodeX,NodeY,NodeZ device;
    class Router router;
    class Cloud cloud;
```

---

## 🛠️ Tech Stack

- **Frontend & Core Logic**: React 19, TypeScript, Vite
- **P2P Networking**: PeerJS wrapped over pure WebRTC
- **Mapping & GIS**: Leaflet.js with CartoDB offline-cached dark tiles
- **Progressive Web App (PWA)**: Advanced Service Worker for deep full-offline support and caching
- **Mobile Container**: Capacitor (Builds native Android APK directly from web core)
- **Authentication**: Firebase Authentication (OTP / Local Credentials)
- **Styling**: Vanilla CSS, Modern Glassmorphism & Dark Mode Aesthetics

---

## 🎥 Demos & Media

Please check the **`DEMO VEDIO/`** directory in this repository to find video walkthroughs and system operation demonstrations of ResQMesh in action.

---

## 💻 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- Standard modern browser or Android Studio (for native mobile builds)

### 1. Running Locally (Offline Mode)

This starts both the Vite frontend development server and the local PeerJS signaling server concurrently:

```bash
# Install dependencies
npm install

# Start development & local peer signaling server
npm run dev:offline
```

*Open `http://localhost:5173` on multiple devices connected to the **same WiFi or hotspot** to test mesh capabilities.*

### 2. Building for Production

Compile optimal static assets:
```bash
npm run build   # Outputs to dist/ directory
```

### 3. Native Mobile (Android APK)

We use Capacitor to sync the optimal web app into a robust Android App structure natively.

```bash
# Build the web bundle and sync it into the Android directory
npm run mobile:build

# Open the project in Android Studio to build the final APK/AAB
npm run mobile:open
```

---

## 🌍 Deployment Options

If you intend to host the remote signaling interface for WAN-connected edge-nodes:

- **Frontend App** → Use easily hostable platforms like [Vercel](https://vercel.com) or Netlify.
- **Backend PeerJS** → Host on [Render](https://render.com) or [Railway](https://railway.app).

**Required Environment Variables (e.g., on Vercel):**
```env
VITE_PEER_HOST=your-server.onrender.com
VITE_PEER_PORT=443
VITE_PEER_PATH=/peerjs
```

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
