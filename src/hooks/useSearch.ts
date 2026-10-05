import { useCallback, useEffect, useRef, useState } from 'react';
import { messageFor } from '../core/errors';
import { EMPTY_SEARCH_RESULTS, SearchFilter, SearchResults } from '../core/types';
import { LibraryService } from '../services/LibraryService';
import { MusicService } from '../services/MusicService';

const DEBOUNCE_MS = 250;

type UseSearch = {
  query: string;
  setQuery: (q: string) => void;
  filter: SearchFilter;
  setFilter: (f: SearchFilter) => void;
  results: SearchResults;
  suggestions: string[];
  isSearching: boolean;
  error: string | null;
  searchNow: (q: string, filter?: SearchFilter) => void;
  retry: () => void;
  clear: () => void;
  hasResults: boolean;
};

export function useSearch(): UseSearch {
  const [query, setQueryState] = useState('');
  const [filter, setFilterState] = useState<SearchFilter>('All');
  const [results, setResults] = useState<SearchResults>(EMPTY_SEARCH_RESULTS);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const active = useRef<{ q: string; filter: SearchFilter }>({ q: '', filter: 'All' });

  const run = useCallback(async (q: string, f: SearchFilter) => {
    const trimmed = q.trim();

    abortRef.current?.abort();

    if (!trimmed) {
      setResults(EMPTY_SEARCH_RESULTS);
      setSuggestions([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();
    abortRef.current = controller;
    active.current = { q: trimmed, filter: f };

    setIsSearching(true);
    setError(null);

    try {
      const found = await MusicService.search(trimmed, {
        filter: f,
        signal: controller.signal,
      });

      if (id !== requestId.current) return;

      setResults(found);
      setIsSearching(false);
      LibraryService.recordSearch(trimmed);
    } catch (e) {
      if (id !== requestId.current || controller.signal.aborted) return;

      setIsSearching(false);
      setResults(EMPTY_SEARCH_RESULTS);
      setError(messageFor(e));
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      abortRef.current?.abort();
      setResults(EMPTY_SEARCH_RESULTS);
      setSuggestions([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void run(query, filter);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filter, run]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const t = setTimeout(() => {
      void MusicService.getSuggestions(trimmed)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, DEBOUNCE_MS + 100);

    return () => clearTimeout(t);
  }, [query]);

  const setQuery = useCallback((q: string) => setQueryState(q), []);
  const setFilter = useCallback((f: SearchFilter) => setFilterState(f), []);

  const searchNow = useCallback(
    (q: string, f?: SearchFilter) => {
      setQueryState(q);
      if (f) setFilterState(f);
      void run(q, f ?? filter);
    },
    [filter, run]
  );

  const retry = useCallback(() => {
    void run(active.current.q, active.current.filter);
  }, [run]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setQueryState('');
    setResults(EMPTY_SEARCH_RESULTS);
    setSuggestions([]);
    setError(null);
    setIsSearching(false);
  }, []);

  return {
    query,
    setQuery,
    filter,
    setFilter,
    results,
    suggestions,
    isSearching,
    error,
    searchNow,
    retry,
    clear,
    hasResults:
      results.tracks.length > 0 ||
      results.artists.length > 0 ||
      results.albums.length > 0 ||
      results.playlists.length > 0,
  };
}
