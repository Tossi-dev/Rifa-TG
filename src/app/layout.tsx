import type { Metadata, Viewport } from "next";
import { RIFA, brl } from "@/lib/config";
import { SCRIPT_TEMA } from "@/components/admin/tema";
import "./globals.css";

const descricao = `Concorra a uma ${RIFA.premios[0].nome} 0km, uma diária no Espaço Famma e um voucher da The Best Açaí. Cada número custa ${brl(
  RIFA.precoCota
)} e o sorteio é em ${RIFA.dataSorteioLabel}.`;

const base =
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: `${RIFA.titulo} | ${RIFA.subtitulo}`,
  description: descricao,
  openGraph: {
    title: `${RIFA.titulo} — Moto elétrica 0km`,
    description: descricao,
    type: "website",
    locale: "pt_BR",
    images: ["/img/moto.webp"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#157532",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* `suppressHydrationWarning` porque o script abaixo altera a classe do
       <html> antes do React assumir: sem isto o React reclama de um atributo
       que ele não escreveu, no console de todo mundo. */
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
