"use client";

import { useState } from "react";

import type { TrainingMaterial } from "@/shared/api";
import { Card, EmptyState, PlatformButton, Tag } from "@/shared/ui/platform";

import { HELP_MATERIALS } from "../config/materials";
import type { HelpMaterial } from "../config/materials";
import { filterMaterials } from "../lib/search";
import styles from "./Reference.module.css";

type MaterialsTabProps = { query: string; uploaded: TrainingMaterial[]; onOpenHotkeys: () => void };

function fromUploaded(material: TrainingMaterial): HelpMaterial {
  return {
    id: material.id,
    title: material.name,
    format: material.format,
    description: `Загружено преподавателем · ${Math.max(1, Math.round(material.sizeBytes / 1024))} КБ`,
  };
}

/** Памятки: встроенные методические материалы и файлы, загруженные преподавателем. Только чтение. */
export function MaterialsTab({ query, uploaded, onOpenHotkeys }: MaterialsTabProps) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const items = filterMaterials([...HELP_MATERIALS, ...uploaded.map(fromUploaded)], query);
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState title="Материалы не найдены" text="Измените запрос." />
      </Card>
    );
  }
  return (
    <Card>
      <ul className={styles.materials}>
        {items.map((material) => (
          <li key={material.id} className={styles.materials__item}>
            <Tag tone={material.format === "Справка" ? "info" : "neutral"}>{material.format}</Tag>
            <span className={styles.materials__body}>
              <b>{material.title}</b>
              <span className={styles.muted}>{material.description}</span>
              {openedId === material.id ? (
                <span className={styles.materials__viewer} role="document" aria-label="Просмотр документа">
                  Формат: {material.format} · только чтение. Встроенный вьювер-заглушка: полный текст
                  документа подключается при наполнении справочной базы (ТЗ §12).
                </span>
              ) : null}
            </span>
            {material.anchor ? (
              <PlatformButton onClick={onOpenHotkeys}>Перейти</PlatformButton>
            ) : (
              <PlatformButton
                aria-expanded={openedId === material.id}
                onClick={() => setOpenedId(openedId === material.id ? null : material.id)}
                title={`Открыть «${material.title}»`}
              >
                {openedId === material.id ? "Свернуть" : "Открыть"}
              </PlatformButton>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
