import { I18N } from './i18n.js';

const STORAGE_KEY = 'tanisuara_garden_log_v1';

const cameraInput = document.getElementById('cameraInput');
const fileInput = document.getElementById('fileInput');
const previewBox = document.getElementById('previewBox');
const previewImg = document.getElementById('previewImg');
const clearPhotoBtn = document.getElementById('clearPhotoBtn');

const recordBtn = document.getElementById('recordBtn');
const recordLabel = document.getElementById('recordLabel');
const recordStatus = document.getElementById('recordStatus');
const recordedAudio = document.getElementById('recordedAudio');

const languageSelect = document.getElementById('languageSelect');
const questionInput = document.getElementById('questionInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const pipelineBox = document.getElementById('pipelineBox');
const errorBox = document.getElementById('errorBox');

const resultCard = document.getElementById('resultCard');
const plantName = document.getElementById('plantName');
const diagnosisTitle = document.getElementById('diagnosisTitle');
const severityBadge = document.getElementById('severityBadge');
const metaLine = document.getElementById('metaLine');
const timingsLine = document.getElementById('timingsLine');
const spokenSummary = document.getElementById('spokenSummary');
const estimatedCost = document.getElementById('estimatedCost');
const symptomsList = document.getElementById('symptomsList');
const organicList = document.getElementById('organicList');
const chemicalList = document.getElementById('chemicalList');
const actionsList = document.getElementById('actionsList');
const preventionList = document.getElementById('preventionList');
const playVoiceBtn = document.getElementById('playVoiceBtn');
const responseAudio = document.getElementById('responseAudio');
const shareWaBtn = document.getElementById('shareWaBtn');
const copyBtn = document.getElementById('copyBtn');

const followUpInput = document.getElementById('followUpInput');
const followUpBtn = document.getElementById('followUpBtn');

const statScans = document.getElementById('statScans');
const statHigh = document.getElementById('statHigh');
const statTop = document.getElementById('statTop');
const logList = document.getElementById('logList');
const clearLogBtn = document.getElementById('clearLogBtn');

const aboutList = document.getElementById('aboutList');
let activeAboutTab = 'features';

const legalModal = document.getElementById('legalModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeModalBtn = document.getElementById('closeModalBtn');
const openPrivacyBtn = document.getElementById('openPrivacyBtn');
const openTermsBtn = document.getElementById('openTermsBtn');

let uiLang = 'id';
let imageState = null;
let audioState = null;
let mediaRecorder = null;
let audioChunks = [];
let lastResult = null;
let pipeTimer = null;

function t(key) {
  return I18N[uiLang][key] ?? I18N.id[key] ?? key;
}

function renderList(el, items) {
  el.innerHTML = '';
  for (const item of items || []) {
    const li = document.createElement('li');
    li.textContent = item;
    el.appendChild(li);
  }
}

function applyUiLanguage(lang) {
  uiLang = lang;
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-ui-lang]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiLang === lang);
  });

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (typeof t(key) === 'string') {
      el.textContent = t(key);
    }
  });

  questionInput.placeholder = t('questionPlaceholder');
  followUpInput.placeholder = t('followUpPlaceholder');
  recordStatus.textContent = audioState ? t('recordingReady') : t('noRecording');
  recordLabel.textContent = audioState ? t('reRecordVoice') : t('recordVoice');

  renderAboutTab(activeAboutTab);
  renderLog();
}

