from __future__ import annotations

import csv
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path


CATALOG_PATH = Path(__file__).with_name("Actions - catalogue.csv")
OUTPUT_PATH = Path(__file__).with_name("actions_selection.csv")

TARGET_RESOURCE_CATEGORIES = [
    "Technique",
    "Humaines",
    "Organisationnelles",
    "Solutions fondées sur la nature",
    "Financières",
]

TARGET_TERMS = ["Court terme", "Moyen terme", "Long terme"]

PER_RESOURCE_TARGET = 12
MIN_TERM_PER_RESOURCE = 3  # 20% of 12 -> 2.4, rounded up.
SCORE_TARGETS = {score: 2 for score in range(11)}
MAX_ATTEMPTS = 300
RANDOM_SEED_BASE = 42


def load_catalog(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def get_row_value(row: dict[str, str], *keys: str, default: str = "") -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and value.strip():
            return value.strip()
    return default


def get_unique_company_categories(rows: list[dict[str, str]]) -> list[tuple[str, int]]:
    counts = Counter(get_row_value(row, "Catégorie entreprise", "Catégorie entreprise") for row in rows)
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))


def prompt_company_categories(available: list[tuple[str, int]]) -> list[str]:
    print("Catégories entreprise disponibles :")
    for index, (category, count) in enumerate(available, start=1):
        print(f"{index:>2}. {category} ({count})")

    while True:
        raw = input(
            "\nChoisis une ou plusieurs catégories par numéro, séparées par des virgules : "
        ).strip()
        if not raw:
            print("Entrée vide. Réessaie.")
            continue

        try:
            indexes = [int(part.strip()) for part in raw.split(",") if part.strip()]
        except ValueError:
            print("Format invalide. Utilise des numéros séparés par des virgules.")
            continue

        if not indexes:
            print("Aucune catégorie sélectionnée. Réessaie.")
            continue

        selected: list[str] = []
        invalid = False
        for index in indexes:
            if index < 1 or index > len(available):
                print(f"Numéro hors plage : {index}")
                invalid = True
                break
            selected.append(available[index - 1][0])

        if invalid:
            continue

        deduped = list(dict.fromkeys(selected))
        print("\nCatégories entreprise retenues :")
        for category in deduped:
            print(f"- {category}")
        confirm = input("\nConfirmer ? [o/N] : ").strip().lower()
        if confirm in {"o", "oui", "y", "yes"}:
            return deduped


def get_action_title(row: dict[str, str]) -> str:
    for key in (
        "Titre de l’action d’adaptation",
        "Titre de l'action d'adaptation",
        "Titre de l’action",
        "Titre de l'action",
        "Titre",
    ):
        value = row.get(key, "").strip()
        if value:
            return value
    return "(sans titre)"


