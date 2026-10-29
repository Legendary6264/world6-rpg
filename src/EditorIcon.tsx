const paths:Record<string,string>={
 lower:'M12 3v11m-4-4 4 4 4-4M3 20h18M5 20v-3m14 3v-3',
 clipboard:'M8 5H5v16h14V5h-3M9 3h6v4H9V3Zm0 9h6m-6 4h6',
 select:'m5 3 14 9-7 1-3 7-4-17Z',move:'M12 3v18M3 12h18m-12-6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3',
 wall:'M3 5h18v15H3V5Zm0 5h18M3 15h18M9 5v5m6 0v5m-6 0v5',room:'M3 10V4h7m4 0h7v7m0 3v7h-7M10 21H3v-7M8 8h8v8H8Z',
 floor:'m3 12 9-6 9 6-9 6-9-6Zm5-3 9 6m-9 0 9-6',measure:'m3 15 12-12 6 6L9 21l-6-6Zm9-9 3 3m-6 0 3 3m-6 0 3 3',
 rotate:'M5 8a8 8 0 1 1-1 8M5 3v5h5',trash:'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7',undo:'M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 7',redo:'m15 5 6 6-6 6m6-6H10a6 6 0 0 0-6 7',
 cube:'m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4m-8 4v10',copy:'M8 8h12v13H8V8ZM4 16H2V2h13v2',
 person:'M8 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm-3 15v-4a7 7 0 0 1 14 0v4',light:'M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7H8Zm1 4h6M12 1v2',
 settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',layers:'m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',
 save:'M4 3h14l3 3v15H3V3Zm3 0v6h10V3M7 21v-7h10v7',folder:'M3 7V4h7l2 3h9v14H3V7Z',close:'m5 5 14 14M5 19 19 5',chevron:'m8 4 8 8-8 8',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
 lock:'M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4m-4 4v3',play:'m7 3 14 9-14 9V3Z',download:'M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5',upload:'M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5',grid:'M3 3h18v18H3V3Zm6 0v18m6-18v18M3 9h18M3 15h18',
 panel:'M3 4h18v16H3V4Zm11 0v16m3-12h1m-1 4h1m-1 4h1',help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-3-14a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4v.01',
}
export default function EditorIcon({name,size=20}:{name:string;size?:number}){return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]??paths.cube}/></svg>}
