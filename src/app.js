import { presets } from './presets.js';
import { scanLorebook, synthesizeSystemPrompt, synthesizeRoomSystemPrompt, buildApiMessages, summarizeToLedger, summarizeChunk, retrieveTopK, buildTfIdf, replacePlaceholders } from './memory.js';
import { streamChatCompletion, fetchChatCompletionJson, extractChoiceContent, FREE_MODELS } from './api.js';
import { soundManager } from './sounds.js';
import { _formatLocaleString, _parseLocaleString, safeSetItem, stripHtmlTags, escapeHTML, sanitizeHTMLTag, renderImageTag, estimateSliders } from './utils.js';

// Import modules
import { uiMethods } from './modules/ui.js';
import { settingsMethods } from './modules/settings.js';
import { chatMethods } from './modules/chat.js';
import { sessionsMethods } from './modules/sessions.js';
import { charactersMethods } from './modules/characters.js';
import { roomsMethods } from './modules/rooms.js';
import { generationMethods } from './modules/generation.js';
import { lorebookMethods } from './modules/lorebook.js';
import { ttsMethods } from './modules/tts.js';
import { themeMethods } from './modules/theme.js';

export { stripHtmlTags, escapeHTML, sanitizeHTMLTag, renderImageTag, estimateSliders } from './utils.js';

