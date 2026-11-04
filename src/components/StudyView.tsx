import { uid } from "../defaults";
import type { Study, StudyInfo, TeamMember } from "../types";
import { Field } from "./fields";

export function StudyView({ study, update }: { study: Study; update: (fn: (s: Study) => Study) => void }) {
  const setInfo = (key: keyof StudyInfo) => (v: string) =>
    update((s) => ({ ...s, info: { ...s.info, [key]: v } }));

  const setMember = (id: string, patch: Partial<TeamMember>) =>
    update((s) => ({ ...s, team: s.team.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  const i = study.info;
  return (
    <div className="page">
      <h1>Study details</h1>
      <div className="form-grid">
        <Field label="Study title" value={i.title} onChange={setInfo("title")} />
        <Field label="Facility" value={i.facility} onChange={setInfo("facility")} />
        <Field label="Document reference" value={i.reference} onChange={setInfo("reference")} />
        <Field label="Revision" value={i.revision} onChange={setInfo("revision")} />
        <Field label="Date" type="date" value={i.date} onChange={setInfo("date")} />
        <Field label="Facilitator" value={i.facilitator} onChange={setInfo("facilitator")} />
        <Field label="Scribe" value={i.scribe} onChange={setInfo("scribe")} />
      </div>
      <Field label="Scope and objectives" multiline value={i.scope} onChange={setInfo("scope")} />

      <h2>Team</h2>
      <table className="simple-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role / discipline</th>
            <th>Organisation</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {study.team.map((m) => (
            <tr key={m.id}>
              <td><input value={m.name} onChange={(e) => setMember(m.id, { name: e.target.value })} /></td>
              <td><input value={m.role} onChange={(e) => setMember(m.id, { role: e.target.value })} /></td>
              <td><input value={m.organisation} onChange={(e) => setMember(m.id, { organisation: e.target.value })} /></td>
              <td className="row-tools">
                <button
                  className="icon-btn"
                  title="Remove"
                  onClick={() => update((s) => ({ ...s, team: s.team.filter((x) => x.id !== m.id) }))}
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
          update((s) => ({ ...s, team: [...s.team, { id: uid(), name: "", role: "", organisation: "" }] }))
        }
      >
        + Add team member
      </button>
    </div>
  );
}
