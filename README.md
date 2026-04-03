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

ResQMesh operates fundamentally on a hybrid model that heavily relies on an ad-hoc Peer-to-Peer architecture. When operating offline, nodes discover each other using a compact local signaling server, after which communication paths are mapped using direct WebRTC pathways.

```mermaid
graph TD;
    subgraph Offline Disaster Zone
        Node_A(📱 Mobile Client A) <-->|WebRTC Data/Voice| Node_B(💻 Laptop Commander)
        Node_A <-->|WebRTC Data/Voice| Node_C(📱 Mobile Client B)
        Node_B <-->|WebRTC Data/Voice| Node_C

        LocalSignal[📶 Local Signaling Server\n(Raspberry Pi / Laptop)] -.->|IP/Port Sharing| Node_A
        LocalSignal -.->|IP/Port Sharing| Node_B
        LocalSignal -.->|IP/Port Sharing| Node_C
    end

    subgraph Firebase Cloud Services
        Auth[Firebase OTP] -->|Authenticate| Node_A
        Auth -->|Authenticate| Node_B
    end

    subgraph Direct Mode
        Node_D(📱 Isolated Node 1) <-->|QR Code SDP Exchange| Node_E(📱 Isolated Node 2)
    end

    classDef mesh fill:#2a2a2a,stroke:#4caf50,stroke-width:2px;
    classDef infra fill:#202020,stroke:#2196f3,stroke-width:2px;
    classDef local fill:#151515,stroke:#ff9800,stroke-width:2px;

    class Node_A,Node_B,Node_C mesh;
    class Auth infra;
    class LocalSignal local;
    class Node_D,Node_E mesh;
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
