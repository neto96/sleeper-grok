import { APP_VERSION, CHANGELOG } from "@/lib/sleeper/release";

export function ReleaseInfo() {
  return (
    <details className="mt-2 max-w-xl text-sm text-muted-foreground">
      <summary className="min-h-11 cursor-pointer rounded-md py-3 text-xs focus-visible:outline-2 focus-visible:outline-ring">
        <span className="font-medium">v{APP_VERSION}</span>
        <span className="ml-3 underline underline-offset-4">What's new</span>
      </summary>
      <div className="mt-1 space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
        {CHANGELOG.map((release) => (
          <section key={release.version} aria-label={`Version ${release.version}`}>
            <h2 className="text-sm font-semibold">V{release.version}</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {release.changes.map((change) => <li key={change}>{change}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
