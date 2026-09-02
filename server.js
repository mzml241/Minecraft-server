const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();
const DEFAULT_ADMIN_TOKEN = 'change-me';
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN);
// Render's filesystem is ephemeral unless a Persistent Disk is mounted. Keep
// code/static files beside the app, but make all world/account data movable to
// DATA_DIR (for example /var/data on Render).
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const WORLD_DIR = path.join(DATA_DIR, 'worlds');
// Local development gets an ephemeral session secret when no secret is set,
// while production must use an explicit secret that is independent of the
// administrator token. This prevents the default fallback from being used on
// an internet-facing deployment.
const SESSION_SECRET = String(process.env.SESSION_SECRET || (
  ADMIN_TOKEN === DEFAULT_ADMIN_TOKEN ? crypto.randomBytes(32).toString('hex') : ADMIN_TOKEN
));
if (NODE_ENV === 'production') {
  if (ADMIN_TOKEN === DEFAULT_ADMIN_TOKEN || ADMIN_TOKEN.length < 24) {
    throw new Error('ADMIN_TOKEN must be at least 24 characters and must not use the default in production');
  }
  if (!process.env.SESSION_SECRET || SESSION_SECRET === ADMIN_TOKEN || SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be an explicit, separate secret of at least 32 characters in production');
  }
}
const SESSION_TTL_MS = Math.max(24 * 60 * 60 * 1000, Number(process.env.SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000));
function safeWorldId(value){
  return String(value||'main').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48) || 'main';
}
function worldPath(id){ return path.join(WORLD_DIR, `${safeWorldId(id)}.json`); }
const WORLD_HEIGHT = 80;
const SEA_LEVEL = 30;
const MAX_FLIGHT_HEIGHT = 1000;
// This is sent to every client so movement/collision constants are part of the
// protocol rather than two silently drifting implementations.
const PHYSICS_CONFIG = Object.freeze({
  version: 1,
  chunkSize: 16,
  worldHeight: WORLD_HEIGHT,
  seaLevel: SEA_LEVEL,
  maxFlightHeight: MAX_FLIGHT_HEIGHT,
  player: Object.freeze({ height: 1.8, halfWidth: 0.3, stepHeight: 1.05 }),
  movement: Object.freeze({
    walkSpeed: 4.4,
    sprintSpeed: 6.6,
    waterSpeed: 3.4,
    flightSpeed: 13,
    creativeMaxSpeed: 36,
    survivalMaxSpeed: 18,
    tickIntervalMs: 50,
    autoStep: true
  })
});
// Keep this in sync with the current client block registry (IDs 1 through 51).
const MAX_BLOCK_ID = 51;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 20);
const SPAWN_MIN_DISTANCE = Math.max(20, Number(process.env.SPAWN_MIN_DISTANCE || 20));
const SPAWN_RESERVATION_TTL_MS = Math.max(60 * 60 * 1000, Number(process.env.SPAWN_RESERVATION_TTL_MS || 24 * 60 * 60 * 1000));
const CLAIM_SIZE = 16;
const CLAIM_SPAWN_BUFFER = 64;
const PARCEL_SIZE = CLAIM_SIZE;
const BASE_LAND_PRICE = 1200;
const PREFAB_CATALOG = Object.freeze([
  {id:'cottage_small',name:'Pine Cottage',category:'Residence',price:450,footprint:{w:10,d:8,h:5},description:'A compact timber residence.'},
  {id:'cottage_garden',name:'Garden Cottage',category:'Residence',price:650,footprint:{w:12,d:10,h:5},description:'A bright cottage with a garden-facing plan.'},
  {id:'farmhouse',name:'Field Farmhouse',category:'Residence',price:850,footprint:{w:14,d:10,h:6},description:'A practical farmhouse for the edge of town.'},
  {id:'townhouse',name:'Brick Townhouse',category:'Residence',price:1100,footprint:{w:8,d:12,h:8},description:'A narrow urban home made for a street front.'},
  {id:'modern_house',name:'Modern Courtyard House',category:'Residence',price:1450,footprint:{w:14,d:12,h:6},description:'A clean-lined home arranged around a courtyard.'},
  {id:'glass_house',name:'Glass Atrium House',category:'Residence',price:1750,footprint:{w:12,d:12,h:7},description:'A light-filled architectural residence.'},
  {id:'desert_villa',name:'Desert Villa',category:'Residence',price:2100,footprint:{w:16,d:12,h:6},description:'A shaded villa for warm, open terrain.'},
  {id:'snow_chalet',name:'Snowline Chalet',category:'Residence',price:2300,footprint:{w:14,d:12,h:8},description:'A steep-roof retreat for cold biomes.'},
  {id:'mountain_lodge',name:'Mountain Lodge',category:'Residence',price:2800,footprint:{w:16,d:14,h:9},description:'A larger lodge with a strong landscape presence.'},
  {id:'bakery_shop',name:'Corner Bakery',category:'Shop',price:900,footprint:{w:10,d:8,h:5},description:'A welcoming retail shell for a bakery business.'},
  {id:'general_store',name:'General Store',category:'Shop',price:1250,footprint:{w:12,d:10,h:6},description:'A flexible storefront for daily goods.'},
  {id:'cafe_corner',name:'Corner Cafe',category:'Shop',price:1400,footprint:{w:12,d:12,h:5},description:'A compact cafe with a broad public front.'},
  {id:'market_stall',name:'Covered Market Hall',category:'Shop',price:1650,footprint:{w:16,d:10,h:6},description:'An open market structure for multiple vendors.'},
  {id:'inn_small',name:'Roadside Inn',category:'Hotel',price:1900,footprint:{w:14,d:12,h:7},description:'A small hospitality building for travelers.'},
  {id:'hotel_grand',name:'Grand Hotel',category:'Hotel',price:3200,footprint:{w:16,d:14,h:10},description:'A landmark hotel shell for a premium district.'},
  {id:'gallery_white',name:'White Cube Gallery',category:'Gallery',price:1550,footprint:{w:12,d:12,h:6},description:'A clean exhibition space with a central room.'},
  {id:'gallery_museum',name:'Town Museum',category:'Gallery',price:2600,footprint:{w:16,d:14,h:8},description:'A substantial public gallery for collections and events.'},
  {id:'craft_workshop',name:'Craft Workshop',category:'Workshop',price:1000,footprint:{w:10,d:10,h:6},description:'A practical workshop shell for makers.'},
  {id:'maker_loft',name:'Maker Loft',category:'Workshop',price:1500,footprint:{w:12,d:10,h:8},description:'A tall studio for advanced creative work.'},
  {id:'auto_workshop',name:'Auto Workshop',category:'Workshop',price:1850,footprint:{w:16,d:10,h:6},description:'A wide service building with a large work bay.'},
  {id:'greenhouse',name:'Community Greenhouse',category:'Civic',price:1200,footprint:{w:14,d:10,h:6},description:'A glass civic greenhouse for shared planting.'},
  {id:'library',name:'Neighborhood Library',category:'Civic',price:1750,footprint:{w:14,d:12,h:7},description:'A calm public reading room and learning space.'},
  {id:'clocktower',name:'Clocktower Pavilion',category:'Civic',price:2900,footprint:{w:10,d:10,h:14},description:'A vertical landmark for a town center.'},
  {id:'workshop_courtyard',name:'Arts Courtyard',category:'Workshop',price:2200,footprint:{w:16,d:14,h:6},description:'A generous courtyard for collaborative studios.'}
]);
function prefabCatalogPayload(){ return PREFAB_CATALOG.map(prefab=>({id:prefab.id,name:prefab.name,category:prefab.category,price:prefab.price,footprint:{...prefab.footprint},description:prefab.description,currency:'Coin',paid:true})); }
function prefabById(id){ return PREFAB_CATALOG.find(prefab=>prefab.id===String(id||''))||null; }
const PLAYER_PROFILE_PATH = path.join(DATA_DIR, 'players.json');
const ACCOUNT_PATH = path.join(DATA_DIR, 'accounts.json');
const DATABASE_PATH = path.join(DATA_DIR, 'database.json');
const LEDGER_PATH = path.join(DATA_DIR, 'coin-ledger.json');
let coinLedger=[];
const BUSINESS_TICK_MS=Math.max(15000,Number(process.env.BUSINESS_TICK_MS||30000));
const BUSINESS_CONFIG=Object.freeze({
  shop:{label:'Shop',npcBase:8,npcRate:18,playerFee:24,capacity:8,maintenance:18,salaries:12,advertising:10},
  hotel:{label:'Hotel',npcBase:5,npcRate:42,playerFee:55,capacity:5,maintenance:38,salaries:28,advertising:18},
  gallery:{label:'Gallery',npcBase:6,npcRate:30,playerFee:36,capacity:6,maintenance:26,salaries:20,advertising:14},
  workshop:{label:'Workshop',npcBase:7,npcRate:24,playerFee:32,capacity:7,maintenance:22,salaries:16,advertising:12}
});
const NPC_CONSTRUCTION_TICK_MS=Math.max(1000,Number(process.env.NPC_CONSTRUCTION_TICK_MS||2000));
const NPC_CONSTRUCTION_MAX_QUEUE=Math.max(1,Math.min(8,Number(process.env.NPC_CONSTRUCTION_MAX_QUEUE||3)));
const NPC_CONSTRUCTION_EDITS_PER_TICK=Math.max(1,Math.min(64,Number(process.env.NPC_CONSTRUCTION_EDITS_PER_TICK||4)));
const NPC_CONSTRUCTION_PLANS=Object.freeze([
  {id:'workshop_annex',name:'Workshop Annex',price:650,footprint:{w:4,d:4,h:4},description:'A compact NPC-built extension with a door, window and lamp.'},
  {id:'guest_room',name:'Guest Room',price:900,footprint:{w:5,d:4,h:4},description:'A small enclosed room assembled by the Builder and finished by the Decorator.'},
  {id:'gallery_wing',name:'Gallery Wing',price:1250,footprint:{w:6,d:5,h:5},description:'A public-facing exhibition wing with glass, lighting and a finished entrance.'}
]);
const RENT_TICK_MS=Math.max(1000,Number(process.env.RENT_TICK_MS||30000));
const RENT_MAX_DURATION_CYCLES=Math.max(1,Math.min(365,Number(process.env.RENT_MAX_DURATION_CYCLES||30)));
const COMPANY_MAX_MEMBERS=Math.max(2,Math.min(64,Number(process.env.COMPANY_MAX_MEMBERS||16)));
const DEFAULT_LAND_AUCTION_HOURS=Math.max(1,Math.min(168,Number(process.env.DEFAULT_LAND_AUCTION_HOURS||24)));
const SPAWN_RESERVATION_PATH = path.join(DATA_DIR, 'spawn-reservations.json');

const clients = new Map();
const playerProfiles = new Map();
const accounts = new Map();
const spawnReservations = new Map();
const entities = new Map();
let entitySequence=0;
const worlds = new Map();
let activeWorldId='main';
function makeWorld(id='main', overrides={}){
  return {
    format: 'voxelcraft-server-world', version: 1,
    id: safeWorldId(id),
    name: overrides.name || (id==='main' ? process.env.WORLD_NAME || 'VoxelCraft Multiplayer' : safeName(id)),
    seed: Number(overrides.seed ?? process.env.WORLD_SEED ?? 18699877) | 0,
    mode: overrides.mode==='survival' ? 'survival' : 'creative',
    dayTime: Number.isFinite(Number(overrides.dayTime)) ? ((Number(overrides.dayTime)%1)+1)%1 : 0.28,
    spawn: overrides.spawn && Number.isFinite(Number(overrides.spawn.x)) && Number.isFinite(Number(overrides.spawn.z)) ? {x:Number(overrides.spawn.x),z:Number(overrides.spawn.z)} : {x:0.5,z:0.5},
    revision: Number.isInteger(overrides.revision) ? overrides.revision : 0,
    edits: overrides.edits && typeof overrides.edits==='object' ? overrides.edits : {},
    doors: overrides.doors && typeof overrides.doors==='object' ? overrides.doors : {},
    lights: overrides.lights && typeof overrides.lights==='object' ? overrides.lights : {},
    claims: normalizeClaims(overrides.claims),
    npcProperties: Array.isArray(overrides.npcProperties) ? overrides.npcProperties : [],
    marketListings: Array.isArray(overrides.marketListings) ? overrides.marketListings : [],
    marketHistory: Array.isArray(overrides.marketHistory) ? overrides.marketHistory : [],
    constructionJobs: normalizeConstructionJobs(overrides.constructionJobs),
    rentalOffers: normalizeRentalOffers(overrides.rentalOffers),
    rentalContracts: normalizeRentalContracts(overrides.rentalContracts),
    companies: normalizeCompanies(overrides.companies),
    landAuctions: normalizeLandAuctions(overrides.landAuctions),
    savedAt: overrides.savedAt || null
  };
}
let world=makeWorld('main');
worlds.set('main',world);

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function ensureWorldDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(WORLD_DIR, { recursive: true });
}

function safeIdentity(value) {
  const token=String(value||'').trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : null;
}
function safeUsername(value){
  const username=String(value||'').trim().toLowerCase();
  return /^[a-z0-9_]{3,24}$/.test(username)?username:null;
}
function profileKeyValid(value){ return !!safeIdentity(value)||/^account:[a-z0-9_]{3,24}$/.test(String(value||'')); }
function readJsonFile(filePath,fallback=null){
  try{return fs.existsSync(filePath)?JSON.parse(fs.readFileSync(filePath,'utf8')):fallback;}catch(error){log('JSON load failed:',path.basename(filePath),error.message);return fallback;}
}

// Replace JSON snapshots atomically so a process interruption cannot leave a
// truncated account, ledger, reservation or world file behind.
function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
    fs.renameSync(temporaryPath, filePath);
    return true;
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch (cleanupError) {}
    throw error;
  }
}

const AUTH_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const AUTH_ATTEMPT_LIMIT = 20;
const authAttemptBuckets = new Map();
function allowAuthAttempt(key) {
  const now = Date.now();
  const bucket = authAttemptBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    authAttemptBuckets.set(key, { count: 1, resetAt: now + AUTH_ATTEMPT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= AUTH_ATTEMPT_LIMIT) return false;
  bucket.count += 1;
  return true;
}
const authAttemptCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of authAttemptBuckets) if (now >= bucket.resetAt) authAttemptBuckets.delete(key);
}, AUTH_ATTEMPT_WINDOW_MS);
authAttemptCleanup.unref?.();

const { DatabaseSync } = require('node:sqlite');
const SQLITE_DB_PATH = path.join(DATA_DIR, 'voxelcraft.sqlite');
let sqliteDb = null;
let stmtUpsertAccount = null;
let stmtUpsertProfile = null;
let stmtInsertLedger = null;
let stmtUpsertReservation = null;
let stmtDeleteReservation = null;

