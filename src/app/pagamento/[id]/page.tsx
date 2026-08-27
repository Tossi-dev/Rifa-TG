import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AcompanharPedido } from "@/components/pagamento/acompanhar-pedido";
import { RIFA } from "@/lib/config";
import { paraVisao, sincronizarPedido } from "@/lib/pedido";
import { buscarPedido } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Pagamento | ${RIFA.titulo}`,
  robots: { index: false, follow: false },
};

export default async function PaginaPagamento({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pedido = await buscarPedido(id);
  if (!pedido) notFound();

  // Confirma ou expira antes de renderizar, para a tela nascer no estado certo.
  const atual = await sincronizarPedido(pedido);

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 px-4 py-8">
      <Link
        href="/"
        className="nao-imprimir flex items-center gap-2 self-start text-sm font-semibold text-muted-foreground hover:text-verde"
      >
        <ArrowLeft className="size-4" /> {RIFA.titulo}
      </Link>
      <AcompanharPedido inicial={paraVisao(atual)} />
    </main>
  );
}
