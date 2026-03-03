import type {
  VisionApiConfig,
  VisionProvider,
} from '../types/ApiConfig';
import { VISION_ENDPOINTS } from '../types/ApiConfig';
import type { ElementRegion, TimelineElement, GridLayout, ElementGridPosition } from '../types/ImageBlock';
import type { Region } from '../types/Region';
import { polygonToPath, pathToBounds, rectToPath } from './pathUtils';

// ============================================
// TIPOS PARA DETECÇÃO POLIGONAL (novo wizard)
// ============================================

/**
 * Elemento detectado com contorno poligonal
 */
export interface DetectedPolygonElement {
  /** 1-based index matching segment order */
  index: number;
  /** Polygon vertices [x1,y1, x2,y2, ...] in pixels */
  points: number[];
  /** Bounding box derivado dos points */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  matchedLabel?: string;
}

/**
 * Opções para detecção poligonal
 */
export interface PolygonDetectionOptions {
  /** Texto das legendas para cada segmento */
  segmentLabels: string[];
  /** Instruções em linguagem natural do usuário (ex: "ignore os números") */
  exclusionInstructions?: string;
  imageWidth: number;
  imageHeight: number;
  expectedCount: number;
}

/**
 * Resultado da detecção poligonal
 */
export interface PolygonDetectionResult {
  success: boolean;
  elements: DetectedPolygonElement[];
  error?: string;
}

/**
 * Resultado da detecção de elementos
 */
export interface ElementDetectionResult {
  success: boolean;
  elements: DetectedElement[];
  error?: string;
}

/**
 * Elemento detectado pela Vision API
 */
