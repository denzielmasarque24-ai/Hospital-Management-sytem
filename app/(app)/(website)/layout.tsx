import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
