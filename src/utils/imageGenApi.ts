/**
 * API de Geração de Imagens
 * Suporta múltiplos providers: OpenAI, Google (Nano Banana), FLUX 2, Recraft V3, Ideogram 3, Stability AI, Leonardo, Midjourney, FAL.AI, Replicate
 * Atualizado: Fevereiro 2026
 */

import type { ImageGenApiConfig, ImageGenProvider } from '../types/ApiConfig';
import { IMAGE_GEN_ENDPOINTS } from '../types/ApiConfig';

// =============================================================================
// LOGGING E DEBUG
// =============================================================================

const LOG_PREFIX = '[ImageGenAPI]';

function logInfo(provider: string, message: string, data?: unknown) {
  console.log(`${LOG_PREFIX} [${provider}] ${message}`, data !== undefined ? data : '');
}

function logError(provider: string, message: string, error?: unknown) {
  console.error(`${LOG_PREFIX} [${provider}] ERROR: ${message}`, error !== undefined ? error : '');
}

/**
 * Extrai mensagem de erro detalhada de diferentes formatos de resposta de API
 */
function extractErrorMessage(errorData: unknown, statusCode: number, statusText: string): string {
  if (!errorData || typeof errorData !== 'object') {
    return `Erro ${statusCode}: ${statusText}`;
  }

  const data = errorData as Record<string, unknown>;

  // Tenta diferentes formatos comuns de erro
  const errorMsg =
    // OpenAI format
    (data.error as Record<string, unknown>)?.message ||
    (data.error as Record<string, unknown>)?.code ||
    // Simple formats
    data.detail ||
    data.message ||
    data.error_description ||
    // Nested error
    (typeof data.error === 'string' ? data.error : null) ||
    // FAL.AI format
    (data.error as Record<string, unknown>)?.detail ||
    // Replicate format
    data.title ||
    // Last resort: stringify
    null;

  if (errorMsg && typeof errorMsg === 'string') {
    return `Erro ${statusCode}: ${errorMsg}`;
  }

  // Se não encontrou formato conhecido, stringify o objeto
  try {
    return `Erro ${statusCode}: ${JSON.stringify(errorData).substring(0, 200)}`;
  } catch {
    return `Erro ${statusCode}: ${statusText}`;
  }
}

// =============================================================================
// RETRY COM BACKOFF
// =============================================================================

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Executa uma operação com retry e backoff exponencial
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 2, baseDelayMs = 2000, shouldRetry } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Verifica se deve fazer retry
      if (attempt <= maxRetries) {
        const isRetryable = shouldRetry ? shouldRetry(lastError) : isRetryableError(lastError);

        if (isRetryable) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          logInfo('retry', `Tentativa ${attempt}/${maxRetries} falhou, aguardando ${delay}ms...`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // Não é retryable ou acabaram as tentativas
      throw lastError;
    }
  }

  throw lastError;
}

/**
 * Verifica se um erro é transiente e vale a pena fazer retry
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Erros de rede/timeout são retryáveis
  if (message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')) {
    return true;
  }

  // Rate limit pode ser retryável
  if (message.includes('429') || message.includes('rate limit') || message.includes('too many')) {
    return true;
  }

  // Erros 5xx do servidor são retryáveis
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
    return true;
  }

  // Erros 4xx (exceto 429) não são retryáveis
  if (message.includes('400') || message.includes('401') || message.includes('403') || message.includes('404')) {
    return false;
  }

  return false;
}

/**
 * Resultado de uma geração de imagem
 */
export interface ImageGenResult {
  success: boolean;
  imageUrl?: string;
  imageBase64?: string;
  error?: string;
}

/**
 * Progresso da geração de imagens
 */
export interface ImageGenProgress {
  current: number;
  total: number;
  status: 'idle' | 'generating' | 'downloading' | 'completed' | 'error';
  message?: string;
}

/**
 * Opções para geração de imagem
 */
export interface ImageGenOptions {
  width?: number;
  height?: number;
  aspectRatio?: '16:9' | '1:1' | '9:16';
  quality?: 'standard' | 'hd';
}

/**
 * Converte aspect ratio para dimensões
 */