function initSqliteDatabase() {
  try {
    sqliteDb = new DatabaseSync(SQLITE_DB_PATH);
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA synchronous = NORMAL;');
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        username TEXT PRIMARY KEY,
        player_id TEXT UNIQUE,
        password_hash TEXT,
        password_salt TEXT,
        name TEXT,
        created_at TEXT,
        last_seen TEXT
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        identity_key TEXT UNIQUE,
        name TEXT,
        wallet_balance INTEGER DEFAULT 0,
        wallet_updated_at TEXT,
        has_claimed_free INTEGER DEFAULT 0,
        created_at TEXT,
        last_seen TEXT
      );
      CREATE TABLE IF NOT EXISTS coin_ledger (
        id TEXT PRIMARY KEY,
        player_id TEXT,
        delta INTEGER,
        balance_after INTEGER,
        type TEXT,
        reason TEXT,
        property_id TEXT,
        business_id TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_player ON coin_ledger (player_id);
      CREATE TABLE IF NOT EXISTS spawn_reservations (
        identity_key TEXT,
        world_id TEXT,
        x REAL,
        y REAL,
        z REAL,
        player_id TEXT,
        reserved_at INTEGER,
        expires_at INTEGER,
        PRIMARY KEY (identity_key, world_id)
      );
    `);

    stmtUpsertAccount = sqliteDb.prepare(`
      INSERT INTO accounts (username, player_id, password_hash, password_salt, name, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        player_id=excluded.player_id,
        password_hash=excluded.password_hash,
        password_salt=excluded.password_salt,
        name=excluded.name,
        last_seen=excluded.last_seen
    `);

    stmtUpsertProfile = sqliteDb.prepare(`
      INSERT INTO profiles (id, identity_key, name, wallet_balance, wallet_updated_at, has_claimed_free, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        identity_key=excluded.identity_key,
        name=excluded.name,
        wallet_balance=excluded.wallet_balance,
        wallet_updated_at=excluded.wallet_updated_at,
        has_claimed_free=excluded.has_claimed_free,
        last_seen=excluded.last_seen
    `);

    stmtInsertLedger = sqliteDb.prepare(`
      INSERT OR IGNORE INTO coin_ledger (id, player_id, delta, balance_after, type, reason, property_id, business_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmtUpsertReservation = sqliteDb.prepare(`
      INSERT INTO spawn_reservations (identity_key, world_id, x, y, z, player_id, reserved_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(identity_key, world_id) DO UPDATE SET
        x=excluded.x, y=excluded.y, z=excluded.z, player_id=excluded.player_id,
        reserved_at=excluded.reserved_at, expires_at=excluded.expires_at
    `);

    stmtDeleteReservation = sqliteDb.prepare(`
      DELETE FROM spawn_reservations WHERE identity_key = ? AND world_id = ?
    `);

    log('SQLite database initialized at', path.basename(SQLITE_DB_PATH));
  } catch (error) {
    log('SQLite initialization warning:', error.message);
    sqliteDb = null;
  }
}

function databaseSnapshot(){return {format:'voxelcraft-database',version:1,updatedAt:new Date().toISOString(),accounts:Object.fromEntries(accounts),profiles:Object.fromEntries(playerProfiles)};}
function saveDatabase(){
  try{atomicWriteJson(DATABASE_PATH,databaseSnapshot());return true;}
  catch(error){log('Database save failed:',error.message);return false;}
}
function databaseSection(section,legacyPath,key){
  const database=readJsonFile(DATABASE_PATH,null),legacy=readJsonFile(legacyPath,null),fromDatabase=database&&database[section]&&typeof database[section]==='object'?database[section]:null,fromLegacy=legacy&&legacy[key]&&typeof legacy[key]==='object'?legacy[key]:{};
  return fromDatabase&&Object.keys(fromDatabase).length?fromDatabase:fromLegacy;
}
function loadAccounts(){
  accounts.clear();
  try{
    if (sqliteDb) {
      const rows = sqliteDb.prepare('SELECT * FROM accounts').all();
      if (rows.length > 0) {
        for (const r of rows) {
          accounts.set(r.username, {
            username: r.username,
            playerId: r.player_id,
            passwordHash: r.password_hash,
            passwordSalt: r.password_salt,
            name: r.name,
            createdAt: r.created_at,
            lastSeen: r.last_seen
          });
        }
        return;
      }
    }
    const raw=databaseSection('accounts',ACCOUNT_PATH,'accounts');
    for(const [key,item] of Object.entries(raw)){
      const username=safeUsername(item?.username||key);
      if(!username||!item||typeof item!=='object'||!/^u_[a-f0-9]{12,32}$/.test(String(item.playerId||''))||typeof item.passwordHash!=='string'||typeof item.passwordSalt!=='string')continue;
      const acc = {username,playerId:String(item.playerId),passwordHash:String(item.passwordHash),passwordSalt:String(item.passwordSalt),name:safeName(item.name||username),createdAt:item.createdAt||null,lastSeen:item.lastSeen||null};
      accounts.set(username, acc);
      if (stmtUpsertAccount) {
        try { stmtUpsertAccount.run(acc.username, acc.playerId, acc.passwordHash, acc.passwordSalt, acc.name, acc.createdAt, acc.lastSeen); } catch (e) {}
      }
    }
  }catch(error){log('Account load failed:',error.message);}
}
function saveAccounts(){
  try{
    if (stmtUpsertAccount) {
      for (const acc of accounts.values()) {
        stmtUpsertAccount.run(acc.username, acc.playerId, acc.passwordHash, acc.passwordSalt, acc.name, acc.createdAt, acc.lastSeen);
      }
    }
    atomicWriteJson(ACCOUNT_PATH,{format:'voxelcraft-accounts',version:1,accounts:Object.fromEntries(accounts)});saveDatabase();return true;
  }
  catch(error){log('Account save failed:',error.message);return false;}
}
function passwordDigest(password,salt){return crypto.pbkdf2Sync(String(password),salt,120000,32,'sha256').toString('hex');}
function accountProfile(account,name){
  const identityKey=`account:${account.username}`;let profile=playerProfiles.get(identityKey);
  if(!profile){profile={id:account.playerId,name:safeName(name||account.name||account.username),createdAt:account.createdAt||new Date().toISOString(),lastSeen:null,wallet:{balance:0,updatedAt:null},hasClaimedFree:false};playerProfiles.set(identityKey,profile);}
  if(profile.id!==account.playerId)profile.id=account.playerId;
  if(name)profile.name=safeName(name);account.name=profile.name;account.lastSeen=new Date().toISOString();
  if(!profile.wallet||typeof profile.wallet!=='object')profile.wallet={balance:0,updatedAt:null};const balance=Number(profile.wallet.balance);profile.wallet.balance=Number.isFinite(balance)&&balance>=0?Math.floor(balance):0;profile.hasClaimedFree=profile.hasClaimedFree===true;
  savePlayerProfiles();saveAccounts();return {identityKey,profile};
}
function authenticateAccount(rawUsername,rawPassword,displayName){
  const username=safeUsername(rawUsername),password=String(rawPassword||'');if(!username)return {ok:false,reason:'invalid_username',message:'Username must be 3–24 letters, numbers or underscores'};if(password.length<6)return {ok:false,reason:'invalid_password',message:'Password must contain at least 6 characters'};
  let account=accounts.get(username),created=false;
  if(!account){
    const salt=crypto.randomBytes(16).toString('hex');
    account={username,playerId:`u_${crypto.randomBytes(8).toString('hex')}`,passwordHash:passwordDigest(password,salt),passwordSalt:salt,name:safeName(displayName||username),createdAt:new Date().toISOString(),lastSeen:null};
    accounts.set(username,account);
    if (stmtUpsertAccount) {
      try { stmtUpsertAccount.run(account.username, account.playerId, account.passwordHash, account.passwordSalt, account.name, account.createdAt, account.lastSeen); } catch (e) {}
    }
    created=true;
  }
  else {const actual=Buffer.from(passwordDigest(password,account.passwordSalt),'hex'),expected=Buffer.from(account.passwordHash,'hex');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return {ok:false,reason:'invalid_credentials',message:'Username or password is incorrect'};}
  return {ok:true,created,account,...accountProfile(account)};
}

function authenticateApiPlayer(payload={}){
  const username=safeUsername(payload.username),password=String(payload.password||''),account=username?accounts.get(username):null;
  if(!account||password.length<6)return null;
  const actual=Buffer.from(passwordDigest(password,account.passwordSalt),'hex'),expected=Buffer.from(account.passwordHash,'hex');
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
  if(payload.playerId&&String(payload.playerId)!==account.playerId)return null;
  const resolved=accountProfile(account,account.name);
  return {playerId:account.playerId,name:resolved.profile.name};
}

function issueRememberedSession(account){
  const expiresAt=Date.now()+SESSION_TTL_MS;
  const payload=`${account.username}.${expiresAt}.${crypto.randomBytes(18).toString('hex')}`;
  const signature=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}
function authenticateRememberedSession(rawUsername,rawToken){
  const username=safeUsername(rawUsername),token=String(rawToken||''),account=username?accounts.get(username):null;
  if(!account||!token)return {ok:false,reason:'session_invalid',message:'Remembered session is invalid or expired'};
  const parts=token.split('.'); if(parts.length!==2)return {ok:false,reason:'session_invalid',message:'Remembered session is invalid or expired'};
  let payload=''; try{payload=Buffer.from(parts[0],'base64url').toString('utf8');}catch(error){return {ok:false,reason:'session_invalid',message:'Remembered session is invalid or expired'};}
  const [tokenUsername,rawExpiry]=payload.split('.');
  const expected=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('base64url'),actual=Buffer.from(parts[1]);
  if(tokenUsername!==username||actual.length!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(actual,Buffer.from(expected))||!Number.isFinite(Number(rawExpiry))||Date.now()>=Number(rawExpiry)) return {ok:false,reason:'session_invalid',message:'Remembered session is invalid or expired'};
  const resolved=accountProfile(account,account.name);
  return {ok:true,created:false,account,...resolved};
}

function loadPlayerProfiles() {
  playerProfiles.clear();
  try {
    if (sqliteDb) {
      const rows = sqliteDb.prepare('SELECT * FROM profiles').all();
      if (rows.length > 0) {
        for (const r of rows) {
          playerProfiles.set(r.identity_key, {
            id: r.id,
            name: r.name,
            createdAt: r.created_at,
            lastSeen: r.last_seen,
            wallet: { balance: r.wallet_balance || 0, updatedAt: r.wallet_updated_at || null },
            hasClaimedFree: Boolean(r.has_claimed_free)
          });
        }
        return;
      }
    }
    const profiles=databaseSection('profiles',PLAYER_PROFILE_PATH,'profiles');
    for(const [identity,profile] of Object.entries(profiles)){
      if(!profileKeyValid(identity)||!profile||typeof profile!=='object') continue;
      if(!/^u_[a-f0-9]{12,32}$/.test(String(profile.id||''))) continue;
      const rawBalance=Number(profile.wallet?.balance ?? profile.walletBalance ?? 0);
      const prof = {id:String(profile.id),name:safeName(profile.name),createdAt:profile.createdAt||null,lastSeen:profile.lastSeen||null,wallet:{balance:Number.isFinite(rawBalance)&&rawBalance>=0?Math.floor(rawBalance):0,updatedAt:profile.wallet?.updatedAt||null},hasClaimedFree:profile.hasClaimedFree===true};
      playerProfiles.set(identity, prof);
      if (stmtUpsertProfile) {
        try { stmtUpsertProfile.run(prof.id, identity, prof.name, prof.wallet.balance, prof.wallet.updatedAt, prof.hasClaimedFree ? 1 : 0, prof.createdAt, prof.lastSeen); } catch (e) {}
      }
    }
  } catch(error) { log('Player profile load failed:',error.message); }
}

function savePlayerProfiles() {
  try {
    if (stmtUpsertProfile) {
      for (const [identity, prof] of playerProfiles.entries()) {
        stmtUpsertProfile.run(prof.id, identity, prof.name, prof.wallet.balance, prof.wallet.updatedAt, prof.hasClaimedFree ? 1 : 0, prof.createdAt, prof.lastSeen);
      }
    }
    const profiles=Object.fromEntries(playerProfiles);
    atomicWriteJson(PLAYER_PROFILE_PATH,{format:'voxelcraft-player-profiles',version:1,profiles});
    saveDatabase();
  } catch(error) { log('Player profile save failed:',error.message); }
}

function loadCoinLedger(){
  coinLedger=[];
  try{
    if (sqliteDb) {
      const rows = sqliteDb.prepare('SELECT * FROM coin_ledger ORDER BY rowid ASC').all();
      if (rows.length > 0) {
        for (const r of rows) {
          coinLedger.push({
            id: r.id,
            playerId: r.player_id,
            delta: r.delta,
            balanceAfter: r.balance_after,
            type: r.type,
            reason: r.reason,
            propertyId: r.property_id,
            businessId: r.business_id,
            createdAt: r.created_at
          });
        }
        return;
      }
    }
    if(!fs.existsSync(LEDGER_PATH)) return;
    const data=JSON.parse(fs.readFileSync(LEDGER_PATH,'utf8')),rows=Array.isArray(data?.transactions)?data.transactions:[];
    for(const row of rows){
      if(!row||typeof row!=='object'||(!/^u_[a-f0-9]{12,32}$/.test(String(row.playerId||''))&&row.playerId!=='system_market')) continue;
      const delta=Math.trunc(Number(row.delta)),balanceAfter=Math.trunc(Number(row.balanceAfter));
      if(!Number.isFinite(delta)||!Number.isFinite(balanceAfter)||!delta) continue;
      const tx = {id:String(row.id||`tx_${crypto.randomBytes(8).toString('hex')}`),playerId:String(row.playerId),delta,balanceAfter,type:String(row.type||'unknown').slice(0,40),reason:String(row.reason||'').slice(0,160),propertyId:row.propertyId?String(row.propertyId).slice(0,80):null,listingId:row.listingId?String(row.listingId).slice(0,80):null,businessId:row.businessId?String(row.businessId).slice(0,80):null,createdAt:row.createdAt||null};
      coinLedger.push(tx);
      if (stmtInsertLedger) {
        try { stmtInsertLedger.run(tx.id, tx.playerId, tx.delta, tx.balanceAfter, tx.type, tx.reason, tx.propertyId, tx.businessId, tx.createdAt); } catch (e) {}
      }
    }
  }catch(error){ log('Coin ledger load failed:',error.message); }
}
function saveCoinLedger(){
  try{ atomicWriteJson(LEDGER_PATH,{format:'voxelcraft-coin-ledger',version:1,transactions:coinLedger}); return true; }
  catch(error){ log('Coin ledger save failed:',error.message); return false; }
}
function profileByPlayerId(playerId){ return Array.from(playerProfiles.values()).find(profile=>profile.id===String(playerId||''))||null; }
function walletSnapshot(playerId){
  const profile=profileByPlayerId(playerId),balance=profile?.wallet?.balance||0,rows=coinLedger.filter(row=>row.playerId===String(playerId)).slice(-20);
  return {currency:'Coin',balance,initialBalance:0,totalEarned:coinLedger.filter(row=>row.playerId===String(playerId)&&row.delta>0).reduce((sum,row)=>sum+row.delta,0),totalSpent:Math.abs(coinLedger.filter(row=>row.playerId===String(playerId)&&row.delta<0).reduce((sum,row)=>sum+row.delta,0)),transactionCount:coinLedger.filter(row=>row.playerId===String(playerId)).length,ledger:rows};
}
function commitCoinTransaction({playerId,delta,type,reason,propertyId=null,businessId=null}){
  const profile=profileByPlayerId(playerId); if(!profile) return {ok:false,reason:'player_not_found'};
  if(!profile.wallet||typeof profile.wallet!=='object') profile.wallet={balance:0,updatedAt:null};
  const amount=Math.trunc(Number(delta)); if(!Number.isFinite(amount)||!amount) return {ok:false,reason:'invalid_amount'};
  const current=Math.max(0,Math.floor(Number(profile.wallet.balance)||0)),next=current+amount;
  if(next<0) return {ok:false,reason:'insufficient_funds',balance:current};
  const now=new Date().toISOString(),tx={id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:String(playerId),delta:amount,balanceAfter:next,type:String(type||'unknown').slice(0,40),reason:String(reason||'').slice(0,160),propertyId:propertyId?String(propertyId).slice(0,80):null,businessId:businessId?String(businessId).slice(0,80):null,createdAt:now};
  profile.wallet={balance:next,updatedAt:now}; coinLedger.push(tx);
  if (stmtInsertLedger) {
    try { stmtInsertLedger.run(tx.id, tx.playerId, tx.delta, tx.balanceAfter, tx.type, tx.reason, tx.propertyId, tx.businessId, tx.createdAt); } catch (e) {}
  }
  if (stmtUpsertProfile) {
    const ident = `account:${profile.name.toLowerCase()}`;
    try { stmtUpsertProfile.run(profile.id, ident, profile.name, profile.wallet.balance, profile.wallet.updatedAt, profile.hasClaimedFree ? 1 : 0, profile.createdAt, profile.lastSeen); } catch (e) {}
  }
  savePlayerProfiles(); saveCoinLedger();
  return {ok:true,tx,wallet:walletSnapshot(playerId)};
}

function loadSpawnReservations() {
  spawnReservations.clear();
  try {
    if (sqliteDb) {
      const now = Date.now();
      const rows = sqliteDb.prepare('SELECT * FROM spawn_reservations WHERE expires_at > ?').all(now);
      if (rows.length > 0) {
        for (const r of rows) {
          spawnReservations.set(r.identity_key, {
            worldId: safeWorldId(r.world_id || 'main'),
            x: r.x,
            y: r.y,
            z: r.z,
            playerId: String(r.player_id || ''),
            reservedAt: r.reserved_at,
            expiresAt: r.expires_at
          });
        }
        return;
      }
    }
    if(!fs.existsSync(SPAWN_RESERVATION_PATH)) return;
    const data=JSON.parse(fs.readFileSync(SPAWN_RESERVATION_PATH,'utf8'));
    const reservations=data&&data.reservations&&typeof data.reservations==='object'?data.reservations:{};
    const now=Date.now();
    for(const [identity,reservation] of Object.entries(reservations)){
      if(!profileKeyValid(identity)||!reservation||typeof reservation!=='object') continue;
      const x=Number(reservation.x),y=Number(reservation.y),z=Number(reservation.z),expiresAt=Number(reservation.expiresAt);
      if(![x,y,z,expiresAt].every(Number.isFinite)||expiresAt<=now) continue;
      const resObj = {worldId:safeWorldId(reservation.worldId||'main'),x,y,z,playerId:String(reservation.playerId||''),reservedAt:reservation.reservedAt||null,expiresAt};
      spawnReservations.set(identity, resObj);
      if (stmtUpsertReservation) {
        try { stmtUpsertReservation.run(identity, resObj.worldId, resObj.x, resObj.y, resObj.z, resObj.playerId, resObj.reservedAt, resObj.expiresAt); } catch (e) {}
      }
    }
  } catch(error) { log('Spawn reservation load failed:',error.message); }
}

function saveSpawnReservations() {
  try {
    if (stmtUpsertReservation) {
      for (const [identity, resObj] of spawnReservations.entries()) {
        stmtUpsertReservation.run(identity, resObj.worldId, resObj.x, resObj.y, resObj.z, resObj.playerId, resObj.reservedAt, resObj.expiresAt);
      }
    }
    atomicWriteJson(SPAWN_RESERVATION_PATH,{format:'voxelcraft-spawn-reservations',version:1,reservations:Object.fromEntries(spawnReservations)});
  } catch(error) { log('Spawn reservation save failed:',error.message); }
}

function pruneSpawnReservations() {
  const now=Date.now(); let changed=false;
  for(const [identity,reservation] of spawnReservations){
    if(!reservation||Number(reservation.expiresAt)<=now){
      spawnReservations.delete(identity);
      if (stmtDeleteReservation) {
        try { stmtDeleteReservation.run(identity, reservation?.worldId || 'main'); } catch (e) {}
      }
      changed=true;
    }
  }
  if(changed) saveSpawnReservations();
}

function loadWorldFile(filePath,id){
  const base=makeWorld(id);
  try{
    if(!fs.existsSync(filePath)) return base;
    const saved=JSON.parse(fs.readFileSync(filePath,'utf8'));
    if(saved&&typeof saved==='object'){
      const loaded=makeWorld(id,{...base,...saved});
      loaded.id=safeWorldId(id);
      loaded.edits=saved.edits&&typeof saved.edits==='object'?saved.edits:{};
      loaded.revision=Number.isInteger(saved.revision)?saved.revision:Object.keys(loaded.edits).length;
      log('Loaded world',loaded.name,'seed',loaded.seed,'edits',Object.keys(loaded.edits).length);
      return loaded;
    }
  }catch(error){ log('World load failed:',error.message); }
  return base;
}
function loadAllWorlds(){
  ensureWorldDir();
  worlds.clear();
  const files=fs.readdirSync(WORLD_DIR).filter(name=>name.endsWith('.json')&&!name.startsWith('.'));
  for(const file of files){
    const id=safeWorldId(path.basename(file,'.json'));
    worlds.set(id,loadWorldFile(path.join(WORLD_DIR,file),id));
  }
  if(!worlds.size) worlds.set('main',makeWorld('main'));
  if(!worlds.has('main')) worlds.set('main',makeWorld('main'));
  activeWorldId=worlds.has(safeWorldId(process.env.ACTIVE_WORLD||'main'))?safeWorldId(process.env.ACTIVE_WORLD||'main'):'main';
  world=worlds.get(activeWorldId);
  ensureDefaultLandAuctions();
  saveWorld();
}

function saveWorldRecord(record) {
  try {
    ensureWorldDir();
    const data = { ...record, savedAt: new Date().toISOString() };
    atomicWriteJson(worldPath(record.id),data);
    record.savedAt = data.savedAt;
    return true;
  } catch (error) {
    log('World save failed:', error.message);
    return false;
  }
}
function saveWorld() { return saveWorldRecord(world); }

function backupWorld() {
  try {
    ensureWorldDir();
    const currentPath=worldPath(world.id);
    if (!fs.existsSync(currentPath)) return;
    const backupDir = path.join(WORLD_DIR, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[T:.Z]/g, '-');
    fs.copyFileSync(currentPath, path.join(backupDir, `${world.id}-${stamp}.json`));
    const files = fs.readdirSync(backupDir).filter(name => name.endsWith('.json')).sort();
    while (files.length > 5) fs.rmSync(path.join(backupDir, files.shift()));
  } catch (error) {
    log('World backup failed:', error.message);
  }
}

function importWorldPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid JSON world file');
  if (!Number.isFinite(Number(payload.seed))) throw new Error('World file has no valid seed');

  const nextEdits = {};
  const addEdit = (x, y, z, id) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
    if (y < 1 || y >= WORLD_HEIGHT || Math.abs(x) > 1000000 || Math.abs(z) > 1000000) return;
    if (!Number.isInteger(id) || id < 0 || id > MAX_BLOCK_ID) return;
    nextEdits[editKey(x, y, z)] = id;
  };

  // Server exports use world.edits: {"x,y,z": id}.
  if (payload.edits && typeof payload.edits === 'object') {
    for (const key of Object.keys(payload.edits)) {
      const [x, y, z] = key.split(',').map(Number);
      addEdit(x, y, z, Number(payload.edits[key]));
    }
  }
  // Client exports use overrides: {"cx,cz": [localIndex, blockId, ...]}.
  const packed = payload.overrides || payload.ov;
  if (packed && typeof packed === 'object') {
    for (const chunkKey of Object.keys(packed)) {
      const [cx, cz] = chunkKey.split(',').map(Number);
      const values = packed[chunkKey];
      if (!Number.isInteger(cx) || !Number.isInteger(cz) || !Array.isArray(values)) continue;
      for (let i = 0; i + 1 < values.length; i += 2) {
        const index = Number(values[i]), id = Number(values[i + 1]);
        if (!Number.isInteger(index) || index < 0 || index >= 16 * 16 * WORLD_HEIGHT) continue;
        const lx = index & 15;
        const lz = (index >> 4) & 15;
        const y = index >> 8;
        addEdit(cx * 16 + lx, y, cz * 16 + lz, id);
      }
    }
  }

  world.seed = Number(payload.seed) | 0;
  if (payload.name) world.name = safeName(payload.name);
  if (payload.mode === 'survival' || payload.mode === 'creative') world.mode = payload.mode;
  if (Number.isFinite(Number(payload.dayTime))) world.dayTime = ((Number(payload.dayTime) % 1) + 1) % 1;
  const spawn = payload.spawn || payload.player;
  if (spawn && Number.isFinite(Number(spawn.x)) && Number.isFinite(Number(spawn.z))) {
    world.spawn = { x: Number(spawn.x), z: Number(spawn.z) };
  }
  world.edits = nextEdits;
  world.revision = Object.keys(nextEdits).length;
  world.doors = {};
  for(const [key,value] of Object.entries(payload.doors||{})) if(value===true && /^-?\d+,-?\d+,-?\d+$/.test(key)) world.doors[key]=true;
  world.lights = {};
  for(const [key,value] of Object.entries(payload.lights||{})) if(value===false && /^-?\d+,-?\d+,-?\d+$/.test(key)) world.lights[key]=false;
  world.claims = normalizeClaims(payload.claims);
  // Preserve server-side economic state when an administrator imports a
  // downloaded world file. Older client-only files simply omit these arrays.
  world.npcProperties = Array.isArray(payload.npcProperties) ? payload.npcProperties : [];
  world.marketListings = Array.isArray(payload.marketListings) ? payload.marketListings : [];
  world.marketHistory = Array.isArray(payload.marketHistory) ? payload.marketHistory.slice(0,200) : [];
  world.constructionJobs = normalizeConstructionJobs(payload.constructionJobs);
  world.rentalOffers = normalizeRentalOffers(payload.rentalOffers);
  world.rentalContracts = normalizeRentalContracts(payload.rentalContracts);
  world.companies = normalizeCompanies(payload.companies);
  world.landAuctions = normalizeLandAuctions(payload.landAuctions);
  ensureDefaultLandAuctions();
  entities.clear();
}

function safeName(value) {
  const valueString = String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim();
  return (valueString || 'Player').slice(0, 24);
}

function claimOverlaps(a,b) {
  return a.x < b.x + CLAIM_SIZE && a.x + CLAIM_SIZE > b.x && a.z < b.z + CLAIM_SIZE && a.z + CLAIM_SIZE > b.z;
}

function normalizeClaims(value) {
  const raw=Array.isArray(value)?value:(value&&typeof value==='object'?Object.values(value):[]), claims=[];
  for(const item of raw){
    if(!item||typeof item!=='object') continue;
    const x=Number(item.x),z=Number(item.z),ownerId=String(item.ownerId||'').slice(0,80);
    if(!Number.isInteger(x)||!Number.isInteger(z)||x%CLAIM_SIZE!==0||z%CLAIM_SIZE!==0||!ownerId) continue;
    const members=[]; const seenMembers=new Set([ownerId]);
    if(Array.isArray(item.members)) for(const member of item.members){
      const memberId=String(member?.playerId||'').slice(0,80);
      if(!memberId||seenMembers.has(memberId)||(!member?.build&&!member?.use)) continue;
      members.push({playerId:memberId,name:safeName(member.name||'Player'),build:!!member.build,use:!!member.use}); seenMembers.add(memberId);
      if(members.length>=64) break;
    }
    const coOwners=[]; const seenCoOwners=new Set([ownerId]);
    if(Array.isArray(item.coOwners)) for(const coOwner of item.coOwners){
      const coOwnerId=String(coOwner?.playerId||'').slice(0,80),share=Math.max(1,Math.min(99,Math.trunc(Number(coOwner?.share)||0)));
      if(!coOwnerId||seenCoOwners.has(coOwnerId)||!share) continue;
      if(coOwners.reduce((sum,current)=>sum+current.share,0)+share>99) continue;
      coOwners.push({playerId:coOwnerId,name:safeName(coOwner.name||'Player'),share,joinedAt:coOwner.joinedAt||null}); seenCoOwners.add(coOwnerId);
      if(coOwners.length>=16) break;
    }
    const claim={id:/^cl_[a-f0-9]{12,32}$/.test(String(item.id||''))?String(item.id):`cl_${crypto.randomBytes(8).toString('hex')}`,ownerId,ownerName:safeName(item.ownerName||'Player'),kind:item.kind==='npc'?'npc':'player',npcPropertyId:item.npcPropertyId?String(item.npcPropertyId).slice(0,80):null,marketListingId:item.marketListingId?String(item.marketListingId).slice(0,80):null,marketLocked:item.marketLocked===true,businessLicense:item.businessLicense&&typeof item.businessLicense==='object'?{...item.businessLicense,recentVisitors:item.businessLicense.recentVisitors&&typeof item.businessLicense.recentVisitors==='object'?{...item.businessLicense.recentVisitors}:{} }:null,x,z,size:CLAIM_SIZE,members,coOwners,createdAt:item.createdAt||new Date().toISOString(),updatedAt:item.updatedAt||item.createdAt||new Date().toISOString()};
    if(claims.some(other=>claimOverlaps(claim,other))) continue;
    claims.push(claim);
  }
  return claims;
}

function normalizeConstructionJobs(value) {
  const raw=Array.isArray(value)?value:(value&&typeof value==='object'?Object.values(value):[]),allowed=new Set(['queued','active','completed','cancelled','failed']);
  return raw.filter(item=>item&&typeof item==='object'&&/^job_[a-f0-9]{12,32}$/.test(String(item.id||''))&&typeof item.claimId==='string'&&typeof item.ownerId==='string').slice(-500).map(item=>{
    const plan=NPC_CONSTRUCTION_PLANS.find(candidate=>candidate.id===String(item.planId||item.plan?.id||''));
    const edits=Array.isArray(item.edits)?item.edits.filter(edit=>edit&&Number.isInteger(Number(edit.x))&&Number.isInteger(Number(edit.y))&&Number.isInteger(Number(edit.z))&&Number.isInteger(Number(edit.id))).slice(0,4096).map(edit=>({x:Number(edit.x),y:Number(edit.y),z:Number(edit.z),id:Number(edit.id),role:edit.role==='decorator'?'decorator':'builder',applied:edit.applied===true})):[];
    const appliedEdits=Array.isArray(item.appliedEdits)?item.appliedEdits.filter(key=>typeof key==='string').slice(0,4096):edits.filter(edit=>edit.applied).map(edit=>`${edit.x},${edit.y},${edit.z}`);
    return {id:String(item.id),claimId:String(item.claimId).slice(0,80),ownerId:String(item.ownerId).slice(0,80),ownerName:safeName(item.ownerName||'Player'),workshopBusinessId:String(item.workshopBusinessId||'').slice(0,80),planId:plan?.id||null,planName:plan?.name||safeName(item.planName||'NPC Construction'),placement:item.placement&&typeof item.placement==='object'?{x:Number(item.placement.x),y:Number(item.placement.y),z:Number(item.placement.z),rotation:Number(item.placement.rotation)||0,footprint:plan?{...plan.footprint}:item.placement.footprint}:null,edits,appliedEdits,status:allowed.has(item.status)?item.status:'failed',stage:String(item.stage||'builder').slice(0,24),nextEditIndex:Math.max(0,Number(item.nextEditIndex)||0),contract:item.contract&&typeof item.contract==='object'?{currency:'Coin',amount:Math.max(0,Math.trunc(Number(item.contract.amount)||0)),paidTransactionId:String(item.contract.paidTransactionId||'').slice(0,80),refunded:item.contract.refunded===true}:null,inspection:item.inspection&&typeof item.inspection==='object'?item.inspection:null,createdAt:item.createdAt||null,startedAt:item.startedAt||null,completedAt:item.completedAt||null,cancelledAt:item.cancelledAt||null,cancellationReason:item.cancellationReason?String(item.cancellationReason).slice(0,120):null,updatedAt:item.updatedAt||null};
  });
}

function normalizeRentalOffers(value){
  const raw=Array.isArray(value)?value:[],allowed=new Set(['open','cancelled','leased','closed']);
  return raw.filter(item=>item&&typeof item==='object'&&/^rentoffer_[a-f0-9]{12,32}$/.test(String(item.id||''))).slice(-500).map(item=>({id:String(item.id),claimId:String(item.claimId||'').slice(0,80),ownerId:String(item.ownerId||'').slice(0,80),ownerName:safeName(item.ownerName||'Player'),pricePerCycle:Math.max(1,Math.trunc(Number(item.pricePerCycle)||0)),deposit:Math.max(0,Math.trunc(Number(item.deposit)||0)),durationCycles:Math.max(1,Math.min(RENT_MAX_DURATION_CYCLES,Math.trunc(Number(item.durationCycles)||1))),status:allowed.has(item.status)?item.status:'closed',createdAt:item.createdAt||null,updatedAt:item.updatedAt||null}));
}
function normalizeRentalContracts(value){
  const raw=Array.isArray(value)?value:[],allowed=new Set(['active','past_due','cancelled','completed','terminated']);
  return raw.filter(item=>item&&typeof item==='object'&&/^rent_[a-f0-9]{12,32}$/.test(String(item.id||''))).slice(-500).map(item=>({id:String(item.id),offerId:String(item.offerId||'').slice(0,80),claimId:String(item.claimId||'').slice(0,80),ownerId:String(item.ownerId||'').slice(0,80),tenantId:String(item.tenantId||'').slice(0,80),ownerName:safeName(item.ownerName||'Player'),tenantName:safeName(item.tenantName||'Tenant'),pricePerCycle:Math.max(1,Math.trunc(Number(item.pricePerCycle)||0)),deposit:Math.max(0,Math.trunc(Number(item.deposit)||0)),durationCycles:Math.max(1,Math.min(RENT_MAX_DURATION_CYCLES,Math.trunc(Number(item.durationCycles)||1))),paidCycles:Math.max(1,Math.trunc(Number(item.paidCycles)||1)),status:allowed.has(item.status)?item.status:'past_due',startedAt:item.startedAt||null,nextDueAt:Number(item.nextDueAt)||0,endsAt:Number(item.endsAt)||0,depositReturned:item.depositReturned===true,depositHeld:item.depositHeld===true&&!item.depositReturned,lastError:item.lastError?String(item.lastError).slice(0,120):null,updatedAt:item.updatedAt||null}));
}
function normalizeCompanies(value){
  const raw=Array.isArray(value)?value:[]; return raw.filter(item=>item&&typeof item==='object'&&/^co_[a-f0-9]{12,32}$/.test(String(item.id||''))&&typeof item.ownerId==='string').slice(-200).map(item=>({id:String(item.id),name:safeName(item.name||'Company'),ownerId:String(item.ownerId).slice(0,80),ownerName:safeName(item.ownerName||'Player'),members:Array.isArray(item.members)?item.members.filter(member=>member&&typeof member.playerId==='string').slice(0,COMPANY_MAX_MEMBERS).map(member=>({playerId:String(member.playerId).slice(0,80),name:safeName(member.name||'Player'),role:member.playerId===String(item.ownerId)?'owner':member.role==='manager'?'manager':'member',joinedAt:member.joinedAt||null})):[],invites:Array.isArray(item.invites)?item.invites.map(id=>String(id).slice(0,80)).slice(0,COMPANY_MAX_MEMBERS):[],treasury:Math.max(0,Math.trunc(Number(item.treasury)||0)),businessIds:Array.isArray(item.businessIds)?item.businessIds.map(id=>String(id).slice(0,80)).slice(0,64):[],createdAt:item.createdAt||null,updatedAt:item.updatedAt||null}));
}
function normalizeLandAuctions(value){
  const raw=Array.isArray(value)?value:[],allowed=new Set(['open','ended','settled','cancelled']); return raw.filter(item=>item&&typeof item==='object'&&/^auction_[a-f0-9]{12,32}$/.test(String(item.id||''))).slice(-100).map(item=>({id:String(item.id),x:Number(item.x),z:Number(item.z),size:CLAIM_SIZE,tier:String(item.tier||'Premium'),reservePrice:Math.max(1,Math.trunc(Number(item.reservePrice)||0)),currentBid:Math.max(0,Math.trunc(Number(item.currentBid)||0)),bidderId:item.bidderId?String(item.bidderId).slice(0,80):null,bidderName:item.bidderName?safeName(item.bidderName):null,heldAmount:Math.max(0,Math.trunc(Number(item.heldAmount)||0)),status:allowed.has(item.status)?item.status:'open',startsAt:Number(item.startsAt)||Date.now(),endsAt:Number(item.endsAt)||Date.now()+DEFAULT_LAND_AUCTION_HOURS*3600000,winnerId:item.winnerId?String(item.winnerId).slice(0,80):null,winnerName:item.winnerName?safeName(item.winnerName):null,claimId:item.claimId?String(item.claimId).slice(0,80):null,createdAt:item.createdAt||null,updatedAt:item.updatedAt||null})).filter(item=>Number.isInteger(item.x)&&Number.isInteger(item.z));
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function integer(value, fallback = 0) {
  return Number.isInteger(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = (a.y || 0) - (b.y || 0);
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload, exceptId = null) {
  for (const [id, client] of clients) {
    if (id !== exceptId) send(client.ws, payload);
  }
}

function playerSummary(client) {
  return {
    id: client.playerId || client.id,
    name: client.name,
    x: client.x,
    y: client.y,
    z: client.z,
    yaw: client.yaw,
    pitch: client.pitch,
    mode: client.mode,
    fly: client.fly,
    sprint: client.sprint,
    inWater: client.inWater,
    onGround: client.onGround,
    jump: client.jump,
    selectedBlock: client.selectedBlock,
    health:client.health,
    maxHealth:100,
    connectedAt: client.connectedAt
  };
}

function allPlayers() {
  return Array.from(clients.values(), playerSummary);
}

function spawnCandidates() {
  const points=[{x:Math.floor(world.spawn.x)+.5,z:Math.floor(world.spawn.z)+.5}];
  const step=SPAWN_MIN_DISTANCE;
  for(let ring=1;ring<=12;ring++){
    for(let i=-ring;i<=ring;i++){
      points.push({x:Math.floor(world.spawn.x)+i*step+.5,z:Math.floor(world.spawn.z)-ring*step+.5});
      points.push({x:Math.floor(world.spawn.x)+i*step+.5,z:Math.floor(world.spawn.z)+ring*step+.5});
      if(i!==-ring&&i!==ring){
        points.push({x:Math.floor(world.spawn.x)-ring*step+.5,z:Math.floor(world.spawn.z)+i*step+.5});
        points.push({x:Math.floor(world.spawn.x)+ring*step+.5,z:Math.floor(world.spawn.z)+i*step+.5});
      }
    }
  }
  return points;
}

function spawnSlotAvailable(candidate,ignoreIdentityKey=null) {
  if(spawnPointBlockedByClaim(candidate)) return false;
  const terrain=serverMapColumn(Math.floor(candidate.x),Math.floor(candidate.z));
  if(!terrain||terrain.h<=31||terrain.biome==='mountains') return false;
  const top=serverWalkHeight(candidate.x,candidate.z);
  if(top===null||top<0) return false;
  const minDistanceSquared=SPAWN_MIN_DISTANCE*SPAWN_MIN_DISTANCE;
  for(const [identity,reservation] of spawnReservations){
    if(identity===ignoreIdentityKey||reservation.worldId!==world.id||Number(reservation.expiresAt)<=Date.now()) continue;
    const dx=candidate.x-reservation.x,dz=candidate.z-reservation.z;
    if(dx*dx+dz*dz<minDistanceSquared) return false;
  }
  return true;
}

function allocateSpawnSlot(identityKey,playerId='') {
  pruneSpawnReservations();
  const now=Date.now(),iso=new Date(now).toISOString(),existing=spawnReservations.get(identityKey);
  const reserve=(candidate)=>{
    if(!spawnSlotAvailable(candidate,identityKey)) return null;
    const top=serverWalkHeight(candidate.x,candidate.z);
    const reservation={worldId:world.id,x:candidate.x,y:top+1.02,z:candidate.z,playerId:playerId||'',reservedAt:iso,expiresAt:now+SPAWN_RESERVATION_TTL_MS};
    spawnReservations.set(identityKey,reservation); saveSpawnReservations();
    return {x:reservation.x,y:reservation.y,z:reservation.z};
  };
  if(existing&&existing.worldId===world.id){
    const refreshed=reserve(existing);
    if(refreshed) return refreshed;
  }
  for(const candidate of spawnCandidates()){
    const reserved=reserve(candidate);
    if(reserved) return reserved;
  }
  // Keep expanding the same Common Spawn Area as a square grid. Never fall
  // back onto an occupied slot: the 20-block center-to-center guarantee is
  // more important than forcing a join when the generated terrain is blocked.
  for(let ring=13;ring<=256;ring++){
    const originX=Math.floor(world.spawn.x),originZ=Math.floor(world.spawn.z),step=SPAWN_MIN_DISTANCE;
    for(let i=-ring;i<=ring;i++){
      const candidates=[
        {x:originX+i*step+.5,z:originZ-ring*step+.5},
        {x:originX+i*step+.5,z:originZ+ring*step+.5}
      ];
      if(i!==-ring&&i!==ring){
        candidates.push({x:originX-ring*step+.5,z:originZ+i*step+.5},{x:originX+ring*step+.5,z:originZ+i*step+.5});
      }
      for(const candidate of candidates){
        const reserved=reserve(candidate);
        if(reserved) return reserved;
      }
    }
  }
  throw new Error('No safe slot remains in the shared Common Spawn Area');
}
function spawnAreaSummary() {
  return {x:Number(world.spawn.x)||.5,z:Number(world.spawn.z)||.5,minDistance:SPAWN_MIN_DISTANCE,shared:true};
}
function isNight(){ return world.dayTime<0.23 || world.dayTime>0.77; }
function nearestPlayer(entity){
  let best=null,bestD=Infinity;
  for(const client of clients.values()){
    if(!client.joined) continue;
    const d=(client.x-entity.x)**2+(client.z-entity.z)**2;
    if(d<bestD){bestD=d;best=client;}
  }
  return best;
}
function entitySummary(entity){
  return {id:entity.id,type:entity.type,x:entity.x,y:entity.y,z:entity.z,yaw:entity.yaw,phase:entity.phase,hostile:!!entity.hostile};
}

// Server-side satellite raster generation. The client receives only a compact
// RGB raster, so map terrain sampling and relief shading do not cost the
// browser's main thread while a multiplayer world is open.
function mapMulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
class ServerMapNoise {
  constructor(seed){
    const perm=new Uint8Array(256); for(let i=0;i<256;i++) perm[i]=i;
    const rnd=mapMulberry32(seed>>>0);
    for(let i=255;i>0;i--){ const j=(rnd()*(i+1))|0,t=perm[i]; perm[i]=perm[j]; perm[j]=t; }
    this.p=new Uint8Array(512); for(let i=0;i<512;i++) this.p[i]=perm[i&255];
  }
  fade(t){ return t*t*t*(t*(t*6-15)+10); }
  g2(h,x,y){ const u=(h&1)?-x:x,v=(h&2)?-y:y; return u+v; }
  g3(h,x,y,z){
    switch(h&15){
      case 0:return x+y; case 1:return -x+y; case 2:return x-y; case 3:return -x-y;
      case 4:return x+z; case 5:return -x+z; case 6:return x-z; case 7:return -x-z;
      case 8:return y+z; case 9:return -y+z; case 10:return y-z; case 11:return -y-z;
      case 12:return x+y; case 13:return -y+z; case 14:return -x+y; default:return -y-z;
    }
  }
  n3(x,y,z){
    const fx=Math.floor(x),fy=Math.floor(y),fz=Math.floor(z),X=fx&255,Y=fy&255,Z=fz&255;
    const xf=x-fx,yf=y-fy,zf=z-fz,p=this.p,u=this.fade(xf),v=this.fade(yf),w=this.fade(zf);
    const A=p[X]+Y,AA=p[A]+Z,AB=p[A+1]+Z,B=p[X+1]+Y,BA=p[B]+Z,BB=p[B+1]+Z;
    const x00=(a,b,c,d)=>this.g3(a,xf,b,c)*(1-u)+this.g3(d,xf-1,b,c)*u;
    const y0=x00(p[AA],yf,zf,p[BA])*(1-v)+x00(p[AB],yf-1,zf,p[BB])*v;
    const y1=x00(p[AA+1],yf,zf-1,p[BA+1])*(1-v)+x00(p[AB+1],yf-1,zf-1,p[BB+1])*v;
    return (y0*(1-w)+y1*w);
  }
  n2(x,y){
    const fx=Math.floor(x),fy=Math.floor(y),X=fx&255,Y=fy&255,xf=x-fx,yf=y-fy,p=this.p;
    const u=this.fade(xf),v=this.fade(yf),aa=p[p[X]+Y],ab=p[p[X]+Y+1],ba=p[p[X+1]+Y],bb=p[p[X+1]+Y+1];
    const x1=((this.g2(aa,xf,yf)*(1-u))+(this.g2(ba,xf-1,yf)*u));
    const x2=((this.g2(ab,xf,yf-1)*(1-u))+(this.g2(bb,xf-1,yf-1)*u));
    return (x1*(1-v)+x2*v)*.75;
  }
  fbm2(x,y,oct){ let sum=0,amp=1,freq=1,norm=0; for(let i=0;i<oct;i++){sum+=this.n2(x*freq,y*freq)*amp;norm+=amp;amp*=.5;freq*=2;} return sum/norm; }
}
let mapNoiseSeed=null,mapNoiseA,mapNoiseB,mapNoiseC;
function serverMapNoise(){
  if(mapNoiseSeed!==world.seed){ mapNoiseSeed=world.seed; mapNoiseA=new ServerMapNoise(world.seed); mapNoiseB=new ServerMapNoise(world.seed+7919); mapNoiseC=new ServerMapNoise(world.seed+104729); }
  return {a:mapNoiseA,b:mapNoiseB,c:mapNoiseC};
}
function serverSmoothstep(e0,e1,x){ const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0))); return t*t*(3-2*t); }
function serverMapColumn(x,z){
  const n=serverMapNoise();
  const cont=n.a.fbm2(x*.0015,z*.0015,4);
  const hills=n.a.fbm2(x*.011+13.3,z*.011-7.7,3);
  const mRaw=n.b.fbm2(x*.0008+310.5,z*.0008-95.2,2);
  const mMask=serverSmoothstep(.06,.56,mRaw);
  const r=n.b.fbm2(x*.0055-42.1,z*.0055+88.4,3),ridge=1-Math.abs(r);
  const riverNoise=Math.abs(n.b.fbm2(x*.0024+140.2,z*.0024-260.8,3));
  const river=1-serverSmoothstep(.025,.105,riverNoise);
  let h=SEA_LEVEL+3+cont*10+hills*4.5+mMask*(ridge*ridge*46);
  if(h<SEA_LEVEL+24) h-=river*9;
  h=Math.max(4,Math.min(WORLD_HEIGHT-4,Math.floor(h)));
  const temp=n.c.fbm2(x*.0006+900.5,z*.0006+300.1,2)-(h-SEA_LEVEL)*.010;
  const humid=n.c.fbm2(x*.0007-400.2,z*.0007+700.9,2);
  let biome;
  if(h<=SEA_LEVEL+1&&river>.35) biome='river';
  else if(h>SEA_LEVEL+36) biome='mountains';
  else if(temp>.22&&humid<.06) biome='desert';
  else if(temp<-.30) biome='snowy';
  else if(humid>.17) biome='forest';
  else biome='plains';
  return {h,biome};
}
function serverH2(x,z,salt){
  let h=Math.imul(x,0x27d4eb2d)^Math.imul(z,0x165667b1)^Math.imul(salt,0x9e3779b1); h^=h>>>15; h=Math.imul(h,0x85ebca6b); h^=h>>>13; h=Math.imul(h,0xc2b2ae35); h^=h>>>16; return (h>>>0)/4294967296;
}
function serverH3(x,y,z,salt){
  let h=Math.imul(x,0x27d4eb2d)^Math.imul(y,0x165667b1)^Math.imul(z,0x9e3779b1)^Math.imul(salt|0,0x85ebca6b);
  h^=h>>>15; h=Math.imul(h,0x2c1b3c6d); h^=h>>>12; h=Math.imul(h,0x297a2d39); h^=h>>>15;
  return (h>>>0)/4294967296;
}
function serverCaveAt(wx,y,wz){
  if(y<3) return false;
  const n=serverMapNoise();
  const a=n.c.n3(wx*.019,y*.036,wz*.019);
  const b=n.c.n3(wx*.019+51.7,y*.036+11.3,wz*.019-30.4);
  if(a*a+b*b<.0022) return true;
  if(y<26&&n.b.n3(wx*.030,y*.045,wz*.030)>.55) return true;
  return false;
}
function serverCabinSpec(cx,cz,cache){
  const key=cx+','+cz; if(cache.has(key)) return cache.get(key);
  let spec=null;
  const showcaseCabin=(cx===0&&cz===0);
  if(serverH2(cx,cz,901)<.035 || showcaseCabin){
    const anchor=serverMapColumn(cx*16+7,cz*16+6); let minH=WORLD_HEIGHT,maxH=0;
    for(let lz=3;lz<12;lz++) for(let lx=3;lx<13;lx++){ const h=serverMapColumn(cx*16+lx,cz*16+lz).h; minH=Math.min(minH,h); maxH=Math.max(maxH,h); }
    if(showcaseCabin || ((anchor.biome==='plains'||anchor.biome==='forest')&&anchor.h>31&&anchor.h<WORLD_HEIGHT-9&&maxH-minH<=3)) spec={baseY:anchor.h+1};
  }
  cache.set(key,spec); return spec;
}
function serverCabinRoof(x,z,terrain,cache){
  const cx=Math.floor(x/16),cz=Math.floor(z/16),lx=x-cx*16,lz=z-cz*16,spec=serverCabinSpec(cx,cz,cache);
  if(!spec||lx<3||lx>12||lz<3||lz>11) return null;
  let top=spec.baseY+4; if(lz===7&&lx>3&&lx<12) top=spec.baseY+5;
  return top>=terrain.h?{h:top,id:12,biome:terrain.biome,edited:true}:null;
}
// Generated base voxels are resolved lazily from the same seed/hash/noise rules
// used by client/index.html. Edits stay separate so a cache never hides an
// authoritative player edit.
const serverBaseChunkCache = new Map();
let serverBaseChunkCacheSeed = null;
function serverBaseChunkKey(cx,cz){ return `${cx},${cz}`; }
function serverGenerateBaseChunk(cx,cz){
  const data=new Uint8Array(16*16*WORLD_HEIGHT);
  const set=(lx,y,lz,id)=>{ if(y>=0&&y<WORLD_HEIGHT) data[(y<<8)|(lz<<4)|lx]=id; };
  const cols=[];
  for(let lz=0;lz<16;lz++) for(let lx=0;lx<16;lx++){
    const wx=cx*16+lx,wz=cz*16+lz,{h,biome}=serverMapColumn(wx,wz);
    cols.push({h,biome});
    let surf=1,sub=2,subDepth=3;
    if(biome==='desert'){surf=5;sub=5;subDepth=4;}
    else if(biome==='river'){surf=6;sub=5;subDepth=3;}
    else if(biome==='snowy'){surf=17;}
    else if(biome==='mountains'){surf=h>SEA_LEVEL+48?17:3;sub=3;}
    if(h<=SEA_LEVEL+1){surf=(biome==='desert'||biome==='river')?5:(serverH3(wx,0,wz,7)<.35?6:5);sub=5;}
    const top=Math.max(h,SEA_LEVEL);
    for(let y=0;y<=top;y++){
      let id;
      if(y===0||(y<3&&serverH3(wx,y,wz,1)<.6-y*.25)) id=22;
      else if(y<h-subDepth) id=3;
      else if(y<h) id=sub;
      else if(y===h) id=surf;
      else id=y<=SEA_LEVEL?20:0;
      if(id===3){
        const o=serverH3(wx>>1,y>>1,wz>>1,2);
        if(y<14&&o>.9970) id=26;
        else if(y<26&&o>.9952) id=25;
        else if(y<50&&o>.9905) id=24;
        else if(o>.9835) id=23;
        else if(y<22&&o<.004) id=21;
      }
      if(id!==0&&id!==20&&y<=h&&serverCaveAt(wx,y,wz)) id=(y<10&&serverH3(wx,y,wz,3)<.02)?28:0;
      set(lx,y,lz,id);
    }
  }
  const M=4;
  for(let tz=-M;tz<16+M;tz++) for(let tx=-M;tx<16+M;tx++){
    const wx=cx*16+tx,wz=cz*16+tz;
    const col=(tx>=0&&tx<16&&tz>=0&&tz<16)?cols[tz*16+tx]:serverMapColumn(wx,wz),h=col.h,biome=col.biome,r=serverH3(wx,0,wz,11);
    if(biome==='river'){
      if(r<.018&&h>=SEA_LEVEL-1&&h<=SEA_LEVEL+1){
        const ch=1+((serverH3(wx,1,wz,812)*2)|0);
        for(let i=1;i<=ch;i++) if(tx>=0&&tx<16&&tz>=0&&tz<16) set(tx,h+i,tz,29);
      }
      continue;
    }
    if(h<=SEA_LEVEL+1) continue;
    if(biome==='desert'){
      if(r<.006){
        const ch=2+((serverH3(wx,1,wz,12)*2)|0);
        for(let i=1;i<=ch;i++) if(tx>=0&&tx<16&&tz>=0&&tz<16) set(tx,h+i,tz,29);
      }
      continue;
    }
    const spruce=biome==='snowy',dens=biome==='forest'?.055:biome==='snowy'?.030:biome==='plains'?.010:.004;
    if(r>=dens||serverCaveAt(wx,h,wz)) continue;
    const logId=spruce?9:7,leafId=spruce?10:8,th=(spruce?6:4)+((serverH3(wx,1,wz,13)*3)|0);
    const put=(x,y,z,id,soft)=>{ if(x<0||x>=16||z<0||z>=16||y<0||y>=WORLD_HEIGHT)return; const i=(y<<8)|(z<<4)|x; if(soft&&data[i]!==0)return; data[i]=id; };
    for(let i=1;i<=th;i++) put(tx,h+i,tz,logId,false);
    if(spruce){
      for(let ly=2;ly<=th+1;ly++){
        const t=(ly-2)/(th-1),rad=Math.max(0,Math.round(2.6-t*2.4));
        for(let dx=-rad;dx<=rad;dx++) for(let dz=-rad;dz<=rad;dz++){
          if(Math.abs(dx)+Math.abs(dz)>rad+1)continue;
          if(dx===0&&dz===0&&ly<=th)continue;
          put(tx+dx,h+ly,tz+dz,leafId,true);
        }
      }
      put(tx,h+th+2,tz,leafId,true);
    } else {
      for(let ly=th-2;ly<=th+1;ly++){
        const rad=ly>=th?1:2;
        for(let dx=-rad;dx<=rad;dx++) for(let dz=-rad;dz<=rad;dz++){
          if(Math.abs(dx)===rad&&Math.abs(dz)===rad&&serverH3(wx+dx,ly,wz+dz,14)>.4)continue;
          if(dx===0&&dz===0&&ly<=th)continue;
          put(tx+dx,h+ly,tz+dz,leafId,true);
        }
      }
    }
  }
  const cabinCache=new Map(),cabinChance=serverH2(cx,cz,901),showcaseCabin=cx===0&&cz===0;
  if(cabinChance<.035||showcaseCabin){
    const x0=3,z0=3,w=10,d=9,anchor=serverMapColumn(cx*16+7,cz*16+6);let minH=WORLD_HEIGHT,maxH=0;
    for(let lz=z0;lz<z0+d;lz++) for(let lx=x0;lx<x0+w;lx++){const q=serverMapColumn(cx*16+lx,cz*16+lz);minH=Math.min(minH,q.h);maxH=Math.max(maxH,q.h);}
    if(showcaseCabin||((anchor.biome==='plains'||anchor.biome==='forest')&&anchor.h>SEA_LEVEL+1&&anchor.h<WORLD_HEIGHT-9&&maxH-minH<=3)){
      const baseY=anchor.h+1,putCabin=(x,y,z,id)=>{if(x>=0&&x<16&&z>=0&&z<16&&y>0&&y<WORLD_HEIGHT)data[(y<<8)|(z<<4)|x]=id;};
      for(let z=z0;z<z0+d;z++)for(let x=x0;x<x0+w;x++)putCabin(x,baseY,z,11);
      for(let y=1;y<=3;y++)for(let z=z0;z<z0+d;z++)for(let x=x0;x<x0+w;x++){
        const edge=x===x0||x===x0+w-1||z===z0||z===z0+d-1;if(!edge)continue;let id=11;
        if(z===z0&&x===x0+4&&y<=2)id=44;else if(y===2&&((x===x0||x===x0+w-1)&&z>z0+1&&z<z0+d-2))id=19;else if(y===2&&z===z0+d-1&&x>x0+1&&x<x0+w-2)id=19;
        putCabin(x,baseY+y,z,id);
      }
      for(let z=z0-1;z<=z0+d;z++)for(let x=x0-1;x<=x0+w;x++){if(x<0||x>=16||z<0||z>=16)continue;if(x===x0-1||x===x0+w||z===z0-1||z===z0+d)putCabin(x,baseY,z,42);}
      for(let z=z0-1;z<=z0+d;z++)for(let x=x0;x<x0+w;x++)if((x===x0||x===x0+w-1)&&z!==z0+1&&z!==z0+2)putCabin(x,baseY+1,z,43);
      for(let z=z0;z<z0+d;z++)for(let x=x0;x<x0+w;x++)putCabin(x,baseY+4,z,12);
      for(let x=x0+1;x<x0+w-1;x++)putCabin(x,baseY+5,z0+4,12);
      putCabin(x0+1,baseY+3,z0,45);putCabin(x0+7,baseY+2,z0,48);putCabin(x0+2,baseY+1,z0+2,50);putCabin(x0+7,baseY+1,z0+2,49);putCabin(x0+5,baseY+1,z0+5,51);putCabin(x0+8,baseY+1,z0+6,47);
    }
  }
  return data;
}
function serverBaseBlockAt(x,y,z){
  if(y<0||y>=WORLD_HEIGHT)return 0;
  if(serverBaseChunkCacheSeed!==world.seed){serverBaseChunkCacheSeed=world.seed;serverBaseChunkCache.clear();}
  const cx=Math.floor(x/16),cz=Math.floor(z/16),key=serverBaseChunkKey(cx,cz);
  let data=serverBaseChunkCache.get(key);
  if(!data){data=serverGenerateBaseChunk(cx,cz);serverBaseChunkCache.set(key,data);if(serverBaseChunkCache.size>256)serverBaseChunkCache.delete(serverBaseChunkCache.keys().next().value);}
  return data[(y<<8)|((z-cz*16)<<4)|(x-cx*16)]||0;
}

