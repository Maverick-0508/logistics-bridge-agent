import { Conversation } from '@elevenlabs/client';

// ─── Config ───────────────────────────────────────────────────────────────────
const AGENT_ID = "agent_2201kw4cbwwvene8y2s5jb3zb99r";

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const startCallBtn    = document.getElementById('startCallBtn');
const stopCallBtn     = document.getElementById('stopCallBtn');
const statusIndicator = document.getElementById('statusIndicator');
const smsBodyInput    = document.getElementById('smsBody');
const phoneInput      = document.getElementById('phoneNumber');
const muteBtn         = document.getElementById('muteBtn');

// ─── State ────────────────────────────────────────────────────────────────────
let conversationSession = null;
let isMuted             = false;
let volumeRafId         = null;

// ─── Status pill styles ───────────────────────────────────────────────────────
const STATUS_STYLES = {
  offline:    { text: '● OFFLINE',      bg: 'rgba(20,24,36,.6)',        border: '#374151',                     color: '#4b5563'  },
  connecting: { text: '● CONNECTING…',  bg: 'rgba(120,80,0,.2)',        border: 'rgba(217,119,6,.35)',          color: '#fbbf24'  },
  connected:  { text: '● LIVE',         bg: 'rgba(16,185,129,.12)',     border: 'rgba(16,185,129,.35)',         color: '#6ee7b7'  },
  error:      { text: '● ERROR',        bg: 'rgba(239,68,68,.12)',      border: 'rgba(239,68,68,.35)',          color: '#fca5a5'  },
};

function setStatus(state, customText) {
  const s = STATUS_STYLES[state] ?? STATUS_STYLES.offline;
  statusIndicator.textContent = customText ?? s.text;
  statusIndicator.style.cssText =
    `background:${s.bg};border:1px solid ${s.border};color:${s.color};` +
    `padding:4px 12px;border-radius:9999px;font-family:'JetBrains Mono',monospace;` +
    `font-size:10px;letter-spacing:.12em;text-transform:uppercase;`;
}

// ─── Connected UI toggle ──────────────────────────────────────────────────────
function setConnectedUI(isConnected) {
  // Toggle orb buttons
  startCallBtn.classList.toggle('hidden', isConnected);
  if (isConnected) {
    stopCallBtn.classList.remove('hidden');
    stopCallBtn.style.display = 'flex';
  } else {
    stopCallBtn.classList.add('hidden');
    stopCallBtn.style.display = '';
  }
  // Wave visualiser
  window.setWaveActive?.(isConnected);
  // Transcript live dot
  window.setTranscriptLive?.(isConnected);
  // Mute button
  window.setMuteBtnEnabled?.(isConnected);
}

// ─── Reset everything to idle state ──────────────────────────────────────────
function resetUI() {
  setStatus('offline');
  setConnectedUI(false);
  startCallBtn.disabled = false;
  stopCallBtn.disabled  = false;
  isMuted = false;
  window.toggleMuteUI?.(false);
  stopVolumePoll();
}

// ─── Mic volume polling (requestAnimationFrame loop) ──────────────────────────
function startVolumePoll() {
  function tick() {
    if (!conversationSession) return;
    try {
      const vol = conversationSession.getInputVolume?.() ?? 0;
      window.updateMicMeter?.(vol);
    } catch { /* session may have closed */ }
    volumeRafId = requestAnimationFrame(tick);
  }
  volumeRafId = requestAnimationFrame(tick);
}

function stopVolumePoll() {
  if (volumeRafId) {
    cancelAnimationFrame(volumeRafId);
    volumeRafId = null;
  }
  window.updateMicMeter?.(0);
}

// ─── Mute toggle ──────────────────────────────────────────────────────────────
muteBtn.addEventListener('click', () => {
  if (!conversationSession || muteBtn.disabled) return;
  isMuted = !isMuted;
  conversationSession.setMicMuted(isMuted);
  window.toggleMuteUI?.(isMuted);
  window.logActivity?.(
    isMuted ? '🔇 Microphone muted.' : '🎙 Microphone unmuted.',
    'warn'
  );
});

// ─── Build agent prompt override from form inputs ─────────────────────────────
function buildPromptOverride() {
  const phone   = phoneInput?.value.trim() || 'Unknown';
  const message = smsBodyInput.value.trim();
  if (!message) return null;
  return (
    `You are an automated AI logistics voice coordinator. ` +
    `A driver (phone: ${phone}) has sent the following SMS update: ` +
    `"${message}". ` +
    `Relay this information to the client clearly and professionally. ` +
    `Keep your response brief and actionable.`
  );
}

