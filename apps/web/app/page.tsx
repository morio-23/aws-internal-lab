import { ServiceConsole } from "./service-console";

export default function HomePage() {
  return (
    <main style={{ padding: "1.5rem" }}>
      <header>
        <p>AWS Internal Lab / 社内学習用Prototype</p>
        <p>
          AWS Management Consoleの操作導線を学習するための社内Labです。
          AWS公式サービスではありません。
        </p>
      </header>
      <ServiceConsole />
    </main>
  );
}
