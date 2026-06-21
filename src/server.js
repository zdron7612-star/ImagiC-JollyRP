import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import multer from 'multer';

// Determine root directory depending on ES module environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const appDataPath = process.env.DATA_DIR || rootDir;

const app = express();
const allowedOrigins = new Set([
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed'));
  }
}));
// Increase the limit for JSON bodies if dealing with large chat logs
app.use(express.json({ limit: '50mb' }));

// Helper to prevent directory traversal
function sanitizeId(id) {
  if (typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

// Encryption Helpers
const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey() {
  const dataDir = path.join(appDataPath, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const keyPath = path.join(dataDir, '.key');
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }
  // Generate a new 32-byte key
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key);
  
  // Make sure .key is in .gitignore
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    let content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.key')) {
      fs.appendFileSync(gitignorePath, '\n# Secure key\ndata/.key\n');
    }
  }
  return key;
}

function encrypt(text) {
  if (!text) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  if (!text) return '';
  try {
    const key = getEncryptionKey();
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed, key might be invalid:', err);
    return '';
  }
}

function sanitizeCompletionProxyHeaders(inputHeaders = {}) {
  const safeHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };
  const allowedHeaderNames = new Set([
    'authorization',
    'x-api-key',
    'api-key',
    'anthropic-version',
    'openai-organization',
    'openai-project'
  ]);

  Object.entries(inputHeaders || {}).forEach(([key, value]) => {
    const lowerKey = String(key).toLowerCase();
    if (!allowedHeaderNames.has(lowerKey)) return;
    if (typeof value !== 'string' || value.length > 4096) return;
    safeHeaders[key] = value;
  });

  safeHeaders['User-Agent'] = 'JollyRP/1.0';
  return safeHeaders;
}

// Regex covering RFC-1918 private ranges, loopback, and link-local
const PRIVATE_IP_REGEX = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0|::1$|localhost$|fc00|fd)/i;

// Allowed hosts for character PNG downloads (SSRF guard)
const ALLOWED_CARD_HOSTS = new Set([
  'avatars.janitorai.com',
  'cdn.janitorai.com',
  'api.jannyai.com',
  'image.jannyai.com',
  's3.amazonaws.com',
  'chub.ai',
  'avatars.chub.ai',
  'api.chub.ai',
  'media.chub.ai',
  'avatars.charhub.io',
  'charhub.io'
]);


function validateCardDownloadUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid card download URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Card download URL must use HTTPS');
  }
  // Block private/loopback ranges
  if (PRIVATE_IP_REGEX.test(parsed.hostname)) {
    throw new Error('Card download URL targets a private address');
  }
  // Only allow known CDN hosts (prevents open-SSRF via untrusted API response)
  if (!ALLOWED_CARD_HOSTS.has(parsed.hostname)) {
    throw new Error(`Card download URL host not allowed: ${parsed.hostname}`);
  }
  return parsed.toString();
}

function validateCompletionEndpoint(endpointUrl) {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    throw new Error('Missing endpointUrl');
  }

  let parsed;
  try {
    parsed = new URL(endpointUrl);
  } catch (err) {
    throw new Error('Invalid custom endpoint URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Custom endpoint must use http or https');
  }

  if (!parsed.pathname.endsWith('/chat/completions')) {
    throw new Error('Custom endpoint must target an OpenAI-compatible /chat/completions route');
  }

  // Block SSRF to private/loopback addresses
  if (PRIVATE_IP_REGEX.test(parsed.hostname)) {
    throw new Error('Custom endpoint cannot target private or local network addresses');
  }

  return parsed.toString();
}

