/**
 * OpenRouter API Client
 * Handles requests, response streaming, error handling,
 * and maintains the list of free capable models.
 */

export const FREE_MODELS = [
  {
    id: "openrouter/free",
    name: "🤖 OpenRouter Auto-Free (Recommended)",
    description: "Automatically routes requests to the currently most reliable free model."
  }
];

export function isReasoningModel(modelId) {
  if (!modelId) return false;
  const m = modelId.toLowerCase();
  return m.includes('r1') || m.includes('reasoner') || m.includes('o1-') || m.includes('o3-') || m.includes('thinking') || m.includes('reasoning') || m.includes('qwq');
}


export function buildChatCompletionRequest({
  apiKey,
  model,
  messages,
  temperature = 0.8,
  provider = 'openrouter',
  customUrl = '',
  extraParams = {},
  stream = false,
  enableReasoning = true
}) {
  let endpointUrl = "";
  const headers = {
    "Content-Type": "application/json"
  };

  const PROVIDER_CONFIG = {
    'openai': { url: 'https://api.openai.com/v1/chat/completions', strict: true },
    'mistral': { url: 'https://api.mistral.ai/v1/chat/completions', strict: true },
    'groq': { url: 'https://api.groq.com/openai/v1/chat/completions', strict: true },
    'deepseek': { url: 'https://api.deepseek.com/chat/completions', strict: true },
    'together': { url: 'https://api.together.xyz/v1/chat/completions', strict: false },
    'openrouter': { url: 'https://openrouter.ai/api/v1/chat/completions', strict: false }
  };

  if (provider === 'custom') {
    const trimmedUrl = (customUrl || '').trim();
    if (!trimmedUrl) {
      throw new Error("Custom API URL is missing. Please add an OpenAI-compatible endpoint in Settings.");
    }

    let baseUrl = trimmedUrl.replace(/\/$/, '');
    try {
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.pathname === '' || parsedUrl.pathname === '/') {
        baseUrl += '/v1';
      }
    } catch (e) {
      throw new Error("Custom API URL is invalid. Include the protocol, for example http://localhost:11434/v1.");
    }

    endpointUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  } else if (PROVIDER_CONFIG[provider]) {
    endpointUrl = PROVIDER_CONFIG[provider].url;
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    if (provider === 'openrouter') {
      headers["HTTP-Referer"] = "https://jollyrp.ai";
      headers["X-Title"] = "JollyRP client";
    }
  } else if (provider === 'anthropic') {
    throw new Error("Anthropic native API is not directly supported via OpenAI-compat stream parser yet. Please use OpenRouter to access Claude.");
  } else {
    throw new Error(`Unsupported API provider: ${provider}`);
  }

  const requestBody = {
    messages: messages,
    stream: !!stream
  };

  const parsedTemp = parseFloat(temperature);
  if (!isNaN(parsedTemp)) requestBody.temperature = parsedTemp;

  if (model) {
    requestBody.model = model;
  } else if (provider === 'openrouter') {
    requestBody.model = 'openrouter/free';
  }

  // Detect strict endpoints that reject repetition_penalty or top_k
  let isStrict = false;
  if (provider === 'custom') {
    try {
      const hostname = new URL(endpointUrl).hostname.toLowerCase();
      isStrict = ['openai.com', 'mistral.ai', 'anthropic.com', 'groq.com', 'deepseek.com'].some(h => hostname.includes(h));
    } catch (e) {}
  } else if (PROVIDER_CONFIG[provider]) {
    isStrict = PROVIDER_CONFIG[provider].strict;
  }

  if (extraParams.top_p !== undefined) {
    const parsedTopP = parseFloat(extraParams.top_p);
    if (!isNaN(parsedTopP)) requestBody.top_p = parsedTopP;
  }

  if (extraParams.max_tokens !== undefined) {
    const parsedMaxTokens = parseInt(extraParams.max_tokens, 10);
    if (!isNaN(parsedMaxTokens)) {
      if (provider === 'openai' || (provider === 'custom' && endpointUrl.includes('openai.com'))) {
         requestBody.max_completion_tokens = parsedMaxTokens; // O1/O3 prefer this
      }
      requestBody.max_tokens = parsedMaxTokens;
    }
  }

  if (extraParams.top_k !== undefined) {
    const parsedTopK = parseInt(extraParams.top_k, 10);
    if (!isNaN(parsedTopK) && parsedTopK > 0 && !isStrict) {
      requestBody.top_k = parsedTopK;
    }
  }

  if (extraParams.repetition_penalty !== undefined) {
    const parsedRep = parseFloat(extraParams.repetition_penalty);
    if (!isNaN(parsedRep) && parsedRep !== 1.0 && !isStrict) {
      requestBody.repetition_penalty = parsedRep;
    }
  }

  // Provider-specific reasoning flags
  if (provider === 'groq' && enableReasoning) {
    requestBody.reasoning_format = "raw"; // keeps <think> tags in stream for our O(n) parser
  } else if (provider === 'openrouter' && !enableReasoning) {
    requestBody.reasoning = { exclude: true };
  } else if (provider === 'openrouter' && enableReasoning) {
    requestBody.include_reasoning = true;
  }

  // Proxy ALL requests to bypass CORS restrictions for APIs like OpenAI/Mistral/DeepSeek
  return {
    url: '/api/proxy/completion',
    headers: { 'Content-Type': 'application/json' },
    body: {
      endpointUrl,
      headers,
      requestBody
    },
    endpointUrl,
    requestBody
  };
}

