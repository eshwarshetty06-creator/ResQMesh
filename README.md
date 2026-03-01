# ResQMesh

> *"When the towers fall, the mesh rises."*

**ResQMesh** is a decentralized, offline-first emergency communication app. It turns any browser or Android device into a P2P mesh node — no internet, no cell towers, no servers needed in the field.

## Features

- 📡 **Mesh Networking** — P2P connections via WebRTC + local PeerJS signaling
- 🗺️ **Live Tactical Map** — GPS node positions with offline tile caching (Leaflet)
- 🎙️ **Push-to-Talk Radio** — Encrypted voice bursts across the mesh
- ❤️ **Biometric Sync** — PPG heart-rate scan via rear camera flash
- 🆘 **Triage SOS** — One-tap emergency broadcast with GPS coordinates
- 📦 **Store-Carry-Forward** — Messages queued and relayed when peers reconnect
- 💀 **Dead Man's Switch** — Auto-MAYDAY if node goes silent for N minutes
- 🔊 **Text-to-Speech** — Hands-free audio readout of incoming messages
- 📡 **Node Discovery** — Auto-detect nearby nodes on the mesh
- ⚡ **Direct WebRTC Mode** — Server-free P2P via QR-code SDP exchange

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Networking**: PeerJS (WebRTC) + local signaling server
- **Map**: Leaflet.js with CartoDB dark tiles
- **PWA**: Service Worker for full offline support
- **Mobile**: Capacitor (Android APK)

## Running Locally

```bash
npm install
npm run dev:offline   # starts both the Vite frontend and PeerJS server
```

Open `http://localhost:5173` on all devices on the **same WiFi/hotspot**.

## Building for Production

```bash
npm run build         # outputs to dist/
```

## Mobile (Android APK)

```bash
npm run mobile:build  # builds + syncs into the Android project
npm run mobile:open   # opens Android Studio
```

## Deployment

- **Frontend** → [Vercel](https://vercel.com) (auto-deploy from GitHub)
- **Backend** → [Render](https://render.com) or [Railway](https://railway.app)

Set env vars on Vercel:
```
VITE_PEER_HOST=your-server.onrender.com
VITE_PEER_PORT=443
VITE_PEER_PATH=/peerjs
```

## License

MIT
