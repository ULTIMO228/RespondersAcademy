"use client";

import { useState } from "react";

import { Button, Input, Modal, Panel } from "@/shared/ui";

import type { HelpMaterial } from "../config/materials";

import styles from "./HelpPage.module.css";

type HelpMaterialsProps = {
  materials: HelpMaterial[];
};

function matchesTitle(material: HelpMaterial, query: string): boolean {
  return material.title.toLowerCase().includes(query.trim().toLowerCase());
}

/** Список методических материалов: поиск по названию и вьювер-заглушка по клику. */
export function HelpMaterials({ materials }: HelpMaterialsProps) {
  const [query, setQuery] = useState("");
  const [openedMaterial, setOpenedMaterial] = useState<HelpMaterial | null>(null);
  const visibleMaterials = materials.filter((material) => matchesTitle(material, query));

  return (
    <Panel title="Методические материалы" headerTone="dark">
      <Input
        label="Поиск по названию"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={styles.materials__search}
      />
      <ul className={styles.materials}>
        {visibleMaterials.map((material) => (
          <li key={material.id} className={styles.materials__item}>
            <span className={styles.materials__format} data-format={material.format}>
              {material.format}
            </span>
            <span className={styles.materials__body}>
              <span className={styles.materials__title}>{material.title}</span>
              <span className={styles.materials__description}>{material.description}</span>
            </span>
            {material.anchor ? (
              <a className={styles.materials__link} href={`#${material.anchor}`}>
                Перейти
              </a>
            ) : (
              <Button
                size="sm"
                onClick={() => setOpenedMaterial(material)}
                title={`Открыть «${material.title}»`}
              >
                Открыть
              </Button>
            )}
          </li>
        ))}
      </ul>
      {visibleMaterials.length === 0 ? <p className={styles.materials__empty}>Материалы не найдены</p> : null}
      {openedMaterial ? (
        <Modal
          title={openedMaterial.title}
          onClose={() => setOpenedMaterial(null)}
          footer={<Button onClick={() => setOpenedMaterial(null)}>Закрыть</Button>}
        >
          <div className={styles.viewer} role="document" aria-label="Просмотр документа">
            <p className={styles.viewer__meta}>Формат: {openedMaterial.format} · только чтение</p>
            <p>{openedMaterial.description}</p>
            <p className={styles.viewer__stub}>
              Встроенный вьювер-заглушка: полный текст документа подключается при наполнении справочной базы
              (ТЗ §12). Материал доступен только для просмотра.
            </p>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}
