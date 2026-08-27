import csv
import json
import re
from pathlib import Path
from collections import defaultdict


# ============================================================
# CONFIGURATION
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]

SOURCE_FILE = PROJECT_ROOT / "source" / "luca_gov_overlap_ny.csv"
OUTPUT_FILE = PROJECT_ROOT / "data" / "luca_data.json"


REQUIRED_COLUMNS = [
    "STATEFP",
    "ST_NAME",
    "COUNTYFP",
    "COU_NAME",
    "COUSUBFP",
    "MCD_NAME",
    "PLACEFP",
    "PL_NAME",
    "AIANNHCE",
    "AIA_NAME",
]


# Census-style placeholder values used in the supplied data.
# These are NOT removed from the source CSV.
PLACEHOLDER_CODES = {
    "",
    "9999",
    "99999",
}


# ============================================================
# BASIC HELPERS
# ============================================================

def clean(value):
    """Return a trimmed string or None."""
    if value is None:
        return None

    value = str(value).strip()

    return value if value else None


def meaningful_code(value):
    """
    Determines whether a code represents an identified geography.

    This does NOT change the source data.
    It is only used when deciding whether a geographic level exists.
    """
    value = clean(value)

    if value is None:
        return False

    return value not in PLACEHOLDER_CODES


def normalize_text(value):
    """
    Normalized text used only for searching.

    The original name is always preserved separately.
    """
    if not value:
        return ""

    value = value.lower().strip()

    value = re.sub(r"[^\w\s]", " ", value)

    value = re.sub(r"\s+", " ", value)

    return value.strip()


def remove_type_suffix(name):
    """
    Creates a searchable base name.

    Examples:

        Albany city       -> Albany
        Albany County     -> Albany
        Colonie town      -> Colonie
        Menands village   -> Menands
        Allegany Reservation -> Allegany
    """

    if not name:
        return ""

    text = normalize_text(name)

    suffixes = [
        "county",
        "city",
        "town",
        "village",
        "borough",
        "township",
        "reservation",
        "hamlet",
        "plantation",
    ]

    for suffix in suffixes:
        if text.endswith(" " + suffix):
            return text[: -(len(suffix) + 1)].strip()

    return text


def infer_subtype(name, level):
    """
    Determines a friendly subtype from the existing name.

    This is presentation metadata only.
    """

    if not name:
        return None

    lower = name.lower().strip()

    if level == "county":
        return "County"

    if level == "state":
        return "State"

    if level == "mcd":
        if lower.endswith(" town"):
            return "Town"

        if lower.endswith(" township"):
            return "Township"

        if lower.endswith(" borough"):
            return "Borough"

        return "County subdivision"

    if level == "place":
        if lower.endswith(" city"):
            return "City"

        if lower.endswith(" village"):
            return "Village"

        if lower.endswith(" hamlet"):
            return "Hamlet"

        return "Place"

    if level == "aiannh":
        if lower.endswith(" reservation"):
            return "Reservation"

        if lower.endswith(" trust land"):
            return "Trust Land"

        return "AIANNH Area"

    return None


# ============================================================
# ENTITY ID HELPERS
# ============================================================

def state_id(row):
    return f"state:{row['STATEFP']}"


def county_id(row):
    return f"county:{row['STATEFP']}:{row['COUNTYFP']}"


def mcd_id(row):
    code = clean(row.get("COUSUBFP"))
    name = clean(row.get("MCD_NAME"))

    if meaningful_code(code):
        return f"mcd:{row['STATEFP']}:{row['COUNTYFP']}:{code}"

    return (
        f"mcd:{row['STATEFP']}:{row['COUNTYFP']}:"
        f"name:{normalize_text(name)}"
    )


def place_id(row):
    code = clean(row.get("PLACEFP"))
    name = clean(row.get("PL_NAME"))

    if meaningful_code(code):
        return f"place:{row['STATEFP']}:{code}"

    return (
        f"place:{row['STATEFP']}:{row['COUNTYFP']}:"
        f"name:{normalize_text(name)}"
    )


