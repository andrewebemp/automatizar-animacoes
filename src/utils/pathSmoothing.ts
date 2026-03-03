/**
 * Path Smoothing Utilities
 *
 * Funções para suavizar e simplificar paths de desenho freehand
 */

interface Point {
  x: number;
  y: number;
}

/**
 * Converte array flat [x1, y1, x2, y2, ...] para array de Points
 */
export function pointsToArray(points: number[]): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push({ x: points[i], y: points[i + 1] });
  }
  return result;
}

/**
 * Converte array de Points para array flat [x1, y1, x2, y2, ...]
 */
export function arrayToPoints(pts: Point[]): number[] {
  const result: number[] = [];
  for (const pt of pts) {
    result.push(pt.x, pt.y);
  }
  return result;
}

/**
 * Catmull-Rom spline interpolation
 */
function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number, tension: number = 0.5): Point {
  const t2 = t * t;
  const t3 = t2 * t;

  const v0x = (p2.x - p0.x) * tension;
  const v0y = (p2.y - p0.y) * tension;
  const v1x = (p3.x - p1.x) * tension;
  const v1y = (p3.y - p1.y) * tension;

  const a = 2 * t3 - 3 * t2 + 1;
  const b = t3 - 2 * t2 + t;
  const c = -2 * t3 + 3 * t2;
  const d = t3 - t2;

  return {
    x: a * p1.x + b * v0x + c * p2.x + d * v1x,
    y: a * p1.y + b * v0y + c * p2.y + d * v1y,
  };
}

/**
 * Suaviza pontos de um traço freehand usando Catmull-Rom spline
 *
 * @param points Array flat de pontos [x1, y1, x2, y2, ...]
 * @param tension Tensão da curva (0-1, default 0.5)
 * @param segments Número de segmentos entre cada par de pontos
 */
export function smoothFreehandPath(points: number[], tension: number = 0.5, segments: number = 4): number[] {
  if (points.length < 6) return points; // Precisa de pelo menos 3 pontos

  const pts = pointsToArray(points);
  if (pts.length < 3) return points;

  const smoothed: Point[] = [];

  // Para cada segmento entre pontos consecutivos
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length - 1, i + 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Adiciona ponto original
    smoothed.push(p1);

    // Adiciona pontos interpolados (exceto no último segmento)
    if (i < pts.length - 2) {
      for (let j = 1; j < segments; j++) {
        const t = j / segments;
        smoothed.push(catmullRom(p0, p1, p2, p3, t, tension));
      }
    }
  }

  // Adiciona último ponto
  smoothed.push(pts[pts.length - 1]);

  return arrayToPoints(smoothed);
}

/**
 * Calcula distância perpendicular de um ponto a uma linha
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return 0;

  const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);

  const closestX = lineStart.x + u * dx;
  const closestY = lineStart.y + u * dy;

  const distX = point.x - closestX;
  const distY = point.y - closestY;

  return Math.sqrt(distX * distX + distY * distY);
}

/**
 * Algoritmo Douglas-Peucker para simplificação de curvas
 */
function douglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  const first = points[0];
  const last = points[points.length - 1];

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [first, last];
  }
}

/**
 * Simplifica path removendo pontos redundantes (Douglas-Peucker)
 *
 * @param points Array flat de pontos [x1, y1, x2, y2, ...]
 * @param tolerance Tolerância para simplificação (pixels)
 */
export function simplifyPath(points: number[], tolerance: number = 2): number[] {
  if (points.length < 6) return points;

  const pts = pointsToArray(points);
  const simplified = douglasPeucker(pts, tolerance);

  return arrayToPoints(simplified);
}

/**
 * Processa um path freehand: simplifica e suaviza
 *
 * @param points Array flat de pontos [x1, y1, x2, y2, ...]
 * @param simplifyTolerance Tolerância para simplificação
 * @param smoothTension Tensão da suavização
 */
export function processFreehandPath(
  points: number[],
  simplifyTolerance: number = 3,
  smoothTension: number = 0.5
): number[] {
  if (points.length < 6) return points;

  // Primeiro simplifica para remover ruído
  const simplified = simplifyPath(points, simplifyTolerance);

  // Se ficou muito simplificado, retorna simplificado apenas
  if (simplified.length < 6) return simplified;

  // Depois suaviza para criar curvas mais naturais
  const smoothed = smoothFreehandPath(simplified, smoothTension, 3);

  return smoothed;
}

/**
 * Calcula o bounding box de um conjunto de pontos
 */
export function calculateBoundingBox(points: number[]): { x: number; y: number; width: number; height: number } {
  if (points.length < 2) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Converte pontos para string SVG polygon/polyline
 */
export function pointsToSvgString(points: number[]): string {
  const result: string[] = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push(`${points[i]},${points[i + 1]}`);
  }
  return result.join(' ');
}
