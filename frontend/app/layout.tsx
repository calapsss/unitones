import "./globals.css";
export const metadata = {
  title: "Unit Ones",
  description: "BAGWIS-informed unit readiness and headquarters consolidation",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
