

/* ================================================================
   GLOBAL DATA
================================================================ */


let data = [];

let entities = [];

let currentSearch = "";


/*
    Index of the currently keyboard-highlighted search result.

    -1 means that no result is selected.
*/
let activeSearchIndex = -1;


/*
    The currently displayed search results.

    This lets the Up / Down keyboard controls work directly
    against the results currently shown on screen.
*/
let currentSearchMatches = [];


/*
    Sentinel values used by the source data to indicate that an
    entity does not exist for that record.
*/
const MISSING_CODES = new Set([
    "",
    "99999",
    "9999",
    "00000"
]);


/* ================================================================
   BASIC HELPERS
================================================================ */


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function isMissing(value) {

    if (value === undefined || value === null) {
        return true;
    }

    const cleaned = String(value).trim();

    return MISSING_CODES.has(cleaned);
}


function clean(value) {

    if (isMissing(value)) {
        return "";
    }

    return String(value).trim();
}


function normalize(value) {

    return String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function stripTypeWords(value) {

    return normalize(value)
        .replace(
            /\b(county|city|town|village|borough|township|reservation|reserve|area|state)\b/g,
            ""
        )
        .replace(/\s+/g, " ")
        .trim();
}


function lastToken(value) {

    const parts = normalize(value).split(" ");

    return parts[parts.length - 1] || "";
}


/* ================================================================
   ENTITY DEFINITIONS
================================================================ */


function createEntity(
    type,
    name,
    row,
    key,
    extra = {}
) {

    return {

        type,

        name,

        key,

        statefp: clean(row.STATEFP),
        stateName: clean(row.ST_NAME),

        countyfp: clean(row.COUNTYFP),
        countyName: clean(row.COU_NAME),

        cousubfp: clean(row.COUSUBFP),
        cousubName: clean(row.MCD_NAME),

        placefp: clean(row.PLACEFP),
        placeName: clean(row.PL_NAME),

        aiannhce: clean(row.AIANNHCE),
        aiannhName: clean(row.AIA_NAME),

        row,

        ...extra
    };
}


function entitiesFromRow(row) {

    const result = [];


    /* -------------------------
       STATE
    ------------------------- */

    const stateName = clean(row.ST_NAME);
    const statefp = clean(row.STATEFP);

    if (stateName && statefp) {

        result.push(
            createEntity(
                "state",
                stateName,
                row,
                `state|${statefp}`
            )
        );
    }


    /* -------------------------
       COUNTY
    ------------------------- */

    const countyName = clean(row.COU_NAME);
    const countyfp = clean(row.COUNTYFP);

    if (countyName && countyfp) {

        result.push(
            createEntity(
                "county",
                countyName,
                row,
                `county|${statefp}|${countyfp}`
            )
        );
    }


    /* -------------------------
       COUNTY SUBDIVISION
    ------------------------- */

    const mcdName = clean(row.MCD_NAME);
    const cousubfp = clean(row.COUSUBFP);

    if (mcdName && cousubfp) {

        result.push(
            createEntity(
                "mcd",
                mcdName,
                row,
                `mcd|${statefp}|${countyfp}|${cousubfp}`
            )
        );
    }


    /* -------------------------
       PLACE
    ------------------------- */

    const placeName = clean(row.PL_NAME);
    const placefp = clean(row.PLACEFP);

    if (placeName && placefp) {

        result.push(
            createEntity(
                "place",
                placeName,
                row,
                `place|${statefp}|${countyfp}|${placefp}`
            )
        );
    }


    /* -------------------------
       AIANNH
    ------------------------- */

    const aiannhName = clean(row.AIA_NAME);
    const aiannhce = clean(row.AIANNHCE);

    if (aiannhName && aiannhce) {

        result.push(
            createEntity(
                "aiannh",
                aiannhName,
                row,
                `aiannh|${statefp}|${aiannhce}`
            )
        );
    }


    return result;
}


/* ================================================================
   BUILD ENTITY INDEX
================================================================ */


function buildEntityIndex() {

    const entityMap = new Map();


    for (const row of data) {

        const rowEntities = entitiesFromRow(row);


        for (const entity of rowEntities) {

            if (!entityMap.has(entity.key)) {

                entityMap.set(
                    entity.key,
                    entity
                );

            }
        }
    }


    entities = Array.from(
        entityMap.values()
    );


    console.log(
        "Logical entities:",
        entities.length
    );

    console.log(
        entities
    );
}


/* ================================================================
   CSV PARSER
================================================================ */


function parseCSV(text) {

    const rows = [];

    let row = [];

    let value = "";

    let insideQuotes = false;


    for (let i = 0; i < text.length; i++) {

        const char = text[i];

        const next = text[i + 1];


        if (char === '"' && insideQuotes && next === '"') {

            value += '"';

            i++;

            continue;
        }


        if (char === '"') {

            insideQuotes = !insideQuotes;

            continue;
        }


        if (char === "," && !insideQuotes) {

            row.push(value);

            value = "";

            continue;
        }


        if (
            (char === "\n" || char === "\r") &&
            !insideQuotes
        ) {

            if (char === "\r" && next === "\n") {
                i++;
            }

            row.push(value);

            value = "";

            rows.push(row);

            row = [];

            continue;
        }


        value += char;
    }


    if (value.length > 0 || row.length > 0) {

        row.push(value);

        rows.push(row);
    }


    return rows;
}


/* ================================================================
   LOAD CSV
================================================================ */


async function loadCSV() {

    try {

        const response = await fetch(
            "luca_gov_overlap_ny.csv"
        );


        if (!response.ok) {

            throw new Error(
                `Could not load CSV (${response.status})`
            );
        }


        const csvText = await response.text();


        const rows = parseCSV(csvText);


        if (rows.length < 2) {

            throw new Error(
                "The CSV appears to be empty."
            );
        }


        const headers = rows[0].map(
            header => header.trim()
        );


        data = [];


        for (let i = 1; i < rows.length; i++) {

            const values = rows[i];


            if (
                values.length === 1 &&
                values[0].trim() === ""
            ) {
                continue;
            }


            const obj = {};


            headers.forEach(
                (header, index) => {

                    obj[header] =
                        values[index] !== undefined
                            ? values[index].trim()
                            : "";
                }
            );


            data.push(obj);
        }


        buildEntityIndex();


        console.log(
            `Loaded ${data.length} source rows.`
        );


    } catch (error) {

        console.error(error);


        document.getElementById("result").innerHTML = `

            <div class="error-state">

                <strong>
                    The geographic data could not be loaded.
                </strong>

                <br><br>

                Make sure
                <strong>luca_gov_overlap_ny.csv</strong>
                is in the same folder as this HTML file
                and that you are running the project through
                VS Code Live Server.

            </div>

        `;
    }
}


/* ================================================================
   ENTITY TYPE LABELS
================================================================ */


function entityTypeLabel(type) {

    const labels = {

        state: "State",

        county: "County",

        mcd: "County Subdivision",

        place: "Place",

        aiannh: "AIANNH Area"
    };


    return labels[type] || "Jurisdiction";
}


function hierarchyLabel(type) {

    const labels = {

        state: "State",

        county: "County",

        mcd: "County Subdivision",

        place: "Place",

        aiannh: "AIANNH Area"
    };


    return labels[type] || "Jurisdiction";
}


function entityTypeClass(type) {

    return `type-${type}`;
}


/* ================================================================
   SEARCH RANKING
================================================================ */


function scoreEntity(entity, query) {

    const q = normalize(query);

    if (!q) {
        return 0;
    }


    const name = normalize(entity.name);

    const type = normalize(
        entityTypeLabel(entity.type)
    );


    const fullLabel =
        normalize(
            `${entity.name} ${entityTypeLabel(entity.type)}`
        );


    const baseName =
        stripTypeWords(entity.name);


    const baseQuery =
        stripTypeWords(query);


    const queryTokens =
        q.split(" ").filter(Boolean);


    let score = 0;


    /* =========================================================
       LEVEL 1 — EXACT
    ========================================================= */


    if (name === q) {

        score = 1000;
    }


    if (fullLabel === q) {

        score = 1200;
    }


    if (
        baseName &&
        baseQuery &&
        baseName === baseQuery
    ) {

        score = Math.max(
            score,
            1100
        );
    }


    /* =========================================================
       LEVEL 2 — STRONG MATCH
    ========================================================= */


    if (
        fullLabel.startsWith(q)
    ) {

        score = Math.max(
            score,
            800
        );
    }


    if (
        name.startsWith(q)
    ) {

        score = Math.max(
            score,
            750
        );
    }


    if (
        baseName &&
        baseQuery &&
        baseName.startsWith(baseQuery)
    ) {

        score = Math.max(
            score,
            700
        );
    }


    const searchable =
        `${name} ${type}`;


    const allTokensMatch =
        queryTokens.every(
            token =>
                searchable.includes(token)
        );


    if (allTokensMatch) {

        score = Math.max(
            score,
            650
        );
    }


    /* =========================================================
       LEVEL 3 — PARTIAL
    ========================================================= */


    if (name.includes(q)) {

        score = Math.max(
            score,
            500
        );
    }


    if (
        baseQuery &&
        baseName.includes(baseQuery)
    ) {

        score = Math.max(
            score,
            450
        );
    }


    if (
        q.length >= 3 &&
        searchable.includes(q)
    ) {

        score = Math.max(
            score,
            350
        );
    }


    const specificityBonus = {

        place: 7,

        mcd: 6,

        aiannh: 6,

        county: 5,

        state: 4
    };


    score +=
        specificityBonus[entity.type] || 0;


    return score;
}


/* ================================================================
   SEARCH
================================================================ */


function searchEntities(query) {

    const normalizedQuery =
        normalize(query);


    if (!normalizedQuery) {

        return [];
    }


    return entities

        .map(entity => ({

            entity,

            score:
                scoreEntity(
                    entity,
                    normalizedQuery
                )
        }))

        .filter(
            result =>
                result.score > 0
        )

        .sort(
            (a, b) => {

                if (b.score !== a.score) {

                    return b.score - a.score;
                }


                return a.entity.name.localeCompare(
                    b.entity.name
                );
            }
        );
}


/* ================================================================
   SEARCH FORM
================================================================ */


/*
    Normal form submission.

    If the user simply presses Enter without selecting a result
    with the keyboard, this performs the search and leaves the
    matching results displayed.
*/
document
    .getElementById("searchForm")
    .addEventListener(
        "submit",
        function(event) {

            event.preventDefault();


            if (
                activeSearchIndex >= 0 &&
                activeSearchIndex <
                    currentSearchMatches.length
            ) {

                const selected =
                    currentSearchMatches[
                        activeSearchIndex
                    ];


                if (selected && selected.entity) {

                    selectEntityByKey(
                        selected.entity.key
                    );

                    return;
                }
            }


            /*
                No keyboard result is selected.

                Just perform the search normally.
            */
            searchLocation(true);
        }
    );


/* ================================================================
   KEYBOARD SEARCH NAVIGATION
================================================================ */


/*
    This is intentionally kept simple.

    While the search input has focus:

        Arrow Down = move down one result
        Arrow Up   = move up one result
        Enter      = handled by the form above

    If no result is selected, Enter simply performs the search.

    The user does not need to move focus away from the search
    input in order to use the keyboard.
*/
document
    .getElementById("search")
    .addEventListener(
        "keydown",
        function(event) {

            const hasResults =
                currentSearchMatches.length > 0;


            if (!hasResults) {

                return;
            }


            /* ---------------------------------------------
               DOWN
            --------------------------------------------- */

            if (event.key === "ArrowDown") {

                event.preventDefault();


                if (
                    activeSearchIndex <
                    currentSearchMatches.length - 1
                ) {

                    activeSearchIndex++;

                } else {

                    /*
                        Once the user reaches the bottom,
                        another Down key keeps them on the
                        final result.
                    */
                    activeSearchIndex =
                        currentSearchMatches.length - 1;
                }


                updateKeyboardSelection();


                return;
            }


            /* ---------------------------------------------
               UP
            --------------------------------------------- */

            if (event.key === "ArrowUp") {

                event.preventDefault();


                if (activeSearchIndex > 0) {

                    activeSearchIndex--;

                } else {

                    /*
                        If no result is selected yet,
                        Up starts at the first result.

                        If already at the first result,
                        remain there.
                    */
                    activeSearchIndex = 0;
                }


                updateKeyboardSelection();


                return;
            }


            /*
                Enter is deliberately NOT handled here.

                The form's submit handler handles it.

                That means:

                Enter + highlighted result
                    -> opens that result

                Enter + no highlighted result
                    -> performs normal search
            */
        }
    );


/*
    Live search.

    As the user types, matching options are displayed
    immediately.
*/
document
    .getElementById("search")
    .addEventListener(
        "input",
        function() {

            /*
                Every time the search text changes, start the
                keyboard selection over again.
            */
            activeSearchIndex = -1;

            searchLocation(false);
        }
    );


function searchLocation(fromSubmit = false) {

    const input =
        document.getElementById("search");


    const query =
        input.value.trim();


    currentSearch =
        query;


    /*
        No search text means no current search results.
    */
    if (!query) {

        currentSearchMatches = [];

        activeSearchIndex = -1;


        document.getElementById(
            "searchResults"
        ).innerHTML = "";

        return;
    }


    const matches =
        searchEntities(query);


    currentSearchMatches =
        matches;


    /*
        The normal search always starts with no keyboard
        selection.

        This is important because pressing Enter on a new
        search should simply show the results unless the
        user explicitly selected one with Up / Down.
    */
    if (!fromSubmit) {

        activeSearchIndex = -1;

    }


    displaySearchResults(
        matches,
        fromSubmit
    );
}


/* ================================================================
   SEARCH RESULTS DISPLAY
================================================================ */


function displaySearchResults(
    matches,
    fromSubmit = false
) {

    const container =
        document.getElementById(
            "searchResults"
        );


    if (matches.length === 0) {

        currentSearchMatches = [];

        activeSearchIndex = -1;


        container.innerHTML = `

            <div class="empty-state">

                No jurisdictions matched
                <strong>
                    "${escapeHTML(currentSearch)}"
                </strong>.

                <br><br>

                Try a shorter name, or include the type,
                such as <strong>County</strong>,
                <strong>City</strong>,
                <strong>Town</strong>,
                <strong>Village</strong>,
                or <strong>Reservation</strong>.

            </div>

        `;

        return;
    }


    /*
        The search engine ranks everything, but the interface
        presents the strongest 12 choices.
    */
    const visible =
        matches.slice(0, 12);


    /*
        Keyboard navigation should only navigate through
        results that are actually visible on the screen.
    */
    currentSearchMatches =
        visible;


    if (
        activeSearchIndex >=
        visible.length
    ) {

        activeSearchIndex = -1;
    }


    container.innerHTML = `

        <div class="results-header">

            <h3>
                Select the exact jurisdiction
            </h3>

            <span class="results-count">
                ${matches.length}
                matching
                ${matches.length === 1
                    ? "jurisdiction"
                    : "jurisdictions"}
            </span>

        </div>


        <div
            class="result-list"
            role="listbox"
            aria-label="Search results"
        >

            ${visible.map(
                (result, index) =>
                    renderSearchOption(
                        result.entity,
                        index,
                        result.score
                    )
            ).join("")}

        </div>

    `;


    /*
        Attach click handlers after rendering.
    */
    container
        .querySelectorAll(".result-option")
        .forEach(button => {

            button.addEventListener(
                "click",
                function() {

                    const key =
                        this.dataset.key;

                    selectEntityByKey(
                        key
                    );
                }
            );
        });


    updateKeyboardSelection();
}


/* ================================================================
   KEYBOARD SELECTION DISPLAY
================================================================ */


/*
    Applies the visual keyboard highlight to the currently
    selected result.

    The search input remains focused while this happens, so the
    user can simply press Up / Down / Enter without using the mouse.
*/
function updateKeyboardSelection() {

    const buttons =
        document.querySelectorAll(
            ".result-option"
        );


    buttons.forEach(
        (button, index) => {

            const isSelected =
                index === activeSearchIndex;


            button.classList.toggle(
                "keyboard-selected",
                isSelected
            );


            button.setAttribute(
                "aria-selected",
                isSelected
                    ? "true"
                    : "false"
            );


            if (isSelected) {

                /*
                    Keep the highlighted option visible if the
                    results list is longer than the available
                    screen space.
                */
                button.scrollIntoView({
                    block: "nearest"
                });
            }
        }
    );
}


/* ================================================================
   SEARCH RESULT OPTION
================================================================ */


function renderSearchOption(
    entity,
    index,
    score
) {

    const context =
        getEntityContext(entity);


    return `

        <button
            class="result-option"
            type="button"
            role="option"
            aria-selected="false"
            data-key="${escapeHTML(entity.key)}"
        >

            <div class="result-main">

                <div class="result-name">

                    ${escapeHTML(entity.name)}

                    <span
                        class="
                            type-badge
                            ${entityTypeClass(entity.type)}
                        "
                    >
                        ${escapeHTML(
                            entityTypeLabel(entity.type)
                        )}
                    </span>

                </div>


                <div class="result-context">

                    ${escapeHTML(context)}

                </div>

            </div>


            <div class="result-arrow">
                →
            </div>

        </button>

    `;
}


/* ================================================================
   ENTITY CONTEXT
================================================================ */


function getEntityContext(entity) {

    const parts = [];


    if (
        entity.type !== "state" &&
        entity.stateName
    ) {

        parts.push(
            entity.stateName
        );
    }


    if (
        entity.type !== "county" &&
        entity.countyName
    ) {

        parts.push(
            entity.countyName
        );
    }


    if (
        entity.type === "place" &&
        entity.cousubName
    ) {

        parts.push(
            entity.cousubName
        );
    }


    return parts.join("  •  ");
}


/* ================================================================
   SELECT ENTITY
================================================================ */


/*
    This is the normal navigation function.

    It also adds the selected jurisdiction to browser history,
    allowing the browser Back button to move back through the
    jurisdictions the user previously viewed.
*/
function selectEntityByKey(
    key,
    addToHistory = true
) {

    const entity =
        entities.find(
            item =>
                item.key === key
        );


    if (!entity) {
        return;
    }


    document.getElementById(
        "search"
    ).value =
        currentSearch;


    document.getElementById(
        "searchResults"
    ).innerHTML = "";


    currentSearchMatches = [];

    activeSearchIndex = -1;


    displayEntity(
        entity
    );


    /*
        Save this navigation in the browser's history.

        This makes the browser's Back button useful when users
        navigate through the hierarchy.
    */
    if (addToHistory) {

        history.pushState(
            {
                type: "entity",
                key: entity.key
            },
            "",
            ""
        );
    }


    document
        .getElementById("result")
        .scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
}


/* ================================================================
   DISPLAY ENTITY
================================================================ */


function displayEntity(entity) {

    const result =
        document.getElementById(
            "result"
        );


    const hierarchy =
        buildHierarchy(entity);


    const missing =
        getMissingLevels(entity);


    const html = `

        <article class="detail-card">


            <!-- =============================================
                 HEADER
            ============================================== -->

            <div class="detail-header">

                <div class="detail-header-top">

                    <div>

                        <span
                            class="
                                type-badge
                                ${entityTypeClass(entity.type)}
                            "
                        >
                            ${escapeHTML(
                                entityTypeLabel(entity.type)
                            )}
                        </span>


                        <h2>
                            ${escapeHTML(
                                entity.name
                            )}
                        </h2>


                        <p>
                            Selected jurisdiction
                        </p>

                    </div>


                 

                </div>

            </div>



            <!-- =============================================
                 MAIN + SIDEBAR
            ============================================== -->

            <div class="detail-body-grid">


                <!-- =========================================
                     MAIN COLUMN
                ========================================== -->

                <div class="detail-main-column">


                    <!-- =====================================
                         GEOGRAPHIC PATH
                    ====================================== -->

                    <section class="section">

                        <h3 class="section-title">
                            Geographic path
                        </h3>


                        <p class="section-description">
                            Overlapping levels of governments are shown
                        </p>


                        <div class="hierarchy-note">

                            <span>ⓘ</span>

                            <span>
                                Some geographic areas, including
                                AIANNH areas, do not follow the same
                                nesting structure as standard
                                county subdivisions and places.
                                The Explorer preserves that distinction
                                while still showing useful state and
                                county context from the source data.
                            </span>

                        </div>


                        <div class="hierarchy">

                            ${hierarchy}

                        </div>


                        ${
                            missing.length > 0
                                ? `

                                    <div class="missing-information">

                                        <strong>
                                            Other levels in this source record:
                                        </strong>

                                        ${missing
                                            .map(
                                                item =>
                                                    escapeHTML(item)
                                            )
                                            .join("  •  ")}

                                    </div>

                                `
                                : ""
                        }


                        ${
                            entity.type === "aiannh"
                                ? `

                                    <div class="aiannh-context">

                                        <h4>
                                            AIANNH area
                                        </h4>

                                        <p>
                                            This jurisdiction is identified
                                            by the source data as an
                                            American Indian, Alaska Native,
                                            or Native Hawaiian area.
                                            It is displayed as its own
                                            geographic type rather than
                                            being incorrectly classified as
                                            a county subdivision or place.
                                        </p>

                                    </div>

                                `
                                : ""
                        }

                    </section>




                    <!-- =====================================
                         RELATED JURISDICTIONS
                    ====================================== -->

                    ${renderRelatedSection(entity)}

                </div>



                <!-- =========================================
                     RIGHT SIDEBAR
                ========================================== -->


            </div>

        </article>

    `;


    result.innerHTML =
        html;


    attachRelatedToggle();

    attachHierarchyNavigation();
}


/* ================================================================
   BUILD HIERARCHY
================================================================ */



function buildHierarchy(entity) {
    const nodes = [];

    // STATE
    if (entity.stateName) {
        nodes.push({
            type: "state",
            name: entity.stateName,
            identifier: entity.statefp
                ? `FIPS: ${entity.statefp}`
                : "",
            key: entity.statefp
                ? `state|${entity.statefp}`
                : null,
            selected: entity.type === "state"
        });
    }

    // COUNTY
    if (
        entity.countyName &&
        entity.type !== "state"
    ) {
        nodes.push({
            type: "county",
            name: entity.countyName,
            identifier: entity.countyfp
                ? `FIPS: ${entity.countyfp}`
                : "",
            key:
                entity.statefp &&
                entity.countyfp
                    ? `county|${entity.statefp}|${entity.countyfp}`
                    : null,
            selected: entity.type === "county"
        });
    }

    // AIANNH
    if (entity.type === "aiannh") {
        nodes.push({
            type: "aiannh",
            name: entity.aiannhName,
            identifier: entity.aiannhce
                ? `AIANNH Census Code: ${entity.aiannhce}`
                : "",
            key: entity.key,
            selected: true
        });
    }

    // COUNTY SUBDIVISION
    if (
        entity.type !== "aiannh" &&
        entity.cousubName &&
        entity.type !== "county"
    ) {
        nodes.push({
            type: "mcd",
            name: entity.cousubName,
            identifier: entity.cousubfp
                ? `FIPS: ${entity.cousubfp}`
                : "",
            key:
                entity.statefp &&
                entity.countyfp &&
                entity.cousubfp
                    ? `mcd|${entity.statefp}|${entity.countyfp}|${entity.cousubfp}`
                    : null,
            selected: entity.type === "mcd"
        });
    }

    // PLACE
    if (
        entity.type === "place" &&
        entity.placeName
    ) {
        nodes.push({
            type: "place",
            name: entity.placeName,
            identifier: entity.placefp
                ? `FIPS: ${entity.placefp}`
                : "",
            key: entity.key,
            selected: true
        });
    }

    return nodes
        .map((node, index) => {
            const isClickable =
                node.key &&
                !node.selected;

            return `
                <div class="hierarchy-node">
                    <div
                        class="
                            hierarchy-box
                            ${node.selected ? "selected" : ""}
                            ${isClickable ? "clickable" : ""}
                        "
                        ${
                            isClickable
                                ? `data-hierarchy-key="${escapeHTML(node.key)}"`
                                : ""
                        }
                    >
                        <span class="hierarchy-level">
                            ${escapeHTML(hierarchyLabel(node.type))}
                        </span>

                        <span class="hierarchy-name">
                            ${escapeHTML(node.name || "")}
                        </span>

                        ${
                            node.identifier
                                ? `
                                    <span class="hierarchy-identifier">
                                        ${escapeHTML(node.identifier)}
                                    </span>
                                `
                                : ""
                        }

                        ${
                            isClickable
                                ? `
                                    <span class="hierarchy-click-hint">
                                        View this level
                                    </span>
                                `
                                : ""
                        }
                    </div>

                    ${
                        index < nodes.length - 1
                            ? `
                                <div class="hierarchy-arrow">
                                    →
                                </div>
                            `
                            : ""
                    }
                </div>
            `;
        })
        .join("");
}



/* ================================================================
   HIERARCHY NAVIGATION
================================================================ */


function attachHierarchyNavigation() {

    document
        .querySelectorAll(
            "[data-hierarchy-key]"
        )
        .forEach(node => {

            node.addEventListener(
                "click",
                function() {

                    const key =
                        this.dataset.hierarchyKey;


                    selectEntityByKey(
                        key
                    );

                }
            );

        });
}


/* ================================================================
   MISSING LEVELS
================================================================ */


function getMissingLevels(entity) {

    const missing = [];


    if (
        entity.type === "aiannh"
    ) {

        if (!entity.cousubName) {

            missing.push(
                "County subdivision: None"
            );
        }


        if (!entity.placeName) {

            missing.push(
                "Place: None"
            );
        }

    }


    if (
        entity.type === "mcd"
    ) {

        if (!entity.placeName) {

            missing.push(
                "Place: None"
            );
        }
    }


    return missing;
}



/* ================================================================
   RELATED JURISDICTIONS
================================================================ */


function renderRelatedSection(entity) {

    const related =
        getRelatedEntities(entity);


    if (related.length === 0) {

        return "";
    }


    const id =
        `related-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 7)}`;


    return `

        <section class="section">

            <h3 class="section-title">
                Overlapping Governments
            </h3>


            <p class="section-description">
                Expand this section to explore other
                jurisdictions connected to the same
                geographic area.
            </p>


            <button
                class="related-toggle"
                type="button"
                data-target="${id}"
            >

                <span>
                    Show related jurisdictions
                    (${related.length})
                </span>

                <span>
                    +
                </span>

            </button>


            <div
                id="${id}"
                class="related-content"
            >

                <div class="related-list">

                    ${related
                        .slice(0, 100)
                        .map(
                            relatedEntity =>
                                renderRelatedItem(
                                    relatedEntity
                                )
                        )
                        .join("")}

                </div>

            </div>

        </section>

    `;
}


/* ================================================================
   FIND RELATED ENTITIES
================================================================ */


function getRelatedEntities(entity) {

    return entities
        .filter(other => {

            if (
                other.key === entity.key
            ) {

                return false;
            }


            if (
                entity.statefp &&
                other.statefp !== entity.statefp
            ) {

                return false;
            }


            if (
                entity.type === "state"
            ) {

                return true;
            }


            if (
                entity.countyfp &&
                other.countyfp !== entity.countyfp
            ) {

                return false;
            }


            if (
                entity.type === "county"
            ) {

                return true;
            }


            if (
                entity.type === "mcd"
            ) {

                return (
                    other.cousubfp ===
                    entity.cousubfp
                );
            }


            if (
                entity.type === "place"
            ) {

                return (
                    other.placefp ===
                    entity.placefp
                );
            }


            if (
                entity.type === "aiannh"
            ) {

                return (
                    other.aiannhce ===
                    entity.aiannhce
                );
            }


            return false;

        })

        .sort(
            (a, b) => {

                const order = {

                    state: 1,

                    county: 2,

                    mcd: 3,

                    place: 4,

                    aiannh: 5
                };


                return (
                    (order[a.type] || 99) -
                    (order[b.type] || 99)
                );
            }
        );
}


/* ================================================================
   RELATED ITEM
================================================================ */


function renderRelatedItem(entity) {

    return `

        <div
            class="related-item"
            data-related-key="${escapeHTML(entity.key)}"
        >

            <strong>

                ${escapeHTML(
                    entity.name
                )}

            </strong>


            <span>

                ${escapeHTML(
                    entityTypeLabel(
                        entity.type
                    )
                )}

                ${
                    getEntityContext(entity)
                        ? `

                            ·

                            ${escapeHTML(
                                getEntityContext(
                                    entity
                                )
                            )}

                          `
                        : ""
                }

            </span>

        </div>

    `;
}


/* ================================================================
   RELATED TOGGLE
================================================================ */


function attachRelatedToggle() {

    document
        .querySelectorAll(
            ".related-toggle"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                function() {

                    const target =
                        document.getElementById(
                            this.dataset.target
                        );


                    if (!target) {
                        return;
                    }


                    target.classList.toggle(
                        "open"
                    );


                    const isOpen =
                        target.classList.contains(
                            "open"
                        );


                    this
                        .querySelector("span:last-child")
                        .textContent =
                        isOpen
                            ? "−"
                            : "+";


                    this
                        .querySelector("span:first-child")
                        .textContent =
                        isOpen
                            ? "Hide related jurisdictions"
                            : `Show related jurisdictions (${target.querySelectorAll(".related-item").length})`;


                    target
                        .querySelectorAll(
                            ".related-item"
                        )
                        .forEach(item => {

                            item.onclick =
                                function() {

                                    selectEntityByKey(
                                        this.dataset.relatedKey
                                    );
                                };

                        });

                }
            );

        });
}


