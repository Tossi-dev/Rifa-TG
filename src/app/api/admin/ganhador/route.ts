import { NextResponse } from "next/server";

import { barrarSeNaoForAdmin } from "@/lib/admin";
import { buscarGanhador } from "@/lib/conciliacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quem ficou com o número sorteado.
 *
 * `GET /api/admin/ganhador?numero=482` devolve o pedido pago dono do número,
 * com nome, WhatsApp e data do pagamento — o que o organizador precisa para
 * anunciar e entregar o prêmio.
 */
export async function GET(req: Request) {
  const recusa = await barrarSeNaoForAdmin(req);
  if (recusa) return recusa;

  const bruto = new URL(req.url).searchParams.get("numero")?.trim() ?? "";
  // Aceita "0482" e "482"; recusa qualquer coisa que não seja só dígitos.
  if (!/^\d{1,9}$/.test(bruto)) {
    return NextResponse.json(
      { erro: "Informe o número sorteado (só dígitos)." },
      { status: 400 }
    );
  }

  const numero = Number(bruto);
  /* Só o piso é validado. O teto NÃO é `RIFA.totalCotas`: o lote atual é isca
     de escassez e sobe quando a meta se aproxima, então um número acima do
     lote de hoje pode ser um número legítimo de amanhã. Quem decide se o
     número existe é o índice de pedidos — a resposta honesta para um número
     alto demais é "não foi vendido", não "essa rifa não vai até aí". */
  if (numero < 1) {
    return NextResponse.json(
      { erro: "O número sorteado começa em 1." },
      { status: 400 }
    );
  }

  return NextResponse.json(await buscarGanhador(numero), {
    headers: { "Cache-Control": "no-store" },
  });
}
