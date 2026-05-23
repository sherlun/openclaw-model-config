const MODEL_PRESETS = {
  "DeepSeek": { api: "openai-completions", baseUrl: "https://api.deepseek.com", env_key: "DEEPSEEK_API_KEY",
    models: [
      { id: "deepseek-chat", name: "DeepSeek-V3", contextWindow: 128000, maxTokens: 8192, input: ["text"] },
      { id: "deepseek-reasoner", name: "DeepSeek-R1", contextWindow: 128000, maxTokens: 8192, input: ["text"], reasoning: true },
      { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash", contextWindow: 128000, maxTokens: 8192, input: ["text"] },
      { id: "deepseek-v4", name: "DeepSeek-V4", contextWindow: 128000, maxTokens: 8192, input: ["text"] },
    ]
  },
  "Zhipu (智谱 GLM)": { api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", env_key: "ZHIPU_API_KEY",
    models: [
      { id: "glm-4-flash", name: "GLM-4-Flash", contextWindow: 128000, maxTokens: 4096, input: ["text"] },
      { id: "glm-4-plus", name: "GLM-4-Plus", contextWindow: 128000, maxTokens: 4096, input: ["text"] },
      { id: "glm-4-air", name: "GLM-4-Air", contextWindow: 128000, maxTokens: 4096, input: ["text"] },
      { id: "glm-4", name: "GLM-4", contextWindow: 128000, maxTokens: 4096, input: ["text"] },
    ]
  },
  "Qwen (通义千问)": { api: "openai-completions", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", env_key: "DASHSCOPE_API_KEY",
    models: [
      { id: "qwen-turbo", name: "Qwen-Turbo", contextWindow: 131072, maxTokens: 8192, input: ["text"] },
      { id: "qwen-plus", name: "Qwen-Plus", contextWindow: 131072, maxTokens: 8192, input: ["text"] },
      { id: "qwen-max", name: "Qwen-Max", contextWindow: 32768, maxTokens: 8192, input: ["text"] },
      { id: "qwen3-235b-a22b", name: "Qwen3-235B-A22B", contextWindow: 131072, maxTokens: 8192, input: ["text"] },
    ]
  },
  "Moonshot (Kimi)": { api: "openai-completions", baseUrl: "https://api.moonshot.cn/v1", env_key: "MOONSHOT_API_KEY",
    models: [
      { id: "moonshot-v1-8k", name: "Moonshot-v1-8K", contextWindow: 8192, maxTokens: 4096, input: ["text"] },
      { id: "moonshot-v1-32k", name: "Moonshot-v1-32K", contextWindow: 32768, maxTokens: 4096, input: ["text"] },
      { id: "moonshot-v1-128k", name: "Moonshot-v1-128K", contextWindow: 128000, maxTokens: 4096, input: ["text"] },
    ]
  },
  "SiliconFlow (硅基流动)": { api: "openai-completions", baseUrl: "https://api.siliconflow.cn/v1", env_key: "SILICONFLOW_API_KEY",
    models: [
      { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek-V3", contextWindow: 65536, maxTokens: 8192, input: ["text"] },
      { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek-R1", contextWindow: 65536, maxTokens: 8192, input: ["text"], reasoning: true },
      { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen2.5-72B", contextWindow: 32768, maxTokens: 4096, input: ["text"] },
      { id: "THUDM/glm-4-9b-chat", name: "GLM-4-9B", contextWindow: 32768, maxTokens: 4096, input: ["text"] },
      { id: "Pro/Qwen/Qwen2.5-7B-Instruct", name: "Qwen2.5-7B", contextWindow: 32768, maxTokens: 4096, input: ["text"] },
    ]
  },
  "Volcengine (火山引擎/豆包)": { api: "openai-completions", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", env_key: "VOLCENGINE_API_KEY",
    models: [
      { id: "doubao-pro-32k", name: "Doubao-Pro-32K", contextWindow: 32768, maxTokens: 4096, input: ["text"] },
      { id: "doubao-pro-128k", name: "Doubao-Pro-128K", contextWindow: 131072, maxTokens: 4096, input: ["text"] },
      { id: "doubao-lite-32k", name: "Doubao-Lite-32K", contextWindow: 32768, maxTokens: 4096, input: ["text"] },
    ]
  },
  "OpenAI": { api: "openai-completions", baseUrl: "https://api.openai.com/v1", env_key: "OPENAI_API_KEY",
    models: [
      { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, maxTokens: 16384, input: ["text"] },
      { id: "gpt-4o-mini", name: "GPT-4o-mini", contextWindow: 128000, maxTokens: 16384, input: ["text"] },
      { id: "o3-mini", name: "o3-mini", contextWindow: 200000, maxTokens: 100000, input: ["text"], reasoning: true },
    ]
  },
}

export { MODEL_PRESETS }