/* ================================================================
   EXAMPLE SEARCH BUTTONS
================================================================ */


function useExample(value) {

    const input =
        document.getElementById(
            "search"
        );


    input.value =
        value;


    currentSearch =
        value;


    activeSearchIndex = -1;

    currentSearchMatches = [];


    /*
        Treat example buttons as a normal search.
    */
    searchLocation(true);


    input.focus();
}


/* ================================================================
   RESET / HOME
================================================================ */


function resetExplorer(
    addToHistory = true
) {

    const input =
        document.getElementById(
            "search"
        );


    input.value = "";

    currentSearch = "";

    activeSearchIndex = -1;

    currentSearchMatches = [];


    document.getElementById(
        "searchResults"
    ).innerHTML = "";


    document.getElementById(
        "result"
    ).innerHTML = `
        <div class="welcome-card">

            <h3>
                Explore New York jurisdictions
            </h3>

            <p class="welcome-intro">
                Search for a state, county (or county equivalent), 
                county subdivision (town and villages), city, or 
                American Indian, Alaska Native, or Native Hawaiian area. 
                Results are ranked by the quality of the match 
                so you can select the exact jurisdiction you need.
            </p>

            <div class="jurisdiction-guide">

    <div class="guide-item">
        <span class="type-badge type-state">State</span>
        <p>The statewide level of government.</p>
    </div>

    <div class="guide-item">
        <span class="type-badge type-county">County</span>
        <p>A county-level government or administrative area.</p>
    </div>

    <div class="guide-item">
        <span class="type-badge type-mcd">County Subdivision</span>
        <p>A subdivision within a county, such as a town in New York.</p>
    </div>

    <div class="guide-item">
        <span class="type-badge type-place">Place</span>
        <p>A place such as a city or village represented in the data.</p>
    </div>

    <div class="guide-item">
        <span class="type-badge type-aiannh">AIANNH Area</span>
        <p>American Indian, Alaska Native, and Native Hawaiian areas represented in the geographic data.</p>
    </div>

</div>


        </div>

    `;


    /*
        If the user clicked the LUCA title to return home,
        store that action in browser history so the browser
        Back button can move forward through the previous
        application state.
    */
    if (addToHistory) {

        history.pushState(
            {
                type: "home"
            },
            "",
            ""
        );
    }


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });


    input.focus();
}


