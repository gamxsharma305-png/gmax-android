import { RepeatMode, Track } from '../core/types';

export type QueueSnapshot = {
  tracks: Track[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  context: string;
};

export const EMPTY_QUEUE: QueueSnapshot = {
  tracks: [],
  index: -1,
  shuffle: false,
  repeat: 'off',
  context: '',
};

export class Queue {
  private tracks: Track[] = [];
  private order: number[] = [];
  private position = -1;
  private shuffleOn = false;
  private repeatMode: RepeatMode = 'off';
  private contextLabel = '';

  get items(): Track[] {
    return [...this.tracks];
  }

  get upcoming(): Track[] {
    return this.order.slice(this.position + 1).map((i) => this.tracks[i]);
  }

  get current(): Track | null {
    const i = this.order[this.position];
    return i === undefined ? null : (this.tracks[i] ?? null);
  }

  get currentIndex(): number {
    return this.order[this.position] ?? -1;
  }

  get length(): number {
    return this.tracks.length;
  }

  get shuffle(): boolean {
    return this.shuffleOn;
  }

  get repeat(): RepeatMode {
    return this.repeatMode;
  }

  get context(): string {
    return this.contextLabel;
  }

  get hasNext(): boolean {
    if (!this.tracks.length) return false;
    if (this.repeatMode !== 'off') return true;
    return this.position < this.order.length - 1;
  }

  get hasPrevious(): boolean {
    return this.tracks.length > 0;
  }

  snapshot(): QueueSnapshot {
    return {
      tracks: this.items,
      index: this.currentIndex,
      shuffle: this.shuffleOn,
      repeat: this.repeatMode,
      context: this.contextLabel,
    };
  }

  restore(snapshot: QueueSnapshot): void {
    this.tracks = [...(snapshot.tracks ?? [])];
    this.shuffleOn = snapshot.shuffle ?? false;
    this.repeatMode = snapshot.repeat ?? 'off';
    this.contextLabel = snapshot.context ?? '';
    this.rebuildOrder();
    const startAt = snapshot.index ?? -1;
    this.position = startAt >= 0 ? this.order.indexOf(startAt) : -1;
  }

  setTracks(tracks: Track[], startIndex = 0, context = ''): void {
    this.tracks = dedupe(tracks);
    this.contextLabel = context;
    const target = tracks[startIndex];
    const resolvedStart = target
      ? Math.max(0, this.tracks.findIndex((t) => t.id === target.id))
      : 0;
    this.rebuildOrder(resolvedStart);
    this.position = this.order.indexOf(resolvedStart);
    if (this.position < 0) this.position = this.tracks.length ? 0 : -1;
  }

  add(tracks: Track | Track[]): void {
    const incoming = Array.isArray(tracks) ? tracks : [tracks];
    const existing = new Set(this.tracks.map((t) => t.id));
    const fresh = incoming.filter((t) => !existing.has(t.id));
    if (!fresh.length) return;
    const firstNew = this.tracks.length;
    this.tracks.push(...fresh);
    for (let i = 0; i < fresh.length; i++) this.order.push(firstNew + i);
    if (this.position < 0 && this.order.length) this.position = 0;
  }

  playNext(tracks: Track | Track[]): void {
    const incoming = Array.isArray(tracks) ? tracks : [tracks];
    if (!incoming.length) return;
    for (const t of incoming) this.remove(t.id, { keepCurrent: true });
    const firstNew = this.tracks.length;
    this.tracks.push(...incoming);
    const insertAt = this.position + 1;
    const newOrder = incoming.map((_, i) => firstNew + i);
    this.order.splice(insertAt, 0, ...newOrder);
    if (this.position < 0 && this.order.length) this.position = 0;
  }

  remove(trackId: string, opts: { keepCurrent?: boolean } = {}): boolean {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return false;
    const wasCurrent = this.currentIndex === trackIndex;
    if (wasCurrent && opts.keepCurrent) return false;
    const orderPos = this.order.indexOf(trackIndex);
    this.tracks.splice(trackIndex, 1);
    this.order.splice(orderPos, 1);
    this.order = this.order.map((i) => (i > trackIndex ? i - 1 : i));
    if (orderPos < this.position) this.position -= 1;
    else if (orderPos === this.position)
      this.position = Math.min(this.position, this.order.length - 1);
    if (!this.order.length) this.position = -1;
    return wasCurrent;
  }

  reorder(from: number, to: number): void {
    if (from === to) return;
    if (from < 0 || from >= this.order.length) return;
    if (to < 0 || to >= this.order.length) return;
    const [item] = this.order.splice(from, 1);
    this.order.splice(to, 0, item);
    if (this.position === from) this.position = to;
    else if (from < this.position && to >= this.position) this.position -= 1;
    else if (from > this.position && to <= this.position) this.position += 1;
  }

  setShuffle(on: boolean): void {
    if (this.shuffleOn === on) return;
    const currentTrackIndex = this.currentIndex;
    this.shuffleOn = on;
    this.rebuildOrder(currentTrackIndex >= 0 ? currentTrackIndex : undefined);
    this.position =
      currentTrackIndex >= 0 ? this.order.indexOf(currentTrackIndex) : this.position;
  }

  cycleRepeat(): RepeatMode {
    this.repeatMode =
      this.repeatMode === 'off' ? 'all' : this.repeatMode === 'all' ? 'one' : 'off';
    return this.repeatMode;
  }

  setRepeat(mode: RepeatMode): void {
    this.repeatMode = mode;
  }

  next(auto = false): Track | null {
    if (!this.tracks.length) return null;
    if (auto && this.repeatMode === 'one') return this.current;
    if (this.position < this.order.length - 1) {
      this.position += 1;
      return this.current;
    }
    if (this.repeatMode === 'all' || (this.repeatMode === 'one' && !auto)) {
      if (this.shuffleOn) this.rebuildOrder();
      this.position = 0;
      return this.current;
    }
    return null;
  }

  previous(): Track | null {
    if (!this.tracks.length) return null;
    if (this.position > 0) {
      this.position -= 1;
      return this.current;
    }
    if (this.repeatMode === 'all') {
      this.position = this.order.length - 1;
      return this.current;
    }
    return this.current;
  }

  jumpTo(trackId: string): Track | null {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex < 0) return null;
    const orderPos = this.order.indexOf(trackIndex);
    if (orderPos < 0) return null;
    this.position = orderPos;
    return this.current;
  }

  peekNext(): Track | null {
    if (!this.tracks.length) return null;
    if (this.position < this.order.length - 1) {
      return this.tracks[this.order[this.position + 1]] ?? null;
    }
    if (this.repeatMode === 'all') return this.tracks[this.order[0]] ?? null;
    return null;
  }

  private rebuildOrder(pinFirst?: number): void {
    const indices = this.tracks.map((_, i) => i);
    if (!this.shuffleOn) {
      this.order = indices;
      return;
    }
    const rest = pinFirst === undefined ? indices : indices.filter((i) => i !== pinFirst);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.order = pinFirst === undefined ? rest : [pinFirst, ...rest];
  }
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
