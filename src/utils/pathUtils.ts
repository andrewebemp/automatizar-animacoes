import type { Region, RegionBounds } from '../types/Region';
import type { ElementRegion } from '../types/ImageBlock';
import type { ElementShape } from '../types/Element';

/**
 * Utilitários para manipulação de SVG paths.
 * O pathData é a FONTE DA VERDADE para formas - o que você desenha É o que renderiza.
 */

/**
 * Converte um retângulo para SVG path
 */
export function rectToPath(x: number, y: number, width: number, height: number): string {
  return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;
}

/**
 * Converte um array de pontos para SVG path (polígono com linhas retas)
 * @param points Array de coordenadas [x1, y1, x2, y2, ...]
 */
export function polygonToPath(points: number[]): string {
  if (points.length < 6) return ''; // Mínimo 3 pontos (6 valores)

  let path = `M ${points[0]} ${points[1]}`;

  for (let i = 2; i < points.length; i += 2) {
    path += ` L ${points[i]} ${points[i + 1]}`;
  }

  return path + ' Z';
}

/**
 * Converte pontos de freehand para SVG path com curvas suaves (Quadratic Bezier)
 * @param points Array de coordenadas [x1, y1, x2, y2, ...]
 */
export function freehandToPath(points: number[]): string {
  if (points.length < 4) return ''; // Mínimo 2 pontos

  let path = `M ${points[0]} ${points[1]}`;

  // Se só tem 2 pontos, faz uma linha
  if (points.length === 4) {
    return path + ` L ${points[2]} ${points[3]} Z`;
  }

  // Usa Quadratic Bezier curves para suavizar
  for (let i = 2; i < points.length - 2; i += 2) {
    const cpX = points[i];
    const cpY = points[i + 1];
    const endX = (points[i] + points[i + 2]) / 2;
    const endY = (points[i + 1] + points[i + 3]) / 2;
    path += ` Q ${cpX} ${cpY} ${endX} ${endY}`;
  }

  // Último ponto
  const lastX = points[points.length - 2];
  const lastY = points[points.length - 1];
  path += ` L ${lastX} ${lastY}`;

  return path + ' Z';
}

/**
 * Extrai o bounding box de um SVG path
 */
