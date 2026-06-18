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

/**
 * Injects prompt-level reasoning control markers into the messages array.
/**
 * Injects prompt-level reasoning control into the messages array.
 *
 * This is a three-layer approach designed to work across ALL providers and model types:
 *
 * Layer 1 — Natural language instruction (universal):
 *   Works for any instruction-following model regardless of provider (OpenRouter, Ollama,
 *   llama.cpp, vLLM, LM Studio, etc.). Models that have been instruction-tuned will follow
 *   "do not reason" instructions. For models with no reasoning capability, this is just
 *   inert context they process normally.
 *
 * Layer 2 — /no_think token (Qwen3-family):
 *   Qwen3 and its fine-tunes treat this as a hard signal to skip the thinking phase.
 *   For models that don't recognize it, it is just a short string they ignore.
 *
 * Layer 3 — Empty <think> block seed (DeepSeek R1 / inline-reasoning models):
 *   Some models (DeepSeek R1, certain llama.cpp builds) that always start with <think>
 *   can be "tricked" into finishing their think block immediately by seeding an assistant
 *   message that opens and closes the block. We inject this as a pseudo-assistant prefix.
 *   Models that don't use this format simply ignore it.
 *
 * The response-side stripping in processChunkData() is the final safety net — it removes
 * any <think>/<thought>/etc. tags even if a model reasons despite these instructions.
 *
 * @param {Array} messages - The messages array to modify
 * @returns {Array} New messages array with no-reasoning markers injected
 */
