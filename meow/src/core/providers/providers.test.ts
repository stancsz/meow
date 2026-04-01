/**
 * Tests for Multi-LLM Provider Support
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

describe('Provider Base Module', () => {
  test('should export all providers', async () => {
    const { 
      providers, 
      MODEL_CONFIGS,
      createProvider,
      autoSelectProvider,
      getProviderForModel,
      OpenAIProvider,
      AnthropicProvider,
      DeepSeekProvider,
      GeminiProvider,
      OllamaProvider,
      LMStudioProvider
    } = await import('./base');

    expect(providers).toBeDefined();
    expect(Object.keys(providers)).toContain('openai');
    expect(Object.keys(providers)).toContain('anthropic');
    expect(Object.keys(providers)).toContain('deepseek');
    expect(Object.keys(providers)).toContain('gemini');
    expect(Object.keys(providers)).toContain('ollama');
    expect(Object.keys(providers)).toContain('lm-studio');
  });

  test('should have model configurations', () => {
    // MODEL_CONFIGS is imported statically
    expect(MODEL_CONFIGS['gpt-4o']).toBeDefined();
    expect(MODEL_CONFIGS['claude-sonnet-4-5']).toBeDefined();
    expect(MODEL_CONFIGS['deepseek-chat']).toBeDefined();
    expect(MODEL_CONFIGS['gemini-1.5-pro']).toBeDefined();
  });

  test('should create provider by name', async () => {
    const { createProvider } = await import('./base');
    
    // These would fail without API keys but should create instances
    expect(() => createProvider('openai')).not.toThrow();
    expect(() => createProvider('anthropic')).not.toThrow();
    expect(() => createProvider('deepseek')).not.toThrow();
    expect(() => createProvider('gemini')).not.toThrow();
    expect(() => createProvider('ollama')).not.toThrow();
    expect(() => createProvider('lm-studio')).not.toThrow();
  });

  test('should throw error for unknown provider', async () => {
    const { createProvider } = await import('./base');
    expect(() => createProvider('unknown')).toThrow('Unknown provider');
  });

  test('should infer provider from model name', async () => {
    const { getProviderForModel } = await import('./base');
    
    expect(getProviderForModel('gpt-4o').name).toBe('openai');
    expect(getProviderForModel('claude-sonnet-4-5').name).toBe('anthropic');
    expect(getProviderForModel('deepseek-chat').name).toBe('deepseek');
    expect(getProviderForModel('gemini-1.5-pro').name).toBe('gemini');
    expect(getProviderForModel('llama3').name).toBe('ollama');
    expect(getProviderForModel('local').name).toBe('lm-studio');
  });

  test('should get models from provider', async () => {
    const { createProvider } = await import('./base');
    
    const openai = createProvider('openai');
    const models = openai.getModels();
    expect(models).toContain('gpt-4o');
    expect(models).toContain('gpt-4o-mini');
    
    const anthropic = createProvider('anthropic');
    const anthropicModels = anthropic.getModels();
    expect(anthropicModels).toContain('claude-sonnet-4-5');
  });
});

describe('OpenAI Provider', () => {
  test('should have correct configuration', async () => {
    const { OpenAIProvider } = await import('./base');
    const provider = new OpenAIProvider('test-key');
    expect(provider.name).toBe('openai');
    expect(provider.supportsStreaming).toBe(true);
    expect(provider.maxTokens).toBe(128000);
  });
});

describe('Anthropic Provider', () => {
  test('should have correct configuration', async () => {
    const { AnthropicProvider } = await import('./base');
    const provider = new AnthropicProvider('test-key');
    expect(provider.name).toBe('anthropic');
    expect(provider.supportsStreaming).toBe(true);
    expect(provider.maxTokens).toBe(200000);
  });

  test('should get available models', async () => {
    const { AnthropicProvider } = await import('./base');
    const provider = new AnthropicProvider('test-key');
    const models = provider.getModels();
    expect(models).toContain('claude-sonnet-4-5');
    expect(models).toContain('claude-opus-4-5');
  });
});

describe('DeepSeek Provider', () => {
  test('should have correct configuration', async () => {
    const { DeepSeekProvider } = await import('./base');
    const provider = new DeepSeekProvider('test-key');
    expect(provider.name).toBe('deepseek');
    expect(provider.maxTokens).toBe(128000);
  });
});

describe('Gemini Provider', () => {
  test('should have correct configuration', async () => {
    const { GeminiProvider } = await import('./base');
    const provider = new GeminiProvider('test-key');
    expect(provider.name).toBe('gemini');
    expect(provider.maxTokens).toBe(2000000);
  });
});

describe('Ollama Provider', () => {
  test('should have correct configuration', async () => {
    const { OllamaProvider } = await import('./base');
    const provider = new OllamaProvider('http://localhost:11434');
    expect(provider.name).toBe('ollama');
    expect(provider.maxTokens).toBe(8192);
  });

  test('should get default models', async () => {
    const { OllamaProvider } = await import('./base');
    const provider = new OllamaProvider();
    const models = provider.getModels();
    expect(models).toContain('llama3');
    expect(models).toContain('mistral');
  });
});

describe('LM Studio Provider', () => {
  test('should have correct configuration', async () => {
    const { LMStudioProvider } = await import('./base');
    const provider = new LMStudioProvider('http://localhost:1234');
    expect(provider.name).toBe('lm-studio');
    expect(provider.maxTokens).toBe(4096);
  });
});
