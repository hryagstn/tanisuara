import test from 'node:test';
import assert from 'node:assert/strict';
import { pcmToWavBuffer, validateDiagnosePayload } from '../lib/audio.js';

test('pcmToWavBuffer prepends valid 44-byte RIFF/WAVE header', () => {
  const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  const wav = pcmToWavBuffer(pcm, 24000, 1, 16);

  assert.equal(wav.length, 48);
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(wav.readUInt32LE(4), 40);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40), 4);
});

test('validateDiagnosePayload rejects empty payloads and accepts image or text', () => {
  assert.ok(validateDiagnosePayload({}));
  assert.equal(validateDiagnosePayload({ questionText: 'Daun cabai menguning' }), null);
  assert.equal(
    validateDiagnosePayload({ imageBase64: 'abc', imageMimeType: 'image/jpeg' }),
    null
  );
});