const SERVER_MAP_COLORS={
  1:[104,166,64],2:[134,96,67],3:[128,129,132],4:[110,110,112],5:[221,208,160],6:[140,134,128],
  7:[168,132,86],8:[58,112,44],9:[168,132,86],10:[38,84,52],11:[170,134,80],12:[112,84,52],
  13:[152,86,66],14:[126,127,130],15:[86,124,58],16:[216,203,155],17:[247,251,255],18:[158,204,244],
  19:[210,235,245],20:[55,125,215],21:[225,83,22],22:[58,58,62],23:[34,34,36],24:[196,152,116],
  25:[238,196,74],26:[96,226,220],27:[28,22,42],28:[248,222,132],29:[88,142,58],
  42:[145,112,76],43:[122,82,47],44:[154,108,59],45:[250,193,76],46:[158,112,59],47:[125,79,42],48:[175,130,73],49:[109,67,38],50:[158,112,59],51:[170,134,80]
};
function serverMapRGB(column,id){
  if(id===20||column.biome==='river') return [55,125,215];
  if(id===21) return [225,83,22];
  if(id&&SERVER_MAP_COLORS[id]) return SERVER_MAP_COLORS[id];
  if(column.biome==='desert') return [221,208,160];
  if(column.biome==='snowy') return [247,251,255];
  if(column.biome==='mountains') return column.h>78?[247,251,255]:[128,129,132];
  if(column.biome==='forest') return [58,112,44];
  return [104,166,64];
}
function serverMapEditColumns(){
  // Keep air edits as well as placed blocks. A positive-only top cache makes
  // the Server map resurrect a terrain block after a player breaks it.
  const columns=new Map();
  for(const [key,rawId] of Object.entries(world.edits||{})){
    const [x,y,z]=key.split(',').map(Number), id=Number(rawId);
    if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)||y<0||y>=WORLD_HEIGHT||!Number.isInteger(id)||id<0||id>MAX_BLOCK_ID) continue;
    const k=x+','+z, column=columns.get(k)||new Map(); column.set(y,id); columns.set(k,column);
  }
  return columns;
}
function serverMapColumnWithEdits(x,z,terrain,cabin,editColumns){
  const edits=editColumns.get(x+','+z);
  if(!edits) return cabin||terrain;
  const base=cabin||terrain;
  let highestPlaced=null;
  for(const [y,id] of edits){ if(id>0&&(!highestPlaced||y>highestPlaced.y)) highestPlaced={y,id}; }
  if(highestPlaced&&highestPlaced.y>=base.h) return {h:highestPlaced.y,id:highestPlaced.id,biome:terrain.biome,edited:true};
  // If the visible top was removed, expose the next natural layer. For a
  // cabin roof this is intentionally conservative: its underlying terrain is
  // still preferable to showing a stale roof in the authoritative raster.
  if(edits.get(base.h)===0){
    const lower=highestPlaced&&highestPlaced.y<base.h?highestPlaced:null;
    if(lower) return {h:lower.y,id:lower.id,biome:terrain.biome,edited:true};
    return base===cabin?terrain:{h:Math.max(0,terrain.h-1),id:terrain.id,biome:terrain.biome,edited:true};
  }
  return base;
}
const MASTER_MAP_MIN = -512;
const MASTER_MAP_MAX = 512;
const MASTER_MAP_SPAN = MASTER_MAP_MAX - MASTER_MAP_MIN; // 1024
const MASTER_MAP_STEP = 2;
const MASTER_MAP_GRID = Math.floor(MASTER_MAP_SPAN / MASTER_MAP_STEP) + 1; // 513
const MAP_SYNC_INTERVAL_MS = Math.max(10000, Number(process.env.MAP_SYNC_INTERVAL_MS || 10 * 60 * 1000)); // 10 minutes

let masterMapCache = {
  worldId: null,
  seed: null,
  pixels: null,
  columns: null,
  markers: []
};
const dirtyMapLocations = new Set();

function computeMapColumnPixel(c, west, east, north, south) {
  const relief = ((west.h - east.h) + (north.h - south.h)) * .018;
  const light = Math.max(.40, Math.min(1.24, .84 + (c.h - 30) * .009 + relief));
  const rgb = serverMapRGB(c, c.id);
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0] * light))),
    Math.max(0, Math.min(255, Math.round(rgb[1] * light))),
    Math.max(0, Math.min(255, Math.round(rgb[2] * light)))
  ];
}

function bakeMasterMapCache(force = false) {
  if (!force && masterMapCache.pixels && masterMapCache.worldId === world.id && masterMapCache.seed === world.seed) return;
  const t0 = Date.now();
  const grid = MASTER_MAP_GRID, editColumns = serverMapEditColumns(), cabinCache = new Map();
  const columns = new Array(grid * grid);

  for (let gz = 0; gz < grid; gz++) {
    const z = MASTER_MAP_MIN + gz * MASTER_MAP_STEP;
    for (let gx = 0; gx < grid; gx++) {
      const x = MASTER_MAP_MIN + gx * MASTER_MAP_STEP;
      const terrain = serverMapColumn(x, z), cabin = serverCabinRoof(x, z, terrain, cabinCache);
      columns[gz * grid + gx] = serverMapColumnWithEdits(x, z, terrain, cabin, editColumns);
    }
  }

  const pixels = Buffer.alloc(grid * grid * 3);
  for (let gz = 0; gz < grid; gz++) {
    for (let gx = 0; gx < grid; gx++) {
      const c = columns[gz * grid + gx];
      const west = columns[gz * grid + Math.max(0, gx - 1)];
      const east = columns[gz * grid + Math.min(grid - 1, gx + 1)];
      const north = columns[Math.max(0, gz - 1) * grid + gx];
      const south = columns[Math.min(grid - 1, gz + 1) * grid + gx];
      const rgb = computeMapColumnPixel(c, west, east, north, south);
      const p = (gz * grid + gx) * 3;
      pixels[p] = rgb[0];
      pixels[p + 1] = rgb[1];
      pixels[p + 2] = rgb[2];
    }
  }

  const markers = [];
  for (const [key, spec] of cabinCache) {
    if (!spec) continue;
    const [cx, cz] = key.split(',').map(Number);
    markers.push({ type: 'cabin', x: cx * 16 + 7.5, z: cz * 16 + 7.5 });
  }

  masterMapCache = {
    worldId: world.id,
    seed: world.seed,
    pixels,
    columns,
    markers
  };
  dirtyMapLocations.clear();
  log(`Baked master world map cache (1024×1024 span, ${grid}×${grid}) in ${Date.now() - t0}ms`);
}

function refreshMasterMapDeltas() {
  if (!masterMapCache.pixels || !masterMapCache.columns || dirtyMapLocations.size === 0) return;
  const grid = MASTER_MAP_GRID, editColumns = serverMapEditColumns(), cabinCache = new Map();
  const updatedIndices = new Set();

  for (const loc of dirtyMapLocations) {
    const [x, z] = loc.split(',').map(Number);
    if (x < MASTER_MAP_MIN || x > MASTER_MAP_MAX || z < MASTER_MAP_MIN || z > MASTER_MAP_MAX) continue;
    const gx = Math.round((x - MASTER_MAP_MIN) / MASTER_MAP_STEP);
    const gz = Math.round((z - MASTER_MAP_MIN) / MASTER_MAP_STEP);
    if (gx >= 0 && gx < grid && gz >= 0 && gz < grid) {
      const terrain = serverMapColumn(MASTER_MAP_MIN + gx * MASTER_MAP_STEP, MASTER_MAP_MIN + gz * MASTER_MAP_STEP);
      const cabin = serverCabinRoof(MASTER_MAP_MIN + gx * MASTER_MAP_STEP, MASTER_MAP_MIN + gz * MASTER_MAP_STEP, terrain, cabinCache);
      masterMapCache.columns[gz * grid + gx] = serverMapColumnWithEdits(MASTER_MAP_MIN + gx * MASTER_MAP_STEP, MASTER_MAP_MIN + gz * MASTER_MAP_STEP, terrain, cabin, editColumns);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx, nz = gz + dz;
          if (nx >= 0 && nx < grid && nz >= 0 && nz < grid) updatedIndices.add(nz * grid + nx);
        }
      }
    }
  }

  for (const idx of updatedIndices) {
    const gx = idx % grid, gz = Math.floor(idx / grid);
    const c = masterMapCache.columns[idx];
    const west = masterMapCache.columns[gz * grid + Math.max(0, gx - 1)];
    const east = masterMapCache.columns[gz * grid + Math.min(grid - 1, gx + 1)];
    const north = masterMapCache.columns[Math.max(0, gz - 1) * grid + gx];
    const south = masterMapCache.columns[Math.min(grid - 1, gz + 1) * grid + gx];
    const rgb = computeMapColumnPixel(c, west, east, north, south);
    const p = idx * 3;
    masterMapCache.pixels[p] = rgb[0];
    masterMapCache.pixels[p + 1] = rgb[1];
    masterMapCache.pixels[p + 2] = rgb[2];
  }

  const count = dirtyMapLocations.size;
  dirtyMapLocations.clear();
  log(`10-minute map delta sync: updated ${count} dirty locations (${updatedIndices.size} pixels refreshed)`);
}

function serverMapRaster(url){
  const centerX=integer(url.searchParams.get('x'),0), centerZ=integer(url.searchParams.get('z'),0);
  const visibleRadius=clamp(integer(url.searchParams.get('radius'),96),48,420);
  const requestedStep=Number(url.searchParams.get('step'));
  const step=requestedStep===4?4:(requestedStep===2?2:1);
  const radius=Math.max(visibleRadius+24,96), baseX=centerX-radius, baseZ=centerZ-radius;
  const grid=Math.ceil((radius*2+1)/step);

  // Fast-path: Sub-sample directly from pre-baked Master Map Cache (0ms CPU noise!)
  if(masterMapCache.pixels && masterMapCache.worldId===world.id && masterMapCache.seed===world.seed &&
     baseX>=MASTER_MAP_MIN && baseX+(grid-1)*step<=MASTER_MAP_MAX &&
     baseZ>=MASTER_MAP_MIN && baseZ+(grid-1)*step<=MASTER_MAP_MAX){
    const subPixels=Buffer.alloc(grid*grid*3);
    const mGrid=MASTER_MAP_GRID;
    for(let gz=0;gz<grid;gz++){
      const z=baseZ+gz*step;
      const mgz=Math.max(0,Math.min(mGrid-1,Math.round((z-MASTER_MAP_MIN)/MASTER_MAP_STEP)));
      for(let gx=0;gx<grid;gx++){
        const x=baseX+gx*step;
        const mgx=Math.max(0,Math.min(mGrid-1,Math.round((x-MASTER_MAP_MIN)/MASTER_MAP_STEP)));
        const srcP=(mgz*mGrid+mgx)*3;
        const dstP=(gz*grid+gx)*3;
        subPixels[dstP]=masterMapCache.pixels[srcP];
        subPixels[dstP+1]=masterMapCache.pixels[srcP+1];
        subPixels[dstP+2]=masterMapCache.pixels[srcP+2];
      }
    }
    return {type:'mapRaster',worldId:world.id,seed:world.seed,baseX,baseZ,radius,step,grid,colors:subPixels.toString('base64'),markers:masterMapCache.markers};
  }

  const editColumns=serverMapEditColumns(), cabinCache=new Map(), columns=new Array(grid*grid);
  for(let gz=0;gz<grid;gz++) for(let gx=0;gx<grid;gx++){
    const x=baseX+gx*step,z=baseZ+gz*step, terrain=serverMapColumn(x,z), cabin=serverCabinRoof(x,z,terrain,cabinCache);
    columns[gz*grid+gx]=serverMapColumnWithEdits(x,z,terrain,cabin,editColumns);
  }
  const pixels=Buffer.alloc(grid*grid*3);
  for(let gz=0;gz<grid;gz++) for(let gx=0;gx<grid;gx++){
    const c=columns[gz*grid+gx], west=columns[gz*grid+Math.max(0,gx-1)], east=columns[gz*grid+Math.min(grid-1,gx+1)], north=columns[Math.max(0,gz-1)*grid+gx], south=columns[Math.min(grid-1,gz+1)*grid+gx];
    const rgb=computeMapColumnPixel(c,west,east,north,south), p=(gz*grid+gx)*3;
    pixels[p]=rgb[0]; pixels[p+1]=rgb[1]; pixels[p+2]=rgb[2];
  }
  const markers=[];
  for(const [key,spec] of cabinCache){ if(!spec) continue; const [cx,cz]=key.split(',').map(Number); markers.push({type:'cabin',x:cx*16+7.5,z:cz*16+7.5}); }
  return {type:'mapRaster',worldId:world.id,seed:world.seed,baseX,baseZ,radius,step,grid,colors:pixels.toString('base64'),markers};
}
let serverEditTopRevision=-1, serverEditTopSeed=null, serverEditTopsCache=new Map(), serverEditIdsCache=new Map(), serverTopCache=new Map();
function rebuildServerEditCaches(){
  if(serverEditTopRevision===world.revision&&serverEditTopSeed===world.seed) return;
  serverEditTopsCache=new Map(); serverEditIdsCache=new Map(); serverTopCache=new Map();
  for(const [key,raw] of Object.entries(world.edits||{})){
    const [x,y,z]=key.split(',').map(Number), id=Number(raw);
    if(!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)||!Number.isInteger(id)||id<=0) continue;
    const column=x+','+z, old=serverEditTopsCache.get(column);
    if(!old||y>old.y){ serverEditTopsCache.set(column,{y,id}); serverEditIdsCache.set(key,id); }
  }
  serverEditTopRevision=world.revision; serverEditTopSeed=world.seed;
}
function serverTopAt(x,z){
  rebuildServerEditCaches();
  const bx=Math.floor(x), bz=Math.floor(z), column=bx+','+bz;
  const cached=serverTopCache.get(column); if(cached!==undefined) return cached;
  let top=-1;
  for(let y=WORLD_HEIGHT-1;y>=0;y--){
    const key=`${bx},${y},${bz}`, edit=world.edits?.[key];
    if(edit!==undefined){
      const id=Number(edit);
      if(id>0&&id!==20&&id!==21&&!(id===44&&world.doors[key]===true)){ top=y; break; }
      continue;
    }
    const id=serverBaseBlockAt(bx,y,bz);
    if(id>0&&id!==20&&id!==21&&!(id===44&&world.doors[key]===true)){ top=y; break; }
  }
  serverTopCache.set(column,top); return top;
}
function serverBlockIdAt(x,y,z){
  x=Math.floor(x); y=Math.floor(y); z=Math.floor(z); if(y<0||y>=WORLD_HEIGHT) return 0;
  const key=`${x},${y},${z}`,edit=world.edits?.[key];
  return edit===undefined?serverBaseBlockAt(x,y,z):Number(edit)||0;
}
function serverSolidAt(x,y,z){
  x=Math.floor(x); y=Math.floor(y); z=Math.floor(z); if(y<0||y>=WORLD_HEIGHT) return false;
  const key=`${x},${y},${z}`,id=serverBlockIdAt(x,y,z);
  if(id===0||id===20||id===21) return false;
  return !(id===44&&world.doors[key]===true);
}
function serverWalkHeight(x,z){
  const top=serverTopAt(x,z), foot=top+1;
  if(serverSolidAt(x,foot,z)||serverSolidAt(x,foot+1,z)) return null;
  return top;
}

function playerClaim(playerId) {
  return world.claims.find(claim=>claim.ownerId===playerId&&claim.kind!=='npc')||null;
}
function playerClaims(playerId){ return world.claims.filter(claim=>claim.ownerId===playerId&&claim.kind!=='npc'); }

function claimDetails(claim,viewerId) {
  if(!claim) return null;
  const details={id:claim.id,ownerId:claim.ownerId,ownerName:claim.ownerName,kind:claim.kind||'player',npcPropertyId:claim.npcPropertyId||null,marketListingId:claim.marketListingId||null,marketLocked:claim.marketLocked===true,businessLicense:businessLicensePublic(claim.businessLicense),x:claim.x,z:claim.z,size:CLAIM_SIZE,createdAt:claim.createdAt,updatedAt:claim.updatedAt};
  if(claimCanManage(claim,viewerId)){ details.members=Array.isArray(claim.members)?claim.members.map(member=>({...member})):[]; details.coOwners=Array.isArray(claim.coOwners)?claim.coOwners.map(member=>({...member})):[]; }
  return details;
}

function claimsSummary() {
  return world.claims.map(claim=>{
    const land=landRegistryEntry(claim.x+PARCEL_SIZE/2,claim.z+PARCEL_SIZE/2);
    return {
      id:claim.id,
      ownerId:claim.ownerId,
      ownerName:claim.ownerName,
      kind:claim.kind||'player',
      npcPropertyId:claim.npcPropertyId||null,
      marketListingId:claim.marketListingId||null,
      marketLocked:claim.marketLocked===true,
      businessType:claim.businessLicense?.type||null,
      businessName:claim.businessLicense?.name||null,
      coOwnerCount:Array.isArray(claim.coOwners)?claim.coOwners.length:0,
      members:Array.isArray(claim.members)?claim.members.map(m=>({playerId:m.playerId,build:!!m.build,use:!!m.use})):[],
      coOwners:Array.isArray(claim.coOwners)?claim.coOwners.map(c=>({playerId:c.playerId})):[],
      x:claim.x,
      z:claim.z,
      size:CLAIM_SIZE,
      landTier:land.locationTier,
      landPrice:land.price,
      createdAt:claim.createdAt,
      updatedAt:claim.updatedAt
    };
  });
}

function claimPermissions(claim,playerId) {
  if(!claim) return {build:false,use:false};
  if(claim.ownerId===playerId) return {build:true,use:true,coOwner:true};
  if((claim.coOwners||[]).some(item=>item.playerId===playerId)) return {build:true,use:true,coOwner:true};
  const member=(claim.members||[]).find(item=>item.playerId===playerId);
  return member?{build:!!member.build,use:!!member.use}:{build:false,use:false};
}

function claimAccess(client,x,z,permission) {
  const claim=world.claims.find(item=>claimContainsPoint(item,x+.5,z+.5));
  if(!claim){
    // Seeded cabins are public landmarks; player-created/private objects are not.
    if(permission==='use'&&isPublicLandmarkPoint(x,z)) return {ok:true,public:true,claim:null};
    return {ok:false,reason:'claim_required',claim:null};
  }
  if(claim.marketLocked) return {ok:false,reason:'property_locked',claim};
  if(constructionJobForClaim(claim)) return {ok:false,reason:'construction_locked',claim};
  const rental=rentalContractForTenant(claim,client.playerId);
  if(permission==='use'&&rental) return {ok:true,tenant:true,claim,permissions:{use:true,build:false}};
  const permissions=claimPermissions(claim,client.playerId);
  return permissions[permission]?{ok:true,claim,permissions}:{ok:false,reason:'no_permission',claim,permissions};
}

function claimContainsPoint(claim,x,z,margin=0) {
  return x>=claim.x-margin&&x<=claim.x+CLAIM_SIZE+margin&&z>=claim.z-margin&&z<=claim.z+CLAIM_SIZE+margin;
}

function spawnPointBlockedByClaim(point) {
  return world.claims.some(claim=>claimContainsPoint(claim,point.x,point.z,1));
}

function serverPublicLandmarkObjectAt(object,x,y,z){
  const cx=Math.floor(x/16),cz=Math.floor(z/16),anchor=serverMapColumn(cx*16+7,cz*16+6),chance=serverH2(cx,cz,901),showcase=cx===0&&cz===0;
  const available=showcase||(chance<.035&&(anchor.biome==='plains'||anchor.biome==='forest')&&anchor.h>SEA_LEVEL+1&&anchor.h<WORLD_HEIGHT-9);
  if(!available) return false;
  const points={lamp:[3,2],crate:[12,5],barrel:[12,7],bench:[6,12],sign:[5,2]},point=points[object];
  return !!point&&Math.floor(x)===cx*16+point[0]&&Math.floor(z)===cz*16+point[1]&&Math.floor(y)===anchor.h+1;
}
function isPublicLandmarkPoint(x,z) {
  return ['lamp','crate','barrel','bench','sign'].some(object=>serverPublicLandmarkObjectAt(object,x,serverMapColumn(Math.floor(x),Math.floor(z)).h+1,z));
}

function claimIntersectsSpawnArea(claim) {
  const centerX=claim.x+CLAIM_SIZE/2,centerZ=claim.z+CLAIM_SIZE/2;
  if(Math.hypot(centerX-world.spawn.x,centerZ-world.spawn.z)<CLAIM_SPAWN_BUFFER+Math.SQRT2*8) return true;
  pruneSpawnReservations();
  for(const reservation of spawnReservations.values()){
    if(reservation.worldId!==world.id) continue;
    const closestX=Math.max(claim.x,Math.min(reservation.x,claim.x+CLAIM_SIZE));
    const closestZ=Math.max(claim.z,Math.min(reservation.z,claim.z+CLAIM_SIZE));
    if(Math.hypot(reservation.x-closestX,reservation.z-closestZ)<SPAWN_MIN_DISTANCE) return true;
  }
  return false;
}

function claimHasEditedBlocks(claim) {
  for(const key of Object.keys(world.edits||{})){
    const parts=key.split(',').map(Number); if(parts.length!==3||!parts.every(Number.isInteger)) continue;
    if(parts[0]>=claim.x&&parts[0]<claim.x+CLAIM_SIZE&&parts[2]>=claim.z&&parts[2]<claim.z+CLAIM_SIZE&&Number(world.edits[key])!==0) return true;
  }
  return false;
}

function activeClaimListingForClaim(claim){
  if(!claim||!Array.isArray(world.marketListings)) return null;
  return world.marketListings.find(listing=>listing&&listing.status==='active'&&listing.claimId===claim.id)||null;
}
function npcPropertyRecordForClaim(claim){
  if(!claim||claim.kind!=='npc'||!Array.isArray(world.npcProperties)) return null;
  return world.npcProperties.find(property=>property&&(property.npcClaimId===claim.id||property.claimId===claim.id||property.id===claim.npcPropertyId))||null;
}
function objectValueFromNpcRecord(record){
  const blocks=record?.objects?.states?.blocks||[];
  return Math.max(0,blocks.reduce((sum,block)=>ANALYZER_OBJECT_IDS.has(Number(block.id))?sum+analyzerBlockValue(Number(block.id)):sum,0));
}
function claimPurchaseBreakdown(claim,land){
  const landValue=Math.max(0,Math.round(Number(land?.price)||0));
  if(!claim) return {kind:'land',landValue,buildingValue:0,objectValue:0,businessValue:0,askingPrice:landValue,price:landValue,currency:'Coin'};
  const listing=activeClaimListingForClaim(claim);
  if(claim.kind==='npc'){
    const record=npcPropertyRecordForClaim(claim),buildingValue=Math.max(0,Math.round(Number(record?.building?.value)||0)),objectValue=objectValueFromNpcRecord(record),businessValue=claim.businessLicense?Math.max(250,Math.round(landValue*.15/50)*50):0;
    return {kind:'npc_property',landValue,buildingValue,objectValue,businessValue,askingPrice:null,price:Math.max(landValue,landValue+buildingValue+Math.round(objectValue*.25)+businessValue),currency:'Coin',propertyId:record?.id||claim.npcPropertyId||null,includesBuilding:buildingValue>0,includesObjects:objectValue>0,includesBusiness:!!claim.businessLicense};
  }
  if(listing){
    const snapshot=listing.propertySnapshot||{},buildingValue=Math.max(0,Math.round(Number(snapshot.building?.value)||0)),objectValue=Math.max(0,Math.round(Number(snapshot.objects?.score)||0)),businessValue=snapshot.businessLicense?Math.max(250,Math.round(landValue*.15/50)*50):0;
    return {kind:'player_offer',landValue,buildingValue,objectValue,businessValue,askingPrice:Math.max(1,Math.round(Number(listing.askingPrice)||0)),price:Math.max(1,Math.round(Number(listing.askingPrice)||0)),currency:'Coin',listingId:listing.id,sellerId:listing.sellerId,sellerName:listing.sellerName,includesBuilding:buildingValue>0,includesObjects:objectValue>0,includesBusiness:!!snapshot.businessLicense};
  }
  return {kind:'player_claim',landValue,buildingValue:0,objectValue:0,businessValue:0,askingPrice:null,price:null,currency:'Coin',available:false};
}
function claimAcquisitionFor(claim,land,profile){
  const breakdown=claimPurchaseBreakdown(claim,land);
  if(!claim) return {available:true,kind:'land',price:breakdown.price,officialPrice:breakdown.price,breakdown};
  if(claim.kind==='npc') return {available:true,kind:'npc_property',price:breakdown.price,officialPrice:breakdown.price,breakdown,claimId:claim.id};
  const listing=activeClaimListingForClaim(claim);
  if(listing) return {available:true,kind:'player_offer',price:breakdown.price,officialPrice:breakdown.price,breakdown,claimId:claim.id,listingId:listing.id};
  return {available:false,kind:'player_claim',price:null,officialPrice:null,breakdown,claimId:claim.id};
}
function validateClaimRequest(ownerId,rawX,rawZ) {
  if(!Number.isFinite(Number(rawX))||!Number.isFinite(Number(rawZ))) return {ok:false,reason:'invalid_coordinates'};
  const x=Math.floor((Number(rawX)-CLAIM_SIZE/2)/CLAIM_SIZE)*CLAIM_SIZE,z=Math.floor((Number(rawZ)-CLAIM_SIZE/2)/CLAIM_SIZE)*CLAIM_SIZE,candidate={x,z,size:CLAIM_SIZE},profile=profileByPlayerId(ownerId);
  // The Common Spawn Area remains protected for new open-land claims, but an
  // already-existing NPC or owner-consented Claim remains purchasable. Land
  // quality is reflected by the official price instead of a terrain gate.
  const auction=Array.isArray(world.landAuctions)&&world.landAuctions.find(item=>item&&item.status==='open'&&item.x===x&&item.z===z);
  if(auction) return {ok:false,reason:'premium_auction',message:'This Premium Parcel is reserved for its land auction',auction:landAuctionPublic(auction,ownerId)};
  const occupant=world.claims.find(claim=>claimOverlaps(candidate,claim));
  if(occupant){
    if(occupant.ownerId===ownerId) return {ok:false,reason:'already_claimed'};
    const land=landRegistryEntry(occupant.x+CLAIM_SIZE/2,occupant.z+CLAIM_SIZE/2),acquisition=claimAcquisitionFor(occupant,land,profile);
    if(!acquisition.available) return {ok:false,reason:'claim_not_for_sale',claim:occupant,land,acquisition};
    return {ok:true,price:acquisition.price,currency:'Coin',claim:{x:occupant.x,z:occupant.z,size:CLAIM_SIZE},land:{tier:land.locationTier,biome:land.biome,price:land.price,traffic:land.traffic,access:land.access},acquisition,occupiedClaim:occupant};
  }
  if(claimIntersectsSpawnArea(candidate)) return {ok:false,reason:'spawn_area'};
  const land=landRegistryEntry(x+CLAIM_SIZE/2,z+CLAIM_SIZE/2),acquisition=claimAcquisitionFor(null,land,profile),firstClaimFree=profile?.hasClaimedFree!==true;
  return {ok:true,price:firstClaimFree?0:acquisition.price,currency:'Coin',claim:candidate,land:{tier:land.locationTier,biome:land.biome,price:land.price,traffic:land.traffic,access:land.access},acquisition:{...acquisition,firstClaimFree}};
}

function claimReasonText(reason) {
  return ({already_claimed:'You already own a Claim',claim_not_for_sale:'This player Claim is not currently offered for sale',premium_auction:'This Premium Parcel is reserved for its land auction',claim_occupied:'This Claim overlaps another Claim',spawn_area:'Claims must stay outside the Common Spawn Area',water:'Claim must be on dry land',mountains:'Claim cannot be placed in mountain terrain',uneven_terrain:'Claim terrain is too uneven',landmark:'Claim cannot cover a Landmark',invalid_coordinates:'Select a valid map location',existing_building:'This land already contains a building or edit',insufficient_funds:'You do not have enough Coin for this Claim'})[reason]||'This Claim location is not available';
}

function normalizeParcelOrigin(rawX,rawZ) {
  return {x:Math.floor((Number(rawX)-PARCEL_SIZE/2)/PARCEL_SIZE)*PARCEL_SIZE,z:Math.floor((Number(rawZ)-PARCEL_SIZE/2)/PARCEL_SIZE)*PARCEL_SIZE};
}

function nearestLandmarkDistance(x,z) {
  let best=Infinity; const cache=new Map(), centerX=Math.floor(x/16),centerZ=Math.floor(z/16);
  for(let dz=-8;dz<=8;dz++) for(let dx=-8;dx<=8;dx++){
    const cx=centerX+dx,cz=centerZ+dz,spec=serverCabinSpec(cx,cz,cache); if(!spec) continue;
    best=Math.min(best,Math.hypot(x-(cx*16+8),z-(cz*16+7)));
  }
  return best;
}

function landRegistryEntry(rawX,rawZ) {
  const parcel=normalizeParcelOrigin(rawX,rawZ), x=parcel.x,z=parcel.z, centerX=x+PARCEL_SIZE/2,centerZ=z+PARCEL_SIZE/2;
  const terrain=serverMapColumn(Math.floor(centerX),Math.floor(centerZ));
  const spawnDistance=Math.hypot(centerX-world.spawn.x,centerZ-world.spawn.z), landmarkDistance=nearestLandmarkDistance(centerX,centerZ);
  const nearbyClaims=world.claims.filter(claim=>Math.hypot((claim.x+PARCEL_SIZE/2)-centerX,(claim.z+PARCEL_SIZE/2)-centerZ)<=256).length;
  const biomeMultiplier=({plains:1,forest:1.25,desert:.95,snowy:1.15,mountains:1.5,river:1.1}[terrain.biome]||1);
  const accessMultiplier=clamp(1+(spawnDistance<512?(512-spawnDistance)/512*.28:0)+(landmarkDistance<256?(256-landmarkDistance)/256*.22:0),1,1.5);
  const locationTier=(spawnDistance<176||landmarkDistance<96)?'Premium':(spawnDistance<512||landmarkDistance<256)?'Prime':'Ordinary';
  const locationMultiplier=locationTier==='Premium'?10:locationTier==='Prime'?4:1;
  const demandMultiplier=clamp(1+Math.max(0,nearbyClaims-1)*.08,1,1.5);
  const price=Math.max(50,Math.round(BASE_LAND_PRICE*biomeMultiplier*accessMultiplier*locationMultiplier*demandMultiplier/50)*50);
  const accessLevel=accessMultiplier>=1.3?'High':accessMultiplier>=1.12?'Medium':'Low';
  const traffic=locationTier==='Premium'?'High':locationTier==='Prime'?'Medium':'Low';
  const ownerClaim=world.claims.find(claim=>claim.x===x&&claim.z===z),purchase=claimAcquisitionFor(ownerClaim,{x,z,size:PARCEL_SIZE,price,currency:'Coin'} ,null);
  return {x,z,size:PARCEL_SIZE,status:ownerClaim?'claimed':'available',ownerId:ownerClaim?.ownerId||null,ownerName:ownerClaim?.ownerName||null,ownerKind:ownerClaim?.kind||null,biome:terrain.biome,terrainHeight:terrain.h,locationTier,access:accessLevel,traffic,price,currency:'Coin',factors:{base:BASE_LAND_PRICE,biome:biomeMultiplier,access:accessMultiplier,location:locationMultiplier,demand:demandMultiplier},nearbyClaims,spawnDistance:Math.round(spawnDistance),landmarkDistance:Number.isFinite(landmarkDistance)?Math.round(landmarkDistance):null,purchase,official:true};
}

