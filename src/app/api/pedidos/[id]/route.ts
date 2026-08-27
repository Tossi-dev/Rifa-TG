import { NextResponse } from "next/server";

import { paraVisao, sincronizarPedido } from "@/lib/pedido";
import { buscarPedido } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pedido = await buscarPedido(id);
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  /* Ainda pendente: confere no gateway e trata a expiração. */
  const atual = await sincronizarPedido(pedido);

  return NextResponse.json(paraVisao(atual));
}