def aiannh_id(row):
    code = clean(row.get("AIANNHCE"))
    name = clean(row.get("AIA_NAME"))

    # Keep state in the key.
    #
    # This is intentional because the Census "AIANNH by State"
    # structure can contain a separate state record for an area
    # that crosses state boundaries.
    if meaningful_code(code):
        return f"aiannh:{row['STATEFP']}:{code}"

    return (
        f"aiannh:{row['STATEFP']}:{row['COUNTYFP']}:"
        f"name:{normalize_text(name)}"
    )


# ============================================================
# ENTITY CREATION
# ============================================================

def make_entity(
    entity_id,
    level,
    name,
    row,
    parent_id=None,
):
    return {
        "id": entity_id,
        "level": level,
        "name": name,
        "normalizedName": normalize_text(name),
        "baseName": remove_type_suffix(name),
        "subtype": infer_subtype(name, level),

        "parentId": parent_id,

        "stateId": None,
        "countyId": None,
        "mcdId": None,
        "placeId": None,
        "aiannhId": None,

        "children": [],
        "relatedAIANNH": [],

        "rowIds": [],

        "identifiers": {},
    }


# ============================================================
# MAIN PROCESS
# ============================================================

def main():

    if not SOURCE_FILE.exists():
        raise FileNotFoundError(
            f"Source CSV was not found:\n{SOURCE_FILE}\n\n"
            "Place your CSV in the source folder."
        )

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    entities = {}

    rows = []

    children = defaultdict(set)

    # --------------------------------------------------------
    # Read source CSV
    # --------------------------------------------------------

    with SOURCE_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        if not reader.fieldnames:
            raise ValueError("The CSV does not contain a header row.")

        missing = [
            column
            for column in REQUIRED_COLUMNS
            if column not in reader.fieldnames
        ]

        if missing:
            raise ValueError(
                "The CSV is missing required columns:\n"
                + "\n".join(missing)
            )

        for row_number, raw_row in enumerate(reader, start=2):

            # Preserve the source values.
            row = {
                key: clean(raw_row.get(key))
                for key in reader.fieldnames
            }

            row["_rowNumber"] = row_number

            rows.append(row)

    # --------------------------------------------------------
    # Build entities
    # --------------------------------------------------------

    for row_index, row in enumerate(rows):

        state_name = clean(row.get("ST_NAME"))
        county_name = clean(row.get("COU_NAME"))
        mcd_name = clean(row.get("MCD_NAME"))
        place_name = clean(row.get("PL_NAME"))
        aia_name = clean(row.get("AIA_NAME"))

        # ----------------------------------------------------
        # STATE
        # ----------------------------------------------------

        if state_name and meaningful_code(row.get("STATEFP")):

            sid = state_id(row)

            if sid not in entities:
                entities[sid] = make_entity(
                    sid,
                    "state",
                    state_name,
                    row,
                )

                entities[sid]["identifiers"] = {
                    "STATEFP": row.get("STATEFP")
                }

            state_entity = entities[sid]

            state_entity["rowIds"].append(row_index)

        else:
            sid = None

        # ----------------------------------------------------
        # COUNTY
        # ----------------------------------------------------

        cid = None

        if (
            county_name
            and meaningful_code(row.get("COUNTYFP"))
            and sid
        ):

            cid = county_id(row)

            if cid not in entities:

                entities[cid] = make_entity(
                    cid,
                    "county",
                    county_name,
                    row,
                    parent_id=sid,
                )

                entities[cid]["stateId"] = sid

                entities[cid]["identifiers"] = {
                    "STATEFP": row.get("STATEFP"),
                    "COUNTYFP": row.get("COUNTYFP"),
                }

                children[sid].add(cid)

            entities[cid]["rowIds"].append(row_index)

        # ----------------------------------------------------
        # COUNTY SUBDIVISION
        # ----------------------------------------------------

        mid = None

        if mcd_name and cid:

            mid = mcd_id(row)

            if mid not in entities:

                entities[mid] = make_entity(
                    mid,
                    "mcd",
                    mcd_name,
                    row,
                    parent_id=cid,
                )

                entities[mid]["stateId"] = sid
                entities[mid]["countyId"] = cid

                entities[mid]["identifiers"] = {
                    "STATEFP": row.get("STATEFP"),
                    "COUNTYFP": row.get("COUNTYFP"),
                    "COUSUBFP": row.get("COUSUBFP"),
                }

                children[cid].add(mid)

            entities[mid]["rowIds"].append(row_index)

        # ----------------------------------------------------
        # PLACE
        # ----------------------------------------------------

        pid = None

        if place_name and cid:

            pid = place_id(row)

            # A place belongs under the county subdivision
            # when one is actually identified.
            parent = mid if mid else cid

            if pid not in entities:

                entities[pid] = make_entity(
                    pid,
                    "place",
                    place_name,
                    row,
                    parent_id=parent,
                )

                entities[pid]["stateId"] = sid
                entities[pid]["countyId"] = cid
                entities[pid]["mcdId"] = mid

                entities[pid]["identifiers"] = {
                    "STATEFP": row.get("STATEFP"),
                    "COUNTYFP": row.get("COUNTYFP"),
                    "PLACEFP": row.get("PLACEFP"),
                }

                children[parent].add(pid)

            entities[pid]["rowIds"].append(row_index)

        # ----------------------------------------------------
        # AIANNH
        # ----------------------------------------------------

        aid = None

        if aia_name and sid:

            aid = aiannh_id(row)

            if aid not in entities:

                entities[aid] = make_entity(
                    aid,
                    "aiannh",
                    aia_name,
                    row,
                    parent_id=None,
                )

                entities[aid]["stateId"] = sid
                entities[aid]["countyId"] = cid

                entities[aid]["identifiers"] = {
                    "STATEFP": row.get("STATEFP"),
                    "COUNTYFP": row.get("COUNTYFP"),
                    "AIANNHCE": row.get("AIANNHCE"),
                }

            entities[aid]["rowIds"].append(row_index)

            # AIANNH is an associated geography,
            # not a forced administrative child.
            #
            # Keep the relationship explicit.
            if aid not in entities[sid]["relatedAIANNH"]:
                entities[sid]["relatedAIANNH"].append(aid)

            if cid and aid not in entities[cid]["relatedAIANNH"]:
                entities[cid]["relatedAIANNH"].append(aid)

            if mid and aid not in entities[mid]["relatedAIANNH"]:
                entities[mid]["relatedAIANNH"].append(aid)

            if pid and aid not in entities[pid]["relatedAIANNH"]:
                entities[pid]["relatedAIANNH"].append(aid)

    # --------------------------------------------------------
    # Attach children
    # --------------------------------------------------------

    for entity_id, entity in entities.items():

        entity["children"] = sorted(
            list(children.get(entity_id, set())),
            key=lambda child_id: (
                entities[child_id]["level"],
                entities[child_id]["name"].lower()
            )
        )

    # --------------------------------------------------------
    # Add hierarchy paths
    # --------------------------------------------------------

    def build_path(entity_id):

        path = []

        current = entity_id

        safety = 0

        while current and safety < 10:

            entity = entities[current]

            path.append(current)

            current = entity.get("parentId")

            safety += 1

        path.reverse()

        return path

    for entity in entities.values():

        entity["hierarchy"] = build_path(entity["id"])

    # --------------------------------------------------------
    # Convert sets/lists and prepare output
    # --------------------------------------------------------

    output_entities = list(entities.values())

    output_entities.sort(
        key=lambda entity: (
            entity["level"],
            entity["name"].lower()
        )
    )

    output = {
        "version": 1,

        "source": {
            "file": SOURCE_FILE.name,
            "rowCount": len(rows),
            "entityCount": len(output_entities),
        },

        "levels": [
            "state",
            "county",
            "mcd",
            "place",
            "aiannh",
        ],

        "entities": output_entities,

        # Raw source data is included so the frontend can
        # display exact identifiers when necessary.
        "rows": rows,
    }

    with OUTPUT_FILE.open(
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            output,
            file,
            indent=2,
            ensure_ascii=False,
        )

    print()
    print("LUCA data preparation complete.")
    print("--------------------------------")
    print(f"Source rows:    {len(rows):,}")
    print(f"Entities:       {len(output_entities):,}")
    print(f"Output:         {OUTPUT_FILE}")
    print()


if __name__ == "__main__":
    main()
