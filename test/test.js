import test from "node:test";

import { callGitHubModelsRequest, callGeminiRequest } from "./endpoints.js";
import {
  assertChatGPTHistory,
  assertGeminiHistory,
  createChatGPTAssistant,
  createGeminiAssistant,
  runPrompt,
  runProviderAssertion
} from "./support.js";

async function callGemini(assistant, userPrompt) {
  return runPrompt(
    "Gemini",
    assistant,
    userPrompt,
    callGeminiRequest,
    "Gemini response did not include any text."
  );
}

async function callChatGPT(assistant, userPrompt) {
  return runPrompt(
    "ChatGPT",
    assistant,
    userPrompt,
    callGitHubModelsRequest,
    "ChatGPT response did not include any text."
  );
}

test("Gemini proxy preserves conversational context", async (testContext) => {
  await runProviderAssertion(
    testContext,
    "Gemini",
    createGeminiAssistant,
    callGemini,
    (assistant) => assistant.history,
    assertGeminiHistory
  );
});

test("ChatGPT proxy preserves conversational context", async (testContext) => {
  await runProviderAssertion(
    testContext,
    "ChatGPT",
    createChatGPTAssistant,
    callChatGPT,
    (assistant) => assistant.messages,
    assertChatGPTHistory
  );
});