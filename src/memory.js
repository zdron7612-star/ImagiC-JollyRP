/**
 * Memory Forge & Truth Ledger Management
 * Handles sliding window chat history, lorebook keyword matching, 
 * and prompt generation based on sliders and memory ledger.
 */

export function replacePlaceholders(text, charName, userName) {
  if (!text) return '';
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{char_name\}\}/gi, charName)
    .replace(/\{\{charName\}\}/gi, charName)
    .replace(/\{\{Char name\}\}/gi, charName)
    .replace(/\{\{CharName\}\}/gi, charName)
    .replace(/<BOT>/g, charName)
    .replace(/<CHAR>/g, charName)
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/\{\{user_name\}\}/gi, userName)
    .replace(/\{\{userName\}\}/gi, userName)
    .replace(/\{\{User name\}\}/gi, userName)
    .replace(/\{\{UserName\}\}/gi, userName)
    .replace(/<USER>/g, userName)
    .replace(/<\|endoftext\|>/g, '')
    .replace(/<\|eot_id\|>/g, '')
    .replace(/<\|end_of_sentence\|>/g, '')
    .replace(/<｜end of sentence｜>/g, '') // DeepSeek specific with fullwidth vertical bars
    .replace(/<\s*\|\s*end of sentence\s*\|\s*>/g, '') // Loose matching
    .replace(/<\|im_end\|>/g, '')
    .replace(/<\/s>/g, '')
    .trimStart();
}

/**
 * Clean and tokenize a text string, removing basic English stopwords.
 */
