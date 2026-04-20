import { TelemetryData, ImpactEvent } from '../store/crashStore';

export interface SafetyInsight {
  score: number;
  level: 'stable' | 'caution' | 'high';
  recommendationEs: string;
  recommendationEn: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const buildSafetyInsight = (
  telemetry: TelemetryData,
  impacts: ImpactEvent[],
  impactThreshold: number
): SafetyInsight => {
  const latestG = telemetry.g_force;
  const normalizedG = clamp((latestG / Math.max(impactThreshold, 1)) * 100, 0, 180);
  const recentRealImpacts = impacts.filter((impact) => !impact.was_false_alarm).slice(0, 5).length;
  const trendPenalty = recentRealImpacts * 8;
  const rawRisk = normalizedG * 0.6 + trendPenalty;
  const score = Math.round(clamp(100 - rawRisk, 0, 100));

  if (score >= 70) {
    return {
      score,
      level: 'stable',
      recommendationEs: 'Estado estable. Mantén velocidad constante y distancia segura.',
      recommendationEn: 'Stable state. Keep constant speed and safe following distance.',
    };
  }

  if (score >= 40) {
    return {
      score,
      level: 'caution',
      recommendationEs: 'Precaución activa. Reduce velocidad y evita maniobras bruscas.',
      recommendationEn: 'Active caution. Reduce speed and avoid sudden maneuvers.',
    };
  }

  return {
    score,
    level: 'high',
    recommendationEs: 'Riesgo alto detectado. Detente en zona segura y revisa el entorno.',
    recommendationEn: 'High risk detected. Stop in a safe zone and reassess surroundings.',
  };
};
