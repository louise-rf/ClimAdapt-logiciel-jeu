from __future__ import annotations

import csv
import itertools
import random
import shutil
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


CATALOG_PATH = Path(__file__).with_name("Actions - catalogue.csv")
OUTPUT_PATH = Path(__file__).with_name("actions_selection.csv")
PUBLIC_OUTPUT_PATH = Path(__file__).with_name("public").joinpath("actions_selection.csv")

TARGET_RESOURCE_CATEGORIES = [
    "Technique",
    "Humaines",
    "Organisationnelles",
    "Solutions fondées sur la nature",
    "Financières",
]

TARGET_TERMS = ["Court terme", "Moyen terme", "Long terme"]
TARGET_HAZARDS = [
    "Fortes pluies",
    "Inondation pluie",
    "Inondation fluviale",
    "Inondation nappe",
    "Stress Hydrique",
    "Vague de chaleur",
    "Chaleur extrême",
    "Modif T° air",
    "Tempêtes",
    "Vague de gel",
    "RGA",
]
UNIVERSAL_HAZARD_LABEL = "Tous aléas climatiques"

PER_RESOURCE_TARGET = 12
MIN_TERM_PER_RESOURCE = 3  # legacy value kept for readability.
TERM_TARGETS = {term: 12 for term in TARGET_TERMS}
SCORE_TARGETS = {score: 2 for score in range(11) if score != 9}
PER_HAZARD_MIN_TARGET = 1
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


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.lower().replace("’", "'")
    value = value.replace("°", " deg ")
    value = " ".join(value.replace("/", " / ").split())
    return value


NORMALIZED_HAZARD_MAP = {
    normalize_text(hazard): hazard for hazard in TARGET_HAZARDS
}
NORMALIZED_UNIVERSAL_HAZARD = normalize_text(UNIVERSAL_HAZARD_LABEL)


def get_row_hazards(row: dict[str, str]) -> set[str]:
    raw_value = get_row_value(row, "Aléa climatique visé", "Alea climatique vise")
    if not raw_value:
        return set()

    normalized_raw = normalize_text(raw_value)
    if normalized_raw == NORMALIZED_UNIVERSAL_HAZARD:
        return set(TARGET_HAZARDS)

    hazards: set[str] = set()
    for part in raw_value.split("/"):
        normalized_part = normalize_text(part.strip())
        canonical = NORMALIZED_HAZARD_MAP.get(normalized_part)
        if canonical:
            hazards.add(canonical)
    return hazards


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


def prompt_target_hazards() -> list[str]:
    print("\nAléas climatiques disponibles :")
    for index, hazard in enumerate(TARGET_HAZARDS, start=1):
        print(f"{index:>2}. {hazard}")

    while True:
        raw = input(
            "\nChoisis exactement 3 aléas par numéro, séparés par des virgules : "
        ).strip()
        if not raw:
            print("Entrée vide. Réessaie.")
            continue

        try:
            indexes = [int(part.strip()) for part in raw.split(",") if part.strip()]
        except ValueError:
            print("Format invalide. Utilise des numéros séparés par des virgules.")
            continue

        if len(indexes) != 3:
            print("Il faut sélectionner exactement 3 aléas.")
            continue

        if len(set(indexes)) != 3:
            print("Chaque aléa doit être sélectionné une seule fois.")
            continue

        invalid = [index for index in indexes if index < 1 or index > len(TARGET_HAZARDS)]
        if invalid:
            print("Numéro(s) hors plage : " + ", ".join(map(str, invalid)))
            continue

        selected = [TARGET_HAZARDS[index - 1] for index in indexes]
        print("\nAléas retenus :")
        for hazard in selected:
            print(f"- {hazard}")
        confirm = input("\nConfirmer ? [o/N] : ").strip().lower()
        if confirm in {"o", "oui", "y", "yes"}:
            return selected


def prompt_yes_no(question: str) -> bool:
    while True:
        raw = input(f"\n{question} [o/N] : ").strip().lower()
        if raw in {"o", "oui", "y", "yes"}:
            return True
        if raw in {"", "n", "non", "no"}:
            return False
        print("Réponse invalide. Réponds par oui ou non.")


def normalize_bool_cell(value: str) -> bool:
    normalized = normalize_text(value or "")
    return normalized in {"oui", "yes", "true", "1", "x"}


