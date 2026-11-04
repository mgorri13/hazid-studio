import type { Node, RiskCategory, RiskMatrix, Row, Study } from "./types";

export const uid = () => crypto.randomUUID();

// Indicative frequency bands and consequence descriptions for a nuclear facility.
// Every study carries its own copy, so these can be tailored per project.
export const DEFAULT_MATRIX: RiskMatrix = {
  likelihood: [
    { code: "A", label: "Extremely unlikely", description: "Not expected during the facility lifetime (< 1E-4 per year)." },
    { code: "B", label: "Very unlikely", description: "Has occurred in the industry but not expected at this facility (1E-4 to 1E-3 per year)." },
    { code: "C", label: "Unlikely", description: "Could occur once during the facility lifetime (1E-3 to 1E-2 per year)." },
    { code: "D", label: "Possible", description: "Expected a few times during the facility lifetime (1E-2 to 1E-1 per year)." },
    { code: "E", label: "Likely", description: "Expected several times; has occurred at this or similar facilities (> 1E-1 per year)." },
  ],
  severity: [
    { code: "1", label: "Negligible", description: "No injury. No radiological consequence beyond planned operational exposure. Negligible damage." },
    { code: "2", label: "Minor", description: "First-aid injury. Small unplanned worker dose well within limits. Minor contamination confined to a controlled area." },
    { code: "3", label: "Moderate", description: "Lost-time injury. Unplanned worker dose approaching limits or spread of contamination on site. Limited plant damage." },
    { code: "4", label: "Major", description: "Serious injury or single fatality. Worker dose exceeding statutory limits or significant on-site release. Major plant damage." },
    { code: "5", label: "Catastrophic", description: "Multiple fatalities. Off-site radiological release requiring public protective measures. Loss of the facility." },
  ],
  // Rows: likelihood A..E, columns: severity 1..5
  cells: [
    ["L", "L", "L", "M", "M"],
    ["L", "L", "M", "M", "H"],
    ["L", "M", "M", "H", "H"],
    ["M", "M", "H", "H", "H"],
    ["M", "H", "H", "H", "H"],
  ],
  classes: [
    { code: "L", label: "Low", color: "#d6f0de" },
    { code: "M", label: "Medium", color: "#fcecb8" },
    { code: "H", label: "High", color: "#f6c9c4" },
  ],
};

