import { escapeHTML, sanitizeHTMLTag, renderImageTag } from '../utils.js';
import { scanLorebook, synthesizeSystemPrompt, buildApiMessages, summarizeChunk, retrieveTopK, replacePlaceholders } from '../memory.js';
import { streamChatCompletion } from '../api.js';

// Pre-compiled emotion regex patterns (avoids re-creating on every call)
const EMOTION_PATTERNS = [
  { emotion: 'blush', pattern: /\b(blush|blushes|blushed|shy|timid|embarrassed|flustered|shyly|giddy|cute|sweetly)\b/i, emojis: ['❤', '💕', '😳'], negWords: ['blush', 'embarrassed', 'shy'] },
  { emotion: 'smug', pattern: /\b(smirk|smirks|smirked|tease|teases|teased|playful|mischievous|wink|winks|winked|smug|smugness|smugly|sly|slyly|cocky)\b/i, emojis: ['😏', '😉', '😈'], negWords: ['smirk', 'tease', 'smug'] },
  { emotion: 'angry', pattern: /\b(scowl|scowls|scream|screams|screamed|angry|anger|growl|growls|shout|shouts|shouted|furious|glare|glares|glared|rage|snarl|snarls|irritated|mad|pissed|annoyed)\b/i, emojis: ['😠', '😡', '⚡', '💢'], negWords: ['angry', 'furious', 'rage', 'mad'] },
  { emotion: 'sad', pattern: /\b(frown|frowns|sigh|sighs|sighd|cry|cries|crying|sad|sadness|weep|weeps|weeping|tear|tears|sob|sobs|sobbing|depressed|gloomy|lonely|hurt|pain|sorrow|unhappy)\b/i, emojis: ['😢', '😭', '🥺', '💔'], negWords: ['sad', 'cry', 'depressed'] },
  { emotion: 'happy', pattern: /\b(smile|smiles|smiled|laugh|laughs|laughed|happy|cheerful|giggle|giggles|giggled|joy|joyful|smiling|grin|grinned|glad|excited|thrilled|pleased)\b/i, emojis: ['😀', '😄', '😊', '✨', '😆'], negWords: ['happy', 'smile', 'laugh', 'joy', 'glad', 'excited'] },
];

// Pre-compile negation patterns for each emotion's negation words
const NEGATION_CACHE = new Map();
function isNegatedCached(word, cleanText) {
  let regex = NEGATION_CACHE.get(word);
  if (!regex) {
    regex = new RegExp(`\\b(not|never|no|stop|don't|doesn't|isn't|wasn't|aren't|weren't|can't|cannot|won't|without|hardly|scarcely)\\s+(?:\\w+\\s+){0,2}${word}\\b`, 'i');
    NEGATION_CACHE.set(word, regex);
  }
  return regex.test(cleanText);
}