function tokenize(text) {
  if (!text) return [];
  const stopwords = new Set(["the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "of", "to", "in", "on", "at", "for", "with", "by", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "from", "up", "down", "out", "off", "over", "under", "again", "further", "then", "once", "i", "you", "he", "she", "it", "they", "we", "me", "him", "her", "them", "us", "my", "your", "his", "their", "our", "its"]);
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !stopwords.has(token));
}

/**
 * Scan text for lorebook matches using a hybrid keyword & token-similarity RAG, with recursive expansion.
 * @param {string} text - The query text (e.g. recent conversation)
 * @param {Array} lorebook - Lorebook items [{ keys: [string], value: string }]
 * @param {number} depth - Recursion depth
 * @returns {Array} List of matched lore values
 */
export function scanLorebook(text, lorebook = [], depth = 2) {
  if (!text || !lorebook.length) return [];
  
  const queryTokens = tokenize(text);
  const normalizedText = text.toLowerCase();
  
  const matchedEntries = new Set();
  const matchedValues = [];

  function scan(scanText, scanTokens, currentDepth) {
    if (currentDepth <= 0) return;

    for (const entry of lorebook) {
      if (matchedEntries.has(entry)) continue;

      let matched = false;

      // 1. Check exact word boundaries for keywords
      const hasKeywordMatch = entry.keys.some(key => {
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedKey}\\b`, 'i');
        return regex.test(scanText);
      });

      if (hasKeywordMatch) {
        matched = true;
      } else {
        // 2. Token overlap similarity
        const keyTokens = entry.keys.flatMap(k => tokenize(k));
        const overlapKeys = keyTokens.filter(t => scanTokens.includes(t));
        
        if (overlapKeys.length > 0) {
          matched = true;
        } else {
          // Check if key is a substring of any token
          const hasPartialKey = entry.keys.some(key => {
            const cleanKey = key.toLowerCase();
            return scanTokens.some(tok => tok.includes(cleanKey) || cleanKey.includes(tok));
          });
          if (hasPartialKey) {
            matched = true;
          }
        }
      }

      if (matched) {
        matchedEntries.add(entry);
        matchedValues.push(entry.value);
        
        // 3. Recursive lookup: scan the value of this matched entry for other entries
        const entryTokens = tokenize(entry.value);
        scan(entry.value, entryTokens, currentDepth - 1);
      }
    }
  }

  scan(normalizedText, queryTokens, depth);
  return matchedValues;
}

/**
 * Maps personality sliders (0-100) to behavioral instructions.
 * @param {object} sliders - { extroversion, chaos, warmth, intelligence }
 * @returns {string} Text instruction representing the sliders
 */
export function mapSlidersToPrompt(sliders = {}) {
  const { extroversion = 50, chaos = 50, warmth = 50, intelligence = 50 } = sliders;
  const traits = [];

  if (extroversion > 75) traits.push("extremely talkative, energetic, and expressive");
  else if (extroversion < 25) traits.push("quiet, introverted, and highly selective of words");

  if (chaos > 75) traits.push("unpredictable, dramatic, prone to emotional shifts, and highly chaotic");
  else if (chaos < 25) traits.push("calm, highly orderly, logical, structured, and consistent");

  if (warmth > 75) traits.push("deeply caring, affectionate, friendly, and quick to support");
  else if (warmth < 25) traits.push("cold, distant, detached, cynical, and highly transactional");

  if (intelligence > 75) traits.push("articulate, uses sophisticated language, highly analytical, and notices fine details");
  else if (intelligence < 25) traits.push("straightforward, uses simple vocabulary, relies on instincts rather than logic");

  return traits.length 
    ? `Behavioral traits: You are ${traits.join("; also, you are ")}.` 
    : "Behavioral traits: Maintain a balanced, natural persona.";
}

/**
 * Synthesis of the main System Prompt sent to the LLM.
 * Contains: Core Bio + Personality + Speech quirks + Slider behavior + Truth Ledger + Matched Lore + Persona info.
 * @param {object} character - The character configuration
 * @param {string} truthLedger - The active chronological summary of events
 * @param {Array} matchedLore - Matched lore values from the lorebook
 * @param {object} options - Custom dialogue director options (tone, action ratio)
 * @param {object} persona - Active user persona details
 */
export function synthesizeSystemPrompt(character, truthLedger = "", matchedLore = [], options = {}, persona = null) {
  const charName = character.name || 'Character';
  const userName = persona ? (persona.name || 'User') : 'User';

  const cleanDescription = replacePlaceholders(character.description || '', charName, userName);
  const cleanPersonality = replacePlaceholders(character.personality || '', charName, userName);
  const cleanSpeechQuirks = character.speechQuirks ? replacePlaceholders(character.speechQuirks, charName, userName) : '';
  const cleanMatchedLore = matchedLore.map(info => replacePlaceholders(info || '', charName, userName));

  const sliderPrompt = mapSlidersToPrompt(character.sliders);
  const speechStyle = cleanSpeechQuirks ? `Speech style quirks: ${cleanSpeechQuirks}` : "";
  
  // Parse dialogue director parameters
  const verbosity = options.verbosity || 50; // 0 (punchy) to 100 (descriptive)
  const actionRatio = options.actionRatio || 50; // 0 (all speech) to 100 (all actions/thoughts)
  const maxTokens = options.maxTokens || 1024;
  
  let directorPrompt = "Response length and style parameters:\n";
  if (verbosity < 20) {
    directorPrompt += "- Keep responses extremely brief, punchy, and fast-paced. Limit to 1-2 short sentences.\n";
  } else if (verbosity < 40) {
    directorPrompt += "- Keep responses relatively brief and concise. Avoid overly long descriptions.\n";
  } else if (verbosity > 80) {
    directorPrompt += `- Write extremely detailed, rich, and highly descriptive multi-paragraph responses. Elaborate extensively on sights, sounds, thoughts, and physical textures. Target length: ~${Math.floor(maxTokens * 0.8)} tokens. DO NOT cut the response short.\n`;
  } else if (verbosity > 60) {
    directorPrompt += `- Write detailed, expressive, and descriptive responses. Use multiple paragraphs. Target length: ~${Math.floor(maxTokens * 0.5)} tokens.\n`;
  } else {
    directorPrompt += "- Write moderate-length, expressive, and detailed responses, typical of a standard roleplay post (around 2-3 detailed paragraphs).\n";
  }

  if (verbosity > 80 && maxTokens >= 1000) {
    directorPrompt += "- CRITICAL: Your response must be extremely long and exhaustive. Continue expanding on the scene, inner monologue, and dialogue to reach the maximum requested length.\n";
  }
  
  if (actionRatio < 20) {
    directorPrompt += "- Focus almost entirely on verbal dialogue and speech. Keep narrative actions to an absolute minimum.\n";
  } else if (actionRatio < 40) {
    directorPrompt += "- Prioritize dialogue and speech over actions/narration.\n";
  } else if (actionRatio > 80) {
    directorPrompt += "- Focus almost entirely on describing actions, body language, facial expressions, and internal thoughts. Keep spoken dialogue to an absolute minimum.\n";
  } else if (actionRatio > 60) {
    directorPrompt += "- Prioritize describing actions, body language, expressions, and internal thoughts. Keep spoken dialogue secondary.\n";
  } else {
    directorPrompt += "- Maintain a natural, healthy balance between dialogue and descriptive actions.\n";
  }

  let prompt = `You are roleplaying as ${charName}.
Character Biography:
${cleanDescription}

Personality:
${cleanPersonality}
${sliderPrompt}
${speechStyle}

${directorPrompt}

Roleplay Rules:
- Stay in character at all times. Never write from the perspective of an AI or assistant.
- Format physical actions, emotional states, and environmental descriptions enclosed in asterisks (e.g. *he polished the wood, sighing* or *shivering slightly*).
- Speak naturally, avoiding generic greetings and repetitive phrasing.
`;

  if (persona) {
    const cleanPersonaDesc = replacePlaceholders(persona.description || '', charName, userName);
    const cleanPersonaPersonality = replacePlaceholders(persona.personality || '', charName, userName);
    const cleanPersonaSpeech = replacePlaceholders(persona.speechQuirks || '', charName, userName);

    prompt += `\nRoleplay Partner Persona (${userName}):\n`;
    if (cleanPersonaDesc) prompt += `- Description: ${cleanPersonaDesc}\n`;
    if (cleanPersonaPersonality) prompt += `- Personality: ${cleanPersonaPersonality}\n`;
    if (cleanPersonaSpeech) prompt += `- Speech Quirks/Style: ${cleanPersonaSpeech}\n`;
  }

  if (truthLedger && truthLedger.trim()) {
    prompt += `\nSTORY SO FAR (Truth Ledger - absolute facts established in conversation):\n${truthLedger}\n`;
  }

  if (cleanMatchedLore.length) {
    prompt += `\nRELEVANT WORLD INFO:\n${cleanMatchedLore.map(info => `- ${info}`).join("\n")}\n`;
  }

  if (options.systemPromptOverride && options.systemPromptOverride.trim()) {
    const override = replacePlaceholders(options.systemPromptOverride, charName, userName);
    if (override.includes('{{original}}')) {
      prompt = override.replace('{{original}}', prompt);
    } else {
      prompt = override;
    }
  }

  return prompt;
}

/**
 * Prepares the message history array for API transmission.
 * Implements sliding window on older history while preserving the system instructions.
 * @param {string} systemPrompt - Synthesized system prompt
 * @param {Array} chatHistory - Array of { role: 'user'|'assistant', content: string }
 * @param {number} maxHistoryLength - Number of recent messages to keep (default 10)
 */
export function buildApiMessages(systemPrompt, chatHistory, maxHistoryLength = 10, instructTemplate = 'vanilla', charName = 'Character', userName = 'User', authorsNote = '', authorsNoteDepth = 3, forceSpeakerName = '') {
  let formattedSystem = systemPrompt;
  
  if (instructTemplate === 'chatml') {
    formattedSystem = `<|im_start|>system\n${systemPrompt}<|im_end|>;`;
  } else if (instructTemplate === 'llama3') {
    formattedSystem = `<|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|>`;
  } else if (instructTemplate === 'deepseek') {
    formattedSystem = `<｜begin of sentence｜><｜System｜>${systemPrompt}`;
  }

  const messages = [{ role: "system", content: formattedSystem }];
  
  // Slice to keep only the last N messages
  const recentHistory = chatHistory.slice(-maxHistoryLength);
  
  const cleanedHistory = recentHistory.map(msg => {
    let content = replacePlaceholders(msg.content || '', charName, userName);

    // Some older models need speaker names injected, but for modern chat completion 
    // endpoints, doing this causes the "Miiya: Miiya: Miiya:" repeating name glitch.
    // We will only prepend names if the template is explicitly Alpaca or similar raw formats,
    // otherwise let the API's 'role' handle identity.
    if (instructTemplate === 'alpaca' || instructTemplate === 'mistral') {
      const prefix = msg.role === 'user' ? `${userName}: ` : `${charName}: `;
      content = prefix + content;
    }

    if (instructTemplate === 'alpaca') {
      if (msg.role === 'user') {
        content = `### Instruction:\n${content}`;
      } else {
        content = `### Response:\n${content}`;
      }
    } else if (instructTemplate === 'mistral') {
      if (msg.role === 'user') {
        content = `[INST] ${content} [/INST]`;
      }
    }

    return {
      role: msg.role,
      content: content
    };
  });
  
  if (authorsNote && authorsNote.trim()) {
    const cleanNote = replacePlaceholders(authorsNote, charName, userName);
    let formattedNote = `[Author's Note: ${cleanNote}]`;
    if (instructTemplate === 'chatml') {
      formattedNote = `<|im_start|>system\n${formattedNote}<|im_end|>;`;
    } else if (instructTemplate === 'llama3') {
      formattedNote = `<|start_header_id|>system<|end_header_id|>\n\n${formattedNote}<|eot_id|>`;
    } else if (instructTemplate === 'deepseek') {
      formattedNote = `<｜System｜>${formattedNote}`;
    }
    
    const depth = parseInt(authorsNoteDepth) || 3;
    const targetIdx = Math.max(0, cleanedHistory.length - depth);
    cleanedHistory.splice(targetIdx, 0, { role: 'system', content: formattedNote });
  }

  if (forceSpeakerName && forceSpeakerName.trim()) {
    const forcePrompt = `[CRITICAL: You are currently writing ONLY as ${forceSpeakerName}. You must start your response exactly with the prefix: [${forceSpeakerName}]:]`;
    let formattedForce = forcePrompt;
    if (instructTemplate === 'chatml') {
      formattedForce = `<|im_start|>system\n${forcePrompt}<|im_end|>;`;
    } else if (instructTemplate === 'llama3') {
      formattedForce = `<|start_header_id|>system<|end_header_id|>\n\n${forcePrompt}<|eot_id|>`;
    } else if (instructTemplate === 'deepseek') {
      formattedForce = `<｜System｜>${forcePrompt}`;
    }
    cleanedHistory.push({ role: 'system', content: formattedForce });
  }

  messages.push(...cleanedHistory);
  return messages;
}

