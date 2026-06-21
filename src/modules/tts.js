

export const ttsMethods = {
  populateBrowserVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    const select = document.getElementById('setting-tts-voice');
    if (!select) return;
    select.innerHTML = '';
    
    if (voices.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.disabled = true;
      option.selected = true;
      option.textContent = 'No local voices detected. (Install speech-dispatcher/espeak-ng or use Custom API)';
      select.appendChild(option);
      return;
    }
    
    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      if (this.ttsSettings && this.ttsSettings.browserVoice === voice.name) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  },

  async speakMessage(text) {
    // TTS feature is temporarily hidden/disabled
    return;
    if (!text) return;
    const cleanDialogue = this.extractDialogue(text);
    if (!cleanDialogue) return;

    if (this.ttsSettings.provider === 'browser') {
      this.speakBrowserTts(cleanDialogue);
    } else if (this.ttsSettings.provider === 'custom') {
      await this.speakCustomTts(cleanDialogue);
    }
  },

  speakBrowserTts(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.ttsSettings.browserVoice) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === this.ttsSettings.browserVoice);
      if (voice) utterance.voice = voice;
    }
    utterance.pitch = parseFloat(this.ttsSettings.browserPitch) || 1.0;
    utterance.rate = parseFloat(this.ttsSettings.browserRate) || 1.0;
    window.speechSynthesis.speak(utterance);
  },

  async speakCustomTts(text) {
    if (!this.ttsSettings.customUrl) {
      console.warn('Custom TTS URL is not configured.');
      return;
    }
    let url = this.ttsSettings.customUrl;
    url = url.replace(/\{\{text\}\}/g, encodeURIComponent(text)).replace(/\{\{key\}\}/g, encodeURIComponent(this.ttsSettings.customKey || ''));
    const method = this.ttsSettings.customMethod || 'POST';
    
    let headers = {};
    if (this.ttsSettings.customHeaders) {
      try {
        const rawHeaders = this.ttsSettings.customHeaders
          .replace(/\{\{key\}\}/g, this.ttsSettings.customKey || '')
          .replace(/\{\{text\}\}/g, text);
        headers = JSON.parse(rawHeaders);
      } catch (e) {
        console.error('Error parsing custom TTS headers:', e);
      }
    }

    let body = null;
    if (method !== 'GET' && this.ttsSettings.customBody) {
      let processedBody = this.ttsSettings.customBody.replace(/\{\{key\}\}/g, this.ttsSettings.customKey || '');
      if (processedBody.includes('{{text}}')) {
        const escapedText = JSON.stringify(text).slice(1, -1);
        processedBody = processedBody.replace(/\{\{text\}\}/g, escapedText);
      }
      body = processedBody;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' ? body : undefined
      });
      if (!response.ok) {
        throw new Error(`TTS API request failed: ${response.status} ${response.statusText}`);
      }
      await this.playAudioStream(response);
    } catch (err) {
      console.error('Custom TTS Error:', err);
    }
  },

  async playAudioStream(response) {
    try {
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      if (this.currentTtsAudio) {
        this.currentTtsAudio.pause();
        this.currentTtsAudio.currentTime = 0;
      }
      this.currentTtsAudio = audio;
      await audio.play();
    } catch (e) {
      console.error('Error playing custom TTS audio stream:', e);
    }
  }
};