class JollyRPApp {
  constructor() {
      // Safety flag: saveData() is blocked until loadDataFromServer() completes at least once.
      // This prevents an empty localStorage state from triggering a server save before
      // the server's actual data has been loaded into the client.
      this._serverLoadConfirmed = false;

      const providers = ['openrouter', 'openai', 'mistral', 'anthropic', 'groq', 'deepseek', 'together', 'custom'];

      this.apiKeys = {};
      providers.forEach(p => {
        this.apiKeys[p] = localStorage.getItem(`jollyrp_apikey_${p}`) || '';
      });
      
      const defaultModels = {
        openrouter: 'openrouter/free',
        openai: 'gpt-4o-mini',
        mistral: 'mistral-large-latest',
        anthropic: 'claude-3-5-sonnet-latest',
        groq: 'llama-3.1-70b-versatile',
        deepseek: 'deepseek-chat',
        together: 'meta-llama/Meta-Llama-3-70B-Instruct-Turbo',
        custom: 'local-model'
      };
      this.apiModels = {};
      providers.forEach(p => {
        this.apiModels[p] = localStorage.getItem(`jollyrp_model_${p}`) || defaultModels[p] || '';
      });

      this.apiFallbacks = {};
      providers.forEach(p => {
        try {
          this.apiFallbacks[p] = JSON.parse(localStorage.getItem(`jollyrp_fallbacks_${p}`) || '[]');
        } catch (e) {
          this.apiFallbacks[p] = [];
        }
      });

      this.customApiUrls = {};
      providers.forEach(p => {
        this.customApiUrls[p] = localStorage.getItem(`jollyrp_custom_url_${p}`) || (p === 'custom' ? (localStorage.getItem('jollyrp_custom_url') || 'http://localhost:11434/v1') : '');
      });

      this.instructTemplates = {};
      providers.forEach(p => {
        this.instructTemplates[p] = localStorage.getItem(`jollyrp_instruct_${p}`) || 'vanilla';
      });

      this.apiProvider = localStorage.getItem('jollyrp_provider') || 'openrouter';
      this.apiKey = this.apiKeys[this.apiProvider] || '';
      
      // Legacy migration
      if (!localStorage.getItem('jollyrp_model_openrouter') && localStorage.getItem('jollyrp_model')) {
          this.apiModels[this.apiProvider] = localStorage.getItem('jollyrp_model');
      }
      if (!localStorage.getItem('jollyrp_custom_url_custom') && localStorage.getItem('jollyrp_custom_url')) {
          this.customApiUrls.custom = localStorage.getItem('jollyrp_custom_url');
      }
      
      // Migrate legacy instruct templates for SaaS providers to prevent double-templating issues
      const saasProviders = ['openrouter', 'openai', 'mistral', 'anthropic', 'groq', 'deepseek', 'together'];
      saasProviders.forEach(p => {
        const current = localStorage.getItem(`jollyrp_instruct_${p}`);
        if (!current || current === 'chatml' || current === 'deepseek' || current === 'llama3') {
          localStorage.setItem(`jollyrp_instruct_${p}`, 'vanilla');
          this.instructTemplates[p] = 'vanilla';
        }
      });

      this.activeModel = this.apiModels[this.apiProvider];
      this.customApiUrl = this.customApiUrls[this.apiProvider];
      this.instructTemplate = this.instructTemplates[this.apiProvider];

      this.characters = JSON.parse(localStorage.getItem('jollyrp_characters')) || [...presets];
      this.activeCharacterId = localStorage.getItem('jollyrp_active_char') || '';
      
      // Pagination fields for chat virtualization
      this.lastLoadedSessionId = '';
      this.renderedMessagesCount = 30;
      
      // Sessions map: encrypted internally in localStorage
      this.sessions = {};
      const rawSessions = localStorage.getItem('jollyrp_sessions');
      if (rawSessions) {
        try {
          let parsed = {};
          if (rawSessions.trim().startsWith('{')) {
            parsed = JSON.parse(rawSessions);
          } else {
            parsed = JSON.parse(_parseLocaleString(rawSessions));
          }
          this.sessions = this.normalizeSessions(parsed);
        } catch (e) {
          console.error("Session load error", e);
          this.sessions = {};
        }
      }
      this.activeChatId = '';
      
      this.defaultUserAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%232a2235'/><circle cx='50' cy='40' r='18' fill='%23c5a880'/><path d='M25 80c0-15 10-22 25-22s25 7 25 22z' fill='%23c5a880'/></svg>";

      // Personas list: stored in local storage
      const defaultPersona = {
        id: 'persona_default',
        name: 'Default User',
        avatar: this.defaultUserAvatar,
        description: 'The user is a roleplayer participating in an interactive story.',
        personality: 'Curious, imaginative, and responsive.',
        speechQuirks: 'Speaks clearly and uses standard English.'
      };
      this.personas = JSON.parse(localStorage.getItem('jollyrp_personas')) || [defaultPersona];
      this.activePersonaId = localStorage.getItem('jollyrp_active_persona') || 'persona_default';

      // Summarization Settings
      this.autoSummarizeEnabled = localStorage.getItem('jollyrp_auto_summarize') !== 'false';
      this.summarizeTriggerN = parseInt(localStorage.getItem('jollyrp_summarize_trigger')) || 15;
      this.summarizeKeepN = parseInt(localStorage.getItem('jollyrp_summarize_keep')) || 10;
      
      if (this.personas && Array.isArray(this.personas)) {
        this.personas = this.personas.map(p => {
          if (p.avatar && (p.avatar.includes('photo-1535713875002-d1d0cf377fde') || p.avatar.includes('viewBox="0 0 100 100"'))) {
            p.avatar = defaultPersona.avatar;
          }
          return p;
        });
        safeSetItem('jollyrp_personas', JSON.stringify(this.personas));
      }
      if (!this.personas || !Array.isArray(this.personas) || this.personas.length === 0) {
        this.personas = [defaultPersona];
        safeSetItem('jollyrp_personas', JSON.stringify(this.personas));
      }
      
      this.activeStreamController = null;
      this.currentMood = 'neutral';
      
      // Cached regex for character name prefix stripping in formatAssistantText
      this._cachedPrefixRegex = null;
      this._cachedPrefixRegexCharId = null;
      
      // Auto-scroll lock: tracks whether user has manually scrolled up
      this._userScrolledUp = false;
      
      // Filters configuration
      this.currentVisibilityFilter = 'all';
      this.currentCategoryFilter = 'all';
      this.currentTimeframeFilter = 'weekly';
      this.exploreModeActive = false;
      this.currentTagFilter = '';
      this.currentGridPage = 1;
      this.currentSource = 'local';
      
      // Dialogue director settings
      this.verbosity = parseInt(localStorage.getItem('jollyrp_verbosity') ?? '50');
      this.actionRatio = parseInt(localStorage.getItem('jollyrp_action_ratio') ?? '50');

      // Content Filter Settings
      this.nsfwEnabled = localStorage.getItem('jollyrp_nsfw_enabled') === 'true';
      this.nsfwBlur = localStorage.getItem('jollyrp_nsfw_blur') !== 'false';
      this.currentCommunitySort = 'download_count';

      // PIN Lock settings
      this.pinEnabled = localStorage.getItem('jollyrp_pin_enabled') === 'true';
      this.pinCode = localStorage.getItem('jollyrp_pin_code') || '';
      this.communityCharacters = [];
      this.communitySearchAbortController = null;

      // Generation Parameters
      this.generationParams = {
        temperature: parseFloat(localStorage.getItem('jollyrp_param_temperature') ?? '0.8'),
        top_p: parseFloat(localStorage.getItem('jollyrp_param_top_p') ?? '1.0'),
        top_k: parseInt(localStorage.getItem('jollyrp_param_top_k') ?? '40'),
        repetition_penalty: parseFloat(localStorage.getItem('jollyrp_param_repetition_penalty') ?? '1.18'),
        max_tokens: parseInt(localStorage.getItem('jollyrp_param_max_tokens') ?? '1024')
      };

      this.contextBudget = parseInt(localStorage.getItem('jollyrp_context_budget') ?? '8192');

      this.showSuggestionChips = localStorage.getItem('jollyrp_enable_suggestion_chips') !== 'false';
      this.showReasoning = localStorage.getItem('jollyrp_show_reasoning') !== 'false';
      // reasoningEnabled: whether to actually REQUEST thinking from the model (prompt-level control)
      // Separate from showReasoning which only controls the display accordion
      this.reasoningEnabled = localStorage.getItem('jollyrp_reasoning_enabled') !== 'false';

      // TTS settings
      try {
        const storedTts = localStorage.getItem('jollyrp_tts_settings');
        this.ttsSettings = storedTts ? JSON.parse(storedTts) : {
          provider: 'browser',
          browserVoice: '',
          browserPitch: 1.0,
          browserRate: 1.0,
          customUrl: '',
          customKey: '',
          customMethod: 'POST',
          customHeaders: '{\n  "Content-Type": "application/json"\n}',
          customBody: '{\n  "text": "{{text}}"\n}',
          autoplay: false
        };
      } catch (e) {
        this.ttsSettings = {
          provider: 'browser',
          browserVoice: '',
          browserPitch: 1.0,
          browserRate: 1.0,
          customUrl: '',
          customKey: '',
          customMethod: 'POST',
          customHeaders: '{\n  "Content-Type": "application/json"\n}',
          customBody: '{\n  "text": "{{text}}"\n}',
          autoplay: false
        };
      }

      this.directorModeActive = false;
      this.bannedWords = JSON.parse(localStorage.getItem('jollyrp_banned_words') || '[]');
      this.subnavCollapsed = localStorage.getItem('jollyrp_subnav_collapsed') === 'true';
    }