/* ================================================================
   HOME BUTTON
================================================================ */


document
    .getElementById("homeButton")
    .addEventListener(
        "click",
        function() {

            resetExplorer(true);

        }
    );


/* ================================================================
   BROWSER BACK / FORWARD NAVIGATION
================================================================ */


/*
    If the user navigates between jurisdictions and then presses
    the browser Back button, restore the previous jurisdiction.

    This is deliberately simple and does not change the URL.
*/
window.addEventListener(
    "popstate",
    function(event) {

        const state =
            event.state;


        if (
            state &&
            state.type === "entity" &&
            state.key
        ) {

            selectEntityByKey(
                state.key,
                false
            );


            return;
        }


        /*
            No entity state means we return to the home/search
            screen.
        */
        resetExplorer(false);
    }
);


/* ================================================================
   BACK TO SEARCH
================================================================ */


/*
    Show the floating button once the user has scrolled past the
    main search area.
*/
function updateBackToSearchButton() {

    const searchHero =
        document.getElementById(
            "searchHero"
        );


    const button =
        document.getElementById(
            "backToSearch"
        );


    if (!searchHero || !button) {
        return;
    }


    const searchBottom =
        searchHero.getBoundingClientRect().bottom;


    if (searchBottom < 0) {

        button.classList.add(
            "visible"
        );

    } else {

        button.classList.remove(
            "visible"
        );

    }
}


window.addEventListener(
    "scroll",
    updateBackToSearchButton,
    {
        passive: true
    }
);


document
    .getElementById("backToSearch")
    .addEventListener(
        "click",
        function() {

            document
                .getElementById("searchHero")
                .scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });


            setTimeout(
                function() {

                    document
                        .getElementById("search")
                        .focus();

                },
                450
            );

        }
    );


/* ================================================================
   START APPLICATION
================================================================ */


loadCSV();

