import { useRef, useEffect, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Html5QrcodeScanner } from 'html5-qrcode';
import QRCode from 'qrcode';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import {
    MessageSquare, Package, Shield, QrCode, AlertTriangle,
    MapPin, Globe, Camera, Mic, Radio, Volume2,
    Zap, Navigation, Layers, X, Target
} from 'lucide-react';

type Role = 'civilian' | 'responder' | 'drone';
type TriageStatus = 'ok' | 'injured' | 'critical' | 'trapped' | 'nominal';
type Tab = 'chat' | 'radio' | 'resources' | 'tactical' | 'map' | 'direct';

interface ResourcePost {
    id: string;
    type: 'request' | 'offer';
    item: string;
    node: string;
    time: string;
}

interface TriageAlert {
    id: string;
    node: string;
    status: string;
    location: string;
    time: string;
    assigned: boolean;
}

interface NodeLocation {
    id: string;
    lat: number;
    lng: number;
    role: Role;
    status: string;
    vitals?: number;
    lastSeen: number;
}

// Fix Leaflet default icon paths when bundled with Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

export default function ScenarioLive({ onBack, initialData }: { onBack: () => void, initialData?: { bpm?: number } }) {
    // --- STATE ---
    const [myId, setMyId] = useState<string>('');
    const [role, setRole] = useState<Role>('civilian');
    const [peerIdInput, setPeerIdInput] = useState('');
    const [connections, setConnections] = useState<DataConnection[]>([]);
    const [status, setStatus] = useState(initialData?.bpm ? `BIO-SYNC ACTIVE (${initialData.bpm} BPM)` : 'SYSTEM READY');
    const [activeTab, setActiveTab] = useState<Tab>('chat');
    const [messages, setMessages] = useState<{ sender: string, text: string, time: string }[]>(initialData?.bpm ? [{ sender: 'SYS', text: `BIOMETRIC ENCRYPTION KEY GENERATED. SYNCED BPM: ${initialData.bpm}`, time: new Date().toLocaleTimeString() }] : []);
    const [radioMessages, setRadioMessages] = useState<{ sender: string, time: string, audio: string }[]>([]);
    const [resources, setResources] = useState<ResourcePost[]>([]);
    const [alerts, setAlerts] = useState<TriageAlert[]>([]);
    const [triage, setTriage] = useState<TriageStatus>('ok');
    const [showQR, setShowQR] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [nodes, setNodes] = useState<Record<string, NodeLocation>>({});
    const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
    const [customId, setCustomId] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [msgInput, setMsgInput] = useState('');  // controlled chat input
    const [dtfQueue, setDtfQueue] = useState<string[]>([]); // Store-Carry-Forward offline queue

    // --- SERVER-FREE DIRECT MODE STATE ---
    const [directMode, setDirectMode] = useState<'idle' | 'offering' | 'waiting-answer' | 'answering' | 'connected'>('idle');
    const [_directOffer, setDirectOffer] = useState('');      // SDP offer text (set on offer generation)
    const [_directAnswer, setDirectAnswer] = useState('');    // SDP answer text (set on answer generation)
    const [directOfferInput, setDirectOfferInput] = useState(''); // paste field
    const [directQR, setDirectQR] = useState('');             // QR of offer/answer
    const [directChannel, setDirectChannel] = useState<RTCDataChannel | null>(null);
    const rtcRef = useRef<RTCPeerConnection | null>(null);

    // ─── DEAD MAN'S SWITCH ─────────────────────────────
    const [dmsEnabled, setDmsEnabled] = useState(false);
    const [dmsTimeoutMin, setDmsTimeoutMin] = useState(10);
    const [dmsCountdown, setDmsCountdown] = useState(600);
    const [dmsFired, setDmsFired] = useState(false);
    const lastActivityRef = useRef<number>(Date.now());
    // ─── TEXT-TO-SPEECH ────────────────────────────────
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const ttsEnabledRef = useRef(false);
    // ─── NODE DISCOVERY ────────────────────────────────
    const [nearbyPeers, setNearbyPeers] = useState<string[]>([]);

    const peerRef = useRef<Peer | null>(null);
    const mapRef = useRef<any>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    // --- SERVER-FREE DIRECT: Create RTCPeerConnection ---
    const createRTC = () => {
        // No STUN/TURN needed on same LAN/hotspot (devices share subnet)
        const pc = new RTCPeerConnection({ iceServers: [] });
        rtcRef.current = pc;
        return pc;
    };

    // STEP 1 (Initiator): Generate offer SDP → display as QR
    const generateOffer = async () => {
        const pc = createRTC();
        const ch = pc.createDataChannel('resqmesh');
        setDirectChannel(ch);

        ch.onopen = () => {
            setDirectMode('connected');
            setStatus('🟢 DIRECT P2P — SERVER-FREE');
            addLog('✅ SERVER-FREE LINK ESTABLISHED — zero infrastructure');
        };
        ch.onmessage = (e) => {
            setMessages(prev => [...prev, { sender: 'DIRECT-PEER', text: e.data, time: new Date().toLocaleTimeString() }]);
        };

        await pc.setLocalDescription(await pc.createOffer());

        // Wait for ICE gathering to complete before showing offer
        await new Promise<void>(resolve => {
            if (pc.iceGatheringState === 'complete') { resolve(); return; }
            pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
            setTimeout(resolve, 3000); // fallback
        });

        const offerStr = JSON.stringify(pc.localDescription);
        setDirectOffer(offerStr);
        setDirectMode('waiting-answer');
        addLog('📡 OFFER GENERATED — show QR to peer device');

        // Generate QR of the offer
        QRCode.toDataURL(offerStr, { width: 300, margin: 1 }).then(setDirectQR).catch(console.error);
    };

    // STEP 2 (Receiver): Paste offer → generate answer SDP
    const generateAnswer = async () => {
        if (!directOfferInput.trim()) return;
        const pc = createRTC();

        pc.ondatachannel = (e) => {
            const ch = e.channel;
            setDirectChannel(ch);
            ch.onopen = () => {
                setDirectMode('connected');
                setStatus('🟢 DIRECT P2P — SERVER-FREE');
                addLog('✅ SERVER-FREE LINK ESTABLISHED — zero infrastructure');
            };
            ch.onmessage = (evt) => {
                setMessages(prev => [...prev, { sender: 'DIRECT-PEER', text: evt.data, time: new Date().toLocaleTimeString() }]);
            };
        };

        const offer = JSON.parse(directOfferInput.trim());
        await pc.setRemoteDescription(offer);
        await pc.setLocalDescription(await pc.createAnswer());

        await new Promise<void>(resolve => {
            if (pc.iceGatheringState === 'complete') { resolve(); return; }
            pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
            setTimeout(resolve, 3000);
        });

        const answerStr = JSON.stringify(pc.localDescription);
        setDirectAnswer(answerStr);
        setDirectMode('answering');
        addLog('📡 ANSWER GENERATED — show QR back to initiator');
        QRCode.toDataURL(answerStr, { width: 300, margin: 1 }).then(setDirectQR).catch(console.error);
    };

    // STEP 3 (Initiator): Paste answer → complete handshake
    const completeHandshake = async () => {
        if (!directOfferInput.trim() || !rtcRef.current) return;
        const answer = JSON.parse(directOfferInput.trim());
        await rtcRef.current.setRemoteDescription(answer);
        addLog('🔗 HANDSHAKE COMPLETE — waiting for channel...');
    };

    // Send message via direct channel
    const sendDirectMessage = (text: string) => {
        if (!text.trim() || !directChannel || directChannel.readyState !== 'open') return;
        directChannel.send(text);
        setMessages(prev => [...prev, { sender: 'ME', text, time: new Date().toLocaleTimeString() }]);
    };

    // ─── TEXT-TO-SPEECH helper ──────────────────────────
    const speak = (text: string, priority = false) => {
        if (!ttsEnabledRef.current || !('speechSynthesis' in window)) return;
        if (priority) window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 0.95; utt.volume = 1;
        window.speechSynthesis.speak(utt);
    };

    // ─── DMS activity reset ───────────────────────────
    const resetDMS = () => { lastActivityRef.current = Date.now(); };

    // --- INITIALIZATION ---
    useEffect(() => {
        const rand = Math.floor(Math.random() * 900) + 100;
        let prefix = role === 'responder' ? 'RESP' : (role === 'drone' ? 'SKY' : 'CIV');
        setCustomId(`${prefix}-${rand}`);
    }, [role]);

    useEffect(() => {
        const chat = document.getElementById('chat-scroll-target');
        if (chat) chat.scrollTop = chat.scrollHeight;
    }, [messages, activeTab]);

    useEffect(() => {
        return () => { peerRef.current?.destroy(); };
    }, []);

    // Generate QR code locally (no internet needed)
    useEffect(() => {
        if (myId) {
            QRCode.toDataURL(myId, {
                width: 200,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            }).then(setQrDataUrl).catch(console.error);
        }
    }, [myId]);

    // MAYDAY: Auto-alert if BPM is critical
    useEffect(() => {
        if (myId && initialData?.bpm) {
            const bpm = initialData.bpm;
            if (bpm > 150 || bpm < 40) {
                setTimeout(() => sendTriageUpdate('critical'), 1500);
                addLog(`⚠️ MAYDAY AUTO-TRIGGERED: BPM=${bpm} (CRITICAL THRESHOLD)`);
            }
        }
    }, [myId]);

    // ─── Keep TTS ref in sync so closures always read current value
    useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);

    // ─── Dead Man’s Switch — 1 s watchdog
    useEffect(() => {
        if (!dmsEnabled || !myId) return;
        const iv = setInterval(() => {
            const remaining = Math.max(0, dmsTimeoutMin * 60000 - (Date.now() - lastActivityRef.current));
            setDmsCountdown(Math.ceil(remaining / 1000));
            if (remaining === 0) { lastActivityRef.current = Date.now(); setDmsFired(true); }
        }, 1000);
        return () => clearInterval(iv);
    }, [dmsEnabled, myId, dmsTimeoutMin]);

    // ─── Fire the actual MAYDAY when DMS trips (fresh state)
    useEffect(() => {
        if (!dmsFired || !myId) return;
        addLog('💀 DEAD MAN’S SWITCH TRIGGERED — AUTO-MAYDAY BROADCAST');
        speak('EMERGENCY! Dead man switch triggered. Sending MAYDAY.', true);
        sendTriageUpdate('critical');
        setDmsFired(false);
    }, [dmsFired]);

    // ─── Node Discovery — poll PeerJS server every 20 s
    useEffect(() => {
        if (!myId) return;
        const discover = async () => {
            try {
                const isLocal = window.location.hostname === 'localhost' || !!window.location.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./);
                const discoverUrl = isLocal
                    ? `http://${window.location.hostname}:9000/peerjs/peers`
                    : `https://${import.meta.env.VITE_PEER_HOST || 'resqmesh.onrender.com'}/peerjs/peers`;
                const res = await fetch(discoverUrl);
                if (res.ok) {
                    const peers: string[] = await res.json();
                    setNearbyPeers(peers.filter(p => p !== myId));
                }
            } catch { /* server not reachable */ }
        };
        discover();
        const iv = setInterval(discover, 20000);
        return () => clearInterval(iv);
    }, [myId]);

    // --- MESH BROADCAST ---
    const broadcast = (data: any) => {
        connections.forEach(c => c.send(data));
    };

    const addLog = (text: string) => {
        setMessages(prev => [...prev, { sender: 'SYS', text, time: new Date().toLocaleTimeString() }]);
    };

    const sendMessage = (text: string) => {
        if (!text.trim()) return;
        resetDMS(); // any sent message = node is alive
        if (connections.length === 0) {
            // Store-Carry-Forward: queue packet for when peer connects
            setDtfQueue(prev => [...prev, text]);
            setMessages(prev => [...prev, { sender: 'ME', text, time: new Date().toLocaleTimeString() }]);
            addLog(`📦 DTF QUEUED: Packet stored. Will auto-relay when peer connects. (${dtfQueue.length + 1} queued)`);
        } else {
            broadcast(text);
            setMessages(prev => [...prev, { sender: 'ME', text, time: new Date().toLocaleTimeString() }]);
        }
    };

    // --- MESH LOGIC ---
    const setupConnection = (c: DataConnection) => {
        setConnections(prev => [...prev, c]);
        addLog(`🔗 SECURE LINK: ${c.peer}`);
        // Store-Carry-Forward: auto-drain queued packets to new peer
        setDtfQueue(prev => {
            if (prev.length > 0) {
                addLog(`📡 DTF RELAY: Draining ${prev.length} stored packet(s) to ${c.peer}`);
                prev.forEach(msg => c.send(msg));
                return [];
            }
            return prev;
        });

        if (myLocation) {
            c.send(`LOC:${myId}|${myLocation[0]}|${myLocation[1]}|${role}|${triage}|${initialData?.bpm || 0}`);
        }

        c.on('data', (data: any) => {
            if (typeof data === 'object' && data.type === 'voice-burst') {
                setRadioMessages(prev => [{ sender: data.sender, time: new Date().toLocaleTimeString(), audio: data.audio }, ...prev]);
                new Audio(data.audio).play().catch(() => addLog("VOX BLOCKED: USER INPUT REQ"));
                return;
            }

            const s = String(data);
            if (s.startsWith('LOC:')) {
                const p = s.slice(4).split('|');
                setNodes(prev => ({
                    ...prev,
                    [p[0]]: {
                        id: p[0],
                        lat: parseFloat(p[1]),
                        lng: parseFloat(p[2]),
                        role: p[3] as Role,
                        status: p[4],
                        vitals: p[5] ? parseInt(p[5]) : undefined,
                        lastSeen: Date.now()
                    }
                }));
            } else if (s.startsWith('RESOURCE:')) {
                const p = s.slice(9).split('|');
                setResources(prev => [{ id: Date.now().toString(), type: p[0] as any, item: p[1], node: c.peer, time: new Date().toLocaleTimeString() }, ...prev]);
                addLog(`RESOURCE ${p[0].toUpperCase()}: ${p[1]}`);
            } else if (s.startsWith('TRIAGE:')) {
                const p = s.slice(7).split('|');
                const [lat, lng] = p[1].split(',').map(Number);

                setAlerts(prev => [{
                    id: Date.now().toString(), node: c.peer, status: p[0], location: p[1], time: new Date().toLocaleTimeString(), assigned: false
                }, ...prev]);

                // CRITICAL: Update nodes list immediately so the responder sees them on the map
                setNodes(prev => ({
                    ...prev,
                    [c.peer]: {
                        ...(prev[c.peer] || { role: 'civilian' }), // Default to civilian if unknown
                        id: c.peer,
                        lat: lat,
                        lng: lng,
                        status: p[0], // SOS Status (e.g. CRITICAL)
                        lastSeen: Date.now()
                    }
                }));

                if (role === 'responder') {
                    addLog(`!! EMERGENCY ALERT !! FROM ${c.peer}`);
                    speak(`EMERGENCY ALERT from ${c.peer}. Status: ${p[0]}`, true);
                }
            } else {
                setMessages(prev => [...prev, { sender: c.peer, text: s, time: new Date().toLocaleTimeString() }]);
                speak(`${c.peer}: ${s}`);
            }
        });

        c.on('close', () => {
            setConnections(prev => prev.filter(conn => conn.peer !== c.peer));
            addLog(`LINK LOST: ${c.peer}`);
        });
    };

    const connectToPeer = (id?: string) => {
        const tid = (id || peerIdInput).trim().toUpperCase();
        if (!tid || tid === myId || !peerRef.current) return;
        setStatus(`📡 SIGNALING ${tid}...`);
        addLog(`📡 Attempting connection to: ${tid}`);
        const c = peerRef.current.connect(tid, { reliable: true });
        // Timeout: if no connection after 15s, show error
        const timeoutId = setTimeout(() => {
            if (c.open === false) {
                setStatus('⚠️ CONNECTION TIMEOUT — Is the other device online with that ID?');
                addLog(`⏱ CONNECTION TIMEOUT: ${tid} did not respond`);
            }
        }, 15000);
        c.on('open', () => {
            clearTimeout(timeoutId);
            setStatus('🟢 ONLINE — CLOUD MESH');
            addLog(`✅ CONNECTED to ${tid}`);
            setupConnection(c);
            setPeerIdInput('');
            setShowScanner(false);
        });
        c.on('error', (e: any) => {
            clearTimeout(timeoutId);
            setStatus(`⚠️ LINK FAILED: ${e?.type || 'unknown error'}`);
            addLog(`❌ LINK FAILED to ${tid}: ${e?.type}`);
        });
    };

    // --- FEATURES ---
    const shareLocation = () => {
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude: lat, longitude: lng } = pos.coords;
            setMyLocation([lat, lng]);
            broadcast(`LOC:${myId}|${lat}|${lng}|${role}|${triage}|${initialData?.bpm || 0}`);
            sendMessage(`📍 SHARED GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }, () => addLog("GPS ERROR: UNAVAILABLE"));
    };

    const sendTriageUpdate = (status: TriageStatus) => {
        setTriage(status);
        navigator.geolocation.getCurrentPosition(pos => {
            const loc = `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`;
            setMyLocation([pos.coords.latitude, pos.coords.longitude]);
            broadcast(`TRIAGE:${status.toUpperCase()}|${loc}`);
            sendMessage(`TRIAGE UPDATE: [${status.toUpperCase()}] @ ${loc}`);
        });
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            recorder.ondataavailable = e => audioChunksRef.current.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    const audio = reader.result as string;
                    broadcast({ type: 'voice-burst', sender: myId, audio });
                    setRadioMessages(prev => [{ sender: 'ME', time: new Date().toLocaleTimeString(), audio }, ...prev]);
                };
                stream.getTracks().forEach(t => t.stop());
            };
            recorder.start();
            setIsRecording(true);
        } catch (e) { addLog("VOX ERROR: MIC BLOCKED"); }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    const postResource = (type: 'request' | 'offer', item: string) => {
        if (!item) return;
        broadcast(`RESOURCE:${type}|${item}`);
        setResources(prev => [{ id: Date.now().toString(), type, item, node: 'ME', time: new Date().toLocaleTimeString() }, ...prev]);
        sendMessage(`${type.toUpperCase()}ED: ${item}`);
    };

    // --- MAP LOGIC (fully local — tiles cache via service worker) ---
    useEffect(() => {
        if (activeTab === 'map' && mapContainerRef.current) {
            if (!mapRef.current) {
                const initialPos: [number, number] = myLocation || [20.5937, 78.9629];
                const map = L.map(mapContainerRef.current, {
                    zoomControl: true,
                    attributionControl: false
                }).setView(initialPos, 13);

                // Primary: CartoDB dark tiles (cached by SW). Fallback: OSM.
                const tileLayer = L.tileLayer(
                    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                    { maxZoom: 19, subdomains: 'abcd' }
                );

                let tileErrorFired = false;
                tileLayer.on('tileerror', () => {
                    if (tileErrorFired) return;
                    tileErrorFired = true;
                    // Try OSM as fallback
                    map.eachLayer(l => { if ((l as any)._url?.includes('cartocdn')) map.removeLayer(l); });
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 19
                    }).addTo(map);
                    // Show offline badge
                    if (!document.getElementById('offline-map-overlay')) {
                        const overlay = document.createElement('div');
                        overlay.id = 'offline-map-overlay';
                        overlay.style.cssText = [
                            'position:absolute',
                            'inset:0',
                            'background:repeating-linear-gradient(0deg,rgba(0,242,254,0.04) 0,rgba(0,242,254,0.04) 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,rgba(0,242,254,0.04) 0,rgba(0,242,254,0.04) 1px,transparent 1px,transparent 40px),#070a10',
                            'z-index:999',
                            'pointer-events:none',
                            'display:flex',
                            'align-items:center',
                            'justify-content:center'
                        ].join(';');
                        overlay.innerHTML = '<span style="font-size:0.6rem;color:#00f2fe;opacity:0.5;letter-spacing:0.3em;font-family:monospace">OFFLINE — TACTICAL GRID MODE</span>';
                        mapContainerRef.current?.appendChild(overlay);
                    }
                });
                tileLayer.addTo(map);

                mapRef.current = map;

                // Double invalidateSize: once immediately, once after paint
                setTimeout(() => map.invalidateSize(), 50);
                setTimeout(() => map.invalidateSize(), 400);
            } else {
                // Tab switch — force size recalc twice
                setTimeout(() => mapRef.current?.invalidateSize(), 50);
                setTimeout(() => mapRef.current?.invalidateSize(), 300);
            }
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'map' && mapRef.current) {
            // Clear existing markers
            mapRef.current.eachLayer((l: any) => { if (l instanceof L.Marker || l instanceof L.Circle) mapRef.current.removeLayer(l); });

            // My location marker
            if (myLocation) {
                L.marker(myLocation, {
                    icon: L.divIcon({ className: 'm-pos', html: `<div class="pulse-marker-me"></div>` })
                }).addTo(mapRef.current).bindPopup('<b>YOU</b>');

                // Coverage radius ring around my node
                L.circle(myLocation, { radius: 500, color: '#00f2fe', fillColor: '#00f2fe', fillOpacity: 0.04, weight: 1, dashArray: '4 6' }).addTo(mapRef.current);
            }

            // Peer nodes
            Object.values(nodes).forEach(n => {
                const statusClass = n.status.toLowerCase();
                L.marker([n.lat, n.lng], {
                    icon: L.divIcon({
                        className: 'p-pos',
                        html: `<div class="pulse-marker-peer ${n.role} ${statusClass}"></div>`
                    })
                }).addTo(mapRef.current).bindPopup(`
                    <div class="map-popup-tactical">
                        <b>${n.id}</b><br/>
                        <span class="status-badge ${statusClass}">STATUS: ${n.status}</span><br/>
                        ${n.vitals ? `<span class="vitals-live">❤️ ${n.vitals} BPM</span>` : ''}
                    </div>
                `);

                // Dead zone heatmap: red ring for CRITICAL nodes
                if (statusClass === 'critical' || statusClass === 'trapped') {
                    L.circle([n.lat, n.lng], { radius: 300, color: '#ff0055', fillColor: '#ff0055', fillOpacity: 0.08, weight: 1, dashArray: '4 4' }).addTo(mapRef.current);
                }

                // Coverage ring per peer
                L.circle([n.lat, n.lng], { radius: 500, color: n.role === 'responder' ? '#4facfe' : '#00ff9d', fillColor: 'transparent', fillOpacity: 0, weight: 0.5, dashArray: '2 8' }).addTo(mapRef.current);
            });
        }
    }, [nodes, myLocation, activeTab]);

    // --- QR SCANNER EFFECT (local npm package, no CDN) ---
    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        if (showScanner) {
            scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 }, false);
            scanner.render((text: string) => connectToPeer(text), () => { });
        }
        return () => { if (scanner) scanner.clear().catch(() => { }); };
    }, [showScanner]);

    // --- RENDER HELPERS ---
    const TabBtn = ({ t, i: Icon }: { t: Tab, i: any }) => (
        <button onClick={() => setActiveTab(t)} className={`nav-item ${activeTab === t ? 'active' : ''}`}>
            <Icon size={22} />
            <span className="nav-label">{t.toUpperCase()}</span>
        </button>
    );

    return (
        <div className="next-gen-ui">
            <div className="glass-frame">

                {/* GLOBAL HEADER */}
                <header className="top-bar">
                    <button onClick={onBack} className="icon-btn-glass"><Navigation size={18} /></button>
                    <div className="system-identity">
                        <h1 className="host-name">{role.toUpperCase()} // {myId || 'OFFLINE'}</h1>
                        <div className="system-status">
                            <span className={`pulse-orb ${connections.length > 0 ? 'active' : ''}`}></span>
                            <span>{status} // {connections.length} PEERS</span>
                            {initialData?.bpm && (
                                <div className="bio-status-badge">
                                    <span className="heart-beat">❤️</span> {initialData.bpm} BPM
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="signal-telemetry">
                        <div className="signal-bars">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className={`bar ${connections.length >= i ? 'active' : ''}`} style={{ height: `${i * 3}px` }} />
                            ))}
                        </div>
                        <button onClick={() => setShowQR(!showQR)} className="icon-btn-minimal"><QrCode size={18} /></button>
                        <button
                            onClick={() => { const v = !ttsEnabled; setTtsEnabled(v); ttsEnabledRef.current = v; }}
                            className={`icon-btn-minimal ${ttsEnabled ? 'tts-on' : ''}`}
                            title={ttsEnabled ? 'TTS: ON — tap to mute' : 'TTS: OFF — tap for audio readout'}
                        ><Volume2 size={18} /></button>
                    </div>
                </header>

                <main className="content-area">
                    {!myId ? (
                        <div className="boot-sequence">
                            <div className="boot-card glass">
                                <Zap className="boot-logo" size={48} />
                                <h2 className="boot-title">INITIALIZE LINK</h2>
                                <p className="boot-step">SELECT OPERATIONAL PROTOCOL</p>

                                <div className="role-grid">
                                    {(['civilian', 'responder', 'drone'] as Role[]).map(r => (
                                        <button key={r} onClick={() => setRole(r)} className={`role-card ${role === r ? 'active' : ''}`}>
                                            {r === 'civilian' && <Shield size={24} />}
                                            {r === 'responder' && <Target size={24} />}
                                            {r === 'drone' && <Globe size={24} />}
                                            <span>{r.toUpperCase()}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className="boot-input-group">
                                    <label>NODE DESIGNATION</label>
                                    <input value={customId} onChange={e => setCustomId(e.target.value.toUpperCase())} />
                                </div>

                                <button className="btn-glow-primary" onClick={async () => {
                                    setStatus('⏳ WAKING SERVER...');
                                    const isLocal = window.location.hostname === 'localhost' || !!window.location.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./);
                                    const peerHost = isLocal ? window.location.hostname : (import.meta.env.VITE_PEER_HOST || 'resqmesh.onrender.com');
                                    const peerPort = isLocal ? 9000 : parseInt(import.meta.env.VITE_PEER_PORT || '443');
                                    const peerPath = import.meta.env.VITE_PEER_PATH || '/peerjs';
                                    const peerSecure = !isLocal;

                                    // Ping server first (wakes Render free tier if sleeping)
                                    if (peerSecure) {
                                        try { await fetch(`https://${peerHost}${peerPath}`, { signal: AbortSignal.timeout(8000) }); } catch { /**/ }
                                    }
                                    setStatus('📡 SYNCING...');

                                    // ICE servers: STUN + free TURN for NAT traversal on mobile networks
                                    // TURN is critical for devices on different 4G/5G carrier networks
                                    const iceServers = peerSecure ? [
                                        { urls: 'stun:stun.l.google.com:19302' },
                                        { urls: 'stun:stun1.l.google.com:19302' },
                                        { urls: 'stun:stun.cloudflare.com:3478' },
                                        // Free TURN relay — handles symmetric NAT (mobile carriers)
                                        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                                        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                                        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
                                    ] : [];

                                    const peer = new Peer(customId, {
                                        host: peerHost, port: peerPort, path: peerPath, secure: peerSecure,
                                        config: { iceServers }
                                    });

                                    // Timeout: if Render is still sleeping / ID already taken
                                    const openTimeout = setTimeout(() => {
                                        if (!peer.id) {
                                            setStatus('⚠️ SERVER SLOW — Render is waking up. Try again in 30s.');
                                            peer.destroy();
                                        }
                                    }, 20000);

                                    peer.on('open', id => {
                                        clearTimeout(openTimeout);
                                        setMyId(id);
                                        setStatus(isLocal ? '🟢 ONLINE — LOCAL MESH' : '🟢 ONLINE — CLOUD MESH');
                                        navigator.geolocation.getCurrentPosition(p => setMyLocation([p.coords.latitude, p.coords.longitude]));
                                    });
                                    peer.on('connection', c => setupConnection(c));
                                    peer.on('error', (e: any) => {
                                        clearTimeout(openTimeout);
                                        console.warn('PeerJS error:', e);
                                        if (e?.type === 'peer-unavailable') setStatus('⚠️ PEER NOT FOUND — Check the ID and ensure they are ONLINE first');
                                        else if (e?.type === 'unavailable-id') setStatus('⚠️ ID TAKEN — Change your Node Designation and retry');
                                        else if (e?.type === 'network') setStatus('⚠️ NETWORK ERROR — Check internet connection');
                                        else setStatus(isLocal ? '⚠️ LOCAL SERVER OFFLINE' : '⚠️ SERVER ERROR — Try again in 30s');
                                    });
                                    peerRef.current = peer;
                                }}>ACTIVATE MESH</button>
                            </div>
                        </div>
                    ) : (
                        <div className="active-view">

                            {/* TAB: CHAT */}
                            <div className="tab-pane-modern chat-pane" style={{ display: activeTab === 'chat' ? 'flex' : 'none' }}>
                                <div className="message-scroller" id="chat-scroll-target">
                                    {messages.map((m, i) => (
                                        <div key={i} className={`msg-block ${m.sender === 'ME' ? 'is-me' : (m.sender === 'SYS' ? 'is-sys' : 'is-peer')}`}>
                                            <div className="msg-meta">{m.sender} // {m.time}</div>
                                            <div className="msg-bubble-modern">{m.text}</div>
                                        </div>
                                    ))}
                                </div>
                                {/* NODE DISCOVERY */}
                                {nearbyPeers.filter(p => !connections.some(c => c.peer === p)).length > 0 && (
                                    <div className="nearby-nodes-bar glass">
                                        <div className="nearby-title">📡 NEARBY NODES ({nearbyPeers.filter(p => !connections.some(c => c.peer === p)).length} detected)</div>
                                        <div className="nearby-list">
                                            {nearbyPeers.filter(p => !connections.some(c => c.peer === p)).map(p => (
                                                <button key={p} className="nearby-peer-btn" onClick={() => { connectToPeer(p); resetDMS(); }}>
                                                    <span className="np-id">{p}</span>
                                                    <span className="np-tap">LINK →</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <form className="input-strip-modern glass" onSubmit={e => {
                                    e.preventDefault();
                                    if (msgInput.trim()) { sendMessage(msgInput.trim()); setMsgInput(''); }
                                }}>
                                    <button type="button" className="icon-btn" onClick={shareLocation}><MapPin size={20} /></button>
                                    <input
                                        type="text"
                                        placeholder="BROADCAST ENCRYPTED PACKET..."
                                        value={msgInput}
                                        onChange={e => setMsgInput(e.target.value)}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        enterKeyHint="send"
                                    />
                                    {/* onPointerDown fires BEFORE input blur on Android — reads msgInput before keyboard dismisses */}
                                    <button
                                        type="submit"
                                        className="icon-btn-action"
                                        onPointerDown={e => {
                                            e.preventDefault(); // stop blur race
                                            if (msgInput.trim()) { sendMessage(msgInput.trim()); setMsgInput(''); }
                                        }}
                                    ><Zap size={20} /></button>
                                </form>
                                <div className="quick-link-bar">
                                    <input value={peerIdInput} onChange={e => setPeerIdInput(e.target.value.toUpperCase())} placeholder="PEER ID" />
                                    <button onClick={() => connectToPeer()}>SYNC</button>
                                    <button onClick={() => setShowScanner(true)} className="icon-btn-glass mini"><Camera size={14} /></button>
                                </div>
                            </div>

                            {/* TAB: RADIO */}
                            <div className="tab-pane-modern radio-pane" style={{ display: activeTab === 'radio' ? 'flex' : 'none' }}>
                                <div className="sonar-container">
                                    <div className={`sonar-waves ${isRecording ? 'recording' : ''}`}>
                                        <div className="w1"></div><div className="w2"></div><div className="w3"></div>
                                    </div>
                                    <button
                                        className={`ptt-massive ${isRecording ? 'active' : ''}`}
                                        onMouseDown={startRecording} onMouseUp={stopRecording}
                                        onTouchStart={startRecording} onTouchEnd={stopRecording}
                                    >
                                        <Mic size={48} />
                                        <span className="ptt-txt">{isRecording ? 'TRANSMITTING' : 'HOLD TO TALK'}</span>
                                    </button>
                                </div>
                                <div className="burst-history glass">
                                    <h3>RECENT BURSTS</h3>
                                    {radioMessages.length === 0 ? <div className="empty-txt">NO BURSTS DETECTED</div> :
                                        radioMessages.map((rm, i) => (
                                            <div key={i} className="burst-row">
                                                <div className="burst-info">{rm.sender} // {rm.time}</div>
                                                <button onClick={() => new Audio(rm.audio).play()}><Volume2 size={16} /></button>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>

                            {/* TAB: MAP - ALWAYS MOUNTED */}
                            <div className="map-view-modern" style={{ display: activeTab === 'map' ? 'flex' : 'none', flex: 1, flexDirection: 'column' }}>
                                <div ref={mapContainerRef} className="map-engine"></div>
                                <div className="map-overlay-stats glass">
                                    <div className="stat-bit"><Globe size={12} /> {myLocation ? `${myLocation[0].toFixed(3)},${myLocation[1].toFixed(3)}` : 'GPS OFF'}</div>
                                    <div className="stat-bit"><Layers size={12} /> {Object.keys(nodes).length + 1} ACTIVE NODES</div>
                                </div>
                            </div>

                            {/* TAB: RESOURCES */}
                            <div className="tab-pane-modern resource-pane" style={{ display: activeTab === 'resources' ? 'flex' : 'none' }}>
                                <div className="action-row">
                                    <button className="glass-action-btn" onClick={() => { const i = prompt('REQ ITEM?'); if (i) postResource('request', i); }}>+ REQUEST</button>
                                    <button className="glass-action-btn" onClick={() => { const i = prompt('OFFER ITEM?'); if (i) postResource('offer', i); }}>+ OFFER</button>
                                </div>
                                <div className="resource-boards">
                                    {resources.length === 0 ? <div className="empty-txt">BOARD CLEAR</div> :
                                        resources.map(r => (
                                            <div key={r.id} className={`res-card-modern ${r.type}`}>
                                                <div className="res-h"><span>{r.type.toUpperCase()}</span> <i>{r.time}</i></div>
                                                <div className="res-b">{r.item}</div>
                                                <div className="res-f">ORIGIN: {r.node}</div>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>

                            {/* TAB: TACTICAL / SOS */}
                            <div className="tab-pane-modern tactical-pane" style={{ display: activeTab === 'tactical' ? 'flex' : 'none' }}>
                                {role === 'responder' ? (
                                    <div className="alerts-scroller">
                                        <h2 className="pane-h">PRIORITY OVERRIDE</h2>
                                        {alerts.length === 0 ? <div className="empty-txt">SPECTRUM CLEAR</div> :
                                            alerts.map(a => (
                                                <div key={a.id} className={`alert-card-modern ${a.assigned ? 'done' : ''}`}>
                                                    <div className="a-top"><AlertTriangle size={18} /> {a.status}</div>
                                                    <div className="a-mid">LOC: {a.location} // {a.time}</div>
                                                    <div className="a-node">NODE: {a.node}</div>
                                                    <button disabled={a.assigned} onClick={() => {
                                                        setAlerts(prev => prev.map(pa => pa.id === a.id ? { ...pa, assigned: true } : pa));
                                                        sendMessage(`ACKNOWLEDGING ${a.node}: RESPONDER EN ROUTE`);
                                                        setActiveTab('map');
                                                    }}>{a.assigned ? 'MISSION ACCEPTED' : 'INTERCEPT'}</button>
                                                </div>
                                            ))
                                        }
                                    </div>
                                ) : (
                                    <>
                                        {/* DEAD MAN'S SWITCH PANEL */}
                                        <div className="dms-ctl glass">
                                            <div className="dms-ctl-row">
                                                <div>
                                                    <div className="dms-ctl-title">💀 Dead Man's Switch</div>
                                                    <div className="dms-ctl-sub">{dmsEnabled ? `${Math.floor(dmsCountdown / 60)}m ${dmsCountdown % 60}s remaining` : 'Auto-MAYDAY if you go silent'}</div>
                                                </div>
                                                <button className={`dms-arm-btn ${dmsEnabled ? 'armed' : ''}`} onClick={() => { setDmsEnabled(v => !v); resetDMS(); }}>
                                                    {dmsEnabled ? '⚡ ARMED' : 'ARM'}
                                                </button>
                                            </div>
                                            {dmsEnabled && (
                                                <select className="dms-sel" value={dmsTimeoutMin} onChange={e => { setDmsTimeoutMin(Number(e.target.value)); resetDMS(); }}>
                                                    <option value={1}>1 min (test)</option>
                                                    <option value={5}>5 min</option>
                                                    <option value={10}>10 min</option>
                                                    <option value={15}>15 min</option>
                                                    <option value={30}>30 min</option>
                                                </select>
                                            )}
                                        </div>
                                        <div className="sos-center">
                                            <div className="sos-shield">
                                                <Shield size={60} className="sos-sh-i" />
                                            </div>
                                            <h2 className="sos-t">EMERGENCY BURST</h2>
                                            <p className="sos-sub">BROADCASTING TO ALL RESPONDERS IN RANGE</p>
                                            <div className="sos-options">
                                                <button onClick={() => sendTriageUpdate('critical')} className="sos-btn critical">CRITICAL / TRAPPED</button>
                                                <button onClick={() => sendTriageUpdate('injured')} className="sos-btn injured">MEDICAL REQ</button>
                                                <button onClick={() => sendTriageUpdate('ok')} className="sos-btn ok">REPORT NOMINAL</button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* TAB: DIRECT — Server-Free WebRTC via QR SDP */}
                            <div className="tab-pane-modern direct-pane" style={{ display: activeTab === 'direct' ? 'flex' : 'none' }}>
                                <div className="direct-header">
                                    <div className="direct-badge">
                                        <Zap size={14} />
                                        SERVER-FREE DIRECT MODE
                                    </div>
                                    <p className="direct-sub">Zero server. Zero internet. Pure WebRTC via QR handshake.</p>
                                </div>

                                {directMode === 'connected' ? (
                                    <div className="direct-connected">
                                        <div className="direct-ok-ring"><Zap size={40} className="direct-zap" /></div>
                                        <h3>DIRECT LINK ACTIVE</h3>
                                        <p>No server. No internet. Pure P2P.</p>
                                        <div className="input-strip-modern glass" style={{ margin: '16px 0' }}>
                                            <input placeholder="Send direct message..." onKeyDown={e => { if (e.key === 'Enter') { sendDirectMessage(e.currentTarget.value); e.currentTarget.value = ''; } }} />
                                            <button className="icon-btn-action" onClick={() => { }}><Zap size={16} /></button>
                                        </div>
                                    </div>
                                ) : directMode === 'idle' ? (
                                    <div className="direct-idle">
                                        <h3>HOW IT WORKS</h3>
                                        <div className="direct-steps">
                                            <div className="d-step"><span className="d-num">1</span><span>Device A: Generate Offer QR</span></div>
                                            <div className="d-step"><span className="d-num">2</span><span>Device B: Scan Offer → Generate Answer QR</span></div>
                                            <div className="d-step"><span className="d-num">3</span><span>Device A: Scan Answer → Connected!</span></div>
                                        </div>
                                        <div className="direct-btns">
                                            <button className="sos-btn ok" style={{ marginBottom: 0 }} onClick={generateOffer}>📡 I AM INITIATOR (Generate Offer)</button>
                                            <button className="sos-btn injured" style={{ marginBottom: 0, color: '#000' }} onClick={() => setDirectMode('answering')}>📥 I RECEIVED AN OFFER (Paste & Answer)</button>
                                        </div>
                                    </div>
                                ) : directMode === 'waiting-answer' ? (
                                    <div className="direct-qr-view">
                                        <p className="d-inst">📱 Show this QR to the other device. They scan it and send back an Answer QR.</p>
                                        {directQR && <img src={directQR} className="direct-qr-img" alt="Offer QR" />}
                                        <p className="d-smalltxt">Step 3: After they scan, paste their ANSWER below:</p>
                                        <textarea
                                            className="direct-textarea"
                                            placeholder="Paste Answer SDP JSON here..."
                                            value={directOfferInput}
                                            onChange={e => setDirectOfferInput(e.target.value)}
                                        />
                                        <button className="sos-btn ok" style={{ marginBottom: 0 }} onClick={completeHandshake}>✅ COMPLETE HANDSHAKE</button>
                                    </div>
                                ) : directMode === 'answering' ? (
                                    <div className="direct-qr-view">
                                        <p className="d-inst">📎 Paste the Offer SDP from the initiator device below:</p>
                                        <textarea
                                            className="direct-textarea"
                                            placeholder="Paste Offer SDP JSON here..."
                                            value={directOfferInput}
                                            onChange={e => setDirectOfferInput(e.target.value)}
                                        />
                                        <button className="sos-btn ok" style={{ marginBottom: 12 }} onClick={generateAnswer}>📡 GENERATE ANSWER</button>
                                        {directQR && (
                                            <>
                                                <p className="d-smalltxt">Show this Answer QR to the initiator:</p>
                                                <img src={directQR} className="direct-qr-img" alt="Answer QR" />
                                            </>
                                        )}
                                    </div>
                                ) : null}
                            </div>

                        </div>
                    )}
                </main>

                {/* SYSTEM INTELLIGENCE TICKER */}
                {
                    myId && (
                        <div className="system-ticker-live glass">
                            <div className="ticker-track">
                                <span>[ MESH LAYER ENCRYPTED ]</span>
                                <span>[ BIOMETRIC SYNC: {initialData?.bpm || '--'} BPM ]</span>
                                <span>[ GPS SIGNAL: LOCK ]</span>
                                <span>[ P2P LATENCY: 12ms ]</span>
                                <span>[ PACKET LOSS: 0.1% ]</span>
                                <span>[ ENTROPY: 0.14 ]</span>
                                <span>[ MESH LAYER ENCRYPTED ]</span>
                                <span>[ BIOMETRIC SYNC: {initialData?.bpm || '--'} BPM ]</span>
                            </div>
                        </div>
                    )
                }

                {/* MODALS */}
                {
                    showQR && (
                        <div className="modal-overlay glass" onClick={() => setShowQR(false)}>
                            <div className="modal-content glass" onClick={e => e.stopPropagation()}>
                                <div className="m-header"><span>NODE PASSKEY</span> <X size={20} onClick={() => setShowQR(false)} /></div>
                                <div className="qr-box">
                                    {/* QR generated locally — no internet API call */}
                                    {qrDataUrl
                                        ? <img src={qrDataUrl} alt="QR" width={200} height={200} />
                                        : <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '0.7rem' }}>GENERATING...</div>
                                    }
                                </div>
                                <h2 className="qr-id">{myId}</h2>
                                <p className="qr-sub">📡 LOCAL MESH — No internet needed. Scan to link node.</p>
                                <p className="qr-sub" style={{ color: '#00f2fe', fontSize: '0.6rem', marginTop: 4 }}>SERVER: {import.meta.env.VITE_PEER_HOST || 'resqmesh.onrender.com'}</p>
                            </div>
                        </div>
                    )
                }

                {
                    showScanner && (
                        <div className="modal-overlay glass">
                            <div className="modal-content scanner-m glass">
                                <div className="m-header"><span>LINK SCANNER</span> <X size={20} onClick={() => setShowScanner(false)} /></div>
                                <div id="qr-reader" className="qr-scanner-target"></div>
                                <button className="btn-cancel" onClick={() => setShowScanner(false)}>CANCEL</button>
                            </div>
                        </div>
                    )
                }

                {/* GLOBAL NAV */}
                {
                    myId && (
                        <nav className="bottom-bar-modern glass">
                            <TabBtn t="chat" i={MessageSquare} />
                            <TabBtn t="radio" i={Radio} />
                            <TabBtn t="map" i={Globe} />
                            <TabBtn t="resources" i={Package} />
                            <TabBtn t="tactical" i={Shield} />
                            <TabBtn t="direct" i={Zap} />
                        </nav>
                    )
                }

            </div >

            <style>{`
                :root {
                    --bg: #07090F;
                    --surface: rgba(255,255,255,0.04);
                    --surface-2: rgba(255,255,255,0.07);
                    --surface-solid: #0E1117;
                    --border: rgba(255,255,255,0.09);
                    --border-bright: rgba(255,255,255,0.14);
                    --text: #E8EDF8;
                    --text-2: #94A3B8;
                    --text-3: #475569;
                    --blue: #3B82F6;
                    --blue-light: rgba(59,130,246,0.12);
                    --blue-dark: #1D4ED8;
                    --blue-glow: rgba(59,130,246,0.35);
                    --red: #EF4444;
                    --red-light: rgba(239,68,68,0.12);
                    --green: #10B981;
                    --green-light: rgba(16,185,129,0.12);
                    --amber: #F59E0B;
                    --amber-light: rgba(245,158,11,0.12);
                    --purple: #8B5CF6;
                    --shadow: 0 4px 24px rgba(0,0,0,0.40);
                    --shadow-lg: 0 12px 40px rgba(0,0,0,0.55);
                    --trans: all 0.22s cubic-bezier(0.4,0,0.2,1);
                }

                * { box-sizing: border-box; }

                .next-gen-ui {
                    position: fixed; inset: 0;
                    background: var(--bg);
                    font-family: 'Outfit', 'Inter', sans-serif;
                    color: var(--text);
                    display: flex; align-items: center; justify-content: center;
                    overflow: hidden; z-index: 2000;
                }
                /* Ambient glow orbs behind the frame */
                .next-gen-ui::before {
                    content: ''; position: fixed;
                    top: -30%; left: 50%; transform: translateX(-50%);
                    width: 700px; height: 500px;
                    background: radial-gradient(ellipse, rgba(59,130,246,0.10) 0%, transparent 65%);
                    pointer-events: none;
                }
                .next-gen-ui::after {
                    content: ''; position: fixed;
                    bottom: -10%; left: 50%; transform: translateX(-50%);
                    width: 600px; height: 400px;
                    background: radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 65%);
                    pointer-events: none;
                }

                .glass-frame {
                    width: 100%; max-width: 480px; height: 100vh;
                    background: #08090F;
                    display: flex; flex-direction: column;
                    border-left: 1px solid var(--border);
                    border-right: 1px solid var(--border);
                    position: relative; overflow: hidden;
                }

                /* ── TOP BAR ── */
                .top-bar {
                    padding: 14px 20px;
                    display: flex; align-items: center; justify-content: space-between;
                    background: rgba(255,255,255,0.03);
                    backdrop-filter: blur(24px);
                    border-bottom: 1px solid var(--border);
                    z-index: 10;
                }
                .system-identity { text-align: center; flex: 1; }
                .host-name { font-size: 0.76rem; font-weight: 800; letter-spacing: 0.10em; color: #60A5FA; margin: 0; text-shadow: 0 0 16px rgba(96,165,250,0.50); }
                .system-status { font-size: 0.58rem; color: var(--text-3); display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 3px; }
                .pulse-orb { width: 6px; height: 6px; background: var(--border); border-radius: 50%; }
                .pulse-orb.active { background: var(--green); box-shadow: 0 0 10px var(--green); animation: orbPulse 1.5s infinite; }
                @keyframes orbPulse { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.5);opacity:1} }

                .bio-status-badge { margin-left: 8px; background: var(--red-light); padding: 3px 9px; border-radius: 20px; border: 1px solid rgba(239,68,68,0.28); color: #F87171; font-weight: 700; display: flex; align-items: center; gap: 4px; font-size: 0.6rem; box-shadow: 0 0 12px rgba(239,68,68,0.15); }
                .heart-beat { animation: h-beat 0.8s infinite; display: inline-block; }
                @keyframes h-beat { 0%,100%{transform:scale(1)} 50%{transform:scale(1.25)} }
                .signal-telemetry { display: flex; align-items: center; gap: 10px; }
                .signal-bars { display: flex; align-items: flex-end; gap: 2px; }
                .signal-bars .bar { width: 3px; background: var(--border); border-radius: 1px; }
                .signal-bars .bar.active { background: var(--blue); box-shadow: 0 0 6px var(--blue); }
                .icon-btn-minimal { background: none; border: none; color: var(--text-3); cursor: pointer; padding: 4px; border-radius: 8px; transition: var(--trans); }
                .icon-btn-minimal:hover { background: var(--surface-2); color: var(--text); }
                .icon-btn-glass { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); padding: 8px; border-radius: 12px; cursor: pointer; transition: var(--trans); }
                .icon-btn-glass:hover { background: var(--blue-light); border-color: rgba(59,130,246,0.40); color: #60A5FA; box-shadow: 0 0 16px var(--blue-glow); }
                .icon-btn-glass.mini { padding: 4px 10px; }

                /* ── BOOT / SETUP ── */
                .boot-sequence { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--bg); }
                .boot-card { width: 100%; padding: 36px 24px; text-align: center; border-radius: 28px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-lg); animation: fadeUp 0.5s ease-out; backdrop-filter: blur(20px); }
                @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
                .boot-logo { color: #60A5FA; margin-bottom: 20px; filter: drop-shadow(0 0 20px rgba(96,165,250,0.60)); }
                .boot-title { font-size: 1.4rem; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.02em; color: var(--text); }
                .boot-step { font-size: 0.6rem; color: var(--text-3); letter-spacing: 0.28em; margin-bottom: 36px; text-transform: uppercase; }

                .role-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 28px; }
                .role-card { background: var(--surface); border: 1.5px solid var(--border); padding: 18px 8px; border-radius: 18px; color: var(--text-3); display: flex; flex-direction: column; align-items: center; gap: 10px; cursor: pointer; transition: var(--trans); }
                .role-card span { font-size: 0.58rem; font-weight: 800; letter-spacing: 0.12em; }
                .role-card.active { border-color: rgba(59,130,246,0.50); background: var(--blue-light); color: #60A5FA; box-shadow: 0 0 0 3px rgba(59,130,246,0.12), 0 0 24px rgba(59,130,246,0.20); }
                .role-card:hover:not(.active) { border-color: var(--border-bright); background: var(--surface-2); color: var(--text-2); }

                .boot-input-group { text-align: left; margin-bottom: 24px; }
                .boot-input-group label { font-size: 0.6rem; font-weight: 700; color: var(--text-3); margin-left: 4px; letter-spacing: 0.12em; text-transform: uppercase; }
                .boot-input-group input { width: 100%; background: var(--surface-2); border: 1.5px solid var(--border); padding: 14px 16px; border-radius: 14px; color: var(--text); font-size: 1.1rem; font-weight: 700; margin-top: 6px; font-family: 'JetBrains Mono', monospace; transition: var(--trans); }
                .boot-input-group input:focus { border-color: rgba(59,130,246,0.55); box-shadow: 0 0 0 3px rgba(59,130,246,0.10), 0 0 20px rgba(59,130,246,0.12); outline: none; }

                .btn-glow-primary { width: 100%; padding: 16px; border-radius: 16px; border: none; background: linear-gradient(135deg, #3B82F6, #6366F1); color: #fff; font-weight: 800; font-size: 0.9rem; letter-spacing: 0.06em; cursor: pointer; transition: var(--trans); box-shadow: 0 6px 24px rgba(99,102,241,0.45); }
                .btn-glow-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 36px rgba(99,102,241,0.60); }
                .btn-glow-primary:active { transform: translateY(0); }

                /* ── CONTENT ── */
                .content-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                .active-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                .tab-pane-modern { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 18px; gap: 0; scrollbar-width: none; }
                .tab-pane-modern::-webkit-scrollbar { display: none; }

                /* ── CHAT ── */
                .message-scroller { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding-bottom: 16px; scrollbar-width: none; }
                .message-scroller::-webkit-scrollbar { display: none; }
                .msg-block { max-width: 82%; }
                .msg-block.is-me { align-self: flex-end; }
                .msg-block.is-peer { align-self: flex-start; }
                .msg-block.is-sys { align-self: center; width: 100%; text-align: center; }
                .msg-meta { font-size: 0.52rem; color: var(--text-3); margin-bottom: 4px; letter-spacing: 0.07em; padding: 0 4px; }
                .msg-bubble-modern { padding: 10px 14px; border-radius: 18px; font-size: 0.87rem; line-height: 1.50; }
                .is-me .msg-bubble-modern { background: linear-gradient(135deg, #3B82F6, #6366F1); color: #fff; border-bottom-right-radius: 4px; font-weight: 500; box-shadow: 0 4px 16px rgba(99,102,241,0.35); }
                .is-peer .msg-bubble-modern { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-bottom-left-radius: 4px; }
                .is-sys .msg-bubble-modern { background: var(--blue-light); color: #60A5FA; font-size: 0.62rem; border-radius: 8px; padding: 6px 12px; font-weight: 600; letter-spacing: 0.05em; border: 1px solid rgba(59,130,246,0.25); }

                .input-strip-modern { margin: 0 0 10px; padding: 5px; display: flex; align-items: center; gap: 8px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface-2); transition: var(--trans); }
                .input-strip-modern:focus-within { border-color: rgba(59,130,246,0.45); box-shadow: 0 0 0 3px rgba(59,130,246,0.08), 0 0 20px rgba(59,130,246,0.12); }
                .input-strip-modern input { flex: 1; background: transparent; border: none; color: var(--text); padding: 8px; font-size: 0.85rem; outline: none; }
                .input-strip-modern input::placeholder { color: var(--text-3); }
                .icon-btn { background: none; border: none; color: var(--text-3); padding: 8px; cursor: pointer; transition: var(--trans); border-radius: 8px; }
                .icon-btn:hover { color: #60A5FA; background: var(--blue-light); }
                .icon-btn-action { background: linear-gradient(135deg, #3B82F6, #6366F1); color: #fff; padding: 10px; border-radius: 50%; border: none; cursor: pointer; transition: var(--trans); box-shadow: 0 4px 16px rgba(99,102,241,0.45); }
                .icon-btn-action:hover { box-shadow: 0 6px 24px rgba(99,102,241,0.65); transform: scale(1.05); }

                .quick-link-bar { padding: 10px 16px; display: flex; gap: 8px; background: var(--surface); border-top: 1px solid var(--border); }
                .quick-link-bar input { flex: 1; background: var(--surface-2); border: 1px solid var(--border); padding: 9px 12px; border-radius: 10px; color: var(--text); font-size: 0.72rem; font-family: monospace; transition: var(--trans); }
                .quick-link-bar input:focus { border-color: rgba(59,130,246,0.45); outline: none; }
                .quick-link-bar button { padding: 0 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); font-size: 0.72rem; font-weight: 700; cursor: pointer; transition: var(--trans); }
                .quick-link-bar button:hover { background: var(--blue); color: #fff; border-color: var(--blue); box-shadow: 0 0 16px rgba(59,130,246,0.35); }

                /* ── RADIO ── */
                .radio-pane { align-items: center; justify-content: center; }
                .sonar-container { position: relative; width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; }
                .sonar-waves div { position: absolute; inset: 0; border: 1.5px solid rgba(59,130,246,0.25); border-radius: 50%; opacity: 0; }
                .recording.sonar-waves div { animation: sonarRipple 2s infinite; border-color: rgba(239,68,68,0.50); }
                @keyframes sonarRipple { 0%{transform:scale(0.6);opacity:0.8} 100%{transform:scale(1.7);opacity:0} }
                .w1{animation-delay:0s}.w2{animation-delay:0.6s}.w3{animation-delay:1.2s}
                .ptt-massive { width: 140px; height: 140px; border-radius: 50%; border: 1.5px solid var(--border); background: var(--surface-2); color: var(--text-2); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; z-index: 10; cursor: pointer; transition: var(--trans); box-shadow: var(--shadow-lg); }
                .ptt-massive:hover { border-color: rgba(59,130,246,0.45); color: #60A5FA; box-shadow: 0 0 32px rgba(59,130,246,0.25); transform: scale(1.03); }
                .ptt-massive.active { background: linear-gradient(135deg, #EF4444, #DC2626); color: #fff; border-color: #EF4444; transform: scale(0.95); box-shadow: 0 0 50px rgba(239,68,68,0.55); }
                .ptt-txt { font-size: 0.56rem; font-weight: 800; letter-spacing: 0.12em; }
                .burst-history { width: 100%; margin-top: 32px; padding: 20px; border-radius: 20px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow); }
                .burst-history h3 { font-size: 0.6rem; color: var(--text-3); margin: 0 0 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 800; }
                .burst-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 12px; background: var(--surface-2); margin-bottom: 8px; border: 1px solid var(--border); }
                .burst-info { font-size: 0.72rem; color: var(--text-2); }
                .burst-row button { background: var(--blue-light); border: 1px solid rgba(59,130,246,0.25); color: #60A5FA; border-radius: 8px; padding: 4px 10px; cursor: pointer; transition: var(--trans); }
                .burst-row button:hover { background: var(--blue); color: #fff; box-shadow: 0 0 12px rgba(59,130,246,0.35); }

                /* ── MAP ── */
                .map-view-modern { flex: 1; position: relative; width: 100%; height: 100%; }
                .map-engine { width: 100%; height: 100%; min-height: 400px; }
                .map-overlay-stats { position: absolute; top: 14px; left: 14px; padding: 10px 14px; border-radius: 14px; display: flex; flex-direction: column; gap: 6px; z-index: 1000; background: rgba(8,9,15,0.80); backdrop-filter: blur(20px); border: 1px solid var(--border); box-shadow: var(--shadow); }
                .stat-bit { font-size: 0.62rem; color: var(--text-2); display: flex; align-items: center; gap: 8px; font-weight: 600; }
                .m-pos,.p-pos { width: 24px; height: 24px; }
                .pulse-marker-me { width: 16px; height: 16px; background: var(--blue); border-radius: 50%; border: 2px solid rgba(255,255,255,0.20); box-shadow: 0 0 16px rgba(59,130,246,0.80); animation: orbPulse 1.5s infinite; }
                .pulse-marker-peer { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.20); box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
                .pulse-marker-peer.responder { background: var(--blue); }
                .pulse-marker-peer.drone { background: var(--amber); border-radius: 2px; transform: rotate(45deg); }
                .pulse-marker-peer.civilian { background: var(--green); }
                .pulse-marker-peer.critical { background: var(--red) !important; box-shadow: 0 0 20px rgba(239,68,68,0.80); animation: orbPulse 0.4s infinite !important; }
                .pulse-marker-peer.trapped { background: var(--amber) !important; box-shadow: 0 0 14px rgba(245,158,11,0.70); animation: orbPulse 0.8s infinite !important; }
                .status-badge.critical { color: var(--red); font-weight: 800; }
                .status-badge.trapped { color: var(--amber); font-weight: 800; }
                .map-popup-tactical { font-family: 'Outfit', sans-serif; font-size: 0.85rem; color: var(--text); text-align: center; line-height: 1.5; padding: 4px; }
                .map-popup-tactical b { font-size: 0.9rem; color: #60A5FA; letter-spacing: 0.03em; margin-bottom: 4px; display: block; }
                .vitals-live { display: block; margin-top: 6px; color: #F87171; font-weight: 800; animation: v-flash 1s infinite; font-size: 0.9rem; }
                @keyframes v-flash { 0%,100%{opacity:0.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
                .leaflet-popup-content-wrapper { background: rgba(8,9,15,0.95) !important; color: var(--text) !important; border: 1px solid var(--border); border-radius: 14px !important; box-shadow: 0 0 32px rgba(59,130,246,0.20), var(--shadow-lg) !important; }
                .leaflet-popup-tip { background: rgba(8,9,15,0.95) !important; }
                .leaflet-popup-content { margin: 12px 16px !important; }
                .leaflet-container a.leaflet-popup-close-button { color: var(--text-3) !important; padding: 8px !important; }

                /* ── RESOURCES ── */
                .action-row { display: flex; gap: 10px; margin-bottom: 20px; }
                .glass-action-btn { flex: 1; padding: 14px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); font-size: 0.78rem; font-weight: 700; cursor: pointer; transition: var(--trans); }
                .glass-action-btn:hover { border-color: rgba(59,130,246,0.45); background: var(--blue-light); color: #60A5FA; box-shadow: 0 0 20px rgba(59,130,246,0.15); }
                .res-card-modern { padding: 14px 16px; border-radius: 16px; background: var(--surface-2); border: 1px solid var(--border); margin-bottom: 10px; }
                .res-h { display: flex; justify-content: space-between; font-size: 0.58rem; margin-bottom: 8px; color: var(--text-3); font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase; }
                .res-b { font-size: 0.9rem; font-weight: 600; margin-bottom: 4px; color: var(--text); }
                .res-f { font-size: 0.62rem; color: var(--text-3); font-family: monospace; }
                .res-card-modern.request { border-left: 3px solid var(--red); }
                .res-card-modern.offer { border-left: 3px solid var(--green); }
                .resource-boards { flex: 1; overflow-y: auto; }

                /* ── TACTICAL ── */
                .sos-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px 0; }
                .sos-shield { width: 110px; height: 110px; border: 1.5px solid rgba(239,68,68,0.35); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; background: var(--red-light); box-shadow: 0 0 32px rgba(239,68,68,0.20); }
                .sos-sh-i { color: #F87171; filter: drop-shadow(0 0 14px rgba(239,68,68,0.55)); }
                .sos-t { font-size: 1.1rem; font-weight: 800; margin-bottom: 6px; color: var(--text); letter-spacing: -0.01em; }
                .sos-sub { font-size: 0.75rem; color: var(--text-3); margin-bottom: 24px; }
                .sos-options { width: 100%; display: flex; flex-direction: column; gap: 10px; }
                .sos-btn { width: 100%; padding: 16px; border-radius: 16px; margin: 0; border: none; font-weight: 700; font-size: 0.88rem; cursor: pointer; transition: var(--trans); letter-spacing: 0.03em; }
                .sos-btn.critical { background: linear-gradient(135deg, #EF4444, #DC2626); color: #fff; box-shadow: 0 6px 20px rgba(239,68,68,0.40); }
                .sos-btn.critical:hover { box-shadow: 0 8px 28px rgba(239,68,68,0.60); transform: translateY(-1px); }
                .sos-btn.injured { background: linear-gradient(135deg, #F59E0B, #D97706); color: #fff; box-shadow: 0 6px 20px rgba(245,158,11,0.35); }
                .sos-btn.injured:hover { box-shadow: 0 8px 28px rgba(245,158,11,0.55); transform: translateY(-1px); }
                .sos-btn.ok { background: linear-gradient(135deg, #10B981, #059669); color: #fff; box-shadow: 0 6px 20px rgba(16,185,129,0.35); }
                .sos-btn.ok:hover { box-shadow: 0 8px 28px rgba(16,185,129,0.55); transform: translateY(-1px); }
                .alerts-scroller { width: 100%; overflow-y: auto; }
                .pane-h { font-size: 0.68rem; font-weight: 800; letter-spacing: 0.18em; color: var(--text-3); text-transform: uppercase; margin: 0 0 16px; }
                .alert-card-modern { padding: 14px 16px; border-radius: 18px; background: var(--red-light); border: 1px solid rgba(239,68,68,0.25); margin-bottom: 12px; }
                .alert-card-modern.done { opacity: 0.7; border-color: rgba(16,185,129,0.25); background: var(--green-light); }
                .alert-card-modern .a-top { font-size: 0.8rem; font-weight: 800; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; color: #F87171; }
                .alert-card-modern.done .a-top { color: #34D399; }
                .alert-card-modern .a-mid { font-size: 0.72rem; margin-bottom: 4px; color: var(--text-2); }
                .alert-card-modern .a-node { font-size: 0.62rem; font-family: monospace; margin-bottom: 10px; color: var(--text-3); }
                .alert-card-modern button { width: 100%; padding: 10px; border-radius: 12px; border: none; background: linear-gradient(135deg, #EF4444, #DC2626); color: #fff; font-weight: 700; cursor: pointer; transition: var(--trans); font-size: 0.8rem; box-shadow: 0 4px 12px rgba(239,68,68,0.35); }
                .alert-card-modern button:hover { box-shadow: 0 6px 20px rgba(239,68,68,0.55); transform: translateY(-1px); }
                .alert-card-modern.done button { background: linear-gradient(135deg, #10B981, #059669); box-shadow: 0 4px 12px rgba(16,185,129,0.30); }

                /* ── MODALS ── */
                .modal-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 3000; background: rgba(0,0,0,0.75); backdrop-filter: blur(12px); }
                .modal-content { width: 100%; max-width: 360px; padding: 28px; border-radius: 28px; text-align: center; background: #0E1117; border: 1px solid var(--border); box-shadow: 0 0 60px rgba(59,130,246,0.12), var(--shadow-lg); }
                .m-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; font-weight: 800; margin-bottom: 20px; color: var(--text); }
                .qr-box { background: rgba(255,255,255,0.06); padding: 12px; border-radius: 16px; display: inline-block; margin-bottom: 14px; border: 1px solid var(--border); }
                .qr-id { font-size: 1.3rem; font-weight: 800; color: #60A5FA; margin: 0; text-shadow: 0 0 20px rgba(96,165,250,0.45); }
                .qr-sub { font-size: 0.7rem; color: var(--text-3); margin-top: 6px; }
                .qr-scanner-target { width: 100%; aspect-ratio: 1; border-radius: 16px; overflow: hidden; background: #000; margin-bottom: 16px; }
                .btn-cancel { width: 100%; padding: 14px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); border-radius: 14px; font-weight: 700; cursor: pointer; transition: var(--trans); font-size: 0.85rem; }
                .btn-cancel:hover { background: var(--red-light); border-color: rgba(239,68,68,0.30); color: #F87171; }
                .scanner-m { padding: 20px; }

                /* ── BOTTOM NAV ── */
                .bottom-bar-modern {
                    padding: 10px 12px 28px;
                    display: flex; justify-content: space-around;
                    background: rgba(8,9,15,0.92);
                    backdrop-filter: blur(24px);
                    border-top: 1px solid var(--border);
                    box-shadow: 0 -8px 32px rgba(0,0,0,0.30);
                }
                .nav-item { background: none; border: none; color: var(--text-3); display: flex; flex-direction: column; align-items: center; gap: 5px; cursor: pointer; transition: var(--trans); padding: 8px 10px; border-radius: 14px; min-width: 44px; }
                .nav-item:hover { background: var(--surface-2); color: var(--text-2); }
                .nav-item.active { color: #60A5FA; background: var(--blue-light); box-shadow: 0 0 20px rgba(59,130,246,0.20); }
                .nav-label { font-size: 0.46rem; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; }

                /* ── TICKER ── */
                .system-ticker-live { height: 26px; background: rgba(59,130,246,0.06); border-top: 1px solid rgba(59,130,246,0.15); border-bottom: 1px solid rgba(59,130,246,0.15); display: flex; align-items: center; overflow: hidden; font-size: 0.56rem; color: #60A5FA; white-space: nowrap; letter-spacing: 0.10em; font-weight: 600; }
                .ticker-track { display: flex; gap: 60px; animation: tickerMove 20s linear infinite; padding-left: 20px; }
                @keyframes tickerMove { from{transform:translateX(0)} to{transform:translateX(-50%)} }

                /* ── EMPTY STATE ── */
                .empty-txt { text-align: center; font-size: 0.72rem; color: var(--text-3); padding: 40px 0; font-weight: 600; }

                /* ── DIRECT MODE ── */
                .direct-pane { flex-direction: column; gap: 14px; }
                .direct-header { text-align: center; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
                .direct-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--amber-light); border: 1px solid rgba(245,158,11,0.30); color: #FCD34D; padding: 6px 14px; border-radius: 20px; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
                .direct-sub { font-size: 0.72rem; color: var(--text-3); margin-top: 8px; line-height: 1.55; }
                .direct-steps { display: flex; flex-direction: column; gap: 8px; margin: 14px 0; }
                .d-step { display: flex; align-items: center; gap: 12px; background: var(--surface-2); border: 1px solid var(--border); padding: 12px 14px; border-radius: 14px; font-size: 0.8rem; color: var(--text-2); }
                .d-num { width: 26px; height: 26px; border-radius: 50%; background: var(--amber-light); border: 1.5px solid rgba(245,158,11,0.35); display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; color: #FCD34D; flex-shrink: 0; }
                .direct-btns { display: flex; flex-direction: column; gap: 10px; margin-top: 6px; }
                .direct-idle h3 { font-size: 0.66rem; color: #FCD34D; letter-spacing: 0.22em; margin-bottom: 4px; text-transform: uppercase; }
                .direct-qr-view { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; }
                .d-inst { font-size: 0.78rem; color: var(--text-2); text-align: center; line-height: 1.55; }
                .d-smalltxt { font-size: 0.65rem; color: #FCD34D; letter-spacing: 0.08em; font-weight: 600; }
                .direct-qr-img { border-radius: 16px; border: 2px solid rgba(245,158,11,0.40); box-shadow: 0 0 32px rgba(245,158,11,0.20); width: 220px; height: 220px; object-fit: contain; }
                .direct-textarea { width: 100%; height: 80px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; color: var(--text); padding: 10px; font-size: 0.65rem; font-family: monospace; resize: none; transition: var(--trans); }
                .direct-textarea:focus { outline: none; border-color: rgba(59,130,246,0.45); box-shadow: 0 0 0 3px rgba(59,130,246,0.08); }
                .direct-connected { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
                .direct-ok-ring { width: 90px; height: 90px; border-radius: 50%; border: 2px solid rgba(16,185,129,0.45); display: flex; align-items: center; justify-content: center; background: var(--green-light); box-shadow: 0 0 32px rgba(16,185,129,0.25); animation: fadeUp 0.5s ease-out; }
                .direct-zap { color: #34D399; filter: drop-shadow(0 0 12px rgba(16,185,129,0.70)); }
                .direct-connected h3 { font-size: 1.1rem; font-weight: 800; color: #34D399; }
                .direct-connected p { font-size: 0.75rem; color: var(--text-3); }

                @keyframes bootFade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
                .glass { background: var(--surface); border: 1px solid var(--border); }

                /* ── TTS TOGGLE ── */
                .tts-on { color: var(--green) !important; background: var(--green-light) !important;
                    box-shadow: 0 0 14px rgba(16,185,129,0.35); border-radius: 8px; }

                /* ── NODE DISCOVERY ── */
                .nearby-nodes-bar { margin: 0 0 10px; padding: 12px 14px; border-radius: 16px; }
                .nearby-title { font-size: 0.58rem; font-weight: 800; color: #60A5FA; letter-spacing: 0.14em;
                    text-transform: uppercase; margin-bottom: 8px; }
                .nearby-list { display: flex; flex-direction: column; gap: 6px; }
                .nearby-peer-btn { display: flex; justify-content: space-between; align-items: center;
                    width: 100%; background: var(--surface-2); border: 1px solid var(--border);
                    padding: 9px 12px; border-radius: 10px; cursor: pointer; transition: var(--trans); }
                .nearby-peer-btn:hover { border-color: rgba(59,130,246,0.45); background: var(--blue-light); }
                .np-id { font-size: 0.75rem; font-weight: 700; color: var(--text); font-family: monospace; }
                .np-tap { font-size: 0.58rem; font-weight: 800; color: #60A5FA; letter-spacing: 0.08em; }

                /* ── DEAD MAN'S SWITCH ── */
                .dms-ctl { padding: 16px; border-radius: 18px; margin-bottom: 14px; }
                .dms-ctl-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
                .dms-ctl-title { font-size: 0.82rem; font-weight: 800; color: var(--text); margin-bottom: 3px; }
                .dms-ctl-sub { font-size: 0.65rem; color: var(--text-3); font-variant-numeric: tabular-nums; }
                .dms-arm-btn { padding: 8px 16px; border-radius: 10px; border: 1.5px solid var(--border);
                    background: var(--surface-2); color: var(--text-2); font-size: 0.7rem; font-weight: 800;
                    cursor: pointer; transition: var(--trans); letter-spacing: 0.08em; white-space: nowrap; }
                .dms-arm-btn:hover { border-color: rgba(239,68,68,0.45); background: var(--red-light); color: #F87171; }
                .dms-arm-btn.armed { background: linear-gradient(135deg,#EF4444,#DC2626); color:#fff;
                    border-color: #EF4444; box-shadow: 0 0 20px rgba(239,68,68,0.45);
                    animation: dmsGlow 1.2s ease-in-out infinite alternate; }
                @keyframes dmsGlow { 0%{box-shadow:0 0 12px rgba(239,68,68,0.35)} 100%{box-shadow:0 0 28px rgba(239,68,68,0.70)} }
                .dms-sel { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border);
                    background: var(--surface-2); color: var(--text); font-size: 0.8rem; cursor: pointer;
                    margin-top: 2px; transition: var(--trans); }
                .dms-sel:focus { outline: none; border-color: rgba(239,68,68,0.45); }

            `}</style>
        </div >

    );
}

