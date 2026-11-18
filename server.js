import 'dotenv/config';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { pcmToWavBuffer, validateDiagnosePayload } from './lib/audio.js';

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.use(express.json({ limit: '12mb' }));
app.use(express.static('public'));

const LANGUAGE_LABELS = {
  id: 'Bahasa Indonesia (warm, simple, practical for farmers)',
  jv: 'Basa Jawa (polite everyday Javanese, easy for farmers to understand)',
  su: 'Basa Sunda (polite everyday Sundanese, easy for farmers to understand)',
  en: 'English (clear, practical, farmer-friendly)',
};

// Agent 1: Agronomist Vision & Voice Diagnosis
const AGENT1_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    plantName: { type: Type.STRING },
    diagnosis: { type: Type.STRING },
    severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
    confidence: { type: Type.STRING },
    spreadRisk: { type: Type.STRING },
    symptomsObserved: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['plantName', 'diagnosis', 'severity', 'confidence', 'spreadRisk', 'symptomsObserved'],
};

// Agent 2: Field Advisor, Cost Estimator & Spoken Summary
const AGENT2_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    estimatedCost: { type: Type.STRING },
    organicOptions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    chemicalOptions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    immediateActions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    preventionTips: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    spokenSummary: { type: Type.STRING },
  },
  required: [
    'estimatedCost',
    'organicOptions',
    'chemicalOptions',
    'immediateActions',
    'preventionTips',
    'spokenSummary',
  ],
};

function extractAudioFromResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'audio/pcm';
      const rawBuffer = Buffer.from(part.inlineData.data, 'base64');

      // Gemini TTS often returns raw 24kHz PCM; wrap in WAV so <audio> plays it directly.
      if (mimeType.includes('pcm') || mimeType.includes('L16')) {
        const rateMatch = mimeType.match(/rate=(\d+)/);
        const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
        const wavBuffer = pcmToWavBuffer(rawBuffer, sampleRate);
        return {
          audioBase64: wavBuffer.toString('base64'),
          audioMimeType: 'audio/wav',
        };
      }
      return {
        audioBase64: part.inlineData.data,
        audioMimeType: mimeType,
      };
    }
  }
  return null;
}

const MODEL_CHAIN = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

async function generateWithFallback(ai, params) {
  let lastErr;
  for (const model of MODEL_CHAIN) {
    try {
      const reqPromise = ai.models.generateContent({ model, ...params });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`503 Timeout on ${model}`)), 12000)
      );
      return await Promise.race([reqPromise, timeoutPromise]);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || '');
      if (msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE')) {
        console.warn(`Model ${model} busy/slow, trying next fallback...`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tanisuara' });
});

app.post('/api/diagnose', async (req, res) => {
  const validationError = validateDiagnosePayload(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured. Copy .env.example to .env and add your key.',
    });
  }

  const {
    imageBase64,
    imageMimeType,
    audioBase64,
    audioMimeType,
    questionText,
    followUpContext,
    language = 'id',
  } = req.body;

  const targetLanguage = LANGUAGE_LABELS[language] || LANGUAGE_LABELS.id;
  const ai = new GoogleGenAI({ apiKey });

  const agent1Parts = [
    {
      text: [
        'You are Agent 1 (Agronomist Vision & Voice Specialist) in TaniSuara.',
        `Write all output text in ${targetLanguage}.`,
        'Inspect the crop/leaf photo and/or farmer voice/text input to identify the plant, primary diagnosis, severity (low, medium, high), confidence level, spreadRisk (short phrase), and 2-3 symptomsObserved.',
        followUpContext
          ? `Previous diagnosis context for follow-up: ${JSON.stringify(followUpContext)}`
          : '',
        questionText ? `Farmer question: ${questionText}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  if (imageBase64 && imageMimeType) {
    agent1Parts.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
  }
  if (audioBase64 && audioMimeType) {
    agent1Parts.push({ inlineData: { data: audioBase64, mimeType: audioMimeType } });
  }

  try {
    // Stage 1: Agronomist Vision & Voice Agent
    const t1 = Date.now();
    const agent1Resp = await generateWithFallback(ai, {
      contents: [{ role: 'user', parts: agent1Parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: AGENT1_SCHEMA,
      },
    });
    const agent1Ms = Date.now() - t1;
    const diagnosis = JSON.parse(agent1Resp.text);

    // Stage 2: Field Advisor & Cost Estimator Agent
    const t2 = Date.now();
    const agent2Prompt = [
      'You are Agent 2 (Local Field Advisor & Cost Estimator) in TaniSuara helping smallholder farmers in Indonesia.',
      `Write all output text in ${targetLanguage}.`,
      `Diagnosis from Agent 1: ${JSON.stringify(diagnosis)}`,
      questionText ? `Farmer question / follow-up: ${questionText}` : '',
      'Provide:',
      '- estimatedCost: realistic IDR range for small-scale treatment (e.g. "Rp 15.000 - Rp 30.000").',
      '- organicOptions: 2 affordable organic/kitchen-based treatments.',
      '- chemicalOptions: 1-2 targeted low-toxicity chemical/fungicide/insecticide options with safety note.',
      '- immediateActions: 3-4 practical step-by-step actions.',
      '- preventionTips: 2-3 prevention tips for the next cycle.',
      '- spokenSummary: warm 2-4 sentence spoken explanation suitable for text-to-speech (no markdown or bullet symbols).',
    ]
      .filter(Boolean)
      .join('\n');

    const agent2Resp = await generateWithFallback(ai, {
      contents: [{ role: 'user', parts: [{ text: agent2Prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: AGENT2_SCHEMA,
      },
    });
    const agent2Ms = Date.now() - t2;
    const advice = JSON.parse(agent2Resp.text);

    // Stage 3: Gemini TTS Audio Synthesis (8s timeout so UI stays snappy)
    const t3 = Date.now();
    let audioPayload = null;
    if (advice.spokenSummary) {
      try {
        const ttsPromise = ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ role: 'user', parts: [{ text: advice.spokenSummary }] }],
          config: {
            responseModalities: ['AUDIO'],
          },
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TTS timeout')), 8000)
        );
        const ttsResp = await Promise.race([ttsPromise, timeoutPromise]);
        audioPayload = extractAudioFromResponse(ttsResp);
      } catch (ttsErr) {
        console.warn('Gemini TTS fallback triggered:', ttsErr.message);
      }
    }
    const ttsMs = Date.now() - t3;

    return res.json({
      ...diagnosis,
      ...advice,
      timings: { agent1Ms, agent2Ms, ttsMs },
      audioBase64: audioPayload?.audioBase64 || null,
      audioMimeType: audioPayload?.audioMimeType || null,
    });
  } catch (err) {
    console.error('Diagnosis error:', err);
    return res.status(502).json({
      error: err.message || 'Failed to analyze crop input with Gemini API.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`TaniSuara running at http://localhost:${PORT}`);
});
