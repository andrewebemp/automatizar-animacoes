/**
 * AI Prompt Generator - Gera prompts para imagens usando IA (Claude/GPT/OpenRouter)
 *
 * Este módulo é responsável por:
 * 1. Dividir legendas do SRT em cenas baseado na duração configurada
 * 2. Chamar APIs de IA para gerar prompts de imagens para cada cena
 * 3. Formatar a saída para uso posterior
 */

import type { Subtitle } from '../types/Subtitle';

// ============================================================================
// TIPOS
// ============================================================================

/**
 * Configuração de elementos por cena
 */
export type ElementsPerScene = '2-4' | '4-8' | '8-12';

/**
 * Configuração de aspect ratio
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

/**
 * Configuração de duração das cenas
 */
export type SceneDuration = '15-30' | '25-50' | '40-60';

/**
 * Provedores de IA suportados para geração de prompts
 */
export type PromptProvider = 'openai' | 'openrouter' | 'zai';

/**
 * Configuração do prompt de estilo
 */
export interface PromptStyleConfig {
  /** Prompt de estilo/cabeçalho */
  stylePrompt: string;
  /** Visual Elements */
  visualElements: string;
  /** Composition Style */
  compositionStyle: string;
  /** Negative Prompts */
  negativePrompts: string;
}

/**
 * Configuração de cena
 */
export interface SceneConfig {
  /** Elementos por cena */
  elementsPerScene: ElementsPerScene;
  /** Aspect ratio */
  aspectRatio: AspectRatio;
  /** Duração das cenas */
  sceneDuration: SceneDuration;
}

/**
 * Configuração da IA
 */
export interface AIConfig {
  /** Provedor */
  provider: PromptProvider;
  /** Modelo */
  model: string;
  /** API Key */
  apiKey: string;
}

/**
 * Cena dividida a partir das legendas
 */
export interface DividedScene {
  /** Número da cena (1-indexed) */
  sceneNumber: number;
  /** Tempo de início em ms */
  startTime: number;
  /** Tempo de fim em ms */
  endTime: number;
  /** Duração em segundos */
  durationSeconds: number;
  /** Legendas incluídas nesta cena */
  subtitles: Subtitle[];
  /** Texto combinado das legendas */
  combinedText: string;
}

/**
 * Prompt gerado para uma cena
 */
export interface GeneratedScenePrompt {
  /** Número da cena */
  sceneNumber: number;
  /** Tempo de início em ms */
  startTime: number;
  /** Tempo de fim em ms */
  endTime: number;
  /** Texto da narração */
  narrationText: string;
  /** Elementos visuais sugeridos */
  visualElements: string[];
  /** Prompt completo para gerar a imagem */
  imagePrompt: string;
}

/**
 * Resultado da geração de prompts
 */
export interface PromptGenerationResult {
  success: boolean;
  scenes: GeneratedScenePrompt[];
  error?: string;
  /** Markdown formatado para exibição */
  formattedOutput?: string;
}

// ============================================================================
// CONSTANTES - VALORES PADRÃO
// ============================================================================

/**
 * Prompt de estilo padrão (baseado no Whiteboard Animation Agent)
 */
export const DEFAULT_STYLE_PROMPT = `Ilustração estilo animação de quadro branco, {dimensions} ({aspect_ratio}), fundo branco puro, estética de esboço desenhado à mão. O estilo artístico deve ser 'registro gráfico' ou 'pensamento visual' usando canetas de tinta preta com ponta fina para contornos e textos nítidos. Usar marcadores coloridos para sombreamento simples e destaques.`;

/**
 * Visual Elements padrão
 */
export const DEFAULT_VISUAL_ELEMENTS = `ELEMENTOS VISUAIS flutuando livremente pelo canvas em arranjo orgânico e natural - NÃO em grade, NÃO em sequência, SEM setas conectando elementos, SEM elementos na borda da imagem. Cada elemento autocontido e extraível. As imagens e textos devem cobrir pelo menos 70% da imagem considerando todos os elementos.`;

/**
 * Composition Style padrão
 */
