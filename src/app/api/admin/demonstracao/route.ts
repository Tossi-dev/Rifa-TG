import { NextResponse } from "next/server";

import { barrarSeNaoForAdmin } from "@/lib/admin";
import { montarPainelSimulado } from "@/lib/painel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Painel preenchido com dados FICTÍCIOS.
 *
 * Serve para o organizador ver como a tela fica antes de existir venda. Fica
 * atrás da mesma senha do painel real — não por causa do dado, que é
 * inventado, mas porque uma rota aberta devolvendo algo com cara de
 * conciliação é convite a confusão.
 */
export async function GET(req: Request) {
  const recusa = await barrarSeNaoForAdmin(req);
  if (recusa) return recusa;

  const { painel, pagos } = montarPainelSimulado();
  const arrecadado = painel.kpis.find((k) => k.id === "arrecadado")?.valor ?? 0;
  const cotas = painel.kpis.find((k) => k.id === "cotas")?.valor ?? 0;

  return NextResponse.json(
    {
      gerado: painel.gerado,
      resumo: {
        total: painel.meta.lote,
        vendidas: cotas,
        disponiveis: Math.max(0, painel.meta.lote - cotas),
        percentual: Math.round((cotas / painel.meta.lote) * 100),
      },
      totais: {
        pedidos: pagos.length,
        pagos: pagos.length,
        pendentes: 0,
        expirados: 0,
        reembolsar: 0,
        conflitos: 0,
        valorPago: arrecadado,
        cotasPagas: cotas,
        cotasAguardando: 0,
        valorAReembolsar: 0,
      },
      pagos,
      reembolsar: [],
      conflitos: [],
      painel,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