def get_row_mobility_match_priority(
    row: dict[str, str],
    requires_machines: bool,
    requires_vehicles: bool,
) -> tuple[int, int]:
    has_machines = normalize_bool_cell(get_row_value(row, "Machines"))
    has_vehicles = normalize_bool_cell(get_row_value(row, "Véhicules", "Vehicules"))
    machine_priority = 0 if has_machines == requires_machines else 1
    vehicle_priority = 0 if has_vehicles == requires_vehicles else 1
    return machine_priority, vehicle_priority


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


def prompt_forced_actions(rows: list[dict[str, str]], selected_hazards: set[str]) -> list[dict[str, str]]:
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
        invalid_hazards: list[int] = []
        for line in line_numbers:
            row = rows[line - 2]
            if get_row_value(row, "Catégorie ressources", "Catégorie ressources") not in TARGET_RESOURCE_CATEGORIES:
                invalid_resources.append(line)
                continue
            if not (get_row_hazards(row) & selected_hazards):
                invalid_hazards.append(line)
                continue
            forced_rows.append(row)

        if invalid_resources:
            print(
                "Ces lignes ne peuvent pas être imposées car elles ne sont pas dans les "
                "catégories de ressources ciblées : "
                + ", ".join(map(str, invalid_resources))
            )
            continue

        if invalid_hazards:
            print(
                "Ces lignes ne peuvent pas être imposées car elles ne répondent à aucun des 3 aléas retenus : "
                + ", ".join(map(str, invalid_hazards))
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


def count_target_hazards(rows: list[dict[str, str]], selected_hazards: set[str]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for row in rows:
        for hazard in get_row_hazards(row) & selected_hazards:
            counts[hazard] += 1
    return counts


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


def validate_selection(selected: list[dict[str, str]], selected_hazards: set[str]) -> None:
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

    score_counts = count_scores(selected)
    for score, target in SCORE_TARGETS.items():
        if score_counts[score] < target:
            raise ValueError(
                f"Le lot final n'atteint pas le minimum de {target} actions pour le score {score}."
            )

    term_counts = count_terms(selected)
    for term, target in TERM_TARGETS.items():
        if term_counts[term] < target:
            raise ValueError(
                f"Le lot final n'atteint pas le minimum de {target} actions pour '{term}'."
            )

    hazard_counts = count_target_hazards(selected, selected_hazards)
    for hazard in selected_hazards:
        if hazard_counts[hazard] < PER_HAZARD_MIN_TARGET:
            raise ValueError(
                f"Le lot final n'atteint pas le minimum de {PER_HAZARD_MIN_TARGET} action pour l'aléa '{hazard}'."
            )


def attempt_selection(
    eligible_rows: list[dict[str, str]],
    preferred_company_categories: set[str],
    selected_hazards: set[str],
    requires_machines: bool,
    requires_vehicles: bool,
    rng: random.Random,
    forced_rows: list[dict[str, str]] | None = None,
) -> list[dict[str, str]] | None:
    forced_rows = forced_rows or []
    rows_by_resource: dict[str, list[dict[str, str]]] = {
        resource: [row for row in eligible_rows if get_row_value(row, "Catégorie ressources", "Catégorie ressources") == resource]
        for resource in TARGET_RESOURCE_CATEGORIES
    }

    forced_counts = Counter(get_row_value(row, "Catégorie ressources", "Catégorie ressources") for row in forced_rows)
    if any(forced_counts[resource] > PER_RESOURCE_TARGET for resource in TARGET_RESOURCE_CATEGORIES):
        return None

    score_seed = count_scores(forced_rows)
    term_seed = count_terms(forced_rows)
    hazard_seed = count_target_hazards(forced_rows, selected_hazards)
    resource_seed = Counter(get_row_value(row, "Catégorie ressources", "Catégorie ressources") for row in forced_rows)
    used_seed = {row_id(row) for row in forced_rows}

    def available_rows_by_score(used: set[int]) -> Counter[int]:
        return Counter(parse_score(row) for row in eligible_rows if row_id(row) not in used)

    def available_rows_by_term(used: set[int]) -> Counter[str]:
        return Counter(get_row_value(row, "Temps") for row in eligible_rows if row_id(row) not in used)

    def available_rows_by_hazard(used: set[int]) -> Counter[str]:
        counts: Counter[str] = Counter()
        for row in eligible_rows:
            if row_id(row) in used:
                continue
            for hazard in get_row_hazards(row) & selected_hazards:
                counts[hazard] += 1
        return counts

    def feasible(
        used: set[int],
        score_counts: Counter[int],
        term_counts: Counter[str],
        hazard_counts: Counter[str],
        resource_counts: Counter[str],
    ) -> bool:
        for resource in TARGET_RESOURCE_CATEGORIES:
            remaining = PER_RESOURCE_TARGET - resource_counts[resource]
            if remaining < 0:
                return False
            available_in_resource = sum(1 for row in rows_by_resource[resource] if row_id(row) not in used)
            if available_in_resource < remaining:
                return False

        score_availability = available_rows_by_score(used)
        for score, target in SCORE_TARGETS.items():
            missing = target - score_counts[score]
            if missing > 0 and score_availability[score] < missing:
                return False

        term_availability = available_rows_by_term(used)
        for term, target in TERM_TARGETS.items():
            missing = target - term_counts[term]
            if missing > 0 and term_availability[term] < missing:
                return False

        hazard_availability = available_rows_by_hazard(used)
        for hazard in selected_hazards:
            missing = PER_HAZARD_MIN_TARGET - hazard_counts[hazard]
            if missing > 0 and hazard_availability[hazard] < missing:
                return False

        return True

    base_order = sorted(
        TARGET_RESOURCE_CATEGORIES,
        key=lambda resource: (
            len(rows_by_resource[resource]) - resource_seed[resource],
            resource_seed[resource],
            rng.random(),
        ),
    )

    candidate_orders = [base_order]
    candidate_orders.extend(
        [list(order) for order in itertools.permutations(TARGET_RESOURCE_CATEGORIES)]
    )

    for resource_order in candidate_orders:
        selected = list(forced_rows)
        used = set(used_seed)
        score_counts = Counter(score_seed)
        term_counts = Counter(term_seed)
        hazard_counts = Counter(hazard_seed)
        resource_counts = Counter(resource_seed)

        def fill_resource(resource_index: int) -> bool:
            if resource_index >= len(resource_order):
                for score, target in SCORE_TARGETS.items():
                    if score_counts[score] < target:
                        return False
                for term, target in TERM_TARGETS.items():
                    if term_counts[term] < target:
                        return False
                for hazard in selected_hazards:
                    if hazard_counts[hazard] < PER_HAZARD_MIN_TARGET:
                        return False
                return True

            resource = resource_order[resource_index]
            slots_needed = PER_RESOURCE_TARGET - resource_counts[resource]
            if slots_needed == 0:
                return fill_resource(resource_index + 1)

            def choose_slot(remaining_slots: int) -> bool:
                if remaining_slots == 0:
                    return fill_resource(resource_index + 1)

                score_availability = available_rows_by_score(used)
                term_availability = available_rows_by_term(used)
                hazard_availability = available_rows_by_hazard(used)

                def candidate_priority(row: dict[str, str]) -> tuple[int, int, int, int, int, int, int, int, int, int, float]:
                    score = parse_score(row)
                    term = get_row_value(row, "Temps")
                    company = get_row_value(row, "Catégorie entreprise", "Catégorie entreprise")
                    row_hazards = get_row_hazards(row) & selected_hazards
                    machine_priority, vehicle_priority = get_row_mobility_match_priority(
                        row,
                        requires_machines,
                        requires_vehicles,
                    )
                    hazard_need = 0 if any(hazard_counts[hazard] < PER_HAZARD_MIN_TARGET for hazard in row_hazards) else 1
                    uncovered_hazard_count = -sum(
                        1 for hazard in row_hazards if hazard_counts[hazard] < PER_HAZARD_MIN_TARGET
                    )
                    hazard_rarity = min(
                        (hazard_availability[hazard] for hazard in row_hazards),
                        default=sys.maxsize,
                    )
                    score_need = 0 if score in SCORE_TARGETS and score_counts[score] < SCORE_TARGETS[score] else 1
                    term_need = 0 if term_counts[term] < TERM_TARGETS[term] else 1
                    company_need = 0 if company in preferred_company_categories else 1
                    return (
                        hazard_need,
                        uncovered_hazard_count,
                        hazard_rarity,
                        score_need,
                        term_need,
                        machine_priority,
                        vehicle_priority,
                        company_need,
                        score_availability[score],
                        term_availability[term],
                        rng.random(),
                    )

                candidates = [
                    row
                    for row in rows_by_resource[resource]
                    if row_id(row) not in used
                ]
                if not candidates:
                    return False

                candidates = sorted(candidates, key=candidate_priority)

                for row in candidates:
                    row_score = parse_score(row)
                    row_term = get_row_value(row, "Temps")
                    row_resource = get_row_value(row, "Catégorie ressources", "Catégorie ressources")

                    used.add(row_id(row))
                    selected.append(row)
                    resource_counts[row_resource] += 1
                    score_counts[row_score] += 1
                    term_counts[row_term] += 1
                    row_hazards = get_row_hazards(row) & selected_hazards
                    for hazard in row_hazards:
                        hazard_counts[hazard] += 1

                    if feasible(used, score_counts, term_counts, hazard_counts, resource_counts) and choose_slot(remaining_slots - 1):
                        return True

                    for hazard in row_hazards:
                        hazard_counts[hazard] -= 1
                    term_counts[row_term] -= 1
                    score_counts[row_score] -= 1
                    resource_counts[row_resource] -= 1
                    selected.pop()
                    used.remove(row_id(row))

                return False

            return choose_slot(slots_needed)

        if feasible(used, score_counts, term_counts, hazard_counts, resource_counts) and fill_resource(0):
            return selected

    return None


def best_effort_selection(
    eligible_rows: list[dict[str, str]],
    preferred_company_categories: set[str],
    selected_hazards: set[str],
    requires_machines: bool,
    requires_vehicles: bool,
    rng: random.Random,
    forced_rows: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    forced_rows = forced_rows or []
    selected = list(forced_rows)
    used = {row_id(row) for row in forced_rows}

    rows_by_resource: dict[str, list[dict[str, str]]] = {
        resource: [row for row in eligible_rows if get_row_value(row, "Catégorie ressources", "Catégorie ressources") == resource]
        for resource in TARGET_RESOURCE_CATEGORIES
    }

    resource_order = sorted(
        TARGET_RESOURCE_CATEGORIES,
        key=lambda resource: (
            len([row for row in rows_by_resource[resource] if row_id(row) not in used]),
            rng.random(),
        ),
    )

    for resource in resource_order:
        while len(
            [
                row
                for row in selected
                if get_row_value(row, "Catégorie ressources", "Catégorie ressources") == resource
            ]
        ) < PER_RESOURCE_TARGET:
            remaining = [row for row in rows_by_resource[resource] if row_id(row) not in used]
            if not remaining:
                break

            score_counts = count_scores(selected)
            term_counts = count_terms(selected)
            hazard_counts = count_target_hazards(selected, selected_hazards)
            score_pool = Counter(parse_score(row) for row in remaining)
            term_pool = Counter(get_row_value(row, "Temps") for row in remaining)
            hazard_pool: Counter[str] = Counter()
            for row in remaining:
                for hazard in get_row_hazards(row) & selected_hazards:
                    hazard_pool[hazard] += 1

            def priority(row: dict[str, str]) -> tuple[int, int, int, int, int, int, int, int, int, int, float]:
                score = parse_score(row)
                term = get_row_value(row, "Temps")
                company = get_row_value(row, "Catégorie entreprise", "Catégorie entreprise")
                row_hazards = get_row_hazards(row) & selected_hazards
                machine_priority, vehicle_priority = get_row_mobility_match_priority(
                    row,
                    requires_machines,
                    requires_vehicles,
                )
                hazard_need = 0 if any(hazard_counts[hazard] < PER_HAZARD_MIN_TARGET for hazard in row_hazards) else 1
                uncovered_hazard_count = -sum(
                    1 for hazard in row_hazards if hazard_counts[hazard] < PER_HAZARD_MIN_TARGET
                )
                hazard_rarity = min((hazard_pool[hazard] for hazard in row_hazards), default=sys.maxsize)
                score_need = 0 if score in SCORE_TARGETS and score_counts[score] < SCORE_TARGETS[score] else 1
                term_need = 0 if term_counts[term] < TERM_TARGETS[term] else 1
                company_need = 0 if company in preferred_company_categories else 1
                return (
                    hazard_need,
                    uncovered_hazard_count,
                    hazard_rarity,
                    score_need,
                    term_need,
                    machine_priority,
                    vehicle_priority,
                    company_need,
                    score_pool[score],
                    term_pool[term],
                    rng.random(),
                )

            chosen = min(remaining, key=priority)
            selected.append(chosen)
            used.add(row_id(chosen))

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


def sync_output_to_public(source_path: Path, public_path: Path) -> None:
    public_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_path, public_path)


def print_summary(
    rows: list[dict[str, str]],
    preferred_company_categories: set[str],
    selected_hazards: set[str],
    requires_machines: bool,
    requires_vehicles: bool,
) -> None:
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
    total_hazards = count_target_hazards(rows, selected_hazards)
    fallback_count = len(rows) - preferred_count
    machine_matches = sum(
        1
        for row in rows
        if normalize_bool_cell(get_row_value(row, "Machines")) == requires_machines
    )
    vehicle_matches = sum(
        1
        for row in rows
        if normalize_bool_cell(get_row_value(row, "Véhicules", "Vehicules")) == requires_vehicles
    )
    missing_scores = [score for score, target in SCORE_TARGETS.items() if total_scores[score] < target]
    print("\nScores globaux :")
    print(", ".join(f"{score}={total_scores[score]}" for score in range(11)))
    print("\nCouverture des aléas retenus :")
    for hazard in TARGET_HAZARDS:
        if hazard in selected_hazards:
            print(f"- {hazard}: {total_hazards[hazard]}")
    if missing_scores:
        print(
            "Scores non couverts à hauteur de 2 dans le résultat final : "
            + ", ".join(map(str, missing_scores))
        )
    print(f"\nActions issues des catégories choisies : {preferred_count}")
    print(f"Actions issues d'autres catégories entreprise : {fallback_count}")
    print(f"Correspondance Machines : {machine_matches}/{len(rows)}")
    print(f"Correspondance Véhicules : {vehicle_matches}/{len(rows)}")
    print(f"\nCSV généré : {OUTPUT_PATH}")
    print(f"CSV public synchronisé : {PUBLIC_OUTPUT_PATH}")


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
    selected_hazards = set(prompt_target_hazards())
    requires_machines = prompt_yes_no("Le client a-t-il des machines ?")
    requires_vehicles = prompt_yes_no("Le client a-t-il des voitures ?")
    forced_rows = prompt_forced_actions(rows, selected_hazards)

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
        and bool(get_row_hazards(row) & selected_hazards)
    ]

    if not eligible_rows:
        print("Aucune ligne ne correspond aux catégories ressource ciblées.", file=sys.stderr)
        return 1

    target_rows = [
        row
        for row in rows
        if get_row_value(row, "Catégorie ressources", "Catégorie ressources") in TARGET_RESOURCE_CATEGORIES
        and bool(get_row_hazards(row) & selected_hazards)
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
            "Le script va quand même produire un CSV best-effort en respectant d'abord les aléas retenus, "
            "les catégories de ressource, les catégories d'entreprise choisies et les temporalités."
        )

    print(f"\nRecherche d'une s?lection valide pour {len(forced_rows)} action(s) impos?e(s)...")

    for attempt in range(MAX_ATTEMPTS):
        rng = random.SystemRandom()
        selected = attempt_selection(
            eligible_rows,
            preferred_company_categories,
            selected_hazards,
            requires_machines,
            requires_vehicles,
            rng,
            forced_rows,
        )
        if selected is None:
            continue
        try:
            validate_selection(selected, selected_hazards)
            break
        except ValueError:
            selected = None
            continue

    if selected is None:
        print(
            "Impossible de construire une sélection stricte. Le script va générer un CSV best-effort.",
            file=sys.stderr,
        )
        selected = best_effort_selection(
            eligible_rows,
            preferred_company_categories,
            selected_hazards,
            requires_machines,
            requires_vehicles,
            random.SystemRandom(),
            forced_rows,
        )

    write_output(selected, OUTPUT_PATH)
    sync_output_to_public(OUTPUT_PATH, PUBLIC_OUTPUT_PATH)
    print(f"\nCSV mis ? jour : {OUTPUT_PATH}")
    try:
        print_summary(
            selected,
            preferred_company_categories,
            selected_hazards,
            requires_machines,
            requires_vehicles,
        )
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