export interface DetectedElement {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

/**
 * Converte imagem base64 para formato aceito pelas APIs
 */
function getImageBase64(imageUrl: string): string {
  // Remove o prefixo data:image/...;base64, se existir
  if (imageUrl.startsWith('data:')) {
    return imageUrl.split(',')[1];
  }
  return imageUrl;
}

/**
 * Determina se o modelo OpenAI usa max_completion_tokens (modelos novos)
 * ou max_tokens (modelos legados).
 * Modelos GPT-5+, o1, o3, o4+ exigem max_completion_tokens.
 */
function useMaxCompletionTokens(model: string): boolean {
  const m = model.toLowerCase();
  // GPT-5 e superiores
  if (/^gpt-5/.test(m)) return true;
  // Modelos o1, o3, o4+ (reasoning models)
  if (/^o[1-9]/.test(m)) return true;
  // Via OpenRouter: prefixo openai/
  if (m.startsWith('openai/')) {
    const sub = m.slice('openai/'.length);
    if (/^gpt-5/.test(sub)) return true;
    if (/^o[1-9]/.test(sub)) return true;
  }
  return false;
}

/**
 * Retorna o objeto de token limit correto para o modelo e provider.
 * - OpenAI direto: usa max_completion_tokens ou max_tokens conforme o modelo
 * - OpenRouter: roteia para vários backends, usa max_tokens (OpenRouter converte internamente)
 * - Outros providers OpenAI-compatible (groq, together, fireworks): usam max_tokens
 */
function getTokenParam(provider: string, model: string, tokens: number): Record<string, number> {
  if (provider === 'openai' && useMaxCompletionTokens(model)) {
    return { max_completion_tokens: tokens };
  }
  return { max_tokens: tokens };
}

/**
 * Gera o prompt para detecção de elementos
 * Foca em detectar o CONTEÚDO VISUAL REAL de cada elemento, não a célula inteira
 */
function generateDetectionPrompt(
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): string {
  const numElements = elements.length;

  // Usa grid informado ou calcula um padrão
  let cols: number, rows: number;
  if (gridLayout) {
    cols = gridLayout.cols;
    rows = gridLayout.rows;
  } else {
    // Calcula grid padrão baseado no número de elementos
    const aspectRatio = imageWidth / imageHeight;
    cols = Math.ceil(Math.sqrt(numElements * aspectRatio));
    rows = Math.ceil(numElements / cols);
  }

  const cellWidth = imageWidth / cols;
  const cellHeight = imageHeight / rows;

  // Cria lista detalhada com área de busca de cada elemento
  const elementsList = elements
    .map((el, idx) => {
      const elementIndex = idx + 1;
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      // Limites da célula onde o elemento está
      const cellStartX = Math.round(col * cellWidth);
      const cellEndX = Math.round((col + 1) * cellWidth);
      const cellStartY = Math.round(row * cellHeight);
      const cellEndY = Math.round((row + 1) * cellHeight);

      // Posição descritiva
      const colNames = ['ESQUERDA', 'CENTRO-ESQ', 'CENTRO-DIR', 'DIREITA'];
      const rowNames = ['SUPERIOR', 'MEIO', 'INFERIOR'];
      const colName = col < colNames.length ? colNames[col] : `COL ${col + 1}`;
      const rowName = row < rowNames.length ? rowNames[row] : `LINHA ${row + 1}`;
      const positionDesc = cols === 1 ? rowName : (rows === 1 ? colName : `${rowName} ${colName}`);

      return `${elementIndex}. [${positionDesc}] Área: x=${cellStartX}-${cellEndX}, y=${cellStartY}-${cellEndY}
   Visual: "${el.elementDescription}"`;
    })
    .join('\n');

  return `Analise esta ilustração whiteboard e detecte os bounding boxes de ${numElements} elementos.

IMAGEM: ${imageWidth}x${imageHeight}px, organizada em grid ${cols}x${rows}

ELEMENTOS (ordem: esquerda→direita, cima→baixo):
${elementsList}

═══════════════════════════════════════════════════════════════════
REGRAS CRÍTICAS DE DETECÇÃO:
═══════════════════════════════════════════════════════════════════

1. DETECTAR APENAS O CONTEÚDO VISUAL:
   - O bounding box deve envolver APENAS os desenhos/textos do elemento
   - NÃO incluir espaço em branco ao redor
   - NÃO invadir a área de elementos vizinhos
   - Cada elemento tem seu próprio título/label em texto - inclua-o

2. RESPEITAR LIMITES:
   - Cada elemento está DENTRO de sua célula do grid
   - O bounding box NUNCA deve ultrapassar os limites da célula
   - Se o desenho está próximo da borda, pare NA borda da célula

3. MARGEM MÍNIMA:
   - Deixar ~${Math.round(cellWidth * 0.02)}px de margem do conteúdo real
   - Isso evita cortar traços finos nas bordas

4. ELEMENTOS TÍPICOS:
   - Título em texto (ex: "NUMA AULA", "TESTE PRÁTICO")
   - Ícones/desenhos (stick figures, símbolos, setas)
   - O bounding box deve incluir AMBOS: título + desenho

═══════════════════════════════════════════════════════════════════
FORMATO DE RESPOSTA:
═══════════════════════════════════════════════════════════════════

Retorne um JSON array com EXATAMENTE ${numElements} objetos:
[
  { "index": 1, "x": <pixels>, "y": <pixels>, "width": <pixels>, "height": <pixels> },
  { "index": 2, "x": <pixels>, "y": <pixels>, "width": <pixels>, "height": <pixels> },
  ...
]

IMPORTANTE:
- x,y = canto superior esquerdo do bounding box
- Coordenadas em PIXELS (números inteiros)
- NÃO use porcentagens
- Seja PRECISO - detecte apenas o conteúdo visual, sem invadir vizinhos`;
}

/**
 * Formata intervalo de tempo
 */
function formatTimeRange(startMs: number, endMs: number): string {
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  return `${formatTime(startMs)} - ${formatTime(endMs)}`;
}

/**
 * Valida e ajusta coordenadas detectadas para ficarem dentro dos limites da célula
 * Respeita os limites das células do grid para evitar sobreposição
 */
function validateDetectedRegion(
  detected: DetectedElement,
  imageWidth: number,
  imageHeight: number,
  totalElements: number,
  gridLayout?: GridLayout
): DetectedElement | null {
  // Calcula grid esperado
  let cols: number, rows: number;
  if (gridLayout) {
    cols = gridLayout.cols;
    rows = gridLayout.rows;
  } else {
    cols = Math.ceil(Math.sqrt(totalElements * (imageWidth / imageHeight)));
    rows = Math.ceil(totalElements / cols);
  }

  const cellWidth = imageWidth / cols;
  const cellHeight = imageHeight / rows;

  // Determina em qual célula o elemento deveria estar baseado no index
  const elementIdx = detected.index - 1;
  const cellCol = elementIdx % cols;
  const cellRow = Math.floor(elementIdx / cols);

  // Limites da célula
  const cellStartX = cellCol * cellWidth;
  const cellEndX = (cellCol + 1) * cellWidth;
  const cellStartY = cellRow * cellHeight;
  const cellEndY = (cellRow + 1) * cellHeight;

  let x = detected.x;
  let y = detected.y;
  let width = detected.width;
  let height = detected.height;

  // Tamanho mínimo: 30% da célula (suficiente para conteúdo pequeno)
  const minWidth = Math.round(cellWidth * 0.30);
  const minHeight = Math.round(cellHeight * 0.30);

  // Se a região for muito pequena, expandir mantendo o centro
  if (width < minWidth) {
    const centerX = x + width / 2;
    width = minWidth;
    x = centerX - width / 2;
  }

  if (height < minHeight) {
    const centerY = y + height / 2;
    height = minHeight;
    y = centerY - height / 2;
  }

  // Adiciona pequena margem (3% de cada lado)
  const marginX = Math.round(width * 0.03);
  const marginY = Math.round(height * 0.03);
  x -= marginX;
  y -= marginY;
  width += marginX * 2;
  height += marginY * 2;

  // CRÍTICO: Garantir que a região fique DENTRO da célula
  // Isso evita sobreposição com elementos vizinhos
  x = Math.max(cellStartX, Math.round(x));
  y = Math.max(cellStartY, Math.round(y));
  width = Math.round(width);
  height = Math.round(height);

  // Se ultrapassar o limite direito da célula, ajustar
  if (x + width > cellEndX) {
    width = Math.round(cellEndX - x);
  }

  // Se ultrapassar o limite inferior da célula, ajustar
  if (y + height > cellEndY) {
    height = Math.round(cellEndY - y);
  }

  // Log se houve ajuste significativo
  if (Math.abs(x - detected.x) > 5 || Math.abs(y - detected.y) > 5 ||
      Math.abs(width - detected.width) > 5 || Math.abs(height - detected.height) > 5) {
    console.log(`[VisionAPI] Região ajustada para célula (${cellCol},${cellRow}): ` +
      `(${detected.x},${detected.y},${detected.width},${detected.height}) → (${x},${y},${width},${height})`);
  }

  return { ...detected, x, y, width, height };
}

/**
 * Cria uma região padrão para elementos não detectados ou rejeitados
 * Usa 80% da célula com margem para não sobrepor vizinhos
 */
function createFallbackRegion(
  index: number,
  totalElements: number,
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout
): DetectedElement {
  let cols: number, rows: number;

  if (gridLayout) {
    cols = gridLayout.cols;
    rows = gridLayout.rows;
  } else if (totalElements <= 4) {
    cols = 2;
    rows = 2;
  } else if (totalElements <= 6) {
    cols = 3;
    rows = 2;
  } else if (totalElements <= 9) {
    cols = 3;
    rows = 3;
  } else {
    cols = Math.ceil(Math.sqrt(totalElements));
    rows = Math.ceil(totalElements / cols);
  }

  const colIdx = (index - 1) % cols;
  const rowIdx = Math.floor((index - 1) / cols);
  const cellWidth = imageWidth / cols;
  const cellHeight = imageHeight / rows;

  // Usar 80% da célula com 10% de margem em cada lado para evitar sobreposição
  return {
    index,
    x: Math.round(colIdx * cellWidth + cellWidth * 0.10),
    y: Math.round(rowIdx * cellHeight + cellHeight * 0.10),
    width: Math.round(cellWidth * 0.80),
    height: Math.round(cellHeight * 0.80),
  };
}

/**
 * Valida todos os elementos detectados
 * Garante que regiões fiquem dentro de suas células do grid
 */
function validateAllDetections(
  detected: DetectedElement[],
  imageWidth: number,
  imageHeight: number,
  totalElements: number,
  gridLayout?: GridLayout
): DetectedElement[] {
  const result: DetectedElement[] = [];

  console.log(`[VisionAPI] Validando ${detected.length} detecções para ${totalElements} elementos (imagem: ${imageWidth}x${imageHeight})`);

  for (let i = 1; i <= totalElements; i++) {
    const detection = detected.find(d => d.index === i);
    if (detection) {
      // Passa gridLayout para garantir que a região fique dentro da célula
      const validated = validateDetectedRegion(detection, imageWidth, imageHeight, totalElements, gridLayout);
      if (validated) {
        result.push(validated);
      } else {
        // Região rejeitada - criar fallback
        console.log(`[VisionAPI] Criando região fallback para elemento ${i}`);
        result.push(createFallbackRegion(i, totalElements, imageWidth, imageHeight, gridLayout));
      }
    } else {
      // Elemento não detectado - criar fallback
      console.log(`[VisionAPI] Elemento ${i} não detectado, criando fallback`);
      result.push(createFallbackRegion(i, totalElements, imageWidth, imageHeight, gridLayout));
    }
  }

  return result;
}

/**
 * Extrai JSON do texto de resposta
 */
function extractJsonFromResponse(text: string): DetectedElement[] | null {
  try {
    // Tenta parsear diretamente
    return JSON.parse(text);
  } catch {
    // Tenta encontrar JSON no texto
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Detecta elementos usando OpenAI GPT-4 Vision
 */
async function detectWithOpenAI(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);

  const response = await fetch(VISION_ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      ...getTokenParam('openai', config.model || 'gpt-4o', 2000),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  // Validar coordenadas antes de retornar, passando gridLayout para respeitar limites
  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando Anthropic Claude Vision
 */
async function detectWithAnthropic(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);

  // Detectar tipo da imagem
  let mediaType = 'image/jpeg';
  if (imageUrl.startsWith('data:image/png')) {
    mediaType = 'image/png';
  } else if (imageUrl.startsWith('data:image/webp')) {
    mediaType = 'image/webp';
  } else if (imageUrl.startsWith('data:image/gif')) {
    mediaType = 'image/gif';
  }

  const response = await fetch(VISION_ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model || 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  // Validar coordenadas antes de retornar, passando gridLayout para respeitar limites
  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando Google Gemini Vision
 */
async function detectWithGoogle(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);
  const model = config.model || 'gemini-3-flash-preview';

  const response = await fetch(
    `${VISION_ENDPOINTS.google}/${model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 2000,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${error}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  // Validar coordenadas antes de retornar, passando gridLayout para respeitar limites
  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando ZhipuAI GLM-4V
 */
async function detectWithZhipu(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);

  // GLM-4.6V usa o mesmo model id na API z.ai
  const modelId = config.model || 'glm-4v';

  console.log('[VisionAPI] Zhipu request:', { model: modelId, elementsCount: elements.length });

  const response = await fetch(VISION_ENDPOINTS.zhipu, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VisionAPI] Zhipu error:', response.status, errorText);
    throw new Error(`ZhipuAI API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  console.log('[VisionAPI] Zhipu response:', data);

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    console.error('[VisionAPI] Failed to parse JSON from:', content);
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  // Validar coordenadas antes de retornar, passando gridLayout para respeitar limites
  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando Google Cloud Vision API (Object Localization)
 * https://cloud.google.com/vision/docs/object-localizer
 */
async function detectWithGoogleCloudVision(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const imageBase64 = getImageBase64(imageUrl);

  console.log('[VisionAPI] Google Cloud Vision request:', { elementsCount: elements.length });

  // Usar Object Localization para detectar objetos na imagem
  const response = await fetch(
    `${VISION_ENDPOINTS['google-cloud-vision']}?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: imageBase64,
            },
            features: [
              {
                type: 'OBJECT_LOCALIZATION',
                maxResults: 50,
              },
              {
                type: 'TEXT_DETECTION',
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VisionAPI] Google Cloud Vision error:', response.status, errorText);
    throw new Error(`Google Cloud Vision API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  console.log('[VisionAPI] Google Cloud Vision response:', data);

  const localizedObjects = data.responses?.[0]?.localizedObjectAnnotations || [];
  const textAnnotations = data.responses?.[0]?.textAnnotations || [];

  // Mapear elementos detectados pela descrição
  const detectedElements: DetectedElement[] = [];

  elements.forEach((element, idx) => {
    const description = element.elementDescription.toLowerCase();

    // Procurar nos objetos localizados
    let found = false;
    for (const obj of localizedObjects) {
      const objName = obj.name?.toLowerCase() || '';
      if (description.includes(objName) || objName.includes(description.split(' ')[0])) {
        // Converter normalized vertices para pixels
        const vertices = obj.boundingPoly?.normalizedVertices || [];
        if (vertices.length >= 4) {
          const x = Math.round(vertices[0].x * imageWidth);
          const y = Math.round(vertices[0].y * imageHeight);
          const x2 = Math.round(vertices[2].x * imageWidth);
          const y2 = Math.round(vertices[2].y * imageHeight);

          detectedElements.push({
            index: idx + 1,
            x,
            y,
            width: x2 - x,
            height: y2 - y,
            confidence: obj.score,
          });
          found = true;
          break;
        }
      }
    }

    // Se não encontrou, procurar nos textos detectados
    if (!found) {
      for (const text of textAnnotations.slice(1)) { // Skip first (full text)
        const textContent = text.description?.toLowerCase() || '';
        if (description.includes(textContent) || textContent.includes(description.split(' ')[0])) {
          const vertices = text.boundingPoly?.vertices || [];
          if (vertices.length >= 4) {
            const x = vertices[0].x || 0;
            const y = vertices[0].y || 0;
            const x2 = vertices[2].x || 0;
            const y2 = vertices[2].y || 0;

            detectedElements.push({
              index: idx + 1,
              x,
              y,
              width: x2 - x,
              height: y2 - y,
            });
            found = true;
            break;
          }
        }
      }
    }

    // Se ainda não encontrou, criar uma região padrão dividindo a imagem
    if (!found) {
      const cols = Math.ceil(Math.sqrt(elements.length));
      const rows = Math.ceil(elements.length / cols);
      const colIdx = idx % cols;
      const rowIdx = Math.floor(idx / cols);
      const cellWidth = imageWidth / cols;
      const cellHeight = imageHeight / rows;

      detectedElements.push({
        index: idx + 1,
        x: Math.round(colIdx * cellWidth + cellWidth * 0.1),
        y: Math.round(rowIdx * cellHeight + cellHeight * 0.1),
        width: Math.round(cellWidth * 0.8),
        height: Math.round(cellHeight * 0.8),
      });
    }
  });

  // Validar coordenadas antes de retornar, passando gridLayout para respeitar limites
  const validated = validateAllDetections(detectedElements, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando endpoint customizado
 */
async function detectWithCustom(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  if (!config.endpoint) {
    throw new Error('Endpoint customizado não configurado');
  }

  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);

  // Usa formato OpenAI-compatível por padrão
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'default',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Custom API error: ${error}`);
  }

  const data = await response.json();
  const content =
    data.choices?.[0]?.message?.content || data.content?.[0]?.text;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  // Validar coordenadas antes de retornar, passando gridLayout para respeitar limites
  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando OpenRouter (suporta múltiplos modelos)
 * Formato compatível com OpenAI
 */
async function detectWithOpenRouter(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);

  console.log('[VisionAPI] OpenRouter request:', { model: config.model, elementsCount: elements.length });

  const response = await fetch(VISION_ENDPOINTS.openrouter, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'HTTP-Referer': 'https://automatizar-animacoes.app',
      'X-Title': 'Automatizar Animacoes',
    },
    body: JSON.stringify({
      model: config.model || 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      ...getTokenParam('openrouter', config.model || 'google/gemini-3-flash-preview', 2000),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VisionAPI] OpenRouter error:', response.status, errorText);
    throw new Error(`OpenRouter API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando Groq (Llama Vision)
 * Formato compatível com OpenAI
 */
async function detectWithGroq(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);

  console.log('[VisionAPI] Groq request:', { model: config.model, elementsCount: elements.length });

  const response = await fetch(VISION_ENDPOINTS.groq, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'llama-3.2-90b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VisionAPI] Groq error:', response.status, errorText);
    throw new Error(`Groq API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando Together AI
 * Formato compatível com OpenAI
 */
async function detectWithTogether(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);

  console.log('[VisionAPI] Together request:', { model: config.model, elementsCount: elements.length });

  const response = await fetch(VISION_ENDPOINTS.together, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VisionAPI] Together error:', response.status, errorText);
    throw new Error(`Together API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando Fireworks AI
 * Formato compatível com OpenAI
 */
async function detectWithFireworks(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const prompt = generateDetectionPrompt(elements, imageWidth, imageHeight, gridLayout, elementPositions);
  const imageBase64 = getImageBase64(imageUrl);

  console.log('[VisionAPI] Fireworks request:', { model: config.model, elementsCount: elements.length });

  const response = await fetch(VISION_ENDPOINTS.fireworks, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'accounts/fireworks/models/llama-v3p2-90b-vision-instruct',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VisionAPI] Fireworks error:', response.status, errorText);
    throw new Error(`Fireworks API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  const detected = extractJsonFromResponse(content);
  if (!detected) {
    throw new Error('Não foi possível extrair JSON da resposta');
  }

  const validated = validateAllDetections(detected, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando OmniParser V2 (local ou via API)
 * Especializado em detecção de elementos UI
 */
async function detectWithOmniParser(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const imageBase64 = getImageBase64(imageUrl);
  const endpoint = config.endpoint || VISION_ENDPOINTS.omniparser;

  console.log('[VisionAPI] OmniParser request:', { endpoint, elementsCount: elements.length });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      image: imageBase64,
      image_width: imageWidth,
      image_height: imageHeight,
      return_captions: true,
      return_interactable: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VisionAPI] OmniParser error:', response.status, errorText);
    throw new Error(`OmniParser API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  console.log('[VisionAPI] OmniParser response:', data);

  // OmniParser retorna elementos com bbox [x1, y1, x2, y2]
  const omniElements = data.elements || data.parsed_elements || [];

  // Mapear elementos detectados para os elementos esperados
  const detectedElements: DetectedElement[] = [];

  // Se temos posições de grid, usar para matching
  if (gridLayout && omniElements.length > 0) {
    const cellWidth = imageWidth / gridLayout.cols;
    const cellHeight = imageHeight / gridLayout.rows;

    elements.forEach((element, idx) => {
      const col = idx % gridLayout.cols;
      const row = Math.floor(idx / gridLayout.cols);
      const cellStartX = col * cellWidth;
      const cellStartY = row * cellHeight;
      const cellEndX = (col + 1) * cellWidth;
      const cellEndY = (row + 1) * cellHeight;

      // Encontrar elementos do OmniParser dentro desta célula
      const inCell = omniElements.filter((oe: any) => {
        const [x1, y1, x2, y2] = oe.bbox || oe.bounding_box || [0, 0, 0, 0];
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        return centerX >= cellStartX && centerX < cellEndX && centerY >= cellStartY && centerY < cellEndY;
      });

      if (inCell.length > 0) {
        // Calcular bounding box que engloba todos os elementos na célula
        let minX = imageWidth, minY = imageHeight, maxX = 0, maxY = 0;
        for (const oe of inCell) {
          const [x1, y1, x2, y2] = oe.bbox || oe.bounding_box || [0, 0, 0, 0];
          minX = Math.min(minX, x1);
          minY = Math.min(minY, y1);
          maxX = Math.max(maxX, x2);
          maxY = Math.max(maxY, y2);
        }

        detectedElements.push({
          index: idx + 1,
          x: Math.round(minX),
          y: Math.round(minY),
          width: Math.round(maxX - minX),
          height: Math.round(maxY - minY),
        });
      }
    });
  }

  const validated = validateAllDetections(detectedElements, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando SAM (Segment Anything Model)
 * Retorna máscaras de segmentação precisas
 */
async function detectWithSAM(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const imageBase64 = getImageBase64(imageUrl);
  const endpoint = config.endpoint || VISION_ENDPOINTS.sam;

  console.log('[VisionAPI] SAM request:', { endpoint, elementsCount: elements.length });

  // Gerar pontos de prompt baseados no grid
  const promptPoints: Array<{ x: number; y: number; label: number }> = [];

  if (gridLayout) {
    const cellWidth = imageWidth / gridLayout.cols;
    const cellHeight = imageHeight / gridLayout.rows;

    elements.forEach((_, idx) => {
      const col = idx % gridLayout.cols;
      const row = Math.floor(idx / gridLayout.cols);
      // Ponto central da célula como prompt positivo
      promptPoints.push({
        x: Math.round(col * cellWidth + cellWidth / 2),
        y: Math.round(row * cellHeight + cellHeight / 2),
        label: 1, // 1 = foreground
      });
    });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      image: imageBase64,
      image_width: imageWidth,
      image_height: imageHeight,
      point_coords: promptPoints.map(p => [p.x, p.y]),
      point_labels: promptPoints.map(p => p.label),
      multimask_output: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VisionAPI] SAM error:', response.status, errorText);
    throw new Error(`SAM API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  console.log('[VisionAPI] SAM response:', data);

  // SAM retorna máscaras, converter para bounding boxes
  const masks = data.masks || data.segments || [];
  const detectedElements: DetectedElement[] = [];

  masks.forEach((mask: any, idx: number) => {
    if (idx < elements.length) {
      // Se temos bbox direto
      if (mask.bbox) {
        const [x, y, w, h] = mask.bbox;
        detectedElements.push({
          index: idx + 1,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
        });
      }
      // Se temos bounds
      else if (mask.bounds) {
        detectedElements.push({
          index: idx + 1,
          x: Math.round(mask.bounds.x),
          y: Math.round(mask.bounds.y),
          width: Math.round(mask.bounds.width),
          height: Math.round(mask.bounds.height),
        });
      }
    }
  });

  const validated = validateAllDetections(detectedElements, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos usando Replicate (OmniParser, SAM, Grounding DINO, etc.)
 */
async function detectWithReplicate(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  const imageBase64 = getImageBase64(imageUrl);
  const model = config.model || 'microsoft/omniparser-v2';

  console.log('[VisionAPI] Replicate request:', { model, elementsCount: elements.length });

  // Criar prediction
  const createResponse = await fetch(VISION_ENDPOINTS.replicate, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      version: model,
      input: {
        image: `data:image/jpeg;base64,${imageBase64}`,
      },
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error('[VisionAPI] Replicate create error:', createResponse.status, errorText);
    throw new Error(`Replicate API error (${createResponse.status}): ${errorText.substring(0, 200)}`);
  }

  const createData = await createResponse.json();
  const predictionUrl = createData.urls?.get || createData.url;

  if (!predictionUrl) {
    throw new Error('Replicate não retornou URL de prediction');
  }

  // Polling para resultado
  let result = null;
  for (let i = 0; i < 60; i++) { // Max 60 segundos
    await new Promise(resolve => setTimeout(resolve, 1000));

    const statusResponse = await fetch(predictionUrl, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      continue;
    }

    const statusData = await statusResponse.json();

    if (statusData.status === 'succeeded') {
      result = statusData.output;
      break;
    } else if (statusData.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${statusData.error}`);
    }
  }

  if (!result) {
    throw new Error('Replicate timeout');
  }

  console.log('[VisionAPI] Replicate result:', result);

  // Processar resultado baseado no modelo
  const detectedElements: DetectedElement[] = [];

  if (Array.isArray(result)) {
    result.forEach((item: any, idx: number) => {
      if (idx < elements.length && item.bbox) {
        const [x1, y1, x2, y2] = item.bbox;
        detectedElements.push({
          index: idx + 1,
          x: Math.round(x1),
          y: Math.round(y1),
          width: Math.round(x2 - x1),
          height: Math.round(y2 - y1),
        });
      }
    });
  }

  const validated = validateAllDetections(detectedElements, imageWidth, imageHeight, elements.length, gridLayout);

  return {
    success: true,
    elements: validated,
  };
}

/**
 * Detecta elementos em uma imagem usando a Vision API configurada
 */
export async function detectElements(
  config: VisionApiConfig,
  imageUrl: string,
  elements: TimelineElement[],
  imageWidth: number,
  imageHeight: number,
  gridLayout?: GridLayout,
  elementPositions?: ElementGridPosition[]
): Promise<ElementDetectionResult> {
  if (!config.enabled || !config.apiKey) {
    // OmniParser e SAM podem funcionar sem API key se rodando localmente
    const localProviders = ['omniparser', 'sam'];
    if (!localProviders.includes(config.provider)) {
      return {
        success: false,
        elements: [],
        error: 'Vision API não configurada ou desabilitada',
      };
    }
  }

  // Validar dimensões
  if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
    return {
      success: false,
      elements: [],
      error: `Dimensões da imagem inválidas: ${imageWidth}x${imageHeight}`,
    };
  }

  console.log(`[VisionAPI] Detectando elementos em imagem ${imageWidth}x${imageHeight}${gridLayout ? ` (grid ${gridLayout.cols}x${gridLayout.rows})` : ''}`);

  try {
    const detectors: Record<
      VisionProvider,
      (
        config: VisionApiConfig,
        imageUrl: string,
        elements: TimelineElement[],
        imageWidth: number,
        imageHeight: number,
        gridLayout?: GridLayout,
        elementPositions?: ElementGridPosition[]
      ) => Promise<ElementDetectionResult>
    > = {
      openai: detectWithOpenAI,
      anthropic: detectWithAnthropic,
      google: detectWithGoogle,
      'google-cloud-vision': detectWithGoogleCloudVision,
      openrouter: detectWithOpenRouter,
      zhipu: detectWithZhipu,
      groq: detectWithGroq,
      together: detectWithTogether,
      fireworks: detectWithFireworks,
      omniparser: detectWithOmniParser,
      sam: detectWithSAM,
      replicate: detectWithReplicate,
      custom: detectWithCustom,
    };

    const detector = detectors[config.provider];
    if (!detector) {
      throw new Error(`Provider não suportado: ${config.provider}`);
    }

    return await detector(config, imageUrl, elements, imageWidth, imageHeight, gridLayout, elementPositions);
  } catch (error) {
    return {
      success: false,
      elements: [],
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Converte elementos detectados para ElementRegion
 */
export function detectedToRegion(detected: DetectedElement): ElementRegion {
  return {
    x: detected.x,
    y: detected.y,
    width: detected.width,
    height: detected.height,
    shape: 'rect',
  };
}

/**
 * Aplica detecção a uma lista de TimelineElements
 */
export function applyDetectionToTimeline(
  timeline: TimelineElement[],
  detected: DetectedElement[]
): TimelineElement[] {
  return timeline.map((element, idx) => {
    const detection = detected.find((d) => d.index === idx + 1);
    if (detection) {
      return {
        ...element,
        region: detectedToRegion(detection),
        regionSource: 'auto' as const,
      };
    }
    return element;
  });
}

// ============================================
// DETECÇÃO POLIGONAL (novo wizard)
// ============================================

/**
 * Gera prompt para detecção poligonal de elementos.
 * Sem pressuposição de grid - usa texto das legendas para mapeamento.
 */
function generatePolygonDetectionPrompt(options: PolygonDetectionOptions): string {
  const { segmentLabels, exclusionInstructions, imageWidth, imageHeight, expectedCount } = options;

  // Textos completos das legendas (SEM truncar) para dar contexto ao LLM
  const segmentsList = segmentLabels
    .map((label, idx) => `  ${idx + 1}. "${label}"`)
    .join('\n');

  let exclusionBlock = '';
  if (exclusionInstructions && exclusionInstructions.trim()) {
    exclusionBlock = `
INSTRUCOES DE EXCLUSAO DO USUARIO:
"${exclusionInstructions.trim()}"
Respeite estas instrucoes: NAO inclua os elementos mencionados acima nos contornos.
Ajuste os poligonos para EVITAR as areas/elementos que o usuario pediu para ignorar.
`;
  }

  // Dica de layout baseada no aspect ratio
  const aspectRatio = imageWidth / imageHeight;
  let layoutHint = '';
  if (expectedCount <= 4 && aspectRatio > 1.3) {
    layoutHint = `DICA DE LAYOUT: A imagem e mais larga que alta (${imageWidth}x${imageHeight}). Provavelmente as ${expectedCount} secoes estao dispostas LADO A LADO horizontalmente (esquerda, centro, direita).`;
  } else if (expectedCount <= 4 && aspectRatio < 0.8) {
    layoutHint = `DICA DE LAYOUT: A imagem e mais alta que larga (${imageWidth}x${imageHeight}). Provavelmente as ${expectedCount} secoes estao EMPILHADAS verticalmente.`;
  }

  return `Voce e um analisador de layout de imagens. Sua tarefa e dividir esta imagem em EXATAMENTE ${expectedCount} SECOES VISUAIS DISTINTAS.

IMAGEM: ${imageWidth}x${imageHeight} pixels
${layoutHint}

O QUE E UMA "SECAO VISUAL":
- Um grupo de elementos visuais que formam uma UNIDADE tematica (ex: um personagem com seu titulo, um diagrama com seu rotulo, um icone com texto associado, um quadro/board com seu conteudo)
- Secoes sao separadas por espaco em branco, divisorias visuais ou mudanca clara de tema/estilo
- Em slides de apresentacao, cada secao tipicamente contem: uma ilustracao/desenho + titulo/rotulo + decoracoes associadas (setas, numeros, etc.)
- Em imagens com layout horizontal, as secoes geralmente estao lado a lado (esquerda, centro, direita)
- Em imagens com layout em grid, as secoes podem estar em linhas e colunas

COMO NUMERAR AS SECOES:
- Ordem de leitura natural: esquerda para direita, depois cima para baixo
- Secao 1 = a mais a esquerda (ou superior-esquerda)
- Secao ${expectedCount} = a mais a direita (ou inferior-direita)

TEXTOS DE REFERENCIA (legendas associadas na ordem):
${segmentsList}
Use estes textos como referencia auxiliar para entender o contexto. A PRIORIDADE e a separacao VISUAL/ESPACIAL das secoes na imagem.
${exclusionBlock}
REGRAS:
1. CONTORNO POLIGONAL: Use 4 a 20 vertices para cada secao. O poligono deve envolver TODO o conteudo da secao (titulo + ilustracao + decoracoes). Use mais vertices para contornar formas irregulares com precisao.

2. COBERTURA TOTAL: Juntas, as ${expectedCount} secoes devem cobrir TODO o conteudo visual significativo da imagem. Nenhuma area importante deve ficar fora dos poligonos.

3. SEM SOBREPOSICAO: Os poligonos de secoes diferentes NAO devem se sobrepor.

4. MARGEM: Inclua uma margem de ~3-5% ao redor do conteudo de cada secao. E melhor incluir um pouco de espaco extra do que cortar conteudo.

5. COORDENADAS EM PIXELS: Todos os valores x,y sao em pixels inteiros.
   x: 0 a ${imageWidth}, y: 0 a ${imageHeight}

FORMATO DE RESPOSTA (JSON array, sem texto adicional):
[
  {"index": 1, "points": [x1, y1, x2, y2, x3, y3, x4, y4], "label": "descricao curta da secao"},
  {"index": 2, "points": [x1, y1, x2, y2, x3, y3, x4, y4], "label": "descricao curta da secao"}
]

IMPORTANTE:
- Retorne EXATAMENTE ${expectedCount} secoes
- "points" deve ter no MINIMO 8 valores (4 vertices) e no MAXIMO 40 valores (20 vertices)
- Os vertices formam um poligono FECHADO (primeiro e ultimo ponto conectados automaticamente)
- Ordene os vertices no sentido HORARIO
- Use pixels inteiros, NAO porcentagens
- Retorne APENAS o JSON, sem explicacao`;
}

/**
 * Prompt simplificado para retry quando a primeira tentativa falha.
 * Abandona legendas e foca apenas em divisão espacial da imagem.
 */
function generateSimplifiedSegmentationPrompt(options: PolygonDetectionOptions): string {
  const { imageWidth, imageHeight, expectedCount } = options;

  const aspectRatio = imageWidth / imageHeight;
  let layoutHint: string;
  if (expectedCount <= 4 && aspectRatio > 1.3) {
    layoutHint = `A imagem tem layout HORIZONTAL. As ${expectedCount} secoes provavelmente estao lado a lado (esquerda para direita).`;
  } else if (expectedCount <= 4 && aspectRatio < 0.8) {
    layoutHint = `A imagem tem layout VERTICAL. As ${expectedCount} secoes provavelmente estao empilhadas (cima para baixo).`;
  } else {
    layoutHint = `Procure ${expectedCount} secoes visuais distintas na imagem.`;
  }

  return `Divida esta imagem (${imageWidth}x${imageHeight} pixels) em exatamente ${expectedCount} secoes visuais.

${layoutHint}

Cada secao e um GRUPO VISUAL DISTINTO separado dos outros por espaco em branco ou divisorias.
Numere da esquerda para direita, de cima para baixo.

Retorne JSON:
[{"index":1,"points":[x1,y1,x2,y2,x3,y3,x4,y4],"label":"descricao curta"}]

Regras:
- EXATAMENTE ${expectedCount} secoes
- Sem sobreposicao entre secoes
- 4 a 20 vertices por secao (coordenadas em pixels inteiros)
- Vertices em sentido horario
- Retorne APENAS o JSON, sem texto adicional`;
}

/**
 * Extrai JSON de polígonos da resposta do LLM.
 * Fallback: converte bounding boxes para polígonos de 4 vértices.
 */
function extractPolygonJsonFromResponse(text: string): Array<{ index: number; points?: number[]; x?: number; y?: number; width?: number; height?: number; label?: string }> | null {
  let parsed: any[] | null = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  return parsed;
}

/**
 * Deriva bounding box a partir de array de pontos [x1,y1, x2,y2, ...]
 */
function pointsToBounds(points: number[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Converte bounding box {x,y,width,height} para polígono de 4 vértices
 */
function bboxToPolygonPoints(x: number, y: number, width: number, height: number): number[] {
  return [x, y, x + width, y, x + width, y + height, x, y + height];
}

/**
 * Valida e corrige detecções poligonais
 */
function validatePolygonDetections(
  rawDetections: Array<{ index: number; points?: number[]; x?: number; y?: number; width?: number; height?: number; label?: string }>,
  imageWidth: number,
  imageHeight: number,
  expectedCount: number
): DetectedPolygonElement[] {
  const result: DetectedPolygonElement[] = [];

  for (let i = 1; i <= expectedCount; i++) {
    const det = rawDetections.find(d => d.index === i);

    let points: number[];

    if (det?.points && Array.isArray(det.points) && det.points.length >= 6) {
      // Tem pontos de polígono válidos
      points = det.points.map(v => Math.round(Number(v) || 0));
    } else if (det && typeof det.x === 'number' && typeof det.y === 'number' &&
               typeof det.width === 'number' && typeof det.height === 'number') {
      // Fallback: LLM retornou bounding box, converter para polígono
      points = bboxToPolygonPoints(det.x, det.y, det.width, det.height);
      console.log(`[VisionAPI Polygon] Elemento ${i}: convertido bbox para polígono de 4 vértices`);
    } else {
      // Fallback: elemento não detectado, dividir imagem proporcionalmente
      console.warn(`[VisionAPI Polygon] FALLBACK: Elemento ${i}/${expectedCount} NÃO detectado pela IA. Criando região estimada.`);

      const ar = imageWidth / imageHeight;
      let cols: number, rows: number;
      if (expectedCount <= 4 && ar > 1.2) {
        // Imagem widescreen com poucos elementos → colunas lado a lado
        cols = expectedCount;
        rows = 1;
      } else if (expectedCount <= 4 && ar < 0.8) {
        // Imagem portrait com poucos elementos → linhas empilhadas
        cols = 1;
        rows = expectedCount;
      } else {
        cols = Math.ceil(Math.sqrt(expectedCount * ar));
        rows = Math.ceil(expectedCount / cols);
      }

      const col = (i - 1) % cols;
      const row = Math.floor((i - 1) / cols);
      const cellW = imageWidth / cols;
      const cellH = imageHeight / rows;
      const margin = 0.05; // 5% margem
      const x = Math.round(col * cellW + cellW * margin);
      const y = Math.round(row * cellH + cellH * margin);
      const w = Math.round(cellW * (1 - 2 * margin));
      const h = Math.round(cellH * (1 - 2 * margin));
      points = bboxToPolygonPoints(x, y, w, h);
    }

    // Clamp pontos dentro dos limites da imagem
    for (let j = 0; j < points.length; j += 2) {
      points[j] = Math.max(0, Math.min(imageWidth, points[j]));
      points[j + 1] = Math.max(0, Math.min(imageHeight, points[j + 1]));
    }

    const bounds = pointsToBounds(points);

    result.push({
      index: i,
      points,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      matchedLabel: det?.label,
    });
  }

  // Resolver sobreposições
  return resolvePolygonOverlaps(result);
}

/**
 * Verifica se dois bounding boxes se sobrepõem significativamente
 */
function boundsOverlapFraction(a: DetectedPolygonElement, b: DetectedPolygonElement): number {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlapArea = overlapX * overlapY;
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 ? overlapArea / smallerArea : 0;
}

/**
 * Encolhe polígono em direção ao centroide por um fator
 */
function shrinkPolygonPoints(points: number[], factor: number): number[] {
  // Calcular centroide
  let cx = 0, cy = 0;
  const numPoints = points.length / 2;
  for (let i = 0; i < points.length; i += 2) {
    cx += points[i];
    cy += points[i + 1];
  }
  cx /= numPoints;
  cy /= numPoints;

  return points.map((val, i) => {
    const center = i % 2 === 0 ? cx : cy;
    return Math.round(center + (val - center) * factor);
  });
}

/**
 * Resolve sobreposições entre polígonos encolhendo os que se sobrepõem
 */
function resolvePolygonOverlaps(elements: DetectedPolygonElement[]): DetectedPolygonElement[] {
  const result = elements.map(e => ({ ...e, points: [...e.points] }));
  const OVERLAP_THRESHOLD = 0.10; // 10%
  const MAX_ITERATIONS = 5;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let hasOverlap = false;

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const overlap = boundsOverlapFraction(result[i], result[j]);
        if (overlap > OVERLAP_THRESHOLD) {
          hasOverlap = true;
          console.log(`[VisionAPI Polygon] Sobreposição ${(overlap * 100).toFixed(1)}% entre elementos ${result[i].index} e ${result[j].index}, encolhendo`);

          // Encolher ambos em direção aos seus centros
          const shrinkFactor = 0.92;
          result[i].points = shrinkPolygonPoints(result[i].points, shrinkFactor);
          result[j].points = shrinkPolygonPoints(result[j].points, shrinkFactor);

          // Recalcular bounds
          const boundsI = pointsToBounds(result[i].points);
          result[i].x = boundsI.x; result[i].y = boundsI.y;
          result[i].width = boundsI.width; result[i].height = boundsI.height;

          const boundsJ = pointsToBounds(result[j].points);
          result[j].x = boundsJ.x; result[j].y = boundsJ.y;
          result[j].width = boundsJ.width; result[j].height = boundsJ.height;
        }
      }
    }

    if (!hasOverlap) break;
  }

  return result;
}

/**
 * Chama um provider LLM de visão com prompt e imagem.
 * Abstrai as diferenças de formato HTTP entre providers.
 * Retorna o texto da resposta.
 */
async function callLLMVisionProvider(
  config: VisionApiConfig,
  imageUrl: string,
  prompt: string,
  maxTokens: number = 4000
): Promise<string> {
  const imageBase64 = getImageBase64(imageUrl);

  // Detectar tipo da imagem
  let mediaType = 'image/jpeg';
  if (imageUrl.startsWith('data:image/png')) mediaType = 'image/png';
  else if (imageUrl.startsWith('data:image/webp')) mediaType = 'image/webp';
  else if (imageUrl.startsWith('data:image/gif')) mediaType = 'image/gif';

  let response: Response;
  let extractContent: (data: any) => string | undefined;

  switch (config.provider) {
    case 'anthropic': {
      response = await fetch(VISION_ENDPOINTS.anthropic, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model || 'claude-sonnet-4-20250514',
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });
      extractContent = (data) => data.content?.[0]?.text;
      break;
    }

    case 'google': {
      const model = config.model || 'gemini-3-flash-preview';
      response = await fetch(`${VISION_ENDPOINTS.google}/${model}:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: mediaType, data: imageBase64 } },
          ] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      });
      extractContent = (data) => data.candidates?.[0]?.content?.parts?.[0]?.text;
      break;
    }

    case 'zhipu': {
      response = await fetch(VISION_ENDPOINTS.zhipu, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || 'glm-4v',
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
            ],
          }],
        }),
      });
      extractContent = (data) => data.choices?.[0]?.message?.content;
      break;
    }

    case 'custom': {
      const endpoint = config.endpoint || VISION_ENDPOINTS.custom;
      if (!endpoint) throw new Error('Endpoint customizado não configurado');
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || 'default',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}`, detail: 'high' } },
            ],
          }],
          max_tokens: maxTokens,
        }),
      });
      extractContent = (data) => data.choices?.[0]?.message?.content;
      break;
    }

    // OpenAI-compatible providers (openai, openrouter, groq, together, fireworks)
    default: {
      const endpoint = VISION_ENDPOINTS[config.provider] || VISION_ENDPOINTS.openai;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      };

      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model || 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}`, detail: 'high' } },
            ],
          }],
          ...getTokenParam(config.provider, config.model || 'gpt-4o', maxTokens),
        }),
      });
      extractContent = (data) => data.choices?.[0]?.message?.content;
      break;
    }
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${config.provider} API error: ${error}`);
  }

  const data = await response.json();
  const content = extractContent(data);

  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  return content;
}

/**
 * Detecta elementos com contornos poligonais usando a Vision API.
 * Para uso no wizard novo (RegionsStep).
 */
export async function detectElementsPolygon(
  config: VisionApiConfig,
  imageUrl: string,
  options: PolygonDetectionOptions
): Promise<PolygonDetectionResult> {
  // Validação
  if (!config.enabled || !config.apiKey) {
    return { success: false, elements: [], error: 'Vision API não configurada ou desabilitada' };
  }

  if (!options.imageWidth || !options.imageHeight || options.imageWidth <= 0 || options.imageHeight <= 0) {
    return { success: false, elements: [], error: `Dimensões da imagem inválidas: ${options.imageWidth}x${options.imageHeight}` };
  }

  console.log(`[VisionAPI Polygon] Detectando ${options.expectedCount} elementos em imagem ${options.imageWidth}x${options.imageHeight}`);

  try {
    // Providers não-LLM: usar detecção antiga e converter para polígonos
    const nonLLMProviders: VisionProvider[] = ['google-cloud-vision', 'omniparser', 'sam', 'replicate'];
    if (nonLLMProviders.includes(config.provider)) {
      console.log(`[VisionAPI Polygon] Provider ${config.provider} não suporta polígonos, usando bounding boxes convertidos`);

      // Criar TimelineElements fake para a API antiga
      const fakeElements: TimelineElement[] = options.segmentLabels.map((label, idx) => ({
        id: `fake-${idx}`,
        elementDescription: label,
        startTime: 0,
        endTime: 0,
        subtitleIndex: idx,
      } as any));

      const bboxResult = await detectElements(config, imageUrl, fakeElements, options.imageWidth, options.imageHeight);

      if (!bboxResult.success) {
        return { success: false, elements: [], error: bboxResult.error };
      }

      // Converter bounding boxes para polígonos de 4 vértices
      const polygonElements: DetectedPolygonElement[] = bboxResult.elements.map(det => {
        const points = bboxToPolygonPoints(det.x, det.y, det.width, det.height);
        return {
          index: det.index,
          points,
          x: det.x,
          y: det.y,
          width: det.width,
          height: det.height,
          confidence: det.confidence,
        };
      });

      return { success: true, elements: polygonElements };
    }

    // Providers LLM: usar prompt poligonal
    const prompt = generatePolygonDetectionPrompt(options);
    const responseText = await callLLMVisionProvider(config, imageUrl, prompt, 4000);

    console.log(`[VisionAPI Polygon] Raw LLM response (${responseText.length} chars):`, responseText.substring(0, 500));

    let rawDetections = extractPolygonJsonFromResponse(responseText);
    if (!rawDetections) {
      console.error('[VisionAPI Polygon] Failed to parse JSON. Full response:', responseText);
      throw new Error('Não foi possível extrair JSON da resposta');
    }

    console.log(`[VisionAPI Polygon] Parsed ${rawDetections.length} detections from first attempt`);

    // Verificar se temos detecções válidas suficientes
    const validCount = rawDetections.filter(d =>
      d.index >= 1 && d.index <= options.expectedCount &&
      ((d.points && Array.isArray(d.points) && d.points.length >= 8) ||
       (typeof d.x === 'number' && typeof d.width === 'number'))
    ).length;

    // Se não obtivemos elementos suficientes, retry com prompt simplificado
    if (validCount < options.expectedCount) {
      console.warn(`[VisionAPI Polygon] Only ${validCount}/${options.expectedCount} valid detections. Retrying with simplified prompt...`);

      try {
        const retryPrompt = generateSimplifiedSegmentationPrompt(options);
        const retryResponseText = await callLLMVisionProvider(config, imageUrl, retryPrompt, 4000);

        console.log(`[VisionAPI Polygon] Retry raw response (${retryResponseText.length} chars):`, retryResponseText.substring(0, 500));

        const retryDetections = extractPolygonJsonFromResponse(retryResponseText);
        if (retryDetections) {
          const retryValidCount = retryDetections.filter(d =>
            d.index >= 1 && d.index <= options.expectedCount &&
            ((d.points && Array.isArray(d.points) && d.points.length >= 8) ||
             (typeof d.x === 'number' && typeof d.width === 'number'))
          ).length;

          console.log(`[VisionAPI Polygon] Retry produced ${retryValidCount} valid detections (was ${validCount})`);

          if (retryValidCount > validCount) {
            rawDetections = retryDetections;
          }
        }
      } catch (retryError) {
        console.warn('[VisionAPI Polygon] Retry failed:', retryError);
        // Continue com os resultados da primeira tentativa
      }
    }

    const validated = validatePolygonDetections(rawDetections, options.imageWidth, options.imageHeight, options.expectedCount);

    console.log(`[VisionAPI Polygon] ${validated.length} elementos detectados e validados`);

    return { success: true, elements: validated };
  } catch (error) {
    return {
      success: false,
      elements: [],
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Converte um DetectedPolygonElement para Region (formato do novo wizard)
 */
export function detectedPolygonToRegion(detected: DetectedPolygonElement): Region {
  const pathData = polygonToPath(detected.points);
  const bounds = pathToBounds(pathData);

  return {
    id: `region-ai-${detected.index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pathData,
    bounds,
    source: 'ai-detected',
  };
}