  normalizeSessions(sessionsObj) {
    if (!sessionsObj || typeof sessionsObj !== 'object') {
      return {};
    }
    const normalized = {};
    Object.entries(sessionsObj).forEach(([key, rawVal]) => {
      if (!rawVal) {
        normalized[key] = [];
        return;
      }
      if (Array.isArray(rawVal)) {
        normalized[key] = rawVal;
      } else if (typeof rawVal === 'object') {
        if (rawVal.messages) {
          // Migrate old flat session to array of one session
          const seedChunks = [];
          if (rawVal.ledger && rawVal.ledger.trim()) {
            try {
              seedChunks.push({
                summary: rawVal.ledger.trim(),
                tfidf: buildTfIdf ? buildTfIdf(rawVal.ledger) : {},
                timestamp: Date.now()
              });
            } catch (err) {
              console.warn("Failed to build tfidf during normalization:", err);
            }
          }
          normalized[key] = [{
            id: rawVal.id || `chat_${Date.now()}`,
            name: rawVal.name || (key.startsWith('room_') ? "Unnamed Room" : "Original Conversation"),
            messages: rawVal.messages || [],
            ledger: rawVal.ledger || "",
            memoryChunks: seedChunks,
            chunkCursor: rawVal.summaryCursor || 0,
            count: rawVal.count || 0,
            createdAt: rawVal.createdAt || Date.now(),
            ...(rawVal.roomCharIds ? { roomCharIds: rawVal.roomCharIds } : {}),
            ...(rawVal.roomName ? { roomName: rawVal.roomName } : {})
          }];
        } else {
          normalized[key] = [];
        }
      } else {
        normalized[key] = [];
      }
    });
    return normalized;
  }

