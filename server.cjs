const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const GEMINI_MODEL = process.env.GEMINI_MODEL;
// const GEMINI_MODEL = "gemini-pro";
const GH_URL = process.env.GH_URL;
const GEMINI_URL = process.env.GEMINI_URL;
const OPENROUTER_URL = process.env.OPENROUTER_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_URL = process.env.DEEPSEEK_URL;
const LL_URL = process.env.LL_URL;
const LL_API_KEY = process.env.LL_API_KEY;

function logMissingEnvWarning(routeLabel, envName) {
  console.log(`${routeLabel} route disabled until ${envName} is set.`);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json"
    };

    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

// Optional, proxy-only request field. When present it is removed from the payload and
// placed where the upstream provider expects it (Gemini: generationConfig,
// OpenAI-compatible: response_format). Requests without it are forwarded unchanged.
const RESPONSE_FORMAT_KEY = "responseFormat";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function placeGeminiResponseFormat(payload, responseFormat) {
  const existing = isPlainObject(payload.generationConfig) ? payload.generationConfig : {};
  payload.generationConfig = { ...existing, ...responseFormat };
}

function placeOpenAIResponseFormat(payload, responseFormat) {
  payload.response_format = responseFormat;
}

// Returns { body, structured } or { error } for an invalid responseFormat.
function applyResponseFormat(rawBody, place) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { body: rawBody, structured: false };
  }
  if (!isPlainObject(payload) || !Object.prototype.hasOwnProperty.call(payload, RESPONSE_FORMAT_KEY)) {
    return { body: rawBody, structured: false };
  }
  const responseFormat = payload[RESPONSE_FORMAT_KEY];
  delete payload[RESPONSE_FORMAT_KEY];
  if (responseFormat === null || responseFormat === undefined) {
    return { body: JSON.stringify(payload), structured: false };
  }
  if (!isPlainObject(responseFormat)) {
    return { error: `${RESPONSE_FORMAT_KEY} must be a JSON object.` };
  }
  place(payload, responseFormat);
  return { body: JSON.stringify(payload), structured: true };
}

async function handleGeminiPrompt(req, res) {
  if (!GEMINI_API_KEY) {
    sendJson(res, 500, { error: "Missing GEMINI_API_KEY environment variable." });
    return;
  }

  try {
    const prepared = applyResponseFormat(await readRequestBody(req), placeGeminiResponseFormat);
    if (prepared.error) {
      sendJson(res, 400, { error: prepared.error });
      return;
    }
    const body = prepared.body;
    const response = await fetch(GEMINI_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const message = data && data.error && data.error.message
        ? data.error.message
        : "Upstream API error";
      sendJson(res, response.status, { error: message });
      return;
    }

    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
      ? data.candidates[0].content.parts[0].text
      : "No response text returned.";

    sendJson(res, 200, { text });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function handleOpenAIModelsPrompt(token, url, tokenName) {
  return async function (req, res) {
    if (!token) {
      sendJson(res, 500, { error: `Missing ${tokenName} environment variable.` });
      return;
    }

    if (!url) {
      sendJson(res, 500, { error: "Missing upstream URL environment variable." });
      return;
    }

    try {
      const prepared = applyResponseFormat(await readRequestBody(req), placeOpenAIResponseFormat);
      if (prepared.error) {
        sendJson(res, 400, { error: prepared.error });
        return;
      }
      const body = prepared.body;
      const response = await fetch(url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: body
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const message = data && data.error && data.error.message
          ? data.error.message
          : "Upstream API error";
        sendJson(res, response.status, { error: message });
        return;
      }

      if (prepared.structured) {
        // Structured (JSON) output must be returned verbatim; unescaping would corrupt it.
        const message = data.choices && data.choices[0] && data.choices[0].message;
        const text = message && typeof message.content === "string"
          ? message.content
          : "No response text returned.";
        sendJson(res, 200, { text });
        return;
      }

      const dirtytext = data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : "No response text returned.",
          text = dirtytext.replace(/\\n/g, "\n").replace(/\\'/g, "'");
      sendJson(res, 200, { text });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  }
}

var handleGitHubModelsPrompt = handleOpenAIModelsPrompt(GITHUB_TOKEN, GH_URL, "GITHUB_TOKEN");
var handleOpenRouterModelsPrompt = handleOpenAIModelsPrompt(OPENROUTER_API_KEY, OPENROUTER_URL, "OPENROUTER_API_KEY");
var handleDeepSeekPrompt = handleOpenAIModelsPrompt(DEEPSEEK_API_KEY, DEEPSEEK_URL, "DEEPSEEK_API_KEY");
var handleLLPrompt = handleOpenAIModelsPrompt(LL_API_KEY, LL_URL, "LL_API_KEY");

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  if (req.method === "POST") {
    switch (pathname) {
      case "/api/gemprompt":
        handleGeminiPrompt(req, res);
        return;
      case "/api/ghprompt":
        handleGitHubModelsPrompt(req, res);
        return;
      case "/api/orprompt":
        handleOpenRouterModelsPrompt(req, res);
        return;
      case "/api/dsprompt":
        handleDeepSeekPrompt(req, res);
        return;
      case "/api/llprompt":
        handleLLPrompt(req, res);
        return;
      default:
        break;
    }
  }
  if (req.method === "GET") {
    const safePath = pathname === "/" ? "/gemini-node.html" : pathname;
    const filePath = path.join(__dirname, safePath);
    sendFile(res, filePath);
    return;
  }
  res.writeHead(405, { "Content-Type": "text/plain" });
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log(`Unified server running on http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) {
    logMissingEnvWarning("Gemini", "GEMINI_API_KEY");
  }
  if (!GEMINI_URL) {
    logMissingEnvWarning("Gemini", "GEMINI_URL");
  }
  if (!GITHUB_TOKEN) {
    logMissingEnvWarning("GitHub Models", "GITHUB_TOKEN");
  }
  if (!GH_URL) {
    logMissingEnvWarning("GitHub Models", "GH_URL");
  }
  if (!OPENROUTER_API_KEY) {
    logMissingEnvWarning("OpenRouter", "OPENROUTER_API_KEY");
  }
  if (!OPENROUTER_URL) {
    logMissingEnvWarning("OpenRouter", "OPENROUTER_URL");
  }  
  if (!LL_URL) {
    logMissingEnvWarning("Meta-Llama", "LL_URL");
  }
});
