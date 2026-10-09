import { createContext, useContext } from 'react';
export const OnlineContext = createContext(null);
export function useOnline() { const value = useContext(OnlineContext); if (!value)
    throw new Error('OnlineProvider отсутствует.'); return value; }
