const regions = [
  { code: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { code: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
];

export default function HomePage() {
  return (
    <main>
      <p>社内学習用Lab</p>
      <h1>AWS Internal Lab</h1>
      <p>AWS Management Consoleの操作学習を目的とした社内Prototypeです。</p>

      <section aria-labelledby="regions-heading">
        <h2 id="regions-heading">Virtual Regions</h2>
        <ul>
          {regions.map((region) => (
            <li key={region.code}>
              {region.label} ({region.code})
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