// Starting risk database, structured after the hazard groups in IAEA SSG-64 (internal hazards),
// SSG-68 (external hazards) and common radiological / conventional safety checklists.
const DEFAULT_SCENARIOS: [string, string, string][] = [
  ["Radiological", "Direct radiation", "Exposure to radiation from sources, process streams, waste or gaps in shielding."],
  ["Radiological", "Loss of shielding", "Removal, degradation or bypass of shielding; incorrect source positioning."],
  ["Radiological", "Contamination", "Spread of loose or airborne radioactive contamination; loss of contamination control."],
  ["Radiological", "Loss of confinement", "Failure of containment barriers, ventilation cascade or filtration; leaks of radioactive material."],
  ["Radiological", "Criticality", "Accumulation of fissile material; loss of mass, geometry, moderation or concentration control."],
  ["Radiological", "Decay heat", "Loss of heat removal from fuel, waste or sources; overheating."],
  ["Radiological", "Radioactive waste", "Generation, handling, storage or transfer of solid, liquid or gaseous radioactive waste."],
  ["Radiological", "Radiolysis / hydrogen", "Flammable gas generation by radiolysis or corrosion; accumulation in vessels or rooms."],
  ["Internal hazards", "Internal fire", "Fire loads, ignition sources, fire spread between areas, impact on safety functions."],
  ["Internal hazards", "Internal explosion", "Flammable gases, dusts or chemicals; pressure vessel failure."],
  ["Internal hazards", "Internal flooding", "Pipe or tank failure, fire-fighting water, spray and drainage capacity."],
  ["Internal hazards", "Dropped and impacting loads", "Lifting over fuel, sources or safety equipment; vehicle impacts."],
  ["Internal hazards", "Internal missiles", "Rotating machinery, pressurised components, valve stems."],
  ["Internal hazards", "High-energy line break", "Pipe whip, jet impingement, room pressurisation, environmental effects."],
  ["Internal hazards", "Loss of HVAC", "Loss of ventilation, cooling or heating; extreme room conditions."],
  ["Internal hazards", "Electromagnetic interference", "EMI/RFI affecting instrumentation and control equipment."],
  ["External hazards", "Seismic", "Earthquake effects on structures, systems and components, including seismic interaction."],
  ["External hazards", "Extreme weather", "High winds, extreme temperatures, snow, ice, hail."],
  ["External hazards", "External flooding", "River, sea, extreme rainfall, failure of dams or site drainage."],
  ["External hazards", "Lightning", "Direct strike and induced effects on electrical and I&C systems."],
  ["External hazards", "Aircraft crash", "Accidental aircraft impact, fuel fire."],
  ["External hazards", "Nearby industrial / transport accidents", "Explosions, toxic or flammable clouds from neighbouring sites, roads, rail or shipping."],
  ["External hazards", "Biological / environmental", "Biofouling of intakes, wildfire, dust or sand storms."],
  ["Systems and services", "Loss of electrical power", "Loss of off-site or on-site power; failure of back-up supplies."],
  ["Systems and services", "Loss of instrumentation and control", "Spurious signals, loss of indication, software faults, loss of protection systems."],
  ["Systems and services", "Loss of utilities", "Loss of cooling water, compressed air, steam or other support services."],
  ["Systems and services", "Overpressure / underpressure", "Blocked outlets, thermal expansion, vacuum collapse."],
  ["Systems and services", "Chemical / toxic release", "Release of process chemicals or toxic gases; chemical reactions."],
  ["Systems and services", "Ageing and obsolescence", "Degradation of materials, obsolete components, loss of spares."],
  ["Human and organisational", "Operator error", "Wrong action, omission or sequence; workload; human–machine interface."],
  ["Human and organisational", "Maintenance and testing error", "Errors during maintenance, calibration or testing; restoration errors."],
  ["Human and organisational", "Procedures and training", "Missing, unclear or incorrect procedures; competence."],
  ["Conventional safety", "Work at height", "Falls of persons or objects."],
  ["Conventional safety", "Lifting operations", "Crane and hoist operations affecting personnel."],
  ["Conventional safety", "Confined spaces", "Oxygen depletion, toxic atmospheres, access and rescue."],
  ["Conventional safety", "Electrical safety", "Electric shock, arc flash."],
  ["Conventional safety", "Hazardous substances", "Exposure to chemicals, asbestos, dusts."],
  ["Conventional safety", "Manual handling", "Musculoskeletal injuries."],
  ["Environment and security", "Non-radiological discharges", "Releases to air, water or ground of non-radioactive pollutants."],
  ["Environment and security", "Security interface", "Conflicts between safety and security measures, e.g. access control versus evacuation."],
];

export function defaultCategories(): RiskCategory[] {
  const categories: RiskCategory[] = [];
  for (const [category, name, description] of DEFAULT_SCENARIOS) {
    let c = categories.find((x) => x.name === category);
    if (!c) categories.push((c = { id: uid(), name: category, scenarios: [] }));
    c.scenarios.push({ id: uid(), name, description });
  }
  return categories;
}

/** Deep copy with fresh ids, so a study's copy never shares ids with the database. */
export const copyCategories = (categories: RiskCategory[]): RiskCategory[] =>
  categories.map((c) => ({ ...c, id: uid(), scenarios: c.scenarios.map((s) => ({ ...s, id: uid() })) }));

/**
 * Adds to `target` every category and scenario from `source` that it does not already have
 * (matched by name, ignoring case). Nothing is removed or overwritten.
 */
export function mergeCategories(target: RiskCategory[], source: RiskCategory[]): RiskCategory[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const result = target.map((c) => ({ ...c, scenarios: [...c.scenarios] }));
  for (const src of source) {
    let c = result.find((x) => same(x.name, src.name));
    if (!c) result.push((c = { id: uid(), name: src.name, scenarios: [] }));
    for (const s of src.scenarios) {
      if (!c.scenarios.some((x) => same(x.name, s.name))) c.scenarios.push({ ...s, id: uid() });
    }
  }
  return result;
}

export const newStudy = (database: RiskCategory[], matrix: RiskMatrix): Study => ({
  info: {
    title: "",
    facility: "",
    reference: "",
    revision: "A",
    date: new Date().toISOString().slice(0, 10),
    facilitator: "",
    scribe: "",
    scope: "",
  },
  team: [],
  nodes: [],
  rows: [],
  categories: copyCategories(database),
  matrix: structuredClone(matrix),
});

export const newNode = (n: number): Node => ({ id: uid(), name: `Node ${n}`, description: "", drawings: "" });

export const newRow = (nodeId: string, scenario = ""): Row => ({
  id: uid(),
  nodeId,
  scenario,
  hazard: "",
  cause: "",
  consequence: "",
  safeguards: "",
  likelihood: null,
  severity: null,
  recommendations: "",
  residualLikelihood: null,
  residualSeverity: null,
  owner: "",
  status: "Open",
  comments: "",
});
