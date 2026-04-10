import assert from "node:assert/strict";
import test from "node:test";

import {
  PROMPTS,
  assertChatGPTHistory,
  assertGeminiHistory,
  createChatGPTAssistant,
  createGeminiAssistant,
  requestWithRetry,
  runPrompt
} from "./support.js";

const fastRetryOptions = {
  delayBaseMs: 0,
  waitFn: async () => {},
  onRetry: () => {}
};

test("requestWithRetry retries transient failures and eventually succeeds", async () => {
  let attempts = 0;

  const answer = await requestWithRetry("Gemini", async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("This model is currently experiencing high demand.");
    }
    return "ok";
  }, fastRetryOptions);

  assert.equal(answer, "ok");
  assert.equal(attempts, 3);
});

test("requestWithRetry stops immediately on non-transient errors", async () => {
  let attempts = 0;

  await assert.rejects(
    requestWithRetry("Gemini", async () => {
      attempts += 1;
      throw new Error("Missing API key");
    }, fastRetryOptions),
    /Missing API key/
  );

  assert.equal(attempts, 1);
});

test("runPrompt records Gemini history on successful two-turn conversation", async () => {
  const assistant = createGeminiAssistant();
  const responses = ["4", "40"];

  await runPrompt("Gemini", assistant, PROMPTS[0], async () => responses.shift(), "Gemini response did not include any text.", fastRetryOptions);
  await runPrompt("Gemini", assistant, PROMPTS[1], async () => responses.shift(), "Gemini response did not include any text.", fastRetryOptions);

  assertGeminiHistory(assistant.history, PROMPTS);
});

test("runPrompt records ChatGPT history on successful two-turn conversation", async () => {
  const assistant = createChatGPTAssistant();
  const responses = ["2 + 2 equals 4.", "4 multiplied by 10 equals 40."];

  await runPrompt("ChatGPT", assistant, PROMPTS[0], async () => responses.shift(), "ChatGPT response did not include any text.", fastRetryOptions);
  await runPrompt("ChatGPT", assistant, PROMPTS[1], async () => responses.shift(), "ChatGPT response did not include any text.", fastRetryOptions);

  assertChatGPTHistory(assistant.messages, PROMPTS);
});

test("runPrompt rolls back failed Gemini user turns", async () => {
  const assistant = createGeminiAssistant();

  await assert.rejects(
    runPrompt(
      "Gemini",
      assistant,
      PROMPTS[0],
      async () => {
        throw new Error("HTTP 500");
      },
      "Gemini response did not include any text.",
      fastRetryOptions
    ),
    /HTTP 500/
  );

  assert.deepEqual(assistant.history, []);
});

test("runPrompt rolls back failed ChatGPT user turns", async () => {
  const assistant = createChatGPTAssistant();

  await assert.rejects(
    runPrompt(
      "ChatGPT",
      assistant,
      PROMPTS[0],
      async () => {
        throw new Error("HTTP 500");
      },
      "ChatGPT response did not include any text.",
      fastRetryOptions
    ),
    /HTTP 500/
  );

  assert.deepEqual(assistant.messages, [{ role: "system", content: assistant.system_instruction.content }]);
});

test("runPrompt rejects empty model text and rolls back the pending user turn", async () => {
  const assistant = createGeminiAssistant();

  await assert.rejects(
    runPrompt(
      "Gemini",
      assistant,
      PROMPTS[0],
      async () => "   ",
      "Gemini response did not include any text.",
      fastRetryOptions
    ),
    /did not include any text/
  );

  assert.deepEqual(assistant.history, []);
});