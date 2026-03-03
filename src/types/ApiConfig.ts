/**
 * Provedores de API de visão suportados
 */
export type VisionProvider =
  | 'openai'              // OpenAI GPT-4o, GPT-4 Turbo
  | 'anthropic'           // Claude 3.5/4 Sonnet, Opus, Haiku
  | 'google'              // Gemini 3 Flash/Pro via AI Studio
  | 'google-cloud-vision' // Google Cloud Vision API (Object Detection + OCR)
  | 'openrouter'          // OpenRouter (acesso a múltiplos modelos)
  | 'zhipu'               // ZhipuAI GLM-4V
  | 'groq'                // Groq (Llama Vision)
  | 'together'            // Together AI
  | 'fireworks'           // Fireworks AI
  | 'omniparser'          // Microsoft OmniParser V2 (local/API)
  | 'sam'                 // Segment Anything Model (local/API)
  | 'replicate'           // Replicate (SAM, OmniParser, etc.)
  | 'custom';             // Endpoint customizado

/**
 * Provedores de API de geração de prompts suportados
 */
export type PromptGenProvider =
  | 'openai'      // OpenAI GPT-5/4
  | 'anthropic'   // Claude 4.5/4 Sonnet, Opus, Haiku
  | 'google'      // Gemini 3/2.5 via AI Studio
  | 'openrouter'; // OpenRouter (acesso a múltiplos modelos)

/**
 * Provedores de API de geração de imagem suportados
 * Atualizado: Fevereiro 2026
 */
export type ImageGenProvider =
  | 'openai'           // GPT Image 1.5
  | 'google'           // Nano Banana Pro (Gemini Image)
  | 'flux-bfl'         // FLUX 2 via Black Forest Labs (API oficial)
  | 'flux-replicate'   // FLUX via Replicate
  | 'flux-fal'         // FLUX via FAL.AI (mais barato)
  | 'recraft'          // Recraft V3 (#1 HuggingFace)
  | 'ideogram'         // Ideogram 3.0 (melhor texto)
  | 'stability'        // Stable Diffusion 3.5
  | 'leonardo'         // Leonardo Phoenix
  | 'midjourney'       // Midjourney v7 (via API terceiros)
  | 'fal'              // FAL.AI (agregador - múltiplos modelos)
  | 'replicate'        // Replicate (agregador - múltiplos modelos)
  | 'custom';          // Endpoint customizado

/**
 * Configuração de uma API de visão
 */
export interface VisionApiConfig {
  /** Provedor da API */
  provider: VisionProvider;
  /** Chave da API */
  apiKey: string;
  /** Modelo a ser usado (ex: 'gpt-4-vision-preview', 'glm-4v', 'claude-3-opus') */
  model?: string;
  /** Endpoint customizado (para providers 'custom') */
  endpoint?: string;
  /** Se está habilitado */
  enabled: boolean;
}

/**
 * Configuração de uma API de geração de imagem
 */
export interface ImageGenApiConfig {
  /** Provedor da API */
  provider: ImageGenProvider;
  /** Chave da API */
  apiKey: string;
  /** Modelo a ser usado */
  model: string;
  /** Endpoint customizado (para providers 'custom') */
  endpoint?: string;
  /** Se está habilitado */
  enabled: boolean;
}

/**
 * Provedores de transcrição de áudio (speech-to-text)
 */
export type TranscriptionProvider = 'openai' | 'groq';

/**
 * Configuração da API de transcrição de áudio (Whisper / Groq)
 */
export interface WhisperApiConfig {
  /** Provedor da transcrição */
  provider: TranscriptionProvider;
  /** Chave da API (OpenAI ou Groq, conforme provedor) */
  apiKey: string;
  /** Modelo a ser usado (ex: 'whisper-1', 'whisper-large-v3-turbo') */
  model?: string;
  /** Idioma do áudio (ISO-639-1, ex: 'pt' para português) */
  language?: string;
  /** Se está habilitado */
  enabled: boolean;
}

/**
 * Configuração da API de Geração de Prompts
 */
export interface PromptGenApiConfig {
  /** Provedor da API */
  provider: PromptGenProvider;
  /** Chave da API */
  apiKey: string;
  /** Modelo a ser usado */
  model: string;
  /** Se está habilitado */
  enabled: boolean;
}