function rotatedPrefabFootprint(prefab,rotation){
  const turns=((Number(rotation)||0)%360+360)%360;
  return turns===90||turns===270?{w:prefab.footprint.d,d:prefab.footprint.w,h:prefab.footprint.h}:{...prefab.footprint};
}
function prefabHasEditedBlocks(origin,footprint){
  for(const key of Object.keys(world.edits||{})){
    const parts=key.split(',').map(Number); if(parts.length!==3||!parts.every(Number.isInteger)) continue;
    if(parts[0]>=origin.x&&parts[0]<origin.x+footprint.w&&parts[2]>=origin.z&&parts[2]<origin.z+footprint.d&&Number(world.edits[key])!==0) return true;
  }
  return false;
}
function validatePrefabPlacement(client,prefabId,rawX,rawZ,rotation=0){
  const prefab=prefabById(prefabId); if(!prefab) return {ok:false,reason:'unknown_prefab',message:'Prefab is not in the server catalog'};
  const origin={x:Number(rawX),z:Number(rawZ)}; if(!Number.isInteger(origin.x)||!Number.isInteger(origin.z)) return {ok:false,reason:'invalid_origin',message:'Prefab origin must be a whole world coordinate'};
  const footprint=rotatedPrefabFootprint(prefab,rotation),claim=world.claims.find(item=>claimContainsPoint(item,origin.x+.5,origin.z+.5));
  if(!claim) return {ok:false,reason:'claim_required',message:'Prefab placement requires a Claim'};
  const access=claimAccess(client,origin.x,origin.z,'build');
  if(!access.ok) return {ok:false,reason:access.reason==='claim_required'?'claim_required':access.reason==='property_locked'?'property_locked':'no_permission',message:access.reason==='claim_required'?'Prefab placement requires a Claim':access.reason==='property_locked'?'This Property is locked while listed for sale':'You do not have BUILD permission for this Claim'};
  if(origin.x<claim.x||origin.z<claim.z||origin.x+footprint.w>claim.x+CLAIM_SIZE||origin.z+footprint.d>claim.z+CLAIM_SIZE) return {ok:false,reason:'outside_claim',message:'The entire Prefab footprint must fit inside your Claim'};
  let minHeight=WORLD_HEIGHT,maxHeight=0;
  for(let dz=0;dz<footprint.d;dz++) for(let dx=0;dx<footprint.w;dx++){
    const terrain=serverMapColumn(origin.x+dx,origin.z+dz); minHeight=Math.min(minHeight,terrain.h); maxHeight=Math.max(maxHeight,terrain.h);
    if(terrain.h<=31||terrain.biome==='river') return {ok:false,reason:'water',message:'Prefab placement requires dry land'};
    if(terrain.biome==='mountains') return {ok:false,reason:'mountains',message:'Prefab placement cannot use mountain terrain'};
  }
  if(maxHeight-minHeight>4) return {ok:false,reason:'uneven_terrain',message:'Prefab footprint is too uneven'};
  if(prefabHasEditedBlocks(origin,footprint)) return {ok:false,reason:'occupied',message:'Prefab footprint contains existing building edits'};
  const cabinCache=new Map();
  for(let cx=Math.floor(origin.x/16);cx<=Math.floor((origin.x+footprint.w-1)/16);cx++) for(let cz=Math.floor(origin.z/16);cz<=Math.floor((origin.z+footprint.d-1)/16);cz++) if(serverCabinSpec(cx,cz,cabinCache)) return {ok:false,reason:'landmark',message:'Prefab cannot overlap a Landmark'};
  const baseY=Math.max(0,minHeight+1);
  if(baseY+footprint.h>=WORLD_HEIGHT) return {ok:false,reason:'height_limit',message:'Prefab exceeds the world height limit'};
  return {ok:true,prefab,placement:{prefabId:prefab.id,x:origin.x,z:origin.z,y:baseY,rotation:((Number(rotation)||0)%360+360)%360,footprint:{...footprint},price:prefab.price,currency:'Coin',paid:true}};
}
function prefabReasonText(reason){ return ({unknown_prefab:'Prefab is not in the Store catalog',invalid_origin:'Choose a valid grid origin',claim_required:'Prefab placement requires a Claim',no_permission:'You do not have BUILD permission for this Claim',outside_claim:'The entire Prefab must fit inside the Claim',water:'Prefab placement requires dry land',mountains:'Prefab placement cannot use mountain terrain',uneven_terrain:'Prefab footprint is too uneven',occupied:'Prefab footprint contains existing building edits',landmark:'Prefab cannot overlap a Landmark',height_limit:'Prefab exceeds the world height limit',property_locked:'This Property is locked while listed for sale',wallet_required:'All Prefabs are paid; Wallet is required before placement'})[reason]||'Prefab placement is unavailable';
}

const ANALYZER_BLOCK_NAMES=Object.freeze({
  1:'Grass Block',2:'Dirt',3:'Stone',4:'Cobblestone',5:'Sand',6:'Gravel',7:'Oak Log',8:'Oak Leaves',9:'Spruce Log',10:'Spruce Leaves',
  11:'Oak Planks',12:'Dark Oak Planks',13:'Bricks',14:'Stone Bricks',15:'Mossy Cobblestone',16:'Sandstone',17:'Snow Block',18:'Ice',19:'Glass',20:'Water',21:'Lava',
  22:'Bedrock',23:'Coal Ore',24:'Iron Ore',25:'Gold Ore',26:'Diamond Ore',27:'Obsidian',28:'Glowstone',29:'Cactus',30:'Crafting Table',31:'TNT',32:'Quartz Block',
  33:'Block of Iron',34:'Block of Gold',35:'Block of Diamond',36:'White Wool',37:'Red Wool',38:'Blue Wool',39:'Yellow Wool',40:'Green Wool',41:'Black Wool',42:'Dirt Path',
  43:'Wood Fence',44:'Wooden Door',45:'Lantern',46:'Crate',47:'Barrel',48:'Sign',49:'Bookshelf',50:'Chest',51:'Table'
});
const ANALYZER_BLOCK_VALUES=Object.freeze({1:2,2:2,3:4,4:5,5:2,6:2,7:8,8:3,9:9,10:3,11:8,12:10,13:12,14:12,15:9,16:9,17:3,18:4,19:12,20:0,21:0,22:0,23:14,24:18,25:24,26:40,27:32,28:26,29:3,30:20,31:3,32:24,33:36,34:48,35:72,36:5,37:5,38:5,39:5,40:5,41:5,42:5,43:7,44:18,45:22,46:14,47:15,48:8,49:18,50:22,51:16});
const ANALYZER_OBJECT_IDS=Object.freeze(new Set([28,29,30,31,42,43,44,45,46,47,48,49,50,51]));
function analyzerRoundCoin(value){ return Math.max(0,Math.round(Number(value||0)/50)*50); }
function analyzerBlockName(id){ return ANALYZER_BLOCK_NAMES[id]||`Block ${id}`; }
function analyzerBlockValue(id){ return Number(ANALYZER_BLOCK_VALUES[id]||1); }
function analyzerSolidAt(editMap,x,y,z){
  if(y<0||y>=WORLD_HEIGHT) return false;
  const key=`${x},${y},${z}`,id=editMap.has(key)?Number(editMap.get(key)):serverBaseBlockAt(x,y,z);
  if(id===0||id===20||id===21) return false;
  return !(id===44&&world.doors[key]===true);
}
function analyzerAirRoomCount(editMap,bounds,floorY){
  const y=floorY+1; if(y>=WORLD_HEIGHT) return 0;
  const minX=bounds.minX-1,maxX=bounds.maxX+1,minZ=bounds.minZ-1,maxZ=bounds.maxZ+1;
  const key=(x,z)=>x+','+z,visited=new Set(),queue=[];
  for(let x=minX;x<=maxX;x++){ queue.push([x,minZ]); queue.push([x,maxZ]); }
  for(let z=minZ+1;z<maxZ;z++){ queue.push([minX,z]); queue.push([maxX,z]); }
  while(queue.length){ const [x,z]=queue.shift(),k=key(x,z); if(visited.has(k)||x<minX||x>maxX||z<minZ||z>maxZ||analyzerSolidAt(editMap,x,y,z)) continue; visited.add(k); queue.push([x+1,z],[x-1,z],[x,z+1],[x,z-1]); }
  const innerVisited=new Set(),rooms=[];
  for(let x=bounds.minX;x<=bounds.maxX;x++) for(let z=bounds.minZ;z<=bounds.maxZ;z++){
    const k=key(x,z); if(visited.has(k)||innerVisited.has(k)||analyzerSolidAt(editMap,x,y,z)) continue;
    const cells=[],todo=[[x,z]]; innerVisited.add(k);
    while(todo.length){ const [cx,cz]=todo.pop(); cells.push([cx,cz]); for(const [nx,nz] of [[cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1]]){ const nk=key(nx,nz); if(nx<bounds.minX||nx>bounds.maxX||nz<bounds.minZ||nz>bounds.maxZ||visited.has(nk)||innerVisited.has(nk)||analyzerSolidAt(editMap,nx,y,nz)) continue; innerVisited.add(nk); todo.push([nx,nz]); } }
    if(cells.length>=4) rooms.push(cells.length);
  }
  return rooms.length;
}
function analyzerClaimFor(claimId,rawX,rawZ){
  if(claimId){ const wanted=String(claimId); return world.claims.find(claim=>claim.id===wanted)||null; }
  const x=Number(rawX),z=Number(rawZ); if(!Number.isFinite(x)||!Number.isFinite(z)) return null;
  return world.claims.find(claim=>claimContainsPoint(claim,x,z))||null;
}
function analyzeProperty(claim){
  if(!claim) return null;
  const editMap=new Map(),blocks=[],counts=new Map(),topByColumn=new Map(),ys=new Map();
  for(const [key,rawId] of Object.entries(world.edits||{})){
    const parts=key.split(',').map(Number),id=Number(rawId);
    if(parts.length!==3||!parts.every(Number.isInteger)) continue;
    const [x,y,z]=parts; if(x<claim.x||x>=claim.x+CLAIM_SIZE||z<claim.z||z>=claim.z+CLAIM_SIZE||y<1||y>=WORLD_HEIGHT||!Number.isInteger(id)) continue;
    editMap.set(key,id); if(id<=0) continue;
    blocks.push({x,y,z,id}); counts.set(id,(counts.get(id)||0)+1); ys.set(y,(ys.get(y)||0)+1);
    const column=x+','+z,old=topByColumn.get(column); if(!old||y>old.y) topByColumn.set(column,{x,y,z,id});
  }
  const terrain=[],heightValues=[]; for(let z=claim.z;z<claim.z+CLAIM_SIZE;z++) for(let x=claim.x;x<claim.x+CLAIM_SIZE;x++){ const t=serverMapColumn(x,z); terrain.push({x,z,h:t.h,biome:t.biome}); heightValues.push(t.h); }
  const minTerrain=Math.min(...heightValues),maxTerrain=Math.max(...heightValues),flatness=Math.max(0,100-Math.round((maxTerrain-minTerrain)*14));
  const byLevel=new Map(); for(const block of blocks){ if(!byLevel.has(block.y)) byLevel.set(block.y,[]); byLevel.get(block.y).push(block); }
  const floorCandidates=new Set(),floorColumns=new Set();
  for(const block of blocks){ const terrainH=serverMapColumn(block.x,block.z).h; if(block.y<=terrainH+1){ floorCandidates.add(block.y); floorColumns.add(block.x+','+block.z); } }
  const floorLevels=[...floorCandidates].filter(y=>{ const level=byLevel.get(y)||[],xs=new Set(level.map(block=>block.x)),zs=new Set(level.map(block=>block.z)); return level.length>=4&&xs.size>=2&&zs.size>=2; }).sort((a,b)=>a-b);
  const minX=blocks.length?Math.min(...blocks.map(b=>b.x)):claim.x,maxX=blocks.length?Math.max(...blocks.map(b=>b.x)):claim.x,minZ=blocks.length?Math.min(...blocks.map(b=>b.z)):claim.z,maxZ=blocks.length?Math.max(...blocks.map(b=>b.z)):claim.z;
  const bounds={minX,maxX,minZ,maxZ};
  const roomCounts=floorLevels.map(y=>analyzerAirRoomCount(editMap,bounds,y));
  const rooms=roomCounts.length?Math.max(...roomCounts):0;
  const maxBuildingY=blocks.length?Math.max(...blocks.map(b=>b.y)):0, buildingHeight=blocks.length?Math.max(0,maxBuildingY-minTerrain+1):0;
  const roofBlockList=blocks.filter(block=>{ const top=topByColumn.get(block.x+','+block.z); return top&&top.y===block.y&&block.y>=serverMapColumn(block.x,block.z).h+3; }),roofBlocks=roofBlockList.length,roofXs=new Set(roofBlockList.map(block=>block.x)),roofZs=new Set(roofBlockList.map(block=>block.z));
  const roofPresent=roofBlocks>=4&&buildingHeight>=3&&roofXs.size>=2&&roofZs.size>=2;
  const doorBlocks=counts.get(44)||0,pathBlocks=counts.get(42)||0;
  const objectCounts={}; for(const [id,count] of counts){ if(ANALYZER_OBJECT_IDS.has(id)) objectCounts[analyzerBlockName(id)]=count; }
  const lights=(counts.get(45)||0)+(counts.get(28)||0),storage=(counts.get(46)||0)+(counts.get(47)||0)+(counts.get(50)||0),work=(counts.get(30)||0)+(counts.get(51)||0),furnishing=(counts.get(48)||0)+(counts.get(49)||0),fencing=counts.get(43)||0;
  const uniqueBlocks=counts.size, blockCount=blocks.length, footprintArea=floorColumns.size;
  const amenityFlags={lighting:lights>0,storage:storage>0,workspace:work>0,access:doorBlocks>0,circulation:pathBlocks>0,furnishing:furnishing>0,perimeter:fencing>0};
  const amenityScore=blockCount?Math.min(100,(amenityFlags.lighting?18:0)+(amenityFlags.storage?18:0)+(amenityFlags.workspace?18:0)+(amenityFlags.access?16:0)+(amenityFlags.circulation?12:0)+(amenityFlags.furnishing?10:0)+(amenityFlags.perimeter?8:0)):0;
  const land=landRegistryEntry(claim.x+CLAIM_SIZE/2,claim.z+CLAIM_SIZE/2),tierScore=land.locationTier==='Premium'?100:land.locationTier==='Prime'?78:52;
  const landscapeScore=Math.max(0,Math.min(100,Math.round(tierScore*.55+flatness*.30+(land.biome==='plains'||land.biome==='forest'?15:land.biome==='desert'?10:5))));
  const structureScore=blockCount?Math.min(100,(footprintArea>=4?18:8)+(buildingHeight>=2?12:0)+(buildingHeight>=4?10:0)+(roofPresent?20:0)+Math.min(20,rooms*10)+(doorBlocks?10:0)+(pathBlocks?5:0)+Math.min(5,uniqueBlocks)):0;
  let qualityScore=blockCount?Math.round(structureScore*.62+amenityScore*.26+landscapeScore*.12):0;
  // A wall or a roofless shell is not a high-quality Property. Critical parts cap the score until the build is usable.
  if(!floorLevels.length) qualityScore=Math.min(qualityScore,34);
  if(!rooms) qualityScore=Math.min(qualityScore,46);
  if(!roofPresent) qualityScore=Math.min(qualityScore,54);
  if(!doorBlocks) qualityScore=Math.min(qualityScore,62);
  if(!floorLevels.length||!rooms||!roofPresent||!doorBlocks) qualityScore=Math.min(qualityScore,69);
  qualityScore=Math.max(0,Math.min(100,qualityScore));
  const useScore=blockCount?Math.min(100,Math.min(40,rooms*20)+(doorBlocks?15:0)+(pathBlocks?10:0)+(amenityFlags.lighting?10:0)+(amenityFlags.storage?10:0)+(amenityFlags.workspace?10:0)+(amenityFlags.furnishing?5:0)):0;
  const shapeComplexity=blockCount?Math.min(35,Math.max(0,uniqueBlocks*3)+Math.min(15,Math.round((maxX-minX+maxZ-minZ)/2))):0;
  const originalityScore=blockCount?Math.min(100,Math.round(Math.min(55,uniqueBlocks*7)+shapeComplexity+Math.min(10,Math.max(0,furnishing+fencing)))):0;
  const rawMaterialValue=blocks.reduce((sum,block)=>sum+analyzerBlockValue(block.id),0),sizeValue=analyzerRoundCoin(footprintArea*14+rooms*90+buildingHeight*25),amenityValue=analyzerRoundCoin(lights*8+storage*10+work*14+furnishing*5+fencing*3);
  const qualityFactor=blockCount?Number((.45+qualityScore/100*.75).toFixed(2)):0;
  const buildingValue=blockCount?analyzerRoundCoin(rawMaterialValue*qualityFactor+sizeValue+amenityValue):0;
  const recommendations=[];
  if(!blockCount) recommendations.push('Build a coherent structure first; the Building Value is currently 0 Coin.');
  else { if(!floorLevels.length) recommendations.push('Add a broad, level floor or foundation.'); if(!roofPresent) recommendations.push('Complete a roof so the structure reads as weatherproof.'); if(!rooms) recommendations.push('Enclose at least one usable room with walls and a ceiling.'); if(!doorBlocks) recommendations.push('Add a Wooden Door to create a clear entrance.'); if(!pathBlocks) recommendations.push('Connect the entrance to the outside with Dirt Path blocks.'); if(!amenityFlags.lighting) recommendations.push('Add Lanterns or Glowstone for lighting.'); if(!amenityFlags.storage) recommendations.push('Add a Chest, Crate or Barrel for storage utility.'); if(!amenityFlags.workspace) recommendations.push('Add a Crafting Table or Table as a workspace.'); if(uniqueBlocks<3) recommendations.push('Use more material types to improve visual quality and Originality.'); }
  if(flatness<70) recommendations.push('Terrace or landscape the uneven parts of the Claim to improve usable area.');
  const blockInventory=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([id,count])=>({id,name:analyzerBlockName(id),count,materialValue:analyzerBlockValue(id)*count}));
  const qualityLabel=qualityScore>=85?'Excellent':qualityScore>=70?'Strong':qualityScore>=45?'Developing':blockCount?'Basic':'Empty';
  return {claim:{id:claim.id,ownerId:claim.ownerId,ownerName:claim.ownerName,x:claim.x,z:claim.z,size:CLAIM_SIZE},certification:{status:'certified_observation',version:1,analyzedAt:new Date().toISOString(),saleEligible:false},values:{currency:'Coin',landValue:land.price,buildingValue,certifiedValue:land.price+buildingValue,breakdown:{rawMaterialValue,qualityFactor,sizeValue,amenityValue}},scores:{quality:qualityScore,qualityLabel,usefulness:useScore,originality:originalityScore,landscape:landscapeScore},structure:{editedBlockCount:blockCount,uniqueBlockTypes:uniqueBlocks,bounds:blocks.length?{minX,maxX,minZ,maxZ}:null,height:buildingHeight,floors:{count:floorLevels.length,levels:floorLevels,area:footprintArea,blocks:floorColumns.size},roof:{present:roofPresent,blocks:roofBlocks},rooms:{count:rooms,byFloor:roomCounts},entrance:{present:doorBlocks>0,doors:doorBlocks},path:{present:pathBlocks>0,blocks:pathBlocks}},objects:{counts:objectCounts,amenities:amenityFlags,score:amenityScore},blockInventory,landscape:{biome:land.biome,locationTier:land.locationTier,terrainHeight:land.terrainHeight,flatnessScore:flatness,terrainRange:maxTerrain-minTerrain,access:land.access,traffic:land.traffic,demand:land.factors?.demand||1},recommendations};
}
function propertyCompletion(report){
  const structure=report?.structure||{};
  return !!report&&Number(report.values?.buildingValue||0)>0&&Number(structure.floors?.count||0)>0&&structure.roof?.present===true&&Number(structure.rooms?.count||0)>0&&structure.entrance?.present===true;
}
function propertyCompletionMessage(report){
  const missing=[];const st=report?.structure||{};if(!st.floors?.count)missing.push('floor');if(!st.roof?.present)missing.push('roof');if(!st.rooms?.count)missing.push('room');if(!st.entrance?.present)missing.push('entrance');return missing.length?`Complete the Property first · add ${missing.join(', ')}`:'Property is ready';
}
function propertyReportMessage(claim){ return claim?{type:'propertyReport',ok:true,report:analyzeProperty(claim)}:{type:'propertyReport',ok:false,reason:'no_claim',message:'Create a Claim before analyzing a Property'}; }
function propertyEditSnapshot(claim){
  const blocks=[];
  for(const [key,rawId] of Object.entries(world.edits||{})){ const parts=key.split(',').map(Number),id=Number(rawId); if(parts.length===3&&parts.every(Number.isInteger)&&id>0&&parts[0]>=claim.x&&parts[0]<claim.x+CLAIM_SIZE&&parts[2]>=claim.z&&parts[2]<claim.z+CLAIM_SIZE) blocks.push({x:parts[0],y:parts[1],z:parts[2],id}); }
  const insideState=(source,predicate)=>Object.fromEntries(Object.entries(source||{}).filter(([key,value])=>{ const parts=key.split(',').map(Number); return parts.length===3&&parts.every(Number.isInteger)&&predicate(parts[0],parts[2])&&value===true; }));
  return {blocks,doors:insideState(world.doors,(x,z)=>x>=claim.x&&x<claim.x+CLAIM_SIZE&&z>=claim.z&&z<claim.z+CLAIM_SIZE),lights:insideState(world.lights,(x,z)=>x>=claim.x&&x<claim.x+CLAIM_SIZE&&z>=claim.z&&z<claim.z+CLAIM_SIZE)};
}
function buildPrefabEditList(placement){
  const f=placement.footprint,x=placement.x,z=placement.z,y=placement.y,edits=[];
  const add=(dx,dy,dz,id)=>{ if(dx>=0&&dx<f.w&&dz>=0&&dz<f.d&&y+dy>=1&&y+dy<WORLD_HEIGHT) edits.push({x:x+dx,y:y+dy,z:z+dz,id}); };
  for(let dz=0;dz<f.d;dz++) for(let dx=0;dx<f.w;dx++) add(dx,0,dz,11);
  for(let dy=1;dy<f.h-1;dy++) for(let dz=0;dz<f.d;dz++) for(let dx=0;dx<f.w;dx++) if(dx===0||dx===f.w-1||dz===0||dz===f.d-1) add(dx,dy,dz,11);
  for(let dz=0;dz<f.d;dz++) for(let dx=0;dx<f.w;dx++) add(dx,f.h-1,dz,12);
  const doorX=Math.floor(f.w/2); add(doorX,1,0,44);
  if(f.w>6&&f.d>6&&f.h>3){ add(1,2,Math.floor(f.d/2),19); add(f.w-2,2,Math.floor(f.d/2),19); add(Math.floor(f.w/2),2,Math.floor(f.d/2),45); }
  add(Math.max(1,Math.floor(f.w/2)-1),1,Math.max(1,Math.floor(f.d/2)),50);
  add(Math.min(f.w-2,Math.floor(f.w/2)+1),1,Math.max(1,Math.floor(f.d/2)),30);
  return edits;
}
function npcPropertyClaimFrom(claim,npcPropertyId,now){
  return {id:`cl_${crypto.randomBytes(8).toString('hex')}`,ownerId:`npc_${npcPropertyId}`,ownerName:'NPC Buyback',kind:'npc',npcPropertyId,businessLicense:claim.businessLicense||null,x:claim.x,z:claim.z,size:CLAIM_SIZE,members:[],createdAt:now,updatedAt:now};
}
function sellPropertyToNpc(client,claimId=null){
  const claim=claimId?world.claims.find(item=>item.id===String(claimId)):playerClaim(client.playerId);
  if(!claim||claim.ownerId!==client.playerId||claim.kind==='npc') return {ok:false,reason:'no_claim',message:'You do not own this Property to sell'};
  if(claim.kind==='npc') return {ok:false,reason:'npc_property',message:'NPC Properties cannot be sold back by players'};
  if(claim.marketLocked) return {ok:false,reason:'property_locked',message:'Cancel the active market listing before selling to the NPC'};
  if(constructionJobForClaim(claim)) return {ok:false,reason:'construction_active',message:'Cancel or complete the NPC construction contract before selling to the NPC'};
  if(activeRentalForClaim(claim)) return {ok:false,reason:'rental_active',message:'End the rental contract before selling this Property'};
  const report=analyzeProperty(claim); if(!propertyCompletion(report)) return {ok:false,reason:'property_incomplete',message:propertyCompletionMessage(report)};
  const existing=world.npcProperties.find(property=>property.claimId===claim.id); if(existing) return {ok:false,reason:'already_sold',message:'This Property has already been sold'};
  const certifiedValue=Number(report.values.certifiedValue)||0,payout=Math.max(0,Math.round(certifiedValue*.8)); if(!payout) return {ok:false,reason:'zero_value',message:'This Property has no sellable value'};
  const npcPropertyId=`npcp_${crypto.randomBytes(8).toString('hex')}`,tx=commitCoinTransaction({playerId:client.playerId,delta:payout,type:'property_npc_buyback',reason:`NPC buyback at 80% of Certified Value ${certifiedValue} Coin`,propertyId:claim.id});
  if(!tx.ok) return {ok:false,...tx};
  const transferredLicense=cloneTransferBusinessLicense(claim.businessLicense);
  detachBusinessCompanyLink(claim.businessLicense);
  const now=new Date().toISOString(),snapshot={id:npcPropertyId,claimId:claim.id,ownerName:'NPC Buyback',sellerId:client.playerId,sellerName:client.name,land:{x:claim.x,z:claim.z,size:CLAIM_SIZE,value:report.values.landValue,tier:report.landscape.locationTier,biome:report.landscape.biome},building:{value:report.values.buildingValue,blocks:propertyEditSnapshot(claim).blocks},objects:{...report.objects,states:propertyEditSnapshot(claim)},businessLicense:transferredLicense,certifiedValue,payout,payoutRate:.8,soldAt:now,transactionId:tx.tx.id};
  const npcClaim=npcPropertyClaimFrom({...claim,businessLicense:transferredLicense},npcPropertyId,now); snapshot.npcClaimId=npcClaim.id; world.npcProperties.push(snapshot); world.claims=world.claims.filter(item=>item.id!==claim.id); world.claims.push(npcClaim); world.revision+=1; saveWorld();
  return {ok:true,payout,certifiedValue,payoutRate:.8,propertyId:claim.id,npcPropertyId,wallet:tx.wallet,claim:npcClaim};
}
function buyPrefabForPlayer(client,result){
  const price=Number(result.prefab.price)||0,tx=commitCoinTransaction({playerId:client.playerId,delta:-price,type:'prefab_purchase',reason:`Game Store purchase: ${result.prefab.name}`,propertyId:null});
  if(!tx.ok) return {ok:false,reason:tx.reason,message:tx.reason==='insufficient_funds'?`You need ${price.toLocaleString()} Coin; wallet balance is ${tx.balance||0} Coin`:'Wallet transaction failed',balance:tx.balance??0,price};
  const edits=buildPrefabEditList(result.placement),byKey=new Map(); for(const edit of edits) byKey.set(editKey(edit.x,edit.y,edit.z),edit);
  for(const edit of byKey.values()) world.edits[editKey(edit.x,edit.y,edit.z)]=edit.id;
  world.revision+=byKey.size; saveWorld();
  for(const edit of byKey.values()) broadcast({type:'blockUpdate',x:edit.x,y:edit.y,z:edit.z,id:edit.id,revision:world.revision,by:client.id});
  return {ok:true,wallet:tx.wallet,placement:result.placement,blocksPlaced:byKey.size};
}
const MARKET_COMMISSION_RATE=.05;
function marketListingPublic(listing){
  const snapshot=listing.propertySnapshot||{};
  return {id:listing.id,type:listing.type||'property',claimId:listing.claimId,sellerId:listing.sellerId,sellerName:listing.sellerName,status:listing.status,land:{...(snapshot.land||{x:0,z:0,size:CLAIM_SIZE,value:0,tier:'Ordinary',biome:'unknown'})},certifiedValue:listing.certifiedValue||0,premiumPercent:listing.premiumPercent||0,askingPrice:listing.askingPrice,currency:'Coin',commissionRate:listing.commissionRate,quality:snapshot.scores?.quality||0,usefulness:snapshot.scores?.usefulness||0,originality:snapshot.scores?.originality||0,includesBuilding:Number(snapshot.building?.value||0)>0,includesBusiness:!!snapshot.businessLicense,createdAt:listing.createdAt,locked:true};
}
function marketListingsPayload(){ return world.marketListings.filter(listing=>listing&&listing.status==='active').map(marketListingPublic); }
function marketListingById(id){ return world.marketListings.find(listing=>listing&&listing.id===String(id||'')&&listing.status==='active')||null; }
function marketplaceTransferCoins(buyerId,sellerId,amount,commission,listingId,propertyId){
  const buyer=profileByPlayerId(buyerId),seller=profileByPlayerId(sellerId); if(!buyer||!seller) return {ok:false,reason:'player_not_found',message:'Buyer or seller wallet was not found'};
  if(!buyer.wallet||typeof buyer.wallet!=='object') buyer.wallet={balance:0,updatedAt:null}; if(!seller.wallet||typeof seller.wallet!=='object') seller.wallet={balance:0,updatedAt:null};
  const price=Math.trunc(Number(amount)),fee=Math.trunc(Number(commission)),net=price-fee,balance= Math.max(0,Math.floor(Number(buyer.wallet.balance)||0));
  if(!Number.isFinite(price)||price<=0||fee<0||net<0) return {ok:false,reason:'invalid_amount',message:'Invalid market amount'};
  if(balance<price) return {ok:false,reason:'insufficient_funds',message:`You need ${price.toLocaleString()} Coin; wallet balance is ${balance.toLocaleString()} Coin`,balance};
  const now=new Date().toISOString(),sellerBalance=Math.max(0,Math.floor(Number(seller.wallet.balance)||0)),systemBalance=coinLedger.filter(row=>row.playerId==='system_market').reduce((sum,row)=>sum+Number(row.delta||0),0),buyerNext=balance-price,sellerNext=sellerBalance+net,systemNext=systemBalance+fee;
  const rows=[
    {id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:buyerId,delta:-price,balanceAfter:buyerNext,type:'market_escrow_hold',reason:`Escrow hold for Property listing ${listingId}`,propertyId,listingId,createdAt:now},
    {id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:sellerId,delta:net,balanceAfter:sellerNext,type:'market_settlement',reason:`Property sale settlement after ${fee} Coin commission`,propertyId,listingId,createdAt:now},
    {id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:'system_market',delta:fee,balanceAfter:systemNext,type:'market_commission',reason:`Marketplace commission for listing ${listingId}`,propertyId,listingId,createdAt:now}
  ];
  buyer.wallet={balance:buyerNext,updatedAt:now}; seller.wallet={balance:sellerNext,updatedAt:now}; coinLedger.push(...rows); savePlayerProfiles(); saveCoinLedger();
  return {ok:true,buyerWallet:walletSnapshot(buyerId),sellerWallet:walletSnapshot(sellerId),commission:fee,sellerNet:net,transactions:rows};
}
function propertySnapshotForListing(claim,report){
  const assets=propertyEditSnapshot(claim); return {claimId:claim.id,land:{x:claim.x,z:claim.z,size:CLAIM_SIZE,value:report.values.landValue,tier:report.landscape.locationTier,biome:report.landscape.biome},building:{value:report.values.buildingValue,blocks:assets.blocks},objects:{...report.objects,states:assets},businessLicense:claim.businessLicense||null,certifiedValue:report.values.certifiedValue,scores:report.scores};
}
function marketListProperty(client,claimId,premiumPercent){
  const claim=claimId?world.claims.find(item=>item.id===String(claimId)):playerClaim(client.playerId);
  if(!claim||claim.ownerId!==client.playerId||claim.kind==='npc') return {ok:false,reason:'no_claim',message:'You must own the Property you want to list'};
  if(claim.marketLocked||world.marketListings.some(listing=>listing.status==='active'&&listing.claimId===claim.id)) return {ok:false,reason:'already_listed',message:'This Property already has an active listing'};
  if(constructionJobForClaim(claim)) return {ok:false,reason:'construction_active',message:'Cancel or complete the NPC construction contract before listing this Property'};
  if(activeRentalForClaim(claim)) return {ok:false,reason:'rental_active',message:'End the rental contract before listing this Property'};
  const report=analyzeProperty(claim); if(!propertyCompletion(report)) return {ok:false,reason:'property_incomplete',message:propertyCompletionMessage(report)};
  const premium=Number(premiumPercent); if(!Number.isFinite(premium)||premium<1||premium>100) return {ok:false,reason:'invalid_premium',message:'Premium must be between 1% and 100%'};
  const certifiedValue=Math.max(0,Math.round(Number(report.values.certifiedValue)||0)),askingPrice=Math.max(certifiedValue+1,Math.round(certifiedValue*(1+premium/100))),listingId=`lst_${crypto.randomBytes(8).toString('hex')}`,snapshot=propertySnapshotForListing(claim,report),now=new Date().toISOString();
  const listing={id:listingId,claimId:claim.id,sellerId:client.playerId,sellerName:client.name,status:'active',certifiedValue,premiumPercent:Number(premium.toFixed(2)),askingPrice,commissionRate:MARKET_COMMISSION_RATE,propertySnapshot:snapshot,createdAt:now,updatedAt:now};
  claim.marketListingId=listingId; claim.marketLocked=true; claim.updatedAt=now; world.marketListings.push(listing); saveWorld();
  return {ok:true,listing:marketListingPublic(listing)};
}
function marketListClaim(client,claimId,askingPrice){
  const claim=claimId?world.claims.find(item=>item.id===String(claimId)):playerClaim(client.playerId);
  if(!claim||claim.ownerId!==client.playerId||claim.kind==='npc') return {ok:false,reason:'no_claim',message:'You must own the Claim you want to offer'};
  if(claim.marketLocked||world.marketListings.some(listing=>listing.status==='active'&&listing.claimId===claim.id)) return {ok:false,reason:'already_listed',message:'This Claim already has an active offer'};
  if(constructionJobForClaim(claim)) return {ok:false,reason:'construction_active',message:'Complete or cancel the construction contract before offering this Claim'};
  if(activeRentalForClaim(claim)) return {ok:false,reason:'rental_active',message:'End the rental contract before offering this Claim'};
  const amount=Math.max(1,Math.trunc(Number(askingPrice)||0)); if(!Number.isFinite(amount)||amount<1) return {ok:false,reason:'invalid_amount',message:'Enter a valid positive Coin offer price'};
  const report=analyzeProperty(claim),snapshot=propertySnapshotForListing(claim,report),now=new Date().toISOString(),listingId=`lst_${crypto.randomBytes(8).toString('hex')}`;
  const listing={id:listingId,type:'claim',claimId:claim.id,sellerId:client.playerId,sellerName:client.name,status:'active',certifiedValue:Number(report.values?.certifiedValue||0),premiumPercent:0,askingPrice:amount,commissionRate:MARKET_COMMISSION_RATE,propertySnapshot:snapshot,createdAt:now,updatedAt:now};
  claim.marketListingId=listingId; claim.marketLocked=true; claim.updatedAt=now; world.marketListings.push(listing); saveWorld();
  return {ok:true,listing:marketListingPublic(listing)};
}
function detachBusinessCompanyLink(license){
  const companyId=license?.companyId;
  if(!companyId) return;
  const company=companyForId(companyId);
  if(company) company.businessIds=(company.businessIds||[]).filter(id=>id!==license.id);
  delete license.companyId;
}
function cloneTransferBusinessLicense(license){
  if(!license||typeof license!=='object') return null;
  const copy={...license,recentVisitors:license.recentVisitors&&typeof license.recentVisitors==='object'?{...license.recentVisitors}:{}};
  // A Company is a separate legal owner; its membership/link must not follow
  // a sold Property even though the Business License itself transfers.
  delete copy.companyId;
  return copy;
}
function marketBuyClaim(client,listingId){
  const listing=marketListingById(listingId); if(!listing||listing.type!=='claim') return {ok:false,reason:'listing_not_found',message:'Claim offer is no longer active'};
  if(listing.sellerId===client.playerId) return {ok:false,reason:'own_listing',message:'You cannot buy your own Claim offer'};
  const claim=world.claims.find(item=>item.id===listing.claimId); if(!claim||claim.ownerId!==listing.sellerId||claim.marketListingId!==listing.id||!claim.marketLocked) return {ok:false,reason:'listing_changed',message:'Claim offer changed; refresh the map'};
  const commission=Math.round(listing.askingPrice*MARKET_COMMISSION_RATE),transfer=marketplaceTransferCoins(client.playerId,listing.sellerId,listing.askingPrice,commission,listing.id,claim.id); if(!transfer.ok) return transfer;
  const transferredLicense=cloneTransferBusinessLicense(claim.businessLicense); detachBusinessCompanyLink(claim.businessLicense);
  const oldSellerId=claim.ownerId,now=new Date().toISOString(); claim.ownerId=client.playerId; claim.ownerName=client.name; claim.kind='player'; claim.marketLocked=false; claim.marketListingId=null; claim.members=[]; claim.coOwners=[]; claim.businessLicense=transferredLicense; claim.updatedAt=now;
  listing.status='sold'; listing.buyerId=client.playerId; listing.buyerName=client.name; listing.soldAt=now; listing.commission=commission; listing.sellerNet=transfer.sellerNet; listing.updatedAt=now;
  world.marketHistory.unshift({id:listing.id,claimId:claim.id,sellerId:oldSellerId,sellerName:listing.sellerName,buyerId:client.playerId,buyerName:client.name,askingPrice:listing.askingPrice,certifiedValue:listing.certifiedValue,premiumPercent:0,commission,sellerNet:transfer.sellerNet,escrow:'settled',propertySnapshot:listing.propertySnapshot,completedAt:now}); if(world.marketHistory.length>200)world.marketHistory.length=200; world.revision+=1; saveWorld();
  return {ok:true,listing:marketListingPublic(listing),claim,oldSellerId,buyerWallet:transfer.buyerWallet,sellerWallet:transfer.sellerWallet,commission,sellerNet:transfer.sellerNet};
}