export function pathToBounds(pathData: string): RegionBounds {
  // Extrai todos os números do path
  const nums = pathData.match(/-?\d+\.?\d*/g)?.map(Number) || [];

  if (nums.length < 2) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Itera sobre pares de coordenadas
  for (let i = 0; i < nums.length - 1; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];

    if (!isNaN(x) && !isNaN(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  // Fallback se não encontrou valores válidos
  if (!isFinite(minX) || !isFinite(minY)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Escala um SVG path por um fator
 */
export function scalePath(pathData: string, scale: number): string {
  return pathData.replace(/-?\d+\.?\d*/g, (match) => {
    const num = parseFloat(match);
    if (isNaN(num)) return match;
    return (num * scale).toFixed(2);
  });
}

/**
 * Translada um SVG path por offset x, y
 */
export function translatePath(pathData: string, offsetX: number, offsetY: number): string {
  let index = 0;

  return pathData.replace(/-?\d+\.?\d*/g, (match) => {
    const num = parseFloat(match);
    if (isNaN(num)) return match;

    // Alterna entre X e Y
    const isX = index % 2 === 0;
    index++;

    const offset = isX ? offsetX : offsetY;
    return (num + offset).toFixed(2);
  });
}

/**
 * Escala um SVG path em torno do seu centro
 * @param pathData O SVG path a ser escalado
 * @param scaleFactor Fator de escala (1.0 = sem mudança, 1.1 = 10% maior, 0.9 = 10% menor)
 */
export function scalePathAroundCenter(pathData: string, scaleFactor: number): string {
  // Primeiro, encontra o centro do path
  const bounds = pathToBounds(pathData);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  // Translada para origem, escala, e translada de volta
  let index = 0;

  return pathData.replace(/-?\d+\.?\d*/g, (match) => {
    const num = parseFloat(match);
    if (isNaN(num)) return match;

    const isX = index % 2 === 0;
    index++;

    const center = isX ? centerX : centerY;
    // Move para origem, escala, move de volta
    const scaled = (num - center) * scaleFactor + center;
    return scaled.toFixed(2);
  });
}

/**
 * Cria uma Region a partir de um retângulo
 */
export function createRectRegion(
  x: number,
  y: number,
  width: number,
  height: number
): Region {
  return {
    id: `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pathData: rectToPath(x, y, width, height),
    bounds: { x, y, width, height },
    source: 'manual-rect',
  };
}

/**
 * Cria uma Region a partir de pontos freehand
 */
export function createFreehandRegion(points: number[]): Region {
  const pathData = freehandToPath(points);
  const bounds = pathToBounds(pathData);

  return {
    id: `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pathData,
    bounds,
    source: 'manual-freehand',
  };
}

/**
 * Cria uma Region a partir de polígono (pontos com linhas retas)
 */
export function createPolygonRegion(points: number[]): Region {
  const pathData = polygonToPath(points);
  const bounds = pathToBounds(pathData);

  return {
    id: `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pathData,
    bounds,
    source: 'manual-freehand', // Tratamos polígono como freehand para simplificar
  };
}

/**
 * Converte pontos de polígono para string SVG (para uso com <polygon>)
 */
export function pointsToPolygonString(points: number[]): string {
  const pairs: string[] = [];

  for (let i = 0; i < points.length; i += 2) {
    pairs.push(`${points[i]},${points[i + 1]}`);
  }

  return pairs.join(' ');
}

/**
 * Simplifica um array de pontos usando Douglas-Peucker
 * (para reduzir pontos em desenhos freehand)
 */
export function simplifyPoints(points: number[], tolerance: number = 2): number[] {
  if (points.length <= 6) return points; // Mínimo 3 pontos

  // Converte para array de {x, y}
  const pointObjs: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length; i += 2) {
    pointObjs.push({ x: points[i], y: points[i + 1] });
  }

  // Douglas-Peucker
  const simplified = douglasPeucker(pointObjs, tolerance);

  // Converte de volta para array flat
  const result: number[] = [];
  for (const p of simplified) {
    result.push(p.x, p.y);
  }

  return result;
}

/**
 * Algoritmo Douglas-Peucker para simplificação de linha
 */
function douglasPeucker(
  points: Array<{ x: number; y: number }>,
  tolerance: number
): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;

  // Encontra o ponto mais distante da linha entre primeiro e último
  let maxDist = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // Se a distância máxima é maior que a tolerância, simplifica recursivamente
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);

    // Remove ponto duplicado no meio
    return [...left.slice(0, -1), ...right];
  }

  // Caso contrário, retorna apenas primeiro e último
  return [first, last];
}

/**
 * Calcula a distância perpendicular de um ponto a uma linha
 */
function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // Se a linha é um ponto
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  // Distância perpendicular
  const numerator = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  const denominator = Math.hypot(dx, dy);

  return numerator / denominator;
}

/**
 * Extrai coordenadas de um SVG path como array de pontos [x1, y1, x2, y2, ...]
 * Suporta comandos M, L, Q e Z
 */
export function pathToPoints(pathData: string): number[] {
  if (!pathData) return [];

  const points: number[] = [];

  // Regex para extrair comandos e números do path
  // Matches: M, L, Q, Z e números (incluindo negativos e decimais)
  const regex = /([MLQZ])|(-?\d+\.?\d*)/gi;
  const tokens: string[] = [];

  let match;
  while ((match = regex.exec(pathData)) !== null) {
    tokens.push(match[0]);
  }

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i].toUpperCase();

    if (token === 'M' || token === 'L') {
      // Move or Line: pega os próximos 2 valores como x, y
      if (i + 2 < tokens.length) {
        const x = parseFloat(tokens[i + 1]);
        const y = parseFloat(tokens[i + 2]);
        if (!isNaN(x) && !isNaN(y)) {
          points.push(x, y);
        }
        i += 3;
      } else {
        i++;
      }
    } else if (token === 'Q') {
      // Quadratic Bezier: pega os próximos 4 valores (control point + end point)
      // Só adicionamos o end point para simplificar
      if (i + 4 < tokens.length) {
        // Pula control point (i+1, i+2), pega end point
        const x = parseFloat(tokens[i + 3]);
        const y = parseFloat(tokens[i + 4]);
        if (!isNaN(x) && !isNaN(y)) {
          points.push(x, y);
        }
        i += 5;
      } else {
        i++;
      }
    } else if (token === 'Z') {
      // Close path - não adiciona pontos
      i++;
    } else {
      // Número solto ou comando desconhecido
      i++;
    }
  }

  return points;
}

/**
 * Determina o tipo de shape (ElementShape) baseado na source da região
 */
export function regionSourceToShape(source: Region['source']): ElementShape {
  switch (source) {
    case 'manual-rect':
      return 'rect';
    case 'manual-freehand':
      return 'freehand';
    case 'ai-detected':
      return 'freehand'; // IA agora retorna polígonos
    default:
      return 'rect';
  }
}

/**
 * Converte uma Region (novo formato com pathData) para ElementRegion (formato antigo)
 * Necessário para compatibilidade com ImageBlockRenderer
 */
export function regionToElementRegion(region: Region): ElementRegion {
  const shape = regionSourceToShape(region.source);

  // Extrai pontos do pathData
  const points = pathToPoints(region.pathData);

  return {
    x: region.bounds.x,
    y: region.bounds.y,
    width: region.bounds.width,
    height: region.bounds.height,
    shape,
    points: points.length >= 6 ? points : undefined,
  };
}