  async loadDataFromServer() {
      try {
        const response = await fetch('/api/load');
        if (response.ok) {
          const data = await response.json();
          
          let hasServerData = false;
          let requiresUpload = false;

          // Load Settings
          if (data.settings && Object.keys(data.settings).length > 0) {
            hasServerData = true;
            if (data.settings.apiKeys) {
              this.apiKeys = { ...this.apiKeys, ...data.settings.apiKeys };
            }
            if (data.settings.apiProvider) this.apiProvider = data.settings.apiProvider;
            if (data.settings.apiKey) this.apiKey = data.settings.apiKey;
            if (data.settings.activeModel) this.activeModel = data.settings.activeModel;
            if (data.settings.apiModels) {
              this.apiModels = { ...this.apiModels, ...data.settings.apiModels };
            } else {
              requiresUpload = true;
            }
            if (data.settings.customApiUrls) {
              this.customApiUrls = { ...this.customApiUrls, ...data.settings.customApiUrls };
            } else if (data.settings.customApiUrl) {
              this.customApiUrls.custom = data.settings.customApiUrl;
              requiresUpload = true;
            }
            if (data.settings.apiFallbacks) {
              this.apiFallbacks = { ...this.apiFallbacks, ...data.settings.apiFallbacks };
            } else if ((this.apiFallbacks.openrouter && this.apiFallbacks.openrouter.length > 0) || (this.apiFallbacks.custom && this.apiFallbacks.custom.length > 0)) {
              requiresUpload = true;
            }
            if (data.settings.instructTemplates) {
              this.instructTemplates = { ...this.instructTemplates, ...data.settings.instructTemplates };
            } else {
              requiresUpload = true;
            }
            this.apiKey = this.apiKeys[this.apiProvider] || data.settings.apiKey || '';
            this.activeModel = this.apiModels[this.apiProvider] || this.activeModel;
            this.customApiUrl = this.customApiUrls[this.apiProvider] || '';
            this.instructTemplate = this.instructTemplates[this.apiProvider] || this.instructTemplate;

            // Sync loaded API settings back to localStorage
            if (this.apiKeys) {
              Object.entries(this.apiKeys).forEach(([prov, val]) => {
                if (val !== undefined && val !== null) {
                  safeSetItem(`jollyrp_apikey_${prov}`, val);
                }
              });
            }
            if (this.apiModels) {
              Object.entries(this.apiModels).forEach(([prov, val]) => {
                if (val !== undefined && val !== null) {
                  safeSetItem(`jollyrp_model_${prov}`, val);
                }
              });
            }
            if (this.customApiUrls) {
              Object.entries(this.customApiUrls).forEach(([prov, val]) => {
                if (val !== undefined && val !== null) {
                  safeSetItem(`jollyrp_custom_url_${prov}`, val);
                }
              });
            }
            if (this.instructTemplates) {
              Object.entries(this.instructTemplates).forEach(([prov, val]) => {
                if (val !== undefined && val !== null) {
                  safeSetItem(`jollyrp_instruct_${prov}`, val);
                }
              });
            }
            if (this.apiFallbacks) {
              Object.entries(this.apiFallbacks).forEach(([prov, val]) => {
                if (val !== undefined && val !== null) {
                  safeSetItem(`jollyrp_fallbacks_${prov}`, JSON.stringify(val));
                }
              });
            }
            if (this.apiProvider) {
              safeSetItem('jollyrp_provider', this.apiProvider);
            }
            if (this.apiKey) {
              safeSetItem('jollyrp_apikey', this.apiKey);
            }
            if (this.activeModel) {
              safeSetItem('jollyrp_model', this.activeModel);
            }
            if (this.customApiUrl) {
              safeSetItem('jollyrp_custom_url', this.customApiUrl);
            }
            if (data.settings.favorites) {
              safeSetItem('jollyrp_favorites', JSON.stringify(data.settings.favorites));
            }
            if (data.settings.nsfwEnabled !== undefined) {
              this.nsfwEnabled = data.settings.nsfwEnabled;
              safeSetItem('jollyrp_nsfw_enabled', this.nsfwEnabled ? 'true' : 'false');
            }
            if (data.settings.nsfwBlur !== undefined) {
              this.nsfwBlur = data.settings.nsfwBlur;
              safeSetItem('jollyrp_nsfw_blur', this.nsfwBlur ? 'true' : 'false');
            }
            if (data.settings.pinEnabled !== undefined) {
              this.pinEnabled = data.settings.pinEnabled;
              safeSetItem('jollyrp_pin_enabled', this.pinEnabled ? 'true' : 'false');
            }
            if (data.settings.pinCode !== undefined) {
              this.pinCode = data.settings.pinCode;
              safeSetItem('jollyrp_pin_code', this.pinCode);
            }
            if (data.settings.autoSummarize !== undefined) {
              this.autoSummarizeEnabled = data.settings.autoSummarize;
              safeSetItem('jollyrp_auto_summarize', this.autoSummarizeEnabled ? 'true' : 'false');
            }
            if (data.settings.showSuggestionChips !== undefined) {
              this.showSuggestionChips = data.settings.showSuggestionChips;
              safeSetItem('jollyrp_enable_suggestion_chips', this.showSuggestionChips ? 'true' : 'false');
            }
            if (data.settings.showReasoning !== undefined) {
              this.showReasoning = data.settings.showReasoning;
              safeSetItem('jollyrp_show_reasoning', this.showReasoning ? 'true' : 'false');
            }
            if (data.settings.reasoningEnabled !== undefined) {
              this.reasoningEnabled = data.settings.reasoningEnabled;
              safeSetItem('jollyrp_reasoning_enabled', this.reasoningEnabled ? 'true' : 'false');
            }
            if (data.settings.generationParams) {
              this.generationParams = { ...this.generationParams, ...data.settings.generationParams };
              safeSetItem('jollyrp_param_temperature', this.generationParams.temperature);
              safeSetItem('jollyrp_param_top_p', this.generationParams.top_p);
              safeSetItem('jollyrp_param_top_k', this.generationParams.top_k);
              safeSetItem('jollyrp_param_repetition_penalty', this.generationParams.repetition_penalty);
              safeSetItem('jollyrp_param_max_tokens', this.generationParams.max_tokens);
            }
            if (data.settings.verbosity !== undefined) {
              this.verbosity = parseInt(data.settings.verbosity);
              safeSetItem('jollyrp_verbosity', this.verbosity);
              if (this.elements.sliderVerbosity) this.elements.sliderVerbosity.value = this.verbosity;
            }
            if (data.settings.actionRatio !== undefined) {
              this.actionRatio = parseInt(data.settings.actionRatio);
              safeSetItem('jollyrp_action_ratio', this.actionRatio);
              if (this.elements.sliderActionRatio) this.elements.sliderActionRatio.value = this.actionRatio;
            }
            if (data.settings.tts) {
              this.ttsSettings = { ...this.ttsSettings, ...data.settings.tts };
              safeSetItem('jollyrp_tts_settings', JSON.stringify(this.ttsSettings));
            }
            if (data.settings.theme !== undefined) {
              safeSetItem('jollyrp_theme', data.settings.theme);
              this.applyTheme(data.settings.theme);
            }
            if (data.settings.styleSettings !== undefined) {
              this.styleSettings = data.settings.styleSettings;
              safeSetItem('jollyrp_style_settings', JSON.stringify(this.styleSettings));
              this.applyDynamicStyles();
            }
            if (data.settings.bannedWords !== undefined) {
              this.bannedWords = data.settings.bannedWords;
              safeSetItem('jollyrp_banned_words', JSON.stringify(this.bannedWords));
            }
          }

          // Load Characters
          if (data.characters && data.characters.length > 0) {
            hasServerData = true;
            this.characters = data.characters;
          }

          // Load Chats
          if (data.sessions && Object.keys(data.sessions).length > 0) {
            hasServerData = true;
            let mergedAnyChanges = false;
            
            if (!this.sessions) {
              this.sessions = {};
            }
            
            // Normalize both local and server sessions to arrays
            this.sessions = this.normalizeSessions(this.sessions);
            const normalizedServerSessions = this.normalizeSessions(data.sessions);
            
            Object.entries(normalizedServerSessions).forEach(([charId, serverSessionsList]) => {
              if (!this.sessions[charId] || this.sessions[charId].length === 0) {
                this.sessions[charId] = serverSessionsList;
                mergedAnyChanges = true;
              } else {
                const localSessionsList = this.sessions[charId];
                const mergedSessionsList = [...localSessionsList];
                
                serverSessionsList.forEach(serverSession => {
                  const localSessionIdx = mergedSessionsList.findIndex(s => s.id === serverSession.id);
                  if (localSessionIdx === -1) {
                    mergedSessionsList.push(serverSession);
                    mergedAnyChanges = true;
                  } else {
                    const localSession = mergedSessionsList[localSessionIdx];
                    const localMsgCount = (localSession.messages || []).length;
                    const serverMsgCount = (serverSession.messages || []).length;
                    
                    if (serverMsgCount > localMsgCount) {
                      mergedSessionsList[localSessionIdx] = serverSession;
                      mergedAnyChanges = true;
                    } else if (localMsgCount > serverMsgCount) {
                      // Local session has more messages, keep local but mark changed so we sync to server
                      mergedAnyChanges = true;
                    }
                  }
                });
                
                this.sessions[charId] = mergedSessionsList;
              }
            });

            // Check if there are keys in local sessions that are NOT in server sessions (e.g. local-only group rooms)
            Object.keys(this.sessions).forEach(localCharId => {
              if (!data.sessions[localCharId]) {
                mergedAnyChanges = true;
              }
            });

            if (mergedAnyChanges) {
              safeSetItem('jollyrp_sessions', _formatLocaleString(JSON.stringify(this.sessions)));
              await this.saveData();
            }
          } else if (this.sessions && Object.keys(this.sessions).length > 0) {
            // Server has no chats, but client has meaningful local chats — safe to sync.
            // Guard: only sync if client actually has messages, not just empty session keys.
            const localHasMeaningfulChats = Object.values(this.sessions).some(s => Array.isArray(s) && s.some(chat => (chat.messages || []).length > 1));
            if (localHasMeaningfulChats) {
              console.log('Server has no chats, syncing local chats to server...');
              await this.saveData();
            }
          }
          
          // Load Personas
          if (data.personas && data.personas.length > 0) {
            hasServerData = true;
            this.personas = data.personas;
            safeSetItem('jollyrp_personas', JSON.stringify(this.personas));
          } else if (this.personas && this.personas.length > 0) {
            const isNotDefault = this.personas.length > 1 || (this.personas[0] && this.personas[0].name !== 'Default User');
            if (isNotDefault) requiresUpload = true;
          }

          if (requiresUpload) {
            console.log('Server is missing some local data (fallbacks/models/personas), syncing local to server...');
            await this.saveData();
          }

          this.isServerStorageActive = true;
          // Mark that server load is confirmed — saveData() is now safe to call
          this._serverLoadConfirmed = true;
          console.log('Successfully loaded all data from server storage.');

          // If server has no data but client has meaningful local data, sync client to server.
          // Guard: never sync if both server and client only have empty/default state.
          if (!hasServerData) {
            const localHasMeaningfulChars = this.characters && this.characters.some(c => !['barnaby', 'eldrin', 'lilith'].includes(c.id));
            const localHasMeaningfulChats = this.sessions && Object.values(this.sessions).some(s => Array.isArray(s) && s.some(chat => (chat.messages || []).length > 1));
            if (localHasMeaningfulChars || localHasMeaningfulChats) {
              console.log('Server storage is empty, syncing local data to server...');
              await this.saveData();
            } else {
              console.log('Both server and client appear to be in default/empty state. Skipping auto-sync to prevent empty overwrite.');
            }
          }
        }
      } catch (err) {
        console.warn('Could not load data from server storage, using local fallback:', err);
      } finally {
        // Even if load fails, mark as confirmed so the app doesn't deadlock
        this._serverLoadConfirmed = true;
      }
    }

