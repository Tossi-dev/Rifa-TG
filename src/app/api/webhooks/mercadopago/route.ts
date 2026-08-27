import { NextResponse } from "next/server";

import { processarNotificacao } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Formato (parcial) da notificação enviada pelo Mercado Pago. */
interface CorpoNotificacao {
  data?: { id?: string | number };
  resource?: string;
  type?: string;
  topic?: string;
}

/**
 * Webhook do Mercado Pago.
 *
 * Esta rota só traduz HTTP: toda a regra (assinatura, consulta na API,
 * expiração, conflito) vive em `src/lib/webhook.ts`, que é testável.
 *
 * Respondemos 200 sempre que a notificação foi processada, para o MP não
 * ficar reenviando indefinidamente.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);

  let corpo: CorpoNotificacao | null = null;
  try {
    corpo = (await req.json()) as CorpoNotificacao;
  } catch {
    corpo = null;
  }

  const idPagamento =
    corpo?.data?.id?.toString() ??
    corpo?.resource?.toString()?.split("/").pop() ??
    url.searchParams.get("data.id") ??
    url.searchParams.get("id");

  const tipo = corpo?.type ?? corpo?.topic ?? url.searchParams.get("type");

  try {
    const resultado = await processarNotificacao({
      idPagamento: idPagamento ?? null,
      tipo: tipo ?? null,
      xSignature: req.headers.get("x-signature"),
      xRequestId: req.headers.get("x-request-id"),
    });

    if (resultado.http === 401) {
      console.warn("Webhook com assinatura inválida:", idPagamento);
      return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
    }
    if (resultado.desfecho === "indefinido") {
      // 500 de propósito: queremos o reenvio do Mercado Pago.
      console.warn("Webhook sem desfecho, pedindo reenvio:", idPagamento);
      return NextResponse.json(
        { erro: "Ainda processando. Reenvie.", desfecho: resultado.desfecho },
        { status: 500 }
      );
    }
    if (resultado.desfecho === "conflito" || resultado.desfecho === "sem-pedido") {
      console.warn("Webhook em conflito:", idPagamento, resultado.desfecho);
    }
    return NextResponse.json({ ok: true, desfecho: resultado.desfecho });
  } catch (e) {
    console.error("Erro no webhook:", e);
    // 500 faz o Mercado Pago tentar de novo mais tarde.
    return NextResponse.json({ erro: "Falha ao processar." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