def prompt_forced_actions(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    max_line = len(rows) + 1

    while True:
        raw = input(
            "\nSi tu veux imposer certaines actions, indique leurs numéros de ligne du catalogue "
            "(ligne 1 = en-tête, première action = ligne 2), séparés par des virgules. "
            "Laisse vide pour aucune : "
        ).strip()

        if not raw:
            return []

        try:
            line_numbers = [int(part.strip()) for part in raw.split(",") if part.strip()]
        except ValueError:
            print("Format invalide. Utilise des numéros de ligne séparés par des virgules.")
            continue

        if not line_numbers:
            print("Aucune ligne sélectionnée. Réessaie.")
            continue

        line_numbers = list(dict.fromkeys(line_numbers))

        invalid = [line for line in line_numbers if line < 2 or line > max_line]
        if invalid:
            print(
                "Numéro(s) de ligne hors plage : "
                + ", ".join(map(str, invalid))
                + f". Les actions du catalogue vont de 2 à {max_line}."
            )
            continue

        forced_rows: list[dict[str, str]] = []
        invalid_resources: list[int] = []
        for line in line_numbers:
            row = rows[line - 2]
            if get_row_value(row, "Catégorie ressources", "Catégorie ressources") not in TARGET_RESOURCE_CATEGORIES:
                invalid_resources.append(line)
                continue
            forced_rows.append(row)

        if invalid_resources:
            print(
                "Ces lignes ne peuvent pas être imposées car elles ne sont pas dans les "
                "catégories de ressources ciblées : "
                + ", ".join(map(str, invalid_resources))
            )
            continue

        print("\nActions imposées :")
        for line, row in zip(line_numbers, forced_rows):
            print(f"- ligne {line} : {get_action_title(row)}")

        confirm = input("\nConfirmer ? [o/N] : ").strip().lower()
        if confirm in {"o", "oui", "y", "yes"}:
            return forced_rows


def row_id(row: dict[str, str]) -> int:
    return id(row)


def parse_score(row: dict[str, str]) -> int:
    try:
        return int(get_row_value(row, "Score"))
    except (KeyError, ValueError) as exc:
        raise ValueError(f"Score invalide dans la ligne : {row}") from exc


def count_scores(rows: list[dict[str, str]]) -> Counter[int]:
    return Counter(parse_score(row) for row in rows)


def count_terms(rows: list[dict[str, str]]) -> Counter[str]:
    return Counter(get_row_value(row, "Temps") for row in rows)


def pick_best_candidate(
    candidates: list[dict[str, str]],
    score_deficits: Counter[int],
    preferred_company_categories: set[str],
    rng: random.Random,
) -> dict[str, str]:
    score_pool = Counter(parse_score(row) for row in candidates)

    def priority(row: dict[str, str]) -> tuple[int, int, int]:
        score = parse_score(row)
        score_needed = 0 if score_deficits[score] > 0 else 1
        preferred_company = 0 if get_row_value(row, "Catégorie entreprise", "Catégorie entreprise") in preferred_company_categories else 1
        rarity = score_pool[score]
        return (score_needed, preferred_company, rarity)

    best_priority = min(priority(row) for row in candidates)
    best_candidates = [row for row in candidates if priority(row) == best_priority]
    return rng.choice(best_candidates)


def validate_selection(selected: list[dict[str, str]]) -> None:
    if len(selected) != PER_RESOURCE_TARGET * len(TARGET_RESOURCE_CATEGORIES):
        raise ValueError(
            f"Le lot final contient {len(selected)} actions au lieu de "
            f"{PER_RESOURCE_TARGET * len(TARGET_RESOURCE_CATEGORIES)}."
        )

    by_resource: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in selected:
        by_resource[get_row_value(row, "Catégorie ressources", "Catégorie ressources")].append(row)

    for resource in TARGET_RESOURCE_CATEGORIES:
        resource_rows = by_resource.get(resource, [])
        if len(resource_rows) != PER_RESOURCE_TARGET:
            raise ValueError(
                f"La catégorie ressource '{resource}' contient {len(resource_rows)} actions au lieu de {PER_RESOURCE_TARGET}."
            )

        term_counts = count_terms(resource_rows)
        for term in TARGET_TERMS:
            if term_counts[term] < MIN_TERM_PER_RESOURCE:
                raise ValueError(
                    f"La catégorie ressource '{resource}' n'atteint pas le minimum de "
                    f"{MIN_TERM_PER_RESOURCE} actions pour '{term}'."
                )


def attempt_selection(
    eligible_rows: list[dict[str, str]],
    preferred_company_categories: set[str],
    rng: random.Random,
    forced_rows: list[dict[str, str]] | None = None,
) -> list[dict[str, str]] | None:
    forced_rows = forced_rows or []
    selected = list(forced_rows)
    used = {row_id(row) for row in forced_rows}
    global_score_counts: Counter[int] = count_scores(forced_rows)
    forced_by_resource: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in forced_rows:
        forced_by_resource[get_row_value(row, "Catégorie ressources", "Catégorie ressources")].append(row)

    rows_by_resource: dict[str, list[dict[str, str]]] = {
        resource: [row for row in eligible_rows if get_row_value(row, "Catégorie ressources", "Catégorie ressources") == resource]
        for resource in TARGET_RESOURCE_CATEGORIES
    }

    for resource, pool in rows_by_resource.items():
        forced_resource_rows = forced_by_resource.get(resource, [])
        forced_count = len(forced_resource_rows)
        if forced_count > PER_RESOURCE_TARGET:
            return None

        resource_pool = [row for row in pool if row_id(row) not in used]
        if len(resource_pool) + forced_count < PER_RESOURCE_TARGET:
            return None

        term_counts = count_terms(forced_resource_rows)
        for term in TARGET_TERMS:
            required = max(0, MIN_TERM_PER_RESOURCE - term_counts[term])
            available = sum(1 for row in resource_pool if get_row_value(row, "Temps") == term)
            if available < required:
                return None

    for resource in TARGET_RESOURCE_CATEGORIES:
        resource_pool = [row for row in rows_by_resource[resource] if row_id(row) not in used]
        forced_resource_rows = forced_by_resource.get(resource, [])
        forced_term_counts = count_terms(forced_resource_rows)

        term_requirements = {
            term: max(0, MIN_TERM_PER_RESOURCE - forced_term_counts[term])
            for term in TARGET_TERMS
        }

        term_order = sorted(
            TARGET_TERMS,
            key=lambda term: sum(1 for row in resource_pool if get_row_value(row, "Temps") == term),
        )

        for term in term_order:
            for _ in range(term_requirements[term]):
                candidates = [
                    row
                    for row in resource_pool
                    if get_row_value(row, "Temps") == term and row_id(row) not in used
                ]
                if not candidates:
                    return None
                chosen = pick_best_candidate(
                    candidates,
                    global_score_counts,
                    preferred_company_categories,
                    rng,
                )
                selected.append(chosen)
                used.add(row_id(chosen))
                global_score_counts[parse_score(chosen)] += 1
                resource_pool = [row for row in resource_pool if row_id(row) not in used]

        while len([row for row in selected if get_row_value(row, "Catégorie ressources", "Catégorie ressources") == resource]) < PER_RESOURCE_TARGET:
            candidates = [row for row in resource_pool if row_id(row) not in used]
            if not candidates:
                return None
            chosen = pick_best_candidate(
                candidates,
                global_score_counts,
                preferred_company_categories,
                rng,
            )
            selected.append(chosen)
            used.add(row_id(chosen))
            global_score_counts[parse_score(chosen)] += 1
            resource_pool = [row for row in resource_pool if row_id(row) not in used]

    repair_score_deficits(eligible_rows, selected, global_score_counts, rng)

    return selected


def repair_score_deficits(
    eligible_rows: list[dict[str, str]],
    selected: list[dict[str, str]],
    score_counts: Counter[int],
    rng: random.Random,
) -> bool:
    selected_set = {row_id(row) for row in selected}
    eligible_by_resource: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in eligible_rows:
        eligible_by_resource[get_row_value(row, "Catégorie ressources", "Catégorie ressources")].append(row)

    while True:
        missing_scores = [score for score, target in SCORE_TARGETS.items() if score_counts[score] < target]
        if not missing_scores:
            return True

        progress = False
        for missing_score in missing_scores:
            found_swap = False
            for resource, resource_rows in eligible_by_resource.items():
                resource_selected = [
                    row for row in selected if get_row_value(row, "Catégorie ressources", "Catégorie ressources") == resource
                ]
                term_counts = Counter(get_row_value(row, "Temps") for row in resource_selected)

                removable = [
                    row
                    for row in resource_selected
                    if score_counts[parse_score(row)] > SCORE_TARGETS.get(parse_score(row), 0)
                    and term_counts[get_row_value(row, "Temps")] > MIN_TERM_PER_RESOURCE
                ]
                incoming = [
                    row
                    for row in resource_rows
                    if row_id(row) not in selected_set and parse_score(row) == missing_score
                ]
                if not removable or not incoming:
                    continue

                removable_priority = max(
                    (
                        score_counts[parse_score(row)],
                        term_counts[get_row_value(row, "Temps")],
                    )
                    for row in removable
                )
                removable = [
                    row
                    for row in removable
                    if (
                        score_counts[parse_score(row)],
                        term_counts[get_row_value(row, "Temps")],
                    ) == removable_priority
                ]
                incoming = [row for row in incoming if parse_score(row) == missing_score]

                remove_row = rng.choice(removable)
                add_row = rng.choice(incoming)
                selected.remove(remove_row)
                selected.append(add_row)
                selected_set.remove(row_id(remove_row))
                selected_set.add(row_id(add_row))
                score_counts[parse_score(remove_row)] -= 1
                score_counts[missing_score] += 1
                progress = True
                found_swap = True
                break

            if found_swap:
                break

        if not progress:
            return False


def write_output(rows: list[dict[str, str]], output_path: Path) -> None:
    fieldnames = list(rows[0].keys())
    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def print_summary(rows: list[dict[str, str]], preferred_company_categories: set[str]) -> None:
    print("\nSélection finale :")
    by_resource = defaultdict(list)
    for row in rows:
        by_resource[get_row_value(row, "Catégorie ressources", "Catégorie ressources")].append(row)

    preferred_count = 0
    for resource in TARGET_RESOURCE_CATEGORIES:
        resource_rows = by_resource[resource]
        term_counts = count_terms(resource_rows)
        score_counts = count_scores(resource_rows)
        preferred_count += sum(
            1 for row in resource_rows if get_row_value(row, "Catégorie entreprise", "Catégorie entreprise") in preferred_company_categories
        )
        print(f"\n{resource} : {len(resource_rows)} actions")
        for term in TARGET_TERMS:
            print(f"  - {term}: {term_counts[term]}")
        print("  - scores: " + ", ".join(f"{score}={score_counts[score]}" for score in range(11)))

    total_scores = count_scores(rows)
    fallback_count = len(rows) - preferred_count
    missing_scores = [score for score, target in SCORE_TARGETS.items() if total_scores[score] < target]
    print("\nScores globaux :")
    print(", ".join(f"{score}={total_scores[score]}" for score in range(11)))
    if missing_scores:
        print(
            "Scores non couverts à hauteur de 2 dans le résultat final : "
            + ", ".join(map(str, missing_scores))
        )
    print(f"\nActions issues des catégories choisies : {preferred_count}")
    print(f"Actions issues d'autres catégories entreprise : {fallback_count}")
    print(f"\nCSV généré : {OUTPUT_PATH}")


def main() -> int:
    if not CATALOG_PATH.exists():
        print(f"Fichier introuvable : {CATALOG_PATH}", file=sys.stderr)
        return 1

    rows = load_catalog(CATALOG_PATH)
    if not rows:
        print("Le catalogue est vide.", file=sys.stderr)
        return 1

    company_categories = get_unique_company_categories(rows)
    selected_company_categories = prompt_company_categories(company_categories)
    preferred_company_categories = set(selected_company_categories)
    forced_rows = prompt_forced_actions(rows)

    if len(forced_rows) > PER_RESOURCE_TARGET * len(TARGET_RESOURCE_CATEGORIES):
        print(
            "Trop d'actions imposées : elles dépassent le nombre total de cases disponibles "
            "dans le CSV final.",
            file=sys.stderr,
        )
        return 1

    forced_counts_by_resource = Counter(
        get_row_value(row, "Catégorie ressources", "Catégorie ressources") for row in forced_rows
    )
    too_many_for_resource = [
        resource
        for resource, count in forced_counts_by_resource.items()
        if count > PER_RESOURCE_TARGET
    ]
    if too_many_for_resource:
        print(
            "Certaines catégories de ressources ont trop d'actions imposées : "
            + ", ".join(too_many_for_resource)
            + f" (maximum {PER_RESOURCE_TARGET} par catégorie).",
            file=sys.stderr,
        )
        return 1

    eligible_rows = [
        row
        for row in rows
        if get_row_value(row, "Catégorie ressources", "Catégorie ressources") in TARGET_RESOURCE_CATEGORIES
    ]

    if not eligible_rows:
        print("Aucune ligne ne correspond aux catégories ressource ciblées.", file=sys.stderr)
        return 1

    target_rows = [
        row
        for row in rows
        if get_row_value(row, "Catégorie ressources", "Catégorie ressources") in TARGET_RESOURCE_CATEGORIES
    ]
    target_score_counts = count_scores(target_rows)
    impossible_scores = [score for score, target in SCORE_TARGETS.items() if target_score_counts[score] < target]
    selected: list[dict[str, str]] | None = None
    if impossible_scores:
        print(
            "Avertissement : impossible de garantir 2 actions pour chaque score dans les 5 catégories de ressource ciblées."
        )
        print(
            "Scores insuffisants dans ce sous-ensemble : "
            + ", ".join(map(str, impossible_scores))
            + "."
        )
        print(
            "Le script va quand même produire un CSV best-effort en respectant d'abord les catégories de ressource, "
            "les catégories d'entreprise choisies et les temporalités."
        )

    print(f"\nRecherche d'une s?lection valide pour {len(forced_rows)} action(s) impos?e(s)...")

    for attempt in range(MAX_ATTEMPTS):
        selected = attempt_selection(
            eligible_rows,
            preferred_company_categories,
            random.Random(RANDOM_SEED_BASE + attempt),
            forced_rows,
        )
        if selected is None:
            continue
        try:
            validate_selection(selected)
            break
        except ValueError:
            selected = None
            continue

    if selected is None:
        print(
            "Impossible de construire une sélection qui respecte toutes les contraintes "
            "avec les catégories entreprise choisies. Aucun CSV n'a été écrit.",
            file=sys.stderr,
        )
        return 1

    write_output(selected, OUTPUT_PATH)
    print(f"\nCSV mis ? jour : {OUTPUT_PATH}")
    print_summary(selected, preferred_company_categories)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