function extractCharaFromPng(buffer) {
  // Check PNG signature
  const sig = buffer.slice(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') {
    throw new Error('Not a valid PNG file');
  }

  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
    
    if (type === 'tEXt' || type === 'iTXt') {
      const chunkData = buffer.slice(offset + 8, offset + 8 + length);
      
      let i = 0;
      let keyword = '';
      while (i < chunkData.length && chunkData[i] !== 0) {
        keyword += String.fromCharCode(chunkData[i]);
        i++;
      }
      
      if (keyword === 'chara') {
        let textData = '';
        if (type === 'tEXt') {
          i++; // Skip null separator
          textData = chunkData.slice(i).toString('ascii');
        } else {
          // iTXt
          i++; // Skip null separator
          if (i < chunkData.length) {
            const compressionFlag = chunkData[i++];
            const compressionMethod = chunkData[i++];
            
            // Skip language tag
            while (i < chunkData.length && chunkData[i] !== 0) i++;
            i++; // Skip null separator
            
            // Skip translated keyword
            while (i < chunkData.length && chunkData[i] !== 0) i++;
            i++; // Skip null separator
            
            if (compressionFlag === 0) {
              textData = chunkData.slice(i).toString('utf8');
            }
          }
        }
        
        if (textData) {
          const decoded = Buffer.from(textData.trim(), 'base64').toString('utf8');
          const parsed = JSON.parse(decoded);
          return parsed.data || parsed;
        }
      }
    }
    
    offset += 12 + length;
  }
  
  throw new Error('No chara chunk found');
}

