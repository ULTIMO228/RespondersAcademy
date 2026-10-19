import Link from "next/link";

import styles from "./ErrorMap.module.css";

export interface ViewSwitchProps {
  active: "map" | "journal";
  mapHref: string;
  journalHref: string;
}

/** Переключатель «Карта / Журнал»: два адреса одного раздела, текущий помечен `aria-current` и словом, не только цветом. */
export function ViewSwitch({ active, mapHref, journalHref }: ViewSwitchProps) {
  const items = [
    { id: "map", title: "Карта", href: mapHref },
    { id: "journal", title: "Журнал", href: journalHref },
  ] as const;
  return (
    <nav className={styles.viewSwitch} aria-label="Вид раздела">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={[styles.viewSwitch__link, item.id === active ? styles["viewSwitch__link--active"] : ""]
            .filter(Boolean)
            .join(" ")}
          aria-current={item.id === active ? "page" : undefined}
        >
          {item.title}
        </Link>
      ))}
    </nav>
  );
}
