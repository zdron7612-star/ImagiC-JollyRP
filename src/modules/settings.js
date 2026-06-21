import { safeSetItem } from '../utils.js';
import { FREE_MODELS, isReasoningModel } from '../api.js';

export const settingsMethods = {
  renderFallbackConfigurations(provider) {
    if (!this.elements.fallbacksListContainer) return;
    this.elements.fallbacksListContainer.innerHTML = '';
    const fallbacks = this.apiFallbacks[provider] || [];
    
    fallbacks.forEach((fb, index) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.gap = '8px';
      row.style.padding = '12px';
      row.style.background = 'var(--bg-tertiary)';
      row.style.border = '1px solid var(--border-muted)';
      row.style.borderRadius = 'var(--radius-sm)';
      row.style.position = 'relative';
      row.className = 'fallback-row';
      row.dataset.index = index;

      const headerRow = document.createElement('div');
      headerRow.style.display = 'flex';
      headerRow.style.justifyContent = 'space-between';
      headerRow.style.alignItems = 'center';
      headerRow.innerHTML = `<span style="font-size: 12px; font-weight: 600; color: var(--accent-gold);">Fallback Configuration ${index + 1}</span>`;

      const controlsDiv = document.createElement('div');
      controlsDiv.style.display = 'flex';
      controlsDiv.style.gap = '8px';
      
      const activateBtn = document.createElement('button');
      activateBtn.className = 'btn btn-primary';
      activateBtn.style.padding = '4px 10px';
      activateBtn.style.fontSize = '10.5px';
      activateBtn.title = 'Swap this fallback to become your main primary endpoint/key';
      activateBtn.innerHTML = '⭐ Set Active';
      activateBtn.onclick = () => {
        const currentMainKey = this.elements.apiKeyInput.value;
        const currentFallbackKey = row.querySelector('.fallback-key-input') ? row.querySelector('.fallback-key-input').value : '';
        
        let currentMainModel;
        if (provider === 'openrouter') {
          if (this.elements.modelSelect.value === 'custom') {
            currentMainModel = this.elements.customModelInput.value;
          } else {
            currentMainModel = this.elements.modelSelect.value;
          }
        } else {
          currentMainModel = this.elements.customModelInput.value;
        }
        const currentFallbackModel = row.querySelector('.fallback-model-input') ? row.querySelector('.fallback-model-input').value : '';

        // Swap main
        this.elements.apiKeyInput.value = currentFallbackKey;
        fb.apiKey = currentMainKey;
        
        // Handle model swap
        if (provider === 'openrouter') {
          // If the fallback model matches a select option, select it. Else use custom.
          let foundInSelect = false;
          Array.from(this.elements.modelSelect.options).forEach(opt => {
            if (opt.value === currentFallbackModel) foundInSelect = true;
          });
          if (foundInSelect) {
            this.elements.modelSelect.value = currentFallbackModel;
            this.elements.customModelGroup.style.display = 'none';
          } else {
            this.elements.modelSelect.value = 'custom';
            this.elements.customModelGroup.style.display = 'block';
            this.elements.customModelInput.value = currentFallbackModel;
          }
        } else {
          this.elements.customModelInput.value = currentFallbackModel;
        }
        fb.model = currentMainModel;

        if (provider !== 'openrouter') {
          const currentMainUrl = this.elements.customUrlInput.value;
          const currentFallbackUrl = row.querySelector('.fallback-url-input') ? row.querySelector('.fallback-url-input').value : '';
          
          this.elements.customUrlInput.value = currentFallbackUrl;
          fb.customUrl = currentMainUrl;
        }

        activateBtn.classList.add('pop-anim');
        activateBtn.innerHTML = '✅ Activated!';
        
        const rows = this.elements.fallbacksListContainer.querySelectorAll('.fallback-row');
        rows.forEach(r => {
          const idx = parseInt(r.dataset.index);
          if (idx === index) return; 
          const rKey = r.querySelector('.fallback-key-input');
          const rModel = r.querySelector('.fallback-model-input');
          if (rKey) fallbacks[idx].apiKey = rKey.value;
          if (rModel) fallbacks[idx].model = rModel.value;
          if (provider !== 'openrouter') {
            const rUrl = r.querySelector('.fallback-url-input');
            if (rUrl) fallbacks[idx].customUrl = rUrl.value;
          }
        });
        
        setTimeout(() => this.renderFallbackConfigurations(provider), 600);
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn';
      removeBtn.style.padding = '4px 10px';
      removeBtn.style.fontSize = '10.5px';
      removeBtn.style.background = 'rgba(255, 50, 50, 0.1)';
      removeBtn.style.color = '#ff6b6b';
      removeBtn.innerHTML = 'Delete';
      removeBtn.onclick = () => {
        this.apiFallbacks[provider].splice(index, 1);
        this.renderFallbackConfigurations(provider);
      };

      controlsDiv.appendChild(activateBtn);
      controlsDiv.appendChild(removeBtn);
      headerRow.appendChild(controlsDiv);
      row.appendChild(headerRow);

      const fieldsRow = document.createElement('div');
      fieldsRow.style.display = 'flex';
      fieldsRow.style.flexWrap = 'wrap';
      fieldsRow.style.gap = '8px';

      if (provider !== 'openrouter') {
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'input-field fallback-url-input';
        urlInput.placeholder = 'Custom URL (http://localhost:11434/v1)';
        urlInput.value = fb.customUrl || '';
        urlInput.style.flex = '1';
        urlInput.style.minWidth = '200px';
        fieldsRow.appendChild(urlInput);
      }

      const keyInput = document.createElement('input');
      keyInput.type = 'password';
      keyInput.className = 'input-field fallback-key-input';
      keyInput.placeholder = provider === 'openrouter' ? 'sk-or-v1-... (API Key)' : 'API Key (Optional)';
      keyInput.value = fb.apiKey || '';
      keyInput.style.flex = '1';
      keyInput.style.minWidth = '200px';
      fieldsRow.appendChild(keyInput);

      const modelInput = document.createElement('input');
      modelInput.type = 'text';
      modelInput.className = 'input-field fallback-model-input';
      modelInput.placeholder = 'Model ID (e.g. cognitivecomputations/dolphin-2.9)';
      modelInput.value = fb.model || '';
      modelInput.style.flex = '1';
      modelInput.style.minWidth = '200px';
      fieldsRow.appendChild(modelInput);

      row.appendChild(fieldsRow);
      this.elements.fallbacksListContainer.appendChild(row);
    });
  },

  updateProviderFieldsVisibility(forceLoadSettings = false) {
    const provider = this.elements.providerSelect.value;
    
    // Reset disabled status
    this.elements.apiKeyInput.disabled = false;
    
    if (forceLoadSettings) {
      this.renderFallbackConfigurations(provider);
      
      if (this.elements.settingAutoSummarize) {
        this.elements.settingAutoSummarize.checked = this.autoSummarizeEnabled;
        this.elements.settingSummarizeTrigger.value = this.summarizeTriggerN;
        this.elements.settingSummarizeKeep.value = this.summarizeKeepN;
      }
      
      // Load Generation Parameters into UI Sliders
      if (this.elements.settingParamTemp) {
        this.elements.settingParamTemp.value = this.generationParams.temperature;
        document.getElementById('val-param-temp').textContent = this.generationParams.temperature.toFixed(2);
        
        this.elements.settingParamTopP.value = this.generationParams.top_p;
        document.getElementById('val-param-topp').textContent = this.generationParams.top_p.toFixed(2);
        
        this.elements.settingParamTopK.value = this.generationParams.top_k;
        document.getElementById('val-param-topk').textContent = this.generationParams.top_k;
        
        this.elements.settingParamRepPen.value = this.generationParams.repetition_penalty;
        document.getElementById('val-param-reppen').textContent = this.generationParams.repetition_penalty.toFixed(2);
        
        this.elements.settingParamMaxTokens.value = this.generationParams.max_tokens;
        document.getElementById('val-param-maxtokens').textContent = this.generationParams.max_tokens;
      }

      const settingParamSuggestionChips = document.getElementById('setting-param-suggestion-chips');
      if (settingParamSuggestionChips) {
        settingParamSuggestionChips.checked = this.showSuggestionChips;
      }

      const settingParamShowReasoning = document.getElementById('setting-param-show-reasoning');
      if (settingParamShowReasoning) {
        settingParamShowReasoning.checked = this.showReasoning;
      }

      const settingParamEnableReasoning = document.getElementById('setting-param-enable-reasoning');
      if (settingParamEnableReasoning) {
        settingParamEnableReasoning.checked = this.reasoningEnabled;
      }
      this.updateReasoningTokenWarning();

      const popupTemp = document.getElementById('popup-param-temp');
      if (popupTemp) {
        popupTemp.value = this.generationParams.temperature;
        document.getElementById('popup-val-temp').textContent = this.generationParams.temperature.toFixed(2);
        
        document.getElementById('popup-param-topp').value = this.generationParams.top_p;
        document.getElementById('popup-val-topp').textContent = this.generationParams.top_p.toFixed(2);
        
        document.getElementById('popup-param-topk').value = this.generationParams.top_k;
        document.getElementById('popup-val-topk').textContent = this.generationParams.top_k;
        
        document.getElementById('popup-param-reppen').value = this.generationParams.repetition_penalty;
        document.getElementById('popup-val-reppen').textContent = this.generationParams.repetition_penalty.toFixed(2);
        
        document.getElementById('popup-param-maxtokens').value = this.generationParams.max_tokens;
        document.getElementById('popup-val-maxtokens').textContent = this.generationParams.max_tokens;

        const popupParamSuggestionChips = document.getElementById('popup-param-suggestion-chips');
        if (popupParamSuggestionChips) {
          popupParamSuggestionChips.checked = this.showSuggestionChips;
        }

        const popupParamShowReasoning = document.getElementById('popup-param-show-reasoning');
        if (popupParamShowReasoning) {
          popupParamShowReasoning.checked = this.showReasoning;
        }

        const popupParamEnableReasoning = document.getElementById('popup-param-enable-reasoning');
        if (popupParamEnableReasoning) {
          popupParamEnableReasoning.checked = this.reasoningEnabled;
        }
      }
    }

    // Load corresponding key, model, url, and instruct format dynamically if requested
    if (forceLoadSettings) {
      this.elements.apiKeyInput.value = this.apiKeys[provider] || '';
      this.elements.customUrlInput.value = this.customApiUrls[provider] || '';
      if (this.elements.instructTemplateSelect) {
        this.elements.instructTemplateSelect.value = this.instructTemplates[provider] || 'vanilla';
      }

      if (provider === 'openrouter') {
        const modelVal = this.apiModels[provider] || 'openrouter/free';
        const isPreset = FREE_MODELS.some(m => m.id === modelVal);
        if (isPreset) {
          this.elements.modelSelect.value = modelVal;
          this.elements.customModelInput.value = '';
        } else {
          this.elements.modelSelect.value = 'custom';
          this.elements.customModelInput.value = modelVal;
        }
      } else {
        this.elements.customModelInput.value = this.apiModels[provider] || '';
      }
    }

    if (provider === 'openrouter') {
      this.elements.customUrlGroup.style.display = 'none';
      this.elements.modelSelectGroup.style.display = 'block';
      
      const isCustomModel = this.elements.modelSelect.value === 'custom';
      this.elements.customModelGroup.style.display = isCustomModel ? 'block' : 'none';
      this.elements.apiKeyLabel.textContent = 'OpenRouter API Key:';
      this.elements.apiKeyInput.placeholder = 'sk-or-v1-...';
      
      const customHint = document.getElementById('custom-model-hint');
      if (customHint && isCustomModel) {
        customHint.innerHTML = `
          *Enter any OpenRouter model identifier (e.g. <code>deepseek/deepseek-chat</code>). Runs entirely in the cloud.
        `;
      }

      this.elements.keyWarning.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
          <span style="color: var(--accent-gold); font-weight: 600; display: flex; align-items: center; gap: 8px;">
            ⚠️ Bring Your Own Key (BYOK) Required: Click "API Settings" to enter your free OpenRouter API key.
          </span>
          <a href="https://openrouter.ai/keys" target="_blank" style="color: var(--accent-gold); text-decoration: underline; font-weight: 500;">Get Key Here</a>
        </div>
      `;
    } else if (provider === 'custom') {
      this.elements.customUrlGroup.style.display = 'block';
      this.elements.modelSelectGroup.style.display = 'none';
      this.elements.customModelGroup.style.display = 'block';
      this.elements.apiKeyLabel.textContent = 'API Key (Optional):';
      this.elements.apiKeyInput.placeholder = 'Leave blank for local servers like Ollama';
      
      const customHint = document.getElementById('custom-model-hint');
      if (customHint) {
        customHint.innerHTML = `
          *Enter the model name exactly as configured on your server (e.g. <code>dolphin-mistral</code> or <code>llama3</code>).
        `;
      }
    } else {
      // Other SaaS providers (openai, mistral, groq, etc)
      this.elements.customUrlGroup.style.display = 'none';
      this.elements.modelSelectGroup.style.display = 'none';
      this.elements.customModelGroup.style.display = 'block';
      
      const providerNames = {
        'openai': 'OpenAI',
        'mistral': 'Mistral',
        'anthropic': 'Anthropic',
        'groq': 'Groq',
        'deepseek': 'DeepSeek',
        'together': 'Together AI'
      };
      const pName = providerNames[provider] || provider;
      
      this.elements.apiKeyLabel.textContent = `${pName} API Key:`;
      this.elements.apiKeyInput.placeholder = 'sk-...';
      
      const customHint = document.getElementById('custom-model-hint');
      if (customHint) {
        customHint.innerHTML = `
          *Enter the exact model identifier for ${pName} (e.g. <code>mistral-large-latest</code> or <code>deepseek-reasoner</code>).
        `;
      }
      
      this.elements.keyWarning.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
          <span style="color: var(--accent-gold); font-weight: 600; display: flex; align-items: center; gap: 8px;">
            ⚠️ Bring Your Own Key (BYOK) Required: Enter your ${pName} API key above.
          </span>
        </div>
      `;
    }
    
    // Ensure warning is hidden if we are looking at the custom tab
    if (provider === 'custom') {
       this.elements.keyWarning.style.display = 'none';
    }
  },

  checkKeyWarning() {
    this.updateProviderFieldsVisibility();
    if (this.apiProvider === 'custom') {
      this.elements.keyWarning.style.display = 'none';
    } else if (!this.apiKey) {
      this.elements.keyWarning.style.display = 'block';
    } else {
      this.elements.keyWarning.style.display = 'none';
    }
  },

  populateModelSelector() {
    this.elements.modelSelect.innerHTML = '';
    FREE_MODELS.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name}`;
      if (model.id === this.activeModel) {
        option.selected = true;
      }
      this.elements.modelSelect.appendChild(option);
    });

    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '⚙️ Custom OpenRouter Model ID...';
    if (!FREE_MODELS.some(m => m.id === this.activeModel) && this.activeModel) {
      customOpt.selected = true;
    }
    this.elements.modelSelect.appendChild(customOpt);
  },

  saveSettings() {
    const key = this.elements.apiKeyInput.value.trim();
    const provider = this.elements.providerSelect.value;
    
    this.apiKey = key;
    this.apiProvider = provider;

    // Save Content Filter Settings
    if (this.elements.settingNsfwEnable) {
      this.nsfwEnabled = this.elements.settingNsfwEnable.checked;
      safeSetItem('jollyrp_nsfw_enabled', this.nsfwEnabled ? 'true' : 'false');
    }
    if (this.elements.settingNsfwBlur) {
      this.nsfwBlur = this.elements.settingNsfwBlur.checked;
      safeSetItem('jollyrp_nsfw_blur', this.nsfwBlur ? 'true' : 'false');
    }

    // Save PIN Settings
    if (this.elements.settingPinEnable) {
      const isEnabled = this.elements.settingPinEnable.checked;
      const code = this.elements.settingPinCode.value.trim();
      
      if (isEnabled && code.length !== 4) {
        alert("PIN Lock cannot be enabled: PIN must be exactly 4 digits.");
        return;
      }
      
      this.pinEnabled = isEnabled;
      this.pinCode = code;
      safeSetItem('jollyrp_pin_enabled', this.pinEnabled ? 'true' : 'false');
      safeSetItem('jollyrp_pin_code', this.pinCode);
    }
    
    // Save Auto-Summarization Settings
    if (this.elements.settingAutoSummarize) {
      this.autoSummarizeEnabled = this.elements.settingAutoSummarize.checked;
      this.summarizeTriggerN = parseInt(this.elements.settingSummarizeTrigger.value) || 15;
      this.summarizeKeepN = Math.max(2, parseInt(this.elements.settingSummarizeKeep.value) || 10);
      
      safeSetItem('jollyrp_auto_summarize', this.autoSummarizeEnabled);
      safeSetItem('jollyrp_summarize_trigger', this.summarizeTriggerN);
      safeSetItem('jollyrp_summarize_keep', this.summarizeKeepN);
    }

    // Save Generation Parameters
    if (this.elements.settingParamTemp) {
      this.generationParams.temperature = parseFloat(this.elements.settingParamTemp.value) || 0.8;
      this.generationParams.top_p = parseFloat(this.elements.settingParamTopP.value) || 1.0;
      this.generationParams.top_k = parseInt(this.elements.settingParamTopK.value) || 40;
      this.generationParams.repetition_penalty = parseFloat(this.elements.settingParamRepPen.value) || 1.18;
      this.generationParams.max_tokens = parseInt(this.elements.settingParamMaxTokens.value) || 1024;

      safeSetItem('jollyrp_param_temperature', this.generationParams.temperature);
      safeSetItem('jollyrp_param_top_p', this.generationParams.top_p);
      safeSetItem('jollyrp_param_top_k', this.generationParams.top_k);
      safeSetItem('jollyrp_param_repetition_penalty', this.generationParams.repetition_penalty);
      safeSetItem('jollyrp_param_max_tokens', this.generationParams.max_tokens);

      // Update token warning badge whenever max_tokens changes
      this.updateReasoningTokenWarning();
    }

    // Process Suggestion Chips toggle in global settings
    const settingParamSuggestionChips = document.getElementById('setting-param-suggestion-chips');
    if (settingParamSuggestionChips) {
      const oldState = this.showSuggestionChips;
      this.showSuggestionChips = settingParamSuggestionChips.checked;
      safeSetItem('jollyrp_enable_suggestion_chips', this.showSuggestionChips ? 'true' : 'false');

      // Sync the popup checkbox
      const popupParamSuggestionChips = document.getElementById('popup-param-suggestion-chips');
      if (popupParamSuggestionChips) {
        popupParamSuggestionChips.checked = this.showSuggestionChips;
      }

      // Update chips display
      const container = document.getElementById('choice-chips-container');
      if (container) {
        if (!this.showSuggestionChips) {
          container.innerHTML = '';
          container.style.display = 'none';
        } else if (!oldState && this.showSuggestionChips) {
          // If enabled, generate suggestions immediately
          this.generateSuggestedChoices();
        }
      }
    }

    // Process Show Reasoning toggle (display accordion) in global settings
    const settingParamShowReasoning = document.getElementById('setting-param-show-reasoning');
    if (settingParamShowReasoning) {
      this.showReasoning = settingParamShowReasoning.checked;
      safeSetItem('jollyrp_show_reasoning', this.showReasoning ? 'true' : 'false');

      // Sync the popup checkbox
      const popupParamShowReasoning = document.getElementById('popup-param-show-reasoning');
      if (popupParamShowReasoning) {
        popupParamShowReasoning.checked = this.showReasoning;
      }
      
      // Re-render chat thread to update accordions visibility
      this.renderChatThread();
    }

    // Process Enable Reasoning toggle (prompt-level, controls whether model thinks at all)
    const settingParamEnableReasoning = document.getElementById('setting-param-enable-reasoning');
    if (settingParamEnableReasoning) {
      this.reasoningEnabled = settingParamEnableReasoning.checked;
      safeSetItem('jollyrp_reasoning_enabled', this.reasoningEnabled ? 'true' : 'false');

      // Sync the popup checkbox
      const popupParamEnableReasoning = document.getElementById('popup-param-enable-reasoning');
      if (popupParamEnableReasoning) {
        popupParamEnableReasoning.checked = this.reasoningEnabled;
      }

      // Update token warning
      this.updateReasoningTokenWarning();
    }
    
    // Save key to the specific provider
    this.apiKeys[provider] = key;
    safeSetItem(`jollyrp_apikey_${provider}`, key);
    
    safeSetItem('jollyrp_provider', provider);
    
    // Save active model for this provider
    let modelName = '';
    if (provider === 'openrouter') {
      const selectVal = this.elements.modelSelect.value;
      if (selectVal === 'custom') {
        modelName = this.elements.customModelInput.value.trim();
      } else {
        modelName = selectVal;
      }
    } else {
      modelName = this.elements.customModelInput.value.trim();
    }
    this.apiModels[provider] = modelName;
    this.activeModel = modelName;
    safeSetItem(`jollyrp_model_${provider}`, modelName);
    
    // Save custom url for this provider
    const url = this.elements.customUrlInput.value.trim();
    this.customApiUrls[provider] = url;
    this.customApiUrl = url;
    safeSetItem(`jollyrp_custom_url_${provider}`, url);

    // Save instruct template for this provider
    if (this.elements.instructTemplateSelect) {
      const instructVal = this.elements.instructTemplateSelect.value;
      this.instructTemplates[provider] = instructVal;
      this.instructTemplate = instructVal;
      safeSetItem(`jollyrp_instruct_${provider}`, instructVal);
    }
    
    // Save fallback configurations
    if (this.elements.fallbacksListContainer) {
      const fallbackRows = this.elements.fallbacksListContainer.querySelectorAll('.fallback-row');
      const savedFallbacks = [];
      fallbackRows.forEach(row => {
        const keyInput = row.querySelector('.fallback-key-input');
        const modelInput = row.querySelector('.fallback-model-input');
        const keyVal = keyInput ? keyInput.value.trim() : '';
        const modelVal = modelInput ? modelInput.value.trim() : '';

        if (provider === 'openrouter') {
          if (keyVal || modelVal) savedFallbacks.push({ apiKey: keyVal, model: modelVal });
        } else {
          const urlInput = row.querySelector('.fallback-url-input');
          const urlVal = urlInput ? urlInput.value.trim() : '';
          if (urlVal || keyVal || modelVal) savedFallbacks.push({ customUrl: urlVal, apiKey: keyVal, model: modelVal });
        }
      });
      this.apiFallbacks[provider] = savedFallbacks;
      safeSetItem(`jollyrp_fallbacks_${provider}`, JSON.stringify(savedFallbacks));
    }

    // Save TTS Settings
    const autoplayInput = document.getElementById('setting-tts-autoplay');
    const providerSelect = document.getElementById('setting-tts-provider');
    const voiceSelect = document.getElementById('setting-tts-voice');
    const pitchInput = document.getElementById('setting-tts-pitch');
    const rateInput = document.getElementById('setting-tts-rate');
    const urlInput = document.getElementById('setting-tts-url');
    const keyInput = document.getElementById('setting-tts-key');
    const methodSelect = document.getElementById('setting-tts-method');
    const headersTextarea = document.getElementById('setting-tts-headers');
    const bodyTextarea = document.getElementById('setting-tts-body');

    this.ttsSettings = {
      autoplay: autoplayInput ? autoplayInput.checked : false,
      provider: providerSelect ? providerSelect.value : 'browser',
      browserVoice: voiceSelect ? voiceSelect.value : '',
      browserPitch: pitchInput ? parseFloat(pitchInput.value) : 1.0,
      browserRate: rateInput ? parseFloat(rateInput.value) : 1.0,
      customUrl: urlInput ? urlInput.value.trim() : '',
      customKey: keyInput ? keyInput.value.trim() : '',
      customMethod: methodSelect ? methodSelect.value : 'POST',
      customHeaders: headersTextarea ? headersTextarea.value : '',
      customBody: bodyTextarea ? bodyTextarea.value : ''
    };
    safeSetItem('jollyrp_tts_settings', JSON.stringify(this.ttsSettings));

    this.toggleModal('settingsModal', false);
    this.checkKeyWarning();
    this.saveData();
    this.updateLockButtonVisibility();
    this.renderPresetsGrid();
  },

  applyModelDefaults(modelId) {
    if (!modelId) return;
    const modelLower = modelId.toLowerCase();
    let template = 'vanilla';
    let type = 'Default';
    let params = { temperature: 0.80, top_p: 1.00, top_k: 40, repetition_penalty: 1.18, max_tokens: 1024 };

    if (modelLower.includes('llama-3') || modelLower.includes('llama3')) {
      type = 'Llama 3';
      params = { temperature: 0.70, top_p: 0.90, top_k: 40, repetition_penalty: 1.10, max_tokens: 1024 };
      template = 'vanilla';
    } else if (modelLower.includes('claude')) {
      type = 'Claude';
      params = { temperature: 0.70, top_p: 0.95, top_k: 0, repetition_penalty: 1.00, max_tokens: 2048 };
      template = 'vanilla';
    } else if (modelLower.includes('deepseek') || modelLower.includes('r1')) {
      type = 'DeepSeek';
      params = { temperature: 0.60, top_p: 0.95, top_k: 50, repetition_penalty: 1.10, max_tokens: 2048 };
      template = 'vanilla';
    } else if (modelLower.includes('gemini')) {
      type = 'Gemini';
      params = { temperature: 1.00, top_p: 0.95, top_k: 40, repetition_penalty: 1.00, max_tokens: 2048 };
      template = 'vanilla';
    } else if (modelLower.includes('free') || modelLower === 'openrouter/free') {
      type = 'Auto-Free (Dolphin/Llama)';
      params = { temperature: 0.80, top_p: 0.90, top_k: 50, repetition_penalty: 1.15, max_tokens: 1024 };
      template = 'vanilla';
    }

    // Apply template configuration
    this.instructTemplates[this.apiProvider] = template;
    this.instructTemplate = template;
    safeSetItem(`jollyrp_instruct_${this.apiProvider}`, template);
    if (this.elements.instructTemplateSelect) {
      this.elements.instructTemplateSelect.value = template;
    }

    // Apply values to state
    this.generationParams = { ...params };

    // Apply values to UI if elements exist
    if (this.elements.settingParamTemp) {
      this.elements.settingParamTemp.value = params.temperature;
      document.getElementById('val-param-temp').textContent = params.temperature.toFixed(2);
      
      this.elements.settingParamTopP.value = params.top_p;
      document.getElementById('val-param-topp').textContent = params.top_p.toFixed(2);
      
      this.elements.settingParamTopK.value = params.top_k;
      document.getElementById('val-param-topk').textContent = params.top_k;
      
      this.elements.settingParamRepPen.value = params.repetition_penalty;
      document.getElementById('val-param-reppen').textContent = params.repetition_penalty.toFixed(2);
      
      this.elements.settingParamMaxTokens.value = params.max_tokens;
      document.getElementById('val-param-maxtokens').textContent = params.max_tokens;
    }

    const popupTemp = document.getElementById('popup-param-temp');
    if (popupTemp) {
      popupTemp.value = params.temperature;
      document.getElementById('popup-val-temp').textContent = params.temperature.toFixed(2);
      
      document.getElementById('popup-param-topp').value = params.top_p;
      document.getElementById('popup-val-topp').textContent = params.top_p.toFixed(2);
      
      document.getElementById('popup-param-topk').value = params.top_k;
      document.getElementById('popup-val-topk').textContent = params.top_k;
      
      document.getElementById('popup-param-reppen').value = params.repetition_penalty;
      document.getElementById('popup-val-reppen').textContent = params.repetition_penalty.toFixed(2);
      
      document.getElementById('popup-param-maxtokens').value = params.max_tokens;
      document.getElementById('popup-val-maxtokens').textContent = params.max_tokens;
    }

    // Save defaults to storage
    safeSetItem('jollyrp_param_temperature', params.temperature);
    safeSetItem('jollyrp_param_top_p', params.top_p);
    safeSetItem('jollyrp_param_top_k', params.top_k);
    safeSetItem('jollyrp_param_repetition_penalty', params.repetition_penalty);
    safeSetItem('jollyrp_param_max_tokens', params.max_tokens);

    this.showToast(`Applied optimal settings for ${type}!`);
  },

  syncDirectorSliders() {
    const valVerbositySidebar = document.getElementById('val-verbosity-sidebar');
    const valActionRatioSidebar = document.getElementById('val-action-ratio-sidebar');
    if (valVerbositySidebar) {
      valVerbositySidebar.textContent = this.verbosity + '%';
    }
    if (valActionRatioSidebar) {
      valActionRatioSidebar.textContent = this.actionRatio + '%';
    }
  },

  syncTtsSettingsToInputs() {
    const autoplayInput = document.getElementById('setting-tts-autoplay');
    const providerSelect = document.getElementById('setting-tts-provider');
    const voiceSelect = document.getElementById('setting-tts-voice');
    const pitchInput = document.getElementById('setting-tts-pitch');
    const rateInput = document.getElementById('setting-tts-rate');
    const urlInput = document.getElementById('setting-tts-url');
    const keyInput = document.getElementById('setting-tts-key');
    const methodSelect = document.getElementById('setting-tts-method');
    const headersTextarea = document.getElementById('setting-tts-headers');
    const bodyTextarea = document.getElementById('setting-tts-body');

    const valPitch = document.getElementById('val-tts-pitch');
    const valRate = document.getElementById('val-tts-rate');

    if (autoplayInput) autoplayInput.checked = !!this.ttsSettings.autoplay;
    if (providerSelect) {
      providerSelect.value = this.ttsSettings.provider || 'browser';
      // Trigger toggle
      const browserFields = document.getElementById('tts-browser-fields');
      const customFields = document.getElementById('tts-custom-fields');
      if (browserFields && customFields) {
        if (providerSelect.value === 'browser') {
          browserFields.style.display = 'block';
          customFields.style.display = 'none';
        } else {
          browserFields.style.display = 'none';
          customFields.style.display = 'block';
        }
      }
    }
    
    this.populateBrowserVoices();

    if (pitchInput) {
      pitchInput.value = this.ttsSettings.browserPitch ?? 1.0;
      if (valPitch) valPitch.textContent = parseFloat(pitchInput.value).toFixed(1);
    }
    if (rateInput) {
      rateInput.value = this.ttsSettings.browserRate ?? 1.0;
      if (valRate) valRate.textContent = parseFloat(rateInput.value).toFixed(1);
    }

    if (urlInput) urlInput.value = this.ttsSettings.customUrl || '';
    if (keyInput) keyInput.value = this.ttsSettings.customKey || '';
    if (methodSelect) methodSelect.value = this.ttsSettings.customMethod || 'POST';
    if (headersTextarea) headersTextarea.value = this.ttsSettings.customHeaders || '';
    if (bodyTextarea) bodyTextarea.value = this.ttsSettings.customBody || '';
    
    // Add dynamically registered fields listeners if not done yet
    if (providerSelect && !providerSelect.dataset.listenerBound) {
      providerSelect.dataset.listenerBound = 'true';
      providerSelect.addEventListener('change', () => {
        const browserFields = document.getElementById('tts-browser-fields');
        const customFields = document.getElementById('tts-custom-fields');
        if (browserFields && customFields) {
          if (providerSelect.value === 'browser') {
            browserFields.style.display = 'block';
            customFields.style.display = 'none';
          } else {
            browserFields.style.display = 'none';
            customFields.style.display = 'block';
          }
        }
      });
      
      if (pitchInput && valPitch) {
        pitchInput.addEventListener('input', () => {
          valPitch.textContent = parseFloat(pitchInput.value).toFixed(1);
        });
      }
      if (rateInput && valRate) {
        rateInput.addEventListener('input', () => {
          valRate.textContent = parseFloat(rateInput.value).toFixed(1);
        });
      }
    }
  },

  updateReasoningTokenWarning() {
    const isReasoning = isReasoningModel(this.activeModel);
    const showWarning = (this.reasoningEnabled || isReasoning) && this.generationParams.max_tokens < 2048;
    // Update both the settings modal and popup warnings
    ['reasoning-token-warning', 'popup-reasoning-token-warning'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = showWarning ? 'flex' : 'none';
        const warningSpan = el.querySelector('span');
        if (warningSpan) {
          if (isReasoning) {
            warningSpan.innerHTML = `Active model (<code>${this.activeModel}</code>) is a reasoning model. It consumes tokens for thinking internally even if reasoning is disabled/hidden. Set at least <strong>2048 tokens</strong> to prevent responses from cutting off.`;
          } else {
            warningSpan.innerHTML = `With reasoning enabled, models use tokens for thinking first. Set at least <strong>1024 tokens</strong> (2048+ recommended) to avoid blank/cut-off responses.`;
          }
        }
      }
    });
  }
};
