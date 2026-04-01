/**
 * Multi-LLM Provider Support for SimpleClaw
 * Extensible provider interface supporting OpenAI, Anthropic, Gemini, DeepSeek, Ollama, LM Studio
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { SwarmManifest, Task } from '../types';

// Base provider interface
export interface CompletionOptions {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: string | { type: 'function'; function: { name: string } };
  responseFormat?: { type: 'json_object' } | { type: 'text' };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Completion {
  content: string | null;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  supportsStreaming: boolean;
  maxTokens: number;
  complete(options: CompletionOptions): Promise<Completion>;
  getModels(): string[];
}

// Provider registry
export const providers: Record<string, () => LLMProvider> = {
  openai: () => new OpenAIProvider(),
  anthropic: () => new AnthropicProvider(),
  deepseek: () => new DeepSeekProvider(),
  gemini: () => new GeminiProvider(),
  ollama: () => new OllamaProvider(),
  'lm-studio': () => new LMStudioProvider(),
};

// Model configurations
export const MODEL_CONFIGS: Record<string, { maxTokens: number; supportsStreaming: boolean }> = {
  // OpenAI
  'gpt-4o': { maxTokens: 128000, supportsStreaming: true },
  'gpt-4o-mini': { maxTokens: 128000, supportsStreaming: true },
  'gpt-4-turbo': { maxTokens: 128000, supportsStreaming: true },
  'gpt-3.5-turbo': { maxTokens: 16385, supportsStreaming: true },
  
  // Anthropic
  'claude-opus-4-5': { maxTokens: 200000, supportsStreaming: true },
  'claude-sonnet-4-5': { maxTokens: 200000, supportsStreaming: true },
  'claude-3-5-haiku': { maxTokens: 200000, supportsStreaming: true },
  'claude-3-opus': { maxTokens: 200000, supportsStreaming: true },
  'claude-3-sonnet': { maxTokens: 200000, supportsStreaming: true },
  'claude-3-haiku': { maxTokens: 200000, supportsStreaming: true },
  
  // DeepSeek
  'deepseek-chat': { maxTokens: 128000, supportsStreaming: true },
  'deepseek-coder': { maxTokens: 128000, supportsStreaming: true },
  
  // Gemini
  'gemini-1.5-pro': { maxTokens: 2000000, supportsStreaming: true },
  'gemini-1.5-flash': { maxTokens: 1000000, supportsStreaming: true },
  'gemini-1.0-pro': { maxTokens: 32768, supportsStreaming: true },
  
  // Ollama (local)
  'llama3': { maxTokens: 8192, supportsStreaming: true },
  'llama3.1': { maxTokens: 128000, supportsStreaming: true },
  'mistral': { maxTokens: 8192, supportsStreaming: true },
  'codellama': { maxTokens: 16384, supportsStreaming: true },
  'mixtral': { maxTokens: 32768, supportsStreaming: true },
  
  // LM Studio (local)
  'local': { maxTokens: 4096, supportsStreaming: true },
};

// Provider implementations

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  supportsStreaming = true;
  maxTokens = 128000;
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  async complete(options: CompletionOptions): Promise<Completion> {
    const completion = await this.client.chat.completions.create({
      model: options.model,
      messages: options.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      tools: options.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
      tool_choice: options.toolChoice as OpenAI.Chat.ChatCompletionToolChoiceOption | undefined,
      response_format: options.responseFormat as OpenAI.Chat.ChatCompletionResponseFormatOption | undefined,
    });

    const choice = completion.choices[0];
    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id!,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      })),
      finishReason: choice.finish_reason || 'stop',
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
    };
  }

  getModels(): string[] {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }
}

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  supportsStreaming = true;
  maxTokens = 200000;
  
  private apiKey: string;
  private baseURL = 'https://api.anthropic.com/v1';
  private anthropicVersion = '2023-06-01';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider');
    }
  }

  async complete(options: CompletionOptions): Promise<Completion> {
    // Convert messages format
    const systemMessage = options.messages.find(m => m.role === 'system');
    const conversationMessages = options.messages.filter(m => m.role !== 'system');
    
    const requestBody: Record<string, unknown> = {
      model: this.mapModel(options.model),
      messages: conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens || 4096,
    };

    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    if (options.tools?.length) {
      requestBody.tools = options.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
      requestBody.tool_choice = this.mapToolChoice(options.toolChoice);
    }

    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const textContent = data.content.find(c => c.type === 'text');
    const toolUses = data.content.filter(c => c.type === 'tool_use');

    return {
      content: textContent?.text || null,
      toolCalls: toolUses.map(tu => ({
        id: tu.id!,
        name: tu.name!,
        args: tu.input!,
      })),
      finishReason: data.stop_reason || 'end_turn',
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };
  }

  private mapModel(model: string): string {
    // Map common model names to Anthropic versions
    const modelMap: Record<string, string> = {
      'claude-opus-4-5': 'claude-opus-4-5-20251120',
      'claude-sonnet-4-5': 'claude-sonnet-4-5-20251120',
      'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-sonnet': 'claude-3-sonnet-20240229',
      'claude-3-haiku': 'claude-3-haiku-20240307',
    };
    return modelMap[model] || model;
  }

  private mapToolChoice(toolChoice?: string | { type: 'function'; function: { name: string } }): { type: string; name?: string } | undefined {
    if (!toolChoice) return undefined;
    if (typeof toolChoice === 'string') {
      if (toolChoice === 'auto') return { type: 'auto' };
      if (toolChoice === 'none') return { type: 'none' };
    }
    if (typeof toolChoice === 'object' && 'function' in toolChoice) {
      return { type: 'tool', name: toolChoice.function.name };
    }
    return undefined;
  }

  getModels(): string[] {
    return ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-haiku', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
  }
}

export class DeepSeekProvider implements LLMProvider {
  name = 'deepseek';
  supportsStreaming = true;
  maxTokens = 128000;
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
    });
  }

  async complete(options: CompletionOptions): Promise<Completion> {
    const completion = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: options.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat as OpenAI.Chat.ChatCompletionResponseFormatOption | undefined,
    });

    const choice = completion.choices[0];
    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id!,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      })),
      finishReason: choice.finish_reason || 'stop',
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
    };
  }

  getModels(): string[] {
    return ['deepseek-chat', 'deepseek-coder'];
  }
}

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  supportsStreaming = true;
  maxTokens = 2000000;
  
  private apiKey: string;
  private baseURL = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is required for Gemini provider');
    }
  }

  async complete(options: CompletionOptions): Promise<Completion> {
    const model = this.mapModel(options.model);
    const contents = options.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    };

    // Add system instruction if present
    const systemMessage = options.messages.find(m => m.role === 'system');
    if (systemMessage) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    // Add tools if present
    if (options.tools?.length) {
      requestBody.tools = {
        functionDeclarations: options.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      };
    }

    const response = await fetch(
      `${this.baseURL}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> };
        finishReason?: string;
      }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
    };

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const textParts = parts.filter(p => p.text);
    const toolCalls = parts.filter(p => p.functionCall);

    return {
      content: textParts.map(p => p.text).join('') || null,
      toolCalls: toolCalls.map((tc, i) => ({
        id: `call_${i}`,
        name: tc.functionCall!.name,
        args: tc.functionCall!.args,
      })),
      finishReason: candidate?.finishReason || 'STOP',
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }

  private mapModel(model: string): string {
    // Ensure we have the correct model suffix
    if (!model.includes(':')) {
      return `${model}`;
    }
    return model;
  }

  getModels(): string[] {
    return ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'];
  }
}

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  supportsStreaming = true;
  maxTokens = 8192;
  
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  }

  async complete(options: CompletionOptions): Promise<Completion> {
    const systemMessage = options.messages.find(m => m.role === 'system');
    const conversationMessages = options.messages.filter(m => m.role !== 'system');

    const requestBody: Record<string, unknown> = {
      model: options.model || 'llama3',
      messages: conversationMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
      },
    };

    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }

    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      message?: { content?: string; tool_calls?: Array<{ name: string; arguments: string }> };
      done_reason?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.message?.content || null,
      toolCalls: data.message?.tool_calls?.map((tc, i) => ({
        id: `call_${i}`,
        name: tc.name,
        args: JSON.parse(tc.arguments),
      })),
      finishReason: data.done_reason || 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }

  getModels(): string[] {
    return ['llama3', 'llama3.1', 'mistral', 'codellama', 'mixtral'];
  }
}

export class LMStudioProvider implements LLMProvider {
  name = 'lm-studio';
  supportsStreaming = true;
  maxTokens = 4096;
  
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
  }

  async complete(options: CompletionOptions): Promise<Completion> {
    const completion = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || 'local',
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        tools: options.tools,
        tool_choice: options.toolChoice,
      }),
    });

    if (!completion.ok) {
      const error = await completion.text();
      throw new Error(`LM Studio API error: ${completion.status} - ${error}`);
    }

    const data = await completion.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
        finish_reason: string;
      }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices[0];
    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      })),
      finishReason: choice.finish_reason,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }

  getModels(): string[] {
    return ['local'];
  }
}

// Provider factory and selector
export function createProvider(providerName: string, options?: Record<string, string>): LLMProvider {
  const factory = providers[providerName.toLowerCase()];
  if (!factory) {
    throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return factory();
}

export function autoSelectProvider(): LLMProvider {
  // Priority order: Anthropic > OpenAI > DeepSeek > Ollama > LM Studio
  if (process.env.ANTHROPIC_API_KEY) {
    return createProvider('anthropic');
  }
  if (process.env.OPENAI_API_KEY) {
    return createProvider('openai');
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return createProvider('deepseek');
  }
  if (process.env.OLLAMA_BASE_URL) {
    return createProvider('ollama');
  }
  if (process.env.LM_STUDIO_BASE_URL) {
    return createProvider('lm-studio');
  }
  throw new Error('No LLM provider API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, or configure a local provider.');
}

export function getProviderForModel(model: string): LLMProvider {
  // Infer provider from model name
  if (model.startsWith('claude')) return createProvider('anthropic');
  if (model.startsWith('gpt')) return createProvider('openai');
  if (model.startsWith('deepseek')) return createProvider('deepseek');
  if (model.startsWith('gemini')) return createProvider('gemini');
  if (model.startsWith('llama') || model.startsWith('mistral') || model.startsWith('mixtral') || model.startsWith('codellama')) {
    return createProvider('ollama');
  }
  if (model === 'local') return createProvider('lm-studio');
  
  // Default fallback
  return autoSelectProvider();
}