function renderAboutTab(tab) {
  activeAboutTab = tab;
  document.querySelectorAll('[data-about-tab]').forEach((btn) => {
    const isActive = btn.dataset.aboutTab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  renderList(aboutList, t(tab));
}

document.querySelectorAll('[data-about-tab]').forEach((btn) => {
  btn.addEventListener('click', () => renderAboutTab(btn.dataset.aboutTab));
});

document.querySelectorAll('[data-ui-lang]').forEach((btn) => {
  btn.addEventListener('click', () => applyUiLanguage(btn.dataset.uiLang));
});

function fileToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function handleImageSelected(file) {
  if (!file) return;
  const base64 = await fileToBase64(file);
  imageState = { base64, mimeType: file.type || 'image/jpeg' };
  previewImg.src = URL.createObjectURL(file);
  previewBox.classList.remove('hidden');
}

cameraInput.addEventListener('change', (e) => handleImageSelected(e.target.files?.[0]));
fileInput.addEventListener('change', (e) => handleImageSelected(e.target.files?.[0]));

clearPhotoBtn.addEventListener('click', () => {
  imageState = null;
  cameraInput.value = '';
  fileInput.value = '';
  previewBox.classList.add('hidden');
});

function createSampleLeafImage(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ede7db';
  ctx.fillRect(0, 0, 480, 320);

  // Draw a simple leaf with symptom spots/yellowing for quick multimodal testing
  ctx.fillStyle = type === 'chili' ? '#4f772d' : '#588157';
  ctx.beginPath();
  ctx.ellipse(240, 160, 150, 72, -0.15, 0, Math.PI * 2);
  ctx.fill();

  const spots = type === 'chili'
    ? [[180, 145, '#e9c46a', 26], [260, 175, '#e9c46a', 30], [310, 140, '#d4a373', 18]]
    : [[175, 160, '#7f4f24', 12], [235, 138, '#7f4f24', 14], [285, 172, '#9c6644', 11]];

  for (const [x, y, color, r] of spots) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

document.querySelectorAll('[data-sample]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.sample;
    const dataUrl = createSampleLeafImage(type);
    imageState = { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
    previewImg.src = dataUrl;
    previewBox.classList.remove('hidden');

    questionInput.value = type === 'chili'
      ? (uiLang === 'en'
        ? 'My chili leaves are turning yellow and curling. What should I do?'
        : 'Daun cabai saya menguning dan mulai keriting. Apa penanganan murahnya?')
      : (uiLang === 'en'
        ? 'My rice leaves have brown spots. Is this blast or blight?'
        : 'Daun padi saya muncul bercak cokelat, apakah ini hawar atau blas?');
  });
});

recordBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const mimeType = mediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(audioChunks, { type: mimeType });
      const base64 = await fileToBase64(blob);
      audioState = { base64, mimeType };

      recordedAudio.src = URL.createObjectURL(blob);
      recordedAudio.classList.remove('hidden');
      recordBtn.classList.remove('recording');
      recordLabel.textContent = t('reRecordVoice');
      recordStatus.textContent = t('recordingReady');
    };

    mediaRecorder.start();
    recordBtn.classList.add('recording');
    recordLabel.textContent = t('stopRecording');
    recordStatus.textContent = t('recordingNow');
  } catch {
    showError(t('errMic'));
  }
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function hideError() {
  errorBox.classList.add('hidden');
}

function setPipelineStep(activeStep) {
  pipelineBox.classList.remove('hidden');
  pipelineBox.querySelectorAll('.pipe-step').forEach((el) => {
    const step = Number(el.dataset.pipe);
    el.classList.toggle('done', step < activeStep);
    el.classList.toggle('active', step === activeStep);
  });
}

function startPipelineAnimation() {
  setPipelineStep(1);
  clearInterval(pipeTimer);
  let step = 1;
  pipeTimer = setInterval(() => {
    step = Math.min(3, step + 1);
    setPipelineStep(step);
  }, 1800);
}

function stopPipelineAnimation(success) {
  clearInterval(pipeTimer);
  if (success) {
    setPipelineStep(4);
  } else {
    pipelineBox.classList.add('hidden');
  }
}

function speakFallback(text, langCode) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const targetLang = langCode === 'en' ? 'en-US' : 'id-ID';
  utterance.lang = targetLang;
  utterance.rate = 0.96;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) => v.lang.startsWith(langCode === 'en' ? 'en' : 'id') && /google|natural|damayanti/i.test(v.name)
  );
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

playVoiceBtn.addEventListener('click', () => {
  if (!responseAudio.classList.contains('hidden') && responseAudio.src) {
    responseAudio.currentTime = 0;
    responseAudio.play();
    return;
  }
  speakFallback(lastResult?.spokenSummary, languageSelect.value);
});

function formatShareText(data) {
  return [
    `*TaniSuara — ${data.plantName}*`,
    `Diagnosa: ${data.diagnosis} (${data.severity.toUpperCase()})`,
    `Estimasi Biaya: ${data.estimatedCost}`,
    '',
    data.spokenSummary,
    '',
    'Langkah Segera:',
    ...(data.immediateActions || []).map((a) => `- ${a}`),
  ].join('\n');
}

shareWaBtn.addEventListener('click', () => {
  if (!lastResult) return;
  const text = encodeURIComponent(formatShareText(lastResult));
  window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
});

copyBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  await navigator.clipboard.writeText(formatShareText(lastResult));
  copyBtn.textContent = t('copied');
  setTimeout(() => {
    copyBtn.textContent = t('copySummary');
  }, 1800);
});

function loadLogs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLogEntry(data) {
  const logs = loadLogs();
  logs.unshift({
    id: Date.now(),
    date: new Date().toLocaleDateString(uiLang === 'en' ? 'en-US' : 'id-ID', {
      day: '2-digit',
      month: 'short',
    }),
    data: { ...data, audioBase64: null }, // Avoid localStorage quota bloat
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 12)));
  renderLog();
}

function renderLog() {
  const logs = loadLogs();
  statScans.textContent = String(logs.length);
  statHigh.textContent = String(logs.filter((l) => l.data.severity === 'high').length);

  const counts = {};
  for (const item of logs) {
    const p = item.data.plantName || '-';
    counts[p] = (counts[p] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  statTop.textContent = top ? top[0] : '-';

  logList.innerHTML = '';
  if (!logs.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = t('noLog');
    logList.appendChild(p);
    return;
  }

  for (const entry of logs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'log-item';
    btn.innerHTML = `
      <div class="log-item-top">
        <strong>${entry.data.plantName}</strong>
        <span class="badge badge-${entry.data.severity}">${entry.data.severity}</span>
      </div>
      <div class="log-item-diag">${entry.data.diagnosis}</div>
      <div class="log-item-meta">${entry.date} &middot; ${entry.data.estimatedCost || ''}</div>
    `;
    btn.addEventListener('click', () => displayResult(entry.data, false));
    logList.appendChild(btn);
  }
}

clearLogBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  renderLog();
});