function marketUnlistProperty(client,listingId){
  const listing=marketListingById(listingId),claim=listing?world.claims.find(item=>item.id===listing.claimId):null;
  if(!listing||!claim) return {ok:false,reason:'listing_not_found',message:'Market listing is no longer active'};
  if(listing.sellerId!==client.playerId||claim.ownerId!==client.playerId) return {ok:false,reason:'no_permission',message:'Only the seller can cancel this listing'};
  claim.marketListingId=null; claim.marketLocked=false; claim.updatedAt=new Date().toISOString(); listing.status='cancelled'; listing.cancelledAt=claim.updatedAt; listing.updatedAt=claim.updatedAt; saveWorld();
  return {ok:true,listing:marketListingPublic(listing)};
}
function marketBuyProperty(client,listingId){
  const listing=marketListingById(listingId); if(!listing) return {ok:false,reason:'listing_not_found',message:'Market listing is no longer active'};
  if(listing.sellerId===client.playerId) return {ok:false,reason:'own_listing',message:'You cannot buy your own Property'};
  const claim=world.claims.find(item=>item.id===listing.claimId); if(!claim||claim.ownerId!==listing.sellerId||claim.marketListingId!==listing.id||!claim.marketLocked) return {ok:false,reason:'listing_changed',message:'Property listing changed; refresh the market'};
  const commission=Math.round(listing.askingPrice*MARKET_COMMISSION_RATE),transfer=marketplaceTransferCoins(client.playerId,listing.sellerId,listing.askingPrice,commission,listing.id,claim.id); if(!transfer.ok) return transfer;
  const transferredLicense=cloneTransferBusinessLicense(listing.propertySnapshot?.businessLicense||claim.businessLicense);
  detachBusinessCompanyLink(claim.businessLicense);
  const oldSellerId=claim.ownerId,now=new Date().toISOString(); claim.ownerId=client.playerId; claim.ownerName=client.name; claim.kind='player'; claim.members=[]; claim.coOwners=[]; claim.marketLocked=false; claim.marketListingId=null; claim.businessLicense=transferredLicense; claim.updatedAt=now;
  listing.status='sold'; listing.buyerId=client.playerId; listing.buyerName=client.name; listing.soldAt=now; listing.commission=commission; listing.sellerNet=transfer.sellerNet; listing.updatedAt=now;
  world.marketHistory.unshift({id:listing.id,claimId:claim.id,sellerId:oldSellerId,sellerName:listing.sellerName,buyerId:client.playerId,buyerName:client.name,askingPrice:listing.askingPrice,certifiedValue:listing.certifiedValue,premiumPercent:listing.premiumPercent,commission,sellerNet:transfer.sellerNet,escrow:'settled',propertySnapshot:listing.propertySnapshot,completedAt:now}); if(world.marketHistory.length>200) world.marketHistory.length=200; world.revision+=1; saveWorld();
  return {ok:true,listing:marketListingPublic(listing),claim,propertyId:claim.id,commission,sellerNet:transfer.sellerNet,buyerWallet:transfer.buyerWallet,sellerWallet:transfer.sellerWallet};
}
function businessConfigFor(type){ return BUSINESS_CONFIG[String(type||'').toLowerCase()]||null; }
function businessCoverageClaims(claim){
  if(!claim) return [];
  const ids=Array.isArray(claim.businessLicense?.coverageClaimIds)?claim.businessLicense.coverageClaimIds.map(String):[];
  const ordered=[claim.id,...ids.filter(id=>id!==claim.id)],seen=new Set(),claims=[];
  for(const id of ordered){
    const candidate=world.claims.find(item=>item.id===id&&item.kind!=='npc'&&item.ownerId===claim.ownerId);
    if(candidate&&!seen.has(candidate.id)){seen.add(candidate.id);claims.push(candidate);}
  }
  return claims.length?[...claims]:[claim];
}
function businessCycleProjection(claim){
  const license=claim?.businessLicense,config=businessConfigFor(license?.type); if(!claim||!license||!config) return {coverage:[],capacity:0,npcCustomers:0,gross:0,cost:0,periodMinutes:BUSINESS_TICK_MS/60000};
  const coverage=businessCoverageClaims(claim),staffLevel=Math.max(1,Math.min(10,Math.trunc(Number(license.staffLevel)||1))),advertisingLevel=Math.max(1,Math.min(10,Math.trunc(Number(license.advertisingLevel)||1))),capacity=config.capacity+(staffLevel-1)*2,reputationFactor=.7+Math.max(0,Math.min(100,Number(license.reputation)||0))*.003,advertisingFactor=1+(advertisingLevel-1)*.12;
  const baseCustomers=coverage.reduce((sum,location)=>{const land=landRegistryEntry(location.x+CLAIM_SIZE/2,location.z+CLAIM_SIZE/2),trafficFactor=land.traffic==='High'?1.25:land.traffic==='Medium'?1:.78;return sum+config.npcBase*trafficFactor*Number(land.factors?.demand||1)*reputationFactor;},0);
  const periodMinutes=BUSINESS_TICK_MS/60000,npcCustomers=Math.max(0,Math.min(capacity,Math.round(baseCustomers*advertisingFactor))),gross=Math.max(0,Math.round(npcCustomers*config.npcRate*periodMinutes)),cost=Math.max(0,Math.round((config.maintenance+config.salaries*staffLevel+config.advertising*advertisingLevel)*periodMinutes));
  return {coverage,staffLevel,advertisingLevel,capacity,npcCustomers,gross,cost,periodMinutes};
}
function businessLicensePublic(license){
  if(!license||typeof license!=='object') return null;
  const config=businessConfigFor(license.type)||{};
  return {id:license.id,type:license.type,label:license.label,name:license.name,companyId:license.companyId||null,capacity:config.capacity+(Math.max(1,Math.trunc(Number(license.staffLevel)||1))-1)*2,baseCapacity:config.capacity,playerFee:config.playerFee||0,npcRate:config.npcRate||0,maintenance:config.maintenance||0,salaries:config.salaries||0,advertising:config.advertising||0,staffLevel:Math.max(1,Math.trunc(Number(license.staffLevel)||1)),advertisingLevel:Math.max(1,Math.trunc(Number(license.advertisingLevel)||1)),coverageClaimIds:Array.isArray(license.coverageClaimIds)?license.coverageClaimIds.map(String):[],reputation:license.reputation??50,enabled:license.enabled!==false,registeredAt:license.registeredAt||null,cycleCount:license.cycleCount||0,status:license.suspended?'suspended':license.enabled===false?'disabled':'open'};
}
function businessStatus(license,ownerId){ return license?.enabled===false?'disabled':license?.suspended?'suspended':profileByPlayerId(ownerId)?'open':'owner_offline'; }
function businessSnapshot(claim,viewerId=null){
  const license=claim?.businessLicense,config=businessConfigFor(license?.type); if(!claim||!license||!config) return null;
  const projection=businessCycleProjection(claim),land=landRegistryEntry(claim.x+CLAIM_SIZE/2,claim.z+CLAIM_SIZE/2),demand=Number(land.factors?.demand||1),base=businessLicensePublic(license),privateView=claimCanManage(claim,viewerId),coverage=projection.coverage.map(location=>{const itemLand=landRegistryEntry(location.x+CLAIM_SIZE/2,location.z+CLAIM_SIZE/2);return {claimId:location.id,x:location.x,z:location.z,tier:itemLand.locationTier,biome:itemLand.biome,traffic:itemLand.traffic,demand:itemLand.factors?.demand||1,primary:location.id===claim.id};});
  const upgradeStaffCost=Math.min(100000,Math.max(250,Math.round((500+projection.staffLevel*350)/50)*50)),upgradeAdvertisingCost=Math.min(100000,Math.max(200,Math.round((350+projection.advertisingLevel*250)/50)*50));
  return {...base,claimId:claim.id,ownerId:claim.ownerId,ownerName:claim.ownerName,location:{x:claim.x,z:claim.z},coverage,coverageCount:coverage.length,traffic:land.traffic,demand,biome:land.biome,cycle:{npcCustomers:license.enabled!==false&&!license.suspended?projection.npcCustomers:0,estimatedNpcIncome:license.enabled!==false&&!license.suspended?projection.gross:0,playerVisits:license.playerVisitsThisCycle||0,estimatedPlayerIncome:Math.round((license.playerVisitsThisCycle||0)*config.playerFee),operatingCosts:license.enabled!==false?projection.cost:0},upgrades:{nextStaffCost:upgradeStaffCost,nextAdvertisingCost:upgradeAdvertisingCost},totals:privateView?{npcCustomers:license.totalNpcCustomers||0,playerCustomers:license.totalPlayerCustomers||0,npcIncome:license.totalNpcIncome||0,playerIncome:license.totalPlayerIncome||0,operatingCosts:license.totalOperatingCosts||0,unpaidCosts:license.unpaidCosts||0,netIncome:(license.totalNpcIncome||0)+(license.totalPlayerIncome||0)-(license.totalOperatingCosts||0)}:undefined,wallet:privateView?walletSnapshot(claim.ownerId):undefined,status:businessStatus(license,claim.ownerId)};
}
function businessesPayload(viewerId=null){ return world.claims.filter(claim=>claim.businessLicense).map(claim=>businessSnapshot(claim,viewerId)).filter(Boolean); }

function businessClaimFor(client,claimId){
  const claim=claimId?world.claims.find(item=>item.id===String(claimId)):playerClaim(client.playerId); return claim&&claim.ownerId===client.playerId&&claim.kind!=='npc'?claim:null;
}
function businessRegister(client,claimId,type,name){
  const claim=businessClaimFor(client,claimId),config=businessConfigFor(type); if(!claim) return {ok:false,reason:'no_claim',message:'You must own the Property to register a business'};
  if(claim.marketLocked) return {ok:false,reason:'property_locked',message:'Cancel the market listing before registering a business'};
  if(activeRentalForClaim(claim)) return {ok:false,reason:'rental_active',message:'Register the Business before leasing the Property'};
  if(!config) return {ok:false,reason:'invalid_business_type',message:'Choose Shop, Hotel, Gallery or Workshop'};
  if(claim.businessLicense) return {ok:false,reason:'already_registered',message:'This Property already has a Business License'};
  const report=analyzeProperty(claim); if(!propertyCompletion(report)) return {ok:false,reason:'property_incomplete',message:propertyCompletionMessage(report)};
  const now=new Date().toISOString(),license={id:`lic_${crypto.randomBytes(8).toString('hex')}`,type:config.label.toLowerCase(),label:config.label,name:safeName(name||config.label+' at '+client.name),capacity:config.capacity,advertisingLevel:1,staffLevel:1,coverageClaimIds:[claim.id],reputation:50,enabled:true,suspended:false,registeredAt:now,lastCycleAt:null,cycleCount:0,totalNpcCustomers:0,totalPlayerCustomers:0,totalNpcIncome:0,totalPlayerIncome:0,totalOperatingCosts:0,unpaidCosts:0,playerVisitsThisCycle:0,recentVisitors:{}};
  claim.businessLicense=license; claim.updatedAt=now; saveWorld(); return {ok:true,claim,license:businessSnapshot(claim,client.playerId)};
}
function businessManage(client,claimId,action,payload={}){
  const claim=businessClaimFor(client,claimId),license=claim?.businessLicense,config=businessConfigFor(license?.type);
  if(!claim||!license||!config) return {ok:false,reason:'no_business',message:'You must manage a Business owned by you'};
  const now=new Date().toISOString();
  if(action==='toggle'){
    license.enabled=payload.enabled===undefined?!(license.enabled!==false):!!payload.enabled;
    license.suspended=false; license.updatedAt=now; claim.updatedAt=now; saveWorld(); return {ok:true,claim,business:businessSnapshot(claim,client.playerId)};
  }
  if(action==='assign'){
    const requested=Array.isArray(payload.claimIds)?payload.claimIds.map(id=>String(id)).slice(0,32):[];
    const selected=[claim.id],seen=new Set(selected);
    for(const id of requested){
      if(seen.has(id))continue;
      const candidate=world.claims.find(item=>item.id===id);
      if(!candidate||candidate.kind==='npc'||candidate.ownerId!==client.playerId) return {ok:false,reason:'invalid_territory',message:'Only your own player Claims can be assigned to this Business'};
      if(candidate.marketLocked) return {ok:false,reason:'territory_locked',message:'Unlist the Claim before assigning it to a Business'};
      if(candidate.businessLicense&&candidate.id!==claim.id) return {ok:false,reason:'territory_has_business',message:'A Claim with its own Business cannot be assigned to another Business'};
      selected.push(candidate.id);seen.add(candidate.id);
    }
    license.coverageClaimIds=selected; license.updatedAt=now; claim.updatedAt=now; saveWorld(); return {ok:true,claim,business:businessSnapshot(claim,client.playerId)};
  }
  if(action==='upgrade'){
    const upgrade=payload.upgrade==='advertising'?'advertising':'staff',level=upgrade==='staff'?Math.max(1,Math.trunc(Number(license.staffLevel)||1)):Math.max(1,Math.trunc(Number(license.advertisingLevel)||1)),cost=upgrade==='staff'?Math.min(100000,Math.max(250,Math.round((500+level*350)/50)*50)):Math.min(100000,Math.max(200,Math.round((350+level*250)/50)*50));
    if(level>=10) return {ok:false,reason:'max_level',message:`${upgrade==='staff'?'Staff':'Advertising'} is already at maximum level 10`};
    const payment=commitCoinTransaction({playerId:client.playerId,delta:-cost,type:`business_${upgrade}_upgrade`,reason:`${upgrade==='staff'?'Staff hiring':'Advertising'} upgrade for ${license.name}`,propertyId:claim.id,businessId:license.id});
    if(!payment.ok) return {ok:false,reason:payment.reason,message:`You need ${cost.toLocaleString()} Coin; wallet balance is ${(payment.balance??walletSnapshot(client.playerId).balance).toLocaleString()} Coin`,balance:payment.balance??walletSnapshot(client.playerId).balance};
    if(upgrade==='staff') license.staffLevel=level+1; else license.advertisingLevel=level+1;
    license.updatedAt=now; claim.updatedAt=now; saveWorld(); return {ok:true,claim,business:businessSnapshot(claim,client.playerId),wallet:payment.wallet,upgrade,cost};
  }
  return {ok:false,reason:'invalid_action',message:'Unknown Business management action'};
}

function businessTransferCoins(visitorId,ownerId,amount,businessId,claim=null){
  const visitor=profileByPlayerId(visitorId),owner=profileByPlayerId(ownerId); if(!visitor||!owner)return {ok:false,reason:'player_not_found',message:'Customer or business wallet was not found'};
  if(!visitor.wallet||typeof visitor.wallet!=='object')visitor.wallet={balance:0,updatedAt:null}; if(!owner.wallet||typeof owner.wallet!=='object')owner.wallet={balance:0,updatedAt:null};
  const fee=Math.trunc(Number(amount)),visitorBalance=Math.max(0,Math.floor(Number(visitor.wallet.balance)||0)); if(!Number.isFinite(fee)||fee<=0)return {ok:false,reason:'invalid_amount',message:'Invalid business fee'};
  if(visitorBalance<fee)return {ok:false,reason:'insufficient_funds',message:`You need ${fee.toLocaleString()} Coin for this service; wallet balance is ${visitorBalance.toLocaleString()} Coin`,balance:visitorBalance};
  const recipients=claim?claimShareEntries(claim):[{playerId:ownerId,share:100}],validRecipients=recipients.filter(entry=>profileByPlayerId(entry.playerId)); if(!validRecipients.some(entry=>entry.playerId===ownerId))validRecipients.unshift({playerId:ownerId,share:100});
  const now=new Date().toISOString(),rows=[{id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:visitorId,delta:-fee,balanceAfter:visitorBalance-fee,type:'business_customer_payment',reason:`Customer payment to business ${businessId}`,propertyId:claim?.id||null,businessId,createdAt:now}],balances=new Map(); validRecipients.forEach(entry=>{const profile=profileByPlayerId(entry.playerId);balances.set(entry.playerId,Math.max(0,Math.floor(Number(profile.wallet?.balance)||0)));});
  let allocated=0; const allocationRecipients=validRecipients.filter(entry=>entry.playerId!==ownerId).concat(validRecipients.filter(entry=>entry.playerId===ownerId)); for(const entry of allocationRecipients){const profile=profileByPlayerId(entry.playerId),share=entry.playerId===ownerId?fee-allocated:Math.floor(fee*Math.max(0,Number(entry.share)||0)/100);if(share<=0)continue;allocated+=share;const next=balances.get(entry.playerId)+share;profile.wallet={balance:next,updatedAt:now};rows.push({id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:entry.playerId,delta:share,balanceAfter:next,type:'business_player_income',reason:`Real player income from business ${businessId}`,propertyId:claim?.id||null,businessId,createdAt:now});}
  visitor.wallet={balance:visitorBalance-fee,updatedAt:now};coinLedger.push(...rows);savePlayerProfiles();saveCoinLedger();return {ok:true,fee,visitorWallet:walletSnapshot(visitorId),ownerWallet:walletSnapshot(ownerId),transactions:rows};
}
function commitBusinessIncome(claim,amount,type,reason){
  const total=Math.max(0,Math.trunc(Number(amount)||0));if(!claim||!total)return {ok:true,amount:0};const entries=claimShareEntries(claim),allocationEntries=entries.filter(entry=>entry.playerId!==claim.ownerId).concat(entries.filter(entry=>entry.playerId===claim.ownerId)),results=[];let allocated=0;for(const entry of allocationEntries){const share=entry.playerId===claim.ownerId?total-allocated:Math.floor(total*Math.max(0,Number(entry.share)||0)/100);if(share<=0||!profileByPlayerId(entry.playerId))continue;allocated+=share;const result=commitCoinTransaction({playerId:entry.playerId,delta:share,type,reason,propertyId:claim.id,businessId:claim.businessLicense?.id});if(result.ok)results.push(result);}return {ok:true,amount:total,results};
}
function businessVisit(client,claimId){
  const locationClaim=world.claims.find(item=>item.id===String(claimId||'')),businessClaim=locationClaim?.businessLicense?locationClaim:world.claims.find(item=>item.businessLicense&&businessCoverageClaims(item).some(assigned=>assigned.id===locationClaim?.id)),claim=businessClaim,license=claim?.businessLicense,config=businessConfigFor(license?.type); if(!locationClaim||!claim||!license||!config||license.enabled===false||license.suspended===true) return {ok:false,reason:'business_closed',message:'This business is temporarily suspended because operating costs are unpaid'};
  if(claim.ownerId===client.playerId) return {ok:false,reason:'owner_visit',message:'Owners cannot count themselves as customers'};
  const center={x:locationClaim.x+CLAIM_SIZE/2,y:client.y||0,z:locationClaim.z+CLAIM_SIZE/2}; if((client.x-center.x)**2+(client.z-center.z)**2>24*24) return {ok:false,reason:'too_far',message:'Move closer to the Business Claim before visiting'};
  const now=Date.now(),recent=license.recentVisitors&&Number(license.recentVisitors[client.playerId]||0); if(now-recent<60000) return {ok:false,reason:'visit_cooldown',message:'Visit cooldown is still active'};
  if((license.playerVisitsThisCycle||0)>=Number(license.capacity)||0) return {ok:false,reason:'capacity_reached',message:'This Business has reached its current capacity'};
  const payment=businessTransferCoins(client.playerId,claim.ownerId,config.playerFee,license.id,claim); if(!payment.ok) return payment;
  license.recentVisitors=license.recentVisitors||{}; license.recentVisitors[client.playerId]=now; license.playerVisitsThisCycle=(license.playerVisitsThisCycle||0)+1; license.totalPlayerCustomers=(license.totalPlayerCustomers||0)+1; license.totalPlayerIncome=(license.totalPlayerIncome||0)+config.playerFee; license.reputation=Math.min(100,(Number(license.reputation)||50)+1); claim.updatedAt=new Date().toISOString(); saveWorld(); return {ok:true,claim,fee:config.playerFee,business:businessSnapshot(claim,client.playerId),visitorWallet:payment.visitorWallet,ownerWallet:payment.ownerWallet};
}
function runBusinessCycle(){
  const periodMinutes=BUSINESS_TICK_MS/60000,now=Date.now(),updates=[]; let worldChanged=false;
  for(const claim of world.claims){ const license=claim.businessLicense,config=businessConfigFor(license?.type); if(!license||!config) continue; const owner=profileByPlayerId(claim.ownerId); if(!owner) continue; const projection=businessCycleProjection(claim),npcCustomers=license.enabled!==false&&!license.suspended?projection.npcCustomers:0,gross=license.enabled!==false&&!license.suspended?projection.gross:0,cost=license.enabled!==false?projection.cost:0;
    if(gross>0) commitBusinessIncome(claim,gross,'business_npc_income',`NPC customers for ${license.name}`);
    const paid=cost>0?commitCoinTransaction({playerId:claim.ownerId,delta:-cost,type:'business_operating_cost',reason:`Salary, maintenance and advertising for ${license.name}`,propertyId:claim.id,businessId:license.id}):{ok:true};
    license.suspended=license.enabled!==false&&!paid.ok;
    license.totalNpcCustomers=(license.totalNpcCustomers||0)+npcCustomers; license.totalNpcIncome=(license.totalNpcIncome||0)+gross; license.totalOperatingCosts=(license.totalOperatingCosts||0)+(paid.ok?cost:0); license.unpaidCosts=(license.unpaidCosts||0)+(paid.ok?0:cost); license.playerVisitsThisCycle=0; license.cycleCount=(license.cycleCount||0)+1; license.lastCycleAt=new Date(now).toISOString(); license.reputation=Math.max(0,Math.min(100,(Number(license.reputation)||50)+(paid.ok?1:-2))); if(license.recentVisitors) for(const [id,t] of Object.entries(license.recentVisitors)) if(now-Number(t)>10*60000) delete license.recentVisitors[id]; claim.updatedAt=license.lastCycleAt; worldChanged=true;
    const ownerClient=Array.from(clients.values()).find(client=>client.joined&&client.playerId===claim.ownerId); if(ownerClient){ send(ownerClient.ws,{type:'walletUpdate',wallet:walletSnapshot(claim.ownerId)}); send(ownerClient.ws,{type:'businessUpdate',business:businessSnapshot(claim,claim.ownerId),npcCustomers:gross?npcCustomers:0,grossIncome:gross,operatingCosts:paid.ok?cost:0}); } updates.push({claimId:claim.id,npcCustomers,grossIncome:gross,operatingCosts:paid.ok?cost:0,coverageCount:projection.coverage.length});
  }
  if(worldChanged) saveWorld(); if(updates.length) broadcast({type:'businessCycle',updates});
}
function businessMessageFor(claim,viewerId){ const business=businessSnapshot(claim,viewerId); return business?{type:'businessUpdate',business}:null; }

/* =========================================================
   Phase 10A — NPC construction contracts
   ========================================================= */
