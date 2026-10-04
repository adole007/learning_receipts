import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Receipts for Learning",
  description: "Turn free learning resources into structured, verifiable proof of competence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand">
              Receipts<span>for learning</span>
            </Link>
            <nav className="nav">
              <Link href="/#pathways">My pathways</Link>
              <Link href="/#new">New pathway</Link>
            </nav>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer>
          <div className="wrap spread">
            <span>AI structures and assesses. Your sources remain the source of truth.</span>
            <span className="mono">v0.1 · MVP</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
