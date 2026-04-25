import * as Speech from 'expo-speech';

export type SpeechPriority = 'system' | 'scene';

const SPEECH_OPTIONS = {
  language: 'en-US',
  pitch: 1.0,
  rate: 0.52,
};

export async function speak(text: string, priority: SpeechPriority) {
  if (priority === 'system' && (await Speech.isSpeakingAsync())) {
    await Speech.stop();
  }

  Speech.speak(text, SPEECH_OPTIONS);
}