function injectNoThinkMarkers(messages) {
  const modified = messages.map(m => ({ ...m }));

  // Layer 1 + 2: Append natural language instruction and /no_think token to system message.
  // Works for any instruction model (L1) and Qwen3-family specifically (L2).
  const sysIdx = modified.findIndex(m => m.role === 'system');
  const noReasonInstruction =
    '\n\n[REASONING DISABLED] Respond directly without any internal thinking, ' +
    'reasoning steps, or <think> blocks. Do not show your thought process. ' +
    'Output your response immediately.\n/no_think';

  if (sysIdx !== -1) {
    modified[sysIdx] = {
      ...modified[sysIdx],
      content: modified[sysIdx].content + noReasonInstruction
    };
  } else {
    // No system message exists — prepend one with just the instruction
    modified.unshift({
      role: 'system',
      content: '[REASONING DISABLED] Respond directly without any internal thinking, reasoning steps, or <think> blocks.\n/no_think'
    });
  }

  // Layer 3: For inline-think models (DeepSeek R1 style) that always begin with <think>,
  // find the last assistant turn and see if we can prepend an empty think-close.
  // We do this by injecting a fake assistant prefix message right before the last user turn,
  // which forces the model to believe it already completed its thinking.
  // This is safe: providers that don't understand it treat it as a normal assistant message.
  const lastUserIdx = modified.reduceRight((found, m, i) => found === -1 && m.role === 'user' ? i : found, -1);
  if (lastUserIdx > 0) {
    const prevMsg = modified[lastUserIdx - 1];
    // Only inject if the previous message isn't already our seed (avoid double-injection)
    if (prevMsg && prevMsg.role !== 'assistant') {
      modified.splice(lastUserIdx, 0, {
        role: 'assistant',
        content: '<think>\n</think>'
      });
    }
  }

  return modified;
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

  if (provider === 'openrouter') {
    endpointUrl = "https://openrouter.ai/api/v1/chat/completions";
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    headers["HTTP-Referer"] = "https://jollyrp.ai";
    headers["X-Title"] = "JollyRP client";
  } else if (provider === 'custom') {
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
  } else {
    throw new Error(`Unsupported API provider: ${provider}`);
  }

  // Apply prompt-level reasoning control if disabled
  const effectiveMessages = enableReasoning ? messages : injectNoThinkMarkers(messages);

  const requestBody = {
    messages: effectiveMessages,
    temperature: parseFloat(temperature),
    stream: !!stream
  };

  if (model) {
    requestBody.model = model;
  } else if (provider === 'openrouter') {
    requestBody.model = 'openrouter/free';
  }

  const isCustomOpenAI = provider === 'custom' && endpointUrl.includes('openai.com');

  if (extraParams.top_p !== undefined) {
    requestBody.top_p = parseFloat(extraParams.top_p);
  }

  if (extraParams.max_tokens !== undefined) {
    requestBody.max_tokens = parseInt(extraParams.max_tokens);
  }

  if (extraParams.top_k !== undefined && parseInt(extraParams.top_k) > 0 && !isCustomOpenAI) {
    requestBody.top_k = parseInt(extraParams.top_k);
  }

  if (extraParams.repetition_penalty !== undefined && parseFloat(extraParams.repetition_penalty) !== 1.0) {
    if (isCustomOpenAI) {
      const rep = parseFloat(extraParams.repetition_penalty);
      requestBody.frequency_penalty = Math.min(2.0, Math.max(0.0, (rep - 1.0) * 2.0));
    } else {
      requestBody.repetition_penalty = parseFloat(extraParams.repetition_penalty);
    }
  }

  if (provider === 'custom') {
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

  return {
    url: endpointUrl,
    headers,
    body: requestBody,
    endpointUrl,
    requestBody
  };
}

export function extractChoiceContent(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const delta = choice.delta || {};
  
  const content = delta.content || message.content || choice.text || data?.content || '';
  const reasoning = delta.reasoning_content || message.reasoning_content || delta.reasoning || message.reasoning || '';
  
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";
    let fullReasoning = "";
    let buffer = "";
    
    // Accumulators for split-safe think tag stripping and reasoning extraction
    let rawContentAccumulator = "";
    let rawReasoningAccumulator = "";
    let completeRawBody = "";

    const processChunkData = (content, reasoning) => {
      if (reasoning) {
        rawReasoningAccumulator += reasoning;
      }
      if (content) {
        rawContentAccumulator += content;
      }

      let cleanContent = rawContentAccumulator;
      let inlineReasoning = "";

      const tags = [
        { open: '<think>', close: '</think>' },
        { open: '<thought>', close: '</thought>' },
        { open: '[thought]', close: '[/thought]' },
        { open: '[thinking]', close: '[/thinking]' }
      ];

      for (const tag of tags) {
        let openIdx = cleanContent.indexOf(tag.open);
        while (openIdx !== -1) {
          let closeIdx = cleanContent.indexOf(tag.close, openIdx + tag.open.length);
          if (closeIdx !== -1) {
            const block = cleanContent.substring(openIdx + tag.open.length, closeIdx);
            inlineReasoning += block + "\n";
            cleanContent = cleanContent.substring(0, openIdx) + cleanContent.substring(closeIdx + tag.close.length);
          } else {
            const block = cleanContent.substring(openIdx + tag.open.length);
            inlineReasoning += block;
            cleanContent = cleanContent.substring(0, openIdx);
          }
          openIdx = cleanContent.indexOf(tag.open);
        }
      }

      // Strip common leaked prompt tags at the start of the message
      cleanContent = cleanContent.replace(/^(?:\s*<\|im_start\|>\s*(?:assistant)?\s*|\s*<\|start_header_id\|>\s*assistant\s*<\|end_header_id\|>\s*|\s*<\|assistant\|>\s*|\s*<s>\s*|\s*<\/?s>\s*|\s*\[(?:INST|ASSISTANT)\]\s*)/i, "");

      const totalReasoning = rawReasoningAccumulator + inlineReasoning;
      
      const contentDelta = cleanContent.substring(fullText.length);
      const reasoningDelta = totalReasoning.substring(fullReasoning.length);

      if (contentDelta || reasoningDelta) {
        fullText = cleanContent;
        fullReasoning = totalReasoning;
        if (onChunk) {
          onChunk(contentDelta, reasoningDelta);
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      completeRawBody += chunkText;
      buffer += chunkText;
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep last incomplete line in buffer

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;
        if (cleanLine === "data: [DONE]" || cleanLine === "data:[DONE]") continue;

        if (cleanLine.startsWith("data:")) {
          try {
            const colonIdx = cleanLine.indexOf(":");
            const rawData = cleanLine.substring(colonIdx + 1).trim();
            if (rawData === "[DONE]") continue;
            
            const parsed = JSON.parse(rawData);
            const { content, reasoning } = extractChoiceContent(parsed);
            
            if (content || reasoning) {
              processChunkData(content, reasoning);
            }
          } catch (e) {
            // Ignore incomplete JSON chunks in streaming
          }
        }
      }
    }

    // Flush remaining buffer (SSE stream termination)
    if (buffer) {
      const cleanLine = buffer.trim();
      if (cleanLine.startsWith("data:")) {
        try {
          const colonIdx = cleanLine.indexOf(":");
          const rawData = cleanLine.substring(colonIdx + 1).trim();
          if (rawData !== "[DONE]") {
            const parsed = JSON.parse(rawData);
            const { content, reasoning } = extractChoiceContent(parsed);
            if (content || reasoning) {
              processChunkData(content, reasoning);
            }
          }
        } catch (e) {}
      }
    }

    // Fallback if we finished the stream but fullText is empty (e.g. non-chunked single JSON payload)
    if (!fullText) {
      const fullBuffer = completeRawBody.trim();
      if (fullBuffer && (fullBuffer.startsWith("{") || fullBuffer.startsWith("["))) {
        try {
          const parsed = JSON.parse(fullBuffer);
          const { content, reasoning } = extractChoiceContent(parsed);
          if (content || reasoning) {
            processChunkData(content, reasoning);
          } else if (parsed.error) {
             const errorMsg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || JSON.stringify(parsed.error));
             throw new Error(errorMsg);
          }
        } catch (e) {
          if (e.message && !e.message.includes("JSON") && !e.message.toLowerCase().includes("unexpected token") && !e.message.toLowerCase().includes("valid json")) {
            throw e;
          }
        }
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
