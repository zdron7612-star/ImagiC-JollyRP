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

export function buildChatCompletionRequest({
  apiKey,
  model,
  messages,
  temperature = 0.8,
  provider = 'openrouter',
  customUrl = '',
  extraParams = {},
  stream = false
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

  const requestBody = {
    messages,
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

  const modelLower = (model || '').toLowerCase();
  const isThinkingModel =
    modelLower.includes('qwen') ||
    modelLower.includes('deepseek') ||
    modelLower.includes('-r1') ||
    modelLower.includes('reasoning');

  if (provider === 'openrouter' && isThinkingModel) {
    requestBody.reasoning_format = "hidden";
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

export function extractChoiceContent(data, { includeReasoning = true } = {}) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const delta = choice.delta || {};
  return (
    delta.content ||
    message.content ||
    choice.text ||
    data?.content ||
    (includeReasoning ? (delta.reasoning_content || message.reasoning_content) : '') ||
    ''
  );
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
  extraParams = {}
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
      stream: true
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
    let buffer = "";
    
    // Accumulators for split-safe think tag stripping
    let rawTextAccumulator = "";
    let cleanTextAccumulator = "";
    let completeRawBody = "";

    const stripThinkTags = (text) => {
      let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
      const openIdx = cleaned.indexOf("<think>");
      if (openIdx !== -1) {
        cleaned = cleaned.substring(0, openIdx);
      }
      // Strip common leaked prompt tags at the start of the message (e.g. Sarvam 105b)
      cleaned = cleaned.replace(/^(?:\s*<\|im_start\|>\s*(?:assistant)?\s*|\s*<\|start_header_id\|>\s*assistant\s*<\|end_header_id\|>\s*|\s*<\|assistant\|>\s*|\s*<s>\s*|\s*<\/?s>\s*|\s*\[(?:INST|ASSISTANT)\]\s*)/i, "");
      return cleaned;
    };

    const processContent = (content) => {
      rawTextAccumulator += content;
      const newCleanText = stripThinkTags(rawTextAccumulator);
      const delta = newCleanText.substring(cleanTextAccumulator.length);
      if (delta) {
        cleanTextAccumulator = newCleanText;
        fullText += delta;
        onChunk(delta);
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
            const content = extractChoiceContent(parsed, { includeReasoning: true });
            
            if (content) {
              processContent(content);
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
            const content = extractChoiceContent(parsed, { includeReasoning: true });
            if (content) {
              processContent(content);
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
          const content = extractChoiceContent(parsed, { includeReasoning: true });
          if (content) {
            const cleanContent = stripThinkTags(content);
            if (cleanContent) {
              fullText = cleanContent;
              onChunk(cleanContent);
            }
          } else if (parsed.error) {
             const errorMsg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || JSON.stringify(parsed.error));
             throw new Error(errorMsg);
          }
        } catch (e) {
          if (e.message && !e.message.includes("JSON") && !e.message.toLowerCase().includes("unexpected token") && !e.message.toLowerCase().includes("valid json")) {
            throw e; // rethrow if it was the error we explicitly threw above
          }
          // Not a valid JSON or incomplete
        }
      }
    }

    if (!fullText) {
      throw new Error("Empty response received from AI model. Please check your settings, model selections, or credit balance.");
    }

    onFinish(fullText);
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
