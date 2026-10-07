import { RegionSelector } from "./region-selector";

export default function HomePage() {
  return (
    <main>
      <p>社内学習用Lab</p>
      <h1>AWS Internal Lab</h1>
      <p>AWS Management Consoleの操作学習を目的とした社内Prototypeです。</p>

      <section aria-labelledby="workspace-heading">
        <h2 id="workspace-heading">Lab Workspace</h2>
        <RegionSelector />
      </section>
    </main>
  );
}