function displayResult(data, shouldAutoPlay = true) {
  lastResult = data;
  plantName.textContent = data.plantName;
  diagnosisTitle.textContent = data.diagnosis;
  severityBadge.textContent = data.severity;
  severityBadge.className = `badge badge-${data.severity}`;

  metaLine.textContent = `${t('confidencePrefix')}: ${data.confidence} • ${t('spreadPrefix')}: ${data.spreadRisk}`;
  timingsLine.textContent = data.timings
    ? `Agent 1: ${(data.timings.agent1Ms / 1000).toFixed(1)}s • Agent 2: ${(data.timings.agent2Ms / 1000).toFixed(1)}s • TTS: ${(data.timings.ttsMs / 1000).toFixed(1)}s`
    : '';

  spokenSummary.textContent = data.spokenSummary;
  estimatedCost.textContent = data.estimatedCost;
  renderList(symptomsList, data.symptomsObserved);
  renderList(organicList, data.organicOptions);
  renderList(chemicalList, data.chemicalOptions);
  renderList(actionsList, data.immediateActions);
  renderList(preventionList, data.preventionTips);

  if (data.audioBase64 && data.audioMimeType) {
    responseAudio.src = `data:${data.audioMimeType};base64,${data.audioBase64}`;
    responseAudio.classList.remove('hidden');
    if (shouldAutoPlay) responseAudio.play().catch(() => {});
  } else {
    responseAudio.classList.add('hidden');
    responseAudio.removeAttribute('src');
  }

  resultCard.classList.remove('hidden');
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function runDiagnosis({ followUpText = null } = {}) {
  hideError();
  const questionText = followUpText ?? questionInput.value.trim();

  if (!imageState && !audioState && !questionText) {
    showError(t('errNoInput'));
    return;
  }

  analyzeBtn.disabled = true;
  followUpBtn.disabled = true;
  analyzeBtn.querySelector('span').textContent = t('analyzingBtn');
  startPipelineAnimation();

  try {
    const response = await fetch('/api/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: imageState?.base64 || null,
        imageMimeType: imageState?.mimeType || null,
        audioBase64: followUpText ? null : (audioState?.base64 || null),
        audioMimeType: followUpText ? null : (audioState?.mimeType || null),
        questionText,
        followUpContext: followUpText && lastResult
          ? { plantName: lastResult.plantName, diagnosis: lastResult.diagnosis }
          : null,
        language: languageSelect.value,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const friendly =
        data.errorCode === 'AI_BUSY'
          ? t('errBusy')
          : data.errorCode === 'AI_ERROR'
            ? t('errGeneric')
            : data.error || t('errGeneric');
      throw new Error(friendly);
    }

    stopPipelineAnimation(true);
    displayResult(data, true);
    saveLogEntry(data);
    if (followUpText) followUpInput.value = '';
  } catch (err) {
    stopPipelineAnimation(false);
    showError(err.message);
  } finally {
    analyzeBtn.disabled = false;
    followUpBtn.disabled = false;
    analyzeBtn.querySelector('span').textContent = t('analyzeBtn');
  }
}

analyzeBtn.addEventListener('click', () => runDiagnosis());
followUpBtn.addEventListener('click', () => {
  const q = followUpInput.value.trim();
  if (q) runDiagnosis({ followUpText: q });
});

function openLegalModal(type) {
  modalTitle.textContent = type === 'privacy' ? t('privacyTitle') : t('termsTitle');
  const paragraphs = type === 'privacy' ? t('privacyBody') : t('termsBody');
  modalBody.innerHTML = '';
  for (const text of paragraphs) {
    const item = document.createElement('div');
    item.className = 'legal-item';
    const colonIdx = text.indexOf(':');
    if (colonIdx > 0) {
      const heading = document.createElement('strong');
      heading.textContent = text.slice(0, colonIdx);
      const body = document.createElement('p');
      body.textContent = text.slice(colonIdx + 1).trim();
      item.append(heading, body);
    } else {
      const body = document.createElement('p');
      body.textContent = text;
      item.appendChild(body);
    }
    modalBody.appendChild(item);
  }
  legalModal.showModal();
}

openPrivacyBtn.addEventListener('click', () => openLegalModal('privacy'));
openTermsBtn.addEventListener('click', () => openLegalModal('terms'));
closeModalBtn.addEventListener('click', () => legalModal.close());
legalModal.addEventListener('click', (e) => {
  if (e.target === legalModal) legalModal.close();
});

applyUiLanguage('id');