/**
 * Triggers a summarization API call to condense older messages and update the Truth Ledger.
 * @param {string} apiKey - OpenRouter key
 * @param {string} model - Model identifier to use
 * @param {string} currentLedger - Current Truth Ledger summary
 * @param {Array} messagesToSummarize - Array of messages to synthesize into ledger
 * @returns {Promise<string>} The updated Truth Ledger text
 */
export async function summarizeToLedger(apiKey, model, currentLedger, messagesToSummarize, provider = 'openrouter', customUrl = '') {
  if (!messagesToSummarize.length) return currentLedger;
  if (provider !== 'custom' && provider !== 'pollinations' && !apiKey) return currentLedger;

  const conversationText = messagesToSummarize
    .map(msg => `${msg.role === "user" ? "User" : "Character"}: ${msg.content}`)
    .join("\n");

  const prompt = `Write a summary of the following conversation. Include all essential facts and details.

[Past Summary]
${currentLedger || "No previous summary."}

[New Conversation]
${conversationText}

[New Summary]`;

  let endpointUrl = "";
  let headers = {
    "Content-Type": "application/json"
  };

  if (provider === 'openrouter') {
    endpointUrl = "https://openrouter.ai/api/v1/chat/completions";
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "https://jollyrp.ai";
    headers["X-Title"] = "JollyRP client";
  } else if (provider === 'huggingface') {
    endpointUrl = `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === 'pollinations') {
    endpointUrl = "https://text.pollinations.ai/v1/chat/completions";
  } else if (provider === 'custom') {
    let baseUrl = customUrl.trim().replace(/\/$/, '');
    try {
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.pathname === '' || parsedUrl.pathname === '/') {
        baseUrl += '/v1';
      }
    } catch (e) {
      // Ignore parsing errors and fallback to baseUrl
    }
    endpointUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  }

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`Summarization failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error updating Truth Ledger:", error);
    return currentLedger; // Fallback to current ledger on error
  }
}

