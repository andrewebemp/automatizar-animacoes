import React from 'react';
import type { WizardStep } from '../../types/ProjectData';

interface WizardStepperProps {
  currentStep: WizardStep;
  onStepClick?: (step: WizardStep) => void;
}

const STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: 'upload-script', label: 'Roteiro', icon: '1' },
  { key: 'upload-srt', label: 'Upload SRT', icon: '2' },
  { key: 'review-prompts', label: 'Revisar Prompts', icon: '3' },
  { key: 'upload-images', label: 'Upload Imagens', icon: '4' },
  { key: 'preview-validation', label: 'Validação', icon: '5' },
  { key: 'export', label: 'Exportar', icon: '6' },
];

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    flexShrink: 0,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
  },
  stepCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.3s ease',
  },
  stepCirclePending: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#64748b',
    border: '2px solid rgba(255, 255, 255, 0.1)',
  },
  stepCircleActive: {
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    border: '2px solid transparent',
    boxShadow: '0 0 20px rgba(124, 58, 237, 0.4)',
  },
  stepCircleCompleted: {
    background: '#22c55e',
    color: '#fff',
    border: '2px solid #22c55e',
  },
  stepLabel: {
    fontSize: '12px',
    fontWeight: 500,
    transition: 'color 0.3s ease',
    whiteSpace: 'nowrap' as const,
  },
  stepLabelPending: {
    color: '#64748b',
  },
  stepLabelActive: {
    color: '#fff',
  },
  stepLabelCompleted: {
    color: '#22c55e',
  },
  connector: {
    width: '40px',
    height: '2px',
    margin: '0 8px',
    marginBottom: '24px',
    transition: 'background 0.3s ease',
  },
  connectorPending: {
    background: 'rgba(255, 255, 255, 0.1)',
  },
  connectorCompleted: {
    background: 'linear-gradient(90deg, #22c55e, #22c55e)',
  },
};

export const WizardStepper: React.FC<WizardStepperProps> = ({
  currentStep,
  onStepClick,
}) => {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  const getStepStatus = (index: number): 'pending' | 'active' | 'completed' => {
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'active';
    return 'pending';
  };

  const handleStepClick = (step: WizardStep, index: number) => {
    if (onStepClick && index <= currentIndex) {
      onStepClick(step);
    }
  };

  return (
    <div style={styles.container}>
      {STEPS.map((step, index) => {
        const status = getStepStatus(index);
        const isLast = index === STEPS.length - 1;

        return (
          <React.Fragment key={step.key}>
            <div
              style={{
                ...styles.step,
                cursor: index <= currentIndex ? 'pointer' : 'default',
                opacity: status === 'pending' ? 0.5 : 1,
              }}
              onClick={() => handleStepClick(step.key, index)}
            >
              <div style={styles.stepContent}>
                <div
                  style={{
                    ...styles.stepCircle,
                    ...(status === 'pending' && styles.stepCirclePending),
                    ...(status === 'active' && styles.stepCircleActive),
                    ...(status === 'completed' && styles.stepCircleCompleted),
                  }}
                >
                  {status === 'completed' ? '✓' : step.icon}
                </div>
                <span
                  style={{
                    ...styles.stepLabel,
                    ...(status === 'pending' && styles.stepLabelPending),
                    ...(status === 'active' && styles.stepLabelActive),
                    ...(status === 'completed' && styles.stepLabelCompleted),
                  }}
                >
                  {step.label}
                </span>
              </div>
            </div>
            {!isLast && (
              <div
                style={{
                  ...styles.connector,
                  ...(index < currentIndex
                    ? styles.connectorCompleted
                    : styles.connectorPending),
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WizardStepper;
