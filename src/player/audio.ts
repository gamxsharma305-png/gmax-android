import { Audio, AVPlaybackStatus } from "expo-av";
import type { Track } from "../api/music";

let sound: Audio.Sound | null = null;
let currentId: string | null = null;
let statusCb: ((s: AVPlaybackStatus) => void) | null = null;

export async function setupAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export async function playStreamTrack(
  track: Track,
  onStatus?: (s: AVPlaybackStatus) => void,
): Promise<void> {
  if (!track.streamUrl) throw new Error("No stream URL");
  await setupAudioMode();
  statusCb = onStatus || null;

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
    { shouldPlay: true, progressUpdateIntervalMillis: 400 },
    (st) => statusCb?.(st),
  );
  sound = s;
  currentId = track.id;
}

/** @deprecated use playStreamTrack */
export async function playTrack(
  track: Track,
  onStatus?: (s: AVPlaybackStatus) => void,
): Promise<void> {
  return playStreamTrack(track, onStatus);
}

export async function togglePlayPause(): Promise<boolean> {
  if (!sound) return false;
  const st = await sound.getStatusAsync();
  if (!st.isLoaded) return false;
  if (st.isPlaying) {
    await sound.pauseAsync();
    return false;
  }
  await sound.playAsync();
  return true;
}

export async function seekTo(seconds: number) {
  if (!sound) return;
  const st = await sound.getStatusAsync();
  if (!st.isLoaded) return;
  await sound.setPositionAsync(Math.max(0, seconds * 1000));
}

export async function getPosition(): Promise<{ position: number; duration: number; playing: boolean }> {
  if (!sound) return { position: 0, duration: 0, playing: false };
  const st = await sound.getStatusAsync();
  if (!st.isLoaded) return { position: 0, duration: 0, playing: false };
  return {
    position: (st.positionMillis || 0) / 1000,
    duration: (st.durationMillis || 0) / 1000,
    playing: !!st.isPlaying,
  };
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
  statusCb = null;
}

export function getCurrentId() {
  return currentId;
}