// ─── Save session snapshot ────────────────────────────────────────────────────
function persistSession(status) {
  const duration = window.getSessionDuration?.() || '00:00';
  const messages = parseInt(document.getElementById('messageCount')?.textContent || '0');
  window.saveSession?.({
    date:     new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) +
              ' ' + new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }),
    duration,
    messages,
    status,
  });
}

// ─── Start voice session ──────────────────────────────────────────────────────
async function startVoiceBridge() {
  startCallBtn.disabled = true;

  // 1. Request microphone permission
  setStatus('connecting', '● REQUESTING MIC…');
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error('Microphone access denied:', err);
    setStatus('error', '● MIC DENIED');
    window.logActivity?.('🎙 Microphone access denied. Check browser permissions.', 'error');
    startCallBtn.disabled = false;
    return;
  }

  // 2. Log SMS to history before connecting
  const phone   = phoneInput?.value.trim() || 'Unknown';
  const message = smsBodyInput.value.trim();
  if (message) window.addSmsHistory?.(phone, message);

  // 3. Build prompt and connect
  setStatus('connecting');
  window.logActivity?.('⚡ Initiating bridge connection…', 'warn');

  const promptOverride = buildPromptOverride();
  if (promptOverride) {
    window.logActivity?.('📋 SMS context injected into agent prompt.', 'info');
  }

  try {
    conversationSession = await Conversation.startSession({
      agentId: AGENT_ID,

      ...(promptOverride && {
        overrides: {
          agent: { prompt: { prompt: promptOverride } },
        },
      }),

      onConnect: ({ conversationId }) => {
        console.log('✅ Connected — Session ID:', conversationId);
        setStatus('connected');
        setConnectedUI(true);
        startCallBtn.disabled = false;
        startVolumePoll();
        window.startTimer?.();
        window.logActivity?.(
          `✅ Bridge live — <span style="color:#6ee7b7;font-family:monospace">${conversationId.slice(0, 14)}…</span>`,
          'success'
        );
      },

      onDisconnect: () => {
        console.log('🔌 Disconnected.');
        persistSession('completed');
        stopVolumePoll();
        window.stopTimer?.();
        window.logActivity?.('🔌 Bridge disconnected cleanly.', 'warn');
        conversationSession = null;
        resetUI();
      },

      onMessage: (message) => {
        console.log('💬 Message:', message);
        const isUser = message?.source === 'user';
        const text   = message?.message ?? '';
        if (text) {
          window.addTranscript?.(isUser ? 'user' : 'agent', text);
          window.logActivity?.(
            `💬 ${isUser ? 'User' : 'Agent'}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`,
            'info'
          );
        }
      },

      onAgentResponseCorrection: ({ original_agent_response, corrected_agent_response }) => {
        console.log('✏️ Correction:', original_agent_response, '→', corrected_agent_response);
        window.logActivity?.('✏️ Agent self-corrected a response.', 'warn');
      },

      onError: (error) => {
        console.error('❌ ElevenLabs error:', error);
        setStatus('error');
        window.logActivity?.(`❌ Error: ${error?.message ?? error}`, 'error');
        persistSession('error');
        stopVolumePoll();
        window.stopTimer?.();
        conversationSession = null;
        resetUI();
      },
    });
  } catch (err) {
    console.error('Failed to start session:', err);
    setStatus('error', '● FAILED');
    window.logActivity?.(`❌ Failed to connect: ${err.message}`, 'error');
    startCallBtn.disabled = false;
  }
}

// ─── Stop voice session ───────────────────────────────────────────────────────
async function stopVoiceBridge() {
  if (!conversationSession) return;
  stopCallBtn.disabled = true;
  setStatus('connecting', '● CLOSING…');
  try {
    await conversationSession.endSession();
  } catch (err) {
    console.error('Error ending session:', err);
  } finally {
    conversationSession = null;
    resetUI();
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────
startCallBtn.addEventListener('click', startVoiceBridge);
stopCallBtn.addEventListener('click', stopVoiceBridge);

// Graceful cleanup on tab close
window.addEventListener('beforeunload', () => {
  if (conversationSession) conversationSession.endSession();
});