function constructionCatalogPayload(){ return NPC_CONSTRUCTION_PLANS.map(plan=>({id:plan.id,name:plan.name,price:plan.price,currency:'Coin',footprint:{...plan.footprint},description:plan.description,roles:['Architect','Builder','Decorator','Inspector']})); }
function constructionJobForClaim(claim){
  if(!claim||!Array.isArray(world.constructionJobs)) return null;
  return world.constructionJobs.find(job=>job.claimId===claim.id&&['queued','active'].includes(job.status))||null;
}
function constructionJobProgress(job){
  const total=Array.isArray(job?.edits)?job.edits.length:0,done=Math.max(0,Math.min(total,Number(job?.nextEditIndex)||0));
  return {done,total,percent:total?Math.round(done/total*100):0};
}
function constructionJobPublic(job,viewerId=null){
  if(!job) return null;
  const progress=constructionJobProgress(job),privateView=viewerId===job.ownerId;
  return {id:job.id,claimId:job.claimId,ownerId:job.ownerId,ownerName:job.ownerName,workshopBusinessId:job.workshopBusinessId,planId:job.planId,planName:job.planName,placement:job.placement?{...job.placement,footprint:job.placement.footprint?{...job.placement.footprint}:undefined}:null,status:job.status,stage:job.stage,role:job.stage==='architect'?'Architect':job.stage==='builder'?'Builder':job.stage==='decorator'?'Decorator':'Inspector',progress,contract:privateView&&job.contract?{...job.contract}:undefined,inspection:job.inspection||null,createdAt:job.createdAt,startedAt:job.startedAt,completedAt:job.completedAt,cancelledAt:job.cancelledAt,cancellationReason:job.cancellationReason||null,updatedAt:job.updatedAt};
}
function constructionJobsPayload(viewerId=null){
  const jobs=Array.isArray(world.constructionJobs)?world.constructionJobs:[];
  return jobs.filter(job=>viewerId?job.ownerId===viewerId:['queued','active'].includes(job.status)).slice(-50).map(job=>constructionJobPublic(job,viewerId));
}
function sendConstructionJobsAll(){
  for(const client of clients.values()) if(client.joined) send(client.ws,{type:'constructionJobs',jobs:constructionJobsPayload(client.playerId)});
}
function constructionClaimFor(client,claimId){
  const claim=world.claims.find(item=>item.id===String(claimId||''));
  if(!claim||claim.ownerId!==client.playerId||claim.kind==='npc') return {ok:false,reason:'no_claim',message:'You must own the workshop Property'};
  if(claim.marketLocked) return {ok:false,reason:'property_locked',message:'Construction is unavailable while the Property is listed for sale'};
  if(activeRentalForClaim(claim)) return {ok:false,reason:'rental_active',message:'Construction is unavailable while the Property is leased'};
  if(constructionJobForClaim(claim)) return {ok:false,reason:'construction_active',message:'This workshop already has an active construction contract'};
  const license=claim.businessLicense,config=businessConfigFor(license?.type);
  if(!license||license.type!=='workshop'||!config) return {ok:false,reason:'workshop_required',message:'An owned Workshop Business License is required for NPC construction'};
  if(license.enabled===false||license.suspended===true) return {ok:false,reason:'business_closed',message:'The Workshop Business must be open before ordering construction'};
  return {ok:true,claim,license,config};
}
function validateConstructionPlacement(client,claim,plan,rawX,rawZ){
  const origin={x:Number(rawX),z:Number(rawZ)}; if(!Number.isInteger(origin.x)||!Number.isInteger(origin.z)) return {ok:false,reason:'invalid_origin',message:'Construction origin must be a whole world coordinate'};
  const footprint=plan.footprint;
  if(origin.x<claim.x||origin.z<claim.z||origin.x+footprint.w>claim.x+CLAIM_SIZE||origin.z+footprint.d>claim.z+CLAIM_SIZE) return {ok:false,reason:'outside_claim',message:'The construction footprint must fit inside the workshop Claim'};
  let minHeight=WORLD_HEIGHT,maxHeight=0;
  for(let dz=0;dz<footprint.d;dz++) for(let dx=0;dx<footprint.w;dx++){
    const terrain=serverMapColumn(origin.x+dx,origin.z+dz); minHeight=Math.min(minHeight,terrain.h); maxHeight=Math.max(maxHeight,terrain.h);
    if(terrain.h<=31||terrain.biome==='river') return {ok:false,reason:'water',message:'NPC construction requires dry land'};
    if(terrain.biome==='mountains') return {ok:false,reason:'mountains',message:'NPC construction cannot use mountain terrain'};
  }
  if(maxHeight-minHeight>4) return {ok:false,reason:'uneven_terrain',message:'The construction footprint is too uneven'};
  if(prefabHasEditedBlocks(origin,footprint)) return {ok:false,reason:'occupied',message:'The construction footprint contains existing building edits'};
  const cabinCache=new Map();
  for(let cx=Math.floor(origin.x/16);cx<=Math.floor((origin.x+footprint.w-1)/16);cx++) for(let cz=Math.floor(origin.z/16);cz<=Math.floor((origin.z+footprint.d-1)/16);cz++) if(serverCabinSpec(cx,cz,cabinCache)) return {ok:false,reason:'landmark',message:'NPC construction cannot overlap a Landmark'};
  const baseY=Math.max(0,minHeight+1); if(baseY+footprint.h>=WORLD_HEIGHT) return {ok:false,reason:'height_limit',message:'The construction exceeds the world height limit'};
  return {ok:true,placement:{planId:plan.id,x:origin.x,z:origin.z,y:baseY,rotation:0,footprint:{...footprint},price:plan.price,currency:'Coin',npcBuilt:true}};
}
function constructionEditList(placement,plan){
  const f=placement.footprint,x=placement.x,z=placement.z,y=placement.y,byKey=new Map();
  const add=(dx,dy,dz,id,role='builder')=>{ if(dx>=0&&dx<f.w&&dz>=0&&dz<f.d&&y+dy>=1&&y+dy<WORLD_HEIGHT) byKey.set(`${x+dx},${y+dy},${z+dz}`,{x:x+dx,y:y+dy,z:z+dz,id,role}); };
  for(let dz=0;dz<f.d;dz++) for(let dx=0;dx<f.w;dx++) add(dx,0,dz,11);
  for(let dy=1;dy<f.h-1;dy++) for(let dz=0;dz<f.d;dz++) for(let dx=0;dx<f.w;dx++) if(dx===0||dx===f.w-1||dz===0||dz===f.d-1) add(dx,dy,dz,11);
  for(let dz=0;dz<f.d;dz++) for(let dx=0;dx<f.w;dx++) add(dx,f.h-1,dz,12);
  const doorX=Math.floor(f.w/2); add(doorX,1,0,44,'decorator');
  if(f.w>=4&&f.d>=4&&f.h>=4){ add(1,2,Math.floor(f.d/2),19,'decorator'); add(f.w-2,2,Math.floor(f.d/2),19,'decorator'); add(Math.floor(f.w/2),1,Math.floor(f.d/2),45,'decorator'); add(Math.max(1,Math.floor(f.w/2)-1),1,Math.max(1,Math.floor(f.d/2)-1),50,'decorator'); }
  return [...byKey.values()];
}
function constructionPreview(client,claimId,planId,x,z){
  const access=constructionClaimFor(client,claimId); if(!access.ok) return access;
  const plan=NPC_CONSTRUCTION_PLANS.find(item=>item.id===String(planId||'')); if(!plan) return {ok:false,reason:'unknown_plan',message:'Construction plan was not found'};
  const placement=validateConstructionPlacement(client,access.claim,plan,x,z); if(!placement.ok) return placement;
  const edits=constructionEditList(placement.placement,plan),builderCount=edits.filter(edit=>edit.role==='builder').length,decoratorCount=edits.length-builderCount;
  return {ok:true,claim:access.claim,license:access.license,plan,placement:placement.placement,edits,contractCost:plan.price,stages:{architect:1,builder:builderCount,decorator:decoratorCount,inspector:1}};
}
function constructionOrder(client,claimId,planId,x,z){
  const preview=constructionPreview(client,claimId,planId,x,z); if(!preview.ok) return preview;
  const activeOwnerJobs=(world.constructionJobs||[]).filter(job=>job.ownerId===client.playerId&&['queued','active'].includes(job.status));
  if(activeOwnerJobs.length>=NPC_CONSTRUCTION_MAX_QUEUE) return {ok:false,reason:'queue_full',message:`You can have at most ${NPC_CONSTRUCTION_MAX_QUEUE} active construction contract(s)`};
  const tx=commitCoinTransaction({playerId:client.playerId,delta:-preview.contractCost,type:'npc_construction_contract',reason:`NPC construction contract: ${preview.plan.name}`,propertyId:preview.claim.id,businessId:preview.license.id});
  if(!tx.ok) return {ok:false,reason:tx.reason,message:`You need ${preview.contractCost.toLocaleString()} Coin for this construction contract; wallet balance is ${(tx.balance??walletSnapshot(client.playerId).balance).toLocaleString()} Coin`,balance:tx.balance??0};
  const now=new Date().toISOString(),job={id:`job_${crypto.randomBytes(8).toString('hex')}`,claimId:preview.claim.id,ownerId:client.playerId,ownerName:client.name,workshopBusinessId:preview.license.id,planId:preview.plan.id,planName:preview.plan.name,placement:preview.placement,edits:preview.edits.map(edit=>({...edit,applied:false})),appliedEdits:[],status:'queued',stage:'architect',nextEditIndex:0,contract:{currency:'Coin',amount:preview.contractCost,paidTransactionId:tx.tx.id,refunded:false},inspection:null,createdAt:now,startedAt:null,completedAt:null,cancelledAt:null,cancellationReason:null,updatedAt:now};
  world.constructionJobs.push(job); if(world.constructionJobs.length>500) world.constructionJobs=world.constructionJobs.slice(-500); saveWorld();
  return {ok:true,job,preview,wallet:tx.wallet};
}
function refundConstructionContract(job,reason){
  if(!job?.contract||job.contract.refunded||!job.contract.amount) return {ok:true,refunded:false};
  const tx=commitCoinTransaction({playerId:job.ownerId,delta:job.contract.amount,type:'npc_construction_refund',reason:`NPC construction contract refund: ${reason||job.planName}`,propertyId:job.claimId,businessId:job.workshopBusinessId});
  if(tx.ok){ job.contract.refunded=true; job.refundTransactionId=tx.tx.id; return {ok:true,refunded:true,wallet:tx.wallet}; }
  return {ok:false,reason:tx.reason,message:'Construction refund could not be credited'};
}
function rollbackConstructionEdits(job){
  let removed=0;
  for(const edit of job.edits||[]){ const key=editKey(edit.x,edit.y,edit.z); if(Number(world.edits[key])===Number(edit.id)){ delete world.edits[key]; world.revision+=1; removed+=1; broadcast({type:'blockUpdate',x:edit.x,y:edit.y,z:edit.z,id:0,revision:world.revision,by:'npc_construction_rollback'}); } }
  job.appliedEdits=[]; job.nextEditIndex=0; (job.edits||[]).forEach(edit=>{edit.applied=false;}); return removed;
}
function constructionCancel(client,jobId){
  const job=(world.constructionJobs||[]).find(item=>item.id===String(jobId||'')); if(!job) return {ok:false,reason:'job_not_found',message:'Construction contract was not found'};
  if(job.ownerId!==client.playerId) return {ok:false,reason:'no_permission',message:'Only the contract owner can cancel construction'};
  if(!['queued','active'].includes(job.status)) return {ok:false,reason:'job_finished',message:'Only queued or active construction contracts can be cancelled'};
  const removed=rollbackConstructionEdits(job),refund=refundConstructionContract(job,'cancelled by owner'),now=new Date().toISOString(); job.status='cancelled'; job.stage='cancelled'; job.cancelledAt=now; job.cancellationReason='Cancelled by owner'; job.updatedAt=now; saveWorld();
  return {ok:true,job,removed,refund,wallet:refund.wallet||walletSnapshot(client.playerId)};
}
function constructionRunCycle(){
  const jobs=Array.isArray(world.constructionJobs)?world.constructionJobs:[],now=new Date().toISOString(); let changed=false;
  for(const job of jobs){
    if(!['queued','active'].includes(job.status)) continue;
    const claim=world.claims.find(item=>item.id===job.claimId),owner=profileByPlayerId(job.ownerId);
    if(!claim||claim.ownerId!==job.ownerId||claim.marketLocked||!owner){
      rollbackConstructionEdits(job); refundConstructionContract(job,'construction could not continue'); job.status='failed'; job.stage='failed'; job.cancellationReason='Property owner or Claim unavailable'; job.updatedAt=now; changed=true; continue;
    }
    if(job.status==='queued'){ job.status='active'; job.stage='builder'; job.startedAt=job.startedAt||now; changed=true; }
    let appliedThisCycle=false,failed=false;
    for(let step=0;step<NPC_CONSTRUCTION_EDITS_PER_TICK;step++){
      const next=job.edits[job.nextEditIndex]; if(!next) break;
      if(next.role==='decorator'&&job.stage==='builder') job.stage='decorator';
      const key=editKey(next.x,next.y,next.z);
      if(world.edits[key]!==undefined&&Number(world.edits[key])!==Number(next.id)){
        rollbackConstructionEdits(job); refundConstructionContract(job,'a player edit occupied the contract footprint'); job.status='failed'; job.stage='failed'; job.cancellationReason='Contract footprint changed'; job.updatedAt=now; changed=true; failed=true; break;
      }
      world.edits[key]=next.id; world.revision+=1; next.applied=true; job.appliedEdits.push(key); job.nextEditIndex+=1; job.updatedAt=now; changed=true; appliedThisCycle=true;
      broadcast({type:'blockUpdate',x:next.x,y:next.y,z:next.z,id:next.id,revision:world.revision,by:'npc_construction'});
    }
    if(failed) continue;
    const ownerClient=Array.from(clients.values()).find(client=>client.joined&&client.playerId===job.ownerId); if(ownerClient&&appliedThisCycle) send(ownerClient.ws,propertyReportMessage(claim));
    if(job.edits[job.nextEditIndex]) continue;
    job.stage='inspector';
    const report=analyzeProperty(claim),passed=!!report&&Number(report.values?.buildingValue||0)>0;
    job.inspection={status:passed?'passed':'failed',certifiedValue:Number(report?.values?.certifiedValue||0),buildingValue:Number(report?.values?.buildingValue||0),inspectedAt:now};
    if(passed){ job.status='completed'; job.completedAt=now; job.updatedAt=now; claim.updatedAt=now; changed=true; }
    else { rollbackConstructionEdits(job); refundConstructionContract(job,'Inspector rejected the completed structure'); job.status='failed'; job.stage='failed'; job.cancellationReason='Inspector rejected the structure'; job.updatedAt=now; changed=true; }
  }
  if(changed){ saveWorld(); sendConstructionJobsAll(); }
}
/* =========================================================
   Phase 10B — rent, companies, co-ownership and Premium auctions
   ========================================================= */
function claimCoOwnerEntries(claim){ return Array.isArray(claim?.coOwners)?claim.coOwners:[]; }
function claimCoOwnerFor(claim,playerId){ return claimCoOwnerEntries(claim).find(item=>item.playerId===String(playerId||''))||null; }
function claimCanManage(claim,playerId){ return !!claim&&(claim.ownerId===String(playerId||'')||!!claimCoOwnerFor(claim,playerId)); }
function claimShareEntries(claim){
  const entries=claimCoOwnerEntries(claim).map(item=>({playerId:item.playerId,share:Math.max(1,Math.min(99,Math.trunc(Number(item.share)||0)))}));
  const total=entries.reduce((sum,item)=>sum+item.share,0); return [{playerId:claim?.ownerId,share:Math.max(1,100-total)},...entries];
}
function coOwnerSet(client,claimId,targetPlayerId,rawShare){
  const claim=world.claims.find(item=>item.id===String(claimId||'')); if(!claim||claim.ownerId!==client.playerId||claim.kind==='npc') return {ok:false,reason:'no_permission',message:'Only the Property owner can manage co-ownership'};
  if(claim.marketLocked||constructionJobForClaim(claim)) return {ok:false,reason:'claim_locked',message:'Co-ownership cannot change while the Property is listed or under construction'};
  const targetId=String(targetPlayerId||'').slice(0,80); if(!targetId||targetId===claim.ownerId) return {ok:false,reason:'invalid_member',message:'Choose another Player as co-owner'};
  const profile=profileByPlayerId(targetId); if(!profile) return {ok:false,reason:'member_not_found',message:'The Player must join the server before becoming a co-owner'};
  const share=Math.trunc(Number(rawShare)||0),index=claimCoOwnerEntries(claim).findIndex(item=>item.playerId===targetId);
  if(share<=0){ if(index>=0) claim.coOwners.splice(index,1); else return {ok:false,reason:'member_not_found',message:'That Player is not a co-owner'}; }
  else if(share>99) return {ok:false,reason:'invalid_share',message:'Co-owner share must be between 1% and 99%'};
  else { const otherTotal=claimCoOwnerEntries(claim).reduce((sum,item,i)=>sum+(i===index?0:Number(item.share)||0),0); if(otherTotal+share>99) return {ok:false,reason:'share_limit',message:'Owner and co-owner shares must total 100% or less'}; const entry={playerId:targetId,name:safeName(profile.name),share,joinedAt:index>=0?claim.coOwners[index].joinedAt:new Date().toISOString()}; if(index>=0) claim.coOwners[index]=entry; else {claim.coOwners=claimCoOwnerEntries(claim);claim.coOwners.push(entry);} }
  claim.updatedAt=new Date().toISOString(); saveWorld(); return {ok:true,claim};
}
function coOwnerRemove(client,claimId,targetPlayerId){ return coOwnerSet(client,claimId,targetPlayerId,0); }
function activeRentalForClaim(claim){ return (world.rentalContracts||[]).find(contract=>contract.claimId===claim?.id&&['active','past_due'].includes(contract.status))||null; }
function rentalOfferForClaim(claim){ return (world.rentalOffers||[]).find(offer=>offer.claimId===claim?.id&&['open','leased'].includes(offer.status))||null; }
function rentalOfferPublic(offer){ return offer?{id:offer.id,claimId:offer.claimId,ownerId:offer.ownerId,ownerName:offer.ownerName,pricePerCycle:offer.pricePerCycle,deposit:offer.deposit,durationCycles:offer.durationCycles,status:offer.status,createdAt:offer.createdAt,updatedAt:offer.updatedAt}:null; }
function rentalContractPublic(contract,viewerId=null){
  if(!contract)return null; const privateView=contract.ownerId===viewerId||contract.tenantId===viewerId;
  return {id:contract.id,offerId:contract.offerId,claimId:contract.claimId,ownerId:contract.ownerId,ownerName:contract.ownerName,tenantId:contract.tenantId,tenantName:contract.tenantName,pricePerCycle:contract.pricePerCycle,deposit:privateView?contract.deposit:undefined,durationCycles:contract.durationCycles,paidCycles:contract.paidCycles,status:contract.status,depositReturned:privateView?contract.depositReturned:undefined,depositHeld:privateView?contract.depositHeld:undefined,startedAt:contract.startedAt,nextDueAt:privateView?contract.nextDueAt:undefined,endsAt:privateView?contract.endsAt:undefined,lastError:privateView?contract.lastError:null,updatedAt:contract.updatedAt};
}
function rentalsPayload(viewerId=null){
  const offers=(world.rentalOffers||[]).filter(offer=>['open','leased'].includes(offer.status)).map(rentalOfferPublic),contracts=(world.rentalContracts||[]).filter(contract=>viewerId?contract.ownerId===viewerId||contract.tenantId===viewerId:['active','past_due'].includes(contract.status)).map(contract=>rentalContractPublic(contract,viewerId));
  return {offers,contracts};
}
function transferRentCoins(tenantId,ownerId,charges,claimId){
  const tenant=profileByPlayerId(tenantId),owner=profileByPlayerId(ownerId); if(!tenant||!owner)return {ok:false,reason:'player_not_found',message:'Tenant or owner wallet was not found'};
  const rowsToCharge=Array.isArray(charges)?charges:[],total=rowsToCharge.reduce((sum,item)=>sum+Math.max(0,Math.trunc(Number(item.amount)||0)),0),tenantBalance=Math.max(0,Math.floor(Number(tenant.wallet?.balance)||0));
  if(!total||tenantBalance<total)return {ok:false,reason:'insufficient_funds',message:`You need ${total.toLocaleString()} Coin; wallet balance is ${tenantBalance.toLocaleString()} Coin`,balance:tenantBalance};
  const now=new Date().toISOString(),ownerBalance=Math.max(0,Math.floor(Number(owner.wallet?.balance)||0)),rows=[],tenantNext=tenantBalance-total; let ownerNext=ownerBalance;
  for(const item of rowsToCharge){const amount=Math.max(0,Math.trunc(Number(item.amount)||0));if(!amount)continue;rows.push({id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:tenantId,delta:-amount,balanceAfter:tenantNext+total-rows.filter(row=>row.playerId===tenantId&&row.delta<0).reduce((sum,row)=>sum+Math.abs(row.delta),0)-amount,type:String(item.type||'rent_payment').slice(0,40),reason:String(item.reason||'Rent payment').slice(0,160),propertyId:claimId,businessId:null,createdAt:now});ownerNext+=amount;rows.push({id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:ownerId,delta:amount,balanceAfter:ownerNext,type:String(item.ownerType||'rent_income').slice(0,40),reason:String(item.ownerReason||'Rental income').slice(0,160),propertyId:claimId,businessId:null,createdAt:now});}
  tenant.wallet={balance:tenantNext,updatedAt:now};owner.wallet={balance:ownerNext,updatedAt:now};coinLedger.push(...rows);savePlayerProfiles();saveCoinLedger();return {ok:true,tenantWallet:walletSnapshot(tenantId),ownerWallet:walletSnapshot(ownerId),transactions:rows};
}
function rentalCreateOffer(client,claimId,pricePerCycle,deposit,durationCycles){
  const claim=world.claims.find(item=>item.id===String(claimId||'')); if(!claim||claim.ownerId!==client.playerId||claim.kind==='npc')return {ok:false,reason:'no_permission',message:'Only the Property owner can create a rental offer'};
  if(claim.marketLocked||constructionJobForClaim(claim)||activeRentalForClaim(claim))return {ok:false,reason:'claim_locked',message:'This Property is locked by a listing, construction contract or active lease'};
  const report=analyzeProperty(claim);if(!propertyCompletion(report))return {ok:false,reason:'property_incomplete',message:propertyCompletionMessage(report)};
  const price=Math.max(1,Math.trunc(Number(pricePerCycle)||0)),security=Math.max(0,Math.trunc(Number(deposit)||0)),duration=Math.max(1,Math.min(RENT_MAX_DURATION_CYCLES,Math.trunc(Number(durationCycles)||1))),existing=(world.rentalOffers||[]).find(offer=>offer.claimId===claim.id&&['open','leased'].includes(offer.status));if(existing)return {ok:false,reason:'offer_exists',message:'This Property already has a rental offer'};
  const now=new Date().toISOString(),offer={id:`rentoffer_${crypto.randomBytes(8).toString('hex')}`,claimId:claim.id,ownerId:client.playerId,ownerName:client.name,pricePerCycle:price,deposit:security,durationCycles:duration,status:'open',createdAt:now,updatedAt:now};world.rentalOffers.push(offer);saveWorld();return {ok:true,offer};
}
function rentalCancelOffer(client,offerId){
  const offer=(world.rentalOffers||[]).find(item=>item.id===String(offerId||''));if(!offer||offer.ownerId!==client.playerId)return {ok:false,reason:'no_permission',message:'Only the rental offer owner can cancel it'};if(offer.status==='leased')return {ok:false,reason:'leased',message:'A leased offer cannot be cancelled; terminate the contract instead'};if(offer.status!=='open')return {ok:false,reason:'offer_closed',message:'Rental offer is already closed'};offer.status='cancelled';offer.updatedAt=new Date().toISOString();saveWorld();return {ok:true,offer};
}
function startRentalTransfer(tenantId,ownerId,rent,deposit,claimId,offerId){
  const tenant=profileByPlayerId(tenantId),owner=profileByPlayerId(ownerId);if(!tenant||!owner)return {ok:false,reason:'player_not_found',message:'Tenant or owner wallet was not found'};
  if(!tenant.wallet||typeof tenant.wallet!=='object')tenant.wallet={balance:0,updatedAt:null};if(!owner.wallet||typeof owner.wallet!=='object')owner.wallet={balance:0,updatedAt:null};
  const rentAmount=Math.max(0,Math.trunc(Number(rent)||0)),depositAmount=Math.max(0,Math.trunc(Number(deposit)||0)),total=rentAmount+depositAmount,balance=Math.max(0,Math.floor(Number(tenant.wallet.balance)||0));if(!total||balance<total)return {ok:false,reason:'insufficient_funds',message:`You need ${total.toLocaleString()} Coin; wallet balance is ${balance.toLocaleString()} Coin`,balance};
  const now=new Date().toISOString(),tenantNext=balance-total,ownerNext=Math.max(0,Math.floor(Number(owner.wallet.balance)||0))+rentAmount,rows=[
    {id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:tenantId,delta:-depositAmount,balanceAfter:balance-depositAmount,type:'rent_deposit_hold',reason:`Security deposit held in escrow for rental ${offerId}`,propertyId:claimId,businessId:null,createdAt:now},
    {id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:tenantId,delta:-rentAmount,balanceAfter:tenantNext,type:'rent_payment',reason:`First rent payment for rental ${offerId}`,propertyId:claimId,businessId:null,createdAt:now},
    {id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:ownerId,delta:rentAmount,balanceAfter:ownerNext,type:'rent_income',reason:`First rent income for rental ${offerId}`,propertyId:claimId,businessId:null,createdAt:now}
  ].filter(row=>row.delta);
  tenant.wallet={balance:tenantNext,updatedAt:now};owner.wallet={balance:ownerNext,updatedAt:now};coinLedger.push(...rows);savePlayerProfiles();saveCoinLedger();return {ok:true,tenantWallet:walletSnapshot(tenantId),ownerWallet:walletSnapshot(ownerId),transactions:rows};
}
function rentalAccept(client,offerId){
  const offer=(world.rentalOffers||[]).find(item=>item.id===String(offerId||'')&&item.status==='open'),claim=offer?world.claims.find(item=>item.id===offer.claimId):null;if(!offer||!claim)return {ok:false,reason:'offer_not_found',message:'Rental offer is no longer available'};if(offer.ownerId===client.playerId)return {ok:false,reason:'owner_tenant',message:'You cannot rent your own Property'};if(claim.marketLocked||constructionJobForClaim(claim)||activeRentalForClaim(claim))return {ok:false,reason:'claim_locked',message:'This Property is no longer available for rent'};
  const total=offer.deposit+offer.pricePerCycle,transfer=startRentalTransfer(client.playerId,offer.ownerId,offer.pricePerCycle,offer.deposit,claim.id,offer.id);if(!transfer.ok)return transfer;
  const now=Date.now(),iso=new Date(now).toISOString(),contract={id:`rent_${crypto.randomBytes(8).toString('hex')}`,offerId:offer.id,claimId:claim.id,ownerId:offer.ownerId,tenantId:client.playerId,ownerName:offer.ownerName,tenantName:client.name,pricePerCycle:offer.pricePerCycle,deposit:offer.deposit,durationCycles:offer.durationCycles,paidCycles:1,status:'active',startedAt:iso,nextDueAt:now+RENT_TICK_MS,endsAt:now+offer.durationCycles*RENT_TICK_MS,depositReturned:false,depositHeld:offer.deposit>0,lastError:null,updatedAt:iso};world.rentalContracts.push(contract);offer.status='leased';offer.updatedAt=iso;saveWorld();return {ok:true,contract,transfer};
}
function returnRentalDeposit(contract,reason){
  if(!contract||contract.depositReturned||!contract.deposit)return {ok:true,refunded:false};
  const tenant=profileByPlayerId(contract.tenantId);if(!tenant)return {ok:false,reason:'player_not_found',message:'Tenant wallet was not found'};
  const tx=commitCoinTransaction({playerId:contract.tenantId,delta:contract.deposit,type:'rent_deposit_refund',reason:`Rental deposit refund: ${reason||'lease ended'}`,propertyId:contract.claimId});
  if(tx.ok){contract.depositReturned=true;contract.depositHeld=false;return {ok:true,refunded:true,transfer:{tenantWallet:tx.wallet,transactions:[tx.tx]}};}return tx;
}
function rentalCancel(client,contractId){
  const contract=(world.rentalContracts||[]).find(item=>item.id===String(contractId||''));if(!contract)return {ok:false,reason:'contract_not_found',message:'Rental contract was not found'};if(contract.ownerId!==client.playerId&&contract.tenantId!==client.playerId)return {ok:false,reason:'no_permission',message:'You are not part of this rental contract'};if(!['active','past_due'].includes(contract.status))return {ok:false,reason:'contract_closed',message:'Rental contract is already closed'};
  const refund=returnRentalDeposit(contract,`cancelled by ${contract.tenantId===client.playerId?'tenant':'owner'}`),now=new Date().toISOString();contract.status=contract.tenantId===client.playerId?'cancelled':'terminated';contract.updatedAt=now;contract.lastError=refund.ok?null:refund.message;const offer=(world.rentalOffers||[]).find(item=>item.id===contract.offerId);if(offer)offer.status='open';saveWorld();return {ok:true,contract,refund,wallet:client.playerId===contract.tenantId?refund.transfer?.tenantWallet:refund.transfer?.ownerWallet||walletSnapshot(client.playerId)};
}
function runRentalCycle(){
  const now=Date.now(),nowIso=new Date(now).toISOString();let changed=false;
  for(const contract of world.rentalContracts||[]){if(!['active','past_due'].includes(contract.status))continue;if(now>=contract.endsAt||contract.paidCycles>=contract.durationCycles){const refund=returnRentalDeposit(contract,'lease completed');contract.status='completed';contract.updatedAt=nowIso;const offer=(world.rentalOffers||[]).find(item=>item.id===contract.offerId);if(offer)offer.status='open';changed=true;continue;}if(now<contract.nextDueAt)continue;const transfer=transferRentCoins(contract.tenantId,contract.ownerId,[{amount:contract.pricePerCycle,type:'rent_payment',ownerType:'rent_income',reason:`Scheduled rent payment for ${contract.id}`,ownerReason:`Scheduled rent income for ${contract.id}`}],contract.claimId);if(transfer.ok){contract.paidCycles+=1;contract.status='active';contract.lastError=null;contract.nextDueAt+=RENT_TICK_MS;contract.updatedAt=nowIso;changed=true;}else{contract.status='past_due';contract.lastError='Tenant Wallet has insufficient Coin for scheduled rent';contract.updatedAt=nowIso;changed=true;}}
  if(changed){saveWorld();sendRentalStateAll();}
}
function rentalContractForTenant(claim,playerId){const contract=activeRentalForClaim(claim);return contract&&contract.tenantId===String(playerId||'')?contract:null;}
function companyForId(id){return (world.companies||[]).find(company=>company.id===String(id||''))||null;}
function companyMembership(company,playerId){return company?.members?.find(member=>member.playerId===String(playerId||''))||null;}
function companyCanManage(company,playerId){const member=companyMembership(company,playerId);return !!member&&(company.ownerId===String(playerId)||member.role==='manager');}
function companyPublic(company,viewerId=null){if(!company)return null;return {id:company.id,name:company.name,ownerId:company.ownerId,ownerName:company.ownerName,members:(company.members||[]).map(member=>({...member})),memberCount:(company.members||[]).length,treasury:company.treasury||0,businessCount:(company.businessIds||[]).length,businessIds:company.ownerId===viewerId?company.businessIds||[]:undefined,isOwner:company.ownerId===viewerId,invited:!!(company.invites||[]).includes(String(viewerId||'')),createdAt:company.createdAt,updatedAt:company.updatedAt};}
function companiesPayload(viewerId=null){return (world.companies||[]).map(company=>companyPublic(company,viewerId));}
function companyCreate(client,name){if((world.companies||[]).some(company=>company.ownerId===client.playerId))return {ok:false,reason:'already_owner',message:'You already own a Company'};const clean=safeName(name||'Company');if(clean.length<2)return {ok:false,reason:'invalid_name',message:'Company name is too short'};const now=new Date().toISOString(),company={id:`co_${crypto.randomBytes(8).toString('hex')}`,name:clean,ownerId:client.playerId,ownerName:client.name,members:[{playerId:client.playerId,name:client.name,role:'owner',joinedAt:now}],invites:[],treasury:0,businessIds:[],createdAt:now,updatedAt:now};world.companies.push(company);saveWorld();return {ok:true,company};}
function companyInvite(client,companyId,targetPlayerId){const company=companyForId(companyId),targetId=String(targetPlayerId||'').slice(0,80);if(!company||!companyCanManage(company,client.playerId))return {ok:false,reason:'no_permission',message:'Only a Company owner or manager can invite Players'};if(!profileByPlayerId(targetId))return {ok:false,reason:'member_not_found',message:'The Player must join the server before receiving an invitation'};if(companyMembership(company,targetId))return {ok:false,reason:'already_member',message:'Player is already a Company member'};if(!company.invites.includes(targetId))company.invites.push(targetId);company.updatedAt=new Date().toISOString();saveWorld();return {ok:true,company};}
function companyJoin(client,companyId){const company=companyForId(companyId);if(!company||!company.invites.includes(client.playerId))return {ok:false,reason:'not_invited',message:'You need a Company invitation first'};if(company.members.length>=COMPANY_MAX_MEMBERS)return {ok:false,reason:'member_limit',message:'Company member limit reached'};company.invites=company.invites.filter(id=>id!==client.playerId);company.members.push({playerId:client.playerId,name:client.name,role:'member',joinedAt:new Date().toISOString()});company.updatedAt=new Date().toISOString();saveWorld();return {ok:true,company};}
function companyLeave(client,companyId){const company=companyForId(companyId);if(!company||!companyMembership(company,client.playerId))return {ok:false,reason:'not_member',message:'You are not a Company member'};if(company.ownerId===client.playerId)return {ok:false,reason:'owner_leave',message:'Transfer Company ownership before leaving'};company.members=company.members.filter(member=>member.playerId!==client.playerId);company.updatedAt=new Date().toISOString();saveWorld();return {ok:true,company};}
function companyAttachBusiness(client,companyId,claimId){const company=companyForId(companyId),claim=world.claims.find(item=>item.id===String(claimId||''));if(!company||!companyCanManage(company,client.playerId)||!claim||claim.ownerId!==client.playerId||!claim.businessLicense)return {ok:false,reason:'no_permission',message:'Only the business owner can attach a Business to the Company'};const oldId=claim.businessLicense.companyId;if(oldId&&oldId!==company.id){const old=companyForId(oldId);if(old)old.businessIds=old.businessIds.filter(id=>id!==claim.businessLicense.id);}claim.businessLicense.companyId=company.id;if(!company.businessIds.includes(claim.businessLicense.id))company.businessIds.push(claim.businessLicense.id);company.updatedAt=new Date().toISOString();claim.updatedAt=company.updatedAt;saveWorld();return {ok:true,company,claim};}
function companyDetachBusiness(client,claimId){const claim=world.claims.find(item=>item.id===String(claimId||'')),company=companyForId(claim?.businessLicense?.companyId);if(!claim||claim.ownerId!==client.playerId||!company)return {ok:false,reason:'no_permission',message:'You do not own a Company-linked Business'};company.businessIds=company.businessIds.filter(id=>id!==claim.businessLicense.id);delete claim.businessLicense.companyId;company.updatedAt=new Date().toISOString();saveWorld();return {ok:true,company,claim};}
function landAuctionPublic(auction,viewerId=null){if(!auction)return null;const ended=auction.status==='open'&&Date.now()>=auction.endsAt;return {id:auction.id,x:auction.x,z:auction.z,size:CLAIM_SIZE,tier:auction.tier,reservePrice:auction.reservePrice,currentBid:auction.currentBid,minNextBid:Math.max(auction.reservePrice,auction.currentBid?auction.currentBid+Math.max(100,Math.ceil(auction.currentBid*.05)):auction.reservePrice),bidderName:auction.bidderName||null,bidderId:auction.bidderId===viewerId?auction.bidderId:null,myBid:auction.bidderId===viewerId?auction.heldAmount:0,status:ended?'ended':auction.status,startsAt:auction.startsAt,endsAt:auction.endsAt,winnerId:auction.winnerId,winnerName:auction.winnerName,claimId:auction.claimId,createdAt:auction.createdAt,updatedAt:auction.updatedAt};}
function landAuctionsPayload(viewerId=null){return (world.landAuctions||[]).map(auction=>landAuctionPublic(auction,viewerId));}
function ensureDefaultLandAuctions(){if(!world||!Array.isArray(world.landAuctions))world.landAuctions=[];const coords=[[128,128],[512,512],[1024,1024]],now=Date.now();for(const [x,z] of coords){if(world.landAuctions.some(auction=>auction.x===x&&auction.z===z&&['open','ended','settled'].includes(auction.status)))continue;if(world.claims.some(claim=>claim.x===x&&claim.z===z))continue;const parcel=landRegistryEntry(x+8,z+8);if(!parcel||parcel.locationTier!=='Premium')continue;const stamp=new Date(now).toISOString();world.landAuctions.push({id:`auction_${crypto.randomBytes(8).toString('hex')}`,x,z,size:CLAIM_SIZE,tier:parcel.locationTier,reservePrice:parcel.price,currentBid:0,bidderId:null,bidderName:null,heldAmount:0,status:'open',startsAt:now,endsAt:now+DEFAULT_LAND_AUCTION_HOURS*3600000,winnerId:null,winnerName:null,claimId:null,createdAt:stamp,updatedAt:stamp});}if(world.landAuctions.length>100)world.landAuctions=world.landAuctions.slice(-100);}
function landAuctionById(id){return (world.landAuctions||[]).find(auction=>auction.id===String(id||''))||null;}
function refundAuctionBid(auction,reason){if(!auction?.bidderId||!auction.heldAmount)return {ok:true};const profile=profileByPlayerId(auction.bidderId);if(!profile)return {ok:false,reason:'player_not_found'};const tx=commitCoinTransaction({playerId:auction.bidderId,delta:auction.heldAmount,type:'land_auction_bid_refund',reason:`Premium land auction refund: ${reason||'outbid'}`,propertyId:null});if(tx.ok){auction.heldAmount=0;auction.bidderId=null;auction.bidderName=null;auction.currentBid=0;}return tx;}
function landAuctionBid(client,auctionId,rawAmount){const auction=landAuctionById(auctionId);if(!auction||auction.status!=='open')return {ok:false,reason:'auction_closed',message:'Land auction is closed'};if(Date.now()>=auction.endsAt)return {ok:false,reason:'auction_ended',message:'Land auction has ended'};if(world.claims.some(claim=>claim.x===auction.x&&claim.z===auction.z))return {ok:false,reason:'parcel_claimed',message:'This Premium Parcel is already claimed'};const amount=Math.trunc(Number(rawAmount)||0),minimum=Math.max(auction.reservePrice,auction.currentBid?auction.currentBid+Math.max(100,Math.ceil(auction.currentBid*.05)):auction.reservePrice);if(amount<minimum)return {ok:false,reason:'bid_too_low',message:`Next bid must be at least ${minimum.toLocaleString()} Coin`};const oldBidder=auction.bidderId,oldAmount=auction.heldAmount,delta=oldBidder===client.playerId?amount-oldAmount:amount,profile=profileByPlayerId(client.playerId),balance=Math.max(0,Math.floor(Number(profile?.wallet?.balance)||0));if(!profile||balance<delta)return {ok:false,reason:'insufficient_funds',message:`You need ${(delta||0).toLocaleString()} Coin for this bid; wallet balance is ${balance.toLocaleString()} Coin`,balance};const now=new Date().toISOString();if(oldBidder&&oldBidder!==client.playerId){const oldProfile=profileByPlayerId(oldBidder);if(oldProfile){oldProfile.wallet={balance:Math.max(0,Math.floor(Number(oldProfile.wallet?.balance)||0))+oldAmount,updatedAt:now};coinLedger.push({id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:oldBidder,delta:oldAmount,balanceAfter:oldProfile.wallet.balance,type:'land_auction_bid_refund',reason:`Outbid on Premium land auction ${auction.id}`,propertyId:null,businessId:null,createdAt:now});}}
  profile.wallet={balance:balance-delta,updatedAt:now};coinLedger.push({id:`tx_${crypto.randomBytes(8).toString('hex')}`,playerId:client.playerId,delta:-delta,balanceAfter:profile.wallet.balance,type:'land_auction_bid_hold',reason:`Bid hold for Premium land auction ${auction.id}`,propertyId:null,businessId:null,createdAt:now});auction.currentBid=amount;auction.bidderId=client.playerId;auction.bidderName=client.name;auction.heldAmount=amount;auction.updatedAt=now;savePlayerProfiles();saveCoinLedger();saveWorld();return {ok:true,auction,wallet:walletSnapshot(client.playerId),refundedPlayerId:oldBidder&&oldBidder!==client.playerId?oldBidder:null,refundedWallet:oldBidder&&oldBidder!==client.playerId?walletSnapshot(oldBidder):null};}
