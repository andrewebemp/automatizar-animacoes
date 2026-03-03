import React from 'react';
import type { Element, Subtitle } from '../../types';

interface ElementListProps {
  elements: Element[];
  subtitles: Subtitle[];
  onDelete: (elementId: string) => void;
  onMapToSubtitle: (elementId: string, subtitleIndex: number) => void;
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  item: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#0f3460',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemLabel: {
    fontWeight: 500,
    fontSize: 14,
    color: '#4ecdc4',
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    color: '#ff6b6b',
    cursor: 'pointer',
    padding: 4,
    fontSize: 14,
  },
  select: {
    width: '100%',
    padding: 8,
    borderRadius: 4,
    border: '1px solid #16213e',
    backgroundColor: '#1a1a2e',
    color: '#ccc',
    fontSize: 13,
    cursor: 'pointer',
  },
  subtitlePreview: {
    marginTop: 8,
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#1a1a2e',
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  emptyState: {
    textAlign: 'center' as const,
    color: '#666',
    padding: 20,
    fontSize: 14,
  },
  noSubtitles: {
    color: '#ff6b6b',
    fontSize: 12,
    textAlign: 'center' as const,
    padding: 8,
  },
};

export const ElementList: React.FC<ElementListProps> = ({
  elements,
  subtitles,
  onDelete,
  onMapToSubtitle,
}) => {
  if (elements.length === 0) {
    return (
      <div style={styles.emptyState}>
        Desenhe retângulos na cena selecionada para criar elementos
      </div>
    );
  }

  if (subtitles.length === 0) {
    return (
      <>
        <div style={styles.noSubtitles}>
          Carregue um arquivo SRT para mapear elementos às legendas
        </div>
        <div style={styles.list}>
          {elements.map((element) => (
            <div key={element.id} style={styles.item}>
              <div style={styles.itemHeader}>
                <span style={styles.itemLabel}>{element.label}</span>
                <button
                  style={styles.deleteButton}
                  onClick={() => onDelete(element.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div style={styles.list}>
      {elements.map((element) => {
        const mappedSubtitle =
          element.subtitleIndex >= 0 ? subtitles[element.subtitleIndex] : null;

        return (
          <div key={element.id} style={styles.item}>
            <div style={styles.itemHeader}>
              <span style={styles.itemLabel}>{element.label}</span>
              <button
                style={styles.deleteButton}
                onClick={() => onDelete(element.id)}
              >
                ✕
              </button>
            </div>

            <select
              style={styles.select}
              value={element.subtitleIndex}
              onChange={(e) =>
                onMapToSubtitle(element.id, parseInt(e.target.value, 10))
              }
            >
              <option value={-1}>Selecione uma legenda...</option>
              {subtitles.map((subtitle, index) => (
                <option key={subtitle.id} value={index}>
                  [{subtitle.id}] {subtitle.text.substring(0, 40)}
                  {subtitle.text.length > 40 ? '...' : ''}
                </option>
              ))}
            </select>

            {mappedSubtitle && (
              <div style={styles.subtitlePreview}>
                "{mappedSubtitle.text}"
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
