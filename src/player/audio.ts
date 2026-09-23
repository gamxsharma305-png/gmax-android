import { Audio, AVPlaybackStatus } from "expo-av";
import type { Track } from "../api/music";

let sound: Audio.Sound | null = null;
let currentId: string | null = null;

export async function setupAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export async function playTrack(
  track: Track,
  onStatus?: (s: AVPlaybackStatus) => void,
): Promise<void> {
  await setupAudioMode();

  if (sound) {
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      /* ignore */
    }
    sound = null;
  }

  const { sound: s } = await Audio.Sound.createAsync(
    { uri: track.streamUrl },
    { shouldPlay: true, progressUpdateIntervalMillis: 500 },
    onStatus,
  );
  sound = s;
  currentId = track.id;
}

export async function togglePlayPause() {
  if (!sound) return;
  const st = await sound.getStatusAsync();
  if (!st.isLoaded) return;
  if (st.isPlaying) await sound.pauseAsync();
  else await sound.playAsync();
}

export async function stopPlayback() {
  if (!sound) return;
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } catch {
    /* ignore */
  }
  sound = null;
  currentId = null;
}

export function getCurrentId() {
  return currentId;
}