function settleLandAuction(auction){if(!auction||auction.status!=='open'||Date.now()<auction.endsAt)return {ok:false,reason:'not_ended'};const now=new Date().toISOString(),claimExists=world.claims.some(claim=>claim.x===auction.x&&claim.z===auction.z);if(claimExists){refundAuctionBid(auction,'parcel already claimed');auction.status='cancelled';auction.updatedAt=now;return {ok:true,auction};}if(!auction.bidderId){auction.status='ended';auction.updatedAt=now;return {ok:true,auction};}const winner=profileByPlayerId(auction.bidderId);if(!winner){refundAuctionBid(auction,'winner profile unavailable');auction.status='ended';auction.updatedAt=now;return {ok:true,auction};}const claim={id:`cl_${crypto.randomBytes(8).toString('hex')}`,ownerId:auction.bidderId,ownerName:auction.bidderName||winner.name,kind:'player',npcPropertyId:null,marketListingId:null,marketLocked:false,businessLicense:null,x:auction.x,z:auction.z,size:CLAIM_SIZE,members:[],coOwners:[],createdAt:now,updatedAt:now};world.claims.push(claim);auction.status='settled';auction.winnerId=auction.bidderId;auction.winnerName=auction.bidderName;auction.claimId=claim.id;auction.updatedAt=now;saveWorld();return {ok:true,auction,claim};}
function runLandAuctionCycle(){let changed=false;for(const auction of world.landAuctions||[]){if(auction.status==='open'&&Date.now()>=auction.endsAt){settleLandAuction(auction);changed=true;}}if(changed){saveWorld();sendAuctionStateAll();sendClaimsStateAll();}}
function sendRentalStateAll(){for(const client of clients.values())if(client.joined){send(client.ws,{type:'rentals',currency:'Coin',offers:rentalsPayload(client.playerId).offers,contracts:rentalsPayload(client.playerId).contracts});send(client.ws,{type:'walletUpdate',wallet:walletSnapshot(client.playerId)});}}
function sendCompanyStateAll(){for(const client of clients.values())if(client.joined)send(client.ws,{type:'companies',companies:companiesPayload(client.playerId)});}
function sendAuctionStateAll(){for(const client of clients.values())if(client.joined)send(client.ws,{type:'landAuctions',currency:'Coin',auctions:landAuctionsPayload(client.playerId)});}
function sendClaimsStateAll(){broadcast({type:'claims',claims:claimsSummary()});}
function serverEnemyGroundAt(x,z){
  const bx=Math.floor(x), bz=Math.floor(z);
  for(let r=0;r<=3;r++) for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
    const top=serverWalkHeight(bx+dx+.5,bz+dz+.5);
    if(top!==null) return {x:bx+dx+.5,z:bz+dz+.5,y:top+1.02};
  }
  return {x,z,y:serverTopAt(x,z)+1.02};
}
function serverEnemyPath(entity,target){
  const sx=Math.floor(entity.x),sz=Math.floor(entity.z),gx=Math.floor(target.x),gz=Math.floor(target.z),startTop=serverTopAt(sx,sz);
  if(Math.abs(gx-sx)>64||Math.abs(gz-sz)>64) return [];
  const minX=Math.min(sx,gx)-8,maxX=Math.max(sx,gx)+8,minZ=Math.min(sz,gz)-8,maxZ=Math.max(sz,gz)+8;
  const key=(x,z)=>x+','+z, startKey=key(sx,sz), goalKey=key(gx,gz), open=[{x:sx,z:sz,g:0,f:Math.hypot(gx-sx,gz-sz)}], came=new Map(), best=new Map([[startKey,0]]), closed=new Set();
  let found=null, guard=0;
  while(open.length&&guard++<5000){
    open.sort((a,b)=>a.f-b.f); const current=open.shift(), ck=current.x+','+current.z;
    if(closed.has(ck)) continue; closed.add(ck);
    if(ck===goalKey){found=current;break;}
    const currentTop=serverTopAt(current.x,current.z);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=current.x+dx,nz=current.z+dz,nk=key(nx,nz); if(nx<minX||nx>maxX||nz<minZ||nz>maxZ||closed.has(nk)) continue;
      const nt=serverWalkHeight(nx,nz); if(nt===null||Math.abs(nt-currentTop)>1) continue;
      const ng=current.g+1+(nt!==currentTop ? .35 : 0), old=best.get(nk); if(old!==undefined&&ng>=old) continue;
      best.set(nk,ng); came.set(nk,ck); open.push({x:nx,z:nz,g:ng,f:ng+Math.hypot(gx-nx,gz-nz)});
    }
  }
  if(!found) return [];
  const cells=[]; let cursor=goalKey; while(cursor!==startKey){ const [x,z]=cursor.split(',').map(Number); cells.push({x:x+.5,z:z+.5,y:serverTopAt(x,z)+1.02}); cursor=came.get(cursor); if(!cursor) return []; }
  cells.reverse(); return cells;
}
function serverHasLineOfSight(entity,target){
  const ax=entity.x,ay=entity.y+1.35,az=entity.z,bx=target.x,by=target.y+1.25,bz=target.z,dist=Math.hypot(bx-ax,by-ay,bz-az),steps=Math.ceil(dist*8);
  for(let i=1;i<steps;i++){ const t=i/steps; if(serverSolidAt(ax+(bx-ax)*t,ay+(by-ay)*t,az+(bz-az)*t)) return false; }
  return true;
}
function joinedClients(){ return Array.from(clients.values()).filter(client=>client.joined); }
function updateAmbientEntities(dt){
  const activePlayers=joinedClients();
  if(!activePlayers.length){ entities.clear(); return; }
  const night=isNight();
  for(const [id,entity] of entities){
    if((entity.type==='ghost'&&!night)||(entity.type!=='ghost'&&night&&entity.age>12)){ entities.delete(id); continue; }
    entity.age+=dt; entity.attackCooldown=Math.max(0,(entity.attackCooldown||0)-dt);
    const target=nearestPlayer(entity);
    if(entity.type==='ghost'){
      if(target){
        if((entity.pathTimer||0)<=0){ entity.path=serverEnemyPath(entity,target); entity.pathTimer=.45; }
        entity.pathTimer-=dt;
        const waypoint=entity.path&&entity.path[0];
        if(waypoint){
          const currentTop=serverWalkHeight(entity.x,entity.z), nextTop=serverWalkHeight(waypoint.x,waypoint.z);
          // Never turn a path into a fall: only one-block steps are allowed and
          // a missing floor cancels the current route instead of free-falling.
          if(currentTop===null||nextTop===null||nextTop<currentTop-1||nextTop>currentTop+1){
            entity.path=[]; entity.pathTimer=.08;
          }else{
            const dx=waypoint.x-entity.x,dz=waypoint.z-entity.z,len=Math.hypot(dx,dz)||1,speed=1.18,step=Math.min(len,speed*dt);
            const nx=entity.x+dx/len*step,nz=entity.z+dz/len*step,under=serverWalkHeight(nx,nz);
            if(under===null||under<currentTop-1||under>currentTop+1){ entity.path=[]; entity.pathTimer=.08; }
            else { entity.x=nx; entity.z=nz; entity.y=under+1.02; entity.yaw=Math.atan2(dx,dz); if(len<.18) entity.path.shift(); }
          }
        }
        const attackDistance=Math.hypot(target.x-entity.x,target.z-entity.z);
        if(attackDistance<1.85 && Math.abs((target.y||0)-entity.y)<2.3 && entity.attackCooldown<=0 && target.health>0 && serverHasLineOfSight(entity,target)){
          const damage=8+Math.floor(Math.random()*5);
          target.health=Math.max(0,target.health-damage); entity.attackCooldown=1.35;
          send(target.ws,{type:'damage',amount:damage,health:target.health,maxHealth:100,source:'ghost'});
          if(target.health<=0){
            target.health=100; target.spawn=target.spawn||allocateSpawnSlot(target.identityKey,target.playerId); target.x=target.spawn.x; target.y=target.spawn.y; target.z=target.spawn.z; target.yaw=0; target.pitch=0;
            send(target.ws,{type:'respawn',x:target.x,y:target.y,z:target.z,health:100,reason:'defeated_by_ghost'});
          }
        }
      }
    }else if(entity.age>entity.changeAt){
      const a=Math.random()*Math.PI*2,speed=0.25+Math.random()*.5;
      entity.vx=Math.cos(a)*speed; entity.vz=Math.sin(a)*speed; entity.yaw=a; entity.changeAt=entity.age+1.5+Math.random()*4;
    }
    entity.x+=entity.vx*dt; entity.z+=entity.vz*dt;
    const nearby=nearestPlayer(entity);
    if(!nearby || (nearby.x-entity.x)**2+(nearby.z-entity.z)**2>150*150) entities.delete(id);
  }
  const desired=Math.min(18,Math.max(4,activePlayers.length*4));
  while(entities.size<desired){
    const anchor=activePlayers[Math.floor(Math.random()*activePlayers.length)], a=Math.random()*Math.PI*2, r=18+Math.random()*34;
    const type=night ? (Math.random()<0.58?'ghost':'bat') : ['cow','pig','sheep','chicken','rabbit'][Math.floor(Math.random()*5)];
    const id=`e_${++entitySequence}`;
    const ex=anchor.x+Math.cos(a)*r, ez=anchor.z+Math.sin(a)*r, ground=type==='ghost'?serverEnemyGroundAt(ex,ez):null;
    entities.set(id,{id,type,hostile:type==='ghost',x:ground?.x??ex,y:ground?.y??anchor.y,z:ground?.z??ez,yaw:a,phase:Math.random()*Math.PI*2,age:0,changeAt:1+Math.random()*3,attackCooldown:0,path:[],pathTimer:0,vx:0,vz:0});
  }
  broadcast({type:'entities',entities:Array.from(entities.values(),entitySummary)});
}

function worldState(forClient=null) {
  return {
    type: 'worldState',
    world: {
      id: world.id,
      name: world.name,
      seed: world.seed,
      mode: world.mode,
      dayTime: world.dayTime,
      spawn: world.spawn,
      playerSpawn: forClient?.spawn || null,
      spawnArea: spawnAreaSummary(),
      claim: forClient?.playerId ? claimDetails(playerClaim(forClient.playerId),forClient.playerId) : null,
      claims: claimsSummary(),
      npcProperties: world.npcProperties.map(property=>({id:property.id,claimId:property.claimId,ownerName:property.ownerName||'NPC Buyback',x:property.land?.x||0,z:property.land?.z||0,certifiedValue:property.certifiedValue||0,soldAt:property.soldAt||null})),
      marketListings: marketListingsPayload(),
      constructionJobs: constructionJobsPayload(forClient?.playerId||null),
      constructionCatalog: constructionCatalogPayload(),
      rentals: rentalsPayload(forClient?.playerId||null),
      companies: companiesPayload(forClient?.playerId||null),
      landAuctions: landAuctionsPayload(forClient?.playerId||null),
      landRegistry: {parcelSize:PARCEL_SIZE,basePrice:BASE_LAND_PRICE,currency:'Coin'},
      revision: world.revision,
      physics: PHYSICS_CONFIG,
      edits: world.edits,
      doors: world.doors,
      lights: world.lights
    }
  };
}

function sendPlayers() {
  broadcast({ type: 'players', players: allPlayers() });
}

function editKey(x, y, z) {
  return `${x},${y},${z}`;
}

function validBlockEdit(client, x, y, z) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return false;
  if (y < 1 || y >= WORLD_HEIGHT) return false;
  if (distanceSquared(client, { x: x + 0.5, y: y + 0.5, z: z + 0.5 }) > 8.5 * 8.5) return false;
  return true;
}

function serverPlayerCollides(px,py,pz){
  const half=PHYSICS_CONFIG.player.halfWidth,height=PHYSICS_CONFIG.player.height;
  const x0=Math.floor(px-half),x1=Math.floor(px+half),y0=Math.floor(py),y1=Math.floor(py+height-.001),z0=Math.floor(pz-half),z1=Math.floor(pz+half);
  for(let y=y0;y<=y1;y++) for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++) if(serverSolidAt(x,y,z)) return true;
  return false;
}
function serverMotionPathClear(ax,ay,az,bx,by,bz){
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay),Math.abs(bz-az))/.12));
  for(let step=1;step<=steps;step++){
    const t=step/steps;
    if(serverPlayerCollides(ax+(bx-ax)*t,ay+(by-ay)*t,az+(bz-az)*t)) return false;
  }
  return true;
}
function serverPlayerInWater(px,py,pz){
  const x=Math.floor(px),z=Math.floor(pz),feet=serverBlockIdAt(x,Math.floor(py+.2),z),eye=serverBlockIdAt(x,Math.floor(py+1.62),z);
  return feet===20||eye===20;
}
function serverPlayerGrounded(px,py,pz){
  if(serverPlayerCollides(px,py,pz)) return false;
  return serverPlayerCollides(px,py-.08,pz);
}
function serverAutoStepPathClear(client,nx,ny,nz){
  const stepHeight=PHYSICS_CONFIG.player.stepHeight,raisedY=client.y+stepHeight;
  if(serverPlayerCollides(client.x,raisedY,client.z)) return false;
  if(!serverMotionPathClear(client.x,raisedY,client.z,nx,raisedY,nz)) return false;
  // The final descent is deliberately bounded by STEP_HEIGHT. This accepts a
  // one-block stair/step but not a client-side teleport down a cliff.
  if(ny<client.y||ny>raisedY+.001){
    if(Math.abs(ny-client.y)>stepHeight+.08) return false;
  }
  return serverMotionPathClear(nx,raisedY,nz,nx,ny,nz);
}
function serverPlayerMotionValid(client,nx,ny,nz,now,motion={}){
  if(![nx,ny,nz].every(Number.isFinite)||ny<-20||ny>MAX_FLIGHT_HEIGHT) return false;
  const elapsed=Math.max(.05,Math.min(.8,(now-(client.lastStateAt||now))/1000));
  const isCreative=client.mode==='creative',isFlying=isCreative&&motion.fly===true;
  if(motion.fly===true&&!isCreative) return false;
  const startInWater=serverPlayerInWater(client.x,client.y,client.z),inWater=serverPlayerInWater(nx,ny,nz);
  const wasGrounded=serverPlayerGrounded(client.x,client.y,client.z),requestedAutoStep=motion.autoStep===true;
  // A step is committed locally in one frame. Allow a tiny server/client
  // grounding discrepancy while that explicit step marker is active, but
  // still derive support from the authoritative voxel map rather than
  // trusting the client's onGround bit.
  const stepGrounded=wasGrounded || (requestedAutoStep && serverPlayerGrounded(client.x,client.y+0.08,client.z));
  const jumpEdge=motion.jump===true&&client.jump!==true;
  const movement=PHYSICS_CONFIG.movement;
  const maxSpeed=isFlying?movement.flightSpeed:(inWater?movement.waterSpeed:(motion.sprint===true?movement.sprintSpeed:movement.walkSpeed));
  const maxDistance=maxSpeed*elapsed+1.15;
  const dx=nx-client.x,dy=ny-client.y,dz=nz-client.z,dist=Math.hypot(dx,dy,dz);
  if(dist>maxDistance) return false;
  // A jump impulse may only begin while grounded (or while swimming). The
  // reported jump/onGround bits are state hints; the server derives the
  // actual support voxel before accepting the impulse.
  if(jumpEdge&&!isFlying&&!startInWater&&!stepGrounded) return false;
  if(!isFlying&&!inWater&&dy>0.62&&!stepGrounded&&!startInWater) return false;

  const directPathClear=serverMotionPathClear(client.x,client.y,client.z,nx,ny,nz);
  if(directPathClear) return true;
  if(!isFlying&&stepGrounded&&!startInWater&&PHYSICS_CONFIG.movement.autoStep&&serverAutoStepPathClear(client,nx,ny,nz)) return true;
  return false;
}

function rejectPermission(ws,x,y,z,access) {
  send(ws,{type:'permissionRejected',reason:access.reason||'no_permission',x,y,z,message:access.reason==='claim_required'?'Build, Break and private Use require a Claim':access.reason==='property_locked'?'Property is locked while listed on the market':access.reason==='construction_locked'?'Claim is locked while an NPC construction contract is active':'You do not have permission for this Claim'});
}

function commitEdit(client, x, y, z, id, oldId = null) {
  const key = editKey(x, y, z),currentId=serverBlockIdAt(x,y,z);
  if(oldId!==null&&currentId!==Number(oldId)){
    send(client.ws,{type:'editRejected',reason:'block_changed',x,y,z});
    return false;
  }
  if(id===0){
    if(currentId===0){ send(client.ws,{type:'editRejected',reason:'block_not_found',x,y,z}); return false; }
    if(currentId===22){ send(client.ws,{type:'editRejected',reason:'unbreakable_block',x,y,z}); return false; }
  }else if(currentId!==0&&currentId!==20&&currentId!==21){
    send(client.ws,{type:'editRejected',reason:'block_occupied',x,y,z});
    return false;
  }
  world.edits[key] = id;
  world.revision += 1;
  dirtyMapLocations.add(`${x},${z}`);
  broadcast({ type: 'blockUpdate', x, y, z, id, revision: world.revision, by: client.id });
  const editedClaim=world.claims.find(claim=>claimContainsPoint(claim,x+.5,z+.5));
  if(editedClaim){
    const ownerClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===editedClaim.ownerId);
    if(ownerClient) send(ownerClient.ws,propertyReportMessage(editedClaim));
  }
  return true;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  // Never accept the admin credential in a URL: URLs can be stored in proxy
  // logs, browser history and Referer headers. The panel sends this header.
  return req.headers['x-admin-token'] === ADMIN_TOKEN;
}

