import { createContext,useContext } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Socket } from 'socket.io-client'
import type { OnlineUser,OnlineConfig } from './onlineTypes'
export type Request=<T>(path:string,options?:RequestInit)=>Promise<T>
export type OnlineContextValue={user:OnlineUser|null;config:OnlineConfig|null;error:string;loading:boolean;connected:boolean;events:number;refresh:()=>void;request:Request;socket:Socket|null;supabase:SupabaseClient|null;login:(email:string,password:string)=>Promise<string>;register:(email:string,password:string,displayName:string)=>Promise<string>;logout:()=>Promise<void>;reloadUser:()=>Promise<void>;recovering:boolean;clearRecovery:()=>void}
export const OnlineContext=createContext<OnlineContextValue|null>(null)
export function useOnline(){const value=useContext(OnlineContext);if(!value)throw new Error('OnlineProvider отсутствует.');return value}
