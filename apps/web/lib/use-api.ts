"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, type ApiErrorBody } from "./api";

/** Load a GET endpoint on mount. `reload()` refetches without blanking the page. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const mine = ++seq.current;
    const res = await apiFetch<T>(path);
    if (mine !== seq.current) return; // a newer request superseded this one
    if (res.error) setError(res.error);
    else {
      setError(null);
      setData(res.data ?? null);
    }
    setLoading(false);
  }, [path]);

  useEffect(() => {
    setLoading(path !== null);
    load();
    return () => {
      seq.current++;
    };
  }, [load, path]);

  return { data, error, loading, reload: load };
}