function aspectRatioToDimensions(aspectRatio: '16:9' | '1:1' | '9:16'): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1920, height: 1080 };
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

/**
 * Gera uma imagem usando OpenAI (GPT Image / DALL-E)
 */
async function generateOpenAI(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const provider = 'OpenAI';
  const endpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.openai;
  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  // OpenAI suporta tamanhos específicos
  let size = '1024x1024';
  if (width >= 1792 || height >= 1792) {
    size = width > height ? '1792x1024' : '1024x1792';
  }

  logInfo(provider, `Iniciando geração - modelo: ${config.model}, size: ${size}`);

  return withRetry(async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        n: 1,
        size,
        quality: options.quality || 'standard',
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMsg = extractErrorMessage(errorData, response.status, response.statusText);
      logError(provider, errorMsg, errorData);
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const imageData = data.data?.[0];

    if (imageData?.b64_json) {
      logInfo(provider, 'Imagem gerada com sucesso (base64)');
      return { success: true, imageBase64: imageData.b64_json };
    } else if (imageData?.url) {
      logInfo(provider, 'Imagem gerada com sucesso (url)');
      return { success: true, imageUrl: imageData.url };
    }

    logError(provider, 'Resposta inválida - sem imagem', data);
    return { success: false, error: `${provider}: Resposta inválida da API - nenhuma imagem retornada` };
  }).catch(error => {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, error: `${provider}: ${errorMsg}` };
  });
}

/**
 * Gera uma imagem usando Stability AI (Stable Diffusion)
 */
async function generateStability(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const provider = 'Stability';
  const endpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.stability;
  const aspectRatio = options.aspectRatio === '16:9' ? '16:9' : options.aspectRatio === '9:16' ? '9:16' : '1:1';

  logInfo(provider, `Iniciando geração - modelo: ${config.model}, aspectRatio: ${aspectRatio}`);

  return withRetry(async () => {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', config.model);
    formData.append('output_format', 'png');
    formData.append('aspect_ratio', aspectRatio);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Accept': 'image/*',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMsg = extractErrorMessage(errorData, response.status, response.statusText);
      logError(provider, errorMsg, errorData);
      throw new Error(errorMsg);
    }

    // Stability retorna a imagem diretamente
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    logInfo(provider, 'Imagem gerada com sucesso');
    return { success: true, imageBase64: base64 };
  }).catch(error => {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, error: `${provider}: ${errorMsg}` };
  });
}

/**
 * Gera uma imagem usando FLUX via Replicate
 */
async function generateFluxReplicate(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const provider = 'FLUX-Replicate';
  const endpoint = config.endpoint || IMAGE_GEN_ENDPOINTS['flux-replicate'];
  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  logInfo(provider, `Iniciando geração - modelo: ${config.model}, size: ${width}x${height}`);

  try {
    // Replicate usa modelo async - primeiro cria a prediction
    const createResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: {
          prompt,
          width,
          height,
          num_outputs: 1,
          output_format: 'png',
        },
      }),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => null);
      const errorMsg = extractErrorMessage(errorData, createResponse.status, createResponse.statusText);
      logError(provider, errorMsg, errorData);
      return { success: false, error: `${provider}: ${errorMsg}` };
    }

    const prediction = await createResponse.json();
    logInfo(provider, `Prediction criada: ${prediction.id}, aguardando resultado...`);

    // Poll para resultado
    let result = prediction;
    const maxAttempts = 60; // 60 tentativas * 2s = 2 minutos máximo
    let attempts = 0;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await fetch(result.urls.get, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });

      if (!statusResponse.ok) {
        logError(provider, `Erro ao verificar status: ${statusResponse.status}`);
        return { success: false, error: `${provider}: Erro ao verificar status: ${statusResponse.status}` };
      }

      result = await statusResponse.json();
      attempts++;

      if (attempts % 5 === 0) {
        logInfo(provider, `Aguardando... tentativa ${attempts}/${maxAttempts}, status: ${result.status}`);
      }
    }

    if (result.status === 'succeeded' && result.output?.[0]) {
      logInfo(provider, 'Imagem gerada com sucesso');
      return { success: true, imageUrl: result.output[0] };
    }

    const errorMsg = result.error || 'Timeout ou falha na geração';
    logError(provider, errorMsg, result);
    return { success: false, error: `${provider}: ${errorMsg}` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    logError(provider, errorMsg, error);
    return { success: false, error: `${provider}: ${errorMsg}` };
  }
}