export const DEFAULT_COMPOSITION_STYLE = `- Alguns elementos levemente inclinados ou angulados para dar dinamismo
- Espaçamento generoso entre os elementos
- SEM linhas ou colunas rígidas
- Linhas tremidas imperfeitas desenhadas à mão
- Combinação entre texto e imagens
- Todos os textos e rótulos em português brasileiro`;

/**
 * Negative Prompts padrão
 */
export const DEFAULT_NEGATIVE_PROMPTS = `layout em grade, estilo fluxograma, setas conectando elementos, arranjo sequencial da esquerda para direita, fotorrealista, renderização 3D, composição simétrica, mão desenhando, mão de artista, caneta, lápis, marcador, mão segurando caneta, dedos desenhando, mão de artista visível`;

/**
 * Modelos disponíveis por provedor
 */
export const PROMPT_MODELS: Record<PromptProvider, { id: string; name: string }[]> = {
  openai: [
    { id: 'gpt-5.2-20251211', name: 'GPT-5.2 (Mais recente)' },
    { id: 'gpt-5.1-20251113', name: 'GPT-5.1' },
    { id: 'gpt-5-mini-2025-08-07', name: 'GPT-5 Mini (Recomendado)' },
    { id: 'gpt-5-nano-2025-08-07', name: 'GPT-5 Nano' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  ],
  openrouter: [
    { id: 'anthropic/claude-4.5-opus-20251124', name: 'Claude Opus 4.5 (Mais potente)' },
    { id: 'anthropic/claude-4.5-sonnet-20250929', name: 'Claude Sonnet 4.5 (Recomendado)' },
    { id: 'anthropic/claude-4.5-haiku-20251001', name: 'Claude Haiku 4.5 (Mais rápido)' },
    { id: 'google/gemini-3-flash-preview-20251217', name: 'Gemini 3 Flash Preview' },
    { id: 'google/gemini-3-pro-preview-20251117', name: 'Gemini 3 Pro Preview' },
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'openai/gpt-5.2-20251211', name: 'GPT-5.2' },
    { id: 'openai/gpt-5-mini-2025-08-07', name: 'GPT-5 Mini' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
  ],
  zai: [
    { id: 'glm-4-plus', name: 'GLM-4 Plus (Recomendado)' },
    { id: 'glm-4-air', name: 'GLM-4 Air' },
    { id: 'glm-4-flash', name: 'GLM-4 Flash' },
  ],
};

/**
 * Endpoints por provedor
 */
export const PROMPT_ENDPOINTS: Record<PromptProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  zai: 'https://api.z.ai/api/paas/v4/chat/completions',
};

/**
 * Configuração padrão de cena
 */
export const DEFAULT_SCENE_CONFIG: SceneConfig = {
  elementsPerScene: '4-8',
  aspectRatio: '16:9',
  sceneDuration: '25-50',
};

/**
 * Configuração padrão de estilo
 */
export const DEFAULT_STYLE_CONFIG: PromptStyleConfig = {
  stylePrompt: DEFAULT_STYLE_PROMPT,
  visualElements: DEFAULT_VISUAL_ELEMENTS,
  compositionStyle: DEFAULT_COMPOSITION_STYLE,
  negativePrompts: DEFAULT_NEGATIVE_PROMPTS,
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Extrai min/max da duração configurada
 */
export function parseDurationRange(duration: SceneDuration): { min: number; max: number } {
  const [min, max] = duration.split('-').map(Number);
  return { min, max };
}

/**
 * Extrai min/max de elementos por cena
 */
export function parseElementsRange(elements: ElementsPerScene): { min: number; max: number } {
  const [min, max] = elements.split('-').map(Number);
  return { min, max };
}

/**
 * Obtém dimensões baseadas no aspect ratio
 */
export function getDimensions(aspectRatio: AspectRatio): { width: number; height: number; dimensionString: string } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1920, height: 1080, dimensionString: '1920x1080' };
    case '9:16':
      return { width: 1080, height: 1920, dimensionString: '1080x1920' };
    case '1:1':
      return { width: 1080, height: 1080, dimensionString: '1080x1080' };
    default:
      return { width: 1920, height: 1080, dimensionString: '1920x1080' };
  }
}

/**
 * Formata tempo em ms para string MM:SS
 */
