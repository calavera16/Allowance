import { useRef, useState, type FormEvent } from "react";

type ProfileSummary = { id: string; name: string; snapshots: number };
type Editor = "create" | "rename" | "delete" | null;

export function ProfileManager({ profiles, activeId, sessionActive, onAdd, onRename, onDelete, onSelect }: {
  profiles: ProfileSummary[];
  activeId: string;
  sessionActive: boolean;
  onAdd: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSelect: (id: string) => void;
}) {
  const active = profiles.find(profile => profile.id === activeId)!;
  const [editor, setEditor] = useState<Editor>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const start = (next: Editor, button: HTMLButtonElement) => {
    trigger.current = button;
    setName(next === "rename" ? active.name : "");
    setError("");
    setEditor(next);
  };
  const close = () => {
    setEditor(null);
    setError("");
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) { setError("Enter a profile name."); return; }
    if (profiles.some(profile => profile.name.toLocaleLowerCase() === value.toLocaleLowerCase() &&
      (editor !== "rename" || profile.id !== activeId))) {
      setError("A profile already uses that name. Choose a different name.");
      return;
    }
    if (editor === "create") onAdd(value);
    else onRename(value);
    close();
  };

  return <section>
    <h3>Profiles</h3>
    <p className="muted-copy">Keep separate histories and preferences for work and personal use.
      Profiles share the accounts signed in through Codex and Claude Code.</p>
    <div className="profile-list" aria-label="Your profiles">
      {profiles.map(profile => <div className={`profile-list__row ${profile.id === activeId ? "active" : ""}`} key={profile.id}>
        <div><strong>{profile.name}</strong><small>{profile.snapshots.toLocaleString()} saved {profile.snapshots === 1 ? "snapshot" : "snapshots"}</small></div>
        {profile.id === activeId ? <span className="profile-current">Current profile</span> :
          <button className="button button--secondary" type="button" disabled={sessionActive || editor !== null}
            aria-label={`Switch to ${profile.name}`} onClick={() => onSelect(profile.id)}>Switch</button>}
      </div>)}
    </div>
    <div className="button-row profile-actions">
      <button type="button" className="button button--secondary" disabled={sessionActive || editor !== null}
        onClick={event => start("create", event.currentTarget)}>New profile</button>
      <button type="button" className="button button--secondary" disabled={editor !== null}
        onClick={event => start("rename", event.currentTarget)}>Rename profile</button>
      <button type="button" className="button button--danger" disabled={profiles.length === 1 || sessionActive || editor !== null}
        onClick={event => start("delete", event.currentTarget)}>Delete profile</button>
    </div>
    {editor && <div className="profile-editor" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close(); }
    }}>
      {editor === "delete" ? <div role="group" aria-labelledby="profile-delete-title">
        <h4 id="profile-delete-title">Delete {active.name}?</h4>
        <p>This removes its local history, sessions, and preferences. Export a backup first if you want to keep them.</p>
        <div className="button-row">
          <button type="button" className="button button--secondary" autoFocus onClick={close}>Cancel</button>
          <button type="button" className="button button--danger" onClick={() => { onDelete(); close(); }}>Delete permanently</button>
        </div>
      </div> : <form onSubmit={save} noValidate>
        <label htmlFor="profile-name">{editor === "create" ? "New profile name" : "Rename " + active.name}</label>
        <input id="profile-name" autoFocus autoComplete="off" maxLength={40} placeholder="e.g. Work"
          value={name} aria-invalid={Boolean(error)} aria-describedby={error ? "profile-name-error" : "profile-name-help"}
          onChange={event => { setName(event.target.value); setError(""); }} />
        {error ? <p id="profile-name-error" role="alert">{error}</p> : <p id="profile-name-help">Up to 40 characters. You can rename this later.</p>}
        <div className="button-row">
          <button type="submit" className="button button--primary">{editor === "create" ? "Create profile" : "Save name"}</button>
          <button type="button" className="button button--secondary" onClick={close}>Cancel</button>
        </div>
      </form>}
    </div>}
    {sessionActive && <p className="muted-copy">Finish your coding session before creating, switching, or deleting profiles.</p>}
    {profiles.length === 1 && !editor && <p className="settings-footnote">Create a second profile to enable the switcher in the dashboard header.</p>}
  </section>;
}