  async saveData(forceImmediately = false) {
      // Safety guard: never save to the server before we have confirmed server data.
      // This prevents an empty localStorage state from overwriting the server on first load.
      if (!this._serverLoadConfirmed && !forceImmediately) {
        console.warn('[saveData] Blocked: server load not yet confirmed. Skipping save to prevent data wipe.');
        return;
      }
      // 1. Instantly save the lightweight settings in localStorage
      if (this.apiKeys) {
        Object.entries(this.apiKeys).forEach(([prov, val]) => {
          safeSetItem(`jollyrp_apikey_${prov}`, val || '');
        });
      }
      if (this.apiModels) {
        Object.entries(this.apiModels).forEach(([prov, val]) => {
          safeSetItem(`jollyrp_model_${prov}`, val || '');
        });
      }
      if (this.customApiUrls) {
        Object.entries(this.customApiUrls).forEach(([prov, val]) => {
          safeSetItem(`jollyrp_custom_url_${prov}`, val || '');
        });
      }
      if (this.instructTemplates) {
        Object.entries(this.instructTemplates).forEach(([prov, val]) => {
          safeSetItem(`jollyrp_instruct_${prov}`, val || '');
        });
      }
      if (this.apiFallbacks) {
        Object.entries(this.apiFallbacks).forEach(([prov, val]) => {
          safeSetItem(`jollyrp_fallbacks_${prov}`, JSON.stringify(val || []));
        });
      }
      safeSetItem('jollyrp_provider', this.apiProvider || 'openrouter');
      safeSetItem('jollyrp_apikey', this.apiKey || '');
      safeSetItem('jollyrp_model', this.activeModel || '');
      safeSetItem('jollyrp_custom_url', this.customApiUrl || '');
      safeSetItem('jollyrp_nsfw_enabled', this.nsfwEnabled ? 'true' : 'false');
      safeSetItem('jollyrp_nsfw_blur', this.nsfwBlur ? 'true' : 'false');
      safeSetItem('jollyrp_auto_summarize', this.autoSummarizeEnabled ? 'true' : 'false');
      safeSetItem('jollyrp_enable_suggestion_chips', this.showSuggestionChips ? 'true' : 'false');
      safeSetItem('jollyrp_show_reasoning', this.showReasoning ? 'true' : 'false');
      safeSetItem('jollyrp_reasoning_enabled', this.reasoningEnabled ? 'true' : 'false');
      safeSetItem('jollyrp_summarize_trigger', this.summarizeTriggerN.toString());
      safeSetItem('jollyrp_summarize_keep', this.summarizeKeepN.toString());
      safeSetItem('jollyrp_pin_enabled', this.pinEnabled ? 'true' : 'false');
      safeSetItem('jollyrp_pin_code', this.pinCode || '');
      
      // Save generation parameters local fallback
      safeSetItem('jollyrp_param_temperature', this.generationParams.temperature);
      safeSetItem('jollyrp_param_top_p', this.generationParams.top_p);
      safeSetItem('jollyrp_param_top_k', this.generationParams.top_k);
      safeSetItem('jollyrp_param_repetition_penalty', this.generationParams.repetition_penalty);
      safeSetItem('jollyrp_param_max_tokens', this.generationParams.max_tokens);
      
      // Save dialogue director settings local fallback
      safeSetItem('jollyrp_verbosity', this.verbosity);
      safeSetItem('jollyrp_action_ratio', this.actionRatio);
      safeSetItem('jollyrp_tts_settings', JSON.stringify(this.ttsSettings));
      safeSetItem('jollyrp_banned_words', JSON.stringify(this.bannedWords || []));

      // Debounce the expensive parts (JSON stringify of characters/sessions/personas, XORing sessions, and server sync)
      if (this.saveDataTimeout) {
        clearTimeout(this.saveDataTimeout);
      }

      const performSave = async () => {
        try {
          safeSetItem('jollyrp_characters', JSON.stringify(this.characters));
          safeSetItem('jollyrp_personas', JSON.stringify(this.personas));
          
          if (this.sessions) {
            safeSetItem('jollyrp_sessions', _formatLocaleString(JSON.stringify(this.sessions)));
          }

          const favorites = JSON.parse(localStorage.getItem('jollyrp_favorites')) || [];

          // Save to server endpoints
          const payload = {
            settings: {
              apiKeys: this.apiKeys,
              apiProvider: this.apiProvider,
              apiKey: this.apiKey,
              activeModel: this.activeModel,
              apiModels: this.apiModels,
              apiFallbacks: this.apiFallbacks,
              instructTemplates: this.instructTemplates,
              customApiUrls: this.customApiUrls,
              customApiUrl: this.customApiUrl,
              favorites: favorites,
              nsfwEnabled: this.nsfwEnabled,
              nsfwBlur: this.nsfwBlur,
              autoSummarize: this.autoSummarizeEnabled,
              showSuggestionChips: this.showSuggestionChips,
              showReasoning: this.showReasoning,
              reasoningEnabled: this.reasoningEnabled,
              generationParams: this.generationParams,
              verbosity: this.verbosity,
              actionRatio: this.actionRatio,
              pinEnabled: this.pinEnabled,
              pinCode: this.pinCode,
              tts: this.ttsSettings,
              theme: localStorage.getItem('jollyrp_theme') || 'default',
              styleSettings: this.styleSettings,
              bannedWords: this.bannedWords
            },
            characters: this.characters,
            sessions: this.sessions,
            personas: this.personas
          };

          await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (err) {
          console.warn('API save failed, relying on localStorage fallback:', err);
        }
      };

      if (forceImmediately) {
        await performSave();
      } else {
        this.saveDataTimeout = setTimeout(performSave, 1500);
      }
    }

  async init() {
      this.bindDomElements();
      
      // Start simulated progressive loading screen early
      this.runLoadingScreen();
      
      this.initStyleSettings();
      this.setupEventListeners();
      this.setupStyleCustomizerListeners();
      this.setupScenarioThemePanelListeners();
      this.setupStoryTimelineListeners();
      this.setupBannedWordsPanelListeners();
      this.populateModelSelector();
      this.applyTheme(localStorage.getItem('jollyrp_theme') || 'default');

      // Try loading from server first
      await this.loadDataFromServer();
      this.renderBannedWordsList();

      // Restore state
      if (this.apiProvider && this.elements.providerSelect) {
        this.elements.providerSelect.value = this.apiProvider;
      }
      if (this.elements.apiKeyInput) {
        this.elements.apiKeyInput.value = this.apiKeys[this.apiProvider] || '';
      }

      if (this.customApiUrl && this.elements.customUrlInput) {
        this.elements.customUrlInput.value = this.customApiUrl;
      }

      if (this.apiProvider === 'openrouter') {
        const isPreset = FREE_MODELS.some(m => m.id === this.activeModel);
        if (this.elements.modelSelect) {
          if (isPreset) {
            this.elements.modelSelect.value = this.activeModel;
          } else {
            this.elements.modelSelect.value = 'custom';
            if (this.elements.customModelInput) {
              this.elements.customModelInput.value = this.activeModel;
            }
          }
        }
      } else {
        if (this.elements.customModelInput) {
          this.elements.customModelInput.value = this.activeModel;
        }
      }
      
      // Restore NSFW settings inputs
      if (this.elements.settingNsfwEnable) {
        this.elements.settingNsfwEnable.checked = this.nsfwEnabled;
      }
      if (this.elements.settingNsfwBlur) {
        this.elements.settingNsfwBlur.checked = this.nsfwBlur;
      }

      // Restore PIN Settings inputs
      if (this.elements.settingPinEnable) {
        this.elements.settingPinEnable.checked = this.pinEnabled;
        const pinGroup = document.getElementById('pin-setup-group');
        if (pinGroup) pinGroup.style.display = this.pinEnabled ? 'flex' : 'none';
      }
      if (this.elements.settingPinCode) {
        this.elements.settingPinCode.value = this.pinCode || '';
      }

      // Restore Dialogue Director slider values
      if (this.elements.sliderVerbosity) {
        this.elements.sliderVerbosity.value = this.verbosity;
      }
      if (this.elements.sliderActionRatio) {
        this.elements.sliderActionRatio.value = this.actionRatio;
      }
      this.syncDirectorSliders();

      this.populatePersonaDropdowns();

      // Always start at landing (home) screen on load
      this.showLandingScreen();
      
      this.checkKeyWarning();
      this.updateLockButtonVisibility();

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        this.populateBrowserVoices();
        window.speechSynthesis.onvoiceschanged = () => this.populateBrowserVoices();
      }

      // Set up scroll lock detection on the chat thread
      if (this.elements.chatThread) {
        this._setupScrollLock(this.elements.chatThread);
      }
    }