export function formatTimeMMSS(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ============================================================================
// DIVISÃO DE CENAS
// ============================================================================

/**
 * Divide legendas em cenas baseado na configuração de duração
 */
export function divideIntoScenes(
  subtitles: Subtitle[],
  sceneDuration: SceneDuration
): DividedScene[] {
  if (!subtitles || subtitles.length === 0) {
    return [];
  }

  const { min: minSeconds, max: maxSeconds } = parseDurationRange(sceneDuration);
  const minDuration = minSeconds * 1000; // converter para ms
  const maxDuration = maxSeconds * 1000;
  const targetDuration = (minDuration + maxDuration) / 2;

  const scenes: DividedScene[] = [];
  let currentSceneSubtitles: Subtitle[] = [];
  let sceneStartTime: number | null = null;

  subtitles.forEach((subtitle, index) => {
    // Se é a primeira legenda da cena, marca o início
    if (sceneStartTime === null) {
      sceneStartTime = subtitle.startTime;
    }

    currentSceneSubtitles.push(subtitle);

    const currentDuration = subtitle.endTime - sceneStartTime;
    const isLastSubtitle = index === subtitles.length - 1;

    // Decide se deve criar nova cena
    const shouldSplit =
      currentDuration >= minDuration && (
        currentDuration >= targetDuration ||
        currentDuration >= maxDuration ||
        isLastSubtitle
      );

    if (shouldSplit) {
      // Cria a cena
      const scene: DividedScene = {
        sceneNumber: scenes.length + 1,
        startTime: sceneStartTime,
        endTime: subtitle.endTime,
        durationSeconds: (subtitle.endTime - sceneStartTime) / 1000,
        subtitles: [...currentSceneSubtitles],
        combinedText: currentSceneSubtitles.map(s => s.text).join(' '),
      };
      scenes.push(scene);

      // Reset para próxima cena
      currentSceneSubtitles = [];
      sceneStartTime = null;
    }
  });

  // Se sobrou legendas que não formaram cena (menor que minDuration), adiciona à última cena ou cria nova
  if (currentSceneSubtitles.length > 0 && sceneStartTime !== null) {
    const lastSubtitle = currentSceneSubtitles[currentSceneSubtitles.length - 1];

    if (scenes.length > 0) {
      // Adiciona à última cena existente
      const lastScene = scenes[scenes.length - 1];
      lastScene.subtitles.push(...currentSceneSubtitles);
      lastScene.endTime = lastSubtitle.endTime;
      lastScene.durationSeconds = (lastScene.endTime - lastScene.startTime) / 1000;
      lastScene.combinedText = lastScene.subtitles.map(s => s.text).join(' ');
    } else {
      // Cria nova cena mesmo que seja curta
      scenes.push({
        sceneNumber: 1,
        startTime: sceneStartTime,
        endTime: lastSubtitle.endTime,
        durationSeconds: (lastSubtitle.endTime - sceneStartTime) / 1000,
        subtitles: currentSceneSubtitles,
        combinedText: currentSceneSubtitles.map(s => s.text).join(' '),
      });
    }
  }

  return scenes;
}

// ============================================================================
// CHAMADA DE IA
// ============================================================================

/**
 * Cria o prompt de sistema para a IA
 */
function createSystemPrompt(
  styleConfig: PromptStyleConfig,
  sceneConfig: SceneConfig
): string {
  const { dimensionString } = getDimensions(sceneConfig.aspectRatio);
  const { min: minElements, max: maxElements } = parseElementsRange(sceneConfig.elementsPerScene);

  // Substitui placeholders no style prompt
  const styledPrompt = styleConfig.stylePrompt
    .replace('{dimensions}', dimensionString)
    .replace('{aspect_ratio}', sceneConfig.aspectRatio);

  return `Você é um especialista em criar prompts para geração de imagens de whiteboard animation.

Seu objetivo é analisar o texto de narração de cada cena e criar prompts detalhados para gerar imagens no estilo de whiteboard animation (animação de quadro branco).

ESTILO BASE:
${styledPrompt}

ELEMENTOS VISUAIS:
${styleConfig.visualElements}

ESTILO DE COMPOSIÇÃO:
${styleConfig.compositionStyle}

ELEMENTOS A EVITAR (Negative Prompts):
${styleConfig.negativePrompts}

REGRAS IMPORTANTES:
1. Cada cena deve ter entre ${minElements} e ${maxElements} elementos visuais distintos
2. Os elementos devem representar visualmente os conceitos chave da narração
3. Use texto em Português Brasileiro nos elementos visuais
4. Mantenha o estilo de desenho à mão com traços pretos em fundo branco
5. Cada prompt deve ser auto-contido e completo
6. Liste os elementos visuais sugeridos separadamente do prompt final

FORMATO DE RESPOSTA (JSON):
Para cada cena, responda EXATAMENTE neste formato JSON:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "visualElements": ["elemento 1", "elemento 2", "elemento 3"],
      "imagePrompt": "prompt completo para gerar a imagem..."
    }
  ]
}

Responda APENAS com o JSON, sem texto adicional antes ou depois.`;
}

/**
 * Cria o prompt de usuário com as cenas para processar
 */
function createUserPrompt(scenes: DividedScene[]): string {
  let prompt = `Analise as seguintes cenas e gere prompts de imagem para cada uma:\n\n`;

  scenes.forEach(scene => {
    prompt += `=== CENA ${scene.sceneNumber} ===\n`;
    prompt += `Tempo: ${formatTimeMMSS(scene.startTime)} - ${formatTimeMMSS(scene.endTime)} (${scene.durationSeconds.toFixed(1)}s)\n`;
    prompt += `Narração: "${scene.combinedText}"\n\n`;
  });

  prompt += `\nGere os prompts de imagem para todas as ${scenes.length} cenas no formato JSON especificado.`;

  return prompt;
}

/**
 * Chama a API de IA para gerar prompts
 */
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  aiConfig: AIConfig
): Promise<{ success: boolean; content?: string; error?: string }> {
  const endpoint = PROMPT_ENDPOINTS[aiConfig.provider];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Configura headers específicos por provedor
  switch (aiConfig.provider) {
    case 'openai':
      headers['Authorization'] = `Bearer ${aiConfig.apiKey}`;
      break;
    case 'openrouter':
      headers['Authorization'] = `Bearer ${aiConfig.apiKey}`;
      headers['HTTP-Referer'] = 'https://github.com/automatizar-animacoes';
      headers['X-Title'] = 'Automatizar Animações';
      break;
    case 'zai':
      headers['Authorization'] = `Bearer ${aiConfig.apiKey}`;
      break;
  }

  const body = {
    model: aiConfig.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Erro na API (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        success: false,
        error: 'Resposta da IA está vazia',
      };
    }

    return { success: true, content };
  } catch (error) {
    return {
      success: false,
      error: `Erro de conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
    };
  }
}

/**
 * Faz parse da resposta JSON da IA
 */
function parseAIResponse(
  content: string,
  originalScenes: DividedScene[]
): GeneratedScenePrompt[] {
  // Tenta extrair JSON da resposta (pode vir com texto antes/depois)
  let jsonContent = content;

  // Remove markdown code blocks se existirem
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  }

  // Tenta encontrar o objeto JSON
  const jsonStart = jsonContent.indexOf('{');
  const jsonEnd = jsonContent.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonContent);
    const aiScenes = parsed.scenes || parsed;

    return originalScenes.map((scene, index) => {
      const aiScene = aiScenes[index] || {};

      return {
        sceneNumber: scene.sceneNumber,
        startTime: scene.startTime,
        endTime: scene.endTime,
        narrationText: scene.combinedText,
        visualElements: aiScene.visualElements || [],
        imagePrompt: aiScene.imagePrompt || '',
      };
    });
  } catch (e) {
    console.error('Erro ao fazer parse da resposta da IA:', e);
    console.error('Conteúdo recebido:', content);
    throw new Error('Não foi possível interpretar a resposta da IA');
  }
}

// ============================================================================
// FORMATAÇÃO DE SAÍDA
// ============================================================================

/**
 * Formata a saída em Markdown para exibição
 */
export function formatOutputMarkdown(prompts: GeneratedScenePrompt[]): string {
  let output = `# Prompts para Whiteboard Animation\n\n`;
  output += `**Total de cenas:** ${prompts.length}\n\n`;
  output += `---\n\n`;

  prompts.forEach(prompt => {
    output += `## Cena ${prompt.sceneNumber}\n\n`;
    output += `**Tempo:** ${formatTimeMMSS(prompt.startTime)} - ${formatTimeMMSS(prompt.endTime)}\n\n`;
    output += `**Narração:**\n> ${prompt.narrationText}\n\n`;

    if (prompt.visualElements.length > 0) {
      output += `**Elementos Visuais:**\n`;
      prompt.visualElements.forEach(el => {
        output += `- ${el}\n`;
      });
      output += `\n`;
    }

    output += `**Prompt para Imagem:**\n\`\`\`\n${prompt.imagePrompt}\n\`\`\`\n\n`;
    output += `---\n\n`;
  });

  return output;
}

/**
 * Formata saída como texto simples para exportação
 */
export function formatOutputText(prompts: GeneratedScenePrompt[]): string {
  let output = `PROMPTS PARA WHITEBOARD ANIMATION\n`;
  output += `${'='.repeat(50)}\n`;
  output += `Total de cenas: ${prompts.length}\n\n`;

  prompts.forEach(prompt => {
    output += `${'─'.repeat(50)}\n`;
    output += `CENA ${prompt.sceneNumber}\n`;
    output += `Tempo: ${formatTimeMMSS(prompt.startTime)} - ${formatTimeMMSS(prompt.endTime)}\n`;
    output += `${'─'.repeat(50)}\n\n`;

    output += `NARRAÇÃO:\n${prompt.narrationText}\n\n`;

    if (prompt.visualElements.length > 0) {
      output += `ELEMENTOS VISUAIS:\n`;
      prompt.visualElements.forEach((el, i) => {
        output += `  ${i + 1}. ${el}\n`;
      });
      output += `\n`;
    }

    output += `PROMPT PARA IMAGEM:\n${prompt.imagePrompt}\n\n`;
  });

  return output;
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================

/**
 * Gera prompts para todas as cenas usando IA
 */
export async function generatePromptsFromSubtitles(
  subtitles: Subtitle[],
  sceneConfig: SceneConfig,
  styleConfig: PromptStyleConfig,
  aiConfig: AIConfig,
  onProgress?: (message: string) => void
): Promise<PromptGenerationResult> {
  try {
    // 1. Divide legendas em cenas
    onProgress?.('Dividindo legendas em cenas...');
    const scenes = divideIntoScenes(subtitles, sceneConfig.sceneDuration);

    if (scenes.length === 0) {
      return {
        success: false,
        scenes: [],
        error: 'Não foi possível dividir as legendas em cenas',
      };
    }

    onProgress?.(`${scenes.length} cenas identificadas. Gerando prompts via IA...`);

    // 2. Cria prompts para a IA
    const systemPrompt = createSystemPrompt(styleConfig, sceneConfig);
    const userPrompt = createUserPrompt(scenes);

    // 3. Chama a IA
    const aiResult = await callAI(systemPrompt, userPrompt, aiConfig);

    if (!aiResult.success) {
      return {
        success: false,
        scenes: [],
        error: aiResult.error,
      };
    }

    onProgress?.('Processando resposta da IA...');

    // 4. Faz parse da resposta
    const generatedPrompts = parseAIResponse(aiResult.content!, scenes);

    // 5. Formata saída
    const formattedOutput = formatOutputMarkdown(generatedPrompts);

    onProgress?.('Prompts gerados com sucesso!');

    return {
      success: true,
      scenes: generatedPrompts,
      formattedOutput,
    };
  } catch (error) {
    return {
      success: false,
      scenes: [],
      error: error instanceof Error ? error.message : 'Erro desconhecido ao gerar prompts',
    };
  }
}

/**
 * Gera um preview rápido da divisão de cenas (sem chamar IA)
 */
export function previewSceneDivision(
  subtitles: Subtitle[],
  sceneDuration: SceneDuration
): DividedScene[] {
  return divideIntoScenes(subtitles, sceneDuration);
}
