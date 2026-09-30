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
    Zap, Navigation, Layers, X, Play, CheckCircle2, Send
} from 'lucide-react';

type Role = 'civilian' | 'responder';
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
    path: [number, number][];
}

// Leaflet default marker icons fix
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

export default function ScenarioLive({
    onBack,
    initialData
}: {
    onBack: () => void;
    initialData?: { role?: Role; bpm?: number; userName?: string; serverName?: string; initialTab?: Tab };
}) {
    // --- BASIC STATE ---
    const [myId, setMyId] = useState<string>('');
    const [role, setRole] = useState<Role>(initialData?.role || 'civilian');
    const [peerIdInput, setPeerIdInput] = useState('');
    const [connections, setConnections] = useState<DataConnection[]>([]);
    const [status, setStatus] = useState(initialData?.bpm ? `BIO-SYNC ACTIVE (${initialData.bpm} BPM)` : 'INITIALIZING...');
    const [activeTab, setActiveTab] = useState<Tab>(initialData?.initialTab || 'chat');
    const [messages, setMessages] = useState<{ sender: string; text: string; time: string; queued?: boolean }[]>(
        initialData?.bpm
            ? [{ sender: 'SYS', text: `BIOMETRIC ENCRYPTION KEY SYNCED: ${initialData.bpm} BPM`, time: new Date().toLocaleTimeString() }]
            : []
    );
    const [radioMessages, setRadioMessages] = useState<{ sender: string; time: string; audio: string }[]>([]);
    const [resources, setResources] = useState<ResourcePost[]>([
        { id: '1', type: 'offer', item: 'Medical Kit & Bandages (Grid A3)', node: 'BASE-1', time: '10:00 AM' },
        { id: '2', type: 'request', item: 'Potable Drinking Water (3 Liters)', node: 'CIV-902', time: '10:15 AM' }
    ]);
    const [newResourceItem, setNewResourceItem] = useState('');
    const [newResourceType, setNewResourceType] = useState<'request' | 'offer'>('request');
    const [alerts, setAlerts] = useState<TriageAlert[]>([]);
    const [triage, setTriage] = useState<TriageStatus>('ok');
    const [showQR, setShowQR] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [nodes, setNodes] = useState<Record<string, NodeLocation>>({});
    const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
    const [myPath, setMyPath] = useState<[number, number][]>([]);
    const [customId, setCustomId] = useState('');
    const [passkey, setPasskey] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [msgInput, setMsgInput] = useState('');
    const [nearbyPeers, setNearbyPeers] = useState<string[]>([]);
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const [mapLayerType, setMapLayerType] = useState<'dark' | 'satellite'>('dark');
    const tileLayerRef = useRef<L.TileLayer | null>(null);

    // --- SERVER-FREE DIRECT MODE STATE ---
    const [directMode, setDirectMode] = useState<'idle' | 'offering' | 'waiting-answer' | 'answering' | 'connected'>('idle');
    const [directOfferInput, setDirectOfferInput] = useState('');
    const [directQR, setDirectQR] = useState('');
    const [directChannel, setDirectChannel] = useState<RTCDataChannel | null>(null);
    const [directMsgInput, setDirectMsgInput] = useState('');
    const rtcRef = useRef<RTCPeerConnection | null>(null);

    // ─── DEAD MAN'S SWITCH ─────────────────────────────
    const [dmsEnabled, setDmsEnabled] = useState(false);
    const [dmsTimeoutMin, setDmsTimeoutMin] = useState(10);
    const [dmsCountdown, setDmsCountdown] = useState(600);
    const [dmsFired, setDmsFired] = useState(false);
    const lastActivityRef = useRef<number>(0);

    // ─── REFS ──────────────────────────────────────────
    const ttsEnabledRef = useRef(false);
    const peerRef = useRef<Peer | null>(null);
    const connectionsRef = useRef<DataConnection[]>([]);
    const offlineQueueRef = useRef<string[]>([]);
    const mapRef = useRef<any>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        lastActivityRef.current = Date.now();
    }, []);

    useEffect(() => {
        ttsEnabledRef.current = ttsEnabled;
    }, [ttsEnabled]);

    const speak = (text: string, priority = false) => {
        if (!ttsEnabledRef.current || !('speechSynthesis' in window)) return;
        if (priority) window.speechSynthesis.cancel();
        try {
            const utt = new SpeechSynthesisUtterance(text);
            utt.rate = 0.95;
            utt.volume = 1;
            window.speechSynthesis.speak(utt);
        } catch {}
    };

    const resetDMS = () => {
        lastActivityRef.current = Date.now();
    };

    // --- INITIAL DATA PARSING & ID SANITIZATION ---
    useEffect(() => {
        if (initialData?.role) setRole(initialData.role);

        const rawName = initialData?.userName || '';
        const sanitizedName = rawName.trim().replace(/[^A-Za-z0-9_-]/g, '_');

        if (initialData?.role === 'responder') {
            const server = initialData.serverName?.trim().replace(/[^A-Za-z0-9_-]/g, '_');
            setCustomId(server || sanitizedName || `COMMAND-${Math.floor(Math.random() * 900) + 100}`);
        } else {
            setCustomId(sanitizedName || `CIV-${Math.floor(Math.random() * 900) + 100}`);
        }

        if (initialData?.serverName) {
            setPasskey(initialData.serverName.trim().toUpperCase());
        }
    }, [initialData]);

    // --- PEERJS ENGINE INITIALIZATION ---
    useEffect(() => {
        if (myId || !customId) return;

        const autoConnectTimer = setTimeout(() => {
            setStatus('⏳ CONNECTING TO MESH...');

            const isLocal = window.location.hostname === 'localhost' ||
                !!window.location.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./);

            const peerHost = isLocal ? window.location.hostname : (import.meta.env.VITE_PEER_HOST || window.location.hostname);
            const peerPort = isLocal ? 9000 : parseInt(import.meta.env.VITE_PEER_PORT || '443', 10);
            const peerPath = import.meta.env.VITE_PEER_PATH || '/peerjs';
            const isSecure = !isLocal && window.location.protocol === 'https:';

            const peer = new Peer(customId, {
                host: peerHost,
                port: peerPort,
                path: peerPath,
                secure: isSecure,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
                        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
                    ]
                }
            });

            const openTimeout = setTimeout(() => {
                if (!peer.id) {
                    setStatus('⚠️ SERVER STANDBY — Retrying...');
                }
            }, 10000);

            peer.on('open', id => {
                clearTimeout(openTimeout);
                setMyId(id);
                setStatus('🟢 ONLINE — MESH READY');
                addLog(`Node active: ${id}`);

                // Initialize default coordinates immediately with slight jitter for multi-window testing
                const baseLat = 20.5937 + (Math.random() - 0.5) * 0.008;
                const baseLng = 78.9629 + (Math.random() - 0.5) * 0.008;
                const initialCoords: [number, number] = [baseLat, baseLng];
                setMyLocation(initialCoords);
                setMyPath([initialCoords]);

                // Try to acquire real GPS coordinates if available
                if ('geolocation' in navigator) {
                    navigator.geolocation.getCurrentPosition(
                        p => {
                            const realCoords: [number, number] = [p.coords.latitude, p.coords.longitude];
                            setMyLocation(realCoords);
                            setMyPath([realCoords]);
                        },
                        () => {},
                        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
                    );
                }

                if (role === 'civilian' && passkey) {
                    setTimeout(() => connectToPeer(passkey), 1000);
                }
            });

            peer.on('connection', c => setupConnection(c));

            peer.on('error', (e: any) => {
                clearTimeout(openTimeout);
                if (e?.type === 'peer-unavailable') {
                    setStatus('⚠️ TARGET NOT FOUND');
                    addLog('Target node not online or out of range');
                } else if (e?.type === 'unavailable-id') {
                    setStatus('⚠️ ID TAKEN — Appending entropy');
                    const fallbackId = `${customId}-${Math.floor(Math.random() * 900) + 100}`;
                    setCustomId(fallbackId);
                } else {
                    setStatus(`⚠️ PEER NOTICE: ${e?.type || 'Connecting'}`);
                }
            });

            peerRef.current = peer;
        }, 600);

        return () => clearTimeout(autoConnectTimer);
    }, [customId, passkey, role]);

    // --- GENERATE NODE QR CODE ---
    useEffect(() => {
        if (myId) {
            QRCode.toDataURL(myId, { width: 220, margin: 2 })
                .then(setQrDataUrl)
                .catch(console.error);
        }
    }, [myId]);

    // --- AUTO PEER DISCOVERY ---
    useEffect(() => {
        if (!myId) return;

        const isLocal = window.location.hostname === 'localhost' ||
            !!window.location.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./);

        const discoverUrl = isLocal
            ? `http://${window.location.hostname}:9000/peerjs/peerjs/peers`
            : `https://${import.meta.env.VITE_PEER_HOST || 'resqmesh.onrender.com'}/peerjs/peerjs/peers`;

        const discover = async () => {
            try {
                const res = await fetch(discoverUrl);
                if (res.ok) {
                    const peerList: string[] = await res.json();
                    if (Array.isArray(peerList)) {
                        setNearbyPeers(peerList.filter(p => p !== myId));
                    }
                }
            } catch {}
        };

        discover();
        const iv = setInterval(discover, 12000);
        return () => clearInterval(iv);
    }, [myId]);

    // --- DEAD MAN'S SWITCH TIMER ---
    useEffect(() => {
        if (!dmsEnabled || !myId) return;
        const iv = setInterval(() => {
            const elapsed = Date.now() - lastActivityRef.current;
            const remaining = Math.max(0, dmsTimeoutMin * 60000 - elapsed);
            setDmsCountdown(Math.ceil(remaining / 1000));
            if (remaining === 0) {
                lastActivityRef.current = Date.now();
                setDmsFired(true);
            }
        }, 1000);
        return () => clearInterval(iv);
    }, [dmsEnabled, myId, dmsTimeoutMin]);

    useEffect(() => {
        if (!dmsFired || !myId) return;
        speak('EMERGENCY! Dead man switch triggered. Transmitting emergency distress beacon.', true);
        sendTriageUpdate('critical');
        setDmsFired(false);
    }, [dmsFired, myId]);

    // --- CLEANUP PEER ON UNMOUNT ---
    useEffect(() => {
        return () => {
            peerRef.current?.destroy();
        };
    }, []);

    // --- CONNECTION HANDLERS ---
    useEffect(() => {
        connectionsRef.current = connections;
    }, [connections]);

    const broadcast = (data: any) => {
        connectionsRef.current.forEach(c => {
            if (c.open) c.send(data);
        });
    };

    const addLog = (text: string) => {
        setMessages(prev => [...prev, { sender: 'SYS', text, time: new Date().toLocaleTimeString() }]);
    };

    const setupConnection = (c: DataConnection) => {
        if (!c) return;
        const init = () => {
            if (connectionsRef.current.find(conn => conn.peer === c.peer)) return;
            const up = [...connectionsRef.current, c];
            connectionsRef.current = up;
            setConnections(up);
            addLog(`🔗 LINKED: ${c.peer}`);
            speak(`Linked to node ${c.peer}`);

            // Send initial location packet
            if (myLocation) {
                c.send(`LOC:${myId}|${myLocation[0]}|${myLocation[1]}|${role}|${triage}|${initialData?.bpm || 0}`);
            }

            // Flush offline queued messages
            if (offlineQueueRef.current.length > 0) {
                addLog(`📦 Relaying ${offlineQueueRef.current.length} queued packets...`);
                offlineQueueRef.current.forEach(queuedMsg => {
                    c.send(queuedMsg);
                });
                offlineQueueRef.current = [];
            }
        };

        if (c.open) init();
        else c.on('open', init);

        c.on('data', (data: any) => {
            resetDMS();
            if (data === 'HB') return;

            if (typeof data === 'object' && data.type === 'voice-burst') {
                setRadioMessages(prev => [{ sender: data.sender, time: new Date().toLocaleTimeString(), audio: data.audio }, ...prev]);
                new Audio(data.audio).play().catch(() => {});
                speak(`Voice burst from ${data.sender}`);
                return;
            }

            const s = String(data);
            if (s.startsWith('LOC:')) {
                const p = s.slice(4).split('|');
                const newLat = parseFloat(p[1]);
                const newLng = parseFloat(p[2]);
                if (!isNaN(newLat) && !isNaN(newLng)) {
                    setNodes(prev => {
                        const existingPath = prev[p[0]]?.path || [];
                        const newPath: [number, number][] = ([...existingPath, [newLat, newLng] as [number, number]] as [number, number][]).slice(-50);
                        return {
                            ...prev,
                            [p[0]]: {
                                id: p[0],
                                lat: newLat,
                                lng: newLng,
                                role: (p[3] as Role) || 'civilian',
                                status: p[4] || 'ok',
                                vitals: p[5] ? parseInt(p[5], 10) : undefined,
                                lastSeen: Date.now(),
                                path: newPath
                            }
                        };
                    });
                    addLog(`📍 Node ${p[0]} GPS: ${newLat.toFixed(4)}, ${newLng.toFixed(4)}`);
                }
            } else if (s.startsWith('RESOURCE:')) {
                const p = s.slice(9).split('|');
                setResources(prev => [{ id: Date.now().toString(), type: p[0] as any, item: p[1], node: c.peer, time: new Date().toLocaleTimeString() }, ...prev]);
                addLog(`RESOURCE ${p[0].toUpperCase()}: ${p[1]}`);
            } else if (s.startsWith('TRIAGE:')) {
                const p = s.slice(7).split('|');
                const locStr = p[1] || '0,0';
                const [lat, lng] = locStr.split(',').map(Number);
                setAlerts(prev => [{ id: Date.now().toString(), node: c.peer, status: p[0], location: locStr, time: new Date().toLocaleTimeString(), assigned: false }, ...prev]);
                if (lat && lng) {
                    setNodes(prev => ({
                        ...prev,
                        [c.peer]: {
                            ...(prev[c.peer] || { role: 'civilian' }),
                            id: c.peer,
                            lat,
                            lng,
                            status: p[0],
                            lastSeen: Date.now(),
                            path: prev[c.peer]?.path || []
                        }
                    }));
                }
                speak(`EMERGENCY ALERT from ${c.peer}: ${p[0]}`, true);
            } else {
                setMessages(prev => [...prev, { sender: c.peer, text: s, time: new Date().toLocaleTimeString() }]);
                speak(`${c.peer}: ${s}`);
            }
        });

        c.on('close', () => {
            setConnections(prev => prev.filter(conn => conn.peer !== c.peer));
            addLog(`LOST: ${c.peer}`);
        });

        c.on('error', () => {
            setConnections(prev => prev.filter(conn => conn.peer !== c.peer));
        });
    };

    const connectToPeer = (id?: string) => {
        const tid = (id || peerIdInput).trim().toUpperCase().replace(/[^A-Za-z0-9_-]/g, '_');
        if (!tid || tid === myId || !peerRef.current) return;
        setStatus(`📡 LINKING ${tid}...`);
        addLog(`Attempting connection to ${tid}...`);

        const c = peerRef.current.connect(tid, { reliable: true });
        const timeoutId = setTimeout(() => {
            if (!c.open) {
                setStatus('⚠️ TIMEOUT: Peer unresponsive');
                addLog(`Timeout: ${tid} did not respond. Check if node is online.`);
            }
        }, 12000);

        c.on('open', () => {
            clearTimeout(timeoutId);
            setStatus('🟢 ONLINE — MESH READY');
            setupConnection(c);
            setPeerIdInput('');
            setShowScanner(false);
        });

        c.on('error', (err: any) => {
            clearTimeout(timeoutId);
            setStatus(`⚠️ LINK FAILED: ${err?.type || 'Error'}`);
            addLog(`Connection failed to ${tid}`);
        });
    };

    const sendMessage = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        resetDMS();

        if (connectionsRef.current.length === 0) {
            offlineQueueRef.current.push(trimmed);
            setMessages(prev => [...prev, { sender: 'ME', text: `📦 [QUEUED] ${trimmed}`, time: new Date().toLocaleTimeString(), queued: true }]);
        } else {
            broadcast(trimmed);
            setMessages(prev => [...prev, { sender: 'ME', text: trimmed, time: new Date().toLocaleTimeString() }]);
        }
    };

    const shareLocation = () => {
        resetDMS();
        const broadcastLocation = (lat: number, lng: number) => {
            const coords: [number, number] = [lat, lng];
            setMyLocation(coords);
            setMyPath(prev => [...prev, coords].slice(-50));
            broadcast(`LOC:${myId}|${lat}|${lng}|${role}|${triage}|${initialData?.bpm || 0}`);
            sendMessage(`📍 SHARED GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
            addLog(`GPS Broadcasted: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        };

        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    broadcastLocation(pos.coords.latitude, pos.coords.longitude);
                },
                err => {
                    console.warn('Geolocation failed:', err.message);
                    const cur = myLocation || [20.5937, 78.9629];
                    broadcastLocation(cur[0], cur[1]);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
            );
        } else {
            const cur = myLocation || [20.5937, 78.9629];
            broadcastLocation(cur[0], cur[1]);
        }
    };

    const sendTriageUpdate = (newStatus: TriageStatus) => {
        resetDMS();
        setTriage(newStatus);
        const broadcastTriage = (lat: number, lng: number) => {
            const loc = `${lat.toFixed(5)},${lng.toFixed(5)}`;
            setMyLocation([lat, lng]);
            broadcast(`TRIAGE:${newStatus.toUpperCase()}|${loc}`);
            sendMessage(`🚨 TRIAGE SOS: [${newStatus.toUpperCase()}] @ ${loc}`);
            addLog(`🚨 Distress alert: [${newStatus.toUpperCase()}] @ ${loc}`);
        };

        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                pos => broadcastTriage(pos.coords.latitude, pos.coords.longitude),
                () => {
                    const cur = myLocation || [20.5937, 78.9629];
                    broadcastTriage(cur[0], cur[1]);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
            );
        } else {
            const cur = myLocation || [20.5937, 78.9629];
            broadcastTriage(cur[0], cur[1]);
        }
    };

    // --- PTT AUDIO RECORDING ---
    const startRecording = async () => {
        try {
            resetDMS();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

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
        } catch {
            addLog('PTT Error: Microphone blocked');
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    const postResource = () => {
        if (!newResourceItem.trim()) return;
        const itemText = newResourceItem.trim();
        resetDMS();
        broadcast(`RESOURCE:${newResourceType}|${itemText}`);
        setResources(prev => [{ id: Date.now().toString(), type: newResourceType, item: itemText, node: 'ME', time: new Date().toLocaleTimeString() }, ...prev]);
        sendMessage(`📦 ${newResourceType.toUpperCase()}: ${itemText}`);
        setNewResourceItem('');
    };

    // --- SERVER-FREE DIRECT WEBRTC HANDSHAKE ---
    const createDirectRTC = () => {
        const pc = new RTCPeerConnection({ iceServers: [] });
        rtcRef.current = pc;
        return pc;
    };

    const generateDirectOffer = async () => {
        try {
            setDirectMode('offering');
            const pc = createDirectRTC();
            const ch = pc.createDataChannel('resqmesh-direct');
            setDirectChannel(ch);

            ch.onopen = () => {
                setDirectMode('connected');
                setStatus('🟢 DIRECT P2P READY');
                addLog('✅ SERVER-FREE LINK ESTABLISHED (Direct WebRTC)');
            };

            ch.onmessage = e => {
                setMessages(prev => [...prev, { sender: 'DIRECT-PEER', text: e.data, time: new Date().toLocaleTimeString() }]);
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Wait for ICE gathering
            await new Promise<void>(resolve => {
                if (pc.iceGatheringState === 'complete') resolve();
                else {
                    const check = () => {
                        if (pc.iceGatheringState === 'complete') {
                            pc.removeEventListener('icegatheringstatechange', check);
                            resolve();
                        }
                    };
                    pc.addEventListener('icegatheringstatechange', check);
                    setTimeout(resolve, 1500);
                }
            });

            const sdpJson = JSON.stringify(pc.localDescription);
            const qr = await QRCode.toDataURL(sdpJson, { width: 220, margin: 2 });
            setDirectQR(qr);
            setDirectOfferInput(sdpJson);
            setDirectMode('waiting-answer');
        } catch (e: any) {
            addLog(`Direct Offer error: ${e.message}`);
        }
    };

    const receiveDirectOfferAndAnswer = async () => {
        try {
            if (!directOfferInput.trim()) return;
            const offerDesc = JSON.parse(directOfferInput.trim());
            const pc = createDirectRTC();

            pc.ondatachannel = e => {
                const ch = e.channel;
                setDirectChannel(ch);
                ch.onopen = () => {
                    setDirectMode('connected');
                    setStatus('🟢 DIRECT P2P READY');
                    addLog('✅ SERVER-FREE LINK ESTABLISHED (Direct WebRTC)');
                };
                ch.onmessage = evt => {
                    setMessages(prev => [...prev, { sender: 'DIRECT-PEER', text: evt.data, time: new Date().toLocaleTimeString() }]);
                };
            };

            await pc.setRemoteDescription(offerDesc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await new Promise<void>(resolve => {
                if (pc.iceGatheringState === 'complete') resolve();
                else {
                    const check = () => {
                        if (pc.iceGatheringState === 'complete') {
                            pc.removeEventListener('icegatheringstatechange', check);
                            resolve();
                        }
                    };
                    pc.addEventListener('icegatheringstatechange', check);
                    setTimeout(resolve, 1500);
                }
            });

            const answerJson = JSON.stringify(pc.localDescription);
            const qr = await QRCode.toDataURL(answerJson, { width: 220, margin: 2 });
            setDirectQR(qr);
            setDirectOfferInput(answerJson);
            setDirectMode('waiting-answer');
        } catch (e: any) {
            addLog(`Direct Answer error: ${e.message}`);
        }
    };

    const completeDirectHandshake = async () => {
        try {
            if (!directOfferInput.trim() || !rtcRef.current) return;
            const answerDesc = JSON.parse(directOfferInput.trim());
            await rtcRef.current.setRemoteDescription(answerDesc);
            addLog('Handshake completed! Waiting for data channel open...');
        } catch (e: any) {
            addLog(`Handshake complete error: ${e.message}`);
        }
    };

    const sendDirectMessage = () => {
        if (!directMsgInput.trim() || !directChannel || directChannel.readyState !== 'open') return;
        directChannel.send(directMsgInput.trim());
        setMessages(prev => [...prev, { sender: 'ME (DIRECT)', text: directMsgInput.trim(), time: new Date().toLocaleTimeString() }]);
        setDirectMsgInput('');
    };

    // --- LEAFLET MAP ENGINE ---
    const updateTileLayer = (map: L.Map, type: 'dark' | 'satellite') => {
        if (tileLayerRef.current) {
            map.removeLayer(tileLayerRef.current);
        }
        if (type === 'satellite') {
            tileLayerRef.current = L.tileLayer(
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
            ).addTo(map);
        } else {
            tileLayerRef.current = L.tileLayer(
                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                { maxZoom: 19, className: 'tactical-light-tiles', attribution: '&copy; OpenStreetMap' }
            ).addTo(map);
        }
    };

    useEffect(() => {
        if (mapRef.current) {
            updateTileLayer(mapRef.current, mapLayerType);
        }
    }, [mapLayerType]);

    useEffect(() => {
        if (activeTab === 'map') {
            if (mapContainerRef.current && !mapRef.current) {
                const initialPos: [number, number] = myLocation || [20.5937, 78.9629];
                const map = L.map(mapContainerRef.current, {
                    zoomControl: true,
                    attributionControl: false
                }).setView(initialPos, 13);

                updateTileLayer(map, mapLayerType);

                // Allow clicking on map to drop a pin and broadcast coordinates
                map.on('click', (e: L.LeafletMouseEvent) => {
                    const coords: [number, number] = [e.latlng.lat, e.latlng.lng];
                    setMyLocation(coords);
                    setMyPath(prev => [...prev, coords].slice(-50));
                    broadcast(`LOC:${myId}|${coords[0]}|${coords[1]}|${role}|${triage}|${initialData?.bpm || 0}`);
                    sendMessage(`📍 PINNED GPS: ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`);
                    addLog(`📍 Location pinned on map: ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`);
                });

                mapRef.current = map;
            }

            if (mapRef.current) {
                setTimeout(() => {
                    mapRef.current?.invalidateSize();
                }, 150);
            }
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'map' && mapRef.current) {
            // Remove previous markers/polylines
            mapRef.current.eachLayer((l: any) => {
                if (l instanceof L.Marker || l instanceof L.Circle || l instanceof L.Polyline) {
                    if (!('_url' in l)) mapRef.current.removeLayer(l);
                }
            });

            // Draw My location & Path
            if (myLocation) {
                if (myPath.length > 1) {
                    L.polyline(myPath, { color: '#00F2FE', weight: 4, opacity: 0.6 }).addTo(mapRef.current);
                }
                L.marker(myLocation, {
                    icon: L.divIcon({
                        className: 'm-pos',
                        html: `<div class="pulse-marker-me"></div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(mapRef.current).bindPopup(`<b>ME: ${myId}</b><br/>Role: ${role.toUpperCase()}<br/>GPS: ${myLocation[0].toFixed(4)}, ${myLocation[1].toFixed(4)}`);
                L.circle(myLocation, { radius: 400, color: '#00F2FE', fillOpacity: 0.06 }).addTo(mapRef.current);
            }

            // Draw Peer nodes
            Object.values(nodes).forEach(n => {
                const isCrit = n.status.toLowerCase() === 'critical';
                if (n.path && n.path.length > 1) {
                    L.polyline(n.path, {
                        color: n.role === 'responder' ? '#4FACFE' : '#FF4D4D',
                        weight: 3,
                        opacity: 0.5,
                        dashArray: '6, 6'
                    }).addTo(mapRef.current);
                }

                L.marker([n.lat, n.lng], {
                    icon: L.divIcon({
                        className: 'p-pos',
                        html: `<div class="pulse-marker-peer ${n.role} ${n.status.toLowerCase()}"></div>`,
                        iconSize: [18, 18],
                        iconAnchor: [9, 9]
                    })
                }).addTo(mapRef.current).bindPopup(`
                    <div style="font-family: sans-serif; font-size: 12px; color: #111;">
                        <strong>${n.id}</strong><br/>
                        Role: ${n.role.toUpperCase()}<br/>
                        Status: <b>${n.status.toUpperCase()}</b><br/>
                        GPS: <b>${n.lat.toFixed(4)}, ${n.lng.toFixed(4)}</b><br/>
                        ${n.vitals ? `Vitals: ❤️ ${n.vitals} BPM<br/>` : ''}
                        Last Seen: ${new Date(n.lastSeen).toLocaleTimeString()}
                    </div>
                `);

                if (isCrit) {
                    L.circle([n.lat, n.lng], {
                        radius: 500,
                        color: '#FF4D4D',
                        fillColor: '#FF4D4D',
                        fillOpacity: 0.15,
                        weight: 2
                    }).addTo(mapRef.current);
                }
            });
        }
    }, [nodes, myLocation, activeTab, myPath, myId, role]);

    // --- HTML5 QR SCANNER ---
    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        if (showScanner) {
            scanner = new Html5QrcodeScanner("qr-reader-target", { fps: 10, qrbox: 240 }, false);
            scanner.render(
                (text: string) => {
                    connectToPeer(text);
                    setShowScanner(false);
                },
                () => {}
            );
        }
        return () => {
            if (scanner) scanner.clear().catch(() => {});
        };
    }, [showScanner]);

    const TabBtn = ({ t, i: Icon, label }: { t: Tab; i: any; label: string }) => (
        <button onClick={() => setActiveTab(t)} className={`nav-item ${activeTab === t ? 'active' : ''}`}>
            <Icon size={18} />
            <span className="nav-label">{label}</span>
        </button>
    );

    return (
        <div className="next-gen-ui">
            <div className="glass-frame">
                {/* ── TOP HEADER ── */}
                <header className="top-bar">
                    <button onClick={onBack} className="icon-btn-nav" title="Back to Dashboard">
                        <Navigation size={18} />
                    </button>
                    <div className="system-identity">
                        <h1 className="host-name">{role.toUpperCase()} // {myId || 'OFFLINE'}</h1>
                        <div className="system-status">
                            <span className={`pulse-orb ${connections.length > 0 ? 'active' : ''}`} />
                            <span>{status} // {connections.length} PEERS</span>
                            {initialData?.bpm ? (
                                <span className="bio-pill">❤️ {initialData.bpm} BPM</span>
                            ) : null}
                        </div>
                    </div>
                    <div className="signal-telemetry">
                        <div className="signal-bars">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className={`bar ${connections.length >= i ? 'active' : ''}`} style={{ height: i * 3 + 2 }} />
                            ))}
                        </div>
                        <button onClick={() => setShowQR(true)} className="icon-btn-minimal" title="Show Node QR">
                            <QrCode size={18} />
                        </button>
                        <button
                            onClick={() => setTtsEnabled(v => !v)}
                            className={`icon-btn-minimal ${ttsEnabled ? 'tts-active' : ''}`}
                            title={ttsEnabled ? 'Mute TTS' : 'Enable TTS'}
                        >
                            <Volume2 size={18} />
                        </button>
                    </div>
                </header>

                {/* ── MAIN CONTENT AREA ── */}
                <main className="content-area">
                    {!myId ? (
                        <div className="boot-sequence">
                            <div className="boot-card">
                                <Zap className="boot-logo pulse" size={48} />
                                <h2 className="boot-title">INITIALIZING LINK</h2>
                                <p className="boot-step">NODE: {customId}</p>
                                <p className="boot-sub">Establishing local PeerJS WebRTC signaling...</p>
                            </div>
                        </div>
                    ) : (
                        <div className="active-view">
                            {/* ── TAB 1: CHAT ── */}
                            <div className="tab-pane-modern chat-pane" style={{ display: activeTab === 'chat' ? 'flex' : 'none' }}>
                                <div className="message-scroller" id="chat-scroll-target">
                                    {messages.map((m, i) => (
                                        <div key={i} className={`msg-block ${m.sender === 'ME' ? 'is-me' : (m.sender === 'SYS' ? 'is-sys' : 'is-peer')}`}>
                                            <div className="msg-meta">{m.sender} // {m.time}</div>
                                            <div className="msg-bubble-modern">{m.text}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Nearby Discovered Peers Bar */}
                                {nearbyPeers.filter(p => !connections.some(c => c.peer === p)).length > 0 && (
                                    <div className="nearby-nodes-bar">
                                        <div className="nearby-title">📡 DISCOVERED NODES ON LOCAL MESH:</div>
                                        <div className="nearby-list">
                                            {nearbyPeers.filter(p => !connections.some(c => c.peer === p)).map(p => (
                                                <button key={p} className="nearby-peer-btn" onClick={() => connectToPeer(p)}>
                                                    <span className="np-id">{p}</span>
                                                    <span className="np-tap">LINK →</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Chat input & Share GPS */}
                                <form className="input-strip-modern" onSubmit={e => { e.preventDefault(); sendMessage(msgInput); setMsgInput(''); }}>
                                    <button type="button" onClick={shareLocation} className="btn-icon" title="Share GPS Location">
                                        <MapPin size={18} />
                                    </button>
                                    <input
                                        placeholder="Type message packet..."
                                        value={msgInput}
                                        onChange={e => setMsgInput(e.target.value)}
                                    />
                                    <button type="submit" className="btn-icon send" title="Transmit Packet">
                                        <Send size={18} />
                                    </button>
                                </form>

                                {/* Quick Connect Bar */}
                                <div className="quick-link-bar">
                                    <input
                                        value={peerIdInput}
                                        onChange={e => setPeerIdInput(e.target.value.toUpperCase())}
                                        placeholder="TARGET PEER ID..."
                                    />
                                    <button onClick={() => connectToPeer()} className="btn-sync">SYNC</button>
                                    <button onClick={() => setShowScanner(true)} className="btn-scan" title="Scan QR Code">
                                        <Camera size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* ── TAB 2: RADIO (PTT) ── */}
                            <div className="tab-pane-modern radio-pane" style={{ display: activeTab === 'radio' ? 'flex' : 'none' }}>
                                <div className="sonar-container">
                                    <div className={`sonar-waves ${isRecording ? 'recording' : ''}`}>
                                        <div></div><div></div><div></div>
                                    </div>
                                    <button
                                        className={`ptt-massive ${isRecording ? 'active' : ''}`}
                                        onMouseDown={startRecording}
                                        onMouseUp={stopRecording}
                                        onTouchStart={startRecording}
                                        onTouchEnd={stopRecording}
                                    >
                                        <Mic size={44} />
                                        <span className="ptt-label">{isRecording ? 'TRANSMITTING' : 'HOLD TO TALK'}</span>
                                    </button>
                                </div>
                                <div className="burst-history">
                                    <div className="section-title">RECENT VOICE BURSTS ({radioMessages.length})</div>
                                    {radioMessages.length === 0 ? (
                                        <div className="empty-state">NO VOICE BURSTS RECEIVED YET</div>
                                    ) : (
                                        <div className="burst-list">
                                            {radioMessages.map((b, idx) => (
                                                <div key={idx} className="burst-item">
                                                    <div className="burst-info">
                                                        <span className="burst-sender">{b.sender}</span>
                                                        <span className="burst-time">{b.time}</span>
                                                    </div>
                                                    <button onClick={() => new Audio(b.audio).play()} className="btn-play">
                                                        <Play size={14} /> PLAY
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── TAB 3: MAP ── */}
                            <div className="map-view-modern" style={{ display: activeTab === 'map' ? 'flex' : 'none' }}>
                                <div ref={mapContainerRef} className="map-engine" />
                                <div className="map-overlay-stats">
                                    <div className="stat-bit"><Globe size={14} /> LIVE GRID</div>
                                    <div className="stat-bit"><Layers size={14} /> {Object.keys(nodes).length + 1} ACTIVE NODES</div>
                                    {myLocation && (
                                        <div className="stat-bit"><MapPin size={14} /> {myLocation[0].toFixed(4)}, {myLocation[1].toFixed(4)}</div>
                                    )}
                                    <button
                                        onClick={() => setMapLayerType(prev => prev === 'dark' ? 'satellite' : 'dark')}
                                        className="stat-bit-btn"
                                        title="Switch Map Tile Source"
                                    >
                                        <Layers size={12} /> {mapLayerType === 'dark' ? 'STREET (OSM)' : 'SATELLITE (ESRI)'}
                                    </button>
                                </div>
                                <div className="map-action-bar">
                                    <button onClick={shareLocation} className="btn-map-action broadcast">
                                        <MapPin size={14} /> BROADCAST GPS
                                    </button>
                                    <button onClick={() => {
                                        if (myLocation && mapRef.current) {
                                            mapRef.current.setView(myLocation, 14);
                                        }
                                    }} className="btn-map-action center">
                                        <Navigation size={14} /> CENTER ME
                                    </button>
                                    <button onClick={() => {
                                        if (mapRef.current) {
                                            const pts: [number, number][] = [];
                                            if (myLocation) pts.push(myLocation);
                                            Object.values(nodes).forEach(n => pts.push([n.lat, n.lng]));
                                            if (pts.length > 0) {
                                                const b = L.latLngBounds(pts);
                                                mapRef.current.fitBounds(b, { padding: [50, 50], maxZoom: 15 });
                                            }
                                        }
                                    }} className="btn-map-action fit">
                                        <Layers size={14} /> FIT ALL
                                    </button>
                                </div>
                                <div className="map-hint-banner">
                                    💡 Click on map to drop a pin &amp; broadcast coordinates
                                </div>
                            </div>

                            {/* ── TAB 4: RESOURCES (LOGISTICS BOARD) ── */}
                            <div className="tab-pane-modern resources-pane" style={{ display: activeTab === 'resources' ? 'flex' : 'none' }}>
                                <div className="resource-composer">
                                    <div className="type-toggles">
                                        <button
                                            type="button"
                                            className={`toggle-btn ${newResourceType === 'request' ? 'active req' : ''}`}
                                            onClick={() => setNewResourceType('request')}
                                        >
                                            REQUEST NEED
                                        </button>
                                        <button
                                            type="button"
                                            className={`toggle-btn ${newResourceType === 'offer' ? 'active off' : ''}`}
                                            onClick={() => setNewResourceType('offer')}
                                        >
                                            OFFER SUPPLY
                                        </button>
                                    </div>
                                    <div className="resource-input-row">
                                        <input
                                            placeholder="Item & Quantity (e.g. Water 5L, Gauze)..."
                                            value={newResourceItem}
                                            onChange={e => setNewResourceItem(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') postResource(); }}
                                        />
                                        <button onClick={postResource} className="btn-post">BROADCAST</button>
                                    </div>
                                </div>

                                <div className="resources-list">
                                    <div className="section-title">LOGISTICS BOARD ({resources.length})</div>
                                    {resources.map(r => (
                                        <div key={r.id} className={`resource-card ${r.type}`}>
                                            <div className="r-header">
                                                <span className={`r-badge ${r.type}`}>{r.type.toUpperCase()}</span>
                                                <span className="r-node">{r.node} // {r.time}</span>
                                            </div>
                                            <div className="r-item">{r.item}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── TAB 5: TACTICAL & DEAD MAN'S SWITCH ── */}
                            <div className="tab-pane-modern tactical-pane" style={{ display: activeTab === 'tactical' ? 'flex' : 'none' }}>
                                {/* Dead Man's Switch */}
                                <div className="dms-card">
                                    <div className="dms-header">
                                        <div>
                                            <div className="dms-title">💀 DEAD MAN'S SWITCH</div>
                                            <div className="dms-sub">
                                                {dmsEnabled
                                                    ? `${Math.floor(dmsCountdown / 60)}m ${dmsCountdown % 60}s remaining before MAYDAY`
                                                    : 'Auto-broadcasts Critical SOS if you go silent'}
                                            </div>
                                        </div>
                                        <button
                                            className={`dms-btn ${dmsEnabled ? 'armed' : ''}`}
                                            onClick={() => { setDmsEnabled(v => !v); resetDMS(); }}
                                        >
                                            {dmsEnabled ? '⚡ ARMED' : 'ARM'}
                                        </button>
                                    </div>
                                    {dmsEnabled && (
                                        <select
                                            className="dms-select"
                                            value={dmsTimeoutMin}
                                            onChange={e => { setDmsTimeoutMin(Number(e.target.value)); resetDMS(); }}
                                        >
                                            <option value={1}>1 Minute (Test Mode)</option>
                                            <option value={5}>5 Minutes</option>
                                            <option value={10}>10 Minutes</option>
                                            <option value={15}>15 Minutes</option>
                                            <option value={30}>30 Minutes</option>
                                        </select>
                                    )}
                                </div>

                                {/* SOS Center */}
                                <div className="sos-center">
                                    <div className="sos-shield"><AlertTriangle size={48} /></div>
                                    <h3 className="sos-headline">ONE-TAP EMERGENCY BEACONS</h3>
                                    <button onClick={() => sendTriageUpdate('critical')} className="sos-btn critical">
                                        🆘 CRITICAL SOS / TRAPPED
                                    </button>
                                    <button onClick={() => sendTriageUpdate('injured')} className="sos-btn injured">
                                        ⚠️ MEDICAL EVAC NEEDED
                                    </button>
                                    <button onClick={() => sendTriageUpdate('ok')} className="sos-btn ok">
                                        ✅ REPORT NOMINAL / SAFE
                                    </button>
                                </div>

                                {/* Active Incoming Triage Alerts */}
                                {alerts.length > 0 && (
                                    <div className="alerts-feed">
                                        <div className="section-title">ACTIVE DISTRESS ALERTS ({alerts.length})</div>
                                        {alerts.map(a => (
                                            <div key={a.id} className="alert-item">
                                                <div className="a-meta">{a.node} // {a.time} // {a.status}</div>
                                                <div className="a-loc">📍 {a.location}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── TAB 6: SERVER-FREE DIRECT WEBRTC ── */}
                            <div className="tab-pane-modern direct-pane" style={{ display: activeTab === 'direct' ? 'flex' : 'none' }}>
                                <div className="direct-header">
                                    <div className="direct-badge"><Zap size={14} /> SERVER-FREE P2P MODE</div>
                                    <p className="direct-sub">Zero servers. Zero Wi-Fi routers. Pure direct WebRTC via QR handshake.</p>
                                </div>

                                {directMode === 'connected' ? (
                                    <div className="direct-connected-view">
                                        <div className="direct-ring"><CheckCircle2 size={44} color="#00FFA3" /></div>
                                        <h3>DIRECT P2P LINK ESTABLISHED</h3>
                                        <p>Secure peer-to-peer data channel is active with zero infrastructure.</p>
                                        <div className="direct-chat-strip">
                                            <input
                                                placeholder="Send direct P2P packet..."
                                                value={directMsgInput}
                                                onChange={e => setDirectMsgInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') sendDirectMessage(); }}
                                            />
                                            <button onClick={sendDirectMessage} className="btn-icon send"><Send size={16} /></button>
                                        </div>
                                    </div>
                                ) : directMode === 'idle' ? (
                                    <div className="direct-instructions">
                                        <div className="d-step"><span className="num">1</span> Device A clicks "Initiate Offer" to generate a QR handshake.</div>
                                        <div className="d-step"><span className="num">2</span> Device B scans Offer or pastes SDP, then produces an Answer QR.</div>
                                        <div className="d-step"><span className="num">3</span> Device A scans Answer &rarr; Direct WebRTC connection links!</div>
                                        <div className="direct-action-btns">
                                            <button onClick={generateDirectOffer} className="btn-direct-primary">📡 1. INITIATE OFFER (Device A)</button>
                                            <button onClick={() => setDirectMode('answering')} className="btn-direct-secondary">📥 2. I HAVE AN OFFER TO ANSWER (Device B)</button>
                                        </div>
                                    </div>
                                ) : directMode === 'waiting-answer' ? (
                                    <div className="direct-qr-card">
                                        <p className="d-label">Scan this QR or copy the SDP below:</p>
                                        {directQR && <img src={directQR} alt="Offer QR" className="direct-qr-image" />}
                                        <textarea
                                            className="direct-sdp-box"
                                            value={directOfferInput}
                                            readOnly
                                            onFocus={e => e.target.select()}
                                        />
                                        <div className="handshake-finish-box">
                                            <p className="d-label">Paste the remote Answer SDP below to complete:</p>
                                            <textarea
                                                className="direct-sdp-box"
                                                placeholder="Paste Answer SDP..."
                                                onChange={e => setDirectOfferInput(e.target.value)}
                                            />
                                            <button onClick={completeDirectHandshake} className="btn-direct-primary">
                                                ✅ COMPLETE HANDSHAKE
                                            </button>
                                        </div>
                                    </div>
                                ) : directMode === 'answering' ? (
                                    <div className="direct-qr-card">
                                        <p className="d-label">Paste Offer SDP from Device A:</p>
                                        <textarea
                                            className="direct-sdp-box"
                                            placeholder="Paste Offer SDP..."
                                            value={directOfferInput}
                                            onChange={e => setDirectOfferInput(e.target.value)}
                                        />
                                        <button onClick={receiveDirectOfferAndAnswer} className="btn-direct-primary">
                                            GENERATE ANSWER
                                        </button>
                                        <button onClick={() => setDirectMode('idle')} className="btn-link">Cancel</button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </main>

                {/* ── SYSTEM TICKER ── */}
                <div className="system-ticker-live">
                    <span>[ MESH ENCRYPTED ] [ NODE: {myId || 'OFFLINE'} ] [ PEERS: {connections.length} ] [ GPS: {myLocation ? 'LOCKED' : 'SEARCHING'} ]</span>
                </div>

                {/* ── BOTTOM NAVIGATION (6 TABS) ── */}
                <nav className="bottom-bar-modern">
                    <TabBtn t="chat" i={MessageSquare} label="Chat" />
                    <TabBtn t="radio" i={Radio} label="Radio" />
                    <TabBtn t="map" i={Globe} label="Map" />
                    <TabBtn t="resources" i={Package} label="Supply" />
                    <TabBtn t="tactical" i={Shield} label="SOS" />
                    <TabBtn t="direct" i={Zap} label="Direct" />
                </nav>

                {/* ── MODAL: QR CODE DISPLAY ── */}
                {showQR && (
                    <div className="modal-backdrop" onClick={() => setShowQR(false)}>
                        <div className="modal-window" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <span>DEVICE IDENTITY QR</span>
                                <button onClick={() => setShowQR(false)} className="btn-close"><X size={18} /></button>
                            </div>
                            <div className="modal-body">
                                {qrDataUrl ? (
                                    <img src={qrDataUrl} alt="Device QR" className="qr-image" />
                                ) : (
                                    <div className="qr-placeholder">Generating...</div>
                                )}
                                <div className="node-id-display">{myId}</div>
                                <p className="qr-hint">Other nodes can scan this QR code or type your ID to link over the mesh.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── MODAL: QR SCANNER ── */}
                {showScanner && (
                    <div className="modal-backdrop" onClick={() => setShowScanner(false)}>
                        <div className="modal-window" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <span>SCAN PEER QR CODE</span>
                                <button onClick={() => setShowScanner(false)} className="btn-close"><X size={18} /></button>
                            </div>
                            <div className="modal-body">
                                <div id="qr-reader-target" className="scanner-container" />
                                <button onClick={() => setShowScanner(false)} className="btn-cancel">CLOSE SCANNER</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .next-gen-ui {
                    position: fixed; inset: 0;
                    background: linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%);
                    font-family: 'Outfit', -apple-system, sans-serif;
                    color: #0F172A;
                    display: flex; align-items: center; justify-content: center;
                    overflow: hidden; z-index: 2000;
                }
                .glass-frame {
                    width: 100%; max-width: 480px; height: 100vh;
                    background: #FFFFFF;
                    display: flex; flex-direction: column;
                    border-left: 1px solid #E2E8F0;
                    border-right: 1px solid #E2E8F0;
                    position: relative; overflow: hidden;
                    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
                }
                .top-bar {
                    padding: 12px 16px;
                    display: flex; align-items: center; justify-content: space-between;
                    background: rgba(255, 255, 255, 0.95);
                    border-bottom: 1px solid #E2E8F0;
                    z-index: 10;
                    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.03);
                }
                .icon-btn-nav, .icon-btn-minimal {
                    background: #F1F5F9;
                    border: 1px solid #E2E8F0;
                    color: #475569;
                    padding: 8px; border-radius: 10px;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                    transition: 0.2s;
                }
                .icon-btn-nav:hover, .icon-btn-minimal:hover { color: #0284C7; border-color: #0284C7; background: #FFFFFF; }
                .tts-active { color: #059669 !important; border-color: #059669 !important; background: rgba(5, 150, 105, 0.1) !important; }
                .system-identity { text-align: left; flex: 1; margin: 0 12px; }
                .host-name { font-size: 0.82rem; font-weight: 800; color: #0284C7; letter-spacing: 0.04em; margin: 0; }
                .system-status { font-size: 0.62rem; color: #64748B; display: flex; align-items: center; gap: 6px; margin-top: 3px; font-weight: 700; }
                .bio-pill { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); color: #EF4444; padding: 2px 7px; border-radius: 12px; font-size: 0.58rem; font-weight: 800; }
                .pulse-orb { width: 7px; height: 7px; background: #CBD5E1; border-radius: 50%; }
                .pulse-orb.active { background: #059669; box-shadow: 0 0 10px rgba(5, 150, 105, 0.5); animation: orbGlow 1.5s infinite; }
                @keyframes orbGlow { 0%,100%{transform:scale(1)} 50%{transform:scale(1.35)} }
                .signal-telemetry { display: flex; align-items: center; gap: 8px; }
                .signal-bars { display: flex; align-items: flex-end; gap: 2px; }
                .signal-bars .bar { width: 3px; background: #E2E8F0; border-radius: 1px; }
                .signal-bars .bar.active { background: #0284C7; box-shadow: 0 0 6px rgba(2, 132, 199, 0.4); }

                .content-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; background: #F8FAFC; }
                .active-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
                .boot-sequence { flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px; }
                .boot-card { text-align: center; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 36px 24px; border-radius: 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); }
                .boot-logo { color: #0284C7; margin-bottom: 16px; }
                .boot-title { font-size: 1.25rem; font-weight: 900; color: #0F172A; margin-bottom: 6px; }
                .boot-step { font-size: 0.75rem; color: #0284C7; font-weight: 800; letter-spacing: 0.1em; }
                .boot-sub { font-size: 0.68rem; color: #64748B; margin-top: 8px; }

                /* ── CHAT PANE ── */
                .chat-pane { flex: 1; display: flex; flex-direction: column; padding: 14px; gap: 10px; overflow: hidden; background: #F8FAFC; }
                .message-scroller { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; scrollbar-width: none; }
                .message-scroller::-webkit-scrollbar { display: none; }
                .msg-block { max-width: 82%; }
                .msg-block.is-me { align-self: flex-end; }
                .msg-meta { font-size: 0.58rem; color: #64748B; font-weight: 700; margin-bottom: 3px; }
                .msg-bubble-modern { padding: 10px 14px; border-radius: 16px; font-size: 0.85rem; line-height: 1.45; background: #FFFFFF; border: 1px solid #E2E8F0; color: #0F172A; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04); }
                .is-me .msg-bubble-modern { background: linear-gradient(135deg, #0284C7 0%, #2563EB 100%); color: #FFFFFF; font-weight: 600; border: none; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.22); }
                .is-sys .msg-bubble-modern { background: rgba(2, 132, 199, 0.07); color: #0284C7; border: 1px solid rgba(2, 132, 199, 0.18); font-size: 0.72rem; font-weight: 700; border-radius: 10px; text-align: center; }

                .nearby-nodes-bar { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 10px 12px; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03); }
                .nearby-title { font-size: 0.62rem; font-weight: 800; color: #0284C7; margin-bottom: 6px; }
                .nearby-list { display: flex; flex-direction: column; gap: 5px; }
                .nearby-peer-btn { display: flex; justify-content: space-between; align-items: center; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 6px 10px; border-radius: 8px; color: #0F172A; cursor: pointer; transition: 0.2s; }
                .nearby-peer-btn:hover { border-color: #0284C7; background: #FFFFFF; }
                .np-id { font-size: 0.72rem; font-family: monospace; font-weight: 700; }
                .np-tap { font-size: 0.62rem; font-weight: 800; color: #0284C7; }

                .input-strip-modern { display: flex; align-items: center; gap: 8px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 24px; padding: 6px 10px; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.05); }
                .input-strip-modern input { flex: 1; background: transparent; border: none; color: #0F172A; font-size: 0.85rem; outline: none; }
                .input-strip-modern input::placeholder { color: #94A3B8; }
                .btn-icon { background: none; border: none; color: #0284C7; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 50%; transition: 0.2s; }
                .btn-icon.send { background: linear-gradient(135deg, #0284C7, #2563EB); color: #FFFFFF; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3); }

                .quick-link-bar { display: flex; align-items: center; gap: 6px; }
                .quick-link-bar input { flex: 1; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 7px 10px; color: #0F172A; font-size: 0.75rem; outline: none; font-family: monospace; }
                .quick-link-bar input::placeholder { color: #94A3B8; }
                .btn-sync { background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.25); color: #0284C7; padding: 7px 14px; border-radius: 10px; font-weight: 800; font-size: 0.7rem; cursor: pointer; transition: 0.2s; }
                .btn-sync:hover { background: rgba(2, 132, 199, 0.16); }
                .btn-scan { background: #FFFFFF; border: 1px solid #E2E8F0; color: #64748B; padding: 7px 10px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; }

                /* ── RADIO PANE ── */
                .radio-pane { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; gap: 20px; background: #F8FAFC; }
                .sonar-container { position: relative; width: 220px; height: 220px; display: flex; align-items: center; justify-content: center; }
                .sonar-waves div { position: absolute; inset: 0; border: 2px solid #0284C7; border-radius: 50%; opacity: 0; }
                .recording.sonar-waves div { animation: ripple 2s infinite; border-color: #EF4444; }
                @keyframes ripple { 0%{transform:scale(0.6);opacity:0.8} 100%{transform:scale(2);opacity:0} }
                .ptt-massive { width: 140px; height: 140px; border-radius: 50%; background: #FFFFFF; border: 3px solid #E2E8F0; color: #0F172A; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.2s; z-index: 5; box-shadow: 0 12px 36px rgba(15, 23, 42, 0.08); }
                .ptt-massive.active { background: #EF4444; border-color: #DC2626; color: #FFFFFF; box-shadow: 0 0 36px rgba(239, 68, 68, 0.5); transform: scale(0.96); }
                .ptt-label { font-size: 0.62rem; font-weight: 900; letter-spacing: 0.1em; }
                .burst-history { width: 100%; max-height: 180px; overflow-y: auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 12px; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04); }
                .section-title { font-size: 0.65rem; font-weight: 800; color: #64748B; margin-bottom: 8px; letter-spacing: 0.08em; }
                .burst-list { display: flex; flex-direction: column; gap: 6px; }
                .burst-item { display: flex; justify-content: space-between; align-items: center; background: #F8FAFC; padding: 8px 12px; border-radius: 10px; border: 1px solid #E2E8F0; }
                .burst-sender { font-size: 0.72rem; font-weight: 800; color: #0284C7; }
                .burst-time { font-size: 0.62rem; color: #94A3B8; margin-left: 8px; }
                .btn-play { background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.25); color: #0284C7; padding: 4px 10px; border-radius: 6px; font-size: 0.62rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 4px; }

                /* ── MAP VIEW ── */
                .map-view-modern { flex: 1; position: relative; width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; }
                .map-engine { flex: 1; width: 100%; height: 100%; min-height: 100%; }
                .tactical-light-tiles { filter: contrast(101%) brightness(99%); }
                .map-overlay-stats { position: absolute; top: 14px; left: 14px; background: rgba(255, 255, 255, 0.94); border: 1px solid rgba(226, 232, 240, 0.95); border-radius: 14px; padding: 8px 12px; z-index: 1000; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08); }
                .stat-bit { font-size: 0.65rem; font-weight: 800; color: #334155; display: flex; align-items: center; gap: 6px; }
                .stat-bit-btn { margin-top: 4px; padding: 5px 8px; border-radius: 8px; background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.25); color: #0284C7; font-size: 0.62rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: 0.15s; }
                .stat-bit-btn:hover { background: rgba(2, 132, 199, 0.18); }
                .map-action-bar { position: absolute; bottom: 32px; left: 14px; right: 14px; display: flex; gap: 8px; z-index: 1000; }
                .btn-map-action { flex: 1; padding: 10px 6px; border-radius: 12px; background: rgba(255, 255, 255, 0.95); border: 1px solid #CBD5E1; color: #0F172A; font-size: 0.65rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08); transition: 0.2s; }
                .btn-map-action:hover { background: #FFFFFF; border-color: #0284C7; color: #0284C7; }
                .btn-map-action.broadcast { background: var(--accent-gradient); color: #FFFFFF; border: none; font-weight: 900; box-shadow: 0 4px 16px rgba(2, 132, 199, 0.35); }
                .btn-map-action.broadcast:hover { filter: brightness(1.08); }
                .map-hint-banner { position: absolute; bottom: 8px; left: 14px; right: 14px; background: rgba(255, 255, 255, 0.9); border: 1px solid #E2E8F0; border-radius: 8px; padding: 4px 8px; font-size: 0.58rem; color: #64748B; font-weight: 700; text-align: center; z-index: 1000; pointer-events: none; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05); }
                .pulse-marker-me { width: 16px; height: 16px; background: #0284C7; border: 2px solid #FFFFFF; border-radius: 50%; box-shadow: 0 0 16px rgba(2, 132, 199, 0.85); animation: orbGlow 1.5s infinite; }
                .pulse-marker-peer { width: 14px; height: 14px; border: 2px solid #FFFFFF; border-radius: 50%; background: #0284C7; box-shadow: 0 0 10px rgba(2, 132, 199, 0.6); }
                .pulse-marker-peer.civilian { background: #059669; box-shadow: 0 0 12px rgba(5, 150, 105, 0.7); }
                .pulse-marker-peer.responder { background: #2563EB; box-shadow: 0 0 12px rgba(37, 99, 235, 0.7); }
                .pulse-marker-peer.critical { background: #EF4444 !important; box-shadow: 0 0 18px rgba(239, 68, 68, 0.9) !important; animation: orbGlow 0.8s infinite; }
                .pulse-marker-peer.injured { background: #F59E0B !important; box-shadow: 0 0 14px rgba(245, 158, 11, 0.8) !important; }

                /* ── RESOURCES PANE ── */
                .resources-pane { flex: 1; display: flex; flex-direction: column; padding: 14px; gap: 14px; overflow-y: auto; background: #F8FAFC; }
                .resource-composer { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04); }
                .type-toggles { display: flex; gap: 8px; }
                .toggle-btn { flex: 1; padding: 8px; border-radius: 10px; background: #F1F5F9; border: 1px solid #E2E8F0; color: #64748B; font-size: 0.68rem; font-weight: 800; cursor: pointer; transition: 0.2s; }
                .toggle-btn.active.req { background: rgba(239, 68, 68, 0.08); border-color: #EF4444; color: #EF4444; }
                .toggle-btn.active.off { background: rgba(5, 150, 105, 0.08); border-color: #059669; color: #059669; }
                .resource-input-row { display: flex; gap: 8px; }
                .resource-input-row input { flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 9px 12px; color: #0F172A; font-size: 0.82rem; outline: none; }
                .resource-input-row input::placeholder { color: #94A3B8; }
                .btn-post { background: var(--accent-gradient); border: none; color: #FFFFFF; padding: 9px 16px; border-radius: 10px; font-weight: 800; font-size: 0.72rem; cursor: pointer; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.25); }
                .resources-list { display: flex; flex-direction: column; gap: 8px; }
                .resource-card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 12px 14px; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04); }
                .r-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
                .r-badge { font-size: 0.58rem; font-weight: 900; padding: 3px 8px; border-radius: 6px; }
                .r-badge.request { background: rgba(239, 68, 68, 0.08); color: #EF4444; }
                .r-badge.offer { background: rgba(5, 150, 105, 0.08); color: #059669; }
                .r-node { font-size: 0.62rem; color: #64748B; font-weight: 700; }
                .r-item { font-size: 0.88rem; color: #0F172A; font-weight: 600; }

                /* ── TACTICAL PANE ── */
                .tactical-pane { flex: 1; display: flex; flex-direction: column; padding: 16px; gap: 16px; overflow-y: auto; background: #F8FAFC; }
                .dms-card { background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 18px; padding: 16px; }
                .dms-header { display: flex; justify-content: space-between; align-items: center; }
                .dms-title { font-size: 0.78rem; font-weight: 900; color: #EF4444; }
                .dms-sub { font-size: 0.65rem; color: #64748B; margin-top: 2px; }
                .dms-btn { background: #FFFFFF; border: 1px solid #E2E8F0; color: #0F172A; padding: 7px 16px; border-radius: 10px; font-weight: 800; font-size: 0.68rem; cursor: pointer; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05); }
                .dms-btn.armed { background: #EF4444; border-color: #DC2626; color: #FFFFFF; box-shadow: 0 0 16px rgba(239, 68, 68, 0.4); }
                .dms-select { width: 100%; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 10px; padding: 8px 12px; color: #0F172A; font-size: 0.78rem; margin-top: 10px; }
                .sos-center { text-align: center; }
                .sos-shield { width: 70px; height: 70px; border-radius: 50%; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; color: #EF4444; }
                .sos-headline { font-size: 0.8rem; font-weight: 800; margin-bottom: 12px; color: #475569; }
                .sos-btn { width: 100%; padding: 15px; border-radius: 14px; border: none; font-size: 0.85rem; font-weight: 900; cursor: pointer; margin-bottom: 8px; transition: 0.2s; }
                .sos-btn.critical { background: linear-gradient(135deg, #EF4444, #DC2626); color: #FFFFFF; box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3); }
                .sos-btn.injured { background: linear-gradient(135deg, #F59E0B, #D97706); color: #FFFFFF; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.3); }
                .sos-btn.ok { background: linear-gradient(135deg, #059669, #047857); color: #FFFFFF; box-shadow: 0 4px 16px rgba(5, 150, 105, 0.3); }
                .alerts-feed { display: flex; flex-direction: column; gap: 6px; }
                .alert-item { background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2); padding: 9px 12px; border-radius: 10px; }
                .a-meta { font-size: 0.72rem; font-weight: 800; color: #EF4444; }
                .a-loc { font-size: 0.68rem; color: #64748B; margin-top: 2px; }

                /* ── DIRECT WEBRTC PANE ── */
                .direct-pane { flex: 1; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto; background: #F8FAFC; }
                .direct-header { text-align: center; }
                .direct-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); color: #D97706; padding: 4px 12px; border-radius: 20px; font-size: 0.62rem; font-weight: 800; }
                .direct-sub { font-size: 0.72rem; color: #64748B; margin-top: 6px; }
                .direct-instructions { display: flex; flex-direction: column; gap: 10px; }
                .d-step { display: flex; align-items: center; gap: 10px; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 10px; border-radius: 10px; font-size: 0.75rem; color: #334155; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.03); }
                .d-step .num { width: 22px; height: 22px; border-radius: 50%; background: #F59E0B; color: #FFFFFF; font-weight: 900; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; flex-shrink: 0; }
                .direct-action-btns { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
                .btn-direct-primary { background: var(--accent-gradient); border: none; color: #FFFFFF; padding: 12px; border-radius: 12px; font-weight: 900; font-size: 0.8rem; cursor: pointer; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.22); }
                .btn-direct-secondary { background: #FFFFFF; border: 1px solid #E2E8F0; color: #0F172A; padding: 12px; border-radius: 12px; font-weight: 800; font-size: 0.8rem; cursor: pointer; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.03); }
                .direct-qr-card { display: flex; flex-direction: column; align-items: center; gap: 10px; }
                .direct-qr-image { width: 180px; height: 180px; border-radius: 12px; border: 2px solid #0284C7; }
                .direct-sdp-box { width: 100%; height: 60px; background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 8px; color: #64748B; font-family: monospace; font-size: 0.6rem; padding: 6px; resize: none; }
                .handshake-finish-box { width: 100%; display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
                .direct-connected-view { text-align: center; padding: 20px 0; }
                .direct-ring { width: 70px; height: 70px; border-radius: 50%; background: rgba(5, 150, 105, 0.1); border: 1px solid #059669; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
                .direct-chat-strip { display: flex; gap: 8px; margin-top: 16px; }
                .direct-chat-strip input { flex: 1; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 20px; padding: 8px 14px; color: #0F172A; outline: none; }

                /* ── SYSTEM TICKER ── */
                .system-ticker-live { height: 26px; background: #FFFFFF; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0; display: flex; align-items: center; padding: 0 14px; font-size: 0.58rem; color: #0284C7; font-weight: 700; letter-spacing: 0.08em; overflow: hidden; white-space: nowrap; }

                /* ── BOTTOM NAV ── */
                .bottom-bar-modern { padding: 8px 10px 18px; display: flex; justify-content: space-around; background: rgba(255, 255, 255, 0.98); border-top: 1px solid #E2E8F0; box-shadow: 0 -4px 20px rgba(15, 23, 42, 0.04); }
                .nav-item { background: none; border: none; color: #64748B; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; padding: 6px 8px; border-radius: 10px; transition: 0.2s; min-width: 48px; }
                .nav-item:hover { color: #0F172A; }
                .nav-item.active { color: #0284C7; background: rgba(2, 132, 199, 0.08); }
                .nav-label { font-size: 0.52rem; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; }

                /* ── MODALS ── */
                .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(8px); z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 20px; }
                .modal-window { width: 100%; max-width: 360px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 24px; padding: 24px; box-shadow: 0 24px 60px -8px rgba(15, 23, 42, 0.16); }
                .modal-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; font-weight: 900; color: #0F172A; margin-bottom: 16px; }
                .btn-close { background: none; border: none; color: #64748B; cursor: pointer; }
                .modal-body { display: flex; flex-direction: column; align-items: center; text-align: center; }
                .qr-image { width: 200px; height: 200px; border-radius: 14px; border: 2px solid #0284C7; margin-bottom: 12px; }
                .node-id-display { font-family: monospace; font-size: 0.95rem; font-weight: 800; color: #0284C7; background: #F1F5F9; border: 1px solid #E2E8F0; padding: 6px 14px; border-radius: 8px; margin-bottom: 8px; }
                .qr-hint { font-size: 0.68rem; color: #64748B; line-height: 1.45; }
                .scanner-container { width: 100%; min-height: 240px; margin-bottom: 12px; }
                .btn-cancel { width: 100%; padding: 10px; border-radius: 10px; background: #F1F5F9; border: 1px solid #E2E8F0; color: #475569; font-weight: 800; font-size: 0.75rem; cursor: pointer; }
                .empty-state { font-size: 0.72rem; color: #64748B; text-align: center; padding: 20px 0; }
                .btn-link { background: none; border: none; color: #0284C7; font-size: 0.72rem; cursor: pointer; margin-top: 6px; }
            `}</style>
        </div>
    );
}
