import { uid } from "../defaults";
import type { Guideword, Study } from "../types";

export function GuidewordsView({ study, update }: { study: Study; update: (fn: (s: Study) => Study) => void }) {
  const setGw = (id: string, patch: Partial<Guideword>) =>
    update((s) => ({ ...s, guidewords: s.guidewords.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));

  return (
    <div className="page">
      <h1>Guidewords</h1>
      <p className="muted">
        The guideword library used in this study. Renaming a guideword does not change scenarios that already use it.
      </p>
      <table className="simple-table">
        <thead>
          <tr>
            <th style={{ width: "22%" }}>Category</th>
            <th style={{ width: "26%" }}>Guideword</th>
            <th>Prompt</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {study.guidewords.map((g) => (
            <tr key={g.id}>
              <td><input value={g.category} onChange={(e) => setGw(g.id, { category: e.target.value })} /></td>
              <td><input value={g.name} onChange={(e) => setGw(g.id, { name: e.target.value })} /></td>
              <td><input value={g.prompt} onChange={(e) => setGw(g.id, { prompt: e.target.value })} /></td>
              <td className="row-tools">
                <button
                  className="icon-btn danger"
                  title="Remove"
                  onClick={() => update((s) => ({ ...s, guidewords: s.guidewords.filter((x) => x.id !== g.id) }))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="link-btn"
        onClick={() =>
          update((s) => {
            const last = s.guidewords[s.guidewords.length - 1];
            return {
              ...s,
              guidewords: [...s.guidewords, { id: uid(), category: last?.category ?? "", name: "", prompt: "" }],
            };
          })
        }
      >
        + Add guideword
      </button>
    </div>
  );
}
