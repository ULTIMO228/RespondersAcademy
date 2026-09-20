import { useState } from "react";

import type { SignTreeNode } from "../model/types";
import styles from "./AdvancedSearch.module.css";

type SignTreeProps = {
  nodes: SignTreeNode[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

/** Поиск ПОВ-112 работает по 1–2-му уровню дерева; 3-й виден, но не выбирается (ограничение оригинала). */
const THIRD_LEVEL = 3;

type TreeBranchProps = {
  node: SignTreeNode;
  level: number;
  selected: string[];
  onToggle: (label: string) => void;
};

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d={isOpen ? "M1 3l4 4 4-4" : "M3 1l4 4-4 4"} />
    </svg>
  );
}

function TreeBranch({ node, level, selected, onToggle }: TreeBranchProps) {
  const [isOpen, setIsOpen] = useState(false);
  if (level >= THIRD_LEVEL) {
    return (
      <li
        className={[styles["advanced-search__tree-leaf"], styles["advanced-search__tree-leaf--off"]].join(
          " ",
        )}
        title="Поиск по 3-му уровню не работает"
      >
        {node.label}
      </li>
    );
  }
  const isSelected = selected.includes(node.label);
  return (
    <li className={styles["advanced-search__tree-node"]}>
      {node.children.length > 0 ? (
        <button
          type="button"
          className={styles["advanced-search__tree-toggle"]}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Свернуть" : "Развернуть"}: ${node.label}`}
          onClick={() => setIsOpen((current) => !current)}
        >
          <ChevronIcon isOpen={isOpen} />
        </button>
      ) : null}
      <button
        type="button"
        className={[
          styles["advanced-search__tree-select"],
          isSelected ? styles["advanced-search__tree-select--selected"] : "",
        ].join(" ")}
        aria-pressed={isSelected}
        onClick={() => onToggle(node.label)}
      >
        {node.label}
      </button>
      {isOpen ? (
        <ul className={styles["advanced-search__tree-children"]}>
          {node.children.map((child) => (
            <TreeBranch
              key={child.label}
              node={child}
              level={level + 1}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Дерево признаков (как в опросной карте): выбор признаков 1–2-го уровня, 3-й помечен ограничением. */
export function SignTree({ nodes, selected, onChange }: SignTreeProps) {
  function handleToggle(label: string) {
    onChange(selected.includes(label) ? selected.filter((item) => item !== label) : [...selected, label]);
  }
  return (
    <ul className={styles["advanced-search__tree"]}>
      {nodes.map((node) => (
        <TreeBranch key={node.label} node={node} level={1} selected={selected} onToggle={handleToggle} />
      ))}
    </ul>
  );
}