/**
 * Gera uma imagem usando FLUX via FAL.AI (30-50% mais barato)
 */
async function generateFluxFal(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const provider = 'FLUX-FAL';
  const baseEndpoint = config.endpoint || IMAGE_GEN_ENDPOINTS['flux-fal'];
  // FAL.AI usa formato: https://queue.fal.run/{model}
  const modelPath = config.model.startsWith('fal-ai/') ? config.model : `fal-ai/${config.model}`;
  const endpoint = `${baseEndpoint}/${modelPath}`;
  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  logInfo(provider, `Iniciando geração - modelo: ${modelPath}, size: ${width}x${height}`);
  logInfo(provider, `Endpoint: ${endpoint}`);

  return withRetry(async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${config.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        image_size: { width, height },
        num_images: 1,
        sync_mode: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMsg = extractErrorMessage(errorData, response.status, response.statusText);
      logError(provider, errorMsg, errorData);
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const imageUrl = data.images?.[0]?.url;

    if (imageUrl) {
      logInfo(provider, 'Imagem gerada com sucesso');
      return { success: true, imageUrl };
    }

    logError(provider, 'Resposta inválida - sem imagem', data);
    return { success: false, error: `${provider}: Resposta inválida da API - nenhuma imagem retornada` };
  }).catch(error => {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, error: `${provider}: ${errorMsg}` };
  });
}

/**
 * Gera uma imagem usando FLUX via Black Forest Labs
 */
