import { _formatLocaleString, safeSetItem, escapeHTML, stripHtmlTags, countTokens } from '../utils.js';
import { replacePlaceholders, synthesizeSystemPrompt, synthesizeRoomSystemPrompt, buildApiMessages, retrieveTopK, scanLorebook } from '../memory.js';
import { soundManager } from '../sounds.js';

export const uiMethods = {
  bindDomElements() {
    this.elements = {
      // Screens
      landingScreen: document.getElementById('landing-screen'),
      chatScreen: document.getElementById('chat-screen'),
      presetCardsGrid: document.getElementById('preset-cards-grid'),
      logoContainer: document.querySelector('.logo-container'),
      loadingScreen: document.getElementById('loading-screen'),
      loadingBarFill: document.getElementById('loading-bar-fill'),
      loadingText: document.getElementById('loading-text'),
      myChatsContainer: document.getElementById('my-chats-container'),
      
      // Sidebar lists
      sidebarCharList: document.getElementById('sidebar-char-list'),
      sidebarChatList: document.getElementById('sidebar-chat-list'),
      
      // Modals
      settingsModal: document.getElementById('settings-modal'),
      studioModal: document.getElementById('studio-modal'),
      profileModal: document.getElementById('profile-modal'),
      
      // Tag Filter Bar
      tagFilterBar: document.getElementById('tag-filter-bar'),
      tagPillsContainer: document.getElementById('tag-pills-container'),
      activeTagIndicator: document.getElementById('active-tag-indicator'),
      activeTagText: document.getElementById('active-tag-text'),
      btnClearTag: document.getElementById('btn-clear-tag'),
      tagCountLabel: document.getElementById('tag-count-label'),
      
      // Grid Pagination Controls
      btnPaginationPrev: document.getElementById('btn-pagination-prev'),
      btnPaginationNext: document.getElementById('btn-pagination-next'),
      paginationPageInfo: document.getElementById('pagination-page-info'),
      btnPaginationTopPrev: document.getElementById('btn-pagination-top-prev'),
      btnPaginationTopNext: document.getElementById('btn-pagination-top-next'),
      paginationTopPageInfo: document.getElementById('pagination-top-page-info'),
      
      // History Screen
      historyScreen: document.getElementById('history-screen'),
      btnConvoHistory: document.getElementById('btn-convo-history'),
      historyBtnBack: document.getElementById('history-btn-back'),
      historyFilterChar: document.getElementById('history-filter-char'),
      historyFilterSearch: document.getElementById('history-filter-search'),
      historySortBy: document.getElementById('history-sort-by'),
      historyListContainer: document.getElementById('history-list-container'),
      
      // Studio upload
      studioAvatarFile: document.getElementById('studio-avatar-file'),
      
      // Profile details
      profileAvatar: document.getElementById('profile-avatar'),
      profileName: document.getElementById('profile-name'),
      profileTagline: document.getElementById('profile-tagline'),
      profileBio: document.getElementById('profile-bio'),
      profilePersonality: document.getElementById('profile-personality'),
      profileSliderExtro: document.getElementById('profile-slider-extro'),
      profileSliderChaos: document.getElementById('profile-slider-chaos'),
      profileSliderWarmth: document.getElementById('profile-slider-warmth'),
      profileSliderIntel: document.getElementById('profile-slider-intel'),
      profileChatsList: document.getElementById('profile-chats-list'),
      profileBtnNewChat: document.getElementById('profile-btn-new-chat'),
      profileBtnClose: document.getElementById('profile-btn-close'),
      profileBtnFav: document.getElementById('profile-btn-fav'),
      profileBtnEdit: document.getElementById('profile-btn-edit'),
      profileBtnDelete: document.getElementById('profile-btn-delete'),
      studioModalTitle: document.getElementById('studio-modal-title'),
      
      // Buttons
      btnOpenSettings: document.getElementById('btn-open-settings'),
      btnLockApp: document.getElementById('btn-lock-app'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      btnOpenStudio: document.getElementById('btn-open-studio'),
      btnOpenStudioLanding: document.getElementById('btn-open-studio-landing'),
      btnCloseStudio: document.getElementById('btn-close-studio'),
      btnExportData: document.getElementById('btn-export-data'),
      btnImportData: document.getElementById('btn-import-data'),
      importDataFile: document.getElementById('import-data-file'),
      btnSaveSettings: document.getElementById('btn-save-settings'),
      btnSaveCharacter: document.getElementById('btn-save-character'),
      btnSendMessage: document.getElementById('btn-send-message'),
      btnToggleLeft: document.getElementById('btn-toggle-left'),
      globalSearchModels: document.getElementById('global-search-models'),
      searchAutocompleteDropdown: document.getElementById('search-autocomplete-dropdown'),
      btnImportCard: document.getElementById('btn-import-card'),
      settingNsfwEnable: document.getElementById('setting-nsfw-enable'),
      settingNsfwBlur: document.getElementById('setting-nsfw-blur'),
      settingPinEnable: document.getElementById('setting-pin-enable'),
      settingPinCode: document.getElementById('setting-pin-code'),
      btnSourceLocal: document.getElementById('btn-source-local'),
      btnSourceCommunity: document.getElementById('btn-source-community'),
      
      // Chat inputs
      chatInput: document.getElementById('chat-input'),
      chatThread: document.getElementById('chat-thread'),
      chatHeaderName: document.getElementById('chat-header-name'),
      chatHeaderAvatar: document.getElementById('chat-header-avatar'),
      chatHeaderTagline: document.getElementById('chat-header-tagline'),
      moodOverlay: document.getElementById('mood-overlay'),
      
      // Forms / Inputs
      apiKeyInput: document.getElementById('setting-api-key'),
      apiKeyLabel: document.getElementById('setting-api-key-label'),
      modelSelect: document.getElementById('setting-model'),
      keyWarning: document.getElementById('key-warning'),
      providerSelect: document.getElementById('setting-provider'),
      customUrlGroup: document.getElementById('custom-url-group'),
      customUrlInput: document.getElementById('setting-custom-url'),
      customModelGroup: document.getElementById('custom-model-group'),
      customModelInput: document.getElementById('setting-custom-model'),
      modelSelectGroup: document.getElementById('model-select-group'),
      instructTemplateSelect: document.getElementById('setting-instruct'),
      fallbacksListContainer: document.getElementById('fallbacks-list-container'),
      btnAddFallback: document.getElementById('btn-add-fallback'),

      
      // Character Studio Inputs
      studioName: document.getElementById('studio-name'),
      studioTagline: document.getElementById('studio-tagline'),
      studioAvatar: document.getElementById('studio-avatar'),
      studioIntro: document.getElementById('studio-intro'),
      studioBio: document.getElementById('studio-bio'),
      studioPersonality: document.getElementById('studio-personality'),
      studioQuirks: document.getElementById('studio-quirks'),
      studioTags: document.getElementById('studio-tags'),
      studioAiPanel: document.getElementById('studio-ai-panel'),
      studioAiPrompt: document.getElementById('studio-ai-prompt'),
      studioAiNsfw: document.getElementById('studio-ai-nsfw'),
      studioAiReference: document.getElementById('studio-ai-reference'),
      studioAiSelectedReferences: document.getElementById('studio-ai-selected-references'),
      studioAiCreativity: document.getElementById('studio-ai-creativity'),
      studioAiCreativityVal: document.getElementById('studio-ai-creativity-val'),
      btnStudioAiGenerate: document.getElementById('btn-studio-ai-generate'),
      studioAiStatus: document.getElementById('studio-ai-status'),
      studioTabManualBtn: document.getElementById('btn-studio-tab-manual'),
      studioTabAiBtn: document.getElementById('btn-studio-tab-ai'),
      studioTabManualContent: document.getElementById('studio-tab-manual-content'),
      studioTabAiContent: document.getElementById('studio-tab-ai-content'),
      studioSliders: {
        extroversion: document.getElementById('slider-extro'),
        chaos: document.getElementById('slider-chaos'),
        warmth: document.getElementById('slider-warmth'),
        intelligence: document.getElementById('slider-intel')
      },
      cardFileInput: document.getElementById('card-file-input'),
      studioImportUrl: document.getElementById('studio-import-url'),
      btnImportUrl: document.getElementById('btn-import-url'),

      // Dialogue Director Controls
      sliderVerbosity: document.getElementById('slider-verbosity'),
      sliderActionRatio: document.getElementById('slider-action-ratio'),
      // Sound board elements
      soundToggles: document.querySelectorAll('.sound-toggle-btn'),
      sliderMasterVol: document.getElementById('slider-master-volume'),
      
      // Memory Ledger elements
      memorySummaryText: document.getElementById('memory-summary-text'),
      memoryLedgerList: document.getElementById('memory-ledger-list'),
      btnEditSummary: document.getElementById('btn-edit-summary'),
      btnSaveSummary: document.getElementById('btn-save-summary'),
      
      // Dynamic choices
      choiceChipsContainer: document.getElementById('choice-chips-container'),
      
      personaBtnSave: document.getElementById('persona-btn-save'),
      personaBtnDelete: document.getElementById('persona-btn-delete'),
      personaBtnCancel: document.getElementById('persona-btn-cancel'),

      settingAutoSummarize: document.getElementById('setting-auto-summarize'),
      settingSummarizeTrigger: document.getElementById('setting-summarize-trigger'),
      settingSummarizeKeep: document.getElementById('setting-summarize-keep'),

      // Generation Parameter Inputs
      settingParamTemp: document.getElementById('setting-param-temp'),
      settingParamTopP: document.getElementById('setting-param-topp'),
      settingParamTopK: document.getElementById('setting-param-topk'),
      settingParamRepPen: document.getElementById('setting-param-reppen'),
      settingParamMaxTokens: document.getElementById('setting-param-maxtokens'),

      // Group Chat Room Elements
      sidebarRoomList: document.getElementById('sidebar-room-list'),
      btnCreateRoom: document.getElementById('btn-create-room'),
      roomModal: document.getElementById('room-modal'),
      btnCloseRoomModal: document.getElementById('btn-close-room-modal'),
      roomName: document.getElementById('room-name'),
      roomGreeting: document.getElementById('room-greeting'),
      roomContext: document.getElementById('room-context'),
      roomCharacterSelection: document.getElementById('room-character-selection'),
      btnCancelRoom: document.getElementById('btn-cancel-room'),
      btnSaveRoom: document.getElementById('btn-save-room'),
      roomSpeakerStripContainer: document.getElementById('room-speaker-strip-container'),
      roomSpeakerChips: document.getElementById('room-speaker-chips'),
      btnTriggerNext: document.getElementById('btn-trigger-next'),
      btnToggleScenarioTheme: document.getElementById('btn-toggle-scenario-theme'),
      btnCloseScenarioTheme: document.getElementById('btn-close-scenario-theme'),
      scenarioThemePanel: document.getElementById('scenario-theme-panel'),
      
      // Context Token UI
      chatHeaderTokenBadge: document.getElementById('chat-header-token-badge'),
      tokenBadgeText: document.getElementById('token-badge-text'),
      tokenDetailsDropdown: document.getElementById('token-details-dropdown'),
      selectContextBudget: document.getElementById('select-context-budget'),
      barPrompt: document.getElementById('bar-prompt'),
      barMemory: document.getElementById('bar-memory'),
      barHistory: document.getElementById('bar-history'),
      barInput: document.getElementById('bar-input'),
      valTokenPrompt: document.getElementById('val-token-prompt'),
      valTokenMemory: document.getElementById('val-token-memory'),
      valTokenHistory: document.getElementById('val-token-history'),
      valTokenInput: document.getElementById('val-token-input'),
      valTokenTotal: document.getElementById('val-token-total'),
      tokenRateFill: document.getElementById('token-rate-fill')
    };
  },

  setupEventListeners() {
    // Nav & Modals
    if (this.elements.logoContainer) {
      this.elements.logoContainer.addEventListener('click', (e) => {
        if (e.target.closest('#btn-toggle-left')) return;
        this.showLandingScreen();
      });
    }

    const toggleSubnavBtn = document.getElementById('btn-toggle-subnav');
    const chatHeader = document.querySelector('.chat-header');
    if (toggleSubnavBtn && chatHeader) {
      toggleSubnavBtn.addEventListener('click', () => {
        const isCollapsed = chatHeader.classList.toggle('collapsed');
        toggleSubnavBtn.classList.toggle('collapsed-subnav', isCollapsed);
        this.subnavCollapsed = isCollapsed;
        localStorage.setItem('jollyrp_subnav_collapsed', isCollapsed ? 'true' : 'false');
      });
    }

    const btnChatExit = document.getElementById('btn-chat-exit');
    if (btnChatExit) {
      btnChatExit.addEventListener('click', (e) => {
        e.preventDefault();
        this.showLandingScreen();
      });
    }

    const btnNewChat = document.getElementById('btn-new-chat');
    if (btnNewChat) {
      btnNewChat.addEventListener('click', () => {
        if (!this.activeCharacterId) {
          alert("Please select a companion first.");
          return;
        }
        const char = this.characters.find(c => c.id === this.activeCharacterId);
        if (!char) return;
        
        const selectPersonaEl = document.getElementById('sidebar-select-persona');
        const personaId = selectPersonaEl ? selectPersonaEl.value : 'persona_default';
        const activePersona = this.getActivePersona(personaId);
        const rawGreeting = (char.greetings && char.greetings.length > 0) ? char.greetings[0] : (char.firstMessage || "");
        const startGreeting = this.replacePlaceholders(rawGreeting, char.name, activePersona.name || 'User');

        const newChat = {
          id: `chat_${Date.now()}`,
          name: `Conversation ${this.sessions[this.activeCharacterId].length + 1}`,
          messages: [{ role: 'assistant', content: startGreeting, id: `msg_${Date.now()}` }],
          ledger: "",
          memoryChunks: [],
          chunkCursor: 0,
          count: 0,
          createdAt: Date.now(),
          personaId: personaId
        };
        this.sessions[this.activeCharacterId].push(newChat);
        this.activeChatId = newChat.id;
        this.saveSessions();
        this.renderChatThread();
        this.renderMemoryLedger();
        this.renderConversationsList();
      });
    }
    if (this.elements.btnOpenSettings) {
      this.elements.btnOpenSettings.addEventListener('click', () => {
        this.updateProviderFieldsVisibility(true);
        this.toggleModal('settingsModal', true);
      });
    }
    if (this.elements.btnCloseSettings) {
      this.elements.btnCloseSettings.addEventListener('click', () => this.toggleModal('settingsModal', false));
    }
    if (this.elements.btnLockApp) {
      this.elements.btnLockApp.addEventListener('click', () => this.lockApp());
    }

    if (this.elements.btnExportData) {
      this.elements.btnExportData.addEventListener('click', () => {
        window.open('/api/export', '_blank');
      });
    }

    if (this.elements.btnImportData && this.elements.importDataFile) {
      this.elements.btnImportData.addEventListener('click', () => {
        if (confirm('WARNING: Restoring a backup will COMPLETELY OVERWRITE all your current characters, chats, and settings! Are you sure you want to proceed?')) {
          this.elements.importDataFile.click();
        }
      });

      this.elements.importDataFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('backup', file);
        
        try {
          const res = await fetch('/api/import', {
            method: 'POST',
            body: formData
          });
          const result = await res.json();
          if (result.success) {
            alert('Backup restored successfully! The app will now reload.');
            window.location.reload();
          } else {
            alert('Restore failed: ' + (result.error || 'Unknown error'));
          }
        } catch (err) {
          alert('Error restoring backup: ' + err.message);
        }
        
        // Reset file input
        e.target.value = '';
      });
    }

    if (this.elements.settingPinEnable) {
      this.elements.settingPinEnable.addEventListener('change', (e) => {
        const pinGroup = document.getElementById('pin-setup-group');
        if (pinGroup) {
          pinGroup.style.display = e.target.checked ? 'flex' : 'none';
        }
      });
    }
    if (this.elements.providerSelect) {
      this.elements.providerSelect.addEventListener('change', () => this.updateProviderFieldsVisibility(true));
    }
    if (this.elements.modelSelect) {
      this.elements.modelSelect.addEventListener('change', () => {
        this.updateProviderFieldsVisibility(false);
        const modelVal = this.elements.modelSelect.value;
        if (modelVal !== 'custom') {
          this.applyModelDefaults(modelVal);
        }
      });
    }

    if (this.elements.customModelInput) {
      this.elements.customModelInput.addEventListener('change', () => {
        const modelVal = this.elements.customModelInput.value.trim();
        if (modelVal) {
          this.applyModelDefaults(modelVal);
        }
      });
    }

    // Sampler slider bindings
    const bindParamSlider = (sliderEl, valEl, otherSliderEl, otherValEl, paramName, isInt = false) => {
      const updateVal = (e, targetValEl, otherSld, otherVEl) => {
        let val = isInt ? parseInt(e.target.value) : parseFloat(e.target.value);
        if (targetValEl) targetValEl.textContent = isInt ? val : val.toFixed(2);
        this.generationParams[paramName] = val;
        
        if (otherSld) {
          otherSld.value = e.target.value;
          if (otherVEl) otherVEl.textContent = isInt ? val : val.toFixed(2);
        }
      };

      if (sliderEl) {
        sliderEl.addEventListener('input', (e) => {
          updateVal(e, valEl, otherSliderEl, otherValEl);
        });
      }
      if (otherSliderEl) {
        otherSliderEl.addEventListener('input', (e) => {
          updateVal(e, otherValEl, sliderEl, valEl);
        });
      }
    };

    const popupParamTemp = document.getElementById('popup-param-temp');
    const popupValTemp = document.getElementById('popup-val-temp');
    const popupParamTopP = document.getElementById('popup-param-topp');
    const popupValTopP = document.getElementById('popup-val-topp');
    const popupParamTopK = document.getElementById('popup-param-topk');
    const popupValTopK = document.getElementById('popup-val-topk');
    const popupParamRepPen = document.getElementById('popup-param-reppen');
    const popupValRepPen = document.getElementById('popup-val-reppen');
    const popupParamMaxTokens = document.getElementById('popup-param-maxtokens');
    const popupValMaxTokens = document.getElementById('popup-val-maxtokens');

    bindParamSlider(this.elements.settingParamTemp, document.getElementById('val-param-temp'), popupParamTemp, popupValTemp, 'temperature');
    bindParamSlider(this.elements.settingParamTopP, document.getElementById('val-param-topp'), popupParamTopP, popupValTopP, 'top_p');
    bindParamSlider(this.elements.settingParamTopK, document.getElementById('val-param-topk'), popupParamTopK, popupValTopK, 'top_k', true);
    bindParamSlider(this.elements.settingParamRepPen, document.getElementById('val-param-reppen'), popupParamRepPen, popupValRepPen, 'repetition_penalty');
    bindParamSlider(this.elements.settingParamMaxTokens, document.getElementById('val-param-maxtokens'), popupParamMaxTokens, popupValMaxTokens, 'max_tokens', true);

    // Guide Modal interactions
    const btnChatGuide = document.getElementById('btn-chat-guide');
    const guideModal = document.getElementById('guide-modal');
    const btnCloseGuide = document.getElementById('btn-close-guide');
    
    if (btnChatGuide && guideModal) {
      btnChatGuide.addEventListener('click', () => {
        guideModal.style.display = 'flex';
      });
    }
    if (btnCloseGuide && guideModal) {
      btnCloseGuide.addEventListener('click', () => {
        guideModal.style.display = 'none';
      });
    }

    // Samplers Modal interactions
    const btnChatSamplers = document.getElementById('btn-chat-samplers');
    const samplersModal = document.getElementById('samplers-modal');
    const btnCloseSamplers = document.getElementById('btn-close-samplers');
    const btnSaveSamplers = document.getElementById('btn-save-samplers');
    const btnPopupGuideLink = document.getElementById('btn-popup-guide-link');

    if (btnChatSamplers && samplersModal) {
      btnChatSamplers.addEventListener('click', () => {
        samplersModal.style.display = 'flex';
      });
    }
    if (btnCloseSamplers && samplersModal) {
      btnCloseSamplers.addEventListener('click', () => {
        samplersModal.style.display = 'none';
      });
    }
    if (btnPopupGuideLink && guideModal && samplersModal) {
      btnPopupGuideLink.addEventListener('click', () => {
        samplersModal.style.display = 'none';
        guideModal.style.display = 'flex';
      });
    }
    if (btnSaveSamplers) {
      btnSaveSamplers.addEventListener('click', () => {
        // Save to localStorage
        safeSetItem('jollyrp_param_temperature', this.generationParams.temperature);
        safeSetItem('jollyrp_param_top_p', this.generationParams.top_p);
        safeSetItem('jollyrp_param_top_k', this.generationParams.top_k);
        safeSetItem('jollyrp_param_repetition_penalty', this.generationParams.repetition_penalty);
        safeSetItem('jollyrp_param_max_tokens', this.generationParams.max_tokens);

        // Process Suggestion Chips toggle
        const popupParamSuggestionChips = document.getElementById('popup-param-suggestion-chips');
        if (popupParamSuggestionChips) {
          const oldState = this.showSuggestionChips;
          this.showSuggestionChips = popupParamSuggestionChips.checked;
          safeSetItem('jollyrp_enable_suggestion_chips', this.showSuggestionChips ? 'true' : 'false');
          
          // Sync setting page toggle state
          const settingParamSuggestionChips = document.getElementById('setting-param-suggestion-chips');
          if (settingParamSuggestionChips) {
            settingParamSuggestionChips.checked = this.showSuggestionChips;
          }

          // Handle active display
          const container = document.getElementById('choice-chips-container');
          if (container) {
            if (!this.showSuggestionChips) {
              container.innerHTML = '';
              container.style.display = 'none';
            } else if (!oldState && this.showSuggestionChips) {
              // Trigger choices generation immediately if toggled from off to on
              this.generateSuggestedChoices();
            }
          }
        }

        // Process Show Reasoning toggle (display accordion)
        const popupParamShowReasoning = document.getElementById('popup-param-show-reasoning');
        if (popupParamShowReasoning) {
          this.showReasoning = popupParamShowReasoning.checked;
          safeSetItem('jollyrp_show_reasoning', this.showReasoning ? 'true' : 'false');
          
          // Sync setting page toggle state
          const settingParamShowReasoning = document.getElementById('setting-param-show-reasoning');
          if (settingParamShowReasoning) {
            settingParamShowReasoning.checked = this.showReasoning;
          }
          
          // Re-render chat thread to update accordions visibility
          this.renderChatThread();
        }

        // Process Enable Reasoning toggle (prompt-level)
        const popupParamEnableReasoning = document.getElementById('popup-param-enable-reasoning');
        if (popupParamEnableReasoning) {
          this.reasoningEnabled = popupParamEnableReasoning.checked;
          safeSetItem('jollyrp_reasoning_enabled', this.reasoningEnabled ? 'true' : 'false');

          // Sync setting page toggle state
          const settingParamEnableReasoning = document.getElementById('setting-param-enable-reasoning');
          if (settingParamEnableReasoning) {
            settingParamEnableReasoning.checked = this.reasoningEnabled;
          }

          // Update token warning
          this.updateReasoningTokenWarning();
        }

        samplersModal.style.display = 'none';
        
        // Show a confirmation toast if helper exists
        if (typeof this.showToast === 'function') {
          this.showToast('🎛️ Samplers applied and saved successfully!');
        } else {
          alert('Samplers applied and saved successfully!');
        }
      });
    }

    // Preset Apply Button bindings
    const bindPresetButton = (btnId, modelId) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => {
          this.applyModelDefaults(modelId);
        });
      }
    };
    bindPresetButton('preset-btn-llama', 'meta-llama/llama-3');
    bindPresetButton('preset-btn-claude', 'anthropic/claude');
    bindPresetButton('preset-btn-deepseek', 'deepseek/r1');
    bindPresetButton('preset-btn-gemini', 'google/gemini');
    
    if (this.elements.btnAddFallback) {
      this.elements.btnAddFallback.addEventListener('click', () => {
        const provider = this.elements.providerSelect.value;
        const fallbackList = this.apiFallbacks[provider];
        if (provider === 'openrouter') {
          fallbackList.push({ apiKey: '' });
        } else {
          fallbackList.push({ customUrl: '', apiKey: '' });
        }
        this.renderFallbackConfigurations(provider);
      });
    }
    
    // Settings tab switcher
    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        tabButtons.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(content => {
          content.classList.remove('active');
          content.style.display = 'none';
        });
        btn.classList.add('active');
        const activeContent = document.getElementById(tabId);
        if (activeContent) {
          activeContent.classList.add('active');
          activeContent.style.display = 'block';
        }
      });
    });

    // Global Search Bar for Models/Companions
    if (this.elements.globalSearchModels) {
      this.initSearchAutocomplete();
    }

    // Sidebar Toggles
    if (this.elements.btnToggleLeft) {
      this.elements.btnToggleLeft.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar-left');
        if (sidebar) sidebar.classList.toggle('collapsed');
        this.elements.btnToggleLeft.classList.toggle('active');
      });
    }
    
    if (this.elements.btnOpenStudio) {
      this.elements.btnOpenStudio.addEventListener('click', () => this.openCharacterStudio());
    }
    if (this.elements.btnOpenStudioLanding) {
      this.elements.btnOpenStudioLanding.addEventListener('click', () => this.openCharacterStudio());
    }
    if (this.elements.btnCloseStudio) {
      this.elements.btnCloseStudio.addEventListener('click', () => this.toggleModal('studioModal', false));
    }
    
    if (this.elements.btnSaveSettings) {
      this.elements.btnSaveSettings.addEventListener('click', () => this.saveSettings());
    }
    if (this.elements.btnSaveCharacter) {
      this.elements.btnSaveCharacter.addEventListener('click', () => this.saveCharacter());
    }
    if (this.elements.btnStudioAiGenerate) {
      this.elements.btnStudioAiGenerate.addEventListener('click', () => this.generateCharacterWithAi());
    }

    if (this.elements.studioAiReference) {
      this.elements.studioAiReference.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          if (!this.studioSelectedReferenceIds) this.studioSelectedReferenceIds = [];
          if (!this.studioSelectedReferenceIds.includes(val)) {
            this.studioSelectedReferenceIds.push(val);
            this.renderSelectedAiReferences();
          }
          e.target.value = '';
        }
      });
    }

    if (this.elements.studioAiCreativity) {
      this.elements.studioAiCreativity.addEventListener('input', (e) => {
        const val = (parseFloat(e.target.value) / 100).toFixed(2);
        if (this.elements.studioAiCreativityVal) {
          this.elements.studioAiCreativityVal.textContent = val;
        }
      });
    }

    if (this.elements.studioTabManualBtn) {
      this.elements.studioTabManualBtn.addEventListener('click', () => this.switchStudioTab('manual'));
    }
    if (this.elements.studioTabAiBtn) {
      this.elements.studioTabAiBtn.addEventListener('click', () => this.switchStudioTab('ai'));
    }

    // Profile Modal buttons
    if (this.elements.profileBtnClose) {
      this.elements.profileBtnClose.addEventListener('click', () => this.toggleModal('profileModal', false));
    }
    if (this.elements.profileBtnNewChat) {
      this.elements.profileBtnNewChat.addEventListener('click', () => {
        const charId = this.profileCharacterId;
        const char = this.characters.find(c => c.id === charId);
        if (!char) return;

        const selectPersonaEl = document.getElementById('profile-select-persona');
        const personaId = selectPersonaEl ? selectPersonaEl.value : 'persona_default';
        const activePersona = this.getActivePersona(personaId);
        const rawGreeting = (char.greetings && char.greetings.length > 0) ? char.greetings[0] : (char.firstMessage || "");
        const startGreeting = this.replacePlaceholders(rawGreeting, char.name, activePersona.name || 'User');

        const newChat = {
          id: `chat_${Date.now()}`,
          name: `Conversation ${(this.sessions[charId] || []).length + 1}`,
          messages: [{ role: 'assistant', content: startGreeting, id: `msg_${Date.now()}` }],
          ledger: "",
          memoryChunks: [],
          chunkCursor: 0,
          count: 0,
          createdAt: Date.now(),
          personaId: personaId
        };

        if (!this.sessions[charId]) {
          this.sessions[charId] = [];
        }
        this.sessions[charId].push(newChat);
        this.activeChatId = newChat.id;
        this.activeCharacterId = charId;
        safeSetItem('jollyrp_active_char', charId);
        this.saveSessions();

        // Close profile modal and open chat screen
        this.toggleModal('profileModal', false);
        this.showChatScreen();

        // Update active indicators
        this.setChatHeaderName(char.name);
        this.elements.chatHeaderAvatar.src = char.avatar;
        this.elements.chatHeaderTagline.textContent = char.tagline;

        this.renderChatThread();
        this.renderMemoryLedger();
        this.renderSidebarOnly();
        this.renderConversationsList();
        this.generateSuggestedChoices();
      });
    }

    // History Screen events
    if (this.elements.btnConvoHistory) {
      this.elements.btnConvoHistory.addEventListener('click', () => this.showHistoryScreen());
    }
    if (this.elements.historyBtnBack) {
      this.elements.historyBtnBack.addEventListener('click', () => this.showLandingScreen());
    }
    if (this.elements.historyFilterChar) {
      this.elements.historyFilterChar.addEventListener('change', () => this.renderHistoryList());
    }
    if (this.elements.historyFilterSearch) {
      let _historySearchTimer;
      this.elements.historyFilterSearch.addEventListener('input', () => {
        clearTimeout(_historySearchTimer);
        _historySearchTimer = setTimeout(() => this.renderHistoryList(), 200);
      });
    }
    if (this.elements.historySortBy) {
      this.elements.historySortBy.addEventListener('change', () => this.renderHistoryList());
    }

    // Studio Avatar file upload event
    if (this.elements.studioAvatarFile) {
      this.elements.studioAvatarFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            this.tempAvatarBase64 = event.target.result;
            // Fill the input text so user knows it was uploaded
            this.elements.studioAvatar.value = "(Local File Uploaded)";
            this.elements.studioAvatar.disabled = true;
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Import card triggers file click
    if (this.elements.btnImportCard && this.elements.cardFileInput) {
      this.elements.btnImportCard.addEventListener('click', () => this.elements.cardFileInput.click());
      this.elements.cardFileInput.addEventListener('change', (e) => this.handleCardImport(e));
    }

    if (this.elements.btnImportUrl && this.elements.studioImportUrl) {
      this.elements.btnImportUrl.addEventListener('click', async () => {
        const url = this.elements.studioImportUrl.value.trim();
        if (!url) {
          alert('Please paste a character URL first.');
          return;
        }

        const btn = this.elements.btnImportUrl;
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="premium-spinner" style="width:12px; height:12px; display:inline-block; border-width:2px; margin:0;"></span> Importing...`;

        try {
          const isJanitor = url.includes('janitorai.com');
          const endpoint = isJanitor ? '/api/janitor/import-url' : '/api/chub/import-card';
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to import character from URL.');
          }

          const result = await response.json();
          if (result.success && result.character) {
            const newChar = result.character;
            this.characters.push(newChar);
            this.renderCharacterLists();
            this.saveData();

            let currentFavs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
            if (!currentFavs.includes(newChar.id)) {
              currentFavs.push(newChar.id);
            }
            safeSetItem('jollyrp_favorites', JSON.stringify(currentFavs));

            this.elements.studioImportUrl.value = '';
            this.toggleModal('studioModal', false);
            this.openCharacterProfile(newChar.id);
          } else {
            throw new Error('Server returned unsuccessful response.');
          }
        } catch (err) {
          console.error(err);
          alert('Error importing character: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = origText;
        }
      });
    }

    // Chat actions
    if (this.elements.btnSendMessage) {
      this.elements.btnSendMessage.addEventListener('click', () => this.handleSendMessage());
    }
    if (this.elements.chatInput) {
      this.elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
      
      // Auto-resize textarea as user types (grows up to max-height set in CSS)
      this.elements.chatInput.addEventListener('input', () => {
        const el = this.elements.chatInput;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 140) + 'px';
        // Recalculate token count in real time
        this.updateTokenUsageDraft();
      });
    }

    // Context Token UI Event Listeners
    if (this.elements.chatHeaderTokenBadge && this.elements.tokenDetailsDropdown) {
      this.elements.chatHeaderTokenBadge.addEventListener('click', (e) => {
        if (this.elements.tokenDetailsDropdown.contains(e.target)) {
          return;
        }
        e.stopPropagation();
        const dropdown = this.elements.tokenDetailsDropdown;
        const isOpen = dropdown.style.display === 'flex';
        dropdown.style.display = isOpen ? 'none' : 'flex';
      });
    }

    if (this.elements.selectContextBudget) {
      this.elements.selectContextBudget.addEventListener('change', (e) => {
        this.setContextBudget(e.target.value);
      });
    }

    document.addEventListener('click', (e) => {
      if (this.elements.chatHeaderTokenBadge && this.elements.tokenDetailsDropdown && this.elements.tokenDetailsDropdown.style.display === 'flex') {
        if (!this.elements.chatHeaderTokenBadge.contains(e.target)) {
          this.elements.tokenDetailsDropdown.style.display = 'none';
        }
      }
    });

    // Sound board triggers
    this.elements.soundToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const type = toggle.dataset.sound;
        const isActive = toggle.classList.contains('active');
        
        // Stop current if active
        if (isActive) {
          soundManager.stop(type);
          toggle.classList.remove('active');
        } else {
          // Play sound
          if (type === 'fireplace') soundManager.startFireplace();
          if (type === 'rain') soundManager.startRain();
          if (type === 'neonhum') soundManager.startNeonHum();
          if (type === 'cosmic') soundManager.startCosmic();
          toggle.classList.add('active');
        }
      });
    });

    this.elements.sliderMasterVol.addEventListener('input', (e) => {
      soundManager.setMasterVolume(parseFloat(e.target.value));
    });
    // Dialogue director controls
    this.elements.sliderVerbosity.addEventListener('input', (e) => {
      this.verbosity = parseInt(e.target.value);
      safeSetItem('jollyrp_verbosity', this.verbosity);
      this.syncDirectorSliders();
      this.saveData();
    });
    this.elements.sliderActionRatio.addEventListener('input', (e) => {
      this.actionRatio = parseInt(e.target.value);
      safeSetItem('jollyrp_action_ratio', this.actionRatio);
      this.syncDirectorSliders();
      this.saveData();
    });

    // Memory Ledger edit / save toggles
    this.elements.btnEditSummary.addEventListener('click', () => {
      this.elements.memorySummaryText.contentEditable = 'true';
      this.elements.memorySummaryText.focus();
      this.elements.btnEditSummary.style.display = 'none';
      this.elements.btnSaveSummary.style.display = 'inline-flex';
    });
    
    this.elements.btnSaveSummary.addEventListener('click', () => {
      this.elements.memorySummaryText.contentEditable = 'false';
      this.elements.btnEditSummary.style.display = 'inline-flex';
      this.elements.btnSaveSummary.style.display = 'none';
      
      const updatedText = this.elements.memorySummaryText.innerText;
      this.updateActiveLedgerText(updatedText);
    });
    
    // Filter Pills click handling
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        if (pill.disabled) return;
        const type = pill.getAttribute('data-filter-type');
        const val = pill.getAttribute('data-value');

        if (type === 'visibility') {
          document.querySelectorAll('.filter-pill[data-filter-type="visibility"]').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentVisibilityFilter = val;
          this.exploreModeActive = true;
        } else if (type === 'category') {
          document.querySelectorAll('.filter-pill[data-filter-type="category"]').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentCategoryFilter = val;
          this.exploreModeActive = true;
        } else if (type === 'timeframe') {
          document.querySelectorAll('.filter-pill[data-filter-type="timeframe"]').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentTimeframeFilter = val;
          this.exploreModeActive = true;
        } else if (type === 'community-sort') {
          document.querySelectorAll('.filter-pill[data-filter-type="community-sort"]').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.currentCommunitySort = val;
          this.exploreModeActive = true;
        }

        this.currentGridPage = 1;
        this.renderPresetsGrid();
      });
    });

    // Source Selector Click Handling
    if (this.elements.btnSourceLocal && this.elements.btnSourceCommunity) {
      const handleSourceChange = (source) => {
        this.currentSource = source;
        if (source === 'community') {
          this.elements.btnSourceCommunity.classList.add('active');
          this.elements.btnSourceLocal.classList.remove('active');
        } else {
          this.elements.btnSourceLocal.classList.add('active');
          this.elements.btnSourceCommunity.classList.remove('active');
        }
        this.currentGridPage = 1;
        this.exploreModeActive = true;
        this.renderPresetsGrid();
      };

      this.elements.btnSourceLocal.addEventListener('click', () => handleSourceChange('local'));
      this.elements.btnSourceCommunity.addEventListener('click', () => handleSourceChange('community'));
    }

    // Profile favorite heart toggle handler
    if (this.elements.profileBtnFav) {
      this.elements.profileBtnFav.addEventListener('click', async (e) => {
        e.stopPropagation();
        const charId = this.profileCharacterId;
        if (!charId) return;
        
        const favBtn = this.elements.profileBtnFav;
        favBtn.classList.add('pop-anim');
        favBtn.addEventListener('animationend', () => favBtn.classList.remove('pop-anim'), { once: true });

        if (this.profileIsCommunity) {
          const char = this.communityCharacters ? this.communityCharacters.find(c => c.id === charId) : null;
          if (!char) return;

          const isAlreadyFav = favBtn.classList.contains('active');
          if (isAlreadyFav) {
            let currentFavs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
            const localChar = this.characters.find(lc => lc.creator === 'Chub.ai' && lc.avatar.includes(char.avatar_url));
            const targetId = localChar ? localChar.id : `chub_${char.id}`;
            currentFavs = currentFavs.filter(id => id !== targetId);
            safeSetItem('jollyrp_favorites', JSON.stringify(currentFavs));
            favBtn.classList.remove('active');
          } else {
            favBtn.classList.add('active');
            try {
              const importRes = await fetch('/api/chub/import-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: char.max_res_url })
              });
              if (!importRes.ok) throw new Error('Failed to import community card');
              const importData = await importRes.json();
              if (importData.success && importData.character) {
                const newChar = importData.character;
                this.characters.push(newChar);
                
                let currentFavs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
                if (!currentFavs.includes(newChar.id)) {
                  currentFavs.push(newChar.id);
                }
                safeSetItem('jollyrp_favorites', JSON.stringify(currentFavs));
                this.renderCharacterLists();
              }
            } catch (err) {
              console.error('Failed to auto-import on favorite:', err);
              alert('Could not download character card details from Chub AI.');
              favBtn.classList.remove('active');
            }
          }
          this.saveData();
          if (this.currentCategoryFilter === 'favorites') {
            this.renderPresetsGrid();
          }
        } else {
          let currentFavs = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];
          if (currentFavs.includes(charId)) {
            currentFavs = currentFavs.filter(id => id !== charId);
            favBtn.classList.remove('active');
          } else {
            currentFavs.push(charId);
            favBtn.classList.add('active');
          }
          safeSetItem('jollyrp_favorites', JSON.stringify(currentFavs));
          this.saveData();
          if (this.currentCategoryFilter === 'favorites') {
            this.renderPresetsGrid();
          }
        }
      });
    }

    // Profile Edit/Delete Companion Handlers
    if (this.elements.profileBtnEdit) {
      this.elements.profileBtnEdit.addEventListener('click', () => {
        this.toggleModal('profileModal', false);
        this.editCharacter(this.profileCharacterId);
      });
    }

    if (this.elements.profileBtnDelete) {
      this.elements.profileBtnDelete.addEventListener('click', async () => {
        if (confirm("Are you sure you want to permanently delete this companion and all its chat history?")) {
          const charId = this.profileCharacterId;
          // Remove from client state immediately
          this.characters = this.characters.filter(c => c.id !== charId);
          delete this.sessions[charId];
          
          if (this.activeCharacterId === charId) {
            this.activeCharacterId = '';
            this.activeChatId = '';
            localStorage.removeItem('jollyrp_active_char');
            this.showLandingScreen();
          }

          // Explicitly call DELETE endpoint — do NOT rely on saveData to remove the file
          try {
            await fetch(`/api/characters/${encodeURIComponent(charId)}`, { method: 'DELETE' });
          } catch (err) {
            console.warn('DELETE /api/characters failed, file may remain on disk:', err);
          }

          // Update localStorage
          safeSetItem('jollyrp_characters', JSON.stringify(this.characters));
          safeSetItem('jollyrp_sessions', _formatLocaleString(JSON.stringify(this.sessions)));

          this.toggleModal('profileModal', false);
          this.renderCharacterLists();
          this.renderPresetsGrid();
        }
      });
    }

    // Tag Filter Bar Clear Button
    if (this.elements.btnClearTag) {
      this.elements.btnClearTag.addEventListener('click', () => {
        this.currentTagFilter = '';
        this.currentGridPage = 1;
        this.renderPresetsGrid();
      });
    }

    // Grid Pagination Buttons
    if (this.elements.btnPaginationPrev) {
      this.elements.btnPaginationPrev.addEventListener('click', () => {
        if (this.currentGridPage > 1) {
          this.currentGridPage--;
          this.renderPresetsGrid();
          const container = document.querySelector('.landing-content-wrapper');
          if (container) container.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    if (this.elements.btnPaginationNext) {
      this.elements.btnPaginationNext.addEventListener('click', () => {
        this.currentGridPage++;
        this.renderPresetsGrid();
        const container = document.querySelector('.landing-content-wrapper');
        if (container) container.scrollIntoView({ behavior: 'smooth' });
      });
    }

    if (this.elements.btnPaginationTopPrev) {
      this.elements.btnPaginationTopPrev.addEventListener('click', () => {
        if (this.currentGridPage > 1) {
          this.currentGridPage--;
          this.renderPresetsGrid();
          const container = document.querySelector('.landing-content-wrapper');
          if (container) container.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    if (this.elements.btnPaginationTopNext) {
      this.elements.btnPaginationTopNext.addEventListener('click', () => {
        this.currentGridPage++;
        this.renderPresetsGrid();
        const container = document.querySelector('.landing-content-wrapper');
        if (container) container.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Persona Manager navigation
    const btnPersonaManager = document.getElementById('btn-persona-manager');
    if (btnPersonaManager) {
      btnPersonaManager.addEventListener('click', () => this.showPersonaScreen());
    }
    const personaBtnBack = document.getElementById('persona-btn-back');
    if (personaBtnBack) {
      personaBtnBack.addEventListener('click', () => this.showLandingScreen());
    }
    const personaBtnCreate = document.getElementById('persona-btn-create');
    if (personaBtnCreate) {
      personaBtnCreate.addEventListener('click', () => this.openPersonaEditor(null));
    }
    if (this.elements.personaBtnSave) {
      this.elements.personaBtnSave.addEventListener('click', () => this.savePersona());
    }
    if (this.elements.personaBtnDelete) {
      this.elements.personaBtnDelete.addEventListener('click', () => this.deletePersona());
    }
    if (this.elements.personaBtnCancel) {
      this.elements.personaBtnCancel.addEventListener('click', () => {
        const modal = document.getElementById('persona-editor-modal');
        if (modal) modal.style.display = 'none';
      });
    }

    // Add alternate greeting in character studio
    const btnAddGreeting = document.getElementById('btn-studio-add-greeting');
    if (btnAddGreeting) {
      btnAddGreeting.addEventListener('click', () => {
        const container = document.getElementById('studio-greetings-container');
        if (!container) return;
        
        const idx = container.querySelectorAll('.studio-greeting-item').length;
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.gap = '8px';
        wrapper.style.alignItems = 'stretch';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'textarea-field studio-greeting-item';
        textarea.style.minHeight = '60px';
        textarea.style.flex = '1';
        textarea.placeholder = `Alternate greeting ${idx}...`;
        wrapper.appendChild(textarea);
        
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-danger';
        delBtn.style.padding = '8px';
        delBtn.innerHTML = '🗑️';
        delBtn.addEventListener('click', () => {
          wrapper.remove();
        });
        wrapper.appendChild(delBtn);
        container.appendChild(wrapper);
      });
    }

    // Dynamic grid column recalculation and render on window resize
    window.addEventListener('resize', this.debounce(() => {
      if (this.elements.landingScreen && this.elements.landingScreen.style.display !== 'none') {
        this.renderPresetsGrid();
      }
    }, 150));

    // Group Chat Room event listeners
    if (this.elements.btnCreateRoom) {
      this.elements.btnCreateRoom.addEventListener('click', () => this.openRoomModal(null));
    }
    if (this.elements.btnCloseRoomModal) {
      this.elements.btnCloseRoomModal.addEventListener('click', () => this.closeRoomModal());
    }
    if (this.elements.btnCancelRoom) {
      this.elements.btnCancelRoom.addEventListener('click', () => this.closeRoomModal());
    }
    if (this.elements.btnSaveRoom) {
      this.elements.btnSaveRoom.addEventListener('click', () => this.saveRoom());
    }
    if (this.elements.btnTriggerNext) {
      this.elements.btnTriggerNext.addEventListener('click', () => this.triggerNextReply());
    }

    // Global listener for inline image clicks to open lightbox
    document.body.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('msg-inline-img')) {
        this.openImageLightbox(e.target.src, e.target.getAttribute('alt') || '');
      }
    });

    // Director Mode Toggle Listener
    const btnToggleDirector = document.getElementById('btn-toggle-director');
    if (btnToggleDirector) {
      btnToggleDirector.addEventListener('click', () => {
        this.directorModeActive = !this.directorModeActive;
        this.updateDirectorModeUi();
      });
    }
  },

  toggleModal(modalKey, show) {
    this.elements[modalKey].style.display = show ? 'flex' : 'none';
    if (modalKey === 'settingsModal' && show) {
      this.syncTtsSettingsToInputs();
    }
  },

  openImageLightbox(src, alt) {
    let lightbox = document.getElementById('image-lightbox');
    if (lightbox) {
      lightbox.remove();
    }

    lightbox = document.createElement('div');
    lightbox.id = 'image-lightbox';
    lightbox.className = 'image-lightbox-backdrop';
    
    lightbox.innerHTML = `
      <div class="image-lightbox-container">
        <img class="image-lightbox-content" src="${escapeHTML(src)}" alt="${escapeHTML(alt || '')}" />
        ${alt ? `<div class="image-lightbox-caption">${escapeHTML(alt)}</div>` : ''}
        <button class="image-lightbox-close" title="Close Lightbox">&times;</button>
      </div>
    `;

    document.body.appendChild(lightbox);

    requestAnimationFrame(() => {
      lightbox.classList.add('active');
    });

    const closeLightbox = () => {
      lightbox.classList.remove('active');
      setTimeout(() => {
        lightbox.remove();
      }, 300);
    };

    lightbox.addEventListener('click', (e) => {
      if (!e.target.closest('.image-lightbox-content')) {
        closeLightbox();
      }
    });

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  },

  showToast(message, duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.position = 'fixed';
      container.style.bottom = '24px';
      container.style.left = '24px';
      container.style.zIndex = '9999';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'jolly-toast';
    toast.style.background = 'linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))';
    toast.style.color = 'var(--text-main)';
    toast.style.border = '1.5px solid var(--accent-gold)';
    toast.style.padding = '12px 18px';
    toast.style.borderRadius = 'var(--radius-sm)';
    toast.style.fontSize = '13.5px';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.pointerEvents = 'auto';
    
    toast.innerHTML = `
      <span style="color: var(--accent-gold); font-size: 15px;">✨</span>
      <span>${escapeHTML(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, duration);
  },

  renderSidebarOnly() {
    if (!this.elements.sidebarCharList) return;
    this.elements.sidebarCharList.innerHTML = '';
    
    const sortedActiveCast = [...this.characters].sort((a, b) => {
      const chatsA = this.sessions[a.id] || [];
      const chatsB = this.sessions[b.id] || [];
      const lastTimeA = chatsA.length > 0 ? Math.max(...chatsA.map(c => c.createdAt || 0)) : 0;
      const lastTimeB = chatsB.length > 0 ? Math.max(...chatsB.map(c => c.createdAt || 0)) : 0;
      if (lastTimeB !== lastTimeA) return lastTimeB - lastTimeA;
      return a.name.localeCompare(b.name);
    }).slice(0, 10);

    const sidebarFragment = document.createDocumentFragment();
    sortedActiveCast.forEach(char => {
      const item = document.createElement('div');
      item.className = `character-item ${char.id === this.activeCharacterId ? 'active' : ''}`;
      item.addEventListener('click', () => this.openCharacterProfile(char.id));
      item.innerHTML = `
        <div class="char-avatar-frame">
          <img class="char-avatar" src="${escapeHTML(char.avatar)}" alt="${escapeHTML(char.name)}">
        </div>
        <div class="char-info">
          <div class="char-name">${escapeHTML(char.name)}</div>
          <div class="char-tagline">${escapeHTML(stripHtmlTags(char.tagline || ''))}</div>
        </div>
      `;
      sidebarFragment.appendChild(item);
    });
    this.elements.sidebarCharList.appendChild(sidebarFragment);
    this.renderRoomList();
  },

  showLandingScreen() {
    this.activeCharacterId = '';
    this.activeChatId = '';
    localStorage.removeItem('jollyrp_active_char');
    this.elements.landingScreen.style.display = 'flex';
    this.elements.chatScreen.style.display = 'none';
    if (this.elements.historyScreen) {
      this.elements.historyScreen.style.display = 'none';
    }
    const personaScreen = document.getElementById('persona-screen');
    if (personaScreen) {
      personaScreen.style.display = 'none';
    }

    const toggleSubnavBtn = document.getElementById('btn-toggle-subnav');
    if (toggleSubnavBtn) toggleSubnavBtn.style.display = 'none';
    const subnavSep = document.getElementById('subnav-sep');
    if (subnavSep) subnavSep.style.display = 'none';

    const stylePanel = document.getElementById('chat-style-panel');
    if (stylePanel) stylePanel.style.display = 'none';
    const timelinePanel = document.getElementById('story-timeline-panel');
    if (timelinePanel) timelinePanel.style.display = 'none';
    const scenarioPanel = document.getElementById('scenario-theme-panel');
    if (scenarioPanel) scenarioPanel.style.display = 'none';
    const bannedPanel = document.getElementById('banned-words-panel');
    if (bannedPanel) bannedPanel.style.display = 'none';

    // Reset filters configuration for default home page view
    this.exploreModeActive = false;
    this.currentVisibilityFilter = 'all';
    this.currentCategoryFilter = 'all';
    this.currentTimeframeFilter = 'weekly';
    this.currentTagFilter = '';
    this.currentSource = 'local';
    if (this.elements.btnSourceLocal) this.elements.btnSourceLocal.classList.add('active');
    if (this.elements.btnSourceCommunity) this.elements.btnSourceCommunity.classList.remove('active');

    // Update filter pills active states
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    const catAll = document.querySelector('.filter-pill[data-filter-type="category"][data-value="all"]');
    if (catAll) catAll.classList.add('active');
    const timeW = document.querySelector('.filter-pill[data-filter-type="timeframe"][data-value="weekly"]');
    if (timeW) timeW.classList.add('active');

    // Clear search filter when returning home via logo
    if (this.elements.globalSearchModels) {
      this.elements.globalSearchModels.value = '';
    }

    // Defer heavy re-renders until after the screen swap is painted —
    // this makes the transition feel instant (same as the exit button's raw swap).
    requestAnimationFrame(() => {
      this.renderCharacterLists();
      this.renderMyChats();
    });

    // Hide speaker strip when leaving chat
    if (this.elements.roomSpeakerStripContainer) {
      this.elements.roomSpeakerStripContainer.style.display = 'none';
    }
    // Restore single avatar visibility, hide room header avatars overlay
    if (this.elements.chatHeaderAvatar) {
      this.elements.chatHeaderAvatar.style.display = '';
    }
    const overlapEl = document.getElementById('room-header-avatars');
    if (overlapEl) overlapEl.style.display = 'none';
  },

  showChatScreen() {
    this.elements.landingScreen.style.display = 'none';
    this.elements.chatScreen.style.display = 'flex';
    const personaScreen = document.getElementById('persona-screen');
    if (personaScreen) {
      personaScreen.style.display = 'none';
    }
    if (this.elements.historyScreen) {
      this.elements.historyScreen.style.display = 'none';
    }

    // Toggle sub-navbar button and apply collapsed state
    const toggleSubnavBtn = document.getElementById('btn-toggle-subnav');
    if (toggleSubnavBtn) {
      toggleSubnavBtn.style.display = 'inline-flex';
      toggleSubnavBtn.classList.toggle('collapsed-subnav', !!this.subnavCollapsed);
    }
    const subnavSep = document.getElementById('subnav-sep');
    if (subnavSep) subnavSep.style.display = 'inline-block';

    const chatHeader = document.querySelector('.chat-header');
    if (chatHeader) {
      chatHeader.classList.toggle('collapsed', !!this.subnavCollapsed);
    }

    // If NOT a room, ensure single avatar is visible and room overlay is hidden
    if (!this.isRoomActive()) {
      if (this.elements.chatHeaderAvatar) this.elements.chatHeaderAvatar.style.display = '';
      const overlapEl = document.getElementById('room-header-avatars');
      if (overlapEl) overlapEl.style.display = 'none';
      if (this.elements.roomSpeakerStripContainer) {
        this.elements.roomSpeakerStripContainer.style.display = 'none';
      }
    }
  },

  showHistoryScreen() {
    this.elements.landingScreen.style.display = 'none';
    this.elements.chatScreen.style.display = 'none';
    this.elements.historyScreen.style.display = 'flex';
    const personaScreen = document.getElementById('persona-screen');
    if (personaScreen) {
      personaScreen.style.display = 'none';
    }

    const toggleSubnavBtn = document.getElementById('btn-toggle-subnav');
    if (toggleSubnavBtn) toggleSubnavBtn.style.display = 'none';
    const subnavSep = document.getElementById('subnav-sep');
    if (subnavSep) subnavSep.style.display = 'none';

    // Collapse left sidebar by default
    const sidebarLeft = document.querySelector('.sidebar-left');
    if (sidebarLeft && !sidebarLeft.classList.contains('collapsed')) {
      sidebarLeft.classList.add('collapsed');
    }
    
    // Toggle active state on button to match
    if (this.elements.btnToggleLeft && !this.elements.btnToggleLeft.classList.contains('active')) {
      this.elements.btnToggleLeft.classList.add('active');
    }

    // Populate filter select with companions
    const select = this.elements.historyFilterChar;
    if (select) {
      select.innerHTML = '<option value="all">All Companions</option>';
      this.characters.forEach(char => {
        const opt = document.createElement('option');
        opt.value = char.id;
        opt.textContent = char.name;
        select.appendChild(opt);
      });
    }

    this.renderHistoryList();
  },

  lockApp() {
    if (!this.pinEnabled || !this.pinCode) {
      alert("PIN lock is not enabled in Settings.");
      return;
    }

    const overlay = this.elements.loadingScreen;
    if (!overlay) return;

    const loadingInner = document.getElementById('loading-inner');
    const pinCard = document.getElementById('pin-screen-card');
    if (loadingInner && pinCard) {
      loadingInner.style.display = 'none';
      pinCard.style.display = 'flex';
      pinCard.style.opacity = '1';
    }

    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';

    this.setupPinLockHandlers();
  },

  updateLockButtonVisibility() {
    if (this.elements.btnLockApp) {
      if (this.pinEnabled && this.pinCode) {
        this.elements.btnLockApp.style.display = 'inline-flex';
      } else {
        this.elements.btnLockApp.style.display = 'none';
      }
    }
  },

  setupPinLockHandlers() {
    let currentInput = '';
    const dots = document.querySelectorAll('.pin-dot');
    const pinCard = document.getElementById('pin-screen-card');
    const errorMsg = document.getElementById('pin-error-msg');
    
    const updateDots = () => {
      dots.forEach((dot, idx) => {
        if (idx < currentInput.length) {
          dot.classList.add('filled');
        } else {
          dot.classList.remove('filled');
        }
      });
    };

    updateDots();

    const handleKeyInput = (val) => {
      if (errorMsg) errorMsg.classList.remove('visible');
      if (val === 'back') {
        if (currentInput.length > 0) {
          currentInput = currentInput.slice(0, -1);
          updateDots();
        }
        return;
      }
      
      if (/^[0-9]$/.test(val)) {
        if (currentInput.length < 4) {
          currentInput += val;
          updateDots();
          
          if (currentInput.length === 4) {
            if (currentInput === this.pinCode) {
              this.dismissLoadingScreen();
              window.removeEventListener('keydown', physicalKeyHandler);
            } else {
              if (pinCard) {
                pinCard.classList.add('shake-anim');
                setTimeout(() => {
                  pinCard.classList.remove('shake-anim');
                }, 400);
              }
              if (errorMsg) errorMsg.classList.add('visible');
              
              currentInput = '';
              setTimeout(() => {
                updateDots();
              }, 200);
            }
          }
        }
      }
    };

    const keys = document.querySelectorAll('.pin-key');
    keys.forEach(key => {
      key.addEventListener('click', () => {
        const val = key.getAttribute('data-value');
        if (val) handleKeyInput(val);
      });
    });

    const physicalKeyHandler = (e) => {
      // Allow keyboard numbers
      if (e.key >= '0' && e.key <= '9') {
        handleKeyInput(e.key);
      } else if (e.key === 'Backspace') {
        handleKeyInput('back');
      }
    };
    window.addEventListener('keydown', physicalKeyHandler);
  },

  showCustomConfirmDelete(title, subtitle, onConfirm) {
    if (document.querySelector('.msg-delete-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'msg-delete-backdrop';

    const confirmBox = document.createElement('div');
    confirmBox.className = 'msg-delete-confirm';
    confirmBox.innerHTML = `
      <div class="confirm-icon">🗑️</div>
      <div class="confirm-title">${escapeHTML(title)}</div>
      <div class="confirm-subtitle">${escapeHTML(subtitle)}</div>
      <div class="confirm-actions">
        <button class="confirm-no">Keep it</button>
        <button class="confirm-yes">Delete</button>
      </div>
    `;
    backdrop.appendChild(confirmBox);
    document.body.appendChild(backdrop);

    const cleanup = () => {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    };

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) cleanup();
    });

    confirmBox.querySelector('.confirm-no').addEventListener('click', (e) => {
      e.stopPropagation();
      cleanup();
    });

    confirmBox.querySelector('.confirm-yes').addEventListener('click', (e) => {
      e.stopPropagation();
      cleanup();
      onConfirm();
    });
  },

  setContextBudget(budget) {
    this.contextBudget = parseInt(budget) || 8192;
    safeSetItem('jollyrp_context_budget', this.contextBudget);
    this.updateTokenUsage();
  },

  updateTokenUsage() {
    const session = this.isRoomActive() ? this.getRoomSession() : this.getActiveSession();
    
    if (!session || !this.elements.chatHeaderTokenBadge) {
      if (this.elements.chatHeaderTokenBadge) {
        this.elements.chatHeaderTokenBadge.style.display = 'none';
      }
      return;
    }
    
    this.elements.chatHeaderTokenBadge.style.display = 'flex';
    
    // 1. Get current context budget limit
    const budget = this.contextBudget || 8192;
    
    // Sync selector value
    if (this.elements.selectContextBudget && this.elements.selectContextBudget.value !== String(budget)) {
      this.elements.selectContextBudget.value = String(budget);
    }
    
    // 2. Compute components
    let char = null;
    let activePersona = null;
    let systemPrompt = '';
    let baseSystemPrompt = '';
    let matchedLore = [];
    let retrievedChunks = [];
    
    const inputText = this.elements.chatInput ? this.elements.chatInput.value.trim() : '';
    
    if (this.isRoomActive()) {
      // Room scenario
      const charIds = session.roomCharIds || [];
      const chars = charIds.map(id => this.characters.find(c => c.id === id)).filter(Boolean);
      char = chars[0];
      
      const activeSpeakerName = session.roomActiveSpeaker || (chars[0] ? chars[0].name : 'Character');
      const activeSpeakerChar = chars.find(c => c.name.toLowerCase() === activeSpeakerName.toLowerCase()) || chars[0];
      
      activePersona = this.getActivePersona(session.personaId);
      
      const recentMessagesText = (session.messages ? session.messages.slice(-2).map(m => m.content).join(' ') : '') + (inputText ? ' ' + inputText : '');
      matchedLore = [];
      chars.forEach(c => {
        if (c.lorebook) {
          matchedLore.push(...scanLorebook(recentMessagesText, c.lorebook));
        }
      });
      
      retrievedChunks = retrieveTopK(recentMessagesText, session.memoryChunks || [], 3);
      
      baseSystemPrompt = synthesizeRoomSystemPrompt(
        session.roomName || 'Group Room',
        chars,
        activeSpeakerName,
        '',
        [],
        {
          verbosity: this.verbosity,
          actionRatio: this.actionRatio,
          maxTokens: this.generationParams.max_tokens,
          systemPromptOverride: session.systemPromptOverride || ''
        },
        activePersona,
        '',
        false,
        session.roomMuted || [],
        []
      );
      
      systemPrompt = synthesizeRoomSystemPrompt(
        session.roomName || 'Group Room',
        chars,
        activeSpeakerName,
        session.ledger || '',
        matchedLore,
        {
          verbosity: this.verbosity,
          actionRatio: this.actionRatio,
          maxTokens: this.generationParams.max_tokens,
          systemPromptOverride: session.systemPromptOverride || ''
        },
        activePersona,
        session.roomContext || '',
        false,
        session.roomMuted || [],
        retrievedChunks
      );
    } else {
      // Single chat scenario
      char = this.characters.find(c => c.id === this.activeCharacterId);
      if (!char) return;
      
      activePersona = this.getActivePersona(session.personaId || this.activePersonaId);
      
      // Formulate active query using draft typing or falling back to the last user message
      let activeQueryText = '';
      if (inputText) {
        activeQueryText = inputText;
      } else {
        const lastUserMsg = session.messages ? session.messages.filter(m => m.role === 'user').slice(-1)[0] : null;
        activeQueryText = lastUserMsg ? lastUserMsg.content : '';
      }
      
      matchedLore = scanLorebook(activeQueryText, char.lorebook);
      
      const lastAiMsg = session.messages ? session.messages.filter(m => m.role === 'assistant').slice(-1)[0] : null;
      const ragQuery = activeQueryText + (lastAiMsg ? ' ' + lastAiMsg.content : '');
      retrievedChunks = retrieveTopK(ragQuery, session.memoryChunks || [], 3);
      
      baseSystemPrompt = synthesizeSystemPrompt(char, '', [], {
        verbosity: this.verbosity,
        actionRatio: this.actionRatio,
        maxTokens: this.generationParams.max_tokens,
        systemPromptOverride: session.systemPromptOverride || ''
      }, activePersona, []);
      
      systemPrompt = synthesizeSystemPrompt(char, session.ledger || '', matchedLore, {
        verbosity: this.verbosity,
        actionRatio: this.actionRatio,
        maxTokens: this.generationParams.max_tokens,
        systemPromptOverride: session.systemPromptOverride || ''
      }, activePersona, retrievedChunks);
    }
    
    const promptTokens = countTokens(baseSystemPrompt);
    const totalSystemPromptTokens = countTokens(systemPrompt);
    const memoryTokens = Math.max(0, totalSystemPromptTokens - promptTokens);
    
    // Calculate total stored memories sizes
    const totalStoredChunks = session.memoryChunks ? session.memoryChunks.length : 0;
    const storedMemoryText = session.memoryChunks ? session.memoryChunks.map(c => c.summary).join('\n') : '';
    const storedMemoryTokens = countTokens(storedMemoryText);
    
    // Slice message history to N=12
    const apiMessages = buildApiMessages(
      systemPrompt, 
      session.messages || [], 
      12, 
      this.instructTemplate, 
      char ? char.name : 'Character', 
      activePersona ? activePersona.name : 'User',
      session.authorsNote || '',
      session.authorsNoteDepth || 3
    );
    
    let historyTokens = 0;
    // skip system prompt at index 0
    for (let i = 1; i < apiMessages.length; i++) {
      if (apiMessages[i].content === '[Continue the story]' && i === apiMessages.length - 1 && apiMessages[i].role === 'user') {
        continue; // ignore safety guard turn
      }
      historyTokens += countTokens(apiMessages[i].content);
    }
    
    const inputTokens = countTokens(inputText);
    
    const totalFilled = promptTokens + memoryTokens + historyTokens + inputTokens;
    const filledPercentage = Math.min(100, Math.round((totalFilled / budget) * 100));
    
    let fillSpeed = 0;
    const recentMsgs = session.messages ? session.messages.slice(-4) : [];
    if (recentMsgs.length > 0) {
      const sumRecent = recentMsgs.reduce((sum, msg) => sum + countTokens(msg.content), 0);
      fillSpeed = Math.round(sumRecent / recentMsgs.length);
    }
    
    requestAnimationFrame(() => {
      if (this.elements.tokenBadgeText) {
        this.elements.tokenBadgeText.textContent = `Tokens: ${totalFilled.toLocaleString()} / ${budget.toLocaleString()} (${filledPercentage}%)`;
      }
      
      const pctPrompt = (promptTokens / budget) * 100;
      const pctMemory = (memoryTokens / budget) * 100;
      const pctHistory = (historyTokens / budget) * 100;
      const pctInput = (inputTokens / budget) * 100;
      
      if (this.elements.barPrompt) this.elements.barPrompt.style.width = `${pctPrompt}%`;
      if (this.elements.barMemory) this.elements.barMemory.style.width = `${pctMemory}%`;
      if (this.elements.barHistory) this.elements.barHistory.style.width = `${pctHistory}%`;
      if (this.elements.barInput) this.elements.barInput.style.width = `${pctInput}%`;
      
      if (this.elements.chatHeaderTokenBadge) {
        if (filledPercentage > 90) {
          this.elements.chatHeaderTokenBadge.style.borderColor = 'var(--accent-crimson)';
          this.elements.chatHeaderTokenBadge.style.color = '#f7a8aa';
        } else if (filledPercentage > 75) {
          this.elements.chatHeaderTokenBadge.style.borderColor = 'var(--accent-gold)';
          this.elements.chatHeaderTokenBadge.style.color = 'var(--accent-gold)';
        } else {
          this.elements.chatHeaderTokenBadge.style.borderColor = 'var(--border-muted)';
          this.elements.chatHeaderTokenBadge.style.color = 'var(--text-muted)';
        }
      }
      
      if (this.elements.valTokenPrompt) this.elements.valTokenPrompt.textContent = `${promptTokens.toLocaleString()} tkn`;
      
      if (this.elements.valTokenMemory) {
        if (totalStoredChunks > 0 || matchedLore.length > 0) {
          this.elements.valTokenMemory.innerHTML = `${memoryTokens.toLocaleString()} tkn <span style="font-size: 10px; color: var(--text-muted); font-weight: normal; margin-left: 6px;">(${storedMemoryTokens.toLocaleString()} tkn stored)</span>`;
        } else {
          this.elements.valTokenMemory.textContent = `0 tkn`;
        }
      }
      
      if (this.elements.valTokenHistory) this.elements.valTokenHistory.textContent = `${historyTokens.toLocaleString()} tkn`;
      if (this.elements.valTokenInput) this.elements.valTokenInput.textContent = `${inputTokens.toLocaleString()} tkn`;
      if (this.elements.valTokenTotal) this.elements.valTokenTotal.textContent = `${totalFilled.toLocaleString()} / ${budget.toLocaleString()} tkn`;
      if (this.elements.tokenRateFill) this.elements.tokenRateFill.textContent = `+${fillSpeed} tkn/msg`;
    });
  },

  updateTokenUsageDraft() {
    // Highly efficient update trigger for live typing
    this.updateTokenUsage();
  },

  getSearchHistory() {
    try {
      const raw = localStorage.getItem('jollyrp_search_history');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  saveSearchHistory(history) {
    try {
      localStorage.setItem('jollyrp_search_history', JSON.stringify(history));
    } catch (e) {}
  },

  addToSearchHistory(query) {
    if (!query || query.trim() === '') return;
    const q = query.trim();
    let history = this.getSearchHistory();
    history = history.filter(item => item.toLowerCase() !== q.toLowerCase());
    history.unshift(q);
    if (history.length > 5) {
      history = history.slice(0, 5);
    }
    this.saveSearchHistory(history);
    this.searchHistory = history;
  },

  initSearchAutocomplete() {
    this.searchHistory = this.getSearchHistory();
    this.autocompleteActiveIndex = -1;
    this.autocompleteSuggestions = [];
    this.chubSearchAbortController = null;

    const input = this.elements.globalSearchModels;
    const dropdown = this.elements.searchAutocompleteDropdown;
    if (!input || !dropdown) return;

    const debouncedFilter = this.debounce((query) => {
      this.filterCompanions(query);
    }, 200);

    input.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      if (query && (this.elements.chatScreen.style.display === 'flex' || this.elements.historyScreen.style.display === 'flex')) {
        this.showLandingScreen();
        input.value = query;
      }

      debouncedFilter(query.toLowerCase());
      this.renderSearchSuggestions(query);
    });

    input.addEventListener('focus', () => {
      this.renderSearchSuggestions(input.value.trim());
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        dropdown.style.display = 'none';
        dropdown.classList.add('hidden');
      }, 200);
    });

    dropdown.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.search-suggestion-item');
      if (dropdown.style.display === 'none' || items.length === 0) {
        if (e.key === 'Enter') {
          this.addToSearchHistory(input.value);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.autocompleteActiveIndex = (this.autocompleteActiveIndex + 1) % items.length;
        this.updateActiveSuggestion(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.autocompleteActiveIndex = (this.autocompleteActiveIndex - 1 + items.length) % items.length;
        this.updateActiveSuggestion(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.autocompleteActiveIndex >= 0 && this.autocompleteActiveIndex < this.autocompleteSuggestions.length) {
          this.handleSearchSuggestionSelection(this.autocompleteSuggestions[this.autocompleteActiveIndex], items[this.autocompleteActiveIndex]);
        } else {
          this.addToSearchHistory(input.value);
          dropdown.style.display = 'none';
          dropdown.classList.add('hidden');
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dropdown.style.display = 'none';
        dropdown.classList.add('hidden');
        input.blur();
      }
    });
  },

  updateActiveSuggestion(items) {
    items.forEach((item, idx) => {
      if (idx === this.autocompleteActiveIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  },

  async renderSearchSuggestions(query) {
    const dropdown = this.elements.searchAutocompleteDropdown;
    if (!dropdown) return;

    this.autocompleteActiveIndex = -1;
    this.autocompleteSuggestions = [];

    const normQuery = query.toLowerCase().trim();
    let suggestionsHtml = '';
    
    // --- SEARCH HISTORY ---
    if (!normQuery && this.searchHistory && this.searchHistory.length > 0) {
      suggestionsHtml += `<div class="search-suggestion-header">Recent Searches</div>`;
      this.searchHistory.forEach(q => {
        const index = this.autocompleteSuggestions.length;
        this.autocompleteSuggestions.push({ type: 'history', value: q });
        suggestionsHtml += `
          <div class="search-suggestion-item" data-index="${index}">
            <div class="search-suggestion-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="search-suggestion-content">
              <div class="search-suggestion-title">${escapeHTML(q)}</div>
            </div>
            <button class="search-history-delete-btn" title="Delete Search" data-value="${escapeHTML(q)}" style="background: none; border: none; padding: 4px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); cursor: pointer; border-radius: 50%; width: 22px; height: 22px; transition: all 0.2s; margin-left: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `;
      });
    }

    // --- LOCAL CHARACTERS ---
    const localMatches = normQuery 
      ? this.characters.filter(c => c.name.toLowerCase().includes(normQuery) || (c.tagline && c.tagline.toLowerCase().includes(normQuery)))
      : this.characters.slice(0, 4);

    if (localMatches.length > 0) {
      suggestionsHtml += `<div class="search-suggestion-header">${normQuery ? 'Local Companions' : 'My Companions'}</div>`;
      localMatches.forEach(char => {
        const index = this.autocompleteSuggestions.length;
        this.autocompleteSuggestions.push({ type: 'local', id: char.id, name: char.name, char });
        
        const avatarImg = char.avatar 
          ? `<img src="${escapeHTML(char.avatar)}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">`
          : `<div class="search-suggestion-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;

        suggestionsHtml += `
          <div class="search-suggestion-item" data-index="${index}">
            ${avatarImg}
            <div class="search-suggestion-content">
              <div class="search-suggestion-title">${escapeHTML(char.name)}</div>
              ${char.tagline ? `<div class="search-suggestion-subtitle">${escapeHTML(char.tagline)}</div>` : ''}
            </div>
            <div class="search-suggestion-meta">
              <span class="search-suggestion-badge local">Local</span>
            </div>
          </div>
        `;
      });
    }

    if (suggestionsHtml) {
      dropdown.innerHTML = suggestionsHtml;
      dropdown.style.display = 'flex';
      dropdown.classList.remove('hidden');
    } else {
      dropdown.style.display = 'none';
      dropdown.classList.add('hidden');
    }

    this.bindSearchSuggestionClicks();

    if (!normQuery) {
      if (this.chubSearchAbortController) {
        this.chubSearchAbortController.abort();
        this.chubSearchAbortController = null;
      }
      return;
    }

    if (this.chubSearchAbortController) {
      this.chubSearchAbortController.abort();
    }
    this.chubSearchAbortController = new AbortController();
    const { signal } = this.chubSearchAbortController;

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 300);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Aborted'));
        });
      });

      const nsfw = this.nsfwEnabled ? 'true' : 'false';
      const res = await fetch(`/api/chub/search?search=${encodeURIComponent(normQuery)}&first=6&page=1&sort=download_count&nsfw=${nsfw}`, { signal });
      if (!res.ok) throw new Error('Chub API failed');
      const data = await res.json();
      
      if (signal.aborted) return;

      const nodes = (data.data && data.data.nodes) || [];
      if (nodes.length > 0) {
        let addedChubCount = 0;

        nodes.forEach(char => {
          const localChar = this.characters.find(lc => 
            (lc.creator === 'Chub.ai' && char.avatar_url && lc.avatar.includes(char.avatar_url)) ||
            (lc.id === `chub_${char.id}`)
          );
          const isImported = !!localChar;

          const isAlreadySuggested = this.autocompleteSuggestions.some(s => 
            s.type === 'local' && localChar && s.id === localChar.id
          );
          if (isAlreadySuggested) return;

          this.autocompleteSuggestions.push({ 
            type: 'chub', 
            id: char.id, 
            name: char.name, 
            avatar_url: char.avatar_url, 
            max_res_url: char.max_res_url,
            isImported,
            localCharId: localChar ? localChar.id : null,
            charData: char
          });
          addedChubCount++;
        });

        if (addedChubCount > 0 && normQuery === this.elements.globalSearchModels.value.toLowerCase().trim()) {
          let finalHtml = '';
          const historyItems = this.autocompleteSuggestions.filter(s => s.type === 'history');
          if (historyItems.length > 0) {
            finalHtml += `<div class="search-suggestion-header">Recent Searches</div>`;
            historyItems.forEach((s, idx) => {
              finalHtml += `
                <div class="search-suggestion-item" data-index="${idx}">
                  <div class="search-suggestion-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                  <div class="search-suggestion-content">
                    <div class="search-suggestion-title">${escapeHTML(s.value)}</div>
                  </div>
                  <button class="search-history-delete-btn" title="Delete Search" data-value="${escapeHTML(s.value)}" style="background: none; border: none; padding: 4px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); cursor: pointer; border-radius: 50%; width: 22px; height: 22px; transition: all 0.2s; margin-left: 8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              `;
            });
          }

          const localItems = this.autocompleteSuggestions.filter(s => s.type === 'local');
          if (localItems.length > 0) {
            finalHtml += `<div class="search-suggestion-header">${normQuery ? 'Local Companions' : 'My Companions'}</div>`;
            localItems.forEach((s, idx) => {
              const char = s.char;
              const actualIndex = historyItems.length + idx;
              const avatarImg = char.avatar 
                ? `<img src="${escapeHTML(char.avatar)}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">`
                : `<div class="search-suggestion-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
              finalHtml += `
                <div class="search-suggestion-item" data-index="${actualIndex}">
                  ${avatarImg}
                  <div class="search-suggestion-content">
                    <div class="search-suggestion-title">${escapeHTML(char.name)}</div>
                    ${char.tagline ? `<div class="search-suggestion-subtitle">${escapeHTML(char.tagline)}</div>` : ''}
                  </div>
                  <div class="search-suggestion-meta">
                    <span class="search-suggestion-badge local">Local</span>
                  </div>
                </div>
              `;
            });
          }

          const chubItems = this.autocompleteSuggestions.filter(s => s.type === 'chub');
          if (chubItems.length > 0) {
            finalHtml += `<div class="search-suggestion-header">Chub.ai Community</div>`;
            chubItems.forEach((s, idx) => {
              const char = s.charData;
              const actualIndex = historyItems.length + localItems.length + idx;
              const avatarSrc = char.avatar_url || '';
              const avatarImg = avatarSrc
                ? `<img src="${escapeHTML(avatarSrc)}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2214%22 height=%2214%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22><path d=%22M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2%22/><circle cx=%2212%22 cy=%227%22 r=%224%22/></svg>'">`
                : `<div class="search-suggestion-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg></div>`;
              const badgeClass = s.isImported ? 'imported' : 'chub';
              const badgeText = s.isImported ? 'Imported' : 'Chub AI';
              
              finalHtml += `
                <div class="search-suggestion-item" data-index="${actualIndex}">
                  <div class="search-suggestion-avatar-wrapper" style="position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
                    ${avatarImg}
                  </div>
                  <div class="search-suggestion-content">
                    <div class="search-suggestion-title">${escapeHTML(char.name)}</div>
                    ${char.tagline || char.short_description ? `<div class="search-suggestion-subtitle">${escapeHTML(char.tagline || char.short_description)}</div>` : `<div class="search-suggestion-subtitle">by ${escapeHTML(char.creator || 'Chub.ai')}</div>`}
                  </div>
                  <div class="search-suggestion-meta">
                    <span class="search-suggestion-badge ${badgeClass}">${badgeText}</span>
                  </div>
                </div>
              `;
            });
          }

          dropdown.innerHTML = finalHtml;
          dropdown.style.display = 'flex';
          dropdown.classList.remove('hidden');
          this.bindSearchSuggestionClicks();
        }
      }
    } catch (e) {
      if (e.message !== 'Aborted') {
        console.error('Failed to load Chub recommendations:', e);
      }
    }
  },

  bindSearchSuggestionClicks() {
    const dropdown = this.elements.searchAutocompleteDropdown;
    if (!dropdown) return;

    const items = dropdown.querySelectorAll('.search-suggestion-item');
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.search-history-delete-btn')) return;

        const index = parseInt(item.getAttribute('data-index'));
        if (!isNaN(index) && index >= 0 && index < this.autocompleteSuggestions.length) {
          this.handleSearchSuggestionSelection(this.autocompleteSuggestions[index], item);
        }
      });
    });

    const deleteBtns = dropdown.querySelectorAll('.search-history-delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const valueToDelete = btn.getAttribute('data-value');
        this.deleteSearchHistoryItem(valueToDelete);
      });
    });
  },

  deleteSearchHistoryItem(value) {
    if (!value) return;
    let history = this.getSearchHistory();
    history = history.filter(item => item.toLowerCase() !== value.toLowerCase());
    this.saveSearchHistory(history);
    this.searchHistory = history;
    this.renderSearchSuggestions(this.elements.globalSearchModels.value.trim());
  },

  async handleSearchSuggestionSelection(suggestion, itemEl = null) {
    const input = this.elements.globalSearchModels;
    const dropdown = this.elements.searchAutocompleteDropdown;
    if (!input || !dropdown) return;

    if (suggestion.type === 'history') {
      input.value = suggestion.value;
      this.addToSearchHistory(suggestion.value);
      this.filterCompanions(suggestion.value.toLowerCase());
      dropdown.style.display = 'none';
      dropdown.classList.add('hidden');
    } else if (suggestion.type === 'local') {
      this.addToSearchHistory(suggestion.name);
      input.value = suggestion.name;
      this.filterCompanions(suggestion.name.toLowerCase());
      dropdown.style.display = 'none';
      dropdown.classList.add('hidden');
      this.openCharacterProfile(suggestion.id);
    } else if (suggestion.type === 'chub') {
      this.addToSearchHistory(suggestion.name);
      input.value = suggestion.name;
      this.filterCompanions(suggestion.name.toLowerCase());
      dropdown.style.display = 'none';
      dropdown.classList.add('hidden');

      if (suggestion.isImported && suggestion.localCharId) {
        this.openCharacterProfile(suggestion.localCharId);
      } else {
        if (!this.communityCharacters) {
          this.communityCharacters = [];
        }
        if (!this.communityCharacters.some(c => c.id === suggestion.id)) {
          this.communityCharacters.push(suggestion.charData);
        }
        this.openCharacterProfile(suggestion.id);
      }
    }
  },

  setChatHeaderName(name) {
    const el = this.elements.chatHeaderName;
    if (!el) return;
    if (name.length > 15) {
      el.textContent = name.substring(0, 12) + '...';
      el.setAttribute('data-tooltip', name);
      el.classList.add('has-tooltip');
    } else {
      el.textContent = name;
      el.removeAttribute('data-tooltip');
      el.classList.remove('has-tooltip');
    }
  }
};
