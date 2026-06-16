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

  let endpointUrl = "";
  let headers = {
    "Content-Type": "application/json"
  };

  if (provider === 'openrouter') {
    endpointUrl = "https://openrouter.ai/api/v1/chat/completions";
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "https://jollyrp.ai";
    headers["X-Title"] = "JollyRP client";
  } else if (provider === 'custom') {
    let baseUrl = customUrl.trim().replace(/\/$/, '');
    try {
      const parsedUrl = new URL(baseUrl);
      if (parsedUrl.pathname === '' || parsedUrl.pathname === '/') {
        baseUrl += '/v1';
      }
    } catch (e) {
      // Ignore URL parsing errors and fallback to baseUrl
    }
    endpointUrl = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  }

  // Identify if this is a known reasoning model
  const modelLower = model.toLowerCase();
  const isThinkingModel = 
    modelLower.includes('qwen') || 
    modelLower.includes('deepseek') || 
    modelLower.includes('-r1') || 
    modelLower.includes('reasoning');

  try {
    // Sanitize parameters to avoid 400 Bad Request on specific providers (like direct OpenAI)
    const requestBody = {
      model: model,
      messages: messages,
      temperature: parseFloat(temperature),
      stream: true
    };

    const isCustomOpenAI = provider === 'custom' && endpointUrl.includes('openai.com');

    // Add Top P
    if (extraParams.top_p !== undefined) {
      requestBody.top_p = parseFloat(extraParams.top_p);
    }

    // Add Max Tokens
    if (extraParams.max_tokens !== undefined) {
      requestBody.max_tokens = parseInt(extraParams.max_tokens);
    }

    // Add Top K if supported (Not supported by OpenAI)
    if (extraParams.top_k !== undefined && parseInt(extraParams.top_k) > 0) {
      if (!isCustomOpenAI) {
        requestBody.top_k = parseInt(extraParams.top_k);
      }
    }

    // Add Repetition Penalty / Frequency Penalty mapping
    if (extraParams.repetition_penalty !== undefined && parseFloat(extraParams.repetition_penalty) !== 1.0) {
      if (isCustomOpenAI) {
        // Map repetition_penalty (1.0 to 2.0) to frequency_penalty (0.0 to 2.0)
        const rep = parseFloat(extraParams.repetition_penalty);
        requestBody.frequency_penalty = Math.min(2.0, Math.max(0.0, (rep - 1.0) * 2.0));
      } else {
        requestBody.repetition_penalty = parseFloat(extraParams.repetition_penalty);
      }
    }

    // Hardcoded API instruction to suppress reasoning text output (Only supported/needed on OpenRouter)
    if (provider === 'openrouter' && isThinkingModel) {
      requestBody.reasoning_format = "hidden";
    }

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody),
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
            const content = parsed.choices?.[0]?.delta?.content || 
                            parsed.choices?.[0]?.message?.content || 
                            parsed.choices?.[0]?.text || 
                            "";
            
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
            const content = parsed.choices?.[0]?.delta?.content || 
                            parsed.choices?.[0]?.message?.content || 
                            parsed.choices?.[0]?.text || 
                            "";
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
          const content = parsed.choices?.[0]?.message?.content || 
                          parsed.choices?.[0]?.text || 
                          parsed.content || 
                          "";
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
    if (error.name === "AbortError") {
      console.log("Stream fetch aborted.");
    } else {
      onError(error);
    }
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
