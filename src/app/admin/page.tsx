import type { Metadata } from "next";

import { PainelAdmin } from "@/components/admin/painel-admin";
import { RIFA } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Painel | ${RIFA.titulo}`,
  // Área do organizador: nunca deve aparecer em busca.
  robots: { index: false, follow: false, nocache: true },
};

export default function PaginaAdmin() {
  return <PainelAdmin />;
}
