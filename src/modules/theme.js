import { safeSetItem } from '../utils.js';

export const themeMethods = {
  initStyleSettings() {
    const savedStyles = localStorage.getItem('jollyrp_style_settings');
    if (savedStyles) {
      try {
        this.styleSettings = JSON.parse(savedStyles);
      } catch (e) {
        this.styleSettings = this.getDefaultStyleSettings();
      }
    } else {
      this.styleSettings = this.getDefaultStyleSettings();
    }
    this.applyDynamicStyles();
  },

  getDefaultStyleSettings() {
    return {
      action: {
        fontFamily: "'Playfair Display', serif",
        fontFamilyCustom: "",
        color: "#c5a880", // accent-gold
        bold: false,
        italic: true,
        underline: false,
        strikethrough: false,
        fontSize: 14.5
      },
      quote: {
        fontFamily: "'Outfit', sans-serif",
        fontFamilyCustom: "",
        color: "#ffffff", // white
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        fontSize: 14.5
      },
      other: {
        fontFamily: "'Outfit', sans-serif",
        fontFamilyCustom: "",
        color: "#e2e8f0", // text-main
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        fontSize: 14.5
      }
    };
  },

  applyDynamicStyles() {
    let styleEl = document.getElementById('dynamic-ai-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamic-ai-styles';
      document.head.appendChild(styleEl);
    }

    const s = this.styleSettings;

    const generateRules = (setting) => {
      const font = setting.fontFamilyCustom ? setting.fontFamilyCustom : setting.fontFamily;
      let decs = [];
      if (setting.underline) decs.push('underline');
      if (setting.strikethrough) decs.push('line-through');
      
      return `
        font-family: ${font} !important;
        color: ${setting.color} !important;
        font-weight: ${setting.bold ? 'bold' : 'normal'} !important;
        font-style: ${setting.italic ? 'italic' : 'normal'} !important;
        text-decoration: ${decs.length > 0 ? decs.join(' ') : 'none'} !important;
        font-size: ${setting.fontSize || 14.5}px !important;
      `;
    };

    styleEl.innerHTML = `
      /* AI Actions formatting */
      .message-bubble.assistant .msg-content .ai-action-text {
        ${generateRules(s.action)}
      }
      /* AI Quotes/Speech formatting */
      .message-bubble.assistant .msg-content .ai-quote-text {
        ${generateRules(s.quote)}
      }
      /* AI Other/Narrative formatting */
      .message-bubble.assistant .msg-content .ai-other-text {
        ${generateRules(s.other)}
      }
    `;
  },

  setupStyleCustomizerListeners() {
    const panel = document.getElementById('chat-style-panel');
    const btnToggle = document.getElementById('btn-toggle-chat-style');
    const btnClose = document.getElementById('btn-close-chat-style');
    const btnReset = document.getElementById('btn-reset-chat-style');
    const btnSave = document.getElementById('btn-save-chat-style');

    if (btnToggle && panel) {
      btnToggle.addEventListener('click', () => {
        // Use getComputedStyle for reliable visibility — panel.style.display can
        // be empty string if display:none comes from a CSS rule, not an inline attr.
        const isHidden = getComputedStyle(panel).display === 'none';
        if (isHidden) {
          panel.style.display = 'flex';
          this.syncStylePanelToInputs();
        } else {
          panel.style.display = 'none';
        }
      });
    }

    if (btnClose && panel) {
      btnClose.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }

    if (btnSave && panel) {
      btnSave.addEventListener('click', () => {
        safeSetItem('jollyrp_style_settings', JSON.stringify(this.styleSettings));
        this.saveData();
        panel.style.display = 'none';
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm("Reset styling to default values?")) {
          this.styleSettings = this.getDefaultStyleSettings();
          this.applyDynamicStyles();
          this.syncStylePanelToInputs();
          safeSetItem('jollyrp_style_settings', JSON.stringify(this.styleSettings));
          this.saveData();
        }
      });
    }

    // Set up real-time listener binding helper
    const bindRealtimeEvents = (prefix, key) => {
      const selectFont = document.getElementById(`style-${prefix}-font`);
      const inputFontCustom = document.getElementById(`style-${prefix}-font-custom`);
      const colorPicker = document.getElementById(`style-${prefix}-color-picker`);
      const colorText = document.getElementById(`style-${prefix}-color-text`);
      const sizeRange = document.getElementById(`style-${prefix}-size`);
      const sizeVal = document.getElementById(`style-${prefix}-size-val`);
      const cbBold = document.getElementById(`style-${prefix}-bold`);
      const cbItalic = document.getElementById(`style-${prefix}-italic`);
      const cbUnderline = document.getElementById(`style-${prefix}-underline`);
      const cbStrikethrough = document.getElementById(`style-${prefix}-strikethrough`);

      const update = () => {
        if (!this.styleSettings) return;
        this.styleSettings[key].fontFamily = selectFont.value;
        this.styleSettings[key].fontFamilyCustom = inputFontCustom.value.trim();
        this.styleSettings[key].color = colorText.value.trim() || colorPicker.value;
        this.styleSettings[key].fontSize = parseFloat(sizeRange.value);
        if (sizeVal) sizeVal.textContent = sizeRange.value;
        this.styleSettings[key].bold = cbBold.checked;
        this.styleSettings[key].italic = cbItalic.checked;
        this.styleSettings[key].underline = cbUnderline.checked;
        this.styleSettings[key].strikethrough = cbStrikethrough.checked;
        
        // Sync color picker
        if (/^#[0-9A-F]{6}$/i.test(colorText.value.trim())) {
          colorPicker.value = colorText.value.trim();
        }

        this.applyDynamicStyles();
      };

      if (selectFont) selectFont.addEventListener('change', update);
      if (inputFontCustom) inputFontCustom.addEventListener('input', update);
      if (sizeRange) sizeRange.addEventListener('input', update);
      if (cbBold) cbBold.addEventListener('change', update);
      if (cbItalic) cbItalic.addEventListener('change', update);
      if (cbUnderline) cbUnderline.addEventListener('change', update);
      if (cbStrikethrough) cbStrikethrough.addEventListener('change', update);

      if (colorPicker && colorText) {
        colorPicker.addEventListener('input', () => {
          colorText.value = colorPicker.value;
          update();
        });
        colorText.addEventListener('input', () => {
          update();
        });
      }
    };

    bindRealtimeEvents('action', 'action');
    bindRealtimeEvents('quote', 'quote');
    bindRealtimeEvents('other', 'other');
  },

  syncStylePanelToInputs() {
    const s = this.styleSettings;
    if (!s) return;

    const syncSection = (prefix, setting) => {
      const selectFont = document.getElementById(`style-${prefix}-font`);
      const inputFontCustom = document.getElementById(`style-${prefix}-font-custom`);
      const colorPicker = document.getElementById(`style-${prefix}-color-picker`);
      const colorText = document.getElementById(`style-${prefix}-color-text`);
      const sizeRange = document.getElementById(`style-${prefix}-size`);
      const sizeVal = document.getElementById(`style-${prefix}-size-val`);
      const cbBold = document.getElementById(`style-${prefix}-bold`);
      const cbItalic = document.getElementById(`style-${prefix}-italic`);
      const cbUnderline = document.getElementById(`style-${prefix}-underline`);
      const cbStrikethrough = document.getElementById(`style-${prefix}-strikethrough`);

      if (selectFont) selectFont.value = setting.fontFamily;
      if (inputFontCustom) inputFontCustom.value = setting.fontFamilyCustom || '';
      if (colorText) colorText.value = setting.color;
      if (colorPicker && /^#[0-9A-F]{6}$/i.test(setting.color)) {
        colorPicker.value = setting.color;
      }
      if (sizeRange) sizeRange.value = setting.fontSize || 14.5;
      if (sizeVal) sizeVal.textContent = setting.fontSize || 14.5;
      if (cbBold) cbBold.checked = setting.bold;
      if (cbItalic) cbItalic.checked = setting.italic;
      if (cbUnderline) cbUnderline.checked = setting.underline;
      if (cbStrikethrough) cbStrikethrough.checked = setting.strikethrough;
    };

    syncSection('action', s.action);
    syncSection('quote', s.quote);
    syncSection('other', s.other);
  },

  setupScenarioThemePanelListeners() {
    const panel = document.getElementById('scenario-theme-panel');
    const btnToggle = document.getElementById('btn-toggle-scenario-theme');
    const btnClose = document.getElementById('btn-close-scenario-theme');
    const btnSave = document.getElementById('btn-save-scenario');
    
    const tabBtnScenario = document.getElementById('tab-btn-scenario');
    const tabBtnThemes = document.getElementById('tab-btn-themes');
    const tabContentScenario = document.getElementById('tab-content-scenario');
    const tabContentThemes = document.getElementById('tab-content-themes');
    
    const authorsNoteInput = document.getElementById('setting-authors-note');
    const authorsNoteDepthInput = document.getElementById('setting-authors-note-depth');
    const authorsNoteDepthVal = document.getElementById('authors-note-depth-val');
    const systemOverrideInput = document.getElementById('setting-system-override');
    
    if (btnToggle && panel) {
      btnToggle.addEventListener('click', () => {
        const isHidden = getComputedStyle(panel).display === 'none';
        if (isHidden) {
          panel.style.display = 'flex';
          this.syncScenarioPanelToInputs();
        } else {
          panel.style.display = 'none';
        }
      });
    }
    
    if (btnClose && panel) {
      btnClose.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }
    
    // Tab switching
    if (tabBtnScenario && tabBtnThemes && tabContentScenario && tabContentThemes) {
      tabBtnScenario.addEventListener('click', () => {
        tabBtnScenario.classList.add('active');
        tabBtnScenario.style.borderBottomColor = 'var(--accent-gold)';
        tabBtnScenario.style.color = 'var(--accent-gold)';
        tabBtnScenario.style.fontWeight = '600';
        
        tabBtnThemes.classList.remove('active');
        tabBtnThemes.style.borderBottomColor = 'transparent';
        tabBtnThemes.style.color = 'var(--text-muted)';
        tabBtnThemes.style.fontWeight = 'normal';
        
        tabContentScenario.style.display = 'flex';
        tabContentThemes.style.display = 'none';
      });
      
      tabBtnThemes.addEventListener('click', () => {
        tabBtnThemes.classList.add('active');
        tabBtnThemes.style.borderBottomColor = 'var(--accent-gold)';
        tabBtnThemes.style.color = 'var(--accent-gold)';
        tabBtnThemes.style.fontWeight = '600';
        
        tabBtnScenario.classList.remove('active');
        tabBtnScenario.style.borderBottomColor = 'transparent';
        tabBtnScenario.style.color = 'var(--text-muted)';
        tabBtnScenario.style.fontWeight = 'normal';
        
        tabContentThemes.style.display = 'flex';
        tabContentScenario.style.display = 'none';
      });
    }
    
    if (authorsNoteDepthInput && authorsNoteDepthVal) {
      authorsNoteDepthInput.addEventListener('input', () => {
        authorsNoteDepthVal.textContent = authorsNoteDepthInput.value;
      });
    }
    
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const session = this.isRoomActive() ? this.getRoomSession() : this.getActiveSession();
        if (!session) return;
        
        session.authorsNote = authorsNoteInput.value.trim();
        session.authorsNoteDepth = parseInt(authorsNoteDepthInput.value) || 3;
        session.systemPromptOverride = systemOverrideInput.value.trim();
        
        // Save per-character models if in a room
        if (this.isRoomActive() && session.roomCharIds) {
          session.roomCharModels = session.roomCharModels || {};
          const selects = document.querySelectorAll('.scenario-char-model-select');
          selects.forEach(select => {
            const charId = select.getAttribute('data-char-id');
            session.roomCharModels[charId] = select.value;
          });
        }
        
        this.saveSessions();
        panel.style.display = 'none';
        this.showToast('✅ Scenario settings applied!');
      });
    }
    
    // Theme card events
    const themeCards = document.querySelectorAll('#themes-grid .theme-card');
    themeCards.forEach(card => {
      card.addEventListener('click', () => {
        const theme = card.getAttribute('data-theme');
        this.applyTheme(theme);
      });
    });
  },

  setupStoryTimelineListeners() {
    const panel = document.getElementById('story-timeline-panel');
    const btnToggle = document.getElementById('btn-toggle-story-timeline');
    const btnClose = document.getElementById('btn-close-story-timeline');

    if (btnToggle && panel) {
      btnToggle.addEventListener('click', () => {
        const isHidden = getComputedStyle(panel).display === 'none';
        if (isHidden) {
          panel.style.display = 'flex';
          this.renderTimelineTree();
        } else {
          panel.style.display = 'none';
        }
      });
    }

    if (btnClose && panel) {
      btnClose.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }
  },

  renderTimelineTree() {
    const container = document.getElementById('timeline-tree-container');
    if (!container) return;
    container.innerHTML = '';

    if (!this.activeCharacterId) {
      container.innerHTML = `<div style="padding:16px; font-size:12px; color:var(--text-muted); text-align:center;">Select a companion to view timeline.</div>`;
      return;
    }

    const chats = this.sessions[this.activeCharacterId] || [];
    if (chats.length === 0) {
      container.innerHTML = `<div style="padding:16px; font-size:12px; color:var(--text-muted); text-align:center;">No conversation timeline found.</div>`;
      return;
    }

    // Group chats by parentSessionId
    const chatMap = {};
    chats.forEach(c => {
      chatMap[c.id] = c;
    });

    const roots = [];
    const childrenMap = {};

    chats.forEach(c => {
      const parentId = c.parentSessionId;
      if (parentId && chatMap[parentId]) {
        if (!childrenMap[parentId]) {
          childrenMap[parentId] = [];
        }
        childrenMap[parentId].push(c);
      } else {
        roots.push(c);
      }
    });

    // Sort roots by createdAt or id
    roots.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    const renderNode = (chat, parentElement) => {
      const item = document.createElement('div');
      item.className = `timeline-branch-item ${chat.id === this.activeChatId ? 'active' : ''}`;
      
      const meta = document.createElement('div');
      meta.className = 'timeline-branch-meta';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'timeline-branch-name';
      nameSpan.textContent = chat.name || "Conversation";

      const detailSpan = document.createElement('span');
      detailSpan.className = 'timeline-branch-detail';
      const msgCount = chat.messages ? chat.messages.length : 0;
      const timeStr = chat.createdAt ? new Date(chat.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      detailSpan.textContent = `${msgCount} msgs ${timeStr ? '• ' + timeStr : ''}`;

      meta.appendChild(nameSpan);
      meta.appendChild(detailSpan);
      item.appendChild(meta);

      item.addEventListener('click', () => {
        this.activeChatId = chat.id;
        this.renderChatThread();
        this.renderMemoryLedger();
        this.renderConversationsList();
        this.renderTimelineTree();
      });

      parentElement.appendChild(item);

      const children = childrenMap[chat.id] || [];
      if (children.length > 0) {
        children.sort((a, b) => (a.forkIndex || 0) - (b.forkIndex || 0) || (a.createdAt || 0) - (b.createdAt || 0));
        
        children.forEach(child => {
          const indentContainer = document.createElement('div');
          indentContainer.className = 'timeline-branch-indent';
          renderNode(child, indentContainer);
          parentElement.appendChild(indentContainer);
        });
      }
    };

    roots.forEach(root => {
      renderNode(root, container);
    });
  },

  syncScenarioPanelToInputs() {
    const session = this.isRoomActive() ? this.getRoomSession() : this.getActiveSession();
    if (!session) return;
    
    const authorsNoteInput = document.getElementById('setting-authors-note');
    const authorsNoteDepthInput = document.getElementById('setting-authors-note-depth');
    const authorsNoteDepthVal = document.getElementById('authors-note-depth-val');
    const systemOverrideInput = document.getElementById('setting-system-override');
    
    if (authorsNoteInput) authorsNoteInput.value = session.authorsNote || '';
    if (authorsNoteDepthInput) {
      authorsNoteDepthInput.value = session.authorsNoteDepth || 3;
      if (authorsNoteDepthVal) authorsNoteDepthVal.textContent = authorsNoteDepthInput.value;
    }
    if (systemOverrideInput) systemOverrideInput.value = session.systemPromptOverride || '';
    
    // Populate per-character models if in a room
    const modelAssignmentContainer = document.getElementById('room-model-assignment-container');
    if (modelAssignmentContainer) {
      if (this.isRoomActive()) {
        modelAssignmentContainer.style.display = 'block';
        this.populateScenarioPerCharacterModels(session);
      } else {
        modelAssignmentContainer.style.display = 'none';
      }
    }
  },

  populateScenarioPerCharacterModels(session) {
    const container = document.getElementById('room-character-model-list');
    if (!container) return;
    container.innerHTML = '';
    
    const charIds = session.roomCharIds || [];
    const chars = charIds.map(id => this.characters.find(c => c.id === id)).filter(Boolean);
    
    chars.forEach(char => {
      const assignedModel = (session.roomCharModels && session.roomCharModels[char.id]) || '';
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '8px';
      
      const charNameSpan = document.createElement('span');
      charNameSpan.style.fontSize = '12px';
      charNameSpan.style.color = 'var(--text-main)';
      charNameSpan.textContent = char.name;
      
      const select = document.createElement('select');
      select.className = 'scenario-char-model-select input-field';
      select.setAttribute('data-char-id', char.id);
      select.style.width = '180px';
      select.style.height = '28px';
      select.style.fontSize = '11px';
      select.style.padding = '2px 4px';
      
      const MODEL_OPTIONS = [
        { id: '', name: '🌍 Global Active Model' },
        { id: 'openrouter/free', name: '🤖 Auto-Free' },
        { id: 'meta-llama/llama-3-8b-instruct:free', name: '🦙 Llama 3 8B (Free)' },
        { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Φ Phi 3 (Free)' },
        { id: 'qwen/qwen-2-7b-instruct:free', name: 'q Qwen 2 7B (Free)' },
        { id: 'gryphe/mythomax-l2-13b', name: '🎭 MythoMax 13B' },
        { id: 'deepseek/deepseek-chat', name: '🐳 DeepSeek V3' },
        { id: 'google/gemini-flash-1.5', name: '♊ Gemini 1.5 Flash' },
        { id: 'anthropic/claude-3.5-sonnet', name: '🔮 Claude 3.5 Sonnet' },
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
        customOpt.textContent = `⚙️ ${assignedModel}`;
        customOpt.selected = true;
        select.appendChild(customOpt);
      }
      
      select.addEventListener('change', () => {
        if (select.value === 'custom') {
          const customVal = prompt(`Enter custom OpenRouter model ID:`, assignedModel || '');
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
            customOpt.textContent = `⚙️ ${customVal.trim()}`;
            customOpt.selected = true;
            select.appendChild(customOpt);
          } else {
            select.value = '';
          }
        }
      });
      
      row.appendChild(charNameSpan);
      row.appendChild(select);
      container.appendChild(row);
    });
  },

  applyTheme(themeName) {
    const themes = ['default', 'cyberpunk', 'cozy-tavern', 'gothic', 'terminal', 'lavender'];
    themes.forEach(t => {
      document.body.classList.remove(`theme-${t}`);
    });
    
    if (themeName !== 'default') {
      document.body.classList.add(`theme-${themeName}`);
    }
    
    // Update theme active status in panel grid
    const cards = document.querySelectorAll('#themes-grid .theme-card');
    cards.forEach(card => {
      const isCurrent = card.getAttribute('data-theme') === themeName;
      if (isCurrent) {
        card.classList.add('active');
        card.style.borderColor = 'var(--accent-gold)';
      } else {
        card.classList.remove('active');
        card.style.borderColor = '';
      }
    });
    
    safeSetItem('jollyrp_theme', themeName);
    this.saveData();
  },

  updateDirectorModeUi() {
    const btn = document.getElementById('btn-toggle-director');
    const input = document.getElementById('chat-input');
    const container = document.querySelector('.chat-input-box-container');
    if (!btn) return;
    if (this.directorModeActive) {
      btn.classList.add('active');
      btn.classList.add('pulse-director');
      if (input) {
        input.placeholder = "Enter narrator event or scene directive (e.g., *It starts raining heavily, making everyone shiver*)...";
      }
      if (container) {
        container.classList.add('director-active');
      }
    } else {
      btn.classList.remove('active');
      btn.classList.remove('pulse-director');
      if (input) {
        input.placeholder = "Type your action or speech here... Use asterisks *for actions* (e.g. *I sit down and wave*), normal text for speech.";
      }
      if (container) {
        container.classList.remove('director-active');
      }
    }
  },

  setupBannedWordsPanelListeners() {
    const panel = document.getElementById('banned-words-panel');
    const btnToggle = document.getElementById('btn-toggle-banned-words');
    const btnClose = document.getElementById('btn-close-banned-words');
    const input = document.getElementById('banned-word-input');
    const btnAdd = document.getElementById('btn-add-banned-word');
    const btnClear = document.getElementById('btn-clear-banned-words');

    if (btnToggle && panel) {
      btnToggle.addEventListener('click', () => {
        const isHidden = getComputedStyle(panel).display === 'none';
        if (isHidden) {
          panel.style.display = 'flex';
          this.renderBannedWordsList();
        } else {
          panel.style.display = 'none';
        }
      });
    }

    if (btnClose && panel) {
      btnClose.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }

    const addWord = () => {
      if (!input) return;
      const word = input.value.trim();
      if (!word) return;
      if (this.bannedWords.includes(word)) {
        this.showToast('Word/phrase already blacklisted.');
        input.value = '';
        return;
      }
      this.bannedWords.push(word);
      input.value = '';
      this.saveBannedWordsState();
      this.renderBannedWordsList();
    };

    if (btnAdd) {
      btnAdd.addEventListener('click', addWord);
    }

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addWord();
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (this.bannedWords.length === 0) return;
        if (confirm("Are you sure you want to clear all blacklisted words/phrases?")) {
          this.bannedWords = [];
          this.saveBannedWordsState();
          this.renderBannedWordsList();
        }
      });
    }
  },

  saveBannedWordsState() {
    safeSetItem('jollyrp_banned_words', JSON.stringify(this.bannedWords || []));
    this.saveData();
  },

  renderBannedWordsList() {
    const listContainer = document.getElementById('banned-words-list');
    const countEl = document.getElementById('banned-words-count');
    const badgeEl = document.getElementById('banned-words-badge');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const words = this.bannedWords || [];
    
    // Update count text
    if (countEl) {
      countEl.textContent = `${words.length} word${words.length === 1 ? '' : 's'} active`;
    }

    // Update header badge
    if (badgeEl) {
      if (words.length > 0) {
        badgeEl.textContent = words.length;
        badgeEl.style.display = 'flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    if (words.length === 0) {
      listContainer.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); font-style: italic; width: 100%; text-align: center; padding: 12px 0;">No words blacklisted.</div>`;
      return;
    }

    words.forEach((word) => {
      const chip = document.createElement('span');
      chip.className = 'banned-word-chip';
      
      const textSpan = document.createElement('span');
      textSpan.textContent = word;
      
      const deleteBtn = document.createElement('span');
      deleteBtn.className = 'delete-word-btn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Remove blacklist rule';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.bannedWords = this.bannedWords.filter(w => w !== word);
        this.saveBannedWordsState();
        this.renderBannedWordsList();
      });

      chip.appendChild(textSpan);
      chip.appendChild(deleteBtn);
      listContainer.appendChild(chip);
    });
  }
};
