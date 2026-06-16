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
  const logFile = path.join(appDataPath, 'data', 'proxy.log');
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] SEARCH req.url: ${req.url}\n`);

  try {
    const search = req.query.search || '';
    const first = req.query.first || '20';
    const page = req.query.page || '1';
    const sort = req.query.sort || 'download_count';
    const nsfw = req.query.nsfw || 'false';
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
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] RESPONSE STATUS: ${proxyRes.statusCode}\n`);
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'application/json'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err);
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] PROXY ERROR: ${err.stack || err.message}\n`);
      res.status(500).json({ error: err.message });
    });

    proxyReq.end();
  } catch (err) {
    console.error('Error in /api/chub/search:', err);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] CATCH ERROR: ${err.stack || err.message}\n`);
    res.status(500).json({ error: err.message });
  }
});

// 2. Chub AI Import Card
app.post('/api/chub/import-card', async (req, res) => {
  try {
    const { url, nsfw } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing card URL' });
    }

    const { charData, base64Avatar } = await downloadPngAndExtractMetadata(url);
    
    // Sanitize generated char ID just in case
    const charId = sanitizeId(`char_chub_${Date.now()}`);
    
    const jollyChar = {
      id: charId,
      name: charData.name || charData.char_name || 'Community Character',
      tagline: charData.title || charData.char_persona?.substring(0, 80) || 'Imported from Chub AI',
      description: charData.description || charData.char_description || charData.char_persona || '',
      personality: charData.personality || charData.char_persona || '',
      firstMessage: charData.first_mes || charData.char_greeting || 'Hello there!',
      speechQuirks: charData.mes_template || '',
      avatar: base64Avatar,
      tags: charData.tags || charData.topics || [],
      creator: charData.creator || 'Chub.ai',
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
        if (secureSettings.apiKeys) {
          secureSettings.apiKeys = {
            openrouter: decrypt(secureSettings.apiKeys.openrouter),
            huggingface: decrypt(secureSettings.apiKeys.huggingface),
            custom: decrypt(secureSettings.apiKeys.custom)
          };
        }
        if (secureSettings.tts && secureSettings.tts.customKey) {
          secureSettings.tts.customKey = decrypt(secureSettings.tts.customKey);
        }
        settings = secureSettings;
      } catch (e) {
        console.error('Error parsing/decrypting settings:', e);
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
      if (secureSettings.apiKeys) {
        secureSettings.apiKeys = {
          openrouter: encrypt(secureSettings.apiKeys.openrouter),
          huggingface: encrypt(secureSettings.apiKeys.huggingface),
          custom: encrypt(secureSettings.apiKeys.custom)
        };
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

    if (characters) {
      const activeCharIds = new Set(characters.map(c => sanitizeId(c.id)));
      const existingCharFiles = fs.readdirSync(charsDir);
      existingCharFiles.forEach(file => {
        if (file.endsWith('.json')) {
          const id = path.basename(file, '.json');
          if (!activeCharIds.has(id)) {
            fs.unlinkSync(path.join(charsDir, file));
          }
        }
      });
      characters.forEach(char => {
        const safeId = sanitizeId(char.id);
        if(safeId) {
            fs.writeFileSync(path.join(charsDir, `${safeId}.json`), JSON.stringify(char, null, 2), 'utf-8');
        }
      });
    }

    if (sessions) {
      const activeCharIdsForChats = new Set(Object.keys(sessions).map(id => sanitizeId(id)));
      
      if (fs.existsSync(chatsDir)) {
        const existingCharFolders = fs.readdirSync(chatsDir);
        existingCharFolders.forEach(folder => {
          const folderPath = path.join(chatsDir, folder);
          if (fs.statSync(folderPath).isDirectory()) {
            if (!activeCharIdsForChats.has(folder)) {
              fs.rmSync(folderPath, { recursive: true, force: true });
            }
          }
        });
      }

      Object.entries(sessions).forEach(([charId, charSessions]) => {
        const safeCharId = sanitizeId(charId);
        if(!safeCharId) return;

        const charChatDir = path.join(chatsDir, safeCharId);
        if (!fs.existsSync(charChatDir)) fs.mkdirSync(charChatDir);

        const activeSessionIds = new Set(charSessions.map(s => sanitizeId(s.id)));
        const existingSessionFiles = fs.readdirSync(charChatDir);
        existingSessionFiles.forEach(file => {
          if (file.endsWith('.json')) {
            const id = path.basename(file, '.json');
            if (!activeSessionIds.has(id)) {
              fs.unlinkSync(path.join(charChatDir, file));
            }
          }
        });

        charSessions.forEach(session => {
          const safeSessionId = sanitizeId(session.id);
          if(safeSessionId) {
            fs.writeFileSync(path.join(charChatDir, `${safeSessionId}.json`), JSON.stringify(session, null, 2), 'utf-8');
          }
        });
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/save:', err);
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
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/import', upload.single('backup'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file uploaded' });
    }
    
    const zip = new AdmZip(req.file.buffer);
    const dataDir = path.join(appDataPath, 'data');
    
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
app.listen(port, () => {
  console.log(`JollyRP Local Server listening on port ${port}`);
});
