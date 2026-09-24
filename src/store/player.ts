import { create } from "zustand";
import type { RepeatMode, Track } from "../lib/gmax/types";
import {
  enginePause,
  enginePlay,
  engineResume,
  engineSeek,
  engineSetVolume,
  initEngine,
} from "../lib/gmax/engine";
import { resolvePlayable } from "../lib/gmax/search";

type PlayerState = {
  current: Track | null;
  queue: Track[];
  index: number;
  isPlaying: boolean;
  isLoading: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  error: string | null;
  contextLabel: string;
  playTrack: (track: Track, opts?: { tracks?: Track[]; label?: string }) => Promise<void>;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
};

let engineBound = false;

function bindEngine() {
  if (engineBound) return;
  engineBound = true;
  initEngine({
    onPlay: () => usePlayer.setState({ isPlaying: true, isLoading: false, error: null }),
    onPause: () => usePlayer.setState({ isPlaying: false }),
    onEnded: () => {
      setTimeout(() => usePlayer.getState().next(), 100);
    },
    onTime: (position, duration) => {
      const d = duration > 0 ? duration : usePlayer.getState().duration;
      usePlayer.setState({ position, duration: d });
    },
    onError: (message) => usePlayer.setState({ error: message, isLoading: false, isPlaying: false }),
    onBuffer: (busy) => usePlayer.setState({ isLoading: busy }),
  });
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  index: 0,
  isPlaying: false,
  isLoading: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: "off",
  volume: 1,
  error: null,
  contextLabel: "",

  playTrack: async (track, opts) => {
    bindEngine();
    const queue = opts?.tracks?.length ? opts.tracks : get().queue.length ? get().queue : [track];
    const index = Math.max(0, queue.findIndex((t) => t.id === track.id));
    set({
      current: track,
      queue,
      index: index >= 0 ? index : 0,
      isLoading: true,
      error: null,
      position: 0,
      duration: track.duration || 0,
      contextLabel: opts?.label || "",
      isPlaying: true,
    });
    try {
      const resolved = await resolvePlayable(track);
      set({ current: resolved });
      await enginePlay(resolved);
    } catch {
      set({ error: "Could not play", isLoading: false, isPlaying: false });
    }
  },

  toggle: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      enginePause();
      set({ isPlaying: false });
    } else {
      void engineResume();
      set({ isPlaying: true });
    }
  },

  next: () => {
    const { queue, index, repeat } = get();
    if (!queue.length) return;
    let next = index + 1;
    if (next >= queue.length) {
      if (repeat === "all") next = 0;
      else return;
    }
    void get().playTrack(queue[next]!, { tracks: queue });
  },

  previous: () => {
    const { queue, index, position } = get();
    if (!queue.length) return;
    if (position > 3) {
      engineSeek(0);
      set({ position: 0 });
      return;
    }
    const prev = index > 0 ? index - 1 : 0;
    void get().playTrack(queue[prev]!, { tracks: queue });
  },

  seek: (seconds) => {
    engineSeek(seconds);
    set({ position: seconds });
  },

  setVolume: (v) => {
    engineSetVolume(v);
    set({ volume: v });
  },
}));
