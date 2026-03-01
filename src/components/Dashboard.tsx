import { useState, useEffect, useRef } from 'react';
import { Network, Shield, Radio, Activity, Globe, Mic, Heart, Zap, ChevronRight } from 'lucide-react';
import '../App.css';

interface DashboardProps {
  onSelectScenario: (scenario: 'live', data?: any) => void;
}
interface Particle { x: number; y: number; vx: number; vy: number; radius: number; }

export default function Dashboard({ onSelectScenario }: DashboardProps) {
  const [nodeHovered, setNodeHovered] = useState(false);
  const [voiceHovered, setVoiceHovered] = useState(false);
  const [bioHovered, setBioHovered] = useState(false);
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [isScanning, setIsScanning] = useState(false);
  const [isBioSynced, setIsBioSynced] = useState(false);
  const [bpm, setBpm] = useState(0);
  const [finalBpm, setFinalBpm] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const particles = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const scanIntervalRef = useRef<any>(null);
  const liveBpmRef = useRef(0);

  // Subtle particle background
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const init = () => {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      particles.current = Array.from({ length: 60 }).map(() => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
        radius: Math.random() * 2 + 1
      }));
    };
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.current.length; i++) {
        const a = particles.current[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > canvas.width) a.vx *= -1;
        if (a.y < 0 || a.y > canvas.height) a.vy *= -1;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59,130,246,0.12)'; ctx.fill();
        for (let j = i + 1; j < particles.current.length; j++) {
          const b = particles.current[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 120) {
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(59,130,246,${0.05 * (1 - d / 120)})`; ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    init(); animate();
    window.addEventListener('resize', init);
    return () => { window.removeEventListener('resize', init); cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const stopBioScan = () => {
    setIsScanning(false);
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setFinalBpm(liveBpmRef.current);
  };

  const startBioScan = async () => {
    try {
      setIsScanning(true); setScanProgress(0); setBpm(0); liveBpmRef.current = 0;
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 } } }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
      try { await (stream.getVideoTracks()[0] as any).applyConstraints({ advanced: [{ torch: true }] }); } catch { /**/ }
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); setIsScanning(false); return; }
      video.srcObject = stream;
      await new Promise<void>(res => { video.onloadeddata = () => res(); video.play().catch(() => { }); setTimeout(res, 3000); });
      await new Promise<void>(res => setTimeout(res, 600));
      const offscreen = document.createElement('canvas'); offscreen.width = 64; offscreen.height = 64;
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!ctx) { stream.getTracks().forEach(t => t.stop()); setIsScanning(false); return; }
      let rollingAvg = -1, lastPeakTime = performance.now(), peaks: number[] = [], bpmHistory: number[] = [],
        signalBuf: number[] = [], maxSig = 0.05, beatOn = false, warmFrames = 0, frameCount = 0;

      scanIntervalRef.current = setInterval(() => {
        frameCount++;
        const vid = videoRef.current; if (!vid || vid.readyState < 2) return;
        setScanProgress(p => { const n = p + 0.18; if (n >= 100) { setIsBioSynced(true); stopBioScan(); return 100; } return n; });
        try { ctx.drawImage(vid, 0, 0, 64, 64); } catch { return; }
        const px = ctx.getImageData(0, 0, 64, 64).data; let rS = 0, gS = 0, bS = 0;
        for (let i = 0; i < px.length; i += 4) { rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; }
        const N = 64 * 64, avgR = rS / N, avgG = gS / N, avgB = bS / N, bright = (avgR + avgG + avgB) / 3;
        const fp = (avgR > 100 && avgR > avgG * 1.4 && avgR > avgB * 1.6) || (bright < 80 && avgR >= avgG && avgR >= avgB && avgR > 5) || (bright < 35 && bright > 0.5);
        if (!fp) { warmFrames = 0; rollingAvg = -1; peaks = []; signalBuf = []; maxSig = 0.05; beatOn = false; }
        else {
          warmFrames++;
          if (warmFrames >= 12) {
            if (rollingAvg < 0) rollingAvg = avgR;
            else {
              rollingAvg = rollingAvg * 0.87 + avgR * 0.13; const sig = avgR - rollingAvg;
              signalBuf.push(sig); if (signalBuf.length > 80) signalBuf.shift();
              const wc = waveCanvasRef.current;
              if (wc) { const wCtx = wc.getContext('2d'); if (wCtx) { wCtx.clearRect(0, 0, wc.width, wc.height); wCtx.beginPath(); wCtx.strokeStyle = '#EF4444'; wCtx.lineWidth = 2; wCtx.lineJoin = 'round'; const step = wc.width / Math.max(signalBuf.length, 1); signalBuf.forEach((s, idx) => { const x = idx * step, y = wc.height / 2 - s * 150; idx === 0 ? wCtx.moveTo(x, y) : wCtx.lineTo(x, y); }); wCtx.stroke(); } }
              const abs = Math.abs(sig); if (abs > maxSig) maxSig = abs; else maxSig *= 0.998;
              const thresh = Math.max(maxSig * 0.28, 0.008), hyst = Math.max(maxSig * 0.06, 0.003), now = performance.now();
              if (!beatOn && sig > thresh && now - lastPeakTime > 320) { peaks.push(now); lastPeakTime = now; beatOn = true; if (peaks.length > 20) peaks.shift(); const l = document.querySelector('.bio-bpm-label'); if (l) { l.classList.add('bpm-flash'); setTimeout(() => l.classList.remove('bpm-flash'), 120); } }
              else if (beatOn && sig < hyst) beatOn = false;
              if (peaks.length >= 3) { const ivs: number[] = []; for (let i = 1; i < peaks.length; i++) { const g = peaks[i] - peaks[i - 1]; if (g >= 300 && g <= 1600) ivs.push(g); } if (ivs.length >= 2) { const s = [...ivs].sort((a, b) => a - b); const t2 = s.length > 4 ? s.slice(1, -1) : s; const m = t2.reduce((a, b) => a + b, 0) / t2.length; const raw = Math.round(60000 / m); if (raw >= 40 && raw <= 200) { bpmHistory.push(raw); if (bpmHistory.length > 10) bpmHistory.shift(); const ws = bpmHistory.reduce((acc, v, i) => acc + v * (i + 1), 0); const wt = bpmHistory.reduce((acc, _, i) => acc + i + 1, 0); setBpm(Math.round(ws / wt)); liveBpmRef.current = Math.round(ws / wt); } } }
            }
          } else rollingAvg = avgR;
        }
        // No finger detected after 5s → keep showing SCANNING... (no fake BPM)
      }, 33);
    } catch (err: any) { console.error(err); setIsScanning(false); alert(`Camera error: ${err?.message || err}`); }
  };

  return (
    <div className="db-root">
      <canvas ref={canvasRef} className="db-canvas" />

      {/* Header */}
      <header className="db-header">
        <div className="db-brand">
          <div className="db-logo"><Globe size={20} color="#fff" /></div>
          <div>
            <div className="db-brand-name">ResQ<span className="db-brand-accent">Mesh</span></div>
            <div className="db-brand-sub">Emergency Protocol</div>
          </div>
        </div>
        <div className="db-time-pill">{time}</div>
      </header>

      {/* Hero */}
      <section className="db-hero">
        <div className="db-hero-badge"><Zap size={12} /> TACTICAL MESH NETWORK</div>
        <h1 className="db-hero-title">Emergency<br />Command Hub</h1>
        <p className="db-hero-sub">Deploy P2P mesh nodes, sync biometrics, and coordinate response teams — offline capable.</p>
      </section>

      {/* Cards */}
      <div className="db-cards">

        {/* Emergency Node Card */}
        <div className={`db-card ${nodeHovered ? 'db-card--active' : ''}`}
          onMouseEnter={() => setNodeHovered(true)} onMouseLeave={() => setNodeHovered(false)}
          onClick={() => onSelectScenario('live', { bpm: bpm || finalBpm })}>
          <div className="db-card-icon db-card-icon--blue"><Network size={22} color="#3B82F6" /></div>
          <div className="db-card-body">
            <div className="db-card-label">COMMAND CONSOLE</div>
            <div className="db-card-title">Emergency Node</div>
            <div className="db-card-desc">Deploy as a mesh relay. P2P messaging, GPS coordination, encrypted channels.</div>
          </div>
          <div className="db-card-arrow"><ChevronRight size={18} /></div>
          <div className="db-card-footer">
            <span className="db-chip db-chip--blue">AES-256</span>
            <span className="db-chip db-chip--blue">P2P v4.1</span>
            <span className="db-badge db-badge--green">READY</span>
          </div>
        </div>

        {/* Bio Scanner Card */}
        <div className={`db-card ${bioHovered ? 'db-card--active db-card--red' : ''}`}
          onMouseEnter={() => setBioHovered(true)} onMouseLeave={() => setBioHovered(false)}>
          <div className="db-card-icon db-card-icon--red"><Heart size={22} color="#EF4444" /></div>
          <div className="db-card-body">
            <div className="db-card-label">BIO-SCANNER</div>
            <div className="db-card-title">{isBioSynced ? 'Vitals Synced' : 'Biometric Sync'}</div>
            <div className="db-card-desc">
              {isBioSynced
                ? `Heart rate locked: ${finalBpm} BPM — encrypted into mesh protocol.`
                : 'Cover rear camera lens with fingertip. Hold still for 17 seconds.'}
            </div>
          </div>
          {isBioSynced && <div className="db-bpm-circle"><span className="db-bpm-val">{finalBpm}</span><span className="db-bpm-unit">BPM</span></div>}

          {isScanning && (
            <div className="db-scan-view">
              <video ref={videoRef} className="db-scan-video" muted playsInline />
              <div className="db-scan-overlay">
                <canvas ref={waveCanvasRef} className="db-wave-canvas" width={160} height={48} />
                <div className="db-bpm-live">
                  <span className="db-bpm-live-val">{bpm || '--'}</span>
                  <span className="bio-bpm-label db-bpm-live-lbl">{bpm ? 'BPM LIVE' : 'SCANNING...'}</span>
                </div>
              </div>
            </div>
          )}

          {isScanning && (
            <div className="db-progress-track">
              <div className="db-progress-fill" style={{ width: `${scanProgress}%` }} />
            </div>
          )}

          <button className={`db-bio-btn ${isScanning ? 'db-bio-btn--abort' : isBioSynced ? 'db-bio-btn--resync' : 'db-bio-btn--start'}`}
            onClick={e => { e.stopPropagation(); isScanning ? stopBioScan() : startBioScan(); }}>
            {isScanning ? '✕ Abort Scan' : isBioSynced ? '↺ Re-sync Vitals' : '♥ Start Bio-Scan'}
          </button>

          <div className="db-card-footer">
            <span className="db-chip db-chip--red">PPG Sensor</span>
            <span className="db-badge" style={isBioSynced ? { background: '#ECFDF5', color: '#10B981', borderColor: '#A7F3D0' } : {}}>{isBioSynced ? 'SYNCED' : 'STANDBY'}</span>
          </div>
        </div>

        {/* Voice Card */}
        <div className={`db-card ${voiceHovered ? 'db-card--active db-card--purple' : ''}`}
          onMouseEnter={() => setVoiceHovered(true)} onMouseLeave={() => setVoiceHovered(false)}
          onClick={() => onSelectScenario('live', { bpm: bpm || finalBpm })}>
          <div className="db-card-icon db-card-icon--purple"><Mic size={22} color="#8B5CF6" /></div>
          <div className="db-card-body">
            <div className="db-card-label">VOICE COMMS</div>
            <div className="db-card-title">Tactical PTT</div>
            <div className="db-card-desc">Push-to-Talk radio. Encrypted Opus audio relay across the mesh network.</div>
          </div>
          <div className="db-card-arrow"><ChevronRight size={18} /></div>
          <div className="db-card-footer">
            <span className="db-chip db-chip--purple">Opus Codec</span>
            <span className="db-chip db-chip--purple">PTT v1.0</span>
          </div>
        </div>

      </div>

      {/* Status Strip */}
      <div className="db-status-strip">
        <div className="db-stat"><Network size={14} color="#3B82F6" /><span>Mesh Ready</span></div>
        <div className="db-stat"><Shield size={14} color="#10B981" /><span>AES-256 Armed</span></div>
        <div className="db-stat"><Radio size={14} color="#8B5CF6" /><span>2.4 / 5 GHz</span></div>
        <div className="db-stat"><Activity size={14} color="#EF4444" /><span>{isBioSynced ? `${finalBpm} BPM` : 'Bio Off'}</span></div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@400;600;700;800;900&display=swap');

        * { box-sizing: border-box; }

        .db-root {
          min-height: 100vh;
          background: #07090F;
          font-family: 'Outfit', 'Inter', sans-serif;
          color: #E8EDF8;
          position: relative;
          overflow-x: hidden;
        }
        /* Ambient background orbs */
        .db-root::before {
          content: '';
          position: fixed;
          top: -200px; left: -200px;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 65%);
          pointer-events: none; z-index: 0;
          animation: floatOrb 12s ease-in-out infinite alternate;
        }
        .db-root::after {
          content: '';
          position: fixed;
          bottom: -150px; right: -150px;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 65%);
          pointer-events: none; z-index: 0;
          animation: floatOrb 16s ease-in-out infinite alternate-reverse;
        }
        @keyframes floatOrb { 0%{transform:translate(0,0)} 100%{transform:translate(60px,40px)} }

        .db-canvas { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.5; }

        /* ── HEADER ── */
        .db-header {
          position: relative; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 24px;
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .db-brand { display: flex; align-items: center; gap: 12px; }
        .db-logo {
          width: 42px; height: 42px;
          background: linear-gradient(135deg, #3B82F6, #6366F1);
          border-radius: 13px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 24px rgba(99,102,241,0.50), 0 4px 12px rgba(0,0,0,0.3);
        }
        .db-brand-name { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.03em; color: #F1F5F9; }
        .db-brand-accent { background: linear-gradient(135deg, #60A5FA, #A78BFA); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .db-brand-sub { font-size: 0.58rem; color: #475569; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 1px; }
        .db-time-pill {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          padding: 6px 14px; border-radius: 20px;
          font-size: 0.72rem; font-weight: 700; color: #94A3B8;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.04em;
        }

        /* ── HERO ── */
        .db-hero { position: relative; z-index: 10; padding: 44px 24px 28px; }
        .db-hero-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(59,130,246,0.12);
          border: 1px solid rgba(59,130,246,0.30);
          color: #60A5FA;
          padding: 6px 14px; border-radius: 20px;
          font-size: 0.6rem; font-weight: 800; letter-spacing: 0.15em;
          margin-bottom: 20px;
          text-transform: uppercase;
        }
        .db-hero-title {
          font-size: 2.8rem; font-weight: 900; letter-spacing: -0.04em; line-height: 1.05;
          margin: 0 0 16px;
          background: linear-gradient(135deg, #F1F5F9 0%, #93C5FD 50%, #C4B5FD 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .db-hero-sub { font-size: 0.88rem; color: #64748B; line-height: 1.65; max-width: 380px; margin: 0; }

        /* ── CARDS ── */
        .db-cards { position: relative; z-index: 10; padding: 8px 20px 24px; display: flex; flex-direction: column; gap: 14px; }

        .db-card {
          position: relative;
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px; padding: 22px;
          transition: all 0.28s cubic-bezier(0.4,0,0.2,1);
          cursor: pointer;
          overflow: hidden;
        }
        .db-card::before {
          content: ''; position: absolute; inset: 0; border-radius: 24px;
          background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%);
          pointer-events: none;
        }
        .db-card:hover {
          transform: translateY(-3px);
          border-color: rgba(99,102,241,0.30);
          box-shadow: 0 0 0 1px rgba(99,102,241,0.15), 0 20px 40px rgba(0,0,0,0.30);
        }
        .db-card--active { border-color: rgba(59,130,246,0.35) !important; box-shadow: 0 0 0 1px rgba(59,130,246,0.20), 0 16px 40px rgba(0,0,0,0.25) !important; }
        .db-card--red.db-card--active { border-color: rgba(239,68,68,0.30) !important; box-shadow: 0 0 0 1px rgba(239,68,68,0.15), 0 16px 40px rgba(0,0,0,0.25) !important; }
        .db-card--purple.db-card--active { border-color: rgba(139,92,246,0.30) !important; box-shadow: 0 0 0 1px rgba(139,92,246,0.15), 0 16px 40px rgba(0,0,0,0.25) !important; }

        .db-card-icon { width: 50px; height: 50px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; }
        .db-card-icon--blue { background: rgba(59,130,246,0.15); box-shadow: 0 4px 16px rgba(59,130,246,0.18); }
        .db-card-icon--red { background: rgba(239,68,68,0.15); box-shadow: 0 4px 16px rgba(239,68,68,0.15); }
        .db-card-icon--purple { background: rgba(139,92,246,0.15); box-shadow: 0 4px 16px rgba(139,92,246,0.15); }

        .db-card-body { margin-bottom: 18px; }
        .db-card-label { font-size: 0.55rem; font-weight: 800; letter-spacing: 0.22em; color: #475569; margin-bottom: 6px; text-transform: uppercase; }
        .db-card-title { font-size: 1.2rem; font-weight: 800; color: #F1F5F9; margin-bottom: 8px; letter-spacing: -0.02em; }
        .db-card-desc { font-size: 0.8rem; color: #64748B; line-height: 1.6; }
        .db-card-arrow { position: absolute; right: 22px; top: 22px; color: #334155; }

        .db-card-footer { display: flex; align-items: center; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
        .db-chip { font-size: 0.58rem; font-weight: 700; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.08em; border: 1px solid transparent; text-transform: uppercase; }
        .db-chip--blue { background: rgba(59,130,246,0.12); color: #60A5FA; border-color: rgba(59,130,246,0.25); }
        .db-chip--red { background: rgba(239,68,68,0.12); color: #F87171; border-color: rgba(239,68,68,0.25); }
        .db-chip--purple { background: rgba(139,92,246,0.12); color: #A78BFA; border-color: rgba(139,92,246,0.25); }
        .db-badge { font-size: 0.58rem; font-weight: 800; padding: 4px 12px; border-radius: 20px; letter-spacing: 0.12em; border: 1px solid transparent; margin-left: auto; text-transform: uppercase; }
        .db-badge--green { background: rgba(16,185,129,0.12); color: #34D399; border-color: rgba(16,185,129,0.30); box-shadow: 0 0 12px rgba(16,185,129,0.20); }

        /* ── BIO SCANNER ── */
        .db-bpm-circle {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 76px; height: 76px; border-radius: 50%;
          border: 2px solid rgba(239,68,68,0.40);
          background: rgba(239,68,68,0.10);
          margin: 14px auto;
          box-shadow: 0 0 24px rgba(239,68,68,0.25);
          animation: bioGlow 2s ease-in-out infinite alternate;
        }
        @keyframes bioGlow { 0%{box-shadow:0 0 16px rgba(239,68,68,0.20)} 100%{box-shadow:0 0 32px rgba(239,68,68,0.45)} }
        .db-bpm-val { font-size: 1.7rem; font-weight: 900; color: #F87171; line-height: 1; }
        .db-bpm-unit { font-size: 0.55rem; color: #EF4444; font-weight: 700; margin-top: 2px; letter-spacing: 0.08em; }

        .db-scan-view { position: relative; border-radius: 16px; overflow: hidden; height: 120px; margin: 12px 0; background: #000; border: 1px solid rgba(239,68,68,0.20); }
        .db-scan-video { width: 100%; height: 100%; object-fit: cover; opacity: 0.35; filter: sepia(1) hue-rotate(-40deg) saturate(2); }
        .db-scan-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 16px; }
        .db-wave-canvas { border-radius: 8px; }
        .db-bpm-live { background: rgba(15,23,42,0.90); border: 1px solid rgba(239,68,68,0.30); border-radius: 10px; padding: 6px 12px; text-align: center; box-shadow: 0 0 16px rgba(239,68,68,0.15); }
        .db-bpm-live-val { font-size: 1.4rem; font-weight: 900; color: #F87171; display: block; line-height: 1; }
        .db-bpm-live-lbl { font-size: 0.5rem; font-weight: 700; color: #475569; letter-spacing: 0.12em; display: block; margin-top: 2px; text-transform: uppercase; }
        .bpm-flash { color: #F87171 !important; }

        .db-progress-track { height: 3px; background: rgba(239,68,68,0.12); border-radius: 4px; overflow: hidden; margin: 8px 0 12px; }
        .db-progress-fill { height: 100%; background: linear-gradient(90deg, #F87171, #EF4444); border-radius: 4px; transition: width 0.1s linear; box-shadow: 0 0 8px rgba(239,68,68,0.60); }

        .db-bio-btn { width: 100%; padding: 13px; border-radius: 14px; border: none; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-bottom: 4px; letter-spacing: 0.02em; }
        .db-bio-btn--start { background: rgba(239,68,68,0.12); color: #F87171; border: 1.5px solid rgba(239,68,68,0.30); }
        .db-bio-btn--start:hover { background: rgba(239,68,68,0.22); box-shadow: 0 0 20px rgba(239,68,68,0.20); }
        .db-bio-btn--abort { background: linear-gradient(135deg, #EF4444, #DC2626); color: #fff; box-shadow: 0 4px 16px rgba(239,68,68,0.40); }
        .db-bio-btn--resync { background: rgba(16,185,129,0.12); color: #34D399; border: 1.5px solid rgba(16,185,129,0.30); }
        .db-bio-btn--resync:hover { background: rgba(16,185,129,0.22); box-shadow: 0 0 20px rgba(16,185,129,0.20); }

        /* ── STATUS STRIP ── */
        .db-status-strip {
          position: relative; z-index: 10;
          display: flex; justify-content: space-around;
          padding: 16px 24px 36px;
          background: rgba(255,255,255,0.02);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .db-stat { display: flex; align-items: center; gap: 6px; font-size: 0.68rem; font-weight: 600; color: #475569; }
        .db-stat span { color: #64748B; }
      `}</style>
    </div>
  );
}