/**
 * Chaves de API centralizadas por provedor.
 * Quando o usuário troca de provedor em qualquer seção,
 * a chave correspondente é preenchida automaticamente.
 */
export interface ProviderKeys {
  [provider: string]: string;
}

/**
 * Configuração completa de APIs
 */
export interface ApiConfig {
  /** Configuração da API de visão */
  vision: VisionApiConfig;
  /** Configuração da API de geração de imagem */
  imageGeneration?: ImageGenApiConfig;
  /** Configuração da API Whisper para transcrição */
  whisper: WhisperApiConfig;
  /** Configuração da API de geração de prompts */
  promptGen?: PromptGenApiConfig;
  /** Chaves de API centralizadas por provedor */
  providerKeys?: ProviderKeys;
}

/**
 * Modelos disponíveis por provedor de visão
 * Atualizado: Fevereiro 2026
 */
export const VISION_MODELS: Record<VisionProvider, { id: string; name: string }[]> = {
  openai: [
    // GPT-5.2 Series (Mais recente - Dez 2025)
    { id: 'gpt-5.2-thinking', name: 'GPT-5.2 Thinking (Melhor Vision - 86.3% ScreenSpot)' },
    { id: 'gpt-5.2', name: 'GPT-5.2 (Recomendado)' },
    // GPT-5 Series
    { id: 'gpt-5.1', name: 'GPT-5.1' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini (Custo-benefício)' },
    // GPT-4 Series (Legacy)
    { id: 'gpt-4o', name: 'GPT-4o (Legacy)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Legacy - Mais barato)' },
  ],
  anthropic: [
    // Claude 4.5 Series (Mais recente - Nov 2025)
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5 (Mais potente)' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (Recomendado - 1M context)' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (Mais rápido)' },
    // Claude 4 Series
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    // Claude 3.5 Series (Legacy)
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Legacy)' },
  ],
  google: [
    // Gemini 3 Series (Mais recente - Jan 2026)
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview (Mais potente)' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview (Recomendado)' },
    // Gemini 2.5 Series (Estável)
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Thinking model)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Estável)' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite (Custo-benefício)' },
  ],
  'google-cloud-vision': [
    { id: 'builtin', name: 'Cloud Vision API (Object Localization + OCR)' },
  ],
  openrouter: [
    // === MODELOS PAGOS ===
    // OpenAI via OpenRouter
    { id: 'openai/gpt-5.2-thinking', name: 'GPT-5.2 Thinking (Melhor Vision)' },
    { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
    { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini (Custo-benefício)' },
    // Anthropic via OpenRouter
    { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5 (Mais potente)' },
    { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (Recomendado)' },
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5 (Rápido)' },
    // Google via OpenRouter
    { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
    { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    // Meta Llama 4 Vision (Mais recente - Abr 2025)
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick (Melhor multimodal)' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout (10M context)' },
    // Qwen Vision
    { id: 'qwen/qwen2.5-vl-72b-instruct', name: 'Qwen 2.5 VL 72B' },
    // Pixtral (Mistral Vision)
    { id: 'mistralai/pixtral-large-2411', name: 'Pixtral Large' },
    // === MODELOS GRATUITOS ===
    { id: 'qwen/qwen2.5-vl-72b-instruct:free', name: '🆓 Qwen 2.5 VL 72B (Grátis)' },
    { id: 'qwen/qwen2.5-vl-32b-instruct:free', name: '🆓 Qwen 2.5 VL 32B (Grátis)' },
    { id: 'google/gemma-3-27b-it:free', name: '🆓 Gemma 3 27B (Grátis)' },
    { id: 'google/gemma-3-12b-it:free', name: '🆓 Gemma 3 12B (Grátis)' },
    { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: '🆓 Llama 3.2 11B Vision (Grátis)' },
    { id: 'moonshotai/kimi-vl-a3b-thinking:free', name: '🆓 Kimi VL Thinking (Grátis)' },
    { id: 'google/gemini-2.0-flash-exp:free', name: '🆓 Gemini 2.0 Flash Exp (Grátis)' },
  ],
  zhipu: [
    { id: 'glm-4.6v', name: 'GLM-4.6V (Recomendado)' },
    { id: 'glm-4v-plus', name: 'GLM-4V Plus' },
    { id: 'glm-4v', name: 'GLM-4V' },
  ],
  groq: [
    // Llama 4 (Mais recente - ultra rápido)
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout (460 tok/s - Recomendado)' },
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick (Mais potente)' },
    // Llama 3.2 Vision
    { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision' },
    { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision' },
  ],
  together: [
    // Llama 4
    { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-Turbo', name: 'Llama 4 Maverick Turbo' },
    { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct-Turbo', name: 'Llama 4 Scout Turbo' },
    // Llama 3.2 Vision
    { id: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo', name: 'Llama 3.2 90B Vision Turbo' },
    { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo', name: 'Llama 3.2 11B Vision Turbo' },
    { id: 'Qwen/Qwen2.5-VL-72B-Instruct', name: 'Qwen 2.5 VL 72B' },
  ],
  fireworks: [
    // Llama 4
    { id: 'accounts/fireworks/models/llama-4-maverick-instruct', name: 'Llama 4 Maverick' },
    { id: 'accounts/fireworks/models/llama-4-scout-instruct', name: 'Llama 4 Scout' },
    // Llama 3.2 Vision
    { id: 'accounts/fireworks/models/llama-v3p2-90b-vision-instruct', name: 'Llama 3.2 90B Vision' },
    { id: 'accounts/fireworks/models/llama-v3p2-11b-vision-instruct', name: 'Llama 3.2 11B Vision' },
    { id: 'accounts/fireworks/models/phi-3-vision-128k-instruct', name: 'Phi-3 Vision 128K' },
  ],
  omniparser: [
    { id: 'omniparser-v2', name: 'OmniParser V2 (Recomendado - UI Detection)' },
    { id: 'omniparser-v1.5', name: 'OmniParser V1.5' },
  ],
  sam: [
    { id: 'sam-2.1-large', name: 'SAM 2.1 Large (Recomendado)' },
    { id: 'sam-2.1-base-plus', name: 'SAM 2.1 Base Plus' },
    { id: 'sam-2.1-small', name: 'SAM 2.1 Small (Mais rápido)' },
    { id: 'sam-vit-huge', name: 'SAM ViT-Huge (Legacy)' },
    { id: 'sam-vit-large', name: 'SAM ViT-Large (Legacy)' },
  ],
  replicate: [
    { id: 'microsoft/omniparser-v2', name: 'OmniParser V2 via Replicate' },
    { id: 'meta/sam-2', name: 'SAM 2 via Replicate' },
    { id: 'adirik/grounding-dino', name: 'Grounding DINO (Object Detection)' },
    { id: 'salesforce/blip-2', name: 'BLIP-2 (Image Captioning)' },
  ],
  custom: [],
};

/**
 * Endpoints padrão por provedor
 */
export const VISION_ENDPOINTS: Record<VisionProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  'google-cloud-vision': 'https://vision.googleapis.com/v1/images:annotate',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  zhipu: 'https://api.z.ai/api/paas/v4/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  together: 'https://api.together.xyz/v1/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  omniparser: 'http://localhost:8000/parse',  // Local por padrão, pode ser customizado
  sam: 'http://localhost:8001/segment',       // Local por padrão, pode ser customizado
  replicate: 'https://api.replicate.com/v1/predictions',
  custom: '',
};

/**
 * Nomes amigáveis dos provedores de visão
 */
export const VISION_PROVIDER_NAMES: Record<VisionProvider, string> = {
  openai: 'OpenAI (GPT-4o Vision)',
  anthropic: 'Anthropic (Claude Vision)',
  google: 'Google AI (Gemini)',
  'google-cloud-vision': 'Google Cloud Vision API',
  openrouter: 'OpenRouter (Multi-provider)',
  zhipu: 'ZhipuAI (GLM-4V)',
  groq: 'Groq (Llama Vision)',
  together: 'Together AI',
  fireworks: 'Fireworks AI',
  omniparser: 'OmniParser V2 (UI Detection)',
  sam: 'SAM (Segment Anything)',
  replicate: 'Replicate',
  custom: 'Endpoint Customizado',
};

/**
 * Modelos disponíveis por provedor de transcrição de áudio
 * Atualizado: Fevereiro 2026
 */
export const TRANSCRIPTION_MODELS: Record<TranscriptionProvider, { id: string; name: string }[]> = {
  openai: [
    { id: 'whisper-1', name: 'Whisper-1 (Padrão OpenAI)' },
  ],
  groq: [
    { id: 'whisper-large-v3-turbo', name: 'Whisper Large V3 Turbo (Recomendado - 216x tempo real)' },
    { id: 'whisper-large-v3', name: 'Whisper Large V3 (Mais preciso - 189x tempo real)' },
    { id: 'distil-whisper-large-v3-en', name: 'Distil Whisper Large V3 (Somente inglês - Mais rápido)' },
  ],
};

/**
 * Nomes amigáveis dos provedores de transcrição
 */
export const TRANSCRIPTION_PROVIDER_NAMES: Record<TranscriptionProvider, string> = {
  openai: 'OpenAI Whisper',
  groq: 'Groq (Ultra rápido - 216x)',
};

/**
 * Endpoints por provedor de transcrição
 */
export const TRANSCRIPTION_ENDPOINTS: Record<TranscriptionProvider, string> = {
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
};

/**
 * Modelos disponíveis por provedor de geração de prompts
 * Atualizado: Fevereiro 2026
 * Fontes: platform.openai.com, platform.claude.com, ai.google.dev, openrouter.ai
 */
export const PROMPT_GEN_MODELS: Record<PromptGenProvider, { id: string; name: string }[]> = {
  // === OpenAI (Fev 2026) ===
  openai: [
    // GPT-5.2 Series (Atual - Fev 2026)
    { id: 'gpt-5.2', name: 'GPT-5.2 Thinking (Flagship - $1.75/$14 por 1M)' },
    { id: 'gpt-5.2-chat-latest', name: 'GPT-5.2 Instant (Rápido)' },
    { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro (Máxima capacidade)' },
    // GPT-5 Series
    { id: 'gpt-5', name: 'GPT-5 (Estável - Ago 2025)' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini (Custo-benefício)' },
    // Legacy (Retiring Feb 13, 2026)
    { id: 'gpt-4o', name: 'GPT-4o (Legacy - Retiring 13/02/2026)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Legacy)' },
  ],
  // === Anthropic (Fev 2026) ===
  anthropic: [
    // Claude 4.6 (Mais recente - 5 Fev 2026)
    { id: 'claude-opus-4-6-20260205', name: 'Claude Opus 4.6 (Mais recente - $5/$25 por 1M)' },
    // Claude 4.5 Series
    { id: 'claude-sonnet-4-5-20260115', name: 'Claude Sonnet 4.5 (Recomendado - $3/$15 por 1M)' },
    { id: 'claude-opus-4-5-20251218', name: 'Claude Opus 4.5 (Potente - $5/$25 por 1M)' },
    { id: 'claude-haiku-4-5-20251218', name: 'Claude Haiku 4.5 (Rápido - $1/$5 por 1M)' },
    // Claude 4 Series
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (Estável)' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4 (Estável)' },
  ],
  // === Google (Fev 2026) ===
  google: [
    // Gemini 3 Series (Atual)
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Reasoning-first - 1M context)' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Recomendado - Rápido e barato)' },
    { id: 'gemini-3-deep-think', name: 'Gemini 3 Deep Think (Máximo reasoning)' },
    // Gemini 2.5 Series (Estável)
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Estável)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Custo-benefício)' },
    // Legacy (Retiring Mar 31, 2026)
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Legacy - Retiring 31/03/2026)' },
  ],
  // === OpenRouter (Multi-provider - Fev 2026) ===
  openrouter: [
    // === FLAGSHIP (Máxima capacidade) ===
    { id: 'openai/gpt-5.2', name: 'GPT-5.2 Thinking ($1.75/$14)' },
    { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6 (Mais recente - $5/$25)' },
    { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro (1M context)' },
    // === RECOMENDADOS (Melhor custo-benefício) ===
    { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (Recomendado - $3/$15)' },
    { id: 'openai/gpt-5.2-chat-latest', name: 'GPT-5.2 Instant (Rápido)' },
    { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash (Recomendado - Rápido)' },
    // === CUSTO-BENEFÍCIO ===
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5 ($1/$5)' },
    { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' },
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'mistralai/mistral-large-2', name: 'Mistral Large 2' },
    // === META LLAMA 4 (Open Source) ===
    { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick (400B MoE - Multimodal)' },
    { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout (10M context!)' },
    // === CODING ===
    { id: 'openai/gpt-5.2-codex', name: 'GPT-5.2 Codex (Melhor código)' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Reasoning)' },
    { id: 'qwen/qwen3-coder', name: 'Qwen 3 Coder' },
    // === REASONING ===
    { id: 'google/gemini-3-deep-think', name: 'Gemini 3 Deep Think (93.8% GPQA)' },
    // === MODELOS GRATUITOS ===
    { id: 'google/gemma-3-27b-it:free', name: '🆓 Gemma 3 27B (Grátis)' },
    { id: 'meta-llama/llama-4-scout:free', name: '🆓 Llama 4 Scout (Grátis)' },
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: '🆓 Mistral Small 3.1 (Grátis)' },
    { id: 'qwen/qwen2.5-72b-instruct:free', name: '🆓 Qwen 2.5 72B (Grátis)' },
    { id: 'deepseek/deepseek-chat-v3:free', name: '🆓 DeepSeek V3 (Grátis)' },
    { id: 'openrouter/auto', name: '🆓 Auto (Seleciona melhor modelo grátis)' },
  ],
};

/**
 * Endpoints padrão por provedor de geração de prompts
 */
export const PROMPT_GEN_ENDPOINTS: Record<PromptGenProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

/**
 * Nomes amigáveis dos provedores de geração de prompts
 */
export const PROMPT_GEN_PROVIDER_NAMES: Record<PromptGenProvider, string> = {
  openai: 'OpenAI (GPT-5.2)',
  anthropic: 'Anthropic (Claude 4.6/4.5)',
  google: 'Google AI (Gemini 3)',
  openrouter: 'OpenRouter (Multi-provider) - Recomendado',
};

/**
 * Modelos disponíveis por provedor de geração de imagem
 * Atualizado: Fevereiro 2026
 * Fontes: pricepertoken.com, fal.ai, replicate.com, bfl.ai
 */
export const IMAGE_GEN_MODELS: Record<ImageGenProvider, { id: string; name: string }[]> = {
  // === OpenAI - GPT Image ===
  openai: [
    { id: 'gpt-image-1', name: 'GPT Image 1 (Recomendado - $0.04-0.12/img)' },
    { id: 'dall-e-3', name: 'DALL-E 3 (Legacy - $0.04-0.08/img)' },
    { id: 'dall-e-3-hd', name: 'DALL-E 3 HD (Legacy - $0.08-0.12/img)' },
  ],
  // === Google - Nano Banana / Gemini Image ===
  google: [
    { id: 'nano-banana-pro', name: 'Nano Banana Pro (Melhor edição - $0.15/img)' },
    { id: 'nano-banana', name: 'Nano Banana (Gemini 2.5 Flash - $0.039/img)' },
    { id: 'imagen-3.0-generate-002', name: 'Imagen 3.0 (Estável)' },
    { id: 'imagen-3.0-fast-generate-001', name: 'Imagen 3.0 Fast (Custo-benefício)' },
  ],
  // === FLUX 2 via Black Forest Labs (API oficial) ===
  'flux-bfl': [
    // FLUX 2 Series (Nov 2025 - 32B params)
    { id: 'flux-pro-1.1-ultra', name: 'FLUX 2 Pro Ultra (Mais potente - $0.06/img)' },
    { id: 'flux-pro-1.1', name: 'FLUX 2 Pro (Recomendado - $0.05/img)' },
    { id: 'flux-dev', name: 'FLUX 2 Dev (Custo-benefício - $0.025/img)' },
    { id: 'flux-schnell', name: 'FLUX 2 Schnell (Mais rápido - $0.003/img)' },
    // FLUX Kontext (Edição in-context - Mai 2025)
    { id: 'flux-kontext-max', name: 'FLUX Kontext Max (Melhor edição)' },
    { id: 'flux-kontext-pro', name: 'FLUX Kontext Pro (Edição rápida)' },
    // Controles avançados
    { id: 'flux-fill-pro', name: 'FLUX Fill Pro (Inpainting)' },
    { id: 'flux-canny-pro', name: 'FLUX Canny Pro (ControlNet)' },
    { id: 'flux-depth-pro', name: 'FLUX Depth Pro (ControlNet)' },
    { id: 'flux-redux-pro', name: 'FLUX Redux Pro (Variações)' },
  ],
  // === FLUX via Replicate ===
  'flux-replicate': [
    { id: 'black-forest-labs/flux-1.1-pro-ultra', name: 'FLUX 1.1 Pro Ultra (~$0.05/img)' },
    { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro (~$0.04/img)' },
    { id: 'black-forest-labs/flux-dev', name: 'FLUX Dev (~$0.025/img)' },
    { id: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell (~$0.003/img)' },
    { id: 'black-forest-labs/flux-kontext-pro', name: 'FLUX Kontext Pro (Edição)' },
    { id: 'black-forest-labs/flux-fill-pro', name: 'FLUX Fill Pro (Inpainting)' },
  ],
  // === FLUX via FAL.AI (30-50% mais barato) ===
  'flux-fal': [
    { id: 'fal-ai/flux-pro/v1.1-ultra', name: 'FLUX 1.1 Pro Ultra (~$0.035/img)' },
    { id: 'fal-ai/flux-pro/v1.1', name: 'FLUX 1.1 Pro (~$0.028/img)' },
    { id: 'fal-ai/flux/dev', name: 'FLUX Dev (~$0.018/img)' },
    { id: 'fal-ai/flux/schnell', name: 'FLUX Schnell (~$0.002/img)' },
    { id: 'fal-ai/flux-kontext/pro', name: 'FLUX Kontext Pro (Edição)' },
  ],
  // === Recraft V3 (#1 HuggingFace benchmark) ===
  recraft: [
    { id: 'recraft-v3', name: 'Recraft V3 (Recomendado - $0.04/img)' },
    { id: 'recraft-v3-svg', name: 'Recraft V3 SVG (Vetores - $0.08/img)' },
    { id: 'recraft-20b', name: 'Recraft 20B (Custo-benefício - $0.022/img)' },
    { id: 'recraft-20b-svg', name: 'Recraft 20B SVG (Vetores baratos - $0.044/img)' },
  ],
  // === Ideogram 3.0 (Melhor para texto) ===
  ideogram: [
    { id: 'V_3', name: 'Ideogram 3.0 (Mais potente)' },
    { id: 'V_3_TURBO', name: 'Ideogram 3.0 Turbo (Recomendado - Rápido)' },
    { id: 'V_2', name: 'Ideogram 2.0 (90% precisão texto)' },
    { id: 'V_2_TURBO', name: 'Ideogram 2.0 Turbo (Custo-benefício)' },
  ],
  // === Stability AI - Stable Diffusion 3.5 ===
  stability: [
    { id: 'sd3.5-large', name: 'SD 3.5 Large (Mais potente)' },
    { id: 'sd3.5-large-turbo', name: 'SD 3.5 Large Turbo (Recomendado - ~$0.003/img)' },
    { id: 'sd3.5-medium', name: 'SD 3.5 Medium (Custo-benefício)' },
    { id: 'stable-image-ultra', name: 'Stable Image Ultra (Photorealismo)' },
    { id: 'stable-image-core', name: 'Stable Image Core' },
  ],
  // === Leonardo.ai ===
  leonardo: [
    { id: 'phoenix', name: 'Leonardo Phoenix (Recomendado - Texto nativo)' },
    { id: 'kino-xl', name: 'Leonardo Kino XL (Cinematográfico)' },
    { id: 'lightning-xl', name: 'Leonardo Lightning XL (Mais rápido)' },
    { id: 'diffusion-xl', name: 'Leonardo Diffusion XL (Versátil)' },
    { id: 'anime-xl', name: 'Leonardo Anime XL (Anime/Mangá)' },
  ],
  // === Midjourney v7 (via APIs terceiros) ===
  midjourney: [
    { id: 'midjourney-v7', name: 'Midjourney v7 (Mais potente - ~$0.015/img)' },
    { id: 'midjourney-v6.1', name: 'Midjourney v6.1 (Estável)' },
    { id: 'niji-v6', name: 'Niji v6 (Anime/Ilustração)' },
  ],
  // === FAL.AI - Agregador (600+ modelos) ===
  fal: [
    { id: 'fal-ai/flux-pro/v1.1-ultra', name: 'FLUX 1.1 Pro Ultra' },
    { id: 'fal-ai/recraft-v3', name: 'Recraft V3' },
    { id: 'fal-ai/ideogram/v2/turbo', name: 'Ideogram 2.0 Turbo' },
    { id: 'fal-ai/stable-diffusion-v35-large', name: 'SD 3.5 Large' },
    { id: 'fal-ai/nano-banana-pro', name: 'Nano Banana Pro' },
    { id: 'fal-ai/nano-banana', name: 'Nano Banana' },
  ],
  // === Replicate - Agregador (200+ modelos) ===
  replicate: [
    { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro' },
    { id: 'recraft-ai/recraft-v3', name: 'Recraft V3' },
    { id: 'ideogram-ai/ideogram-v2-turbo', name: 'Ideogram 2.0 Turbo' },
    { id: 'stability-ai/sdxl', name: 'SDXL' },
    { id: 'lucataco/sdxl-lightning-4step', name: 'SDXL Lightning (Ultra rápido)' },
  ],
  custom: [],
};

/**
 * Endpoints padrão por provedor de geração de imagem
 */
export const IMAGE_GEN_ENDPOINTS: Record<ImageGenProvider, string> = {
  openai: 'https://api.openai.com/v1/images/generations',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  'flux-bfl': 'https://api.bfl.ai/v1',
  'flux-replicate': 'https://api.replicate.com/v1/predictions',
  'flux-fal': 'https://queue.fal.run',
  recraft: 'https://external.api.recraft.ai/v1/images/generations',
  ideogram: 'https://api.ideogram.ai/generate',
  stability: 'https://api.stability.ai/v2beta/stable-image/generate/sd3',
  leonardo: 'https://cloud.leonardo.ai/api/rest/v1/generations',
  midjourney: 'https://api.midapi.ai/mj/v2/imagine', // API terceiros
  fal: 'https://queue.fal.run',
  replicate: 'https://api.replicate.com/v1/predictions',
  custom: '',
};

/**
 * Nomes amigáveis dos provedores de geração de imagem
 */
export const IMAGE_GEN_PROVIDER_NAMES: Record<ImageGenProvider, string> = {
  openai: 'OpenAI (GPT Image 1)',
  google: 'Google (Nano Banana / Imagen)',
  'flux-bfl': 'FLUX 2 - Black Forest Labs (Oficial)',
  'flux-replicate': 'FLUX via Replicate',
  'flux-fal': 'FLUX via FAL.AI (Mais barato)',
  recraft: 'Recraft V3 (#1 HuggingFace)',
  ideogram: 'Ideogram 3.0 (Melhor para texto)',
  stability: 'Stability AI (SD 3.5)',
  leonardo: 'Leonardo.ai (Phoenix)',
  midjourney: 'Midjourney v7 (API terceiros)',
  fal: 'FAL.AI (Agregador - 600+ modelos)',
  replicate: 'Replicate (Agregador - 200+ modelos)',
  custom: 'Endpoint Customizado',
};

/**
 * Configuração padrão de API
 */
export const DEFAULT_API_CONFIG: ApiConfig = {
  vision: {
    provider: 'zhipu',
    apiKey: '',
    model: 'glm-4.6v',
    enabled: false,
  },
  whisper: {
    provider: 'openai',
    apiKey: '',
    model: 'whisper-1',
    language: 'pt',
    enabled: false,
  },
  promptGen: {
    provider: 'openrouter',
    apiKey: '',
    model: 'anthropic/claude-sonnet-4.5',
    enabled: false,
  },
};

/**
 * Chave para armazenamento no localStorage
 */
export const API_CONFIG_STORAGE_KEY = 'automatizar-animacoes-api-config';

/**
 * Carrega a configuração de API do localStorage
 * Faz merge com os defaults para garantir que todos os campos existam
 */
export function loadApiConfig(): ApiConfig {
  try {
    const stored = localStorage.getItem(API_CONFIG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Faz merge profundo com defaults para garantir que campos novos existam
      return {
        vision: {
          ...DEFAULT_API_CONFIG.vision,
          ...parsed.vision,
        },
        whisper: {
          ...DEFAULT_API_CONFIG.whisper,
          ...parsed.whisper,
        },
        promptGen: {
          ...DEFAULT_API_CONFIG.promptGen,
          ...parsed.promptGen,
        },
        imageGeneration: parsed.imageGeneration,
        providerKeys: parsed.providerKeys || {},
      };
    }
  } catch (error) {
    console.error('Erro ao carregar configuração de API:', error);
  }
  return DEFAULT_API_CONFIG;
}

/**
 * Salva a configuração de API no localStorage
 */
export function saveApiConfig(config: ApiConfig): void {
  try {
    localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Erro ao salvar configuração de API:', error);
  }
}

/**
 * Verifica se a configuração de visão está válida para uso
 */
export function isVisionConfigValid(config: VisionApiConfig): boolean {
  return config.enabled && config.apiKey.length > 0 && (config.provider !== 'custom' || !!config.endpoint);
}

/**
 * Verifica se a configuração de geração de prompts está válida para uso
 */
export function isPromptGenConfigValid(config?: PromptGenApiConfig): boolean {
  return !!config && config.enabled && config.apiKey.length > 0 && config.model.length > 0;
}

/**
 * Verifica se a configuração de geração de imagem está válida para uso
 */
export function isImageGenConfigValid(config?: ImageGenApiConfig): boolean {
  return !!config && config.enabled && config.apiKey.length > 0 && config.model.length > 0 && (config.provider !== 'custom' || !!config.endpoint);
}

/**
 * Obtém a chave de API para um provedor a partir do mapa centralizado
 */
export function getProviderKey(config: ApiConfig, provider: string): string {
  return config.providerKeys?.[provider] || '';
}

/**
 * Define a chave de API para um provedor no mapa centralizado
 */
export function setProviderKey(config: ApiConfig, provider: string, apiKey: string): ApiConfig {
  return {
    ...config,
    providerKeys: {
      ...config.providerKeys,
      [provider]: apiKey,
    },
  };
}

/**
 * Sincroniza as chaves de cada seção para o mapa centralizado.
 * Chamado ao carregar config antiga que não tem providerKeys.
 */
export function syncProviderKeysFromConfig(config: ApiConfig): ApiConfig {
  const keys: ProviderKeys = { ...config.providerKeys };

  // Sincroniza chave de cada seção para o mapa (se não existir ainda)
  if (config.vision.apiKey && !keys[config.vision.provider]) {
    keys[config.vision.provider] = config.vision.apiKey;
  }
  if (config.whisper.apiKey) {
    const whisperProvider = config.whisper.provider || 'openai';
    if (!keys[whisperProvider]) {
      keys[whisperProvider] = config.whisper.apiKey;
    }
  }
  if (config.promptGen?.apiKey && config.promptGen.provider && !keys[config.promptGen.provider]) {
    keys[config.promptGen.provider] = config.promptGen.apiKey;
  }
  if (config.imageGeneration?.apiKey && config.imageGeneration.provider && !keys[config.imageGeneration.provider]) {
    keys[config.imageGeneration.provider] = config.imageGeneration.apiKey;
  }

  return { ...config, providerKeys: keys };
}

/**
 * Provedores que usam chave de API (para exibir na UI de chaves centralizadas).
 * Mapeia nome de provedor → URL onde obter a chave.
 */
export const PROVIDER_KEY_SOURCES: Record<string, { name: string; hint: string }> = {
  openai: { name: 'OpenAI', hint: 'platform.openai.com' },
  anthropic: { name: 'Anthropic', hint: 'console.anthropic.com' },
  google: { name: 'Google AI Studio', hint: 'aistudio.google.com' },
  'google-cloud-vision': { name: 'Google Cloud Vision', hint: 'console.cloud.google.com' },
  openrouter: { name: 'OpenRouter', hint: 'openrouter.ai/keys' },
  zhipu: { name: 'ZhipuAI', hint: 'open.bigmodel.cn' },
  groq: { name: 'Groq', hint: 'console.groq.com' },
  together: { name: 'Together AI', hint: 'api.together.xyz' },
  fireworks: { name: 'Fireworks AI', hint: 'fireworks.ai' },
  replicate: { name: 'Replicate', hint: 'replicate.com' },
  stability: { name: 'Stability AI', hint: 'platform.stability.ai' },
  'flux-bfl': { name: 'FLUX (BFL)', hint: 'bfl.ai' },
  'flux-replicate': { name: 'FLUX (Replicate)', hint: 'replicate.com' },
  'flux-fal': { name: 'FLUX (FAL)', hint: 'fal.ai' },
  recraft: { name: 'Recraft', hint: 'recraft.ai' },
  ideogram: { name: 'Ideogram', hint: 'ideogram.ai' },
  leonardo: { name: 'Leonardo AI', hint: 'leonardo.ai' },
  midjourney: { name: 'Midjourney', hint: 'midapi.ai / useapi.net' },
  fal: { name: 'FAL.AI', hint: 'fal.ai' },
};