function downloadPngAndExtractMetadata(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download character card. Status code: ${res.statusCode}`));
        return;
      }

      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        try {
          const charData = extractCharaFromPng(buffer);
          const base64Avatar = `data:image/png;base64,${buffer.toString('base64')}`;
          resolve({ charData, base64Avatar });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

function estimateSliders(charData) {
  const name = charData.name || charData.char_name || '';
  const tagline = charData.title || '';
  const description = charData.description || charData.char_description || charData.char_persona || '';
  const personality = charData.personality || charData.char_persona || '';
  const tags = charData.tags || charData.topics || [];
  const text = `${name} ${tagline} ${description} ${personality} ${tags.join(' ')}`.toLowerCase();
  
  let extroversion = 50;
  let chaos = 50;
  let warmth = 50;
  let intelligence = 50;
  
  const extroWords = ['extrovert', 'outgoing', 'loud', 'talkative', 'confident', 'social', 'bubbly', 'hyperactive', 'energetic', 'cheerful', 'flirty', 'dominant'];
  const introWords = ['introvert', 'shy', 'quiet', 'silent', 'aloof', 'reserved', 'cold', 'timid', 'anti-social', 'loner', 'tsundere', 'submissive', 'kuudere'];
  extroWords.forEach(w => { if (text.includes(w)) extroversion += 5; });
  introWords.forEach(w => { if (text.includes(w)) extroversion -= 5; });
  
  const chaosWords = ['chaotic', 'chaos', 'crazy', 'wild', 'playful', 'mischievous', 'yandere', 'impulsive', 'rebellious', 'disobedient', 'brat', 'seductive', 'tease'];
  const orderWords = ['orderly', 'calm', 'polite', 'structured', 'disciplined', 'loyal', 'proper', 'formal', 'obedient', 'lawful', 'maid', 'knight', 'butler', 'noble'];
  chaosWords.forEach(w => { if (text.includes(w)) chaos += 5; });
  orderWords.forEach(w => { if (text.includes(w)) chaos -= 5; });
  
  const warmWords = ['warm', 'kind', 'gentle', 'sweet', 'loving', 'friendly', 'affectionate', 'deredere', 'protective', 'caring', 'loyal', 'helper', 'angel', 'mother'];
  const coldWords = ['cynical', 'mean', 'cruel', 'sarcastic', 'cold', 'hostile', 'kuudere', 'evil', 'rude', 'haughty', 'dominant', 'monster', 'demon', 'assassin'];
  warmWords.forEach(w => { if (text.includes(w)) warmth += 5; });
  coldWords.forEach(w => { if (text.includes(w)) warmth -= 5; });
  
  const intelWords = ['intelligent', 'smart', 'genius', 'wise', 'clever', 'strategist', 'scholar', 'wizard', 'cunning', 'analytical', 'teacher', 'detective'];
  const simpleWords = ['simple', 'naive', 'dumb', 'clumsy', 'foolish', 'airhead', 'innocent', 'childish', 'dense', 'maid', 'dunce', 'cute'];
  intelWords.forEach(w => { if (text.includes(w)) intelligence += 5; });
  simpleWords.forEach(w => { if (text.includes(w)) intelligence -= 5; });
  
  const clamp = (val) => Math.max(10, Math.min(90, val));
  
  return {
    extroversion: clamp(extroversion),
    chaos: clamp(chaos),
    warmth: clamp(warmth),
    intelligence: clamp(intelligence)
  };
}

// 1. Chub AI Proxy Search
app.get('/api/chub/search', (req, res) => {
  try {
    const dataDir = path.join(appDataPath, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const logPath = path.join(dataDir, 'proxy.log');
    fs.appendFileSync(logPath, `SEARCH req.url: ${req.url}\n`);

    const search = req.query.search || '';
    const first = Math.max(1, Math.min(100, parseInt(req.query.first) || 20)).toString();
    const page = Math.max(1, parseInt(req.query.page) || 1).toString();
    const validSorts = new Set(['download_count', 'star_count', 'trending_ratio', 'hidden_gems', 'high_effort_recent', 'last_activity_at', 'created_at']);
    const sort = validSorts.has(req.query.sort) ? req.query.sort : 'download_count';
    const nsfw = req.query.nsfw === 'true' ? 'true' : 'false';
    const topics = req.query.topics || '';

    let pathStr = `/search?search=${encodeURIComponent(search)}&first=${first}&page=${page}&sort=${sort}&nsfw=${nsfw}`;
    if (topics) {
      pathStr += `&topics=${encodeURIComponent(topics)}`;
    }

    const options = {
      hostname: 'api.chub.ai',
      path: pathStr,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://chub.ai',
        'Referer': 'https://chub.ai/'
      }
    };

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'application/json'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err);
      res.status(500).json({ error: 'Search request failed' });
    });

    proxyReq.end();
  } catch (err) {
    console.error('Error in /api/chub/search:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Chub AI Import Card
app.post('/api/chub/import-card', async (req, res) => {
  try {
    const { url, nsfw } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing card URL' });
    }

    // SSRF guard: only allow downloads from known Chub CDN hosts
    const safeUrl = validateCardDownloadUrl(url);
    const { charData, base64Avatar } = await downloadPngAndExtractMetadata(safeUrl);
    
    // Sanitize generated char ID just in case
    const charId = sanitizeId(`char_chub_${Date.now()}`);
    
    const isJanitorCard = charData.creator === 'JanitorAI' || 
                         charData.creator === 'Janitor AI' ||
                         (charData.description && (charData.description.includes('Personality\n') || charData.description.includes('>**Personality:**') || charData.description.includes('**Personality:**')));

    const desc = isJanitorCard ? (charData.personality || charData.char_persona || charData.description || '') : (charData.description || charData.char_description || charData.char_persona || '');
    const pers = isJanitorCard ? (charData.description || charData.char_description || charData.char_persona || '') : (charData.personality || charData.char_persona || '');

    const jollyChar = {
      id: charId,
      name: charData.name || charData.char_name || 'Community Character',
      tagline: charData.title || charData.char_persona?.substring(0, 80) || (isJanitorCard ? 'Imported from JanitorAI' : 'Imported from Chub AI'),
      description: desc,
      personality: pers,
      firstMessage: charData.first_mes || charData.char_greeting || 'Hello there!',
      speechQuirks: charData.mes_template || '',
      avatar: base64Avatar,
      tags: charData.tags || charData.topics || [],
      creator: charData.creator || (isJanitorCard ? 'JanitorAI' : 'Chub.ai'),
      lorebook: charData.lorebook || [],
      nsfw: !!nsfw
    };

    jollyChar.sliders = estimateSliders(jollyChar);

    // Add to local characters folder automatically!
    const dataDir = path.join(appDataPath, 'data');
    const charsDir = path.join(dataDir, 'characters');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    if (!fs.existsSync(charsDir)) fs.mkdirSync(charsDir);
    
    fs.writeFileSync(path.join(charsDir, `${charId}.json`), JSON.stringify(jollyChar, null, 2), 'utf-8');

    res.json({ success: true, character: jollyChar });
  } catch (err) {
    console.error('Error in /api/chub/import-card:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2.5 Janitor AI Import Card
app.post('/api/janitor/import-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing Janitor URL' });
    }

    const uuidMatch = url.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    if (!uuidMatch) {
      return res.status(400).json({ error: 'Invalid URL. Could not find Janitor character UUID.' });
    }
    const characterId = uuidMatch[0];

    const postData = JSON.stringify({ characterId });
    const jannyUrl = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.jannyai.com',
        path: '/api/v1/download',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };

      const jannyReq = https.request(options, (jannyRes) => {
        let responseBody = '';
        jannyRes.on('data', (chunk) => { responseBody += chunk; });
        jannyRes.on('end', () => {
          try {
            if (jannyRes.statusCode !== 200) {
              reject(new Error(`JannyAI API returned status ${jannyRes.statusCode}`));
              return;
            }
            const data = JSON.parse(responseBody);
            if (data.status === 'error' || !data.downloadUrl) {
              reject(new Error(data.error || 'Character not found on JannyAI archive'));
              return;
            }
            resolve(data.downloadUrl);
          } catch (e) {
            reject(new Error(`Failed to parse JannyAI response: ${e.message}`));
          }
        });
      });

      jannyReq.on('error', (e) => reject(e));
      jannyReq.write(postData);
      jannyReq.end();
    });

    // SSRF guard: the downloadUrl from JannyAI must point to a known CDN host
    const safeJannyUrl = validateCardDownloadUrl(jannyUrl);
    const { charData, base64Avatar } = await downloadPngAndExtractMetadata(safeJannyUrl);
    
    const charId = sanitizeId(`char_janitor_${Date.now()}`);
    
    const needsSwap = !charData.personality || 
                      (charData.description && (charData.description.includes('Personality\n') || charData.description.includes('>**Personality:**') || charData.description.includes('**Personality:**')));

    const desc = needsSwap ? (charData.personality || charData.char_persona || charData.description || '') : (charData.description || charData.char_description || charData.char_persona || '');
    const pers = needsSwap ? (charData.description || charData.char_description || charData.char_persona || '') : (charData.personality || charData.char_persona || '');

    const jollyChar = {
      id: charId,
      name: charData.name || charData.char_name || 'Janitor Character',
      tagline: charData.title || charData.char_persona?.substring(0, 80) || 'Imported from JanitorAI',
      description: desc,
      personality: pers,
      firstMessage: charData.first_mes || charData.char_greeting || 'Hello there!',
      speechQuirks: charData.mes_template || '',
      avatar: base64Avatar,
      tags: charData.tags || charData.topics || [],
      creator: charData.creator || 'JanitorAI',
      nsfw: true
    };

    jollyChar.sliders = estimateSliders(jollyChar);

    const dataDir = path.join(appDataPath, 'data');
    const charsDir = path.join(dataDir, 'characters');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    if (!fs.existsSync(charsDir)) fs.mkdirSync(charsDir);
    
    fs.writeFileSync(path.join(charsDir, `${charId}.json`), JSON.stringify(jollyChar, null, 2), 'utf-8');

    res.json({ success: true, character: jollyChar });
  } catch (err) {
    console.error('Error in /api/janitor/import-url:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Load local data
app.get('/api/load', (req, res) => {
  try {
    const dataDir = path.join(appDataPath, 'data');
    const charsDir = path.join(dataDir, 'characters');
    const chatsDir = path.join(dataDir, 'chats');
    const settingsPath = path.join(dataDir, 'settings.json');

    // Ensure directories exist
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    if (!fs.existsSync(charsDir)) fs.mkdirSync(charsDir);
    if (!fs.existsSync(chatsDir)) fs.mkdirSync(chatsDir);

    const gitignorePath = path.join(rootDir, '.gitignore');
    let gitignoreContent = '';
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    }
    if (!gitignoreContent.includes('data/') && !gitignoreContent.includes('data')) {
      fs.appendFileSync(gitignorePath, '\n# Local storage data\ndata/\n');
    }

    let settings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        const secureSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (secureSettings.apiKey) {
          secureSettings.apiKey = decrypt(secureSettings.apiKey);
        }
        if (secureSettings.apiKeys && typeof secureSettings.apiKeys === 'object') {
          const decryptedKeys = {};
          for (const [providerKey, providerVal] of Object.entries(secureSettings.apiKeys)) {
            if (typeof providerVal === 'string' && providerVal) {
              decryptedKeys[providerKey] = decrypt(providerVal);
            } else {
              decryptedKeys[providerKey] = '';
            }
          }
          secureSettings.apiKeys = decryptedKeys;
        }
        if (secureSettings.tts && secureSettings.tts.customKey) {
          secureSettings.tts.customKey = decrypt(secureSettings.tts.customKey);
        }
        settings = secureSettings;
      } catch (e) {
        console.error('Error parsing/decrypting settings:', e);
      }
    }

    // Check if recovery script output exists and merge it
    const extractedPath = path.join(dataDir, 'extracted_localstorage.json');
    if (fs.existsSync(extractedPath)) {
      try {
        const extractedData = JSON.parse(fs.readFileSync(extractedPath, 'utf-8'));
        console.log('[Server] Found extracted_localstorage.json from recovery script.');
        let merged = false;
        if (extractedData.theme && settings.theme !== extractedData.theme) {
          settings.theme = extractedData.theme;
          merged = true;
        }
        if (extractedData.styleSettings) {
          settings.styleSettings = {
            ...settings.styleSettings,
            ...extractedData.styleSettings
          };
          merged = true;
        }
        if (merged) {
          const secureSettings = { ...settings };
          if (secureSettings.apiKey) {
            secureSettings.apiKey = encrypt(secureSettings.apiKey);
          }
          if (secureSettings.apiKeys && typeof secureSettings.apiKeys === 'object') {
            const encryptedKeys = {};
            for (const [providerKey, providerVal] of Object.entries(secureSettings.apiKeys)) {
              if (typeof providerVal === 'string' && providerVal) {
                encryptedKeys[providerKey] = encrypt(providerVal);
              } else {
                encryptedKeys[providerKey] = '';
              }
            }
            secureSettings.apiKeys = encryptedKeys;
          }
          if (secureSettings.tts && secureSettings.tts.customKey) {
            secureSettings.tts = {
              ...secureSettings.tts,
              customKey: encrypt(secureSettings.tts.customKey)
            };
          }
          fs.writeFileSync(settingsPath, JSON.stringify(secureSettings, null, 2), 'utf-8');
          console.log('[Server] Successfully merged extracted theme/styles into settings.json');
        }
        fs.unlinkSync(extractedPath);
        console.log('[Server] Cleaned up extracted_localstorage.json.');
      } catch (err) {
        console.error('[Server] Failed to process extracted_localstorage.json:', err);
      }
    }

    const characters = [];
    const charFiles = fs.readdirSync(charsDir);
    charFiles.forEach(file => {
      if (file.endsWith('.json')) {
        try {
          const c = JSON.parse(fs.readFileSync(path.join(charsDir, file), 'utf-8'));
          characters.push(c);
        } catch (e) {
          console.error('Error reading character file:', file, e);
        }
      }
    });

    const sessions = {};
    if (fs.existsSync(chatsDir)) {
      const charFolders = fs.readdirSync(chatsDir);
      charFolders.forEach(charFolder => {
        const charFolderPath = path.join(chatsDir, charFolder);
        if (fs.statSync(charFolderPath).isDirectory()) {
          const sessionFiles = fs.readdirSync(charFolderPath);
          const charSessions = [];
          sessionFiles.forEach(file => {
            if (file.endsWith('.json')) {
              try {
                const s = JSON.parse(fs.readFileSync(path.join(charFolderPath, file), 'utf-8'));
                charSessions.push(s);
              } catch (e) {
                console.error('Error reading session file:', file, e);
              }
            }
          });
          if (charSessions.length > 0) {
            sessions[charFolder] = charSessions;
          }
        }
      });
    }

    let personas = [];
    const personasPath = path.join(dataDir, 'personas.json');
    if (fs.existsSync(personasPath)) {
      try {
        personas = JSON.parse(fs.readFileSync(personasPath, 'utf-8'));
      } catch (e) {
        console.error('Error reading personas file:', e);
      }
    }

    res.json({ settings, characters, sessions, personas });
  } catch (err) {
    console.error('Error in /api/load:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Save local data
// IMPORTANT: /api/save is ADDITIVE-ONLY. It only writes/updates data, NEVER deletes.
// Deletions happen exclusively through explicit DELETE endpoints below.
// This prevents any accidental data wipe if the client sends an empty or stale payload
// (e.g., after localStorage is cleared due to URL/origin change, cookie purge, etc.)
app.post('/api/save', (req, res) => {
  try {
    const { settings, characters, sessions, personas } = req.body;
    const dataDir = path.join(appDataPath, 'data');
    const charsDir = path.join(dataDir, 'characters');
    const chatsDir = path.join(dataDir, 'chats');

    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    if (!fs.existsSync(charsDir)) fs.mkdirSync(charsDir);
    if (!fs.existsSync(chatsDir)) fs.mkdirSync(chatsDir);

    if (settings) {
      const secureSettings = { ...settings };
      if (secureSettings.apiKey) {
        secureSettings.apiKey = encrypt(secureSettings.apiKey);
      }
      if (secureSettings.apiKeys && typeof secureSettings.apiKeys === 'object') {
        const encryptedKeys = {};
        for (const [providerKey, providerVal] of Object.entries(secureSettings.apiKeys)) {
          if (typeof providerVal === 'string' && providerVal) {
            encryptedKeys[providerKey] = encrypt(providerVal);
          } else {
            encryptedKeys[providerKey] = '';
          }
        }
        secureSettings.apiKeys = encryptedKeys;
      }
      if (secureSettings.tts && secureSettings.tts.customKey) {
        secureSettings.tts = {
          ...secureSettings.tts,
          customKey: encrypt(secureSettings.tts.customKey)
        };
      }
      fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify(secureSettings, null, 2), 'utf-8');
    }

    if (personas) {
      fs.writeFileSync(path.join(dataDir, 'personas.json'), JSON.stringify(personas, null, 2), 'utf-8');
    }

    // Characters: additive only — write/update each character, never delete
    if (characters && characters.length > 0) {
      characters.forEach(char => {
        const safeId = sanitizeId(char.id);
        if (safeId) {
          fs.writeFileSync(path.join(charsDir, `${safeId}.json`), JSON.stringify(char, null, 2), 'utf-8');
        }
      });
    }

    // Sessions: additive only — write/update each session file, never delete folders or files
    if (sessions) {
      Object.entries(sessions).forEach(([charId, charSessions]) => {
        const safeCharId = sanitizeId(charId);
        if (!safeCharId) return;

        const charChatDir = path.join(chatsDir, safeCharId);
        if (!fs.existsSync(charChatDir)) fs.mkdirSync(charChatDir);

        if (Array.isArray(charSessions)) {
          charSessions.forEach(session => {
            const safeSessionId = sanitizeId(session.id);
            if (safeSessionId) {
              fs.writeFileSync(path.join(charChatDir, `${safeSessionId}.json`), JSON.stringify(session, null, 2), 'utf-8');
            }
          });
        }
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/save:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4a. Explicit DELETE endpoint for a single character and all its chats
app.delete('/api/characters/:charId', (req, res) => {
  try {
    const safeCharId = sanitizeId(req.params.charId);
    if (!safeCharId) return res.status(400).json({ error: 'Invalid character ID' });

    const dataDir = path.join(appDataPath, 'data');
    const charFile = path.join(dataDir, 'characters', `${safeCharId}.json`);
    const charChatsDir = path.join(dataDir, 'chats', safeCharId);

    if (fs.existsSync(charFile)) fs.unlinkSync(charFile);
    if (fs.existsSync(charChatsDir)) fs.rmSync(charChatsDir, { recursive: true, force: true });

    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/characters/:charId:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4b. Explicit DELETE endpoint for a single chat session
app.delete('/api/chats/:charId/:sessionId', (req, res) => {
  try {
    const safeCharId = sanitizeId(req.params.charId);
    const safeSessionId = sanitizeId(req.params.sessionId);
    if (!safeCharId || !safeSessionId) return res.status(400).json({ error: 'Invalid ID' });

    const dataDir = path.join(appDataPath, 'data');
    const sessionFile = path.join(dataDir, 'chats', safeCharId, `${safeSessionId}.json`);

    if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);

    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/chats/:charId/:sessionId:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Export Data (Download ZIP)
app.get('/api/export', (req, res) => {
  try {
    const dataDir = path.join(appDataPath, 'data');
    if (!fs.existsSync(dataDir)) {
      return res.status(404).json({ error: 'Data directory not found' });
    }
    const zip = new AdmZip();
    zip.addLocalFolder(dataDir);
    const zipBuffer = zip.toBuffer();
    
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="jollyrp_backup.zip"',
      'Content-Length': zipBuffer.length
    });
    res.send(zipBuffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Import Data (Upload ZIP)
// Limit upload size to 100 MB to prevent DoS via oversized backup files
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
app.post('/api/import', upload.single('backup'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file uploaded' });
    }
    
    const zip = new AdmZip(req.file.buffer);
    const dataDir = path.join(appDataPath, 'data');

    // Zip Slip protection: ensure no entry escapes the data directory
    const resolvedDataDir = path.resolve(dataDir);
    const entries = zip.getEntries();
    for (const entry of entries) {
      const entryPath = path.resolve(resolvedDataDir, entry.entryName);
      if (!entryPath.startsWith(resolvedDataDir + path.sep) && entryPath !== resolvedDataDir) {
        return res.status(400).json({ error: 'Invalid backup file: contains unsafe path entries.' });
      }
    }

    // Clear existing data directory fully to prevent ghost files
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(dataDir, { recursive: true });

    // Extract the zip contents directly into dataDir
    zip.extractAllTo(dataDir, true);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Custom API proxy to bypass CORS and tunnel warning pages (e.g. Pinggy/ngrok)
app.post('/api/proxy/completion', async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    const { endpointUrl, headers, requestBody } = req.body;
    const safeEndpointUrl = validateCompletionEndpoint(endpointUrl);

    if (!requestBody || typeof requestBody !== 'object') {
      return res.status(400).json({ error: 'Missing requestBody' });
    }

    const proxyHeaders = sanitizeCompletionProxyHeaders(headers);

    const response = await fetch(safeEndpointUrl, {
      method: 'POST',
      headers: proxyHeaders,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    res.status(response.status);
    
    // Copy headers from response
    const blockedResponseHeaders = new Set([
      'transfer-encoding',
      'content-encoding',
      'content-length',
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'upgrade'
    ]);
    for (const [key, value] of response.headers.entries()) {
      if (!blockedResponseHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    if (response.body) {
      for await (const chunk of response.body) {
        res.write(chunk);
      }
    }
    res.end();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[Proxy] Request aborted by client.');
    } else {
      console.error('Error in /api/proxy/completion:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  }
});

// Static files for production
app.use(express.static(path.join(rootDir, 'dist')));

// Error handling middleware to catch body-parser / request aborted errors gracefully
app.use((err, req, res, next) => {
  if (err.type === 'request.aborted' || err.code === 'ECONNABORTED' || err.message === 'request aborted') {
    console.log(`[Server] Request aborted by client: ${req.method} ${req.url}`);
    if (!res.headersSent) {
      res.status(400).json({ error: 'Request aborted by client' });
    }
    return;
  }
  console.error('[Server Error]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const port = process.env.PORT || 3001;
// Bind to localhost only — prevents LAN/network exposure.
// Set HOST=0.0.0.0 in environment only if you explicitly want LAN access.
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`JollyRP Local Server listening on http://${host}:${port}`);
});
