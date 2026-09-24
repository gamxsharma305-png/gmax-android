import { Audio, AVPlaybackStatus } from "expo-av";
import type { Track } from "./types";
import { safeUrl } from "./text";

type Handlers = {
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onTime: (position: number, duration: number) => void;
  onError: (message: string) => void;
  onBuffer: (busy: boolean) => void;
};

let sound: Audio.Sound | null = null;
let handlers: Handlers | null = null;
let volume = 1;

export async function setupAudioMode() {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export function initEngine(h: Handlers) {
  handlers = h;
  void setupAudioMode();
}

export async function enginePlay(track: Track) {
  handlers?.onBuffer(true);
  await setupAudioMode();
  if (sound) {
    try {
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch {
      /* */
    }
    sound = null;
  }
  const url = safeUrl(track.streamUrl || track.previewUrl || "");
  if (!url) {
    handlers?.onBuffer(false);
    handlers?.onError("No playable stream for this track.");
    return;
  }
  try {
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true, volume, progressUpdateIntervalMillis: 400 },
      (st: AVPlaybackStatus) => {
        if (!st.isLoaded) return;
        if (st.isPlaying) handlers?.onPlay();
        else if (!st.didJustFinish) handlers?.onPause();
        if (st.durationMillis)
          handlers?.onTime((st.positionMillis || 0) / 1000, st.durationMillis / 1000);
        else handlers?.onTime((st.positionMillis || 0) / 1000, 0);
        if (st.isBuffering) handlers?.onBuffer(true);
        else handlers?.onBuffer(false);
        if (st.didJustFinish) handlers?.onEnded();
      },
    );
    sound = s;
    handlers?.onBuffer(false);
  } catch {
    handlers?.onBuffer(false);
    handlers?.onError("Could not play this track.");
  }
}

export function enginePause() {
  void sound?.pauseAsync();
}

export async function engineResume() {
  try {
    await sound?.playAsync();
  } catch {
    handlers?.onError("Tap play to resume.");
  }
}

export function engineSeek(seconds: number) {
  void sound?.setPositionAsync(Math.max(0, seconds * 1000));
}

export function engineSetVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  void sound?.setVolumeAsync(volume);
}

export function engineStop() {
  void (async () => {
    try {
      await sound?.stopAsync();
      await sound?.unloadAsync();
    } catch {
      /* */
    }
    sound = null;
  })();
}

export function setMediaSessionNav(_next: () => void, _prev: () => void) {}
