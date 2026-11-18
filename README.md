# TaniSuara

Voice-first multimodal crop disease and farming assistant in Indonesian local languages, powered by Google Gemini API.

Smallholder farmers in Indonesia often face technical English manuals when crops show early pest or disease symptoms. **TaniSuara** lets farmers snap a photo of a leaf, ask a question by voice in **Bahasa Indonesia, Basa Jawa, Basa Sunda, or English**, and hear practical, affordable care steps read aloud.

## How It Works (2-Agent Pipeline)

1. **Agent 1 — Agronomist Vision & Voice (`gemini-3.8-flash`)**: Inspects the leaf photo alongside the farmer's voice recording or text question to identify the crop, primary diagnosis, severity (`low`, `medium`, `high`), spread risk, and observed symptoms.
2. **Agent 2 — Field Advisor & Cost Estimator (`gemini-3.8-flash`)**: Generates IDR cost estimates, local organic remedies, targeted chemical options with safety notes, immediate steps, prevention tips, and a spoken summary in the chosen language (with automatic fallback to `gemini-flash-latest` / `gemini-flash-lite-latest` on high demand).
3. **Spoken Audio (`gemini-2.5-flash-preview-tts`)**: Converts the summary into playable WAV audio for hands-free listening in the field (with browser Web Speech API fallback).

## Key Features

- **Multimodal Input**: Capture or upload a crop photo, record voice audio, or type a question.
- **Bilingual UI (`ID` / `EN`) + Local AI Responses**: Separate interface language switch and AI response language selector (`Bahasa Indonesia`, `Basa Jawa`, `Basa Sunda`, `English`).
- **Garden Log & Analytics**: Tracks total scans, high-risk cases, and top crops locally in `localStorage`.
- **Follow-up Questions & WhatsApp Share**: Ask follow-up questions using the current diagnosis context or share a formatted summary directly to WhatsApp.

## Google AI Tools Used

- **Gemini 3.8 Flash (`@google/genai`)**: Powers the 2-stage multimodal diagnosis and local cost-estimation agents.
- **Gemini 2.5 Flash TTS (`gemini-2.5-flash-preview-tts`)**: Generates natural spoken guidance for field use.
- **Google Cloud Run**: Containerized Node.js deployment target via the included `Dockerfile`.

## Quickstart

### Prerequisites
- Node.js 20+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### Run Locally

```bash
npm install
cp .env.example .env
# Add your GEMINI_API_KEY inside .env
npm start
```

Open `http://localhost:8080` in your browser.

### Run Tests

```bash
npm test
```

### Deploy to Google Cloud Run

```bash
gcloud run deploy tanisuara \
  --source . \
  --region asia-southeast2 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="YOUR_KEY"
```

## Limitations & Privacy

- **Early Triage Only**: TaniSuara assists with initial identification and education. Confirm severe outbreaks with a local agronomist or lab test before large-scale treatment.
- **Ephemeral Media Processing**: Leaf photos and voice clips are sent to the Gemini API solely to return a diagnosis and are not stored on the TaniSuara server. Scan history stays inside your browser `localStorage`.
