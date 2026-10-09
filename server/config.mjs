export function readConfig(env=process.env){
 const production=env.NODE_ENV==='production',authMode=env.AUTH_MODE||(production?'supabase':'local'),databaseUrl=env.DATABASE_URL||''
 const origins=(env.CLIENT_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173').split(',').map(s=>s.trim()).filter(Boolean)
 if(!['supabase','local'].includes(authMode))throw new Error('AUTH_MODE: supabase или local.')
 if(production&&authMode==='local')throw new Error('Локальная авторизация запрещена в production. Подключи Supabase Auth.')
 if(production&&!databaseUrl)throw new Error('В production требуется постоянная база PostgreSQL: DATABASE_URL.')
 if(authMode==='supabase'&&(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY))throw new Error('Для Supabase нужны URL и publishable key.')
 if(!origins.length||origins.includes('*')||origins.some(s=>!/^https?:\/\/[^/]+$/.test(s)))throw new Error('CLIENT_ORIGINS должен содержать точные origins сайта, без путей и *.')
 return {production,authMode,databaseUrl,sqlitePath:env.SQLITE_PATH||'server/data/world6.sqlite',origins,supabaseUrl:env.SUPABASE_URL||'',supabaseKey:env.SUPABASE_PUBLISHABLE_KEY||'',ownerId:env.OWNER_USER_ID||'',ownerEmail:env.OWNER_EMAIL?.toLowerCase()||'',port:Number(env.PORT||3001),host:env.HOST||(production?'0.0.0.0':'127.0.0.1'),sessionHours:12}
}