  runLoadingScreen() {
      const bar = this.elements.loadingBarFill;
      const text = this.elements.loadingText;
      const overlay = this.elements.loadingScreen;
      if (!bar || !overlay) return;

      let progress = 0;
      const steps = [
        { p: 15, t: 'Loading character presets...' },
        { p: 35, t: 'Reading local conversation logs...' },
        { p: 60, t: 'Synthesizing audio nodes...' },
        { p: 85, t: 'Restoring API configuration keys...' },
        { p: 100, t: 'Ready!' }
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
        if (currentStep < steps.length) {
          const step = steps[currentStep];
          
          // Wait at 85% if server data is not yet loaded
          if (step.p === 100 && !this._serverLoadConfirmed) {
            return;
          }

          progress += (step.p - progress) * 0.25;
          if (Math.abs(progress - step.p) < 2) {
            progress = step.p;
            if (text) text.textContent = step.t;
            currentStep++;
          }
          bar.style.width = `${progress}%`;
        } else {
          clearInterval(interval);
          if (this.pinEnabled && this.pinCode) {
            // Transition to PIN entry screen
            const loadingInner = document.getElementById('loading-inner');
            const pinCard = document.getElementById('pin-screen-card');
            if (loadingInner && pinCard) {
              loadingInner.style.transition = 'opacity 0.3s ease';
              loadingInner.style.opacity = '0';
              setTimeout(() => {
                loadingInner.style.display = 'none';
                pinCard.style.display = 'flex';
                pinCard.style.opacity = '0';
                pinCard.offsetHeight; // force reflow
                pinCard.style.transition = 'opacity 0.3s ease';
                pinCard.style.opacity = '1';
                this.setupPinLockHandlers();
              }, 300);
            } else {
              this.dismissLoadingScreen(overlay);
            }
          } else {
            this.dismissLoadingScreen(overlay);
          }
        }
      }, 120);
    }

  dismissLoadingScreen(overlay) {
      if (!overlay) overlay = this.elements.loadingScreen;
      if (!overlay) return;
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 500);
    }
}

// Assign prototype methods
Object.assign(
  JollyRPApp.prototype,
  uiMethods,
  settingsMethods,
  chatMethods,
  sessionsMethods,
  charactersMethods,
  roomsMethods,
  generationMethods,
  lorebookMethods,
  ttsMethods,
  themeMethods
);

// Instantiate and start
window.addEventListener('DOMContentLoaded', () => {
  const app = new JollyRPApp();
  app.init();
});
