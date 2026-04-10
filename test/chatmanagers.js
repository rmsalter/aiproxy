const GH_MODEL = "gpt-4o-mini";

class ChatManager {
    constructor(){this.counter = 0;};
    setSystemInstruction(){}
    prepareRequest(){}
    addModelResponse(){this.counter++;}
    clearHistory(){this.counter = 0;}
    get count() {return this.counter;}
}

class GeminiChatManager extends ChatManager {
  constructor(systemInstruction) {
    super();
    this.system_instruction = systemInstruction;
    this.history = []; // This stores the conversation "memory"
  }
  setSystemInstruction(systemInstruction) {
    this.system_instruction = systemInstruction;
  }
  prepareRequest(userPrompt) {
    this.history.push({
      role: "user",
      parts: [{ text: userPrompt }]
    });
    return {
      system_instruction: {parts: [{ text: this.system_instruction }]},
      contents: this.history
    };
  }
  addModelResponse(responseText) {
    super.addModelResponse();
    this.history.push({
      role: "model",
      parts: [{ text: responseText }]
    });
  }
  clearHistory() {
    super.clearHistory();
    this.history = [];
  }
}

class ChatGPTChatManager extends ChatManager {
  constructor(systemInstruction) {
    super()
    this.system_instruction = { role: "system", content: systemInstruction };
    this.messages = [this.system_instruction];
  }
  setSystemInstruction(systemInstruction) {
    this.system_instruction.content = systemInstruction;
  }
  prepareRequest(userPrompt) {
    this.messages.push({ role: "user", content: userPrompt });
    return {
      model: GH_MODEL,
      messages: this.messages
    };
  }
  addModelResponse(responseText) {
    super.addModelResponse();
    this.messages.push({ role: "assistant", content: responseText });
  }
  clearHistory() {
    super.clearHistory();
    this.messages = [this.system_instruction];
  }
}

export {GeminiChatManager, ChatGPTChatManager}