function json(res, status, data, headers = {}) {
  const text = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(text);
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function worldSummary(record){
  return {id:record.id,name:record.name,seed:record.seed,mode:record.mode,dayTime:record.dayTime,revision:record.revision,edits:Object.keys(record.edits).length,claims:Array.isArray(record.claims)?record.claims.length:0,savedAt:record.savedAt,active:record.id===activeWorldId};
}
function listWorlds(){ return Array.from(worlds.values(),worldSummary).sort((a,b)=>a.name.localeCompare(b.name)); }
function switchActiveWorld(id){
  const safeId=safeWorldId(id), next=worlds.get(safeId);
  if(!next) return false;
  if(world.id!==next.id) saveWorld();
  activeWorldId=next.id; world=next; ensureDefaultLandAuctions(); entities.clear();
  bakeMasterMapCache(true);
  for(const client of clients.values()){
    client.mode=world.mode;
    client.fly=false;
    if(client.joined){ client.spawn=allocateSpawnSlot(client.identityKey,client.playerId); client.x=client.spawn.x; client.y=client.spawn.y; client.z=client.spawn.z; }
    send(client.ws,{type:'serverWorldChanged',worldId:world.id});
    send(client.ws,worldState(client));
  }
  sendPlayers();
  log('Active world changed to',world.id,world.name);
  return true;
}
function createRandomWorld(payload={}){
  const requestedId=safeWorldId(payload.id||payload.name||`world-${Date.now()}`);
  let id=requestedId, suffix=2;
  while(worlds.has(id)) id=`${requestedId}-${suffix++}`;
  const seed=Number.isFinite(Number(payload.seed))?Number(payload.seed)|0:(Math.random()*0x7fffffff)|0;
  const record=makeWorld(id,{name:safeName(payload.name||id),seed,mode:payload.mode==='survival'?'survival':'creative'});
  worlds.set(id,record); saveWorldRecord(record);
  return record;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/healthz') return json(res, 200, { ok: true });
  if (url.pathname === '/api/map' && req.method === 'GET') {
    return json(res, 200, serverMapRaster(url));
  }
  if (url.pathname === '/api/land/quote' && req.method === 'GET') {
    const x=Number(url.searchParams.get('x')),z=Number(url.searchParams.get('z'));
    if(!Number.isFinite(x)||!Number.isFinite(z)) return json(res,400,{error:'Valid x and z are required'});
    return json(res,200,{ok:true,parcel:landRegistryEntry(x,z)});
  }
  if (url.pathname === '/api/store/catalog' && req.method === 'GET') {
    return json(res,200,{ok:true,currency:'Coin',prefabs:prefabCatalogPayload(),allPaid:true});
  }
  if (url.pathname === '/api/property/analyze' && req.method === 'GET') {
    const claim=analyzerClaimFor(url.searchParams.get('claimId'),url.searchParams.get('x'),url.searchParams.get('z'));
    if(!claim) return json(res,404,{ok:false,reason:'claim_not_found',message:'Claim was not found'});
    return json(res,200,{ok:true,report:analyzeProperty(claim)});
  }
  if (url.pathname === '/api/wallet' && req.method === 'GET') {
    const playerId=String(url.searchParams.get('playerId')||'');
    if(!profileByPlayerId(playerId)) return json(res,404,{ok:false,reason:'player_not_found',message:'Player wallet was not found'});
    return json(res,200,{ok:true,wallet:walletSnapshot(playerId)});
  }
  if (url.pathname === '/api/market/listings' && req.method === 'GET') {
    return json(res,200,{ok:true,currency:'Coin',commissionRate:MARKET_COMMISSION_RATE,listings:marketListingsPayload()});
  }
  if (url.pathname === '/api/market/history' && req.method === 'GET') {
    const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||20));
    return json(res,200,{ok:true,currency:'Coin',history:world.marketHistory.slice(0,limit).map(item=>({...item,propertySnapshot:undefined}))});
  }
  if (url.pathname === '/api/businesses' && req.method === 'GET') {
    return json(res,200,{ok:true,currency:'Coin',businesses:businessesPayload()});
  }
  if (url.pathname === '/api/construction/catalog' && req.method === 'GET') {
    return json(res,200,{ok:true,currency:'Coin',plans:constructionCatalogPayload(),roles:['Architect','Builder','Decorator','Inspector']});
  }
  if (url.pathname === '/api/construction/jobs' && req.method === 'GET') {
    return json(res,200,{ok:true,currency:'Coin',jobs:constructionJobsPayload()});
  }
  if (url.pathname === '/api/rentals' && req.method === 'GET') {
    const viewerId=String(url.searchParams.get('playerId')||'')||null;
    return json(res,200,{ok:true,currency:'Coin',...rentalsPayload(viewerId)});
  }
  if (url.pathname === '/api/companies' && req.method === 'GET') {
    const viewerId=String(url.searchParams.get('playerId')||'')||null;
    return json(res,200,{ok:true,currency:'Coin',companies:companiesPayload(viewerId)});
  }
  if (url.pathname === '/api/land/auctions' && req.method === 'GET') {
    const viewerId=String(url.searchParams.get('playerId')||'')||null;
    return json(res,200,{ok:true,currency:'Coin',auctions:landAuctionsPayload(viewerId)});
  }
  if (url.pathname.startsWith('/api/phase10b/') && req.method === 'POST') {
    try {
      const body=await parseBody(req);
      const authKey=`http:${req.socket.remoteAddress||'unknown'}`;
      if(!allowAuthAttempt(authKey)) return json(res,429,{ok:false,reason:'rate_limited',message:'Too many authentication attempts; try again later'});
      const authenticated=authenticateApiPlayer(body);
      if(!authenticated) return json(res,401,{ok:false,reason:'authentication_required',message:'Username and Password are required; playerId alone is not accepted'});
      const actor={...authenticated,x:Number.isFinite(Number(body.x))?Number(body.x):world.spawn.x,z:Number.isFinite(Number(body.z))?Number(body.z):world.spawn.z,y:Number.isFinite(Number(body.y))?Number(body.y):50};
      let result;
      switch(url.pathname){
        case '/api/phase10b/rentals/offer': result=rentalCreateOffer(actor,body.claimId,body.pricePerCycle,body.deposit,body.durationCycles); break;
        case '/api/phase10b/rentals/offer/cancel': result=rentalCancelOffer(actor,body.offerId); break;
        case '/api/phase10b/rentals/accept': result=rentalAccept(actor,body.offerId); break;
        case '/api/phase10b/rentals/cancel': result=rentalCancel(actor,body.contractId); break;
        case '/api/phase10b/company/create': result=companyCreate(actor,body.name); break;
        case '/api/phase10b/company/invite': result=companyInvite(actor,body.companyId,body.targetPlayerId); break;
        case '/api/phase10b/company/join': result=companyJoin(actor,body.companyId); break;
        case '/api/phase10b/company/leave': result=companyLeave(actor,body.companyId); break;
        case '/api/phase10b/company/attach': result=companyAttachBusiness(actor,body.companyId,body.claimId); break;
        case '/api/phase10b/company/detach': result=companyDetachBusiness(actor,body.claimId); break;
        case '/api/phase10b/co-owner/set': result=coOwnerSet(actor,body.claimId,body.targetPlayerId,body.share); break;
        case '/api/phase10b/co-owner/remove': result=coOwnerRemove(actor,body.claimId,body.targetPlayerId); break;
        case '/api/phase10b/auction/bid': result=landAuctionBid(actor,body.auctionId,body.amount); break;
        case '/api/phase10b/auction/settle': result=settleLandAuction(landAuctionById(body.auctionId)); break;
        default: return json(res,404,{ok:false,reason:'unknown_endpoint'});
      }
      if(!result?.ok) return json(res,400,result||{ok:false,reason:'action_failed'});
      if(url.pathname.includes('/rentals/')){sendRentalStateAll();sendClaimsStateAll();}
      if(url.pathname.includes('/company/')){sendCompanyStateAll();broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});}
      if(url.pathname.includes('/co-owner/'))sendClaimsStateAll();
      if(url.pathname.includes('/auction/')){sendAuctionStateAll();sendClaimsStateAll();}
      return json(res,200,{ok:true,...result,wallet:walletSnapshot(actor.playerId),rentals:rentalsPayload(actor.playerId),companies:companiesPayload(actor.playerId),auctions:landAuctionsPayload(actor.playerId)});
    } catch(error){ return json(res,400,{ok:false,reason:'invalid_request',message:error.message||'Invalid request'}); }
  }

  if (url.pathname === '/api/status' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      server: 'VoxelCraft Server',
      uptime: process.uptime(),
      players: clients.size,
      maxPlayers: MAX_PLAYERS,
      physics: PHYSICS_CONFIG,
      activeWorldId,
      worlds: listWorlds(),
      world: {
        id: world.id,
        name: world.name,
        seed: world.seed,
        mode: world.mode,
        dayTime: world.dayTime,
        revision: world.revision,
        edits: Object.keys(world.edits).length,
        claims: world.claims.length,
        savedAt: world.savedAt
      }
    });
  }

  if (!url.pathname.startsWith('/api/admin/')) return false;
  if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' });

  if (url.pathname === '/api/admin/worlds' && req.method === 'GET') {
    return json(res, 200, { activeWorldId, worlds: listWorlds() });
  }
  if (url.pathname === '/api/admin/players' && req.method === 'GET') {
    return json(res, 200, { players: allPlayers() });
  }
  if (url.pathname === '/api/admin/world/create' && req.method === 'POST') {
    try {
      const body=await parseBody(req), record=createRandomWorld(body);
      if(body.activate!==false) switchActiveWorld(record.id);
      return json(res, 200, {ok:true,world:worldSummary(record),activeWorldId});
    } catch(error){ return json(res,400,{error:error.message||'Could not create world'}); }
  }
  if (url.pathname === '/api/admin/world/select' && req.method === 'POST') {
    try {
      const body=await parseBody(req);
      if(!switchActiveWorld(body.id)) return json(res,404,{error:'World not found'});
      return json(res,200,{ok:true,activeWorldId,world:worldSummary(world)});
    } catch(error){ return json(res,400,{error:error.message||'Could not select world'}); }
  }
  if (url.pathname === '/api/admin/world' && req.method === 'GET') {
    return json(res, 200, worldState().world);
  }
  if (url.pathname === '/api/admin/world/download' && req.method === 'GET') {
    return json(res, 200, { ...world, downloadedAt: new Date().toISOString() }, {
      'Content-Disposition': 'attachment; filename="voxelcraft-main.json"'
    });
  }
  if (url.pathname === '/api/admin/world/upload' && req.method === 'POST') {
    try {
      const payload = await parseBody(req);
      backupWorld();
      importWorldPayload(payload);
      const ok = saveWorld();
      if (ok) {
        broadcast(worldState());
        broadcast({ type: 'system', message: 'World was replaced from an administrator JSON file' });
      }
      return json(res, ok ? 200 : 500, { ok, edits: Object.keys(world.edits).length, seed: world.seed });
    } catch (error) {
      return json(res, 400, { error: error.message || 'Invalid world file' });
    }
  }
  if (url.pathname === '/api/admin/world/save' && req.method === 'POST') {
    const ok = saveWorld();
    return json(res, ok ? 200 : 500, { ok });
  }
  if (url.pathname === '/api/admin/world/time' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      world.dayTime = ((number(body.dayTime, world.dayTime) % 1) + 1) % 1;
      broadcast({ type: 'worldTime', dayTime: world.dayTime });
      return json(res, 200, { ok: true, dayTime: world.dayTime });
    } catch (error) {
      return json(res, 400, { error: 'Invalid JSON' });
    }
  }
  if (url.pathname === '/api/admin/world/mode' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (body.mode !== 'creative' && body.mode !== 'survival') return json(res, 400, { error: 'Invalid mode' });
      world.mode = body.mode;
      for (const client of clients.values()) {
        client.mode = world.mode;
        if(world.mode!=='creative') client.fly=false;
        send(client.ws, { type: 'serverMode', mode: world.mode, physics:PHYSICS_CONFIG });
      }
      sendPlayers();
      return json(res, 200, { ok: true, mode: world.mode });
    } catch (error) {
      return json(res, 400, { error: 'Invalid JSON' });
    }
  }
  if (url.pathname === '/api/admin/players/kick' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const client = clients.get(String(body.id));
      if (!client) return json(res, 404, { error: 'Player not found' });
      send(client.ws, { type: 'kicked', reason: 'Removed by administrator' });
      client.ws.close(4003, 'Kicked by administrator');
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 400, { error: 'Invalid JSON' });
    }
  }
  return json(res, 404, { error: 'Unknown admin endpoint' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    const handled = await handleApi(req, res, url);
    if (handled !== false) return;
  } catch (error) {
    log('HTTP error:', error.message);
    return json(res, 500, { error: 'Internal server error' });
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return serveFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html; charset=utf-8');
  }
  if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin/index.html') {
    return serveFile(res, path.join(__dirname, 'admin', 'index.html'), 'text/html; charset=utf-8');
  }
  if (url.pathname === '/api/status') return json(res, 404, { error: 'Not found' });
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws, req) => {
  if (clients.size >= MAX_PLAYERS) {
    send(ws, { type: 'error', code: 'server_full', message: 'Server is full' });
    ws.close(4004, 'Server full');
    return;
  }

  const id = `p_${crypto.randomBytes(5).toString('hex')}`;
  const client = {
    ws,
    id,
    playerId: null,
    username: null,
    identityKey: null,
    spawn: null,
    name: 'Player',
    x: world.spawn.x,
    y: 50,
    z: world.spawn.z,
    yaw: 0,
    pitch: 0,
    mode: world.mode,
    fly: false,
    sprint: false,
    inWater: false,
    onGround: false,
    jump: false,
    selectedBlock: 1,
    health:100,
    connectedAt: new Date().toISOString(),
    joined: false,
    lastInputAt: 0,
    lastStateAt: 0
  };
  clients.set(id, client);

  send(ws, {
    type: 'hello',
    server: 'VoxelCraft Server',
    version: 1,
    playerId: null,
    sessionId: id,
    maxPlayers: MAX_PLAYERS,
    physics: PHYSICS_CONFIG
  });

  ws.on('message', raw => {
    if (raw.length > 64 * 1024) return;
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', code: 'bad_json', message: 'Invalid message' }); }
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'join') {
      // First login requires Username + Password. A later visit may use the
      // signed remembered-session token issued after that successful login;
      // the password is never stored in the browser.
      const authKey=`ws:${req.socket.remoteAddress||'unknown'}`;
      if(!allowAuthAttempt(authKey)) return send(ws,{type:'authRejected',reason:'rate_limited',message:'Too many authentication attempts; try again later'});
      let auth=message.sessionToken?authenticateRememberedSession(message.username,message.sessionToken):{ok:false};
      if(!auth.ok) auth=authenticateAccount(message.username,message.password,message.name);
      if(!auth.ok) return send(ws,{type:'authRejected',reason:auth.reason,message:auth.message});
      if(Array.from(clients.values()).some(other=>other!==client&&other.joined&&other.username===auth.account.username)){
        return send(ws,{type:'authRejected',reason:'account_in_use',message:'This account is already connected'});
      }
      const resolved=accountProfile(auth.account,message.name||auth.account.name);
      client.username=auth.account.username;
      client.name=resolved.profile.name;
      client.playerId=resolved.profile.id;
      if(playerClaim(client.playerId)&&!resolved.profile.hasClaimedFree){ resolved.profile.hasClaimedFree=true; savePlayerProfiles(); }
      client.identityKey=resolved.identityKey;
      client.spawn=allocateSpawnSlot(client.identityKey,client.playerId);
      client.x=client.spawn.x; client.y=client.spawn.y; client.z=client.spawn.z;
      client.fly=false; client.sprint=false; client.inWater=false; client.onGround=false; client.jump=false; client.lastStateAt=Date.now();
      client.joined = true;
      client.mode = world.mode;
      send(ws, { type: 'joined', playerId: client.playerId, username:client.username, name: client.name, accountCreated:auth.created, sessionToken:issueRememberedSession(auth.account), freeClaimAvailable:resolved.profile.hasClaimedFree!==true, health:client.health, maxHealth:100, spawn:client.spawn, spawnArea:spawnAreaSummary(), physics:PHYSICS_CONFIG, claim:claimDetails(playerClaim(client.playerId),client.playerId), claims:claimsSummary() });
      send(ws,{type:'storeCatalog',currency:'Coin',prefabs:prefabCatalogPayload(),allPaid:true});
      send(ws,propertyReportMessage(playerClaim(client.playerId)));
      send(ws,{type:'walletUpdate',wallet:walletSnapshot(client.playerId)});
      send(ws,{type:'marketListings',currency:'Coin',commissionRate:MARKET_COMMISSION_RATE,listings:marketListingsPayload()});
      send(ws,{type:'businesses',currency:'Coin',businesses:businessesPayload(client.playerId)});
      send(ws,{type:'constructionCatalog',currency:'Coin',plans:constructionCatalogPayload(),roles:['Architect','Builder','Decorator','Inspector']});
      send(ws,{type:'constructionJobs',currency:'Coin',jobs:constructionJobsPayload(client.playerId)});
      send(ws, worldState(client));
      send(ws, { type: 'players', players: allPlayers() });
      broadcast({ type: 'system', message: `${client.name} joined the world` }, id);
      sendPlayers();
      log(client.name, 'joined from', req.socket.remoteAddress, 'spawn', client.spawn.x, client.spawn.z);
      return;
    }

    if (!client.joined) return send(ws, { type: 'error', code: 'not_joined', message: 'Join a world first' });

function purchaseNpcClaim(client,result){
  const claim=result.occupiedClaim,price=Math.max(0,Math.trunc(Number(result.price)||0));
  if(!claim||claim.kind!=='npc') return {ok:false,reason:'claim_changed',message:'NPC Claim is no longer available'};
  const payment=commitCoinTransaction({playerId:client.playerId,delta:-price,type:'claim_npc_purchase',reason:`NPC Property Claim purchase: ${price.toLocaleString()} Coin`,propertyId:claim.id});
  if(!payment.ok) return {ok:false,reason:payment.reason,message:claimReasonText(payment.reason||'insufficient_funds'),balance:payment.balance??walletSnapshot(client.playerId).balance};
  const oldNpcId=claim.npcPropertyId,record=npcPropertyRecordForClaim(claim),now=new Date().toISOString();
  claim.ownerId=client.playerId; claim.ownerName=client.name; claim.kind='player'; claim.npcPropertyId=null; claim.marketListingId=null; claim.marketLocked=false; claim.members=[]; claim.coOwners=[]; claim.updatedAt=now;
  if(record){ record.status='purchased'; record.purchasedBy=client.playerId; record.purchasedByName=client.name; record.purchasedAt=now; record.currentClaimId=claim.id; }
  const profile=profileByPlayerId(client.playerId); if(profile&&!profile.hasClaimedFree) profile.hasClaimedFree=true;
  savePlayerProfiles(); saveWorld();
  return {ok:true,claim,price,wallet:payment.wallet||walletSnapshot(client.playerId),oldNpcId,breakdown:result.acquisition?.breakdown||null};
}

    if (message.type === 'claimPreview' || message.type === 'claimConfirm') {
      const result=validateClaimRequest(client.playerId,Number(message.x),Number(message.z));
      if(message.type==='claimPreview'){
        const acquisition=result.acquisition||null;
        return send(ws,{type:'claimPreview',ok:result.ok,price:result.price||0,currency:'Coin',land:result.land||null,quote:result.ok?landRegistryEntry((result.claim?.x||0)+CLAIM_SIZE/2,(result.claim?.z||0)+CLAIM_SIZE/2):null,claim:result.claim||null,acquisition,reason:result.reason||null,message:result.ok?(acquisition?.kind==='player_offer'?`Buy this player Claim · ${result.price.toLocaleString()} Coin · seller consented`:acquisition?.kind==='npc_property'?`Buy NPC Property Claim · ${result.price.toLocaleString()} Coin · Land + Building + Objects`:result.price>0?`Buy Claim · ${result.price.toLocaleString()} Coin · 16×16`:'Free first Claim · 16×16'):claimReasonText(result.reason)});
      }
      if(!result.ok) return send(ws,{type:'claimRejected',reason:result.reason,message:claimReasonText(result.reason),acquisition:result.acquisition||null});
      if(result.acquisition?.kind==='player_offer'){
        const listing=marketListingById(result.acquisition.listingId),bought=listing?.type==='claim'?marketBuyClaim(client,result.acquisition.listingId):marketBuyProperty(client,result.acquisition.listingId);
        if(!bought.ok) return send(ws,{type:'claimRejected',reason:bought.reason,message:bought.message||'Claim purchase rejected',balance:bought.balance??walletSnapshot(client.playerId).balance});
        send(ws,{type:'claimGranted',claim:claimDetails(bought.claim,client.playerId),claims:claimsSummary(),price:bought.listing.askingPrice,purchaseType:'player_offer',breakdown:result.acquisition.breakdown,wallet:bought.buyerWallet});
        send(ws,{type:'walletUpdate',wallet:bought.buyerWallet}); send(ws,propertyReportMessage(bought.claim));
        const sellerClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===(bought.oldSellerId||bought.listing?.sellerId));
        if(sellerClient) send(sellerClient.ws,{type:'walletUpdate',wallet:bought.sellerWallet}),send(sellerClient.ws,{type:'propertySoldToPlayer',listing:bought.listing,payout:bought.sellerNet,commission:bought.commission,wallet:bought.sellerWallet});
        broadcast({type:'claims',claims:claimsSummary()}); broadcast({type:'marketListings',currency:'Coin',commissionRate:MARKET_COMMISSION_RATE,listings:marketListingsPayload()}); broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()}); sendCompanyStateAll();
        return;
      }
      if(result.acquisition?.kind==='npc_property'){
        const bought=purchaseNpcClaim(client,result);
        if(!bought.ok) return send(ws,{type:'claimRejected',reason:bought.reason,message:bought.message||'NPC Claim purchase rejected',balance:bought.balance??walletSnapshot(client.playerId).balance});
        send(ws,{type:'claimGranted',claim:claimDetails(bought.claim,client.playerId),claims:claimsSummary(),price:bought.price,purchaseType:'npc_property',breakdown:bought.breakdown,wallet:bought.wallet});
        send(ws,{type:'walletUpdate',wallet:bought.wallet}); send(ws,propertyReportMessage(bought.claim));
        broadcast({type:'claims',claims:claimsSummary()}); broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});
        return;
      }
      const now=new Date().toISOString(),claim={id:`cl_${crypto.randomBytes(8).toString('hex')}`,ownerId:client.playerId,ownerName:client.name,x:result.claim.x,z:result.claim.z,size:CLAIM_SIZE,members:[],coOwners:[],createdAt:now,updatedAt:now};
      // WebSocket message handling is serialized by Node; this check and insert are atomic.
      if(world.claims.some(other=>claimOverlaps(claim,other))) return send(ws,{type:'claimRejected',reason:'claim_occupied',message:claimReasonText('claim_occupied')});
      const payment=result.price>0?commitCoinTransaction({playerId:client.playerId,delta:-result.price,type:'claim_purchase',reason:`Claim purchase: ${result.land?.locationTier||'Ordinary'} 16×16 Parcel`,propertyId:claim.id}):{ok:true,wallet:walletSnapshot(client.playerId)};
      if(!payment.ok) return send(ws,{type:'claimRejected',reason:payment.reason||'insufficient_funds',message:claimReasonText(payment.reason||'insufficient_funds'),wallet:walletSnapshot(client.playerId)});
      world.claims.push(claim);
      const claimOwnerProfile=profileByPlayerId(client.playerId); if(claimOwnerProfile) claimOwnerProfile.hasClaimedFree=true;
      savePlayerProfiles(); saveWorld();
      send(ws,{type:'claimGranted',claim:claimDetails(claim,client.playerId),claims:claimsSummary(),price:result.price,purchaseType:'land',breakdown:result.acquisition?.breakdown||null,wallet:payment.wallet||walletSnapshot(client.playerId)});
      send(ws,{type:'walletUpdate',wallet:payment.wallet||walletSnapshot(client.playerId)});
      send(ws,propertyReportMessage(claim));
      broadcast({type:'claims',claims:claimsSummary()});
      return;
    }

    if(message.type==='claimPermissionSet'){
      const requestedClaimId=String(message.claimId||'');
      const claim=requestedClaimId?world.claims.find(item=>item.id===requestedClaimId):playerClaim(client.playerId);
      if(claim&& (claim.ownerId!==client.playerId||claim.kind==='npc')) return send(ws,{type:'claimPermissionRejected',reason:'no_permission',message:'Only the Property owner can manage permissions'});
      if(!claim) return send(ws,{type:'claimPermissionRejected',reason:'no_claim',message:'Create or buy a Claim first'});
      if(claim.marketLocked) return send(ws,{type:'claimPermissionRejected',reason:'property_locked',message:'Claim permissions are locked while the Property is listed'});
      const targetPlayerId=String(message.targetPlayerId||'').slice(0,80);
      if(!targetPlayerId||targetPlayerId===client.playerId) return send(ws,{type:'claimPermissionRejected',reason:'invalid_member',message:'Choose another Player ID'});
      const targetClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===targetPlayerId);
      const knownProfile=Array.from(playerProfiles.values()).find(profile=>profile.id===targetPlayerId);
      if(!targetClient&&!knownProfile) return send(ws,{type:'claimPermissionRejected',reason:'member_not_found',message:'Player must have joined this server before being added'});
      const build=!!message.build,use=!!message.use;
      const index=(claim.members||[]).findIndex(member=>member.playerId===targetPlayerId);
      if(!build&&!use){ if(index>=0) claim.members.splice(index,1); }
      else { const member={playerId:targetPlayerId,name:safeName(targetClient?.name||knownProfile?.name||'Player'),build,use}; if(index>=0) claim.members[index]=member; else if((claim.members||[]).length<64) claim.members.push(member); else return send(ws,{type:'claimPermissionRejected',reason:'member_limit',message:'Claim member limit reached'}); }
      claim.updatedAt=new Date().toISOString(); saveWorld();
      send(ws,{type:'claimPermissionResult',claim:claimDetails(claim,client.playerId),claims:claimsSummary()});
      if(targetClient) send(targetClient.ws,{type:'claimPermissionChanged',claimId:claim.id,ownerId:client.playerId,build,use});
      return;
    }

    if(message.type==='storeCatalog') return send(ws,{type:'storeCatalog',currency:'Coin',prefabs:prefabCatalogPayload(),allPaid:true});

    if(message.type==='walletSnapshot') return send(ws,{type:'walletUpdate',wallet:walletSnapshot(client.playerId)});
    if(message.type==='marketListings') return send(ws,{type:'marketListings',currency:'Coin',commissionRate:MARKET_COMMISSION_RATE,listings:marketListingsPayload()});
    if(message.type==='businesses') return send(ws,{type:'businesses',currency:'Coin',businesses:businessesPayload(client.playerId)});
    if(message.type==='constructionCatalog') return send(ws,{type:'constructionCatalog',currency:'Coin',plans:constructionCatalogPayload(),roles:['Architect','Builder','Decorator','Inspector']});
    if(message.type==='constructionJobs') return send(ws,{type:'constructionJobs',currency:'Coin',jobs:constructionJobsPayload(client.playerId)});
    if(message.type==='constructionPreview'){
      const preview=constructionPreview(client,message.claimId,message.planId,Number(message.x),Number(message.z));
      if(!preview.ok) return send(ws,{type:'constructionPreview',ok:false,reason:preview.reason,message:preview.message});
      return send(ws,{type:'constructionPreview',ok:true,claimId:preview.claim.id,planId:preview.plan.id,plan:{id:preview.plan.id,name:preview.plan.name,price:preview.plan.price,footprint:preview.plan.footprint},placement:preview.placement,edits:preview.edits.length,stages:preview.stages,contractCost:preview.contractCost});
    }
    if(message.type==='constructionOrder'){
      const ordered=constructionOrder(client,message.claimId,message.planId,Number(message.x),Number(message.z));
      if(!ordered.ok) return send(ws,{type:'constructionOrderRejected',reason:ordered.reason,message:ordered.message,balance:ordered.balance??walletSnapshot(client.playerId).balance});
      send(ws,{type:'constructionOrdered',job:constructionJobPublic(ordered.job,client.playerId),wallet:ordered.wallet,preview:{placement:ordered.preview.placement,contractCost:ordered.preview.contractCost}});
      send(ws,{type:'walletUpdate',wallet:ordered.wallet}); sendConstructionJobsAll(); return;
    }
    if(message.type==='constructionCancel'){
      const cancelled=constructionCancel(client,message.jobId);
      if(!cancelled.ok) return send(ws,{type:'constructionCancelRejected',reason:cancelled.reason,message:cancelled.message});
      send(ws,{type:'constructionCancelled',job:constructionJobPublic(cancelled.job,client.playerId),removed:cancelled.removed,wallet:cancelled.wallet});
      send(ws,{type:'walletUpdate',wallet:cancelled.wallet}); sendConstructionJobsAll(); return;
    }

    if(message.type==='rentals') return send(ws,{type:'rentals',currency:'Coin',...rentalsPayload(client.playerId)});
    if(message.type==='rentalOfferCreate'){
      const created=rentalCreateOffer(client,message.claimId,message.pricePerCycle,message.deposit,message.durationCycles);
      if(!created.ok) return send(ws,{type:'rentalOfferRejected',reason:created.reason,message:created.message});
      send(ws,{type:'rentalOfferCreated',offer:rentalOfferPublic(created.offer)});sendRentalStateAll();return;
    }
    if(message.type==='rentalOfferCancel'){
      const cancelled=rentalCancelOffer(client,message.offerId);
      if(!cancelled.ok) return send(ws,{type:'rentalOfferCancelRejected',reason:cancelled.reason,message:cancelled.message});
      send(ws,{type:'rentalOfferCancelled',offer:rentalOfferPublic(cancelled.offer)});sendRentalStateAll();return;
    }
    if(message.type==='rentalAccept'){
      const accepted=rentalAccept(client,message.offerId);
      if(!accepted.ok) return send(ws,{type:'rentalAcceptRejected',reason:accepted.reason,message:accepted.message,balance:accepted.balance??walletSnapshot(client.playerId).balance});
      send(ws,{type:'walletUpdate',wallet:accepted.transfer.tenantWallet});send(ws,{type:'rentalAccepted',contract:rentalContractPublic(accepted.contract,client.playerId),wallet:accepted.transfer.tenantWallet});
      const ownerClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===accepted.contract.ownerId);if(ownerClient)send(ownerClient.ws,{type:'walletUpdate',wallet:accepted.transfer.ownerWallet});sendRentalStateAll();return;
    }
    if(message.type==='rentalCancel'){
      const cancelled=rentalCancel(client,message.contractId);
      if(!cancelled.ok) return send(ws,{type:'rentalCancelRejected',reason:cancelled.reason,message:cancelled.message});
      send(ws,{type:'rentalCancelled',contract:rentalContractPublic(cancelled.contract,client.playerId),refund:cancelled.refund,wallet:cancelled.wallet});if(cancelled.refund?.transfer){const otherId=cancelled.contract.ownerId===client.playerId?cancelled.contract.tenantId:cancelled.contract.ownerId;const otherClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===otherId);if(otherClient)send(otherClient.ws,{type:'walletUpdate',wallet:cancelled.contract.ownerId===client.playerId?cancelled.refund.transfer.tenantWallet:walletSnapshot(otherId)});}sendRentalStateAll();return;
    }
    if(message.type==='companies') return send(ws,{type:'companies',companies:companiesPayload(client.playerId)});
    if(message.type==='companyCreate'){
      const created=companyCreate(client,message.name);if(!created.ok)return send(ws,{type:'companyActionRejected',action:message.type,reason:created.reason,message:created.message});send(ws,{type:'companyCreated',company:companyPublic(created.company,client.playerId)});sendCompanyStateAll();return;
    }
    if(message.type==='companyInvite'){
      const result=companyInvite(client,message.companyId,message.targetPlayerId);if(!result.ok)return send(ws,{type:'companyActionRejected',action:message.type,reason:result.reason,message:result.message});send(ws,{type:'companyInviteSent',company:companyPublic(result.company,client.playerId),targetPlayerId:String(message.targetPlayerId||'')});const targetClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===String(message.targetPlayerId||''));if(targetClient)send(targetClient.ws,{type:'companyInvite',company:companyPublic(result.company,targetClient.playerId)});sendCompanyStateAll();return;
    }
    if(message.type==='companyJoin'){
      const result=companyJoin(client,message.companyId);if(!result.ok)return send(ws,{type:'companyActionRejected',action:message.type,reason:result.reason,message:result.message});send(ws,{type:'companyJoined',company:companyPublic(result.company,client.playerId)});sendCompanyStateAll();return;
    }
    if(message.type==='companyLeave'){
      const result=companyLeave(client,message.companyId);if(!result.ok)return send(ws,{type:'companyActionRejected',action:message.type,reason:result.reason,message:result.message});send(ws,{type:'companyLeft',company:companyPublic(result.company,client.playerId)});sendCompanyStateAll();return;
    }
    if(message.type==='companyAttachBusiness'){
      const result=companyAttachBusiness(client,message.companyId,message.claimId);if(!result.ok)return send(ws,{type:'companyActionRejected',action:message.type,reason:result.reason,message:result.message});send(ws,{type:'companyBusinessAttached',company:companyPublic(result.company,client.playerId),claim:claimDetails(result.claim,client.playerId)});sendCompanyStateAll();broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});return;
    }
    if(message.type==='companyDetachBusiness'){
      const result=companyDetachBusiness(client,message.claimId);if(!result.ok)return send(ws,{type:'companyActionRejected',action:message.type,reason:result.reason,message:result.message});send(ws,{type:'companyBusinessDetached',company:companyPublic(result.company,client.playerId),claim:claimDetails(result.claim,client.playerId)});sendCompanyStateAll();broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});return;
    }
    if(message.type==='coOwnerSet' || message.type==='coOwnerRemove'){
      const result=message.type==='coOwnerSet'?coOwnerSet(client,message.claimId,message.targetPlayerId,message.share):coOwnerRemove(client,message.claimId,message.targetPlayerId);if(!result.ok)return send(ws,{type:'coOwnerActionRejected',action:message.type,reason:result.reason,message:result.message});send(ws,{type:'coOwnerUpdated',claim:claimDetails(result.claim,client.playerId),claims:claimsSummary()});sendClaimsStateAll();return;
    }
    if(message.type==='landAuctions') return send(ws,{type:'landAuctions',currency:'Coin',auctions:landAuctionsPayload(client.playerId)});
    if(message.type==='landAuctionBid'){
      const result=landAuctionBid(client,message.auctionId,message.amount);if(!result.ok)return send(ws,{type:'landAuctionBidRejected',reason:result.reason,message:result.message,balance:result.balance??walletSnapshot(client.playerId).balance});send(ws,{type:'walletUpdate',wallet:result.wallet});if(result.refundedPlayerId){const outbidClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===result.refundedPlayerId);if(outbidClient)send(outbidClient.ws,{type:'walletUpdate',wallet:result.refundedWallet});}send(ws,{type:'landAuctionBidAccepted',auction:landAuctionPublic(result.auction,client.playerId),wallet:result.wallet});sendAuctionStateAll();return;
    }
    if(message.type==='landAuctionSettle'){
      const result=settleLandAuction(landAuctionById(message.auctionId));if(!result.ok)return send(ws,{type:'landAuctionSettleRejected',reason:result.reason,message:'Auction is not ready to settle'});send(ws,{type:'landAuctionSettled',auction:landAuctionPublic(result.auction,client.playerId),claim:result.claim?claimDetails(result.claim,client.playerId):null});sendAuctionStateAll();sendClaimsStateAll();if(result.claim&&result.claim.ownerId===client.playerId){send(ws,{type:'walletUpdate',wallet:walletSnapshot(client.playerId)});send(ws,propertyReportMessage(result.claim));}return;
    }

    if(message.type==='businessManage'){
      const managed=businessManage(client,message.claimId,message.action||'toggle',{enabled:message.enabled,claimIds:message.claimIds,upgrade:message.upgrade});
      if(!managed.ok) return send(ws,{type:'businessManageRejected',reason:managed.reason,message:managed.message,balance:managed.balance??walletSnapshot(client.playerId).balance});
      if(managed.wallet) send(ws,{type:'walletUpdate',wallet:managed.wallet});
      send(ws,{type:'businessManaged',business:managed.business,claim:claimDetails(managed.claim,client.playerId),upgrade:managed.upgrade||null,cost:managed.cost||0,wallet:managed.wallet||walletSnapshot(client.playerId)});
      broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});
      return;
    }
    if(message.type==='businessRegister'){
      const registered=businessRegister(client,message.claimId,message.businessType||message.typeName,message.name);
      if(!registered.ok) return send(ws,{type:'businessRegisterRejected',reason:registered.reason,message:registered.message});
      send(ws,{type:'businessRegistered',business:registered.license,claim:claimDetails(registered.claim,client.playerId)});
      broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});
      return;
    }
    if(message.type==='businessVisit'){
      const visit=businessVisit(client,message.claimId);
      if(!visit.ok) return send(ws,{type:'businessVisitRejected',reason:visit.reason,message:visit.message,balance:visit.balance??walletSnapshot(client.playerId).balance});
      send(ws,{type:'walletUpdate',wallet:visit.visitorWallet});
      send(ws,{type:'businessVisitAccepted',business:businessSnapshot(visit.claim,client.playerId),fee:visit.fee,wallet:visit.visitorWallet});
      const ownerClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===visit.claim.ownerId);
      if(ownerClient){ send(ownerClient.ws,{type:'walletUpdate',wallet:visit.ownerWallet}); send(ownerClient.ws,{type:'businessUpdate',business:businessSnapshot(visit.claim,visit.claim.ownerId)}); }
      broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});
      return;
    }

    if(message.type==='claimList'){
      const listed=marketListClaim(client,message.claimId,Number(message.askingPrice));
      if(!listed.ok) return send(ws,{type:'claimListRejected',reason:listed.reason,message:listed.message});
      send(ws,{type:'claimListed',listing:listed.listing});
      broadcast({type:'claims',claims:claimsSummary()}); broadcast({type:'marketListings',currency:'Coin',commissionRate:MARKET_COMMISSION_RATE,listings:marketListingsPayload()});
      return;
    }
    if(message.type==='propertyList'){
      const listed=marketListProperty(client,message.claimId,Number(message.premiumPercent));
      if(!listed.ok) return send(ws,{type:'propertyListRejected',reason:listed.reason,message:listed.message});
      send(ws,{type:'propertyListed',listing:listed.listing,commissionRate:MARKET_COMMISSION_RATE});
      send(ws,propertyReportMessage(world.claims.find(item=>item.id===listed.listing.claimId)||playerClaim(client.playerId)));
      broadcast({type:'marketListings',currency:'Coin',commissionRate:MARKET_COMMISSION_RATE,listings:marketListingsPayload()});
      return;
    }
    if(message.type==='propertyUnlist'){
      const unlisted=marketUnlistProperty(client,message.listingId);
      if(!unlisted.ok) return send(ws,{type:'propertyUnlistRejected',reason:unlisted.reason,message:unlisted.message});
      send(ws,{type:'propertyUnlisted',listing:unlisted.listing});
      send(ws,propertyReportMessage(world.claims.find(item=>item.id===unlisted.listing.claimId)||playerClaim(client.playerId)));
      broadcast({type:'marketListings',currency:'Coin',commissionRate:MARKET_COMMISSION_RATE,listings:marketListingsPayload()});
      return;
    }
    if(message.type==='propertyBuy'){
      const listing=marketListingById(message.listingId),bought=listing?.type==='claim'?marketBuyClaim(client,message.listingId):marketBuyProperty(client,message.listingId);
      if(!bought.ok) return send(ws,{type:'propertyBuyRejected',reason:bought.reason,message:bought.message,balance:bought.balance??walletSnapshot(client.playerId).balance});
      send(ws,{type:'walletUpdate',wallet:bought.buyerWallet});
      send(ws,{type:'propertyBought',listing:bought.listing,claim:claimDetails(bought.claim,client.playerId),propertyId:bought.propertyId||bought.claim?.id,commission:bought.commission,wallet:bought.buyerWallet,claims:claimsSummary()});
      send(ws,propertyReportMessage(bought.claim));
      const sellerClient=Array.from(clients.values()).find(other=>other.joined&&other.playerId===bought.listing.sellerId);
      if(sellerClient){ send(sellerClient.ws,{type:'walletUpdate',wallet:bought.sellerWallet}); send(sellerClient.ws,{type:'propertySoldToPlayer',listing:bought.listing,payout:bought.sellerNet,commission:bought.commission,wallet:bought.sellerWallet}); send(sellerClient.ws,propertyReportMessage(null)); }
      broadcast({type:'claims',claims:claimsSummary()});
      broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});
      broadcast({type:'marketListings',currency:'Coin',commissionRate:MARKET_COMMISSION_RATE,listings:marketListingsPayload()});
      sendCompanyStateAll();
      return;
    }

    if(message.type==='propertyAnalyze'){
      const claim=analyzerClaimFor(message.claimId,Number(message.x),Number(message.z))||playerClaim(client.playerId);
      if(!claim) return send(ws,propertyReportMessage(null));
      const permissions=claimPermissions(claim,client.playerId);
      if(claim.ownerId!==client.playerId&&!permissions.build) return send(ws,{type:'propertyReport',ok:false,reason:'no_permission',message:'Property analysis requires Claim ownership or BUILD permission'});
      return send(ws,propertyReportMessage(claim));
    }

    if(message.type==='propertySellNpc'){
      const sale=sellPropertyToNpc(client,message.claimId);
      if(!sale.ok) return send(ws,{type:'propertySaleRejected',reason:sale.reason,message:sale.message||'Property sale rejected',certifiedValue:sale.certifiedValue||null,payout:sale.payout||null});
      send(ws,{type:'walletUpdate',wallet:sale.wallet});
      send(ws,{type:'propertySold',propertyId:sale.propertyId,npcPropertyId:sale.npcPropertyId,certifiedValue:sale.certifiedValue,payout:sale.payout,payoutRate:sale.payoutRate,claim:sale.claim,claims:claimsSummary(),wallet:sale.wallet});
      send(ws,propertyReportMessage(null));
      broadcast({type:'claims',claims:claimsSummary()});
      broadcast({type:'businesses',currency:'Coin',businesses:businessesPayload()});
      sendCompanyStateAll();
      broadcast({type:'npcPropertyAdded',property:{id:sale.npcPropertyId,claimId:sale.propertyId,ownerName:'NPC Buyback',x:sale.claim.x,z:sale.claim.z,certifiedValue:sale.certifiedValue}});
      send(ws,worldState(client));
      return;
    }

    if(message.type==='prefabPreview' || message.type==='prefabPlace'){
      const result=validatePrefabPlacement(client,message.prefabId,Number(message.x),Number(message.z),Number(message.rotation)||0);
      if(message.type==='prefabPreview') return send(ws,{type:'prefabPreview',ok:result.ok,prefabId:String(message.prefabId||''),placement:result.placement||null,price:result.placement?.price||prefabById(message.prefabId)?.price||null,reason:result.reason||null,message:result.ok?'Placement footprint is valid; Prefab is paid and ready for a Wallet transaction':result.message||prefabReasonText(result.reason)});
      if(!result.ok) return send(ws,{type:'prefabRejected',prefabId:String(message.prefabId||''),reason:result.reason,message:result.message||prefabReasonText(result.reason),price:result.prefab?.price||prefabById(message.prefabId)?.price||null,balance:walletSnapshot(client.playerId).balance});
      const purchase=buyPrefabForPlayer(client,result);
      if(!purchase.ok) return send(ws,{type:'prefabRejected',prefabId:result.prefab.id,reason:purchase.reason,message:purchase.message,price:purchase.price,balance:purchase.balance,currency:'Coin'});
      send(ws,{type:'walletUpdate',wallet:purchase.wallet});
      send(ws,{type:'prefabPlaced',prefabId:result.prefab.id,placement:purchase.placement,blocksPlaced:purchase.blocksPlaced,price:result.prefab.price,wallet:purchase.wallet});
      send(ws,propertyReportMessage(playerClaim(client.playerId)));
      return;
    }

    if(message.type==='landInspect'){
      const x=Number(message.x),z=Number(message.z);
      if(!Number.isFinite(x)||!Number.isFinite(z)) return send(ws,{type:'landQuote',ok:false,message:'Select a valid map location'});
      return send(ws,{type:'landQuote',ok:true,parcel:landRegistryEntry(x,z)});
    }

    if (message.type === 'playerState') {
      const now = Date.now();
      if (now - client.lastInputAt < 20) return;
      client.lastInputAt = now;
      const nextX=clamp(number(message.x, client.x), -100000, 100000);
      // Creative flight can go well above the terrain ceiling; this is only a
      // safety limit, not a teleport-back-to-spawn boundary. The server still
      // validates the submitted motion against the same voxel collision map.
      const nextY=clamp(number(message.y, client.y), -100, MAX_FLIGHT_HEIGHT),nextZ=clamp(number(message.z, client.z), -100000, 100000);
      const motion={
        onGround:message.onGround===true,
        inWater:message.inWater===true,
        sprint:message.sprint===true,
        fly:message.fly===true,
        jump:message.jump===true,
        autoStep:message.autoStep===true
      };
      if(!serverPlayerMotionValid(client,nextX,nextY,nextZ,now,motion)) return send(ws,{type:'playerStateRejected',reason:'collision_or_teleport',x:client.x,y:client.y,z:client.z});
      client.x=nextX; client.y=nextY; client.z=nextZ; client.lastStateAt=now;
      client.yaw = number(message.yaw, client.yaw);
      client.pitch = clamp(number(message.pitch, client.pitch), -1.57, 1.57);
      client.fly=motion.fly&&client.mode==='creative';
      client.sprint=motion.sprint&&!client.fly;
      client.inWater=serverPlayerInWater(nextX,nextY,nextZ);
      client.onGround=serverPlayerGrounded(nextX,nextY,nextZ);
      client.jump=motion.jump;
      client.selectedBlock = clamp(integer(message.selectedBlock, 1), 0, 255);
      return;
    }

    if (message.type === 'doorToggle' || message.type === 'lightToggle') {
      const x=integer(message.x,NaN), y=integer(message.y,NaN), z=integer(message.z,NaN);
      if(!validBlockEdit(client,x,y,z)) return send(ws,{type:'editRejected',reason:'too_far_or_invalid',x,y,z});
      const access=claimAccess(client,x,z,'use'); if(!access.ok) return rejectPermission(ws,x,y,z,access);
      const key=editKey(x,y,z);
      if(message.type==='doorToggle'){
        const open=world.doors[key]!==true;
        if(open) world.doors[key]=true; else delete world.doors[key];
        world.revision+=1;
        broadcast({type:'doorState',x,y,z,open,revision:world.revision,by:client.id});
      }else{
        const on=world.lights[key]!==false;
        const nextOn=!on;
        if(nextOn) delete world.lights[key]; else world.lights[key]=false;
        world.revision+=1;
        broadcast({type:'lightState',x,y,z,on:nextOn,revision:world.revision,by:client.id});
      }
      return;
    }

    if (message.type === 'objectInteract') {
      const x=integer(message.x,NaN), y=integer(message.y,NaN), z=integer(message.z,NaN);
      if(!validBlockEdit(client,x,y,z)) return send(ws,{type:'objectInteractRejected',reason:'too_far_or_invalid',x,y,z,message:'Object is too far away or invalid'});
      const access=claimAccess(client,x,z,'use'); if(!access.ok) return rejectPermission(ws,x,y,z,access);
      const object=String(message.object||'').replace(/[^a-z0-9_-]/gi,'').slice(0,24);
      const expectedIds={chest:50,crate:46,barrel:47,sign:48},key=editKey(x,y,z),currentId=serverBlockIdAt(x,y,z),isPublicLandmark=serverPublicLandmarkObjectAt(object,x,y,z);
      // Validate the effective voxel, including deterministic generated
      // cabins. A client cannot turn a removed/private object into an
      // interactable one by sending an object name alone.
      if(!object||(expectedIds[object]!==undefined&&currentId!==expectedIds[object]&&!isPublicLandmark)||(!expectedIds[object]&&!isPublicLandmark)) return send(ws,{type:'objectInteractRejected',reason:'object_not_found',x,y,z,message:'That interactive object is not present here'});
      send(ws,{type:'objectInteractAccepted',object,x,y,z});
      broadcast({type:'objectState',object,x,y,z,by:client.id},client.id);
      return;
    }

    if (message.type === 'blockBreak' || message.type === 'blockPlace') {
      const x = integer(message.x, NaN), y = integer(message.y, NaN), z = integer(message.z, NaN);
      if (!validBlockEdit(client, x, y, z)) return send(ws, { type: 'editRejected', reason: 'too_far_or_invalid', x, y, z });
      const access=claimAccess(client,x,z,'build'); if(!access.ok) return rejectPermission(ws,x,y,z,access);
      if (message.type === 'blockBreak') {
        commitEdit(client, x, y, z, 0, message.oldId === undefined ? null : integer(message.oldId, -1));
      } else {
        const idValue = integer(message.id, 0);
        if (idValue <= 0 || idValue > MAX_BLOCK_ID || idValue === 22) return send(ws, { type: 'editRejected', reason: 'invalid_block', x, y, z });
        commitEdit(client, x, y, z, idValue, message.oldId === undefined ? null : integer(message.oldId, -1));
      }
      return;
    }

    if (message.type === 'chat') {
      const text = String(message.message || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 240);
      if (text) broadcast({ type: 'chat', playerId: client.playerId || id, name: client.name, message: text });
      return;
    }

    if (message.type === 'ping') return send(ws, { type: 'pong', sentAt: message.sentAt });
  });

  ws.on('close', () => {
    if (clients.get(id) !== client) return;
    clients.delete(id);
    if (client.joined) {
      broadcast({ type: 'system', message: `${client.name} left the world` });
      sendPlayers();
      log(client.name, 'left');
    }
  });

  ws.on('error', error => log('Socket error', id, error.message));
});

setInterval(() => {
  world.dayTime = (world.dayTime + 1 / (10 * 60)) % 1;
  broadcast({ type: 'worldTime', dayTime: world.dayTime });
}, 1000);

setInterval(() => sendPlayers(), 100);
setInterval(() => updateAmbientEntities(0.25), 250);
setInterval(() => runBusinessCycle(), BUSINESS_TICK_MS);
setInterval(() => runRentalCycle(), RENT_TICK_MS);
setInterval(() => runLandAuctionCycle(), Math.max(1000, Math.min(RENT_TICK_MS, 10000)));
setInterval(() => constructionRunCycle(), NPC_CONSTRUCTION_TICK_MS);
setInterval(() => refreshMasterMapDeltas(), MAP_SYNC_INTERVAL_MS);
setInterval(() => saveWorld(), 30000);

ensureWorldDir();
initSqliteDatabase();
loadAllWorlds();
loadAccounts();
loadPlayerProfiles();
loadCoinLedger();
loadSpawnReservations();
bakeMasterMapCache(true);
server.listen(PORT, HOST, () => {
  log(`VoxelCraft server listening on http://${HOST}:${PORT} · active world ${world.id}`);
  log(`Game WebSocket: ws://${HOST}:${PORT}/ws`);
  log(`Admin panel: http://${HOST}:${PORT}/admin  token=${ADMIN_TOKEN === 'change-me' ? 'change-me (set ADMIN_TOKEN)' : 'configured'}`);
});

function shutdown(signal) {
  log(signal, 'received; saving database and world');
  savePlayerProfiles();
  saveAccounts();
  saveCoinLedger();
  saveSpawnReservations();
  saveWorld();
  if (sqliteDb) {
    try { sqliteDb.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (e) {}
  }
  for (const client of clients.values()) client.ws.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
