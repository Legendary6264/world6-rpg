import { useEffect, useState } from 'react';
import { useOnline } from './onlineContext.mjs';
export function useRemote(path) {
    const { request, events } = useOnline();
    const [result, setResult] = useState(null);
    useEffect(() => { if (!path)
        return; const abort = new AbortController(); void request(path, { signal: abort.signal }).then(value => { if (!abort.signal.aborted)
        setResult({ path, request, events, value, error: '' }); }).catch(e => { if (!abort.signal.aborted)
        setResult({ path, request, events, value: null, error: e.message }); }); return () => abort.abort(); }, [path, request, events]);
    // A different room or account never briefly renders the previous response.
    const current = !!path && result?.path === path && result?.request === request;
    return { value: current ? result.value : null, error: current ? result.error : '', loading: !!path && (!current || result.events !== events) };
}
export function useDebounced(value) { const [result, setResult] = useState(value); useEffect(() => { const timer = setTimeout(() => setResult(value), 250); return () => clearTimeout(timer); }, [value]); return result; }
