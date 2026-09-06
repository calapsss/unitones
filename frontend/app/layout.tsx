import "./globals.css";
export const metadata = {
  title: "Unit Readiness",
  description: "Unit-owned daily returns and headquarters consolidation",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
