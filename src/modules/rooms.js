import { _formatLocaleString, safeSetItem, escapeHTML } from '../utils.js';
import { scanLorebook, synthesizeSystemPrompt, synthesizeRoomSystemPrompt, buildApiMessages, summarizeChunk, retrieveTopK, replacePlaceholders } from '../memory.js';

export const roomsMethods = {
  isRoomActive() {
    return typeof this.activeCharacterId === 'string' && this.activeCharacterId.startsWith('room_');
  },

  openRoomModal(editRoomId = null) {
    if (!this.elements.roomModal) return;
    this.editingRoomId = editRoomId;

    const titleEl = document.getElementById('room-modal-title');
    const saveBtnEl = this.elements.btnSaveRoom;

    if (editRoomId) {
      if (titleEl) titleEl.textContent = '👥 Edit Room';
      if (saveBtnEl) saveBtnEl.textContent = 'Save Changes';
    } else {
      if (titleEl) titleEl.textContent = '👥 Create Group Chat Room';
      if (saveBtnEl) saveBtnEl.textContent = 'Create Room';
      if (this.elements.roomName) this.elements.roomName.value = '';
      if (this.elements.roomGreeting) this.elements.roomGreeting.value = '';
      if (this.elements.roomContext) this.elements.roomContext.value = '';
    }

    // Populate character checkboxes
    const sel = this.elements.roomCharacterSelection;
    if (sel) {
      sel.innerHTML = '';
      const existingRoomCharIds = editRoomId
        ? (this.sessions[editRoomId]?.[0]?.roomCharIds || [])
        : [];

      this.characters.forEach(char => {
        const checked = existingRoomCharIds.includes(char.id) ? 'checked' : '';
        
        // Retrieve currently assigned model if editing
        const editRoomChat = editRoomId ? (this.sessions[editRoomId]?.[0] || {}) : {};
        const roomCharModels = editRoomChat.roomCharModels || {};
        const assignedModel = roomCharModels[char.id] || '';
        
        const item = document.createElement('div');
        item.className = 'room-char-checkbox-item';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.gap = '10px';
        item.style.padding = '4px 0';
        item.style.width = '100%';
        
        const leftPart = document.createElement('label');
        leftPart.style.display = 'flex';
        leftPart.style.alignItems = 'center';
        leftPart.style.gap = '10px';
        leftPart.style.flex = '1';
        leftPart.style.cursor = 'pointer';
        leftPart.innerHTML = `
          <input type="checkbox" class="room-char-checkbox" data-char-id="${char.id}" ${checked}>
          <img class="room-char-checkbox-avatar" src="${char.avatar}" alt="${escapeHTML(char.name)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjgiIHI9IjQiLz48cGF0aCBkPSJNNSAyMHYtMWE3IDcgMCAwIDEgMTQgMHYxIi8+PC9zdmc+'">
          <span class="room-char-checkbox-name">${escapeHTML(char.name)}</span>
        `;
        
        const rightPart = document.createElement('div');
        rightPart.style.display = 'flex';
        rightPart.style.alignItems = 'center';
        rightPart.style.gap = '8px';
        
        const select = document.createElement('select');
        select.className = 'room-char-model-select input-field';
        select.setAttribute('data-char-id', char.id);
        select.style.width = '140px';
        select.style.height = '26px';
        select.style.fontSize = '10px';
        select.style.padding = '2px 4px';
        
        const MODEL_OPTIONS = [
          { id: '', name: '🌍 Global Model' },
          { id: 'openrouter/free', name: '🤖 Auto-Free' },
          { id: 'meta-llama/llama-3-8b-instruct:free', name: '🦙 Llama 3 8B' },
          { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Φ Phi 3' },
          { id: 'qwen/qwen-2-7b-instruct:free', name: 'q Qwen 2 7B' },
          { id: 'gryphe/mythomax-l2-13b', name: '🎭 MythoMax 13B' },
          { id: 'deepseek/deepseek-chat', name: '🐳 DeepSeek V3' },
          { id: 'google/gemini-flash-1.5', name: '♊ Gemini 1.5' },
          { id: 'custom', name: '⚙️ Custom...' }
        ];
        
        let modelFound = false;
        MODEL_OPTIONS.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.id;
          option.textContent = opt.name;
          if (opt.id === assignedModel) {
            option.selected = true;
            modelFound = true;
          }
          select.appendChild(option);
        });
        
        if (assignedModel && !modelFound) {
          const customOpt = document.createElement('option');
          customOpt.value = assignedModel;
          customOpt.textContent = `⚙️ ${assignedModel.substr(0,12)}...`;
          customOpt.selected = true;
          select.appendChild(customOpt);
        }
        
        select.addEventListener('change', () => {
          if (select.value === 'custom') {
            const customVal = prompt(`Enter custom model ID:`, assignedModel || '');
            if (customVal && customVal.trim()) {
              select.innerHTML = '';
              MODEL_OPTIONS.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.id;
                option.textContent = opt.name;
                select.appendChild(option);
              });
              const customOpt = document.createElement('option');
              customOpt.value = customVal.trim();
              customOpt.textContent = `⚙️ ${customVal.trim().substr(0,12)}...`;
              customOpt.selected = true;
              select.appendChild(customOpt);
            } else {
              select.value = '';
            }
          }
        });
        
        rightPart.appendChild(select);
        item.appendChild(leftPart);
        item.appendChild(rightPart);
        sel.appendChild(item);
      });
    }

    this.elements.roomModal.style.display = 'flex';
  },

  closeRoomModal() {
    if (this.elements.roomModal) this.elements.roomModal.style.display = 'none';
    this.editingRoomId = null;
  },

  saveRoom() {
    const name = this.elements.roomName ? this.elements.roomName.value.trim() : '';
    if (!name) { alert('Please enter a room name.'); return; }

    const checked = this.elements.roomCharacterSelection
      ? [...this.elements.roomCharacterSelection.querySelectorAll('.room-char-checkbox:checked')]
      : [];
    const selectedIds = checked.map(cb => cb.getAttribute('data-char-id'));
    if (selectedIds.length < 2) { alert('Please select at least 2 cast members.'); return; }

    const manualGreeting = this.elements.roomGreeting ? this.elements.roomGreeting.value.trim() : '';
    const context = this.elements.roomContext ? this.elements.roomContext.value.trim() : '';
    const selectedChars = selectedIds.map(id => this.characters.find(c => c.id === id)).filter(Boolean);

    const roomCharModels = {};
    if (this.elements.roomCharacterSelection) {
      const selects = this.elements.roomCharacterSelection.querySelectorAll('.room-char-model-select');
      selects.forEach(select => {
        const charId = select.getAttribute('data-char-id');
        if (selectedIds.includes(charId)) {
          roomCharModels[charId] = select.value;
        }
      });
    }

    if (this.editingRoomId) {
      const roomChats = this.sessions[this.editingRoomId] || [];
      roomChats.forEach(chat => {
        chat.roomName = name;
        chat.roomCharIds = selectedIds;
        chat.roomContext = context;
        chat.roomCharModels = roomCharModels;
      });
      this.saveSessions();
      this.renderRoomList();
      this.closeRoomModal();
      return;
    }

    const roomId = `room_${Date.now()}`;
    const openingMsgId = `msg_${Date.now()}`;

    // Use a placeholder; AI will replace it unless the user provided a manual greeting
    const placeholderContent = manualGreeting || '__GENERATING__';

    const newRoomChat = {
      id: `chat_${Date.now()}`,
      name: `Room Chat 1`,
      messages: [{ role: 'assistant', content: placeholderContent, id: openingMsgId }],
      ledger: '',
      memoryChunks: [],
      chunkCursor: 0,
      count: 0,
      createdAt: Date.now(),
      roomName: name,
      roomCharIds: selectedIds,
      roomContext: context,
      roomMuted: [],
      roomActiveSpeaker: selectedIds[0],
      roomAutoCycle: true,
      roomCharModels: roomCharModels
    };

    this.sessions[roomId] = [newRoomChat];
    this.saveSessions();
    this.renderRoomList();
    this.closeRoomModal();
    this.showToast(`✅ Room "${name}" created!`);
    this.startRoom(roomId, newRoomChat.id);

    // If no manual greeting, generate an AI opening scene
    if (!manualGreeting) {
      this.generateRoomOpening(roomId, newRoomChat.id, openingMsgId, name, selectedChars);
    }
  },

  async generateRoomOpening(roomId, chatId, msgId, roomName, chars) {
    if (this.apiProvider !== 'custom' && !this.apiKey) return;

    const chat = this.sessions[roomId]?.find(c => c.id === chatId);
    if (!chat) return;

    const roomContext = chat.roomContext || '';
    const roomContextInstruction = roomContext ? `ROOM CONTEXT / SCENARIO / DYNAMICS:\n${roomContext}\n` : '';

    const activePersonaId = chat ? chat.personaId : 'persona_default';
    const activePersona = this.getActivePersona(activePersonaId);
    const activePersonaName = activePersona ? (activePersona.name || 'User') : 'User';

    // Build a rich character context block
    const charBlocks = chars.map(c => {
      const tags = (c.tags || []).join(', ') || 'none';
      const isNsfw = c.nsfw || (c.tags && c.tags.some(t => t.toLowerCase() === 'nsfw'));
      const nsfwLabel = isNsfw ? ' [NSFW character]' : '';

      const singleSessions = this.sessions[c.id] || [];
      const latestSingleSession = singleSessions[0];
      const privateLedger = latestSingleSession ? (latestSingleSession.ledger || '') : '';
      const privateLedgerSection = privateLedger 
        ? `\nPrivate History / Relationship with ${activePersonaName} (secrets/events from private interactions):\n${privateLedger}` 
        : '';

      return `### ${c.name}${nsfwLabel}
  Tagline: ${c.tagline || ''}
  Description: ${c.description || c.personality || ''}
  Personality: ${c.personality || ''}
  Speech quirks: ${c.speechQuirks || 'none'}
  Tags: ${tags}${privateLedgerSection}`;
    }).join('\n\n');

    const nsfwAny = chars.some(c => c.nsfw || (c.tags && c.tags.some(t => t.toLowerCase() === 'nsfw')));
    const nsfwInstruction = (this.nsfwEnabled && nsfwAny)
      ? 'Adult / NSFW content is permitted where appropriate for the characters involved. Be tastefully suggestive or explicit as the characters and setting call for.'
      : 'Keep the content tasteful and appropriate for a general audience.';

    const systemPrompt = `You are a master creative writer specializing in collaborative fiction and roleplay. You will write the opening scene of a new group chat story.

  ROOM NAME: "${roomName}"

  ${roomContextInstruction}CAST OF CHARACTERS:
  ${charBlocks}

  WRITING RULES:
  - Write an immersive, vivid, cinematic opening scene that introduces ALL characters naturally.
  - Each character must speak or act at least once in a way that perfectly reflects their personality, speech quirks, and tags.
  - Use the [CharacterName]: prefix on EVERY character line, e.g.: [Barnaby]: *He polishes a mug...* "Welcome!"
  - Write narrative/action in italics with *asterisks*, dialogue in "quotes".
  - The scenario should organically fit the room name "${roomName}" as the setting or premise.
  - Make it engaging, surprising, and immediately hook the reader.
  - Do NOT include any meta-commentary, author notes, or explanations outside the scene itself.
  - ${nsfwInstruction}
  - ${roomContext ? `Ensure the scene strictly adheres to the ROOM CONTEXT / SCENARIO / DYNAMICS provided above.` : ''}
  - Length: 3–6 character exchanges total, rich in detail.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Write the opening scene now. Begin directly with the first character line. Use the [CharacterName]: prefix format.` }
    ];

    // Show streaming placeholder in the DOM bubble
    const bubble = this.elements.chatThread?.querySelector(`[data-msg-id="${msgId}"]`);
    const textNode = bubble?.querySelector('.msg-content');
    if (textNode) {
      textNode.innerHTML = `<span style="opacity:0.5;font-style:italic;animation:pulse 1.5s ease-in-out infinite;">✨ Crafting your opening scene...</span>`;
    }

    let generatedText = '';

    this.executeChatWithFallbacks({
      apiKey: this.apiKey,
      model: this.activeModel,
      messages,
      temperature: 0.95,   // High creativity for the opening scene
      provider: this.apiProvider,
      customUrl: this.customApiUrl,
      enableReasoning: this.reasoningEnabled,
      extraParams: {
        top_p: 0.97,
        max_tokens: Math.min(this.generationParams.max_tokens * 2, 1600)
      },
      onChunk: chunk => {
        generatedText += chunk;
        if (textNode) {
          const activePersonaId = chat ? chat.personaId : 'persona_default';
          const activePersona = this.getActivePersona(activePersonaId);
          const activePersonaName = activePersona ? (activePersona.name || 'User') : 'User';
          const cleanedText = this.replacePlaceholders(generatedText, chars[0] ? chars[0].name : 'Character', activePersonaName);
          textNode.innerHTML = this.formatAssistantText(cleanedText);
        }
        this.scrollToBottom();
      },
      onFinish: async fullText => {
        const activePersonaId = chat ? chat.personaId : 'persona_default';
        const activePersona = this.getActivePersona(activePersonaId);
        const activePersonaName = activePersona ? (activePersona.name || 'User') : 'User';
        const cleanedFullText = this.replacePlaceholders(fullText, chars[0] ? chars[0].name : 'Character', activePersonaName);

        // Persist the generated opening
        chat.messages[0] = {
          role: 'assistant',
          content: cleanedFullText,
          id: msgId,
          roomSpeakerId: null   // Multi-speaker; resolved per-bubble via [Name]: prefix
        };
        this.saveSessions();
        if (textNode) textNode.innerHTML = this.formatAssistantText(cleanedFullText);
        this.scrollToBottom();
        this.updateTokenUsage();
      },
      onError: err => {
        // Fall back to a generic intro if AI fails
        const activePersonaId = chat ? chat.personaId : 'persona_default';
        const activePersona = this.getActivePersona(activePersonaId);
        const activePersonaName = activePersona ? (activePersona.name || 'User') : 'User';
        
        const fallback = chars.map(c => {
          const rawGreeting = c.firstMessage ? c.firstMessage.split('\n')[0].replace(/^\*[^*]+\*\s*/, '').replace(/^"/, '').replace(/"$/, '') : 'Hello.';
          const cleanGreeting = this.replacePlaceholders(rawGreeting, c.name, activePersonaName);
          return `[${c.name}]: *${c.name} arrives.* "${cleanGreeting}"`;
        }).join('\n\n');
        chat.messages[0].content = fallback;
        this.saveSessions();
        if (textNode) textNode.innerHTML = this.formatAssistantText(fallback);
        console.warn('[Room Opening] AI generation failed, used fallback:', err.message);
      }
    });
  },

  renderRoomList() {
    const container = this.elements.sidebarRoomList;
    if (!container) return;
    container.innerHTML = '';

    const roomKeys = Object.keys(this.sessions).filter(k => k.startsWith('room_'));
    if (roomKeys.length === 0) {
      container.innerHTML = `<div style="padding:12px 14px; font-size:11px; color:var(--text-muted);">No rooms yet. Click + to create.</div>`;
      return;
    }

    roomKeys.forEach(roomId => {
      const roomChats = this.sessions[roomId];
      if (!roomChats || roomChats.length === 0) return;
      const latestChat = roomChats[0];
      const roomName = latestChat.roomName || 'Unnamed Room';
      const charIds = latestChat.roomCharIds || [];
      const chars = charIds.map(id => this.characters.find(c => c.id === id)).filter(Boolean);
      const isActive = this.activeCharacterId === roomId;

      const item = document.createElement('div');
      item.className = `character-item ${isActive ? 'active' : ''}`;
      item.style.padding = '8px 12px';
      item.style.cursor = 'pointer';

      // Overlapping avatars
      const avatarHtml = chars.slice(0, 4).map(c =>
        `<img class="room-avatar-overlap-item" src="${escapeHTML(c.avatar)}" alt="${escapeHTML(c.name)}" title="${escapeHTML(c.name)}" onerror="this.style.display='none'">`
      ).join('');

      item.innerHTML = `
        <div class="room-avatars-overlap" style="flex-shrink:0;">${avatarHtml}</div>
        <div class="char-info">
          <div class="char-name">${escapeHTML(roomName)}</div>
          <div class="char-tagline">${chars.map(c => c.name).join(', ')}</div>
        </div>
        <button class="room-menu-trigger btn-icon" title="Room options" style="color:var(--text-muted);padding:4px 6px;flex-shrink:0;border-radius:4px;transition:background 0.2s;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="12" cy="5" r="1"></circle>
            <circle cx="12" cy="19" r="1"></circle>
          </svg>
        </button>
      `;

      const menuTrigger = item.querySelector('.room-menu-trigger');
      menuTrigger.addEventListener('click', e => {
        e.stopPropagation();
        
        const existingMenu = document.querySelector('.room-dropdown-menu');
        if (existingMenu) {
          existingMenu.remove();
          if (existingMenu.dataset.roomId === roomId) {
            return;
          }
        }

        const dropdown = document.createElement('div');
        dropdown.className = 'room-dropdown-menu';
        dropdown.dataset.roomId = roomId;
        dropdown.style.position = 'fixed';
        dropdown.style.zIndex = '99999';
        dropdown.style.background = 'var(--bg-secondary)';
        dropdown.style.border = '1px solid var(--border-muted)';
        dropdown.style.borderRadius = 'var(--radius-md)';
        dropdown.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)';
        dropdown.style.padding = '4px';
        dropdown.style.minWidth = '140px';
        dropdown.style.display = 'flex';
        dropdown.style.flexDirection = 'column';
        dropdown.style.gap = '2px';
        
        dropdown.innerHTML = `
          <button class="dropdown-item edit" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:var(--text-main);padding:8px 12px;font-size:12px;cursor:pointer;border-radius:var(--radius-sm);text-align:left;transition:background 0.2s;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-gold);"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
            Rename / Edit
          </button>
          <button class="dropdown-item clear" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:var(--text-main);padding:8px 12px;font-size:12px;cursor:pointer;border-radius:var(--radius-sm);text-align:left;transition:background 0.2s;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-gold);"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            Clear History
          </button>
          <button class="dropdown-item delete" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:var(--accent-crimson);padding:8px 12px;font-size:12px;cursor:pointer;border-radius:var(--radius-sm);text-align:left;transition:background 0.2s;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-crimson);"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            Delete Room
          </button>
        `;

        const rect = menuTrigger.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
        dropdown.style.left = `${rect.right - 140 + window.scrollX}px`;

        document.body.appendChild(dropdown);

        dropdown.querySelectorAll('.dropdown-item').forEach(btn => {
          btn.addEventListener('mouseenter', () => btn.style.background = 'var(--bg-tertiary)');
          btn.addEventListener('mouseleave', () => btn.style.background = 'none');
        });

        dropdown.querySelector('.edit').addEventListener('click', () => {
          dropdown.remove();
          const roomChats = this.sessions[roomId] || [];
          const currentContext = roomChats[0]?.roomContext || '';
          if (this.elements.roomName) this.elements.roomName.value = roomName;
          if (this.elements.roomGreeting) this.elements.roomGreeting.value = '';
          if (this.elements.roomContext) this.elements.roomContext.value = currentContext;
          this.openRoomModal(roomId);
        });

        dropdown.querySelector('.clear').addEventListener('click', () => {
          dropdown.remove();
          if (confirm(`Are you sure you want to clear all chat history for "${roomName}"? This cannot be undone.`)) {
            const roomChats = this.sessions[roomId];
            if (roomChats && roomChats.length > 0) {
              const latestChat = roomChats[roomChats.length - 1];
              latestChat.messages = [];
              latestChat.ledger = '';
              this.saveSessions();
              this.showToast(`History cleared for room "${roomName}"`);
              if (this.activeCharacterId === roomId) {
                this.renderChatThread();
                this.renderMemoryLedger();
              }
            }
          }
        });

        dropdown.querySelector('.delete').addEventListener('click', async () => {
          dropdown.remove();
          if (confirm(`Are you sure you want to delete the group chat room "${roomName}"? This will permanently delete all logs.`)) {
            delete this.sessions[roomId];
            // Update localStorage immediately
            safeSetItem('jollyrp_sessions', _formatLocaleString(JSON.stringify(this.sessions)));
            // Explicitly DELETE room session folder from server
            try {
              await fetch(`/api/characters/${encodeURIComponent(roomId)}`, { method: 'DELETE' });
            } catch (err) {
              console.warn('DELETE /api/characters (room) failed:', err);
            }
            this.showToast(`Deleted room "${roomName}"`);
            if (this.activeCharacterId === roomId) {
              this.activeCharacterId = '';
              this.activeChatId = '';
              this.showLandingScreen();
            }
            this.renderRoomList();
            this.renderConversationsList();
          }
        });

        const dismissDropdown = eOutside => {
          if (!dropdown.contains(eOutside.target) && eOutside.target !== menuTrigger) {
            dropdown.remove();
            document.removeEventListener('click', dismissDropdown);
          }
        };
        setTimeout(() => {
          document.addEventListener('click', dismissDropdown);
        }, 10);
      });

      item.addEventListener('click', () => {
        const chatId = roomChats[roomChats.length - 1].id;
        this.startRoom(roomId, chatId);
      });

      container.appendChild(item);
    });
  },

  startRoom(roomId, chatId) {
    const roomChats = this.sessions[roomId];
    if (!roomChats || roomChats.length === 0) return;
    const chat = roomChats.find(c => c.id === chatId) || roomChats[roomChats.length - 1];
    const charIds = chat.roomCharIds || [];
    const chars = charIds.map(id => this.characters.find(c => c.id === id)).filter(Boolean);
    if (chars.length === 0) return;

    this.activeCharacterId = roomId;
    this.activeChatId = chat.id;

    // Update chat header for room
    const headerAvatar = this.elements.chatHeaderAvatar;
    const headerName = this.elements.chatHeaderName;
    const headerTagline = this.elements.chatHeaderTagline;
    if (headerName) this.setChatHeaderName(chat.roomName || 'Group Room');
    if (headerTagline) headerTagline.textContent = chars.map(c => c.name).join(' · ');

    // Swap single avatar for overlapping avatars in header
    if (headerAvatar) {
      headerAvatar.style.display = 'none';
      let overlapEl = document.getElementById('room-header-avatars');
      if (!overlapEl) {
        overlapEl = document.createElement('div');
        overlapEl.id = 'room-header-avatars';
        overlapEl.className = 'room-avatars-overlap';
        headerAvatar.parentNode.insertBefore(overlapEl, headerAvatar);
      }
      overlapEl.innerHTML = chars.slice(0, 4).map(c =>
        `<img src="${escapeHTML(c.avatar)}" alt="${escapeHTML(c.name)}" class="room-avatar-circle" onerror="this.src='https://api.dicebear.com/7.x/notionists/svg?seed=${c.id}';">`
      ).join('');
      overlapEl.style.display = 'inline-flex';
    }

    // Collapse left sidebar when a room is opened or created
    const sidebarLeft = document.querySelector('.sidebar-left');
    if (sidebarLeft && !sidebarLeft.classList.contains('collapsed')) {
      sidebarLeft.classList.add('collapsed');
      if (this.elements.btnToggleLeft) {
        this.elements.btnToggleLeft.classList.add('active');
      }
    }

    this.showChatScreen();
    this.renderSpeakerStrip(chat);
    this.renderChatThread();
    this.renderMemoryLedger();
    this.renderSidebarOnly();
    this.renderConversationsList();
    this.generateSuggestedChoices();
  },

  getRoomSession() {
    if (!this.isRoomActive()) return null;
    const roomChats = this.sessions[this.activeCharacterId];
    if (!roomChats || roomChats.length === 0) return null;
    return roomChats.find(c => c.id === this.activeChatId) || roomChats[roomChats.length - 1];
  },

  renderSpeakerStrip(chat) {
    const container = this.elements.roomSpeakerStripContainer;
    const chipsEl = this.elements.roomSpeakerChips;
    if (!container || !chipsEl) return;

    if (!this.isRoomActive() || !chat) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    chipsEl.innerHTML = '';

    const charIds = chat.roomCharIds || [];
    const chars = charIds.map(id => this.characters.find(c => c.id === id)).filter(Boolean);
    const muted = chat.roomMuted || [];
    const activeSpeaker = chat.roomActiveSpeaker || charIds[0];
    const autoCycle = chat.roomAutoCycle !== false;

    // Auto-Cycle chip
    const autoChip = document.createElement('button');
    autoChip.className = `speaker-chip ${autoCycle ? 'active' : ''}`;
    autoChip.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
      </svg>
      Auto
    `;
    autoChip.title = 'Toggle Auto Mode (AI decides who speaks)';
    autoChip.addEventListener('click', () => {
      chat.roomAutoCycle = !chat.roomAutoCycle;
      this.saveSessions();
      this.renderSpeakerStrip(chat);
    });
    chipsEl.appendChild(autoChip);

    chars.forEach(char => {
      const isMuted = muted.includes(char.id);
      const isActive = !autoCycle && (char.id === activeSpeaker);

      const chip = document.createElement('div');
      chip.className = `speaker-chip ${isActive ? 'active' : ''} ${isMuted ? 'muted' : ''}`;
      chip.title = `Click: select speaker | Double-click: toggle mute`;
      const muteIcon = isMuted ? `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px; color: var(--accent-crimson); flex-shrink: 0;">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M9 9v6a3 3 0 0 0 3 3h1.586l4.707 4.707A1 1 0 0 0 20 22V4a1 1 0 0 0-1.707-.707L13.586 8H12a3 3 0 0 0-3 3z"></path>
        </svg>
      ` : '';
      chip.innerHTML = `<img class="speaker-chip-avatar" src="${escapeHTML(char.avatar)}" alt="${escapeHTML(char.name)}"> <span>${escapeHTML(char.name)}</span>${muteIcon}`;
      if (isMuted) chip.title += ' [Muted]';

      chip.addEventListener('click', () => {
        this.setRoomActiveSpeaker(chat, char.id);
      });
      chip.addEventListener('dblclick', e => {
        e.preventDefault();
        const idx = muted.indexOf(char.id);
        if (idx === -1) {
          chat.roomMuted = [...muted, char.id];
        } else {
          chat.roomMuted = muted.filter(id => id !== char.id);
        }
        this.saveSessions();
        this.renderSpeakerStrip(chat);
        this.showToast(idx === -1 ? `${char.name} muted` : `${char.name} unmuted`);
      });

      // Quick trigger reply button
      const triggerBtn = document.createElement('button');
      triggerBtn.className = 'speaker-chip-trigger';
      triggerBtn.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      `;
      triggerBtn.title = `Trigger immediate reply from ${char.name}`;
      triggerBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        chat.roomActiveSpeaker = char.id;
        chat.roomAutoCycle = false;
        this.saveSessions();
        this.renderSpeakerStrip(chat);
        await this.handleRoomSendMessage('', true);
      });
      chip.appendChild(triggerBtn);

      chipsEl.appendChild(chip);
    });
  },

  setRoomActiveSpeaker(chat, charId) {
    chat.roomActiveSpeaker = charId;
    chat.roomAutoCycle = false;
    this.saveSessions();
    this.renderSpeakerStrip(chat);
  },

  advanceRoomSpeaker(chat) {
    const charIds = chat.roomCharIds || [];
    const muted = chat.roomMuted || [];
    const unmuted = charIds.filter(id => !muted.includes(id));
    if (unmuted.length === 0) return;

    const currentIdx = unmuted.indexOf(chat.roomActiveSpeaker);
    const nextIdx = (currentIdx + 1) % unmuted.length;
    chat.roomActiveSpeaker = unmuted[nextIdx];
    this.saveSessions();
    this.renderSpeakerStrip(chat);
  },

  async triggerNextReply() {
    if (this.isRoomActive()) {
      await this.triggerNextRoomSpeaker();
    } else {
      await this.triggerNextSingleReply();
    }
  },

  async triggerNextSingleReply() {
    if (this.activeStreamController) return;
    if (this.apiProvider !== 'custom' && !this.apiKey) {
      this.toggleModal('settingsModal', true);
      alert(`An API key/token is required to send messages on OpenRouter. Please check your API Settings.`);
      return;
    }

    const session = this.getActiveSession();
    const char = this.characters.find(c => c.id === this.activeCharacterId);
    if (!session || !char) return;

    const activePersona = this.getActivePersona(session.personaId);

    const lastMsg = session.messages[session.messages.length - 1];
    const lastMsgText = lastMsg ? lastMsg.content : '';
    const matchedLore = scanLorebook(lastMsgText, char.lorebook);
    this.renderActiveLore(matchedLore);

    // Retrieve relevant RAG memory chunks for triggerNextReply
    const ragQueryTrigger = lastMsgText + (session.messages.length > 1 ? ' ' + session.messages[session.messages.length - 2].content : '');
    const retrievedChunksTrigger = retrieveTopK(ragQueryTrigger, session.memoryChunks || [], 3);

    const systemPrompt = synthesizeSystemPrompt(char, session.ledger, matchedLore, {
      verbosity: this.verbosity,
      actionRatio: this.actionRatio,
      maxTokens: this.generationParams.max_tokens,
      systemPromptOverride: session.systemPromptOverride || ''
    }, activePersona, retrievedChunksTrigger);

    const messages = buildApiMessages(
      systemPrompt, 
      session.messages, 
      12, 
      this.instructTemplate, 
      char.name, 
      activePersona.name,
      session.authorsNote || '',
      session.authorsNoteDepth || 3
    );
    const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const bubble = this.appendMessageToDom('assistant', '...', session.messages.length, assistantMsgId);
    const textNode = bubble ? bubble.querySelector('.msg-content') : null;
    const accordion = bubble ? bubble.querySelector('.msg-thought-accordion') : null;
    const accordionContent = accordion ? accordion.querySelector('.msg-thought-content') : null;

    this.activeStreamController = new AbortController();
    this.setGeneratingState(true);
    if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = true;

    let assistantResponse = "";
    let assistantReasoning = "";
    let hasShownAccordion = false;
    let accordionAutoCollapsed = false;

    this.executeChatWithFallbacks({
      apiKey: this.apiKey,
      model: this.activeModel,
      messages,
      temperature: this.generationParams.temperature,
      signal: this.activeStreamController.signal,
      provider: this.apiProvider,
      customUrl: this.customApiUrl,
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
        if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = false;
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

        this.saveSessions();
        this.renderChatThread();
        this.analyzeMoodAndApplyTheme(fullText);
        this.generateSuggestedChoices();
      },
      onError: err => {
        this.setGeneratingState(false);
        if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = false;
        this.activeStreamController = null;
        if (assistantResponse && assistantResponse.trim()) {
          const cleaned = this.replacePlaceholders(assistantResponse, char.name, activePersona.name || 'User');
          session.messages.push({
            role: 'assistant',
            content: cleaned,
            id: assistantMsgId,
            swipes: [cleaned],
            swipeId: 0,
            reasoning: assistantReasoning || '',
            swipeReasonings: [assistantReasoning || '']
          });
          this.saveSessions();
          this.renderChatThread();
        } else if (err.name === 'AbortError' || err.message.toLowerCase().includes('abort')) {
          if (bubble) bubble.remove();
        } else if (textNode) {
          textNode.innerHTML = `<span style="color:var(--accent-crimson);">[Error: ${err.message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}]</span>`;
        }
      }
    });
  },

  async triggerNextRoomSpeaker() {
    const chat = this.getRoomSession();
    if (!chat) return;
    if (chat.roomAutoCycle !== false) {
      this.advanceRoomSpeaker(chat);
    }
    await this.handleRoomSendMessage('', true);
  },

  async handleRoomSendMessage(userText, isAutoTrigger = false, isChoice = false) {
    if (this.activeStreamController) return;
    if (this.apiProvider !== 'custom' && !this.apiKey) {
      this.toggleModal('settingsModal', true);
      return;
    }

    const chat = this.getRoomSession();
    if (!chat) return;
    const charIds = chat.roomCharIds || [];
    const chars = charIds.map(id => {
      const c = this.characters.find(char => char.id === id);
      if (!c) return null;
      const singleSessions = this.sessions[c.id] || [];
      const latestSingleSession = singleSessions[0];
      const privateLedger = latestSingleSession ? (latestSingleSession.ledger || '') : '';
      return {
        ...c,
        privateLedger: privateLedger
      };
    }).filter(Boolean);
    if (chars.length === 0) return;

    const activeSpeakerChar = chars.find(c => c.id === chat.roomActiveSpeaker) || chars[0];
    const activePersona = this.getActivePersona(chat.personaId);

    let cleanedUserText = '';
    if (!isAutoTrigger && userText) {
      let finalUserText = userText;
      if (this.directorModeActive && !isChoice) {
        finalUserText = `[NARRATOR DIRECTIVE — React in-character to this event]: ${userText}`;
      }
      cleanedUserText = this.replacePlaceholders(finalUserText, activeSpeakerChar.name, activePersona ? activePersona.name : 'User');
      const userMsgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      chat.messages.push({ role: 'user', content: cleanedUserText, id: userMsgId });
      this.saveSessions();
      this.appendRoomMessageToDom('user', cleanedUserText, chat.messages.length - 1, userMsgId, activeSpeakerChar);
      this.scrollToBottom();
    }

    const isAutoMode = chat.roomAutoCycle !== false;
    const roomMuted = chat.roomMuted || [];

    // Build all character lore, match from recent text
    const recentText = chat.messages.slice(-3).map(m => m.content).join(' ');
    const allLore = chars.flatMap(c => c.lorebook || []);
    const matchedLore = scanLorebook(recentText, allLore);

    // Retrieve relevant RAG memory chunks for room
    const retrievedChunksRoom = retrieveTopK(recentText, chat.memoryChunks || [], 3);

    const systemPrompt = synthesizeRoomSystemPrompt(
      chat.roomName || 'Group Room',
      chars,
      activeSpeakerChar.name,
      chat.ledger || '',
      matchedLore,
      { 
        verbosity: this.verbosity, 
        actionRatio: this.actionRatio, 
        maxTokens: this.generationParams.max_tokens,
        systemPromptOverride: chat.systemPromptOverride || '',
        bannedWords: this.bannedWords
      },
      activePersona,
      chat.roomContext || '',
      isAutoMode,
      roomMuted,
      retrievedChunksRoom
    );

    // Prefix assistant messages in history with speaker name for context
    const prefixedHistory = chat.messages.map(msg => {
      if (msg.role === 'assistant') {
        // already has [Name]: prefix or we inject it
        const hasPrefix = /^\s*(?:\*\*|)?\[?[^\]\*\:]+\]?(?:\*\*|)?\s*:/m.test(msg.content);
        if (hasPrefix) return msg;
        const speaker = chars.find(c => c.id === msg.roomSpeakerId);
        const prefixName = speaker ? speaker.name : (activeSpeakerChar ? activeSpeakerChar.name : 'Character');
        return { ...msg, content: `[${prefixName}]: ${msg.content}` };
      }
      return msg;
    });

    const messages = buildApiMessages(
      systemPrompt, 
      prefixedHistory, 
      12, 
      this.instructTemplate, 
      activeSpeakerChar.name, 
      activePersona ? activePersona.name : 'User',
      chat.authorsNote || '',
      chat.authorsNoteDepth || 3,
      !isAutoMode ? activeSpeakerChar.name : ''
    );

    const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const bubble = this.appendRoomMessageToDom('assistant', '...', chat.messages.length, assistantMsgId, activeSpeakerChar);
    const textNode = bubble ? bubble.querySelector('.msg-content') : null;
    const accordion = bubble ? bubble.querySelector('.msg-thought-accordion') : null;
    const accordionContent = accordion ? accordion.querySelector('.msg-thought-content') : null;

    this.setGeneratingState(true);
    if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = true;
    this.activeStreamController = new AbortController();
    let assistantResponse = '';
    let assistantReasoning = '';
    let hasShownAccordion = false;
    let accordionAutoCollapsed = false;

    this.executeChatWithFallbacks({
      apiKey: this.apiKey,
      model: (chat.roomCharModels && chat.roomCharModels[activeSpeakerChar.id]) || this.activeModel,
      messages,
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

          const parsedSpeaker = this.parseRoomSpeaker(assistantResponse, chars);
          if (parsedSpeaker) {
            const imgEl = bubble.querySelector('.msg-avatar');
            const nameEl = bubble.querySelector('.msg-sender-name-text') || bubble.querySelector('.msg-sender-name');
            if (nameEl) {
              const displayName = parsedSpeaker.name;
              if (displayName.length > 20) {
                nameEl.textContent = displayName.substring(0, 17) + '...';
                nameEl.setAttribute('data-tooltip', displayName);
                nameEl.classList.add('has-tooltip');
              } else {
                nameEl.textContent = displayName;
                nameEl.removeAttribute('data-tooltip');
                nameEl.classList.remove('has-tooltip');
              }
            }
            if (imgEl && imgEl.src !== parsedSpeaker.avatar) {
              imgEl.src = parsedSpeaker.avatar;
              imgEl.alt = parsedSpeaker.name;
            }
          }

          const formatted = this.formatAssistantText(this.stripRoomPrefix(assistantResponse));
          if (textNode) textNode.innerHTML = formatted;
        }
        this.scrollToBottom();
      },
      onFinish: async (fullText, fullReasoning) => {
        this.setGeneratingState(false);
        if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = false;
        this.activeStreamController = null;

        let speakerChar = activeSpeakerChar;
        const parsed = this.parseRoomSpeaker(fullText, chars);
        if (parsed) {
          speakerChar = parsed;
        }

        const cleanedFullText = this.replacePlaceholders(fullText, speakerChar.name, activePersona ? activePersona.name : 'User');
        chat.messages.push({
          role: 'assistant',
          content: cleanedFullText,
          id: assistantMsgId,
          swipes: [cleanedFullText],
          swipeId: 0,
          roomSpeakerId: speakerChar.id,
          reasoning: fullReasoning || '',
          swipeReasonings: [fullReasoning || '']
        });

        // Set the active speaker in the chat session so they are highlighted
        chat.roomActiveSpeaker = speakerChar.id;

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

        this.saveSessions();
        this.renderSpeakerStrip(chat);
        this.renderChatThread();

        // RAG Memory: chunk-and-store for room sessions
        if (this.autoSummarizeEnabled) {
          const CHUNK_SIZE = 10;
          const KEEP_N = 6;
          const MAX_CHUNKS = 150;
          if (!chat.memoryChunks) chat.memoryChunks = [];
          if (!chat.chunkCursor) chat.chunkCursor = 0;
          const available = chat.messages.length - chat.chunkCursor;
          if (available >= CHUNK_SIZE + KEEP_N) {
            const chunkMessages = chat.messages.slice(chat.chunkCursor, chat.messages.length - KEEP_N);
            const newCursor = chat.chunkCursor + chunkMessages.length;
            summarizeChunk(this.apiKey, this.activeModel, chunkMessages, this.apiProvider, this.customApiUrl)
              .then(chunk => {
                if (chunk) {
                  chat.memoryChunks.push(chunk);
                  if (chat.memoryChunks.length > MAX_CHUNKS) chat.memoryChunks = chat.memoryChunks.slice(-MAX_CHUNKS);
                  chat.chunkCursor = newCursor;
                  this.saveSessions();
                }
              }).catch(err => console.error('RAG room chunk failed:', err));
          }
        }

        this.analyzeMoodAndApplyTheme(fullText);
        this.generateSuggestedChoices();

        if (this.ttsSettings.autoplay) {
          const activeCharName = speakerChar ? speakerChar.name : (chars[0] ? chars[0].name : 'Character');
          const displayText = this.stripRoomPrefix(cleanedFullText);
          const ttsText = this.replacePlaceholders(displayText, activeCharName, activePersona ? activePersona.name : 'User');
          this.speakMessage(ttsText);
        }
      },
      onError: err => {
        this.setGeneratingState(false);
        if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = false;
        this.activeStreamController = null;
        if (assistantResponse && assistantResponse.trim()) {
          let speakerChar = activeSpeakerChar;
          const parsed = this.parseRoomSpeaker(assistantResponse, chars);
          if (parsed) speakerChar = parsed;
          const cleaned = this.replacePlaceholders(assistantResponse, speakerChar.name, activePersona ? activePersona.name : 'User');
          chat.messages.push({
            role: 'assistant',
            content: cleaned,
            id: assistantMsgId,
            swipes: [cleaned],
            swipeId: 0,
            roomSpeakerId: speakerChar.id,
            reasoning: assistantReasoning || '',
            swipeReasonings: [assistantReasoning || '']
          });
          chat.roomActiveSpeaker = speakerChar.id;
          this.saveSessions();
          this.renderSpeakerStrip(chat);
          this.renderChatThread();
        } else {
          if (err.name === 'AbortError' || err.message.toLowerCase().includes('abort')) {
            if (bubble) bubble.remove();
          } else if (textNode) {
            textNode.innerHTML = `<span style="color:var(--accent-crimson);">[Error: ${err.message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}]</span>`;
          }
        }
      }
    });
  },

  stripRoomPrefix(text) {
    return text.replace(/^\s*(?:\*\*|)?\[?[^\]\*\:]+\]?(?:\*\*|)?\s*:\s*/m, '');
  },

  parseRoomSpeaker(text, chars) {
    const match = text.match(/^\s*(?:\*\*|)?\[?([^\]\*\:]+)\]?(?:\*\*|)?\s*:/m);
    if (!match) return null;
    const name = match[1].trim().toLowerCase();
    
    // First: exact match
    let found = chars.find(c => c.name.toLowerCase() === name);
    if (found) return found;
    
    // Second: parsed name is a substring of character name, or character name is a substring of parsed name
    found = chars.find(c => {
      const cName = c.name.toLowerCase();
      // Remove symbols/taglines from character name for comparison (e.g. "Maggie (NSFW)" -> "maggie nsfw")
      const cleanCName = cName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      if (!cleanCName || !cleanName) return false;
      return cleanCName.startsWith(cleanName) || cleanName.startsWith(cleanCName) || cleanCName.includes(cleanName) || cleanName.includes(cleanCName);
    });
    
    return found;
  },

  appendRoomMessageToDom(role, text, index, msgId, fallbackChar, parent = this.elements.chatThread, deferEffects = false) {
    const chat = this.getRoomSession();
    const charIds = chat ? (chat.roomCharIds || []) : [];
    const chars = charIds.map(id => this.characters.find(c => c.id === id)).filter(Boolean);

    // Handle AI generation placeholder
    if (text === '__GENERATING__') {
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble assistant';
      bubble.setAttribute('data-msg-id', msgId || index);
      const avatarCluster = chars.slice(0, 3).map(c =>
        `<img class="room-avatar-overlap-item" src="${c.avatar}" alt="${escapeHTML(c.name)}" style="width:28px;height:28px;">`
      ).join('');
      bubble.innerHTML = `
        <div class="room-avatars-overlap" style="flex-shrink:0;align-self:flex-start;margin-top:4px;">${avatarCluster}</div>
        <div class="msg-content-wrapper" style="flex:1;min-width:0;">
          <span class="msg-sender-name">✨ The Story Begins</span>
          <div class="msg-content"><span style="opacity:0.55;font-style:italic;animation:pulse 1.5s ease-in-out infinite;">Crafting your opening scene...</span></div>
        </div>
      `;
      parent.appendChild(bubble);
      return bubble;
    }

    // Determine actual speaker from stored roomSpeakerId or prefix parse
    let speakerChar = fallbackChar;
    if (role === 'assistant') {
      const parsed = this.parseRoomSpeaker(text, chars);
      if (parsed) speakerChar = parsed;
    }

    // For multi-speaker AI-generated openings (no [Name]: prefix detected), show group avatar
    const isMultiSpeaker = role === 'assistant' && !speakerChar && !fallbackChar;

    const activePersonaId = chat ? chat.personaId : 'persona_default';
    const activePersona = this.getActivePersona(activePersonaId);
    const activePersonaName = activePersona ? (activePersona.name || 'User') : 'User';

    const safeText = text || '';
    const isDirector = safeText.startsWith('[NARRATOR DIRECTIVE — React in-character to this event]:');
    const directorAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231b1722'/><path d='M20 30h60v40H20z' fill='%23c5a880'/><path d='M20 30l10-10h10l-10 10h10l10-10h10l-10 10h10l10-10h10l-10 10h10l10-10' fill='%23fff'/></svg>";

    let avatar, name;
    if (isDirector) {
      avatar = directorAvatar;
      name = "🎬 Director Directive";
    } else if (role === 'user') {
      avatar = (activePersona ? activePersona.avatar : '') || this.defaultUserAvatar;
      name = activePersona ? activePersona.name : 'You';
    } else if (isMultiSpeaker) {
      avatar = null;
      name = '✨ The Story Begins';
    } else {
      avatar = speakerChar ? speakerChar.avatar : (chars[0] ? chars[0].avatar : '');
      name = speakerChar ? speakerChar.name : 'Character';
    }

    const isNameLong = name.length > 20;
    const nameHtml = isNameLong 
      ? `<span class="msg-sender-name-text has-tooltip" data-tooltip="${escapeHTML(name)}">${escapeHTML(name.substring(0, 17) + '...')}</span>`
      : `<span class="msg-sender-name-text">${escapeHTML(name)}</span>`;

    const displayText = role === 'assistant' ? this.stripRoomPrefix(safeText) : safeText;
    const activeCharName = speakerChar ? speakerChar.name : (chars[0] ? chars[0].name : 'Character');
    const cleanedText = this.replacePlaceholders(displayText, activeCharName, activePersonaName);
    const displayHtmlText = isDirector
      ? cleanedText.replace('[NARRATOR DIRECTIVE — React in-character to this event]:', '').trim()
      : cleanedText;

    const formattedContent = role === 'assistant'
      ? this.formatAssistantText(displayHtmlText)
      : this.formatActionText(displayHtmlText);

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${role}${isDirector ? ' director' : ''}`;
    bubble.setAttribute('data-msg-id', msgId || index);

    // Detect emotion & swap avatar sprite
    let emotion = 'default';
    if (role === 'assistant' && speakerChar && !isDirector) {
      emotion = this.detectMessageEmotion(displayHtmlText);
    }
    let activeAvatarUrl = avatar;
    if (role === 'assistant' && speakerChar && !isDirector && speakerChar.sprites && speakerChar.sprites[emotion]) {
      activeAvatarUrl = speakerChar.sprites[emotion];
    }

    let avatarHtml;
    if (isMultiSpeaker) {
      const avatarCluster = chars.slice(0, 3).map(c =>
        `<img class="room-avatar-overlap-item" src="${c.avatar}" alt="${escapeHTML(c.name)}" style="width:28px;height:28px;">`
      ).join('');
      avatarHtml = `<div class="room-avatars-overlap" style="flex-shrink:0;align-self:flex-start;margin-top:4px;">${avatarCluster}</div>`;
    } else {
      avatarHtml = avatar ? `<div class="avatar-container"><img class="msg-avatar ${emotion !== 'default' ? 'mood-' + emotion : ''}" src="${activeAvatarUrl}" alt="${escapeHTML(name)}"></div>` : '';
    }

    const showDelete = index > 0;
    const deleteBtnHtml = showDelete ? `
      <button class="msg-delete-btn" data-id="${msgId || index}" title="Delete message and response" style="background: none; border: none; cursor: pointer; align-items: center; justify-content: center; padding: 4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-crimson);"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      </button>
    ` : '';

    const speakBtnHtml = `
      <button class="msg-speak-btn" data-id="${msgId || index}" title="Speak message" style="background: none; border: none; cursor: pointer; align-items: center; justify-content: center; padding: 4px; margin-right: 4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-gold);"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
      </button>
    `;

    const forkBtnHtml = `
      <button class="msg-fork-btn" data-id="${msgId || index}" title="Fork Story from here" style="background: none; border: none; cursor: pointer; align-items: center; justify-content: center; padding: 4px; margin-right: 4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-gold);"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>
      </button>
    `;

    let swipeControlsHtml = '';
    let messageObj = null;
    if (role === 'assistant' && index > 0 && chat) {
      messageObj = chat.messages.find(m => m.id === msgId) || chat.messages[index];
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
      ${avatarHtml}
      <div class="msg-content-wrapper" style="position:relative;flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <span class="msg-sender-name">${nameHtml}</span>
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

    // Message actions are now handled fully in CSS with hardware acceleration and by the delegated event handler on the chat thread container.
    // Store displayHtmlText on the bubble for TTS delegation
    bubble._displayText = displayHtmlText;

    parent.appendChild(bubble);

    if (!deferEffects && emotion !== 'default' && chat && index === chat.messages.length - 1) {
      this.spawnMoodParticles(bubble.querySelector('.avatar-container'), emotion);
    }
    return bubble;
  },

  async regenerateRoomResponse(msgId) {
    if (this.activeStreamController) return;
    const chat = this.getRoomSession();
    if (!chat) return;

    const charIds = chat.roomCharIds || [];
    const chars = charIds.map(id => {
      const c = this.characters.find(char => char.id === id);
      if (!c) return null;
      const singleSessions = this.sessions[c.id] || [];
      const latestSingleSession = singleSessions[0];
      const privateLedger = latestSingleSession ? (latestSingleSession.ledger || '') : '';
      return {
        ...c,
        privateLedger: privateLedger
      };
    }).filter(Boolean);

    // Find the target message
    let msgIndex = -1;
    if (typeof msgId === 'string' && isNaN(Number(msgId))) {
      msgIndex = chat.messages.findIndex(m => m.id === msgId);
    }
    if (msgIndex === -1) msgIndex = parseInt(msgId);
    if (msgIndex < 0 || msgIndex >= chat.messages.length) return;

    const targetMsg = chat.messages[msgIndex];
    if (targetMsg.role !== 'assistant') return;

    // Determine original speaker
    let speakerChar = chars.find(c => c.id === targetMsg.roomSpeakerId)
      || this.parseRoomSpeaker(targetMsg.content, chars)
      || chars.find(c => c.id === chat.roomActiveSpeaker)
      || chars[0];

    const activePersona = this.getActivePersona(chat.personaId);

    // Truncate history to just before this message
    const historyForRegen = chat.messages.slice(0, msgIndex);

    const recentText = historyForRegen.slice(-3).map(m => m.content).join(' ');
    const allLore = chars.flatMap(c => c.lorebook || []);
    const matchedLore = scanLorebook(recentText, allLore);

    const isAutoMode = chat.roomAutoCycle !== false;
    const roomMuted = chat.roomMuted || [];

    const systemPrompt = synthesizeRoomSystemPrompt(
      chat.roomName || 'Group Room',
      chars,
      speakerChar.name,
      chat.ledger || '',
      matchedLore,
      { 
        verbosity: this.verbosity, 
        actionRatio: this.actionRatio, 
        maxTokens: this.generationParams.max_tokens,
        bannedWords: this.bannedWords
      },
      activePersona,
      chat.roomContext || '',
      isAutoMode,
      roomMuted
    );

    // Prefix assistant messages in history with speaker name for context
    const prefixedHistory = historyForRegen.map(msg => {
      if (msg.role === 'assistant') {
        const hasPrefix = /^\s*(?:\*\*|)?\[?[^\]\*\:]+\]?(?:\*\*|)?\s*:/m.test(msg.content);
        if (hasPrefix) return msg;
        const speaker = chars.find(c => c.id === msg.roomSpeakerId);
        const prefixName = speaker ? speaker.name : (speakerChar ? speakerChar.name : 'Character');
        return { ...msg, content: `[${prefixName}]: ${msg.content}` };
      }
      return msg;
    });

    const messages = buildApiMessages(
      systemPrompt, 
      prefixedHistory, 
      12, 
      this.instructTemplate, 
      speakerChar.name, 
      activePersona ? activePersona.name : 'User',
      chat.authorsNote || '',
      chat.authorsNoteDepth || 3,
      !isAutoMode ? speakerChar.name : ''
    );

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

    this.saveSessions();
    this.renderChatThread();

    // Query the DOM bubble for the regenerating message AFTER renderChatThread
    const existingBubble = this.elements.chatThread.querySelector(`[data-msg-id="${msgId}"]`);
    const textNode = existingBubble ? existingBubble.querySelector('.msg-content') : null;
    const accordion = existingBubble ? existingBubble.querySelector('.msg-thought-accordion') : null;
    const accordionContent = accordion ? accordion.querySelector('.msg-thought-content') : null;

    this.setGeneratingState(true);
    if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = true;
    this.activeStreamController = new AbortController();
    let newResponse = '';
    let assistantReasoning = '';
    let hasShownAccordion = false;
    let accordionAutoCollapsed = false;

    this.executeChatWithFallbacks({
      apiKey: this.apiKey,
      model: this.activeModel,
      messages,
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
          if (newResponse === '') {
            if (textNode) textNode.innerHTML = '';
            if (accordion && !accordionAutoCollapsed) {
              accordion.classList.add('collapsed');
              accordionAutoCollapsed = true;
            }
          }
          newResponse += chunk;

          if (existingBubble) {
            const parsedSpeaker = this.parseRoomSpeaker(newResponse, chars);
            if (parsedSpeaker) {
              const imgEl = existingBubble.querySelector('.msg-avatar');
              const nameEl = existingBubble.querySelector('.msg-sender-name-text') || existingBubble.querySelector('.msg-sender-name');
              if (nameEl) {
                const displayName = parsedSpeaker.name;
                if (displayName.length > 20) {
                  nameEl.textContent = displayName.substring(0, 17) + '...';
                  nameEl.setAttribute('data-tooltip', displayName);
                  nameEl.classList.add('has-tooltip');
                } else {
                  nameEl.textContent = displayName;
                  nameEl.removeAttribute('data-tooltip');
                  nameEl.classList.remove('has-tooltip');
                }
              }
              if (imgEl && imgEl.src !== parsedSpeaker.avatar) {
                imgEl.src = parsedSpeaker.avatar;
                imgEl.alt = parsedSpeaker.name;
              }
            }
          }

          if (textNode) textNode.innerHTML = this.formatAssistantText(this.stripRoomPrefix(newResponse));
        }
        this.scrollToBottom();
      },
      onFinish: async (fullText, fullReasoning) => {
        this.setGeneratingState(false);
        if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = false;
        this.activeStreamController = null;

        let finalSpeakerChar = speakerChar;
        const parsed = this.parseRoomSpeaker(fullText, chars);
        if (parsed) {
          finalSpeakerChar = parsed;
        }

        const cleaned = this.replacePlaceholders(fullText, finalSpeakerChar.name, activePersona ? activePersona.name : 'User');
        
        targetMsg.swipes[targetMsg.swipeId] = cleaned;
        targetMsg.content = cleaned;
        targetMsg.roomSpeakerId = finalSpeakerChar.id;
        targetMsg.swipeReasonings[targetMsg.swipeId] = fullReasoning || '';
        targetMsg.reasoning = fullReasoning || '';

        // Set the active speaker in the chat session so they are highlighted
        chat.roomActiveSpeaker = finalSpeakerChar.id;

        // Update accordion content in DOM if still present
        if (existingBubble) {
          const existingAccordion = existingBubble.querySelector('.msg-thought-accordion');
          const existingAccordionContent = existingAccordion ? existingAccordion.querySelector('.msg-thought-content') : null;
          if (existingAccordion && existingAccordionContent) {
            existingAccordionContent.textContent = fullReasoning || '';
            const hasReasoning = !!(fullReasoning || '').trim();
            existingAccordion.style.display = (this.showReasoning && hasReasoning) ? '' : 'none';
          }
        }

        this.saveSessions();
        this.renderSpeakerStrip(chat);
        this.renderChatThread();

        if (this.ttsSettings.autoplay) {
          const activeCharName = finalSpeakerChar ? finalSpeakerChar.name : (chars[0] ? chars[0].name : 'Character');
          const displayText = this.stripRoomPrefix(cleaned);
          const ttsText = this.replacePlaceholders(displayText, activeCharName, activePersona ? activePersona.name : 'User');
          this.speakMessage(ttsText);
        }
      },
      onError: err => {
        this.setGeneratingState(false);
        if (this.elements.btnTriggerNext) this.elements.btnTriggerNext.disabled = false;
        this.activeStreamController = null;
        if (targetMsg.swipes[targetMsg.swipeId] === '...') {
          targetMsg.swipes.pop();
          targetMsg.swipeReasonings.pop();
          targetMsg.swipeId = targetMsg.swipes.length - 1;
          targetMsg.content = targetMsg.swipes[targetMsg.swipeId] || '';
          targetMsg.reasoning = targetMsg.swipeReasonings[targetMsg.swipeId] || '';
          this.saveSessions(true);
        }
        if (err.name === 'AbortError' || err.message.toLowerCase().includes('abort')) {
          if (textNode) textNode.innerHTML = this.formatAssistantText(this.stripRoomPrefix(targetMsg.content));
        } else {
          if (textNode) textNode.innerHTML = `<span style="color:var(--accent-crimson);">[Error: ${err.message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}]</span>`;
        }
      }
    });
  }
};
