import { ask } from "@tauri-apps/plugin-dialog";
import { uid } from "../defaults";
import type { HazardousScenario, RiskCategory } from "../types";
import { TextCell } from "./fields";

export type DatabaseScope = "database" | "study";

interface Props {
  scope: DatabaseScope;
  onScope: (s: DatabaseScope) => void;
  categories: RiskCategory[];
  onChange: (fn: (c: RiskCategory[]) => RiskCategory[]) => void;
  onDatabaseToStudy: () => void;
  onStudyToDatabase: () => void;
}

export function RiskDatabaseView(props: Props) {
  const { categories, onChange } = props;

  const setCategory = (id: string, patch: Partial<RiskCategory>) =>
    onChange((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const setScenario = (catId: string, id: string, patch: Partial<HazardousScenario>) =>
    onChange((cs) =>
      cs.map((c) =>
        c.id === catId ? { ...c, scenarios: c.scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : c,
      ),
    );

  const addScenario = (catId: string) =>
    onChange((cs) =>
      cs.map((c) =>
        c.id === catId ? { ...c, scenarios: [...c.scenarios, { id: uid(), name: "", description: "" }] } : c,
      ),
    );

  const removeScenario = (catId: string, id: string) =>
    onChange((cs) => cs.map((c) => (c.id === catId ? { ...c, scenarios: c.scenarios.filter((s) => s.id !== id) } : c)));

  const removeCategory = async (cat: RiskCategory) => {
    if (cat.scenarios.length > 0) {
      const ok = await ask(`Delete category "${cat.name}" and its ${cat.scenarios.length} hazardous scenario(s)?`, {
        title: "Delete category",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
    }
    onChange((cs) => cs.filter((c) => c.id !== cat.id));
  };

  const moveCategory = (id: string, dir: -1 | 1) =>
    onChange((cs) => {
      const i = cs.findIndex((c) => c.id === id);
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const total = categories.reduce((n, c) => n + c.scenarios.length, 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Risk database</h1>
        <div className="segmented">
          <button className={props.scope === "database" ? "active" : ""} onClick={() => props.onScope("database")}>
            All studies
          </button>
          <button className={props.scope === "study" ? "active" : ""} onClick={() => props.onScope("study")}>
            This study
          </button>
        </div>
      </div>
      <div className="db-intro">
        <p className="muted">
          {props.scope === "database"
            ? "Your library of risk categories and hazardous scenarios, stored on this computer. New studies start with a copy of it."
            : "The categories and hazardous scenarios available in this study, saved inside the .hazid file. Renaming one does not change rows that already use it."}{" "}
          {categories.length} categories · {total} hazardous scenarios.
        </p>
        {props.scope === "database" ? (
          <button className="btn" onClick={props.onDatabaseToStudy} title="Adds categories and scenarios this study does not have yet">
            Add to this study
          </button>
        ) : (
          <button className="btn" onClick={props.onStudyToDatabase} title="Adds categories and scenarios the database does not have yet">
            Save to database
          </button>
        )}
      </div>

      {categories.map((cat, ci) => (
        <section key={cat.id} className="db-category">
          <div className="db-category-head">
            <input
              className="db-category-name"
              placeholder="Category name"
              value={cat.name}
              onChange={(e) => setCategory(cat.id, { name: e.target.value })}
            />
            <span className="muted">{cat.scenarios.length}</span>
            <span className="db-tools">
              <button className="icon-btn" title="Move up" disabled={ci === 0} onClick={() => moveCategory(cat.id, -1)}>↑</button>
              <button className="icon-btn" title="Move down" disabled={ci === categories.length - 1} onClick={() => moveCategory(cat.id, 1)}>↓</button>
              <button className="icon-btn danger" title="Delete category" onClick={() => removeCategory(cat)}>×</button>
            </span>
          </div>
          <table className="simple-table">
            <tbody>
              {cat.scenarios.map((sc) => (
                <tr key={sc.id}>
                  <td style={{ width: "32%" }}>
                    <input
                      placeholder="Hazardous scenario"
                      value={sc.name}
                      onChange={(e) => setScenario(cat.id, sc.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <TextCell
                      className="boxed"
                      placeholder="Description / prompts for the team"
                      value={sc.description}
                      onChange={(v) => setScenario(cat.id, sc.id, { description: v })}
                    />
                  </td>
                  <td className="row-tools">
                    <button className="icon-btn danger" title="Delete hazardous scenario" onClick={() => removeScenario(cat.id, sc.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="link-btn" onClick={() => addScenario(cat.id)}>
            + Add hazardous scenario
          </button>
        </section>
      ))}

      <button
        className="btn db-add-category"
        onClick={() => onChange((cs) => [...cs, { id: uid(), name: "New category", scenarios: [] }])}
      >
        + Add category
      </button>
    </div>
  );
}