export function extractChoiceContent(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const delta = choice.delta || {};
  
  const content = delta.content || message.content || choice.text || data?.content || '';

  // Collect reasoning from all known provider-specific field names:
  // - reasoning_content: OpenRouter, DeepSeek, some OpenAI-compat
  // - reasoning_details: OpenRouter
  // - reasoning:         older OpenRouter variants
  // - thinking:          Mistral native AI API (mistral-reasoning-* models)
  const reasoning =
    delta.reasoning_content  || message.reasoning_content  ||
    delta.reasoning_details  || message.reasoning_details  ||
    delta.reasoning          || message.reasoning          ||
    delta.thinking           || message.thinking           || '';
  
  return { content, reasoning };
}

export async function fetchChatCompletionJson(options) {
  const request = buildChatCompletionRequest({
    ...options,
    stream: false
  });

  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: options.signal
  });

  if (!response.ok) {
    const errText = await response.text();
    let parsedErr;
    try {
      parsedErr = JSON.parse(errText);
    } catch (e) {}
    const errorMsg = parsedErr?.error?.message || `API error (${response.status}): ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return response.json();
}

/**
 * Sends messages to the selected API provider and streams the response back.
 */
export async function streamChatCompletion({
  apiKey,
  model,
  messages,
  temperature = 0.8,
  onChunk,
  onFinish,
  onError,
  signal,
  provider = 'openrouter',
  customUrl = '',
  extraParams = {},
  enableReasoning = true
}) {
  if (provider === 'openrouter' && !apiKey) {
    onError(new Error("API Key is missing. Please add an OpenRouter key in Settings."));
    return;
  }

  try {
    const request = buildChatCompletionRequest({
      apiKey,
      model,
      messages,
      temperature,
      provider,
      customUrl,
      extraParams,
      stream: true,
      enableReasoning
    });

    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: signal
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr;
      try {
        parsedErr = JSON.parse(errText);
      } catch (e) {}
      
      const errorMsg = parsedErr?.error?.message || `API error (${response.status}): ${response.statusText}`;
      throw new Error(errorMsg);
    }

    if (!response.body) {
      throw new Error("Stream response has no body. Proxy or endpoint might be failing.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    let fullText = "";
    let fullReasoning = "";
    let sseBuffer = "";
    let contentBuffer = "";
    let thinkDepth = 0;
    let inReasoningBlock = false;

    const xmlTags = [
      { open: '<think>',    close: '</think>'    },
      { open: '<thought>',  close: '</thought>'  },
      { open: '[thought]',  close: '[/thought]'  },
      { open: '[thinking]', close: '[/thinking]' },
      { open: '<reasoning>', close: '</reasoning>' }
    ];

    const leakRegex = /^\s*(?:<\|im_start\|>\s*(?:assistant)?\s*|<\|start_header_id\|>\s*assistant\s*<\|end_header_id\|>\s*|<\|assistant\|>\s*|<s>\s*|<\/?s>\s*|\[(?:INST|ASSISTANT)\]\s*)/i;
    const reasoningHeaderRe = /^(REASONING BLOCK|REASONING:|THINKING:|CHAIN OF THOUGHT:|INTERNAL REASONING:|ANALYSIS:|INTERNAL MONOLOGUE:)\s*/i;
    const reasoningEndRe = /(?:^|\n)(?:END REASONING|END THINKING|END OF REASONING|-{3,})\s*\n|\n\n(?=[^\n])/;

    const processTextChunk = (newText, newReasoningField) => {
      let contentDelta = "";
      let reasoningDelta = "";

      // Native reasoning fields skip the parser entirely
      if (newReasoningField) {
        reasoningDelta += newReasoningField;
      }

      if (newText) {
        contentBuffer += newText;

        // Phase 1: Strip leaks at start
        if (fullText.length === 0 && thinkDepth === 0 && !inReasoningBlock) {
          const match = contentBuffer.match(leakRegex);
          if (match) {
            contentBuffer = contentBuffer.substring(match[0].length);
          }
        }

        // Phase 2: Detect plain-text reasoning headers at start
        if (fullText.length === 0 && thinkDepth === 0 && !inReasoningBlock) {
          const headerMatch = reasoningHeaderRe.exec(contentBuffer);
          if (headerMatch) {
            inReasoningBlock = true;
            contentBuffer = contentBuffer.substring(headerMatch[0].length);
          }
        }

        // Phase 3: Stateful O(n) XML/tag extraction
        let safeIdx = 0;

        while (safeIdx < contentBuffer.length) {
          let foundTag = false;

          if (thinkDepth > 0) {
            for (const tag of xmlTags) {
              if (contentBuffer.substring(safeIdx).startsWith(tag.close)) {
                thinkDepth--;
                safeIdx += tag.close.length;
                foundTag = true;
                break;
              } else if (contentBuffer.substring(safeIdx).startsWith(tag.open)) {
                thinkDepth++;
                safeIdx += tag.open.length;
                foundTag = true;
                break;
              }
            }
          } else if (inReasoningBlock) {
            const match = reasoningEndRe.exec(contentBuffer.substring(safeIdx));
            if (match && match.index === 0) {
              inReasoningBlock = false;
              safeIdx += match[0].length;
              foundTag = true;
            }
          } else {
            for (const tag of xmlTags) {
              if (contentBuffer.substring(safeIdx).startsWith(tag.open)) {
                thinkDepth++;
                safeIdx += tag.open.length;
                foundTag = true;
                break;
              }
            }
          }

          if (!foundTag) {
            const remaining = contentBuffer.substring(safeIdx);
            const nextOpen = Math.min(
              remaining.indexOf('<') !== -1 ? remaining.indexOf('<') : Infinity,
              remaining.indexOf('[') !== -1 ? remaining.indexOf('[') : Infinity
            );

            if (nextOpen === -1) {
              // No tags ahead, flush all
              if (thinkDepth > 0 || inReasoningBlock) {
                reasoningDelta += remaining;
              } else {
                contentDelta += remaining;
              }
              safeIdx += remaining.length;
            } else if (nextOpen > 0) {
              // Flush up to potential tag
              const textToFlush = remaining.substring(0, nextOpen);
              if (thinkDepth > 0 || inReasoningBlock) {
                reasoningDelta += textToFlush;
              } else {
                contentDelta += textToFlush;
              }
              safeIdx += nextOpen;
            } else {
              // Starts with < or [
              let partialMatch = false;
              for (const tag of xmlTags) {
                const target = (thinkDepth > 0) ? tag.close : tag.open;
                if (target.startsWith(remaining)) {
                  partialMatch = true;
                  break;
                }
              }
              if (partialMatch) {
                // Wait for more chunks to resolve tag
                break;
              } else {
                // Not a tag, flush 1 char and move on (prevents lock on "3 < 5")
                if (thinkDepth > 0 || inReasoningBlock) {
                  reasoningDelta += remaining[0];
                } else {
                  contentDelta += remaining[0];
                }
                safeIdx++;
              }
            }
          }
        }
        contentBuffer = contentBuffer.substring(safeIdx);
      }

      if (contentDelta || reasoningDelta) {
        fullText += contentDelta;
        fullReasoning += reasoningDelta;
        if (onChunk) {
          onChunk(contentDelta, reasoningDelta);
        }
      }
    };

    const processSSELine = (line) => {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine === "data: [DONE]" || cleanLine === "data:[DONE]") return;
      if (cleanLine.startsWith("data:")) {
        try {
          const colonIdx = cleanLine.indexOf(":");
          const rawData = cleanLine.substring(colonIdx + 1).trim();
          if (rawData && rawData !== "[DONE]") {
            const parsed = JSON.parse(rawData);
            const { content, reasoning } = extractChoiceContent(parsed);
            if (content || reasoning) {
              processTextChunk(content, reasoning);
            }
          }
        } catch (e) {
          // Ignore incomplete JSON chunks
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split("\n\n");
      sseBuffer = events.pop(); // Keep incomplete event block

      for (const event of events) {
        const lines = event.split("\n");
        for (const line of lines) {
          processSSELine(line);
        }
      }
    }

    // Flush any remaining buffers
    if (sseBuffer) {
      const lines = sseBuffer.split("\n");
      for (const line of lines) {
        processSSELine(line);
      }
    }

    if (contentBuffer) {
      // Flush anything left in the O(n) tag parser buffer
      if (thinkDepth > 0 || inReasoningBlock) {
        fullReasoning += contentBuffer;
        if (onChunk) onChunk("", contentBuffer);
      } else {
        fullText += contentBuffer;
        if (onChunk) onChunk(contentBuffer, "");
      }
    }

    if (!fullText && !fullReasoning) {
      throw new Error("Empty response received from AI model. Please check your settings, model selections, or credit balance.");
    }

    onFinish(fullText, fullReasoning);
  } catch (error) {
    onError(error);
  }
}

/**
 * Checks the rate limit or validity of an API key by doing a minimal model call.
 * @param {string} apiKey - User OpenRouter API key
 * @returns {Promise<boolean>} Resolves to true if key is valid, false otherwise
 */
export async function validateApiKey(apiKey) {
  if (!apiKey) return false;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}