export const chatMethods = {
  formatActionText(text) {
    if (!text) return '';
    return text.replace(/\*([^*]+)\*/g, '<em>*$1*</em>');
  },

  formatRelativeTime(timestamp) {
    if (!timestamp) return 'unknown';
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return 'about 1 month ago';
    return `${diffMonths} months ago`;
  },

  detectMessageEmotion(text) {
    if (!text) return 'default';
    const cleanText = text.toLowerCase();
    
    for (const { emotion, pattern, emojis, negWords } of EMOTION_PATTERNS) {
      const hasPattern = pattern.test(cleanText) || emojis.some(e => cleanText.includes(e));
      if (hasPattern) {
        const negated = negWords.some(w => isNegatedCached(w, cleanText));
        if (!negated) return emotion;
      }
    }
    
    return 'default';
  },

  spawnMoodParticles(container, emotion) {
    if (!container || emotion === 'default') return;
    const emotes = {
      happy: ['✨', '⭐', '🌟', '💖'],
      sad: ['💧', '😭', '☁️', '🌧️'],
      angry: ['⚡', '💢', '🔥', '😡'],
      blush: ['❤️', '💕', '😳', '🌸'],
      smug: ['😏', '😈', '✨', '💜']
    };
    const list = emotes[emotion] || [];
    if (list.length === 0) return;
    
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const p = document.createElement('span');
        p.className = 'mood-particle';
        p.textContent = list[Math.floor(Math.random() * list.length)];
        
        const dx = (Math.random() * 30 - 15) + 'px';
        const dx2 = (Math.random() * 60 - 30) + 'px';
        p.style.setProperty('--dx', dx);
        p.style.setProperty('--dx2', dx2);
        p.style.left = '16px';
        p.style.top = '16px';
        
        container.appendChild(p);
        p.addEventListener('animationend', () => p.remove());
      }, i * 150);
    }
  },

  renderChatThread(shouldScrollToBottom = true) {
    const thread = this.elements.chatThread;
    // Install delegated event handler once (handles all bubble interactions)
    this._installChatThreadDelegation();
    thread.innerHTML = '';

    const sessionId = this.isRoomActive() ? this.activeCharacterId : this.activeChatId;
    if (this.lastLoadedSessionId !== sessionId) {
      this.lastLoadedSessionId = sessionId;
      this.renderedMessagesCount = 30;
    }

    // Room branch
    if (this.isRoomActive()) {
      const chat = this.getRoomSession();
      if (!chat) {
        thread.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:32px;color:var(--text-muted);"><div style="font-size:48px;margin-bottom:16px;">👥</div><h3 style="font-family:var(--font-brand);color:var(--accent-gold);font-size:20px;margin-bottom:8px;">Group Room</h3><p style="font-size:13px;max-width:320px;line-height:1.6;">No messages yet. Type something to start the room conversation!</p></div>`;
        return;
      }
      const charIds = chat.roomCharIds || [];
      const chars = charIds.map(id => this.characters.find(c => c.id === id)).filter(Boolean);
      
      const allMessages = chat.messages || [];
      const totalMessages = allMessages.length;
      const showLimit = this.renderedMessagesCount || 30;
      const startIndex = Math.max(0, totalMessages - showLimit);
      const slicedMessages = allMessages.slice(startIndex);

      if (startIndex > 0) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'btn load-older-msgs-btn';
        loadMoreBtn.style.margin = '10px auto 20px auto';
        loadMoreBtn.style.padding = '8px 16px';
        loadMoreBtn.style.fontSize = '12px';
        loadMoreBtn.style.display = 'block';
        loadMoreBtn.style.color = 'var(--accent-gold)';
        loadMoreBtn.style.borderColor = 'rgba(197, 168, 128, 0.3)';
        loadMoreBtn.style.background = 'none';
        loadMoreBtn.textContent = `Show older messages (${startIndex} remaining)`;
        
        loadMoreBtn.addEventListener('click', () => {
          const previousScrollHeight = thread.scrollHeight;
          const previousScrollTop = thread.scrollTop;
          this.renderedMessagesCount = (this.renderedMessagesCount || 30) + 30;
          this.renderChatThread(false);
          thread.scrollTop = thread.scrollHeight - previousScrollHeight + previousScrollTop;
        });
        thread.appendChild(loadMoreBtn);
      }

      const fragment = document.createDocumentFragment();
      slicedMessages.forEach((msg, idx) => {
        const originalIndex = startIndex + idx;
        let speakerChar = null;
        if (msg.role === 'assistant') {
          if (msg.roomSpeakerId) {
            speakerChar = chars.find(c => c.id === msg.roomSpeakerId) || null;
          }
          if (!speakerChar) {
            speakerChar = this.parseRoomSpeaker(msg.content, chars);
          }
          if (!speakerChar) speakerChar = chars[0];
        }
        this.appendRoomMessageToDom(msg.role, msg.content, originalIndex, msg.id, speakerChar, fragment, true);
      });
      thread.appendChild(fragment);

      if (shouldScrollToBottom) {
        this.scrollToBottom();
      }
      this.scheduleIdleWork(() => this.analyzeMoodAndApplyTheme());
      // Re-render speaker strip
      this.renderSpeakerStrip(chat);
      this.updateTokenUsage();
      return;
    }

    const session = this.getActiveSession();
    if (!session) {
      thread.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; padding:32px; color:var(--text-muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
          <h3 style="font-family: var(--font-brand); color: var(--accent-gold); font-size: 20px; margin-bottom: 8px;">No Active Conversation</h3>
          <p style="font-size: 13px; max-width: 320px; line-height: 1.6;">Select a companion from the Active Cast, or click the brand logo to return home and start a new story.</p>
        </div>
      `;
      return;
    }

    const allMessages = session.messages || [];
    const totalMessages = allMessages.length;
    const showLimit = this.renderedMessagesCount || 30;
    const startIndex = Math.max(0, totalMessages - showLimit);
    const slicedMessages = allMessages.slice(startIndex);

    if (startIndex > 0) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'btn load-older-msgs-btn';
      loadMoreBtn.style.margin = '10px auto 20px auto';
      loadMoreBtn.style.padding = '8px 16px';
      loadMoreBtn.style.fontSize = '12px';
      loadMoreBtn.style.display = 'block';
      loadMoreBtn.style.color = 'var(--accent-gold)';
      loadMoreBtn.style.borderColor = 'rgba(197, 168, 128, 0.3)';
      loadMoreBtn.style.background = 'none';
      loadMoreBtn.textContent = `Show older messages (${startIndex} remaining)`;
      
      loadMoreBtn.addEventListener('click', () => {
        const previousScrollHeight = thread.scrollHeight;
        const previousScrollTop = thread.scrollTop;
        this.renderedMessagesCount = (this.renderedMessagesCount || 30) + 30;
        this.renderChatThread(false);
        thread.scrollTop = thread.scrollHeight - previousScrollHeight + previousScrollTop;
      });
      thread.appendChild(loadMoreBtn);
    }

    const fragment = document.createDocumentFragment();
    slicedMessages.forEach((msg, idx) => {
      const originalIndex = startIndex + idx;
      this.appendMessageToDom(msg.role, msg.content, originalIndex, msg.id, fragment, true);
    });
    thread.appendChild(fragment);

    if (shouldScrollToBottom) {
      this.scrollToBottom();
    }
    this.updateTokenUsage();
  },

  appendMessageToDom(role, text, index, msgId = null, parent = this.elements.chatThread, deferEffects = false) {
    const char = this.characters.find(c => c.id === this.activeCharacterId);
    if (!char) return null;

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${role}`;
    
    const identifier = msgId || index;
    bubble.setAttribute('data-msg-id', identifier);

    // Get active persona name/avatar if user
    const activeChat = this.getActiveSession();
    const activePersonaId = activeChat ? activeChat.personaId : 'persona_default';
    const activePersona = this.getActivePersona(activePersonaId);

    const safeText = text || '';
    const isDirector = safeText.startsWith('[NARRATOR DIRECTIVE — React in-character to this event]:');
    const directorAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231b1722'/><path d='M20 30h60v40H20z' fill='%23c5a880'/><path d='M20 30l10-10h10l-10 10h10l10-10h10l-10 10h10l10-10h10l-10 10h10l10-10' fill='%23fff'/></svg>";

    const avatar = isDirector
      ? directorAvatar
      : (role === 'user' ? (activePersona.avatar || this.defaultUserAvatar) : char.avatar);
    const name = isDirector
      ? "🎬 Director Directive"
      : (role === 'user' ? (activePersona.name || 'You') : char.name);

    const isNameLong = name.length > 20;
    const nameHtml = isNameLong 
      ? `<span class="msg-sender-name-text has-tooltip" data-tooltip="${escapeHTML(name)}">${escapeHTML(name.substring(0, 17) + '...')}</span>`
      : `<span class="msg-sender-name-text">${escapeHTML(name)}</span>`;

    if (isDirector) {
      bubble.className = `message-bubble user director`;
    }

    // Clean placeholders in message
    const cleanedText = this.replacePlaceholders(safeText, char.name, activePersona.name || 'User');
    const displayHtmlText = isDirector
      ? cleanedText.replace('[NARRATOR DIRECTIVE — React in-character to this event]:', '').trim()
      : cleanedText;

    // Detect emotion & swap avatar sprite
    let emotion = 'default';
    if (role === 'assistant' && !isDirector) {
      emotion = this.detectMessageEmotion(displayHtmlText);
    }
    let activeAvatarUrl = avatar;
    if (role === 'assistant' && !isDirector && char.sprites && char.sprites[emotion]) {
      activeAvatarUrl = char.sprites[emotion];
    }

    // Format assistant messages or user messages
    const formattedContent = role === 'assistant'
      ? this.formatAssistantText(displayHtmlText)
      : this.formatActionText(displayHtmlText);

    // Only allow deleting messages after the initial greeting message (index 0)
    const showDelete = index > 0;
    const deleteBtnHtml = showDelete ? `
      <button class="msg-delete-btn" data-id="${identifier}" title="Delete message and response" style="background: none; border: none; cursor: pointer; align-items: center; justify-content: center; padding: 4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-crimson);"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      </button>
    ` : '';

    const speakBtnHtml = `
      <button class="msg-speak-btn" data-id="${identifier}" title="Speak message" style="background: none; border: none; cursor: pointer; align-items: center; justify-content: center; padding: 4px; margin-right: 4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-gold);"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
      </button>
    `;

    const forkBtnHtml = `
      <button class="msg-fork-btn" data-id="${identifier}" title="Fork Story from here" style="background: none; border: none; cursor: pointer; align-items: center; justify-content: center; padding: 4px; margin-right: 4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-gold);"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>
      </button>
    `;

    let cycleGreetingsHtml = '';
    if (index === 0 && char.greetings && char.greetings.length > 1) {
      cycleGreetingsHtml = `
        <button class="msg-cycle-btn btn" title="Cycle alternate greeting" style="padding: 2px 6px; font-size: 10px; display: inline-flex; align-items: center; gap: 4px; margin-left: 8px;">
          🔄 Alt Greeting
        </button>
      `;
    }

    // Add swipe controls for assistant messages (index > 0)
    let swipeControlsHtml = '';
    let messageObj = null;
    if (role === 'assistant' && index > 0 && activeChat) {
      messageObj = activeChat.messages.find(m => m.id === identifier) || activeChat.messages[index];
      if (messageObj) {
        if (!messageObj.swipes) {
          messageObj.swipes = [messageObj.content];
        }
        if (messageObj.swipeId === undefined) {
          messageObj.swipeId = 0;
        }
        
        const swipes = messageObj.swipes;
        const swipeId = messageObj.swipeId;
        const isPrevDisabled = swipeId === 0;
        const isNextDisabled = swipeId === swipes.length - 1;

        swipeControlsHtml = `
          <div class="msg-swipe-controls" style="display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 11px; color: var(--text-muted); user-select: none;">
            <button class="swipe-btn prev" title="Previous swipe" style="background: none; border: none; cursor: ${isPrevDisabled ? 'not-allowed' : 'pointer'}; color: var(--text-muted); padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 4px; transition: all 0.2s; opacity: ${isPrevDisabled ? 0.3 : 0.75};" ${isPrevDisabled ? 'disabled' : ''}>◀</button>
            <span class="msg-swipe-indicator" style="font-weight: 500;">${swipeId + 1} / ${swipes.length}</span>
            <button class="swipe-btn next" title="Next swipe" style="background: none; border: none; cursor: ${isNextDisabled ? 'not-allowed' : 'pointer'}; color: var(--text-muted); padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 4px; transition: all 0.2s; opacity: ${isNextDisabled ? 0.3 : 0.75};" ${isNextDisabled ? 'disabled' : ''}>▶</button>
            <button class="swipe-regen-btn" title="Regenerate response (new swipe)" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s; opacity: 0.75; margin-left: 4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              <span style="font-size: 10px;">Regen</span>
            </button>
            <button class="swipe-trigger-next-btn" title="Trigger next reply" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s; opacity: 0.75; margin-left: 4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span style="font-size: 10px;">Trigger Next</span>
            </button>
          </div>
        `;
      }
    }

    let thoughtAccordionHtml = '';
    if (role === 'assistant' && index > 0) {
      const reasoningText = messageObj ? (messageObj.reasoning || '') : '';
      const hasReasoning = !!reasoningText.trim();
      const displayStyle = (this.showReasoning && hasReasoning) ? '' : 'display: none;';
      thoughtAccordionHtml = `
        <div class="msg-thought-accordion collapsed" style="${displayStyle}">
          <button class="msg-thought-header">
            <span class="msg-thought-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="brain-svg">
                <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                <path d="M12 5v14"/>
                <path d="M12 12h6"/>
                <path d="M12 12H6"/>
              </svg>
            </span>
            <span class="msg-thought-title">Thinking Process</span>
            <span class="msg-thought-chevron">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="chevron-svg">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>
          <div class="msg-thought-content-wrapper">
            <div class="msg-thought-content">${escapeHTML(reasoningText)}</div>
          </div>
        </div>
      `;
    }

    bubble.innerHTML = `
      <div class="avatar-container">
        <img class="msg-avatar ${emotion !== 'default' ? 'mood-' + emotion : ''}" src="${activeAvatarUrl}" alt="${name}">
      </div>
      <div class="msg-content-wrapper" style="position: relative; flex: 1; min-width: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span class="msg-sender-name">${nameHtml} ${cycleGreetingsHtml}</span>
          <div style="display: flex; align-items: center;">
            ${forkBtnHtml}
            ${speakBtnHtml}
            ${deleteBtnHtml}
          </div>
        </div>
        ${thoughtAccordionHtml}
        <div class="msg-content">${formattedContent}</div>
        ${swipeControlsHtml}
      </div>
    `;

    // Store displayHtmlText on the bubble for TTS delegation
    bubble._displayText = displayHtmlText;

    parent.appendChild(bubble);

    if (!deferEffects && emotion !== 'default' && activeChat && index === activeChat.messages.length - 1) {
      this.spawnMoodParticles(bubble.querySelector('.avatar-container'), emotion);
    }
    return bubble;
  },

  // Single delegated handler for all chat thread interactions — installed once, never re-created
  _installChatThreadDelegation() {
    if (this._chatDelegationInstalled) return;
    this._chatDelegationInstalled = true;
    const thread = this.elements.chatThread;
    if (!thread) return;

    thread.addEventListener('click', (e) => {
      const target = e.target;

      // Thought accordion toggle
      const thoughtHeader = target.closest('.msg-thought-header');
      if (thoughtHeader) {
        e.stopPropagation();
        const accordion = thoughtHeader.closest('.msg-thought-accordion');
        if (accordion) accordion.classList.toggle('collapsed');
        return;
      }

      // Delete button
      const deleteBtn = target.closest('.msg-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        this.deleteMessagePair(deleteBtn.getAttribute('data-id'));
        return;
      }

      // Speak button
      const speakBtn = target.closest('.msg-speak-btn');
      if (speakBtn) {
        e.stopPropagation();
        const bubble = speakBtn.closest('.message-bubble');
        if (bubble && bubble._displayText) {
          this.speakMessage(bubble._displayText);
        }
        return;
      }

      // Fork button
      const forkBtn = target.closest('.msg-fork-btn');
      if (forkBtn) {
        e.stopPropagation();
        this.forkSessionAtMessage(forkBtn.getAttribute('data-id'));
        return;
      }

      // Cycle greetings button
      const cycleBtn = target.closest('.msg-cycle-btn');
      if (cycleBtn) {
        e.stopPropagation();
        this.cycleGreeting();
        return;
      }

      // Swipe prev/next
      const swipeBtn = target.closest('.swipe-btn');
      if (swipeBtn && !swipeBtn.disabled) {
        e.stopPropagation();
        const bubble = swipeBtn.closest('.message-bubble');
        const msgId = bubble ? bubble.getAttribute('data-msg-id') : null;
        if (msgId) {
          const direction = swipeBtn.classList.contains('prev') ? 'prev' : 'next';
          this.changeSwipe(msgId, direction);
        }
        return;
      }

      // Swipe regen
      const regenBtn = target.closest('.swipe-regen-btn');
      if (regenBtn) {
        e.stopPropagation();
        const bubble = regenBtn.closest('.message-bubble');
        const msgId = bubble ? bubble.getAttribute('data-msg-id') : null;
        if (msgId) this.regenerateResponse(msgId);
        return;
      }

      // Trigger next
      const triggerNextBtn = target.closest('.swipe-trigger-next-btn');
      if (triggerNextBtn) {
        e.stopPropagation();
        this.triggerNextReply();
        return;
      }
    });
  },

  deleteMessagePair(identifier) {
    const session = this.getActiveSession();
    const thread = this.elements.chatThread;
    if (!session) return;

    const messages = session.messages;

    // Determine index by msg id or numeric position
    let index = -1;
    if (typeof identifier === 'string' && isNaN(Number(identifier))) {
      index = messages.findIndex(m => m.id === identifier);
    }
    if (index === -1) index = parseInt(identifier);

    // Handle error-only bubbles: not in session.messages yet, just remove from DOM
    if (isNaN(index) || index < 0 || index >= messages.length) {
      const orphanBubble = thread ? thread.querySelector(`[data-msg-id="${identifier}"]`) : null;
      if (orphanBubble && orphanBubble.getAttribute('data-error-bubble') === 'true') {
        this.showCustomConfirmDelete(
          "Remove this error message?",
          "This will remove the failed response from the chat view.",
          () => {
            orphanBubble.classList.add('msg-deleting');
            orphanBubble.addEventListener('animationend', () => {
              if (orphanBubble.parentNode) orphanBubble.parentNode.removeChild(orphanBubble);
            }, { once: true });
          }
        );
      }
      return;
    }

    this.showCustomConfirmDelete(
      "Delete this exchange?",
      "This will permanently remove the message and its paired response. This action cannot be undone.",
      () => {
        // Determine which indices to remove
        const targetRole = messages[index].role;
        let indicesToRemove = [index];
        if (targetRole === 'user') {
          if (index + 1 < messages.length && messages[index + 1].role === 'assistant') {
            indicesToRemove.push(index + 1);
          }
        } else if (targetRole === 'assistant') {
          if (index - 1 >= 0 && messages[index - 1].role === 'user') {
            indicesToRemove.push(index - 1);
          }
        }

        // Collect the DOM bubbles we need to remove
        const bubblesToRemove = indicesToRemove.map(idx => {
          const msg = messages[idx];
          const id = msg.id || idx;
          return thread.querySelector(`[data-msg-id="${id}"]`);
        }).filter(Boolean);

        // Update data first, then persist (skip re-rendering MyChats during active chat)
        session.messages = messages.filter((_, idx) => !indicesToRemove.includes(idx));
        if (this.renderedMessagesCount > session.messages.length) {
          this.renderedMessagesCount = Math.max(30, session.messages.length);
        }
        this.saveSessions(true); // skipRenderMyChats=true for instant response

        // Animate bubbles out, then surgically remove them — no full re-render needed
        const animateThenRemove = (el) => {
          return new Promise(resolve => {
            el.classList.add('msg-deleting');
            el.addEventListener('animationend', () => {
              if (el.parentNode) el.parentNode.removeChild(el);
              resolve();
            }, { once: true });
          });
        };

        Promise.all(bubblesToRemove.map(animateThenRemove)).then(() => {
          requestAnimationFrame(() => {
            if (this.elements.chatInput) this.elements.chatInput.focus();
          });
          // Defer the memory ledger update to avoid blocking the animation
          const idleCb = typeof requestIdleCallback === 'function'
            ? requestIdleCallback
            : (fn) => setTimeout(fn, 150);
          idleCb(() => this.renderMemoryLedger());
        });
      }
    );
  },

  changeSwipe(msgId, direction) {
    const session = this.isRoomActive() ? this.getRoomSession() : this.getActiveSession();
    if (!session) return;

    // Find the message index
    let msgIndex = -1;
    if (typeof msgId === 'string' && isNaN(Number(msgId))) {
      msgIndex = session.messages.findIndex(m => m.id === msgId);
    }
    if (msgIndex === -1) {
      msgIndex = parseInt(msgId);
    }
    if (isNaN(msgIndex) || msgIndex < 0 || msgIndex >= session.messages.length) return;

    const messageObj = session.messages[msgIndex];
    if (!messageObj || !messageObj.swipes) return;

    if (direction === 'prev') {
      messageObj.swipeId = Math.max(0, messageObj.swipeId - 1);
    } else if (direction === 'next') {
      messageObj.swipeId = Math.min(messageObj.swipes.length - 1, messageObj.swipeId + 1);
    }

    messageObj.content = messageObj.swipes[messageObj.swipeId];

    if (!messageObj.swipeReasonings) {
      messageObj.swipeReasonings = [];
    }
    while (messageObj.swipeReasonings.length < messageObj.swipes.length) {
      messageObj.swipeReasonings.push('');
    }
    messageObj.reasoning = messageObj.swipeReasonings[messageObj.swipeId] || '';

    this.saveSessions(true);

    // Surgical DOM update: only update the affected bubble instead of full re-render
    const identifier = messageObj.id || msgIndex;
    const bubble = this.elements.chatThread.querySelector(`[data-msg-id="${identifier}"]`);
    if (bubble) {
      const textNode = bubble.querySelector('.msg-content');
      if (textNode) {
        const char = this.characters.find(c => c.id === (messageObj.roomSpeakerId || this.activeCharacterId));
        const persona = this.getActivePersona(session.personaId || 'persona_default');
        const cleaned = this.replacePlaceholders(messageObj.content, char ? char.name : '', persona ? persona.name : 'User');
        const formatted = this.isRoomActive()
          ? this.formatAssistantText(this.stripRoomPrefix ? this.stripRoomPrefix(cleaned) : cleaned)
          : this.formatAssistantText(cleaned);
        textNode.innerHTML = formatted;
      }
      // Update swipe indicator & button states
      const indicator = bubble.querySelector('.msg-swipe-indicator');
      if (indicator) {
        indicator.textContent = `${messageObj.swipeId + 1} / ${messageObj.swipes.length}`;
      }
      const prevBtn = bubble.querySelector('.swipe-btn.prev');
      const nextBtn = bubble.querySelector('.swipe-btn.next');
      if (prevBtn) {
        prevBtn.disabled = messageObj.swipeId === 0;
        prevBtn.style.opacity = messageObj.swipeId === 0 ? '0.3' : '0.75';
        prevBtn.style.cursor = messageObj.swipeId === 0 ? 'not-allowed' : 'pointer';
      }
      if (nextBtn) {
        nextBtn.disabled = messageObj.swipeId === messageObj.swipes.length - 1;
        nextBtn.style.opacity = messageObj.swipeId === messageObj.swipes.length - 1 ? '0.3' : '0.75';
        nextBtn.style.cursor = messageObj.swipeId === messageObj.swipes.length - 1 ? 'not-allowed' : 'pointer';
      }
      // Update reasoning accordion if present
      const reasoningContent = bubble.querySelector('.msg-thought-content');
      if (reasoningContent) {
        reasoningContent.textContent = messageObj.reasoning || '';
        const accordion = bubble.querySelector('.msg-thought-accordion');
        if (accordion) {
          accordion.style.display = messageObj.reasoning ? '' : 'none';
        }
      }
    } else {
      // Fallback: full re-render if bubble not found
      this.renderChatThread();
    }
  },

  async regenerateResponse(msgId) {
    // Delegate to room regeneration path when room is active
    if (this.isRoomActive()) {
      return this.regenerateRoomResponse(msgId);
    }

    const session = this.getActiveSession();
    const char = this.characters.find(c => c.id === this.activeCharacterId);
    if (!session || !char) return;

    // Guard: don't allow concurrent regen/send
    if (this.activeStreamController) return;

    // Find target assistant message by id or index
    let msgIndex = -1;
    if (typeof msgId === 'string' && isNaN(Number(msgId))) {
      msgIndex = session.messages.findIndex(m => m.id === msgId);
    }
    if (msgIndex === -1) {
      msgIndex = parseInt(msgId);
    }
    if (isNaN(msgIndex) || msgIndex < 0 || msgIndex >= session.messages.length) return;

    const targetMsg = session.messages[msgIndex];
    if (!targetMsg || targetMsg.role !== 'assistant') return;

    // Build history prior to this assistant message
    const history = session.messages.slice(0, msgIndex);
    if (history.length === 0) return; // Nothing to regenerate without prior context

    // The context anchor: last user message before the assistant reply
    // Walk backwards to guarantee we find a user message (handles multi-turn edge cases)
    let lastUserMsg = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') { lastUserMsg = history[i]; break; }
    }
    if (!lastUserMsg) return;
    const cleanedUserText = lastUserMsg.content;

    // Find active persona
    const activePersona = this.getActivePersona(session.personaId);

    // Build the API messages using the slice of history (not the whole session)
    const matchedLore = scanLorebook(cleanedUserText, char.lorebook);
    this.renderActiveLore(matchedLore);

    // Retrieve relevant RAG memory chunks
    const lastAiMsgRegen = history.filter(m => m.role === 'assistant').slice(-1)[0];
    const ragQueryRegen = cleanedUserText + (lastAiMsgRegen ? ' ' + lastAiMsgRegen.content : '');
    const retrievedChunksRegen = retrieveTopK(ragQueryRegen, session.memoryChunks || [], 3);

    const systemPrompt = synthesizeSystemPrompt(char, session.ledger, matchedLore, {
      verbosity: this.verbosity,
      actionRatio: this.actionRatio,
      maxTokens: this.generationParams.max_tokens
    }, activePersona, retrievedChunksRegen);

    const apiMessages = buildApiMessages(systemPrompt, history, 12, this.instructTemplate, char.name, activePersona.name);

    // Initialize swipes array if not present
    if (!targetMsg.swipes) {
      targetMsg.swipes = [targetMsg.content];
    }
    if (!targetMsg.swipeReasonings) {
      targetMsg.swipeReasonings = [];
      while (targetMsg.swipeReasonings.length < targetMsg.swipes.length) {
        targetMsg.swipeReasonings.push(targetMsg.reasoning || '');
      }
    }

    // Append a loading swipe and set it active
    targetMsg.swipes.push('...');
    targetMsg.swipeReasonings.push('');
    targetMsg.swipeId = targetMsg.swipes.length - 1;
    targetMsg.content = '...';
    targetMsg.reasoning = '';

    // Persist loading state, then re-render so the spinner appears in the bubble
    this.saveSessions(true); // skipRenderMyChats — we only need the thread updated
    this.renderChatThread();

    // Query bubble AFTER renderChatThread so the reference is fresh
    const bubble = this.elements.chatThread.querySelector(`[data-msg-id="${msgId}"]`);
    const textNode = bubble ? bubble.querySelector('.msg-content') : null;
    const accordion = bubble ? bubble.querySelector('.msg-thought-accordion') : null;
    const accordionContent = accordion ? accordion.querySelector('.msg-thought-content') : null;

    this.activeStreamController = new AbortController();
    this.setGeneratingState(true);
    let assistantResponse = '';
    let assistantReasoning = '';
    let hasShownAccordion = false;
    let accordionAutoCollapsed = false;

    this.executeChatWithFallbacks({
      apiKey: this.apiKey,
      model: this.activeModel,
      messages: apiMessages,
      temperature: this.generationParams.temperature,
      signal: this.activeStreamController.signal,
      provider: this.apiProvider,
      customUrl: this.customApiUrl,
      enableReasoning: this.reasoningEnabled,
      extraParams: {
        top_p: this.generationParams.top_p,
        top_k: this.generationParams.top_k,
        repetition_penalty: this.generationParams.repetition_penalty,
        max_tokens: this.generationParams.max_tokens
      },
      onChunk: (chunk, reasoningChunk) => {
        if (reasoningChunk) {
          assistantReasoning += reasoningChunk;
          if (this.showReasoning && accordion && accordionContent) {
            if (!hasShownAccordion) {
              accordion.style.display = '';
              accordion.classList.remove('collapsed');
              hasShownAccordion = true;
            }
            accordionContent.textContent = assistantReasoning;
          }
        }
        if (chunk) {
          if (assistantResponse === '') {
            if (textNode) textNode.innerHTML = '';
            if (accordion && !accordionAutoCollapsed) {
              accordion.classList.add('collapsed');
              accordionAutoCollapsed = true;
            }
          }
          assistantResponse += chunk;
          const cleaned = this.replacePlaceholders(assistantResponse, char.name, activePersona.name || 'User');
          if (textNode) textNode.innerHTML = this.formatAssistantText(cleaned);
        }
        this.scrollToBottom();
      },
      onFinish: async (fullText, fullReasoning) => {
        this.setGeneratingState(false);
        this.activeStreamController = null;

        const cleanedFullText = this.replacePlaceholders(fullText, char.name, activePersona.name || 'User');
        targetMsg.swipes[targetMsg.swipeId] = cleanedFullText;
        targetMsg.content = cleanedFullText;
        targetMsg.swipeReasonings[targetMsg.swipeId] = fullReasoning || '';
        targetMsg.reasoning = fullReasoning || '';

        // Update swipe indicator and accordion in the existing bubble if still present — avoids full re-render
        const existingBubble = this.elements.chatThread.querySelector(`[data-msg-id="${msgId}"]`);
        if (existingBubble) {
          const tc = existingBubble.querySelector('.msg-content');
          if (tc) tc.innerHTML = this.formatAssistantText(cleanedFullText);
          const indicator = existingBubble.querySelector('.msg-swipe-indicator');
          if (indicator) indicator.textContent = `${targetMsg.swipeId + 1} / ${targetMsg.swipes.length}`;
          // Update prev/next button states
          const prevBtn = existingBubble.querySelector('.swipe-btn.prev');
          const nextBtn = existingBubble.querySelector('.swipe-btn.next');
          if (prevBtn) { prevBtn.disabled = targetMsg.swipeId === 0; prevBtn.style.opacity = targetMsg.swipeId === 0 ? '0.3' : '0.75'; prevBtn.style.cursor = targetMsg.swipeId === 0 ? 'not-allowed' : 'pointer'; }
          if (nextBtn) { const atEnd = targetMsg.swipeId === targetMsg.swipes.length - 1; nextBtn.disabled = atEnd; nextBtn.style.opacity = atEnd ? '0.3' : '0.75'; nextBtn.style.cursor = atEnd ? 'not-allowed' : 'pointer'; }
          
          // Update accordion content in DOM
          const existingAccordion = existingBubble.querySelector('.msg-thought-accordion');
          const existingAccordionContent = existingAccordion ? existingAccordion.querySelector('.msg-thought-content') : null;
          if (existingAccordion && existingAccordionContent) {
            existingAccordionContent.textContent = fullReasoning || '';
            const hasReasoning = !!(fullReasoning || '').trim();
            existingAccordion.style.display = (this.showReasoning && hasReasoning) ? '' : 'none';
          }
        } else {
          // Bubble was scrolled out of view / removed — fall back to full re-render
          this.renderChatThread();
        }

        this.saveSessions(true);
        this.analyzeMoodAndApplyTheme(fullText);
        this.generateSuggestedChoices();
        this.updateTokenUsage();
      },
      onError: (err) => {
        this.setGeneratingState(false);
        this.activeStreamController = null;
        // Roll back the loading swipe
        if (targetMsg.swipes[targetMsg.swipeId] === '...') {
          targetMsg.swipes.pop();
          targetMsg.swipeReasonings.pop();
          targetMsg.swipeId = targetMsg.swipes.length - 1;
          targetMsg.content = targetMsg.swipes[targetMsg.swipeId] || '';
          targetMsg.reasoning = targetMsg.swipeReasonings[targetMsg.swipeId] || '';
          this.saveSessions(true);
        }
        if (err.name === 'AbortError' || err.message.toLowerCase().includes('abort')) {
          if (textNode) {
            textNode.innerHTML = this.formatAssistantText(targetMsg.content);
          }
        } else {
          if (textNode) {
            textNode.innerHTML = `<span style="color: var(--accent-crimson);">[Regen error: ${err.message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}]</span>`;
          }
        }
      }
    });
  },

  executeChatWithFallbacks(options, fallbackIndex = -1) {
    let currentApiKey = options.apiKey;
    let currentUrl = options.customUrl;
    
    if (fallbackIndex >= 0) {
       const fallbacks = this.apiFallbacks[options.provider] || [];
       if (fallbackIndex < fallbacks.length) {
         const fb = fallbacks[fallbackIndex];
         currentApiKey = fb.apiKey !== undefined ? fb.apiKey : '';
         currentUrl = fb.customUrl !== undefined ? fb.customUrl : options.customUrl;
         const currentModel = fb.model !== undefined && fb.model !== '' ? fb.model : options.model;
         // Note: the model fallback will not be used in options.model here directly because it's passed below
         options.model = currentModel;
         console.log(`[API Retry] Using fallback config index ${fallbackIndex} with model ${currentModel}`);
       } else {
         // No more fallbacks
         if (options.onError) {
           options.onError(new Error("All fallback options exhausted. Last error: " + options.lastErrorMsg));
         }
         return;
       }
    }

    let startedStreaming = false;

    try {
      streamChatCompletion({
        ...options,
        apiKey: currentApiKey,
        customUrl: currentUrl,
        onChunk: (chunk, reasoningChunk) => {
          startedStreaming = true;
          if (options.onChunk) options.onChunk(chunk, reasoningChunk);
        },
        onFinish: (fullText, fullReasoning) => {
          if (options.onFinish) options.onFinish(fullText, fullReasoning);
        },
        onError: (err) => {
          if (!startedStreaming && err.message) {
            const errMsg = err.message.toLowerCase();
            if (errMsg.includes('401') || errMsg.includes('402') || errMsg.includes('403') || errMsg.includes('429') || errMsg.includes('fetch failed')) {
              options.lastErrorMsg = err.message;
              this.executeChatWithFallbacks(options, fallbackIndex + 1);
              return;
            }
          }
          if (options.onError) options.onError(err);
        }
      }).catch(err => {
        if (options.onError) options.onError(err);
      });
    } catch (err) {
      if (options.onError) options.onError(err);
    }
  },

  setGeneratingState(isGenerating) {
    const btn = this.elements.btnSendMessage;
    if (!btn) return;
    if (isGenerating) {
      btn.classList.add('is-generating');
      btn.title = "Stop Generation";
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        </svg>
      `;
    } else {
      btn.classList.remove('is-generating');
      btn.title = "Send Message";
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      `;
    }
  },

  scrollToBottom(force = false) {
    const thread = this.elements.chatThread;
    if (!thread) return;
    // Only auto-scroll if user hasn't manually scrolled up, or if forced (new message send)
    if (force || !this._userScrolledUp) {
      // Use requestAnimationFrame to batch the scroll with the paint cycle,
      // avoiding forced synchronous layout during streaming chunks
      if (this._scrollRafId) cancelAnimationFrame(this._scrollRafId);
      this._scrollRafId = requestAnimationFrame(() => {
        this._scrollRafId = null;
        thread.scrollTop = thread.scrollHeight;
      });
    }
  },

  _setupScrollLock(thread) {
    if (thread._scrollLockBound) return; // prevent double-binding
    thread._scrollLockBound = true;
    thread.addEventListener('scroll', () => {
      // Consider user "at bottom" if within 80px of scrollHeight
      const distFromBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
      this._userScrolledUp = distFromBottom > 80;
    }, { passive: true });
  },

  scheduleIdleWork(callback, timeout = 250) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(callback, { timeout });
      return;
    }
    setTimeout(callback, 0);
  },

  async handleSendMessage(customText = '') {
    if (this.activeStreamController) {
      this.activeStreamController.abort();
      this.activeStreamController = null;
      this.setGeneratingState(false);
      if (this.elements.btnTriggerNext) {
        this.elements.btnTriggerNext.disabled = false;
      }
      return;
    }

    // Delegate to room handler if a room is active
    if (this.isRoomActive()) {
      const userText = customText || this.elements.chatInput.value.trim();
      if (!userText) return;
      if (!customText) this.elements.chatInput.value = '';
      return this.handleRoomSendMessage(userText, false);
    }

    if (this.apiProvider !== 'custom' && !this.apiKey) {
      this.toggleModal('settingsModal', true);
      alert(`An API key/token is required to send messages on OpenRouter. Please check your API Settings.`);
      return;
    }

    const userText = customText || this.elements.chatInput.value.trim();
    if (!userText) return;

    if (!customText) {
      this.elements.chatInput.value = '';
    }

    const session = this.getActiveSession();
    const char = this.characters.find(c => c.id === this.activeCharacterId);
    if (!session || !char) return;

    // Find active persona first
    const activePersona = this.getActivePersona(session.personaId);
    
    let finalUserText = userText;
    if (this.directorModeActive && !customText) {
      finalUserText = `[NARRATOR DIRECTIVE — React in-character to this event]: ${userText}`;
    }
    const cleanedUserText = this.replacePlaceholders(finalUserText, char.name, activePersona.name || 'User');

    // 1. Append user message to history & DOM
    const userMsgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    session.messages.push({ role: 'user', content: cleanedUserText, id: userMsgId });
    this.saveSessions();
    this.appendMessageToDom('user', cleanedUserText, session.messages.length - 1, userMsgId);
    this.scrollToBottom();

    // 2. Perform Memory scans (Lorebook keywords)
    const matchedLore = scanLorebook(cleanedUserText, char.lorebook);
    this.renderActiveLore(matchedLore);

    // 3. Build API prompts — retrieve relevant past memory chunks
    const lastAiMsg = session.messages.filter(m => m.role === 'assistant').slice(-1)[0];
    const ragQuery = cleanedUserText + (lastAiMsg ? ' ' + lastAiMsg.content : '');
    const retrievedChunks = retrieveTopK(ragQuery, session.memoryChunks || [], 3);

    const systemPrompt = synthesizeSystemPrompt(char, session.ledger, matchedLore, {
      verbosity: this.verbosity,
      actionRatio: this.actionRatio,
      maxTokens: this.generationParams.max_tokens
    }, activePersona, retrievedChunks);

    const messages = buildApiMessages(systemPrompt, session.messages, 12, this.instructTemplate, char.name, activePersona.name);

    // 4. Create response slot in chat UI with loading indicator
    const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const bubble = this.appendMessageToDom('assistant', '...', session.messages.length, assistantMsgId);
    const textNode = bubble.querySelector('.msg-content');

    this.activeStreamController = new AbortController();
    
    const accordion = bubble.querySelector('.msg-thought-accordion');
    const accordionContent = accordion ? accordion.querySelector('.msg-thought-content') : null;

    let assistantResponse = "";
    let assistantReasoning = "";
    let hasShownAccordion = false;
    let accordionAutoCollapsed = false;
    let firstChunkReceived = false;
    
    // 30-second timeout: if no chunks arrive, show a timeout indicator
    const streamTimeoutId = setTimeout(() => {
      if (!firstChunkReceived && this.activeStreamController) {
        textNode.innerHTML = `
          <div class="stream-error-card">
            <span class="stream-error-icon">⏱️</span>
            <div>
              <div class="stream-error-title">Response timed out</div>
              <div class="stream-error-msg">The model didn't respond within 30 seconds. Click Stop, then try sending again.</div>
            </div>
          </div>
        `;
      }
    }, 30000);
    
    // Disable inputs during streaming
    this.setGeneratingState(true);
    // Force scroll to bottom on new user message (override any user scroll lock)
    this._userScrolledUp = false;
    this.scrollToBottom(true);
    
    this.executeChatWithFallbacks({
      apiKey: this.apiKey,
      model: this.activeModel,
      messages: messages,
      temperature: this.generationParams.temperature,
      signal: this.activeStreamController.signal,
      provider: this.apiProvider,
      customUrl: this.customApiUrl,
      enableReasoning: this.reasoningEnabled,
      extraParams: {
        top_p: this.generationParams.top_p,
        top_k: this.generationParams.top_k,
        repetition_penalty: this.generationParams.repetition_penalty,
        max_tokens: this.generationParams.max_tokens
      },
      onChunk: (chunk, reasoningChunk) => {
        if (reasoningChunk) {
          assistantReasoning += reasoningChunk;
          if (this.showReasoning && accordion && accordionContent) {
            if (!hasShownAccordion) {
              accordion.style.display = '';
              accordion.classList.remove('collapsed');
              hasShownAccordion = true;
            }
            accordionContent.textContent = assistantReasoning;
          }
        }
        if (chunk) {
          if (!firstChunkReceived) {
            firstChunkReceived = true;
            clearTimeout(streamTimeoutId);
            textNode.innerHTML = "";
            if (accordion && !accordionAutoCollapsed) {
              accordion.classList.add('collapsed');
              accordionAutoCollapsed = true;
            }
          }
          assistantResponse += chunk;
          const cleaned = this.replacePlaceholders(assistantResponse, char.name, activePersona.name || 'User');
          const formatted = this.formatAssistantText(cleaned);
          textNode.innerHTML = formatted;
        }
        this.scrollToBottom();
      },
      onFinish: async (fullText, fullReasoning) => {
        clearTimeout(streamTimeoutId);
        this.setGeneratingState(false);
        this.activeStreamController = null;
        
        const cleanedFullText = this.replacePlaceholders(fullText, char.name, activePersona.name || 'User');
        session.messages.push({
          role: 'assistant',
          content: cleanedFullText,
          id: assistantMsgId,
          swipes: [cleanedFullText],
          swipeId: 0,
          reasoning: fullReasoning || '',
          swipeReasonings: [fullReasoning || '']
        });

        // Update accordion content in DOM if still present
        const existingBubble = this.elements.chatThread.querySelector(`[data-msg-id="${assistantMsgId}"]`);
        if (existingBubble) {
          const existingAccordion = existingBubble.querySelector('.msg-thought-accordion');
          const existingAccordionContent = existingAccordion ? existingAccordion.querySelector('.msg-thought-content') : null;
          if (existingAccordion && existingAccordionContent) {
            existingAccordionContent.textContent = fullReasoning || '';
            const hasReasoning = !!(fullReasoning || '').trim();
            existingAccordion.style.display = (this.showReasoning && hasReasoning) ? '' : 'none';
          }
        }
        if (this.autoSummarizeEnabled) {
          const CHUNK_SIZE = 10; // messages per chunk (user+assistant pairs = 5 turns)
          const KEEP_N = 6;      // keep this many recent messages out of the chunk window
          const MAX_CHUNKS = 150; // cap total stored chunks to prevent unbounded growth

          if (!session.memoryChunks) session.memoryChunks = [];
          if (!session.chunkCursor) session.chunkCursor = 0;

          const totalSaved = session.chunkCursor;
          const available = session.messages.length - totalSaved;

          if (available >= CHUNK_SIZE + KEEP_N) {
            const chunkMessages = session.messages.slice(totalSaved, session.messages.length - KEEP_N);
            const newCursor = totalSaved + chunkMessages.length;

            console.log(`RAG: chunking ${chunkMessages.length} messages (cursor ${totalSaved} → ${newCursor})`);

            if (this.elements.memorySummaryText) {
              this.elements.memorySummaryText.innerHTML = '<em>Storing memory chunk...</em>';
            }

            summarizeChunk(
              this.apiKey,
              this.activeModel,
              chunkMessages,
              this.apiProvider,
              this.customApiUrl
            ).then(chunk => {
              if (chunk) {
                session.memoryChunks.push(chunk);
                // Cap total chunks
                if (session.memoryChunks.length > MAX_CHUNKS) {
                  session.memoryChunks = session.memoryChunks.slice(-MAX_CHUNKS);
                }
                session.chunkCursor = newCursor;
                this.saveSessions();
                this.renderMemoryLedger();
                console.log(`RAG: chunk stored. Total chunks: ${session.memoryChunks.length}`);
              }
            }).catch(err => {
              console.error('RAG: chunk storage failed:', err);
              this.renderMemoryLedger();
            });
          }
        }

        
        // Instead of completely replacing the chat thread (which loses references and breaks the DOM state),
        // we append the swipe controls to the existing bubble directly.
        if (session.messages.length > 1) {
          const wrapper = bubble.querySelector('.msg-content-wrapper');
          if (wrapper && !wrapper.querySelector('.msg-swipe-controls')) {
            const swipeObj = session.messages[session.messages.length - 1];
            const isPrevDisabled = swipeObj.swipeId === 0;
            const isNextDisabled = swipeObj.swipeId === swipeObj.swipes.length - 1;
            const swipeControlsHtml = `
              <div class="msg-swipe-controls" style="display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 11px; color: var(--text-muted); user-select: none;">
                <button class="swipe-btn prev" title="Previous swipe" style="background: none; border: none; cursor: ${isPrevDisabled ? 'not-allowed' : 'pointer'}; color: var(--text-muted); padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 4px; transition: all 0.2s; opacity: ${isPrevDisabled ? 0.3 : 0.75};" ${isPrevDisabled ? 'disabled' : ''}>◀</button>
                <span class="msg-swipe-indicator" style="font-weight: 500;">${swipeObj.swipeId + 1} / ${swipeObj.swipes.length}</span>
                <button class="swipe-btn next" title="Next swipe" style="background: none; border: none; cursor: ${isNextDisabled ? 'not-allowed' : 'pointer'}; color: var(--text-muted); padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; border-radius: 4px; transition: all 0.2s; opacity: ${isNextDisabled ? 0.3 : 0.75};" ${isNextDisabled ? 'disabled' : ''}>▶</button>
                <button class="swipe-regen-btn" title="Regenerate response (new swipe)" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s; opacity: 0.75; margin-left: 4px;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin-right: 4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  <span style="font-size: 10px;">Regen</span>
                </button>
                <button class="swipe-trigger-next-btn" title="Trigger next reply" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s; opacity: 0.75; margin-left: 4px;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  <span style="font-size: 10px;">Trigger Next</span>
                </button>
              </div>
            `;
            wrapper.insertAdjacentHTML('beforeend', swipeControlsHtml);
            
            // Bind newly added buttons
            const prevBtn = bubble.querySelector('.swipe-btn.prev');
            const nextBtn = bubble.querySelector('.swipe-btn.next');
            const regenBtn = bubble.querySelector('.swipe-regen-btn');
            const triggerNextBtn = bubble.querySelector('.swipe-trigger-next-btn');
   
            if (prevBtn) {
              prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this.changeSwipe(assistantMsgId, 'prev'); });
              prevBtn.addEventListener('mouseenter', () => { if (!prevBtn.disabled) prevBtn.style.opacity = '1'; });
              prevBtn.addEventListener('mouseleave', () => { if (!prevBtn.disabled) prevBtn.style.opacity = '0.75'; });
            }
            if (nextBtn) {
              nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.changeSwipe(assistantMsgId, 'next'); });
              nextBtn.addEventListener('mouseenter', () => { if (!nextBtn.disabled) nextBtn.style.opacity = '1'; });
              nextBtn.addEventListener('mouseleave', () => { if (!nextBtn.disabled) nextBtn.style.opacity = '0.75'; });
            }
            if (regenBtn) {
              regenBtn.addEventListener('click', (e) => { e.stopPropagation(); this.regenerateResponse(assistantMsgId); });
              regenBtn.addEventListener('mouseenter', () => regenBtn.style.opacity = '1');
              regenBtn.addEventListener('mouseleave', () => regenBtn.style.opacity = '0.75');
            }
            if (triggerNextBtn) {
              triggerNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.triggerNextReply();
              });
              triggerNextBtn.addEventListener('mouseenter', () => triggerNextBtn.style.opacity = '1');
              triggerNextBtn.addEventListener('mouseleave', () => triggerNextBtn.style.opacity = '0.75');
            }
          }
        }
        
        this.analyzeMoodAndApplyTheme(fullText);
        this.generateSuggestedChoices();
        this.saveSessions();
        this.updateTokenUsage();
      },
      onError: (err) => {
        clearTimeout(streamTimeoutId);
        this.setGeneratingState(false);
        this.activeStreamController = null;
        console.error("Stream completion error:", err);
        
        // Save partial response if we received any text, to keep DOM and history synced
        if (assistantResponse && assistantResponse.trim()) {
          session.messages.push({
            role: 'assistant',
            content: assistantResponse,
            id: assistantMsgId,
            swipes: [assistantResponse],
            swipeId: 0,
            reasoning: assistantReasoning || '',
            swipeReasonings: [assistantReasoning || '']
          });
          this.saveSessions();
          this.renderChatThread();
        } else {
          if (err.name === 'AbortError' || err.message.toLowerCase().includes('abort')) {
            bubble.remove();
          } else {
            // Show actionable error card with contextual tips and retry button
            bubble.setAttribute('data-error-bubble', 'true');
            const isAuth = err.message.includes('401') || err.message.toLowerCase().includes('unauthorized') || err.message.toLowerCase().includes('api key');
            const isRate = err.message.includes('429') || err.message.toLowerCase().includes('rate limit') || err.message.toLowerCase().includes('too many');
            const isTimeout = err.message.toLowerCase().includes('timeout') || err.message.toLowerCase().includes('timed out');
            const tip = isAuth ? 'Check your API key in Settings.' :
                        isRate ? 'Model may be rate-limited. Wait a moment and try again.' :
                        isTimeout ? 'The model took too long. Try again or reduce Max Tokens.' :
                        'Try again, or switch models in Settings.';
            textNode.innerHTML = `
              <div class="stream-error-card">
                <span class="stream-error-icon">⚠️</span>
                <div style="flex: 1;">
                  <div class="stream-error-title">Generation failed</div>
                  <div class="stream-error-msg">${escapeHTML(err.message)}</div>
                  <div class="stream-error-tip">${tip}</div>
                </div>
                <button class="stream-error-retry-btn" title="Retry last message">↩ Retry</button>
              </div>
            `;
            // Retry button re-sends the last user message
            const retryBtn = textNode.querySelector('.stream-error-retry-btn');
            if (retryBtn) {
              retryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Remove error bubble and retrigger
                bubble.remove();
                this.triggerNextReply();
              });
            }
            // Show delete button
            const errDeleteBtn = bubble.querySelector('.msg-delete-btn');
            if (errDeleteBtn) errDeleteBtn.style.display = 'inline-flex';
          }
        }
      }
    });
  },

  formatAssistantText(text) {
    if (!text) return '';
    
    // Get active character name to strip prefix if present
    // Cache the compiled regex per-character to avoid constructing it on every streaming chunk
    let cleaned = text;
    if (this.activeCharacterId !== this._cachedPrefixRegexCharId) {
      const activeChar = this.characters ? this.characters.find(c => c.id === this.activeCharacterId) : null;
      if (activeChar && activeChar.name) {
        const escapedName = activeChar.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        this._cachedPrefixRegex = new RegExp(`^${escapedName}\\s*:\\s*`, 'i');
      } else {
        this._cachedPrefixRegex = null;
      }
      this._cachedPrefixRegexCharId = this.activeCharacterId;
    }
    if (this._cachedPrefixRegex) {
      cleaned = cleaned.replace(this._cachedPrefixRegex, '');
    }
    
    // Trim any leading newlines/spaces left after stripping the prefix
    cleaned = cleaned.trimStart();

    // Ensure different character turns are separated by an empty line
    cleaned = cleaned.replace(/\s*\[([^\]]+)\]:/g, (match, name, offset) => {
      return offset === 0 ? match : `\n\n[${name}]:`;
    });

    // Pre-process to clean up messy outer markdown/asterisks around quotes
    // 1. Space-separated asterisks around quotes, e.g. "* *“" or "”* *"
    cleaned = cleaned.replace(/\*\s*\*\s*([“\"«])/g, '$1');
    cleaned = cleaned.replace(/([”\"»])\s*\*\s*\*/g, '$1');
    
    // 2. Adjacent asterisks/markdown around quotes, e.g. "**“" or "”**"
    cleaned = cleaned.replace(/\*\*+([“\"«])/g, '$1');
    cleaned = cleaned.replace(/([”\"»])\*\*+/g, '$1');
    cleaned = cleaned.replace(/\*([“\"«])/g, '$1');
    cleaned = cleaned.replace(/([”\"»])\*/g, '$1');

    // 2.5 Protect measurements from breaking quote parity by using correct prime/double-prime symbols
    // Matches 5'10", 5' 10", 5 ft 10"
    cleaned = cleaned.replace(/(\d+)\s*(?:'|ft|foot|feet)\s*(\d+)\s*"/gi, '$1′$2″');
    // Matches 6" long, 10" thick, etc
    cleaned = cleaned.replace(/(\d+)\s*"\s*(long|wide|tall|thick|deep|girth)\b/gi, '$1″ $2');

    // 3. Clean up double/multiple asterisks that might be left raw, e.g. "**bold**" to "*bold*" for uniform action styling
    cleaned = cleaned.replace(/\*\*+/g, '*');

    // 4. Auto-wrap common roleplay action words inside quotes/ellipses with asterisks
    cleaned = cleaned.replace(/(\.\.\.\s*)(shrug|sigh|pant|gasp|groan|nod|wince|facepalm|shiver|chuckle|yawn|laugh|giggle|snicker|smirk|cough|snort|scoff|mumble|whisper|grunt|moan)(s|ed|ing)?(\b[\s,]*\.\.\.)/gi, '$1*$2$3*$4');

    // Tokenize the cleaned text to isolate HTML tags, markdown image syntax, and raw image URLs
    const tokenRegex = /(<\/?[a-zA-Z][^>]*>|!\[.*?\]\(.*?\)|https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s]*)?)/gi;
    const tokens = cleaned.split(tokenRegex);

    let html = '';
    let currentBuffer = '';
    let currentStyle = 'ai-other-text';
    
    let inCurlyQuote = false;
    let inStraightQuote = false;
    let inAsterisk = false;
    let parenDepth = 0;
    let bracketDepth = 0;
    const openTags = [];

    const isInQuote = () => inCurlyQuote || inStraightQuote;

    const flushBuffer = () => {
      if (currentBuffer) {
        html += `<span class="${currentStyle}">${escapeHTML(currentBuffer)}</span>`;
        currentBuffer = '';
      }
    };

    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx];
      if (!token) continue;

      if (idx % 2 === 0) {
        // This is a plain text chunk
        for (let i = 0; i < token.length; i++) {
          const char = token[i];
          
          // Determine if this character changes state
          if (char === '*') {
            inAsterisk = !inAsterisk;
          } else if (char === '\u201c' || char === '\u00ab') {
            inCurlyQuote = true;
          } else if (char === '\u201d' || char === '\u00bb') {
            inCurlyQuote = false;
          } else if (char === '"') {
            const prevChar = i > 0 ? token[i - 1] : (idx > 0 ? (tokens[idx - 1] || '').slice(-1) : '');
            // A quote mark directly after a digit is likely a measurement (e.g. 10") IF we aren't currently inside a quote.
            // If we are inside a quote, it's more likely the end of speech: "I am 10"
            const isMeasurement = !inStraightQuote && /[\d]/.test(prevChar);
            if (!isMeasurement) {
              inStraightQuote = !inStraightQuote;
            }
          } else if (char === '(') {
            parenDepth++;
          } else if (char === ')') {
            if (parenDepth > 0) parenDepth--;
          } else if (char === '[') {
            bracketDepth++;
          } else if (char === ']') {
            if (bracketDepth > 0) bracketDepth--;
          }
          
          // Determine combined styles for the current character
          let nextClasses = [];
          const isAction = inAsterisk || parenDepth > 0 || bracketDepth > 0;
          
          if (isInQuote()) {
            nextClasses.push('ai-quote-text');
          } else if (isAction) {
            nextClasses.push('ai-action-text');
          } else {
            nextClasses.push('ai-other-text');
          }
          
          let nextStyle = nextClasses.join(' ');
          
          // If style changes, flush current buffer
          if (nextStyle !== currentStyle) {
            let delimiterBelongsToOld = false;
            if (char === '*' && !inAsterisk) delimiterBelongsToOld = true; // closing asterisk
            if ((char === '"' || char === '”' || char === '»') && !isInQuote()) delimiterBelongsToOld = true; // closing quote
            if (char === ')' && parenDepth === 0) delimiterBelongsToOld = true; // closing parenthesis
            if (char === ']' && bracketDepth === 0) delimiterBelongsToOld = true; // closing bracket
            
            if (delimiterBelongsToOld) {
              if (char !== '*') currentBuffer += char;
              if (currentBuffer) {
                html += `<span class="${currentStyle}">${escapeHTML(currentBuffer)}</span>`;
                currentBuffer = '';
              }
              currentStyle = nextStyle;
            } else {
              if (currentBuffer) {
                html += `<span class="${currentStyle}">${escapeHTML(currentBuffer)}</span>`;
              }
              currentBuffer = char !== '*' ? char : '';
              currentStyle = nextStyle;
            }
          } else {
            if (char !== '*') currentBuffer += char;
          }
        }
      } else {
        // This is an HTML tag, markdown image, or raw image URL
        flushBuffer();
        
        if (token.startsWith('<')) {
          html += sanitizeHTMLTag(token, openTags);
        } else if (token.startsWith('!')) {
          const match = token.match(/!\[(.*?)\]\((.*?)\)/i);
          if (match) {
            const alt = match[1] || '';
            const url = match[2] || '';
            html += renderImageTag(url, alt);
          }
        } else {
          html += renderImageTag(token, '');
        }
      }
    }
    
    // Flush remaining buffer
    flushBuffer();

    // Auto-close any unclosed tags to prevent leaking layout/styles to other elements
    while (openTags.length > 0) {
      const tag = openTags.pop();
      html += `</${tag}>`;
    }
    
    return html;
  },

  replacePlaceholders(text, charName, userName) {
    return replacePlaceholders(text, charName, userName);
  },

  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },

  cleanStutters(text) {
    if (!text) return '';
    return text.replace(/\b([a-zA-Z]{1,2})-([a-zA-Z])/g, (match, p1, p2) => {
      if (p1.toLowerCase() === p2.toLowerCase()) {
        return p1 + ', ' + p2;
      }
      return match;
    });
  },

  extractDialogue(text) {
    if (!text) return '';
    // 1. Remove only the asterisk characters themselves, keeping the narration text inside them
    let cleanText = text.replace(/\*/g, ' ');
    // 2. Clean up stutter hyphens for better TTS flow
    cleanText = this.cleanStutters(cleanText);
    return cleanText.replace(/\s+/g, ' ').trim();
  }
};
