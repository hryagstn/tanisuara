/**
 * Wraps raw 16-bit mono PCM audio into a standard RIFF/WAV buffer so browsers
 * can play it directly in an <audio> element.
 */
export function pcmToWavBuffer(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export function validateDiagnosePayload(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be JSON.';
  }
  const hasImage = Boolean(body.imageBase64 && body.imageMimeType);
  const hasAudio = Boolean(body.audioBase64 && body.audioMimeType);
  const hasText = Boolean(body.questionText && String(body.questionText).trim());
  const hasFollowUp = Boolean(body.followUpContext && hasText);

  if (!hasImage && !hasAudio && !hasText && !hasFollowUp) {
    return 'Please provide at least a plant photo, a voice recording, or a question.';
  }
  return null;
}
