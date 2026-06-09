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


def get_unique_company_categories(rows: list[dict[str, str]]) -> list[tuple[str, int]]:
    counts = Counter(row["Catégorie entreprise"].strip() for row in rows)
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


def row_id(row: dict[str, str]) -> int:
    return id(row)


def parse_score(row: dict[str, str]) -> int:
    try:
        return int(row["Score"])
    except (KeyError, ValueError) as exc:
        raise ValueError(f"Score invalide dans la ligne : {row}") from exc


def count_scores(rows: list[dict[str, str]]) -> Counter[int]:
    return Counter(parse_score(row) for row in rows)


def count_terms(rows: list[dict[str, str]]) -> Counter[str]:
    return Counter(row["Temps"].strip() for row in rows)


def pick_best_candidate(
    candidates: list[dict[str, str]],
    score_deficits: Counter[int],
    preferred_company_categories: set[str],
    rng: random.Random,
) -> dict[str, str]:
    score_pool = Counter(parse_score(row) for row in candidates)

    def sort_key(row: dict[str, str]) -> tuple[int, int, int, float]:
        score = parse_score(row)
        score_needed = 0 if score_deficits[score] > 0 else 1
        preferred_company = 0 if row["Catégorie entreprise"].strip() in preferred_company_categories else 1
        rarity = score_pool[score]
        return (score_needed, preferred_company, rarity, rng.random())

    return min(candidates, key=sort_key)


def validate_selection(selected: list[dict[str, str]]) -> None:
    if len(selected) != PER_RESOURCE_TARGET * len(TARGET_RESOURCE_CATEGORIES):
        raise ValueError(
            f"Le lot final contient {len(selected)} actions au lieu de "
            f"{PER_RESOURCE_TARGET * len(TARGET_RESOURCE_CATEGORIES)}."
        )

    by_resource: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in selected:
        by_resource[row["Catégorie ressources"].strip()].append(row)

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
) -> list[dict[str, str]] | None:
    used = set()
    selected: list[dict[str, str]] = []
    global_score_counts: Counter[int] = Counter()

    rows_by_resource: dict[str, list[dict[str, str]]] = {
        resource: [row for row in eligible_rows if row["Catégorie ressources"].strip() == resource]
        for resource in TARGET_RESOURCE_CATEGORIES
    }

    for resource, pool in rows_by_resource.items():
        if len(pool) < PER_RESOURCE_TARGET:
            return None
        term_counts = count_terms(pool)
        for term in TARGET_TERMS:
            if term_counts[term] < MIN_TERM_PER_RESOURCE:
                return None

    for resource in TARGET_RESOURCE_CATEGORIES:
        resource_pool = [row for row in rows_by_resource[resource] if row_id(row) not in used]

        term_order = sorted(
            TARGET_TERMS,
            key=lambda term: sum(1 for row in resource_pool if row["Temps"].strip() == term),
        )

        for term in term_order:
            for _ in range(MIN_TERM_PER_RESOURCE):
                candidates = [
                    row
                    for row in resource_pool
                    if row["Temps"].strip() == term and row_id(row) not in used
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

        while len([row for row in selected if row["Catégorie ressources"].strip() == resource]) < PER_RESOURCE_TARGET:
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
        eligible_by_resource[row["Catégorie ressources"].strip()].append(row)

    while True:
        missing_scores = [score for score, target in SCORE_TARGETS.items() if score_counts[score] < target]
        if not missing_scores:
            return True

        progress = False
        for missing_score in missing_scores:
            found_swap = False
            for resource, resource_rows in eligible_by_resource.items():
                resource_selected = [
                    row for row in selected if row["Catégorie ressources"].strip() == resource
                ]
                term_counts = Counter(row["Temps"].strip() for row in resource_selected)

                removable = [
                    row
                    for row in resource_selected
                    if score_counts[parse_score(row)] > SCORE_TARGETS.get(parse_score(row), 0)
                    and term_counts[row["Temps"].strip()] > MIN_TERM_PER_RESOURCE
                ]
                incoming = [
                    row
                    for row in resource_rows
                    if row_id(row) not in selected_set and parse_score(row) == missing_score
                ]
                if not removable or not incoming:
                    continue

                removable = sorted(
                    removable,
                    key=lambda row: (
                        score_counts[parse_score(row)],
                        term_counts[row["Temps"].strip()],
                        rng.random(),
                    ),
                    reverse=True,
                )
                incoming = sorted(incoming, key=lambda row: rng.random())

                remove_row = removable[0]
                add_row = incoming[0]

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
        by_resource[row["Catégorie ressources"].strip()].append(row)

    preferred_count = 0
    for resource in TARGET_RESOURCE_CATEGORIES:
        resource_rows = by_resource[resource]
        term_counts = count_terms(resource_rows)
        score_counts = count_scores(resource_rows)
        preferred_count += sum(
            1 for row in resource_rows if row["Catégorie entreprise"].strip() in preferred_company_categories
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

    eligible_rows = [
        row
        for row in rows
        if row["Catégorie ressources"].strip() in TARGET_RESOURCE_CATEGORIES
    ]

    if not eligible_rows:
        print("Aucune ligne ne correspond aux catégories ressource ciblées.", file=sys.stderr)
        return 1

    target_rows = [
        row
        for row in rows
        if row["Catégorie ressources"].strip() in TARGET_RESOURCE_CATEGORIES
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

    for attempt in range(MAX_ATTEMPTS):
        selected = attempt_selection(
            eligible_rows,
            preferred_company_categories,
            random.Random(RANDOM_SEED_BASE + attempt),
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
    print_summary(selected, preferred_company_categories)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
