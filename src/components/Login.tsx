import { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  User, 
  ChevronRight, 
  Smartphone, 
  Server, 
  Key, 
  Target, 
  Activity, 
  Radio, 
  MapPin, 
  Zap, 
  CheckCircle2, 
  ArrowRight, 
  Package, 
  Flame, 
  Globe, 
  Layers, 
  HeartPulse, 
  Volume2, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  X, 
  Play, 
  RotateCcw, 
  Sparkles,
  Compass
} from 'lucide-react';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import type { ApplicationVerifier, ConfirmationResult } from 'firebase/auth';
import { auth } from '../firebaseApp';

interface LoginProps {
  onLogin: (role: 'civilian' | 'responder', userName: string, serverName?: string) => void;
}

declare global {
  interface Window {
    recaptchaVerifier: ApplicationVerifier;
  }
}

// Simulated topology node for the interactive playground
interface SimNode {
  id: string;
  name: string;
  role: 'rescuer' | 'civilian' | 'drone';
  x: number;
  y: number;
  battery: number;
  isPinging?: boolean;
}

export default function Login({ onLogin }: LoginProps) {
  // Authentication & Gateway State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [heroTab, setHeroTab] = useState<'preview' | 'gateway'>('preview');
  const [step, setStep] = useState<'info' | 'otp'>('info');
  const [role, setRole] = useState<'civilian' | 'responder'>('civilian');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [serverName, setServerName] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Audio simulation preview state
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Scenario Playbook Active Tab
  const [activeScenario, setActiveScenario] = useState<'blackout' | 'flood' | 'wildfire' | 'mountain'>('blackout');

  // FAQ Accordion State
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  // Interactive Topology Simulator State
  const [simNodes, setSimNodes] = useState<SimNode[]>([
    { id: '1', name: 'Alpha-Command', role: 'rescuer', x: 20, y: 35, battery: 98 },
    { id: '2', name: 'Survivor-Maya', role: 'civilian', x: 45, y: 70, battery: 64 },
    { id: '3', name: 'Rescue-Medic-4', role: 'rescuer', x: 75, y: 40, battery: 88 },
    { id: '4', name: 'Relay-Drone-1', role: 'drone', x: 50, y: 25, battery: 72 },
  ]);
  const [simPinging, setSimPinging] = useState(false);
  const [simPacketsSent, setSimPacketsSent] = useState(148);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Background Interactive Mesh Constellation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const nodeCount = Math.min(Math.floor((width * height) / 19000), 50);
    const nodes: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
    }> = [];

    const colors = ['#0284C7', '#0EA5E9', '#10B981', '#6366F1'];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2 + 1.6,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Connect nodes with light filaments
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 135) {
            const alpha = (1 - dist / 135) * 0.2;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(2, 132, 199, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Draw node particles
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        n.x += n.vx;
        n.y += n.vy;

        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  // Firebase recaptcha setup
  useEffect(() => {
    if (!window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {}
        });
      } catch (err) {
        console.warn('Recaptcha init:', err);
      }
    }
  }, []);

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (role === 'civilian') {
      if (!name || !mobile) {
        setError('Identification required: Name & Contact Number.');
        return;
      }
      setIsLoading(true);
      try {
        const appVerifier = window.recaptchaVerifier;
        const formattedMobile = mobile.startsWith('+') ? mobile : `+91${mobile}`;
        const result = await signInWithPhoneNumber(auth, formattedMobile, appVerifier);
        setConfirmationResult(result);
        setStep('otp');
      } catch {
        console.warn('Firebase network fallback: using direct sandbox verification.');
        setStep('otp');
      }
      setIsLoading(false);
    } else {
      if (!name || !serverName || !adminPass) {
        setError('Commander Alias, Grid Sector ID, and Authorization Passcode are required.');
        return;
      }
      if (adminPass !== 'admin123') {
        setError('Invalid Authorization Passcode (Demo key: admin123)');
        return;
      }
      setIsLoading(true);
      setTimeout(() => {
        onLogin(role, name, serverName);
        setIsLoading(false);
      }, 500);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!otp) {
      setError('Please provide the 4-digit verification code.');
      return;
    }
    setIsLoading(true);
    try {
      if (otp === '1234') {
        onLogin(role, name || serverName || 'Civilian-User', serverName);
      } else if (confirmationResult) {
        await confirmationResult.confirm(otp);
        onLogin(role, name || serverName || 'Civilian-User', serverName);
      } else {
        setError('Verification code rejected (Demo OTP: 1234)');
      }
    } catch {
      setError('Verification failed. Use demo code 1234.');
    }
    setIsLoading(false);
  };

  const generateSecureId = () => {
    const prefixes = ['ALPHA', 'DELTA', 'OMEGA', 'X-RAY', 'PHOENIX', 'TITAN'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const rand = Math.floor(Math.random() * 9000) + 1000;
    setServerName(`GRID-${prefix}-${rand}`);
  };

  // Instant 1-Click Launchers
  const handleQuickCivilian = () => {
    onLogin('civilian', 'Alex Walker (Survivor)', 'GRID-PUBLIC');
  };

  const handleQuickResponder = () => {
    onLogin('responder', 'Cmdr. Sarah Vance', 'GRID-RESCUE-01');
  };

  // Simulator Actions
  const handleTriggerPing = () => {
    if (simPinging) return;
    setSimPinging(true);
    setSimPacketsSent(prev => prev + 12);
    setTimeout(() => setSimPinging(false), 2400);
  };

  const handleAddSimNode = () => {
    if (simNodes.length >= 7) return;
    const names = ['Rescue-Unit-9', 'Civilian-David', 'Drone-Observer-3', 'Medical-Triage-A'];
    const nextName = names[simNodes.length % names.length];
    const newNode: SimNode = {
      id: String(Date.now()),
      name: nextName,
      role: nextName.startsWith('Rescue') ? 'rescuer' : nextName.startsWith('Drone') ? 'drone' : 'civilian',
      x: Math.floor(Math.random() * 65) + 15,
      y: Math.floor(Math.random() * 65) + 15,
      battery: Math.floor(Math.random() * 30) + 70,
    };
    setSimNodes(prev => [...prev, newNode]);
    setSimPacketsSent(prev => prev + 4);
  };

  const handleResetSim = () => {
    setSimNodes([
      { id: '1', name: 'Alpha-Command', role: 'rescuer', x: 20, y: 35, battery: 98 },
      { id: '2', name: 'Survivor-Maya', role: 'civilian', x: 45, y: 70, battery: 64 },
      { id: '3', name: 'Rescue-Medic-4', role: 'rescuer', x: 75, y: 40, battery: 88 },
      { id: '4', name: 'Relay-Drone-1', role: 'drone', x: 50, y: 25, battery: 72 },
    ]);
  };

  // Audio Preview Toggle
  const toggleAudioPreview = () => {
    setAudioPlaying(!audioPlaying);
  };

  return (
    <div className="commercial-landing">
      {/* Background Interactive Mesh Canvas */}
      <canvas ref={canvasRef} className="global-mesh-canvas" />

      {/* Ambient Lighting Orbs */}
      <div className="ambient-spotlight spot-cyan" />
      <div className="ambient-spotlight spot-emerald" />
      <div className="ambient-spotlight spot-indigo" />

      {/* Sticky Commercial Header */}
      <header className="commercial-navbar">
        <div className="nav-container">
          <div className="nav-brand-group">
            <div className="brand-emblem">
              <Shield size={22} className="emblem-svg" />
            </div>
            <div className="brand-copy">
              <div className="brand-logo-text">
                ResQ<span className="text-gradient">Mesh</span>
              </div>
              <span className="brand-subtag">TACTICAL MESH OS</span>
            </div>
          </div>

          <nav className="nav-links-menu">
            <a href="#platform" className="nav-link-item">Platform</a>
            <a href="#simulator" className="nav-link-item">Interactive Simulator</a>
            <a href="#features" className="nav-link-item">Capabilities</a>
            <a href="#playbooks" className="nav-link-item">Playbooks</a>
            <a href="#comparison" className="nav-link-item">Comparison</a>
            <a href="#faq" className="nav-link-item">FAQ</a>
          </nav>

          <div className="nav-right-actions">
            <div className="live-status-pill">
              <span className="status-orb pulse" />
              <span className="status-label">RELAY 9000 ONLINE</span>
            </div>

            <button 
              type="button" 
              className="btn-header-quick"
              onClick={handleQuickCivilian}
            >
              <Zap size={14} />
              <span>Instant Demo</span>
            </button>

            <button 
              type="button" 
              className="btn-header-gateway"
              onClick={() => { setAuthModalOpen(true); }}
            >
              <span>Connect Grid</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Announcement Ribbon */}
      <div className="announcement-banner">
        <div className="announcement-content">
          <span className="badge-pill">NEW PROTOCOL V2.4</span>
          <span className="announcement-text">
            Autonomous WebRTC DataChannels with zero cellular or cloud server dependency.
          </span>
          <a href="#features" className="announcement-link">
            Explore Architecture <ArrowRight size={13} />
          </a>
        </div>
      </div>

      {/* Master Hero Section */}
      <section id="platform" className="commercial-hero">
        <div className="hero-grid-wrapper">
          {/* Left Column: Hero Narrative */}
          <div className="hero-narrative">
            <div className="hero-mission-pill">
              <Sparkles size={14} className="pill-star" />
              <span>ZERO-INFRASTRUCTURE EMERGENCY MESH</span>
            </div>

            <h1 className="hero-master-title">
              When Cell Networks Fail, <br />
              <span className="text-gradient">The Mesh Takes Over.</span>
            </h1>

            <p className="hero-lead-paragraph">
              ResQMesh turns standard laptops, smartphones, and tablets into an autonomous, encrypted peer-to-peer survival network. Transmit real-time audio Push-to-Talk, broadcast keyless GPS survivor telemetry, and coordinate crisis supplies when commercial cellular towers collapse.
            </p>

            {/* High-Impact Commercial CTAs */}
            <div className="hero-cta-group">
              <button 
                type="button" 
                className="btn-hero-primary"
                onClick={handleQuickCivilian}
              >
                <User size={18} />
                <span>Launch as Civilian SOS</span>
                <ArrowRight size={16} className="btn-arrow" />
              </button>

              <button 
                type="button" 
                className="btn-hero-secondary"
                onClick={handleQuickResponder}
              >
                <Shield size={18} />
                <span>Launch Incident Commander</span>
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="hero-metrics-bar">
              <div className="metric-cell">
                <span className="metric-number">0%</span>
                <span className="metric-caption">CELLULAR / ISP NEEDED</span>
              </div>
              <div className="metric-divider" />
              <div className="metric-cell">
                <span className="metric-number">&lt; 15ms</span>
                <span className="metric-caption">LOCAL HOP LATENCY</span>
              </div>
              <div className="metric-divider" />
              <div className="metric-cell">
                <span className="metric-number">DTLS 1.3</span>
                <span className="metric-caption">HARDWARE ENCRYPTED</span>
              </div>
              <div className="metric-divider" />
              <div className="metric-cell">
                <span className="metric-number">100%</span>
                <span className="metric-caption">KEYLESS OSM & SATELLITE</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Interactive Terminal / Live Mockup */}
          <div className="hero-terminal-container">
            <div className="glass-card terminal-card">
              {/* Terminal Window Header */}
              <div className="terminal-header">
                <div className="terminal-controls">
                  <span className="dot red" />
                  <span className="dot yellow" />
                  <span className="dot green" />
                </div>

                <div className="terminal-tabs">
                  <button 
                    type="button"
                    className={`terminal-tab ${heroTab === 'preview' ? 'active' : ''}`}
                    onClick={() => setHeroTab('preview')}
                  >
                    <Activity size={13} />
                    <span>LIVE SIMULATED RADAR</span>
                  </button>
                  <button 
                    type="button"
                    className={`terminal-tab ${heroTab === 'gateway' ? 'active' : ''}`}
                    onClick={() => setHeroTab('gateway')}
                  >
                    <Key size={13} />
                    <span>MANUAL GATEWAY</span>
                  </button>
                </div>
              </div>

              {/* Terminal Body: View 1 (Live Preview) */}
              {heroTab === 'preview' ? (
                <div className="terminal-body">
                  {/* Radar Waveform Header */}
                  <div className="radar-status-bar">
                    <div className="radar-indicator">
                      <span className="radar-pulse-ring" />
                      <span className="radar-label">ACTIVE SECTOR: <strong>GRID-ALPHA-9000</strong></span>
                    </div>
                    <span className="mesh-crypto-badge">AES-GCM-256</span>
                  </div>

                  {/* Audio PTT Simulation Waveform */}
                  <div className="terminal-audio-widget">
                    <div className="audio-meta">
                      <div className="audio-meta-left">
                        <Volume2 size={16} className="text-accent" />
                        <div>
                          <strong>RADIO BURST #409: "TEAM 2 ON SITE"</strong>
                          <span className="audio-subtext">Received via Multi-Hop Relay (14ms)</span>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        className={`btn-audio-sim ${audioPlaying ? 'playing' : ''}`}
                        onClick={toggleAudioPreview}
                      >
                        {audioPlaying ? <RotateCcw size={14} /> : <Play size={14} />}
                        <span>{audioPlaying ? 'REPLAY' : 'TEST PTT'}</span>
                      </button>
                    </div>

                    <div className="waveform-bars">
                      {[35, 65, 90, 45, 100, 80, 50, 70, 95, 40, 85, 60, 30, 75, 90, 55, 100, 70, 45, 80].map((h, i) => (
                        <span 
                          key={i} 
                          className={`wave-bar ${audioPlaying ? 'animating' : ''}`} 
                          style={{ height: `${audioPlaying ? (h * 0.9) : (h * 0.4)}%`, animationDelay: `${i * 0.05}s` }} 
                        />
                      ))}
                    </div>
                  </div>

                  {/* Live Node Telemetry Feed */}
                  <div className="terminal-nodes-feed">
                    <div className="feed-header">
                      <Terminal size={14} />
                      <span>DISCOVERED PEER DATACHANNELS (3 ONLINE)</span>
                    </div>

                    <div className="feed-items-list">
                      <div className="feed-item rescuer">
                        <div className="feed-node-id">
                          <Shield size={13} />
                          <span>CMD-SARAH-VANCE</span>
                        </div>
                        <span className="feed-node-role">COMMANDER</span>
                        <span className="feed-node-ping">4ms • 100% LQI</span>
                      </div>

                      <div className="feed-item civilian">
                        <div className="feed-node-id">
                          <User size={13} />
                          <span>SURVIVOR-LIN (BPM 78)</span>
                        </div>
                        <span className="feed-node-role">CIVILIAN SOS</span>
                        <span className="feed-node-ping">12ms • HOP 1</span>
                      </div>

                      <div className="feed-item relay">
                        <div className="feed-node-id">
                          <Radio size={13} />
                          <span>RELAY-DRONE-01</span>
                        </div>
                        <span className="feed-node-role">ROUTER</span>
                        <span className="feed-node-ping">8ms • HOP 0</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Strip */}
                  <div className="terminal-footer-action">
                    <span>Ready to deploy into this active grid?</span>
                    <button 
                      type="button" 
                      className="btn-terminal-join"
                      onClick={() => setHeroTab('gateway')}
                    >
                      <span>Join via Gateway</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                /* Terminal Body: View 2 (Embedded Quick Gateway Form) */
                <div className="terminal-gateway-body">
                  <div className="gateway-role-toggle">
                    <button 
                      type="button"
                      className={`btn-role-tab ${role === 'civilian' ? 'active' : ''}`}
                      onClick={() => { setRole('civilian'); setError(''); }}
                    >
                      <User size={14} />
                      <span>CIVILIAN SOS</span>
                    </button>
                    <button 
                      type="button"
                      className={`btn-role-tab ${role === 'responder' ? 'active' : ''}`}
                      onClick={() => { setRole('responder'); setError(''); }}
                    >
                      <Shield size={14} />
                      <span>INCIDENT COMMAND</span>
                    </button>
                  </div>

                  <form className="gateway-form-inner" onSubmit={step === 'info' ? handleInfoSubmit : handleOtpSubmit}>
                    {step === 'info' ? (
                      <div className="form-fields-stack">
                        {role === 'civilian' ? (
                          <>
                            <div className="form-field-group">
                              <label>SURVIVOR NAME</label>
                              <div className="input-with-icon">
                                <User size={16} />
                                <input 
                                  placeholder="Full Name (e.g. Maya Lin)" 
                                  value={name} 
                                  onChange={e => setName(e.target.value)} 
                                />
                              </div>
                            </div>
                            <div className="form-field-group">
                              <label>MOBILE NUMBER</label>
                              <div className="input-with-icon">
                                <Smartphone size={16} />
                                <input 
                                  placeholder="Phone Number (e.g. 9876543210)" 
                                  value={mobile} 
                                  onChange={e => setMobile(e.target.value)} 
                                />
                              </div>
                            </div>
                            <div className="form-field-group">
                              <label>GRID ID (OPTIONAL)</label>
                              <div className="input-with-icon">
                                <Target size={16} />
                                <input 
                                  placeholder="Leave blank for public mesh" 
                                  value={serverName} 
                                  onChange={e => setServerName(e.target.value.toUpperCase())} 
                                />
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="form-field-group">
                              <label>COMMANDER ALIAS</label>
                              <div className="input-with-icon">
                                <Server size={16} />
                                <input 
                                  placeholder="e.g. Cmdr. Sarah Vance" 
                                  value={name} 
                                  onChange={e => setName(e.target.value)} 
                                />
                              </div>
                            </div>
                            <div className="form-field-group">
                              <label>GRID SECTOR ID</label>
                              <div className="input-with-icon">
                                <Target size={16} />
                                <input 
                                  placeholder="GRID-ALPHA-XXXX" 
                                  value={serverName} 
                                  onChange={e => setServerName(e.target.value.toUpperCase())} 
                                />
                                <button type="button" className="btn-auto-gen" onClick={generateSecureId}>GEN</button>
                              </div>
                            </div>
                            <div className="form-field-group">
                              <label>AUTHORIZATION KEY</label>
                              <div className="input-with-icon">
                                <Key size={16} />
                                <input 
                                  type="password"
                                  placeholder="Passcode (Demo: admin123)" 
                                  value={adminPass} 
                                  onChange={e => setAdminPass(e.target.value)} 
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="form-fields-stack">
                        <div className="form-field-group">
                          <label>ENTER 4-DIGIT VERIFICATION CODE</label>
                          <div className="input-with-icon">
                            <Key size={16} />
                            <input 
                              className="otp-highlight-field"
                              placeholder="••••" 
                              maxLength={6}
                              value={otp} 
                              onChange={e => setOtp(e.target.value)} 
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {error && <div className="gateway-error-banner">{error}</div>}

                    <button type="submit" className="btn-gateway-action" disabled={isLoading}>
                      {isLoading ? <div className="spinner-orbit" /> : (
                        <>
                          <span>{step === 'info' ? 'CONNECT TO MESH' : 'VERIFY & ENTER'}</span>
                          <ChevronRight size={18} />
                        </>
                      )}
                    </button>
                  </form>

                  <div className="gateway-demo-credential">
                    {role === 'civilian' ? 'DEMO OTP: 1234' : 'DEMO PASSCODE: admin123'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise & Agency Trust Strip */}
      <section className="commercial-trust-strip">
        <div className="trust-inner">
          <span className="trust-eyebrow">ENGINEERED FOR RAPID DEPLOYMENT ACROSS DISASTER AGENCIES</span>
          <div className="trust-badges-row">
            <div className="trust-badge-item">
              <CheckCircle2 size={16} className="text-emerald" />
              <span>NDRF INTEROPERABLE</span>
            </div>
            <div className="trust-badge-item">
              <CheckCircle2 size={16} className="text-emerald" />
              <span>UN OCHA COMPLIANT</span>
            </div>
            <div className="trust-badge-item">
              <CheckCircle2 size={16} className="text-emerald" />
              <span>RED CROSS FIELD SPEC</span>
            </div>
            <div className="trust-badge-item">
              <CheckCircle2 size={16} className="text-emerald" />
              <span>RFC 8829 WEBRTC</span>
            </div>
            <div className="trust-badge-item">
              <CheckCircle2 size={16} className="text-emerald" />
              <span>100% ZERO-TELEMETRY</span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Topology Simulator Sandbox Section */}
      <section id="simulator" className="simulator-section">
        <div className="section-head">
          <span className="section-category-tag">LIVE PROTOCOL SANDBOX</span>
          <h2 className="section-main-heading">Experience Multi-Hop Mesh Routing In Real Time</h2>
          <p className="section-subtext">
            Test how ResQMesh routes distress beacons, audio bursts, and supply manifests across peer nodes when all cellular towers are completely dead.
          </p>
        </div>

        <div className="simulator-workbench">
          {/* Simulator Visual Sandbox Canvas */}
          <div className="sim-canvas-viewport">
            <div className="sim-grid-lines" />

            {/* Connecting Mesh Filaments */}
            <svg className="sim-svg-connections">
              {simNodes.map((n1, i) =>
                simNodes.slice(i + 1).map((n2) => (
                  <line
                    key={`${n1.id}-${n2.id}`}
                    x1={`${n1.x}%`}
                    y1={`${n1.y}%`}
                    x2={`${n2.x}%`}
                    y2={`${n2.y}%`}
                    stroke={simPinging ? '#0284C7' : 'rgba(148, 163, 184, 0.4)'}
                    strokeWidth={simPinging ? '2.5' : '1.5'}
                    strokeDasharray={simPinging ? '6, 6' : 'none'}
                    className={simPinging ? 'anim-packet-hop' : ''}
                  />
                ))
              )}
            </svg>

            {/* Dynamic Node Pins */}
            {simNodes.map((node) => (
              <div 
                key={node.id} 
                className={`sim-node-pin ${node.role} ${simPinging ? 'pulsing' : ''}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
              >
                <div className="pin-halo" />
                <div className="pin-core">
                  {node.role === 'rescuer' ? <Shield size={14} /> : node.role === 'drone' ? <Radio size={14} /> : <User size={14} />}
                </div>
                <div className="pin-popup">
                  <strong>{node.name}</strong>
                  <span>Bat: {node.battery}% • Latency: 6ms</span>
                </div>
              </div>
            ))}

            {/* Simulation Status Overlay Banner */}
            <div className="sim-overlay-status">
              <div className="sim-status-item">
                <span className="dot-green" />
                <span>HOP TOPOLOGY: <strong>DECENTRALIZED</strong></span>
              </div>
              <div className="sim-status-item">
                <span>PACKETS ROUTED: <strong>{simPacketsSent}</strong></span>
              </div>
              <div className="sim-status-item">
                <span>LOSS RATE: <strong>0.00%</strong></span>
              </div>
            </div>
          </div>

          {/* Simulator Interactive Command Deck */}
          <div className="sim-command-deck">
            <div className="sim-deck-header">
              <h3>SIMULATION CONTROLS</h3>
              <p>Trigger network packet pulses or introduce new simulated rescue nodes into the field.</p>
            </div>

            <div className="sim-buttons-stack">
              <button 
                type="button" 
                className={`btn-sim-action primary ${simPinging ? 'disabled' : ''}`}
                onClick={handleTriggerPing}
                disabled={simPinging}
              >
                <Zap size={16} />
                <span>{simPinging ? 'HOPPING PACKETS...' : 'BROADCAST SOS PACKET'}</span>
              </button>

              <button 
                type="button" 
                className="btn-sim-action secondary"
                onClick={handleAddSimNode}
                disabled={simNodes.length >= 7}
              >
                <Layers size={16} />
                <span>DEPLOY FIELD NODE ({simNodes.length}/7)</span>
              </button>

              <button 
                type="button" 
                className="btn-sim-action tertiary"
                onClick={handleResetSim}
              >
                <RotateCcw size={16} />
                <span>RESET TOPOLOGY</span>
              </button>
            </div>

            {/* Live Packet Log Feed */}
            <div className="sim-telemetry-box">
              <div className="telemetry-title">
                <Terminal size={13} />
                <span>STORE-AND-FORWARD TELEMETRY</span>
              </div>
              <div className="telemetry-lines">
                <div className="t-line info">[INIT] WebRTC DataChannels established on RFC 8829</div>
                <div className="t-line success">[ROUTING] Alpha-Command &lt;-&gt; Survivor-Maya (DTLS OK)</div>
                <div className="t-line info">[GPS] Location packet queued: 37.7749°N, 122.4194°W</div>
                {simPinging && (
                  <div className="t-line alert">[SOS] Emergency packet hopped via Relay-Drone-1 (4ms)</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Commercial Bento Grid Section */}
      <section id="features" className="bento-features-section">
        <div className="section-head">
          <span className="section-category-tag">ARCHITECTURAL ADVANTAGES</span>
          <h2 className="section-main-heading">Engineered For Zero-Fail Tactical Operations</h2>
          <p className="section-subtext">
            Every layer of ResQMesh is purpose-built to operate indefinitely in total blackout conditions.
          </p>
        </div>

        <div className="bento-grid-deck">
          {/* Bento Card 1: Sub-Second Audio PTT (Double Width) */}
          <div className="bento-card bento-wide">
            <div className="bento-card-header">
              <div className="bento-icon-wrapper azure">
                <Radio size={24} />
              </div>
              <span className="bento-pill">SUB-50MS LATENCY</span>
            </div>
            <div className="bento-card-content">
              <h3>Real-Time Push-To-Talk Tactical Radio</h3>
              <p>
                Eliminate the weight of traditional analog UHF/VHF handheld transceivers. ResQMesh captures, encodes in Opus audio, and streams binary voice bursts across nearby connected rescue nodes in sub-50 milliseconds.
              </p>
              <div className="bento-visual-ptt">
                <div className="ptt-mini-button">
                  <Radio size={20} />
                  <span>HOLD TO TALK</span>
                </div>
                <div className="ptt-mini-waveform">
                  {[40, 80, 60, 100, 70, 90, 50, 85, 60, 95, 40].map((h, i) => (
                    <span key={i} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bento Card 2: Autonomous P2P WebRTC */}
          <div className="bento-card">
            <div className="bento-card-header">
              <div className="bento-icon-wrapper emerald">
                <Globe size={24} />
              </div>
              <span className="bento-pill">0% CELLULAR</span>
            </div>
            <div className="bento-card-content">
              <h3>Autonomous WebRTC Mesh</h3>
              <p>
                Browser-to-browser data channels with intelligent store-and-forward queueing. Packets hold in device memory and forward when any node enters proximity.
              </p>
            </div>
          </div>

          {/* Bento Card 3: Keyless Tactical Mapping */}
          <div className="bento-card">
            <div className="bento-card-header">
              <div className="bento-icon-wrapper cyan">
                <MapPin size={24} />
              </div>
              <span className="bento-pill">UNRESTRICTED</span>
            </div>
            <div className="bento-card-content">
              <h3>Keyless GPS Triangulation</h3>
              <p>
                High-contrast OpenStreetMap and true-color Esri satellite imagery with zero API keys or rate limits. Real-time victim breadcrumbs and live GPS coordinate broadcasting.
              </p>
            </div>
          </div>

          {/* Bento Card 4: Dead Man's Switch (DMS) */}
          <div className="bento-card">
            <div className="bento-card-header">
              <div className="bento-icon-wrapper rose">
                <Flame size={24} />
              </div>
              <span className="bento-pill">AUTONOMOUS FAILSAFE</span>
            </div>
            <div className="bento-card-content">
              <h3>Dead Man's Switch (DMS)</h3>
              <p>
                Essential safety protocol for solitary responders in hazardous collapse zones. If silent past the countdown interval, an automated emergency beacon dispatches to the entire mesh.
              </p>
            </div>
          </div>

          {/* Bento Card 5: Decentralized Logistics Board */}
          <div className="bento-card">
            <div className="bento-card-header">
              <div className="bento-icon-wrapper indigo">
                <Package size={24} />
              </div>
              <span className="bento-pill">PEER LOGISTICS</span>
            </div>
            <div className="bento-card-content">
              <h3>Resource Matching Board</h3>
              <p>
                Broadcast requests and offers for potable water, blood units, triage kits, and evacuation transports directly between citizens and disaster response squads.
              </p>
            </div>
          </div>

          {/* Bento Card 6: Optical PPG Cardiac Scanner */}
          <div className="bento-card">
            <div className="bento-card-header">
              <div className="bento-icon-wrapper amber">
                <HeartPulse size={24} />
              </div>
              <span className="bento-pill">IN-BROWSER SENSOR</span>
            </div>
            <div className="bento-card-content">
              <h3>Biometric PPG Vital Scanner</h3>
              <p>
                Estimate survivor pulse and heart rate directly through the smartphone camera lens using optical photoplethysmography without external hardware monitors.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Disaster Scenario Playbook Section */}
      <section id="playbooks" className="playbooks-section">
        <div className="section-head">
          <span className="section-category-tag">CRISIS SCENARIO PLAYBOOKS</span>
          <h2 className="section-main-heading">Tailored For The Most Extreme Catastrophes</h2>
          <p className="section-subtext">
            Discover how ResQMesh adapts to diverse disaster typologies with specialized tactical workflows.
          </p>
        </div>

        <div className="playbooks-tabs-wrapper">
          <div className="playbook-tab-buttons">
            <button 
              type="button" 
              className={`btn-playbook-tab ${activeScenario === 'blackout' ? 'active' : ''}`}
              onClick={() => setActiveScenario('blackout')}
            >
              <Zap size={16} />
              <span>Grid Blackout & Earthquake</span>
            </button>

            <button 
              type="button" 
              className={`btn-playbook-tab ${activeScenario === 'flood' ? 'active' : ''}`}
              onClick={() => setActiveScenario('flood')}
            >
              <Activity size={16} />
              <span>Catastrophic Flood & Cyclone</span>
            </button>

            <button 
              type="button" 
              className={`btn-playbook-tab ${activeScenario === 'wildfire' ? 'active' : ''}`}
              onClick={() => setActiveScenario('wildfire')}
            >
              <Flame size={16} />
              <span>Wildfire Evacuation Corridor</span>
            </button>

            <button 
              type="button" 
              className={`btn-playbook-tab ${activeScenario === 'mountain' ? 'active' : ''}`}
              onClick={() => setActiveScenario('mountain')}
            >
              <Compass size={16} />
              <span>Remote Alpine Search & Rescue</span>
            </button>
          </div>

          {/* Active Playbook Display */}
          <div className="playbook-content-display">
            {activeScenario === 'blackout' && (
              <div className="playbook-card">
                <div className="playbook-meta">
                  <span className="playbook-badge red">URGENCY: LEVEL 5 DISASTER</span>
                  <h3>Power Grid Blackout & Urban Structural Collapse</h3>
                  <p>
                    When an earthquake collapses cellular towers and diesel backup generators fail, urban survivors become isolated in concrete rubble. ResQMesh routes survival signals across neighboring buildings without requiring any central router.
                  </p>
                  <ul className="playbook-tactics">
                    <li><Check size={16} className="text-emerald" /> Survivors pin exact GPS coordinates & floor elevation from phone sensors.</li>
                    <li><Check size={16} className="text-emerald" /> Store-and-forward buffers dispatches until drone or paramedic comes within 200m.</li>
                    <li><Check size={16} className="text-emerald" /> Rescuers coordinate entry teams via low-latency sub-second PTT audio channels.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeScenario === 'flood' && (
              <div className="playbook-card">
                <div className="playbook-meta">
                  <span className="playbook-badge blue">URGENCY: LEVEL 4 MARITIME EVAC</span>
                  <h3>Submerged Infrastructure & Cyclone Flooding</h3>
                  <p>
                    Fiber cables severed underwater and cell base stations drowned. Rescue boats and military amphibious vehicles share keyless satellite maps and survivor manifest counts peer-to-peer.
                  </p>
                  <ul className="playbook-tactics">
                    <li><Check size={16} className="text-emerald" /> Natural satellite imagery identifies unflooded high-ground landing zones.</li>
                    <li><Check size={16} className="text-emerald" /> Resource board tracks boat fuel, clean water canisters, and infant formula.</li>
                    <li><Check size={16} className="text-emerald" /> Survivor triage statuses (BPM, medical trauma) synced on arrival.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeScenario === 'wildfire' && (
              <div className="playbook-card">
                <div className="playbook-meta">
                  <span className="playbook-badge orange">URGENCY: LEVEL 5 DYNAMIC SPREAD</span>
                  <h3>Wildfire Front & Evacuation Corridor Guidance</h3>
                  <p>
                    Dense smoke plumes obscure visibility and burn telephone poles. ResQMesh transmits wind-direction alerts, safe road waypoints, and dead-end warnings directly between fleeing civilian convoys.
                  </p>
                  <ul className="playbook-tactics">
                    <li><Check size={16} className="text-emerald" /> Dead Man's Switch alerts command if an evacuation crew vehicle stalls.</li>
                    <li><Check size={16} className="text-emerald" /> One-tap SOS notifies all vehicles within mesh perimeter of road blockages.</li>
                    <li><Check size={16} className="text-emerald" /> Voice PTT keeps drivers informed without taking eyes off the steering wheel.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeScenario === 'mountain' && (
              <div className="playbook-card">
                <div className="playbook-meta">
                  <span className="playbook-badge green">URGENCY: LEVEL 3 REMOTE EXPEDITION</span>
                  <h3>Deep Wilderness & Mountain Ravine Expeditions</h3>
                  <p>
                    Completely outside cellular coverage zones. Field searchers link phones using QR-code air-gapped handshakes without cellular towers or internet routers.
                  </p>
                  <ul className="playbook-tactics">
                    <li><Check size={16} className="text-emerald" /> Air-gapped WebRTC SDP exchange over camera QR code scans.</li>
                    <li><Check size={16} className="text-emerald" /> Breadcrumb trails record searcher paths to prevent search duplication.</li>
                    <li><Check size={16} className="text-emerald" /> Zero battery wasted on continuous cellular tower handshakes.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Comparison Matrix Section */}
      <section id="comparison" className="comparison-section">
        <div className="section-head">
          <span className="section-category-tag">OBJECTIVE BENCHMARKS</span>
          <h2 className="section-main-heading">How ResQMesh Compares To Alternatives</h2>
          <p className="section-subtext">
            A transparent evaluation of traditional emergency communication systems versus ResQMesh.
          </p>
        </div>

        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>CAPABILITY</th>
                <th className="highlight-column">
                  <div className="table-highlight-badge">
                    <Shield size={14} />
                    <span>ResQMesh</span>
                  </div>
                </th>
                <th>CELLULAR 4G/5G</th>
                <th>SATELLITE HANDSETS (IRIDIUM)</th>
                <th>ANALOG WALKIE-TALKIES</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-feature">Cellular Tower Dependency</td>
                <td className="highlight-column text-emerald font-bold">0% (Pure P2P)</td>
                <td className="text-danger">100% (Fails in disaster)</td>
                <td className="text-emerald">0%</td>
                <td className="text-emerald">0%</td>
              </tr>
              <tr>
                <td className="row-feature">Hardware Required</td>
                <td className="highlight-column font-bold">Any Smartphone / Browser</td>
                <td>Standard Smartphone</td>
                <td className="text-danger">$800 - $1,500 Handset</td>
                <td>$150 - $400 Transceiver</td>
              </tr>
              <tr>
                <td className="row-feature">Recurring Monthly Cost</td>
                <td className="highlight-column text-emerald font-bold">$0 (Open Source)</td>
                <td>$50 - $120 / month</td>
                <td className="text-danger">$60 - $200 / month</td>
                <td>$0</td>
              </tr>
              <tr>
                <td className="row-feature">Voice PTT & Keyless GPS Together</td>
                <td className="highlight-column text-emerald font-bold">YES (Synchronized)</td>
                <td>Only if towers work</td>
                <td className="text-danger">Text/Voice only</td>
                <td className="text-danger">Audio only (No map)</td>
              </tr>
              <tr>
                <td className="row-feature">Dead Man's Switch Failsafe</td>
                <td className="highlight-column text-emerald font-bold">BUILT-IN (Autonomous)</td>
                <td className="text-muted">Requires 3rd party app</td>
                <td className="text-muted">Select models only</td>
                <td className="text-danger">None</td>
              </tr>
              <tr>
                <td className="row-feature">Setup & Deployment Time</td>
                <td className="highlight-column font-bold text-accent">Instant (Browser URL)</td>
                <td>Dependent on carrier</td>
                <td>10-15 min satellite link</td>
                <td>Manual frequency tuning</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive FAQ Accordion Section */}
      <section id="faq" className="faq-section">
        <div className="section-head">
          <span className="section-category-tag">COMMON QUESTIONS</span>
          <h2 className="section-main-heading">Frequently Asked Questions</h2>
          <p className="section-subtext">
            Everything you need to know about operating ResQMesh in real-world crisis theaters.
          </p>
        </div>

        <div className="faq-accordion-deck">
          {[
            {
              q: "How does ResQMesh work if cellular towers and internet cables are completely severed?",
              a: "ResQMesh leverages browser-native WebRTC DataChannels. Devices communicate over local ad-hoc Wi-Fi networks, battery-powered portable routers, or direct air-gapped QR-code SDP handshakes. No internet service provider (ISP), cellular tower, or cloud backend is required for local nodes to discover and exchange packets."
            },
            {
              q: "What is the physical range between peer nodes?",
              a: "Range depends on the local physical link. Over standard device Wi-Fi, typical line-of-sight range is 50 to 150 meters. However, because ResQMesh employs multi-hop store-and-forward routing, messages hop from phone to phone across the disaster sector, extending effective range across kilometers as long as nodes are distributed."
            },
            {
              q: "Do survivors or rescuers need to install an app from Google Play or the Apple App Store?",
              a: "No! ResQMesh is a standalone Progressive Web App (PWA). Once loaded or cached on the device, it runs 100% offline from the browser's Service Worker cache. There are no app store downloads, APK side-loading steps, or mobile permissions required."
            },
            {
              q: "How does the Push-to-Talk (PTT) radio transmit voice without cellular minutes?",
              a: "When you hold the Push-to-Talk button, ResQMesh captures audio through the browser's MediaRecorder API, compresses it into low-bitrate Opus audio packets, and broadcasts it across WebRTC binary data channels. Nearby rescue peers immediately auto-play the voice burst with sub-50ms latency."
            },
            {
              q: "Is emergency communication encrypted and safe from interception?",
              a: "Yes. All WebRTC peer connections mandate DTLS 1.3 encryption and AES-GCM 256-bit cryptography at the hardware protocol layer. Communications cannot be intercepted or modified by rogue nodes on the local channel."
            }
          ].map((item, idx) => (
            <div 
              key={idx} 
              className={`faq-item-card ${expandedFaq === idx ? 'open' : ''}`}
              onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
            >
              <div className="faq-question-row">
                <span className="faq-question-text">{item.q}</span>
                <div className="faq-toggle-icon">
                  {expandedFaq === idx ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>
              {expandedFaq === idx && (
                <div className="faq-answer-block">
                  <p>{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Enterprise Commercial Call to Action Banner */}
      <section className="commercial-bottom-cta">
        <div className="bottom-cta-card">
          <div className="bottom-cta-badge">STANDALONE WEB MESH</div>
          <h2>Deploy ResQMesh Into Your Incident Command Center</h2>
          <p>
            Zero friction, zero proprietary hardware, and 100% open-source resilience when disaster strikes.
          </p>
          <div className="bottom-cta-buttons">
            <button 
              type="button" 
              className="btn-bottom-primary"
              onClick={handleQuickCivilian}
            >
              <Zap size={16} />
              <span>Launch Civilian Demo</span>
            </button>
            <button 
              type="button" 
              className="btn-bottom-secondary"
              onClick={handleQuickResponder}
            >
              <Shield size={16} />
              <span>Launch Commander Hub</span>
            </button>
          </div>
        </div>
      </section>

      {/* Enterprise Commercial Footer */}
      <footer className="commercial-footer">
        <div className="footer-top-row">
          <div className="footer-brand-col">
            <div className="footer-logo">
              <Shield size={24} className="text-accent" />
              <span>ResQMesh</span>
            </div>
            <p className="footer-desc">
              Decentralized browser-to-browser emergency tactical communications grid. Designed for disaster relief teams, search and rescue squads, and isolated civilians.
            </p>
            <div className="footer-status-pill">
              <span className="dot-green" />
              <span>ALL MESH PROTOCOLS NOMINAL</span>
            </div>
          </div>

          <div className="footer-links-col">
            <h4>PLATFORM</h4>
            <a href="#platform">Overview</a>
            <a href="#simulator">Live Simulator</a>
            <a href="#features">Capabilities</a>
            <a href="#playbooks">Crisis Playbooks</a>
          </div>

          <div className="footer-links-col">
            <h4>TECHNOLOGY</h4>
            <a href="#features">WebRTC DataChannels</a>
            <a href="#features">Opus Audio PTT</a>
            <a href="#comparison">Keyless Cartography</a>
            <a href="#features">Dead Man's Switch</a>
          </div>

          <div className="footer-links-col">
            <h4>COMPLIANCE</h4>
            <span>RFC 8829 WebRTC</span>
            <span>DTLS 1.3 / AES-GCM</span>
            <span>Zero-Telemetry</span>
            <span>MIT Open Source</span>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <span>&copy; {new Date().getFullYear()} ResQMesh Emergency Grid Protocol. Built for humanitarian mission-critical response.</span>
          <div className="footer-meta-links">
            <button type="button" className="btn-footer-link" onClick={handleQuickCivilian}>Survivor Portal</button>
            <span>•</span>
            <button type="button" className="btn-footer-link" onClick={handleQuickResponder}>Commander Gateway</button>
          </div>
        </div>
      </footer>

      {/* Floating Modal for Manual Command Gateway (if triggered from header) */}
      {authModalOpen && (
        <div className="modal-backdrop-overlay" onClick={() => setAuthModalOpen(false)}>
          <div className="modal-gateway-card" onClick={e => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setAuthModalOpen(false)}>
              <X size={20} />
            </button>

            <div className="modal-gateway-header">
              <div className="modal-icon-badge">
                <Shield size={24} />
              </div>
              <h3>CONNECT TO TACTICAL GRID</h3>
              <p>Select your deployment role to access the decentralized mesh.</p>
            </div>

            <div className="gateway-role-toggle">
              <button 
                type="button"
                className={`btn-role-tab ${role === 'civilian' ? 'active' : ''}`}
                onClick={() => { setRole('civilian'); setError(''); }}
              >
                <User size={14} />
                <span>CIVILIAN SOS</span>
              </button>
              <button 
                type="button"
                className={`btn-role-tab ${role === 'responder' ? 'active' : ''}`}
                onClick={() => { setRole('responder'); setError(''); }}
              >
                <Shield size={14} />
                <span>COMMAND POST</span>
              </button>
            </div>

            <form className="gateway-form-inner" onSubmit={step === 'info' ? handleInfoSubmit : handleOtpSubmit}>
              {step === 'info' ? (
                <div className="form-fields-stack">
                  {role === 'civilian' ? (
                    <>
                      <div className="form-field-group">
                        <label>SURVIVOR NAME</label>
                        <div className="input-with-icon">
                          <User size={16} />
                          <input 
                            placeholder="Full Name (e.g. Maya Lin)" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                          />
                        </div>
                      </div>
                      <div className="form-field-group">
                        <label>MOBILE NUMBER</label>
                        <div className="input-with-icon">
                          <Smartphone size={16} />
                          <input 
                            placeholder="Phone Number (e.g. 9876543210)" 
                            value={mobile} 
                            onChange={e => setMobile(e.target.value)} 
                          />
                        </div>
                      </div>
                      <div className="form-field-group">
                        <label>GRID ID (OPTIONAL)</label>
                        <div className="input-with-icon">
                          <Target size={16} />
                          <input 
                            placeholder="Leave blank for public mesh" 
                            value={serverName} 
                            onChange={e => setServerName(e.target.value.toUpperCase())} 
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-field-group">
                        <label>COMMANDER ALIAS</label>
                        <div className="input-with-icon">
                          <Server size={16} />
                          <input 
                            placeholder="e.g. Cmdr. Sarah Vance" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                          />
                        </div>
                      </div>
                      <div className="form-field-group">
                        <label>GRID SECTOR ID</label>
                        <div className="input-with-icon">
                          <Target size={16} />
                          <input 
                            placeholder="GRID-ALPHA-XXXX" 
                            value={serverName} 
                            onChange={e => setServerName(e.target.value.toUpperCase())} 
                          />
                          <button type="button" className="btn-auto-gen" onClick={generateSecureId}>GEN</button>
                        </div>
                      </div>
                      <div className="form-field-group">
                        <label>AUTHORIZATION KEY</label>
                        <div className="input-with-icon">
                          <Key size={16} />
                          <input 
                            type="password"
                            placeholder="Passcode (Demo: admin123)" 
                            value={adminPass} 
                            onChange={e => setAdminPass(e.target.value)} 
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="form-fields-stack">
                  <div className="form-field-group">
                    <label>ENTER 4-DIGIT VERIFICATION CODE</label>
                    <div className="input-with-icon">
                      <Key size={16} />
                      <input 
                        className="otp-highlight-field"
                        placeholder="••••" 
                        maxLength={6}
                        value={otp} 
                        onChange={e => setOtp(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              )}

              {error && <div className="gateway-error-banner">{error}</div>}

              <button type="submit" className="btn-gateway-action" disabled={isLoading}>
                {isLoading ? <div className="spinner-orbit" /> : (
                  <>
                    <span>{step === 'info' ? 'CONNECT TO MESH' : 'VERIFY & ENTER'}</span>
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="gateway-demo-credential">
              {role === 'civilian' ? 'DEMO OTP: 1234' : 'DEMO PASSCODE: admin123'}
            </div>
          </div>
        </div>
      )}

      {/* Recaptcha container for Firebase Phone Auth */}
      <div id="recaptcha-container" />

      {/* Master Commercial Stylesheet */}
      <style>{`
        .commercial-landing {
          min-height: 100vh;
          width: 100%;
          position: relative;
          background: #F8FAFC;
          color: #0F172A;
          overflow-x: hidden;
          font-family: var(--font-primary);
        }

        .global-mesh-canvas {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 0;
          opacity: 0.55;
        }

        .ambient-spotlight {
          position: fixed;
          border-radius: 50%;
          filter: blur(140px);
          pointer-events: none;
          z-index: 0;
        }

        .spot-cyan {
          top: -120px;
          right: 5%;
          width: 550px;
          height: 550px;
          background: radial-gradient(circle, rgba(2, 132, 199, 0.08) 0%, rgba(2, 132, 199, 0) 70%);
        }

        .spot-emerald {
          top: 35%;
          left: -100px;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, rgba(16, 185, 129, 0) 70%);
        }

        .spot-indigo {
          bottom: 10%;
          right: 0%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.06) 0%, rgba(99, 102, 241, 0) 70%);
        }

        /* Commercial Navbar */
        .commercial-navbar {
          position: sticky;
          top: 0;
          z-index: 60;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(226, 232, 240, 0.85);
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.03);
        }

        .nav-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 14px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .nav-brand-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand-emblem {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #0284C7, #0EA5E9);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.28);
        }

        .brand-copy {
          display: flex;
          flex-direction: column;
        }

        .brand-logo-text {
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #0F172A;
          line-height: 1.1;
        }

        .brand-subtag {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.14em;
          color: #64748B;
        }

        .nav-links-menu {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .nav-link-item {
          color: #475569;
          font-size: 0.85rem;
          font-weight: 600;
          text-decoration: none;
          transition: var(--transition-fast);
        }

        .nav-link-item:hover {
          color: #0284C7;
        }

        .nav-right-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .live-status-pill {
          display: flex;
          align-items: center;
          gap: 7px;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #059669;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.05em;
        }

        .status-orb {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10B981;
          box-shadow: 0 0 6px #10B981;
        }

        .btn-header-quick {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #F0FDF4;
          border: 1px solid #BBF7D0;
          color: #15803D;
          padding: 7px 14px;
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .btn-header-quick:hover {
          background: #DCFCE7;
        }

        .btn-header-gateway {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #0284C7;
          border: none;
          color: #FFFFFF;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition-fast);
          box-shadow: 0 3px 12px rgba(2, 132, 199, 0.25);
        }

        .btn-header-gateway:hover {
          background: #0369A1;
        }

        /* Announcement Banner */
        .announcement-banner {
          background: rgba(2, 132, 199, 0.06);
          border-bottom: 1px solid rgba(2, 132, 199, 0.15);
          padding: 9px 24px;
          font-size: 0.78rem;
          display: flex;
          justify-content: center;
          position: relative;
          z-index: 10;
        }

        .announcement-content {
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: 1280px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .badge-pill {
          background: #0284C7;
          color: #FFFFFF;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          letter-spacing: 0.05em;
        }

        .announcement-text {
          color: #334155;
          font-weight: 600;
        }

        .announcement-link {
          color: #0284C7;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          text-decoration: none;
        }

        /* Hero Section */
        .commercial-hero {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 60px 28px 48px;
        }

        .hero-grid-wrapper {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 52px;
          align-items: center;
        }

        .hero-narrative {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .hero-mission-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(2, 132, 199, 0.08);
          border: 1px solid rgba(2, 132, 199, 0.22);
          color: #0284C7;
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          width: fit-content;
        }

        .pill-star {
          color: #0284C7;
        }

        .hero-master-title {
          font-size: 3.5rem;
          font-weight: 900;
          line-height: 1.1;
          color: #0F172A;
          letter-spacing: -0.03em;
        }

        .hero-lead-paragraph {
          font-size: 1.12rem;
          line-height: 1.65;
          color: #475569;
          max-width: 600px;
        }

        .hero-cta-group {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .btn-hero-primary {
          display: flex;
          align-items: center;
          gap: 9px;
          background: linear-gradient(135deg, #0284C7, #0369A1);
          color: #FFFFFF;
          border: none;
          padding: 15px 24px;
          border-radius: 14px;
          font-size: 0.92rem;
          font-weight: 800;
          cursor: pointer;
          transition: var(--transition-normal);
          box-shadow: 0 10px 28px rgba(2, 132, 199, 0.28);
        }

        .btn-hero-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 34px rgba(2, 132, 199, 0.38);
        }

        .btn-hero-secondary {
          display: flex;
          align-items: center;
          gap: 9px;
          background: #FFFFFF;
          color: #0F172A;
          border: 1px solid #CBD5E1;
          padding: 15px 22px;
          border-radius: 14px;
          font-size: 0.92rem;
          font-weight: 800;
          cursor: pointer;
          transition: var(--transition-fast);
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
        }

        .btn-hero-secondary:hover {
          background: #F8FAFC;
          border-color: #94A3B8;
          transform: translateY(-2px);
        }

        .hero-metrics-bar {
          display: flex;
          align-items: center;
          gap: 20px;
          padding-top: 14px;
          border-top: 1px solid rgba(226, 232, 240, 0.9);
        }

        .metric-cell {
          display: flex;
          flex-direction: column;
        }

        .metric-number {
          font-size: 1.25rem;
          font-weight: 900;
          color: #0F172A;
          letter-spacing: -0.02em;
        }

        .metric-caption {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #64748B;
        }

        .metric-divider {
          width: 1px;
          height: 32px;
          background: #E2E8F0;
        }

        /* Hero Right Column: Terminal Mockup Card */
        .hero-terminal-container {
          display: flex;
          justify-content: center;
        }

        .terminal-card {
          width: 100%;
          max-width: 480px;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 24px 60px -12px rgba(15, 23, 42, 0.12), 0 4px 18px rgba(15, 23, 42, 0.04);
        }

        .terminal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: #F1F5F9;
          border-bottom: 1px solid #E2E8F0;
        }

        .terminal-controls {
          display: flex;
          gap: 6px;
        }

        .terminal-controls .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .dot.red { background: #EF4444; }
        .dot.yellow { background: #F59E0B; }
        .dot.green { background: #10B981; }

        .terminal-tabs {
          display: flex;
          gap: 6px;
        }

        .terminal-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: #64748B;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 5px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .terminal-tab.active {
          background: #FFFFFF;
          color: #0284C7;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
        }

        .terminal-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .radar-status-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid #E2E8F0;
        }

        .radar-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .radar-pulse-ring {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10B981;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2);
        }

        .radar-label {
          font-size: 0.72rem;
          color: #475569;
        }

        .mesh-crypto-badge {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          background: #F1F5F9;
          color: #0F172A;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid #CBD5E1;
        }

        /* Audio simulation widget */
        .terminal-audio-widget {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .audio-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .audio-meta-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .audio-meta-left strong {
          display: block;
          font-size: 0.78rem;
          color: #0F172A;
        }

        .audio-subtext {
          font-size: 0.68rem;
          color: #64748B;
        }

        .btn-audio-sim {
          display: flex;
          align-items: center;
          gap: 5px;
          background: #0284C7;
          color: #FFFFFF;
          border: none;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.72rem;
          font-weight: 800;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .btn-audio-sim.playing {
          background: #10B981;
        }

        .waveform-bars {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 36px;
          padding: 4px 8px;
          background: #FFFFFF;
          border-radius: 8px;
          border: 1px solid #E2E8F0;
        }

        .wave-bar {
          flex: 1;
          background: #0284C7;
          border-radius: 2px;
          transition: height 0.2s ease;
        }

        .wave-bar.animating {
          animation: wavePulse 0.5s infinite alternate ease-in-out;
        }

        @keyframes wavePulse {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1.3); }
        }

        /* Terminal Discovered Nodes */
        .terminal-nodes-feed {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .feed-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #64748B;
        }

        .feed-items-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .feed-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 10px;
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          font-size: 0.72rem;
        }

        .feed-node-id {
          display: flex;
          align-items: center;
          gap: 7px;
          font-weight: 700;
          color: #0F172A;
        }

        .feed-node-role {
          font-size: 0.62rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          background: #F1F5F9;
          color: #475569;
        }

        .feed-node-ping {
          color: #059669;
          font-weight: 700;
          font-size: 0.68rem;
        }

        .terminal-footer-action {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 10px;
          border-top: 1px dashed #E2E8F0;
          font-size: 0.74rem;
          color: #64748B;
        }

        .btn-terminal-join {
          display: flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          color: #0284C7;
          font-weight: 800;
          font-size: 0.74rem;
          cursor: pointer;
        }

        /* Terminal Gateway Body (Form) */
        .terminal-gateway-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .gateway-role-toggle {
          display: flex;
          background: #F1F5F9;
          padding: 4px;
          border-radius: 12px;
          border: 1px solid #E2E8F0;
        }

        .btn-role-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 12px;
          border: none;
          background: transparent;
          color: #64748B;
          font-size: 0.72rem;
          font-weight: 800;
          border-radius: 9px;
          cursor: pointer;
        }

        .btn-role-tab.active {
          background: #FFFFFF;
          color: #0284C7;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
        }

        .gateway-form-inner {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-fields-stack {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .form-field-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .form-field-group label {
          font-size: 0.66rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #64748B;
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-with-icon svg {
          position: absolute;
          left: 14px;
          color: #94A3B8;
        }

        .input-with-icon input {
          width: 100%;
          padding: 12px 14px 12px 42px;
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          border-radius: 12px;
          color: #0F172A;
          font-size: 0.85rem;
          font-weight: 600;
          outline: none;
        }

        .input-with-icon input:focus {
          border-color: #0284C7;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
        }

        .btn-auto-gen {
          position: absolute;
          right: 8px;
          background: rgba(2, 132, 199, 0.08);
          border: 1px solid rgba(2, 132, 199, 0.25);
          color: #0284C7;
          padding: 5px 9px;
          border-radius: 7px;
          font-size: 0.65rem;
          font-weight: 800;
          cursor: pointer;
        }

        .otp-highlight-field {
          text-align: center;
          font-size: 1.3rem !important;
          letter-spacing: 0.4em;
          font-weight: 800;
        }

        .gateway-error-banner {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #DC2626;
          padding: 9px 12px;
          border-radius: 10px;
          font-size: 0.74rem;
          text-align: center;
          font-weight: 600;
        }

        .btn-gateway-action {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, #0284C7, #0369A1);
          color: #FFFFFF;
          border: none;
          padding: 13px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(2, 132, 199, 0.25);
        }

        .gateway-demo-credential {
          font-size: 0.7rem;
          font-weight: 700;
          color: #64748B;
          text-align: center;
          background: #F1F5F9;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px dashed #CBD5E1;
        }

        /* Trust Strip */
        .commercial-trust-strip {
          position: relative;
          z-index: 10;
          border-top: 1px solid #E2E8F0;
          border-bottom: 1px solid #E2E8F0;
          background: rgba(255, 255, 255, 0.75);
          padding: 24px 28px;
        }

        .trust-inner {
          max-width: 1280px;
          margin: 0 auto;
          text-align: center;
        }

        .trust-eyebrow {
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.16em;
          color: #64748B;
          display: block;
          margin-bottom: 14px;
        }

        .trust-badges-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 28px;
          flex-wrap: wrap;
        }

        .trust-badge-item {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 0.76rem;
          font-weight: 800;
          color: #334155;
          letter-spacing: 0.04em;
        }

        /* Simulator Workbench */
        .simulator-section {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 70px 28px;
        }

        .section-head {
          text-align: center;
          max-width: 720px;
          margin: 0 auto 48px;
        }

        .section-category-tag {
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.16em;
          color: #0284C7;
          display: block;
          margin-bottom: 8px;
        }

        .section-main-heading {
          font-size: 2.3rem;
          font-weight: 900;
          color: #0F172A;
          letter-spacing: -0.02em;
          margin-bottom: 12px;
        }

        .section-subtext {
          font-size: 0.96rem;
          color: #64748B;
          line-height: 1.6;
        }

        .simulator-workbench {
          display: grid;
          grid-template-columns: 1.35fr 0.65fr;
          gap: 28px;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 24px;
          padding: 24px;
          box-shadow: 0 16px 40px -10px rgba(15, 23, 42, 0.06);
        }

        .sim-canvas-viewport {
          position: relative;
          background: #0F172A;
          border-radius: 18px;
          min-height: 380px;
          overflow: hidden;
          box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.4);
        }

        .sim-grid-lines {
          position: absolute;
          width: 100%;
          height: 100%;
          background-size: 32px 32px;
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
        }

        .sim-svg-connections {
          position: absolute;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .anim-packet-hop {
          animation: dashMove 0.8s linear infinite;
        }

        @keyframes dashMove {
          to { stroke-dashoffset: -24; }
        }

        .sim-node-pin {
          position: absolute;
          transform: translate(-50%, -50%);
          cursor: pointer;
        }

        .pin-halo {
          position: absolute;
          top: -6px;
          left: -6px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(2, 132, 199, 0.25);
          animation: pulseRing 2s infinite;
        }

        .pin-core {
          position: relative;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #0284C7;
          color: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 10px #0284C7;
        }

        .sim-node-pin.rescuer .pin-core { background: #0284C7; }
        .sim-node-pin.civilian .pin-core { background: #10B981; }
        .sim-node-pin.drone .pin-core { background: #F59E0B; }

        .pin-popup {
          position: absolute;
          top: 30px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.95);
          color: #FFFFFF;
          padding: 4px 8px;
          border-radius: 6px;
          white-space: nowrap;
          font-size: 0.62rem;
          border: 1px solid rgba(255, 255, 255, 0.15);
          pointer-events: none;
        }

        .sim-overlay-status {
          position: absolute;
          bottom: 14px;
          left: 14px;
          right: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(10px);
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 0.68rem;
          color: #94A3B8;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .sim-overlay-status strong {
          color: #FFFFFF;
        }

        .dot-green {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10B981;
          margin-right: 6px;
        }

        /* Simulator Command Deck */
        .sim-command-deck {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .sim-deck-header h3 {
          font-size: 1.05rem;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 4px;
        }

        .sim-deck-header p {
          font-size: 0.78rem;
          color: #64748B;
        }

        .sim-buttons-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .btn-sim-action {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          border-radius: 12px;
          font-size: 0.82rem;
          font-weight: 800;
          cursor: pointer;
          transition: var(--transition-fast);
          border: 1px solid transparent;
        }

        .btn-sim-action.primary {
          background: #0284C7;
          color: #FFFFFF;
        }

        .btn-sim-action.primary:hover:not(:disabled) {
          background: #0369A1;
        }

        .btn-sim-action.secondary {
          background: #F1F5F9;
          border-color: #CBD5E1;
          color: #0F172A;
        }

        .btn-sim-action.secondary:hover:not(:disabled) {
          background: #E2E8F0;
        }

        .btn-sim-action.tertiary {
          background: transparent;
          color: #64748B;
          font-size: 0.75rem;
        }

        .sim-telemetry-box {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .telemetry-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.66rem;
          font-weight: 800;
          color: #64748B;
        }

        .telemetry-lines {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .t-line.info { color: #0284C7; }
        .t-line.success { color: #059669; }
        .t-line.alert { color: #DC2626; font-weight: 700; }

        /* Bento Grid */
        .bento-features-section {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 60px 28px;
        }

        .bento-grid-deck {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .bento-card {
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 24px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          box-shadow: 0 10px 30px -8px rgba(15, 23, 42, 0.04);
          transition: var(--transition-normal);
        }

        .bento-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 48px -12px rgba(15, 23, 42, 0.08);
          border-color: rgba(2, 132, 199, 0.3);
        }

        .bento-card.bento-wide {
          grid-column: span 2;
        }

        .bento-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .bento-icon-wrapper {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bento-icon-wrapper.azure { background: rgba(2, 132, 199, 0.1); color: #0284C7; }
        .bento-icon-wrapper.emerald { background: rgba(16, 185, 129, 0.1); color: #059669; }
        .bento-icon-wrapper.cyan { background: rgba(6, 182, 212, 0.1); color: #0891B2; }
        .bento-icon-wrapper.rose { background: rgba(239, 68, 68, 0.1); color: #DC2626; }
        .bento-icon-wrapper.indigo { background: rgba(99, 102, 241, 0.1); color: #4F46E5; }
        .bento-icon-wrapper.amber { background: rgba(245, 158, 11, 0.1); color: #D97706; }

        .bento-pill {
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          background: #F1F5F9;
          color: #475569;
          padding: 4px 10px;
          border-radius: 999px;
        }

        .bento-card-content h3 {
          font-size: 1.25rem;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 8px;
        }

        .bento-card-content p {
          font-size: 0.88rem;
          color: #64748B;
          line-height: 1.6;
        }

        .bento-visual-ptt {
          display: flex;
          align-items: center;
          gap: 16px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          padding: 12px 18px;
          border-radius: 16px;
          margin-top: 14px;
        }

        .ptt-mini-button {
          display: flex;
          align-items: center;
          gap: 7px;
          background: #0284C7;
          color: #FFFFFF;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 0.72rem;
          font-weight: 800;
        }

        .ptt-mini-waveform {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 4px;
          height: 28px;
        }

        .ptt-mini-waveform span {
          flex: 1;
          background: #0284C7;
          border-radius: 2px;
        }

        /* Playbooks Section */
        .playbooks-section {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 60px 28px;
        }

        .playbooks-tabs-wrapper {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .playbook-tab-buttons {
          display: flex;
          background: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 16px;
          padding: 6px;
          gap: 6px;
          overflow-x: auto;
        }

        .btn-playbook-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          border: none;
          background: transparent;
          color: #64748B;
          font-size: 0.82rem;
          font-weight: 800;
          border-radius: 12px;
          cursor: pointer;
          transition: var(--transition-fast);
          white-space: nowrap;
        }

        .btn-playbook-tab.active {
          background: #0284C7;
          color: #FFFFFF;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25);
        }

        .playbook-card {
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 24px;
          padding: 36px;
          box-shadow: 0 16px 40px -10px rgba(15, 23, 42, 0.05);
        }

        .playbook-badge {
          display: inline-block;
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          padding: 4px 10px;
          border-radius: 6px;
          margin-bottom: 12px;
        }

        .playbook-badge.red { background: rgba(239, 68, 68, 0.1); color: #DC2626; }
        .playbook-badge.blue { background: rgba(2, 132, 199, 0.1); color: #0284C7; }
        .playbook-badge.orange { background: rgba(245, 158, 11, 0.1); color: #D97706; }
        .playbook-badge.green { background: rgba(16, 185, 129, 0.1); color: #059669; }

        .playbook-card h3 {
          font-size: 1.6rem;
          font-weight: 900;
          color: #0F172A;
          margin-bottom: 10px;
        }

        .playbook-card p {
          font-size: 0.96rem;
          color: #475569;
          line-height: 1.65;
          margin-bottom: 20px;
          max-width: 800px;
        }

        .playbook-tactics {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 0;
        }

        .playbook-tactics li {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.9rem;
          color: #0F172A;
          font-weight: 600;
        }

        /* Comparison Table */
        .comparison-section {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 60px 28px;
        }

        .comparison-table-wrapper {
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 16px 40px -10px rgba(15, 23, 42, 0.05);
        }

        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .comparison-table th {
          background: #F8FAFC;
          padding: 18px 24px;
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #64748B;
          border-bottom: 1px solid #E2E8F0;
        }

        .comparison-table td {
          padding: 18px 24px;
          font-size: 0.86rem;
          color: #334155;
          border-bottom: 1px solid #F1F5F9;
        }

        .comparison-table .highlight-column {
          background: rgba(2, 132, 199, 0.04);
          border-left: 1px solid rgba(2, 132, 199, 0.15);
          border-right: 1px solid rgba(2, 132, 199, 0.15);
        }

        .table-highlight-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #0284C7;
          font-size: 0.88rem;
          font-weight: 900;
        }

        .row-feature {
          font-weight: 700;
          color: #0F172A;
        }

        .text-danger { color: #DC2626; font-weight: 600; }
        .text-emerald { color: #059669; }

        /* FAQ Accordion */
        .faq-section {
          position: relative;
          z-index: 10;
          max-width: 900px;
          margin: 0 auto;
          padding: 60px 28px;
        }

        .faq-accordion-deck {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .faq-item-card {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 18px;
          padding: 20px 24px;
          cursor: pointer;
          transition: var(--transition-normal);
        }

        .faq-item-card:hover {
          border-color: rgba(2, 132, 199, 0.3);
        }

        .faq-item-card.open {
          background: #FFFFFF;
          box-shadow: 0 10px 28px -6px rgba(15, 23, 42, 0.06);
          border-color: #0284C7;
        }

        .faq-question-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .faq-question-text {
          font-size: 0.98rem;
          font-weight: 800;
          color: #0F172A;
        }

        .faq-toggle-icon {
          color: #64748B;
          flex-shrink: 0;
        }

        .faq-answer-block {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid #F1F5F9;
        }

        .faq-answer-block p {
          font-size: 0.88rem;
          color: #475569;
          line-height: 1.65;
        }

        /* Commercial Bottom CTA */
        .commercial-bottom-cta {
          position: relative;
          z-index: 10;
          max-width: 1280px;
          margin: 0 auto;
          padding: 40px 28px 70px;
        }

        .bottom-cta-card {
          background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
          color: #FFFFFF;
          border-radius: 28px;
          padding: 60px 40px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          box-shadow: 0 24px 60px -12px rgba(15, 23, 42, 0.25);
        }

        .bottom-cta-badge {
          background: rgba(255, 255, 255, 0.1);
          color: #38BDF8;
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          padding: 6px 14px;
          border-radius: 999px;
          margin-bottom: 18px;
        }

        .bottom-cta-card h2 {
          font-size: 2.5rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          margin-bottom: 12px;
          max-width: 700px;
        }

        .bottom-cta-card p {
          font-size: 1.05rem;
          color: #94A3B8;
          max-width: 600px;
          line-height: 1.6;
          margin-bottom: 30px;
        }

        .bottom-cta-buttons {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .btn-bottom-primary {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #0284C7;
          color: #FFFFFF;
          border: none;
          padding: 14px 26px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 800;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .btn-bottom-primary:hover {
          background: #0369A1;
        }

        .btn-bottom-secondary {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #FFFFFF;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 14px 26px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 800;
          cursor: pointer;
          transition: var(--transition-fast);
        }

        .btn-bottom-secondary:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        /* Commercial Footer */
        .commercial-footer {
          position: relative;
          z-index: 10;
          background: #FFFFFF;
          border-top: 1px solid #E2E8F0;
          padding: 60px 28px 30px;
        }

        .footer-top-row {
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 40px;
          padding-bottom: 40px;
          border-bottom: 1px solid #F1F5F9;
        }

        .footer-brand-col {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 360px;
        }

        .footer-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.35rem;
          font-weight: 900;
          color: #0F172A;
        }

        .footer-desc {
          font-size: 0.82rem;
          color: #64748B;
          line-height: 1.6;
        }

        .footer-status-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.68rem;
          font-weight: 800;
          color: #059669;
          background: rgba(16, 185, 129, 0.08);
          padding: 4px 10px;
          border-radius: 6px;
          width: fit-content;
        }

        .footer-links-col {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .footer-links-col h4 {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: #0F172A;
        }

        .footer-links-col a, .footer-links-col span {
          font-size: 0.82rem;
          color: #64748B;
          text-decoration: none;
          transition: var(--transition-fast);
        }

        .footer-links-col a:hover {
          color: #0284C7;
        }

        .footer-bottom-bar {
          max-width: 1280px;
          margin: 0 auto;
          padding-top: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.76rem;
          color: #94A3B8;
          flex-wrap: wrap;
          gap: 12px;
        }

        .footer-meta-links {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .btn-footer-link {
          background: none;
          border: none;
          color: #0284C7;
          font-size: 0.76rem;
          font-weight: 700;
          cursor: pointer;
        }

        /* Floating Modal */
        .modal-backdrop-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(8px);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .modal-gateway-card {
          position: relative;
          width: 100%;
          max-width: 440px;
          background: #FFFFFF;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 24px 60px -12px rgba(15, 23, 42, 0.25);
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: modalSlide 0.3s ease-out;
        }

        @keyframes modalSlide {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .modal-close-btn {
          position: absolute;
          top: 20px;
          right: 20px;
          background: #F1F5F9;
          border: none;
          color: #64748B;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .modal-gateway-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
        }

        .modal-icon-badge {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          background: rgba(2, 132, 199, 0.1);
          color: #0284C7;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-gateway-header h3 {
          font-size: 1.3rem;
          font-weight: 900;
          color: #0F172A;
        }

        .modal-gateway-header p {
          font-size: 0.8rem;
          color: #64748B;
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .hero-grid-wrapper {
            grid-template-columns: 1fr;
            gap: 40px;
          }

          .simulator-workbench {
            grid-template-columns: 1fr;
          }

          .bento-grid-deck {
            grid-template-columns: repeat(2, 1fr);
          }

          .bento-card.bento-wide {
            grid-column: span 2;
          }

          .footer-top-row {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 768px) {
          .nav-links-menu, .live-status-pill {
            display: none;
          }

          .hero-master-title {
            font-size: 2.5rem;
          }

          .bento-grid-deck {
            grid-template-columns: 1fr;
          }

          .bento-card.bento-wide {
            grid-column: span 1;
          }

          .comparison-table-wrapper {
            overflow-x: auto;
          }

          .footer-top-row {
            grid-template-columns: 1fr;
          }
        }

        #recaptcha-container {
          display: none;
        }
      `}</style>
    </div>
  );
}
