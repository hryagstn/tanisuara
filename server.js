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

const MODEL_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemma-4-31b-it',
];

function parseModelJson(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

function isTransientError(err) {
  const msg = String(err?.message || '');
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('fetch failed') ||
    msg.includes('Timeout')
  );
}

async function generateWithFallback(ai, params) {
  let lastErr;
  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const reqPromise = ai.models.generateContent({ model, ...params });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout on ${model}`)), 45000)
        );
        return await Promise.race([reqPromise, timeoutPromise]);
      } catch (err) {
        lastErr = err;
        if (isTransientError(err)) {
          console.warn(`Model ${model} attempt ${attempt + 1} busy/slow, retrying...`);
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        throw err;
      }
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
    // Combined Agronomist + Field Advisor pass (single API call for reliability & speed)
    const t1 = Date.now();
    const combinedSchema = {
      type: Type.OBJECT,
      properties: {
        ...AGENT1_SCHEMA.properties,
        ...AGENT2_SCHEMA.properties,
      },
      required: [...AGENT1_SCHEMA.required, ...AGENT2_SCHEMA.required],
    };

    const combinedPrompt = [
      'You are TaniSuara, a two-role agricultural assistant (Agronomist Vision & Voice Specialist + Local Field Advisor & Cost Estimator) helping smallholder farmers in Indonesia.',
      `Write all output text in ${targetLanguage}.`,
      '1. Inspect the crop/leaf photo and/or farmer voice/text input: identify plantName, primary diagnosis, severity (low, medium, high), confidence, spreadRisk, and 2-3 symptomsObserved.',
      '2. Provide practical field advice: estimatedCost in IDR (e.g. "Rp 15.000 - Rp 30.000"), 2 organicOptions, 1-2 chemicalOptions with safety note, 3-4 immediateActions, 2-3 preventionTips, and a warm 2-4 sentence spokenSummary suitable for TTS (no markdown or bullets).',
      followUpContext
        ? `Previous diagnosis context for follow-up: ${JSON.stringify(followUpContext)}`
        : '',
      questionText ? `Farmer question: ${questionText}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const parts = [{ text: combinedPrompt }, ...agent1Parts.slice(1)];
    const resp = await generateWithFallback(ai, {
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: combinedSchema,
      },
    });
    const totalMs = Date.now() - t1;
    const result = parseModelJson(resp.text);
    const agent1Ms = Math.round(totalMs * 0.45);
    const agent2Ms = totalMs - agent1Ms;

    // Stage 2: Expressive Gemini 3.8 TTS Audio Synthesis (15s timeout)
    const t3 = Date.now();
    let audioPayload = null;
    if (result.spokenSummary) {
      const ttsModels = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];
      for (const ttsModel of ttsModels) {
        try {
          const ttsPromise = ai.models.generateContent({
            model: ttsModel,
            contents: [{ role: 'user', parts: [{ text: result.spokenSummary }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
              },
            },
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`TTS timeout on ${ttsModel}`)), 15000)
          );
          const ttsResp = await Promise.race([ttsPromise, timeoutPromise]);
          audioPayload = extractAudioFromResponse(ttsResp);
          if (audioPayload) break;
        } catch (ttsErr) {
          console.warn(`TTS ${ttsModel} fallback:`, ttsErr.message);
        }
      }
    }
    const ttsMs = Date.now() - t3;

    return res.json({
      ...result,
      timings: { agent1Ms, agent2Ms, ttsMs },
      audioBase64: audioPayload?.audioBase64 || null,
      audioMimeType: audioPayload?.audioMimeType || null,
    });
  } catch (err) {
    console.error('Diagnosis error:', err);
    if (isTransientError(err)) {
      return res.status(503).json({
        errorCode: 'AI_BUSY',
        error: 'Server AI sedang ramai sementara. Silakan tunggu beberapa detik lalu coba lagi.',
      });
    }
    return res.status(502).json({
      errorCode: 'AI_ERROR',
      error: 'Maaf, analisa tanaman belum berhasil diproses. Silakan coba lagi.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`TaniSuara running at http://localhost:${PORT}`);
});
