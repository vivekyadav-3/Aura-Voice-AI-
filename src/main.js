import './style.css';
import { CreateMLCEngine, prebuiltAppConfig } from "@mlc-ai/web-llm";

document.querySelector('#app').innerHTML = `
  <div class="glass-panel" id="main-panel">
    <h1>Aura</h1>
    
    <div class="aura-container">
      <div class="aura-ripple"></div>
      <div class="aura-orb"></div>
    </div>
    
    <div class="status-text" id="status-text">Ready to deploy Local AI (Browser Edge computing).</div>
    
    <div class="transcript-area" id="transcript">Click the brain icon to load my local neural network model.</div>
    
    <div class="controls" id="controls">
      <button class="mic-btn" id="load-btn" aria-label="Load Brain">🧠</button>
    </div>
  </div>
`;

const mainPanel = document.getElementById('main-panel');
const statusText = document.getElementById('status-text');
const transcriptArea = document.getElementById('transcript');
const controls = document.getElementById('controls');

const STATE = {
  UNINITIALIZED: 'uninitialized',
  LOADING: 'loading',
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking'
};

let currentState = STATE.UNINITIALIZED;
let engine = null;

function setState(newState) {
  currentState = newState;
  
  mainPanel.className = 'glass-panel'; 
  if (newState !== STATE.IDLE && newState !== STATE.UNINITIALIZED) {
    mainPanel.classList.add(`state-${newState}`);
  }
  
  switch (newState) {
    case STATE.UNINITIALIZED:
      break;
    case STATE.LOADING:
      mainPanel.classList.add('state-thinking'); 
      controls.innerHTML = '';
      break;
    case STATE.IDLE:
      statusText.textContent = 'Brain Online! Tap to speak.';
      controls.innerHTML = `<button class="mic-btn" id="mic-btn" aria-label="Microphone">🎙️</button>`;
      document.getElementById('mic-btn').addEventListener('click', onMicClick);
      break;
    case STATE.LISTENING:
      statusText.textContent = 'Listening (Say "Stop listening" to end)...';
      transcriptArea.textContent = '...';
      document.getElementById('mic-btn').classList.add('active');
      break;
    case STATE.THINKING:
      statusText.textContent = 'Aura is generating locally...';
      document.getElementById('mic-btn').classList.remove('active');
      break;
    case STATE.SPEAKING:
      statusText.textContent = 'Speaking...';
      document.getElementById('mic-btn').classList.remove('active');
      break;
  }
}

// ---------------------------
// 1. WebLLM Engine Setup
// ---------------------------
document.getElementById('load-btn').addEventListener('click', async () => {
  setState(STATE.LOADING);
  
  transcriptArea.innerHTML = "Initializing WebGPU and downloading model payload... (This will take a few minutes the first time, then it caches fully offline).";
  
  const initProgressCallback = (report) => {
    statusText.textContent = report.text;
  };
  
  try {
    let modelToLoad = "Llama-3.2-1B-Instruct-q4f16_1-MLC"; // Highly optimized 1B local model
    
    // Safely check if the model is available in the installed version of WebLLM
    const availableModels = prebuiltAppConfig.model_list.map(m => m.model_id);
    if (!availableModels.includes(modelToLoad)) {
        modelToLoad = availableModels.find(m => m.includes("Llama-3.1-8B") || m.includes("Llama-3")) || availableModels[0];
    }
    
    console.log("Loading Local AI Model:", modelToLoad);
    engine = await CreateMLCEngine(modelToLoad, { initProgressCallback });
    
    setState(STATE.IDLE);
    transcriptArea.innerHTML = "Model cached successfully.<br/>You can now talk to it completely offline!";
    speakResponse("My neural network is online. How can I help you?");
    
  } catch (error) {
    console.error("Local AI Initialization failed:", error);
    statusText.textContent = "Error: Check browser console. WebGPU may not be supported.";
    transcriptArea.textContent = error.message;
    setState(STATE.UNINITIALIZED);
  }
});


// ---------------------------
// 2. Speech Recognition
// ---------------------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    setState(STATE.LISTENING);
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    transcriptArea.textContent = finalTranscript || interimTranscript;
    
    if (finalTranscript !== '') {
      if (finalTranscript.toLowerCase().includes("stop listening")) {
          recognition.stop();
          setState(STATE.IDLE);
          return;
      }
      processAIResponse(finalTranscript);
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech error:", event.error);
    setState(STATE.IDLE);
    transcriptArea.textContent = `Mic Error: ${event.error}`;
  };

  recognition.onend = () => {
    if (currentState === STATE.LISTENING) {
      setState(STATE.IDLE);
    }
  };
} else {
  console.warn("Speech API missing.");
}

function onMicClick() {
  if (!recognition) return;

  if (currentState === STATE.LISTENING) {
    recognition.stop();
    setState(STATE.IDLE);
  } else if (currentState === STATE.IDLE) {
    try {
      recognition.start();
    } catch (e) { console.error(e); }
  } else if (currentState === STATE.SPEAKING) {
     window.speechSynthesis.cancel();
     setState(STATE.IDLE);
  }
}

// ---------------------------
// 3. AI Logic Using Real Local LLM
// ---------------------------
async function processAIResponse(userInput) {
  setState(STATE.THINKING);
  transcriptArea.innerHTML = `<strong>You:</strong> ${userInput}<br><br><strong>Aura:</strong> <em>Thinking...</em>`;

  try {
    const messages = [
      { role: "system", content: "You are Aura, an elite AI voice assistant running locally on user device. Answer concisely in 1 to 2 short sentences. Absolutely no markdown or asterisks." },
      { role: "user", content: userInput }
    ];
    
    // Perform local inference using WebGPU!
    const chunks = await engine.chat.completions.create({
        messages,
        temperature: 0.7,
        stream: true,
    });
    
    let reply = "";
    for await (const chunk of chunks) {
        reply += chunk.choices[0]?.delta.content || "";
        transcriptArea.innerHTML = `<strong>You:</strong> ${userInput}<br><br><strong>Aura:</strong> ${reply}`;
    }
    
    // Stop thinking animation and speak the fully generated reply
    speakResponse(reply);
    
  } catch (err) {
    console.error(err);
    transcriptArea.innerHTML = `<strong>Aura Error:</strong> Failed to generate inference locally.`;
    setState(STATE.IDLE);
  }
}

// ---------------------------
// 4. Text to Speech
// ---------------------------
function speakResponse(text) {
  if (!window.speechSynthesis) {
    setState(STATE.IDLE);
    return;
  }

  window.speechSynthesis.cancel();
  
  // Clean off any strange chars the LLM might hallucinate
  const cleanText = text.replace(/[*_#~`]/g, '');
  
  const utterance = new SpeechSynthesisUtterance(cleanText);
  
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Samantha') || (v.lang === 'en-US' && v.name.includes('Female')));
  
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = 1.0;
  utterance.pitch = 1.1;

  utterance.onstart = () => setState(STATE.SPEAKING);
  utterance.onend = () => setState(STATE.IDLE);
  utterance.onerror = () => setState(STATE.IDLE);

  window.speechSynthesis.speak(utterance);
}

window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
