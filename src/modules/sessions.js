import { _formatLocaleString, safeSetItem, stripHtmlTags, escapeHTML } from '../utils.js';
import { replacePlaceholders } from '../memory.js';

export const sessionsMethods = {
  saveSessions(skipRenderMyChats = false) {
    // Debounce the localStorage write & obfuscation of sessions so it does not block main thread
    if (this._saveSessionsTimeout) clearTimeout(this._saveSessionsTimeout);
    this._saveSessionsTimeout = setTimeout(() => {
      safeSetItem('jollyrp_sessions', _formatLocaleString(JSON.stringify(this.sessions)));
    }, 1000);

    // Only re-render the 'My Chats' landing panel when not mid-chat (expensive DOM rebuild)
    if (!skipRenderMyChats) {
      this.renderMyChats();
    }
    // Debounce the disk write so rapid consecutive saves (e.g. streaming) don't block the main thread
    if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
    this._saveDebounceTimer = setTimeout(() => {
      this._saveDebounceTimer = null;
      this.saveData();
    }, 1500);
  },

  updatePaginationUi(totalPages) {
    const show = totalPages > 1;

    // Bottom controls
    const controlsContainer = document.getElementById('grid-pagination-controls');
    if (controlsContainer) {
      controlsContainer.style.display = show ? 'flex' : 'none';
    }
    if (this.elements.btnPaginationPrev) {
      this.elements.btnPaginationPrev.style.display = (show && this.currentGridPage > 1) ? 'inline-block' : 'none';
    }
    if (this.elements.btnPaginationNext) {
      this.elements.btnPaginationNext.style.display = (show && this.currentGridPage < totalPages) ? 'inline-block' : 'none';
    }
    if (this.elements.paginationPageInfo) {
      this.elements.paginationPageInfo.style.display = show ? 'inline-block' : 'none';
      this.elements.paginationPageInfo.textContent = `Page ${this.currentGridPage} of ${totalPages}`;
    }

    // Top controls
    const controlsContainerTop = document.getElementById('grid-pagination-controls-top');
    if (controlsContainerTop) {
      controlsContainerTop.style.display = show ? 'flex' : 'none';
    }
    if (this.elements.btnPaginationTopPrev) {
      this.elements.btnPaginationTopPrev.disabled = this.currentGridPage <= 1;
    }
    if (this.elements.btnPaginationTopNext) {
      this.elements.btnPaginationTopNext.disabled = this.currentGridPage >= totalPages;
    }
    if (this.elements.paginationTopPageInfo) {
      this.elements.paginationTopPageInfo.textContent = `${this.currentGridPage} of ${totalPages}`;
    }
  },

  renderMyChats() {
    const container = this.elements.myChatsContainer;
    if (!container) return;
    
    // Skip rendering if the landing screen is hidden to prevent lag during active chats
    if (this.elements.landingScreen && this.elements.landingScreen.style.display === 'none') {
      return;
    }
    
    container.innerHTML = '';
    
    const activeChats = [];
    const charsById = new Map(this.characters.map(char => [char.id, char]));
    Object.keys(this.sessions).forEach(charId => {
      const char = charsById.get(charId);
      if (!char) return;
      
      const chats = this.sessions[charId] || [];
      chats.forEach(chat => {
        activeChats.push({ char, chat, charId });
      });
    });
    
    if (activeChats.length === 0) {
      container.innerHTML = `
        <div style="padding: 24px; border: 1.5px dashed var(--border-muted); border-radius: var(--radius-md); text-align: center; color: var(--text-muted); font-size: 12.5px; width: 100%; box-sizing: border-box;">
          No active conversations yet. Choose a companion below to start roleplaying!
        </div>
      `;
      return;
    }
    
    const fragment = document.createDocumentFragment();
    activeChats.forEach(item => {
      let lastTime = 0;
      if (typeof item.chat.createdAt === 'number') {
        lastTime = item.chat.createdAt;
      } else if (item.chat.createdAt) {
        lastTime = new Date(item.chat.createdAt).getTime() || 0;
      }

      if (item.chat.messages && item.chat.messages.length > 0) {
        // Check recent messages for valid msg_ timestamps
        const checkLimit = Math.max(0, item.chat.messages.length - 10);
        for (let i = item.chat.messages.length - 1; i >= checkLimit; i--) {
          const msg = item.chat.messages[i];
          if (msg && msg.id && msg.id.startsWith('msg_')) {
            const ts = parseInt(msg.id.split('_')[1]);
            if (!isNaN(ts)) {
              lastTime = Math.max(lastTime, ts);
              break; // Found the most recent valid timestamp
            }
          }
        }
      }
      item.lastActiveTime = isNaN(lastTime) ? 0 : lastTime;
    });
    activeChats.sort((a, b) => b.lastActiveTime - a.lastActiveTime);
    
    // Only render top 20 recent chats to prevent massive DOM block
    const recentChats = activeChats.slice(0, 20);
    
    recentChats.forEach(item => {
      const lastMsgObj = item.chat.messages[item.chat.messages.length - 1];
      const lastMsgText = lastMsgObj ? lastMsgObj.content : '';
      const activePersonaId = item.chat.personaId || 'persona_default';
      const activePersona = this.getActivePersona(activePersonaId);
      const cleanedLastMsg = this.replacePlaceholders(lastMsgText, item.char.name, activePersona.name || 'User');
      // Strip markdown asterisks and formatting symbols for a cleaner plain text preview
      const noMarkdownMsg = cleanedLastMsg.replace(/[*_~`#]/g, '');
      const previewText = escapeHTML(stripHtmlTags(noMarkdownMsg).substring(0, 120).trim() + (noMarkdownMsg.length > 120 ? '...' : ''));
      const relativeTime = this.formatRelativeTime(item.lastActiveTime);
      const msgCount = item.chat.messages.length;
      
      // Show session name only for non-default sessions (forked branches, custom names)
      const sessionName = item.chat.name && item.chat.name !== 'New Chat' && item.chat.name !== item.char.name ? escapeHTML(item.chat.name) : '';
      
      const isNsfw = item.char.nsfw || 
                     (item.char.tags && item.char.tags.some(t => t.toLowerCase() === 'nsfw')) || 
                     (item.char.topics && item.char.topics.some(t => t.toLowerCase() === 'nsfw'));
      const shouldBlur = isNsfw && this.nsfwBlur;

      const isNameLong = item.char.name.length > 20;
      const charNameHtml = isNameLong 
        ? `<span class="has-tooltip" data-tooltip="${escapeHTML(item.char.name)}">${escapeHTML(item.char.name.substring(0, 17) + '...')}</span>`
        : `<span>${escapeHTML(item.char.name)}</span>`;

      const card = document.createElement('div');
      card.className = 'my-chats-card';
      if (isNsfw) card.classList.add('nsfw-card');
      
      card.innerHTML = `
        <div class="my-chats-card-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          ${charNameHtml}
        </div>
        
        <div class="my-chats-card-body">
          <img class="my-chats-card-img ${shouldBlur ? 'nsfw-blurred' : ''}" src="${item.char.avatar}" alt="${escapeHTML(item.char.name)}" loading="lazy" decoding="async">
          <div class="my-chats-card-text">${previewText}</div>
        </div>
        
        <div class="my-chats-card-footer">
          <div class="my-chats-card-meta">
            <span class="my-chats-card-meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${relativeTime}
            </span>
            <span class="my-chats-card-meta-item">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              ${msgCount} messages
            </span>
          </div>
          <button class="my-chats-card-btn">Continue</button>
        </div>
      `;
      
      card.addEventListener('click', () => {
        this.startExistingChat(item.charId, item.chat.id);
      });
      
      fragment.appendChild(card);
    });
    container.appendChild(fragment);
  },

  startExistingChat(charId, chatId) {
    const char = this.characters.find(c => c.id === charId);
    if (!char) return;
    
    this.activeCharacterId = charId;
    this.activeChatId = chatId;
    safeSetItem('jollyrp_active_char', charId);
    
    this.showChatScreen();
    
    this.setChatHeaderName(char.name);
    this.elements.chatHeaderAvatar.src = char.avatar;
    this.elements.chatHeaderTagline.textContent = char.tagline;
    
    // Patch legacy messages missing IDs — once on session load
    const session = this.getActiveSession();
    this.patchSessionMessageIds(session);
    
    // Force scroll lock reset so new chat starts at bottom
    this._userScrolledUp = false;
    
    this.renderChatThread();
    this.scheduleIdleWork(() => {
      this.renderMemoryLedger();
      this.renderSidebarOnly();
      this.renderConversationsList();
      this.generateSuggestedChoices();
    }, 500);
  },

  getActiveSession() {
    const chats = this.sessions[this.activeCharacterId];
    if (!chats || chats.length === 0) return null;
    return chats.find(c => c.id === this.activeChatId) || chats[0];
  },

  patchSessionMessageIds(session) {
    if (!session || !session.messages) return;
    let lastTs = 0;
    session.messages.forEach(msg => {
      if (!msg.id) {
        // Increment timestamp slightly to guarantee uniqueness within the same ms
        const ts = Math.max(Date.now(), lastTs + 1);
        lastTs = ts;
        msg.id = `msg_${ts}_${Math.random().toString(36).substr(2, 9)}`;
      }
    });
  },

  forkSessionAtMessage(messageId) {
    const chat = this.isRoomActive() ? this.getRoomSession() : this.getActiveSession();
    if (!chat || !chat.messages) return;

    const msgIndex = chat.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const forkedMessages = chat.messages.slice(0, msgIndex + 1);
    const lastMsg = forkedMessages[forkedMessages.length - 1];
    
    let snippet = "Branch";
    if (lastMsg && lastMsg.content) {
      const cleanText = lastMsg.content.replace(/[*"]/g, '').trim();
      if (cleanText) {
        snippet = cleanText.substring(0, 18).trim() + (cleanText.length > 18 ? '...' : '');
      }
    }
    const forkedName = `Branch: ${snippet}`;
    const newChatId = `chat_fork_${Date.now()}`;

    const newChat = {
      id: newChatId,
      name: forkedName,
      messages: JSON.parse(JSON.stringify(forkedMessages)),
      ledger: chat.ledger || "",
      memoryChunks: JSON.parse(JSON.stringify(chat.memoryChunks || [])),
      chunkCursor: msgIndex + 1, // fork cursor starts at the fork point
      count: chat.count || 0,
      createdAt: Date.now(),
      personaId: chat.personaId || 'persona_default',
      parentSessionId: chat.id,
      forkMsgId: messageId,
      forkIndex: msgIndex
    };

    if (!this.sessions[this.activeCharacterId]) {
      this.sessions[this.activeCharacterId] = [];
    }
    this.sessions[this.activeCharacterId].push(newChat);
    this.activeChatId = newChatId;

    this.saveSessions();
    this.renderChatThread();
    this.scheduleIdleWork(() => {
      this.renderMemoryLedger();
      this.renderConversationsList();
    }, 500);
    if (typeof this.renderTimelineTree === 'function') {
      this.renderTimelineTree();
    }
    
    // Toast notification
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '80px';
    toast.style.right = '24px';
    toast.style.background = 'rgba(26, 26, 30, 0.96)';
    toast.style.border = '1.5px solid var(--accent-gold)';
    toast.style.color = 'var(--text-main)';
    toast.style.padding = '10px 18px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '12.5px';
    toast.style.fontFamily = 'var(--font-brand)';
    toast.style.zIndex = '9999';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
    toast.textContent = `🌱 Created new story branch: "${snippet}"`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 2500);
  },

  renderConversationsList() {
    const container = this.elements.sidebarChatList;
    if (!container) return;
    container.innerHTML = '';
    
    if (!this.activeCharacterId) {
      container.innerHTML = `<div style="padding:16px; font-size:12px; color:var(--text-muted); text-align:center;">Select a companion to view chats.</div>`;
      return;
    }
    
    const chats = this.sessions[this.activeCharacterId] || [];
    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = `character-item ${chat.id === this.activeChatId ? 'active' : ''}`;
      item.style.padding = '8px 12px';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      
      const titleSpan = document.createElement('span');
      titleSpan.textContent = chat.name || "Conversation";
      titleSpan.style.cursor = 'pointer';
      titleSpan.style.flex = '1';
      titleSpan.style.whiteSpace = 'nowrap';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.fontSize = '13px';
      titleSpan.addEventListener('click', () => {
        this.activeChatId = chat.id;
        this.renderChatThread();
        this.renderMemoryLedger();
        this.renderConversationsList();
      });
      
      // Action buttons
      const actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.gap = '6px';
      actionsDiv.style.alignItems = 'center';
      
      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn-icon';
      renameBtn.style.padding = '2px';
      renameBtn.style.color = 'var(--text-muted)';
      renameBtn.style.background = 'none';
      renameBtn.style.border = 'none';
      renameBtn.style.cursor = 'pointer';
      renameBtn.title = 'Rename chat';
      renameBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
        </svg>
      `;
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt("Enter new chat name:", chat.name);
        if (newName && newName.trim()) {
          chat.name = newName.trim();
          this.saveSessions();
          this.renderConversationsList();
        }
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-icon';
      deleteBtn.style.padding = '2px';
      deleteBtn.style.color = 'var(--accent-crimson)';
      deleteBtn.style.background = 'none';
      deleteBtn.style.border = 'none';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.title = 'Delete chat';
      deleteBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chats.length <= 1) {
          alert("You must keep at least one conversation.");
          return;
        }
        this.showCustomConfirmDelete(
          "Delete this conversation?",
          "This will permanently delete this conversation and all its chat history.",
          async () => {
            const charId = this.activeCharacterId;
            const sessionId = chat.id;
            this.sessions[charId] = chats.filter(c => c.id !== sessionId);
            if (this.activeChatId === sessionId) {
              this.activeChatId = this.sessions[charId][0].id;
            }
            // Update localStorage immediately
            safeSetItem('jollyrp_sessions', _formatLocaleString(JSON.stringify(this.sessions)));
            // Explicitly call DELETE endpoint
            try {
              await fetch(`/api/chats/${encodeURIComponent(charId)}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
            } catch (err) {
              console.warn('DELETE /api/chats failed:', err);
            }
            this.renderChatThread();
            this.renderMemoryLedger();
            this.renderConversationsList();
          }
        );
      });
      
      actionsDiv.appendChild(renameBtn);
      actionsDiv.appendChild(deleteBtn);
      
      item.appendChild(titleSpan);
      item.appendChild(actionsDiv);
      container.appendChild(item);
    });
    this.renderTimelineTree();
  },

  renderHistoryList() {
    const container = this.elements.historyListContainer;
    if (!container) return;
    container.innerHTML = '';

    const selectedCharId = this.elements.historyFilterChar.value;
    const searchVal = this.elements.historyFilterSearch.value.trim().toLowerCase();
    const sortBy = this.elements.historySortBy.value;

    let allChats = [];
    Object.keys(this.sessions).forEach(charId => {
      const char = this.characters.find(c => c.id === charId);
      if (!char) return;

      const chats = this.sessions[charId] || [];
      chats.forEach(chat => {
        allChats.push({
          ...chat,
          character: char
        });
      });
    });

    // Filter by character
    if (selectedCharId && selectedCharId !== 'all') {
      allChats = allChats.filter(chat => chat.character.id === selectedCharId);
    }

    // Filter by search keyword
    if (searchVal) {
      allChats = allChats.filter(chat => {
        const matchesTitle = (chat.name || '').toLowerCase().includes(searchVal);
        const matchesMessages = chat.messages.some(msg => (msg.content || '').toLowerCase().includes(searchVal));
        return matchesTitle || matchesMessages;
      });
    }

    // Sort
    if (sortBy === 'recent') {
      allChats.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (sortBy === 'oldest') {
      allChats.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } else if (sortBy === 'msg-desc') {
      allChats.sort((a, b) => b.messages.length - a.messages.length);
    } else if (sortBy === 'msg-asc') {
      allChats.sort((a, b) => a.messages.length - b.messages.length);
    }

    if (allChats.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; border: 1px dashed var(--border-muted); border-radius: var(--radius-sm); color: var(--text-muted); background: var(--bg-secondary);">
          <div style="font-size: 32px; margin-bottom: 12px;">📁</div>
          <p style="font-size: 14px; margin: 0;">No conversations found matching the filters.</p>
        </div>
      `;
      return;
    }

    allChats.forEach(chat => {
      const card = document.createElement('div');
      card.className = 'glass-panel';
      card.style.padding = '18px 24px';
      card.style.border = '1px solid var(--border-muted)';
      card.style.borderRadius = 'var(--radius-sm)';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';
      card.style.gap = '16px';
      card.style.background = 'var(--bg-secondary)';
      card.style.transition = 'var(--transition-smooth)';
      
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--accent-gold)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'var(--border-muted)';
      });

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '14px';
      left.style.flex = '1';
      left.style.cursor = 'pointer';
      
      const avatar = document.createElement('img');
      avatar.src = chat.character.avatar;
      avatar.style.width = '48px';
      avatar.style.height = '48px';
      avatar.style.borderRadius = '50%';
      avatar.style.objectFit = 'cover';
      avatar.style.border = '2px solid var(--border-muted)';

      const info = document.createElement('div');
      info.style.flex = '1';
      
      const nameRow = document.createElement('div');
      nameRow.style.display = 'flex';
      nameRow.style.alignItems = 'center';
      nameRow.style.gap = '8px';
      
      const chatTitle = document.createElement('span');
      chatTitle.textContent = chat.name || "Conversation";
      chatTitle.style.fontWeight = '700';
      chatTitle.style.fontSize = '15px';
      chatTitle.style.color = 'var(--text-main)';

      const charBadge = document.createElement('span');
      charBadge.textContent = chat.character.name;
      charBadge.style.fontSize = '10px';
      charBadge.style.padding = '2px 8px';
      charBadge.style.background = 'rgba(197, 168, 128, 0.12)';
      charBadge.style.color = 'var(--accent-gold)';
      charBadge.style.borderRadius = '10px';
      charBadge.style.border = '1px solid rgba(197, 168, 128, 0.25)';

      nameRow.appendChild(chatTitle);
      nameRow.appendChild(charBadge);

      const preview = document.createElement('div');
      const lastMsg = chat.messages[chat.messages.length - 1];
      const rawPreview = lastMsg ? lastMsg.content : '';
      const activePersonaId = chat.personaId || 'persona_default';
      const activePersona = this.getActivePersona(activePersonaId);
      const rawPreviewText = this.replacePlaceholders(rawPreview, chat.character.name, activePersona.name || 'User');
      const noMarkdownText = stripHtmlTags(rawPreviewText).replace(/[*_~`#]/g, '');
      preview.textContent = noMarkdownText.length > 85 ? noMarkdownText.substring(0, 85) + '...' : noMarkdownText;
      preview.style.fontSize = '12px';
      preview.style.color = 'var(--text-muted)';
      preview.style.marginTop = '4px';

      const meta = document.createElement('div');
      const dateStr = new Date(chat.createdAt || Date.now()).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      meta.textContent = `${chat.messages.length} messages • Active on ${dateStr}`;
      meta.style.fontSize = '10.5px';
      meta.style.color = 'var(--text-muted)';
      meta.style.marginTop = '6px';

      info.appendChild(nameRow);
      info.appendChild(preview);
      info.appendChild(meta);

      left.appendChild(avatar);
      left.appendChild(info);

      left.addEventListener('click', () => {
        this.activeCharacterId = chat.character.id;
        safeSetItem('jollyrp_active_char', chat.character.id);
        this.activeChatId = chat.id;

        // Hide history screen, show chat
        this.showChatScreen();

        this.setChatHeaderName(chat.character.name);
        this.elements.chatHeaderAvatar.src = chat.character.avatar;
        this.elements.chatHeaderTagline.textContent = chat.character.tagline;

        this.renderChatThread();
        this.renderMemoryLedger();
        this.renderCharacterLists();
        this.generateSuggestedChoices();
      });

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.gap = '8px';

      const renameBtn = document.createElement('button');
      renameBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-gold);"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
      `;
      renameBtn.style.background = 'none';
      renameBtn.style.border = 'none';
      renameBtn.style.cursor = 'pointer';
      renameBtn.style.padding = '6px';
      renameBtn.title = 'Rename Conversation';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt("Enter new conversation name:", chat.name);
        if (newName && newName.trim()) {
          chat.name = newName.trim();
          this.saveSessions();
          this.renderHistoryList();
        }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-crimson);"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
      `;
      deleteBtn.style.background = 'none';
      deleteBtn.style.border = 'none';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.padding = '6px';
      deleteBtn.title = 'Delete Conversation';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showCustomConfirmDelete(
          "Delete this conversation?",
          "This will permanently delete this conversation and all its chat history.",
          async () => {
            const charId = chat.character.id;
            const sessionId = chat.id;
            this.sessions[charId] = (this.sessions[charId] || []).filter(c => c.id !== sessionId);
            // Update localStorage immediately
            safeSetItem('jollyrp_sessions', _formatLocaleString(JSON.stringify(this.sessions)));
            // Explicitly call DELETE endpoint
            try {
              await fetch(`/api/chats/${encodeURIComponent(charId)}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
            } catch (err) {
              console.warn('DELETE /api/chats failed:', err);
            }
            if (this.activeChatId === sessionId) {
              this.activeChatId = '';
            }
            this.renderHistoryList();
          }
        );
      });

      right.appendChild(renameBtn);
      right.appendChild(deleteBtn);

      card.appendChild(left);
      card.appendChild(right);
      container.appendChild(card);
    });
  }
};
