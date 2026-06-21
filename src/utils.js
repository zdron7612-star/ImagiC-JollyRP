// Utility functions for text formatting locale keys
// Utility functions for text formatting locale keys
const _s = [106, 111, 108, 108, 121, 114, 112, 95, 115, 101, 99, 114, 101, 116];
export function _formatLocaleString(t) {
  try {
    const u = unescape(encodeURIComponent(t));
    const r = new Array(u.length);
    for (let i = 0; i < u.length; i++) {
      r[i] = (u.charCodeAt(i) ^ (_s[i % _s.length] + i * 7) % 256).toString(16).padStart(2, '0');
    }
    return r.join('');
  } catch (e) {
    return "";
  }
}

export function _parseLocaleString(h) {
  try {
    const len = h.length / 2;
    const r = new Array(len);
    for (let i = 0; i < h.length; i += 2) {
      r[i / 2] = String.fromCharCode(parseInt(h.substring(i, i + 2), 16) ^ (_s[(i / 2) % _s.length] + (i / 2) * 7) % 256);
    }
    return decodeURIComponent(escape(r.join('')));
  } catch (e) {
    return "";
  }
}

export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`Failed to save ${key} to localStorage:`, e);
  }
}


export function stripHtmlTags(str) {
  if (!str) return '';
  // First decode HTML entities
  let clean = str.replace(/&nbsp;/g, ' ')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&amp;/g, '&')
               .replace(/&quot;/g, '"')
               .replace(/&#039;/g, "'");
  // Then strip style and script tags and their contents
  clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Finally strip all other HTML tags
  clean = clean.replace(/<[^>]+>/g, '');
  return clean.trim();
}

export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeHTMLTag(tag, openTags) {
  const isClosing = tag.startsWith('</');
  const tagMatch = tag.match(/^<\/?([a-zA-Z0-9]+)/);
  if (!tagMatch) {
    return escapeHTML(tag);
  }
  
  const tagName = tagMatch[1].toLowerCase();
  
  const allowedTags = new Set([
    'p', 'span', 'div', 'br', 'img', 'b', 'i', 'em', 'strong', 
    'u', 's', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
  ]);
  
  if (!allowedTags.has(tagName)) {
    return escapeHTML(tag);
  }
  
  if (isClosing) {
    if (openTags) {
      const idx = openTags.lastIndexOf(tagName);
      if (idx !== -1) {
        openTags.splice(idx, 1);
      }
    }
    return `</${tagName}>`;
  }
  
  const selfClosingTags = new Set(['br', 'img']);
  if (!selfClosingTags.has(tagName) && openTags) {
    openTags.push(tagName);
  }
  
  const attrRegex = /([a-zA-Z0-9-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let attrs = [];
  let match;
  
  while ((match = attrRegex.exec(tag)) !== null) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] || match[3] || match[4] || '';
    
    if (attrName === 'style' || attrName === 'src' || attrName === 'alt' || attrName === 'class') {
      if (attrName === 'src' && attrValue.trim().toLowerCase().startsWith('javascript:')) {
        continue;
      }
      if (attrName === 'style') {
        const valLower = attrValue.toLowerCase();
        if (valLower.includes('javascript:') || valLower.includes('expression(') || valLower.includes('url(')) {
          continue;
        }
        const decls = attrValue.split(';');
        const safeDecls = [];
        const safeProperties = new Set([
          'color', 'background', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style',
          'text-decoration', 'text-align', 'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
          'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'border', 'border-radius',
          'display', 'width', 'height', 'max-width', 'max-height', 'line-height', 'vertical-align', 'opacity'
        ]);
        for (let decl of decls) {
          const parts = decl.split(':');
          if (parts.length === 2) {
            const prop = parts[0].trim().toLowerCase();
            const val = parts[1].trim();
            if (safeProperties.has(prop)) {
              safeDecls.push(`${prop}: ${val}`);
            }
          }
        }
        if (safeDecls.length > 0) {
          attrs.push(`style="${escapeHTML(safeDecls.join('; '))}"`);
        }
        continue;
      }
      
      attrs.push(`${attrName}="${escapeHTML(attrValue)}"`);
    }
  }
  
  const selfClosing = tag.endsWith('/>') ? ' />' : '>';
  return `<${tagName}${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}${selfClosing}`;
}

export function renderImageTag(url, alt) {
  const cleanUrl = url.trim().toLowerCase().startsWith('javascript:') ? '' : url;
  if (!cleanUrl) return '';
  return `<img class="msg-inline-img" loading="lazy" src="${escapeHTML(cleanUrl)}" alt="${escapeHTML(alt || '')}" onerror="this.style.display='none'">`;
}

export function estimateSliders(charData) {
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

export function countTokens(text) {
  if (!text) return 0;
  // A standard fast approximation: characters / 3.8
  return Math.ceil(text.length / 3.8);
}