/**
 * Synthesis of the system prompt specifically for a group chat room.
 */
/**
 * Synthesis of the system prompt specifically for a group chat room.
 */
export function synthesizeRoomSystemPrompt(roomName, roomCharacters, activeSpeakerName, truthLedger = "", matchedLore = [], options = {}, persona = null, roomContext = "", isAutoMode = false, roomMuted = []) {
  const userName = persona ? (persona.name || 'User') : 'User';
  
  // Compile all biographies
  let biosText = "";
  roomCharacters.forEach(char => {
    const cleanBio = replacePlaceholders(char.description || '', char.name, userName);
    const cleanPersonality = replacePlaceholders(char.personality || '', char.name, userName);
    const charSliderPrompt = mapSlidersToPrompt(char.sliders);
    const charSpeechQuirks = char.speechQuirks ? replacePlaceholders(char.speechQuirks, char.name, userName) : '';
    
    biosText += `### Character: ${char.name}\nBiography:\n${cleanBio}\nPersonality:\n${cleanPersonality}\n${charSliderPrompt}\n`;
    if (charSpeechQuirks) {
      biosText += `Speech style quirks: ${charSpeechQuirks}\n`;
    }
    if (char.privateLedger && char.privateLedger.trim()) {
      const cleanPrivateLedger = replacePlaceholders(char.privateLedger, char.name, userName);
      biosText += `Private History / Relationship with ${userName} (secrets and events from private interactions):\n${cleanPrivateLedger}\n`;
    }
    biosText += `\n`;
  });

  const activeSpeakerChar = roomCharacters.find(c => c.name.toLowerCase() === activeSpeakerName.toLowerCase()) || roomCharacters[0];
  const cleanSpeechQuirks = activeSpeakerChar && activeSpeakerChar.speechQuirks 
    ? replacePlaceholders(activeSpeakerChar.speechQuirks, activeSpeakerChar.name, userName) 
    : '';
  const speechStyle = cleanSpeechQuirks ? `Speech style quirks for ${activeSpeakerName}: ${cleanSpeechQuirks}` : "";
  const sliderPrompt = activeSpeakerChar ? mapSlidersToPrompt(activeSpeakerChar.sliders) : "";

  // Parse dialogue director parameters
  const verbosity = options.verbosity || 50;
  const actionRatio = options.actionRatio || 50;
  const maxTokens = options.maxTokens || 1024;
  
  let directorPrompt = "Response length and style parameters:\n";
  if (verbosity < 20) {
    directorPrompt += "- Keep responses extremely brief, punchy, and fast-paced. Limit to 1-2 short sentences.\n";
  } else if (verbosity < 40) {
    directorPrompt += "- Keep responses relatively brief and concise. Avoid overly long descriptions.\n";
  } else if (verbosity > 80) {
    directorPrompt += `- Write extremely detailed, rich, and highly descriptive multi-paragraph responses. Elaborate extensively on sights, sounds, thoughts, and physical textures. Target length: ~${Math.floor(maxTokens * 0.8)} tokens. DO NOT cut the response short.\n`;
  } else if (verbosity > 60) {
    directorPrompt += `- Write detailed, expressive, and descriptive responses. Use multiple paragraphs. Target length: ~${Math.floor(maxTokens * 0.5)} tokens.\n`;
  } else {
    directorPrompt += "- Write moderate-length, expressive, and detailed responses, typical of a standard roleplay post (around 2-3 detailed paragraphs).\n";
  }

  if (verbosity > 80 && maxTokens >= 1000) {
    directorPrompt += "- CRITICAL: Your response must be extremely long and exhaustive. Continue expanding on the scene, inner monologue, and dialogue to reach the maximum requested length.\n";
  }
  
  if (actionRatio < 20) {
    directorPrompt += "- Focus almost entirely on verbal dialogue and speech. Keep narrative actions to an absolute minimum.\n";
  } else if (actionRatio < 40) {
    directorPrompt += "- Prioritize dialogue and speech over actions/narration.\n";
  } else if (actionRatio > 80) {
    directorPrompt += "- Focus almost entirely on describing actions, body language, facial expressions, and internal thoughts. Keep spoken dialogue to an absolute minimum.\n";
  } else if (actionRatio > 60) {
    directorPrompt += "- Prioritize describing actions, body language, expressions, and internal thoughts. Keep spoken dialogue secondary.\n";
  } else {
    directorPrompt += "- Maintain a natural, healthy balance between dialogue and descriptive actions.\n";
  }

  const namesList = roomCharacters.map(c => c.name).join(", ");
  const mutedIds = roomMuted || [];
  let unmutedCharacters = roomCharacters.filter(c => !mutedIds.includes(c.id));
  if (unmutedCharacters.length === 0) {
    unmutedCharacters = roomCharacters;
  }
  const unmutedNames = unmutedCharacters.map(c => c.name);

  let prompt = `You are in a group chat room named "${roomName}".
You are playing as multiple characters: ${namesList}.
`;

  if (roomContext && roomContext.trim()) {
    const cleanRoomContext = replacePlaceholders(roomContext, activeSpeakerChar ? activeSpeakerChar.name : activeSpeakerName, userName);
    prompt += `\nROOM CONTEXT / SCENARIO / DYNAMICS (obey this context and adapt the character behaviors accordingly):\n${cleanRoomContext}\n`;
  }

  const tensionText = compileRoomTension(roomCharacters, userName);
  if (tensionText) {
    prompt += `\n### Dynamic Room Social Relationships & Tension:\n${tensionText}\n`;
  }

  prompt += `
Here are the participating characters' bios and personalities:
${biosText}
`;

  if (isAutoMode) {
    prompt += `
CRITICAL FOR AUTO-MODE SELECTION:
- You must dynamically choose exactly ONE character from the following list of unmuted participants to reply next: [${unmutedNames.join(", ")}].
- Make the decision based on who was addressed in the conversation, who has the strongest reason to speak or react, or who hasn't spoken in a while.
- You must generate a response ONLY as that chosen character, stay strictly in character for them, and do NOT write for any other character.
- You MUST start your response exactly with their speaker tag prefix, i.e.: [CharacterName]:
`;
  } else {
    prompt += `
Active Speaker: ${activeSpeakerName}
Behavioral guidelines for active speaker (${activeSpeakerName}):
${sliderPrompt}
${speechStyle}
`;
  }

  prompt += `
${directorPrompt}

Roleplay Rules:
`;

  if (isAutoMode) {
    prompt += `- You must choose exactly ONE character from [${unmutedNames.join(", ")}] to reply next.
- You must generate a response ONLY as that chosen character.
- Do NOT speak, write dialogue, or control the direct actions of any other characters or the user. (However, you may describe your character observing their facial expressions, body language, or reactions in your character's descriptive action text).
- Start your response exactly with the speaker tag prefix of the chosen character, i.e.: [CharacterName]:`;
  } else {
    prompt += `- You must generate a response ONLY as: ${activeSpeakerName}.
- Stay strictly in character for this persona.
- Do NOT speak, write dialogue, or control the direct actions of any other characters or the user. (However, you may describe your character observing their facial expressions, body language, or reactions in your character's descriptive action text).
- Start your response exactly with the speaker tag prefix, i.e.: [${activeSpeakerName}]:`;
  }

  prompt += `
- The user (${userName}) acts as the scenario director. Their inputs may contain narration, actions, or dialogue for other characters (written in third-person, e.g. "Maggie scoffs" or using prefix tags). Do NOT assume everything the user inputs is spoken/done by the player character (${userName}). Read the name tags, quotes, and narration to attribute dialogue/actions correctly.`;

  prompt += `
- Format physical actions, emotional states, and environmental descriptions enclosed in asterisks (e.g. *he polished the wood, sighing* or *shivering slightly*).
- Speak naturally, avoiding generic greetings and repetitive phrasing.
`;

  if (persona) {
    const cleanPersonaDesc = replacePlaceholders(persona.description || '', activeSpeakerName, userName);
    const cleanPersonaPersonality = replacePlaceholders(persona.personality || '', activeSpeakerName, userName);
    const cleanPersonaSpeech = replacePlaceholders(persona.speechQuirks || '', activeSpeakerName, userName);

    prompt += `\nRoleplay Partner Persona (${userName}):\n`;
    if (cleanPersonaDesc) prompt += `- Description: ${cleanPersonaDesc}\n`;
    if (cleanPersonaPersonality) prompt += `- Personality: ${cleanPersonaPersonality}\n`;
    if (cleanPersonaSpeech) prompt += `- Speech Quirks/Style: ${cleanPersonaSpeech}\n`;
  }

  if (truthLedger && truthLedger.trim()) {
    prompt += `\nSTORY SO FAR (Truth Ledger - absolute facts established in conversation):\n${truthLedger}\n`;
  }

  const cleanMatchedLore = matchedLore.map(info => replacePlaceholders(info || '', activeSpeakerName, userName));
  if (cleanMatchedLore.length) {
    prompt += `\nRELEVANT WORLD INFO:\n${cleanMatchedLore.map(info => `- ${info}`).join("\n")}\n`;
  }

  if (options.systemPromptOverride && options.systemPromptOverride.trim()) {
    const override = replacePlaceholders(options.systemPromptOverride, activeSpeakerChar ? activeSpeakerChar.name : activeSpeakerName, userName);
    if (override.includes('{{original}}')) {
      prompt = override.replace('{{original}}', prompt);
    } else {
      prompt = override;
    }
  }

  return prompt;
}

export function compileRoomTension(roomCharacters, userName) {
  const allNames = roomCharacters.map(c => c.name);
  const targetNames = [...allNames, userName];
  let relationsText = "";

  roomCharacters.forEach(char => {
    const charName = char.name;
    const rawText = `${char.description || ''} ${char.personality || ''} ${char.privateLedger || ''}`;
    const sentences = rawText.split(/[.!?\n]+/);
    
    const extractedSentences = [];
    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (!trimmed) return;
      
      const matchesName = targetNames.some(name => {
        if (name.toLowerCase() === charName.toLowerCase()) return false;
        const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedName}\\b`, 'i');
        return regex.test(trimmed);
      });

      if (matchesName) {
        let cleanSentence = replacePlaceholders(trimmed, charName, userName);
        if (!extractedSentences.includes(cleanSentence)) {
          extractedSentences.push(cleanSentence);
        }
      }
    });

    if (extractedSentences.length > 0) {
      relationsText += `- **${charName}** relationship details/feelings:\n`;
      extractedSentences.forEach(s => {
        relationsText += `  * ${s}.\n`;
      });
    }
  });

  return relationsText;
}

