import { Conversation } from '@elevenlabs/client';

// ─── Config ──────────────────────────────────────────────────────────────────
// Replace with your Agent ID from https://elevenlabs.io/app/conversational-ai
const AGENT_ID = "agent_2201kw4cbwwvene8y2s5jb3zb99r";

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const startCallBtn    = document.getElementById('startCallBtn');
const stopCallBtn     = document.getElementById('stopCallBtn');
const statusIndicator = document.getElementById('statusIndicator');
const smsBodyInput    = document.getElementById('smsBody');
const phoneInput      = document.getElementById('phoneNumber');

// ─── State ────────────────────────────────────────────────────────────────────
let conversationSession = null;

// ─── UI helpers ───────────────────────────────────────────────────────────────
function setStatus(text, state = 'offline') {
  const styles = {
    offline:     'bg-gray-700 text-gray-400 animate-pulse',
    connecting:  'bg-yellow-900/60 text-yellow-300 animate-pulse',
    connected:   'bg-emerald-500/20 text-emerald-400 font-bold',
    error:       'bg-rose-900/60 text-rose-400',
  };
  statusIndicator.textContent = text;
  statusIndicator.className =
    `px-4 py-2 rounded-full text-sm font-medium tracking-wide ${styles[state] ?? styles.offline}`;
}

function setConnectedUI(isConnected) {
  startCallBtn.classList.toggle('hidden', isConnected);
  stopCallBtn.classList.toggle('hidden', !isConnected);
}

function resetUI() {
  setStatus('🔴 OFFLINE', 'offline');
  setConnectedUI(false);
  startCallBtn.disabled = false;
  stopCallBtn.disabled = false;
}

// ─── Build prompt override from form inputs ───────────────────────────────────
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

// ─── Start session ────────────────────────────────────────────────────────────
async function startVoiceBridge() {
  startCallBtn.disabled = true;

  // 1. Request microphone access
  setStatus('🔄 REQUESTING MIC ACCESS…', 'connecting');
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error('Microphone access denied:', err);
    setStatus('🎙️ Microphone access denied', 'error');
    startCallBtn.disabled = false;
    return;
  }

  // 2. Start ElevenLabs session
  setStatus('⚡ CONNECTING TO BRIDGE…', 'connecting');
  const promptOverride = buildPromptOverride();

  try {
    conversationSession = await Conversation.startSession({
      agentId: AGENT_ID,

      ...(promptOverride && {
        overrides: {
          agent: {
            prompt: { prompt: promptOverride },
          },
        },
      }),

      onConnect: ({ conversationId }) => {
        console.log('✅ Connected — Session ID:', conversationId);
        setStatus('🟢 BRIDGE LIVE — SPEAK NOW', 'connected');
        setConnectedUI(true);
        startCallBtn.disabled = false;
      },

      onDisconnect: () => {
        console.log('🔌 Session disconnected.');
        conversationSession = null;
        resetUI();
      },

      onMessage: (message) => {
        console.log('💬 Message received:', message);
      },

      onAgentResponseCorrection: ({ original_agent_response, corrected_agent_response }) => {
        console.log('✏️ Agent corrected:', original_agent_response, '→', corrected_agent_response);
      },

      onError: (error) => {
        console.error('❌ ElevenLabs error:', error);
        setStatus('❌ Connection Error', 'error');
        conversationSession = null;
        resetUI();
      },
    });
  } catch (err) {
    console.error('Failed to start session:', err);
    setStatus('❌ Failed to connect', 'error');
    startCallBtn.disabled = false;
  }
}

// ─── End session ──────────────────────────────────────────────────────────────
async function stopVoiceBridge() {
  if (!conversationSession) return;

  stopCallBtn.disabled = true;
  setStatus('🔌 DISCONNECTING…', 'connecting');

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

// Cleanly close session if user navigates away
window.addEventListener('beforeunload', () => {
  if (conversationSession) conversationSession.endSession();
});