async function generateFluxBFL(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const provider = 'FLUX-BFL';
  const baseEndpoint = config.endpoint || IMAGE_GEN_ENDPOINTS['flux-bfl'];
  const endpoint = `${baseEndpoint}/${config.model}`;
  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  logInfo(provider, `Iniciando geração - modelo: ${config.model}, size: ${width}x${height}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Key': config.apiKey,
      },
      body: JSON.stringify({
        prompt,
        width,
        height,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMsg = extractErrorMessage(errorData, response.status, response.statusText);
      logError(provider, errorMsg, errorData);
      return { success: false, error: `${provider}: ${errorMsg}` };
    }

    const data = await response.json();

    // BFL retorna task_id para polling
    if (data.id) {
      logInfo(provider, `Task criada: ${data.id}, aguardando resultado...`);
      const resultEndpoint = `${baseEndpoint}/get_result?id=${data.id}`;
      const maxAttempts = 60;
      let attempts = 0;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const resultResponse = await fetch(resultEndpoint, {
          headers: { 'X-Key': config.apiKey },
        });

        if (!resultResponse.ok) {
          attempts++;
          continue;
        }

        const result = await resultResponse.json();

        if (result.status === 'Ready' && result.result?.sample) {
          logInfo(provider, 'Imagem gerada com sucesso');
          return { success: true, imageUrl: result.result.sample };
        } else if (result.status === 'Error') {
          const errorMsg = result.error || 'Erro na geração';
          logError(provider, errorMsg, result);
          return { success: false, error: `${provider}: ${errorMsg}` };
        }

        attempts++;
        if (attempts % 5 === 0) {
          logInfo(provider, `Aguardando... tentativa ${attempts}/${maxAttempts}, status: ${result.status}`);
        }
      }

      logError(provider, 'Timeout na geração');
      return { success: false, error: `${provider}: Timeout na geração (2 minutos)` };
    }

    logError(provider, 'Resposta inválida - sem task_id', data);
    return { success: false, error: `${provider}: Resposta inválida da API - sem task_id` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    logError(provider, errorMsg, error);
    return { success: false, error: `${provider}: ${errorMsg}` };
  }
}

/**
 * Gera uma imagem usando Leonardo.ai
 */
async function generateLeonardo(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const endpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.leonardo;
  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  try {
    // Criar geração
    const createResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        modelId: config.model,
        width,
        height,
        num_images: 1,
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json().catch(() => ({ error: createResponse.statusText }));
      return { success: false, error: error.error || `Erro ${createResponse.status}` };
    }

    const createData = await createResponse.json();
    const generationId = createData.sdGenerationJob?.generationId;

    if (!generationId) {
      return { success: false, error: 'ID de geração não recebido' };
    }

    // Poll para resultado
    const statusEndpoint = `${endpoint}/${generationId}`;
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await fetch(statusEndpoint, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });

      if (!statusResponse.ok) continue;

      const result = await statusResponse.json();

      if (result.generations_by_pk?.status === 'COMPLETE') {
        const imageUrl = result.generations_by_pk.generated_images?.[0]?.url;
        if (imageUrl) {
          return { success: true, imageUrl };
        }
      } else if (result.generations_by_pk?.status === 'FAILED') {
        return { success: false, error: 'Geração falhou' };
      }

      attempts++;
    }

    return { success: false, error: 'Timeout na geração' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Gera uma imagem usando Ideogram
 */
async function generateIdeogram(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const endpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.ideogram;

  // Ideogram usa aspect_ratio como string
  const aspectRatio = options.aspectRatio === '16:9' ? 'ASPECT_16_9'
    : options.aspectRatio === '9:16' ? 'ASPECT_9_16'
    : 'ASPECT_1_1';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': config.apiKey,
      },
      body: JSON.stringify({
        image_request: {
          prompt,
          model: config.model,
          aspect_ratio: aspectRatio,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      return { success: false, error: error.message || `Erro ${response.status}` };
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (imageUrl) {
      return { success: true, imageUrl };
    }

    return { success: false, error: 'Resposta inválida da API' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Gera uma imagem usando Google Imagen / Gemini
 * Suporta tanto Imagen (imagen-3.0-*) quanto Nano Banana (nano-banana*)
 */
async function generateGoogle(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const baseEndpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.google;
  const isNanoBanana = config.model.startsWith('nano-banana');
  const isGemini = config.model.startsWith('gemini');

  // Google Imagen usa aspect ratio
  const aspectRatio = options.aspectRatio === '16:9' ? '16:9'
    : options.aspectRatio === '9:16' ? '9:16'
    : '1:1';

  try {
    // Nano Banana / Gemini usam a API generateContent com responseModalities
    if (isNanoBanana || isGemini) {
      // Mapeamento de nomes amigáveis para IDs reais do modelo
      let modelId = config.model;
      if (config.model === 'nano-banana') {
        modelId = 'gemini-2.0-flash-exp-image-generation';
      } else if (config.model === 'nano-banana-pro') {
        modelId = 'gemini-2.0-flash-exp-image-generation'; // Usar o mesmo por enquanto
      }

      const endpoint = `${baseEndpoint}/${modelId}:generateContent?key=${config.apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            responseMimeType: 'text/plain',
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
        const errorMessage = error.error?.message || error.message || `Erro ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const data = await response.json();

      // Procura a imagem na resposta do Gemini
      const candidates = data.candidates || [];
      for (const candidate of candidates) {
        const parts = candidate.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            return { success: true, imageBase64: part.inlineData.data };
          }
        }
      }

      // Se não encontrou imagem, pode ser que o modelo não suporte geração de imagem
      const textResponse = candidates[0]?.content?.parts?.[0]?.text;
      if (textResponse) {
        return { success: false, error: `Modelo retornou texto em vez de imagem: ${textResponse.substring(0, 100)}...` };
      }

      return { success: false, error: 'Resposta inválida da API - nenhuma imagem gerada' };
    }

    // Imagen tradicional (imagen-3.0-*)
    const endpoint = `${baseEndpoint}/${config.model}:predict?key=${config.apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      return { success: false, error: error.error?.message || `Erro ${response.status}` };
    }

    const data = await response.json();
    const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;

    if (imageBase64) {
      return { success: true, imageBase64 };
    }

    return { success: false, error: 'Resposta inválida da API' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Gera uma imagem usando endpoint customizado
 */
async function generateCustom(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  if (!config.endpoint) {
    return { success: false, error: 'Endpoint não configurado' };
  }

  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        model: config.model,
        width,
        height,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      return { success: false, error: error.error || `Erro ${response.status}` };
    }

    const data = await response.json();

    // Tenta diferentes formatos de resposta comuns
    if (data.data?.[0]?.b64_json) {
      return { success: true, imageBase64: data.data[0].b64_json };
    } else if (data.data?.[0]?.url) {
      return { success: true, imageUrl: data.data[0].url };
    } else if (data.images?.[0]) {
      return { success: true, imageBase64: data.images[0] };
    } else if (data.output?.[0]) {
      return { success: true, imageUrl: data.output[0] };
    }

    return { success: false, error: 'Formato de resposta não reconhecido' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Gera uma imagem usando Recraft V3
 */
async function generateRecraft(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const endpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.recraft;
  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        model: config.model,
        size: `${width}x${height}`,
        n: 1,
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      return { success: false, error: error.error?.message || `Erro ${response.status}` };
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;

    if (imageUrl) {
      return { success: true, imageUrl };
    }

    return { success: false, error: 'Resposta inválida da API' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Gera uma imagem usando Midjourney (via APIs terceiros como midapi.ai)
 */
async function generateMidjourney(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const endpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.midjourney;

  // Midjourney usa aspect ratio como string
  const aspectRatio = options.aspectRatio === '16:9' ? '16:9'
    : options.aspectRatio === '9:16' ? '9:16'
    : '1:1';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectRatio,
        process_mode: 'fast',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      return { success: false, error: error.message || `Erro ${response.status}` };
    }

    const data = await response.json();

    // Midjourney via API terceiros pode retornar task_id para polling
    if (data.task_id) {
      const statusEndpoint = endpoint.replace('/imagine', '/task') + `/${data.task_id}`;
      const maxAttempts = 120; // Midjourney pode demorar
      let attempts = 0;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 3000));

        const statusResponse = await fetch(statusEndpoint, {
          headers: { 'Authorization': `Bearer ${config.apiKey}` },
        });

        if (!statusResponse.ok) continue;

        const result = await statusResponse.json();

        if (result.status === 'finished' && result.task_result?.image_url) {
          return { success: true, imageUrl: result.task_result.image_url };
        } else if (result.status === 'failed') {
          return { success: false, error: result.error || 'Geração falhou' };
        }

        attempts++;
      }

      return { success: false, error: 'Timeout na geração' };
    }

    // Se retornar imagem diretamente
    if (data.image_url) {
      return { success: true, imageUrl: data.image_url };
    }

    return { success: false, error: 'Resposta inválida da API' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Gera uma imagem usando FAL.AI (agregador - suporta múltiplos modelos)
 */
async function generateFal(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const baseEndpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.fal;
  // FAL.AI usa formato: https://queue.fal.run/{model}
  const modelPath = config.model.startsWith('fal-ai/') ? config.model : config.model;
  const endpoint = `${baseEndpoint}/${modelPath}`;
  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${config.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        image_size: { width, height },
        num_images: 1,
        sync_mode: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      return { success: false, error: error.detail || `Erro ${response.status}` };
    }

    const data = await response.json();
    const imageUrl = data.images?.[0]?.url;

    if (imageUrl) {
      return { success: true, imageUrl };
    }

    return { success: false, error: 'Resposta inválida da API' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Gera uma imagem usando Replicate (agregador - suporta múltiplos modelos)
 */
async function generateReplicateAggregator(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions
): Promise<ImageGenResult> {
  const endpoint = config.endpoint || IMAGE_GEN_ENDPOINTS.replicate;
  const { width, height } = options.width && options.height
    ? { width: options.width, height: options.height }
    : aspectRatioToDimensions(options.aspectRatio || '16:9');

  try {
    // Replicate usa modelo async - primeiro cria a prediction
    const createResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: {
          prompt,
          width,
          height,
          num_outputs: 1,
          output_format: 'png',
        },
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json().catch(() => ({ detail: createResponse.statusText }));
      return { success: false, error: error.detail || `Erro ${createResponse.status}` };
    }

    const prediction = await createResponse.json();

    // Poll para resultado
    let result = prediction;
    const maxAttempts = 60;
    let attempts = 0;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await fetch(result.urls.get, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });

      if (!statusResponse.ok) {
        return { success: false, error: `Erro ao verificar status: ${statusResponse.status}` };
      }

      result = await statusResponse.json();
      attempts++;
    }

    if (result.status === 'succeeded' && result.output?.[0]) {
      return { success: true, imageUrl: result.output[0] };
    }

    return { success: false, error: result.error || 'Timeout ou falha na geração' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

/**
 * Converte Blob para base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove o prefixo data:image/...;base64,
      resolve(base64.split(',')[1] || base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Converte URL de imagem para base64
 */
export async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return blobToBase64(blob);
}

/**
 * Gera uma única imagem usando o provider configurado
 */
export async function generateImage(
  prompt: string,
  config: ImageGenApiConfig,
  options: ImageGenOptions = {}
): Promise<ImageGenResult> {
  // Validação inicial
  logInfo('generateImage', '=== Iniciando geração de imagem ===');
  logInfo('generateImage', `Provider: ${config.provider}`);
  logInfo('generateImage', `Modelo: ${config.model}`);
  logInfo('generateImage', `API Key: ${config.apiKey ? `presente (${config.apiKey.length} chars)` : 'AUSENTE'}`);
  logInfo('generateImage', `Endpoint: ${config.endpoint || 'padrão'}`);
  logInfo('generateImage', `Options:`, options);
  logInfo('generateImage', `Prompt: ${prompt.substring(0, 100)}...`);

  // Validações
  if (!config.provider) {
    const error = 'Provider não configurado. Vá em Configurações > APIs e selecione um provider.';
    logError('generateImage', error);
    return { success: false, error };
  }

  if (!config.apiKey) {
    const error = `API Key não configurada para ${config.provider}. Vá em Configurações > APIs e insira sua chave.`;
    logError('generateImage', error);
    return { success: false, error };
  }

  if (!config.model) {
    const error = `Modelo não selecionado para ${config.provider}. Vá em Configurações > APIs e selecione um modelo.`;
    logError('generateImage', error);
    return { success: false, error };
  }

  if (!prompt || prompt.trim().length === 0) {
    const error = 'Prompt vazio. Forneça uma descrição para a imagem.';
    logError('generateImage', error);
    return { success: false, error };
  }

  const generators: Record<ImageGenProvider, typeof generateOpenAI> = {
    openai: generateOpenAI,
    google: generateGoogle,
    'flux-bfl': generateFluxBFL,
    'flux-replicate': generateFluxReplicate,
    'flux-fal': generateFluxFal,
    recraft: generateRecraft,
    ideogram: generateIdeogram,
    stability: generateStability,
    leonardo: generateLeonardo,
    midjourney: generateMidjourney,
    fal: generateFal,
    replicate: generateReplicateAggregator,
    custom: generateCustom,
  };

  const generator = generators[config.provider];
  if (!generator) {
    const error = `Provider não suportado: ${config.provider}. Providers disponíveis: ${Object.keys(generators).join(', ')}`;
    logError('generateImage', error);
    return { success: false, error };
  }

  return generator(prompt, config, options);
}

/**
 * Gera múltiplas imagens em sequência com callback de progresso
 */
export async function generateImages(
  prompts: string[],
  config: ImageGenApiConfig,
  onProgress: (progress: ImageGenProgress) => void,
  options: ImageGenOptions = {}
): Promise<ImageGenResult[]> {
  const results: ImageGenResult[] = [];
  const total = prompts.length;

  onProgress({ current: 0, total, status: 'generating', message: 'Iniciando geração...' });

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];

    onProgress({
      current: i + 1,
      total,
      status: 'generating',
      message: `Gerando imagem ${i + 1} de ${total}...`,
    });

    const result = await generateImage(prompt, config, options);
    results.push(result);

    if (!result.success) {
      onProgress({
        current: i + 1,
        total,
        status: 'error',
        message: `Erro na imagem ${i + 1}: ${result.error}`,
      });
    }
  }

  onProgress({
    current: total,
    total,
    status: 'completed',
    message: `Geração concluída: ${results.filter(r => r.success).length}/${total} imagens`,
  });

  return results;
}
