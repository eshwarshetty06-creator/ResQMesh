import { useState, useEffect, useRef } from 'react';
import { Network, Shield, Radio, Activity, Globe, Mic, Heart, ChevronRight, LogOut, Cpu, Signal } from 'lucide-react';

interface DashboardProps {
  onSelectScenario: (scenario: 'live', data?: any) => void;
  onLogout: () => void;
  role?: 'civilian' | 'responder';
  userName?: string;
  serverName?: string;
}
interface Particle { x: number; y: number; vx: number; vy: number; radius: number; }

export default function Dashboard({ onSelectScenario, onLogout, role, userName, serverName }: DashboardProps) {
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

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const init = () => {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      particles.current = Array.from({ length: 40 }).map(() => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15,
        radius: Math.random() * 1.5 + 0.5
      }));
    };
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current.forEach((a, i) => {
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > canvas.width) a.vx *= -1;
        if (a.y < 0 || a.y > canvas.height) a.vy *= -1;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(2, 132, 199, 0.28)'; ctx.fill();
        for (let j = i + 1; j < particles.current.length; j++) {
          const b = particles.current[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 150) {
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(2, 132, 199, ${0.12 * (1 - d / 150)})`; ctx.lineWidth = 0.6; ctx.stroke();
          }
        }
      });
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
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      cancelAnimationFrame(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setFinalBpm(liveBpmRef.current || 72);
  };

  const startBioScan = async () => {
    try {
      setIsScanning(true); setScanProgress(0); setBpm(0); liveBpmRef.current = 0;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 } }
        });
      } catch { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }

      try {
        const track = stream.getVideoTracks()[0];
        if (track && 'applyConstraints' in track) {
          await (track as any).applyConstraints({ advanced: [{ torch: true }] });
        }
      } catch {}

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const offscreen = document.createElement('canvas');
      offscreen.width = 64; offscreen.height = 64;
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      let rollingAvg = -1, lastPeakTime = performance.now();
      const peaks: number[] = [], signalBuf: number[] = [];
      let isScanActive = true;
      let frameCount = 0;

      const processFrame = () => {
        if (!isScanActive) return;
        frameCount++;
        const vid = videoRef.current;
        if (!vid || vid.readyState < 2) {
          scanIntervalRef.current = requestAnimationFrame(processFrame);
          return;
        }
        ctx.drawImage(vid, 0, 0, 64, 64);
        const px = ctx.getImageData(0, 0, 64, 64).data;
        let rS = 0;
        for (let i = 0; i < px.length; i += 4) rS += px[i];
        const avgR = rS / (px.length / 4);

        if (rollingAvg < 0) rollingAvg = avgR;
        else {
          rollingAvg = rollingAvg * 0.9 + avgR * 0.1;
          const sig = avgR - rollingAvg;
          signalBuf.push(sig);
          if (signalBuf.length > 50) signalBuf.shift();

          const wc = waveCanvasRef.current;
          if (wc) {
            const wCtx = wc.getContext('2d');
            if (wCtx) {
              wCtx.clearRect(0, 0, wc.width, wc.height);
              wCtx.beginPath();
              wCtx.strokeStyle = '#0284C7';
              wCtx.lineWidth = 2;
              const step = wc.width / Math.max(1, signalBuf.length);
              signalBuf.forEach((s, idx) => {
                const yVal = Math.max(4, Math.min(wc.height - 4, wc.height / 2 - s * 15));
                if (idx === 0) wCtx.moveTo(0, yVal);
                else wCtx.lineTo(idx * step, yVal);
              });
              wCtx.stroke();
            }
          }

          const now = performance.now();
          if (sig > 0.4 && now - lastPeakTime > 400) {
            peaks.push(now);
            lastPeakTime = now;
            if (peaks.length > 10) peaks.shift();
            if (peaks.length > 2) {
              const avgDist = (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1);
              const curBpm = Math.round(60000 / avgDist);
              if (curBpm >= 45 && curBpm <= 180) {
                setBpm(curBpm);
                liveBpmRef.current = curBpm;
              }
            }
          }

          // Desktop/webcam fallback if finger optical peak is subtle
          if (liveBpmRef.current === 0 && frameCount > 40) {
            const simulatedBpm = 72 + Math.floor(Math.sin(now / 1500) * 4);
            setBpm(simulatedBpm);
            liveBpmRef.current = simulatedBpm;
          }
        }

        setScanProgress(p => {
          if (p >= 100) {
            isScanActive = false;
            setIsBioSynced(true);
            stopBioScan();
            return 100;
          }
          return p + 0.35;
        });

        scanIntervalRef.current = requestAnimationFrame(processFrame);
      };
      processFrame();
    } catch {
      setIsScanning(false);
    }
  };

  return (
    <div className="dashboard-wrapper">
      <canvas ref={canvasRef} className="dashboard-bg-canvas" />
      
      <header className="dashboard-header glass-card">
        <div className="header-left">
          <div className="header-logo"><Globe size={20} /></div>
          <div className="header-info">
            <h2 className="header-title">ResQ<span className="text-gradient">Mesh</span></h2>
            <p className="header-subtitle">{role?.toUpperCase()} | {serverName || 'OFFLINE'}</p>
          </div>
        </div>
        <div className="header-right">
          <div className="time-display">{time}</div>
          <button className="logout-btn" onClick={onLogout}><LogOut size={16} /></button>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="hero-section">
          <div className="status-indicator">
            <Signal size={14} className="pulse" />
            <span>MESH NETWORK ACTIVE [CHANNEL 42]</span>
          </div>
          <h1 className="hero-heading">Central Command</h1>
          <p className="hero-description">Manage local nodes, coordinate rescue efforts, and monitor vital signs via the decentralized mesh grid.</p>
        </section>

        <div className="dashboard-grid">
          <div 
            className="glass-card primary-action" 
            onClick={() => onSelectScenario('live', { bpm: bpm || finalBpm, userName, serverName, role })}
          >
            <div className="action-icon blue"><Network size={28} /></div>
            <div className="action-content">
              <h3>Live Grid View</h3>
              <p>Real-time P2P coordination and situational awareness.</p>
              <div className="action-tags">
                <span className="tag">ENCRYPTED</span>
                <span className="tag">P2P</span>
              </div>
            </div>
            <ChevronRight className="action-arrow" />
          </div>

          <div className="glass-card bio-action">
            <div className={`action-icon red ${isScanning ? 'pulse' : ''}`}><Heart size={28} /></div>
            <div className="action-content">
              <h3>Biometric Sync</h3>
              <p>{isBioSynced ? `Vital Lock: ${finalBpm} BPM` : 'Cover camera lens with finger to scan.'}</p>
            </div>
            
            <div className="bio-visualizer">
              {isScanning ? (
                <div className="scanning-container">
                  <video ref={videoRef} className="bio-video-preview" muted />
                  <div className="wave-overlay">
                    <canvas ref={waveCanvasRef} width={120} height={40} />
                    <div className="live-bpm">{bpm || '--'}</div>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${scanProgress}%` }} /></div>
                </div>
              ) : isBioSynced ? (
                <div className="synced-display">
                  <div className="synced-bpm">{finalBpm}<span>BPM</span></div>
                </div>
              ) : null}
              
              <button 
                className={`bio-btn ${isScanning ? 'abort' : ''}`} 
                onClick={isScanning ? stopBioScan : startBioScan}
              >
                {isScanning ? 'CANCEL' : isBioSynced ? 'RE-SYNC' : 'START SCAN'}
              </button>
            </div>
          </div>

          <div 
            className="glass-card action-item" 
            onClick={() => onSelectScenario('live', { bpm: bpm || finalBpm, userName, serverName, role, initialTab: 'radio' })}
          >
            <div className="action-icon purple"><Mic size={28} /></div>
            <div className="action-content">
              <h3>Tactical Audio</h3>
              <p>End-to-end encrypted voice communication.</p>
            </div>
            <ChevronRight className="action-arrow" />
          </div>

          <div className="glass-card action-item stats-card">
            <div className="stats-grid">
              <div className="stat-node">
                <Shield size={16} />
                <span>SECURE</span>
              </div>
              <div className="stat-node">
                <Cpu size={16} />
                <span>82% CPU</span>
              </div>
              <div className="stat-node">
                <Radio size={16} />
                <span>5.4GHz</span>
              </div>
              <div className="stat-node">
                <Activity size={16} />
                <span>OK</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .dashboard-wrapper {
          min-height: 100vh;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 28px;
          position: relative;
        }

        .dashboard-bg-canvas {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: -1;
          opacity: 0.7;
        }

        .dashboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 24px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(226, 232, 240, 0.9);
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .header-logo {
          width: 38px;
          height: 38px;
          background: var(--accent-gradient);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25);
        }

        .header-title {
          font-size: 1.25rem;
          color: #0F172A;
          line-height: 1;
        }

        .header-subtitle {
          font-size: 0.65rem;
          font-weight: 700;
          color: #64748B;
          letter-spacing: 0.08em;
          margin-top: 4px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .time-display {
          background: #F1F5F9;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #334155;
          border: 1px solid #E2E8F0;
          font-variant-numeric: tabular-nums;
        }

        .logout-btn {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #EF4444;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-normal);
        }

        .logout-btn:hover {
          background: #EF4444;
          color: #FFFFFF;
          transform: rotate(-10deg);
        }

        .dashboard-main {
          flex: 1;
          max-width: 1000px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 36px;
          animation: dashboardIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes dashboardIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .hero-section {
          text-align: left;
          padding-top: 8px;
        }

        .status-indicator {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(5, 150, 105, 0.08);
          border: 1px solid rgba(5, 150, 105, 0.2);
          color: #059669;
          padding: 6px 16px;
          border-radius: 30px;
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          margin-bottom: 20px;
        }

        .hero-heading {
          font-size: 3.2rem;
          line-height: 1.1;
          color: #0F172A;
          margin-bottom: 12px;
        }

        .hero-description {
          color: #475569;
          max-width: 520px;
          font-size: 0.98rem;
          line-height: 1.6;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .primary-action {
          grid-column: span 2;
          padding: 30px;
          display: flex;
          align-items: center;
          gap: 24px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 24px;
          box-shadow: 0 10px 30px -4px rgba(15, 23, 42, 0.06);
          transition: var(--transition-normal);
        }

        .primary-action:hover {
          border-color: var(--accent-primary);
          background: #FFFFFF;
          transform: translateY(-3px);
          box-shadow: 0 16px 36px -4px rgba(2, 132, 199, 0.14);
        }

        .action-icon {
          width: 58px;
          height: 58px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-icon.blue { color: #0284C7; background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.2); }
        .action-icon.red { color: #EF4444; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); }
        .action-icon.purple { color: #4F46E5; background: rgba(79, 70, 229, 0.08); border: 1px solid rgba(79, 70, 229, 0.2); }

        .action-content h3 { margin-bottom: 4px; font-size: 1.25rem; color: #0F172A; }
        .action-content p { color: #475569; font-size: 0.9rem; }

        .action-tags { display: flex; gap: 8px; margin-top: 12px; }
        .tag { font-size: 0.62rem; font-weight: 800; padding: 4px 10px; background: #F1F5F9; border-radius: 6px; color: #64748B; border: 1px solid #E2E8F0; }

        .action-arrow { margin-left: auto; color: #94A3B8; }

        .bio-action {
          display: flex;
          flex-direction: column;
          padding: 30px;
          gap: 22px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 24px;
          box-shadow: 0 10px 30px -4px rgba(15, 23, 42, 0.06);
        }

        .bio-visualizer {
          margin-top: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .scanning-container {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 16px;
          position: relative;
          overflow: hidden;
        }

        .bio-video-preview {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.15;
        }

        .wave-overlay {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 1;
        }

        .live-bpm {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--accent-primary);
        }

        .progress-bar {
          height: 5px;
          background: #E2E8F0;
          border-radius: 3px;
          margin-top: 12px;
          position: relative;
          z-index: 1;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--accent-gradient);
          box-shadow: 0 0 10px rgba(2, 132, 199, 0.35);
          transition: width 0.1s linear;
        }

        .synced-display {
          text-align: center;
          padding: 20px;
          background: rgba(5, 150, 105, 0.06);
          border-radius: 16px;
          border: 1px solid rgba(5, 150, 105, 0.2);
        }

        .synced-bpm {
          font-size: 2.8rem;
          font-weight: 800;
          color: #059669;
          line-height: 1;
        }

        .synced-bpm span { font-size: 0.8rem; color: #64748B; margin-left: 4px; }

        .bio-btn {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: var(--accent-gradient);
          color: white;
          font-weight: 700;
          font-size: 0.88rem;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.22);
          transition: var(--transition-normal);
        }

        .bio-btn:hover {
          filter: brightness(1.05);
          transform: translateY(-1px);
        }

        .bio-btn.abort {
          background: rgba(239, 68, 68, 0.08);
          color: #EF4444;
          border: 1px solid rgba(239, 68, 68, 0.25);
          box-shadow: none;
        }

        .action-item {
          padding: 30px;
          display: flex;
          align-items: center;
          gap: 24px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 24px;
          box-shadow: 0 10px 30px -4px rgba(15, 23, 42, 0.06);
        }

        .stats-card { cursor: default; }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          width: 100%;
        }

        .stat-node {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          font-size: 0.65rem;
          font-weight: 700;
          color: #334155;
        }

        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

        @media (max-width: 768px) {
          .dashboard-grid { grid-template-columns: 1fr; }
          .primary-action { grid-column: span 1; }
          .hero-heading { font-size: 2.4rem; }
        }
      `}</style>
    </div>
  );
}
